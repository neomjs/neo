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
    brainTestMatch,
    orchestratorDaemonTestMatch
} from '../../playwright.config.unit.mjs';

test.describe('playwright.config.unit — Chroma capability admission', () => {
    test('Body files stay pure while Brain files depend on run-scoped Chroma', () => {
        const projects = Object.fromEntries(unitConfig.projects.map(project => [project.name, project]));

        expect(unitConfig.webServer).toBeUndefined();
        expect(brainTestMatch.test('/repo/test/playwright/unit/util/Array.spec.mjs')).toBe(false);
        expect(brainTestMatch.test('/repo/test/playwright/unit/ai/ChromaRecovery.spec.mjs')).toBe(true);

        // The guarded contract is BODY PURITY — the bulk `unit` project must never admit a Brain
        // spec, because that would need a Chroma boot inside a pure-Node run. Assert that
        // behaviour, not the container's shape: `testIgnore` legitimately holds more than one
        // matcher (the `unit-profiling` split added the wall-clock specs), and an identity check
        // against a single regex would fail every future exclusion while proving nothing extra.
        const unitIgnore = [projects.unit.testIgnore].flat();

        expect(unitIgnore).toContain(brainTestMatch);
        // Behavioural, not structural: a Brain path IS excluded, an ordinary Body path is NOT.
        // This still catches the real regression an over-broad ignore would cause.
        expect(unitIgnore.some(match => match.test('/repo/test/playwright/unit/ai/ChromaRecovery.spec.mjs'))).toBe(true);
        expect(unitIgnore.some(match => match.test('/repo/test/playwright/unit/util/Array.spec.mjs'))).toBe(false);
        expect(projects['unit-brain'].testMatch).toBe(brainTestMatch);
        expect(projects['unit-brain'].testIgnore).toBe(orchestratorDaemonTestMatch);
        expect(projects['unit-brain'].dependencies).toEqual(['chroma-setup']);
        expect(projects['unit-brain-orchestrator-daemon'].testMatch).toBe(orchestratorDaemonTestMatch);
        expect(projects['unit-brain-orchestrator-daemon'].dependencies).toEqual(['chroma-setup']);
        expect(projects['chroma-setup'].teardown).toBe('chroma-teardown');
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
