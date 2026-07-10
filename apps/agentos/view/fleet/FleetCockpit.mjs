import ActivityStream         from './ActivityStream.mjs';
import Button                 from '../../../../src/button/Base.mjs';
import Container              from '../../../../src/container/Base.mjs';
import FleetCockpitController from './FleetCockpitController.mjs';
import FleetGrid              from './FleetGrid.mjs';
import FleetRoster            from '../../store/FleetRoster.mjs';

/**
 * Recent fleet activity for the fixture-fed stream — the live A2A / PR / lane adapters
 * are the sibling leaves; this seeds the §01 activity zone with representative events (newest last;
 * ActivityStream reverses to newest-first).
 * @type {Object[]}
 */
const FIXTURE_ACTIVITY = [
    {type: 'a2a-activity',    agentId: 'neo-opus-vega', occurredAt: '2026-07-05T10:52:00.000Z', payload: {text: 'Vega → AGENT:* [lane-claim] harness-UI shell + nav'}},
    {type: 'review-activity', agentId: 'neo-opus-vega', occurredAt: '2026-07-05T10:26:00.000Z', payload: {text: 'Vega → APPROVED — transaction archive Architectural Pillar'}},
    {type: 'pr-activity',     agentId: 'neo-gpt',       occurredAt: '2026-07-05T10:11:00.000Z', payload: {text: 'Euclid opened a PR — roadmap cornerstone-4 hygiene'}},
    {type: 'pr-activity',     agentId: 'neo-opus-vega', occurredAt: '2026-07-05T09:40:00.000Z', payload: {text: 'Vega merged — FM fleet grid + health bar'}},
    {type: 'a2a-activity',    agentId: 'neo-opus-ada',  occurredAt: '2026-07-05T08:30:00.000Z', payload: {text: 'Ada → control-plane restart actuator merged'}},
    {type: 'lane-activity',   agentId: 'neo-fable-clio',occurredAt: '2026-07-05T07:15:00.000Z', payload: {text: 'Clio → CrossWindowDragTarget docking, awaiting cross-family'}}
];

/**
 * @summary The Fleet keeper-view — the FM cockpit's default mission-control surface (design SSOT §01):
 * the fleet zone (a density-ranked card roster + the scale-to-a-glance health bar) beside the live
 * activity stream, in the SSOT's ~1.55fr / 1fr split. This is the "run the fleet" keeper-view the harness-UI
 * definition specifies, reached from the harness shell's left-rail nav — the cards, NOT a data-grid table.
 *
 * The roster data layer is the shared {@link AgentOS.store.FleetRoster} Store of
 * {@link AgentOS.model.FleetAgent} records — seeded with the honestly-labelled sample roster, bound
 * to the {@link FleetGrid}, and re-pointed at the running fleet by {@link #loadRoster} when the
 * registry bridge wires up. The activity zone composes {@link ActivityStream} → EventChip against a
 * representative snapshot the same way ({@link #loadActivity}).
 *
 * @class AgentOS.view.fleet.FleetCockpit
 * @extends Neo.container.Base
 */
class FleetCockpit extends Container {
    static config = {
        /**
         * @member {String} className='AgentOS.view.fleet.FleetCockpit'
         * @protected
         */
        className: 'AgentOS.view.fleet.FleetCockpit',
        /**
         * @member {String} ntype='fm-fleet-cockpit'
         * @protected
         */
        ntype: 'fm-fleet-cockpit',
        /**
         * @member {String[]} baseCls=['fm-fleet-cockpit']
         */
        baseCls: ['fm-fleet-cockpit'],
        /**
         * The B4÷C2 composition root: catches each card's `lifecycleIntent` and the whole-fleet
         * "▶ Start morning fleet" click, driving both through the C2 adapter to honest per-card
         * round-trip state. See {@link AgentOS.view.fleet.FleetCockpitController}.
         * @member {Neo.controller.Component} controller=FleetCockpitController
         */
        controller: FleetCockpitController,
        /**
         * Vertical stack: the control bar over the full-width fleet grid over the full-width activity
         * feed. The fleet zone gets the full width for its ranked card grid; the live feed is the
         * bottom strip, not a right-hand column.
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         * @reactive
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * @member {Object[]} items
         */
        items: [{
            ntype: 'toolbar',
            cls  : ['fm-cockpit-bar'],
            flex : 'none',
            items: ['->', {
                module : Button,
                cls    : ['fm-fleet-start'],
                iconCls: 'fa-solid fa-play',
                text   : 'Start morning fleet',
                handler: 'onStartFleet'
            }]
        }, {
            module      : FleetGrid,
            flex        : 1.55,
            reference   : 'fleet-grid',
            adapterState: 'sample', // the seeded roster is a representative sample until the live source is wired
            store       : FleetRoster
        }, {
            module      : ActivityStream,
            flex        : 1,
            reference   : 'activity-stream',
            adapterState: 'sample', // the fixture is a representative sample until the live source is wired
            events      : FIXTURE_ACTIVITY
        }]
    }

    /**
     * Set once {@link #loadRoster} has replaced the sample seed with a wired roster payload —
     * subsequent wired payloads MERGE onto the existing records (runtime status refresh) instead of
     * re-seeding the store.
     * @member {Boolean} rosterWired=false
     * @protected
     */
    rosterWired = false

    /**
     * @summary On construct, bind the fleet surfaces to their live feeds.
     * @param {...*} args
     */
    onConstructed(...args) {
        super.onConstructed(...args);
        this.loadActivity();
        this.loadRoster()
    }

    /**
     * @summary Bind the activity stream to the live fleet feed: poll the read-observe `fleetActivity`
     * verb on the injected registry bridge and route its honest capability state to the stream:
     * - `wired` → **live** (the feed is newest-first; the stream renders chronological, so reverse). A
     *   wired source is live even when momentarily empty — it is streaming, just quiet — so an empty
     *   wired feed stays `live` (empty), never the sample: falling back to the sample would falsely
     *   imply the source is not wired.
     * - `degraded` → the **stale** banner.
     * - not-wired / absent bridge / a thrown source → leave the representative **sample** in place
     *   (honestly labelled by the stream header); fail closed rather than blanking the surface.
     * @protected
     */
    async loadActivity() {
        let me     = this,
            stream = me.getReference('activity-stream'),
            bridge = globalThis.AgentOS?.fleet?.registryBridge;

        if (!stream || typeof bridge?.fleetActivity !== 'function') {
            return
        }

        try {
            const {capability, events} = await bridge.fleetActivity() ?? {};

            if (capability?.state === 'wired') {
                stream.set({adapterState: 'live', events: Array.isArray(events) ? events.slice().reverse() : []})
            } else if (capability?.state === 'degraded') {
                stream.adapterState = 'stale'
            }
            // not-wired / absent bridge → keep the honestly-labelled 'sample' seed
        } catch (error) {
            // fail-closed: the sample seed stays rather than blanking the feed
        }
    }

    /**
     * @summary Bind the fleet roster to the running fleet: poll the read-observe `fleetRoster` verb
     * on the injected registry bridge — the Brain-side assembler DTO (`{sources, capabilities, rows,
     * events}`, identity-enriched per the `resolveIdentityDisplay` join) — map its rows onto the
     * FleetAgent record contract, and route honestly into the Store the grid renders from:
     * - a resolved snapshot (rows is an Array — EVEN EMPTY) is **authoritative**: the first one
     *   replaces the sample seed (a zero-agent fleet renders as the TRUE cold-onboarding zero
     *   state, never seven sample maintainers masquerading as live); every later one **reconciles**
     *   the Store — `record.set(row)` per known `agentId`, `store.add` for a joiner, `store.remove`
     *   for a resident absent from the snapshot (a `removeAgent` must never leave a ghost card).
     *   Grid goes `live`.
     * - absent bridge / no verb / a MALFORMED answer (`rows` not an Array) / a thrown source →
     *   keep the last-known roster; fail closed rather than blanking the fleet. A resolved call is
     *   mechanically distinguishable from a failed one — only failures preserve last-known state.
     *   (The grid's `stale` render remains reserved for a real degraded signal once a producer
     *   emits one.)
     * @protected
     */
    async loadRoster() {
        let me     = this,
            grid   = me.getReference('fleet-grid'),
            bridge = globalThis.AgentOS?.fleet?.registryBridge;

        if (!grid?.store || typeof bridge?.fleetRoster !== 'function') {
            return
        }

        try {
            const {rows} = await bridge.fleetRoster() ?? {};

            if (!Array.isArray(rows)) {
                return // malformed answer → keep the last-known roster
            }

            const mapped = rows.filter(row => row?.id).map(row => me.mapRosterRow(row));

            if (me.rosterWired) {
                me.reconcileRoster(grid.store, mapped)
            } else {
                grid.store.clear();
                mapped.length > 0 && grid.store.add(mapped);
                me.rosterWired = true
            }

            grid.adapterState = 'live'
        } catch (error) {
            // fail-closed: the last-known roster stays rather than blanking the fleet
        }
    }

    /**
     * @summary Map one assembler DTO row onto the FleetAgent record contract. The durable `id`
     * becomes `agentId`; identity display facts (`family` / `engineTag`) flow through (null =
     * unclassified / tagless, never guessed); the runtime `lifecycle.state` maps onto the cockpit's
     * session-state vocabulary — `running` → `ok`, anything else (`stopped` / `not-wired` /
     * unknown liveness) → `off`, honestly benched until the richer watchdog states land. `laneLine`
     * is deliberately OMITTED (not nulled): the activity capability owns it, and a merge must never
     * wipe what another producer wrote.
     * @param {Object} row One cockpit DTO row (`fleetCockpitStatus` shape).
     * @returns {Object} FleetAgent record field values.
     */
    mapRosterRow(row) {
        return {
            agentId    : row.id,
            avatarUrl  : row.avatarUrl ?? null,
            displayName: row.displayName ?? null,
            engineTag  : row.engineTag ?? null,
            family     : row.family ?? null,
            state      : row.lifecycle?.state === 'running' ? 'ok' : 'off'
        }
    }

    /**
     * @summary Reconcile an authoritative roster snapshot onto the Store's records: a known
     * `agentId` updates its record in place (`record.set(row)` — the store's `recordChange`
     * re-renders just that card, and fields the roster producer does not own — e.g. `laneLine` —
     * survive because {@link #mapRosterRow} omits them), a new one joins the roster, and a resident
     * ABSENT from the snapshot is removed (the snapshot is the full fleet: a deregistered agent
     * must not linger as a ghost card).
     * @param {Neo.data.Store} store The bound roster store.
     * @param {Object[]} rows Mapped snapshot rows keyed by `agentId`.
     * @protected
     */
    reconcileRoster(store, rows) {
        const snapshotIds = new Set(rows.map(row => row.agentId));

        rows.forEach(row => {
            const record = store.get(row.agentId);

            record ? record.set(row) : store.add(row)
        });

        store.items
            .filter(record => !snapshotIds.has(record.agentId))
            .map(record => record.agentId)
            .forEach(agentId => store.remove(agentId))
    }
}

export default Neo.setupClass(FleetCockpit);
