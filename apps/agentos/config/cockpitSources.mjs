/**
 * The cockpit's source-label vocabulary — the Body-side TWIN of the Brain authority's
 * `FLEET_COCKPIT_SOURCES` (`ai/services/fleet/fleetCockpitStatus.mjs`). Stable, transport-agnostic
 * labels naming which live substrate produced each row or event, so panes explain provenance
 * operable-cold without importing the Node-only bridge chain. Bound to the authority by
 * `ai/scripts/lint/lint-fleet-vocabulary-parity.mjs` — drift is red CI. A new source is
 * ONE registration in the authority, mirrored here in the same commit.
 * @summary Operable-cold cockpit source-label twin.
 */

/**
 * @type {Object}
 */
export const FLEET_COCKPIT_SOURCES = Object.freeze({
    activity   : 'fleet:activity-adapters',
    a2a        : 'memory-core:mailbox',
    githubPr   : 'github-workflow:pull-requests',
    githubIssue: 'github-workflow:issues',
    commentLane: 'github-workflow:issue-comments',
    graphLane  : 'graph:lane-state',
    graphStall : 'graph:work-stall',
    repoStatus : 'fleet:fleetStatus',
    roster     : 'fleet:listAgents',
    runtime    : 'fleet:runtimeStatus',
    lifecycle  : 'fleet:lifecycle',
    wake       : 'fleet:wakeState',
    throttle   : 'fleet:throttleState',
    presence   : 'fleet:presenceState'
});
