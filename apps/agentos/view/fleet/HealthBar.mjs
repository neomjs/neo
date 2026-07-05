import Container    from '../../../../src/container/Base.mjs';
import HealthSwatch from './HealthSwatch.mjs';

/**
 * Canonical category order for the health summary — the five session-state buckets in the SSOT
 * legend order (working · idle · wedged · rate-limited · benched/offline). One vocabulary shared
 * with {@link HealthSwatch} / {@link StateDot} on the agent-health axis.
 * @type {String[]}
 */
const HEALTH_ORDER = ['ok', 'idle', 'wedged', 'limited', 'off'];

/**
 * @summary Pure fleet → per-category counts — the scale-to-a-glance tally.
 * Buckets each agent's session `state` into the five canonical categories — the SSOT legend has no
 * sixth category, so an unknown / guest / unsupported runtime state folds into `off` (benched-offline),
 * matching the grid's benched tier, rather than a literal key the five-swatch bar would never render.
 * Every agent therefore lands in a RENDERED bucket and the visible bar total can never undercount the
 * roster. Pure + serializable; the bar renders its result, so the tally is unit-provable in isolation.
 * @param {Object[]} agents Roster entries carrying a `state` field.
 * @returns {Object} `{ok, idle, wedged, limited, off}` — exactly the five canonical keys (zero-filled); the counts sum to the roster length.
 */
export function healthCounts(agents) {
    const list   = Array.isArray(agents) ? agents : [],
          counts = {ok: 0, idle: 0, wedged: 0, limited: 0, off: 0};

    list.forEach(agent => {
        // canonical state → its own bucket; anything else (guest/unknown/absent) → off, never a 6th key
        const bucket = Object.hasOwn(counts, agent?.state) ? agent.state : 'off';

        counts[bucket] += 1
    });

    return counts
}

/**
 * @summary The fleet health-summary bar — the scale-to-a-glance instrument:
 * the counts must read before any single card does. Composes one {@link HealthSwatch} per canonical
 * category (working · idle · wedged · rate-limited · benched) in legend order, each carrying its live
 * count. The swatch instances are STABLE across roster changes — `afterSetAgents` updates their
 * counts in place rather than rebuilding — so a count transition animates smoothly instead of
 * flashing, and the CSS pulse stays gated behind `prefers-reduced-motion` (the count value, not the
 * motion, carries the signal).
 *
 * The live-roster wire binding is the sibling leaf; this leaf renders whatever roster it is
 * handed, unit-provable against a fixture.
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
         * The roster the counts derive from; the counts refresh whenever it changes.
         * @member {Object[]} agents_=[]
         * @reactive
         */
        agents_: [],
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
     * @param {Object[]} value
     * @param {Object[]} oldValue
     * @protected
     */
    afterSetAgents(value, oldValue) {
        this.isConstructed && this.applyCounts()
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
     * @summary Reflect the `animateCounts` switch as a class the CSS reads (the pulse stays
     * additionally gated behind `prefers-reduced-motion`).
     * @protected
     */
    updateAnimateCls() {
        const cls = (this.cls || []).filter(c => c !== 'fm-animate-counts');

        this.animateCounts && cls.push('fm-animate-counts');
        this.cls = cls
    }

    /**
     * @summary Push the current per-category counts onto the stable swatch instances — in place, so
     * the transition animates rather than the bar rebuilding.
     */
    applyCounts() {
        const counts = healthCounts(this.agents);

        this.items.forEach(swatch => {
            swatch.count = counts[swatch.state] ?? 0
        })
    }
}

export default Neo.setupClass(HealthBar);
