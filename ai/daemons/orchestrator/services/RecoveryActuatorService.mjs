import Base from '../../../../src/core/Base.mjs';
import {
    appendRecoveryRunState,
    createRecoveryReobserveRequest,
    createRecoveryRunStateEntry,
    readRecentRecoveryRunStates
} from '../../../services/memory-core/helpers/recoveryRunStateStore.mjs';

export const DEFAULT_RECOVERY_RESTART_COOLDOWN_MS = 15000;
export const DEFAULT_SUPERVISED_RECOVERY_ATTEMPT_LIMIT = 3;

const SUPERVISED_RECOVERY_CLASSES = Object.freeze(['crash', 'exhaustion']);

/**
 * @class Neo.ai.daemons.services.RecoveryActuatorService
 * @extends Neo.core.Base
 *
 * @summary Routes typed recovery diagnoses to bounded actuator calls.
 *
 * The service owns policy and ledger state. The low-level B0 action stays inside
 * {@link Neo.ai.daemons.services.ProcessSupervisorService}: this class only accepts
 * a typed `supervised-task` diagnosis, writes the recovery-run ledger first, delegates
 * to `superviseTask()`, and records the cooldown-to-reobserve handshake.
 */
export class RecoveryActuatorService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.daemons.services.RecoveryActuatorService'
         * @protected
         */
        className: 'Neo.ai.daemons.services.RecoveryActuatorService',
        /**
         * @member {Object|null} processSupervisorService_=null
         * @protected
         * @reactive
         */
        processSupervisorService_: null,
        /**
         * @member {Object|null} healthService_=null
         * @protected
         * @reactive
         */
        healthService_: null,
        /**
         * @member {String} healthTaskName_='recovery-actuator'
         * @protected
         * @reactive
         */
        healthTaskName_: 'recovery-actuator',
        /**
         * @member {String|null} recoveryRunStateDir_=null
         * @protected
         * @reactive
         */
        recoveryRunStateDir_: null,
        /**
         * @member {Number} recoveryRunRetentionLimit_=100
         * @protected
         * @reactive
         */
        recoveryRunRetentionLimit_: 100,
        /**
         * @member {Number} restartCooldownMs_=15000
         * @protected
         * @reactive
         */
        restartCooldownMs_: DEFAULT_RECOVERY_RESTART_COOLDOWN_MS,
        /**
         * @member {Number} maxSupervisedAttempts_=3
         * @protected
         * @reactive
         */
        maxSupervisedAttempts_: DEFAULT_SUPERVISED_RECOVERY_ATTEMPT_LIMIT,
        /**
         * @member {Number} healthyObservationThreshold_=1
         * @protected
         * @reactive
         */
        healthyObservationThreshold_: 1,
        /**
         * @member {Function} nowFn_=Date.now
         * @protected
         * @reactive
         */
        nowFn_: Date.now,
        /**
         * @member {Function|null} writeLog_=null
         * @protected
         * @reactive
         */
        writeLog_: null
    }

    /**
     * @summary Applies one typed recovery diagnosis through the lowest-privilege actuator.
     * @param {Object} diagnosisEvent Typed `recovery-diagnosis` event.
     * @param {Object} [options]
     * @param {String} [options.recoveryRunId] Stable run id override.
     * @param {Number} [options.cooldownMs] Reobserve/restart cooldown override.
     * @returns {Promise<Object>} Recovery outcome summary.
     */
    async applyDiagnosis(diagnosisEvent, options = {}) {
        const now           = this.getNow(),
              cooldownMs    = options.cooldownMs ?? this.restartCooldownMs,
              recoveryRunId = options.recoveryRunId || this.buildRecoveryRunId(diagnosisEvent),
              route         = await this.resolveSupervisedRoute(diagnosisEvent, recoveryRunId);

        if (!route.actionable) {
            return this.recordTerminalOutcome({
                recoveryRunId,
                diagnosisEvent,
                attempt: 1,
                rung   : 'rung-2',
                status : route.status,
                now,
                details: route.details
            });
        }

        const attempt = await this.getNextSupervisedAttempt(diagnosisEvent);

        if (attempt > this.maxSupervisedAttempts) {
            return this.recordTerminalOutcome({
                recoveryRunId,
                diagnosisEvent,
                attempt,
                rung   : 'rung-3',
                status : 'escalated',
                now,
                details: {
                    action     : 'escalate-supervised-process',
                    reason     : 'max-supervised-attempts-exceeded',
                    taskName   : route.taskName,
                    attempt,
                    maxAttempts: this.maxSupervisedAttempts
                }
            });
        }

        await this.recordState({
            recoveryRunId,
            diagnosisEvent,
            rung     : 'rung-2',
            attempt,
            status   : 'pending',
            startedAt: now,
            updatedAt: now,
            details  : {
                action  : 'restart-supervised-process',
                taskName: route.taskName,
                tier    : 'B0',
                cooldownMs
            }
        });

        try {
            this.processSupervisorService.superviseTask(route.taskName, now, cooldownMs);
        } catch (error) {
            return this.recordTerminalOutcome({
                recoveryRunId,
                diagnosisEvent,
                attempt,
                rung   : 'rung-2',
                status : 'failed',
                now,
                details: {
                    action  : 'restart-supervised-process',
                    reason  : 'supervise-task-failed',
                    taskName: route.taskName,
                    error   : error.message,
                    tier    : 'B0',
                    cooldownMs
                }
            });
        }

        const reobserveRequest = createRecoveryReobserveRequest({
            recoveryRunId,
            diagnosisEvent,
            requestedAt                : now,
            cooldownMs,
            healthyObservationThreshold: this.healthyObservationThreshold
        });

        const entry = await this.recordState({
            recoveryRunId,
            diagnosisEvent,
            rung       : 'rung-2',
            attempt,
            status     : 'reobserve-requested',
            startedAt  : now,
            updatedAt  : now,
            completedAt: now,
            reobserveRequest,
            details    : {
                action  : 'restart-supervised-process',
                taskName: route.taskName,
                tier    : 'B0',
                cooldownMs
            }
        });

        this.recordRecoveryOutcome('completed', {
            action        : 'restart-supervised-process',
            cooldownMs,
            diagnosisId   : diagnosisEvent.diagnosisId,
            recoveryClass : diagnosisEvent.recoveryClass,
            recoveryRunId,
            rung          : 'rung-2',
            status        : 'reobserve-requested',
            targetIdentity: diagnosisEvent.targetIdentity,
            taskName      : route.taskName,
            tier          : 'B0'
        });

        return {
            action  : 'restart-supervised-process',
            attempt,
            entry,
            recoveryRunId,
            reobserveRequest,
            rung    : 'rung-2',
            status  : 'reobserve-requested',
            taskName: route.taskName
        };
    }

    /**
     * @summary Builds a stable run id for one diagnosis event.
     * @param {Object} diagnosisEvent
     * @returns {String}
     */
    buildRecoveryRunId(diagnosisEvent) {
        const target = diagnosisEvent?.targetIdentity || {};
        return `recovery:${target.kind || 'unknown'}:${target.id || 'unknown'}:${diagnosisEvent?.diagnosisId || 'unknown'}`;
    }

    /**
     * @summary Returns current epoch milliseconds through the configured seam.
     * @returns {Number}
     */
    getNow() {
        return this.nowFn();
    }

    /**
     * @summary Counts prior B0 restart attempts for the same supervised target.
     * @param {Object} diagnosisEvent
     * @returns {Promise<Number>}
     */
    async getNextSupervisedAttempt(diagnosisEvent) {
        const entries = await readRecentRecoveryRunStates({
            dir  : this.recoveryRunStateDir,
            limit: this.recoveryRunRetentionLimit
        });

        const target   = diagnosisEvent.targetIdentity;
        const attempts = entries
            .filter(entry => entry?.targetIdentity?.kind === target.kind)
            .filter(entry => entry?.targetIdentity?.id === target.id)
            .filter(entry => entry?.rung === 'rung-2')
            .filter(entry => entry?.details?.action === 'restart-supervised-process')
            .map(entry => entry.attempt || 0);

        return Math.max(0, ...attempts) + 1;
    }

    /**
     * @summary Resolves whether a diagnosis is eligible for B0 supervised-process recovery.
     * @param {Object} diagnosisEvent
     * @param {String} recoveryRunId
     * @returns {Promise<Object>}
     */
    async resolveSupervisedRoute(diagnosisEvent, recoveryRunId) {
        // Build a pending-shaped entry to validate the typed diagnosis before any action.
        createRecoveryRunStateEntry({
            recoveryRunId,
            diagnosisEvent,
            rung     : 'rung-2',
            attempt  : 1,
            status   : 'pending',
            startedAt: this.getNow(),
            updatedAt: this.getNow()
        });

        const target = diagnosisEvent.targetIdentity;

        if (target.kind !== 'supervised-task') {
            return {
                actionable: false,
                status    : 'no-action',
                details   : {
                    action    : 'none',
                    reason    : 'unsupported-target-kind',
                    targetKind: target.kind
                }
            };
        }

        if (!SUPERVISED_RECOVERY_CLASSES.includes(diagnosisEvent.recoveryClass)) {
            return {
                actionable: false,
                status    : 'no-action',
                details   : {
                    action       : 'none',
                    reason       : 'unsupported-recovery-class',
                    recoveryClass: diagnosisEvent.recoveryClass,
                    taskName     : target.id
                }
            };
        }

        if (!this.processSupervisorService) {
            return {
                actionable: false,
                status    : 'failed',
                details   : {
                    action  : 'restart-supervised-process',
                    reason  : 'missing-process-supervisor',
                    taskName: target.id
                }
            };
        }

        if (!this.processSupervisorService.taskDefinitions?.[target.id]) {
            return {
                actionable: false,
                status    : 'failed',
                details   : {
                    action  : 'restart-supervised-process',
                    reason  : 'unknown-supervised-task',
                    taskName: target.id
                }
            };
        }

        return {
            actionable: true,
            taskName  : target.id
        };
    }

    /**
     * @summary Records a terminal no-op/failed/escalated recovery outcome.
     * @param {Object} options
     * @returns {Promise<Object>}
     */
    async recordTerminalOutcome({recoveryRunId, diagnosisEvent, attempt, rung, status, now, details}) {
        const entry = await this.recordState({
            recoveryRunId,
            diagnosisEvent,
            rung,
            attempt,
            status,
            startedAt  : now,
            updatedAt  : now,
            completedAt: now,
            details
        });

        this.recordRecoveryOutcome(this.resolveHealthOutcomeStatus(status), {
            ...details,
            attempt,
            diagnosisId   : diagnosisEvent.diagnosisId,
            recoveryClass : diagnosisEvent.recoveryClass,
            recoveryRunId,
            rung,
            status,
            targetIdentity: diagnosisEvent.targetIdentity
        });

        return {
            action: details.action,
            attempt,
            entry,
            recoveryRunId,
            rung,
            status
        };
    }

    /**
     * @summary Appends one recovery-run state entry using the configured retention policy.
     * @param {Object} options
     * @returns {Promise<Object>}
     */
    async recordState(options) {
        const entry = createRecoveryRunStateEntry(options);

        await appendRecoveryRunState(entry, {
            dir           : this.recoveryRunStateDir,
            retentionLimit: this.recoveryRunRetentionLimit
        });

        return entry;
    }

    /**
     * @summary Records the recovery-action outcome without letting observability failures affect recovery.
     * @param {String} status HealthService task outcome status.
     * @param {Object} details Recovery outcome details.
     * @returns {void}
     */
    recordRecoveryOutcome(status, details) {
        try {
            this.healthService?.recordTaskOutcome?.(this.healthTaskName, status, details);
        } catch (error) {
            this.writeLog?.('ERROR', `[RecoveryActuator] Failed to record recovery outcome: ${error.message}`);
        }
    }

    /**
     * @summary Maps recovery-run statuses onto HealthService task-outcome statuses.
     * @param {String} status Recovery-run status.
     * @returns {String}
     */
    resolveHealthOutcomeStatus(status) {
        if (status === 'no-action') {
            return 'skipped';
        }
        if (status === 'failed' || status === 'escalated') {
            return 'failed';
        }
        return 'completed';
    }
}

export default Neo.setupClass(RecoveryActuatorService);
