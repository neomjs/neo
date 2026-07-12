import ActivityStream          from './ActivityStream.mjs';
import AgentDetail             from './AgentDetail.mjs';
import Button                  from '../../../../src/button/Base.mjs';
import Container               from '../../../../src/container/Base.mjs';
import DockLayoutAdapter       from '../../../../src/dashboard/DockLayoutAdapter.mjs';
import DockMotionSignal        from '../../../../src/dashboard/DockMotionSignal.mjs';
import DockPerspectiveStore    from '../../../../src/dashboard/DockPerspectiveStore.mjs';
import DockPreviewProducer     from '../../../../src/dashboard/DockPreviewProducer.mjs';
import DockZoneModel           from '../../../../src/dashboard/DockZoneModel.mjs';
import FleetCockpitController  from './FleetCockpitController.mjs';
import FleetGrid               from './FleetGrid.mjs';
import FleetRoster             from '../../store/FleetRoster.mjs';
import StateProvider           from '../../../../src/state/Provider.mjs';
import cockpitDockDocument     from './cockpitDockDocument.mjs';
import cockpitPresetCollection from './cockpitPresets.mjs';
import {mapFleetSessionHealth} from './sourceHealth.mjs';
import {previewToOperation}    from '../../../../src/dashboard/dockPreviewContract.mjs';
import '../../../../src/tab/Container.mjs'; // registers the `tab-container` ntype the dock projection emits for tab zones

/**
 * Recent fleet activity for the fixture-fed stream — the live A2A / PR / lane adapters
 * are the sibling leaves; this seeds the §01 activity zone with representative events (newest last;
 * ActivityStream reverses to newest-first).
 * @type {Object[]}
 */
const FIXTURE_ACTIVITY = [
    {type: 'lane-activity',   agentId: 'neo-fable-clio',occurredAt: '2026-07-05T07:15:00.000Z', payload: {text: 'Clio → CrossWindowDragTarget docking, awaiting cross-family'}},
    {type: 'a2a-activity',    agentId: 'neo-opus-ada',  occurredAt: '2026-07-05T08:30:00.000Z', payload: {text: 'Ada → control-plane restart actuator merged'}},
    {type: 'pr-activity',     agentId: 'neo-opus-vega', occurredAt: '2026-07-05T09:40:00.000Z', payload: {text: 'Vega merged — FM fleet grid + health bar'}},
    {type: 'pr-activity',     agentId: 'neo-gpt',       occurredAt: '2026-07-05T10:11:00.000Z', payload: {text: 'Euclid opened a PR — roadmap cornerstone-4 hygiene'}},
    {type: 'review-activity', agentId: 'neo-opus-vega', occurredAt: '2026-07-05T10:26:00.000Z', payload: {text: 'Vega → APPROVED — transaction archive Architectural Pillar'}},
    {type: 'a2a-activity',    agentId: 'neo-opus-vega', occurredAt: '2026-07-05T10:52:00.000Z', payload: {text: 'Vega → AGENT:* [lane-claim] harness-UI shell + nav'}}
];

/**
 * @summary The Fleet keeper-view — the FM cockpit's default mission-control surface (design SSOT §01),
 * composed as a LIVE DOCK PROJECTION: the fleet zone (a density-ranked card roster + the
 * scale-to-a-glance health bar) over the live activity stream in the SSOT's ~1.55fr / 1fr split,
 * with the secondary chrome panes (agent detail, perspectives) auto-hidden onto the right edge rail.
 *
 * The layout SSOT is the committed `neo.harness.dockZone.v1` document ({@link #dockModel}, seeded
 * from {@link module:cockpitDockDocument}); the visible tree is
 * {@link Neo.dashboard.DockLayoutAdapter}'s projection of it. The commit loop follows the proven
 * dashboard-dock pattern — a clean reducer / view-sync split:
 * - {@link #applyDockZoneOperation} is the **reducer**: a pure `DockZoneModel.applyOperation` over
 *   the current document — splitter drags, cross-zone tab drops and NL-driven operations all
 *   funnel through it;
 * - {@link #onDockZoneDocumentChange} is the **view-sync**: it stores the committed document and
 *   re-projects one tick deferred (the committing splitter must finish its own `onDragEnd` before
 *   `removeAll()` destroys it — use-after-destroy otherwise; `isDestroyed` guards teardown).
 *
 * Projections REBUILD pane instances (`removeAll` + add), so runtime pane state lives on THIS
 * owner, never on the instances: {@link #resolveDockComponentRef} re-materializes each pane from
 * the held state ({@link #gridAdapterState} / {@link #streamAdapterState} / {@link #streamEvents}),
 * and the panes themselves stay layout-blind per the docking design's pane contract — ordinary
 * configs only, no dock wiring reaches them.
 *
 * The roster data layer is ONE {@link AgentOS.store.FleetRoster} Store of
 * {@link AgentOS.model.FleetAgent} records, hosted by THIS view's `state.Provider` (`stores`
 * block — the provider is the sharing scope and survives every re-projection; store classes are
 * never singletons). The provider `autoLoad`s the honestly-labelled JSON sample seed, the
 * projected {@link FleetGrid} binds the instance via `bind: {store: 'stores.fleetRoster'}`, and
 * {@link #loadRoster} re-points it at the running fleet when the registry bridge wires up. The
 * activity zone composes {@link ActivityStream} → EventChip the same way ({@link #loadActivity}).
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
         * The dock motion/token contract (`--dock-transition-*`, reveal keyframes, splitter
         * cursors) lives in the `Neo.dashboard.Container` theme file — the projected dock tree is
         * plain containers, so per-class loading never fetches it; the consuming workspace
         * declares the dependency (the projection root carries the matching `.neo-dashboard`
         * scope class itself).
         * @member {String[]} additionalThemeFiles=['Neo.dashboard.Container']
         */
        additionalThemeFiles: ['Neo.dashboard.Container'],
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
         * The cockpit-level roster host — ONE provider-owned {@link AgentOS.store.FleetRoster}
         * instance (autoLoaded from the JSON sample seed) that the grid + health bar bind; the
         * provider is the sharing scope, never a store singleton.
         * @member {Object} stateProvider
         */
        stateProvider: {
            module: StateProvider,
            stores: {
                fleetRoster: {
                    autoLoad: true,
                    module  : FleetRoster
                }
            }
        },
        /**
         * Vertical stack: the control bar over the dock projection (which owns the fleet-over-
         * activity split per the committed document).
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         * @reactive
         */
        layout: {ntype: 'vbox', align: 'stretch'}
        // `items` is built in construct() — not here — so each projection can carry the
        // instance-bound applyDockZoneOperation + onDockZoneDocumentChange callbacks the resize
        // commit loop needs.
    }

    /**
     * The live committed dock-zone document — the layout SSOT this view projects from. Seeded
     * from {@link module:cockpitDockDocument}; advanced by {@link #onDockZoneDocumentChange} on
     * each committed operation.
     * @member {Object|null} dockModel=null
     */
    dockModel = null
    /**
     * The named preset library — a {@link Neo.dashboard.DockPerspectiveStore} over the seeded
     * workspace-scope collection ({@link module:cockpitPresets}). The store is the preset SSOT;
     * {@link #dockModel} stays the LIVE layout SSOT — presets are snapshots the switch restores
     * from, never live-bound mirrors.
     * @member {Neo.dashboard.DockPerspectiveStore|null} perspectiveStore=null
     * @protected
     */
    perspectiveStore = null
    /**
     * The last refused preset switch, rendered in the control bar (fail-closed VISIBLY: a
     * refused restore must never look like a no-op). Cleared by the next successful switch.
     * @member {String|null} presetError=null
     * @protected
     */
    presetError = null
    /**
     * The cross-zone drop producer instance (pointer → placement grammar), owned per cockpit.
     * @member {Neo.dashboard.DockPreviewProducer|null} dockPreviewProducer=null
     * @protected
     */
    dockPreviewProducer = null
    /**
     * The grid's held `adapterState` — re-projections re-materialize the pane from HERE, so a
     * committed layout change can never reset a live grid back to its sample badge.
     * @member {String} gridAdapterState='sample'
     * @protected
     */
    gridAdapterState = 'sample'
    /**
     * The last authoritative (bridge-sourced) roster snapshot, kept so a slower store load — the
     * JSON sample seed racing {@link #loadRoster} — can never overwrite live truth
     * (see {@link #onRosterStoreLoad}).
     * @member {Object[]|null} lastLiveRows=null
     * @protected
     */
    lastLiveRows = null
    /**
     * Re-entrancy latch for {@link #onRosterStoreLoad}: the store fires `load` for its own
     * mutations (mutate → onCollectionMutate → load), so the guard's reconciliation adds/removals
     * re-trigger the very listener that issued them — unlatched, that recursion is a real stack
     * overflow (~524 frames on a 5k-row snapshot).
     * @member {Boolean} reconcilingRoster=false
     * @protected
     */
    reconcilingRoster = false
    /**
     * Set once {@link #loadRoster} has replaced the sample seed with a wired roster payload —
     * subsequent wired payloads MERGE onto the existing records (runtime status refresh) instead of
     * re-seeding the store.
     * @member {Boolean} rosterWired=false
     * @protected
     */
    rosterWired = false
    /**
     * The stream's held `adapterState` — the re-projection source of truth, like
     * {@link #gridAdapterState}.
     * @member {String} streamAdapterState='sample'
     * @protected
     */
    streamAdapterState = 'sample'
    /**
     * The stream's held event list (chronological). Starts as the honestly-labelled fixture;
     * {@link #loadActivity} replaces it with the live feed — re-projections read it back.
     * @member {Object[]} streamEvents=FIXTURE_ACTIVITY
     * @protected
     */
    streamEvents = FIXTURE_ACTIVITY
    /**
     * The drill-in inspector's selected resident — OWNER-held so a re-projection re-materializes
     * the {@link AgentOS.view.fleet.AgentDetail} pane at the current selection (`null` = the honest
     * "select an agent" empty state). The card→detail selection wiring writes it.
     * @member {Object|null} detailRecord=null
     * @protected
     */
    detailRecord = null

    /**
     * @summary Seed the layout SSOT and build the toolbar + dock projection as instance items —
     * the projection carries instance-bound commit-loop callbacks, so it cannot live in the
     * static config.
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        me.dockPreviewProducer = Neo.create(DockPreviewProducer);
        me.perspectiveStore    = Neo.create(DockPerspectiveStore, {collection: cockpitPresetCollection()});
        me.dockModel           = me.dockModel || cockpitDockDocument();

        me.add(me.buildWorkspaceItems())
    }

    /**
     * @summary Switches the cockpit to a named preset: the stored record restores through the
     * landed fail-closed path (validate everything before mutating anything — a refused restore
     * leaves the live layout byte-untouched), and a valid document enters the standard commit
     * loop — the switch re-projects FLIP-animated exactly like any committed operation, with
     * reduced-motion collapsing through the token layer by construction.
     *
     * Pane continuity across a switch is state-continuity, not instance identity: projections
     * rebuild instances by design; the live surfaces re-materialize from the OWNER-held state
     * ({@link #resolveDockComponentRef}) and the provider-owned roster store never restarts.
     * @param {String} name The preset's `perspectiveName` (or technical `layoutId`).
     * @returns {{switched: Boolean, errors: String[]}}
     */
    activatePerspective(name) {
        let me                 = this,
            {document, errors} = me.perspectiveStore.loadPerspective(name);

        if (errors.length) {
            me.presetError = `${name}: ${errors[0]}`;
            me.refreshDockWorkspace();
            return {errors, switched: false}
        }

        me.presetError = null;
        me.onDockZoneDocumentChange(document);
        return {errors: [], switched: true}
    }

    /**
     * @summary On construct, bind the fleet surfaces to their live feeds, and guard the roster
     * store's async seed load against clobbering a faster live source.
     * @param {...*} args
     */
    onConstructed(...args) {
        super.onConstructed(...args);

        let me = this;

        me.getReference('fleet-grid')?.store?.on({load: me.onRosterStoreLoad, scope: me});

        me.loadActivity();
        me.loadRoster()
    }

    /**
     * The owning reducer every dock gesture calls (`DockSplitter.commitResizeSplit`, the
     * cross-zone drop path, NL-driven operations): applies an operation descriptor against the
     * live committed document and returns `DockZoneModel`'s fail-closed `{document, errors}`
     * result. Pure — the view sync happens in {@link #onDockZoneDocumentChange}, which callers
     * invoke on success.
     * @param {Object} descriptor The dock operation descriptor.
     * @returns {{document: Object, errors: String[]}}
     */
    applyDockZoneOperation(descriptor) {
        return DockZoneModel.applyOperation(this.dockModel, descriptor)
    }

    /**
     * The read half of the dock-holder contract (`src/ai/client/DockService.mjs`): exposes the
     * live committed document so Neural Link topology reads work BEFORE any operation has run.
     * The write half is {@link #applyDockZoneOperation}; the state sync stays in
     * {@link #onDockZoneDocumentChange}.
     * @returns {Object} The current committed dockZone.v1 document.
     */
    getDockZoneDocument() {
        return this.dockModel
    }

    /**
     * The view-sync half of the commit loop: stores the new committed document and re-projects
     * from it.
     *
     * Deferred one tick: this fires synchronously from inside the committing splitter's
     * `onDragEnd` (via `commitResizeSplit`). Re-projecting immediately would `removeAll()` —
     * destroying that splitter mid-handler, a use-after-destroy on the rest of `onDragEnd`. The
     * `isDestroyed` guard covers teardown before the tick fires.
     * @param {Object} document The committed dock-zone document.
     */
    onDockZoneDocumentChange(document) {
        let me = this;

        me.dockModel = document;

        me.timeout(0).then(() => {
            if (!me.isDestroyed) {
                me.refreshDockWorkspace()
            }
        })
    }

    /**
     * @summary Rebuilds the toolbar + dock projection from current state, FLIP-bracketed: the
     * outgoing pane geometry is snapshotted so the committed re-layout GLIDES, and the counted
     * motion signal brackets the animation window (ownership lives in `DockMotionSignal`,
     * fail-safe backstopped — never in the addon).
     */
    async refreshDockWorkspace() {
        const flip = Neo.main?.addon?.DockFlip;

        try {
            await flip?.captureFirst({hostId: this.id, markerPrefix: 'dock-flip-item-'})
        } catch (e) {/* instant landing */}

        this.removeAll();
        this.add(this.buildWorkspaceItems());

        if (flip) {
            DockMotionSignal.enter(this);
            flip.play({hostId: this.id, markerPrefix: 'dock-flip-item-'})
                .catch(() => {})
                .finally(() => DockMotionSignal.leave(this))
        }
    }

    /**
     * Creates the top-level control bar + dock projection items from current state: the preset
     * switcher on the left (one button per stored perspective, the active one pressed — plus
     * the fail-closed error chip when a switch was refused), the fleet controls on the right.
     * @returns {Object[]}
     */
    buildWorkspaceItems() {
        let me             = this,
            dockConfig     = me.projectDockModel(),
            activeLayoutId = me.perspectiveStore?.collection?.activeLayoutId,
            presetButtons  = (me.perspectiveStore?.list() || []).map(preset => ({
                module : Button,
                cls    : ['fm-preset-button'],
                handler: () => me.activatePerspective(preset.perspectiveName ?? preset.layoutId),
                pressed: preset.layoutId === activeLayoutId,
                text   : preset.perspectiveName ?? preset.layoutId
            }));

        dockConfig.flex = 1;

        return [{
            ntype: 'toolbar',
            cls  : ['fm-cockpit-bar'],
            flex : 'none',
            items: [
                ...presetButtons,
                ...(me.presetError ? [{
                    ntype: 'component',
                    cls  : ['fm-preset-error'],
                    html : me.presetError
                }] : []),
                '->', {
                    // The morning-start outcome summary — written by the controller after the
                    // staged bring-up settles ("N started · M rejected · K excluded"; per-member
                    // reasons ride the title). Empty + hidden until a start ran; hover reaches the
                    // reasons — the honest summary state, no separate progress modal (the health
                    // bar stays the live progression surface).
                    ntype    : 'component',
                    cls      : ['fm-fleet-start-summary'],
                    hidden   : true,
                    reference: 'fleet-start-summary'
                }, {
                    module : Button,
                    cls    : ['fm-fleet-start'],
                    iconCls: 'fa-solid fa-play',
                    text   : 'Start morning fleet',
                    handler: 'onStartFleet'
                }
            ]
        }, dockConfig]
    }

    /**
     * Projects the live committed {@link #dockModel} into a dock-zone container config, threading
     * the instance-bound commit-loop callbacks onto every projected affordance.
     * @returns {Object}
     */
    projectDockModel() {
        let me = this;

        return DockLayoutAdapter.project(me.dockModel, {
            applyDockZoneOperation  : me.applyDockZoneOperation.bind(me),
            onDockCrossZoneDrop     : me.onDockCrossZoneDrop.bind(me),
            onDockZoneDocumentChange: me.onDockZoneDocumentChange.bind(me),
            resolveComponentRef     : me.resolveDockComponentRef.bind(me)
        })
    }

    /**
     * @summary Resolves a dock item's `componentRef` to its pane config — the cockpit's keeper
     * surfaces for the live refs, honest placeholders for panes whose views are sibling leaves.
     *
     * Every pane re-materializes from the OWNER's held runtime state (`adapterState`, events):
     * re-projections rebuild instances, so anything set only on an instance would silently reset.
     * The flip marker class carries the stable item identity across those rebuilds (the DockFlip
     * correlation key). Panes stay layout-blind per the docking design's pane contract: nothing
     * dock-specific is threaded here beyond the marker class.
     * @param {String} componentRef
     * @param {Object} item The persisted item record.
     * @param {String} itemId The stable workspace identity from the item catalog.
     * @returns {Object}
     */
    resolveDockComponentRef(componentRef, item, itemId) {
        let me     = this,
            marker = `dock-flip-item-${encodeURIComponent(itemId)}`;

        switch (componentRef) {
            case 'fleet-grid':
                return {
                    module      : FleetGrid,
                    adapterState: me.gridAdapterState,
                    bind        : {store: 'stores.fleetRoster'},
                    cls         : [marker],
                    reference   : 'fleet-grid'
                };
            case 'activity-stream':
                return {
                    module      : ActivityStream,
                    adapterState: me.streamAdapterState,
                    cls         : [marker],
                    events      : me.streamEvents,
                    reference   : 'activity-stream'
                };
            case 'agent-detail':
                // the drill-in inspector; its selected resident is OWNER-held (re-projections
                // rebuild instances) so a committed layout change never drops the selection — null
                // renders the view's honest "select an agent" empty state
                return {
                    module   : AgentDetail,
                    cls      : [marker],
                    record   : me.detailRecord,
                    reference: 'agent-detail'
                };
            default:
                // perspectives arrives with its own leaf — an honest labelled placeholder, never a
                // blank pane masquerading as a finished surface
                return {
                    ntype: 'component',
                    cls  : [marker, 'fm-pane-placeholder'],
                    html : `${item?.title ?? componentRef} — this pane's view lands with its own leaf`
                }
        }
    }

    /**
     * Cross-zone drop reducer: a dock tab-header released outside its own toolbar reports its
     * release point here (via `Neo.dashboard.DockTabSortZone`). The producer resolves the
     * placement KIND from the pointer and each zone's rect, `previewToOperation` maps it to the
     * semantic operation, and the standard commit loop applies it. A same-zone drop is a no-op
     * (the within-toolbar reorder already committed via the `moveTo` listener).
     * @param {Object} data
     * @param {Number} data.clientX
     * @param {Number} data.clientY
     * @param {String} data.itemId       The dock item id being dragged.
     * @param {String} data.sourceNodeId The tabs node the drag started in.
     */
    async onDockCrossZoneDrop({clientX, clientY, itemId, sourceNodeId}) {
        let me    = this,
            nodes = me.dockModel?.nodes || {},
            zones = Object.keys(nodes)
                .filter(nodeId => nodes[nodeId].type === 'tabs' && nodeId !== sourceNodeId)
                .map(nodeId => ({nodeId, container: me.down({dockNodeId: nodeId})}))
                .filter(zone => zone.container);

        if (!zones.length) {
            return
        }

        let rects = await me.getDomRect(zones.map(zone => zone.container.id));

        let producerZones = zones
                .map((zone, index) => ({
                    nodeId     : zone.nodeId,
                    rect       : rects[index],
                    orientation: Object.values(nodes).find(node => node.type === 'split' && node.children?.includes(zone.nodeId))?.orientation ?? null
                }))
                .filter(zone => zone.rect),
            preview    = me.dockPreviewProducer.produce({pointer: {x: clientX, y: clientY}, zones: producerZones, itemId, sourceNodeId}),
            descriptor = previewToOperation(preview);

        if (descriptor) {
            let result = me.applyDockZoneOperation(descriptor);

            if (result && !result.errors?.length && result.document) {
                me.onDockZoneDocumentChange(result.document)
            }
        }
    }

    /**
     * @summary Source-precedence guard: the provider-hosted roster store `autoLoad`s the JSON
     * sample seed while {@link #loadRoster} races the bridge. When the bridge wins, the sample's
     * later `load` would silently replace live rows (the grid still claiming `live`). Any store
     * load landing AFTER live truth re-applies the last authoritative snapshot — idempotent,
     * fail-closed toward live. A load before live truth is the normal seed path and passes through.
     * Latched via {@link #reconcilingRoster}: the reconciliation's own mutations fire `load` back
     * into this listener.
     * @protected
     */
    onRosterStoreLoad() {
        let me = this;

        if (!me.reconcilingRoster && me.rosterWired && me.lastLiveRows) {
            me.reconcilingRoster = true;

            try {
                me.reconcileRoster(me.getReference('fleet-grid').store, me.lastLiveRows)
            } finally {
                me.reconcilingRoster = false
            }
        }
    }

    /**
     * @summary Detach the roster-store load guard and release the drop producer; the provider
     * tears the owned store itself down.
     * @param {...*} args
     */
    destroy(...args) {
        let me = this;

        me.getReference('fleet-grid')?.store?.un({load: me.onRosterStoreLoad, scope: me});
        me.dockPreviewProducer?.destroy();
        me.dockPreviewProducer = null;
        me.perspectiveStore?.destroy();
        me.perspectiveStore = null;
        super.destroy(...args)
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
     * The routed state also lands on the OWNER ({@link #streamAdapterState} / {@link #streamEvents})
     * so re-projections re-materialize the pane at current truth.
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
                me.streamAdapterState = 'live';
                me.streamEvents       = Array.isArray(events) ? events.slice().reverse() : [];
                stream.set({adapterState: me.streamAdapterState, events: me.streamEvents})
            } else if (capability?.state === 'degraded') {
                me.streamAdapterState = 'stale';
                stream.adapterState   = 'stale'
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
     *   Grid goes `live` (instance + the owner-held state re-projections read).
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

            me.lastLiveRows = mapped;

            if (me.rosterWired) {
                me.reconcileRoster(grid.store, mapped)
            } else {
                grid.store.clear();
                mapped.length > 0 && grid.store.add(mapped);
                me.rosterWired = true
            }

            me.gridAdapterState = 'live';
            grid.adapterState   = 'live'
        } catch (error) {
            // fail-closed: the last-known roster stays rather than blanking the fleet
        }
    }

    /**
     * @summary Map one assembler DTO row onto the FleetAgent record contract. The durable `id`
     * becomes `agentId`; identity facts (`family` / `engineTag` / the authoritative
     * `participationStatus`) flow through (null = unclassified / tagless / no identity root,
     * never guessed); the launch-derived truths (`launchable` / `authMode`, stamped Brain-side by
     * the roster assembler) flow through tri-state so the morning-start eligibility partition
     * reads the wire, never a cockpit guess; the runtime `lifecycle.state` maps onto the
     * cockpit's session-state vocabulary only when `sources.runtime` is usable; missing /
     * not-wired / malformed source truth forces `off`, so placeholder can never render as fact.
     * The normalized three-source object remains on the record for the card markers AND the
     * eligibility partition (an unusable runtime source must fail a fleet start closed).
     * `openLaneCount` rides the same tri-state passthrough — the roster DTO OWNS it end-to-end
     * (assembler → record → badge), so the FIRST authoritative load carries live truth and a
     * missing stamp degrades to null (no badge), never to the sample seed's number. `laneLine`
     * is deliberately OMITTED (not nulled): the activity capability owns it, and a merge must
     * never wipe what another producer wrote.
     * @param {Object} row One cockpit DTO row (`fleetCockpitStatus` shape).
     * @returns {Object} FleetAgent record field values.
     */
    mapRosterRow(row) {
        const sessionHealth = mapFleetSessionHealth(row.lifecycle, row.sources);

        return {
            agentId      : row.id,
            authMode     : row.authMode ?? null,
            avatarUrl    : row.avatarUrl ?? null,
            displayName  : row.displayName ?? null,
            engineTag    : row.engineTag ?? null,
            family       : row.family ?? null,
            launchable   : row.launchable ?? null,
            openLaneCount: row.openLaneCount ?? null,
            // the authoritative identity-root participation fact (tri-state null = no root) —
            // the eligibility partition excludes any KNOWN non-active status before a lifecycle
            // write; null stays eligible (open-set honesty for forks/custom residents)
            participationStatus: row.participationStatus ?? null,
            sources            : sessionHealth.sources,
            state              : sessionHealth.state
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
        const
            snapshotIds = new Set(rows.map(row => row.agentId)),
            joiners     = [];

        rows.forEach(row => {
            const record = store.get(row.agentId);

            record ? record.set(row) : joiners.push(row)
        });

        // one batched add — every store mutation fires `load`, so per-row adds would fan out
        joiners.length > 0 && store.add(joiners);

        store.items
            .filter(record => !snapshotIds.has(record.agentId))
            .map(record => record.agentId)
            .forEach(agentId => store.remove(agentId))
    }
}

export default Neo.setupClass(FleetCockpit);
