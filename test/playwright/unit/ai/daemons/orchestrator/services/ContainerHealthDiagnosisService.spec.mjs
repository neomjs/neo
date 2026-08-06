import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../../src/core/_export.mjs';
import {
    CONTAINER_HEALTH_ACTION_CLASSES,
    CONTAINER_HEALTH_FACT_TYPES,
    ContainerHealthDiagnosisService,
    STORE_BACKED_SERVICE_KEYS,
    evaluateRestartChurn,
    calculateDockerCpuPercent,
    calculateDockerMemoryPercent
} from '../../../../../../../ai/daemons/orchestrator/services/ContainerHealthDiagnosisService.mjs';

const OBSERVED_AT = 1710000000000;

function createService(config = {}) {
    return Neo.create(ContainerHealthDiagnosisService, {
        diagnosisConfig: config,
        nowFn          : () => OBSERVED_AT
    });
}

function runningInspect(overrides = {}) {
    return {
        State: {
            Status: 'running',
            Health: {Status: 'healthy'},
            ...overrides
        }
    };
}

function statsSample({cpuPercent = 0, memoryPercent = 0} = {}) {
    const systemDelta = 1_000_000_000,
          cpuDelta    = (cpuPercent / 100) * systemDelta / 4,
          memoryLimit = 1000;

    return {
        cpu_stats: {
            online_cpus     : 4,
            system_cpu_usage: systemDelta,
            cpu_usage       : {
                total_usage : cpuDelta,
                percpu_usage: [cpuDelta / 4, cpuDelta / 4, cpuDelta / 4, cpuDelta / 4]
            }
        },
        precpu_stats: {
            system_cpu_usage: 0,
            cpu_usage       : {total_usage: 0}
        },
        memory_stats: {
            usage: memoryLimit * memoryPercent / 100,
            limit: memoryLimit
        }
    };
}

test.describe('Neo.ai.daemons.services.ContainerHealthDiagnosisService', () => {
    test('normalizes Docker CPU and memory samples', () => {
        const stats = statsSample({cpuPercent: 280, memoryPercent: 75});

        expect(calculateDockerCpuPercent(stats)).toBe(280);
        expect(calculateDockerMemoryPercent(stats)).toBe(75);
    });

    test('keeps probe-only failures advisory', () => {
        const service = createService();

        const decision = service.diagnose({
            serviceKey   : 'memory',
            endpointProbe: {ok: false, name: 'mcp-healthcheck', message: 'timeout'}
        });

        expect(decision.status).toBe('advisory');
        expect(decision.diagnosis).toBeNull();
        expect(decision.facts).toHaveLength(1);
        expect(decision.facts[0]).toMatchObject({
            type         : CONTAINER_HEALTH_FACT_TYPES.endpointProbeFailed,
            authoritative: false
        });
    });

    test('emits a restart diagnosis for down containers', () => {
        const service = createService();

        const decision = service.diagnose({
            serviceKey: 'memory',
            inspect   : runningInspect({Status: 'exited', ExitCode: 137})
        });

        expect(decision.status).toBe('diagnosed');
        expect(decision.actionClass).toBe(CONTAINER_HEALTH_ACTION_CLASSES.restart);
        expect(decision.diagnosis).toMatchObject({
            type          : 'recovery-diagnosis',
            recoveryClass : 'crash',
            targetIdentity: {
                kind: 'compose-service',
                id  : 'memory'
            },
            source : 'container-health-diagnostics',
            details: {
                actionClass         : CONTAINER_HEALTH_ACTION_CLASSES.restart,
                classificationReason: 'lifecycle-crash'
            }
        });
        expect(decision.diagnosis.evidenceFacts.map(fact => fact.type))
            .toContain(CONTAINER_HEALTH_FACT_TYPES.containerDown);
    });

    test('requires multi-fact evidence before diagnosing unhealthy probe-like states', () => {
        const service = createService();

        const advisory = service.diagnose({
            serviceKey: 'knowledge',
            inspect   : runningInspect({Health: {Status: 'starting'}})
        });

        expect(advisory.status).toBe('advisory');
        expect(advisory.diagnosis).toBeNull();

        const diagnosed = service.diagnose({
            serviceKey   : 'knowledge',
            inspect      : runningInspect({Health: {Status: 'unhealthy'}}),
            endpointProbe: {ok: false, name: 'healthcheck'}
        });

        expect(diagnosed.status).toBe('diagnosed');
        expect(diagnosed.diagnosis.recoveryClass).toBe('crash');
        expect(diagnosed.diagnosis.evidenceFacts.map(fact => fact.type)).toEqual([
            CONTAINER_HEALTH_FACT_TYPES.containerUnhealthy,
            CONTAINER_HEALTH_FACT_TYPES.endpointProbeFailed
        ]);
    });

    test('keeps single-sample resource spikes advisory', () => {
        const service = createService({cpuSaturationPercent: 90, memorySaturationPercent: 80});

        const decision = service.diagnose({
            serviceKey: 'model',
            stats     : statsSample({cpuPercent: 380, memoryPercent: 85})
        });

        expect(decision.status).toBe('healthy');
        expect(decision.diagnosis).toBeNull();
        expect(decision.facts).toHaveLength(0);
    });

    test('classifies sustained resource saturation as throttle-shed exhaustion with bounded evidence', () => {
        const service = createService({cpuSaturationPercent: 90, memorySaturationPercent: 80});

        const decision = service.diagnose({
            serviceKey  : 'model',
            statsSamples: [
                statsSample({cpuPercent: 380, memoryPercent: 85}),
                statsSample({cpuPercent: 360, memoryPercent: 82})
            ]
        });

        expect(decision.status).toBe('diagnosed');
        expect(decision.actionClass).toBe(CONTAINER_HEALTH_ACTION_CLASSES.throttleShed);
        expect(decision.diagnosis).toMatchObject({
            recoveryClass: 'exhaustion',
            details      : {
                actionClass         : CONTAINER_HEALTH_ACTION_CLASSES.throttleShed,
                classificationReason: 'resource-exhaustion',
                sampleWindowMs      : 30000
            }
        });
        expect(decision.diagnosis.evidenceFacts[0].details).toMatchObject({
            sampleCount: 2,
            minPercent : 360,
            maxPercent : 380
        });
        expect(decision.diagnosis.evidenceFacts.map(fact => fact.type)).toEqual([
            CONTAINER_HEALTH_FACT_TYPES.resourceSaturation,
            CONTAINER_HEALTH_FACT_TYPES.memorySaturation
        ]);
    });

    test('classifies Ollama eval contention only with runtime evidence', () => {
        const service = createService();

        const evalAttribution = {
            primaryRole: {role: 'chat'},
            primaryLoad: {model: 'gemma4:31b'},
            stuckModels: [{
                model          : 'qwen3-embedding',
                role           : 'embedding',
                tokensPerSecond: 0
            }]
        };

        const advisory = service.diagnose({
            serviceKey           : 'model',
            ollamaEvalAttribution: evalAttribution
        });

        expect(advisory.status).toBe('advisory');
        expect(advisory.diagnosis).toBeNull();

        const diagnosed = service.diagnose({
            serviceKey  : 'model',
            statsSamples: [
                statsSample({cpuPercent: 390}),
                statsSample({cpuPercent: 390})
            ],
            ollamaEvalAttribution: evalAttribution
        });

        expect(diagnosed.status).toBe('diagnosed');
        expect(diagnosed.diagnosis).toMatchObject({
            recoveryClass: 'contention',
            details      : {
                actionClass         : CONTAINER_HEALTH_ACTION_CLASSES.throttleShed,
                classificationReason: 'contention-with-runtime-evidence'
            }
        });
        expect(diagnosed.diagnosis.evidenceFacts.map(fact => fact.type)).toEqual([
            CONTAINER_HEALTH_FACT_TYPES.evalContention,
            CONTAINER_HEALTH_FACT_TYPES.resourceSaturation
        ]);
    });

    test('routes missing provider role models to warm-provider before config-drift escalation', () => {
        const service = createService();

        const decision = service.diagnose({
            serviceKey       : 'model',
            providerResidency: {
                provider              : 'ollama',
                host                  : 'http://model:11434',
                ready                 : false,
                requiredModels        : ['gemma4:26b', 'qwen3-embedding:latest'],
                availableModels       : ['qwen3-embedding:latest'],
                missingModels         : ['gemma4:26b'],
                observedRequiredCount : 1,
                requiredResidentModels: 2,
                targetIdentity        : {kind: 'compose-service', id: 'model'}
            }
        });

        expect(decision.status).toBe('diagnosed');
        expect(decision.actionClass).toBe(CONTAINER_HEALTH_ACTION_CLASSES.warmProvider);
        expect(decision.targetIdentity).toEqual({kind: 'compose-service', id: 'model'});
        expect(decision.diagnosis).toMatchObject({
            recoveryClass : 'provider-role-residency',
            targetIdentity: {kind: 'compose-service', id: 'model'},
            details       : {
                classificationReason: 'provider-role-residency-warm'
            }
        });
        expect(decision.diagnosis.evidenceFacts).toHaveLength(1);
        expect(decision.diagnosis.evidenceFacts[0]).toMatchObject({
            type         : CONTAINER_HEALTH_FACT_TYPES.providerResidency,
            authoritative: true,
            details      : {
                provider     : 'ollama',
                reasonCode   : 'missing-required-model',
                missingModels: ['gemma4:26b']
            }
        });
    });

    test('routes resident-but-not-serving provider faults to the supervised-task target', () => {
        const service = createService();

        const decision = service.diagnose({
            serviceKey       : 'model',
            providerResidency: {
                provider             : 'ollama',
                ready                : false,
                residentButNotServing: true,
                requiredModels       : ['gemma4:26b'],
                availableModels      : ['gemma4:26b'],
                targetIdentity       : {kind: 'supervised-task', id: 'ollama'}
            }
        });

        expect(decision.status).toBe('diagnosed');
        expect(decision.actionClass).toBe(CONTAINER_HEALTH_ACTION_CLASSES.restart);
        expect(decision.targetIdentity).toEqual({kind: 'supervised-task', id: 'ollama'});
        expect(decision.diagnosis).toMatchObject({
            recoveryClass : 'crash',
            targetIdentity: {kind: 'supervised-task', id: 'ollama'},
            details       : {
                classificationReason: 'provider-resident-not-serving'
            }
        });
        expect(decision.diagnosis.evidenceFacts[0]).toMatchObject({
            type   : CONTAINER_HEALTH_FACT_TYPES.providerResidency,
            details: {
                reasonCode           : 'resident-not-serving',
                residentButNotServing: true
            }
        });
    });

    test('keeps extra active-provider residents advisory without ownership proof', () => {
        const service = createService();

        const decision = service.diagnose({
            serviceKey       : 'model',
            providerResidency: {
                provider       : 'ollama',
                ready          : true,
                requiredModels : ['gemma4:26b'],
                availableModels: ['gemma4:26b', 'old-model:latest'],
                extraModels    : ['old-model:latest'],
                targetIdentity : {kind: 'compose-service', id: 'model'}
            }
        });

        expect(decision.status).toBe('advisory');
        expect(decision.diagnosis).toBeNull();
        expect(decision.facts).toHaveLength(1);
        expect(decision.facts[0]).toMatchObject({
            type         : CONTAINER_HEALTH_FACT_TYPES.providerResidency,
            authoritative: false,
            severity     : 'warning',
            details      : {
                reasonCode : 'extra-residents',
                extraModels: ['old-model:latest']
            }
        });
    });

    test('does not let provider probe transport failures override container restart evidence', () => {
        const service = createService();

        const decision = service.diagnose({
            serviceKey       : 'model',
            inspect          : runningInspect({Status: 'exited', ExitCode: 137}),
            providerResidency: {
                provider      : 'unknown',
                degraded      : true,
                probeFailed   : true,
                message       : 'provider probe timed out',
                targetIdentity: {kind: 'compose-service', id: 'model'}
            }
        });

        expect(decision.status).toBe('diagnosed');
        expect(decision.actionClass).toBe(CONTAINER_HEALTH_ACTION_CLASSES.restart);
        expect(decision.diagnosis).toMatchObject({
            recoveryClass: 'crash',
            details      : {
                classificationReason: 'lifecycle-crash'
            }
        });
        expect(decision.diagnosis.evidenceFacts.map(fact => fact.type)).toContain(CONTAINER_HEALTH_FACT_TYPES.containerDown);
    });

    test('escalates config drift without selecting a lifecycle action', () => {
        const service = createService();

        const decision = service.diagnose({
            serviceKey : 'orchestrator',
            configCheck: {
                ok      : false,
                key     : 'NEO_MODEL_CONTEXT',
                expected: '131072',
                actual  : '4096',
                message : 'configured override did not land'
            }
        });

        expect(decision.status).toBe('diagnosed');
        expect(decision.actionClass).toBe(CONTAINER_HEALTH_ACTION_CLASSES.warmProvider);
        expect(decision.diagnosis).toMatchObject({
            recoveryClass: 'config-drift',
            details      : {
                actionClass         : CONTAINER_HEALTH_ACTION_CLASSES.warmProvider,
                classificationReason: 'config-drift-reconfigure'
            }
        });
    });

    test('collectAndDiagnose uses runtime read-observe and keeps read failures advisory', async () => {
        const service = createService();
        const calls   = [];

        const runtimeAccessService = {
            async readObserve(request) {
                calls.push(request);

                if (request.operation === 'inspect') {
                    return {data: runningInspect({Status: 'exited', ExitCode: 1})};
                }

                return {data: statsSample({cpuPercent: 5})};
            }
        };

        const decision = await service.collectAndDiagnose({
            serviceKey: 'memory',
            runtimeAccessService
        });

        expect(calls.map(call => call.operation)).toEqual(['inspect', 'stats']);
        expect(decision.diagnosis.recoveryClass).toBe('crash');

        const failed = await service.collectAndDiagnose({
            serviceKey          : 'memory',
            runtimeAccessService: {
                async readObserve() {
                    throw new Error('socket unavailable');
                }
            }
        });

        expect(failed.status).toBe('advisory');
        expect(failed.diagnosis).toBeNull();
        expect(failed.facts[0]).toMatchObject({
            type: CONTAINER_HEALTH_FACT_TYPES.runtimeReadFailed
        });
    });
});

/**
 * Restart-churn detect signal.
 *
 * The gap: a plane observed at 977 restarts reported `running` + `healthy` with a 28-second-old
 * process and NO diagnostic facts. Churn is a property ACROSS container incarnations, so no
 * point-in-time probe can express it — every incarnation genuinely was alive.
 */
test.describe('restart churn', () => {
    const inspect = (Id, RestartCount, State = {Status: 'running'}) => ({Id, RestartCount, State});

    test('the first observation adopts a baseline and reports nothing', () => {
        const result = evaluateRestartChurn({inspect: inspect('c1', 7), observedAt: OBSERVED_AT});

        expect(result.churning).toBe(false);
        expect(result.generationReset).toBe(true);
        expect(result.nextBaseline).toEqual({containerId: 'c1', observedAt: OBSERVED_AT, restartCount: 7});
    });

    test('restarts crossing the threshold inside the window report churn', () => {
        const result = evaluateRestartChurn({
            baseline  : {containerId: 'c1', observedAt: OBSERVED_AT, restartCount: 0},
            inspect   : inspect('c1', 4),
            observedAt: OBSERVED_AT + 60000
        });

        expect(result.churning).toBe(true);
        expect(result.unplannedRestarts).toBe(4);
    });

    test('below the threshold is not churn — one restart is a transient, not a loop', () => {
        const result = evaluateRestartChurn({
            baseline  : {containerId: 'c1', observedAt: OBSERVED_AT, restartCount: 0},
            inspect   : inspect('c1', 2),
            observedAt: OBSERVED_AT + 60000
        });

        expect(result.churning).toBe(false);
    });

    /**
     * The EXACT boundary, which the 4-and-2 pair above leaves open. `>=` and `>` agree on both of
     * those and disagree only here, so without this case an off-by-one in either direction is
     * invisible: the alarm would sit one restart away from where the config says it does. The
     * comparison is `>=`, so a delta equal to the threshold IS churn.
     */
    test('a delta exactly equal to the threshold is churn — the boundary is inclusive', () => {
        const result = evaluateRestartChurn({
            baseline  : {containerId: 'c1', observedAt: OBSERVED_AT, restartCount: 0},
            inspect   : inspect('c1', 3),
            observedAt: OBSERVED_AT + 60000
        });

        expect(result.churning).toBe(true);
        expect(result.unplannedRestarts).toBe(3);
    });

    /**
     * Planned-restart subtraction, asserted by MAGNITUDE rather than by verdict.
     *
     * A verdict-only test cannot see this: `unplannedRestarts` is clamped with `Math.max(0, ...)`,
     * so over-subtracting lands on the same `churning: false` as subtracting correctly. The pair
     * below straddles the boundary, so the arithmetic is pinned from both sides — 4 observed minus
     * 1 planned is exactly the threshold and must fire; minus 2 is one below and must not. Counting
     * a restart twice, or not at all, breaks one of the two.
     */
    test('one planned restart subtracts exactly one, measured at the boundary', () => {
        const args = {
            baseline  : {containerId: 'c1', observedAt: OBSERVED_AT, restartCount: 0},
            inspect   : inspect('c1', 4),
            observedAt: OBSERVED_AT + 60000
        };

        const one = evaluateRestartChurn({...args, plannedRestarts: 1});

        expect(one.unplannedRestarts).toBe(3);
        expect(one.churning).toBe(true);

        const two = evaluateRestartChurn({...args, plannedRestarts: 2});

        expect(two.unplannedRestarts).toBe(2);
        expect(two.churning).toBe(false);
    });

    /** A recreate is the most common reason to see a jump, and it must never read as a fault. */
    test('a recreate resets the generation instead of reporting churn', () => {
        const result = evaluateRestartChurn({
            baseline  : {containerId: 'c1', observedAt: OBSERVED_AT, restartCount: 0},
            inspect   : inspect('c2', 40),
            observedAt: OBSERVED_AT + 60000
        });

        expect(result.churning).toBe(false);
        expect(result.generationReset).toBe(true);
        expect(result.nextBaseline.containerId).toBe('c2');
    });

    test('planned restarts are subtracted, so a deploy sequence raises nothing', () => {
        const result = evaluateRestartChurn({
            baseline       : {containerId: 'c1', observedAt: OBSERVED_AT, restartCount: 0},
            inspect        : inspect('c1', 4),
            observedAt     : OBSERVED_AT + 60000,
            plannedRestarts: 4
        });

        expect(result.churning).toBe(false);
        expect(result.unplannedRestarts).toBe(0);
    });

    /** Churn is a RATE. An old anchor would let long-past restarts accumulate into a verdict on today. */
    test('past the window the baseline re-anchors rather than accumulating', () => {
        const result = evaluateRestartChurn({
            baseline  : {containerId: 'c1', observedAt: OBSERVED_AT, restartCount: 0},
            inspect   : inspect('c1', 99),
            observedAt: OBSERVED_AT + 900001
        });

        expect(result.churning).toBe(false);
        expect(result.nextBaseline.observedAt).toBe(OBSERVED_AT + 900001);
    });

    /** Inside the window the anchor is HELD — re-anchoring every tick could never reach a threshold. */
    test('inside the window the anchor is held, so restarts accumulate against it', () => {
        const result = evaluateRestartChurn({
            baseline  : {containerId: 'c1', observedAt: OBSERVED_AT, restartCount: 0},
            inspect   : inspect('c1', 1),
            observedAt: OBSERVED_AT + 60000
        });

        expect(result.nextBaseline.observedAt).toBe(OBSERVED_AT);
    });

    test('an unreadable inspect is unknown, never "no churn"', () => {
        const result = evaluateRestartChurn({inspect: {State: {}}, observedAt: OBSERVED_AT});

        expect(result.readable).toBe(false);
        expect(result.churning).toBe(false);
    });

    test('a churning container is diagnosed and RECORDED, never restarted', () => {
        const decision = createService().diagnose({
            serviceKey   : 'orchestrator',
            inspect      : inspect('c1', 4),
            churnBaseline: {containerId: 'c1', observedAt: OBSERVED_AT, restartCount: 0},
            observedAt   : OBSERVED_AT + 60000
        });

        expect(decision.status).toBe('diagnosed');
        expect(decision.actionClass).toBe(CONTAINER_HEALTH_ACTION_CLASSES.record);
        expect(decision.actionClass).not.toBe(CONTAINER_HEALTH_ACTION_CLASSES.restart);
        // `ambiguous` is the established record-never-auto-restart class (taskOutcomeDiagnosis).
        // `crash` would route to a restart under the reactive controller — that is why it is excluded.
        expect(decision.diagnosis.recoveryClass).toBe('ambiguous');
        expect(decision.diagnosis.recoveryClass).not.toBe('crash');
        expect(decision.diagnosis.details.classificationReason).toBe('restart-churn-recorded');
    });

    /**
     * The hazard this pins: `countAuthoritativeFacts` counts EVERY authoritative fact regardless of
     * type, and `hasAuthoritativeEvidence` admits a lifecycle-crash restart at `minAuthoritativeFacts`.
     * An authoritative churn fact could combine with one `container-unhealthy` fact to restart a
     * container whose own history proves restarting does not work.
     */
    test('the churn fact is non-authoritative, so it cannot tip another class into a restart', () => {
        const decision = createService().diagnose({
            serviceKey   : 'orchestrator',
            inspect      : inspect('c1', 4, {Status: 'running', Health: {Status: 'unhealthy'}}),
            churnBaseline: {containerId: 'c1', observedAt: OBSERVED_AT, restartCount: 0},
            observedAt   : OBSERVED_AT + 60000
        });

        const churnFact = decision.facts.find(f => f.type === CONTAINER_HEALTH_FACT_TYPES.restartChurn);

        expect(churnFact.authoritative).toBe(false);
        expect(decision.facts.filter(f => f.authoritative).length).toBeLessThan(2);
    });

    test('a failed runtime read is never reported as healthy', () => {
        const decision = createService().diagnose({
            serviceKey       : 'orchestrator',
            inspect          : null,
            inspectReadFailed: true,
            observedAt       : OBSERVED_AT
        });

        expect(decision.status).not.toBe('healthy');
        expect(decision.facts.some(f => f.type === CONTAINER_HEALTH_FACT_TYPES.runtimeReadFailed)).toBe(true);
    });

    test('an absent inspect with no read failure stays quiet — absence alone is not a fault', () => {
        const decision = createService().diagnose({serviceKey: 'orchestrator', inspect: null, observedAt: OBSERVED_AT});

        expect(decision.facts.some(f => f.type === CONTAINER_HEALTH_FACT_TYPES.runtimeReadFailed)).toBe(false);
    });

    test('a quiet container yields no churn fact and no diagnosis', () => {
        const decision = createService().diagnose({
            serviceKey   : 'orchestrator',
            inspect      : inspect('c1', 0),
            churnBaseline: {containerId: 'c1', observedAt: OBSERVED_AT, restartCount: 0},
            observedAt   : OBSERVED_AT + 60000
        });

        expect(decision.facts.some(f => f.type === CONTAINER_HEALTH_FACT_TYPES.restartChurn)).toBe(false);
        expect(decision.status).toBe('healthy');
    });

    test('the decision carries the next baseline so the caller can persist it', () => {
        const decision = createService().diagnose({
            serviceKey: 'orchestrator',
            inspect   : inspect('c1', 3),
            observedAt: OBSERVED_AT
        });

        expect(decision.churnBaseline).toEqual({containerId: 'c1', observedAt: OBSERVED_AT, restartCount: 3});
    });
    test('a STORE at its memory ceiling gets raise-ceiling, not shed it cannot perform (#16596)', () => {
        // The defect this pins: memory saturation routed uniformly to `throttle-shed`. For a store the
        // corpus IS the workload — footprint tracks rows already persisted — so there is no arrival
        // rate to reduce and a restart frees nothing durable. It was the one exhaustion case where no
        // available action could have worked, which is why a store at its ceiling never recovered.
        const service = createService();

        const decision = service.diagnose({
            serviceKey  : 'chroma',
            statsSamples: [
                statsSample({cpuPercent: 5, memoryPercent: 85}),
                statsSample({cpuPercent: 6, memoryPercent: 83})
            ]
        });

        expect(decision.status).toBe('diagnosed');
        expect(decision.actionClass).toBe(CONTAINER_HEALTH_ACTION_CLASSES.raiseCeiling);
        expect(decision.diagnosis).toMatchObject({
            recoveryClass: 'exhaustion',
            details      : {classificationReason: 'store-ceiling-exhaustion'}
        });

        // The evidence must be the MEMORY fact, not whatever resource fact happened to be first —
        // a raise decision justified by a CPU fact would be unfalsifiable from the record.
        expect(decision.diagnosis.evidenceFacts[0].type).toBe(CONTAINER_HEALTH_FACT_TYPES.memorySaturation);

        // And the fact must report the threshold ACTUALLY applied (80 for a store), not the transient
        // default. Reporting 90 here would place a falsehood inside the evidence a heal is chosen from.
        expect(decision.diagnosis.evidenceFacts[0].details.threshold).toBe(80);
    });

    test('the earlier store threshold is store-scoped: a transient service at the same load stays healthy (#16596)', () => {
        // Negative control for the THRESHOLD. 85% trips a store (80) and must not trip a transient
        // service (90) — otherwise the lower bar leaked globally and every service would now be
        // diagnosed earlier, which is a different change from the one intended.
        const service = createService();

        const decision = service.diagnose({
            serviceKey  : 'model',
            statsSamples: [
                statsSample({cpuPercent: 5, memoryPercent: 85}),
                statsSample({cpuPercent: 6, memoryPercent: 83})
            ]
        });

        expect(decision.status).toBe('healthy');
        expect(decision.facts).toHaveLength(0);
    });

    test('a transient service genuinely over its ceiling still sheds (#16596)', () => {
        // Negative control for the ROUTING. Without it, `raise-ceiling` could have replaced
        // `throttle-shed` everywhere and both this and the store test would still pass.
        //
        // CPU is saturated too, and it has to be: `hasAuthoritativeEvidence` needs
        // `minAuthoritativeFacts` (2) corroborating facts, so a transient service with memory alone is
        // not diagnosed at all. That floor is unchanged by this work and only the store branch is
        // exempt from it.
        const service = createService();

        const decision = service.diagnose({
            serviceKey  : 'model',
            statsSamples: [
                statsSample({cpuPercent: 380, memoryPercent: 96}),
                statsSample({cpuPercent: 360, memoryPercent: 94})
            ]
        });

        expect(decision.status).toBe('diagnosed');
        expect(decision.actionClass).toBe(CONTAINER_HEALTH_ACTION_CLASSES.throttleShed);
        expect(decision.diagnosis.details.classificationReason).toBe('resource-exhaustion');
    });

    test('a store saturating CPU still sheds — the raise is memory-scoped (#16596)', () => {
        // The third control, and the one most likely to be missed: "a store's resource pressure
        // raises the ceiling" would be wrong. More room for resident data does not relieve compute
        // pressure, so only a MEMORY fact may justify a raise. Memory is held below the store
        // threshold so CPU is the sole saturation present.
        //
        // The expectation is `advisory` rather than `throttle-shed`, and that is a pre-existing
        // property rather than a regression: CPU alone is one authoritative fact, below
        // `minAuthoritativeFacts`, so the fact is recorded without becoming a diagnosis. That makes it
        // a sharper control than a silent `healthy` would be — the evidence IS present and the store
        // branch still declines it. Had the branch keyed on service class rather than on a memory
        // fact, this would have returned `raise-ceiling`.
        const service = createService();

        const decision = service.diagnose({
            serviceKey  : 'chroma',
            statsSamples: [
                statsSample({cpuPercent: 380, memoryPercent: 40}),
                statsSample({cpuPercent: 360, memoryPercent: 42})
            ]
        });

        expect(decision.actionClass).not.toBe(CONTAINER_HEALTH_ACTION_CLASSES.raiseCeiling);
        expect(decision.status).toBe('advisory');
        // The CPU fact was seen — the branch declined on evidence type, not on absence of evidence.
        expect(decision.facts.map(fact => fact.type)).toContain(CONTAINER_HEALTH_FACT_TYPES.resourceSaturation);
    });

    test('store classification is declared data, so a deployment can audit which services it covers (#16596)', () => {
        // Guards against the classification drifting into an inline literal at a call site, where it
        // would be unauditable and could disagree between the threshold and the routing branch.
        expect(STORE_BACKED_SERVICE_KEYS.has('chroma')).toBe(true);
        expect(STORE_BACKED_SERVICE_KEYS.has('model')).toBe(false);
        expect(Object.isFrozen(STORE_BACKED_SERVICE_KEYS)).toBe(true);
    });
});
