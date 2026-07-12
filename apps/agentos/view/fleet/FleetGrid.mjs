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
 * @param {Object[]} agents Roster entries carrying a `state` field — FleetAgent records or plain rows.
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
 * over a ranked, density-aware grid of {@link AgentCard}s, rendered from ONE bound `data.Store`
 * ({@link AgentOS.store.FleetRoster}) of {@link AgentOS.model.FleetAgent} records. The Store is the
 * per-row reactive layer: a `load` re-derives the whole surface; a `recordChange` re-ranks when the
 * session `state` moved a card between tiers, and otherwise updates the one affected card in place —
 * no hand-rolled array diffing. Composes the built primitives (AgentCard · {@link HealthBar} →
 * HealthSwatch/StateDot) and lays them out against the MEASURED fleet density rather than the mock's
 * six-agent assumption: below `foldThreshold` every card renders (the 3-col view); at/above it the
 * idle tier collapses to a count so the online agents stay in view at 12–20+ scale. The header
 * (title + health bar) is a STABLE sub-tree updated in place — only the card set rebuilds on a
 * roster change, so the glance-instrument counts animate rather than flashing. On adapter loss it
 * degrades honestly — a stale banner over the last-known roster, never a blanked grid.
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
         * The bound roster Store — every card and the health counts derive from its records.
         * Pass the provider-hosted {@link AgentOS.store.FleetRoster} instance (or an isolated
         * Store of {@link AgentOS.model.FleetAgent} records in tests).
         * @member {Neo.data.Store|null} store_=null
         * @reactive
         */
        store_: null,
        /**
         * Registered-agent count at/above which the idle tier collapses to a count (density-derived).
         * Config-driven so the threshold is tunable, not hard-coded at the call site.
         * @member {Number} foldThreshold_=12
         * @reactive
         */
        foldThreshold_: 12,
        /**
         * Feed liveness — `live` renders normally; `sample` marks the honestly-labelled fixture seed
         * (no roster source wired yet); `stale` renders the degrade banner over the last-known
         * roster (never a blanked grid).
         * @member {String} adapterState_='live'
         * @reactive
         */
        adapterState_: 'live',
        /**
         * Roving-tabindex keyboard navigation over the card set (WCAG grid a11y): the arrow keys move
         * the active card. The `keys` config auto-creates a {@link Neo.util.KeyNavigation}; the handlers
         * shift {@link #focusIndex} by one, clamped to the card count. Up/Left step back, Down/Right step
         * forward (linear over the ranked card list — the visual grid is one focus ring).
         * @member {Object} keys
         */
        keys: {
            Down : 'onRoveNext',
            Left : 'onRovePrev',
            Right: 'onRoveNext',
            Up   : 'onRovePrev'
        },
        /**
         * The roving focus position — the index (within the agent-card subset) of the ONE card that is
         * tab-reachable (`tabIndex 0`); every other card is `-1`, so the grid is a single tab stop and the
         * arrows navigate within it. Plain state: {@link #moveFocus} applies the roving tabindex AND moves
         * DOM focus (keyboard nav), while {@link #refreshGrid} re-applies the tabindex WITHOUT stealing
         * focus on a roster rebuild.
         * @member {Number} focusIndex_=0
         * @reactive
         */
        focusIndex_: 0,
        /**
         * A STABLE surface: the header (title · liveness marker · flex spacer · live {@link HealthBar})
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
            // `neo-selection`: opts the card region into the main-thread arrow-key preventDefault rule
            // (DomEvents.onKeyDown) so roving navigation never scrolls the viewport.
            cls      : ['fm-fleet-cards', 'neo-selection'],
            flex     : 1,
            layout   : {ntype: 'base'},
            reference: 'fleet-cards',
            items    : []
        }]
    }

    /**
     * @summary Populate the roster-derived surface once constructed (the header sub-tree exists from
     * static config; its content + the card set are record-derived).
     * @param {...*} args
     */
    onConstructed(...args) {
        super.onConstructed(...args);

        let me = this;

        // the health bar tallies from the SAME bound store (its own reactive record seam, no array copy)
        me.getReference('fleet-health').store = me.store;
        me.refreshGrid()
    }

    /**
     * Triggered after the store config changed — re-seats the reactive wire: the grid re-derives on
     * the store's `load` and routes `recordChange` to a re-rank or an in-place card update; the
     * header's health bar is re-seated onto the same store (it tallies via its own record seam).
     * @param {Neo.data.Store|null} value
     * @param {Neo.data.Store|null} oldValue
     * @protected
     */
    afterSetStore(value, oldValue) {
        let me        = this,
            listeners = me.getStoreListeners();

        oldValue?.un(listeners);
        value   ?.on(listeners);

        if (me.isConstructed) {
            me.getReference('fleet-health').store = value;
            me.refreshGrid()
        }
    }

    /**
     * @summary The one listener set this grid seats on its bound store — kept in one place so
     * `afterSetStore` re-seating and `destroy` teardown stay symmetric.
     * @returns {Object}
     * @protected
     */
    getStoreListeners() {
        let me = this;

        return {load: me.onStoreLoad, recordChange: me.onStoreRecordChange, scope: me}
    }

    /**
     *
     */
    destroy() {
        this.store?.un(this.getStoreListeners());

        super.destroy()
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
     * @summary The store's `load` — the roster set changed (seed, live replace, clear): re-derive
     * the whole surface.
     * @param {Object} data The store load event `{items, ...}`.
     * @protected
     */
    onStoreLoad(data) {
        this.isConstructed && this.refreshGrid()
    }

    /**
     * @summary One record's fields changed. A session-`state` change moves the card between tiers
     * (online / idle / benched), so it re-ranks; any other field set (display state, the B4/C2
     * `pendingAction` / `controlReason` control seam) updates the one affected card in place — the
     * Store is the per-row reactive layer, no array diffing.
     * @param {Object} data The store recordChange event `{fields, record, index, model}`.
     * @protected
     */
    onStoreRecordChange({fields, record}) {
        let me = this;

        if (!me.isConstructed) {
            return
        }

        if (fields.some(field => field.name === 'state')) {
            me.refreshGrid()
        } else {
            me.getReference('fleet-cards').items
                .find(card => card.record === record)
                ?.applyRecord()
        }
    }

    /**
     * @summary The bound store's records (empty when no store is bound).
     * @returns {Object[]}
     */
    getRecords() {
        return this.store?.items ?? []
    }

    /**
     * @summary Refresh the surface: update the stable header in place (title · liveness marker ·
     * health bar counts) and rebuild only the ranked card set (online cards → collapsed-idle fold
     * when over threshold, else idle cards → benched tail).
     */
    refreshGrid() {
        const me             = this,
              records        = me.getRecords(),
              rank           = rankFleet(records, {foldThreshold: me.foldThreshold}),
              {adapterState} = me;

        // header — updated in place (the health bar is store-bound and tallies itself)
        me.getReference('fleet-title').text = `Fleet · ${rank.total} agents`;
        me.getReference('fleet-stale').text = adapterState === 'stale' ? 'stale — reconnecting' : adapterState === 'sample' ? 'sample roster' : '';
        me.getReference('fleet-head').cls   = ['fm-fleet-head', `is-${adapterState}`];

        // card set — rebuilt (the visible cards change with the roster)
        const cards = [...rank.online.map(record => me.agentCardConfig(record))];

        if (rank.folded) {
            rank.idleCount > 0 && cards.push(me.foldConfig(rank.idleCount))
        } else {
            cards.push(...rank.idle.map(record => me.agentCardConfig(record)))
        }

        cards.push(...rank.benched.map(record => me.agentCardConfig(record)));

        const cardsContainer = me.getReference('fleet-cards');

        cardsContainer.removeAll(true);
        cardsContainer.add(cards);

        // roving-tabindex: re-establish the single tab stop over the freshly-built card set. Clamp the
        // focus position to the new card count and re-apply the tabindex WITHOUT moving DOM focus — a
        // roster refresh must never steal focus from wherever the operator currently is.
        const cardCount = me.getAgentCards().length;
        me.focusIndex   = cardCount > 0 ? Math.min(me.focusIndex, cardCount - 1) : 0;
        me.applyRovingTabIndex()
    }

    /**
     * @summary The agent-card subset of the card region (excludes the collapsed-idle fold row) — the
     * roving focus ring operates over these.
     * @returns {Neo.component.Base[]}
     */
    getAgentCards() {
        return this.getReference('fleet-cards').items.filter(item => item.ntype === 'fm-agent-card')
    }

    /**
     * @summary Reactive re-apply of the roving tabindex — the ONE card at {@link #focusIndex} is the tab
     * stop (`tabIndex 0`), every other card is `-1`. Sets DOM state only; never moves focus (that is
     * {@link #focusActiveCard}, called explicitly on keyboard nav).
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetFocusIndex(value, oldValue) {
        this.isConstructed && this.applyRovingTabIndex()
    }

    /**
     * @summary Writes the roving tabindex across the current card set — active card `0`, the rest `-1` —
     * updating only the cards whose value actually changed. No focus movement.
     */
    applyRovingTabIndex() {
        const me = this;

        me.getAgentCards().forEach((card, index) => {
            const tabIndex = index === me.focusIndex ? 0 : -1;

            if (card.vdom.tabIndex !== tabIndex) {
                card.vdom.tabIndex = tabIndex;
                card.update()
            }
        })
    }

    /**
     * @summary Moves DOM focus to the active card (the {@link #focusIndex} card), without scrolling —
     * the keyboard-nav focus move (distinct from the tabindex-only {@link #applyRovingTabIndex}).
     */
    focusActiveCard() {
        const card = this.getAgentCards()[this.focusIndex];

        // focus is a mounted-DOM side-effect; the roving tabindex state (applyRovingTabIndex) stands on
        // its own, so an unmounted grid (pre-mount, or a headless unit) simply skips the focus move.
        card && this.mounted && card.focus(card.id, false, true)
    }

    /**
     * @summary Shifts the roving focus by `delta` cards, clamped to the card count, then moves DOM focus.
     * The arrow-key handlers ({@link #onRoveNext} / {@link #onRovePrev}) drive it.
     * @param {Number} delta
     */
    moveFocus(delta) {
        const me    = this,
              cards = me.getAgentCards();

        if (!cards.length) {
            return
        }

        me.focusIndex = Math.max(0, Math.min(cards.length - 1, me.focusIndex + delta));
        me.focusActiveCard()
    }

    /**
     * @summary Arrow Down/Right — advance the roving focus one card.
     * @param {Object} data The KeyNavigation event data.
     * @protected
     */
    onRoveNext(data) {
        this.moveFocus(1)
    }

    /**
     * @summary Arrow Up/Left — step the roving focus back one card.
     * @param {Object} data The KeyNavigation event data.
     * @protected
     */
    onRovePrev(data) {
        this.moveFocus(-1)
    }

    /**
     * @summary One AgentCard config from a roster record — the card renders from the record itself
     * (the card owns its own render; this just seats the record).
     * @param {Object} record An AgentOS.model.FleetAgent record.
     * @returns {Object}
     */
    agentCardConfig(record) {
        return {
            module   : AgentCard,
            // Both card events resolve UP the controller chain (card → grid [no controller] → cockpit):
            // `lifecycleIntent` → FleetCockpitController.onAgentLifecycleIntent (the C2 round-trip), and
            // `agentSelect` → onAgentSelect (the drill-in that reveals the detail inspector).
            listeners: {agentSelect: 'onAgentSelect', lifecycleIntent: 'onAgentLifecycleIntent'},
            record
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
