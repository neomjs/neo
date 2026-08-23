import Base from '../../../src/core/Base.mjs';

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
 * Colors bind the dedicated --fm-kind-* family — event kind is a SEPARATE visual axis from agent
 * session-state (kind = what happened; state = agent health), so kinds never reuse the state
 * health-hues and never blur with a state dot where the two co-occur in the activity stream. Kinds
 * group into the design-vocabulary buckets pr / a2a / review / alert (+ a neutral for the unknown).
 */

const KIND_TOKEN = {
    'pr'                : '--fm-kind-pr',
    'pr-activity'       : '--fm-kind-pr',
    'lifecycle-success' : '--fm-kind-pr',
    'a2a'               : '--fm-kind-a2a',
    'a2a-activity'      : '--fm-kind-a2a',
    'lane-claim'        : '--fm-kind-a2a',
    'issue-activity'    : '--fm-kind-a2a',
    'review'            : '--fm-kind-review',
    'lifecycle-request' : '--fm-kind-review',
    'bridge-gated'      : '--fm-kind-review',
    'alert'             : '--fm-kind-alert',
    'work-stall'        : '--fm-kind-alert',
    'lifecycle-failure' : '--fm-kind-alert',
    'bridge-unavailable': '--fm-kind-alert',
    'source-degraded'   : '--fm-kind-alert'
};

const KIND_LABEL = {
    'pr'                : 'pr',
    'pr-activity'       : 'pr',
    'lifecycle-success' : 'ok',
    'a2a'               : 'a2a',
    'a2a-activity'      : 'a2a',
    'lane-claim'        : 'lane',
    'issue-activity'    : 'issue',
    'review'            : 'review',
    'lifecycle-request' : 'request',
    'bridge-gated'      : 'gated',
    'alert'             : 'alert',
    'work-stall'        : 'stall',
    'lifecycle-failure' : 'fail',
    'bridge-unavailable': 'offline',
    'source-degraded'   : 'degraded'
};

/**
 * Static Fleet activity-kind presentation registry.
 * @class AgentOS.util.KindRegistry
 * @extends Neo.core.Base
 */
class KindRegistry extends Base {
    static config = {
        /**
         * @member {String} className='AgentOS.util.KindRegistry'
         * @protected
         */
        className: 'AgentOS.util.KindRegistry'
    }

    /**
     * Pure kind → color-token resolver — the single source of truth for chip color, on the --fm-kind-*
     * axis. Unknown kinds degrade to the neutral kind token, so the chip absorbs kind-set growth
     * without a broken color. Uses an `Object.hasOwn` check (not `MAP[k] ||`) so a prototype-shaped key
     * (`toString`, `constructor`, `__proto__`) degrades to neutral instead of leaking an inherited value.
     * @param {String} kind
     * @returns {String} the color custom-property name (e.g. `--fm-kind-pr`)
     */
    static kindToken(kind) {
        return Object.hasOwn(KIND_TOKEN, kind) ? KIND_TOKEN[kind] : '--fm-kind-neutral'
    }

    /**
     * Pure kind → CSS-class resolver — the kind token minus its `--` custom-property prefix (e.g.
     * `fm-kind-pr`). The class binds `--fm-chip` in the chip SCSS, so color stays entirely in the
     * token/skin layer: the chip swaps a class, never writes a style. Shares `kindToken`'s
     * unknown → neutral degrade.
     * @param {String} kind
     * @returns {String} the kind class name (e.g. `fm-kind-pr`)
     */
    static kindClass(kind) {
        return KindRegistry.kindToken(kind).slice(2)
    }

    /**
     * Pure kind → short-label resolver. Unknown kinds fall back to the kind string itself, so a new
     * kind still renders a readable (if verbose) chip until it earns a short label here. Uses an
     * `Object.hasOwn` check (not `MAP[k] ||`) so a prototype-shaped key (`toString`, `constructor`,
     * `__proto__`) falls back to its literal string instead of leaking an inherited Object.prototype value.
     * @param {String} kind
     * @returns {String}
     */
    static kindLabel(kind) {
        return Object.hasOwn(KIND_LABEL, kind) ? KIND_LABEL[kind] : (kind ?? 'event')
    }
}

export default Neo.setupClass(KindRegistry);
