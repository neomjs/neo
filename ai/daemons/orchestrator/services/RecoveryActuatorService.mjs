import {randomUUID} from 'node:crypto';
import fs           from 'fs-extra';
import path         from 'path';

import Base                             from '../../../../src/core/Base.mjs';
import AiConfig                         from '../../../config.mjs';
import {repairProviderRoleSetResidency} from '../../../services/graph/providerReadinessHelper.mjs';
import {
    ACTIVE_RECOVERY_RUN_RETENTION_CLASS,
    appendRecoveryRunState,
    createRecoveryDiagnosisEvent,
    createRecoveryReobserveRequest,
    createRecoveryRunStateEntry,
    createRecoveryTargetIdentity,
    readActiveRecoveryRunStates
} from '../../../services/memory-core/helpers/recoveryRunStateStore.mjs';
import {
    appendHealEvent,
    HEAL_LEDGER_DIR_NAME,
    validateHealLedgerRetention
} from '../../../services/memory-core/helpers/healEventLedgerStore.mjs';
import {
    requiredContextForKnob,
    writeKnobOverride
} from '../../../services/memory-core/helpers/recoveryOverrideStore.mjs';
import {
    knobLeafPaths,
    RECOVERY_KNOBS,
    selectAutomaticKnobTransaction
} from '../../../services/memory-core/helpers/recoveryKnobRegistry.mjs';
import {isStoreBackedService} from './ContainerHealthDiagnosisService.mjs';

const DEFAULT_ACTIONS         = Object.freeze(['reconfigure', 'restart', 'redeploy', 'warm-provider', 'raise-ceiling']);
const DEFAULT_DEPLOY_TARGETS  = Object.freeze(['cloud-deploy']);
const COMPOSE_RESTART_ACTIONS = Object.freeze(['reconfigure', 'restart']);

/**
 * @summary Normalizes string/object recovery-target entries into stable descriptors.
 *
 * String entries use the same value for `serviceKey` and `id`. Object entries may use an
 * explicit `serviceKey` plus either `id`, `taskName`, `composeService`, or `deployTarget`.
 *
 * @param {Array<String|Object>} entries Configured recovery target entries.
 * @param {String} kind Recovery target kind.
 * @returns {Object[]} Normalized target descriptors.
 */
export function normalizeRecoveryActuatorTargets(entries, kind) {
    if (!Array.isArray(entries)) {
        throw new TypeError(`Recovery actuator ${kind} targets must be an array.`);
    }

    const targets = [];

    for (const entry of entries) {
        if (typeof entry === 'string') {
            const id = entry.trim();
            if (id) {
                targets.push({kind, serviceKey: id, id});
            }
            continue;
        }

        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
            continue;
        }

        const id         = String(entry.id || entry.taskName || entry.composeService || entry.deployTarget || '').trim(),
              serviceKey = String(entry.serviceKey || id).trim();

        if (!serviceKey || !id) {
            continue;
        }

        targets.push({
            ...entry,
            kind,
            serviceKey,
            id
        });
    }

    return targets;
}

/**
 * @summary Checks whether a recovery target is blocked by the operator's opt-out list.
 * @param {Object} target Normalized target descriptor.
 * @param {Object[]} blockedTargets Normalized blocklist descriptors.
 * @returns {Boolean}
 */
export function isRecoveryActuatorTargetBlocked(target, blockedTargets) {
    return blockedTargets.some(blocked => (
        blocked.serviceKey === target.serviceKey ||
        blocked.serviceKey === target.id ||
        blocked.id         === target.serviceKey ||
        blocked.id         === target.id
    ));
}

/**
 * @class Neo.ai.daemons.services.RecoveryActuatorService
 * @extends Neo.core.Base
 *
 * B1 privileged recovery actuator (the deny-by-default privilege-boundary design). The service is controller-blind:
 * callers pass an already-selected action, and this class answers whether the recovery target
 * registry + persisted anti-thrash envelope admits it. When the action names a semantic knob but no
 * leaf values, the registry's closed automatic policy selects them here against runtime context — the
 * controller never gains config-leaf authority. Compose-service lifecycle writes are delegated to the
 * shared L0 deployment-runtime access holder, keeping Docker socket access and container identity
 * resolution out of this B1 class.
 */
export class RecoveryActuatorService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.daemons.services.RecoveryActuatorService'
         * @protected
         */
        className: 'Neo.ai.daemons.services.RecoveryActuatorService',
        /**
         * @member {Object|null} actuatorConfig_=null
         * @protected
         * @reactive
         */
        actuatorConfig_: null,
        /**
         * `null` = "resolve from the owning config leaf on read" (see `beforeGetDataDir`): a
         * leaf value in this static block would freeze at module load, not at the use site.
         * @member {String|null} dataDir_=null
         * @protected
         * @reactive
         */
        dataDir_: null,
        /**
         * `null` = derive the recovery overlay directory from the deployment-state snapshot leaf on
         * read. Tests inject a scratch directory through this bounded storage seam instead of
         * mutating the shared AiConfig singleton.
         * @member {String|null} recoveryOverrideDir_=null
         * @protected
         * @reactive
         */
        recoveryOverrideDir_: null,
        /**
         * @member {Object|null} healthService_=null
         * @protected
         * @reactive
         */
        healthService_: null,
        /**
         * @member {Object|null} deploymentRuntimeAccessService_=null
         * @protected
         * @reactive
         */
        deploymentRuntimeAccessService_: null,
        /**
         * @member {Object|null} processSupervisorService_=null
         * @protected
         * @reactive
         */
        processSupervisorService_: null,
        /**
         * @member {Function|null} writeLog_=null
         * @protected
         * @reactive
         */
        writeLog_: null,
        /**
         * @member {Function|null} providerResidencyRepair=null
         * @protected
         */
        providerResidencyRepair: null
    }

    /** @summary Resolves the active actuator config from an injected test value or Tier-1 AiConfig. */
    get cfg() {
        return this.actuatorConfig || AiConfig.orchestrator.recoveryActuator;
    }

    /** @summary Resolves the persisted anti-thrash attempt state path. */
    get healAttemptsPath() {
        return this.cfg.healAttemptsPath;
    }

    /** @summary Resolves the durable recovery-run ledger directory. */
    get recoveryRunStateDir() {
        return this.cfg.recoveryRunStateDir;
    }

    /**
     * @summary Resolves the durable heal-event ledger directory — the shared record sink for the
     * lifecycle (this actuator) and data worlds of the immune system.
     *
     * **Derived from `dataDir` + the shared `HEAL_LEDGER_DIR_NAME`, and that is a repair.** This
     * getter previously returned `dirname(recoveryRunStateDir) + '/heal-events'`, which the sentence
     * above already described as shared and was not: the data world, the deployment snapshot's
     * `selfHeal` fold, `backup.mjs` and `restore.mjs` all bind to `dataDir + 'data-heal-events'`.
     * A whole-tree search for the old path found writers here and **no production reader anywhere** —
     * so every lifecycle heal-event ever written was invisible to the immune-system status surface it
     * was written for, and was not captured by backup either. `selfHeal.total: 0` on a live plane was
     * therefore doubly uninformative.
     *
     * Binding to `dataDir` rather than to `dirname(recoveryRunStateDir)` also removes the way the two
     * could drift apart again: the run-state dir carries its own env override, so an operator moving
     * it silently re-split the ledger, while `dataDir` is the same leaf the bridge's reader resolves.
     */
    get healEventLedgerDir() {
        return path.join(this.dataDir, HEAL_LEDGER_DIR_NAME);
    }

    /**
     * @summary The heal-ledger retention policy (maxEvents + prune byte-trigger), read from the AiConfig SSOT and
     * VALIDATED at this use-site boundary. Invalid operator config fails visibly here rather than being swallowed
     * inside appendHealEvent's prune gate (which would silently let the shared observability ledger grow unbounded).
     */
    get healLedgerRetention() {
        return validateHealLedgerRetention(
            AiConfig.orchestrator.recoveryActuator.healLedger.maxEvents,
            AiConfig.orchestrator.recoveryActuator.healLedger.pruneTriggerBytes
        );
    }

    /** @summary Resolves the configured compose-service recovery blocklist. */
    get blockedComposeServices() {
        return normalizeRecoveryActuatorTargets(this.cfg.blockedComposeServices, 'compose-service');
    }

    /** @summary Resolves the configured supervised-task recovery blocklist. */
    get blockedSupervisedTasks() {
        return normalizeRecoveryActuatorTargets(this.cfg.blockedSupervisedTasks, 'supervised-task');
    }

    /** @summary Resolves the configured deploy-target recovery blocklist. */
    get blockedDeployTargets() {
        return normalizeRecoveryActuatorTargets(this.cfg.blockedDeployTargets, 'deploy-target');
    }

    /** @summary Resolves all currently-known supervised-task recovery targets except blocked ones. */
    get supervisedTaskTargets() {
        const taskNames = Object.keys(this.processSupervisorService?.taskDefinitions || {});

        return taskNames
            .map(taskName => ({
                kind      : 'supervised-task',
                serviceKey: taskName,
                id        : taskName,
                taskName
            }))
            .filter(target => !isRecoveryActuatorTargetBlocked(target, this.blockedSupervisedTasks));
    }

    /** @summary Resolves all runtime-access compose-service recovery targets except blocked ones. */
    get composeServiceTargets() {
        const runtimeAccessConfig = this.deploymentRuntimeAccessService
            ? this.deploymentRuntimeAccessService.runtimeAccessConfig
            : AiConfig.orchestrator.deploymentRuntimeAccess;

        return normalizeRecoveryActuatorTargets(runtimeAccessConfig.allowedServices, 'compose-service')
            .filter(target => !isRecoveryActuatorTargetBlocked(target, this.blockedComposeServices));
    }

    /** @summary Resolves all built-in deploy-target recovery targets except blocked ones. */
    get deployTargets() {
        return normalizeRecoveryActuatorTargets(DEFAULT_DEPLOY_TARGETS, 'deploy-target')
            .filter(target => !isRecoveryActuatorTargetBlocked(target, this.blockedDeployTargets));
    }

    /**
     * @summary Applies one bounded recovery action if the target registry and anti-thrash envelope admit it.
     *
     * @param {String} serviceKey Stable recovery target key.
     * @param {String} action reconfigure | restart | redeploy | warm-provider | raise-ceiling.
     * @param {Object} [options]
     * @param {Object|null} [options.diagnosisEvent=null] Optional structured diagnosis event.
     * @param {Object|null} [options.targetIdentity=null] Optional typed target identity.
     * @param {String|null} [options.recoveryRunId=null] Optional stable recovery run id.
     * @param {Number} [options.now=Date.now()] Epoch milliseconds.
     * @param {String|null} [options.reason=null] Operator/controller reason.
     * @param {Function|null} [options.isEffectStillAdmitted=null] Last-boundary effect predicate.
     * @param {String|null} [options.expectedContainerId=null] Diagnosed container incarnation.
     * @returns {Promise<Object>} Action outcome descriptor.
     */
    async apply(serviceKey, action, {
        diagnosisEvent = null,
        targetIdentity = null,
        recoveryRunId = null,
        now = Date.now(),
        reason = null,
        // Current-authority oracle, `() => Boolean`, revalidated INSIDE this method immediately before
        // the privileged effect. Optional so existing callers are unchanged; a caller that omits it
        // keeps today's behaviour exactly.
        isAuthorityHeld = null,
        isEffectStillAdmitted = null,
        expectedContainerId = null,
        // `reconfigure` and `raise-ceiling` consume these. A controller names a KNOB, never a config
        // leaf — the transaction boundary belongs to the closed set, so a caller cannot compose an
        // arbitrary group of leaves and have it applied as one. `raise-ceiling` may omit values to
        // invoke the knob's registry-owned automatic policy; `reconfigure` remains caller-authored.
        knob = null,
        knobValues = null
    } = {}) {
        if (typeof serviceKey !== 'string' || serviceKey.length === 0) {
            throw new TypeError('RecoveryActuatorService.apply: serviceKey is required');
        }

        // ENTRY. Every branch below this line that returns early — unsupported action, disabled
        // actuator, unrecoverable target, action-not-allowed, and the anti-thrash gate — reaches
        // `finishAction`, which appends to the successor's recovery-run ledger. None of them lands an
        // effect, so none has the post-effect audit rationale that justifies the provenance-marked
        // write further down. A displaced holder must reach none of them.
        if (typeof isAuthorityHeld === 'function' && isAuthorityHeld() !== true) {
            return {status: 'declined', reasonCode: 'authority-lost', serviceKey, action};
        }
        if (!DEFAULT_ACTIONS.includes(action)) {
            return this.rejectAction({serviceKey, action, now, reasonCode: 'unsupported-action', targetIdentity});
        }
        if (this.cfg.enabled !== true) {
            return this.rejectAction({serviceKey, action, now, reasonCode: 'actuator-disabled', targetIdentity});
        }

        const target = this.resolveTarget({serviceKey, action, targetIdentity});

        if (!target) {
            return this.rejectAction({serviceKey, action, now, reasonCode: 'target-not-recoverable', targetIdentity});
        }

        if (!this.isActionAllowedForTarget({action, target})) {
            return this.rejectAction({serviceKey, action, now, reasonCode: 'action-not-allowed-for-target', target});
        }

        const composeRestartAction = target.kind === 'compose-service' &&
            COMPOSE_RESTART_ACTIONS.includes(action);

        if (composeRestartAction) {
            const pendingRestart = await this.readPendingRestartRun({serviceKey, target});

            if (pendingRestart) {
                return this.reconcileUncertainRestart({
                    pending: pendingRestart,
                    serviceKey,
                    action : pendingRestart.details?.action || action,
                    target,
                    now,
                    isAuthorityHeld
                });
            }
        }

        const attempts = await this.readHealAttempts();

        const gate = this.evaluateEnvelope({attempts, serviceKey, action, now});

        // REVALIDATED HERE, after the awaited preparation above and before ANY write — not by the
        // caller before `apply` was entered. `readHealAttempts` is I/O, so a caller that checked
        // authority and then awaited this method has already yielded: a GC pause or a suspended VM
        // lets a successor reclaim the lease inside that window.
        //
        // The check sits above the gate branch rather than below it because a DENIED gate writes
        // too. `finishAction` appends a recovery-run entry and persists anti-thrash state, so a
        // displaced holder returning through the denial path still overwrote the successor's state
        // and emitted an owner-authoritative record. "No effect" is not "no write".
        //
        // `evaluateEnvelope` is synchronous, so this remains the last point before the privileged
        // effect on the admitted path as well: one check, both paths, no await after it.
        if (typeof isAuthorityHeld === 'function' && isAuthorityHeld() !== true) {
            return {
                status        : 'declined',
                reasonCode    : 'authority-lost',
                serviceKey,
                action,
                targetIdentity: createRecoveryTargetIdentity({kind: target.kind, id: target.id})
            };
        }

        if (!gate.admitted) {
            return this.finishAction({
                action,
                attempts,
                attempt       : gate.attempt,
                backoffUntil  : gate.backoffUntil || null,
                diagnosisEvent: this.resolveDiagnosisEvent({diagnosisEvent, action, target, now}),
                outcome       : {
                    status        : gate.status,
                    reasonCode    : gate.reasonCode,
                    serviceKey,
                    action,
                    targetIdentity: createRecoveryTargetIdentity({kind: target.kind, id: target.id})
                },
                recoveryRunId,
                serviceKey,
                startedAt : now,
                target,
                taskStatus: gate.status === 'recorded' ? 'failed' : 'skipped',
                updatedAt : now,
                isAuthorityHeld
            });
        }

        // REVALIDATED HERE, after the awaited preparation above and immediately before the privileged
        // effect — not by the caller before `apply` was entered. `readHealAttempts` is I/O, so a caller
        // that checked authority and then awaited this method has already yielded: a GC pause or a
        // suspended VM lets a successor reclaim the lease inside that window, and the effect still
        // fires. The only check that binds an effect is the one with no await between it and the effect.
        //
        // The refusal returns BEFORE `persistAttempt` and before `finishAction`, deliberately. A
        // displaced holder must not overwrite the successor's anti-thrash state, and must not emit an
        // owner-authoritative recovery-run success entry — an unbound post-loss write is worse than no
        // record, because it reads as the current holder's action.
        if (typeof isAuthorityHeld === 'function' && isAuthorityHeld() !== true) {
            return {
                status        : 'declined',
                reasonCode    : 'authority-lost',
                serviceKey,
                action,
                targetIdentity: createRecoveryTargetIdentity({kind: target.kind, id: target.id})
            };
        }

        const startedAt   = now,
              diagnosis   = this.resolveDiagnosisEvent({diagnosisEvent, action, target, now: startedAt}),
              nextAttempt = gate.attempt + 1,
              runId       = this.getRecoveryRunId({recoveryRunId, serviceKey, action, startedAt});

        let restartDispatchMarker = null;

        const onBeforeRestartDispatch = composeRestartAction &&
            this.deploymentRuntimeAccessService?.supportsRestartDispatchInterlock === true
            ? async ({baseline, clientTimeoutMs, restartTimeoutSeconds}) => {
                  const requestedAt      = Date.now(),
                        nextBackoffAt    = this.computeBackoffUntil({attempt: nextAttempt, now: requestedAt}),
                        reobserveRequest = createRecoveryReobserveRequest({
                            recoveryRunId : runId,
                            diagnosisEvent: diagnosis,
                            requestedAt,
                            // A successor must not judge an in-flight Docker call before the
                            // observer's own response window has elapsed.
                            cooldownMs                 : Math.max(this.getVerifyCooldownMs(), clientTimeoutMs),
                            healthyObservationThreshold: this.getHealthyObservationThreshold(),
                            reason                     : 'effect-disposition-uncertain'
                        }),
                        restartReobserve = {
                            schemaVersion : 1,
                            diagnosisEvent: diagnosis,
                            baseline,
                            restartTimeoutSeconds,
                            clientTimeoutMs
                        },
                        entry = createRecoveryRunStateEntry({
                            recoveryRunId : runId,
                            diagnosisEvent: diagnosis,
                            rung          : this.getRungForTarget(target),
                            attempt       : nextAttempt,
                            status        : 'pending',
                            startedAt,
                            updatedAt     : requestedAt,
                            completedAt   : null,
                            backoffUntil  : nextBackoffAt,
                            reobserveRequest,
                            details       : {
                                status           : 'pending',
                                reasonCode       : 'restart-dispatch-pending',
                                retentionClass   : ACTIVE_RECOVERY_RUN_RETENTION_CLASS,
                                serviceKey,
                                action,
                                targetIdentity   : createRecoveryTargetIdentity({kind: target.kind, id: target.id}),
                                effectDisposition: 'uncertain',
                                restartDispatch  : {requestedAt},
                                restartReobserve
                            }
                        });

                  // This is the durable interlock, not post-hoc audit. It lands before the POST and
                  // is read by every successor. If authority moves while it is being written, the
                  // store refuses and the runtime never dispatches.
                  await this.appendRecoveryRunEntry(entry, {
                      isAuthorityHeld,
                      preserveOnAuthorityLoss: false
                  });

                  restartDispatchMarker = {reobserveRequest, restartReobserve}
              }
            : null;

        let result;

        try {
            result = await this.executeTargetAction({
                target,
                action,
                knob,
                knobValues,
                reason,
                isAuthorityHeld,
                isEffectStillAdmitted,
                expectedContainerId,
                onBeforeRestartDispatch
            });
        } catch (error) {
            // A refusal by the runtime's own authority guard is NOT an executor failure, and collapsing
            // the two writes the successor's state for an action that never happened. `runtime-authority-lost`
            // means the mutation was declined precisely BECAUSE we no longer hold authority — so there
            // is no effect to audit and no attempt to charge against a budget that is not ours.
            //
            // ONLY the explicit reason takes this branch. It is thrown by our own guards, every one
            // of which sits BEFORE its effect, so "no effect happened" is knowledge rather than
            // inference. The previous condition also took this branch whenever authority merely
            // READ as lost at catch time, which is a different and much weaker fact: a restart POST
            // dispatched under held authority, followed by a takeover and a socket reset, arrived
            // here with an ordinary transport error and was reported `declined` with no audit at
            // all. A possibly-landed restart was erased — and erased silently, which is worse than
            // a loud failure because nothing observes it.
            if (!restartDispatchMarker && (
                error?.reason === 'runtime-authority-lost' || error?.reason === 'runtime-effect-not-admitted' ||
                error?.reason === 'runtime-target-incarnation-changed'
            )
            ) {
                return {
                    status    : 'declined',
                    reasonCode: error.reason === 'runtime-authority-lost'
                        ? 'authority-lost'
                        : (error.reason === 'runtime-effect-not-admitted'
                            ? 'effect-no-longer-admitted'
                            : 'target-incarnation-changed'),
                    serviceKey,
                    action,
                    targetIdentity: createRecoveryTargetIdentity({kind: target.kind, id: target.id})
                };
            }

            // Any other error while authority is no longer held means the effect's outcome is
            // UNKNOWN, not absent. Represented on the existing `failed` terminal with structured
            // detail rather than a new terminal value: the action set is closed (ADR-0026 AC-9 — // ticket-ref-ok: the ADR is the authority forbidding a widened action set) and
            // an unknown outcome is a property of this run, not a new kind of run.
            const authorityLostAfterDispatch = typeof isAuthorityHeld === 'function' && isAuthorityHeld() !== true,
                  preparedButNotDispatched   = Boolean(restartDispatchMarker) && [
                      'runtime-authority-lost',
                      'runtime-effect-not-admitted',
                      'runtime-target-incarnation-changed'
                  ].includes(error?.reason);

            const updatedAt        = Date.now(),
                  nextBackoffAt    = this.computeBackoffUntil({attempt: nextAttempt, now: updatedAt}),
                  uncertainRestart = composeRestartAction &&
                      error?.effectDisposition === 'uncertain' && error?.restartObservationBaseline,
                  reobserveRequest = uncertainRestart
                      ? restartDispatchMarker?.reobserveRequest || createRecoveryReobserveRequest({
                            recoveryRunId              : runId,
                            diagnosisEvent             : diagnosis,
                            requestedAt                : updatedAt,
                            cooldownMs                 : this.getVerifyCooldownMs(),
                            healthyObservationThreshold: this.getHealthyObservationThreshold(),
                            reason                     : 'effect-disposition-uncertain'
                        })
                      : undefined;

            // The append-only audit below is written in BOTH cases; the mutable shared state is not.
            // A displaced holder must not charge an attempt against a budget the successor now owns
            // — that is the same reasoning the pre-effect refusal uses — but the record of a
            // possibly-landed effect belongs to the ledger regardless of who holds the lease now.
            if (!authorityLostAfterDispatch && !preparedButNotDispatched) {
                this.persistAttempt({
                    attempts,
                    serviceKey,
                    action,
                    attempt     : nextAttempt,
                    backoffUntil: nextBackoffAt,
                    now         : updatedAt,
                    status      : 'failed'
                });

                await this.writeHealAttempts(attempts, {isAuthorityHeld});
            }

            return this.finishAction({
                action,
                attempts,
                attempt       : nextAttempt,
                backoffUntil  : nextBackoffAt,
                diagnosisEvent: diagnosis,
                outcome       : {
                    status    : preparedButNotDispatched ? 'declined' : 'failed',
                    reasonCode: preparedButNotDispatched
                        ? 'restart-effect-not-dispatched'
                        : error?.reason === 'runtime-effect-partially-applied'
                        ? 'effect-no-longer-admitted-after-partial'
                        : error?.reason === 'runtime-effect-disposition-uncertain'
                            ? (error?.restartObservationBaseline
                                ? 'restart-effect-disposition-uncertain'
                                : 'effect-no-longer-admitted-after-uncertain-attempt')
                            : 'executor-failed',
                    serviceKey,
                    action,
                    targetIdentity: createRecoveryTargetIdentity({kind: target.kind, id: target.id}),
                    error         : error.message,
                    // `not-applied` is a claim; `uncertain` is the absence of one. A reader that
                    // cannot tell them apart will assume the effect did not happen, which is the
                    // assumption that makes a duplicate restart look safe.
                    effectDisposition         : preparedButNotDispatched
                        ? 'not-applied'
                        : error?.effectDisposition || (authorityLostAfterDispatch ? 'uncertain' : 'not-applied'),
                    ...(error?.restartObservationBaseline
                        ? {
                            restartObservationBaseline: error.restartObservationBaseline,
                            restartDispatch           : {
                                requestedAt: restartDispatchMarker?.reobserveRequest?.requestedAt ?? null
                            },
                            restartReobserve          : {
                                schemaVersion        : 1,
                                diagnosisEvent       : diagnosis,
                                baseline             : error.restartObservationBaseline,
                                restartTimeoutSeconds: restartDispatchMarker?.restartReobserve?.restartTimeoutSeconds ?? null,
                                clientTimeoutMs      : restartDispatchMarker?.restartReobserve?.clientTimeoutMs ?? null
                            }
                        }
                        : {}),
                    ...(uncertainRestart
                        ? {retentionClass: ACTIVE_RECOVERY_RUN_RETENTION_CLASS}
                        : {}),
                    ...(error?.providerResidency ? {providerResidency: error.providerResidency} : {}),
                    authorityLostAfterDispatch
                },
                recoveryRunId              : runId,
                serviceKey,
                startedAt,
                target,
                taskStatus                 : preparedButNotDispatched ? 'skipped' : 'failed',
                updatedAt,
                isAuthorityHeld,
                reobserveRequest,
                settlesPreDispatchInterlock: preparedButNotDispatched
            });
        }

        // From this point onward the executor returned successfully. Persistence and audit failures
        // are deliberately OUTSIDE the executor-classification catch above: no later bookkeeping
        // failure may rewrite a known-applied effect as pre-dispatch `not-applied`. For production
        // compose restarts, a failed mutable-state commit therefore leaves the pre-POST ledger
        // interlock latest so a successor re-observes before any further POST.
        const updatedAt       = Date.now(),
              nextBackoffAt   = this.computeBackoffUntil({attempt: nextAttempt, now: updatedAt}),
              heldAfterEffect = typeof isAuthorityHeld !== 'function' || isAuthorityHeld() === true;

        // POST-EFFECT, and the two shared surfaces get OPPOSITE treatment on purpose. Mutable
        // anti-thrash state is successor-owned and fenced; the append-only action audit survives a
        // takeover with explicit provenance because the effect genuinely landed.
        if (heldAfterEffect) {
            this.persistAttempt({
                attempts,
                serviceKey,
                action,
                attempt     : nextAttempt,
                backoffUntil: nextBackoffAt,
                now         : updatedAt,
                status      : target.kind === 'deploy-target' ? 'recorded' : 'actioned'
            });
            await this.writeHealAttempts(attempts, {isAuthorityHeld});
        } else {
            this.writeLog?.('WARN', `[RecoveryActuator] Authority moved during the ${serviceKey} ${action}; not writing the successor's heal-attempt state.`);
        }

        return this.finishAction({
            action,
            attempts,
            attempt       : nextAttempt,
            backoffUntil  : nextBackoffAt,
            diagnosisEvent: diagnosis,
            outcome       : {
                status        : target.kind === 'deploy-target' ? 'recorded' : 'actioned',
                serviceKey,
                action,
                targetIdentity: createRecoveryTargetIdentity({kind: target.kind, id: target.id}),
                ...(heldAfterEffect ? {} : {authorityLostAfterEffect: true}),
                ...(restartDispatchMarker
                    ? {
                        restartDispatch: {
                            requestedAt: restartDispatchMarker.reobserveRequest.requestedAt
                        }
                    }
                    : {}),
                runtimeAccess    : result.runtimeAccess || null,
                supervisor       : result.supervisor || null,
                recorded         : result.recorded || null,
                providerResidency: result.providerResidency || null,
                ceilingRaise     : result.ceilingRaise || null
            },
            recoveryRunId: runId,
            serviceKey,
            startedAt,
            target,
            taskStatus   : 'completed',
            updatedAt,
            isAuthorityHeld
        });
    }

    /**
     * @summary Records a diagnosis to the durable heal-event ledger without executing a privileged
     * recovery action — the **record-with-diagnosis** terminal of the operatorless self-heal loop.
     *
     * An operatorless cloud deploy has no human to page, so an un-healable / alarm-only lifecycle
     * diagnosis is written to the shared heal-event ledger (durable async-audit, never a blocking page)
     * and recorded as `recorded`; the recovery-run ledger still captures the outcome. This sink accepts
     * only controller-produced alarm diagnoses; it never coerces a supervised task into a privileged action.
     *
     * @param {Object} diagnosisEvent Recovery diagnosis event with `details.actionClass = 'record'`.
     * @param {Object} [options]
     * @param {String|null} [options.recoveryRunId=null] Optional stable recovery run id.
     * @param {Number} [options.now=Date.now()] Epoch milliseconds.
     * @param {String|null} [options.reason=null] Controller reason.
     * @param {Function|null} [options.isAuthorityHeld=null] Live authority oracle carried into both
     * durable stores so each can sample adjacent to its own append.
     * @returns {Promise<Object>} Record outcome descriptor.
     */
    async recordDiagnosis(diagnosisEvent, {
        recoveryRunId = null,
        now = Date.now(),
        reason = null,
        isAuthorityHeld = null
    } = {}) {
        // The heal-event ledger and the recovery-run ledger are SHARED durable state, and that is what
        // makes this a fence rather than bookkeeping. An earlier revision left this terminal open on
        // the argument that losing the record would erase the evidence an instance stopped acting.
        // The argument does not survive reading what it actually writes: `status: 'recorded'` is a
        // controller-owned success terminal, indistinguishable from ordinary operation, so a displaced
        // holder was not leaving evidence of stopping — it was writing into the successor's ledger as
        // though it were still the authority.
        if (typeof isAuthorityHeld === 'function' && isAuthorityHeld() !== true) {
            return {
                status    : 'declined',
                reasonCode: 'authority-lost'
            };
        }

        let diagnosis;

        try {
            diagnosis = createRecoveryDiagnosisEvent(diagnosisEvent);
        } catch (error) {
            return {
                status    : 'rejected',
                reasonCode: 'invalid-diagnosis',
                error     : error.message
            };
        }

        if (diagnosis.details?.actionClass !== 'record') {
            return {
                status        : 'rejected',
                reasonCode    : 'diagnosis-not-recordable',
                targetIdentity: diagnosis.targetIdentity
            };
        }

        const serviceKey = diagnosis.targetIdentity.id,
              target     = {
                  kind: diagnosis.targetIdentity.kind,
                  serviceKey,
                  id  : serviceKey
              },
              reasonCode = diagnosis.details.reasonCode || reason || 'diagnosis-record';

        // Record-with-diagnosis: durable async-audit to the shared heal-event ledger, never a blocking
        // page (an operatorless cloud has no human to page). The lifecycle and data worlds share this
        // sink for the immune-system status surface (summarizeHealLedger).
        await appendHealEvent({
            type      : diagnosis.recoveryClass,
            collection: serviceKey,
            status    : 'recorded',
            detail    : {
                // The DIAGNOSIS's own details ride into the record. Without them this terminal wrote
                // that something was recorded but never what — and for a controller that declined an
                // action, the declined class is the entire content of the record. The explicit keys
                // below still win, so no existing field changes meaning.
                ...diagnosis.details,
                reasonCode,
                targetIdentity: createRecoveryTargetIdentity(diagnosis.targetIdentity),
                evidenceFacts : diagnosis.evidenceFacts || []
            }
        }, {
            dir: this.healEventLedgerDir,
            now,
            ...this.healLedgerRetention,
            // The entry check above precedes an awaited directory setup inside the store. Carry the
            // oracle to that source boundary so a takeover during setup refuses this owner-success
            // audit instead of leaving an unqualified `recorded` row.
            isAuthorityHeld
        });

        const updatedAt = Date.now();

        return this.finishAction({
            action        : 'record',
            attempt       : 1,
            backoffUntil  : null,
            diagnosisEvent: diagnosis,
            outcome       : {
                status        : 'recorded',
                reasonCode,
                serviceKey,
                action        : 'record',
                targetIdentity: createRecoveryTargetIdentity(diagnosis.targetIdentity)
            },
            recoveryRunId,
            serviceKey,
            startedAt : now,
            target,
            taskStatus: 'failed',
            updatedAt,
            // The SECOND append of this method. The entry check above is separated from it by an
            // awaited `appendHealEvent`, so it cannot bind this one; `finishAction` re-samples and
            // the store stamps `heldAtWrite`. A record-only terminal dispatched nothing, so it
            // refuses rather than being preserved.
            isAuthorityHeld
        });
    }

    /**
     * @summary Resolves the runtime-state directory from the owning config leaf when no explicit
     * value was set — a per-read use-site resolution, never a module-load capture.
     * @param {String|null} value
     * @returns {String}
     */
    beforeGetDataDir(value) {
        return value ?? AiConfig.orchestrator.dataDir
    }

    /**
     * @summary Resolves the writer-owned recovery overlay directory from the deployment-state SSOT
     * when no explicit test boundary was injected.
     * @param {String|null} value
     * @returns {String}
     */
    beforeGetRecoveryOverrideDir(value) {
        return value ?? path.dirname(AiConfig.orchestrator.deploymentStateBridge.snapshotPath)
    }

    /**
     * @summary Resolves the strict recovery target entry for a service key and optional identity.
     * @param {Object} options
     * @returns {Object|null}
     */
    resolveTarget({serviceKey, targetIdentity}) {
        const candidates = [
            ...this.composeServiceTargets,
            ...this.supervisedTaskTargets,
            ...this.deployTargets
        ].filter(target => target.serviceKey === serviceKey || target.id === serviceKey);

        if (targetIdentity) {
            return candidates.find(target => (
                target.kind === targetIdentity.kind && target.id === targetIdentity.id
            )) || null;
        }

        return candidates.length === 1 ? candidates[0] : null;
    }

    /**
     * @summary Checks the closed action set against the target kind.
     * @param {Object} options
     * @returns {Boolean}
     */
    isActionAllowedForTarget({action, target}) {
        // `reconfigure` is compose-service only: it lands a durable overlay on a mount the target reads
        // at boot, and a supervised in-process child has no such mount to read from. Admitting it there
        // would write a file nothing consults and report success over it.
        if (target.kind === 'compose-service') {
            // `raise-ceiling` is additionally STORE-classed only. The action's premise — the corpus is
            // the workload, nothing sheds, a restart is the harm — is a property of store-backed
            // services, and the classification is DECLARED (SERVICE_CLASS_BY_KEY), so the admission
            // matrix can enforce its own row mechanically. A transient service under memory pressure
            // has arrival rate to shed; widening its ceiling would spend host memory to mask the
            // signal the correct heal responds to.
            if (action === 'raise-ceiling') {
                return isStoreBackedService(target.id);
            }

            return action === 'reconfigure' || action === 'restart' || action === 'warm-provider';
        }

        if (target.kind === 'supervised-task') {
            return action === 'restart' || action === 'warm-provider';
        }

        if (target.kind === 'deploy-target') {
            return action === 'redeploy';
        }

        return false;
    }

    /**
     * @summary Writes a validated knob transaction to the durable overlay, then restarts the target so
     * it takes effect.
     *
     * The restart is not a separate concern bolted on: the overlay is read at boot, so a write without
     * one leaves the target running its old values while every surface reports the action succeeded.
     * That is the failure this action exists to avoid, so the two halves stay one operation.
     *
     * The context a knob is bounded by is resolved from this process's own config. The orchestrator and
     * the target read the same declared leaves, so a bound derived here is the best available reading —
     * and it is the writer's reading, which is the one that must justify the write.
     * @param {Object} options
     * @returns {Promise<Object>}
     */
    async reconfigureComposeService({target, knob, knobValues, reason, isAuthorityHeld = null, onBeforeRestartDispatch = null}) {
        const context = {};

        for (const leafPath of requiredContextForKnob(knob)) {
            context[leafPath] = leafPath.split('.').reduce((node, key) => node?.[key], AiConfig);
        }

        const {applied, path: overridePath, violations} = await writeKnobOverride({
            context,
            knob,
            // Derived from the bridge's snapshot leaf rather than re-resolved: both files live on the
            // same writer-owned mount, and deriving keeps them together if that root ever relocates.
            overrideDir: this.recoveryOverrideDir,
            values     : knobValues,
            isAuthorityHeld
        });

        if (!applied) {
            // Refused BEFORE any restart, and thrown rather than returned: this service signals action
            // failure by throwing (`warmProviderResidency` does the same), and `apply` wraps the call so
            // the attempt is recorded as failed. Returning a soft `{ok: false}` would be a second
            // failure convention to keep correct, and the caller that forgot to read it would treat a
            // refusal as a success.
            throw new Error(`Knob transaction refused for '${knob}': ${violations.join('; ')}`);
        }

        // The oracle travels INTO the restart. `writeKnobOverride` above is awaited, so the dispatch
        // check in `executeTargetAction` is no longer the last point we own before this container is
        // actually restarted — and `restartComposeService` already re-asserts after it resolves the
        // container, which is the boundary that matters.
        const restart = await this.restartComposeService({
            target,
            reason,
            isAuthorityHeld,
            onBeforeRestartDispatch
        });

        return {...restart, knob, overridePath}
    }

    /**
     * @summary Raises a store-backed service's memory ceiling: durable knob override + LIVE cgroup
     * update, with NO restart — the store-variant actuator envelope of
     * ADR-0026 §2.8. // ticket-ref-ok: the ADR is the governing authority for the no-restart contract
     *
     * This is `reconfigureComposeService`'s deliberate sibling, differing in exactly the step it
     * omits. For a transient service the restart IS the heal and the overlay needs a boot to be read.
     * For a store the restart is the harm: a store crosses its ceiling WHILE INGESTING, and the
     * restart that `reconfigure` couples to the mutation is what killed a 59,754-row restore at
     * 24,000 rows — the incident this action exists to end. The live `update-memory-limit` operation
     * makes the raise effective NOW on the running container, so no restart is necessary either.
     *
     * The raise-not-lower bound is resolved from the RUNTIME (`inspect` → `HostConfig.Memory`), not
     * from config: a plane predating the parameterised compose default runs a live 2 GiB cap under an
     * 8 GiB config story, and the invariant must bind against what the container actually enforces.
     * An unreadable live limit refuses — an unknown bound is a refusal, never an absent one.
     *
     * Ordering: the override lands BEFORE the live update, mirroring `reconfigure`'s
     * write-then-activate shape. A validated intent that fails activation leaves a durable record the
     * next converge can apply; the inverse order could move the live ceiling on an intent that was
     * never durably recorded.
     *
     * @param {Object} options
     * @param {Object} options.target Resolved compose-service target.
     * @param {String} options.knob Knob name from the closed set.
     * @param {Object|null} [options.knobValues=null] Explicit values keyed by leaf path. Omission
     * selects the knob's registry-owned automatic transaction against the inspected live limit.
     * @param {String|null} options.reason Controller reason.
     * @returns {Promise<Object>}
     */
    async raiseComposeServiceCeiling({target, knob, knobValues, reason, isAuthorityHeld = null}) {
        const declaredService = RECOVERY_KNOBS[knob]?.serviceKey;

        // The knob declares which service its sizing derivation belongs to; an intent authored for the
        // store cannot be re-aimed at another container by a caller naming a different target.
        if (declaredService !== target.id) {
            throw new Error(`Knob '${knob}' addresses service '${declaredService ?? 'none'}', not '${target.id}' — a ceiling intent cannot be re-aimed`);
        }

        if (!this.deploymentRuntimeAccessService?.readObserve) {
            throw new Error('Deployment runtime access service is unavailable');
        }

        const leafPaths = knobLeafPaths(knob);

        if (leafPaths.length !== 1) {
            throw new Error(`Knob '${knob}' declares ${leafPaths.length} leaves; a ceiling knob carries exactly one`);
        }

        const inspection     = await this.deploymentRuntimeAccessService.readObserve({serviceKey: target.id, operation: 'inspect'}),
              liveLimitBytes = Number(inspection.data?.HostConfig?.Memory),
              context        = {[`runtime.${target.id}.liveMemoryLimitBytes`]: liveLimitBytes};

        if (!Number.isFinite(liveLimitBytes)) {
            throw new Error(`Live memory limit for '${target.id}' is unreadable from inspect — refusing to raise against an unknown bound`);
        }

        // Re-asserted after the awaited inspect and BEFORE the first durable write. The dispatch
        // check happened before `readObserve` yielded; a successor can have taken the lease inside
        // that window, and a displaced holder must not leave a durable knob override behind — the
        // next converge would apply an intent its author no longer had authority to form.
        this.assertAuthorityHeld({isAuthorityHeld, action: 'raise-ceiling', target});

        let selectedKnobValues = knobValues;

        if (selectedKnobValues === null || selectedKnobValues === undefined) {
            const selection = selectAutomaticKnobTransaction({knob, context});

            if (!selection.valid) {
                throw new Error(`Automatic knob transaction refused for '${knob}': ${selection.violations.join('; ')}`);
            }

            selectedKnobValues = selection.values;
        }

        const {applied, path: overridePath, violations} = await writeKnobOverride({
            context,
            knob,
            // Same writer-owned mount as `reconfigure` — one overlay, one owner, one revert surface.
            overrideDir: this.recoveryOverrideDir,
            values     : selectedKnobValues,
            isAuthorityHeld
        });

        if (!applied) {
            // Thrown, not returned, for the same reason `reconfigureComposeService` throws: this class
            // signals action failure by throwing, and a second soft-failure convention would let a
            // caller treat a refusal as success. The registry's violations — including the anti-thrash
            // cap — surface verbatim in the recorded failure.
            throw new Error(`Knob transaction refused for '${knob}': ${violations.join('; ')}`);
        }

        // The oracle travels into the live mutation as well: `writeKnobOverride` above is awaited, so
        // this is a second yield point. `applyLifecycle` re-checks after it resolves the container —
        // the last boundary Neo owns before the cgroup actually moves.
        const memoryLimitBytes = selectedKnobValues[leafPaths[0]],
              update           = await this.deploymentRuntimeAccessService.applyLifecycle({
                  serviceKey: target.id,
                  operation : 'update-memory-limit',
                  memoryLimitBytes,
                  reason    : reason || `recovery-actuator:${target.serviceKey}`,
                  isAuthorityHeld
              });

        // DELIBERATELY no restartComposeService here. The omission is the contract, asserted by a
        // negative spec: re-adding a restart on this path re-creates the mid-ingestion kill this
        // action was built to remove.
        return {
            runtimeAccess: update.proof || null,
            knob,
            overridePath,
            ceilingRaise : {
                previousLimitBytes: liveLimitBytes,
                memoryLimitBytes
            }
        }
    }

    /**
     * @summary Refuses a privileged effect when the runtime authority lease is no longer held.
     *
     * **One assertion, called at every last-owned point rather than once at dispatch.** An action
     * that awaits internally — an inspect, a durable override write — has yielded between the
     * dispatch check and its own mutation, and the only check that binds an effect is the one with
     * no await between it and the effect. Extracted so those points share a single refusal shape
     * instead of three hand-copied throws that can drift apart.
     *
     * A null/absent oracle is not a refusal: callers that never held a lease (tests, direct
     * invocation) keep working unchanged.
     *
     * @param {Object} options
     * @param {Function|null} [options.isAuthorityHeld] Live authority oracle.
     * @param {String} options.action Action name, for the refusal message.
     * @param {Object} options.target Resolved target, for the refusal message.
     * @throws {Error} `reason: 'runtime-authority-lost'` when the oracle reports the lease is gone.
     * @protected
     */
    assertAuthorityHeld({isAuthorityHeld, action, target}) {
        if (typeof isAuthorityHeld === 'function' && isAuthorityHeld() !== true) {
            const error = new Error(`Authority moved before the ${action} effect on '${target.id}'; refusing.`);

            error.reason = 'runtime-authority-lost';

            throw error;
        }
    }

    /**
     * @summary Executes the typed target action through the matching privilege envelope.
     * @param {Object} options
     * @returns {Promise<Object>}
     */
    async executeTargetAction({target, action, reason, knob, knobValues, isAuthorityHeld = null, isEffectStillAdmitted = null, expectedContainerId = null, onBeforeRestartDispatch = null}) {
        // The last COMMON point before every effect kind dispatches — common in syntax, which is not
        // the same as last-owned in time. It fences an action whose effect begins immediately
        // (`warm-provider` awaits its repair as its first statement), and it is NOT sufficient for an
        // action that awaits internally before its own mutation. Those carry the oracle inward and
        // re-assert at their own last point; see `reconfigureComposeService` / `raiseComposeServiceCeiling`.
        this.assertAuthorityHeld({isAuthorityHeld, action, target});

        if (action === 'warm-provider') {
            return this.warmProviderResidency({
                target,
                reason,
                isAuthorityHeld,
                ...(typeof isEffectStillAdmitted === 'function' ? {isEffectStillAdmitted} : {})
            });
        }

        if (action === 'reconfigure') {
            return this.reconfigureComposeService({
                knob,
                knobValues,
                reason,
                target,
                isAuthorityHeld,
                onBeforeRestartDispatch
            });
        }

        if (action === 'raise-ceiling') {
            return this.raiseComposeServiceCeiling({knob, knobValues, reason, target, isAuthorityHeld});
        }

        if (target.kind === 'compose-service') {
            return this.restartComposeService({
                target,
                reason,
                isAuthorityHeld,
                isEffectStillAdmitted,
                expectedContainerId,
                onBeforeRestartDispatch
            });
        }

        if (target.kind === 'supervised-task') {
            return this.restartSupervisedTask({target, reason});
        }

        return this.recordDeployTarget({target, action, reason, isAuthorityHeld});
    }

    /**
     * @summary Recycles one known supervised task through the B0 process supervisor.
     * @param {Object} options
     * @returns {Promise<Object>}
     */
    async restartSupervisedTask({target, reason}) {
        if (!this.processSupervisorService?.killTask) {
            throw new Error('Process supervisor service is unavailable');
        }

        this.processSupervisorService.killTask(
            target.id,
            reason || `recovery-actuator:${target.serviceKey}`
        );

        return {
            supervisor: {
                capabilityEnvelope: 'supervised-task-recycle',
                operation         : 'restart',
                taskName          : target.id,
                targetIdentity    : createRecoveryTargetIdentity({kind: target.kind, id: target.id})
            }
        };
    }

    /**
     * @summary Restarts one known compose service through the L0 lifecycle-write envelope.
     * @param {Object} options
     * @returns {Promise<Object>}
     */
    async restartComposeService({target, reason, isAuthorityHeld = null, isEffectStillAdmitted = null, expectedContainerId = null, onBeforeRestartDispatch = null}) {
        if (!this.deploymentRuntimeAccessService?.applyLifecycle) {
            throw new Error('Deployment runtime access service is unavailable');
        }

        const result = await this.deploymentRuntimeAccessService.applyLifecycle({
            serviceKey: target.id,
            operation : 'restart',
            reason    : reason || `recovery-actuator:${target.serviceKey}`,
            // Carried to the LAST point we own — after target resolution, before the mutation. Spread
            // conditionally so a caller without an oracle sends a byte-identical request to before,
            // which keeps the specs' strict argument assertions meaningful rather than forcing them
            // to loosen to `toMatchObject` and stop noticing unexpected arguments.
            ...(typeof isAuthorityHeld === 'function' ? {isAuthorityHeld} : {}),
            ...(typeof isEffectStillAdmitted === 'function' ? {isEffectStillAdmitted} : {}),
            ...(typeof expectedContainerId === 'string' ? {expectedContainerId} : {}),
            ...(typeof onBeforeRestartDispatch === 'function' ? {onBeforeRestartDispatch} : {})
        });

        return {
            runtimeAccess: result.proof || null
        };
    }

    /**
     * @summary Warms the configured chat + embedding provider role set without restarting a service.
     * @param {Object} options
     * @param {Object} options.target Resolved recovery target.
     * @param {String|null} [options.reason=null] Recovery reason.
     * @param {Function|null} [options.isAuthorityHeld=null] Live recovery-authority oracle.
     * @param {Function|null} [options.isEffectStillAdmitted=null] Live heavy-demand admission oracle.
     * @returns {Promise<Object>}
     */
    async warmProviderResidency({target, reason, isAuthorityHeld = null, isEffectStillAdmitted = null}) {
        // Asserted immediately before the repair dispatches. The repair itself performs awaited
        // provider work, so this is the last point Neo owns before a privileged effect leaves the
        // process; loss DURING the repair is post-dispatch uncertainty, which the catch path records
        // rather than fences.
        this.assertAuthorityHeld({isAuthorityHeld, action: 'warm-provider', target});

        if (typeof isEffectStillAdmitted === 'function' && isEffectStillAdmitted() !== true) {
            const error = new Error(`Provider residency repair is no longer admitted for '${target.id}'; refusing.`);

            error.reason = 'runtime-effect-not-admitted';

            throw error;
        }

        const repair = this.providerResidencyRepair || repairProviderRoleSetResidency,
              result = await repair({
                  attempts : AiConfig.orchestrator.providerReadiness.attempts,
                  delayMs  : AiConfig.orchestrator.providerReadiness.delayMs,
                  timeoutMs: AiConfig.orchestrator.providerReadiness.timeoutMs,
                  // Carried INTO the repair so the assertion sits after its read-only role
                  // resolution and immediately before the unload/load/warm leaves the process.
                  isAuthorityHeld,
                  // Same shape, different authority: active heavy-maintenance demand may appear
                  // after the controller decision or an awaited readiness probe. The provider helper
                  // re-checks this immediately before each native warm.
                  ...(typeof isEffectStillAdmitted === 'function' ? {isEffectStillAdmitted} : {}),
                  log      : {
                      info: message => this.writeLog?.('INFO', message),
                      warn: message => this.writeLog?.('WARN', message)
                  }
              });

        if (result.ready !== true) {
            throw new Error(result.warning || `Provider role-set repair did not converge for ${target.serviceKey}`);
        }

        return {
            providerResidency: {
                capabilityEnvelope: 'provider-role-set-warm',
                operation         : 'warm-provider',
                serviceKey        : target.serviceKey,
                reason            : reason || `recovery-actuator:${target.serviceKey}`,
                targetIdentity    : createRecoveryTargetIdentity({kind: target.kind, id: target.id}),
                result
            }
        };
    }

    /**
     * @summary Records an un-auto-executable deploy-target redeploy to the durable heal-event ledger — the
     * record-with-diagnosis terminal. The actuator cannot execute arbitrary deployment code and an operatorless
     * cloud has no human to page, so an un-resolvable deploy-target is RECORDED (durable async-audit), never
     * paged — this completes the escalate/page → record cutover for the last lifecycle page path.
     * @param {Object} options
     * @param {Function|null} [options.isAuthorityHeld=null] Live authority oracle carried into the
     * heal-event store so it can sample adjacent to the record-only append.
     * @returns {Promise<Object>}
     */
    async recordDeployTarget({target, action, reason, isAuthorityHeld = null}) {
        const recorded = {
            serviceKey  : target.serviceKey,
            deployTarget: target.id,
            action,
            reason      : reason || 'config-drift-redeploy-required'
        };

        await appendHealEvent({
            type      : action,
            collection: target.id,
            status    : 'recorded',
            detail    : recorded
        }, {
            dir: this.healEventLedgerDir,
            now: Date.now(),
            ...this.healLedgerRetention,
            ...(typeof isAuthorityHeld === 'function' ? {isAuthorityHeld} : {})
        });

        this.writeLog?.('INFO', `[RecoveryActuator] Redeploy required for ${target.id}; recorded to the heal-event ledger (no operator to page).`);

        return {recorded};
    }

    /**
     * @summary Reads the newest recovery-run state for a compose restart and returns it only while
     * dispatch or effect settlement is unresolved.
     *
     * The append-only run ledger is the interlock because it survives process recreation, authority
     * handoff, and ordinary audit pruning. Only retention-protected active rows are considered; a
     * terminal append in the same run omits the class and atomically releases the guard.
     *
     * @param {Object} options
     * @param {String} options.serviceKey Recovery service key.
     * @param {Object} options.target Typed compose target.
     * @returns {Promise<Object|null>} Pending latest run state, or null.
     */
    async readPendingRestartRun({serviceKey, target}) {
        const entries = await readActiveRecoveryRunStates({
                  dir           : this.recoveryRunStateDir,
                  retentionClass: ACTIVE_RECOVERY_RUN_RETENTION_CLASS
              }),
              latest  = entries
                  .filter(entry => (
                      entry?.details?.serviceKey === serviceKey &&
                      COMPOSE_RESTART_ACTIONS.includes(entry?.details?.action) &&
                      entry?.targetIdentity?.kind === target.kind &&
                      entry?.targetIdentity?.id === target.id
                  ))
                  .sort((left, right) => (right.updatedAt || 0) - (left.updatedAt || 0))[0] || null;

        if (!latest) return null;

        const dispatchPending = latest.status === 'pending' &&
                  latest.details?.reasonCode === 'restart-dispatch-pending',
              effectUncertain = latest.status === 'reobserve-requested' &&
                  latest.reobserveRequest?.reason === 'effect-disposition-uncertain' &&
                  latest.details?.reasonCode === 'restart-effect-disposition-uncertain';

        return dispatchPending || effectUncertain ? latest : null
    }

    /**
     * @summary Settles one durable uncertain Docker restart through fresh container inspection.
     *
     * No branch dispatches a restart. Before the requested cooldown, or while inspect evidence is
     * unreadable/conflicting, the ledger interlock remains latest and the action defers. Only a
     * positively moved `StartedAt` proves the effect landed; unchanged evidence remains uncertain.
     * A replaced container supersedes the stale diagnosis without claiming service recovery.
     *
     * @param {Object} options
     * @returns {Promise<Object>} Reconciliation outcome.
     */
    async reconcileUncertainRestart({pending, serviceKey, action, target, now, isAuthorityHeld = null}) {
        const context              = pending.details?.restartReobserve || {},
              request              = pending.reobserveRequest,
              persistedRequestedAt = pending.details?.restartDispatch?.requestedAt,
              legacyMarkerRequestedAt =
                  Number.isFinite(context.restartTimeoutSeconds) &&
                  Number.isFinite(context.clientTimeoutMs)
                      ? request?.requestedAt
                      : null,
              restartDispatch        = {
                  requestedAt: Number.isFinite(persistedRequestedAt)
                      ? persistedRequestedAt
                      : Number.isFinite(legacyMarkerRequestedAt) ? legacyMarkerRequestedAt : null
              },
              baseOutcome            = {
                  status           : 'deferred',
                  serviceKey,
                  action,
                  targetIdentity   : createRecoveryTargetIdentity({kind: target.kind, id: target.id}),
                  effectDisposition: 'uncertain',
                  recoveryRunId    : pending.recoveryRunId,
                  backoffUntil     : pending.backoffUntil || null,
                  reobserveRequest : request
              };

        if (!request || !context.diagnosisEvent || !context.baseline) {
            return {
                ...baseOutcome,
                reasonCode: 'restart-effect-reobserve-unreadable'
            }
        }

        if (now < request.earliestObservationAt) {
            return {
                ...baseOutcome,
                reasonCode: 'restart-effect-reobserve-pending'
            }
        }

        let observation;

        try {
            observation = await this.deploymentRuntimeAccessService.readObserve({
                serviceKey: target.id,
                operation : 'inspect'
            })
        } catch (error) {
            return {
                ...baseOutcome,
                reasonCode: 'restart-effect-reobserve-unreadable',
                error     : error.message
            }
        }

        if (typeof isAuthorityHeld === 'function' && isAuthorityHeld() !== true) {
            return {
                status        : 'declined',
                reasonCode    : 'authority-lost',
                serviceKey,
                action,
                targetIdentity: baseOutcome.targetIdentity
            }
        }

        const baseline            = context.baseline,
              observedContainerId = observation.proof?.target?.containerId || observation.data?.Id || null,
              observedStartedAt   = normalizeObservedContainerTime(observation.data?.State?.StartedAt),
              baselineStartedAt   = normalizeObservedContainerTime(baseline.startedAt),
              reobservation       = {
                  baseline,
                  observed: {
                      containerId: observedContainerId,
                      startedAt  : observedStartedAt
                  },
                  runtimeAccess: observation.proof || null
              };

        if (!observedContainerId) {
            return {
                ...baseOutcome,
                reasonCode : 'restart-effect-reobserve-unreadable',
                reobservation
            }
        }

        let outcome, taskStatus;

        if (observedContainerId !== baseline.containerId) {
            outcome = {
                status           : 'recorded',
                reasonCode       : 'restart-effect-superseded-by-incarnation-change',
                serviceKey,
                action,
                targetIdentity   : baseOutcome.targetIdentity,
                effectDisposition: 'uncertain',
                restartDispatch,
                reobservation
            };
            taskStatus = 'skipped'
        } else {
            const baselineMs = Date.parse(baselineStartedAt || ''),
                  observedMs = Date.parse(observedStartedAt || '');

            if (!Number.isFinite(baselineMs) || !Number.isFinite(observedMs) || observedMs < baselineMs) {
                return {
                    ...baseOutcome,
                    reasonCode: 'restart-effect-reobserve-unreadable',
                    reobservation
                }
            }

            if (observedMs === baselineMs) {
                return {
                    ...baseOutcome,
                    reasonCode: 'restart-effect-not-yet-observed',
                    reobservation
                }
            }

            outcome = {
                status           : 'actioned',
                reasonCode       : 'restart-effect-observed-applied',
                serviceKey,
                action,
                targetIdentity   : baseOutcome.targetIdentity,
                effectDisposition: 'applied',
                restartDispatch,
                reobservation
            };
            taskStatus = 'completed'
        }

        // Append FIRST and do not clear a second mutable marker: this terminal row supersedes the
        // pending row atomically within the run's JSONL. An append failure leaves the pending row as
        // latest, so the next cadence re-observes instead of redispatching.
        return this.finishAction({
            action,
            attempt       : pending.attempt,
            backoffUntil  : pending.backoffUntil || null,
            diagnosisEvent: context.diagnosisEvent,
            outcome,
            recoveryRunId : pending.recoveryRunId,
            serviceKey,
            startedAt     : pending.startedAt,
            target,
            taskStatus,
            updatedAt     : now,
            isAuthorityHeld,
            // This observation settles the dispatch question. Health recovery remains the next
            // controller observation; emitting another dispatch-settlement request would recreate
            // the write-only loop this method closes.
            reobserveRequest: null
        })
    }

    /**
     * @summary Appends one recovery-run state through an overridable fault-injection seam.
     * @param {Object} entry Recovery-run state entry.
     * @param {Object} options Append options.
     * @returns {Promise<String>} Written ledger path.
     */
    async appendRecoveryRunEntry(entry, options = {}) {
        return appendRecoveryRunState(entry, {
            dir           : this.recoveryRunStateDir,
            retentionLimit: this.cfg.recoveryRunRetentionLimit,
            ...options
        })
    }

    /**
     * @summary Reads the persisted heal-attempt state file.
     * @returns {Promise<Object>}
     */
    async readHealAttempts() {
        try {
            return await fs.readJson(this.healAttemptsPath);
        } catch (error) {
            if (error?.code === 'ENOENT') {
                return {};
            }
            throw error;
        }
    }

    /**
     * @summary Atomically writes persisted heal-attempt state under a commit-adjacent authority fence.
     *
     * JSON is staged to a unique sibling path, then authority is sampled immediately before rename,
     * the single commit point. A displaced holder may leave no successor-visible anti-thrash state.
     * The unique name also prevents two independently initialized writers from sharing scratch data.
     *
     * @param {Object} attempts Attempt state.
     * @param {Object} [options]
     * @param {Function|null} [options.isAuthorityHeld=null] Live authority oracle.
     * @param {Object} [options.fileSystem=fs] File-system adapter for deterministic commit-boundary tests.
     * @returns {Promise<void>}
     */
    async writeHealAttempts(attempts, {isAuthorityHeld = null, fileSystem = fs} = {}) {
        const targetPath = this.healAttemptsPath,
              tempPath   = `${targetPath}.${randomUUID()}.tmp`;

        const assertHeld = () => {
            if (typeof isAuthorityHeld === 'function' && isAuthorityHeld() !== true) {
                const error = new Error('Authority moved before the heal-attempt state commit; refusing.');

                error.reason = 'runtime-authority-lost';

                throw error
            }
        };

        assertHeld();
        await fileSystem.ensureDir(path.dirname(targetPath));
        assertHeld();

        try {
            await fileSystem.writeJson(tempPath, attempts, {spaces: 2});
            assertHeld();
            await fileSystem.rename(tempPath, targetPath); // atomic-write-ok: assertHeld() fences the commit rename
        } finally {
            await fileSystem.remove(tempPath).catch(() => {})
        }
    }

    /**
     * @summary Evaluates the persisted anti-thrash envelope for the next action.
     * @param {Object} options
     * @returns {Object}
     */
    evaluateEnvelope({attempts, serviceKey, action, now}) {
        const key   = this.getAttemptKey({serviceKey, action}),
              state = this.getCurrentAttemptState({attempts, key, now});

        if (state.backoffUntil && now < state.backoffUntil) {
            return {
                admitted    : false,
                attempt     : state.attemptCount,
                backoffUntil: state.backoffUntil,
                reasonCode  : 'backoff-active',
                status      : 'deferred'
            };
        }

        if (state.attemptCount >= this.getMaxAttemptsPerWindow()) {
            state.alarmOnly = true;
            attempts[key] = state;
            return {
                admitted  : false,
                attempt   : state.attemptCount,
                reasonCode: 'attempt-cap-reached',
                status    : 'recorded'
            };
        }

        attempts[key] = state;

        return {
            admitted: true,
            attempt : state.attemptCount
        };
    }

    /**
     * @summary Resolves the active attempt state, resetting expired windows.
     * @param {Object} options
     * @returns {Object}
     */
    getCurrentAttemptState({attempts, key, now}) {
        const existing = attempts[key],
              windowMs = this.getAttemptWindowMs();

        if (!existing || !Number.isFinite(existing.windowStartedAt) || now - existing.windowStartedAt >= windowMs) {
            return {
                windowStartedAt: now,
                attemptCount   : 0,
                backoffUntil   : null,
                alarmOnly      : false
            };
        }

        return existing;
    }

    /**
     * @summary Persists a post-action attempt state.
     * @param {Object} options
     * @returns {void}
     */
    persistAttempt({attempts, serviceKey, action, attempt, backoffUntil, now, status}) {
        const key   = this.getAttemptKey({serviceKey, action}),
              state = this.getCurrentAttemptState({attempts, key, now});

        attempts[key] = {
            ...state,
            attemptCount : attempt,
            lastAction   : action,
            lastAttemptAt: now,
            lastStatus   : status,
            backoffUntil,
            alarmOnly    : attempt >= this.getMaxAttemptsPerWindow()
        };
    }

    /**
     * @summary Builds the recovery run id used by the durable ledger.
     * @param {Object} options
     * @returns {String}
     */
    getRecoveryRunId({recoveryRunId, serviceKey, action, startedAt}) {
        return recoveryRunId || `recovery-actuator:${serviceKey}:${action}:${new Date(startedAt).toISOString()}`;
    }

    /**
     * @summary Records health + durable recovery-run ledger traces for an action outcome.
     * @param {Object} options
     * @returns {Promise<Object>}
     */
    async finishAction({
        action,
        attempt,
        backoffUntil,
        diagnosisEvent,
        outcome,
        recoveryRunId,
        serviceKey,
        startedAt,
        target,
        taskStatus,
        updatedAt,
        isAuthorityHeld = null,
        reobserveRequest: requestedReobserve = undefined,
        settlesPreDispatchInterlock = false
    }) {
        // FRESHLY CLASSIFIED, here rather than at the caller. Everything between the caller's own
        // measurement and this point is awaited — `writeHealAttempts`, the executor, the heal-event
        // append — so a provenance value computed there is stale by the time the record lands. There
        // are no awaits between this line and the append below, which is what makes it the last
        // point that can honestly describe the write.
        //
        // It refines rather than overrides: a run already known to have dispatched under held
        // authority and lost it stays `uncertain`. What this cannot do is claim an effect was clean
        // when authority had already moved before the record was written.
        const heldAtAppend = typeof isAuthorityHeld === 'function' ? isAuthorityHeld() === true : null,
              finalOutcome = heldAtAppend === false
                  ? {...outcome, heldAtAppend, authorityLostBeforeRecord: true}
                  : (heldAtAppend === null ? outcome : {...outcome, heldAtAppend});

        const runId            = this.getRecoveryRunId({recoveryRunId, serviceKey, action, startedAt}),
              reobserveRequest = requestedReobserve === undefined
                  ? (outcome.status === 'actioned'
                      ? createRecoveryReobserveRequest({
                            recoveryRunId              : runId,
                            diagnosisEvent,
                            requestedAt                : updatedAt,
                            cooldownMs                 : this.getVerifyCooldownMs(),
                            healthyObservationThreshold: this.getHealthyObservationThreshold()
                        })
                      : null)
                  : requestedReobserve,
              ledgerStatus = this.getLedgerStatus({outcome, reobserveRequest}),
              entry = createRecoveryRunStateEntry({
                  recoveryRunId: runId,
                  diagnosisEvent,
                  rung         : this.getRungForTarget(target),
                  attempt,
                  status       : ledgerStatus,
                  startedAt,
                  updatedAt,
                  completedAt  : updatedAt,
                  backoffUntil,
                  reobserveRequest,
                  details      : finalOutcome
              });

        await this.appendRecoveryRunEntry(entry, {
            // Carried into the store so the refusal sits adjacent to the append itself: the
            // classification above is fresh, but `appendRecoveryRunState` awaits `mkdir` before it
            // writes — one more yield this method cannot see from here.
            //
            // The oracle ALWAYS travels now, so the store samples authority adjacent to its own
            // append and stamps `heldAtWrite` on the record. Withholding it (the previous shape)
            // bought a dispatched audit its survival at the cost of the record no longer saying
            // whether the holder still held the lease when it landed.
            isAuthorityHeld,
            // A dispatched effect must outlive takeover. The one safe non-dispatched exception is
            // the terminal settlement of a pre-POST interlock already written by this run: refusing
            // that append would leave `pending` authoritative forever. It is stamped as displaced,
            // claims `not-applied`, and can only remove permission to infer that a POST occurred.
            preserveOnAuthorityLoss: settlesPreDispatchInterlock ||
                ['actioned', 'failed'].includes(finalOutcome.status)
        });

        this.recordTaskOutcome(serviceKey, taskStatus, {
            ...outcome,
            recoveryRunId: runId,
            backoffUntil,
            ledgerStatus
        });

        return {
            ...outcome,
            recoveryRunId: runId,
            backoffUntil,
            reobserveRequest
        };
    }

    /**
     * @summary Records a rejected action without reaching a privileged executor.
     * @param {Object} options
     * @returns {Promise<Object>}
     */
    async rejectAction({serviceKey, action, now, reasonCode, target = null, targetIdentity = null}) {
        const diagnosisEvent = createRecoveryDiagnosisEvent({
            diagnosisId   : `recovery-actuator:${serviceKey}:${action || 'unknown'}:${now}`,
            recoveryClass : target?.kind === 'deploy-target' ? 'config-drift' : 'ambiguous',
            confidence    : 1,
            targetIdentity: targetIdentity || createRecoveryTargetIdentity({
                kind: target?.kind || 'compose-service',
                id  : target?.id || serviceKey
            }),
            evidenceFacts: [],
            observedAt   : now,
            source       : 'recovery-actuator',
            details      : {action, reasonCode}
        });

        return this.finishAction({
            action,
            attempt     : 1,
            backoffUntil: null,
            diagnosisEvent,
            outcome     : {
                status        : 'rejected',
                reasonCode,
                serviceKey,
                action,
                targetIdentity: targetIdentity || (target
                    ? createRecoveryTargetIdentity({kind: target.kind, id: target.id})
                    : null)
            },
            recoveryRunId: null,
            serviceKey,
            startedAt    : now,
            target       : target || {kind: targetIdentity?.kind || 'compose-service', id: targetIdentity?.id || serviceKey},
            taskStatus   : 'skipped',
            updatedAt    : now
        });
    }

    /**
     * @summary Records an actuator health trace without letting observability failures break action flow.
     * @param {String} serviceKey Stable target key.
     * @param {String} status Health status.
     * @param {Object} details Outcome details.
     * @returns {void}
     */
    recordTaskOutcome(serviceKey, status, details) {
        try {
            this.healthService?.recordTaskOutcome?.(`recovery-actuator:${serviceKey}`, status, details);
        } catch (error) {
            this.writeLog?.('ERROR', `[RecoveryActuator] Failed to record ${serviceKey} outcome: ${error.message}`);
        }
    }

    /**
     * @summary Resolves or synthesizes the diagnosis event consumed by the actuator.
     * @param {Object} options
     * @returns {Object}
     */
    resolveDiagnosisEvent({diagnosisEvent, action, target, now}) {
        if (diagnosisEvent) {
            return createRecoveryDiagnosisEvent(diagnosisEvent);
        }

        return createRecoveryDiagnosisEvent({
            diagnosisId   : `recovery-actuator:${target.serviceKey}:${action}:${now}`,
            recoveryClass : this.getRecoveryClassForAction({action, target}),
            confidence    : 1,
            targetIdentity: createRecoveryTargetIdentity({kind: target.kind, id: target.id}),
            evidenceFacts : [],
            observedAt    : now,
            source        : 'recovery-actuator',
            details       : {action}
        });
    }

    /**
     * @summary Resolves the synthetic diagnosis class for direct actuator calls.
     * @param {Object} options
     * @returns {String}
     */
    getRecoveryClassForAction({action, target}) {
        if (action === 'warm-provider') {
            return 'provider-role-residency';
        }
        if (action === 'raise-ceiling') {
            // The class the diagnosis layer emits for a store at its ceiling; synthesizing `crash`
            // here would record a restart-shaped story for an action whose point is not restarting.
            return 'exhaustion';
        }
        return target.kind === 'deploy-target' ? 'config-drift' : 'crash';
    }

    /** @summary Builds the durable anti-thrash key for one service/action pair. */
    getAttemptKey({serviceKey, action}) {
        return `${serviceKey}:${action}`;
    }

    /** @summary Resolves the rolling attempt-window size. */
    getAttemptWindowMs() {
        return this.cfg.maxAttemptsWindowMs;
    }

    /** @summary Resolves the maximum admitted attempts within one rolling window. */
    getMaxAttemptsPerWindow() {
        return this.cfg.maxAttemptsPerWindow;
    }

    /** @summary Resolves the cooldown before the controller should re-observe after action. */
    getVerifyCooldownMs() {
        return this.cfg.verifyCooldownMs;
    }

    /** @summary Resolves the required healthy-observation count for verify-loop completion. */
    getHealthyObservationThreshold() {
        return this.cfg.healthyObservationThreshold;
    }

    /**
     * @summary Resolves the recovery-run rung id for the typed actuator target.
     * @param {Object} target Typed target descriptor.
     * @returns {String}
     */
    getRungForTarget(target) {
        if (target?.kind === 'supervised-task') return 'rung-1';
        if (target?.kind === 'compose-service') return 'rung-2';
        if (target?.kind === 'deploy-target') return 'rung-3';

        return 'rung-0';
    }

    /**
     * @summary Computes the exponential backoff ceiling for a completed attempt.
     * @param {Object} options
     * @returns {Number|null}
     */
    computeBackoffUntil({attempt, now}) {
        const {baseBackoffMs, maxBackoffMs} = this.cfg;

        if (baseBackoffMs === 0) {
            return null;
        }

        return now + Math.min(maxBackoffMs, baseBackoffMs * Math.pow(2, Math.max(0, attempt - 1)));
    }

    /**
     * @summary Maps the actuator outcome state to the recovery-run ledger status enum.
     * @param {Object} options
     * @returns {String}
     */
    getLedgerStatus({outcome, reobserveRequest = null}) {
        if (reobserveRequest) {
            return 'reobserve-requested';
        }
        if (outcome.status === 'actioned') {
            return 'actioned';
        }
        if (outcome.status === 'recorded') {
            return 'recorded';
        }
        if (outcome.status === 'failed') {
            return 'failed';
        }
        return 'no-action';
    }
}

/**
 * @summary Normalizes one Docker `StartedAt` value for exact incarnation comparison.
 * @param {*} value Candidate Docker timestamp.
 * @returns {String|null} Original timestamp when finite and positive, otherwise null.
 */
function normalizeObservedContainerTime(value) {
    if (value === null || value === undefined) return null;

    const stamp  = String(value),
          parsed = Date.parse(stamp);

    return Number.isFinite(parsed) && parsed > 0 ? stamp : null
}

export default Neo.setupClass(RecoveryActuatorService);
