import {createRecoveryDiagnosisEvent} from '../../../services/memory-core/helpers/recoveryRunStateStore.mjs';

/**
 * @module ai/daemons/orchestrator/services/taskOutcomeDiagnosis
 * @summary Producer-core for supervised-maintenance-task failure/overdue diagnosis (parent backup-reliability AC1).
 *
 * A sibling to the container-health diagnosis path — NOT bolted into `ContainerHealthDiagnosisService`
 * (which is container CPU/memory/config-drift-scoped) and NOT modeling a maintenance task as a pageable
 * recovery-actuator target. These are pure functions: they detect a failed/overdue supervised task and
 * build a `recovery-diagnosis` event (`targetIdentity.kind: 'supervised-task'`, `details.actionClass:
 * 'record'`) for a diagnosis-record sink to route. They never restart or retry the task — the
 * recovery boundary (e.g. `recordDiagnosis` in the actuator) owns dispatch; this owns detection.
 *
 * Consumed by (next slice): the `ProcessSupervisorService.recordTaskOutcome('<task>', 'failed', …)` hook
 * and a scheduling-loop overdue check, both for the configured alert-on-failure task set (e.g. `backup`).
 */

// A supervised MAINTENANCE task is escalate-only: the supervisor observes the fault — a non-zero exit
// (failed) OR a scheduled run that never started (overdue) — but NOT its cause, so BOTH outcomes map to
// the `ambiguous` recovery class (escalate-and-page, never auto-restart). Container-crash recovery
// (`crash` -> restart) is `ContainerHealthDiagnosisService`'s domain, not this maintenance-task helper:
// blindly restarting a failed backup neither knows nor fixes the cause.
const MAINTENANCE_TASK_RECOVERY_CLASS = 'ambiguous';

/**
 * @summary Pure overdue detector for a periodically-scheduled supervised task.
 *
 * A task is overdue when `now` is past `lastRunAt + intervalMs + graceMs`. A non-positive `intervalMs`
 * means periodic scheduling is disabled, so the task is never overdue by construction.
 *
 * @param {Object}  options
 * @param {Number} [options.lastRunAt=0] Epoch ms of the last run start (0/absent = never run).
 * @param {Number}  options.intervalMs Periodic interval; `<= 0` disables overdue detection.
 * @param {Number} [options.graceMs=0] Extra slack before declaring overdue.
 * @param {Number}  options.now Current epoch ms.
 * @returns {{overdue: Boolean, overdueByMs: Number}}
 */
export function detectTaskOverdue({lastRunAt, intervalMs, graceMs = 0, now} = {}) {
    if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
        return {overdue: false, overdueByMs: 0};
    }

    const dueAt       = (Number.isFinite(lastRunAt) ? lastRunAt : 0) + intervalMs + Math.max(0, graceMs || 0),
          overdueByMs = (Number.isFinite(now) ? now : 0) - dueAt;

    return {overdue: overdueByMs > 0, overdueByMs: Math.max(0, overdueByMs)};
}

/**
 * @summary Builds the recovery-diagnosis event for a failed or overdue supervised maintenance task.
 *
 * Producer half of the parent backup-reliability AC1 — does NOT restart/retry the task; the event routes to the record sink (the heal-event ledger, never an operator page).
 *
 * @param {Object}  options
 * @param {String}  options.taskName Supervised task id (e.g. `backup`).
 * @param {'failed'|'overdue'} options.outcome The detected fault.
 * @param {Number}  options.observedAt Epoch ms when the fault was observed.
 * @param {Object[]} [options.evidenceFacts=[]] Bounded evidence facts carried into the diagnosis.
 * @param {Object} [options.details={}] Diagnostics-owned details; merged with `actionClass: 'record'`.
 * @returns {Object} A `recovery-diagnosis` event (see `createRecoveryDiagnosisEvent`).
 */
export function buildSupervisedTaskDiagnosis({taskName, outcome, observedAt, evidenceFacts = [], details = {}} = {}) {
    if (typeof taskName !== 'string' || taskName.length === 0) {
        throw new TypeError('buildSupervisedTaskDiagnosis: taskName is required');
    }
    if (outcome !== 'failed' && outcome !== 'overdue') {
        throw new TypeError(`buildSupervisedTaskDiagnosis: outcome must be 'failed' or 'overdue', got ${outcome}`);
    }

    const recoveryClass = MAINTENANCE_TASK_RECOVERY_CLASS;

    return createRecoveryDiagnosisEvent({
        diagnosisId   : `supervised-task:${taskName}:${outcome}:${observedAt}`,
        recoveryClass,
        confidence    : 1,
        targetIdentity: {kind: 'supervised-task', id: taskName},
        evidenceFacts,
        observedAt,
        source        : 'task-outcome-diagnostics',
        details       : {...details, actionClass: 'record', outcome}
    });
}
