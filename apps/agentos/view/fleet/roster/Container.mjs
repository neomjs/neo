import AgentCard    from './card/Container.mjs';
import Button       from '../../../../../src/button/Base.mjs';
import Component    from '../../../../../src/component/Base.mjs';
import Container    from '../../../../../src/container/Base.mjs';
import FocusManager from '../../../../../src/manager/Focus.mjs';
import HealthBar    from '../health/Container.mjs';

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
 * The focusable native child Buttons of an AgentCard, in Tab order (drill → toggle → restart) — the
 * set gate-3 focus-continuity restores across a roster rebuild. `card-name` is the dedicated drill
 * Button; the two controls are the lifecycle cluster.
 * @type {String[]}
 */
const SEMANTIC_CHILD_REFS = ['card-name', 'control-toggle', 'control-restart'];

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
 * @class AgentOS.view.fleet.roster.Container
 * @extends Neo.container.Base
 */
class FleetGrid extends Container {
    static config = {
        /**
         * @member {String} className='AgentOS.view.fleet.roster.Container'
         * @protected
         */
        className: 'AgentOS.view.fleet.roster.Container',
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
         * The roster's presence-CAPABILITY envelope (the assembler DTO's `capabilities.presence`:
         * `{source, state, confidence, capturedAt, reason}`), plumbed by the cockpit's roster load.
         * Owns the header chip that NAMES an axis degradation: when the producer answered
         * `degraded`, every card's band correctly vanishes (absence of signal, never a verdict) —
         * but unnamed absence reads as "no one is online" to a human, the live operator falsifier.
         * `wired` and `not-wired` render NOTHING (bands speak for themselves; an expected-absent
         * axis must not become another permanent line), and recovery clears the chip on the next
         * plumbed snapshot.
         * @member {Object|null} presenceCapability_=null
         * @reactive
         */
        presenceCapability_: null,
        /**
         * Whether a Brain daemon sits in a fault state — the spine banner's own fault set
         * (`DAEMON_FAULT_STATES`), plumbed by the cockpit from the one lifecycle authority. Feeds
         * the health bar's aggregate attention fold; this grid derives nothing about daemons.
         * @member {Boolean} daemonFault_=false
         * @reactive
         */
        daemonFault_: false,
        /**
         * An OPTIONAL Up/Down efficiency shortcut that jumps focus between the DRILL Buttons only (the
         * gate-1 scale disposition) — a fast inter-agent jump for large rosters WITHOUT an outer roving
         * tab stop or a hidden interaction mode. Every control (drill / toggle / restart) stays in ordinary
         * Tab order; the jump fires only when a drill Button already holds focus. The `keys` config
         * auto-creates a {@link Neo.util.KeyNavigation}; Left/Right are intentionally absent (that would be
         * a 2D composite-grid contract this ranked list is not), and Space/Enter are owned natively by the
         * Buttons, so they are not remapped here.
         * @member {Object} keys
         */
        keys: {
            Down: 'onDrillNext',
            Up  : 'onDrillPrev'
        },
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
                {
                    // the presence-capability chip: NAMES the axis degradation so absent bands stop
                    // reading as a verdict ("no one is online" — the operator falsifier this
                    // answers). Renders ONLY for a degraded producer; wired stays absent (bands
                    // speak) and not-wired stays absent (an expected-absent axis must not become
                    // another permanent line). role=status: it is the roster's presence live-region.
                    module   : Component,
                    cls      : ['fm-fleet-presence-cap'],
                    flex     : 'none',
                    hidden   : true,
                    reference: 'fleet-presence-cap',
                    role     : 'status'
                },
                {ntype: 'component', flex: 1},
                {module: HealthBar, reference: 'fleet-health', flex: 'none'}
            ]
        }, {
            ntype    : 'container',
            // WCAG: the ranked roster IS a list — this container is the `role=list` owner of the
            // `role=listitem` AgentCards (a listitem needs a list owner to form a valid topology). The
            // arrow-scroll preventDefault marker (`neo-selection`) lives on the drill Buttons themselves
            // (AgentCard), not here — the Up/Down efficiency jump is scoped to drill targets, so a plain
            // Tab through the controls scrolls normally.
            cls      : ['fm-fleet-cards'],
            flex     : 1,
            layout   : {ntype: 'base'},
            reference: 'fleet-cards',
            role     : 'list',
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

        // a11y: the roster is a named landmark region so screen-reader users can navigate to it as a
        // distinct cockpit surface. Set on the root before refreshGrid's first render flushes the vdom.
        Object.assign(me.vdom, {role: 'region', 'aria-label': 'Fleet roster'});

        // the health bar tallies from the SAME bound store (its own reactive record seam, no array copy)
        me.getReference('fleet-health').store = me.store;
        // a create-time capability envelope lands after the reference tree exists — explicitly,
        // because isConstructed stays false until the whole onConstructed chain completes, so the
        // reactive hook cannot fire here (the HealthBar applyCounts pattern)
        me.presenceCapability && me.applyPresenceCapability(me.presenceCapability);
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
     * Triggered after the presenceCapability config changed — routes to the applier once the
     * reference tree exists (the create-time envelope is applied explicitly from onConstructed,
     * where isConstructed is still false by design).
     * @param {Object|null} value
     * @param {Object|null} oldValue
     * @protected
     */
    afterSetPresenceCapability(value, oldValue) {
        this.isConstructed && this.applyPresenceCapability(value)
    }

    /**
     * @summary Render the presence-capability envelope onto the header chip: a DEGRADED producer
     * gets named (with its own retained reason when one exists), every other envelope clears the
     * chip. The a11y label mirrors the visible words (no colour-only or hover-only channel).
     * Idempotent — a polling cockpit re-plumbing the same envelope re-renders the same chip.
     * @param {Object|null} value
     * @protected
     */
    applyPresenceCapability(value) {
        const
            degraded = value?.state === 'degraded',
            reason   = degraded && typeof value.reason === 'string' && value.reason.trim(),
            text     = degraded ? `presence unobservable${reason ? ` · ${reason}` : ''}` : '',
            chip     = this.getReference('fleet-presence-cap');

        chip.set({hidden: !degraded, text});
        chip.changeVdomRootKey('aria-label', degraded ? `Presence: unobservable.${reason ? ` ${reason}.` : ''}` : null);

        // the chip and the aggregate dot read ONE fact: a rendered degradation always carries
        // attention weight, so the chip can never sit over a green header
        this.pushAttentionInputs()
    }

    /**
     * Triggered after the daemonFault config changed — the cockpit-plumbed lifecycle fact feeds
     * the bar's aggregate fold.
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetDaemonFault(value, oldValue) {
        this.isConstructed && this.pushAttentionInputs()
    }

    /**
     * @summary Hand the bar the non-roster attention facts this grid holds — one push site, so the
     * chip render and the aggregate verdict cannot diverge.
     * @protected
     */
    pushAttentionInputs() {
        this.getReference('fleet-health').attentionInputs = {
            daemonFault     : this.daemonFault === true,
            presenceDegraded: this.presenceCapability?.state === 'degraded'
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
    /**
     * @summary The bootstrap CTA's click — one intent event; the owning cockpit opens the S5
     * define-agent zone (the grid never touches dock state itself: layout-blind).
     */
    onEmptyCtaClick() {
        this.fire('addAgentRequest', {})
    }

    refreshGrid() {
        const me             = this,
              records        = me.getRecords(),
              rank           = rankFleet(records, {foldThreshold: me.foldThreshold}),
              {adapterState} = me;

        // header — updated in place (the health bar is store-bound and tallies itself)
        me.getReference('fleet-title').text = `Fleet · ${rank.total} agents`;
        // 'static roster' without an offline claim: sample only proves WHICH data renders, never
        // WHY — the transport may be answering (empty registry) or silent, and the spine banner is
        // the surface that knows which. A badge asserting "offline" against a replying server lies
        // one level below the banner that used to tell the same lie.
        me.getReference('fleet-stale').text = adapterState === 'stale' ? 'stale — reconnecting' : adapterState === 'sample' ? 'static roster' : '';
        me.getReference('fleet-head').cls   = ['fm-fleet-head', `is-${adapterState}`];

        // card set — rebuilt (the visible cards change with the roster)
        const cards = [...rank.online.map(record => me.agentCardConfig(record))];

        if (rank.folded) {
            rank.idleCount > 0 && cards.push(me.foldConfig(rank.idleCount))
        } else {
            cards.push(...rank.idle.map(record => me.agentCardConfig(record)))
        }

        cards.push(...rank.benched.map(record => me.agentCardConfig(record)));

        // the bootstrap CTA (design ruling on record): an EMPTY fleet must have a findable path to
        // its first agent — a new operator stranded at a blank cockpit is the one discoverability
        // gap the invoked-not-ambient rail entry cannot cover. Renders ONLY at roster count 0 and
        // therefore disappears with the first agent: not ambient chrome, so the density contract
        // holds for every populated fleet. A native Button — real element, ordinary Tab order.
        rank.total === 0 && cards.push({
            module : Button,
            cls    : ['fm-fleet-empty-cta'],
            handler: me.onEmptyCtaClick.bind(me),
            iconCls: 'fa fa-plus',
            text   : 'Add your first agent'
        });

        const cardsContainer = me.getReference('fleet-cards');

        // capture the focused resident AND which semantic child (drill / toggle / restart) held focus
        // BEFORE the destroy/recreate — so gate-3 restores the EXACT child on the resident's rebuilt card,
        // never the card root and never a different agent.
        //
        // The focused card is the one that is BOTH still marked `containsFocus` AND named by the
        // authoritative most-recent focus path (manager.Focus.history[0]). A `containsFocus` scan ALONE
        // is not enough: a same-app focus move slower than manager.Focus.maxFocusInOutGap (50ms) — which
        // a dense card's re-render can induce between the outgoing focusout and the incoming focusin —
        // is classified as a fresh `focusEnter`, which never clears the PRIOR card's `containsFocus`. Two
        // cards then read as focused at once and a first-match scan restores the stale one (the wrong
        // agent's control). Intersecting with the live focus path names the card that actually holds
        // focus; the `containsFocus` term is retained so we still restore ONLY when focus genuinely
        // remains in the grid — a background refresh must never steal focus.
        const
            focusPath       = FocusManager.history[0]?.componentPath ?? [],
            focusedCard     = me.getAgentCards().find(card => card.containsFocus && focusPath.includes(card.id)),
            residentFocusId = focusedCard?.record?.agentId ?? null,
            focusedChildRef = focusedCard
                ? (SEMANTIC_CHILD_REFS.find(ref => focusPath.includes(focusedCard.getReference(ref)?.id)) ?? null)
                : null;

        cardsContainer.removeAll(true);
        cardsContainer.add(cards);

        // focus-continuity (gate-3): the destroy/recreate dropped physical focus to <body>. Restore it ONLY
        // when the grid HELD focus (residentFocusId set) — a background refresh must never steal focus —
        // moving it to the SAME semantic child of the resident's replacement card (falling back to the drill
        // Button when that child is gone or hidden). Deferred via promiseUpdate: focus is a mounted-DOM side
        // effect, so it must run AFTER the recreated card mounts (a synchronous call skips the unmounted one).
        if (residentFocusId) {
            const newCard = me.getAgentCards().find(card => card.record?.agentId === residentFocusId);

            newCard && me.promiseUpdate().then(() => {
                const
                    child  = newCard.getReference(focusedChildRef ?? 'card-name'),
                    target = child && !child.hidden ? child : newCard.getReference('card-name');

                target && me.mounted && target.focus(target.id, false, true)
            })
        }
    }

    /**
     * @summary The agent-card subset of the card region (excludes the collapsed-idle fold row) — the
     * drill-to-drill Up/Down jump + gate-3 focus restoration operate over these.
     * @returns {Neo.component.Base[]}
     */
    getAgentCards() {
        return this.getReference('fleet-cards').items.filter(item => item.ntype === 'fm-agent-card')
    }

    /**
     * @summary The OPTIONAL drill-to-drill efficiency jump (the gate-1 scale disposition): moves focus to
     * the prev/next card's DRILL Button by `delta`, clamped to the card count. Fires ONLY when a drill
     * Button already holds focus — a control (toggle / restart) focus is left to ordinary Tab, so the jump
     * never hijacks lifecycle navigation. Never wraps; a no-op at the ends, when focus is outside the drill
     * Buttons, and when the grid is unmounted.
     * @param {Number} delta
     */
    moveDrillFocus(delta) {
        const me           = this,
              cards        = me.getAgentCards(),
              currentIndex = cards.findIndex(card => card.getReference('card-name')?.containsFocus);

        // only jump BETWEEN drill Buttons — if focus is on a control (or outside the grid), do nothing
        if (currentIndex === -1) {
            return
        }

        const nextDrill = cards[Math.max(0, Math.min(cards.length - 1, currentIndex + delta))]?.getReference('card-name');

        nextDrill && me.mounted && nextDrill.focus(nextDrill.id, false, true)
    }

    /**
     * @summary Arrow Down — jump to the next agent's drill Button (only when a drill Button holds focus).
     * @param {Object} data The KeyNavigation event data.
     * @protected
     */
    onDrillNext(data) {
        this.moveDrillFocus(1)
    }

    /**
     * @summary Arrow Up — jump to the previous agent's drill Button (only when a drill Button holds focus).
     * @param {Object} data The KeyNavigation event data.
     * @protected
     */
    onDrillPrev(data) {
        this.moveDrillFocus(-1)
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
