/**
 * @module ai/services/memory-core/taskAssignmentContract
 * @summary Shared Memory Core contract for server-owned A2A Task assignment provenance.
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
