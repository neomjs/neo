import {test, expect} from '@playwright/test';
import fs             from 'node:fs';
import os             from 'node:os';
import path           from 'node:path';
import {
    cleanupChromaArtifacts,
    isDetachedProcessAlive,
    ownsChromaDataDir,
    startChromaProcess,
    stopDetachedProcess
} from '../../chromaProcess.mjs';
import unitConfig, {
    assertBrainTierForEnvironment,
    brainHookTestMatch,
    brainTestMatch,
    buildProjects,
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
            expect(hasBrainTier(root)).toBe(true);
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
