import ComponentController from '../../../../../src/controller/Component.mjs';

/**
 * The roster's sort modes as plain store-sorter sets — replacing the whole set keeps ONE ordering
 * authority (the store) and lets {@link Neo.list.plugin.Animate} animate every mode switch. The
 * name axes case-fold via `sortBy` (the sorter's custom-comparator seam); `lastActivityAt` relies
 * on the sorter's native null handling (null is always pushed to the bottom, so never-active
 * residents trail the recency order instead of faking an age).
 * @type {Object}
 */
const SORT_MODES = Object.freeze({
    online: [
        {direction: 'ASC', property: 'tierRank'},
        {direction: 'ASC', property: 'displayName', sortBy: (a, b) => (a.displayName ?? '').toLowerCase().localeCompare((b.displayName ?? '').toLowerCase())}
    ],
    name: [
        {direction: 'ASC', property: 'displayName', sortBy: (a, b) => (a.displayName ?? '').toLowerCase().localeCompare((b.displayName ?? '').toLowerCase())}
    ],
    activity: [
        {direction: 'DESC', property: 'lastActivityAt'}
    ]
});

/**
 * Controller for {@link AgentOS.view.fleet.roster.Container}: the roster's business logic, out of
 * the view (the portal `MainContainerController` discipline) — sort-mode switches, the
 * hide-offline / hide-benched filters, the density fold re-expressed as a filter preset, and the
 * selection seam that turns the list's `select` into the cockpit-provider truth
 * (`selectedAgentId` + `selectedAgentIdentity`) plus the `agentSelect` intent the cockpit's detail
 * path consumes. The controller mutates the STORE (sorters/filters) and the provider; it never
 * touches list geometry — {@link Neo.list.plugin.Animate} renders every consequence.
 *
 * @class AgentOS.view.fleet.roster.Controller
 * @extends Neo.controller.Component
 */
class Controller extends ComponentController {
    static config = {
        /**
         * @member {String} className='AgentOS.view.fleet.roster.Controller'
         * @protected
         */
        className: 'AgentOS.view.fleet.roster.Controller'
    }

    /**
     * The active sort mode key (`online` | `name` | `activity`) — session-local view state.
     * @member {String} sortMode='online'
     */
    sortMode = 'online'

    /**
     * @summary Seat the roster's ordering + view filters on the (provider-owned) store,
     * idempotently: the DEFAULT sort is the shipped tier order expressed as sorters (`SORT_MODES`
     * is the one authority — the store class stays ordering-free), and the filters are VIEW
     * concerns riding the shared store's filter collection, all disabled at seat time so binding
     * the store never changes another consumer's truth. Distinct `property` keys
     * (`state` / `participationStatus` / `tierRank`) keep each retrievable via `getFilter`.
     *
     * `filterBy` returns true to EXCLUDE (the collection contract).
     * @param {Neo.data.Store|null} store
     */
    seatViewOrdering(store) {
        if (!store || store.getFilter?.('tierRank')) {
            return
        }

        (store.sorters?.length ?? 0) < 1 && (store.sorters = SORT_MODES[this.sortMode].map(sorter => ({...sorter})));

        store.filters = [
            {disabled: true, property: 'state',               filterBy: ({item}) => item.state === 'off'},
            {disabled: true, property: 'participationStatus', filterBy: ({item}) => item.participationStatus === 'operator_benched'},
            {disabled: true, property: 'tierRank',            filterBy: ({item}) => item.tierRank === 1}
        ]
    }

    /**
     * @summary The whole-fleet record set — filters shape the VIEW, so every COUNT (title, fold
     * chip, health tally) reads the unfiltered truth. `allItems` is consulted ONLY while a filter
     * is actively excluding rows: the collection materializes it as a snapshot copy on the first
     * filter pass (even an all-disabled one) and does not route later adds into it while no
     * filter is active — with zero active filters, `items` IS the whole fleet and the snapshot is
     * stale by design.
     * @returns {Object[]}
     */
    getWholeFleet() {
        const store = this.component.store;

        if (!store) {
            return []
        }

        const filtering = store.filters?.some(filter => !filter.disabled);

        return (filtering ? store.allItems?.items : null) ?? store.items ?? []
    }

    /**
     * @summary Re-derive everything the roster owns beyond the rows: the title count, the
     * empty-fleet CTA, and the fold preset (at/above `foldThreshold` the idle tier filters out by
     * default while the chip renders the honest count and toggles it back in — the fold row left
     * the card flow; the count moved to the head, same truth).
     */
    syncRosterDerived() {
        const
            me          = this,
            {component} = me,
            records     = me.getWholeFleet(),
            total       = records.length,
            idleCount   = records.filter(record => record.tierRank === 1).length,
            folded      = total >= component.foldThreshold,
            foldFilter  = component.store?.getFilter?.('tierRank'),
            {idleShown} = component,
            chip        = me.getReference('fold-chip');

        component.getReference('fleet-title').text = `Fleet · ${total} agents`;
        component.getReference('empty-cta').hidden = total > 0;

        if (foldFilter) {
            const disabled = !folded || idleShown;

            // config-equality guard: filter.disabled re-set fires a re-filter even on equal values
            foldFilter.disabled !== disabled && (foldFilter.disabled = disabled)
        }

        chip?.set({
            hidden : !folded || idleCount === 0,
            pressed: idleShown,
            text   : idleShown ? 'hide idle' : `+${idleCount} idle · show`
        })
    }

    /**
     * @summary A sort-cluster click: replace the store's sorter set with the mode's (ONE ordering
     * authority — the animated move is the plugin rendering the store's own `sort` event) and
     * mirror the pressed state onto the cluster.
     * @param {Object} data The button click; `data.component.sortMode` names the mode.
     */
    onSortModeClick(data) {
        const
            me      = this,
            mode    = data.component.sortMode,
            sorters = SORT_MODES[mode];

        if (!sorters || mode === me.sortMode) {
            return
        }

        me.sortMode = mode;
        me.component.store.sorters = sorters.map(sorter => ({...sorter}));

        ['sort-online', 'sort-name', 'sort-activity'].forEach(ref => {
            const button = me.getReference(ref);
            button && (button.pressed = button.sortMode === mode)
        })
    }

    /**
     * @summary A filter-toggle click (hide offline / hide benched): flip the named store filter's
     * `disabled` and let the plugin fade the consequence.
     * @param {Object} data The button click; `data.component.filterProperty` names the filter.
     */
    onFilterToggleClick(data) {
        const
            {component} = data,
            filter      = this.component.store?.getFilter?.(component.filterProperty);

        if (!filter) {
            return
        }

        filter.disabled     = !filter.disabled;
        component.pressed   = !filter.disabled;
        this.syncRosterDerived()
    }

    /**
     * @summary The fold chip: show/hide the idle tier while the fold preset is armed.
     * @param {Object} data The chip click.
     */
    onIdleFoldClick(data) {
        const {component} = this;

        component.idleShown = !component.idleShown;
        this.syncRosterDerived()
    }

    /**
     * @summary The selection seam: consume the FleetAgent record emitted by the list model, write
     * the cockpit-provider truth pair (`selectedAgentId` for record-keyed consumers,
     * `selectedAgentIdentity` — the canonical `@github` mailbox identity — for identity-keyed
     * consumers like the memories read), and fire the roster's `agentSelect` intent for the
     * cockpit's detail path. An empty selection clears the provider pair and fires nothing.
     * @param {Object} data The list `select` event `{records, selection}`.
     */
    onRosterSelect(data) {
        const
            me     = this,
            record = data.records?.[0] ?? null,
            // resolved once, written optionally: a roster hosted without a provider ancestor
            // (isolated harnesses) must not crash a click — it simply has no cross-view truth
            provider = me.component.getStateProvider();

        if (!record) {
            provider?.setData({selectedAgentId: null, selectedAgentIdentity: null});
            return
        }

        provider?.setData({
            selectedAgentId      : record.agentId,
            selectedAgentIdentity: record.githubUsername ? `@${record.githubUsername}` : null
        });

        me.component.fire('agentSelect', {agentId: record.agentId})
    }

    /**
     * @summary A session-`state` change moved a record between tiers: re-run the store's own sort
     * so the plugin animates the reposition (a calculated field mutates silently — the collection
     * does not watch record fields, so the tier move needs this one explicit re-sort trigger).
     * Non-tier field changes re-render in place through the list's own `recordChange` path and
     * need no ordering pass.
     * @param {Object} data The store recordChange event `{fields, record}`.
     */
    onRosterRecordChange({fields}) {
        const store = this.component.store;

        if (store?.sorters?.length && fields.some(field => field.name === 'state')) {
            store.doSort()
        }

        this.syncRosterDerived()
    }

    /**
     * @summary The roster set changed (seed, live replace, joiners/leavers): re-derive counts,
     * fold state and the CTA.
     * @param {Object} data The store load event.
     */
    onRosterStoreLoad(data) {
        this.syncRosterDerived()
    }

    /**
     * @summary The grid's bootstrap CTA (empty fleet) — one intent event; the owning cockpit opens
     * the S5 define-agent zone (the roster never touches dock state itself: layout-blind).
     * @param {Object} data The button click.
     */
    onEmptyCtaClick(data) {
        this.component.fire('addAgentRequest', {})
    }
}

export default Neo.setupClass(Controller);
