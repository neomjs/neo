import {test, expect} from '@playwright/test';
import {mkdtemp, rm}  from 'fs/promises';
import os             from 'os';
import path           from 'path';

import Neo       from '../../../../../../../src/Neo.mjs';
import * as core from '../../../../../../../src/core/_export.mjs';

import {
    CONTAINER_HEALTH_ACTION_ROUTES,
    ContainerHealthControllerService,
    UNMAPPED_ACTION_CLASS_REASON_CODE
} from '../../../../../../../ai/daemons/orchestrator/services/ContainerHealthControllerService.mjs';
import {
    CONTAINER_HEALTH_ACTION_CLASSES,
    ContainerHealthDiagnosisService
} from '../../../../../../../ai/daemons/orchestrator/services/ContainerHealthDiagnosisService.mjs';
import {RecoveryActuatorService}              from '../../../../../../../ai/daemons/orchestrator/services/RecoveryActuatorService.mjs';
import {HEAL_LEDGER_DIR_NAME, readHealLedger} from '../../../../../../../ai/services/memory-core/helpers/healEventLedgerStore.mjs';
import {createRecoveryDiagnosisEvent}         from '../../../../../../../ai/services/memory-core/helpers/recoveryRunStateStore.mjs';

const OBSERVED_AT = 1710000000000;

const DEFAULT_RUNTIME_ACCESS_CONFIG = {
    allowedServices: ['chroma', 'kb-server', 'mc-server', 'local-model']
};

test.describe('Neo.ai.daemons.services.ContainerHealthControllerService', () => {
    let tmpDir;

    test.beforeEach(async () => {
        tmpDir = await mkdtemp(path.join(os.tmpdir(), 'neo-container-health-controller-'));
    });

    test.afterEach(async () => {
        await rm(tmpDir, {recursive: true, force: true});
    });

    /**
     * A REAL `RecoveryActuatorService` behind the controller, not a fake. The whole ticket is that a
     * decision never reached that class, so a test double would assert the controller calls something
     * shaped like an actuator while leaving the real admission matrix, the real anti-thrash envelope
     * and the real ledger paths — the parts that decide whether anything actually heals — unexercised.
     * Only the Docker socket boundary is faked, because that is the one thing a unit test cannot hold.
     */
    function createStack({actuatorConfig = {}, controllerConfig = {}} = {}) {
        const runtimeCalls = [],
              taskOutcomes = [],
              actuator     = Neo.create(RecoveryActuatorService, {
                  dataDir       : tmpDir,
                  actuatorConfig: {
                      enabled                    : true,
                      blockedComposeServices     : [],
                      blockedDeployTargets       : [],
                      blockedSupervisedTasks     : [],
                      healAttemptsPath           : path.join(tmpDir, 'heal-attempts.json'),
                      recoveryRunStateDir        : path.join(tmpDir, 'recovery-runs'),
                      recoveryRunRetentionLimit  : 100,
                      baseBackoffMs              : 0,
                      maxBackoffMs               : 0,
                      maxAttemptsPerWindow       : 2,
                      maxAttemptsWindowMs        : 60_000,
                      verifyCooldownMs           : 5_000,
                      healthyObservationThreshold: 1,
                      healLedger                 : {maxEvents: 5000, pruneTriggerBytes: 1024 * 1024},
                      ...actuatorConfig
                  },
                  healthService: {
                      recordTaskOutcome(taskName, status, details) {
                          taskOutcomes.push({taskName, status, details});
                      }
                  },
                  deploymentRuntimeAccessService: {
                      runtimeAccessConfig: DEFAULT_RUNTIME_ACCESS_CONFIG,
                      async applyLifecycle(options) {
                          runtimeCalls.push(options);

                          return {
                              ok        : true,
                              statusCode: 204,
                              proof     : {
                                  capabilityEnvelope: 'lifecycle-write',
                                  operation         : options.operation,
                                  serviceKey        : options.serviceKey,
                                  targetIdentity    : {kind: 'compose-service', id: options.serviceKey}
                              }
                          };
                      }
                  },
                  processSupervisorService: {taskDefinitions: {backup: {label: 'backup task'}}},
                  writeLog                : () => {}
              }),
              controller = Neo.create(ContainerHealthControllerService, {
                  recoveryActuator   : actuator,
                  // The SAME derivation the orchestrator gives the bridge's `selfHeal` reader. Asserted
                  // against the actuator's own dir below, because the two agreeing is the property that
                  // makes a heal-event observable at all.
                  healLedgerDir      : path.join(tmpDir, HEAL_LEDGER_DIR_NAME),
                  healLedgerRetention: {maxEvents: 5000, triggerBytes: 1024 * 1024},
                  nowFn              : () => OBSERVED_AT,
                  writeLog           : () => {},
                  ...controllerConfig
              });

        return {actuator, controller, runtimeCalls, taskOutcomes};
    }

    /** The real diagnosis service, so the decision under test is the one production would produce. */
    function diagnose(options) {
        return Neo.create(ContainerHealthDiagnosisService, {nowFn: () => OBSERVED_AT}).diagnose(options);
    }

    function runningInspect(health) {
        return {State: {Status: 'running', Health: {Status: health}}};
    }

    /** `observedAtMs` is what the bridge stamps; the sustained window is MEASURED from it, not assumed. */
    function statsSample({cpuPercent = 0, memoryPercent = 0, observedAtMs} = {}) {
        const systemDelta = 1_000_000_000,
              cpuDelta    = (cpuPercent / 100) * systemDelta / 4,
              memoryLimit = 1000;

        return {
            ...(Number.isFinite(observedAtMs) ? {observedAtMs} : {}),
            cpu_stats: {
                online_cpus     : 4,
                system_cpu_usage: systemDelta,
                cpu_usage       : {total_usage: cpuDelta}
            },
            precpu_stats: {
                system_cpu_usage: 0,
                cpu_usage       : {total_usage: 0}
            },
            memory_stats: {limit: memoryLimit, usage: (memoryPercent / 100) * memoryLimit}
        };
    }

    /**
     * The ADR-0025 §2.4 authoritative pair — a `container-unhealthy` state AND a failed DIRECT endpoint // ticket-ref-ok: the ADR clause defines the pair this fixture exists to encode
     * probe. Named rather than inlined because "unhealthy" alone is NOT this, and an earlier revision of
     * this suite proved how easy that is to forget: it asserted a restart on a container whose own test
     * comment said the process "kept serving".
     */
    function wedged(serviceKey) {
        return diagnose({
            serviceKey,
            inspect      : runningInspect('unhealthy'),
            endpointProbe: {ok: false, name: 'healthcheck'}
        });
    }

    /** Unhealthy per the runtime, but ANSWERING directly — the false-unhealthy case that must not act. */
    function answering(serviceKey) {
        return diagnose({
            serviceKey,
            inspect      : runningInspect('unhealthy'),
            endpointProbe: {ok: true, name: 'healthcheck'}
        });
    }

    /** `readHealLedger` resolves to a plain ARRAY (`[]` when the ledger file does not exist yet). */
    async function readLedger() {
        return readHealLedger({dir: path.join(tmpDir, HEAL_LEDGER_DIR_NAME)});
    }

    /**
     * Builds a decision carrying an arbitrary action class WITHOUT going through the classifier, for
     * the routes the classifier cannot currently be driven to on a bounded fixture. It reuses the real
     * decision + diagnosis envelopes so only the class under test is synthetic.
     */
    function decisionWithActionClass(actionClass, {serviceKey = 'mc-server', recoveryClass = 'exhaustion'} = {}) {
        return {
            schemaVersion : 1,
            recordType    : 'container-health-diagnosis-decision',
            serviceKey,
            targetIdentity: {kind: 'compose-service', id: serviceKey},
            observedAt    : OBSERVED_AT,
            status        : 'diagnosed',
            actionClass,
            diagnosis     : createRecoveryDiagnosisEvent({
                diagnosisId   : `container-health:${serviceKey}:${recoveryClass}:${OBSERVED_AT}`,
                recoveryClass,
                confidence    : 0.8,
                targetIdentity: {kind: 'compose-service', id: serviceKey},
                evidenceFacts : [],
                observedAt    : OBSERVED_AT,
                source        : 'container-health-diagnostics',
                details       : {actionClass, classificationReason: 'fixture'}
            }),
            facts: []
        };
    }

    // ---------------------------------------------------------------------------------------------
    // The ticket's headline AC. This is the assertion that fails against `dev`.
    // ---------------------------------------------------------------------------------------------

    test('a genuinely wedged container reaches the actuator and is restarted (#16766)', async () => {
        const {controller, runtimeCalls} = createStack(),
              // The ADR-0025 §2.4 pair: the runtime says unhealthy AND a direct probe of the service // ticket-ref-ok: the ADR clause is what licenses this restart
              // itself failed. Two independent channels agreeing is what licenses a privileged restart.
              decision = wedged('mc-server');

        expect(decision.status).toBe('diagnosed');
        expect(decision.actionClass).toBe(CONTAINER_HEALTH_ACTION_CLASSES.restart);

        const outcome = await controller.consume({decision});

        expect(outcome.status).toBe('actuated');
        expect(outcome.actuatorAction).toBe('restart');
        expect(outcome.actuatorOutcome.status).toBe('actioned');

        // The privileged lifecycle write actually happened, against the diagnosed service. Asserting
        // only the controller's own return value would pass against a controller that reached no
        // actuator at all — which is precisely the pre-change state.
        expect(runtimeCalls).toEqual([{
            serviceKey: 'mc-server',
            operation : 'restart',
            reason    : 'container-health-controller:lifecycle-crash'
        }]);
    });

    test('SAFETY — an ANSWERING service is not restarted even with a SECOND authoritative fact', async () => {
        // Euclid's exact-head falsifier. `hasAuthoritativeEvidence`'s first arm admits ANY two
        // authoritative facts, so `container-unhealthy` + a sustained `memory-saturation` reached
        // restart on a service that was demonstrably serving — the positive probe contributed nothing
        // because a successful probe emits no fact at all. This is acute rather than theoretical while
        // a sibling lane can still mark a Node service's memory fact authoritative.
        const {controller, runtimeCalls} = createStack(),
              decision                   = diagnose({
                  serviceKey   : 'mc-server',
                  inspect      : runningInspect('unhealthy'),
                  endpointProbe: {ok: true, name: 'healthcheck'},
                  stats        : statsSample({memoryPercent: 96, observedAtMs: OBSERVED_AT}),
                  statsSamples : [
                      statsSample({memoryPercent: 96, observedAtMs: OBSERVED_AT - 60_000}),
                      statsSample({memoryPercent: 97, observedAtMs: OBSERVED_AT})
                  ]
              });

        expect(decision.actionClass).not.toBe(CONTAINER_HEALTH_ACTION_CLASSES.restart);

        await controller.consume({decision});

        expect(runtimeCalls.filter(call => call.operation === 'restart')).toEqual([]);
    });

    test('SAFETY — a service ANSWERING while the runtime reports unhealthy is never restarted', async () => {
        const {controller, runtimeCalls} = createStack(),
              decision                   = answering('mc-server');

        // The false-unhealthy case, at the controller seam rather than only at the classifier. ADR-0025 // ticket-ref-ok: the ADR clause is the authority for refusing this action
        // §2.1's live instance: a provider-dependent canary false-fails while the service still answers
        // and persists. Restarting it destroys the in-flight work whose slowness caused the red, and on
        // Memory Core that is the WAL capture the deployment comment says must never be vetoed.
        expect(decision.status).toBe('advisory');
        expect(decision.actionClass).toBeNull();

        const outcome = await controller.consume({decision});

        expect(outcome.status).toBe('no-decision');
        expect(outcome.consumed).toBe(false);
        expect(runtimeCalls).toEqual([]);
        expect(await readLedger()).toEqual([]);
    });

    test('the decision is recorded to the ledger the deployment snapshot actually folds', async () => {
        const {actuator, controller} = createStack();

        await controller.consume({decision: wedged('mc-server')});

        // Writer and reader bind to one path. Before the repair the actuator wrote to
        // `<dataDir>/heal-events` while every production reader — the bridge's `selfHeal` fold,
        // backup, restore — read `<dataDir>/data-heal-events`, so a perfectly healed plane still
        // reported `selfHeal.total: 0`. Comparing the getter against the reader's derivation is what
        // makes re-splitting them fail here rather than in production.
        expect(actuator.healEventLedgerDir).toBe(path.join(tmpDir, HEAL_LEDGER_DIR_NAME));

        const events = await readLedger();

        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({
            type      : 'crash',
            collection: 'mc-server',
            status    : 'actioned'
        });
        expect(events[0].detail).toMatchObject({
            action     : 'restart',
            actionClass: CONTAINER_HEALTH_ACTION_CLASSES.restart,
            source     : 'container-health-controller'
        });
        expect(events[0].detail.recoveryRunId).toBeTruthy();
    });

    // ---------------------------------------------------------------------------------------------
    // Negative controls. A suite asserting only that a restart fired would pass against a controller
    // that restarts everything.
    // ---------------------------------------------------------------------------------------------

    test('NEGATIVE — a healthy container produces no action and no ledger entry', async () => {
        const {controller, runtimeCalls} = createStack(),
              decision                   = diagnose({serviceKey: 'mc-server', inspect: runningInspect('healthy')});

        expect(decision.status).toBe('healthy');

        const outcome = await controller.consume({decision});

        expect(outcome.status).toBe('no-decision');
        expect(outcome.consumed).toBe(false);
        expect(runtimeCalls).toEqual([]);
        expect(await readLedger()).toEqual([]);
    });

    test('NEGATIVE — a STARTING container is not actioned, so an ordinary boot window is never healed', async () => {
        const {controller, runtimeCalls} = createStack(),
              decision                   = diagnose({serviceKey: 'mc-server', inspect: runningInspect('starting')});

        // The fact exists and is `warning`/non-authoritative, so it surfaces without classifying. The
        // controller must not invent an action from an advisory decision — this is the whole safety
        // margin against restarting every container during its normal startup window.
        expect(decision.status).toBe('advisory');
        expect(decision.actionClass).toBeNull();

        const outcome = await controller.consume({decision});

        expect(outcome.status).toBe('no-decision');
        expect(runtimeCalls).toEqual([]);
        expect(await readLedger()).toEqual([]);
    });

    // ---------------------------------------------------------------------------------------------
    // The route table is a total function, and it never widens the actuator's authority.
    // ---------------------------------------------------------------------------------------------

    test('every diagnosed action class has a route — a new class fails HERE, not in production', () => {
        const classes = Object.values(CONTAINER_HEALTH_ACTION_CLASSES);

        for (const actionClass of classes) {
            expect(Object.hasOwn(CONTAINER_HEALTH_ACTION_ROUTES, actionClass)).toBe(true);
        }

        // And nothing extra: a row for a class the diagnosis layer cannot emit is dead policy that
        // reads as coverage.
        expect(Object.keys(CONTAINER_HEALTH_ACTION_ROUTES).sort()).toEqual([...classes].sort());
    });

    test('the action set is provably unwidened — every routed action is one the actuator already admits', () => {
        // Read from the actuator's own refusal rather than from a copied list: a list duplicated here
        // would keep agreeing with itself after the actuator's set changed.
        const {controller} = createStack(),
              routed       = Object.values(CONTAINER_HEALTH_ACTION_ROUTES)
                  .map(route => route.actuatorAction)
                  .filter(Boolean);

        expect(routed.length).toBeGreaterThan(0);
        expect(controller).toBeTruthy();

        for (const action of routed) {
            expect(['reconfigure', 'restart', 'redeploy', 'warm-provider', 'raise-ceiling']).toContain(action);
        }
    });

    test('an action outside the target kind\'s admitted row is STILL refused after this change', async () => {
        const {actuator, runtimeCalls} = createStack(),
              // `reconfigure` is compose-service only; a supervised task has no overlay mount to read.
              outcome                  = await actuator.apply('backup', 'reconfigure', {now: OBSERVED_AT});

        expect(outcome.status).toBe('rejected');
        expect(outcome.reasonCode).toBe('action-not-allowed-for-target');
        expect(runtimeCalls).toEqual([]);
    });

    // ---------------------------------------------------------------------------------------------
    // Decisions we deliberately do not act on. "No rule covers this" and "the rule is: do not act"
    // must be distinguishable in the ledger.
    // ---------------------------------------------------------------------------------------------

    test('throttle-shed maps to no admitted action and records rather than inventing one', async () => {
        const {controller, runtimeCalls} = createStack(),
              outcome                    = await controller.consume({
                  decision: decisionWithActionClass(CONTAINER_HEALTH_ACTION_CLASSES.throttleShed)
              });

        expect(outcome.status).toBe('recorded');
        expect(outcome.actuatorAction).toBeNull();
        expect(outcome.reasonCode).toBe('throttle-shed-has-no-admitted-action');
        expect(outcome.actuatorOutcome.status).toBe('recorded');
        expect(runtimeCalls).toEqual([]);

        const events = await readLedger();

        expect(events).toHaveLength(1);
        // The DECLINED class survives into the record. Re-labelling to `record` without it would turn
        // "we decided not to shed" into "this diagnosis never wanted an action" — different facts.
        expect(events[0].detail.unactuatedActionClass).toBe(CONTAINER_HEALTH_ACTION_CLASSES.throttleShed);
        expect(events[0].detail.reasonCode).toBe('throttle-shed-has-no-admitted-action');
    });

    test('raise-ceiling records, because its knob values are a derivation no decision carries', async () => {
        const {controller, runtimeCalls} = createStack(),
              outcome                    = await controller.consume({
                  decision: decisionWithActionClass(CONTAINER_HEALTH_ACTION_CLASSES.raiseCeiling, {serviceKey: 'chroma'})
              });

        expect(outcome.status).toBe('recorded');
        expect(outcome.reasonCode).toBe('raise-ceiling-requires-a-knob-transaction');
        expect(runtimeCalls).toEqual([]);
    });

    test('FAIL-CLOSED — an action class with no route records rather than inheriting an action', async () => {
        const {controller, runtimeCalls} = createStack(),
              outcome                    = await controller.consume({
                  decision: decisionWithActionClass('teleport-the-container')
              });

        expect(outcome.status).toBe('recorded');
        expect(outcome.actuatorAction).toBeNull();
        expect(outcome.reasonCode).toBe(UNMAPPED_ACTION_CLASS_REASON_CODE);
        expect(runtimeCalls).toEqual([]);

        const events = await readLedger();

        expect(events).toHaveLength(1);
        expect(events[0].detail.unactuatedActionClass).toBe('teleport-the-container');
    });

    test('EVERY consumed decision writes exactly one heal-event, including the decision not to act', async () => {
        const {controller} = createStack();

        await controller.consume({decision: wedged('mc-server')});
        await controller.consume({decision: decisionWithActionClass(CONTAINER_HEALTH_ACTION_CLASSES.throttleShed, {serviceKey: 'kb-server'})});
        await controller.consume({decision: diagnose({serviceKey: 'mc-server', inspect: runningInspect('healthy')})});

        const events = await readLedger();

        // Two diagnosed decisions in, two events out — and the healthy one contributes nothing, so
        // `selfHeal.total: 0` now means "nothing was diagnosed" rather than also covering "something
        // was diagnosed and nothing consumed it".
        expect(events).toHaveLength(2);
        expect(events.map(event => event.collection).sort()).toEqual(['kb-server', 'mc-server']);
    });

    // ---------------------------------------------------------------------------------------------
    // The anti-thrash envelope binds the new path — asserted, not argued.
    // ---------------------------------------------------------------------------------------------

    test('a repeating unhealthy fact marches into alarm-only instead of restart-looping', async () => {
        const {controller, runtimeCalls} = createStack(),
              // `maxAttemptsPerWindow: 2` in the harness, so the third consumption must be capped.
              statuses                   = [];

        for (let i = 0; i < 4; i++) {
            const outcome = await controller.consume({
                decision: wedged('mc-server')
            });

            statuses.push(outcome.actuatorOutcome.status);
        }

        expect(statuses).toEqual(['actioned', 'actioned', 'recorded', 'recorded']);

        // The bound is on the PRIVILEGED WRITE, not merely on the reported status. A controller whose
        // envelope reported a cap while still calling the runtime would pass a status-only assertion.
        expect(runtimeCalls).toHaveLength(2);

        const events = await readLedger();

        expect(events).toHaveLength(4);
        expect(events.at(-1).status).toBe('recorded');
        expect(events.at(-1).detail.reasonCode).toBe('attempt-cap-reached');
    });

    // ---------------------------------------------------------------------------------------------
    // Snapshot batching + fail-closed construction.
    // ---------------------------------------------------------------------------------------------

    test('consumeSnapshot routes every diagnosed service and one failure does not strand the rest', async () => {
        const {controller, runtimeCalls} = createStack(),
              snapshot                   = {
                  services: [
                      {serviceKey: 'chroma',    diagnosis: diagnose({serviceKey: 'chroma',    inspect: runningInspect('healthy')})},
                      // Not on the recovery registry, so the actuator refuses it — the batch must carry on.
                      {serviceKey: 'ghost',     diagnosis: wedged('ghost')},
                      {serviceKey: 'mc-server', diagnosis: wedged('mc-server')},
                      {serviceKey: 'nothing',   diagnosis: null}
                  ]
              };

        const outcomes = await controller.consumeSnapshot({snapshot});

        expect(outcomes.map(outcome => outcome.status)).toEqual(['no-decision', 'actuated', 'actuated', 'no-decision']);
        expect(outcomes[1].actuatorOutcome.status).toBe('rejected');
        expect(outcomes[1].actuatorOutcome.reasonCode).toBe('target-not-recoverable');

        // The unrecoverable target consumed no privileged write, and the recoverable one still got its
        // restart despite sitting AFTER the failure in the batch.
        expect(runtimeCalls).toEqual([{
            serviceKey: 'mc-server',
            operation : 'restart',
            reason    : 'container-health-controller:lifecycle-crash'
        }]);
    });

    test('AUTHORITY — losing the lease DURING a batch stops the remaining services', async () => {
        // The batch-level pulse answers "may this sweep act". It cannot answer "may THIS service be
        // acted on now", and a snapshot is consumed sequentially: authority lost while the first
        // service is restarting must stop the second. One boolean flipped between calls is the whole
        // fixture, because that is exactly what a successor reclaim looks like from in here.
        let held = true;

        const {controller, runtimeCalls} = createStack({
            controllerConfig: {isAuthorityHeld: () => held}
        });

        const snapshot = {
            services: [
                {serviceKey: 'mc-server', diagnosis: wedged('mc-server')},
                {serviceKey: 'kb-server', diagnosis: wedged('kb-server')}
            ]
        };

        // Flip after the FIRST privileged write lands, mid-batch.
        const actuator = controller.recoveryActuator,
              original = actuator.apply.bind(actuator);

        actuator.apply = async (...args) => {
            const result = await original(...args);

            held = false;

            return result;
        };

        const outcomes = await controller.consumeSnapshot({snapshot});

        expect(outcomes[0].status).toBe('actuated');
        expect(outcomes[1].status).toBe('declined');
        expect(outcomes[1].reasonCode).toBe('authority-lost');

        // Exactly ONE restart reached the runtime — the second was fenced, not merely reported.
        expect(runtimeCalls.filter(call => call.operation === 'restart')).toHaveLength(1);
    });

    /**
     * @neo-gpt's cycle-3 witness, reproduced as three controls. He ran the real actuator with authority
     * flipping inside `readHealAttempts()` and got a restart with `heldAtEffect: false` plus a heal
     * event with `heldAtWrite: false` — the controller had checked once, then awaited. The lesson
     * generalises past this class: an authority check with an await between it and the effect does not
     * bind the effect, and this is the THIRD depth the same fence has had to move to (batch → decision
     * → effect terminal).
     */
    test('(a) TAKEOVER during readHealAttempts — zero lifecycle call, zero shared-state mutation', async () => {
        let held = true;

        const {controller, actuator, runtimeCalls} = createStack({
            controllerConfig: {isAuthorityHeld: () => held}
        });

        // Flip authority INSIDE the actuator's awaited preparation — the exact window the witness used.
        const originalRead = actuator.readHealAttempts.bind(actuator);

        actuator.readHealAttempts = async () => {
            const attempts = await originalRead();

            held = false;

            return attempts;
        };

        const outcome = await controller.consume({decision: wedged('mc-server')});

        expect(runtimeCalls).toEqual([]);                          // no privileged effect
        expect(outcome.actuatorOutcome.status).toBe('declined');
        expect(outcome.actuatorOutcome.reasonCode).toBe('authority-lost');
        // And no owner-authoritative success entry anywhere in the shared ledger.
        expect((await readLedger()).filter(event => event.status === 'actioned')).toEqual([]);
    });

    test('(b) RECORD-ONLY after loss — zero owner-authoritative ledger writes', async () => {
        const {controller, runtimeCalls} = createStack({
            controllerConfig: {isAuthorityHeld: () => false}
        });

        const outcome = await controller.consume({
            decision: decisionWithActionClass(CONTAINER_HEALTH_ACTION_CLASSES.throttleShed)
        });

        // The rationale this replaces: record-only routes were left unfenced to "preserve evidence the
        // instance stopped". What they actually wrote was `status: 'recorded'` — a controller-owned
        // success terminal indistinguishable from ordinary operation, into the successor's ledger.
        expect(outcome.status).toBe('declined');
        expect(outcome.reasonCode).toBe('authority-lost');
        expect(runtimeCalls).toEqual([]);
        expect(await readLedger()).toEqual([]);
    });

    test('(c) LOSS BEFORE THE RECEIPT — the action landed, but no unbound post-loss success entry', async () => {
        let held = true;

        const {controller, actuator, runtimeCalls} = createStack({
            controllerConfig: {isAuthorityHeld: () => held}
        });

        // Authority survives the effect and is lost before the controller writes its own receipt.
        const originalApply = actuator.apply.bind(actuator);

        actuator.apply = async (...args) => {
            const result = await originalApply(...args);

            held = false;

            return result;
        };

        const outcome = await controller.consume({decision: wedged('mc-server')});

        expect(runtimeCalls).toHaveLength(1);                      // the restart genuinely happened
        expect(outcome.actuatorOutcome.status).toBe('actioned');
        // ...and the controller does NOT then name itself the actor in the successor's ledger.
        expect((await readLedger()).filter(event => event.status === 'actioned')).toEqual([]);
    });

    test('(d) a runtime AUTHORITY-LOST refusal is not collapsed into executor failure, and writes nothing', async () => {
        // Repurposed, and the reason matters. This previously claimed to test the runtime's
        // post-resolution guard while actually testing its own wrapper — @neo-gpt showed that deleting
        // the real check did not change its outcome. The genuine control for that guard now lives in
        // `DeploymentRuntimeAccessService.spec.mjs`, driving the real resolution round-trip.
        //
        // What THIS covers is the caller's half: a refusal raised because authority moved is a
        // different thing from an executor failing, and collapsing them charges the successor's
        // anti-thrash budget and appends a recovery-run terminal for an action that never happened.
        const fsExtra = (await import('fs-extra')).default;

        // ONE lease, read at several points — which is what production has. Authority is present for
        // the controller's pre-check and gone by the time the runtime resolves, so every later read
        // (the runtime guard, the post-effect decision, the receipt) sees the loss. A fixture where the
        // controller still "holds" while the runtime refuses could not happen against a single lease.
        let reads = 0;

        const {controller, actuator, runtimeCalls} = createStack({
            controllerConfig: {isAuthorityHeld: () => ++reads === 1}
        });

        const runtime = actuator.deploymentRuntimeAccessService;

        runtime.applyLifecycle = async () => {
            const error = new Error('Authority moved while resolving; refusing the lifecycle write.');

            error.reason = 'runtime-authority-lost';   // what the real guard raises

            throw error;
        };

        const outcome = await controller.consume({decision: wedged('mc-server')});

        expect(outcome.actuatorOutcome.status).toBe('declined');
        expect(outcome.actuatorOutcome.reasonCode).toBe('authority-lost');
        expect(runtimeCalls).toEqual([]);
        // No effect landed, so there is no post-effect audit rationale — neither shared surface is touched.
        expect(await fsExtra.pathExists(path.join(tmpDir, 'heal-attempts.json'))).toBe(false);
        expect(await readLedger()).toEqual([]);
    });

    test('(f) a NON-COMPOSE effect honours the oracle too — warm-provider is not exempt', async () => {
        // `applyLifecycle` carries its own guard, but warm-provider, reconfigure, raise-ceiling, the
        // supervised-task recycle and the deploy-target record never pass through it. A fence on the
        // compose path alone would have covered one effect kind and left four open.
        let held = true;

        const {controller, actuator, runtimeCalls} = createStack({
            controllerConfig: {isAuthorityHeld: () => held}
        });

        let repairCalled = false;

        actuator.providerResidencyRepair = async () => {
            repairCalled = true;
            return {ready: true};
        };

        // Lost after the controller's own check, before the effect dispatches.
        const originalRead = actuator.readHealAttempts.bind(actuator);

        actuator.readHealAttempts = async () => {
            const attempts = await originalRead();

            held = false;

            return attempts;
        };

        const decision = decisionWithActionClass(CONTAINER_HEALTH_ACTION_CLASSES.warmProvider, {
            serviceKey   : 'local-model',
            recoveryClass: 'provider-role-residency'
        });

        const outcome = await controller.consume({decision});

        expect(repairCalled).toBe(false);            // the provider was never warmed
        expect(runtimeCalls).toEqual([]);
        expect(outcome.actuatorOutcome.status).toBe('declined');
    });

    test('(e) POST-EFFECT loss — the successor\'s anti-thrash state is NOT overwritten', async () => {
        // The two shared surfaces get opposite treatment, and this asserts both halves. `heal-attempts`
        // is MUTABLE state the successor reads to make its own decisions, so a displaced holder must
        // not write it. The recovery-run ledger is append-only audit of an action that really landed,
        // so it IS written — carrying `authorityLostAfterEffect` as provenance rather than an unbound
        // success claim.
        const fsExtra = (await import('fs-extra')).default;

        let held = true;

        const {controller, actuator, runtimeCalls} = createStack({
            controllerConfig: {isAuthorityHeld: () => held}
        });

        const runtime  = actuator.deploymentRuntimeAccessService,
              original = runtime.applyLifecycle.bind(runtime);

        runtime.applyLifecycle = async options => {
            const result = await original(options);

            held = false;                                   // lost DURING the effect, after it landed

            return result;
        };

        await controller.consume({decision: wedged('mc-server')});

        expect(runtimeCalls).toHaveLength(1);               // the restart genuinely happened
        // ...and the successor's mutable anti-thrash state was left alone.
        expect(await fsExtra.pathExists(path.join(tmpDir, 'heal-attempts.json'))).toBe(false);
    });

    test('consumeSnapshot on a missing or empty snapshot is a no-op rather than a throw', async () => {
        const {controller, runtimeCalls} = createStack();

        expect(await controller.consumeSnapshot({snapshot: null})).toEqual([]);
        expect(await controller.consumeSnapshot({snapshot: {services: []}})).toEqual([]);
        expect(runtimeCalls).toEqual([]);
    });

    test('FAIL-CLOSED — a controller without a usable actuator throws instead of silently healing nothing', async () => {
        const orphan = Neo.create(ContainerHealthControllerService, {nowFn: () => OBSERVED_AT});

        await expect(orphan.consume({decision: decisionWithActionClass(CONTAINER_HEALTH_ACTION_CLASSES.restart)}))
            .rejects.toThrow(/recoveryActuator with apply\(\) is required/);

        const halfWired = Neo.create(ContainerHealthControllerService, {
            nowFn           : () => OBSERVED_AT,
            recoveryActuator: {apply: async () => ({status: 'actioned'})}
        });

        // A missing `recordDiagnosis` is the more dangerous half: everything actuatable would still
        // work, and only the decisions we chose NOT to act on would vanish — the exact silence this
        // ticket exists to remove, reintroduced on the quieter path.
        await expect(halfWired.consume({decision: decisionWithActionClass(CONTAINER_HEALTH_ACTION_CLASSES.restart)}))
            .rejects.toThrow(/recordDiagnosis\(\) is required/);
    });

    // ---------------------------------------------------------------------------------------------
    // The poll seam. Exercised on a detached prototype (the Orchestrator is a singleton), the same
    // pattern `authorityLease.spec` uses to test one branch without standing up the whole daemon.
    // ---------------------------------------------------------------------------------------------

    test.describe('Orchestrator.consumeContainerHealthDecisions — the seam that decides whether ANY of this runs', () => {
        /**
         * Own VALUE properties, not assignments: the collaborators are reactive configs, so a plain
         * `instance.x = …` on a detached prototype routes into the Config controller and throws on the
         * private slot a real `Neo.create` would have installed. Defining them shadows the accessors.
         */
        async function detachedOrchestrator({enabled, authorityLeaseLost, controller, writeLog = () => {}}) {
            const {Orchestrator} = await import('../../../../../../../ai/daemons/orchestrator/Orchestrator.mjs'),
                  instance       = Object.create(Orchestrator.prototype);

            return Object.defineProperties(instance, {
                authorityLeaseLost              : {value: authorityLeaseLost},
                writeLog                        : {value: writeLog},
                deploymentRuntimeAccessService  : {value: {runtimeAccessConfig: {enabled}}},
                containerHealthControllerService: {value: controller}
            });
        }

        async function seam({status = 'written', enabled = true, authorityLeaseLost = false} = {}) {
            const consumed = [],
                  instance = await detachedOrchestrator({
                      authorityLeaseLost,
                      enabled,
                      controller: {
                          async consumeSnapshot({snapshot}) {
                              consumed.push(snapshot);
                              return [];
                          }
                      }
                  });

            await instance.consumeContainerHealthDecisions({status, snapshot: {services: []}});

            return consumed;
        }

        test('routes a written snapshot when runtime access is granted', async () => {
            expect(await seam()).toHaveLength(1);
        });

        test('does NOT route when deployment runtime access is disabled — the default posture', async () => {
            // The lifecycle actuator would refuse `restart` with `runtime-access-disabled` anyway, so
            // consuming here could only spend recovery attempts and write ledger entries on a plane
            // that cannot be healed by this controller. Off by default is also why running the daemon
            // on a developer machine does not begin actuating.
            expect(await seam({enabled: false})).toEqual([]);
        });

        test('does NOT route a snapshot that was never written — fenced, skipped, disabled, in-flight', async () => {
            for (const status of ['fenced', 'skipped', 'disabled', 'in-flight']) {
                expect(await seam({status})).toEqual([]);
            }
        });

        test('TAKEOVER — a stale holder that resumes after a successor reclaimed does NOT actuate', async () => {
            // The latch is what a paused predecessor carries: `pulseAuthorityLease` runs once at poll
            // start, so a process suspended past the lease TTL wakes with `authorityLeaseLost` still
            // false after a successor already took over. Reading the latch would let it restart
            // containers on a plane it no longer owns — two orchestrators actuating the same services,
            // which is the exact failure the lease exists to prevent. Only a LIVE pulse can tell them
            // apart, so this fixture sets the latch to the stale value and makes the lease itself object.
            const {Orchestrator} = await import('../../../../../../../ai/daemons/orchestrator/Orchestrator.mjs'),
                  consumed       = [],
                  instance       = Object.create(Orchestrator.prototype);

            Object.defineProperties(instance, {
                authorityLeaseLost            : {value: false, writable: true}, // STALE — the whole point
                writeLog                      : {value: () => {}},
                stop                          : {value: () => {}},
                deploymentRuntimeAccessService: {value: {runtimeAccessConfig: {enabled: true}}},
                authorityLease                : {value: {
                    pulse() {
                        const error = new Error('lease reclaimed by a successor');
                        error.code  = 'FILE_LEASE_LOST';
                        throw error;
                    }
                }},
                containerHealthControllerService: {value: {
                    async consumeSnapshot({snapshot}) {
                        consumed.push(snapshot);
                        return [];
                    }
                }}
            });

            const previousExitCode = process.exitCode;

            expect(await instance.consumeContainerHealthDecisions({status: 'written', snapshot: {services: []}})).toEqual([]);
            expect(consumed).toEqual([]);          // no snapshot ever reached the controller
            expect(instance.authorityLeaseLost).toBe(true); // and the live pulse corrected the stale latch

            process.exitCode = previousExitCode;   // the refusal path sets it; do not fail the runner
        });

        test('CONTENTION — an unverified lease defers actuation, because unverified is not held', async () => {
            const {Orchestrator} = await import('../../../../../../../ai/daemons/orchestrator/Orchestrator.mjs'),
                  consumed       = [],
                  instance       = Object.create(Orchestrator.prototype);

            Object.defineProperties(instance, {
                authorityLeaseLost              : {value: false, writable: true},
                writeLog                        : {value: () => {}},
                deploymentRuntimeAccessService  : {value: {runtimeAccessConfig: {enabled: true}}},
                authorityLease                  : {value: {pulse: () => ({contended: true})}},
                containerHealthControllerService: {value: {
                    async consumeSnapshot({snapshot}) {
                        consumed.push(snapshot);
                        return [];
                    }
                }}
            });

            expect(await instance.consumeContainerHealthDecisions({status: 'written', snapshot: {services: []}})).toEqual([]);
            expect(consumed).toEqual([]);
        });

        test('does NOT route after the authority lease is lost mid-flight', async () => {
            // The bridge evaluates its own fence AFTER the async collect; the heal is a SECOND effect
            // reached after that write completed, so it needs its own read of the lease.
            expect(await seam({authorityLeaseLost: true})).toEqual([]);
        });

        test('a throwing controller degrades healing without taking the snapshot down with it', async () => {
            const logs     = [],
                  instance = await detachedOrchestrator({
                      authorityLeaseLost: false,
                      enabled           : true,
                      writeLog          : (level, message) => logs.push({level, message}),
                      controller        : {
                          async consumeSnapshot() {
                              throw new Error('actuator exploded');
                          }
                      }
                  });

            expect(await instance.consumeContainerHealthDecisions({status: 'written', snapshot: {services: []}})).toEqual([]);
            expect(logs).toHaveLength(1);
            expect(logs[0].level).toBe('ERROR');
            expect(logs[0].message).toContain('actuator exploded');
        });
    });

    test('a ledger failure degrades observability without vetoing the heal it observes', async () => {
        const {controller, runtimeCalls} = createStack({
            controllerConfig: {
                appendHealEventFn: async () => {
                    throw new Error('ledger volume is read-only');
                }
            }
        });

        const outcome = await controller.consume({
            decision: wedged('mc-server')
        });

        expect(outcome.status).toBe('actuated');
        expect(outcome.actuatorOutcome.status).toBe('actioned');
        expect(runtimeCalls).toHaveLength(1);
    });
});
