/**
 * The fleet event-kind registry: a data-driven kind → {token, label} map plus a resolver with a
 * neutral fallback. Kept as its own module — pure data, no component coupling — so kind-set growth
 * (new lifecycle kinds, graduation signals) is one map entry with zero component edits. Consumed by
 * EventChip and any activity-stream / agent-detail view.
 *
 * Coverage: every event kind the merged cockpit DTO emits (the FLEET_COCKPIT_EVENT_TYPES —
 * lifecycle-request/success/failure, bridge-unavailable/gated, pr-activity, issue-activity,
 * lane-claim, work-stall, source-degraded) plus the design mock's four (pr / a2a / review / alert).
 *
 * Colors REUSE the existing --fm-state-* / --fm-signal palette (per the mock — review→idle,
 * alert→wedged) rather than a dedicated --fm-kind-* layer. That palette choice is design-authority
 * owned; because every consumer reads the token through this one resolver, refining it (or moving
 * to a --fm-kind-* set) touches only this module, never a view.
 */

const KIND_TOKEN = {
    'pr'                : '--fm-state-ok',
    'pr-activity'       : '--fm-state-ok',
    'lifecycle-success' : '--fm-state-ok',
    'a2a'               : '--fm-signal',
    'lane-claim'        : '--fm-signal',
    'issue-activity'    : '--fm-signal',
    'lifecycle-request' : '--fm-state-idle',
    'review'            : '--fm-state-idle',
    'bridge-gated'      : '--fm-state-idle',
    'alert'             : '--fm-state-wedged',
    'work-stall'        : '--fm-state-wedged',
    'lifecycle-failure' : '--fm-state-wedged',
    'bridge-unavailable': '--fm-state-wedged',
    'source-degraded'   : '--fm-state-limited'
};

const KIND_LABEL = {
    'pr'                : 'pr',
    'pr-activity'       : 'pr',
    'lifecycle-success' : 'ok',
    'a2a'               : 'a2a',
    'lane-claim'        : 'lane',
    'issue-activity'    : 'issue',
    'lifecycle-request' : 'request',
    'review'            : 'review',
    'bridge-gated'      : 'gated',
    'alert'             : 'alert',
    'work-stall'        : 'stall',
    'lifecycle-failure' : 'fail',
    'bridge-unavailable': 'offline',
    'source-degraded'   : 'degraded'
};

/**
 * Pure kind → color-token resolver — the single source of truth for chip color. Unknown kinds
 * degrade to the neutral token, so the chip absorbs kind-set growth without a broken color.
 * @param {String} kind
 * @returns {String} the color custom-property name (e.g. `--fm-state-ok`)
 */
export function kindToken(kind) {
    return KIND_TOKEN[kind] || '--fm-state-off'
}

/**
 * Pure kind → short-label resolver. Unknown kinds fall back to the kind string itself, so a new
 * kind still renders a readable (if verbose) chip until it earns a short label here.
 * @param {String} kind
 * @returns {String}
 */
export function kindLabel(kind) {
    return KIND_LABEL[kind] || (kind ?? 'event')
}
