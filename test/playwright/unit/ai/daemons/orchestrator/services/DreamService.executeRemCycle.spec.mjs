import {test, expect} from '@playwright/test';
import Neo from '../../../../../../../src/Neo.mjs';
import * as core from '../../../../../../../src/core/_export.mjs';
import DreamService from '../../../../../../../ai/daemons/orchestrator/services/DreamService.mjs';

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

test.beforeEach(() => {
    originals = Object.fromEntries(ORIGINAL_KEYS.map(key => [key, DreamService[key]]));

    DreamService.isProcessing              = false;
    DreamService.findUndigestedSessions    = async () => [];
    DreamService.processUndigestedSessions = async () => {};
    DreamService.checkProviderReadiness    = async () => ({ready: true});
});

test.afterEach(() => {
    for (const key of ORIGINAL_KEYS) {
        DreamService[key] = originals[key];
    }
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
});
