import {test, expect} from '@playwright/test';
import Neo from '../../../../../../src/Neo.mjs';
import * as core from '../../../../../../src/core/_export.mjs';
import {Orchestrator} from '../../../../../../ai/daemons/orchestrator/Orchestrator.mjs';
import {buildTaskDefinitions} from '../../../../../../ai/daemons/orchestrator/TaskDefinitions.mjs';

/**
 * @summary Focused coverage for the typed-outcome contract of `Orchestrator.executeRemCycle()`.
 *
 * The keystone insight: the periodic dream path used to map every non-throwing return
 * from `DreamService.processUndigestedSessions()` to `completed`, hiding silent no-ops
 * (zero undigested sessions, concurrent-invocation, provider unreachable). The unified
 * `executeRemCycle()` returns a typed outcome envelope so the no-op and failure paths
 * surface as distinct stage outcomes through `healthService.recordTaskOutcome`.
 */

let seq = 0;

function buildOrchestrator(overrides = {}) {
    const taskDefinitions = buildTaskDefinitions({scriptDir: '/repo/ai/scripts', nodeBin: '/node'});

    const orchestrator = Neo.create(Orchestrator, {
        dataDir                    : `/tmp/orchestrator-execute-rem-cycle-test/${process.pid}-${++seq}`,
        taskDefinitions,
        heavyMaintenanceLeasePath  : `/tmp/orchestrator-execute-rem-cycle-test/lease-${process.pid}-${seq}.json`,
        ...overrides
    });

    // Default stubs — individual tests override per-case.
    orchestrator.dreamService = {
        isProcessing            : false,
        findUndigestedSessions  : async () => [],
        processUndigestedSessions: async () => {},
        ...(overrides.dreamServiceStub || {})
    };

    orchestrator.runProviderReadinessGate = async () => ({ready: true});
    orchestrator.writeLog                  = () => {};

    return orchestrator;
}

test.describe('Orchestrator.executeRemCycle typed outcome contract', () => {
    test('returns failed status with diagnostic when provider readiness gate rejects', async () => {
        const orchestrator = buildOrchestrator();
        orchestrator.runProviderReadinessGate = async () => ({
            ready     : false,
            diagnostic: {
                reason       : 'PROVIDER_READINESS_TIMEOUT',
                provider     : 'openAiCompatible',
                graphProvider: 'openAiCompatible',
                host         : 'http://127.0.0.1:13090'
            }
        });

        const outcome = await orchestrator.executeRemCycle({reason: 'unit-test'});

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
        const orchestrator = buildOrchestrator();

        const outcome = await orchestrator.executeRemCycle({reason: 'dry-run-test', dryRun: true});

        expect(outcome.status).toBe('skipped');
        expect(outcome.skipReason).toBe('dry-run requested');
        expect(outcome.diagnostic).toBeNull();
        expect(outcome.error).toBeNull();
    });

    test('returns skipped with concurrent-invocation reason when dreamService.isProcessing is true', async () => {
        const orchestrator = buildOrchestrator();
        orchestrator.dreamService.isProcessing = true;

        const outcome = await orchestrator.executeRemCycle({reason: 'concurrent-test'});

        expect(outcome.status).toBe('skipped');
        expect(outcome.skipReason).toContain('dreamService.isProcessing already true');
    });

    test('returns skipped with sessionsProcessed=0 when no undigested sessions exist', async () => {
        const orchestrator = buildOrchestrator();
        orchestrator.dreamService.findUndigestedSessions = async () => [];

        let processCalled = false;
        orchestrator.dreamService.processUndigestedSessions = async () => {
            processCalled = true;
        };

        const outcome = await orchestrator.executeRemCycle({reason: 'no-sessions-test', includeDecay: false});

        expect(outcome.status).toBe('skipped');
        expect(outcome.sessionsProcessed).toBe(0);
        expect(outcome.skipReason).toBe('no undigested sessions');
        expect(processCalled).toBe(false);
    });

    test('returns completed with sessionsProcessed=N when sessions exist + processing succeeds', async () => {
        const orchestrator = buildOrchestrator();
        orchestrator.dreamService.findUndigestedSessions   = async () => [{id: 'session-a'}, {id: 'session-b'}];
        orchestrator.dreamService.processUndigestedSessions = async () => {};

        const outcome = await orchestrator.executeRemCycle({reason: 'completed-test', includeDecay: false});

        expect(outcome.status).toBe('completed');
        expect(outcome.sessionsProcessed).toBe(2);
        expect(outcome.error).toBeNull();
        expect(outcome.skipReason).toBeNull();
    });

    test('returns failed status when processUndigestedSessions throws', async () => {
        const orchestrator = buildOrchestrator();
        orchestrator.dreamService.findUndigestedSessions   = async () => [{id: 'session-a'}];
        orchestrator.dreamService.processUndigestedSessions = async () => {
            throw new Error('synthetic processing failure');
        };

        const outcome = await orchestrator.executeRemCycle({reason: 'failure-test', includeDecay: false});

        expect(outcome.status).toBe('failed');
        expect(outcome.sessionsProcessed).toBe(1);
        expect(outcome.error?.message).toBe('synthetic processing failure');
        expect(outcome.error?.stack).toBeTruthy();
        expect(outcome.diagnostic).toBeNull();
    });

    test('returns failed status when findUndigestedSessions throws', async () => {
        const orchestrator = buildOrchestrator();
        orchestrator.dreamService.findUndigestedSessions = async () => {
            throw new Error('synthetic find failure');
        };

        const outcome = await orchestrator.executeRemCycle({reason: 'find-failure-test'});

        expect(outcome.status).toBe('failed');
        expect(outcome.error?.message).toContain('findUndigestedSessions threw');
        expect(outcome.error?.message).toContain('synthetic find failure');
        expect(outcome.sessionsProcessed).toBeNull();
    });

    test('runId is unique per call', async () => {
        const orchestrator = buildOrchestrator();

        const outcomes = await Promise.all([
            orchestrator.executeRemCycle({reason: 'unique-1', dryRun: true}),
            orchestrator.executeRemCycle({reason: 'unique-2', dryRun: true}),
            orchestrator.executeRemCycle({reason: 'unique-3', dryRun: true})
        ]);

        const runIds = outcomes.map(o => o.runId);
        const unique = new Set(runIds);

        expect(unique.size).toBe(3);
    });

    test('preserves reason + mode in outcome envelope', async () => {
        const orchestrator = buildOrchestrator();

        const outcome = await orchestrator.executeRemCycle({
            reason: 'periodic-dream:3600000',
            mode  : 'periodic',
            dryRun: true
        });

        expect(outcome.reason).toBe('periodic-dream:3600000');
        expect(outcome.mode).toBe('periodic');
    });
});
