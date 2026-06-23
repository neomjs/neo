import fs   from 'fs-extra';
import path from 'path';

import Base     from '../../../../src/core/Base.mjs';
import AiConfig from '../../../config.mjs';
import {
    appendRecoveryRunState,
    createRecoveryDiagnosisEvent,
    createRecoveryReobserveRequest,
    createRecoveryRunStateEntry,
    createRecoveryTargetIdentity
} from '../../../services/memory-core/helpers/recoveryRunStateStore.mjs';
import {DEFAULT_DATA_DIR} from '../taskDefinitions.mjs';

const DEFAULT_ACTIONS = Object.freeze(['restart', 'redeploy', 'page']);

/**
 * @summary Normalizes string/object allowlist entries into stable recovery targets.
 *
 * String entries use the same value for `serviceKey` and `id`. Object entries may use an
 * explicit `serviceKey` plus either `id`, `composeService`, or `deployTarget`. The actuator
 * never accepts a runtime target that cannot be traced back to one of these normalized entries.
 *
 * @param {Array<String|Object>} entries Configured allowlist entries.
 * @param {String} kind Recovery target kind.
 * @returns {Object[]} Normalized target descriptors.
 */
export function normalizeRecoveryActuatorAllowlist(entries, kind) {
    if (!Array.isArray(entries)) {
        return [];
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

        const id         = String(entry.id || entry.composeService || entry.deployTarget || '').trim(),
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
 * @class Neo.ai.daemons.services.RecoveryActuatorService
 * @extends Neo.core.Base
 *
 * B1 privileged recovery actuator for ADR-0026. The service is controller-blind:
 * callers pass an already-selected action, and this class only answers whether the
 * actuator allowlist + persisted anti-thrash envelope admits it. Compose-service
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
        writeLog_: null
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

    /** @summary Resolves the allowlisted compose-service actuator targets. */
    get allowedComposeServices() {
        return normalizeRecoveryActuatorAllowlist(this.cfg.allowedComposeServices, 'compose-service');
    }

    /** @summary Resolves the allowlisted deploy-target page/escalation targets. */
    get allowedDeployTargets() {
        return normalizeRecoveryActuatorAllowlist(this.cfg.allowedDeployTargets, 'deploy-target');
    }

    /**
     * @summary Applies one bounded recovery action if the allowlist and anti-thrash envelope admit it.
     *
     * @param {String} serviceKey Stable allowlisted recovery target key.
     * @param {String} action restart | redeploy | page.
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
            return this.rejectAction({serviceKey, action, now, reasonCode: 'target-not-allowlisted', targetIdentity});
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
            const result = target.kind === 'compose-service'
                ? await this.restartComposeService({target, reason})
                : await this.pageDeployTarget({target, action, reason});

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
                    status        : target.kind === 'deploy-target' ? 'escalated' : 'actioned',
                    serviceKey,
                    action,
                    targetIdentity: createRecoveryTargetIdentity({kind: target.kind, id: target.id}),
                    runtimeAccess : result.runtimeAccess || null,
                    page          : result.page || null
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
     * @summary Resolves the strict target allowlist entry for a service key and optional identity.
     * @param {Object} options
     * @returns {Object|null}
     */
    resolveTarget({serviceKey, targetIdentity}) {
        const candidates = [
            ...this.allowedComposeServices,
            ...this.allowedDeployTargets
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
            return action === 'restart';
        }

        if (target.kind === 'deploy-target') {
            return action === 'redeploy' || action === 'page';
        }

        return false;
    }

    /**
     * @summary Restarts one allowlisted compose service through the L0 lifecycle-write envelope.
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
                  rung         : target?.kind === 'deploy-target' ? 'rung-3' : 'rung-2',
                  attempt      : Math.max(1, Number(attempt || 1)),
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
            recoveryClass : target.kind === 'deploy-target' ? 'config-drift' : 'crash',
            confidence    : 1,
            targetIdentity: createRecoveryTargetIdentity({kind: target.kind, id: target.id}),
            evidenceFacts : [],
            observedAt    : now,
            source        : 'recovery-actuator',
            details       : {action}
        });
    }

    /** @summary Builds the durable anti-thrash key for one service/action pair. */
    getAttemptKey({serviceKey, action}) {
        return `${serviceKey}:${action}`;
    }

    /** @summary Resolves the rolling attempt-window size. */
    getAttemptWindowMs() {
        return Math.max(1, Number(this.cfg.maxAttemptsWindowMs));
    }

    /** @summary Resolves the maximum admitted attempts within one rolling window. */
    getMaxAttemptsPerWindow() {
        return Math.max(1, Number(this.cfg.maxAttemptsPerWindow));
    }

    /** @summary Resolves the cooldown before the controller should re-observe after action. */
    getVerifyCooldownMs() {
        return Math.max(0, Number(this.cfg.verifyCooldownMs));
    }

    /** @summary Resolves the required healthy-observation count for verify-loop completion. */
    getHealthyObservationThreshold() {
        return Math.max(1, Number(this.cfg.healthyObservationThreshold));
    }

    /**
     * @summary Computes the exponential backoff ceiling for a completed attempt.
     * @param {Object} options
     * @returns {Number|null}
     */
    computeBackoffUntil({attempt, now}) {
        const base = Math.max(0, Number(this.cfg.baseBackoffMs)),
              max  = Math.max(base, Number(this.cfg.maxBackoffMs));

        if (base === 0) {
            return null;
        }

        return now + Math.min(max, base * Math.pow(2, Math.max(0, attempt - 1)));
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
