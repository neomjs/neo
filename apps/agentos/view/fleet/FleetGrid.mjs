import AgentCard from './AgentCard.mjs';
import Component from '../../../../src/component/Base.mjs';
import Container from '../../../../src/container/Base.mjs';
import HealthBar from './HealthBar.mjs';

/**
 * Whether a session state is "online" — present and engaged (working, or present-but-blocked /
 * rate-limited). These lead the grid and are never folded: a wedged or rate-limited agent is a
 * thing the operator must see, not calm background. `idle` is its own middle tier; everything
 * else (benched / offline / unknown-guest) is the tail.
 * @param {String} state
 * @returns {Boolean}
 */
const isOnline = state => state === 'ok' || state === 'limited' || state === 'wedged';

/**
 * @summary Pure fleet ranking — the deterministic fold ordering the measured fleet-density evidence
 * requires. Partitions the roster into three tiers — **online** (working/wedged/rate-limited, lead,
 * never folded), **idle** (the calm middle, collapsible), and **benched** (offline + unknown-guest
 * tail) — each sorted by `agentId` so identical inputs produce byte-identical order (snapshot-stable,
 * no dependence on roster arrival order). `folded` trips at `foldThreshold` registered agents: below
 * it the grid shows every card (the 3-col view); at/above it the idle tier collapses to a count so a
 * 12–20-agent fleet never buries the online agents under a wall of idle cards. Pure + serializable;
 * the grid renders its result, so the ordering is unit-provable in isolation.
 * @param {Object[]} agents Roster entries carrying a `state` field.
 * @param {Object} [options]
 * @param {Number} [options.foldThreshold=12] Registered-agent count at/above which the idle tier collapses.
 * @returns {{online: Object[], idle: Object[], benched: Object[], folded: Boolean, idleCount: Number, total: Number}}
 */
export function rankFleet(agents, {foldThreshold = 12} = {}) {
    const list = Array.isArray(agents) ? agents : [],
          byId = (a, b) => String(a?.agentId ?? '').localeCompare(String(b?.agentId ?? '')),

          online  = list.filter(agent => isOnline(agent?.state)).sort(byId),
          idle    = list.filter(agent => agent?.state === 'idle').sort(byId),
          benched = list.filter(agent => !isOnline(agent?.state) && agent?.state !== 'idle').sort(byId),

          folded  = list.length >= foldThreshold;

    return {online, idle, benched, folded, idleCount: idle.length, total: list.length}
}

/**
 * @summary The fleet grid — the cockpit's default view (SSOT §01 fleet zone): a health-summary bar
 * over a ranked, density-aware grid of {@link AgentCard}s. Composes the built primitives (AgentCard ·
 * {@link HealthBar} → HealthSwatch/StateDot) and lays them out against the MEASURED fleet density
 * rather than the mock's six-agent assumption: below `foldThreshold` every card renders (the 3-col
 * view); at/above it the idle tier collapses to a count so the online agents stay in view at 12–20+
 * scale. The header (title + health bar) is a STABLE sub-tree updated in place — only the card set
 * rebuilds on a roster change, so the glance-instrument counts animate rather than flashing. On
 * adapter loss it degrades honestly — a stale banner over the last-known roster, never a blanked grid.
 *
 * The live-roster / runtime-status wire binding and the NL-verified mount at live scale are
 * sibling leaves; this leaf is the grid component + its ranking contract, unit-provable against
 * fixture rosters.
 *
 * @class AgentOS.view.fleet.FleetGrid
 * @extends Neo.container.Base
 */
class FleetGrid extends Container {
    static config = {
        /**
         * @member {String} className='AgentOS.view.fleet.FleetGrid'
         * @protected
         */
        className: 'AgentOS.view.fleet.FleetGrid',
        /**
         * @member {String} ntype='fm-fleet-grid'
         * @protected
         */
        ntype: 'fm-fleet-grid',
        /**
         * @member {String[]} baseCls=['fm-fleet-grid']
         */
        baseCls: ['fm-fleet-grid'],
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         * @reactive
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * The roster to render — every card and the health counts derive from it.
         * @member {Object[]} agents_=[]
         * @reactive
         */
        agents_: [],
        /**
         * Registered-agent count at/above which the idle tier collapses to a count (density-derived).
         * Config-driven so the threshold is tunable, not hard-coded at the call site.
         * @member {Number} foldThreshold_=12
         * @reactive
         */
        foldThreshold_: 12,
        /**
         * Feed liveness — `live` renders normally; `stale` renders the degrade banner over the
         * last-known roster (never a blanked grid).
         * @member {String} adapterState_='live'
         * @reactive
         */
        adapterState_: 'live',
        /**
         * A STABLE surface: the header (title · stale marker · flex spacer · live {@link HealthBar})
         * and the card region. Only the card region's items rebuild on a roster change — the header
         * and its health bar are updated in place so the counts animate rather than flash.
         * @member {Object[]} items
         */
        items: [{
            ntype    : 'container',
            cls      : ['fm-fleet-head', 'is-live'],
            flex     : 'none',
            layout   : {ntype: 'hbox', align: 'center'},
            reference: 'fleet-head',

            items: [
                {module: Component, cls: ['fm-fleet-title'], reference: 'fleet-title', flex: 'none', text: 'Fleet · 0 agents'},
                {module: Component, cls: ['fm-fleet-stale'], reference: 'fleet-stale', flex: 'none', text: ''},
                {ntype: 'component', flex: 1},
                {module: HealthBar, reference: 'fleet-health', flex: 'none'}
            ]
        }, {
            ntype    : 'container',
            cls      : ['fm-fleet-cards'],
            flex     : 1,
            layout   : {ntype: 'base'},
            reference: 'fleet-cards',
            items    : []
        }]
    }

    /**
     * @summary Populate the roster-derived surface once constructed (the header sub-tree exists from
     * static config; its content + the card set are data-derived).
     * @param {...*} args
     */
    onConstructed(...args) {
        super.onConstructed(...args);
        this.refreshGrid()
    }

    /**
     * @param {Object[]} value
     * @param {Object[]} oldValue
     * @protected
     */
    afterSetAgents(value, oldValue) {
        this.isConstructed && this.refreshGrid()
    }

    /**
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetFoldThreshold(value, oldValue) {
        this.isConstructed && this.refreshGrid()
    }

    /**
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetAdapterState(value, oldValue) {
        this.isConstructed && this.refreshGrid()
    }

    /**
     * @summary Refresh the surface: update the stable header in place (title · stale marker · health
     * bar counts) and rebuild only the ranked card set (online cards → collapsed-idle fold when over
     * threshold, else idle cards → benched tail).
     */
    refreshGrid() {
        const rank  = rankFleet(this.agents, {foldThreshold: this.foldThreshold}),
              stale = this.adapterState === 'stale';

        // header — updated in place; the health bar instance persists so counts animate, not flash
        this.getReference('fleet-title').text    = `Fleet · ${rank.total} agents`;
        this.getReference('fleet-stale').text    = stale ? 'stale — reconnecting' : '';
        this.getReference('fleet-health').agents = this.agents;
        this.getReference('fleet-head').cls      = ['fm-fleet-head', stale ? 'is-stale' : 'is-live'];

        // card set — rebuilt (the visible cards change with the roster)
        const cards = [...rank.online.map(agent => this.agentCardConfig(agent))];

        if (rank.folded) {
            rank.idleCount > 0 && cards.push(this.foldConfig(rank.idleCount))
        } else {
            cards.push(...rank.idle.map(agent => this.agentCardConfig(agent)))
        }

        cards.push(...rank.benched.map(agent => this.agentCardConfig(agent)));

        const cardsContainer = this.getReference('fleet-cards');

        cardsContainer.removeAll(true);
        cardsContainer.add(cards)
    }

    /**
     * @summary One AgentCard config from a roster entry — maps the entry onto the card's per-card
     * `stateProvider.data` binding surface (the card owns its own render; this just seeds it).
     * @param {Object} agent
     * @returns {Object}
     */
    agentCardConfig(agent) {
        return {
            module       : AgentCard,
            // The card's control cluster fires an intent-only `lifecycleIntent`; this listener resolves
            // UP the controller chain (card → grid [no controller] → cockpit) to
            // FleetCockpitController.onAgentLifecycleIntent — the C2 consumer that drives the round-trip.
            listeners    : {lifecycleIntent: 'onAgentLifecycleIntent'},
            stateProvider: {
                data: {
                    agentId    : agent?.agentId     ?? null,
                    avatarUrl  : agent?.avatarUrl   ?? null,
                    displayName: agent?.displayName ?? null,
                    engineTag  : agent?.engineTag   ?? null,
                    family     : agent?.family      ?? null,
                    laneLine   : agent?.laneLine    ?? null,
                    state      : agent?.state       ?? 'off'
                }
            }
        }
    }

    /**
     * @summary The collapsed-idle fold — the honest count of idle agents held out of the grid at
     * scale (never a silent drop; the calm tier is summarised, the online tier stays in view).
     * @param {Number} idleCount
     * @returns {Object}
     */
    foldConfig(idleCount) {
        return {module: Component, cls: ['fm-fleet-fold'], text: `${idleCount} idle`}
    }
}

export default Neo.setupClass(FleetGrid);
