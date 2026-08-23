import Container    from '../../../../../src/container/Base.mjs';
import HealthSwatch from './SwatchComponent.mjs';
import SourceHealth from '../../../util/SourceHealth.mjs';

/**
 * Canonical category order for the health summary — the seven session-state buckets in the SSOT
 * legend order (working · idle · wedged · rate-limited · unobserved · external · benched/offline).
 * One vocabulary shared with {@link HealthSwatch} / {@link StateDot} on the agent-health axis.
 * @type {String[]}
 */
const HEALTH_ORDER = ['ok', 'idle', 'wedged', 'limited', 'unobserved', 'external', 'off'];

/**
 * The display states that carry ATTENTION weight — the ones an operator should act on. Everything
 * else is calm: `external` seats are the normal FM-as-client topology, `unobserved` claims nothing,
 * and `ok`/`idle` are nominal. The bar derives its aggregate nominal/attention class from these, so
 * a fleet of un-managed seats with nominal sources reads GREEN — the operator-ratified
 * default-state contract (a header that is always yellow trains the operator to ignore it).
 * @type {String[]}
 */
const ATTENTION_STATES = Object.freeze(['wedged', 'limited']);

/**
 * @summary Pure fleet → per-category counts — the scale-to-a-glance tally.
 * Buckets each agent through {@link SourceHealth.resolveFleetDisplayState} — the SAME resolver the AgentCard
 * renders from, so the glance tally and every card can never diverge: a roster-only active row
 * counts as `unobserved` here exactly as the card displays it, while an explicit operator-benched
 * `off` counts as benched in both. Unknown/guest rows fold into `off` (never a 7th key). Every
 * agent lands in a RENDERED bucket and the visible bar total can never undercount the roster.
 * Pure + serializable; the bar renders its result, so the tally is unit-provable in isolation.
 * @param {Object[]} agents Roster entries carrying `state` + `sources` fields — FleetAgent records or plain rows.
 * @returns {Object} `{ok, idle, wedged, limited, unobserved, off}` — exactly the six canonical keys (zero-filled); the counts sum to the roster length.
 */
export function healthCounts(agents) {
    const list   = Array.isArray(agents) ? agents : [],
          counts = {ok: 0, idle: 0, wedged: 0, limited: 0, unobserved: 0, external: 0, off: 0};

    list.forEach(agent => {
        // canonical display state → its own bucket; a non-bucket value (transitional
        // starting/stopping never reaches the tally, but fail closed anyway) → external, matching
        // the resolver's own outside-supervision fold — never an invented benched verdict
        const resolved = SourceHealth.resolveFleetDisplayState({state: agent?.state, sources: agent?.sources}),
              key      = Object.hasOwn(counts, resolved) ? resolved : 'external';

        counts[key] += 1
    });

    return counts
}

/**
 * @summary Pure counts → session-bucket attention: `true` when any attention-weighted bucket is
 * non-zero. `external`/`unobserved`/`off` deliberately carry no weight — un-managed seats are the
 * normal topology, and a managed-stopped seat is a fact, not an alarm. One input to
 * {@link #deriveAttention}; exported separately so the bucket matrix stays unit-provable alone.
 * @param {Object} counts The {@link #healthCounts} result.
 * @returns {Boolean}
 */
export function hasAttention(counts) {
    return ATTENTION_STATES.some(state => (counts?.[state] ?? 0) > 0)
}

/**
 * @summary The single aggregate attention projection — every truth the header dot claims to
 * summarize, folded in one pure derivation:
 * - **session buckets** ({@link #hasAttention}: wedged / rate-limited);
 * - **answered-abnormal sources**: any row source fact whose state is `missing` — a producer
 *   ANSWERED that something is gone. `not-wired` deliberately contributes nothing: it is the
 *   expected-absent state of every un-managed seat, and weighting it would make the header
 *   permanently yellow again — the exact falsified default this ticket retires;
 * - **degraded presence capability** (the roster-level chip's condition — the two surfaces read
 *   one fact, so the chip can never render over a green dot);
 * - **daemon fault** (the spine banner's own fault set, plumbed as a boolean — one authority).
 * @param {Object} options
 * @param {Object} [options.counts] The {@link #healthCounts} result.
 * @param {Object[]} [options.rows=[]] Roster rows carrying `sources` field bags.
 * @param {Boolean} [options.daemonFault=false] Brain daemon in a fault state.
 * @param {Boolean} [options.presenceDegraded=false] Presence capability envelope degraded.
 * @returns {Boolean}
 */
export function deriveAttention({counts, rows = [], daemonFault = false, presenceDegraded = false} = {}) {
    if (hasAttention(counts) || daemonFault || presenceDegraded) {
        return true
    }

    return (Array.isArray(rows) ? rows : []).some(row => {
        const sources = SourceHealth.normalizeFleetSources(row?.sources);

        // missing (a producer answered something is gone) and invalid (a present answer the
        // contract rejected) both carry weight; only genuine absence stays calm
        return SourceHealth.FLEET_SOURCE_KEYS.some(key => sources[key].state === 'missing' || sources[key].state === 'invalid')
    })
}

/**
 * @summary The fleet health-summary bar — the scale-to-a-glance instrument:
 * the counts must read before any single card does. Composes one {@link HealthSwatch} per canonical
 * category (working · idle · wedged · rate-limited · benched) in legend order, each carrying its live
 * count, tallied from the SAME bound roster Store the grid renders from ({@link AgentOS.store.FleetRoster}
 * records — no re-materialized plain-array copy). The Store is the reactive layer: a `load` re-tallies,
 * and a `recordChange` re-tallies when the session `state` moved a resident between buckets. The swatch
 * instances are STABLE across roster changes — counts update in place rather than rebuilding — so a
 * count transition animates smoothly instead of flashing, and the CSS pulse stays gated behind
 * `prefers-reduced-motion` (the count value, not the motion, carries the signal).
 *
 * @class AgentOS.view.fleet.health.Container
 * @extends Neo.container.Base
 */
class HealthBar extends Container {
    static config = {
        /**
         * @member {String} className='AgentOS.view.fleet.health.Container'
         * @protected
         */
        className: 'AgentOS.view.fleet.health.Container',
        /**
         * @member {String} ntype='fm-health-bar'
         * @protected
         */
        ntype: 'fm-health-bar',
        /**
         * @member {String[]} baseCls=['fm-health-bar']
         */
        baseCls: ['fm-health-bar'],
        /**
         * @member {Object} layout={ntype:'hbox',align:'center'}
         * @reactive
         */
        layout: {ntype: 'hbox', align: 'center'},
        /**
         * The bound roster Store the counts derive from — the same record seam the grid renders
         * (never a hand-pushed plain-array copy). Counts refresh on `load` and on session-`state`
         * record changes.
         * @member {Neo.data.Store|null} store_=null
         * @reactive
         */
        store_: null,
        /**
         * Whether count transitions animate — carried onto the bar as a class the CSS reads (the
         * animation itself is additionally gated behind `prefers-reduced-motion`, so this is the
         * explicit off-switch and reduced-motion is the implicit one).
         * @member {Boolean} animateCounts_=true
         * @reactive
         */
        animateCounts_: true,
        /**
         * The non-roster attention facts the aggregate dot folds beside the row-derived truth:
         * `{daemonFault: Boolean, presenceDegraded: Boolean}`, plumbed by the owning surface
         * (FleetGrid / the cockpit) from the authorities that already hold them — the bar derives
         * nothing about daemons or capabilities itself, it only summarizes what it is handed.
         * @member {Object|null} attentionInputs_=null
         * @reactive
         */
        attentionInputs_: null,
        /**
         * One stable swatch per canonical category, in legend order — counts update in place.
         * @member {Object[]} items
         */
        items: HEALTH_ORDER.map(state => ({module: HealthSwatch, flex: 'none', state, count: 0}))
    }

    /**
     * @summary Seed the counts once constructed (the swatches exist from static config; only their
     * counts are data-derived).
     * @param {...*} args
     */
    onConstructed(...args) {
        super.onConstructed(...args);
        this.updateAnimateCls();
        this.applyCounts()
    }

    /**
     * Triggered after the store config changed — re-seats the reactive wire: the bar re-tallies on
     * the store's `load` and on session-`state` record changes.
     * @param {Neo.data.Store|null} value
     * @param {Neo.data.Store|null} oldValue
     * @protected
     */
    afterSetStore(value, oldValue) {
        let me        = this,
            listeners = me.getStoreListeners();

        oldValue?.un(listeners);
        value   ?.on(listeners);

        me.isConstructed && me.applyCounts()
    }

    /**
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetAnimateCounts(value, oldValue) {
        this.isConstructed && this.updateAnimateCls()
    }

    /**
     * Triggered after the attentionInputs config changed — the non-roster halves of the aggregate
     * verdict moved (daemon fault / presence capability), so the fold re-derives.
     * @param {Object|null} value
     * @param {Object|null} oldValue
     * @protected
     */
    afterSetAttentionInputs(value, oldValue) {
        this.isConstructed && this.applyCounts()
    }

    /**
     * @summary The one listener set this bar seats on its bound store — kept in one place so
     * `afterSetStore` re-seating and `destroy` teardown stay symmetric.
     * @returns {Object}
     * @protected
     */
    getStoreListeners() {
        let me = this;

        return {load: me.onStoreLoad, recordChange: me.onStoreRecordChange, scope: me}
    }

    /**
     * @summary The store's `load` — the roster set changed: re-tally.
     * @param {Object} data The store load event `{items, ...}`.
     * @protected
     */
    onStoreLoad(data) {
        this.isConstructed && this.applyCounts()
    }

    /**
     * @summary One record's fields changed — a session-`state` change can move a resident between
     * buckets, and a `sources` change can flip both the resolved bucket (unmanaged↔managed) AND
     * the answered-abnormal half of the aggregate verdict; anything else is a no-op for the tally.
     * @param {Object} data The store recordChange event `{fields, record, index, model}`.
     * @protected
     */
    onStoreRecordChange({fields}) {
        this.isConstructed && fields.some(field => field.name === 'state' || field.name === 'sources') && this.applyCounts()
    }

    /**
     *
     */
    destroy() {
        this.store?.un(this.getStoreListeners());

        super.destroy()
    }

    /**
     * @summary Reflect the `animateCounts` switch as a class the CSS reads (the pulse stays
     * additionally gated behind `prefers-reduced-motion`).
     * @protected
     */
    updateAnimateCls() {
        this.toggleCls('fm-animate-counts', this.animateCounts)
    }

    /**
     * @summary Push the current per-category counts onto the stable swatch instances — in place, so
     * the transition animates rather than the bar rebuilding — and reflect the SINGLE aggregate
     * projection ({@link #deriveAttention}: session buckets + answered-abnormal sources + the
     * plumbed daemon/presence facts) as the nominal/attention class pair the skin colours.
     */
    applyCounts() {
        let me     = this,
            rows   = me.store?.items ?? [],
            counts = healthCounts(rows),
            alert  = deriveAttention({
                counts,
                rows,
                daemonFault     : me.attentionInputs?.daemonFault      === true,
                presenceDegraded: me.attentionInputs?.presenceDegraded === true
            });

        me.items.forEach(swatch => {
            swatch.count = counts[swatch.state] ?? 0
        });

        me.toggleCls('fm-health-attention', alert);
        me.toggleCls('fm-health-nominal', !alert)
    }
}

export default Neo.setupClass(HealthBar);
