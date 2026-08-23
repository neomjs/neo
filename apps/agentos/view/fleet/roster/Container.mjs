import Button           from '../../../../../src/button/Base.mjs';
import Component        from '../../../../../src/component/Base.mjs';
import Container        from '../../../../../src/container/Base.mjs';
import HealthBar        from '../health/Container.mjs';
import RosterController from './Controller.mjs';
import RosterList       from './List.mjs';

/**
 * @summary The fleet roster — the cockpit's default view (SSOT §01 fleet zone): a health-summary
 * bar and a sort/filter cluster over the ANIMATED {@link AgentOS.view.fleet.roster.List} of
 * {@link AgentOS.view.fleet.roster.card.Container AgentCard}s, rendered from ONE bound
 * `data.Store` ({@link AgentOS.store.FleetRoster}) of {@link AgentOS.model.FleetAgent} records.
 *
 * The Store is the per-row reactive layer AND the ordering authority: sorters express the rank
 * (online first by default — the `tierRank` calculated field — with name and latest-activity as
 * operator choices), filters express visibility (hide offline, hide benched, and the density fold
 * re-expressed as a filter preset with its honest head count), and
 * {@link Neo.list.plugin.Animate} renders every consequence — a sort MOVES the surviving card
 * instances, a filter fades them, a joiner fades in, a leaver fades out. No rebuild, no flash, no
 * hand-rolled focus continuity: the list's own Navigator item focus + real `li` rows replace the
 * destroy/recreate compensation machinery wholesale.
 *
 * Selection is the cockpit's one picker ({@link AgentOS.view.fleet.roster.SelectionModel}): the
 * item itself is the target — a card click / Enter selects, the controller writes the provider
 * truth pair and fires `agentSelect` for the detail path, and a lifecycle-control click is carved
 * out so operating an agent never re-targets the panes.
 *
 * The header (title · liveness marker · presence-capability chip · {@link HealthBar}) is a STABLE
 * sub-tree updated in place. On adapter loss it degrades honestly — a stale banner over the
 * last-known roster, never a blanked grid.
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
         * The roster's business logic (sort modes, filter toggles, fold preset, the selection
         * seam) lives on the controller — the view stays declarative.
         * @member {Neo.controller.Component} controller=RosterController
         */
        controller: RosterController,
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         * @reactive
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * The bound roster Store — every card, count and ordering derives from its records.
         * Pass the provider-hosted {@link AgentOS.store.FleetRoster} instance (or an isolated
         * Store of {@link AgentOS.model.FleetAgent} records in tests).
         * @member {Neo.data.Store|null} store_=null
         * @reactive
         */
        store_: null,
        /**
         * Registered-agent count at/above which the idle tier folds out of view by default (the
         * filter preset), summarized by the head chip's honest count. Config-driven so the
         * threshold is tunable, not hard-coded at the call site.
         * @member {Number} foldThreshold_=12
         * @reactive
         */
        foldThreshold_: 12,
        /**
         * Feed liveness — `live` renders normally; `sample` marks the honestly-labelled fixture
         * seed (no roster source wired yet); `stale` renders the degrade banner over the
         * last-known roster (never a blanked grid).
         * @member {String} adapterState_='live'
         * @reactive
         */
        adapterState_: 'live',
        /**
         * The roster's presence-CAPABILITY envelope (the assembler DTO's `capabilities.presence`:
         * `{source, state, confidence, capturedAt, reason}`), plumbed by the cockpit's roster
         * load. Owns the header chip that NAMES an axis degradation: when the producer answered
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
         * the health bar's aggregate attention fold; this roster derives nothing about daemons.
         * @member {Boolean} daemonFault_=false
         * @reactive
         */
        daemonFault_: false,
        /**
         * The stable chrome over the animated list: the header (title · liveness marker · flex
         * spacer · live {@link HealthBar}), the sort/filter cluster, the
         * {@link AgentOS.view.fleet.roster.List} (the scroll owner), and the bootstrap CTA (design
         * ruling on record: an EMPTY fleet must have a findable path to its first agent — renders
         * only at roster count 0, so the density contract holds for every populated fleet).
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
            // the operator's ordering + visibility levers, roster-owned (the cockpit top toolbar
            // is a different surface): three sort modes as toggle buttons, two visibility filters,
            // and the fold chip carrying the honest idle count while the density preset is armed
            ntype    : 'container',
            cls      : ['fm-fleet-controls'],
            flex     : 'none',
            layout   : {ntype: 'hbox', align: 'center'},
            reference: 'fleet-controls',

            itemDefaults: {
                module: Button,
                ui    : 'ghost'
            },

            items: [
                {cls: ['fm-roster-sort'],   handler: 'onSortModeClick',     pressed: true, reference: 'sort-online',    sortMode: 'online',   text: 'Online first'},
                {cls: ['fm-roster-sort'],   handler: 'onSortModeClick',     reference: 'sort-name',     sortMode: 'name',     text: 'Name'},
                {cls: ['fm-roster-sort'],   handler: 'onSortModeClick',     reference: 'sort-activity', sortMode: 'activity', text: 'Activity'},
                {ntype: 'component', flex: 1},
                {cls: ['fm-roster-filter'], handler: 'onFilterToggleClick', reference: 'filter-offline', filterProperty: 'state',               text: 'Hide offline'},
                {cls: ['fm-roster-filter'], handler: 'onFilterToggleClick', reference: 'filter-benched', filterProperty: 'participationStatus', text: 'Hide benched'},
                {cls: ['fm-roster-fold'],   handler: 'onIdleFoldClick',     hidden: true, reference: 'fold-chip', text: ''}
            ]
        }, {
            module   : RosterList,
            flex     : 1,
            listeners: {select: 'onRosterSelect'},
            reference: 'roster-list'
        }, {
            module   : Button,
            cls      : ['fm-fleet-empty-cta'],
            flex     : 'none',
            handler  : 'onEmptyCtaClick',
            hidden   : true,
            iconCls  : 'fa fa-plus',
            reference: 'empty-cta',
            text     : 'Add your first agent'
        }]
    }

    /**
     * Whether the fold preset currently shows the idle tier — session-local view state the fold
     * chip toggles; never persisted.
     * @member {Boolean} idleShown=false
     */
    idleShown = false

    /**
     * @summary Seat the roster-derived surfaces once constructed (the chrome exists from static
     * config; its content, the store wiring and the ordering seat are record-derived).
     * @param {...*} args
     */
    onConstructed(...args) {
        super.onConstructed(...args);

        let me         = this,
            controller = me.getController();

        // a11y: the roster is a named landmark region so screen-reader users can navigate to it as
        // a distinct cockpit surface. Set on the root before the first vdom flush.
        Object.assign(me.vdom, {role: 'region', 'aria-label': 'Fleet roster'});

        // the health bar tallies from the SAME bound store (its own reactive record seam, no array
        // copy); the list renders it; the controller seats ordering + view filters on it
        me.getReference('fleet-health').store = me.store;
        me.getReference('roster-list').store  = me.store;
        controller.seatViewOrdering(me.store);

        // a create-time capability envelope lands after the reference tree exists — explicitly,
        // because isConstructed stays false until the whole onConstructed chain completes, so the
        // reactive hook cannot fire here (the HealthBar applyCounts pattern)
        me.presenceCapability && me.applyPresenceCapability(me.presenceCapability);

        me.applyAdapterState();
        controller.syncRosterDerived()
    }

    /**
     * Triggered after the store config changed — re-seats the reactive wire: the health bar and
     * the list read the same instance, the controller re-seats ordering + filters and re-derives
     * the counts, and this container listens for the load / tier-move edges the controller owns.
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
            me.getReference('roster-list').store  = value;

            const controller = me.getController();

            controller.seatViewOrdering(value);
            controller.syncRosterDerived()
        }
    }

    /**
     * @summary The one listener set this container seats on its bound store — kept in one place so
     * `afterSetStore` re-seating and `destroy` teardown stay symmetric. Thin delegates: the
     * consequences (counts, fold state, tier-move re-sort) are controller logic.
     * @returns {Object}
     * @protected
     */
    getStoreListeners() {
        let me = this;

        return {load: me.onStoreLoad, recordChange: me.onStoreRecordChange, scope: me}
    }

    /**
     * @param {Object} data The store load event.
     * @protected
     */
    onStoreLoad(data) {
        this.isConstructed && this.getController()?.onRosterStoreLoad(data)
    }

    /**
     * @param {Object} data The store recordChange event `{fields, record, index, model}`.
     * @protected
     */
    onStoreRecordChange(data) {
        this.isConstructed && this.getController()?.onRosterRecordChange(data)
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
     * @summary Hand the bar the non-roster attention facts this roster holds — one push site, so
     * the chip render and the aggregate verdict cannot diverge.
     * @protected
     */
    pushAttentionInputs() {
        this.getReference('fleet-health').attentionInputs = {
            daemonFault     : this.daemonFault === true,
            presenceDegraded: this.presenceCapability?.state === 'degraded'
        }
    }

    /**
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetFoldThreshold(value, oldValue) {
        this.isConstructed && this.getController()?.syncRosterDerived()
    }

    /**
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetAdapterState(value, oldValue) {
        this.isConstructed && this.applyAdapterState()
    }

    /**
     * @summary Render the feed-liveness state onto the stable header: the stale / static-roster
     * marker text and the head's state cls. 'static roster' without an offline claim: sample only
     * proves WHICH data renders, never WHY — the transport may be answering (empty registry) or
     * silent, and the spine banner is the surface that knows which.
     * @protected
     */
    applyAdapterState() {
        const me             = this,
              {adapterState} = me;

        me.getReference('fleet-stale').text = adapterState === 'stale'
            ? 'stale — reconnecting'
            : adapterState === 'sample' ? 'static roster' : '';

        me.getReference('fleet-head').cls = ['fm-fleet-head', `is-${adapterState}`]
    }

    /**
     *
     */
    destroy() {
        this.store?.un(this.getStoreListeners());

        super.destroy()
    }
}

export default Neo.setupClass(FleetGrid);
