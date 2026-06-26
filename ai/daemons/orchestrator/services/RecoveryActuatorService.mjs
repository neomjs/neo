import fs   from 'fs-extra';
import path from 'path';

import Base                             from '../../../../src/core/Base.mjs';
import AiConfig                         from '../../../config.mjs';
import {repairProviderRoleSetResidency} from '../../../services/graph/providerReadinessHelper.mjs';
import {
    appendRecoveryRunState,
    createRecoveryDiagnosisEvent,
    createRecoveryReobserveRequest,
    createRecoveryRunStateEntry,
    createRecoveryTargetIdentity
} from '../../../services/memory-core/helpers/recoveryRunStateStore.mjs';
import {DEFAULT_DATA_DIR} from '../taskDefinitions.mjs';

const DEFAULT_ACTIONS        = Object.freeze(['restart', 'redeploy', 'page', 'warm-provider']);
const DEFAULT_DEPLOY_TARGETS = Object.freeze(['cloud-deploy']);

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
 * B1 privileged recovery actuator for ADR-0026. The service is controller-blind:
 * callers pass an already-selected action, and this class only answers whether the
 * recovery target registry + persisted anti-thrash envelope admits it. Compose-service
 * lifecycle writes are delegated to the shared L0 deployment-runtime access holder,
 * keeping Docker socket access and container identity resolution out of this B1 class.
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
         * @member {String} dataDir_='.neo-ai-data/orchestrator-daemon'
         * @protected
         * @reactive
         */
        dataDir_: DEFAULT_DATA_DIR,
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
         * @member {Function|null} pageDispatcher_=null
         * @protected
         * @reactive
         */
        pageDispatcher_: null,
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
     * @param {String} action restart | redeploy | page | warm-provider.
     * @param {Object} [options]
     * @param {Object|null} [options.diagnosisEvent=null] Optional ADR-0025 diagnosis event.
     * @param {Object|null} [options.targetIdentity=null] Optional typed target identity.
     * @param {String|null} [options.recoveryRunId=null] Optional stable recovery run id.
     * @param {Number} [options.now=Date.now()] Epoch milliseconds.
     * @param {String|null} [options.reason=null] Operator/controller reason.
     * @returns {Promise<Object>} Action outcome descriptor.
     */
    async apply(serviceKey, action, {
        diagnosisEvent = null,
        targetIdentity = null,
        recoveryRunId = null,
        now = Date.now(),
        reason = null
    } = {}) {
        if (typeof serviceKey !== 'string' || serviceKey.length === 0) {
            throw new TypeError('RecoveryActuatorService.apply: serviceKey is required');
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

        const attempts = await this.readHealAttempts(),
              gate     = this.evaluateEnvelope({attempts, serviceKey, action, now});

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
                taskStatus: gate.status === 'escalated' ? 'failed' : 'skipped',
                updatedAt : now
            });
        }

        const startedAt = now;

        try {
            const result = await this.executeTargetAction({target, action, reason});

            const updatedAt     = Date.now(),
                  diagnosis     = this.resolveDiagnosisEvent({diagnosisEvent, action, target, now: startedAt}),
                  nextAttempt   = gate.attempt + 1,
                  nextBackoffAt = this.computeBackoffUntil({attempt: nextAttempt, now: updatedAt});

            this.persistAttempt({
                attempts,
                serviceKey,
                action,
                attempt     : nextAttempt,
                backoffUntil: nextBackoffAt,
                now         : updatedAt,
                status      : target.kind === 'deploy-target' ? 'escalated' : 'actioned'
            });
            await this.writeHealAttempts(attempts);

            return this.finishAction({
                action,
                attempts,
                attempt       : nextAttempt,
                backoffUntil  : nextBackoffAt,
                diagnosisEvent: diagnosis,
                outcome       : {
                    status           : target.kind === 'deploy-target' ? 'escalated' : 'actioned',
                    serviceKey,
                    action,
                    targetIdentity   : createRecoveryTargetIdentity({kind: target.kind, id: target.id}),
                    runtimeAccess    : result.runtimeAccess || null,
                    supervisor       : result.supervisor || null,
                    page             : result.page || null,
                    providerResidency: result.providerResidency || null
                },
                recoveryRunId,
                serviceKey,
                startedAt,
                target,
                taskStatus: 'completed',
                updatedAt
            });
        } catch (error) {
            const updatedAt     = Date.now(),
                  diagnosis     = this.resolveDiagnosisEvent({diagnosisEvent, action, target, now: startedAt}),
                  nextAttempt   = gate.attempt + 1,
                  nextBackoffAt = this.computeBackoffUntil({attempt: nextAttempt, now: updatedAt});

            this.persistAttempt({
                attempts,
                serviceKey,
                action,
                attempt     : nextAttempt,
                backoffUntil: nextBackoffAt,
                now         : updatedAt,
                status      : 'failed'
            });
            await this.writeHealAttempts(attempts);

            return this.finishAction({
                action,
                attempts,
                attempt       : nextAttempt,
                backoffUntil  : nextBackoffAt,
                diagnosisEvent: diagnosis,
                outcome       : {
                    status        : 'failed',
                    reasonCode    : 'executor-failed',
                    serviceKey,
                    action,
                    targetIdentity: createRecoveryTargetIdentity({kind: target.kind, id: target.id}),
                    error         : error.message
                },
                recoveryRunId,
                serviceKey,
                startedAt,
                target,
                taskStatus: 'failed',
                updatedAt
            });
        }
    }

    /**
     * @summary Escalates a diagnosis without executing a privileged recovery action.
     *
     * Backup/task-failure alerting needs the recovery-run ledger and operator page path, but
     * must not coerce a supervised task into the deploy-target `page` action. This sink accepts
     * only controller-produced alarm diagnoses and records them as escalated.
     *
     * @param {Object} diagnosisEvent Recovery diagnosis event with `details.actionClass = 'escalate'`.
     * @param {Object} [options]
     * @param {String|null} [options.recoveryRunId=null] Optional stable recovery run id.
     * @param {Number} [options.now=Date.now()] Epoch milliseconds.
     * @param {String|null} [options.reason=null] Operator/controller reason.
     * @returns {Promise<Object>} Escalation outcome descriptor.
     */
    async escalateDiagnosis(diagnosisEvent, {
        recoveryRunId = null,
        now = Date.now(),
        reason = null
    } = {}) {
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

        if (diagnosis.details?.actionClass !== 'escalate') {
            return {
                status        : 'rejected',
                reasonCode    : 'diagnosis-not-escalatable',
                targetIdentity: diagnosis.targetIdentity
            };
        }

        const serviceKey = diagnosis.targetIdentity.id,
              target     = {
                  kind: diagnosis.targetIdentity.kind,
                  serviceKey,
                  id  : serviceKey
              },
              page       = this.createDiagnosisPage({diagnosisEvent: diagnosis, reason});

        if (typeof this.pageDispatcher === 'function') {
            await this.pageDispatcher(page);
        } else {
            this.writeLog?.('WARN', `[RecoveryActuator] Escalation required for ${serviceKey}; page target ${page.operatorPageTarget}.`);
        }

        const updatedAt = Date.now();

        return this.finishAction({
            action        : 'escalate',
            attempt       : 1,
            backoffUntil  : null,
            diagnosisEvent: diagnosis,
            outcome       : {
                status        : 'escalated',
                reasonCode    : diagnosis.details.reasonCode || 'diagnosis-escalation',
                serviceKey,
                action        : 'escalate',
                targetIdentity: createRecoveryTargetIdentity(diagnosis.targetIdentity),
                page
            },
            recoveryRunId,
            serviceKey,
            startedAt : now,
            target,
            taskStatus: 'failed',
            updatedAt
        });
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
        if (target.kind === 'compose-service') {
            return action === 'restart' || action === 'warm-provider';
        }

        if (target.kind === 'supervised-task') {
            return action === 'restart' || action === 'warm-provider';
        }

        if (target.kind === 'deploy-target') {
            return action === 'redeploy' || action === 'page';
        }

        return false;
    }

    /**
     * @summary Executes the typed target action through the matching privilege envelope.
     * @param {Object} options
     * @returns {Promise<Object>}
     */
    async executeTargetAction({target, action, reason}) {
        if (action === 'warm-provider') {
            return this.warmProviderResidency({target, reason});
        }

        if (target.kind === 'compose-service') {
            return this.restartComposeService({target, reason});
        }

        if (target.kind === 'supervised-task') {
            return this.restartSupervisedTask({target, reason});
        }

        return this.pageDeployTarget({target, action, reason});
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
    async restartComposeService({target, reason}) {
        if (!this.deploymentRuntimeAccessService?.applyLifecycle) {
            throw new Error('Deployment runtime access service is unavailable');
        }

        const result = await this.deploymentRuntimeAccessService.applyLifecycle({
            serviceKey: target.id,
            operation : 'restart',
            reason    : reason || `recovery-actuator:${target.serviceKey}`
        });

        return {
            runtimeAccess: result.proof || null
        };
    }

    /**
     * @summary Warms the configured chat + embedding provider role set without restarting a service.
     * @param {Object} options
     * @returns {Promise<Object>}
     */
    async warmProviderResidency({target, reason}) {
        const repair = this.providerResidencyRepair || repairProviderRoleSetResidency,
              result = await repair({
                  attempts : AiConfig.orchestrator.providerReadiness.attempts,
                  delayMs  : AiConfig.orchestrator.providerReadiness.delayMs,
                  timeoutMs: AiConfig.orchestrator.providerReadiness.timeoutMs,
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
     * @summary Triggers the config-drift redeploy page without executing arbitrary deployment code.
     * @param {Object} options
     * @returns {Promise<Object>}
     */
    async pageDeployTarget({target, action, reason}) {
        const page = {
            serviceKey        : target.serviceKey,
            deployTarget      : target.id,
            action,
            reason            : reason || 'config-drift-redeploy-required',
            operatorPageTarget: this.cfg.operatorPageTarget
        };

        if (typeof this.pageDispatcher === 'function') {
            await this.pageDispatcher(page);
        } else {
            this.writeLog?.('WARN', `[RecoveryActuator] Redeploy required for ${target.id}; page target ${page.operatorPageTarget}.`);
        }

        return {page};
    }

    /**
     * @summary Builds the operator page payload for an alarm-only diagnosis escalation.
     * @param {Object} options
     * @returns {Object}
     */
    createDiagnosisPage({diagnosisEvent, reason}) {
        return {
            serviceKey        : diagnosisEvent.targetIdentity.id,
            targetIdentity    : createRecoveryTargetIdentity(diagnosisEvent.targetIdentity),
            action            : 'escalate',
            reason            : reason || diagnosisEvent.details?.reasonCode || 'diagnosis-escalation',
            diagnosisEvent,
            operatorPageTarget: this.cfg.operatorPageTarget
        };
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
     * @summary Writes the persisted heal-attempt state file.
     * @param {Object} attempts Attempt state.
     * @returns {Promise<void>}
     */
    async writeHealAttempts(attempts) {
        await fs.ensureDir(path.dirname(this.healAttemptsPath));
        await fs.writeJson(this.healAttemptsPath, attempts, {spaces: 2});
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
                status    : 'escalated'
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
        updatedAt
    }) {
        const runId            = this.getRecoveryRunId({recoveryRunId, serviceKey, action, startedAt}),
              reobserveRequest = outcome.status === 'actioned'
                  ? createRecoveryReobserveRequest({
                        recoveryRunId              : runId,
                        diagnosisEvent,
                        requestedAt                : updatedAt,
                        cooldownMs                 : this.getVerifyCooldownMs(),
                        healthyObservationThreshold: this.getHealthyObservationThreshold()
                    })
                  : null,
              ledgerStatus = this.getLedgerStatus({outcome}),
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
                  details      : outcome
              });

        await appendRecoveryRunState(entry, {
            dir           : this.recoveryRunStateDir,
            retentionLimit: this.cfg.recoveryRunRetentionLimit
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
    getLedgerStatus({outcome}) {
        if (outcome.status === 'actioned') {
            return 'reobserve-requested';
        }
        if (outcome.status === 'escalated') {
            return 'escalated';
        }
        if (outcome.status === 'failed') {
            return 'failed';
        }
        return 'no-action';
    }
}

export default Neo.setupClass(RecoveryActuatorService);
