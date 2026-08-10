import {test, expect} from '@playwright/test';
import fs             from 'node:fs';
import path           from 'node:path';
import process        from 'node:process';
import Neo            from '../../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../../src/core/_export.mjs';
// The COMMITTED declarative config, imported statically. Tests resolve committed config templates
// rather than the overlay-resolving entrypoint: reading the roster through that entrypoint would let
// a repo-local ignored file decide whether this totality guard passes, so a green here would describe
// one machine instead of the shipped deployment. The roster leaf lives in `configBase.mjs`, which
// this template subclasses.
import aiConfigTemplate from '../../../../../../../ai/config.template.mjs';
import {
    CONTAINER_HEALTH_ACTION_CLASSES,
    CONTAINER_HEALTH_FACT_TYPES,
    ContainerHealthDiagnosisService,
    SERVICE_CLASSES,
    SERVICE_CLASS_BY_KEY,
    classifyServiceKey,
    isStoreBackedService,
    evaluateRestartChurn,
    CPU_SATURATION_SCOPES,
    calculateDockerCpuPercent,
    resolveCpuSaturationScope,
    calculateDockerMemoryPercent,
    calculateHeapSaturationPercent,
    classifyHeapExhaustion
} from '../../../../../../../ai/daemons/orchestrator/services/ContainerHealthDiagnosisService.mjs';

/**
 * A `process-heap-observation` payload as the shipped collector emits it. The defaults are the real
 * shipped configuration — 768 MiB declared under a 1 GiB cgroup reporting an 816 MiB limit — because
 * the whole point of the ratio below is which of those two numbers it divides by, and a fixture where
 * they coincide could not tell the two implementations apart.
 */
function heapObservation({
    oldGenerationUsedBytes = 384 * 1024 * 1024,
    declaredCeilingBytes   = 768 * 1024 * 1024,
    heapSizeLimitBytes     = 816 * 1024 * 1024,
    usedHeapBytes          = 500 * 1024 * 1024,
    ceilingState           = 'declared',
    state                  = 'observed'
} = {}) {
    return {
        state,
        ceilingState,
        declaredCeilingBytes,
        heapSizeLimitBytes,
        usedHeapBytes,
        oldGenerationUsedBytes,
        unavailableReason: state === 'observed' ? null : 'heap-stats-unreadable'
    };
}

const OBSERVED_AT = 1710000000000;
const repoRoot    = path.resolve(process.cwd());

function createService(config = {}) {
    const {
        ollamaHost = 'http://local-model:11434',
        ...diagnosisConfig
    } = config;

    return Neo.create(ContainerHealthDiagnosisService, {
        diagnosisConfig,
        nowFn           : () => OBSERVED_AT,
        ollamaHostReader: () => ollamaHost
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

/**
 * `observedAtMs` is what `rememberStatsSample` stamps in production, and the sustained-window check
 * measures the elapsed span across the window from it. A fixture that omits it asserts a sustained
 * window nothing observed — which is precisely the defect these fixtures used to encode, so it is a
 * required argument in spirit even though it defaults for the single-sample cases.
 */
function statsSample({cpuPercent = 0, memoryPercent = 0, observedAtMs, containerId = null} = {}) {
    const systemDelta = 1_000_000_000,
          cpuDelta    = (cpuPercent / 100) * systemDelta / 4,
          memoryLimit = 1000;

    return {
        ...(Number.isFinite(observedAtMs) ? {observedAtMs} : {}),
        containerId,
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

function ollamaResidency(overrides = {}) {
    return {
        provider       : 'ollama',
        host           : 'http://local-model:11434',
        model          : 'gemma4:26b',
        embeddingModel : 'qwen3-embedding:latest',
        ready          : true,
        requiredModels : ['gemma4:26b', 'qwen3-embedding:latest'],
        availableModels: ['gemma4:26b', 'qwen3-embedding:latest'],
        missingModels  : [],
        targetIdentity : {kind: 'compose-service', id: 'local-model'},
        ...overrides
    };
}

function providerActivity(overrides = {}) {
    return {
        status                    : 'ok',
        observedAt                : OBSERVED_AT,
        sinceMs                   : 24 * 60 * 60 * 1000,
        totalInFlight             : 0,
        totalRecentCompletions    : 0,
        inFlightTruncated         : false,
        recentCompletionsTruncated: false,
        inFlight                  : [],
        recentCompletions         : [],
        ...overrides
    };
}

function sustainedOllamaResidualInputs(overrides = {}) {
    return {
        serviceKey : 'local-model',
        nodeCommand: false,
        inspect    : runningInspect({
            StartedAt: new Date(OBSERVED_AT - 120_000).toISOString()
        }),
        statsSamples: [
            statsSample({cpuPercent: 398, observedAtMs: OBSERVED_AT - 30_000, containerId: 'local-model-A'}),
            statsSample({cpuPercent: 399, observedAtMs: OBSERVED_AT, containerId: 'local-model-A'})
        ],
        runtimeContainerId: 'local-model-A',
        providerResidency : ollamaResidency(),
        providerActivity  : providerActivity(),
        providerResidencyEligible: true,
        ...overrides
    };
}

test.describe('Neo.ai.daemons.services.ContainerHealthDiagnosisService', () => {
    test('normalizes Docker CPU and memory samples', () => {
        const stats = statsSample({cpuPercent: 280, memoryPercent: 75});

        expect(calculateDockerCpuPercent(stats)).toBe(280);
        expect(calculateDockerMemoryPercent(stats)).toBe(75);
    });

    test.describe('calculateHeapSaturationPercent — the V8-scoped numerator (#16630 Slice B)', () => {
        test('divides old-generation usage by the DECLARED ceiling', () => {
            // 384 of 768 MiB declared = 50%. Against the 816 MiB reported limit it would be 47.06%,
            // so this single assertion separates the two candidate denominators.
            expect(calculateHeapSaturationPercent(heapObservation())).toBe(50);
        });

        test('does NOT use heapSizeLimitBytes, however plausible it looks', () => {
            // The trap this AC exists to block: the reported limit is the obvious V8-scoped candidate
            // and sits ABOVE the declaration by 3 x max-semi-space-size — 816 vs 768 at the shipped
            // configuration, a 6.25% overstatement of headroom the process does not have. Moving the
            // implementation to that field yields 47.058..., which this pins out.
            const percent = calculateHeapSaturationPercent(heapObservation({
                oldGenerationUsedBytes: 384 * 1024 * 1024,
                declaredCeilingBytes  : 768 * 1024 * 1024,
                heapSizeLimitBytes    : 816 * 1024 * 1024
            }));

            expect(percent).toBe(50);
            expect(percent).not.toBeCloseTo(47.06, 2);
        });

        test('the numerator is OLD generation, not total used heap', () => {
            // usedHeapBytes folds in the young generation, collected on a different cadence and
            // bounded by a different flag — it would move the ratio for reasons unrelated to the
            // exhaustion this anticipates. 384 old vs 500 used heap: 50% and not 65.1%.
            expect(calculateHeapSaturationPercent(heapObservation({
                oldGenerationUsedBytes: 384 * 1024 * 1024,
                usedHeapBytes         : 500 * 1024 * 1024
            }))).toBe(50);
        });

        test('an UNDECLARED ceiling is null — no substituted bound', () => {
            // The production incident behind this rule: no --max-old-space-size declared, V8 chose a heuristic
            // ~560 MiB inside a 1 GiB container and aborted with ~460 MiB unused. A process with no
            // observable declaration has no denominator, and inventing one would put a number nobody
            // measured inside the evidence a heal decision reads.
            expect(calculateHeapSaturationPercent(heapObservation({
                ceilingState        : 'undeclared',
                declaredCeilingBytes: null
            }))).toBeNull();
        });

        test('an AMBIGUOUS ceiling is null rather than a pick', () => {
            expect(calculateHeapSaturationPercent(heapObservation({
                ceilingState        : 'ambiguous',
                declaredCeilingBytes: null
            }))).toBeNull();
        });

        test('an INCONSISTENT record is refused on ceilingState, not rescued by its bytes', () => {
            // The only case the `ceilingState` gate catches on its own, and it exists because this
            // record crosses a PROCESS boundary: the reader parses a file another container wrote.
            // The shipped collector can never emit this pair — `readDeclaredCeiling` returns null
            // bytes for every non-declared state — but a stale, hand-placed or version-skewed record
            // can carry a leftover finite ceiling beside a non-declared state, and the bridge
            // validates recordType, serviceKey and stamp without checking the payload's internal
            // consistency. Dropping the gate makes this record compute 50% off a ceiling the process
            // did not declare.
            //
            // Written after a mutation FAILED to red: the fixtures above pin `declaredCeilingBytes`
            // to null whenever `ceilingState` is not `declared`, so the finite-number check masked
            // the gate and the suite proved nothing about it.
            expect(calculateHeapSaturationPercent({
                state                 : 'observed',
                ceilingState          : 'ambiguous',
                declaredCeilingBytes  : 768 * 1024 * 1024,
                oldGenerationUsedBytes: 384 * 1024 * 1024,
                heapSizeLimitBytes    : 816 * 1024 * 1024
            })).toBeNull();
        });

        test('an unavailable observation is null, never a zero', () => {
            // A process whose heap could not be read has not reported an empty heap. Coercing an
            // unreadable instrument to 0 manufactures affirmative evidence of headroom out of a
            // broken one.
            const percent = calculateHeapSaturationPercent(heapObservation({
                state                 : 'unavailable',
                oldGenerationUsedBytes: null
            }));

            expect(percent).toBeNull();
            expect(percent).not.toBe(0);
        });

        test('an absent observation is null, not a throw', () => {
            // The live plane emits no observation at all for a service whose reporter is not deployed.
            expect(calculateHeapSaturationPercent(null)).toBeNull();
            expect(calculateHeapSaturationPercent(undefined)).toBeNull();
        });

        test('a zero or negative ceiling cannot produce Infinity', () => {
            expect(calculateHeapSaturationPercent(heapObservation({declaredCeilingBytes: 0}))).toBeNull();
            expect(calculateHeapSaturationPercent(heapObservation({declaredCeilingBytes: -1}))).toBeNull();
        });

        test('a fully exhausted old generation reports 100, not a clamp', () => {
            expect(calculateHeapSaturationPercent(heapObservation({
                oldGenerationUsedBytes: 768 * 1024 * 1024
            }))).toBe(100);
        });
    });

    test('keeps probe-only failures advisory', () => {
        const service = createService();

        const decision = service.diagnose({
            serviceKey   : 'memory',
            nodeCommand  : false,
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
            serviceKey : 'memory',
            nodeCommand: false,
            inspect    : runningInspect({Status: 'exited', ExitCode: 137})
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

    test('heap attribution needs BOTH the fatal line and a Node command', () => {
        const fatal = {text: 'FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory', truncated: false, incarnationBounded: true};

        expect(classifyHeapExhaustion({logs: fatal, nodeCommand: true}).heapExhaustion,
            'the line names a heap and the command proves there was one to exhaust').toBe(true);

        // The scoping red control. A non-Node process cannot exhaust a V8 heap, so a tail carrying
        // the phrase (another container's output, or a service logging the text) must not attribute.
        expect(classifyHeapExhaustion({logs: fatal, nodeCommand: false}).heapExhaustion,
            'a non-Node service has no V8 heap, whatever the tail contains').toBe(false);

        expect(classifyHeapExhaustion({logs: {text: 'ECONNREFUSED, exiting', truncated: false}, nodeCommand: true}).heapExhaustion,
            'a Node service that died of something else is a positive negative').toBe(false);
    });

    test('the declared ceiling licenses WORDING, never the attribution itself', () => {
        const fatal = {text: 'FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory', truncated: false, incarnationBounded: true};

        // The population the originating incident came from: Node, no declared ceiling, dead of a
        // heap. Scoping attribution to the ceiling would blind this to exactly that case.
        expect(classifyHeapExhaustion({logs: fatal, nodeCommand: true, declaredHeapCeilingMb: null}))
            .toMatchObject({heapExhaustion: true, declaredHeapCeilingMb: null});

        expect(classifyHeapExhaustion({logs: fatal, nodeCommand: true, declaredHeapCeilingMb: 768}))
            .toMatchObject({heapExhaustion: true, declaredHeapCeilingMb: 768});
    });

    test('a kernel OOM kill alongside a matching tail is an unresolvable conflict, not a verdict', () => {
        const fatal = {text: 'FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory', truncated: false, incarnationBounded: true};

        // The kernel and V8 make CONTRADICTORY claims about the same death and this payload cannot
        // adjudicate: either V8 exhausted its heap and the container was reaped afterwards, or the
        // cgroup killed a container whose slice still carries an older fatal line.
        expect(classifyHeapExhaustion({logs: fatal, nodeCommand: true, oomKilled: true}))
            .toMatchObject({heapExhaustion: null, unavailableReason: 'evidence-conflict'});

        // No conflict when the kernel did not intervene — the attribution stands.
        expect(classifyHeapExhaustion({logs: fatal, nodeCommand: true, oomKilled: false}).heapExhaustion)
            .toBe(true);

        // And an unobserved oomKilled must not manufacture a conflict.
        expect(classifyHeapExhaustion({logs: fatal, nodeCommand: true}).heapExhaustion).toBe(true);
    });

    test('an unbounded slice refuses to attribute — the tail spans restarts', () => {
        const fatal = 'FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory';

        // Emmy's specimen: an old fatal line, a healthy boot, then an unrelated current crash. A
        // match anywhere in an unbounded slice would name the wrong cause with full confidence.
        const stale = {
            text     : `${fatal}\n[restart] healthy boot\nTypeError: unrelated current crash`,
            truncated: false
        };

        expect(classifyHeapExhaustion({logs: stale, nodeCommand: true}))
            .toMatchObject({heapExhaustion: null, unavailableReason: 'log-incarnation-unbounded'});

        // Absent the producer's bound, even a clean single-line slice must refuse — the classifier
        // cannot tell a current death from a historical one without being told.
        expect(classifyHeapExhaustion({logs: {text: fatal, truncated: false}, nodeCommand: true}).unavailableReason)
            .toBe('log-incarnation-unbounded');

        // With the bound stated, the same evidence attributes.
        expect(classifyHeapExhaustion({
            logs       : {text: fatal, truncated: false, incarnationBounded: true},
            nodeCommand: true
        }).heapExhaustion).toBe(true);
    });

    test('unavailable is null WITH a reason — a disabled channel is not a negative', () => {
        expect(classifyHeapExhaustion({logs: null, nodeCommand: true}))
            .toMatchObject({heapExhaustion: null, unavailableReason: 'logs-unavailable'});

        expect(classifyHeapExhaustion({logs: {text: 'x', truncated: false}, nodeCommand: null}))
            .toMatchObject({heapExhaustion: null, unavailableReason: 'command-unreadable'});

        // A truncated tail that does not match cannot separate "no heap death" from "the line fell
        // outside the window" — but truncation cannot manufacture the line, so a match still counts.
        expect(classifyHeapExhaustion({logs: {text: 'nothing here', truncated: true}, nodeCommand: true}))
            .toMatchObject({heapExhaustion: null, unavailableReason: 'log-tail-truncated'});

        // Truncation cannot manufacture the line, so a matching truncated tail stays conclusive
        // ABOUT TRUNCATION — but it still needs the incarnation bound, because a surviving line can
        // belong to an earlier run. Both conditions, not either.
        expect(classifyHeapExhaustion({
            logs       : {text: 'FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory', truncated: true, incarnationBounded: true},
            nodeCommand: true
        }).heapExhaustion, 'a truncated but incarnation-bounded match is conclusive').toBe(true);

        expect(classifyHeapExhaustion({
            logs       : {text: 'FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory', truncated: true},
            nodeCommand: true
        }).unavailableReason, 'truncation-conclusiveness does not substitute for the incarnation bound')
            .toBe('log-incarnation-unbounded');
    });

    test('the crash diagnosis names the heap exhaustion without changing the action', () => {
        const service = createService();

        const decision = service.diagnose({
            serviceKey           : 'memory',
            nodeCommand          : false,
            inspect              : runningInspect({Status: 'exited', ExitCode: 139, OOMKilled: false}),
            logs                 : {text: 'FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory', truncated: false, incarnationBounded: true},
            nodeCommand          : true,
            declaredHeapCeilingMb: 768
        });

        // The action was never wrong — a stopped container is restarted either way. The cause is
        // what was missing, and a restart that never implicates the ceiling repeats forever.
        expect(decision.actionClass, 'attribution must not change the heal')
            .toBe(CONTAINER_HEALTH_ACTION_CLASSES.restart);

        expect(decision.diagnosis.details.classificationReason)
            .toBe('lifecycle-crash-heap-exhaustion-declared-ceiling');

        const downFact = decision.facts.find(fact =>
            fact.type === CONTAINER_HEALTH_FACT_TYPES.containerDown);

        expect(downFact.details, 'raw evidence and attribution travel together').toMatchObject({
            declaredHeapCeilingMb: 768,
            exitCode             : 139,
            heapExhaustion       : true,
            oomKilled            : false
        });
    });

    test('an undeclared Node service still attributes, without claiming a ceiling it never had', () => {
        const service = createService();

        const decision = service.diagnose({
            serviceKey : 'memory',
            nodeCommand: false,
            inspect    : runningInspect({Status: 'exited', ExitCode: 139, OOMKilled: false}),
            logs       : {text: 'FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory', truncated: false, incarnationBounded: true},
            nodeCommand: true
        });

        expect(decision.diagnosis.details.classificationReason).toBe('lifecycle-crash-heap-exhaustion');
    });

    test('a non-heap death keeps the generic crash reason', () => {
        const service = createService();

        const decision = service.diagnose({
            serviceKey : 'memory',
            nodeCommand: false,
            inspect    : runningInspect({Status: 'exited', ExitCode: 137, OOMKilled: true}),
            logs       : {text: 'terminated', truncated: false},
            nodeCommand: true
        });

        // The narrowing must discriminate rather than decorate.
        expect(decision.diagnosis.details.classificationReason).toBe('lifecycle-crash');
        expect(decision.actionClass).toBe(CONTAINER_HEALTH_ACTION_CLASSES.restart);
    });

    /**
     * The ADR-0025 §2.4 pair, stated as a test rather than as a comment: a `container-unhealthy` state // ticket-ref-ok: the ADR clause is the contract this test encodes
     * is authoritative ONLY alongside a failed DIRECT endpoint probe. All three arms below are needed,
     * because an earlier revision of this suite kept only the last one and stayed green over the
     * unsafe reading.
     *
     * The middle arm is the one that matters, and it is a regression control with a name. An earlier
     * revision let a lone authoritative `unhealthy` fact classify to `restart`, on the argument that
     * the runtime's verdict is already debounced by `retries x interval`. Debouncing answers NOISE and
     * cannot answer CONTRADICTION: repeated evaluations of one probe are still one evidence channel,
     * and that channel can be measuring the wrong thing. ADR-0025 §2.1 names the live case — a // ticket-ref-ok: the ADR clause is the empirical anchor for this control
     * provider-dependent canary false-fails while the service answers and persists — so restarting on
     * it is a self-inflicted outage.
     */
    test('ADR-0025 pair: unhealthy + FAILED direct probe restarts; unhealthy + ANSWERING probe does not', () => {
        const service = createService();

        // `starting` is severity:'warning', authoritative:false — the ordinary boot window never actions.
        const advisory = service.diagnose({
            serviceKey : 'knowledge',
            nodeCommand: false,
            inspect    : runningInspect({Health: {Status: 'starting'}})
        });

        expect(advisory.status).toBe('advisory');
        expect(advisory.diagnosis).toBeNull();

        // THE SAFETY CONTROL. A service ANSWERING while the runtime reports unhealthy must not be
        // restarted — and the absent-probe case must not either, since one channel is one channel
        // whether it is contradicted or merely uncorroborated.
        for (const endpointProbe of [{ok: true, name: 'healthcheck'}, null]) {
            const answering = service.diagnose({
                serviceKey: 'knowledge',
                inspect   : runningInspect({Health: {Status: 'unhealthy'}}),
                endpointProbe
            });

            expect(answering.status).toBe('advisory');
            expect(answering.actionClass).toBeNull();
            expect(answering.diagnosis).toBeNull();
        }

        // The sanctioned pair. This has always worked; it was unreachable in production only because
        // nothing supplied `endpointProbe`, which is a missing PRODUCER rather than a strict floor.
        const diagnosed = service.diagnose({
            serviceKey   : 'knowledge',
            nodeCommand  : false,
            inspect      : runningInspect({Health: {Status: 'unhealthy'}}),
            endpointProbe: {ok: false, name: 'healthcheck'}
        });

        expect(diagnosed.status).toBe('diagnosed');
        expect(diagnosed.actionClass).toBe(CONTAINER_HEALTH_ACTION_CLASSES.restart);
        expect(diagnosed.diagnosis.recoveryClass).toBe('crash');
        expect(diagnosed.diagnosis.details.classificationReason).toBe('lifecycle-crash');
        expect(diagnosed.diagnosis.evidenceFacts.map(fact => fact.type)).toEqual([
            CONTAINER_HEALTH_FACT_TYPES.containerUnhealthy,
            CONTAINER_HEALTH_FACT_TYPES.endpointProbeFailed
        ]);
    });

    test('keeps single-sample resource spikes advisory', () => {
        const service = createService({cpuSaturationPercent: 90, memorySaturationPercent: 80});

        const decision = service.diagnose({
            serviceKey : 'model',
            nodeCommand: false,
            stats      : statsSample({cpuPercent: 380, memoryPercent: 85})
        });

        expect(decision.status).toBe('healthy');
        expect(decision.diagnosis).toBeNull();
        expect(decision.facts).toHaveLength(0);
    });

    test('classifies sustained resource saturation as throttle-shed exhaustion with bounded evidence', () => {
        const service = createService({cpuSaturationPercent: 90, memorySaturationPercent: 80});

        const decision = service.diagnose({
            serviceKey  : 'model',
            nodeCommand : false,
            statsSamples: [
                statsSample({cpuPercent: 380, memoryPercent: 85, observedAtMs: 1_000_000}),
                statsSample({cpuPercent: 360, memoryPercent: 82, observedAtMs: 1_030_000})
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
            nodeCommand          : false,
            ollamaEvalAttribution: evalAttribution
        });

        expect(advisory.status).toBe('advisory');
        expect(advisory.diagnosis).toBeNull();

        const diagnosed = service.diagnose({
            serviceKey  : 'model',
            nodeCommand : false,
            statsSamples: [
                statsSample({cpuPercent: 390, observedAtMs: 1_000_000}),
                statsSample({cpuPercent: 390, observedAtMs: 1_030_000})
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

    test('restarts only sustained unexplained local-model CPU with passive resident role evidence', () => {
        const service  = createService(),
              decision = service.diagnose(sustainedOllamaResidualInputs());

        expect(decision.status).toBe('diagnosed');
        expect(decision.actionClass).toBe(CONTAINER_HEALTH_ACTION_CLASSES.restart);
        expect(decision.targetIdentity).toEqual({kind: 'compose-service', id: 'local-model'});
        expect(decision.diagnosis).toMatchObject({
            recoveryClass: 'exhaustion',
            details      : {
                classificationReason: 'ollama-residual-load-restart'
            }
        });
        expect(decision.diagnosis.evidenceFacts.map(fact => fact.type)).toEqual([
            CONTAINER_HEALTH_FACT_TYPES.ollamaResidualLoad,
            CONTAINER_HEALTH_FACT_TYPES.resourceSaturation
        ]);
        expect(decision.diagnosis.evidenceFacts[0]).toMatchObject({
            authoritative: true,
            details      : {
                reasonCode     : 'sustained-unexplained-ollama-load',
                subjectIdentity: {kind: 'compose-service', id: 'local-model'},
                roles          : [
                    {role: 'chat', model: 'gemma4:26b', resident: true},
                    {role: 'embedding', model: 'qwen3-embedding:latest', resident: true}
                ]
            }
        });
    });

    test('derives the residual-load target and port from configured provider identity', () => {
        const service = createService({
                  ollamaHost: 'http://model:12000'
              }),
              decision = service.diagnose(sustainedOllamaResidualInputs({
                  serviceKey: 'model',
                  statsSamples: [
                      statsSample({cpuPercent: 398, observedAtMs: OBSERVED_AT - 30_000, containerId: 'model-A'}),
                      statsSample({cpuPercent: 399, observedAtMs: OBSERVED_AT, containerId: 'model-A'})
                  ],
                  runtimeContainerId: 'model-A',
                  providerResidency : ollamaResidency({
                      host          : 'http://model:12000',
                      targetIdentity: {kind: 'compose-service', id: 'model'}
                  })
              }));

        expect(decision.actionClass).toBe(CONTAINER_HEALTH_ACTION_CLASSES.restart);
        expect(decision.targetIdentity).toEqual({kind: 'compose-service', id: 'model'});
    });

    test('refuses a configured provider endpoint owned by a different Compose service', () => {
        const service = createService({
                  ollamaHost: 'http://local-model:12000'
              }),
              decision = service.diagnose(sustainedOllamaResidualInputs({
                  serviceKey: 'model',
                  statsSamples: [
                      statsSample({cpuPercent: 398, observedAtMs: OBSERVED_AT - 30_000, containerId: 'model-A'}),
                      statsSample({cpuPercent: 399, observedAtMs: OBSERVED_AT, containerId: 'model-A'})
                  ],
                  runtimeContainerId: 'model-A',
                  providerResidency : ollamaResidency({
                      host          : 'http://local-model:12000',
                      targetIdentity: {kind: 'compose-service', id: 'model'}
                  })
              }));

        expect(decision.actionClass).toBeNull();
        expect(decision.facts).toContainEqual(expect.objectContaining({
            type   : CONTAINER_HEALTH_FACT_TYPES.ollamaResidualLoad,
            details: expect.objectContaining({reasonCode: 'provider-endpoint-target-mismatch'})
        }));
    });

    test('publishes why a saturated service is outside the configured provider roster', () => {
        const service = createService({
                  ollamaHost: 'http://shadow-model:12000'
              }),
              decision = service.diagnose(sustainedOllamaResidualInputs({
                  serviceKey: 'shadow-model',
                  statsSamples: [
                      statsSample({cpuPercent: 398, observedAtMs: OBSERVED_AT - 30_000, containerId: 'shadow-A'}),
                      statsSample({cpuPercent: 399, observedAtMs: OBSERVED_AT, containerId: 'shadow-A'})
                  ],
                  runtimeContainerId: 'shadow-A',
                  providerResidencyEligible: false,
                  providerResidency : ollamaResidency({
                      host          : 'http://shadow-model:12000',
                      targetIdentity: {kind: 'compose-service', id: 'shadow-model'}
                  })
              }));

        expect(decision.actionClass).toBeNull();
        expect(decision.status).toBe('advisory');
        expect(decision.facts).toContainEqual(expect.objectContaining({
            type   : CONTAINER_HEALTH_FACT_TYPES.ollamaResidualLoad,
            details: expect.objectContaining({reasonCode: 'provider-residency-service-not-configured'})
        }));
    });

    for (const [name, overrides, reasonCode] of [
        ['live native-Ollama demand', {
            providerActivity: providerActivity({
                totalInFlight: 1,
                inFlight     : [{
                    activityId    : 'active-embedding',
                    service       : 'knowledge-base',
                    operationStage: 'kb-tenant-ingestion-embedding',
                    role          : 'embedding',
                    provider      : 'ollama',
                    model         : 'qwen3-embedding:latest',
                    elapsedMs     : 180_000
                }]
            })
        }, 'provider-demand-in-flight'],
        ['partial recorder telemetry', {
            providerActivity: providerActivity({status: 'partial'})
        }, 'provider-activity-unavailable'],
        ['stale recorder telemetry', {
            providerActivity: providerActivity({observedAt: OBSERVED_AT - 30_001})
        }, 'provider-activity-stale'],
        ['identity-mismatched residency', {
            providerResidency: ollamaResidency({targetIdentity: {kind: 'compose-service', id: 'other-model'}})
        }, 'subject-identity-mismatch'],
        ['external Ollama provider endpoint', {
            providerResidency: ollamaResidency({host: 'http://external-provider:11434'})
        }, 'provider-endpoint-target-mismatch'],
        ['cross-incarnation CPU samples', {
            statsSamples: [
                statsSample({cpuPercent: 398, observedAtMs: OBSERVED_AT - 30_000, containerId: 'local-model-A'}),
                statsSample({cpuPercent: 399, observedAtMs: OBSERVED_AT, containerId: 'local-model-B'})
            ],
            runtimeContainerId: 'local-model-B'
        }, 'stats-incarnation-unbounded'],
        ['cold-start model service', {
            inspect: runningInspect({StartedAt: new Date(OBSERVED_AT - 10_000).toISOString()})
        }, 'container-cold-start'],
        ['recently settled native-Ollama demand', {
            providerActivity: providerActivity({
                totalRecentCompletions: 1,
                recentCompletions     : [{
                    activityId : 'just-finished',
                    provider   : 'ollama',
                    role       : 'embedding',
                    model      : 'qwen3-embedding:latest',
                    completedAt: new Date(OBSERVED_AT - 1_000).toISOString()
                }]
            })
        }, 'provider-demand-recently-settled'],
        ['truncated live-demand projection', {
            providerActivity: providerActivity({
                totalInFlight    : 51,
                inFlightTruncated: true
            })
        }, 'provider-activity-in-flight-unbounded'],
        ['mismatched live-demand count', {
            providerActivity: providerActivity({totalInFlight: 1})
        }, 'provider-activity-in-flight-unbounded'],
        ['mismatched recent-demand count', {
            providerActivity: providerActivity({totalRecentCompletions: 1})
        }, 'provider-activity-recent-unbounded']
    ]) {
        test(`does not restart sustained CPU with ${name}`, () => {
            const service  = createService(),
                  decision = service.diagnose(sustainedOllamaResidualInputs(overrides));

            expect(decision.actionClass).toBeNull();
            expect(decision.diagnosis).toBeNull();
            expect(decision.status).toBe('advisory');
            expect(decision.facts.find(fact => fact.type === CONTAINER_HEALTH_FACT_TYPES.ollamaResidualLoad)).toMatchObject({
                authoritative: false,
                details      : {reasonCode}
            });
        });
    }

    test('accepts truncated completion history only when every hidden row predates the CPU window', () => {
        const oldCompletions = Array.from({length: 50}, (_, index) => ({
            activityId : `old-${index}`,
            provider   : 'gemini',
            completedAt: new Date(OBSERVED_AT - 30_001 - index).toISOString()
        }));

        const service  = createService(),
              decision = service.diagnose(sustainedOllamaResidualInputs({
                  providerActivity: providerActivity({
                      totalRecentCompletions    : 51,
                      recentCompletionsTruncated: true,
                      recentCompletions         : oldCompletions
                  })
              }));

        expect(decision.actionClass).toBe(CONTAINER_HEALTH_ACTION_CLASSES.restart);
    });

    test('refuses truncated completion history tied at the inclusive CPU cutoff', () => {
        const tiedCompletions = Array.from({length: 50}, (_, index) => ({
            activityId : `tied-${index}`,
            provider   : 'gemini',
            completedAt: new Date(OBSERVED_AT - 30_000).toISOString()
        }));

        const service  = createService(),
              decision = service.diagnose(sustainedOllamaResidualInputs({
                  providerActivity: providerActivity({
                      totalRecentCompletions    : 51,
                      recentCompletionsTruncated: true,
                      recentCompletions         : tiedCompletions
                  })
              }));

        expect(decision.actionClass).toBeNull();
        expect(decision.facts.find(fact => fact.type === CONTAINER_HEALTH_FACT_TYPES.ollamaResidualLoad))
            .toMatchObject({details: {reasonCode: 'provider-activity-recent-unbounded'}});
    });

    test('keeps one high-CPU sample and an idle resident model non-actionable', () => {
        const service   = createService(),
              oneSample = service.diagnose(sustainedOllamaResidualInputs({
                  statsSamples: [statsSample({cpuPercent: 399, observedAtMs: OBSERVED_AT})]
              })),
              idle = service.diagnose(sustainedOllamaResidualInputs({
                  statsSamples: [
                      statsSample({cpuPercent: 0, observedAtMs: OBSERVED_AT - 30_000}),
                      statsSample({cpuPercent: 0, observedAtMs: OBSERVED_AT})
                  ]
              }));

        expect(oneSample.actionClass).toBeNull();
        expect(oneSample.diagnosis).toBeNull();
        expect(idle.actionClass).toBeNull();
        expect(idle.diagnosis).toBeNull();
    });

    test('routes missing provider role models to warm-provider before config-drift escalation', () => {
        const service = createService();

        const decision = service.diagnose({
            serviceKey       : 'model',
            nodeCommand      : false,
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
            nodeCommand      : false,
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
            nodeCommand      : false,
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
            nodeCommand      : false,
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
            nodeCommand: false,
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
            serviceKey : 'memory',
            nodeCommand: false,
            runtimeAccessService
        });

        expect(calls.map(call => call.operation)).toEqual(['inspect', 'stats']);
        expect(decision.diagnosis.recoveryClass).toBe('crash');

        const failed = await service.collectAndDiagnose({
            serviceKey          : 'memory',
            nodeCommand         : false,
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
            nodeCommand  : false,
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
            nodeCommand  : false,
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
            nodeCommand      : false,
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
            nodeCommand  : false,
            inspect      : inspect('c1', 0),
            churnBaseline: {containerId: 'c1', observedAt: OBSERVED_AT, restartCount: 0},
            observedAt   : OBSERVED_AT + 60000
        });

        expect(decision.facts.some(f => f.type === CONTAINER_HEALTH_FACT_TYPES.restartChurn)).toBe(false);
        expect(decision.status).toBe('healthy');
    });

    test('the decision carries the next baseline so the caller can persist it', () => {
        const decision = createService().diagnose({
            serviceKey : 'orchestrator',
            nodeCommand: false,
            inspect    : inspect('c1', 3),
            observedAt : OBSERVED_AT
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
            nodeCommand : false,
            statsSamples: [
                statsSample({cpuPercent: 5, memoryPercent: 85, observedAtMs: 1_000_000}),
                statsSample({cpuPercent: 6, memoryPercent: 83, observedAtMs: 1_030_000})
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
            nodeCommand : false,
            statsSamples: [
                statsSample({cpuPercent: 5, memoryPercent: 85, observedAtMs: 1_000_000}),
                statsSample({cpuPercent: 6, memoryPercent: 83, observedAtMs: 1_030_000})
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
            nodeCommand : false,
            statsSamples: [
                statsSample({cpuPercent: 380, memoryPercent: 96, observedAtMs: 1_000_000}),
                statsSample({cpuPercent: 360, memoryPercent: 94, observedAtMs: 1_030_000})
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
            nodeCommand : false,
            statsSamples: [
                statsSample({cpuPercent: 380, memoryPercent: 40, observedAtMs: 1_000_000}),
                statsSample({cpuPercent: 360, memoryPercent: 42, observedAtMs: 1_030_000})
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
        // Real roster keys. The previous version asserted `.has('model') === false`, and `'model'`
        // is not a production service key at all — `local-model` is — so that control could not
        // fail and proved nothing.
        expect(isStoreBackedService('chroma')).toBe(true);
        expect(isStoreBackedService('local-model')).toBe(false);
        expect(isStoreBackedService('kb-server')).toBe(false);
    });
});

/**
 * The sustained window is now MEASURED from per-sample observation times, not counted. These are the
 * controls that make that claim discriminating rather than decorative: before the change, every case
 * below produced a `sustained` window and an emitted fact asserting a 30-second span nothing had
 * observed.
 *
 * This matters specifically because single-fact sufficiency for a store's memory saturation is
 * justified by the window supplying the corroboration a second fact would otherwise provide. If two
 * back-to-back samples can earn it, that justification is unbacked.
 */
test.describe('sustained window is measured, not asserted', () => {
    const saturated = observedAtMs => statsSample({cpuPercent: 380, memoryPercent: 95, observedAtMs});

    test('BACK-TO-BACK samples do NOT qualify, even at full saturation', () => {
        const service  = createService({cpuSaturationPercent: 90, storeMemorySaturationPercent: 80});
        const decision = service.diagnose({
            serviceKey  : 'chroma',
            nodeCommand : false,
            statsSamples: [saturated(1_000_000), saturated(1_000_010)]   // 10ms apart
        });

        expect(decision.status).toBe('healthy');
        expect(decision.diagnosis).toBeNull();
        expect(decision.facts).toHaveLength(0);
    });

    test('IDENTICAL timestamps do NOT qualify — a duplicated sample is one observation', () => {
        const service  = createService({cpuSaturationPercent: 90, storeMemorySaturationPercent: 80});
        const decision = service.diagnose({
            serviceKey  : 'chroma',
            nodeCommand : false,
            statsSamples: [saturated(1_000_000), saturated(1_000_000)]
        });

        expect(decision.status).toBe('healthy');
    });

    test('UNSTAMPED samples do NOT qualify — fails closed rather than inheriting a window', () => {
        // The pre-change fixture shape. It must not earn an exemption it cannot demonstrate.
        const service  = createService({cpuSaturationPercent: 90, storeMemorySaturationPercent: 80});
        const decision = service.diagnose({
            serviceKey  : 'chroma',
            nodeCommand : false,
            statsSamples: [
                statsSample({cpuPercent: 380, memoryPercent: 95}),
                statsSample({cpuPercent: 370, memoryPercent: 93})
            ]
        });

        expect(decision.status).toBe('healthy');
    });

    test('a span just SHORT of the requirement does not qualify', () => {
        const service  = createService({cpuSaturationPercent: 90, storeMemorySaturationPercent: 80, sampleWindowMs: 30000});
        const decision = service.diagnose({
            serviceKey  : 'chroma',
            nodeCommand : false,
            statsSamples: [saturated(1_000_000), saturated(1_029_999)]   // 29.999s
        });

        expect(decision.status).toBe('healthy');
    });

    test('an UNDECLARED service key is recorded as a guess, not silently classified', async () => {
        // `validateServiceKey` accepts any safe string, so the key space is unbounded. An unrostered
        // key still defaults to transient — refusing would break unrecognised deployments — but the
        // emitted evidence must say the classification was not declared.
        const service  = createService({cpuSaturationPercent: 90, memorySaturationPercent: 80, sampleWindowMs: 30000});
        const decision = service.diagnose({
            serviceKey  : 'some-unrostered-service',
            nodeCommand : false,
            statsSamples: [saturated(1_000_000), saturated(1_045_000)]
        });

        const memoryFact = decision.diagnosis.evidenceFacts
            .find(fact => fact.type === CONTAINER_HEALTH_FACT_TYPES.memorySaturation);

        expect(memoryFact.details).toMatchObject({
            serviceClass        : SERVICE_CLASSES.transient,
            serviceClassDeclared: false
        });
    });

    test.describe('memory-saturation scope — a Node service is measured against its own heap', () => {
        /**
         * A stats sample at 95% CONTAINER memory carrying a heap envelope.
         *
         * `observedAtMs` is the DOCKER poll time; `subjectObservedAt` is when the process actually
         * measured itself. Keeping them separate is the whole point of these fixtures: the earlier
         * revision conflated them, so the window could be measured from the observer's clock while
         * the subject's report stood still. `pairable` is modelled because the bridge publishes
         * `status: 'available'` with `pairable: false` — read-recent but not eligible for arithmetic.
         */
        function nodeSample({
            observedAtMs,
            heapPercent = null,
            unavailableReason = null,
            subjectObservedAt = observedAtMs,
            pairable = true
        }) {
            const sample = statsSample({memoryPercent: 95, observedAtMs});

            sample.heapObservation = {
                status     : heapPercent === null ? 'unavailable' : 'available',
                unavailableReason,
                pairable,
                observation: heapPercent === null ? null : {
                    observedAt            : subjectObservedAt,
                    state                 : 'observed',
                    ceilingState          : 'declared',
                    declaredCeilingBytes  : 768 * 1024 * 1024,
                    heapSizeLimitBytes    : 816 * 1024 * 1024,
                    oldGenerationUsedBytes: Math.round(768 * 1024 * 1024 * (heapPercent / 100))
                }
            };

            return sample;
        }

        /**
         * Exercises `collectStatsFacts` directly rather than through `diagnose()`. The diagnosis
         * layer gates on `minAuthoritativeFacts: 2`, so routing through it would make every
         * assertion below depend on a CPU fact firing alongside — coupling the scope question to an
         * unrelated threshold, and letting a scope regression hide behind a missing second fact.
         */
        function memorySaturationFact(service, serviceKey, statsSamples, nodeCommand = null) {
            return service
                .collectStatsFacts({serviceKey, stats: null, statsSamples, observedAt: OBSERVED_AT, nodeCommand})
                .find(fact => fact.type === CONTAINER_HEALTH_FACT_TYPES.memorySaturation);
        }

        test('the fact reports the HEAP percent, not the container percent', () => {
            // Both are present in the same samples and they disagree: 95% container, 91% heap. Only
            // one of them is the ratio the process dies on.
            const service    = createService({memorySaturationPercent: 80, sampleWindowMs: 30000});
            const memoryFact = memorySaturationFact(service, 'memory', [
                nodeSample({observedAtMs: 1_000_000, heapPercent: 91}),
                nodeSample({observedAtMs: 1_045_000, heapPercent: 91})
            ]);

            expect(memoryFact.details.memoryScope).toBe('heap');
            expect(memoryFact.details.meanPercent).toBeCloseTo(91, 0);
            expect(memoryFact.details.meanPercent).not.toBeCloseTo(95, 0);
        });

        test('a Node service with NO usable heap reading emits NO fact — fail closed', () => {
            // The criterion of the whole slice. These samples sit at 95% container against an 80%
            // threshold, so the OLD implementation emits a critical memory-saturation fact here.
            // Falling back to that ratio when the heap channel is down would reinstate the
            // cross-scope pair precisely when the number is least trustworthy.
            const service = createService({memorySaturationPercent: 80, sampleWindowMs: 30000});
            expect(memorySaturationFact(service, 'memory', [
                nodeSample({observedAtMs: 1_000_000, unavailableReason: 'stale'}),
                nodeSample({observedAtMs: 1_045_000, unavailableReason: 'stale'})
            ])).toBeUndefined();
        });

        test('the unmeasured axis is ANNOUNCED — absence must not publish as healthy', () => {
            // Caught by @neo-opus-grace on the surface-overlap ping, and it is the more dangerous
            // half: `diagnose()` publishes `status: facts.length > 0 ? 'advisory' : 'healthy'`, so
            // failing closed on the numerator would have made a Node service with no heap reading
            // report GREEN on exactly the axis that stopped being measured. Fail-closed on the
            // metric, fail-OPEN on the envelope.
            const service  = createService({memorySaturationPercent: 80, sampleWindowMs: 30000});
            const decision = service.diagnose({
                serviceKey  : 'memory',
                inspect     : runningInspect(),
                statsSamples: [
                    nodeSample({observedAtMs: 1_000_000, unavailableReason: 'stale'}),
                    nodeSample({observedAtMs: 1_045_000, unavailableReason: 'stale'})
                ]
            });

            expect(decision.status).not.toBe('healthy');
            expect(decision.status).toBe('advisory');

            const fact = decision.facts
                .find(entry => entry.type === CONTAINER_HEALTH_FACT_TYPES.heapObservationUnavailable);

            expect(fact.details.unavailableReason).toBe('stale');
            // Non-authoritative by construction: it must not reach minAuthoritativeFacts, license an
            // action, or claim anything about the heap itself. It reports an absent MEASUREMENT.
            expect(fact.authoritative).toBe(false);
            expect(fact.severity).toBe('warning');
        });

        test('a service whose reporter never deployed says so by name', () => {
            // The live case today: the merged reader emits no key AT ALL for a service running an
            // older revision. "We never heard from it" and "it told us it could not measure" are
            // different repairs, so they must not collapse into one reason.
            //
            // The fixture originally supplied an envelope here, which contradicted the test's own
            // name — an envelope means the bridge DID publish. A never-deployed reporter is the
            // no-envelope case, and `nodeCommand` is what still identifies the service as Node.
            const service = createService({memorySaturationPercent: 80, sampleWindowMs: 30000});
            const facts   = service.collectStatsFacts({
                serviceKey  : 'memory',
                nodeCommand : true,
                stats       : null,
                statsSamples: [
                    statsSample({memoryPercent: 95, observedAtMs: 1_000_000}),
                    statsSample({memoryPercent: 95, observedAtMs: 1_045_000})
                ],
                observedAt  : OBSERVED_AT
            });

            expect(facts.find(fact => fact.type === CONTAINER_HEALTH_FACT_TYPES.heapObservationUnavailable)
                .details.unavailableReason).toBe('not-deployed');
        });

        // ---- Window provenance (@neo-gpt, PR review RA-1/RA-2). -----------------------------------
        // The window must be measured from the SUBJECT's own observation times, not from the Docker
        // polls that happened to read them, and every arm short of full pairable coverage must stay
        // advisory rather than reaching either `healthy` or the container ratio.

        test('a DEAD reporter cannot manufacture a sustained window by being read twice', () => {
            // The severe case. One stale record, re-read at two Docker polls 45s apart, produced two
            // identical 91% values and a claimed 45-SECOND sustained heap window — an authoritative
            // critical fact synthesised entirely from the observer's clock while the subject stood
            // still. This is precisely the failure the channel was built to avoid: a sick process
            // does not report a bad number, it stops reporting.
            const service = createService({memorySaturationPercent: 80, sampleWindowMs: 30000});

            expect(memorySaturationFact(service, 'memory', [
                nodeSample({observedAtMs: 1_000_000, heapPercent: 91, subjectObservedAt: 999_000}),
                nodeSample({observedAtMs: 1_045_000, heapPercent: 91, subjectObservedAt: 999_000})
            ])).toBeUndefined();
        });

        test('an UNPAIRABLE reading is not evidence, however recent the read was', () => {
            // `readHeapObservation` publishes `status: 'available'` with `pairable: false` when the
            // report is too far from the container sample to enter a ratio with it. Read recency and
            // arithmetic eligibility are different properties, and only the envelope knows.
            const service = createService({memorySaturationPercent: 80, sampleWindowMs: 30000});

            expect(memorySaturationFact(service, 'memory', [
                nodeSample({observedAtMs: 1_000_000, heapPercent: 91, subjectObservedAt: 1_000_000, pairable: false}),
                nodeSample({observedAtMs: 1_045_000, heapPercent: 91, subjectObservedAt: 1_045_000, pairable: false})
            ])).toBeUndefined();
        });

        test('a MIXED window is announced, not silently dropped into healthy', () => {
            // One usable envelope plus one unavailable selected `heap` scope, then failed the count
            // floor and emitted NEITHER fact — so the decision read `healthy`. That is the same
            // fail-open Grace caught, surviving in the arm her fix did not cover.
            const service  = createService({memorySaturationPercent: 80, sampleWindowMs: 30000});
            const decision = service.diagnose({
                serviceKey  : 'memory',
                inspect     : runningInspect(),
                nodeCommand : true,
                statsSamples: [
                    nodeSample({observedAtMs: 1_000_000, heapPercent: 91, subjectObservedAt: 1_000_000}),
                    nodeSample({observedAtMs: 1_045_000, unavailableReason: 'stale'})
                ]
            });

            expect(decision.status).toBe('advisory');
            expect(decision.facts.find(fact => fact.type === CONTAINER_HEALTH_FACT_TYPES.memorySaturation)).toBeUndefined();
            expect(decision.facts.find(fact => fact.type === CONTAINER_HEALTH_FACT_TYPES.heapObservationUnavailable)).toBeDefined();
        });

        test('a Node service with NO envelope must not fall back to the container ratio', () => {
            // Absence of an envelope is evidence of nothing — which is what the code comment claimed
            // while the branch treated it as sufficient evidence for container scope. `nodeCommand`
            // is the source-owned discriminator and it says this IS Node, so the cross-scope ratio
            // this slice removes must not be emitted.
            const service = createService({memorySaturationPercent: 80, sampleWindowMs: 30000});
            const facts   = service.collectStatsFacts({
                serviceKey  : 'memory',
                stats       : null,
                nodeCommand : true,
                statsSamples: [
                    statsSample({memoryPercent: 95, observedAtMs: 1_000_000}),
                    statsSample({memoryPercent: 95, observedAtMs: 1_045_000})
                ],
                observedAt  : OBSERVED_AT
            });

            expect(facts.find(fact => fact.type === CONTAINER_HEALTH_FACT_TYPES.memorySaturation)).toBeUndefined();
            expect(facts.find(fact => fact.type === CONTAINER_HEALTH_FACT_TYPES.heapObservationUnavailable)).toBeDefined();
        });

        test('an UNKNOWN service (nodeCommand null, no envelope) also fails closed', () => {
            // Neither signal classifies it. Emitting a cross-scope ratio here would be a guess with
            // a number attached.
            const service = createService({memorySaturationPercent: 80, sampleWindowMs: 30000});
            const facts   = service.collectStatsFacts({
                serviceKey  : 'some-unrostered-service',
                stats       : null,
                nodeCommand : null,
                statsSamples: [
                    statsSample({memoryPercent: 95, observedAtMs: 1_000_000}),
                    statsSample({memoryPercent: 95, observedAtMs: 1_045_000})
                ],
                observedAt  : OBSERVED_AT
            });

            expect(facts.find(fact => fact.type === CONTAINER_HEALTH_FACT_TYPES.memorySaturation)).toBeUndefined();
        });

        test('an UNKNOWN identity cannot manufacture container authority through the envelope', () => {
            // The production shape my earlier unknown-service test missed by bypassing the bridge.
            // `readHeapObservation` gates on `nodeCommand !== true`, so an UNREADABLE inspect refused
            // with the same `not-node` word as a genuine non-Node service. Consuming that refusal as
            // authority produced an authoritative container-scoped memory-saturation — and alongside
            // a CPU fact it reached `diagnosed → throttle-shed` while inspect was unreadable.
            //
            // A refusal is not a classification. Only the direct `Config.Cmd` reading is.
            const service = createService({memorySaturationPercent: 80, sampleWindowMs: 30000});
            const facts   = service.collectStatsFacts({
                serviceKey  : 'memory',
                nodeCommand : null,
                stats       : null,
                statsSamples: [
                    nodeSample({observedAtMs: 1_000_000, unavailableReason: 'not-node'}),
                    nodeSample({observedAtMs: 1_045_000, unavailableReason: 'not-node'})
                ],
                observedAt  : OBSERVED_AT
            });

            expect(facts.find(fact => fact.type === CONTAINER_HEALTH_FACT_TYPES.memorySaturation)).toBeUndefined();
            expect(facts.find(fact => fact.type === CONTAINER_HEALTH_FACT_TYPES.heapObservationUnavailable)).toBeDefined();
        });

        test('a STALE all-not-node window cannot outvote a live nodeCommand: true', () => {
            // Envelopes ride on RETAINED samples, so a window held from earlier collections can carry
            // a classification the current read contradicts. The live reading wins.
            const service = createService({memorySaturationPercent: 80, sampleWindowMs: 30000});
            const facts   = service.collectStatsFacts({
                serviceKey  : 'memory',
                nodeCommand : true,
                stats       : null,
                statsSamples: [
                    nodeSample({observedAtMs: 1_000_000, unavailableReason: 'not-node'}),
                    nodeSample({observedAtMs: 1_045_000, unavailableReason: 'not-node'})
                ],
                observedAt  : OBSERVED_AT
            });

            expect(facts.find(fact => fact.type === CONTAINER_HEALTH_FACT_TYPES.memorySaturation)).toBeUndefined();
        });

        test('CONTROL — a live nodeCommand:false keeps the container ratio, envelope or not', () => {
            // The arm that must NOT change. Its title previously credited the ENVELOPE for licensing
            // container scope; that was wrong and @neo-gpt falsified it. The envelope's `not-node`
            // covers unknown identities too, so the direct `Config.Cmd` reading is the only authority.
            const service    = createService({storeMemorySaturationPercent: 80, sampleWindowMs: 30000});
            const memoryFact = memorySaturationFact(service, 'chroma', [
                nodeSample({observedAtMs: 1_000_000, unavailableReason: 'not-node'}),
                nodeSample({observedAtMs: 1_045_000, unavailableReason: 'not-node'})
            ], false);

            expect(memoryFact.details.memoryScope).toBe('container');
            expect(memoryFact.details.meanPercent).toBeCloseTo(95, 0);
        });

        test('CONTROL — a fully pairable, distinctly-timed window DOES emit', () => {
            // Proves every refusal above fails for its stated reason rather than because the heap
            // path stopped working: same threshold, same window, distinct SUBJECT stamps 45s apart.
            const service    = createService({memorySaturationPercent: 80, sampleWindowMs: 30000});
            const memoryFact = memorySaturationFact(service, 'memory', [
                nodeSample({observedAtMs: 1_000_000, heapPercent: 91, subjectObservedAt: 1_000_000}),
                nodeSample({observedAtMs: 1_045_000, heapPercent: 91, subjectObservedAt: 1_045_000})
            ]);

            expect(memoryFact.details.memoryScope).toBe('heap');
            expect(memoryFact.details.observedWindowMs).toBe(45_000);
        });

        test('CONTROL — the same samples DO emit when the heap reading is usable', () => {
            // Proves the test above fails for the stated reason. Identical container numbers,
            // identical threshold and window; only the heap envelope differs.
            const service = createService({memorySaturationPercent: 80, sampleWindowMs: 30000});
            expect(memorySaturationFact(service, 'memory', [
                nodeSample({observedAtMs: 1_000_000, heapPercent: 91}),
                nodeSample({observedAtMs: 1_045_000, heapPercent: 91})
            ])).toBeDefined();
        });

        test('a NON-Node service keeps the container ratio, unchanged', () => {
            // `chroma` is the live example: a third-party image with no V8 heap to bound. Container
            // usage over the container limit is the honest measure of container pressure, and this
            // slice must not disturb it.
            const service    = createService({storeMemorySaturationPercent: 80, sampleWindowMs: 30000});
            const memoryFact = memorySaturationFact(service, 'chroma', [
                nodeSample({observedAtMs: 1_000_000, unavailableReason: 'not-node'}),
                nodeSample({observedAtMs: 1_045_000, unavailableReason: 'not-node'})
            ], false);

            expect(memoryFact.details.memoryScope).toBe('container');
            expect(memoryFact.details.meanPercent).toBeCloseTo(95, 0);
        });

        test('an explicitly non-Node service keeps the container ratio WITHOUT any envelope', () => {
            // Retired and replaced. This test previously asserted that ANY service with no envelope
            // keeps the container ratio, on the reasoning that "an absent envelope is evidence of
            // nothing". The first half was right and the conclusion was backwards: evidence of
            // nothing cannot license the cross-scope ratio either. @neo-gpt's review reproduced the
            // consequence — a declared Node service with no envelope still emitted the exact fact
            // this slice exists to remove.
            //
            // What survives is the real requirement: a service the SOURCE identifies as non-Node
            // keeps container scope, and does so without needing the heap channel deployed at all.
            const service    = createService({memorySaturationPercent: 80, sampleWindowMs: 30000});
            const memoryFact = memorySaturationFact(service, 'memory', [
                statsSample({memoryPercent: 95, observedAtMs: 1_000_000}),
                statsSample({memoryPercent: 95, observedAtMs: 1_045_000})
            ], false);

            expect(memoryFact.details.memoryScope).toBe('container');
        });
    });

    test('CONTROL — a DECLARED key records declared:true, so the flag discriminates', () => {
        const service  = createService({storeMemorySaturationPercent: 80, sampleWindowMs: 30000});
        const decision = service.diagnose({
            serviceKey  : 'chroma',
            nodeCommand : false,
            statsSamples: [saturated(1_000_000), saturated(1_045_000)]
        });

        const memoryFact = decision.diagnosis.evidenceFacts
            .find(fact => fact.type === CONTAINER_HEALTH_FACT_TYPES.memorySaturation);

        expect(memoryFact.details).toMatchObject({
            serviceClass        : SERVICE_CLASSES.store,
            serviceClassDeclared: true
        });
    });

    test('CONTROL — the same samples spanning the requirement DO qualify, and report the MEASURED span', () => {
        // The positive control. Without it the four refusals above could pass by breaking the path
        // entirely rather than by discriminating on elapsed time.
        const service  = createService({cpuSaturationPercent: 90, storeMemorySaturationPercent: 80, sampleWindowMs: 30000});
        const decision = service.diagnose({
            serviceKey  : 'chroma',
            nodeCommand : false,
            statsSamples: [saturated(1_000_000), saturated(1_045_000)]   // 45s
        });

        expect(decision.status).toBe('diagnosed');
        expect(decision.actionClass).toBe(CONTAINER_HEALTH_ACTION_CLASSES.raiseCeiling);

        const memoryFact = decision.diagnosis.evidenceFacts
            .find(fact => fact.type === CONTAINER_HEALTH_FACT_TYPES.memorySaturation);

        // The emitted evidence carries what was OBSERVED alongside what was required. Reporting only
        // the configured value is what let an unmeasured window look measured.
        expect(memoryFact.details).toMatchObject({
            observedWindowMs: 45000,
            requiredWindowMs: 30000,
            threshold       : 80
        });
    });

    test('a PARTIALLY stamped window does not qualify — the span must cover every sample', () => {
        // The falsifier that survived the first repair. Filtering non-finite stamps meant three
        // samples carrying only two stamps produced a 45s span and passed a 30s floor — while the
        // third sample was never timed at all, so the span was asserted over an observation no clock
        // witnessed. A partial-coverage span is UNKNOWN, not merely shorter, and an unknown span
        // cannot satisfy a floor. Two saturated stamped samples plus one saturated UNSTAMPED sample:
        // count and threshold both pass, so coverage is the only thing standing between this and a
        // false diagnosis.
        const service  = createService({cpuSaturationPercent: 90, storeMemorySaturationPercent: 80, sampleWindowMs: 30000});
        const decision = service.diagnose({
            serviceKey  : 'chroma',
            nodeCommand : false,
            statsSamples: [
                saturated(1_000_000),
                saturated(1_045_000),
                statsSample({cpuPercent: 0, memoryPercent: 85})   // saturated, deliberately UNSTAMPED
            ]
        });

        expect(decision.status, 'an unwitnessed sample must not be swept into a timed window').not.toBe('diagnosed');
        expect(decision.diagnosis).toBeNull();
    });

    test('CONTROL — the same three samples FULLY stamped do qualify, so coverage is what discriminates', () => {
        // Without this the refusal above could pass by rejecting any three-sample window rather than
        // by noticing the missing stamp.
        const service  = createService({cpuSaturationPercent: 90, storeMemorySaturationPercent: 80, sampleWindowMs: 30000});
        const decision = service.diagnose({
            serviceKey  : 'chroma',
            nodeCommand : false,
            statsSamples: [saturated(1_000_000), saturated(1_030_000), saturated(1_045_000)]
        });

        expect(decision.status).toBe('diagnosed');
        expect(decision.actionClass).toBe(CONTAINER_HEALTH_ACTION_CLASSES.raiseCeiling);

        const memoryFact = decision.diagnosis.evidenceFacts
            .find(fact => fact.type === CONTAINER_HEALTH_FACT_TYPES.memorySaturation);

        expect(memoryFact.details.observedWindowMs).toBe(45000);
    });
});

/**
 * The classification used to be a `Set` of store keys where absence meant transient, which made two
 * different things indistinguishable: "declared transient" and "nobody classified this". These bind
 * the declared map to the roster the bridge actually iterates, so adding a service without
 * classifying it fails here rather than silently inheriting a threshold it may not survive.
 */
test.describe('service classification is exhaustive over the real roster and genuinely immutable', () => {
    test('every allowedServices key has a DECLARED classification', () => {
        const roster = aiConfigTemplate.orchestrator.deploymentRuntimeAccess.allowedServices;

        expect(Array.isArray(roster)).toBe(true);
        expect(roster.length).toBeGreaterThan(0);

        const undeclared = roster.filter(key => !classifyServiceKey(key).declared);

        expect(undeclared, `unclassified roster services: ${undeclared.join(', ')}`).toEqual([]);
    });

    test('the declared map does not classify keys that are NOT on the roster', () => {
        // Totality runs both ways: a stale entry for a removed service is drift too, and it would
        // keep asserting a policy for something the deployment no longer runs.
        const roster   = new Set(aiConfigTemplate.orchestrator.deploymentRuntimeAccess.allowedServices);
        const orphaned = Object.keys(SERVICE_CLASS_BY_KEY).filter(key => !roster.has(key));

        expect(orphaned, `classified but not on the roster: ${orphaned.join(', ')}`).toEqual([]);
    });

    test('the map is immutable — asserted by MUTATION, not by Object.isFrozen', () => {
        // `Object.isFrozen` returns true for a frozen Set whose `add`/`delete` still work, so the
        // predicate alone is a false assurance. A frozen plain object does resist writes; this
        // attempts them and checks the values, which is the claim that matters.
        expect(Object.isFrozen(SERVICE_CLASS_BY_KEY)).toBe(true);

        try { SERVICE_CLASS_BY_KEY['chroma'] = SERVICE_CLASSES.transient } catch (e) { /* strict throws; both acceptable */ }
        try { SERVICE_CLASS_BY_KEY['injected'] = SERVICE_CLASSES.store }    catch (e) { /* ditto */ }
        try { delete SERVICE_CLASS_BY_KEY['kb-server'] }                    catch (e) { /* ditto */ }

        expect(SERVICE_CLASS_BY_KEY.chroma).toBe(SERVICE_CLASSES.store);
        expect(SERVICE_CLASS_BY_KEY.injected).toBeUndefined();
        expect(SERVICE_CLASS_BY_KEY['kb-server']).toBe(SERVICE_CLASSES.transient);

        // And the predicate cannot be subverted through the map.
        expect(isStoreBackedService('chroma')).toBe(true);
        expect(isStoreBackedService('injected')).toBe(false);
    });
});

test.describe('describeClassification — the load-independent projection (#16596)', () => {
    test('a store reports its class, ITS threshold, and a measured window — with zero saturation involved', () => {
        const service = createService();

        expect(service.describeClassification({
            serviceKey  : 'chroma',
            statsSamples: [
                statsSample({memoryPercent: 10, observedAtMs: OBSERVED_AT}),
                statsSample({memoryPercent: 11, observedAtMs: OBSERVED_AT + 45000})
            ]
        })).toEqual({
            serviceKey            : 'chroma',
            serviceClass          : 'store',
            serviceClassDeclared  : true,
            appliedMemoryThreshold: 80,
            observedWindowMs      : 45000,
            requiredWindowMs      : 30000,
            sampleCount           : 2,
            stampCoverage         : 1
        });
    });

    test('a transient service reports the transient threshold, and an unrostered key reports its GUESS', () => {
        const service = createService();

        expect(service.describeClassification({serviceKey: 'kb-server'})).toMatchObject({
            serviceClass          : 'transient',
            serviceClassDeclared  : true,
            appliedMemoryThreshold: 90
        });

        // An unrostered key still defaults to transient — refusing would break unrecognised
        // deployments — but the projection carries `declared: false`, so "nobody classified this"
        // stays distinguishable from "declared transient".
        expect(service.describeClassification({serviceKey: 'mystery-svc'})).toMatchObject({
            serviceClass        : 'transient',
            serviceClassDeclared: false
        });
    });

    test('emits with NO samples at all — the projection cannot depend on the load it exists to precede', () => {
        const service = createService();

        expect(service.describeClassification({serviceKey: 'chroma'})).toEqual({
            serviceKey            : 'chroma',
            serviceClass          : 'store',
            serviceClassDeclared  : true,
            appliedMemoryThreshold: 80,
            observedWindowMs      : 0,
            requiredWindowMs      : 30000,
            sampleCount           : 0,
            stampCoverage         : null
        });
    });

    test('an under-stamped window is distinguishable from an under-length one', () => {
        // Three samples, two stamps 30s apart: the span READS as satisfying the requirement while a
        // third sample was never timed at all. `observedWindowMs` alone collapses the two conditions;
        // `stampCoverage` is what keeps a dead stamping path from hiding behind a plausible span.
        const service = createService(),
              result  = service.describeClassification({
                  serviceKey  : 'chroma',
                  statsSamples: [
                      statsSample({memoryPercent: 10, observedAtMs: OBSERVED_AT}),
                      statsSample({memoryPercent: 10}),
                      statsSample({memoryPercent: 10, observedAtMs: OBSERVED_AT + 30000})
                  ]
              });

        expect(result).toMatchObject({
            observedWindowMs: 30000,
            sampleCount     : 3,
            stampCoverage   : 0.67
        });
    });

    test('the projection is verdict-free — it must never carry a sustained-shaped field', () => {
        // A verdict-shaped field on a verdict-free read would recreate the conflation the projection
        // removes: consumers would read a threshold comparison that never ran.
        const service = createService(),
              result  = service.describeClassification({serviceKey: 'chroma', statsSamples: []});

        expect(Object.hasOwn(result, 'sustained')).toBe(false);
        expect(Object.hasOwn(result, 'severity')).toBe(false);
        expect(Object.hasOwn(result, 'authoritative')).toBe(false);
    });
});


/**
 * A container CPU ratio may only speak for the service when the container has nothing else to
 * aggregate. These drive the REAL `diagnose()` seam rather than the resolver in isolation: a spec
 * that re-implements the disposition would pass against a tree with the production wiring deleted.
 */
test.describe('cpu saturation names its subject', () => {
    /** Two samples over threshold, far enough apart to satisfy the measured sustained window. */
    function sustainedCpu() {
        return [
            statsSample({cpuPercent: 98, observedAtMs: OBSERVED_AT - 40_000}),
            statsSample({cpuPercent: 99, observedAtMs: OBSERVED_AT})
        ];
    }

    function cpuFact(decision) {
        return decision.facts.find(fact =>
            fact.type === CONTAINER_HEALTH_FACT_TYPES.resourceSaturation && fact.details?.metric === 'cpu');
    }

    test('a NODE service over threshold yields a NON-authoritative fact — the cgroup aggregates its forks', () => {
        // The live instance: an orchestrator at ~98.7% where PID 1 held ~10% and a legitimate child
        // job held ~91%. The number is real; the subject is not the service.
        const decision = createService().diagnose({
            serviceKey  : 'orchestrator',
            nodeCommand : true,
            inspect     : runningInspect(),
            statsSamples: sustainedCpu()
        });

        const fact = cpuFact(decision);

        expect(fact, 'the fact is still emitted — the signal is kept, only its authority is withdrawn').toBeTruthy();
        expect(fact.authoritative).toBe(false);
        expect(fact.details.scope).toBe(CPU_SATURATION_SCOPES.unattributable);
        expect(fact.details.subjectUnavailableReason).toBe('node-service-may-fork');
    });

    test('POSITIVE CONTROL — a non-Node container over threshold is still authoritative', () => {
        // Without this the guard could pass by disabling the metric outright. `nodeCommand === false`
        // is the one thing that licenses the container ratio, exactly as the memory path has it.
        const decision = createService().diagnose({
            serviceKey  : 'chroma',
            nodeCommand : false,
            inspect     : runningInspect(),
            statsSamples: sustainedCpu()
        });

        const fact = cpuFact(decision);

        expect(fact.authoritative).toBe(true);
        expect(fact.details.scope).toBe(CPU_SATURATION_SCOPES.container);
        expect(fact.details.subjectUnavailableReason).toBeNull();
    });

    test('an UNREADABLE identity is unattributable, never container — an unknown service cannot manufacture authority', () => {
        // The failure the memory path already paid for: consuming a refusal as a positive
        // classification let an unknown service produce an authoritative container-scoped fact.
        for (const nodeCommand of [null, undefined]) {
            const fact = cpuFact(createService().diagnose({
                serviceKey  : 'kb',
                nodeCommand,
                inspect     : runningInspect(),
                statsSamples: sustainedCpu()
            }));

            expect(fact.authoritative, `nodeCommand=${nodeCommand} must not be authoritative`).toBe(false);
            expect(fact.details.subjectUnavailableReason).toBe('service-identity-unknown');
        }
    });

    test('a sustained CPU fact ALONE cannot license an action on a Node service', () => {
        // Why the flag is the whole point: `authoritative: false` cannot reach `minAuthoritativeFacts`.
        // Before this change the same input contributed one of the two facts an authoritative
        // classification needs, with a shallow healthcheck available as the second.
        const decision = createService().diagnose({
            serviceKey  : 'orchestrator',
            nodeCommand : true,
            inspect     : runningInspect(),
            statsSamples: sustainedCpu()
        });

        expect(decision.facts.filter(fact => fact.authoritative)).toHaveLength(0);
        expect(decision.actionClass ?? null).toBeNull();
    });

    test('AC-4 — the PAIRING is covered: unhealthy container PLUS sustained CPU still cannot reach the gate', () => {
        // This is the combination the ticket is actually about, and the previous test did not cover
        // it. `minAuthoritativeFacts` is 2, and before this change a Node service could supply a
        // sustained CPU fact as one of them while a shallow healthcheck supplied the other — the
        // pairing that `resolveMemorySaturationScope`'s own comment records reaching
        // `diagnosed -> throttle-shed` on the memory side.
        const decision = createService().diagnose({
            serviceKey  : 'orchestrator',
            nodeCommand : true,
            inspect     : runningInspect({Health: {Status: 'unhealthy'}}),
            statsSamples: sustainedCpu()
        });

        const authoritative = decision.facts.filter(fact => fact.authoritative);

        expect(authoritative.length, 'the CPU fact must not be the second authoritative signature')
            .toBeLessThan(2);
        expect(cpuFact(decision).authoritative).toBe(false);
    });

    test('AC-4 — a failed endpoint probe cannot promote a non-authoritative CPU fact', () => {
        const decision = createService().diagnose({
            serviceKey   : 'orchestrator',
            nodeCommand  : true,
            inspect      : runningInspect(),
            statsSamples : sustainedCpu(),
            endpointProbe: {
                ok     : false,
                message: 'timeout',
                name   : 'healthcheck'
            }
        });

        expect(cpuFact(decision).authoritative).toBe(false);
        expect(decision.facts.filter(fact => fact.authoritative)).toHaveLength(0);
        expect(decision.status).toBe('advisory');
        expect(decision.actionClass ?? null).toBeNull();
    });

    test('AC-4 POSITIVE CONTROL — a failed endpoint probe still corroborates authoritative container CPU', () => {
        const decision = createService().diagnose({
            serviceKey   : 'chroma',
            nodeCommand  : false,
            inspect      : runningInspect(),
            statsSamples : sustainedCpu(),
            endpointProbe: {
                ok     : false,
                message: 'timeout',
                name   : 'healthcheck'
            }
        });

        expect(cpuFact(decision).authoritative).toBe(true);
        expect(decision.status).toBe('diagnosed');
        expect(decision.actionClass).toBe(CONTAINER_HEALTH_ACTION_CLASSES.throttleShed);
        expect(decision.diagnosis.details.classificationReason).toBe('resource-exhaustion');
    });

    test('AC-5 — the two subject rules are CO-LOCATED, not merely consistent', () => {
        // The layout defect this ticket exists to close: the memory path grew a subject check and CPU
        // kept the container ratio four lines away with nothing between them saying so. A guard on the
        // shared block, because "both are correct in two files that never reference each other" is the
        // state that produced the bug.
        const source = fs.readFileSync(
            path.join(repoRoot, 'ai/daemons/orchestrator/services/ContainerHealthDiagnosisService.mjs'), 'utf8');

        const sharedRule = source.indexOf('The saturation-SUBJECT rule, stated once for both metrics');

        expect(sharedRule, 'the shared subject rule must exist').toBeGreaterThan(-1);
        // It must sit immediately before BOTH scope enums, so a reader landing on either finds it.
        expect(sharedRule).toBeLessThan(source.indexOf('MEMORY_SATURATION_SCOPES = Object.freeze'));
        expect(sharedRule).toBeLessThan(source.indexOf('CPU_SATURATION_SCOPES = Object.freeze'));
        // ...and it must name the divergence rather than implying the two behave identically.
        //
        // Bounded by the NEXT anchor rather than a character window. The original `+ 2600` was a
        // numeric bound on a prose block: this lane's fold grew the block to 3,638 characters and the
        // assertion went red for a reason unrelated to the property it guards, which is the failure
        // mode a magic window always has — too small and it false-fails, too large and it starts
        // reading neighbouring text.
        expect(source.slice(sharedRule, source.indexOf('MEMORY_SATURATION_SCOPES = Object.freeze', sharedRule)))
            .toContain('CPU has no equivalent');
    });

    test('the subject rule states its gate as a PROXY, and carries the retired premise as retired', () => {
        // The gate is `nodeCommand === false`; the rule is about workload ownership. Those are not the
        // same claim, and an earlier revision of the block said the gate ESTABLISHED the rule. A
        // structural guard only — it asserts what the contract says, never what the code does, which is
        // the honest instrument for a prose defect.
        const
            source     = fs.readFileSync(
                path.join(repoRoot, 'ai/daemons/orchestrator/services/ContainerHealthDiagnosisService.mjs'), 'utf8'),
            sharedRule = source.indexOf('The saturation-SUBJECT rule, stated once for both metrics'),
            // Collapse JSDoc continuations so an assertion cannot pass or fail on where a line wrapped.
            block      = source
                .slice(sharedRule, source.indexOf('MEMORY_SATURATION_SCOPES = Object.freeze', sharedRule))
                .replace(/\n\s*\*\s?/g, ' ')
                .replace(/\s+/g, ' ');

        // The rule is stated over workload ownership, which is what the subject actually requires.
        expect(block).toContain(
            "only when every process in the container belongs to the service's own workload");
        // The gate is named a proxy for that rule, not a proof of it.
        expect(block).toContain('is a PROXY for that rule rather than proof of it');
        // The retired premise is present ONLY as a retirement, never as the rule.
        expect(block).toContain('An earlier revision of this block claimed');
        expect(block).toContain('that is false and is retired here');
        expect(block, 'the cardinality premise must not return as the rule')
            .not.toContain('only when the container has no other processes');
        // A proxy without a retirement condition is a permanent shortcut wearing a temporary label.
        expect(block).toContain('Retirement trigger');
    });

    test('the resolver mirrors the memory gate exactly, and says no', () => {
        // Non-vacuity for the predicate itself: a resolver that returned `container` for everything
        // would make every assertion above pass through the authoritative branch only by accident.
        expect(resolveCpuSaturationScope({nodeCommand: false}).authoritative).toBe(true);
        expect(resolveCpuSaturationScope({nodeCommand: true}).authoritative).toBe(false);
        expect(resolveCpuSaturationScope({}).authoritative).toBe(false);
        expect(resolveCpuSaturationScope({nodeCommand: false}).scope).toBe(CPU_SATURATION_SCOPES.container);
        expect(resolveCpuSaturationScope({nodeCommand: true}).scope).toBe(CPU_SATURATION_SCOPES.unattributable);
    });
});
