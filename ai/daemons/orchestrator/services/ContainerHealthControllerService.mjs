import Base from '../../../../src/core/Base.mjs';

import {appendHealEvent}                 from '../../../services/memory-core/helpers/healEventLedgerStore.mjs';
import {createRecoveryDiagnosisEvent}    from '../../../services/memory-core/helpers/recoveryRunStateStore.mjs';
import {CONTAINER_HEALTH_ACTION_CLASSES} from './ContainerHealthDiagnosisService.mjs';

/**
 * @module ai/daemons/orchestrator/services/ContainerHealthControllerService
 * @summary The reactive controller for the container-lifecycle world — the missing edge between a
 * container-health diagnosis and the recovery actuator. It maps a diagnosis class to one already-
 * admitted action and hands it to the actuator; it decides nothing else.
 *
 * Before this existed the lifecycle pipeline ran `observe → classify → record → (stop)`. The detect
 * half emitted `container-unhealthy` as a `critical`, `authoritative` fact and the actuator's
 * `apply(serviceKey, action)` was shipped, admission-gated and anti-thrash-enveloped — and no code path
 * joined them. The data-integrity world has had its controller since `DataIntegrityDiagnosisService`
 * (`applyHeal` at its routing site); this is the lifecycle sibling, and it is deliberately the same
 * shape: gather nothing, classify nothing, only ROUTE an already-made decision to an already-bounded
 * actuator.
 *
 * **Routing is a total, enumerated function** ({@link CONTAINER_HEALTH_ACTION_ROUTES}), never a default
 * with exceptions. Every member of `CONTAINER_HEALTH_ACTION_CLASSES` has a row, an unrecognised class
 * routes to record-with-diagnosis rather than to any action, and adding an action class without a row
 * fails a spec instead of silently acquiring the behaviour of whichever branch it falls through to.
 * ADR-0026 AC-9 forbids widening the closed action set from an implementation sub, so this class // ticket-ref-ok: the ADR clause is the binding constraint on this class's authority, not background reading
 * cannot name an action the actuator does not already admit — the route table's `actuatorAction`
 * values are a SUBSET of the actuator's own `DEFAULT_ACTIONS`, asserted by spec.
 *
 * **What keeps a controller from being a thrash engine is not in this file, on purpose.** The token
 * bucket, the exponential backoff and the alarm-only terminal all live inside
 * `RecoveryActuatorService.apply`, so a repeating diagnosis marches into `attempt-cap-reached` no
 * matter how often it is consumed. A second envelope here would be a second thing to keep correct and
 * a second place for the two to disagree. The debounce that keeps a *working* service from being
 * restarted is likewise upstream: the diagnosis keys on the container runtime's own `unhealthy`
 * verdict, which the runtime only sets after `retries` consecutive probe failures — on the healthcheck
 * tuning these MCP services actually ship (`interval: 60s`, `retries: 5`) that is **five minutes of
 * sustained failure** before a single fact is even created.
 *
 * All collaborators are injected (actuator, ledger writer, clock, log), so the unit is pure-testable
 * and the AiConfig SSOT leaves are read at the orchestrator use-site rather than re-derived here.
 *
 * @see ai/daemons/orchestrator/services/DataIntegrityDiagnosisService.mjs
 * @see ai/daemons/orchestrator/services/RecoveryActuatorService.mjs
 * @see learn/agentos/decisions/0026-recovery-actuator.md
 */

/**
 * @summary The complete diagnosis-class → action map, as data rather than as control flow.
 *
 * A row with a non-null `actuatorAction` is actuated through `RecoveryActuatorService.apply`; a row
 * with `actuatorAction: null` is a diagnosis we have deliberately decided NOT to act on, and it routes
 * to record-with-diagnosis carrying the `reasonCode` that says why. The distinction between "no rule
 * covers this" and "the rule is: do not act" is the whole point of the table — the first is a gap and
 * the second is a decision, and a controller that expressed both as a fall-through could not tell an
 * operator which one they were looking at.
 *
 * The non-actuated rows are not oversights:
 *
 * - **`throttle-shed` is admitted by nothing.** The actuator's closed set is `reconfigure` / `restart`
 *   / `redeploy` / `warm-provider` / `raise-ceiling`, and shed is in none of them, while
 *   `exhaustion`-non-store and `contention` both emit it. Inventing an action to carry it here is
 *   exactly what ADR-0026 AC-9 forbids. That gap is real and is someone's ticket; it is not this // ticket-ref-ok: the ADR clause is what makes inventing an action illegal here
 *   controller's licence.
 * - **`record` is already the terminal.** Routing it back through an actuator action would turn a
 *   diagnosis whose policy is "observe only" into a privileged effect.
 *
 * `raise-ceiling` is the contrasting actuated row. The controller names only the semantic
 * `container-memory-ceiling` knob; it never names the `deploy.*` leaf or its value. The closed registry
 * owns the 8 → 16 GiB step policy and the actuator resolves it against the live Docker limit, preserving
 * the knob boundary while closing the former record-only gap.
 *
 * @type {Object}
 */
export const CONTAINER_HEALTH_ACTION_ROUTES = Object.freeze({
    [CONTAINER_HEALTH_ACTION_CLASSES.restart]: Object.freeze({
        actuatorAction: 'restart',
        reasonCode    : 'container-health-restart'
    }),
    [CONTAINER_HEALTH_ACTION_CLASSES.warmProvider]: Object.freeze({
        actuatorAction: 'warm-provider',
        reasonCode    : 'container-health-warm-provider'
    }),
    [CONTAINER_HEALTH_ACTION_CLASSES.raiseCeiling]: Object.freeze({
        actuatorAction: 'raise-ceiling',
        knob          : 'container-memory-ceiling',
        reasonCode    : 'container-health-raise-ceiling'
    }),
    [CONTAINER_HEALTH_ACTION_CLASSES.throttleShed]: Object.freeze({
        actuatorAction: null,
        reasonCode    : 'throttle-shed-has-no-admitted-action'
    }),
    [CONTAINER_HEALTH_ACTION_CLASSES.record]: Object.freeze({
        actuatorAction: null,
        reasonCode    : 'diagnosis-record'
    })
});

/**
 * @summary The reason code for an action class no row covers — a gap, never a default action.
 * @member {String} UNMAPPED_ACTION_CLASS_REASON_CODE
 */
export const UNMAPPED_ACTION_CLASS_REASON_CODE = 'unmapped-action-class';

/**
 * @class Neo.ai.daemons.services.ContainerHealthControllerService
 * @extends Neo.core.Base
 * @see ai/daemons/orchestrator/services/ContainerHealthDiagnosisService.mjs
 * @see learn/agentos/decisions/0025-orchestrator-container-health-self-healing.md
 * @see learn/agentos/decisions/0026-recovery-actuator.md
 */
export class ContainerHealthControllerService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.daemons.services.ContainerHealthControllerService'
         * @protected
         */
        className: 'Neo.ai.daemons.services.ContainerHealthControllerService'
    }

    /**
     * The B1 recovery actuator exposing `apply(serviceKey, action, options)` and
     * `recordDiagnosis(event, options)`. Every route ends at one of those two, and both carry the
     * durable ledger + anti-thrash envelope this class deliberately does not reimplement. Set-once
     * injected dependency — a plain class field, never reassigned or observed, so the reactive
     * Config-controller machinery would be pure overhead.
     * @member {Object|null} recoveryActuator=null
     */
    recoveryActuator = null
    /**
     * Durable heal-event ledger directory — the shared immune-system status surface the deployment
     * snapshot's `selfHeal` section folds. Injected from the orchestrator's owning leaf rather than
     * re-derived, so writer and reader bind to one path. `null` disables the controller's own ledger
     * write; routing still happens (observability degrades, actuation never does).
     * @member {String|null} healLedgerDir=null
     */
    healLedgerDir = null
    /**
     * Heal-ledger retention (`{maxEvents, triggerBytes}`), validated at the orchestrator use-site.
     * Set-once injected dependency — a plain class field.
     * @member {Object|null} healLedgerRetention=null
     */
    healLedgerRetention = null
    /**
     * Ledger-append seam for deterministic tests; falls back to the durable `appendHealEvent`.
     * Set-once injected dependency — a plain class field.
     * @member {Function|null} appendHealEventFn=null
     */
    appendHealEventFn = null
    /**
     * The current-clock injection seam for deterministic tests; falls back to `Date.now()`.
     * Set-once injected dependency — a plain class field.
     * @member {Function|null} nowFn=null
     */
    nowFn = null
    /**
     * Daemon log sink, `(level, message) => void`. Set-once injected dependency — a plain class field.
     * @member {Function|null} writeLog=null
     */
    writeLog = null
    /**
     * Per-effect authority predicate, `() => Boolean`. Re-asked before EVERY actuation rather than once
     * per batch, because a snapshot is consumed sequentially and each service is its own privileged
     * write: authority lost while service A is restarting must stop service B, and a batch-level check
     * cannot see that. `null` → no per-effect fence (unit seams; the orchestrator always injects one).
     * @member {Function|null} isAuthorityHeld=null
     */
    isAuthorityHeld = null
    /**
     * Last-boundary effect-admission predicate, `(decision) => Boolean`. Only recovery classes whose
     * evidence can become unsafe while the actuator awaits preparation opt in.
     * @member {Function|null} isEffectStillAdmitted=null
     */
    isEffectStillAdmitted = null

    /**
     * @summary Routes every diagnosed decision in one deployment-state snapshot.
     *
     * The snapshot is the natural batch: it is the only moment the decisions exist, it is already
     * cadence-gated by the bridge's write interval, and consuming it here rather than inside the
     * bridge's collection loop keeps the actuation AFTER the caller's authority-lease fence — an
     * orchestrator that lost its lease mid-collection must not go on to restart a sibling.
     *
     * A failing route never aborts the batch: the remaining services are diagnosed in the same
     * snapshot, and the next cadence re-detects anything still unhealed.
     *
     * @param {Object} [options]
     * @param {Object|null} [options.snapshot=null] A `deployment-state-snapshot`.
     * @param {Number} [options.now=this.now()] Epoch milliseconds.
     * @returns {Promise<Object[]>} One outcome per service entry, in snapshot order.
     */
    async consumeSnapshot({snapshot = null, now = this.now()} = {}) {
        const services = Array.isArray(snapshot?.services) ? snapshot.services : [],
              outcomes = [];

        for (const service of services) {
            outcomes.push(await this.consume({decision: service?.diagnosis || null, now}));
        }

        return outcomes;
    }

    /**
     * @summary Routes ONE container-health decision to the actuator terminal its action class names.
     *
     * A decision that is not `diagnosed` is not a controller decision at all — it is the absence of
     * one — so it returns `no-decision` and writes nothing. That distinction is what keeps the
     * heal-event ledger readable: after this change `selfHeal.total: 0` means "nothing was diagnosed",
     * a claim it genuinely could not make before, when it also covered "something was diagnosed and
     * nothing consumed it".
     *
     * @param {Object} [options]
     * @param {Object|null} [options.decision=null] A `container-health-diagnosis-decision`.
     * @param {Number} [options.now=this.now()] Epoch milliseconds.
     * @returns {Promise<Object>} A `container-health-control-outcome`.
     * @throws {TypeError} when the recovery actuator collaborator is missing or malformed.
     */
    async consume({decision = null, now = this.now()} = {}) {
        this.validateDependencies();

        if (!decision || decision.status !== 'diagnosed' || !decision.diagnosis) {
            return this.createOutcome({
                actionClass: decision?.actionClass ?? null,
                consumed   : false,
                observedAt : now,
                serviceKey : decision?.serviceKey ?? null,
                status     : 'no-decision'
            });
        }

        const {actionClass, serviceKey} = decision,
              route                     = Object.hasOwn(CONTAINER_HEALTH_ACTION_ROUTES, actionClass)
                  ? CONTAINER_HEALTH_ACTION_ROUTES[actionClass]
                  : null;

        // Fail CLOSED on an unrecognised class. A future action class that reached this line without a
        // row must record rather than inherit whichever action the last branch happened to name — the
        // failure mode a `default:` would create is a privileged lifecycle write selected by omission.
        if (!route) {
            this.writeLog?.('WARN', `[ContainerHealthController] ${serviceKey}: action class '${actionClass}' has no route; recording without action.`);

            return this.recordWithoutAction({decision, now, reasonCode: UNMAPPED_ACTION_CLASS_REASON_CODE});
        }

        // Record-only routes are fenced TOO. They end in shared durable ledgers, and a displaced
        // holder writing `recorded` there is not evidence that it stopped — it is a controller-owned
        // success terminal, indistinguishable from ordinary operation by anyone reading afterwards.
        if (!route.actuatorAction) {
            return this.declineIfAuthorityLost({decision, now, actionClass}) ||
                await this.recordWithoutAction({decision, now, reasonCode: route.reasonCode});
        }

        // Re-asked HERE, immediately before the privileged write, not once for the batch. A snapshot is
        // consumed one service at a time and each actuation is its own effect, so authority lost while
        // an earlier service was restarting must stop every later one. The recording terminals above
        // carry the same fence because their shared durable ledger is successor-owned state too.
        return this.declineIfAuthorityLost({decision, now, actionClass}) ||
            await this.actuate({decision, now, route});
    }

    /**
     * @summary Applies the routed action through the actuator's bounded envelope and records the result.
     *
     * The heal-event is written HERE rather than inside `apply`, and that asymmetry with
     * {@link recordWithoutAction} is deliberate. `apply` is controller-blind and shared with
     * `ProcessSupervisorService`, so appending a heal-event inside it would silently change what every
     * existing caller writes to the shared ledger. `recordDiagnosis`, by contrast, exists only as the
     * record-with-diagnosis terminal and already appends its own — so each decision produces exactly
     * one heal-event on either path, which is the property the snapshot's `selfHeal` totals depend on.
     *
     * A throwing actuator is captured as a `failed` outcome rather than propagated: the batch must
     * survive one service's failure, and an unrecorded exception would be the one heal decision the
     * ledger could not account for.
     *
     * @param {Object} options
     * @param {Object} options.decision The diagnosed decision.
     * @param {Number} options.now Epoch milliseconds.
     * @param {Object} options.route The matched {@link CONTAINER_HEALTH_ACTION_ROUTES} row.
     * @returns {Promise<Object>}
     */
    async actuate({decision, now, route}) {
        const {actionClass, diagnosis, serviceKey} = decision,
              classificationReason                 = diagnosis.details?.classificationReason,
              reason                               = `container-health-controller:${classificationReason || route.reasonCode}`,
              needsLiveAdmission                   = classificationReason === 'ollama-residual-load-restart',
              residualEvidence                     = needsLiveAdmission
                  ? diagnosis.evidenceFacts?.find(fact => fact?.type === 'ollama-residual-load')
                  : null,
              expectedContainerId                   = residualEvidence?.details?.runtimeContainerId;

        let outcome;

        try {
            outcome = await this.recoveryActuator.apply(serviceKey, route.actuatorAction, {
                diagnosisEvent: diagnosis,
                // Passed explicitly so the actuator resolves the target the DIAGNOSIS names rather than
                // falling back to its single-candidate rule. A diagnosis naming a target the recovery
                // registry does not admit is then refused as `target-not-recoverable` instead of being
                // quietly re-aimed at whichever entry happened to be the only match for the key.
                targetIdentity: diagnosis.targetIdentity || decision.targetIdentity || null,
                now,
                reason,
                ...(route.knob ? {knob: route.knob} : {}),
                // Carried INTO the actuator so it is revalidated after its own awaited preparation,
                // immediately before the privileged effect. A check made out here is separated from
                // the effect by `readHealAttempts`, which is I/O — and an authority check with an
                // await between it and the effect does not bind the effect.
                isAuthorityHeld: this.isAuthorityHeld,
                ...(needsLiveAdmission && typeof this.isEffectStillAdmitted === 'function'
                    ? {isEffectStillAdmitted: () => this.isEffectStillAdmitted(decision)}
                    : {}),
                ...(needsLiveAdmission && typeof expectedContainerId === 'string'
                    ? {expectedContainerId}
                    : {})
            });
        } catch (error) {
            outcome = {
                action    : route.actuatorAction,
                error     : error.message,
                reasonCode: 'controller-actuation-threw',
                serviceKey,
                status    : 'failed'
            };
        }

        await this.recordHealEvent({decision, action: route.actuatorAction, now, outcome, reasonCode: route.reasonCode});

        return this.createOutcome({
            actionClass,
            actuatorAction : route.actuatorAction,
            actuatorOutcome: outcome,
            consumed       : true,
            observedAt     : now,
            reasonCode     : route.reasonCode,
            serviceKey,
            status         : 'actuated'
        });
    }

    /**
     * @summary Records a diagnosis the controller has decided NOT to act on, through the actuator's
     * record-with-diagnosis terminal.
     *
     * The actuator's `recordDiagnosis` accepts only events whose `details.actionClass` is `record`, so
     * an unactuated diagnosis such as `throttle-shed` is re-shaped rather than passed through — and
     * the original class travels along as `unactuatedActionClass` so the ledger never loses WHICH heal
     * was declined. Re-labelling it to `record` without carrying the original would turn a decision not
     * to act into a diagnosis that never wanted an action, which are different facts about the deployment.
     *
     * @param {Object} options
     * @param {Object} options.decision The diagnosed decision.
     * @param {Number} options.now Epoch milliseconds.
     * @param {String} options.reasonCode Why no action was taken.
     * @returns {Promise<Object>}
     */
    async recordWithoutAction({decision, now, reasonCode}) {
        const {actionClass, diagnosis, serviceKey} = decision;

        let outcome;

        try {
            outcome = await this.recoveryActuator.recordDiagnosis(createRecoveryDiagnosisEvent({
                ...diagnosis,
                details: {
                    ...diagnosis.details,
                    actionClass          : CONTAINER_HEALTH_ACTION_CLASSES.record,
                    reasonCode,
                    unactuatedActionClass: actionClass
                }
            }), {now, reason: reasonCode, isAuthorityHeld: this.isAuthorityHeld});
        } catch (error) {
            outcome = {
                action    : 'record',
                error     : error.message,
                reasonCode: 'controller-record-threw',
                serviceKey,
                status    : 'failed'
            };

            // `recordDiagnosis` owns the heal-event on this path, so a throw means it never landed.
            // Writing it here keeps the one-event-per-decision property from having a hole exactly
            // where the ledger is most needed.
            await this.recordHealEvent({decision, action: 'record', now, outcome, reasonCode});
        }

        return this.createOutcome({
            actionClass,
            actuatorAction : null,
            actuatorOutcome: outcome,
            consumed       : true,
            observedAt     : now,
            reasonCode,
            serviceKey,
            status         : 'recorded'
        });
    }

    /**
     * @summary Returns a declined outcome when authority is no longer held, or `null` to proceed.
     *
     * Shared by every terminal — actuated and record-only alike — because both end in durable state a
     * successor also owns. Returning `null` rather than a boolean lets each call site read as
     * `decline || proceed`, so a new terminal that forgets the fence is visible as a missing clause
     * rather than as an inverted condition.
     *
     * @param {Object} options
     * @returns {Object|null}
     */
    declineIfAuthorityLost({decision, now, actionClass}) {
        if (typeof this.isAuthorityHeld !== 'function' || this.isAuthorityHeld() === true) {
            return null;
        }

        this.writeLog?.('WARN', `[ContainerHealthController] authority lost before the ${decision.serviceKey} terminal; declining without touching shared state.`);

        return this.createOutcome({
            actionClass,
            consumed  : false,
            observedAt: now,
            reasonCode: 'authority-lost',
            serviceKey: decision.serviceKey,
            status    : 'declined'
        });
    }

    /**
     * @summary Appends one heal-event describing what the controller did with a decision.
     *
     * The event's `status` is the actuator's own outcome status verbatim (`actioned` / `deferred` /
     * `rejected` / `recorded` / `failed`) rather than a controller vocabulary, so `summarizeHealLedger`
     * folds one status space and an anti-thrash deferral stays distinguishable from a refusal. A ledger
     * failure is logged and swallowed: observability must never veto the heal it is observing.
     * When this controller has a live authority oracle, the same oracle travels into the store so the
     * append is revalidated after its awaited directory setup, not only at the preflight below.
     *
     * @param {Object} options
     * @returns {Promise<void>}
     */
    async recordHealEvent({decision, action, now, outcome, reasonCode}) {
        if (!this.healLedgerDir) {
            return;
        }

        // The controller's own receipt is written AFTER an awaited `apply()`, so authority can have
        // moved since the effect. A success entry written past that point is unbound: it names this
        // instance as the actor in a ledger the successor now owns, and reads as the current holder's
        // work. If the action genuinely landed while authority was held, the actuator's own
        // recovery-run entry already records it — this receipt is the redundant half, so dropping it
        // loses provenance rather than the event.
        // NOT scoped to `actioned` any more. @neo-gpt: "controller receipt guarding is limited to
        // outcome.status === 'actioned'" — so a `failed`, `deferred` or `rejected` receipt still landed
        // in the successor's ledger after loss. Any owner-authoritative receipt is one, whatever the
        // outcome it reports, because the ledger entry names THIS instance as the actor either way.
        if (typeof this.isAuthorityHeld === 'function' && this.isAuthorityHeld() !== true) {
            this.writeLog?.('WARN', `[ContainerHealthController] authority lost before the ${decision.serviceKey} receipt; not writing an owner-authoritative success entry.`);

            return;
        }

        const append = this.appendHealEventFn || appendHealEvent;

        try {
            await append({
                type      : decision.diagnosis.recoveryClass,
                collection: decision.serviceKey,
                status    : outcome?.status || 'unknown',
                detail    : {
                    action,
                    actionClass   : decision.actionClass,
                    reasonCode    : outcome?.reasonCode || reasonCode,
                    recoveryRunId : outcome?.recoveryRunId || null,
                    source        : 'container-health-controller',
                    targetIdentity: decision.diagnosis.targetIdentity || decision.targetIdentity || null,
                    evidenceFacts : decision.diagnosis.evidenceFacts || []
                }
            }, {
                dir: this.healLedgerDir,
                now,
                ...(this.healLedgerRetention || {}),
                // Preserve legacy callers exactly: only an authority-bearing controller asks the
                // shared store to stamp/refuse this owner-authoritative receipt.
                ...(typeof this.isAuthorityHeld === 'function' ? {isAuthorityHeld: this.isAuthorityHeld} : {})
            });
        } catch (error) {
            this.writeLog?.('ERROR', `[ContainerHealthController] heal-event append failed for ${decision.serviceKey}: ${error.message}`);
        }
    }

    /**
     * @summary Builds the controller's outcome envelope.
     * @param {Object} options
     * @returns {Object}
     */
    createOutcome({
        actionClass = null,
        actuatorAction = null,
        actuatorOutcome = null,
        consumed,
        observedAt,
        reasonCode = null,
        serviceKey,
        status
    }) {
        return {
            schemaVersion: 1,
            recordType   : 'container-health-control-outcome',
            serviceKey,
            observedAt,
            status,
            consumed,
            actionClass,
            actuatorAction,
            reasonCode,
            actuatorOutcome
        };
    }

    /**
     * @summary Returns the current clock value (injected clock for tests, else wall-clock).
     * @returns {Number}
     */
    now() {
        return this.nowFn ? this.nowFn() : Date.now();
    }

    /**
     * @summary Fail-closed guard: the controller must not silently no-op on a missing actuator.
     *
     * A controller that quietly did nothing would reproduce the exact defect it was built to remove —
     * a diagnosis reaching no surface — and would do it while every status field reported success.
     *
     * @returns {void}
     * @throws {TypeError} when the actuator, or either terminal it must reach, is missing.
     */
    validateDependencies() {
        if (typeof this.recoveryActuator?.apply !== 'function') {
            throw new TypeError('ContainerHealthControllerService: recoveryActuator with apply() is required');
        }
        if (typeof this.recoveryActuator?.recordDiagnosis !== 'function') {
            throw new TypeError('ContainerHealthControllerService: recoveryActuator with recordDiagnosis() is required');
        }
    }
}

export default Neo.setupClass(ContainerHealthControllerService);
