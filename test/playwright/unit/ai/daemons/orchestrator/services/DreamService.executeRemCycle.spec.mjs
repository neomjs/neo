import {test, expect} from '@playwright/test';
import Neo from '../../../../../../../src/Neo.mjs';
import * as core from '../../../../../../../src/core/_export.mjs';
import DreamService from '../../../../../../../ai/daemons/orchestrator/services/DreamService.mjs';
import AiConfig from '../../../../../../../ai/config.mjs';
import {Memory_Config as MemoryConfig} from '../../../../../../../ai/services.mjs';
import logger from '../../../../../../../ai/mcp/server/memory-core/logger.mjs';
import {mkdtemp, readdir, readFile, rm} from 'fs/promises';
import os from 'os';
import path from 'path';

/**
 * @summary Focused coverage for the typed-outcome contract of `DreamService.executeRemCycle()`.
 *
 * The keystone insight: the periodic dream path used to map every non-throwing return
 * from `processUndigestedSessions()` to `completed`, hiding silent no-ops (zero
 * undigested sessions, concurrent-invocation, provider unreachable). The unified
 * `executeRemCycle()` returns a typed outcome envelope so the no-op + failure paths
 * surface as distinct stage outcomes when consumers map the outcome to their
 * task-state / health-telemetry surfaces.
 *
 * Tests live with the service per the service-decomposition pattern — `DreamService`
 * owns the REM pipeline; orchestrator delegates and maps the typed outcome.
 *
 * DreamService is a `Neo.setupClass`-wrapped singleton, so tests stub methods on the
 * shared instance + restore originals in afterEach for cross-test isolation.
 */

const ORIGINAL_KEYS = [
    'isProcessing',
    'findUndigestedSessions',
    'processUndigestedSessions',
    'checkProviderReadiness'
];

let originals;
let configOriginals;
let tmpDir;

test.beforeEach(async () => {
    originals = Object.fromEntries(ORIGINAL_KEYS.map(key => [key, DreamService[key]]));
    configOriginals = {
        dreamMs               : AiConfig.orchestrator.intervals.dreamMs,
        dreamOverflowThreshold: AiConfig.orchestrator.intervals.dreamOverflowThreshold,
        remRunStateDir        : MemoryConfig.remRunStateDir,
        remRunRecentLimit     : MemoryConfig.remRunRecentLimit
    };
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'neo-dream-cycle-state-'));

    AiConfig.orchestrator.intervals.dreamMs                = 1000;
    AiConfig.orchestrator.intervals.dreamOverflowThreshold = 0.8;
    MemoryConfig.remRunStateDir                            = tmpDir;
    MemoryConfig.remRunRecentLimit                         = 3;

    DreamService.isProcessing              = false;
    DreamService.findUndigestedSessions    = async () => [];
    DreamService.processUndigestedSessions = async () => {};
    DreamService.checkProviderReadiness    = async () => ({ready: true});
});

test.afterEach(async () => {
    for (const key of ORIGINAL_KEYS) {
        DreamService[key] = originals[key];
    }

    AiConfig.orchestrator.intervals.dreamMs                = configOriginals.dreamMs;
    AiConfig.orchestrator.intervals.dreamOverflowThreshold = configOriginals.dreamOverflowThreshold;
    MemoryConfig.remRunStateDir                            = configOriginals.remRunStateDir;
    MemoryConfig.remRunRecentLimit                         = configOriginals.remRunRecentLimit;

    await rm(tmpDir, {recursive: true, force: true});
});

test.describe('DreamService.executeRemCycle typed outcome contract', () => {
    test('returns failed status with diagnostic when provider readiness gate rejects', async () => {
        DreamService.checkProviderReadiness = async () => ({
            ready     : false,
            diagnostic: {
                reason       : 'PROVIDER_READINESS_TIMEOUT',
                provider     : 'openAiCompatible',
                graphProvider: 'openAiCompatible',
                host         : 'http://127.0.0.1:13090'
            }
        });

        const outcome = await DreamService.executeRemCycle({reason: 'unit-test'});

        expect(outcome.status).toBe('failed');
        expect(outcome.diagnostic).toEqual({
            reason       : 'PROVIDER_READINESS_TIMEOUT',
            provider     : 'openAiCompatible',
            graphProvider: 'openAiCompatible',
            host         : 'http://127.0.0.1:13090'
        });
        expect(outcome.error).toBeNull();
        expect(outcome.sessionsProcessed).toBeNull();
        expect(outcome.runId).toMatch(/^rem-/);
        expect(outcome.completedAt).toBeTruthy();
        expect(outcome.durationMs).toBeGreaterThanOrEqual(0);
    });

    test('returns failed status when provider-readiness config validation throws', async () => {
        DreamService.checkProviderReadiness = async () => {
            throw new TypeError('AiConfig.orchestrator.providerReadiness is required');
        };

        const outcome = await DreamService.executeRemCycle({reason: 'missing-config-test'});

        expect(outcome.status).toBe('failed');
        expect(outcome.error?.message).toContain('checkProviderReadiness threw');
        expect(outcome.error?.message).toContain('providerReadiness is required');
        expect(outcome.sessionsProcessed).toBeNull();
        expect(outcome.diagnostic).toBeNull();
    });

    test('returns skipped status when dryRun=true after gate passes', async () => {
        const outcome = await DreamService.executeRemCycle({reason: 'dry-run-test', dryRun: true});

        expect(outcome.status).toBe('skipped');
        expect(outcome.skipReason).toBe('dry-run requested');
        expect(outcome.diagnostic).toBeNull();
        expect(outcome.error).toBeNull();
    });

    test('returns skipped with concurrent-invocation reason when isProcessing is true', async () => {
        DreamService.isProcessing = true;

        const outcome = await DreamService.executeRemCycle({reason: 'concurrent-test'});

        expect(outcome.status).toBe('skipped');
        expect(outcome.skipReason).toContain('dreamService.isProcessing already true');
    });

    test('returns skipped with sessionsProcessed=0 when no undigested sessions exist', async () => {
        DreamService.findUndigestedSessions = async () => [];

        let processCalled = false;
        DreamService.processUndigestedSessions = async () => {
            processCalled = true;
        };

        const outcome = await DreamService.executeRemCycle({reason: 'no-sessions-test', includeDecay: false});

        expect(outcome.status).toBe('skipped');
        expect(outcome.sessionsProcessed).toBe(0);
        expect(outcome.skipReason).toBe('no undigested sessions');
        expect(processCalled).toBe(false);
    });

    test('returns completed with sessionsProcessed=N when sessions exist + processing succeeds', async () => {
        DreamService.findUndigestedSessions    = async () => [{id: 'session-a'}, {id: 'session-b'}];
        DreamService.processUndigestedSessions = async () => {};

        const outcome = await DreamService.executeRemCycle({reason: 'completed-test', includeDecay: false});

        expect(outcome.status).toBe('completed');
        expect(outcome.sessionsProcessed).toBe(2);
        expect(outcome.error).toBeNull();
        expect(outcome.skipReason).toBeNull();
    });

    test('returns failed status when processUndigestedSessions throws', async () => {
        DreamService.findUndigestedSessions    = async () => [{id: 'session-a'}];
        DreamService.processUndigestedSessions = async () => {
            throw new Error('synthetic processing failure');
        };

        const outcome = await DreamService.executeRemCycle({reason: 'failure-test', includeDecay: false});

        expect(outcome.status).toBe('failed');
        expect(outcome.sessionsProcessed).toBe(1);
        expect(outcome.error?.message).toBe('synthetic processing failure');
        expect(outcome.error?.stack).toBeTruthy();
        expect(outcome.diagnostic).toBeNull();
    });

    test('returns failed status when findUndigestedSessions throws', async () => {
        DreamService.findUndigestedSessions = async () => {
            throw new Error('synthetic find failure');
        };

        const outcome = await DreamService.executeRemCycle({reason: 'find-failure-test'});

        expect(outcome.status).toBe('failed');
        expect(outcome.error?.message).toContain('findUndigestedSessions threw');
        expect(outcome.error?.message).toContain('synthetic find failure');
        expect(outcome.sessionsProcessed).toBeNull();
    });

    test('runId is unique per call', async () => {
        const outcomes = await Promise.all([
            DreamService.executeRemCycle({reason: 'unique-1', dryRun: true}),
            DreamService.executeRemCycle({reason: 'unique-2', dryRun: true}),
            DreamService.executeRemCycle({reason: 'unique-3', dryRun: true})
        ]);

        const runIds = outcomes.map(o => o.runId);
        const unique = new Set(runIds);

        expect(unique.size).toBe(3);
    });

    test('preserves reason + mode in outcome envelope', async () => {
        const outcome = await DreamService.executeRemCycle({
            reason: 'periodic-dream:3600000',
            mode  : 'periodic',
            dryRun: true
        });

        expect(outcome.reason).toBe('periodic-dream:3600000');
        expect(outcome.mode).toBe('periodic');
    });

    test('writes durable REM run-state JSONL with phase telemetry', async () => {
        const outcome = await DreamService.executeRemCycle({
            reason: 'state-write-test',
            dryRun: true
        });

        const files = await readdir(tmpDir);
        expect(files).toHaveLength(1);
        expect(files[0]).toMatch(/^rem-.*\.jsonl$/);

        const lines = (await readFile(path.join(tmpDir, files[0]), 'utf8')).trim().split('\n');
        const entry = JSON.parse(lines[0]);

        expect(outcome.stateWriteError).toBeUndefined();
        expect(entry.runId).toBe(outcome.runId);
        expect(entry.reason).toBe('state-write-test');
        expect(entry.outcome).toBe('skipped');
        expect(entry.reasonCode).toBe('dry-run');
        expect(entry.configuredCadenceMs).toBe(1000);
        expect(entry.cycleOverflowSignal).toBe(false);
        expect(entry.cycleScopePhases).toEqual(['providerReady', 'dryRun']);
        expect(entry.perPhaseStates.map(phase => phase.phase)).toEqual(['providerReady', 'dryRun']);
        expect(entry.perSessionStates).toEqual([]);
    });

    test('logs a warning when cycle wall-clock exceeds the cadence threshold', async () => {
        const originalNow  = Date.now;
        const originalWarn = logger.warn;
        const warnings     = [];
        const ticks        = [1000, 1000, 1100, 1700, 1800, 2100];

        Date.now = () => ticks.length > 0 ? ticks.shift() : 2100;
        logger.warn = (...args) => warnings.push(args.join(' '));

        try {
            await DreamService.executeRemCycle({
                reason: 'overflow-warning-test',
                dryRun: true
            });
        } finally {
            Date.now    = originalNow;
            logger.warn = originalWarn;
        }

        expect(warnings.some(message => message.includes('back-to-back overlap risk'))).toBe(true);
    });

    test('surfaces stale config overlay errors without hiding the typed outcome', async () => {
        // Simulate a stale / malformed config overlay that leaves dreamOverflowThreshold
        // present-but-invalid. The reactive config tree (ConfigProvider extends Neo.state.Provider)
        // routes leaf writes through core.Config#set, which intentionally treats `undefined`
        // as a no-op (preserves the prior value) — so a defined-but-invalid sentinel like `null`
        // is the faithful stale-overlay simulant. It propagates to `finalize()`, where
        // `createRemRunStateEntry` rejects any non-positive-number threshold; the throw is
        // caught into `stateWriteError` while the typed `skipped` outcome still surfaces.
        AiConfig.orchestrator.intervals.dreamOverflowThreshold = null;

        const outcome = await DreamService.executeRemCycle({
            reason: 'stale-config-test',
            dryRun: true
        });

        expect(outcome.status).toBe('skipped');
        expect(outcome.stateWriteError).toContain('overflowThreshold must be a positive number');
    });
});
