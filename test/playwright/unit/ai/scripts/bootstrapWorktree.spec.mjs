import {setup} from '../../../setup.mjs';

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
import Neo             from '../../../../../src/Neo.mjs';
import * as core       from '../../../../../src/core/_export.mjs';
import InstanceManager from '../../../../../src/manager/Instance.mjs';
import fs              from 'fs-extra';
import path            from 'path';

/**
 * @summary Coverage for the worktree bootstrap script (#10095).
 *
 * Uses tmp dirs as fake main-checkout and fake worktree to exercise the copy logic
 * without touching the real repo state. The CLI-mode `execFile` resolution of
 * `git worktree list --porcelain` is not exercised here — that path is a thin wrapper
 * around the already-covered `bootstrapWorktree(...)` function.
 */
test.describe('ai/scripts/bootstrapWorktree', () => {
    let bootstrapWorktree;
    let symlinkDataDir;
    let installDependencies;
    let runBuildAll;
    let BOOTSTRAP_CONFIGS;
    let fakeMainCheckout;
    let fakeWorktree;

    const fixtureConfigs = [
        'ai/mcp/server/github-workflow/config.mjs',
        'ai/mcp/server/knowledge-base/config.mjs',
        'ai/mcp/server/memory-core/config.mjs',
        'ai/mcp/server/neural-link/config.mjs'
    ];

    test.beforeAll(async () => {
        const mod           = await import('../../../../../ai/scripts/bootstrapWorktree.mjs');
        bootstrapWorktree   = mod.bootstrapWorktree;
        symlinkDataDir      = mod.symlinkDataDir;
        installDependencies = mod.installDependencies;
        runBuildAll         = mod.runBuildAll;
        BOOTSTRAP_CONFIGS   = mod.BOOTSTRAP_CONFIGS;
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

    test('exports the canonical BOOTSTRAP_CONFIGS list', () => {
        expect(BOOTSTRAP_CONFIGS).toEqual(fixtureConfigs);
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
        // Pre-seed one of the four with distinct content; confirm it's preserved.
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

    // --------------------------------------------------------------------------------
    // #10224 symlinkDataDir — unifies .neo-ai-data across worktree+main checkouts.
    //
    // These tests use a canary file in the main-checkout data dir to prove that the
    // symlinked worktree path sees the same data, empirically validating the
    // cross-process substrate unification this helper exists to enable.
    // --------------------------------------------------------------------------------
    test.describe('#10224 symlinkDataDir', () => {
        const dataDir = '.neo-ai-data';
        let mainDataDir;

        test.beforeEach(async () => {
            // Seed the main checkout's .neo-ai-data/ with a canary file so tests can
            // prove symlink traversal actually reaches it.
            mainDataDir = path.join(fakeMainCheckout, dataDir);
            await fs.ensureDir(mainDataDir);
            await fs.writeFile(path.join(mainDataDir, 'canary.txt'), 'main-checkout-canary\n', 'utf-8');
        });

        test('creates a symlink when worktree .neo-ai-data does not exist', async () => {
            const result = await symlinkDataDir({
                mainCheckout: fakeMainCheckout,
                projectRoot : fakeWorktree,
                log         : () => {}
            });

            expect(result).toBe('linked');

            const dst         = path.join(fakeWorktree, dataDir);
            const lstat       = await fs.lstat(dst);
            expect(lstat.isSymbolicLink()).toBe(true);

            // Canary reachable via the symlinked path — proves symlink traversal works.
            const canaryViaLink = await fs.readFile(path.join(dst, 'canary.txt'), 'utf-8');
            expect(canaryViaLink).toBe('main-checkout-canary\n');
        });

        test('is idempotent — returns already-linked when dst is already a symlink', async () => {
            // First call creates the link.
            await symlinkDataDir({mainCheckout: fakeMainCheckout, projectRoot: fakeWorktree, log: () => {}});

            // Second call must short-circuit; no error, no re-link.
            const result = await symlinkDataDir({
                mainCheckout: fakeMainCheckout,
                projectRoot : fakeWorktree,
                log         : () => {}
            });
            expect(result).toBe('already-linked');
        });

        test('refuses to clobber a non-symlink directory without force', async () => {
            // Pre-create a real directory with unique content — simulates a worktree
            // that has accumulated data before symlink unification was opted-in.
            const worktreeDataDir = path.join(fakeWorktree, dataDir);
            await fs.ensureDir(worktreeDataDir);
            await fs.writeFile(path.join(worktreeDataDir, 'local-only.txt'), 'worktree-specific\n', 'utf-8');

            await expect(
                symlinkDataDir({mainCheckout: fakeMainCheckout, projectRoot: fakeWorktree, log: () => {}})
            ).rejects.toThrow(/Refusing to replace non-symlink/);

            // Local data preserved — guard did its job.
            const preserved = await fs.readFile(path.join(worktreeDataDir, 'local-only.txt'), 'utf-8');
            expect(preserved).toBe('worktree-specific\n');
        });

        test('clobbers a non-symlink directory when force=true and creates the link', async () => {
            const worktreeDataDir = path.join(fakeWorktree, dataDir);
            await fs.ensureDir(worktreeDataDir);
            await fs.writeFile(path.join(worktreeDataDir, 'local-only.txt'), 'worktree-specific\n', 'utf-8');

            const result = await symlinkDataDir({
                mainCheckout: fakeMainCheckout,
                projectRoot : fakeWorktree,
                force       : true,
                log         : () => {}
            });
            expect(result).toBe('linked');

            // Local dir replaced — confirm dst is now a symlink.
            const lstat = await fs.lstat(worktreeDataDir);
            expect(lstat.isSymbolicLink()).toBe(true);

            // Canary reachable via the freshly-linked path.
            const canary = await fs.readFile(path.join(worktreeDataDir, 'canary.txt'), 'utf-8');
            expect(canary).toBe('main-checkout-canary\n');
        });

        test('returns main-checkout when run from the primary working tree', async () => {
            const result = await symlinkDataDir({
                mainCheckout: fakeMainCheckout,
                projectRoot : fakeMainCheckout, // same path = primary working tree
                log         : () => {}
            });
            expect(result).toBe('main-checkout');

            // No link was created (the main checkout's own dataDir stays as a real dir).
            const lstat = await fs.lstat(path.join(fakeMainCheckout, dataDir));
            expect(lstat.isDirectory()).toBe(true);
            expect(lstat.isSymbolicLink()).toBe(false);
        });
    });

    // --------------------------------------------------------------------------------
    // #10351 installDependencies + runBuildAll — opt-in flags that close the
    // multi-step manual bootstrap gap (npm install + bundle-parse5 + optional build-all).
    //
    // These tests inject a mock `exec` to capture invoked commands without spawning real
    // npm child processes. The pure-function form (with explicit dependency injection)
    // mirrors the existing `bootstrapWorktree`/`symlinkDataDir` testability pattern.
    // --------------------------------------------------------------------------------
    test.describe('#10351 installDependencies', () => {
        function makeMockExec() {
            const calls = [];
            const exec = async (cmd, args, opts) => {
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
            const result = await installDependencies({
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
            const result = await installDependencies({
                projectRoot: fakeWorktree,
                exec,
                log        : () => {}
            });

            // Return value MUST reflect the action actually taken (skip), not just the
            // post-condition that node_modules exists. Per @neo-gemini-3-1-pro's PR #10352
            // cycle 1 review: a returned-action contract that always reports `'installed'`
            // because node_modules ends up present either way is semantically broken.
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
            const exec = async (cmd, args, opts) => {
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
            const result = await runBuildAll({
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
});
