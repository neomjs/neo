import {test, expect} from '@playwright/test';
import fs             from 'node:fs';
import os             from 'node:os';
import path           from 'node:path';
import {
    CHROMA_CLI_ENTRYPOINT,
    cleanupChromaArtifacts,
    isDetachedProcessAlive,
    ownsChromaDataDir,
    resolvePackageDir,
    startChromaProcess,
    stopDetachedProcess
} from '../../chromaProcess.mjs';
import unitConfig, {
    assertBrainTierForEnvironment,
    brainHookTestMatch,
    brainTestMatch,
    buildProjects,
    buildUnitRunPolicy,
    hasBrainTier,
    knowledgeBaseConfigTemplateTestMatch,
    memoryCoreConfigTemplateTestMatch,
    orchestratorDaemonTestMatch,
    tier1ConfigTemplateTestMatch
} from '../../playwright.config.unit.mjs';

test.describe('playwright.config.unit — Chroma capability admission', () => {
    test('Body files stay pure while Brain files depend on run-scoped Chroma', () => {
        // Structure assertions go through `buildProjects({brainPresent: true})`, never the
        // default export: the install-tier gate makes the live export
        // environment-dependent, and a spec must measure the gate, not the seat it runs on.
        const projects = Object.fromEntries(buildProjects({brainPresent: true}).map(project => [project.name, project]));

        expect(unitConfig.webServer).toBeUndefined();
        expect(brainTestMatch.test('/repo/test/playwright/unit/util/Array.spec.mjs')).toBe(false);
        expect(brainTestMatch.test('/repo/test/playwright/unit/ai/ChromaRecovery.spec.mjs')).toBe(true);
        // The two graph-fixture hook specs are Brain-tier by function (static `better-sqlite3`
        // import) while living outside the `ai/**` path seam.
        expect(brainHookTestMatch.test('/repo/test/playwright/unit/hooks/kimiTurnPresenceHook.spec.mjs')).toBe(true);
        expect(brainHookTestMatch.test('/repo/test/playwright/unit/hooks/codexContextHook.spec.mjs')).toBe(true);
        expect(brainHookTestMatch.test('/repo/test/playwright/unit/hooks/someFutureHook.spec.mjs')).toBe(false);

        // The guarded contract is BODY PURITY — the bulk `unit` project must never admit a Brain
        // spec, because that would need a Chroma boot inside a pure-Node run. Assert that
        // behaviour, not the container's shape: `testIgnore` legitimately holds more than one
        // matcher, and an identity check against a single regex would fail every future exclusion
        // while proving nothing extra.
        const unitIgnore = [projects.unit.testIgnore].flat();

        expect(unitIgnore).toContain(brainTestMatch);
        expect(unitIgnore).toContain(brainHookTestMatch);
        // Behavioural, not structural: a Brain path IS excluded, an ordinary Body path is NOT.
        // This still catches the real regression an over-broad ignore would cause.
        expect(unitIgnore.some(match => match.test('/repo/test/playwright/unit/ai/ChromaRecovery.spec.mjs'))).toBe(true);
        expect(unitIgnore.some(match => match.test('/repo/test/playwright/unit/hooks/kimiTurnPresenceHook.spec.mjs'))).toBe(true);
        expect(unitIgnore.some(match => match.test('/repo/test/playwright/unit/util/Array.spec.mjs'))).toBe(false);
        expect(projects['unit-brain'].testMatch).toEqual([brainTestMatch, brainHookTestMatch]);
        expect(projects['unit-brain'].testIgnore).toEqual([
            orchestratorDaemonTestMatch,
            tier1ConfigTemplateTestMatch,
            knowledgeBaseConfigTemplateTestMatch,
            memoryCoreConfigTemplateTestMatch
        ]);
        expect(projects['unit-brain'].dependencies).toEqual(['chroma-setup']);
        expect(projects['unit-brain-orchestrator-daemon'].testMatch).toBe(orchestratorDaemonTestMatch);
        expect(projects['unit-brain-orchestrator-daemon'].dependencies).toEqual(['chroma-setup']);
        expect(projects['unit-brain-tier1-config'].testMatch).toBe(tier1ConfigTemplateTestMatch);
        expect(projects['unit-brain-tier1-config'].dependencies).toEqual(['chroma-setup']);
        expect(projects['unit-brain-knowledge-base-config'].testMatch).toBe(knowledgeBaseConfigTemplateTestMatch);
        expect(projects['unit-brain-knowledge-base-config'].dependencies).toEqual(['chroma-setup']);
        expect(projects['unit-brain-memory-core-config'].testMatch).toBe(memoryCoreConfigTemplateTestMatch);
        expect(projects['unit-brain-memory-core-config'].dependencies).toEqual(['chroma-setup']);
        expect(projects['chroma-setup'].teardown).toBe('chroma-teardown');
    });

    test('the install-tier gate drops Brain-dependent projects without touching the body pair (#16364)', () => {
        const gated = buildProjects({brainPresent: false}),
              armed = buildProjects({brainPresent: true});

        expect(gated.map(project => project.name)).toEqual(['unit']);
        // The gated list carries the SAME definition the armed list carries — the gate removes
        // projects, it never rewrites the survivors.
        const armedByName = Object.fromEntries(armed.map(project => [project.name, project]));

        expect(gated[0]).toEqual(armedByName.unit);
        expect(armed.map(project => project.name)).toEqual([
            'chroma-setup',
            'chroma-teardown',
            'unit',
            'unit-brain',
            'unit-brain-orchestrator-daemon',
            'unit-brain-tier1-config',
            'unit-brain-knowledge-base-config',
            'unit-brain-memory-core-config'
        ]);
    });

    test('CI admission fails closed on an absent or partial tier; a local base install only skips', () => {
        // A skipped brain matrix on a green CI run is silent coverage loss — it must error
        // before collection. Locally the same absence is the tier working as designed.
        expect(() => assertBrainTierForEnvironment({brainPresent: false, isCI: true})).toThrow(/silent coverage loss/);
        expect(() => assertBrainTierForEnvironment({brainPresent: true,  isCI: true})).not.toThrow();
        expect(() => assertBrainTierForEnvironment({brainPresent: false, isCI: false})).not.toThrow();
    });

    test('CI treats retry-pass outcomes as attributed failures without moving retries or workers (#17229)', () => {
        const
            ci    = buildUnitRunPolicy({isCI: true}),
            local = buildUnitRunPolicy({isCI: false});

        expect(ci.failOnFlakyTests).toBe(true);
        expect(ci.forbidOnly).toBe(true);
        expect(ci.retries).toBe(2);
        expect(ci.workers).toBe(4);
        expect(ci.reporter.map(([name]) => name)).toEqual(['github', 'json']);
        expect(ci.reporter[1]).toEqual(local.reporter[0]);

        expect(local.failOnFlakyTests).toBe(false);
        expect(local.forbidOnly).toBe(false);
        expect(local.retries).toBe(0);
        expect(local.workers).toBeUndefined();
        expect(local.reporter.map(([name]) => name)).toEqual(['json']);

        expect({
            failOnFlakyTests: unitConfig.failOnFlakyTests,
            forbidOnly      : unitConfig.forbidOnly,
            reporter        : unitConfig.reporter,
            retries         : unitConfig.retries,
            workers         : unitConfig.workers
        }).toEqual(buildUnitRunPolicy({isCI: !!process.env.CI}))
    });

    test('hasBrainTier requires all three roots AND their consumable entrypoints — an empty husk is not armed', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'brain-tier-probe-')),
              mk   = (pkg, ...files) => files.forEach(file => {
                  const full = path.join(root, 'node_modules', pkg, file);
                  fs.mkdirSync(path.dirname(full), {recursive: true});
                  fs.writeFileSync(full, '{}')
              });

        try {
            expect(hasBrainTier(root)).toBe(false);
            // Three bare directories — the false-green shape a pruned-but-husked install leaves.
            mk('better-sqlite3'); mk('chromadb'); mk('@chroma-core/default-embed');
            expect(hasBrainTier(root)).toBe(false);
            // Entrypoints but no native artifact: the broken-build case the directory probe missed.
            mk('better-sqlite3', 'lib/index.js');
            mk('chromadb', 'dist/chromadb.mjs');
            mk('@chroma-core/default-embed', 'dist/default-embed.mjs');
            expect(hasBrainTier(root)).toBe(false);
            mk('better-sqlite3', 'build/Release/better_sqlite3.node');
            // Still false: `chromadb` is admitted on the LIBRARY entrypoint above, and the
            // `chroma-setup` project this gate admits spawns the CLI one. Proving a different
            // artifact from the one the dependent runs is not an admission gate — a partial install
            // in exactly this shape passed and then died at the heartbeat.
            expect(hasBrainTier(root)).toBe(false);
            mk('chromadb', CHROMA_CLI_ENTRYPOINT);
            expect(hasBrainTier(root)).toBe(true);
        } finally {
            fs.rmSync(root, {force: true, recursive: true})
        }
    });

    test('a regular file named like a package does not satisfy the resolver', () => {
        // `existsSync` answers "is there an entry at this path", which a FILE satisfies. Callers then
        // join entrypoints beneath it and get a confusing miss instead of "not installed here", and
        // the walk stops at a candidate that can never hold anything.
        // A name no real install can carry, so the upward walk past the rejected candidate cannot
        // reach a host package and decide this result — the fixture owns the whole answer.
        const pkg  = '@neo-fixture-17477/not-a-real-package',
              root = fs.mkdtempSync(path.join(os.tmpdir(), 'brain-tier-file-')),
              full = path.join(root, 'node_modules', pkg);

        try {
            fs.mkdirSync(path.dirname(full), {recursive: true});
            fs.writeFileSync(full, 'not a package');

            expect(fs.existsSync(full)).toBe(true);
            expect(resolvePackageDir(root, pkg)).toBeNull()
        } finally {
            fs.rmSync(root, {force: true, recursive: true})
        }
    });

    test('the tier resolves from a directory holding no node_modules of its own', () => {
        // The linked-worktree shape: `npm install` ran one level up, so imports from here resolve
        // against the parent while a joined `here/node_modules/...` does not exist at all.
        const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'brain-tier-parent-')),
              nested = path.join(parent, 'worktree'),
              mk     = (root, pkg, ...files) => files.forEach(file => {
                  const full = path.join(root, 'node_modules', pkg, file);
                  fs.mkdirSync(path.dirname(full), {recursive: true});
                  fs.writeFileSync(full, '{}')
              });

        try {
            fs.mkdirSync(nested);
            mk(parent, 'better-sqlite3', 'lib/index.js', 'build/Release/better_sqlite3.node');
            mk(parent, 'chromadb', 'dist/chromadb.mjs', CHROMA_CLI_ENTRYPOINT);
            mk(parent, '@chroma-core/default-embed', 'dist/default-embed.mjs');

            expect(fs.existsSync(path.join(nested, 'node_modules'))).toBe(false);
            expect(hasBrainTier(nested)).toBe(true);
            expect(resolvePackageDir(nested, 'chromadb')).toBe(path.join(parent, 'node_modules', 'chromadb'));
            // Scoped names are a separate path-join shape and worth pinning once.
            expect(resolvePackageDir(nested, '@chroma-core/default-embed'))
                .toBe(path.join(parent, 'node_modules', '@chroma-core/default-embed'));
        } finally {
            fs.rmSync(parent, {force: true, recursive: true})
        }
    });

    test('CONTROL: the nearest node_modules wins, so a husk is never papered over from above', () => {
        // The half that keeps the husk probe meaningful. Resolving upward must not become
        // "search until something works" — a pruned install beside you is still a pruned install,
        // and falling through to an intact copy in an ancestor would report the tier armed on the
        // exact broken state the entrypoint checks exist to catch.
        const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'brain-tier-shadow-')),
              nested = path.join(parent, 'worktree'),
              mk     = (root, pkg, ...files) => files.forEach(file => {
                  const full = path.join(root, 'node_modules', pkg, file);
                  fs.mkdirSync(path.dirname(full), {recursive: true});
                  fs.writeFileSync(full, '{}')
              });

        try {
            fs.mkdirSync(nested);
            // Intact one level up …
            mk(parent, 'better-sqlite3', 'lib/index.js', 'build/Release/better_sqlite3.node');
            mk(parent, 'chromadb', 'dist/chromadb.mjs', CHROMA_CLI_ENTRYPOINT);
            mk(parent, '@chroma-core/default-embed', 'dist/default-embed.mjs');
            // … husked right here. The nearer one is what Node would load, so it is what decides.
            mk(nested, 'better-sqlite3', 'lib/index.js');
            mk(nested, 'chromadb', 'dist/chromadb.mjs', CHROMA_CLI_ENTRYPOINT);
            mk(nested, '@chroma-core/default-embed', 'dist/default-embed.mjs');

            expect(hasBrainTier(nested)).toBe(false);
            expect(resolvePackageDir(nested, 'chromadb')).toBe(path.join(nested, 'node_modules', 'chromadb'));
            // The ancestor is genuinely armed — so this arm fails if the walk ever falls through.
            expect(hasBrainTier(parent)).toBe(true);
        } finally {
            fs.rmSync(parent, {force: true, recursive: true})
        }
    });

    test('resolvePackageDir gives up at the filesystem root rather than looping', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'brain-tier-absent-'));

        try {
            // The name is unique on purpose: the walk genuinely runs to the filesystem root, and no
            // real `node_modules` anywhere above can carry it, so termination is what is proven and
            // not the host's contents. An assertion against `path.parse(root).root` would let a
            // machine that happens to have `/node_modules` decide a unit result.
            expect(resolvePackageDir(root, '@neo-fixture-17477/absent-everywhere')).toBeNull()
        } finally {
            fs.rmSync(root, {force: true, recursive: true})
        }
    });
});

test.describe('test/playwright/chromaProcess — run-scoped Chroma lifecycle', () => {
    test('data-dir ownership survives setup retries without claiming explicit caller state', () => {
        expect(ownsChromaDataDir({})).toBe(true);
        expect(ownsChromaDataDir({NEO_CHROMA_DATA_DIR_TEST: '/caller/chroma'})).toBe(false);
        expect(ownsChromaDataDir({
            NEO_CHROMA_DATA_DIR_TEST     : '/tmp/auto-chroma',
            NEO_UNIT_CHROMA_DATA_DIR_AUTO: 'true'
        })).toBe(true);
    });

    test('startup refuses an already-listening Chroma instead of adopting foreign state', async () => {
        let spawnCalled = false;

        await expect(startChromaProcess({
            dataDir : '/never-created',
            host    : '127.0.0.1',
            logPath : '/never-created.log',
            port    : 18190,
            probeFn : async () => true,
            repoRoot: '/repo',
            spawnFn : () => { spawnCalled = true }
        })).rejects.toThrow(/Refusing to reuse a Chroma server already listening/);

        expect(spawnCalled).toBe(false);
    });

    test('the CLI path is RESOLVED from repoRoot, so a worktree spawns the real binary', async () => {
        // The second half of the same defect. Fixing only the tier probe arms the projects and then
        // fails at `chroma-setup` with "Chroma exited before its heartbeat became ready" — a
        // symptom two layers away from `node …/never-existed/dist/cli.mjs`.
        const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'chroma-cli-resolve-')),
              nested = path.join(parent, 'worktree'),
              cliDir = path.join(parent, 'node_modules', 'chromadb', 'dist');

        let spawnedArgs = null;

        try {
            fs.mkdirSync(nested);
            fs.mkdirSync(cliDir, {recursive: true});
            fs.writeFileSync(path.join(cliDir, 'cli.mjs'), '');

            await expect(startChromaProcess({
                dataDir : path.join(parent, 'data'),
                host    : '127.0.0.1',
                logPath : path.join(parent, 'chroma.log'),
                port    : 18191,
                probeFn : async () => false,
                repoRoot: nested,
                spawnFn : (_command, args) => {
                    spawnedArgs = args;
                    throw new Error('stop here — the spawn argument is the whole assertion')
                }
            })).rejects.toThrow(/stop here/);

            // Asserted BEFORE the comparisons below, because `not.toBe(...)` against an unset
            // capture passes vacuously — a control that cannot fail proves nothing.
            expect(spawnedArgs).not.toBeNull();
            expect(spawnedArgs[0]).toBe(path.join(cliDir, 'cli.mjs'));
            // CONTROL: a joined path would have produced this instead, and it does not exist.
            expect(spawnedArgs[0]).not.toBe(path.join(nested, 'node_modules', 'chromadb', 'dist', 'cli.mjs'));
        } finally {
            fs.rmSync(parent, {force: true, recursive: true})
        }
    });

    test('an unlocatable chromadb names itself rather than dying at the heartbeat', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chroma-cli-absent-'));

        try {
            await expect(startChromaProcess({
                dataDir : path.join(root, 'data'),
                host    : '127.0.0.1',
                logPath : path.join(root, 'chroma.log'),
                port    : 18192,
                probeFn : async () => false,
                repoRoot: root,
                // Injected rather than walked. A real walk from a temp dir reads whatever the host
                // has above it, so the assertion would be about this machine — the same class of
                // uncontrolled read as the `path.parse(root).root` fixtures this replaces.
                resolveFn: () => null,
                spawnFn  : () => { throw new Error('must not reach spawn') }
            })).rejects.toThrow(/Cannot locate the chromadb package/);
        } finally {
            fs.rmSync(root, {force: true, recursive: true})
        }
    });

    test('a located-but-partial chromadb names the missing CLI, and never reaches spawn', async () => {
        // The admission gate and the process it enables checked DIFFERENT artifacts: `hasBrainTier`
        // proved `dist/chromadb.mjs`, `chroma-setup` spawns the CLI. An install carrying the first
        // without the second passed the gate and then failed as "Chroma exited before its heartbeat
        // became ready" — the same indirection the resolution fix removed, one artifact over.
        const root       = fs.mkdtempSync(path.join(os.tmpdir(), 'chroma-cli-partial-')),
              packageDir = path.join(root, 'node_modules', 'chromadb');

        let spawnCalled = false;

        try {
            fs.mkdirSync(path.join(packageDir, 'dist'), {recursive: true});
            fs.writeFileSync(path.join(packageDir, 'dist', 'chromadb.mjs'), '');

            // Admission refuses it, so the projects are never armed …
            expect(hasBrainTier(root)).toBe(false);

            // … and the spawn refuses it too, by name. Both halves, because either one alone leaves
            // the other free to disagree again.
            await expect(startChromaProcess({
                dataDir : path.join(root, 'data'),
                host    : '127.0.0.1',
                logPath : path.join(root, 'chroma.log'),
                port    : 18193,
                probeFn : async () => false,
                repoRoot: root,
                spawnFn : () => { spawnCalled = true }
            })).rejects.toThrow(new RegExp(`${CHROMA_CLI_ENTRYPOINT.replace('.', '\\.')} is missing`));

            expect(spawnCalled).toBe(false);

            // CONTROL: same fixture, one file added, and the spawn is now reached. Without this the
            // arm above is satisfied by a build that refuses every install it is handed.
            fs.writeFileSync(path.join(packageDir, CHROMA_CLI_ENTRYPOINT), '');

            await expect(startChromaProcess({
                dataDir : path.join(root, 'data'),
                host    : '127.0.0.1',
                logPath : path.join(root, 'chroma.log'),
                port    : 18193,
                probeFn : async () => false,
                repoRoot: root,
                spawnFn : () => {
                    spawnCalled = true;
                    throw new Error('reached spawn')
                }
            })).rejects.toThrow(/reached spawn/);

            expect(spawnCalled).toBe(true)
        } finally {
            fs.rmSync(root, {force: true, recursive: true})
        }
    });

    test('SIGINT settles a detached POSIX process group without escalation', async () => {
        const signals = [];
        let   alive   = true;
        const killFn  = (target, signal) => {
            expect(target).toBe(-4242);

            if (signal === 0) {
                if (!alive) {
                    const error = new Error('gone');
                    error.code  = 'ESRCH';
                    throw error
                }

                return
            }

            signals.push(signal);
            alive = false
        };

        await expect(stopDetachedProcess(4242, {graceMs: 10, killFn, platform: 'linux'}))
            .resolves.toEqual({exited: true, forced: false, groupEmpty: true});
        expect(signals).toEqual(['SIGINT']);
        expect(isDetachedProcessAlive(4242, {killFn, platform: 'linux'})).toBe(false);
    });

    test('a SIGINT-resistant POSIX group escalates to SIGKILL and proves group-empty', async () => {
        const signals = [];
        let   alive   = true;
        const killFn  = (target, signal) => {
            expect(target).toBe(-4343);

            if (signal === 0) {
                if (!alive) {
                    const error = new Error('gone');
                    error.code  = 'ESRCH';
                    throw error
                }

                return
            }

            signals.push(signal);

            if (signal === 'SIGKILL') {
                alive = false
            }
        };

        await expect(stopDetachedProcess(4343, {
            graceMs   : 0,
            killFn,
            killWaitMs: 10,
            platform  : 'linux'
        })).resolves.toEqual({exited: true, forced: true, groupEmpty: true});
        expect(signals).toEqual(['SIGINT', 'SIGKILL']);
    });

    test('cleanup removes generated data + log artifacts inside the guarded temp namespace', () => {
        const
            dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-chroma-unit-test-fixture-')),
            logPath = `${dataDir}.log`;

        fs.writeFileSync(logPath, 'fixture');
        cleanupChromaArtifacts({dataDir, logPath, ownsDataDir: true});

        expect(fs.existsSync(dataDir)).toBe(false);
        expect(fs.existsSync(logPath)).toBe(false);
    });

    test('cleanup never deletes an explicit caller data directory', () => {
        const
            dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-explicit-chroma-fixture-')),
            logPath = path.join(os.tmpdir(), `neo-chroma-unit-test-explicit-${process.pid}.log`);

        try {
            fs.writeFileSync(logPath, 'fixture');
            cleanupChromaArtifacts({dataDir, logPath, ownsDataDir: false});

            expect(fs.existsSync(dataDir)).toBe(true);
            expect(fs.existsSync(logPath)).toBe(false);
        } finally {
            fs.rmSync(dataDir, {force: true, recursive: true})
        }
    });

    test('cleanup refuses an auto-owned path outside the guarded temp namespace', () => {
        const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-unsafe-chroma-fixture-'));

        try {
            expect(() => cleanupChromaArtifacts({dataDir, logPath: null, ownsDataDir: true}))
                .toThrow(/Refusing to remove non-unit-Chroma temporary path/);
            expect(fs.existsSync(dataDir)).toBe(true);
        } finally {
            fs.rmSync(dataDir, {force: true, recursive: true})
        }
    });
});
