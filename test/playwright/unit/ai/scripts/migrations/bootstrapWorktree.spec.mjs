import {setup} from '../../../../setup.mjs';

const appName = 'BootstrapWorktreeTest';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect}  from '@playwright/test';
import Neo             from '../../../../../../src/Neo.mjs';
import * as core       from '../../../../../../src/core/_export.mjs';
import InstanceManager from '../../../../../../src/manager/Instance.mjs';
import fs              from 'fs-extra';
import path            from 'path';

/**
 * @summary Coverage for the worktree bootstrap script.
 *
 * Uses tmp dirs as fake main-checkout and fake worktree to exercise the copy logic
 * without touching the real repo state. The CLI-mode `execFile` resolution of
 * `git worktree list --porcelain` is not exercised here — that path is a thin wrapper
 * around the already-covered `bootstrapWorktree(...)` function.
 */
test.describe('ai/scripts/bootstrapWorktree', () => {
    let bootstrapWorktree;
    let hydrateCurrentWorktree;
    let symlinkDataDir;
    let symlinkCanonicalDataReadAliases;
    let symlinkGitignoredFiles;
    let installDependencies;
    let runBuildAll;
    let resolveMainCheckout;
    let resolveCliProjectRoot;
    let parseWorktreePorcelain;
    let pruneStaleWorktrees;
    let BOOTSTRAP_CONFIGS;
    let DATA_SUBDIRS_BLOCKLIST;
    let CANONICAL_DATA_READ_ALIASES;
    let GITIGNORED_FILES_TO_LINK;
    let fakeMainCheckout;
    let fakeWorktree;

    const fixtureConfigs = [
        'ai/config.mjs',
        'ai/mcp/server/github-workflow/config.mjs',
        'ai/mcp/server/knowledge-base/config.mjs',
        'ai/mcp/server/memory-core/config.mjs',
        'ai/mcp/server/neural-link/config.mjs'
    ];

    test.beforeAll(async () => {
        const mod = await import('../../../../../../ai/scripts/migrations/bootstrapWorktree.mjs');
        bootstrapWorktree                 = mod.bootstrapWorktree;
        hydrateCurrentWorktree            = mod.hydrateCurrentWorktree;
        symlinkDataDir                    = mod.symlinkDataDir;
        symlinkCanonicalDataReadAliases   = mod.symlinkCanonicalDataReadAliases;
        symlinkGitignoredFiles            = mod.symlinkGitignoredFiles;
        installDependencies               = mod.installDependencies;
        runBuildAll                       = mod.runBuildAll;
        resolveMainCheckout               = mod.resolveMainCheckout;
        resolveCliProjectRoot             = mod.resolveCliProjectRoot;
        parseWorktreePorcelain            = mod.parseWorktreePorcelain;
        pruneStaleWorktrees               = mod.pruneStaleWorktrees;
        BOOTSTRAP_CONFIGS                 = mod.BOOTSTRAP_CONFIGS;
        DATA_SUBDIRS_BLOCKLIST            = mod.DATA_SUBDIRS_BLOCKLIST;
        CANONICAL_DATA_READ_ALIASES       = mod.CANONICAL_DATA_READ_ALIASES;
        GITIGNORED_FILES_TO_LINK          = mod.GITIGNORED_FILES_TO_LINK;
    });

    test.beforeEach(async () => {
        const tmpBase    = path.resolve(process.cwd(), 'tmp', `bootstrap-worktree-test-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
        fakeMainCheckout = path.join(tmpBase, 'main-checkout');
        fakeWorktree     = path.join(tmpBase, 'worktree');

        for (const rel of fixtureConfigs) {
            const src = path.join(fakeMainCheckout, rel);
            await fs.ensureDir(path.dirname(src));
            await fs.writeFile(src, `// fixture content for ${rel}\n`, 'utf-8');
        }
        await fs.ensureDir(fakeWorktree);
    });

    test.afterEach(async () => {
        if (fakeMainCheckout) {
            await fs.remove(path.dirname(fakeMainCheckout)).catch(() => {});
        }
    });

    test('auto-derives BOOTSTRAP_CONFIGS from server dirs that ship a config.template.mjs', () => {
        // Tier-1 operator overlay is always first.
        expect(BOOTSTRAP_CONFIGS[0]).toBe('ai/config.mjs');

        // Every MCP server that ships a config.template.mjs is hydrated — including
        // gitlab-workflow, whose omission from the old hand-maintained list broke fresh
        // worktrees with ERR_MODULE_NOT_FOUND (the regression this guards against).
        for (const name of ['github-workflow', 'gitlab-workflow', 'knowledge-base', 'memory-core', 'neural-link']) {
            expect(BOOTSTRAP_CONFIGS).toContain(`ai/mcp/server/${name}/config.mjs`);
        }

        // Dirs without a config.template.mjs (file-system, shared) are excluded.
        expect(BOOTSTRAP_CONFIGS).not.toContain('ai/mcp/server/file-system/config.mjs');
        expect(BOOTSTRAP_CONFIGS).not.toContain('ai/mcp/server/shared/config.mjs');

        // Every entry is the Tier-1 overlay or a well-formed per-server overlay path.
        for (const rel of BOOTSTRAP_CONFIGS) {
            expect(rel === 'ai/config.mjs' || /^ai\/mcp\/server\/[^/]+\/config\.mjs$/.test(rel)).toBe(true);
        }
    });

    test('resolveCliProjectRoot climbs migrations/ → scripts/ → ai/ → root (#12147)', () => {
        // The script lives 3 levels deep at ai/scripts/migrations/; the repo root is 3 `..` up.
        expect(resolveCliProjectRoot('/repo/ai/scripts/migrations')).toBe('/repo');
        // Regression guard: the prior 2-level resolve mislanded at <root>/ai, so the CLI copied
        // BOOTSTRAP_CONFIGS into <root>/ai/ai/ instead of the repo root.
        expect(path.resolve('/repo/ai/scripts/migrations', '..', '..')).toBe('/repo/ai');
    });

    test('copies every missing config.mjs from main checkout into the worktree', async () => {
        const logs   = [];
        const result = await bootstrapWorktree({
            mainCheckout: fakeMainCheckout,
            projectRoot : fakeWorktree,
            configs     : fixtureConfigs,
            log         : (line) => logs.push(line)
        });

        expect(result.copied).toEqual(fixtureConfigs);
        expect(result.skipped).toHaveLength(0);
        expect(result.missing).toHaveLength(0);

        for (const rel of fixtureConfigs) {
            const dst     = path.join(fakeWorktree, rel);
            const content = await fs.readFile(dst, 'utf-8');
            expect(content).toContain(`fixture content for ${rel}`);
        }
    });

    test('is idempotent — re-running after partial seed leaves existing files untouched', async () => {
        // Pre-seed one config with distinct content; confirm it's preserved.
        const preseeded    = fixtureConfigs[0];
        const preseededDst = path.join(fakeWorktree, preseeded);
        await fs.ensureDir(path.dirname(preseededDst));
        await fs.writeFile(preseededDst, '// preserved local override\n', 'utf-8');

        const result = await bootstrapWorktree({
            mainCheckout: fakeMainCheckout,
            projectRoot : fakeWorktree,
            configs     : fixtureConfigs,
            log         : () => {}
        });

        expect(result.copied).toEqual(fixtureConfigs.slice(1));
        expect(result.skipped).toEqual([preseeded]);

        const preserved = await fs.readFile(preseededDst, 'utf-8');
        expect(preserved).toBe('// preserved local override\n');
    });

    test('refuses to copy when running inside the main checkout', async () => {
        const logs   = [];
        const result = await bootstrapWorktree({
            mainCheckout: fakeMainCheckout,
            projectRoot : fakeMainCheckout, // same path = main checkout mode
            configs     : fixtureConfigs,
            log         : (line) => logs.push(line)
        });

        expect(result.copied).toHaveLength(0);
        expect(result.skipped).toHaveLength(0);
        expect(result.missing).toHaveLength(0);
        expect(logs.join('\n')).toContain('main checkout');
    });

    test('reports configs missing in the main checkout without throwing', async () => {
        // Remove one fixture from the main checkout to simulate a partial release.
        const removed = fixtureConfigs[2];
        await fs.remove(path.join(fakeMainCheckout, removed));

        const result = await bootstrapWorktree({
            mainCheckout: fakeMainCheckout,
            projectRoot : fakeWorktree,
            configs     : fixtureConfigs,
            log         : () => {}
        });

        expect(result.missing).toEqual([removed]);
        expect(result.copied).toEqual(fixtureConfigs.filter(c => c !== removed));
    });

    test('copies Tier-1 config and materializes stale per-server AiConfig imports (#12051)', async () => {
        const tier1Rel     = 'ai/config.mjs';
        const serverRel    = 'ai/mcp/server/memory-core/config.mjs';
        const tier1Content = [
            `export default {`,
            `    tenantRepos: [{tenantId: 'acme', repoSlug: 'org/repo'}],`,
            `    customOperatorKey: 'preserved'`,
            `};`,
            ``
        ].join('\n');
        const serverContent = [
            `import AiConfig from '../../../config.template.mjs';`,
            `export const customKey = 'preserved-server-edit';`,
            `export default {`,
            `    tenantRepos: AiConfig.tenantRepos,`,
            `    customKey`,
            `};`,
            ``
        ].join('\n');

        await fs.writeFile(path.join(fakeMainCheckout, tier1Rel), tier1Content, 'utf-8');
        await fs.writeFile(path.join(fakeMainCheckout, serverRel), serverContent, 'utf-8');

        const result = await bootstrapWorktree({
            mainCheckout: fakeMainCheckout,
            projectRoot : fakeWorktree,
            configs     : [tier1Rel, serverRel],
            log         : () => {}
        });

        expect(result.copied).toEqual([tier1Rel, serverRel]);

        const copiedTier1  = await fs.readFile(path.join(fakeWorktree, tier1Rel), 'utf-8');
        const copiedServer = await fs.readFile(path.join(fakeWorktree, serverRel), 'utf-8');

        expect(copiedTier1).toBe(tier1Content);
        expect(copiedTier1).toContain(`tenantRepos`);
        expect(copiedTier1).toContain(`customOperatorKey: 'preserved'`);
        expect(copiedServer).toContain(`from '../../../config.mjs'`);
        expect(copiedServer).not.toContain(`../../../config.template.mjs`);
        expect(copiedServer).toContain(`customKey = 'preserved-server-edit'`);
    });

    test('preserves existing destination configs without materializing them (#12051)', async () => {
        const staleServerRel = 'ai/mcp/server/memory-core/config.mjs';
        const dst            = path.join(fakeWorktree, staleServerRel);
        const existing       = [
            `import AiConfig from '../../../config.template.mjs';`,
            `export default {tenantRepos: AiConfig.tenantRepos};`,
            ``
        ].join('\n');

        await fs.ensureDir(path.dirname(dst));
        await fs.writeFile(dst, existing, 'utf-8');

        const result = await bootstrapWorktree({
            mainCheckout: fakeMainCheckout,
            projectRoot : fakeWorktree,
            configs     : [staleServerRel],
            log         : () => {}
        });

        expect(result.copied).toHaveLength(0);
        expect(result.skipped).toEqual([staleServerRel]);

        const preserved = await fs.readFile(dst, 'utf-8');
        expect(preserved).toBe(existing);
    });

    // --------------------------------------------------------------------------------
    // resolveMainCheckout — explicit canonical-root override for independent
    // clone topologies (where `git worktree list` returns the clone itself rather than
    // the canonical sibling). The git-worktree-list fall-through path is intentionally
    // not exercised here (depends on a real git checkout); the explicit-root happy
    // paths are the new public contract that warrants permanent coverage.
    // --------------------------------------------------------------------------------
    test.describe('#10435 resolveMainCheckout (explicit canonical-root)', () => {
        test('returns explicitRoot verbatim when absolute', async () => {
            const explicitRoot = path.resolve(process.cwd(), 'tmp', 'fake-canonical-abs');
            const result       = await resolveMainCheckout(process.cwd(), {explicitRoot});
            expect(result).toBe(explicitRoot);
        });

        test('resolves a relative explicitRoot to absolute', async () => {
            // Pass a relative path; expect the result to be path.resolve()d to absolute.
            const relative = 'tmp/fake-canonical-rel';
            const result   = await resolveMainCheckout(process.cwd(), {explicitRoot: relative});
            expect(path.isAbsolute(result)).toBe(true);
            expect(result).toBe(path.resolve(relative));
        });

        test('falls through to git resolution when explicitRoot is undefined', async () => {
            // We're running inside the neomjs/neo repo, so the git path resolves to a
            // real working-tree root. Rather than asserting a specific path (which would
            // couple the test to a particular harness layout), we assert that the result
            // is a non-null absolute path — proving the fall-through path is wired.
            const result = await resolveMainCheckout(process.cwd());
            expect(typeof result).toBe('string');
            expect(path.isAbsolute(result)).toBe(true);
        });

        test('falls through to git resolution when explicitRoot is explicitly null/empty', async () => {
            // Boundary: passing falsy explicitRoot must still take the git path.
            const r1 = await resolveMainCheckout(process.cwd(), {explicitRoot: null});
            const r2 = await resolveMainCheckout(process.cwd(), {explicitRoot: ''});
            expect(r1).not.toBeNull();
            expect(r2).not.toBeNull();
            expect(r1).toBe(r2); // same fall-through path => same answer
        });
    });

    test.describe('#13960 symlinkCanonicalDataReadAliases (canonical state reads)', () => {
        const dataDir         = '.neo-ai-data';
        const sourceSubdir    = 'orchestrator-daemon';
        const aliasSubdir     = 'orchestrator-daemon-canonical';
        const localDaemonPath = () => path.join(fakeWorktree, dataDir, sourceSubdir);
        const aliasPath       = () => path.join(fakeWorktree, dataDir, aliasSubdir);

        async function seedCanonicalOrchestratorState() {
            const src = path.join(fakeMainCheckout, dataDir, sourceSubdir);
            await fs.ensureDir(src);
            await fs.writeJson(path.join(src, 'orchestrator-state.json'), {
                'golden-path': {
                    lastSuccessAt: '2026-06-24T17:00:25.923Z'
                }
            });
        }

        test('exports a canonical read alias without removing the daemon-pid blocklist', () => {
            expect(CANONICAL_DATA_READ_ALIASES).toContainEqual({
                source: sourceSubdir,
                alias : aliasSubdir
            });
            expect(DATA_SUBDIRS_BLOCKLIST).toContain(sourceSubdir);
        });

        test('links a separate canonical alias while preserving the clone-local daemon dir', async () => {
            await seedCanonicalOrchestratorState();
            await fs.ensureDir(localDaemonPath());
            await fs.writeFile(path.join(localDaemonPath(), 'orchestrator-daemon.pid'), '99999\n', 'utf-8');

            const result = await symlinkCanonicalDataReadAliases({
                mainCheckout: fakeMainCheckout,
                projectRoot : fakeWorktree,
                log         : () => {}
            });

            expect(result.linked).toEqual([aliasSubdir]);
            expect(result.alreadyLinked).toHaveLength(0);
            expect(result.skippedNoSource).toHaveLength(0);
            expect(result.skippedRealPath).toHaveLength(0);
            expect(result.mainCheckout).toBe(false);

            const liveLstat  = await fs.lstat(localDaemonPath());
            const aliasLstat = await fs.lstat(aliasPath());

            expect(liveLstat.isDirectory()).toBe(true);
            expect(liveLstat.isSymbolicLink()).toBe(false);
            expect(aliasLstat.isSymbolicLink()).toBe(true);

            const livePid = await fs.readFile(path.join(localDaemonPath(), 'orchestrator-daemon.pid'), 'utf-8');
            expect(livePid).toBe('99999\n');

            const canonicalState = await fs.readJson(path.join(aliasPath(), 'orchestrator-state.json'));
            expect(canonicalState['golden-path'].lastSuccessAt).toBe('2026-06-24T17:00:25.923Z');
        });

        test('is idempotent and reports alreadyLinked on the second pass', async () => {
            await seedCanonicalOrchestratorState();

            await symlinkCanonicalDataReadAliases({
                mainCheckout: fakeMainCheckout,
                projectRoot : fakeWorktree,
                log         : () => {}
            });

            const result = await symlinkCanonicalDataReadAliases({
                mainCheckout: fakeMainCheckout,
                projectRoot : fakeWorktree,
                log         : () => {}
            });

            expect(result.linked).toHaveLength(0);
            expect(result.alreadyLinked).toEqual([aliasSubdir]);
        });

        test('relinks stale alias symlinks to the current canonical checkout', async () => {
            const oldCanonical = path.join(path.dirname(fakeMainCheckout), 'old-main-checkout', dataDir, sourceSubdir);
            await fs.ensureDir(oldCanonical);
            await fs.ensureDir(path.dirname(aliasPath()));
            await fs.symlink(oldCanonical, aliasPath(), 'dir');
            await seedCanonicalOrchestratorState();

            const result = await symlinkCanonicalDataReadAliases({
                mainCheckout: fakeMainCheckout,
                projectRoot : fakeWorktree,
                log         : () => {}
            });

            expect(result.relinked).toEqual([aliasSubdir]);
            expect(await fs.realpath(aliasPath())).toBe(await fs.realpath(path.join(fakeMainCheckout, dataDir, sourceSubdir)));
        });

        test('skips when canonical source is absent or when running in main checkout', async () => {
            const missing = await symlinkCanonicalDataReadAliases({
                mainCheckout: fakeMainCheckout,
                projectRoot : fakeWorktree,
                log         : () => {}
            });

            expect(missing.skippedNoSource).toEqual([aliasSubdir]);
            expect(await fs.pathExists(aliasPath())).toBe(false);

            await seedCanonicalOrchestratorState();

            const mainCheckout = await symlinkCanonicalDataReadAliases({
                mainCheckout: fakeMainCheckout,
                projectRoot : fakeMainCheckout,
                log         : () => {}
            });

            expect(mainCheckout.mainCheckout).toBe(true);
            expect(mainCheckout.linked).toHaveLength(0);
        });

        test('preserves a real alias path instead of clobbering it', async () => {
            await seedCanonicalOrchestratorState();
            await fs.ensureDir(aliasPath());
            await fs.writeFile(path.join(aliasPath(), 'local-note.txt'), 'preserve\n', 'utf-8');

            const result = await symlinkCanonicalDataReadAliases({
                mainCheckout: fakeMainCheckout,
                projectRoot : fakeWorktree,
                log         : () => {}
            });

            expect(result.skippedRealPath).toEqual([aliasSubdir]);
            const lstat = await fs.lstat(aliasPath());
            expect(lstat.isDirectory()).toBe(true);
            expect(lstat.isSymbolicLink()).toBe(false);
            expect(await fs.readFile(path.join(aliasPath(), 'local-note.txt'), 'utf-8')).toBe('preserve\n');
        });
    });

    // --------------------------------------------------------------------------------
    // symlinkDataDir — granular per-subdir symlinking of gitignored substrate-data
    // subdirs of `.neo-ai-data/`, while leaving the git-tracked `concepts/` subdir
    // untouched. Refines the closed coarse-grained parent-level symlink predecessor and
    // unblocks the cross-process coherence gap.
    //
    // These tests use canary files PER SUBDIR in the main-checkout data dir to prove that
    // each symlinked worktree subdir sees its corresponding main-checkout subdir's data.
    // The concepts/-untouched test is the load-bearing safety check — the bug class this
    // refactor exists to prevent.
    // --------------------------------------------------------------------------------
    test.describe('#10432 symlinkDataDir (granular per-subdir)', () => {
        const dataDir        = '.neo-ai-data';
        const fixtureSubdirs = ['sqlite', 'chroma', 'wake-daemon'];

        async function seedMainSubdirs(subdirs = fixtureSubdirs) {
            for (const subdir of subdirs) {
                const dir = path.join(fakeMainCheckout, dataDir, subdir);
                await fs.ensureDir(dir);
                await fs.writeFile(path.join(dir, 'canary.txt'), `main-${subdir}-canary\n`, 'utf-8');
            }
        }

        test('exports the canonical DATA_SUBDIRS_BLOCKLIST', () => {
            expect(Array.isArray(DATA_SUBDIRS_BLOCKLIST)).toBe(true);

            // CRITICAL invariant: concepts/ is git-tracked and MUST be blocklisted so it is
            // NEVER symlinked — the load-bearing safety check that prevents the parent-level
            // symlink clobber bug from regressing.
            expect(DATA_SUBDIRS_BLOCKLIST).toContain('concepts');

            // Per-process daemon-pid dirs MUST be blocklisted — sharing the orchestrator
            // parent-pid (the SIGTERM-singleton) across clones would race / cross-signal.
            expect(DATA_SUBDIRS_BLOCKLIST).toContain('orchestrator-daemon');
            expect(DATA_SUBDIRS_BLOCKLIST).toContain('embed-daemon');

            // Shared substrate children must NOT be blocklisted — they link by enumeration
            // (memory-wal carries records + markers + .drain-lock; wake-daemon is a designed singleton).
            expect(DATA_SUBDIRS_BLOCKLIST).not.toContain('sqlite');
            expect(DATA_SUBDIRS_BLOCKLIST).not.toContain('memory-wal');
            expect(DATA_SUBDIRS_BLOCKLIST).not.toContain('wake-daemon');
        });

        test('blocklists the per-process daemon-pid dirs (SIGTERM-singleton stays per-clone)', async () => {
            // orchestrator-daemon/ + embed-daemon/ hold the orchestrator parent-pid + embed pid;
            // sharing them across clones would race the singleton, so they must NOT be symlinked.
            for (const d of ['orchestrator-daemon', 'embed-daemon']) {
                await fs.ensureDir(path.join(fakeMainCheckout, dataDir, d));
                await fs.writeFile(path.join(fakeMainCheckout, dataDir, d, 'pid'), '12345\n', 'utf-8');
            }
            await seedMainSubdirs(['memory-wal']); // a shared child alongside the daemon dirs

            const result = await symlinkDataDir({
                mainCheckout: fakeMainCheckout,
                projectRoot : fakeWorktree,
                log         : () => {}
            });

            // memory-wal links; the daemon-pid dirs do not.
            expect(result.linked).toContain('memory-wal');
            expect(result.linked).not.toContain('orchestrator-daemon');
            expect(result.linked).not.toContain('embed-daemon');
            expect(await fs.pathExists(path.join(fakeWorktree, dataDir, 'orchestrator-daemon'))).toBe(false);
            expect(await fs.pathExists(path.join(fakeWorktree, dataDir, 'embed-daemon'))).toBe(false);
        });

        test('symlinks every canonical child except the blocklist when none exist in worktree', async () => {
            await seedMainSubdirs();

            const result = await symlinkDataDir({
                mainCheckout: fakeMainCheckout,
                projectRoot : fakeWorktree,
                log         : () => {}
            });

            expect(result.linked.sort()).toEqual([...fixtureSubdirs].sort());
            expect(result.alreadyLinked).toHaveLength(0);
            expect(result.clobbered).toHaveLength(0);
            expect(result.skippedNoSource).toHaveLength(0);
            expect(result.mainCheckout).toBe(false);

            // Each subdir is now a symlink, and each canary is reachable via the link.
            for (const subdir of fixtureSubdirs) {
                const dst   = path.join(fakeWorktree, dataDir, subdir);
                const lstat = await fs.lstat(dst);
                expect(lstat.isSymbolicLink()).toBe(true);

                const canary = await fs.readFile(path.join(dst, 'canary.txt'), 'utf-8');
                expect(canary).toBe(`main-${subdir}-canary\n`);
            }

            // Parent .neo-ai-data/ is a regular directory (not a symlink) — preserves
            // the worktree's tracked concepts/ subdir if present.
            const parentLstat = await fs.lstat(path.join(fakeWorktree, dataDir));
            expect(parentLstat.isDirectory()).toBe(true);
            expect(parentLstat.isSymbolicLink()).toBe(false);
        });

        test('links a previously-non-allowlisted child like memory-wal (regression guard)', async () => {
            // The exact bug: memory-wal was never in the retired DATA_SUBDIRS_TO_LINK allowlist,
            // so it was never symlinked → per-clone orphaned WALs. Enumeration must link it now.
            await seedMainSubdirs(['memory-wal']);

            const result = await symlinkDataDir({
                mainCheckout: fakeMainCheckout,
                projectRoot : fakeWorktree,
                log         : () => {}
            });

            expect(result.linked).toContain('memory-wal');

            const dst   = path.join(fakeWorktree, dataDir, 'memory-wal');
            const lstat = await fs.lstat(dst);
            expect(lstat.isSymbolicLink()).toBe(true);
            expect(await fs.readFile(path.join(dst, 'canary.txt'), 'utf-8')).toBe('main-memory-wal-canary\n');
        });

        test('symlinks a top-level FILE child, not just directories', async () => {
            // .neo-ai-data can hold file children (e.g. memory-core.sqlite); they must link too.
            await fs.ensureDir(path.join(fakeMainCheckout, dataDir));
            await fs.writeFile(path.join(fakeMainCheckout, dataDir, 'memory-core.sqlite'), 'db-bytes\n', 'utf-8');

            const result = await symlinkDataDir({
                mainCheckout: fakeMainCheckout,
                projectRoot : fakeWorktree,
                log         : () => {}
            });

            expect(result.linked).toContain('memory-core.sqlite');

            const dst   = path.join(fakeWorktree, dataDir, 'memory-core.sqlite');
            const lstat = await fs.lstat(dst);
            expect(lstat.isSymbolicLink()).toBe(true);
            expect(await fs.readFile(dst, 'utf-8')).toBe('db-bytes\n');
        });

        test('is idempotent per-child — re-running over partial state surfaces alreadyLinked + linked', async () => {
            await seedMainSubdirs();

            // First call links all three subdirs.
            await symlinkDataDir({
                mainCheckout: fakeMainCheckout,
                projectRoot : fakeWorktree,
                log         : () => {}
            });

            // Manually unlink one to simulate a partial state.
            await fs.unlink(path.join(fakeWorktree, dataDir, 'chroma'));

            // Second call: two are alreadyLinked, the unlinked one gets re-linked.
            const result = await symlinkDataDir({
                mainCheckout: fakeMainCheckout,
                projectRoot : fakeWorktree,
                log         : () => {}
            });

            expect(result.alreadyLinked.sort()).toEqual(['sqlite', 'wake-daemon'].sort());
            expect(result.linked).toEqual(['chroma']);
            expect(result.clobbered).toHaveLength(0);
            expect(result.skippedNoSource).toHaveLength(0);
        });

        test('refuses to clobber a non-symlink subdir without force', async () => {
            await seedMainSubdirs();

            // Pre-create one subdir as a regular dir with unique content — simulates a
            // worktree that has accumulated data before symlink unification was opted-in.
            const worktreeSubdir = path.join(fakeWorktree, dataDir, 'sqlite');
            await fs.ensureDir(worktreeSubdir);
            await fs.writeFile(path.join(worktreeSubdir, 'local-only.txt'), 'worktree-specific\n', 'utf-8');

            await expect(
                symlinkDataDir({
                    mainCheckout: fakeMainCheckout,
                    projectRoot : fakeWorktree,
                    log         : () => {}
                })
            ).rejects.toThrow(/Refusing to replace non-symlink/);

            // Local data preserved — guard did its job.
            const preserved = await fs.readFile(path.join(worktreeSubdir, 'local-only.txt'), 'utf-8');
            expect(preserved).toBe('worktree-specific\n');
        });

        test('clobbers per-child with force=true and creates the link', async () => {
            await seedMainSubdirs();

            const worktreeSubdir = path.join(fakeWorktree, dataDir, 'sqlite');
            await fs.ensureDir(worktreeSubdir);
            await fs.writeFile(path.join(worktreeSubdir, 'local-only.txt'), 'worktree-specific\n', 'utf-8');

            const result = await symlinkDataDir({
                mainCheckout: fakeMainCheckout,
                projectRoot : fakeWorktree,
                force       : true,
                log         : () => {}
            });

            expect(result.linked.sort()).toEqual([...fixtureSubdirs].sort());
            expect(result.clobbered).toEqual(['sqlite']);

            // Clobbered subdir is now a symlink + canary reachable.
            const lstat = await fs.lstat(worktreeSubdir);
            expect(lstat.isSymbolicLink()).toBe(true);

            const canary = await fs.readFile(path.join(worktreeSubdir, 'canary.txt'), 'utf-8');
            expect(canary).toBe('main-sqlite-canary\n');
        });

        test('children absent in the canonical checkout are simply not linked', async () => {
            // Seed only two of three; the third (chroma) is absent in canonical → never
            // enumerated, so it is neither linked nor reported (graceful by construction).
            await seedMainSubdirs(['sqlite', 'wake-daemon']);

            const result = await symlinkDataDir({
                mainCheckout: fakeMainCheckout,
                projectRoot : fakeWorktree,
                log         : () => {}
            });

            expect(result.linked.sort()).toEqual(['sqlite', 'wake-daemon'].sort());
            expect(result.linked).not.toContain('chroma');
            expect(await fs.pathExists(path.join(fakeWorktree, dataDir, 'chroma'))).toBe(false);
        });

        test('returns empty + does not throw when canonical .neo-ai-data is absent', async () => {
            // Fresh canonical that has never created .neo-ai-data — must be a graceful no-op.
            const result = await symlinkDataDir({
                mainCheckout: fakeMainCheckout, // no .neo-ai-data seeded
                projectRoot : fakeWorktree,
                log         : () => {}
            });

            expect(result.linked).toHaveLength(0);
            expect(result.alreadyLinked).toHaveLength(0);
            expect(result.clobbered).toHaveLength(0);
            expect(result.skippedNoSource).toHaveLength(0);
            expect(result.mainCheckout).toBe(false);
        });

        test('NEVER touches concepts/ even when present in main checkout and force=true', async () => {
            // Seed both the allowlisted subdirs AND a concepts/ in main and a regular
            // (tracked-style) concepts/ in the worktree with unique content.
            await seedMainSubdirs();
            await fs.ensureDir(path.join(fakeMainCheckout, dataDir, 'concepts'));
            await fs.writeFile(
                path.join(fakeMainCheckout, dataDir, 'concepts', 'main-concept.txt'),
                'main-concept\n', 'utf-8'
            );

            const worktreeConceptsDir = path.join(fakeWorktree, dataDir, 'concepts');
            await fs.ensureDir(worktreeConceptsDir);
            await fs.writeFile(
                path.join(worktreeConceptsDir, 'tracked-concept.txt'),
                'worktree-tracked-concept\n', 'utf-8'
            );

            // Use the DEFAULT blocklist (which contains concepts/), and force=true.
            const result = await symlinkDataDir({
                mainCheckout: fakeMainCheckout,
                projectRoot : fakeWorktree,
                force       : true,
                log         : () => {}
            });

            // concepts/ is NOT in the default allowlist → not in any result bucket.
            expect(result.linked).not.toContain('concepts');
            expect(result.alreadyLinked).not.toContain('concepts');
            expect(result.clobbered).not.toContain('concepts');

            // The worktree's concepts/ is still a regular dir, with its tracked file intact.
            const lstat = await fs.lstat(worktreeConceptsDir);
            expect(lstat.isDirectory()).toBe(true);
            expect(lstat.isSymbolicLink()).toBe(false);

            const tracked = await fs.readFile(path.join(worktreeConceptsDir, 'tracked-concept.txt'), 'utf-8');
            expect(tracked).toBe('worktree-tracked-concept\n');

            // The main-checkout's concept file is NOT visible in the worktree's
            // concepts/ — it remains a regular dir, isolated by design.
            const mainOnlyExists = await fs.pathExists(path.join(worktreeConceptsDir, 'main-concept.txt'));
            expect(mainOnlyExists).toBe(false);
        });

        test('returns mainCheckout: true when run from the primary working tree', async () => {
            await seedMainSubdirs();

            const result = await symlinkDataDir({
                mainCheckout: fakeMainCheckout,
                projectRoot : fakeMainCheckout, // same path = primary working tree
                log         : () => {}
            });

            expect(result.mainCheckout).toBe(true);
            expect(result.linked).toHaveLength(0);
            expect(result.alreadyLinked).toHaveLength(0);
            expect(result.clobbered).toHaveLength(0);
            expect(result.skippedNoSource).toHaveLength(0);

            // No links were created in the main checkout's own data subdirs.
            for (const subdir of fixtureSubdirs) {
                const lstat = await fs.lstat(path.join(fakeMainCheckout, dataDir, subdir));
                expect(lstat.isDirectory()).toBe(true);
                expect(lstat.isSymbolicLink()).toBe(false);
            }
        });
    });

    // --------------------------------------------------------------------------------
    // symlinkGitignoredFiles — granular per-file symlinking of gitignored single
    // files (initially: resources/content/sandman_handoff.md) outside .neo-ai-data/.
    //
    // Distinct from symlinkDataDir's directory-shaped substrate: each entry is a single
    // artifact, parent dir is heavily git-tracked (e.g. resources/content/), no `--force`
    // semantic for files (skip-with-warning if a real file is present preserves potentially
    // intentional local state).
    //
    // These tests use a fixture file PER ENTRY in the main-checkout to prove the per-file
    // states: linked / already-linked / skipped-no-source / skipped-real-file. The
    // mainCheckout no-op closes the safety check that primary-working-tree invocations
    // are inert.
    // --------------------------------------------------------------------------------
    test.describe('#10591 symlinkGitignoredFiles (granular per-file)', () => {
        const fixtureFile  = 'resources/content/sandman_handoff.md';
        const fixtureFiles = [fixtureFile];

        async function seedMainHandoff(content = '# fixture handoff\n') {
            const src = path.join(fakeMainCheckout, fixtureFile);
            await fs.ensureDir(path.dirname(src));
            await fs.writeFile(src, content, 'utf-8');
        }

        test('exports the canonical GITIGNORED_FILES_TO_LINK list', () => {
            // Load-bearing invariants rather than precise sequence (which may evolve).
            expect(Array.isArray(GITIGNORED_FILES_TO_LINK)).toBe(true);
            expect(GITIGNORED_FILES_TO_LINK).toContain('resources/content/sandman_handoff.md');

            // Sanity: every entry MUST be a relative path (canonical-only-write semantic
            // would break with absolute paths).
            for (const rel of GITIGNORED_FILES_TO_LINK) {
                expect(path.isAbsolute(rel)).toBe(false);
            }
        });

        test('symlinks every allowlisted file from canonical when none exist in worktree', async () => {
            await seedMainHandoff('main-handoff-canary\n');

            const result = await symlinkGitignoredFiles({
                mainCheckout: fakeMainCheckout,
                projectRoot : fakeWorktree,
                files       : fixtureFiles,
                log         : () => {}
            });

            expect(result.linked).toEqual(fixtureFiles);
            expect(result.alreadyLinked).toHaveLength(0);
            expect(result.skippedNoSource).toHaveLength(0);
            expect(result.skippedRealFile).toHaveLength(0);
            expect(result.mainCheckout).toBe(false);

            // Symlink lands at the worktree path; canary content reachable via the link.
            const dst   = path.join(fakeWorktree, fixtureFile);
            const lstat = await fs.lstat(dst);
            expect(lstat.isSymbolicLink()).toBe(true);

            const canary = await fs.readFile(dst, 'utf-8');
            expect(canary).toBe('main-handoff-canary\n');
        });

        test('is idempotent per-file — re-running surfaces alreadyLinked on second pass', async () => {
            await seedMainHandoff();

            // First call: link.
            await symlinkGitignoredFiles({
                mainCheckout: fakeMainCheckout,
                projectRoot : fakeWorktree,
                files       : fixtureFiles,
                log         : () => {}
            });

            // Second call: alreadyLinked.
            const result = await symlinkGitignoredFiles({
                mainCheckout: fakeMainCheckout,
                projectRoot : fakeWorktree,
                files       : fixtureFiles,
                log         : () => {}
            });

            expect(result.linked).toHaveLength(0);
            expect(result.alreadyLinked).toEqual(fixtureFiles);
            expect(result.skippedNoSource).toHaveLength(0);
            expect(result.skippedRealFile).toHaveLength(0);
        });

        test('gracefully skips files missing in the main checkout (pre-Sandman state)', async () => {
            // Do NOT seed the handoff in main — simulates fresh repo where Sandman
            // hasn't run yet. The script must not error in this state.
            const result = await symlinkGitignoredFiles({
                mainCheckout: fakeMainCheckout,
                projectRoot : fakeWorktree,
                files       : fixtureFiles,
                log         : () => {}
            });

            expect(result.linked).toHaveLength(0);
            expect(result.skippedNoSource).toEqual(fixtureFiles);
            expect(result.alreadyLinked).toHaveLength(0);
            expect(result.skippedRealFile).toHaveLength(0);

            // No symlink was created.
            const dst    = path.join(fakeWorktree, fixtureFile);
            const exists = await fs.pathExists(dst);
            expect(exists).toBe(false);
        });

        test('skips real files in the worktree without clobbering (preserve-local-state)', async () => {
            await seedMainHandoff('canonical-content\n');

            // Pre-create a real file in the worktree at the target path with unique
            // content — simulates an operator-saved prior handoff worth preserving.
            const dst = path.join(fakeWorktree, fixtureFile);
            await fs.ensureDir(path.dirname(dst));
            await fs.writeFile(dst, 'worktree-local-handoff\n', 'utf-8');

            const result = await symlinkGitignoredFiles({
                mainCheckout: fakeMainCheckout,
                projectRoot : fakeWorktree,
                files       : fixtureFiles,
                log         : () => {}
            });

            expect(result.linked).toHaveLength(0);
            expect(result.skippedRealFile).toEqual(fixtureFiles);
            expect(result.alreadyLinked).toHaveLength(0);
            expect(result.skippedNoSource).toHaveLength(0);

            // Local file preserved — guard did its job.
            const lstat = await fs.lstat(dst);
            expect(lstat.isSymbolicLink()).toBe(false);
            expect(lstat.isFile()).toBe(true);

            const preserved = await fs.readFile(dst, 'utf-8');
            expect(preserved).toBe('worktree-local-handoff\n');
        });

        test('returns mainCheckout: true when run from the primary working tree', async () => {
            await seedMainHandoff();

            const result = await symlinkGitignoredFiles({
                mainCheckout: fakeMainCheckout,
                projectRoot : fakeMainCheckout, // same path = primary working tree
                files       : fixtureFiles,
                log         : () => {}
            });

            expect(result.mainCheckout).toBe(true);
            expect(result.linked).toHaveLength(0);
            expect(result.alreadyLinked).toHaveLength(0);
            expect(result.skippedNoSource).toHaveLength(0);
            expect(result.skippedRealFile).toHaveLength(0);
        });
    });

    // --------------------------------------------------------------------------------
    // installDependencies + runBuildAll — opt-in flags that close the
    // multi-step manual bootstrap gap (npm install + bundle-parse5 + optional build-all).
    //
    // These tests inject a mock `exec` to capture invoked commands without spawning real
    // npm child processes. The pure-function form (with explicit dependency injection)
    // mirrors the existing `bootstrapWorktree`/`symlinkDataDir` testability pattern.
    // --------------------------------------------------------------------------------
    test.describe('#10351 installDependencies', () => {
        function makeMockExec() {
            const calls = [];
            const exec  = async (cmd, args, opts) => {
                calls.push({cmd, args, opts});
                // Simulate npm install creating node_modules — flips the existence guard
                // for downstream calls that re-check.
                if (cmd === 'npm' && args[0] === 'install') {
                    await fs.ensureDir(path.join(opts.cwd, 'node_modules'));
                }
                return {stdout: '', stderr: ''};
            };
            return {exec, calls};
        }

        test('runs `npm install` then `bundle-parse5` when node_modules is absent', async () => {
            const {exec, calls} = makeMockExec();
            const result        = await installDependencies({
                projectRoot: fakeWorktree,
                exec,
                log        : () => {}
            });

            expect(result).toBe('installed');
            expect(calls).toHaveLength(2);
            expect(calls[0].cmd).toBe('npm');
            expect(calls[0].args).toEqual(['install']);
            expect(calls[1].cmd).toBe('npm');
            expect(calls[1].args).toEqual(['run', 'bundle-parse5']);

            // Both invocations targeted the worktree (not main checkout).
            for (const call of calls) {
                expect(call.opts.cwd).toBe(fakeWorktree);
            }
        });

        test('skips `npm install` when node_modules already exists, but always runs bundle-parse5', async () => {
            // Pre-seed node_modules to simulate prior install / symlink.
            await fs.ensureDir(path.join(fakeWorktree, 'node_modules'));

            const {exec, calls} = makeMockExec();
            const result        = await installDependencies({
                projectRoot: fakeWorktree,
                exec,
                log        : () => {}
            });

            // Return value MUST reflect the action actually taken (skip), not just the
            // post-condition that node_modules exists. Prior review feedback caught the
            // semantic break where the contract always reported `'installed'` because
            // node_modules ends up present either way.
            expect(result).toBe('already-installed');
            expect(calls).toHaveLength(1);
            expect(calls[0].args).toEqual(['run', 'bundle-parse5']);
        });

        test('emits log lines for skip / install / bundle paths', async () => {
            const logs   = [];
            const {exec} = makeMockExec();

            // First run — install branch
            await installDependencies({projectRoot: fakeWorktree, exec, log: line => logs.push(line)});
            expect(logs.join('\n')).toContain('installing dependencies');
            expect(logs.join('\n')).toContain('bundling parse5');

            // Second run — skip branch
            const logs2 = [];
            await installDependencies({projectRoot: fakeWorktree, exec, log: line => logs2.push(line)});
            expect(logs2.join('\n')).toContain('install skip (exists)');
            expect(logs2.join('\n')).toContain('bundling parse5');
        });
    });

    test.describe('#10351 runBuildAll', () => {
        function makeMockExec() {
            const calls = [];
            const exec  = async (cmd, args, opts) => {
                calls.push({cmd, args, opts});
                if (cmd === 'npm' && args[0] === 'install') {
                    await fs.ensureDir(path.join(opts.cwd, 'node_modules'));
                }
                return {stdout: '', stderr: ''};
            };
            return {exec, calls};
        }

        test('composes installDependencies then runs `npm run build-all`', async () => {
            const {exec, calls} = makeMockExec();
            const result        = await runBuildAll({
                projectRoot: fakeWorktree,
                exec,
                log        : () => {}
            });

            expect(result).toBe('built');
            // Expected sequence: npm install, npm run bundle-parse5, npm run build-all
            expect(calls).toHaveLength(3);
            expect(calls[0].args).toEqual(['install']);
            expect(calls[1].args).toEqual(['run', 'bundle-parse5']);
            expect(calls[2].args).toEqual(['run', 'build-all']);
        });

        test('skips install when node_modules exists but still runs bundle-parse5 + build-all', async () => {
            await fs.ensureDir(path.join(fakeWorktree, 'node_modules'));

            const {exec, calls} = makeMockExec();
            await runBuildAll({projectRoot: fakeWorktree, exec, log: () => {}});

            expect(calls).toHaveLength(2);
            expect(calls[0].args).toEqual(['run', 'bundle-parse5']);
            expect(calls[1].args).toEqual(['run', 'build-all']);
        });
    });

    test.describe('#12677 pruneStaleWorktrees', () => {
        function makePruneExec({removed, dirtyStatus = ' M ai/config.mjs\n', statusByPath} = {}) {
            const worktreesRoot = path.join(fakeMainCheckout, '.claude', 'worktrees');
            const paths         = {
                current : path.join(worktreesRoot, 'current'),
                stale   : path.join(worktreesRoot, 'stale'),
                unmerged: path.join(worktreesRoot, 'unmerged'),
                dirty   : path.join(worktreesRoot, 'dirty')
            };
            const statuses = {
                [paths.dirty]: dirtyStatus,
                ...statusByPath
            };

            const porcelain = [
                `worktree ${fakeMainCheckout}`,
                'HEAD main-head',
                'branch refs/heads/dev',
                '',
                `worktree ${paths.current}`,
                'HEAD current-head',
                'branch refs/heads/agent/current',
                '',
                `worktree ${paths.stale}`,
                'HEAD stale-head',
                'branch refs/heads/agent/stale',
                '',
                `worktree ${paths.unmerged}`,
                'HEAD unmerged-head',
                'branch refs/heads/agent/unmerged',
                '',
                `worktree ${paths.dirty}`,
                'HEAD dirty-head',
                'branch refs/heads/agent/dirty',
                ''
            ].join('\n');

            const exec = async (cmd, args, opts = {}) => {
                if (cmd === 'git' && args.join(' ') === 'worktree list --porcelain') {
                    return {stdout: porcelain, stderr: ''};
                }

                if (cmd === 'git' && args[0] === 'worktree' && args[1] === 'remove') {
                    removed.push(args);
                    return {stdout: '', stderr: ''};
                }

                if (cmd === 'git' && args[0] === '-C' && args[2] === 'status' && args[3] === '--porcelain') {
                    const status = statuses[args[1]] || '';

                    if (status instanceof Error) {
                        throw status;
                    }

                    return {stdout: status, stderr: ''};
                }

                throw new Error(`Unexpected command: ${cmd} ${args.join(' ')}`);
            };

            return {exec, paths};
        }

        test('parses git worktree porcelain output', () => {
            const parsed = parseWorktreePorcelain([
                'worktree /repo',
                'HEAD abc123',
                'branch refs/heads/dev',
                '',
                'worktree /repo/.claude/worktrees/detached',
                'HEAD def456',
                'detached',
                ''
            ].join('\n'));

            expect(parsed).toEqual([
                {
                    path     : '/repo',
                    head     : 'abc123',
                    branchRef: 'refs/heads/dev',
                    branch   : 'dev',
                    detached : false
                },
                {
                    path     : '/repo/.claude/worktrees/detached',
                    head     : 'def456',
                    branchRef: null,
                    branch   : null,
                    detached : true
                }
            ]);
        });

        test('dry-runs the keep-current/delete-clean-rest plan only when requested', async () => {
            const removed       = [];
            const {exec, paths} = makePruneExec({removed});

            const result = await pruneStaleWorktrees({
                projectRoot: fakeMainCheckout,
                currentPath: paths.current,
                dryRun     : true,
                exec,
                getSize    : async p => ({
                    [paths.current] : 1024,
                    [paths.stale]   : 2048,
                    [paths.unmerged]: 3072,
                    [paths.dirty]   : 4096
                })[p] || 0,
                log: () => {}
            });

            const byPath = Object.fromEntries(result.worktrees.map(item => [item.path, item]));

            expect(byPath[paths.current].status).toBe('current');
            expect(byPath[paths.current].remove).toBe(false);
            expect(byPath[paths.stale].status).toBe('remove');
            expect(byPath[paths.stale].remove).toBe(true);
            expect(byPath[paths.unmerged].remove).toBe(true);
            expect(byPath[paths.dirty].status).toBe('skipped-dirty');
            expect(byPath[paths.dirty].remove).toBe(false);

            expect(result.reclaimableBytes).toBe(5120);
            expect(result.reclaimedBytes).toBe(0);
            expect(result.hydrated).toBe(null);
            expect(removed).toHaveLength(0);
        });

        test('deletes clean non-current worktrees by default and hydrates the current checkout', async () => {
            const removed       = [];
            const hydrated      = [];
            const {exec, paths} = makePruneExec({removed});

            const result = await pruneStaleWorktrees({
                projectRoot: fakeMainCheckout,
                currentPath: paths.current,
                exec,
                getSize    : async p => ({
                    [paths.current] : 1024,
                    [paths.stale]   : 2048,
                    [paths.unmerged]: 3072,
                    [paths.dirty]   : 4096
                })[p] || 0,
                hydrate: async args => {
                    hydrated.push(args);
                    return {ok: true};
                },
                log: () => {}
            });

            const byPath = Object.fromEntries(result.worktrees.map(item => [item.path, item]));

            expect(byPath[paths.current].remove).toBe(false);
            expect(byPath[paths.dirty].status).toBe('skipped-dirty');
            expect(result.skipped.map(item => item.path)).toEqual([paths.current, paths.dirty]);
            expect(removed).toEqual([
                ['worktree', 'remove', '--force', paths.stale],
                ['worktree', 'remove', '--force', paths.unmerged]
            ]);
            expect(result.removed.map(item => item.path)).toEqual([paths.stale, paths.unmerged]);
            expect(result.reclaimedBytes).toBe(5120);
            expect(result.hydrated).toEqual({ok: true});
            expect(hydrated).toHaveLength(1);
            expect(hydrated[0].mainCheckout).toBe(fakeMainCheckout);
            expect(hydrated[0].projectRoot).toBe(paths.current);
        });

        test('includeDirty removes dirty non-current worktrees explicitly', async () => {
            const removed       = [];
            const hydrated      = [];
            const {exec, paths} = makePruneExec({removed});

            const result = await pruneStaleWorktrees({
                projectRoot : fakeMainCheckout,
                currentPath : paths.current,
                includeDirty: true,
                exec,
                getSize     : async p => ({
                    [paths.current] : 1024,
                    [paths.stale]   : 2048,
                    [paths.unmerged]: 3072,
                    [paths.dirty]   : 4096
                })[p] || 0,
                hydrate: async args => {
                    hydrated.push(args);
                    return {ok: true};
                },
                log: () => {}
            });

            expect(removed).toEqual([
                ['worktree', 'remove', '--force', paths.stale],
                ['worktree', 'remove', '--force', paths.unmerged],
                ['worktree', 'remove', '--force', paths.dirty]
            ]);
            expect(result.removed.map(item => item.path)).toEqual([paths.stale, paths.unmerged, paths.dirty]);
            expect(result.skipped.map(item => item.path)).toEqual([paths.current]);
            expect(result.reclaimedBytes).toBe(9216);
            expect(hydrated[0].projectRoot).toBe(paths.current);
        });

        test('skips non-current worktrees when dirty status cannot be determined', async () => {
            const removed       = [];
            const statusError   = new Error('status failed');
            const {exec, paths} = makePruneExec({
                removed,
                dirtyStatus: statusError
            });

            const result = await pruneStaleWorktrees({
                projectRoot: fakeMainCheckout,
                currentPath: paths.current,
                exec,
                getSize    : async () => 1,
                hydrate    : async () => ({ok: true}),
                log        : () => {}
            });

            const byPath = Object.fromEntries(result.worktrees.map(item => [item.path, item]));

            expect(byPath[paths.dirty].remove).toBe(false);
            expect(byPath[paths.dirty].status).toBe('skipped-status-error');
            expect(byPath[paths.dirty].dirtyStatus.error).toBe(statusError);
            expect(removed).toEqual([
                ['worktree', 'remove', '--force', paths.stale],
                ['worktree', 'remove', '--force', paths.unmerged]
            ]);
        });

        test('never removes the primary checkout even when the worktree root includes it', async () => {
            const removed       = [];
            const {exec, paths} = makePruneExec({removed});

            const result = await pruneStaleWorktrees({
                projectRoot  : fakeMainCheckout,
                currentPath  : paths.current,
                worktreesRoot: fakeMainCheckout,
                exec,
                getSize      : async () => 1,
                hydrate      : async () => ({ok: true}),
                log          : () => {}
            });

            const byPath = Object.fromEntries(result.worktrees.map(item => [item.path, item]));

            expect(byPath[fakeMainCheckout].status).toBe('main-checkout');
            expect(byPath[fakeMainCheckout].remove).toBe(false);
            expect(byPath[paths.current].status).toBe('current');
            expect(byPath[paths.current].remove).toBe(false);
            expect(removed).toEqual([
                ['worktree', 'remove', '--force', paths.stale],
                ['worktree', 'remove', '--force', paths.unmerged]
            ]);
        });

        test('main-checkout invocation removes clean Claude worktrees and hydrates main checkout', async () => {
            const removed       = [];
            const {exec, paths} = makePruneExec({removed});
            const hydrated      = [];

            await pruneStaleWorktrees({
                projectRoot: fakeMainCheckout,
                exec,
                getSize    : async () => 1,
                hydrate    : async args => {
                    hydrated.push(args);
                    return {ok: true};
                },
                log: () => {}
            });

            expect(removed).toEqual([
                ['worktree', 'remove', '--force', paths.current],
                ['worktree', 'remove', '--force', paths.stale],
                ['worktree', 'remove', '--force', paths.unmerged]
            ]);
            expect(hydrated[0].projectRoot).toBe(fakeMainCheckout);
        });
    });

    // --------------------------------------------------------------------------------
    // hydrateCurrentWorktree — wires the Claude no-hold Stop hook into the worktree's
    // .claude/settings.json via initClaudeSettings (the Claude analog of the config-overlay
    // hydration). Without it the Stop hook is only wired by the npm prepare that
    // installDependencies skips when node_modules exists — leaving the no-hold enforcement
    // silently inert in worktrees.
    // --------------------------------------------------------------------------------
    test.describe('#13681 hydrateCurrentWorktree wires the Claude Stop hook', () => {
        test('calls the Claude-settings materializer with the worktree .claude dir', async () => {
            const calls = [];
            const spy   = async (opts) => { calls.push(opts); return {action: 'wired'}; };

            const result = await hydrateCurrentWorktree({
                mainCheckout      : fakeMainCheckout,
                projectRoot       : fakeWorktree,
                log               : () => {},
                wireClaudeSettings: spy
            });

            expect(calls).toHaveLength(1);
            expect(calls[0].claudeDir).toBe(path.join(fakeWorktree, '.claude'));
            expect(result.claudeSettings).toEqual({action: 'wired'});
        });

        test('real initClaudeSettings materializes the Stop hook from the tracked template', async () => {
            // Seed the worktree's tracked .claude/settings.template.json (the canonical Stop-hook
            // wiring); the default (real) initClaudeSettings must clone it into .claude/settings.json.
            const template = {
                hooks: {Stop: [{hooks: [{type: 'command', command: 'node .claude/hooks/laneStateStopHook.mjs', timeout: 10}]}]}
            };
            await fs.ensureDir(path.join(fakeWorktree, '.claude'));
            await fs.writeFile(
                path.join(fakeWorktree, '.claude', 'settings.template.json'),
                JSON.stringify(template, null, 2) + '\n', 'utf-8'
            );

            const result = await hydrateCurrentWorktree({
                mainCheckout: fakeMainCheckout,
                projectRoot : fakeWorktree,
                log         : () => {}
            });

            expect(result.claudeSettings.action).toBe('clone');

            const settings = JSON.parse(await fs.readFile(path.join(fakeWorktree, '.claude', 'settings.json'), 'utf-8'));
            expect(settings.hooks.Stop[0].hooks[0].command).toContain('laneStateStopHook.mjs');
        });
    });
});
