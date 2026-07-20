import Container    from '../../../../src/container/Base.mjs';
import HealthSwatch from './HealthSwatch.mjs';
import {resolveFleetDisplayState} from './sourceHealth.mjs';

/**
 * Canonical category order for the health summary — the six session-state buckets in the SSOT
 * legend order (working · idle · wedged · rate-limited · unobserved · benched/offline). One
 * vocabulary shared with {@link HealthSwatch} / {@link StateDot} on the agent-health axis.
 * @type {String[]}
 */
const HEALTH_ORDER = ['ok', 'idle', 'wedged', 'limited', 'unobserved', 'off'];

/**
 * @summary Pure fleet → per-category counts — the scale-to-a-glance tally.
 * Buckets each agent through {@link resolveFleetDisplayState} — the SAME resolver the AgentCard
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
          counts = {ok: 0, idle: 0, wedged: 0, limited: 0, unobserved: 0, off: 0};

    list.forEach(agent => {
        // canonical state → its own bucket; anything else (guest/unknown/absent) → off, never a 7th key
        const resolved = resolveFleetDisplayState({state: agent?.state, sources: agent?.sources}),
              key      = Object.hasOwn(counts, resolved) ? resolved : 'off';

        counts[key] += 1
    });

    return counts
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
 * @class AgentOS.view.fleet.HealthBar
 * @extends Neo.container.Base
 */
class HealthBar extends Container {
    static config = {
        /**
         * @member {String} className='AgentOS.view.fleet.HealthBar'
         * @protected
         */
        className: 'AgentOS.view.fleet.HealthBar',
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
     * @summary One record's fields changed — only a session-`state` change can move a resident
     * between buckets, so anything else is a no-op for the tally.
     * @param {Object} data The store recordChange event `{fields, record, index, model}`.
     * @protected
     */
    onStoreRecordChange({fields}) {
        this.isConstructed && fields.some(field => field.name === 'state') && this.applyCounts()
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
     * the transition animates rather than the bar rebuilding.
     */
    applyCounts() {
        const counts = healthCounts(this.store?.items ?? []);

        this.items.forEach(swatch => {
            swatch.count = counts[swatch.state] ?? 0
        })
    }
}

export default Neo.setupClass(HealthBar);
