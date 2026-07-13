/**
 * @module ai/services/memory-core/taskAssignmentContract
 * @summary Shared Memory Core contract for server-owned A2A Task assignment and transition facts.
 */

/**
 * Provenance value proving that Memory Core, rather than caller-authored Task JSON,
 * assigned `task.assignee`.
 *
 * Writers persist this marker with the assignment; wake consumers require the same marker before
 * treating the nested assignee as authoritative.
 *
 * @type {String}
 */
export const TASK_ASSIGNMENT_AUTHORITY = 'memory-core.v1';

/**
 * Canonical A2A Task-state vocabulary shared by mutation and event consumers.
 * @type {ReadonlyArray<String>}
 */
export const TASK_STATES = Object.freeze([
    'Submitted',
    'Working',
    'InputRequired',
    'Completed',
    'Canceled',
    'Failed',
    'Rejected',
    'AuthRequired',
    'Unknown',
    'Expired',
    'Blocked'
]);

/**
 * Canonical GraphLog `entity_type` for an immutable Task transition.
 * @type {String}
 */
export const TASK_STATE_CHANGED_ENTITY_TYPE = 'task_state_changed';

/**
 * Schema version stored inside every typed Task-transition GraphLog payload.
 * @type {String}
 */
export const TASK_STATE_CHANGED_SCHEMA_VERSION = 'task-state-change.v1';
