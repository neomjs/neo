import Controller                   from '../../../../src/controller/Component.mjs';
import {handleFleetLifecycleIntent} from './fleetLifecycleIntentAdapter.mjs';

import {partitionFleetStart, renderFleetStartSummary, summarizeFleetStart} from './fleetStartPlan.mjs';

/**
 * Controller for {@link AgentOS.view.fleet.FleetCockpit} — the cockpit is the **composition root** of
 * the B4÷C2 seam: the one place that knows both the resident cards and the fleet bridge, so the wire
 * lives here (the cards themselves stay intent-only and never touch transport).
 *
 * Two entry points, both driving the C2 adapter (`handleFleetLifecycleIntent`) → the registry bridge →
 * honest per-record round-trip state, never an optimistic success:
 * - `onAgentLifecycleIntent` — catches a single card's `lifecycleIntent` (resolved up the controller
 *   chain via the card's listener) and dispatches it for that card's record.
 * - `onStartFleet` — the design SSOT §01 "▶ Start fleet" one-click: fans `start` out to every
 *   rendered card, so each resident drives its own honest round-trip.
 *
 * @class AgentOS.view.fleet.FleetCockpitController
 * @extends Neo.controller.Component
 */
class FleetCockpitController extends Controller {
    static config = {
        /**
         * @member {String} className='AgentOS.view.fleet.FleetCockpitController'
         * @protected
         */
        className: 'AgentOS.view.fleet.FleetCockpitController'
    }

    /**
     * The active fleet-start batch. Repeated activations join this Promise until its summary and
     * one roster reconciliation have settled, so a partially completed batch can never re-fan-out
     * already-settled members or race a second summary.
     * @member {Promise<Object>|null} startFleetPromise=null
     * @protected
     */
    startFleetPromise = null

    /**
     * @summary Join the active one-click fleet-start batch, or create exactly one new batch.
     * @returns {Promise<Object>} The one authoritative batch outcome summary.
     */
    onStartFleet() {
        const me = this;

        if (!me.startFleetPromise) {
            me.startFleetPromise = me.executeStartFleetBatch().finally(() => {
                me.startFleetPromise = null
            })
        }

        return me.startFleetPromise
    }

    /**
     * @summary Execute the STAGED fleet bring-up: partition, per-card cascade, honest summary.
     *
     * The cockpit owns the wire (the cards stay intent-only). The action reads the roster STORE
     * (the full fleet truth — a folded idle card is still a member) and partitions it through the
     * pure {@link module:apps/agentos/view/fleet/fleetStartPlan} rules — every eligibility fact
     * comes from the wire (guest without a definition, launch-seam `launchable`, an in-flight
     * verb, a live session state), and every excluded member carries its reason: never silently
     * skipped, never a hardcoded roster. Each ELIGIBLE record then drives its own honest
     * round-trip through the C2 adapter — the per-card pending CASCADE (excluded cards never flip
     * pending; there is no fleet-wide spinner to lie N ways at once).
     *
     * After the cascade settles, the outcome summary renders into the chrome
     * (`fleet-start-summary`): started / UNKNOWN / rejected / excluded counts with per-member reasons
     * reachable from it — and the roster is re-polled ONCE so every resident that actually
     * started advances to live runtime truth ({@link #refreshRosterOnSettle}).
     * @returns {Promise<Object>} The outcome summary (see `summarizeFleetStart`) — for tests and
     *     callers; the chrome render is the operator-facing half.
     * @protected
     */
    async executeStartFleetBatch() {
        const
            me      = this,
            records = me.getRosterRecords(),
            plan    = partitionFleetStart(records);

        me.renderStartSummary(null);

        const results = await Promise.all(plan.eligible.map(record =>
            handleFleetLifecycleIntent({action: 'start', agentId: record.agentId}, record)
        ));

        const summary = summarizeFleetStart(plan, results);

        me.renderStartSummary(summary);

        await me.refreshRosterOnSettle(Promise.resolve(results.some(result => result?.ok)));

        return summary
    }

    /**
     * @summary The full roster truth for fleet-level actions: the grid store's records — a folded
     * idle card is still a fleet member. A present Store is authoritative even when empty; the
     * rendered-cards fallback is only for compositions that mount the controller without the grid
     * Store reference.
     * @returns {Object[]}
     */
    getRosterRecords() {
        const store = this.getReference('fleet-grid')?.store;

        return store ? [...(store.items ?? [])] : this.getAgentCards().map(card => card.record).filter(Boolean)
    }

    /**
     * @summary Write the fleet-start outcome into the chrome summary slot: the compact counts
     * line as the element text, the per-member reasons as its title (hover-reachable), hidden
     * again when cleared (`null` — a new run starts with no stale outcome showing).
     * @param {Object|null} summary From `summarizeFleetStart`, or null to clear.
     */
    renderStartSummary(summary) {
        const slot = this.getReference('fleet-start-summary');

        if (!slot) return;

        if (!summary) {
            slot.set({hidden: true, html: ''});
            return
        }

        const {detail, text} = renderFleetStartSummary(summary);

        slot.set({hidden: false, html: text});
        slot.vdom.title = detail;
        slot.update()
    }

    /**
     * @summary The rendered resident cards — the fleet grid's card region (a no-controller container, so
     * its `fleet-cards` reference resolves up to this controller); the collapsed-idle fold and the header
     * sub-tree are excluded by ntype.
     * @returns {Neo.component.Base[]}
     */
    getAgentCards() {
        return (this.getReference('fleet-cards')?.items ?? []).filter(card => card.ntype === 'fm-agent-card')
    }

    /**
     * @summary Consume a card's `lifecycleIntent` and drive the honest round-trip — the B4÷C2 seam.
     *
     * A card's control cluster fires an intent-only `lifecycleIntent {action, agentId}` and never
     * touches transport. The cockpit is the composition root that knows both the cards and the fleet
     * bridge: it resolves the firing card from the event `source`, then hands the intent + that card's
     * roster record to the C2 adapter (`handleFleetLifecycleIntent`). The adapter calls the registry
     * bridge and writes honest pending / settled / rejected state onto the record via `record.set()`;
     * the store's `recordChange` re-renders the card — never an optimistic success.
     * @param {Object} data The `lifecycleIntent` payload `{action, agentId, source}` — Neo stamps `source`.
     */
    onAgentLifecycleIntent(data) {
        const card = Neo.getComponent(data.source);

        return card && this.refreshRosterOnSettle(
            handleFleetLifecycleIntent(data, card.record).then(result => Boolean(result?.ok))
        )
    }

    /**
     * @summary Drill into a resident — the card→detail select seam.
     *
     * A card fires `agentSelect {agentId}` on a body click; the cockpit is the composition root that
     * knows both the roster store and the detail pane. It resolves the record from the bound store,
     * holds it as the OWNER-side selection (so a later re-projection re-materializes the inspector at
     * this agent — {@link AgentOS.view.fleet.FleetCockpit#resolveDockComponentRef} reads
     * `detailRecord`), and updates a live detail instance in place. The detail pane is auto-hidden on
     * the rail by default, so the FIRST select reveals it through the standard commit loop (which
     * re-projects and builds the pane from `detailRecord`); a later select updates the already-shown
     * pane in place, with no full re-projection. An unknown agentId is a no-op (fail-closed).
     * @param {Object} data The `agentSelect` payload `{agentId}` — Neo stamps `source`.
     */
    onAgentSelect(data) {
        const
            me      = this,
            cockpit = me.component,
            // resolve from the firing card (data.source) — mirroring onAgentLifecycleIntent's proven
            // source-based lookup; fall back to the roster store by agentId for callers with no source.
            record  = Neo.getComponent(data.source)?.record ?? me.getReference('fleet-grid')?.store?.get(data.agentId);

        if (!record) {
            return
        }

        cockpit.detailRecord = record;
        // routed through the owner accessor: a popped-out inspector lives in the vessel's view
        // tree (outside this controller's getReference reach) and must drill exactly like a
        // docked one
        cockpit.getAgentDetailPane()?.set({record});

        if (cockpit.dockModel?.items?.detail?.autoHidden) {
            const result = cockpit.applyDockZoneOperation({operation: 'setItemAutoHidden', itemId: 'detail', autoHidden: false});

            result && !result.errors?.length && cockpit.onDockZoneDocumentChange(result.document)
        }
    }

    /**
     * @summary The grid's bootstrap CTA (empty fleet) opens the S5 define-agent zone — the same
     * reveal verb the card-drill uses for the detail pane, aimed at the rail's add-agent tool.
     * @param {Object} data The `addAgentRequest` payload — Neo stamps `source`.
     */
    onAddAgentRequest(data) {
        const cockpit = this.component;

        if (cockpit.dockModel?.items?.defineAgent?.autoHidden) {
            const result = cockpit.applyDockZoneOperation({operation: 'setItemAutoHidden', itemId: 'defineAgent', autoHidden: false});

            result && !result.errors?.length && cockpit.onDockZoneDocumentChange(result.document)
        }
    }

    /**
     * @summary Relay the operator-mailbox compose intent to the fleet write verb — the operator-steering
     * seam, symmetric with {@link #onAgentLifecycleIntent}.
     *
     * The operator-mailbox surface fires `compose {message}` intent-only (it holds no transport, like the
     * cards); the cockpit is the composition root that knows the bridge. It hands the message to the
     * cockpit's {@link AgentOS.view.fleet.FleetCockpit#composeOperatorMessage} write, which routes it to
     * the authenticated `composeOperatorMessage` verb — the sender is server-stamped from the bound viewer,
     * never wire-carried — and re-polls the operator inbox so a sent message lands at canonical truth,
     * never an optimistic insert.
     * **Closing the outcome loop.** The surface fires `compose` intent-only and `Observable.fire` discards
     * handler returns, so the fan-out's per-recipient result cannot flow back off the event. Instead the
     * settled outcome is written back as owner-state onto the operator-mailbox surface, which relays it to
     * the compose form to render — so a refusal / failure is never invisible (the review's P1).
     * @param {Object} data The `compose` payload `{message, source}` — Neo stamps `source`.
     */
    async onOperatorCompose(data) {
        const
            me      = this,
            outcome = await me.component.composeOperatorMessage(data.message),
            mailbox = me.component.getReference('operator-mailbox');

        mailbox && (mailbox.composeOutcome = outcome);

        return outcome
    }

    /**
     * @summary Relay the operator-mailbox paged re-read to the cockpit's own-inbox mirror read — the
     * read-seam split mirroring {@link #onAgentSelect}'s detail drill: the surface fires the intent, the
     * composition root holds the bridge and re-reads the operator mirror at the requested offset.
     * @param {Object} data The `inboxPageRequest` payload `{offset, source}`.
     */
    onOperatorInboxPageRequest(data) {
        return this.component.loadOperatorInbox({offset: data.offset})
    }

    /**
     * @summary Relay a CatchUpPane read intent to the cockpit-owned authenticated bridge.
     * @param {Object} data
     * @returns {Promise<Object>}
     */
    onCatchUpHistoryRequest(data) {
        const {source, ...params} = data;

        return this.component.loadCatchUp(params)
    }

    /**
     * @summary Relay the explicit runtime-only mark intent.
     * @param {Object} data
     * @returns {Promise<Object>}
     */
    onCatchUpMarkRequest(data) {
        return this.component.markCatchUp({windowEnd: data.windowEnd})
    }

    /**
     * @summary Route to the existing live adjacency without turning it into history authority.
     * @param {Object} data
     * @returns {Object}
     */
    onCatchUpLiveSurfaceRequest(data) {
        return this.component.openCatchUpLiveSurface({target: data.target})
    }

    /**
     * @summary Relay a MemoriesPane read intent to the cockpit-owned authenticated bridge.
     * @param {Object} data `{agentIdentity, offset?}`
     * @returns {Promise<Object>}
     */
    onMemoriesRequest(data) {
        const {source, ...params} = data;

        return this.component.loadMemories(params)
    }

    /**
     * @summary Relay a MemoriesPane drill-in read intent (one session's turn-level memories) to
     * the cockpit-owned authenticated bridge.
     * @param {Object} data `{sessionId, title?, offset?}`
     * @returns {Promise<Object>}
     */
    onSessionDetailRequest(data) {
        const {source, ...params} = data;

        return this.component.loadSessionMemories(params)
    }

    /**
     * @summary Clear the owner-held drill-in when the pane closes it — rematerialization truth:
     * a drill the operator left must not reopen.
     * @param {Object} data
     */
    onSessionDetailClosed(data) {
        this.component.clearSessionMemoriesDrill()
    }

    /**
     * @summary Relay a WakeRoutePane read intent to the cockpit-owned authenticated bridge.
     * @param {Object} data
     * @returns {Promise<Object>}
     */
    onWakeRoutesRequest(data) {
        const {source, ...params} = data;

        return this.component.loadWakeRoutes(params)
    }

    /**
     * @summary Re-poll the roster once a lifecycle intent has genuinely changed runtime state.
     *
     * `loadRoster` is the ONLY path that maps live runtime truth onto the roster records, and the
     * cockpit calls it once at construct — so without this, a started resident's card stays at its
     * stale pre-start state until a page reload (the observe half of define→start→observe). Here the
     * cockpit re-polls exactly when a settle reports a real change (`ok`), and never on a rejected /
     * timeout / unauthorized outcome (its honest reason render must stand — a refresh could clobber it
     * with a stale snapshot). `loadRoster` is idempotent + fail-closed, so a redundant call is safe.
     * @param {Promise<Boolean>} settledOk Resolves true when at least one intent changed runtime state.
     * @returns {Promise<*>} The `loadRoster` re-poll (awaited), so the handler's settle point includes the
     *     refresh and a `loadRoster` failure propagates to the caller instead of becoming a detached rejection.
     * @protected
     */
    async refreshRosterOnSettle(settledOk) {
        if (await settledOk) {
            return this.component.loadRoster()
        }
    }
}

export default Neo.setupClass(FleetCockpitController);
