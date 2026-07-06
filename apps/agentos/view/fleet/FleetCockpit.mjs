import ActivityStream         from './ActivityStream.mjs';
import Button                 from '../../../../src/button/Base.mjs';
import Container              from '../../../../src/container/Base.mjs';
import FleetCockpitController from './FleetCockpitController.mjs';
import FleetGrid              from './FleetGrid.mjs';

/**
 * The seven real cross-family maintainer identities, for the fixture-fed cockpit — the live-wire
 * binding to the roster / runtime-status services is the sibling leaf that replaces this. Identities +
 * avatars are real (the `githubAvatarUrl` pattern, so identity reads at a glance); session state +
 * lane-line are an illustrative snapshot until the live source is wired. NO invented agents.
 * @type {Object[]}
 */
const FIXTURE_ROSTER = [
    {agentId: 'neo-opus-grace', displayName: 'Grace',     engineTag: 'opus-4.8', family: 'claude', state: 'ok',      avatarUrl: 'https://github.com/neo-opus-grace.png?size=80', laneLine: 'design authority — cockpit SSOT conformance review'},
    {agentId: 'neo-gpt',        displayName: 'Euclid',    engineTag: 'gpt-5.5',  family: 'gpt',    state: 'ok',      avatarUrl: 'https://github.com/neo-gpt.png?size=80',        laneLine: 'NL transaction archive + replay (#14836)'},
    {agentId: 'neo-opus-ada',   displayName: 'Ada',       engineTag: 'opus-4.8', family: 'claude', state: 'ok',      avatarUrl: 'https://github.com/neo-opus-ada.png?size=80',   laneLine: 'control-plane restart actuator — the R3 seam'},
    {agentId: 'neo-opus-vega',  displayName: 'Vega',      engineTag: 'opus-4.8', family: 'claude', state: 'ok',      avatarUrl: 'https://github.com/neo-opus-vega.png?size=80',  laneLine: 'harness-UI shell + left-rail nav (#14846)'},
    {agentId: 'neo-fable',      displayName: 'Mnemosyne', engineTag: 'fable-5',  family: 'claude', state: 'ok',      avatarUrl: 'https://github.com/neo-fable.png?size=80',      laneLine: 'golden-path direction-velocity writer (#14811)'},
    {agentId: 'neo-fable-clio', displayName: 'Clio',      engineTag: 'fable-5',  family: 'claude', state: 'idle',    avatarUrl: 'https://github.com/neo-fable-clio.png?size=80', laneLine: 'CrossWindowDragTarget docking — awaiting review'},
    {agentId: 'neo-gemini-pro', displayName: 'Gemini',    engineTag: '3-pro',    family: 'gemini', state: 'off',     avatarUrl: 'https://github.com/neo-gemini-pro.png?size=80', laneLine: 'operator-benched'}
];

/**
 * Recent fleet activity for the fixture-fed stream — the live A2A / PR / lane adapters
 * are the sibling leaves; this seeds the §01 activity zone with representative events (newest last;
 * ActivityStream reverses to newest-first).
 * @type {Object[]}
 */
const FIXTURE_ACTIVITY = [
    {type: 'a2a-activity',    agentId: 'neo-opus-vega', occurredAt: '2026-07-05T10:52:00.000Z', payload: {text: 'Vega → AGENT:* [lane-claim] #14846 harness-UI shell + nav'}},
    {type: 'review-activity', agentId: 'neo-opus-vega', occurredAt: '2026-07-05T10:26:00.000Z', payload: {text: 'Vega → #14836 APPROVED — transaction archive Architectural Pillar'}},
    {type: 'pr-activity',     agentId: 'neo-gpt',       occurredAt: '2026-07-05T10:11:00.000Z', payload: {text: 'Euclid opened #14843 — roadmap cornerstone-4 hygiene'}},
    {type: 'pr-activity',     agentId: 'neo-opus-vega', occurredAt: '2026-07-05T09:40:00.000Z', payload: {text: 'Vega #14834 merged — FM fleet grid + health bar'}},
    {type: 'a2a-activity',    agentId: 'neo-opus-ada',  occurredAt: '2026-07-05T08:30:00.000Z', payload: {text: 'Ada → #14760 control-plane restart actuator merged'}},
    {type: 'lane-activity',   agentId: 'neo-fable-clio',occurredAt: '2026-07-05T07:15:00.000Z', payload: {text: 'Clio → CrossWindowDragTarget docking, awaiting cross-family'}}
];

/**
 * @summary The Fleet keeper-view — the FM cockpit's default mission-control surface (design SSOT §01):
 * the fleet zone (a density-ranked card roster + the scale-to-a-glance health bar) beside the live
 * activity stream, in the SSOT's ~1.55fr / 1fr split. This is the "run the fleet" keeper-view the harness-UI
 * definition specifies, reached from the harness shell's left-rail nav — the cards, NOT a data-grid table.
 *
 * Fixture-fed for now: it composes the built primitives ({@link FleetGrid} → AgentCard/HealthBar,
 * {@link ActivityStream} → EventChip) against a representative roster + activity snapshot, so the
 * mission-control surface renders real. The live-roster / A2A / PR wire bindings
 * are the sibling leaves that replace the fixtures with the running fleet.
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
            module: FleetGrid,
            flex  : 1.55,
            agents: FIXTURE_ROSTER
        }, {
            module      : ActivityStream,
            flex        : 1,
            reference   : 'activity-stream',
            adapterState: 'sample', // the fixture is a representative sample until the live source is wired
            events      : FIXTURE_ACTIVITY
        }]
    }

    /**
     * @summary On construct, bind the activity stream to the live fleet feed.
     * @param {...*} args
     */
    onConstructed(...args) {
        super.onConstructed(...args);
        this.loadActivity()
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
}

export default Neo.setupClass(FleetCockpit);
