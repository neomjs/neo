import Component                from '../../../src/component/Base.mjs';
import Container                from '../../../src/container/Base.mjs';
import DockWorkspace            from '../../../src/dashboard/dock/Workspace.mjs';
import Feed                     from '../store/Feed.mjs';
import FeedPane                 from './FeedPane.mjs';
import Scale                    from '../store/Scale.mjs';
import ScalePane                from './ScalePane.mjs';
import DockDragAffordances      from '../../../src/dashboard/dock/interaction/DragAffordances.mjs';
import DockDropIndicators       from '../../../src/dashboard/dock/interaction/DropIndicators.mjs';
import DockLayoutAdapter        from '../../../src/dashboard/dock/projection/LayoutAdapter.mjs';
import PerspectiveLibrary       from '../../../src/dashboard/dock/persistence/PerspectiveLibrary.mjs';
import DockPreview              from '../../../src/dashboard/dock/interaction/Preview.mjs';
import DockProjectionReconciler from '../../../src/dashboard/dock/projection/Reconciler.mjs';
import DockService              from '../../../src/ai/client/DockService.mjs';
import WorkspaceDocument        from '../../../src/dashboard/dock/model/WorkspaceDocument.mjs';
import Operations               from '../../../src/dashboard/dock/model/Operations.mjs';
import Persistence              from '../../../src/dashboard/dock/model/Persistence.mjs';
import InteractionService       from '../../../src/ai/client/InteractionService.mjs';
import StateProvider            from '../../../src/state/Provider.mjs';
import TourRunner               from '../../../src/ai/client/TourRunner.mjs';
import TransactionManager       from '../../../src/manager/Transaction.mjs';
import {
    createDockVesselEmbodiment,
    createDockVesselProxyEmbodiment
}                                                from '../../../src/dashboard/dock/window/VesselEmbodiment.mjs';
import {createDockWorkspaceSet}                 from '../../../src/dashboard/dock/window/WorkspaceSet.mjs';
import {createVesselParkHandlers}               from '../../../src/dashboard/dock/window/VesselPark.mjs';
import {previewToOperation}                     from '../../../src/dashboard/dock/model/PreviewContract.mjs';
import {workstationTourScript, initialDocument} from '../tour/denseWorkstation.mjs';
import '../../../src/button/Base.mjs';
import '../../../src/tab/Container.mjs';
import '../../../src/toolbar/Base.mjs';

/**
 * Target-owned narrative data for Workstation's lightweight resident panes. These are presentation
 * facts only: stores and dock state remain owned by their existing authorities.
 * @type {Object}
 */
const paneStories = Object.freeze({
    activity : {detail: '12 residents reporting', icon: 'fa-wave-square', kicker: 'SYSTEM PULSE',      metric: 'LIVE'},
    alerts   : {detail: '2 require attention',    icon: 'fa-bell',        kicker: 'PRIORITY SIGNALS', metric: '07'},
    audit    : {detail: 'all gates evidenced',    icon: 'fa-shield-alt',  kicker: 'EVIDENCE CHAIN',   metric: '100%'},
    builds   : {detail: '8 parallel checks',      icon: 'fa-cubes',       kicker: 'BUILD FABRIC',     metric: '8/8'},
    commits  : {detail: '5 branches converging',  icon: 'fa-code-branch', kicker: 'CHANGE STREAM',    metric: '+42'},
    console  : {detail: 'semantic ops ready',     icon: 'fa-terminal',    kicker: 'COMMAND PLANE',    metric: 'ARMED'},
    deploys  : {detail: '3 regions synchronized', icon: 'fa-rocket',      kicker: 'FLIGHT DECK',      metric: '03'},
    files    : {detail: 'workspace graph indexed',icon: 'fa-folder-tree', kicker: 'SOURCE SURFACE',   metric: '25K'},
    graph    : {detail: 'dependency edges awake', icon: 'fa-project-diagram', kicker: 'DEPENDENCY GRAPH',  metric: '20K+'},
    inspector: {detail: 'selection follows focus',icon: 'fa-crosshairs',  kicker: 'CONTEXT LENS',     metric: 'LOCK'},
    logs     : {detail: 'zero fatal events',      icon: 'fa-align-left',  kicker: 'STRUCTURED LOGS',  metric: '0 ERR'},
    memory   : {detail: 'pressure stays bounded', icon: 'fa-brain',       kicker: 'MEMORY TELEMETRY',      metric: 'SYNC'},
    metrics  : {detail: 'system envelope stable', icon: 'fa-chart-line',  kicker: 'LIVE METRICS',     metric: '99.9'},
    queues   : {detail: '18 lanes in motion',     icon: 'fa-stream',      kicker: 'TASK PRESSURE',    metric: '18'},
    runtime  : {detail: 'all residents responsive', icon: 'fa-heartbeat', kicker: 'RUNTIME HEALTH',  metric: 'GREEN'},
    security : {detail: 'continuous policy scan', icon: 'fa-lock',        kicker: 'TRUST ENVELOPE',  metric: 'CLEAR'},
    topology : {detail: '20 panes · one identity',icon: 'fa-sitemap',     kicker: 'WORKSPACE SHAPE',  metric: '20'},
    traces   : {detail: '4 active continuations', icon: 'fa-route',       kicker: 'TRACE FABRIC',     metric: '04'}
});

/**
 * @summary Workstation: the dense, themed, living-data workstation showcase.
 *
 * The workspace owns one committed `dockZone.v1` document, one root StateProvider, two
 * provider-created Store<Model> instances, and one feed timer. Pane instances are cached
 * and parked across coarse dock projections, so split/return/overflow operations preserve
 * the owning grid and store identities. Built-in grid and Sparkline families own pooling,
 * hydration, and OffscreenCanvas registration; this class owns only composition and story.
 *
 * @class Workstation.view.Workspace
 * @extends Neo.dashboard.dock.Workspace
 */
class Workspace extends DockWorkspace {
    /**
     * Five records every 500ms: the declared 10-records/sec producer contract.
     * @member {Number} FEED_BATCH_SIZE=5
     * @static
     */
    static FEED_BATCH_SIZE = 5
    /**
     * @member {Number} FEED_INTERVAL_MS=500
     * @static
     */
    static FEED_INTERVAL_MS = 500
    /**
     * The stable semantic identity of the main workspace document inside the cross-window
     * workspace set — a workspace is one dock-zone document owned by one container; windows are
     * render targets, never state owners.
     * @member {String} MAIN_WORKSPACE_ID='workstation-main'
     * @static
     */
    static MAIN_WORKSPACE_ID = 'workstation-main'
    /**
     * The DragCoordinator sort group every workstation dock zone registers under as a
     * cross-window drag source and target.
     * @member {String} CROSS_WINDOW_SORT_GROUP='workstation-cross-window'
     * @static
     */
    static CROSS_WINDOW_SORT_GROUP = 'workstation-cross-window'
    /**
     * Returns one vessel's stable semantic workspace identity. Runtime window ids never enter it.
     * @param {String} itemId
     * @returns {String|null}
     * @static
     */
    static vesselWorkspaceId(itemId) {
        return typeof itemId === 'string' && itemId ? `workstation-vessel:${itemId}` : null
    }
    /**
     * Returns the stable landing-tabs identity for one lazily seeded vessel document.
     * @param {String} itemId
     * @returns {String|null}
     * @static
     */
    static vesselTabsNodeId(itemId) {
        return typeof itemId === 'string' && itemId ? `workstation-vessel-tabs:${itemId}` : null
    }

    static config = {
        /**
         * @member {String} className='Workstation.view.Workspace'
         * @protected
         */
        className: 'Workstation.view.Workspace',
        /**
         * The engine's tear-out lifecycle: the workspace reserves each vessel's slot in its Group and
         * admits the window that binds it. This host supplies the platform seams and its own receipts.
         * @member {Boolean} enableDockTearOutLifecycle=true
         */
        enableDockTearOutLifecycle: true,
        /**
         * @member {String[]} additionalThemeFiles
         */
        additionalThemeFiles: [
            'Workstation.view.Viewport',
            'Neo.dashboard.Container',
            'Workstation.view.Workspace'
        ],
        /**
         * @member {String[]} cls
         */
        cls: ['workstation-workspace'],
        /**
         * The projection mounts into the dock-host child built in `construct` — the preview
         * renderer and drop indicators live beside the projected shell as persistent siblings.
         * @member {String|null} dockHostReference='dock-host'
         */
        dockHostReference: 'dock-host',
        /**
         * @member {String} flipMarkerPrefix='workstation-pane-'
         */
        flipMarkerPrefix: 'workstation-pane-',
        /**
         * @member {Object} layout
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * The preview design-language switch (the design-exploration selector): the value maps to a
         * `neo-preview-lang-<value>` modifier cls on the dock host, so skin variants swap live — on
         * the workspace config, from a tour script, or from the console — without touching behavior.
         * `null` renders the default affordance family.
         * @member {String|null} previewLanguage_=null
         * @reactive
         */
        previewLanguage_: null,
        /**
         * The one root provider owns both stores; cached panes receive these exact instances.
         * @member {Object} stateProvider
         */
        stateProvider: {
            module: StateProvider,
            stores: {
                feed : {module: Feed},
                scale: {module: Scale}
            }
        }
    }

    /**
     * Retained tab bars whose CSS entry animation is suppressed for the current re-projection —
     * written by {@link #getReconcileOptions}'s staging seam, restored and cleared by
     * {@link #afterRefreshDockWorkspace}. Refreshes serialize on the class's chain, so the field
     * never sees two transactions at once.
     * @member {Neo.toolbar.Base[]} animationSuppressedBars=[]
     * @protected
     */
    animationSuppressedBars = []
    /**
     * @member {Neo.ai.client.DockService|null} dockService=null
     */
    dockService = null
    /**
     * The named-layout home for the Neural Link perspective trio — the client DockService
     * resolves `holder.perspectiveStore`, so instantiating it here activates capture (stored),
     * list, and restore for this one Workspace. Restore rides the store's fail-closed
     * `loadPerspective` plus this view's `onDockZoneDocumentChange`
     * commit seam — the same path `execute_dock_operation` commits through.
     * @member {Neo.dashboard.dock.persistence.PerspectiveLibrary|null} perspectiveStore=null
     */
    perspectiveStore = null
    /**
     * Keyed multi-workspace records remain separate from the Workspace layout library. The future
     * Group owner adopts this collection; until then DockService can capture/list/restore the wire
     * without widening `PerspectiveLibrary`.
     * @member {Object|null} topologyCollection=null
     */
    topologyCollection = null
    /**
     * @member {Neo.ai.client.TourRunner|null} tourRunner=null
     */
    tourRunner = null
    /**
     * The shared drag-affordance gesture controller (producer lifecycle, memoized geometry,
     * release-truth drop, generation guards) — composed at construct, destroyed with the view.
     * @member {Neo.dashboard.dock.interaction.DragAffordances|null} dragAffordances=null
     */
    dragAffordances = null
    /**
     * Real-pointer gesture driver for the app-owned journey executors (spec + film replays).
     * @member {Neo.ai.client.InteractionService|null} interactionService=null
     */
    interactionService = null
    /**
     * @member {Object} paneCache={}
     * @protected
     */
    paneCache = {}
    /**
     * The transient render embodiment for admitted tear-out vessels (live pane staged into the
     * vessel while a hidden exact-slot placeholder holds the source indices).
     * @member {Object|null} tearOutEmbodiment=null
     */
    tearOutEmbodiment = null
    /**
     * The nested transient embodiment for an admitted converted vessel: the same cached pane
     * moves from its parked source popup into exactly one target-local DragProxyContainer while a
     * second hidden placeholder reserves the popup's live slot.
     * @member {Object|null} vesselProxyEmbodiment=null
     */
    vesselProxyEmbodiment = null
    /**
     * Exact pre-conversion and target-cover outer geometry for parked tear-out vessels.
     * Runtime-only physical recovery authority; never persisted workspace state.
     * @member {Object} tearOutParkGeometries={}
     * @protected
     */
    tearOutParkGeometries = {}
    /**
     * Park attempts per vessel item id since that vessel last parked. The coordinator retries a
     * refused park; a stalled retry reads live as a rising count with the same `refusedAt`.
     * @member {Object} tearOutParkAttempts={}
     * @protected
     */
    tearOutParkAttempts = {}
    /**
     * The runtime window id of the vessel an in-flight conversion is hovering over — stashed by
     * the conversion-in seam so the park's cover geometry resolves the exact target. Never
     * persisted workspace state: a window is a render target.
     * @member {String|Number|null} vesselConversionTargetWindowId=null
     * @protected
     */
    vesselConversionTargetWindowId = null
    /**
     * The in-gesture vessel lifecycle authority (park / re-show / dispose-on-commit).
     * @member {Object|null} vesselParkHandlers=null
     * @protected
     */
    vesselParkHandlers = null
    /**
     * Post-terminal native-titlebar park/restore authority. Separate from pointer conversion:
     * the generic DragDrop addon has no active pointer-follow session after a dropped popup.
     * @member {Object|null} nativeVesselParkHandlers=null
     * @protected
     */
    nativeVesselParkHandlers = null
    /**
     * The worker-owned cross-window workspace registry — `{workspaceId → document accessors}`.
     * @member {Object|null} workspaceSet=null
     * @protected
     */
    workspaceSet = null
    /**
     * Target-side adapters keyed by stable workspace identity. The main workspace registers during
     * construction; vessel targets register only after their exact child window joins.
     * @member {Map<String,Neo.dashboard.dock.window.Participation>} crossWindowParticipations
     * @protected
     */
    crossWindowParticipations = new Map()
    /**
     * Readiness of the main workspace's late-bound participation. The dynamic import keeps the
     * manager.Window singleton behind the app/harness construction boundary.
     * @member {Promise<Neo.dashboard.dock.window.Participation|null>} crossWindowParticipationPromise
     * @protected
     */
    crossWindowParticipationPromise = null
    /**
     * Transient exact-node measurements for active cross-window preview targets. Each entry is
     * generation-checked by component identity plus the live manager.Window inner rectangle;
     * projection, leave, resize, or teardown retires it. Geometry never enters dock documents.
     * @member {Map<String,Object>} crossWindowPreviewGeometries
     * @protected
     */
    crossWindowPreviewGeometries = new Map()

    /**
     * The main window's inner-rect signature at the last remote frame. A change mid-gesture means
     * the main window was resized under a hovering popup, so the affordance geometry is re-measured
     * (see {@link #renderMainCrossWindowPreview}). Reset when the main preview clears.
     * @member {String|null} mainPreviewWindowSignature=null
     * @protected
     */
    mainPreviewWindowSignature = null
    /**
     * Worker-owned vessel workspace records keyed by stable workspace identity. Entries carry
     * document ownership and render-target refs, never cached geometry.
     * @member {Map<String,Object>} vesselWorkspaces
     * @protected
     */
    vesselWorkspaces = new Map()
    /**
     * Most recent cross-window transfer receipt for the film/spec boundary.
     * @member {Object|null} lastCrossWindowTransfer=null
     */
    lastCrossWindowTransfer = null
    /**
     * Most recent exact vessel-close attempt for bounded headed-failure diagnosis. Native handle
     * authority is represented only by presence/match booleans; its secret key never enters this
     * worker-visible receipt.
     * @member {Object|null} lastTearOutClose=null
     */
    lastTearOutClose = null
    /**
     * Number of coalesced producer batches appended over this workspace lifetime.
     * @member {Number} feedBatchCount=0
     */
    feedBatchCount = 0
    /**
     * Monotonic feed key; padded string ordering keeps newest-first stable.
     * @member {Number} feedSequence=0
     */
    feedSequence = 0
    /**
     * Serialized surface-cue chain for the current visible tour.
     * @member {Promise} cuePromise
     * @protected
     */
    cuePromise = Promise.resolve()
    /**
     * Hosting-surface cue promises indexed by the runner's scene/step identity. The injected
     * `TourRunner.stepSettlement` callback awaits an entry before `stepSettled`; that event then
     * consumes it for the independent progress-paint chain. The map never becomes runner state.
     * @member {Map<String,Promise>} cueSettlements
     * @protected
     */
    cueSettlements = new Map()
    /**
     * Serialized, paint-confirmed tour progress. `TourRunner.stepSettled` arrives after this
     * host's cue/refresh barrier, but events are observational and the next beat can start as soon
     * as the listener returns. This local chain therefore re-awaits the keyed settlement before
     * painting each pip in order; it never becomes part of runner execution.
     * @member {Promise} progressPromise
     * @protected
     */
    progressPromise = Promise.resolve()
    /**
     * Fail-closed surface-cue errors for the current visible tour.
     * @member {String[]} cueErrors
     * @protected
     */
    cueErrors = []
    /**
     * Ordered observable receipts returned by the screenplay's surface cues.
     * @member {Object[]} cueReceipts
     * @protected
     */
    cueReceipts = []
    /**
     * The most recent fully settled visible-tour result.
     * @member {Object|null} lastTourReceipt=null
     */
    lastTourReceipt = null
    /**
     * Most recent exact-handle park admission receipt.
     *
     * `parked` and `physical` are separate answers, and the pair is the point: `parked: true` says
     * the park was SATISFIED, `physical: false` that it performed no platform effect. A main-window
     * target under a native titlebar is exactly that case — there is nothing to move, so the park
     * succeeds having done nothing. A reader taking `parked` as proof of a platform call would go
     * looking for a move that never happened.
     * @member {Object|null} lastVesselParkReceipt=null
     * @protected
     */
    lastVesselParkReceipt = null
    /**
     * Most recent exact-handle restore admission receipt.
     * @member {Object|null} lastVesselRestoreReceipt=null
     * @protected
     */
    lastVesselRestoreReceipt = null
    /**
     * Five records every 500ms = an honest 10 records/sec.
     * @member {Number|null} #feedIntervalId=null
     * @private
     */
    #feedIntervalId = null

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        me.dockModel         = WorkspaceDocument.clone(initialDocument);
        me.dockService       = Neo.create(DockService, {});
        me.perspectiveStore  = Neo.create(PerspectiveLibrary, {});
        me.topologyCollection = Persistence.createTopologyCollection().collection;

        me.tourRunner  = Neo.create(TourRunner, {
            componentId   : me.id,
            dockService   : me.dockService,
            mode          : 'demo',
            script        : workstationTourScript,
            stepSettlement: data => me.settleTourStep(data)
        });

        me.tourRunner.on({
            beat       : me.onTourBeat,
            complete   : me.onTourComplete,
            error      : me.onTourError,
            scene      : me.onTourScene,
            stepSettled: me.onTourStepSettled,
            scope      : me
        });

        me.appendFeedBatch(25);

        me.add([me.createTourBar(), me.createStatusBar(), {
            module: Container,
            cls   : ['workstation-dock-host', 'neo-dashboard', 'neo-dashboard-dock-query-host'],
            flex  : 1,
            // The projection child is index 0 and the ONLY child the shared reconciler stages;
            // the preview renderer + indicator menu are PERSISTENT siblings (absolute overlays
            // via the skin) — object permanence across every re-projection.
            items: [me.projectDockModel(), {
                module   : DockPreview,
                reference: 'dock-preview'
            }, {
                module   : DockDropIndicators,
                reference: 'drop-indicators'
            }],
            layout   : {ntype: 'fit'},
            reference: 'dock-host'
        }]);

        // The shared gesture controller composes the overlays it just created — the same
        // app-neutral owner Demo-A rides; the flagship adds zero orchestration of its own.
        me.dragAffordances = Neo.create(DockDragAffordances, {
            host      : me.getReference('dock-host'),
            indicators: me.getReference('drop-indicators'),
            owner     : me,
            preview   : me.getReference('dock-preview')
        });

        me.interactionService = Neo.create(InteractionService, {});

        me.tearOutEmbodiment = createDockVesselEmbodiment({
            resolvePane: itemId => me.paneCache[itemId]
                ?? (me.dockModel?.items?.[itemId] && me.resolvePane(itemId, me.dockModel.items[itemId])),
            resolveTarget: windowId => Neo.apps[windowId]?.mainView ?? null
        });

        me.vesselProxyEmbodiment = createDockVesselProxyEmbodiment({
            resolvePane: itemId => me.paneCache[itemId]
                ?? (me.dockModel?.items?.[itemId] && me.resolvePane(itemId, me.dockModel.items[itemId])),
            resolveProxyConfig: ({sourceSortZone, targetWindowId}) => {
                const
                    sourceConfig = sourceSortZone?.getDragProxyConfig?.() ?? {cls: []},
                    targetApp    = Neo.apps[targetWindowId];

                const cls = [...new Set([
                    ...(sourceConfig.cls || []),
                    'neo-dock-dragproxy',
                    'workstation-vessel-dragproxy'
                ])];

                return {
                    ...sourceConfig,
                    appName: targetApp?.name ?? me.appName,
                    cls
                }
            }
        });

        // The cross-window composition (docking design record §2.1/§2.3): the workspace set resolves
        // documents by STABLE workspace identity — windowId, screen geometry, and projection state
        // never enter it; a window is a render target, not a state owner. Its membership lives in
        // this workspace's Group on `Neo.manager.Transaction`: the app imports the manager, so its
        // window is admitted at registration, and a Group the carrier already held is known before
        // this constructor runs. A first boot's minted identity arrives once the carrier accepted it,
        // through `afterSetTopologyGroupId`, which registers the main participant then. The Group is
        // kept for the instance's lifetime: releasing the window's slot never loses the documents.
        // Vessel workspaces register lazily on first dock-INTO (Edit 2).
        me.workspaceSet = createDockWorkspaceSet({manager: TransactionManager, getGroupId: () => me.topologyGroupId});
        me.registerMainWorkspace();

        me.crossWindowParticipationPromise = me.refreshCrossWindowParticipation(Workspace.MAIN_WORKSPACE_ID)
            .catch(error => {
                me.lastCrossWindowTransfer = {applied: false, errors: [error.message]};
                return null
            });

        // Conversion never re-acquires a popup: close-and-reopen is a one-way door (mid-gesture
        // acquisition consumes transient activation and reads as unsolicited), so conversion
        // PARKS the real vessel behind its target, out-conversion re-shows the SAME generation,
        // and only a commit disposes — every other outcome restores.
        me.vesselParkHandlers = createVesselParkHandlers({
            disposeVessel: vessel => me.disposeParkedTearOutVessel(vessel),
            parkVessel   : vessel => me.parkTearOutVessel(vessel),
            reshowVessel : vessel => me.reshowTearOutVessel(vessel)
        });
        me.nativeVesselParkHandlers = createVesselParkHandlers({
            disposeVessel: ({itemId}) => me.retireReturnedVessel(Workspace.vesselWorkspaceId(itemId)),
            parkVessel   : vessel => me.parkTearOutVessel({...vessel, nativeTitlebar: true}),
            reshowVessel : vessel => me.reshowTearOutVessel(vessel)
        });

        // The reactive afterSet fires before the dock host exists during construction —
        // re-apply the active language now that the host is live (both orders converge).
        me.previewLanguage && me.afterSetPreviewLanguage(me.previewLanguage, null);

        me.updateStatusBar();
        me.#feedIntervalId = setInterval(
            () => me.appendFeedBatch(Workspace.FEED_BATCH_SIZE),
            Workspace.FEED_INTERVAL_MS
        )
    }

    /**
     * Swaps the preview design-language modifier cls on the dock host. Fires before the host
     * exists during construction — the construct-time add path re-applies the active value once
     * the host is live, so both orders resolve to the same cls state.
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetPreviewLanguage(value, oldValue) {
        let host = this.getReference('dock-host');

        if (host) {
            oldValue && host.removeCls(`neo-preview-lang-${oldValue}`);
            value    && host.addCls(`neo-preview-lang-${value}`)
        }
    }

    /**
     * Adds one coalesced feed batch, then trims the capped tail in one splice.
     * @param {Number} amount
     * @returns {Number} Current feed count.
     */
    appendFeedBatch(amount=Workspace.FEED_BATCH_SIZE) {
        let me      = this,
            store   = me.getStateProvider().getStore('feed'),
            records = [],
            now     = new Date();

        for (let index = 0; index < amount; index++) {
            const sequence = ++me.feedSequence,
                  base     = (sequence * 13) % 101;

            records.push({
                id       : `feed-${String(sequence).padStart(8, '0')}`,
                name     : `runtime.event.${sequence % 17}`,
                status   : sequence % 5 ? 'accepted' : 'observed',
                timestamp: now.toLocaleTimeString('en-GB'),
                value    : base,
                counter  : sequence,
                progress : base,
                trend    : Array.from({length: 10}, (_, point) => (base + point * 9) % 101)
            })
        }

        store.add(records);
        me.feedBatchCount++;

        if (store.count > store.maxRecords) {
            store.splice(store.maxRecords, store.count - store.maxRecords)
        }

        me.updateStatusBar();

        return store.count
    }

    /**
     * @returns {Object} Tour/status toolbar config.
     */
    createStatusBar() {
        return {
            cls      : ['workstation-statusbar'],
            flex     : 'none',
            html     : '',
            ntype    : 'component',
            reference: 'status-bar'
        }
    }

    /**
     * @returns {Object} Tour toolbar config.
     */
    createTourBar() {
        let me      = this,
            isLight = me.theme === 'neo-theme-neo-light';

        return {
            cls   : ['workstation-tourbar'],
            flex  : 'none',
            layout: {ntype: 'hbox', align: 'center'},
            ntype : 'toolbar',
            // The boot containment chain asserts tourbar→statusbar→dock-host adjacency
            // via component-id rects — the bar needs a stable reference to be one of them.
            reference: 'tour-bar',
            items    : [{
                cls      : ['workstation-tour-play'],
                handler  : () => me.startTour(),
                iconCls  : 'fa fa-play',
                ntype    : 'button',
                reference: 'tour-play',
                text     : 'Start dense tour'
            }, {
                module: Container,
                cls   : ['workstation-tour-story'],
                flex  : 1,
                items : [{
                    cls      : ['workstation-tour-caption'],
                    flex     : 'none',
                    html     : `${workstationTourScript.title} — twenty panes, 100k rows, a 10/sec feed, real overflow, and two themes.`,
                    ntype    : 'component',
                    reference: 'tour-caption'
                }, {
                    cls      : ['workstation-tour-pips'],
                    flex     : 'none',
                    ntype    : 'component',
                    reference: 'tour-pips',
                    vdom     : {cn: Workspace.totalBeats().map(() => ({cls: ['workstation-pip']}))}
                }],
                layout: {ntype: 'vbox', align: 'stretch', pack: 'center'}
            }, {
                cls      : ['workstation-theme-button'],
                handler  : data => me.toggleWorkspaceTheme(data),
                iconCls  : isLight ? 'fa fa-moon' : 'fa fa-sun',
                ntype    : 'button',
                reference: 'theme-toggle',
                text     : isLight ? 'Dark mode' : 'Light mode'
            }]
        }
    }

    /**
     * Executes a surface cue for the visual take. Spec-mode correctness waits on explicit
     * E2E oracles because TourRunner intentionally does not await event listeners.
     * @param {Object} cue
     * @returns {Promise<*>}
     */
    async executeCue(cue) {
        switch (cue.type) {
            case 'overflow':
                return this.navigateOverflowMenu(cue.itemId)
            case 'scroll':
                return this.scrollScaleGrid(cue.index)
            case 'canvas-update':
                await this.refreshPromise;
                return this.pulseScaleSparkline()
            case 'cross-zone-showcase':
                return this.executeCrossZoneShowcaseStep(cue, cue.options)
            case 'theme':
                return this.setWorkspaceTheme(cue.theme)
            default:
                return false
        }
    }

    /**
     * The current projection shell's instance id — the discriminator between the reconciler's
     * stable-topology fast path (shell retained) and the staged full path (shell replaced).
     * Pane instances AND their DOM survive either path; only the shell identity flips.
     * @returns {String|null}
     */
    getShellIdentity() {
        return this.getReference('dock-host')?.items?.[0]?.id ?? null
    }

    /**
     * Returns one cached pane identity for Neural Link continuity receipts.
     * @param {String} itemId
     * @returns {String|null}
     */
    getPaneIdentity(itemId) {
        let me   = this,
            pane = me.paneCache[itemId],
            item = me.dockModel.items[itemId];

        if (pane && !pane.isDestroyed) return pane.id;

        if (!item) {
            for (const state of me.vesselWorkspaces.values()) {
                item = state.document?.items?.[itemId];

                if (item) break
            }
        }

        return item ? me.resolvePane(itemId, item).id : null
    }

    /**
     * Returns the last fully settled visible-tour receipt.
     * @returns {Object|null}
     */
    getTourReceipt() {
        return this.lastTourReceipt
    }

    /**
     * Opens the real overflow control, briefly shows its menu, then invokes the first menu
     * item's ordinary activeIndex handler. The E2E clicks this same surface as a human.
     * @param {String} itemId Narrated target id (used for the caption/evidence contract).
     * @returns {Promise<Boolean>}
     */
    async navigateOverflowMenu(itemId) {
        // The reducer schedules projection asynchronously. Resolve the consumer only after that transaction,
        // otherwise `down()` can capture the retiring source toolbar and wait on its deliberately hidden control.
        await this.refreshPromise;

        let tabs   = this.down({dockNodeId: 'heavy-tabs'}),
            plugin = tabs?.getTabBar()?.getPlugin('tab-overflow'),
            control;

        // The hidden staging transaction already captured natural widths. This consumer boundary only
        // refreshes the visible extent so the cue never turns a stable cache into a second measurement pass.
        await plugin?.project(false);
        control = await this.waitForOverflowMenu(plugin);

        if (!control) return false;

        await control.toggleMenu();
        await this.timeout(700);

        const
            menuItems = control.menuList?.items || [],
            item      = menuItems.find(entry => entry.text === this.dockModel.items[itemId]?.title);

        item?.handler?.();
        control.menuList && (control.menuList.hidden = true);

        return item ? {activatedItemId: itemId, menuItemCount: menuItems.length} : false
    }

    /**
     * @param {Object} data
     */
    onTourBeat(data) {
        let me            = this,
            cueSettlement = Promise.resolve();

        data.caption && me.setTourCaption(data.caption);

        if (data.cue) {
            const cue = data.cue;

            me.cuePromise = me.cuePromise.then(async () => {
                const receipt = await me.executeCue(cue);

                if (!receipt) {
                    throw new Error(`${cue.type} returned no observable receipt`)
                }

                me.cueReceipts.push({cue: {...cue}, receipt});

                // Settlement is the cue's EFFECT, not its promise: executors report `errors`
                // and `applied` (a cancel terminal settles legitimately un-applied). The
                // receipt stays pushed either way, so a failure carries its own forensics.
                if (receipt.errors?.length) {
                    throw new Error(receipt.errors.join('; '))
                }

                if (receipt.applied === false && !receipt.cancelled) {
                    throw new Error('terminal effect did not apply')
                }

                return receipt
            }).catch(error => {
                const message = `${cue.type}: ${error.message}`;

                me.cueErrors.push(message);
                me.setTourCaption(`Surface cue failed: ${message}`);

                return false
            });
            cueSettlement = me.cuePromise
        }

        me.cueSettlements.set(`${data.sceneIndex}:${data.stepIndex}`, cueSettlement)
    }

    /**
     * Settles the hosting surface for one runner step before the next screenplay beat may begin.
     * @summary Prevents a following document operation from re-projecting the dock while the
     * current surface cue still owns a live gesture, dwell, or paint boundary.
     * @param {Object} data `TourRunner` settlement payload.
     * @returns {Promise<void>}
     */
    async settleTourStep(data) {
        let me            = this,
            key           = `${data.sceneIndex}:${data.stepIndex}`,
            cueSettlement = me.cueSettlements.get(key) || Promise.resolve();

        await cueSettlement;
        await me.refreshPromise
    }

    /**
     * Projects one successful runner step after the injected host barrier has settled its cue and
     * dock refresh. The listener remains observational: it serializes the independent pip paint
     * without making event delivery an execution boundary for `TourRunner`.
     * @param {Object} data `TourRunner.stepSettled` payload.
     */
    onTourStepSettled(data) {
        let me            = this,
            key           = `${data.sceneIndex}:${data.stepIndex}`,
            cueSettlement = me.cueSettlements.get(key) || Promise.resolve();

        me.cueSettlements.delete(key);
        me.progressPromise = me.progressPromise.then(async () => {
            await cueSettlement;
            await me.refreshPromise;
            await me.setPipProgress(data.completedCount);
            // Adjacent document operations can settle within one browser frame. Keep each
            // evidenced state visible long enough to read instead of letting VDOM paints coalesce.
            await me.timeout(90)
        })
    }

    /**
     * @param {Object} data
     */
    onTourComplete(data) {
        this.setTourCaption(`WorkspaceDocument playback complete — settling ${data.log.length} deterministic beats and surface cues.`)
    }

    /**
     * @param {Object} data
     */
    onTourError(data) {
        this.cueSettlements.clear();
        this.setTourCaption(`Tour stopped: ${data.errors[0] || 'unknown reason'}`)
    }

    /**
     * @param {Object} data
     */
    onTourScene(data) {
        this.setTourCaption(`${data.title}${data.caption ? ' — ' + data.caption : ''}`)
    }

    /**
     * @summary Retries an exact retained vessel retirement before admitting a successor tear-out.
     *
     * A strict close refusal keeps both lifecycle owners so recovery remains possible. The next
     * boundary exit must retire that generation and clear its park owner before opening another
     * popup; a second refusal ends the newly armed window drag instead of leaving it wedged.
     * @param {Object} data
     * @returns {Promise<Boolean>}
     * @protected
     */
    async onDockTearOutExit(data) {
        let me     = this,
            active = me.tearOutHandlers.activeVessel;

        if (active) {
            const retired = await me.tearOutHandlers.retireActiveVessel(active);

            if (!retired) {
                data.sortZone?.endWindowDrag();
                return false
            }

            me.vesselParkHandlers.onVesselRetired({itemId: active.itemId, retirement: true})
        }

        await me.tearOutHandlers.onDockTearOutExit(data);

        return true
    }

    /**
     * @summary Routes header-action pop-out through Workstation's augmented exit policy.
     * @param {Object} data
     * @returns {Promise<Boolean>}
     * @protected
     */
    admitDockPopOut(data) {
        return this.onDockTearOutExit(data)
    }

    /**
     * @summary Publishes this workspace's own document as the `main` participant of its Group.
     *
     * Membership is the Group's, and a workspace has a Group only once its window's binding is
     * accepted — which its app did at registration, before any view of that window constructed, unless
     * a first boot is still awaiting its carrier; {@link #afterSetTopologyGroupId} registers it then.
     * An instance created headless has no window yet and joins nothing; {@link #afterSetWindowId}
     * registers it the moment a container supplies its first real window id.
     * @returns {Boolean} Whether the participant is registered.
     * @protected
     */
    registerMainWorkspace() {
        let me = this;

        return me.workspaceSet.register(Workspace.MAIN_WORKSPACE_ID, {
            getDocument: () => me.dockModel,
            setDocument: document => me.dockModel = document
        })
    }

    /**
     * A headless instance joins its Group when a real render target arrives (see
     * {@link #registerMainWorkspace}); the engine's geometry binding runs on the same signal.
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetWindowId(value, oldValue) {
        super.afterSetWindowId(value, oldValue);

        let me = this;

        value && me.workspaceSet && !me.workspaceSet.has(Workspace.MAIN_WORKSPACE_ID) && me.registerMainWorkspace()
    }

    /**
     * The Group arrived after construction — a first boot's minted identity, accepted by its carrier —
     * so the main participant registers now (see {@link #registerMainWorkspace}).
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetTopologyGroupId(value, oldValue) {
        super.afterSetTopologyGroupId(value, oldValue);

        let me = this;

        value && me.workspaceSet && !me.workspaceSet.has(Workspace.MAIN_WORKSPACE_ID) && me.registerMainWorkspace()
    }

    /**
     * The workstation's full multi-window projection surface: cross-window participation, the
     * tear-out and vessel-conversion opt-ins with their handler seams, the drag-affordance
     * layer's cross-zone seams, and the stable workspace identity. The class threads the reducer,
     * the view-sync and the resolvers onto every projection; this hook contributes everything
     * that is genuinely this host's.
     * @returns {Object}
     */
    getDockProjectionOptions() {
        let me = this;

        return {
            // The engine's tear-out opt-in and its gesture handler bundle come first; this host wraps
            // one of them (the exit, with its park retirement) and adds the flagship's own surfaces.
            ...super.getDockProjectionOptions(),
            // Dense Workstation panes need more than the engine's compact 25% reveal floor. The
            // committed edge extent still wins whenever it is larger.
            defaultRevealFraction      : 0.35,
            // Cross-window participation (§2.3): every projected tab zone registers as a
            // coordinator-visible drag source under one sort group; the workspace id rides the
            // payload for the receiving window's `transferItem` resolution.
            crossWindowSortGroup        : Workspace.CROSS_WINDOW_SORT_GROUP,
            // Tear-out boundary (§2.8): every tab zone shares the Workstation root as its physical
            // window boundary. Exiting a source toolbar remains ordinary cross-zone motion; only
            // leaving this app/window root enters the vessel outcome machine.
            dockTearOutBoundaryContainerId: me.id,
            // Vessel conversion (the multi-window amendment): popup-over-vessel converts to a
            // proxy over the target while the park keeps the real vessel alive — the projection
            // threads the opt-in; this host owns every platform effect.
            enableVesselConversion   : true,
            onDockCrossZoneDragCancel: data => me.dragAffordances.onDragCancel(data),
            onDockCrossZoneDragMove  : data => me.dragAffordances.onDragMove(data),
            onDockCrossZoneDrop      : data => me.dragAffordances.onDrop(data),
            onDockTearOutExit        : data => me.onDockTearOutExit(data),
            onDockVesselConversionIn : data => {
                let targetWorkspaceId = data.targetId,
                    targetState       = me.vesselWorkspaces.get(targetWorkspaceId);

                // The coordinator speaks stable claim identity. Platform effects speak runtime
                // window identity. Resolve the former through the app-owned workspace registry;
                // never reinterpret `workstation-vessel:<item>` as a manager.Window id.
                me.vesselConversionTargetWindowId = targetWorkspaceId === Workspace.MAIN_WORKSPACE_ID
                    ? me.windowId
                    : targetState?.windowId ?? null;

                return me.vesselParkHandlers.onConversionIn({
                    itemId    : data.itemId,
                    sourceRect: data.record?.sourceRect ?? null,
                    windowName: me.resolveTearOutVessel(data.itemId)?.windowName
                })
            },
            onDockVesselConversionOut: data => {
                // The live pane is nested source-main → popup → target-proxy. Restore the INNER
                // target-proxy reservation first; only then may the park owner re-show the exact
                // popup. Reversing this order produces a visible empty source vessel.
                if (
                    me.vesselProxyEmbodiment.isStaged(data.itemId) &&
                    !me.vesselProxyEmbodiment.restore({itemId: data.itemId})
                ) {
                    return false
                }

                return me.vesselParkHandlers.onConversionOut({
                    rect: data.logicalRect ?? data.record?.sourceRect ?? null
                })
            },
            onDockVesselConversionTerminal   : data => me.vesselParkHandlers.onGestureTerminal(data),
            onDockVesselConversionRetired    : data => me.vesselParkHandlers.onVesselRetired(data),
            resolveVesselConversionSourceRect: data => me.resolveVesselConversionSourceRect(data),
            workspaceId                      : Workspace.MAIN_WORKSPACE_ID
        }
    }

    /**
     * Creates one target-side adapter over a stable workspace identity. manager.Window remains the
     * topology/hit-test authority; the app measures exact target-node geometry transiently for the
     * preview renderer and never persists it.
     * @param {Object} data
     * @param {String|Number} data.windowId
     * @param {String} data.workspaceId
     * @returns {Promise<Neo.dashboard.dock.window.Participation|null>}
     * @protected
     */
    async createCrossWindowParticipation({windowId, workspaceId}) {
        let me            = this,
            isMain        = workspaceId === Workspace.MAIN_WORKSPACE_ID,
            Participation = (await import('../../../src/dashboard/dock/window/Participation.mjs')).default;

        if (me.isDestroyed) return null;

        return Neo.create(Participation, {
            clearPreview      : () => me.clearCrossWindowPreview(workspaceId),
            commitLocal       : operation => me.commitLocalWorkspaceOperation(workspaceId, operation),
            commitTransfer    : data => me.commitCrossWindowTransfer(data),
            getDocument       : () => me.getWorkspaceDocument(workspaceId),
            getForeignDocument: sourceWorkspaceId => me.getWorkspaceDocument(sourceWorkspaceId),
            hitTest           : (localX, localY) => me.hitTestCrossWindowTarget(workspaceId, localX, localY),
            previewFor        : data => {
                // Feed the local affordance tier from the remote hover frame: the indicator
                // menu's only population path is this pipeline (its zone hit-test and the
                // activeCandidate the gesture-ready contract reads), and the sort-zone event
                // chain only fires for same-window drags. The promise is deliberately
                // fire-and-forget (caught) — the readiness poll tolerates the async warm-up
                // and a rejected measurement must never stall the gesture it annotates.
                if (isMain) {
                    // writeRenderer: false — the semantic path (renderCrossWindowPreview)
                    // owns this renderer for cross-window gestures and paints it
                    // synchronously (incl. the stored-home fallback); this feed exists to
                    // populate the indicator tier, and an async write here would race it.
                    Promise.resolve(me.dragAffordances?.onDragMove({
                        clientX      : data?.localX,
                        clientY      : data?.localY,
                        groupNodeId  : data?.draggedItem?.dockGroupNodeId ?? null,
                        itemId       : data?.draggedItem?.dockItemId,
                        sourceNodeId : data?.draggedItem?.dockSourceNodeId ?? data?.sourceNodeId,
                        writeRenderer: false
                    })).catch(() => {});
                }

                return me.renderCrossWindowPreview(workspaceId, data)
            },
            previewToOperation,
            promoteDragEmbodiment: data => me.vesselProxyEmbodiment.promote({
                itemId        : data.draggedItem?.dockItemId,
                targetWindowId: windowId
            }),
            resolveNativeWindowDrag: isMain ? movingWindowId => me.resolveNativeTearOutDrag(movingWindowId) : null,
            // Docking design record §2.3: every window of this root declares the root's Group as its commit authority.
            resolveOwnershipId   : () => me.resolveTopologyGroup() ?? null,
            restoreDragEmbodiment: data => me.vesselProxyEmbodiment.restore({
                itemId        : data.draggedItem?.dockItemId,
                targetWindowId: windowId
            }),
            resumeNativeWindowDrag: isMain ? itemId => me.nativeVesselParkHandlers.onGestureTerminal({
                itemId,
                outcome: 'rejected'
            }) : null,
            retireNativeWindowDrag: isMain ? draggedItem => me.nativeVesselParkHandlers.onGestureTerminal({
                itemId : draggedItem?.dockItemId,
                outcome: 'committed'
            }) : null,
            sortGroup          : Workspace.CROSS_WINDOW_SORT_GROUP,
            stageDragEmbodiment: data => me.vesselProxyEmbodiment.move({
                ...data,
                sourceWindowId: me.resolveTearOutVessel(data.draggedItem?.dockItemId)?.windowId,
                targetWindowId: windowId
            }),
            awaitDragEmbodiment: async data => {
                const
                    itemId   = data.draggedItem?.dockItemId,
                    renderer = isMain
                        ? me.dragAffordances?.preview
                        : me.vesselWorkspaces.get(workspaceId)?.preview;

                if (!renderer?.dockPreview) return false;

                const [embodied] = await Promise.all([
                    me.vesselProxyEmbodiment.whenSettled({
                        itemId,
                        sourceWindowId: me.resolveTearOutVessel(itemId)?.windowId,
                        targetWindowId: windowId
                    }),
                    renderer.promiseUpdate?.()
                ]);

                return embodied === true && Boolean(renderer.dockPreview)
            },
            suspendNativeWindowDrag: isMain ? (itemId, data) => {
                me.vesselConversionTargetWindowId = data?.targetWindowId ?? null;

                return me.nativeVesselParkHandlers.onConversionIn({
                    itemId,
                    sourceRect: me.resolveVesselConversionSourceRect({itemId}),
                    windowName: me.resolveTearOutVessel(itemId)?.windowName
                })
            } : null,
            windowId,
            workspaceId
        })
    }

    /**
     * @summary Resolves one dropped bare Workstation popup into its exact live native drag record.
     *
     * The root workspace owns both registries, so native source discovery remains independent of
     * whichever dock tab zone last occupied a window's coordinator slot. Whole-stack vessels,
     * disconnected topology, and panes no longer catalogued as detached all fail closed.
     * @param {String|Number} windowId The physical moving popup window.
     * @returns {Object|null}
     * @protected
     */
    resolveNativeTearOutDrag(windowId) {
        let me = this;

        for (const [itemId, entry] of Object.entries(me.tearOutPanes)) {
            const
                workspaceId = Workspace.vesselWorkspaceId(itemId),
                state       = me.vesselWorkspaces.get(workspaceId),
                pane        = me.paneCache[itemId],
                vesselItems = Object.keys(state?.document?.items || {});

            if (
                entry?.windowId !== windowId ||
                state?.windowId !== windowId ||
                state.committed ||
                state.closeRequested ||
                state.disconnected ||
                state.app?.mainView?.isDestroyed ||
                vesselItems.length > 0 ||
                !pane ||
                pane.isDestroyed ||
                !me.dockModel?.items?.[itemId] ||
                WorkspaceDocument.findContainingTabsId(me.dockModel, itemId)
            ) {
                continue
            }

            delete pane.dockGroupNodeId;
            pane.dockItemId            = itemId;
            pane.dockSourceOwnershipId = me.resolveTopologyGroup() ?? null;
            pane.dockSourceWorkspaceId = Workspace.MAIN_WORKSPACE_ID;

            return {
                draggedItem      : pane,
                embodyNativeHover: true,
                sourceWindowId   : windowId,
                widgetName       : itemId
            }
        }

        return null
    }

    /**
     * Re-registers one stable participation after its render projection. Dock tab zones and the
     * stable workspace target share a per-window coordinator slot, so the stable target must win
     * the final registration write after every projection.
     * @param {String} workspaceId
     * @returns {Promise<Neo.dashboard.dock.window.Participation|null>}
     * @protected
     */
    async refreshCrossWindowParticipation(workspaceId) {
        let me       = this,
            isMain   = workspaceId === Workspace.MAIN_WORKSPACE_ID,
            state    = isMain ? null : me.vesselWorkspaces.get(workspaceId),
            windowId = isMain ? me.windowId : state?.windowId;

        if (windowId == null || (!isMain && !state)) return null;

        me.crossWindowParticipations.get(workspaceId)?.destroy();
        me.crossWindowParticipations.delete(workspaceId);
        me.crossWindowPreviewGeometries.delete(workspaceId);
        state && (state.participation = null);

        const participation = await me.createCrossWindowParticipation({windowId, workspaceId});

        if (
            !participation ||
            me.isDestroyed ||
            (!isMain && (
                me.vesselWorkspaces.get(workspaceId) !== state ||
                state.app?.mainView?.isDestroyed
            ))
        ) {
            participation?.destroy();
            return null
        }

        me.crossWindowParticipations.set(workspaceId, participation);
        state && (state.participation = participation);

        return participation
    }

    /**
     * Registers a connected bare-pane vessel as a stable remote target. Its document accessor stays
     * lazy: hover creates no workspace state; the first accepted drop seeds it.
     * @param {Object} data
     * @param {Neo.app.Base} data.app
     * @param {String} data.itemId
     * @param {String|Number} data.windowId
     * @returns {Promise<Object|null>}
     * @protected
     */
    async registerVesselWorkspaceTarget({app, itemId, windowId}) {
        let me          = this,
            workspaceId = Workspace.vesselWorkspaceId(itemId),
            current     = workspaceId && me.vesselWorkspaces.get(workspaceId);

        if (!workspaceId || !app?.mainView || !me.tearOutPanes[itemId]) return null;
        if (current?.windowId === windowId) {
            if (current.participationPromise) {
                await current.participationPromise
            } else if (!current.participation && !current.committed && !current.closeRequested) {
                current.participationPromise = me.refreshCrossWindowParticipation(workspaceId);
                await current.participationPromise;
                current.participationPromise = null
            }

            return me.vesselWorkspaces.get(workspaceId) === current ? current : null
        }
        if (current?.committed) return null;

        current && me.retireVesselWorkspaceTarget(itemId);

        const state = {
            app,
            closeRequested      : false,
            committed           : false,
            disconnected        : false,
            document            : null,
            host                : null,
            indicators          : null,
            itemId,
            participation       : null,
            participationPromise: null,
            preview             : null,
            reconciling         : false,
            windowId,
            workspaceId
        };

        me.vesselWorkspaces.set(workspaceId, state);

        app.mainView.addCls('workstation-vessel-target');
        state.preview    = app.mainView.add({module: DockPreview});
        state.indicators = app.mainView.add({module: DockDropIndicators});

        await app.mainView.promiseUpdate();
        state.participationPromise = me.refreshCrossWindowParticipation(workspaceId);
        await state.participationPromise;
        state.participationPromise = null;

        return me.vesselWorkspaces.get(workspaceId) === state ? state : null
    }

    /**
     * Retires one vessel target's registry and arbitration identities. Window destruction owns the
     * rendered subtree; this method only destroys live refs when the render target still exists.
     * @param {String} itemId
     * @returns {Boolean}
     * @protected
     */
    retireVesselWorkspaceTarget(itemId) {
        let me          = this,
            workspaceId = Workspace.vesselWorkspaceId(itemId),
            state       = workspaceId && me.vesselWorkspaces.get(workspaceId);

        if (!state) return false;

        state.participation?.destroy();
        me.crossWindowParticipations.delete(workspaceId);
        state.committed && me.workspaceSet.unregister(workspaceId);

        me.crossWindowPreviewGeometries.delete(workspaceId);
        me.vesselWorkspaces.delete(workspaceId);

        return true
    }

    /**
     * Resolves a workspace's current document. A vessel creates an unregistered provisional
     * landing document only when a transfer first asks for it; registration and hover remain
     * mutation-free.
     * @param {String} workspaceId
     * @returns {Object|null}
     * @protected
     */
    getWorkspaceDocument(workspaceId) {
        if (workspaceId === Workspace.MAIN_WORKSPACE_ID) return this.dockModel;

        let state = this.vesselWorkspaces.get(workspaceId);

        return state ? state.document ??= this.createVesselWorkspaceDocument(state.itemId) : null
    }

    /**
     * Seeds a valid empty landing document. The popup remains a bare pane until the first accepted
     * transfer moves both the detached owner and the dragged pane into this document atomically.
     * @param {String} itemId
     * @returns {Object|null}
     * @protected
     */
    createVesselWorkspaceDocument(itemId) {
        let item       = this.dockModel?.items?.[itemId],
            tabsNodeId = Workspace.vesselTabsNodeId(itemId);

        if (!item || !tabsNodeId) return null;

        return {
            schema: WorkspaceDocument.SCHEMA,
            root  : `workstation-vessel-root:${itemId}`,
            items : {},
            nodes : {
                [`workstation-vessel-root:${itemId}`]: {type: 'edge-zone', zones: {center: {nodeId: tabsNodeId}}},
                [tabsNodeId]                         : {type: 'tabs', items: [], activeItemId: null}
            }
        }
    }

    /**
     * D-013 hit-test: accepts only points inside the live manager.Window inner rect. Exact node
     * measurement belongs exclusively to the render path below and never participates in target
     * arbitration.
     * @param {String} workspaceId
     * @param {Number} localX
     * @param {Number} localY
     * @returns {Boolean}
     * @protected
     */
    hitTestCrossWindowTarget(workspaceId, localX, localY) {
        let me       = this,
            isMain   = workspaceId === Workspace.MAIN_WORKSPACE_ID,
            state    = isMain ? null : me.vesselWorkspaces.get(workspaceId),
            windowId = isMain ? me.windowId : state?.windowId,
            inner    = windowId != null ? Neo.manager?.Window?.get(windowId)?.innerRect : null;

        return Boolean(
            inner && Number.isFinite(localX) && Number.isFinite(localY) &&
            localX >= 0 && localY >= 0 && localX <= inner.width && localY <= inner.height &&
            (isMain || (
                state && !state.committed && !state.closeRequested &&
                me.tearOutPanes[state.itemId]
            ))
        )
    }

    /**
     * Resolves the render host, exact semantic target component, and preview renderer for one
     * VESSEL workspace. A bare vessel has no projected tabs component yet, so its main view is the
     * exact landing surface; a projected vessel node resolves by `dockNodeId`. The main workspace
     * does not come through here — it rides the affordance controller's own geometry
     * ({@link #renderMainCrossWindowPreview}).
     * @summary Keeps semantic node identity paired with its actual rendered component.
     * @param {String} workspaceId
     * @param {String} targetNodeId
     * @returns {{host: Neo.component.Base, renderer: Neo.dashboard.dock.interaction.Preview,
     *     target: Neo.component.Base, windowId: (String|Number)}|null}
     * @protected
     */
    resolveCrossWindowPreviewSurface(workspaceId, targetNodeId) {
        let me       = this,
            state    = me.vesselWorkspaces.get(workspaceId),
            windowId = state?.windowId,
            host     = state?.host ?? state?.app?.mainView,
            target   = state && !state.host ? host : host?.down({dockNodeId: targetNodeId}),
            renderer = state?.preview;

        return windowId != null && host && target && renderer &&
            typeof host.getDomRect === 'function' && !host.isDestroyed && !target.isDestroyed
            ? {host, renderer, target, windowId}
            : null
    }

    /**
     * Measures one exact target component and translates it once into its preview overlay host.
     * The promise itself is memoized so a move stream cannot stack DOM reads; entry identity makes
     * late results inert after leave, projection, resize, target replacement, or teardown.
     * @summary Warms a fail-closed, runtime-only exact-node geometry generation.
     * @param {String} workspaceId
     * @param {String} targetNodeId
     * @returns {Promise<Object|null>}
     * @protected
     */
    ensureCrossWindowPreviewGeometry(workspaceId, targetNodeId) {
        let me      = this,
            surface = me.resolveCrossWindowPreviewSurface(workspaceId, targetNodeId),
            inner   = surface && Neo.manager?.Window?.get(surface.windowId)?.innerRect;

        if (!surface || !inner) {
            me.crossWindowPreviewGeometries.delete(workspaceId);
            return Promise.resolve(null)
        }

        const
            signature = [inner.x ?? 0, inner.y ?? 0, inner.width, inner.height].join(':'),
            current   = me.crossWindowPreviewGeometries.get(workspaceId);

        if (
            current?.host === surface.host &&
            current?.target === surface.target &&
            current?.targetNodeId === targetNodeId &&
            current?.windowSignature === signature
        ) {
            return current.promise
        }

        const entry = {
            geometry       : null,
            host           : surface.host,
            promise        : null,
            target         : surface.target,
            targetNodeId,
            windowSignature: signature
        };

        entry.promise = surface.host
            .getDomRect([surface.host.id, surface.target.id], surface.windowId)
            .then(([hostRect, targetRect]) => {
                if (
                    me.isDestroyed ||
                    me.crossWindowPreviewGeometries.get(workspaceId) !== entry ||
                    surface.host.isDestroyed ||
                    surface.target.isDestroyed
                ) {
                    return null
                }

                if (
                    !hostRect || !targetRect ||
                    hostRect.width <= 0 || hostRect.height <= 0 ||
                    targetRect.width <= 0 || targetRect.height <= 0
                ) {
                    me.crossWindowPreviewGeometries.delete(workspaceId);
                    return null
                }

                return entry.geometry = {
                    ...surface,
                    hostRect,
                    localTargetRect: me.dragAffordances.localRect(targetRect, hostRect),
                    targetNodeId,
                    targetRect
                }
            })
            .catch(() => {
                me.crossWindowPreviewGeometries.get(workspaceId) === entry &&
                    me.crossWindowPreviewGeometries.delete(workspaceId);

                return null
            });

        me.crossWindowPreviewGeometries.set(workspaceId, entry);

        return entry.promise
    }

    /**
     * Computes and renders one remote preview. The main workspace resolves it the way an in-window
     * gesture does ({@link #renderMainCrossWindowPreview}); a vessel uses its stable lazy landing
     * surface from an exact live measurement. A missing or in-flight measurement hides the preview
     * for that frame.
     * @param {String} workspaceId
     * @param {Object} data
     * @returns {Object|null}
     * @protected
     */
    renderCrossWindowPreview(workspaceId, data) {
        let me              = this,
            isMain          = workspaceId === Workspace.MAIN_WORKSPACE_ID,
            state           = isMain ? null : me.vesselWorkspaces.get(workspaceId),
            draggedItem     = data?.draggedItem,
            itemId          = draggedItem?.dockItemId,
            groupNodeId     = draggedItem?.dockGroupNodeId ?? null,
            sourceWorkspace = draggedItem?.dockSourceWorkspaceId,
            sourceState     = me.vesselWorkspaces.get(sourceWorkspace),
            sourceItemId    = sourceWorkspace === Workspace.MAIN_WORKSPACE_ID
                ? itemId
                : sourceState?.itemId,
            storedHome      = sourceItemId && me.tearOutPlacements[sourceItemId]?.tabsNodeId,
            targetNodeId    = isMain
                ? (me.dockModel.nodes?.[storedHome]?.type === 'tabs'
                    ? storedHome
                    : Object.entries(me.dockModel.nodes || {}).find(([, node]) => node.type === 'tabs')?.[0])
                : Workspace.vesselTabsNodeId(state?.itemId),
            pointer         = {x: data?.localX, y: data?.localY},
            renderer        = isMain ? me.dragAffordances?.preview : state?.preview,
            indicators      = state?.indicators,
            producer        = me.dragAffordances.producer,
            sourceNodeId    = data?.sourceNodeId,
            preview;

        // A native-titlebar hover carries the coordinator's dwell clock; the renderer paints the hold
        // from it. Set before any preview write below, so the affordance is built with it.
        renderer && (renderer.dwell = data?.dwell ?? null);

        if (
            !itemId || !targetNodeId || state?.committed || state?.closeRequested ||
            !me.hitTestCrossWindowTarget(workspaceId, pointer.x, pointer.y)
        ) {
            renderer && (renderer.dockPreview = null);
            indicators?.clear();
            return null
        }

        if (isMain) {
            return me.renderMainCrossWindowPreview({groupNodeId, itemId, pointer, renderer, sourceNodeId, targetNodeId})
        }

        me.ensureCrossWindowPreviewGeometry(workspaceId, targetNodeId);

        const geometry = me.crossWindowPreviewGeometries.get(workspaceId)?.geometry;

        if (!geometry) {
            renderer && (renderer.dockPreview = null);
            indicators?.clear();

            return null
        }

        const zone = {nodeId: targetNodeId, rect: geometry.targetRect};

        if (indicators) {
            indicators.hostRect = geometry.hostRect;
            indicators.candidateSet = producer.produceCandidates({
                containerId: geometry.host.id,
                groupNodeId,
                itemId,
                pointer,
                root       : zone,
                sourceNodeId,
                zones      : [zone]
            });
            preview = indicators.updatePointer(pointer)?.preview ?? null
        }

        // A vessel has one landing surface — the pane joins its stack — so the pointer-inference
        // preview binds the zone's centre (the whole-zone tab-into) wherever inside the vessel the
        // pointer is; only a hovered indicator chip above selects anything else.
        preview ??= producer.produce({
            containerId: geometry.host.id,
            groupNodeId,
            itemId,
            pointer    : {
                x: geometry.targetRect.x + geometry.targetRect.width  / 2,
                y: geometry.targetRect.y + geometry.targetRect.height / 2
            },
            sourceNodeId,
            zones      : [zone]
        });

        if (geometry.renderer) {
            geometry.renderer.dwell       = data?.dwell ?? null;
            geometry.renderer.dockPreview = preview;
            preview && geometry.renderer.applyTargetGeometry(geometry.localTargetRect)
        }

        return preview
    }

    /**
     * The main workspace's remote frame: the SAME once-per-gesture geometry and tier order the
     * in-window gesture uses ({@link Neo.dashboard.dock.interaction.DragAffordances#resolvePreview} —
     * every projected tabs zone, an indicator candidate first, pointer inference second), so a
     * popup or remote pointer reads the full placement grammar wherever it points and the drop
     * lands there. The measurement is warmed here and read synchronously — a frame before it
     * settles hides the preview rather than guessing — and re-measured when the main window's
     * rect changes mid-gesture, which a remote gesture can outlive and a pointer drag cannot.
     * @param {Object} data
     * @param {String|null} data.groupNodeId
     * @param {String} data.itemId
     * @param {Object} data.pointer {x, y} in main-window client space
     * @param {Neo.dashboard.dock.interaction.Preview|null} data.renderer
     * @param {String} [data.sourceNodeId]
     * @param {String} data.targetNodeId the stored-home tabs node — the off-zone fallback target
     * @returns {Object|null}
     * @protected
     */
    renderMainCrossWindowPreview({groupNodeId, itemId, pointer, renderer, sourceNodeId, targetNodeId}) {
        let me          = this,
            affordances = me.dragAffordances,
            inner       = Neo.manager?.Window?.get(me.windowId)?.innerRect,
            signature   = inner ? [inner.x ?? 0, inner.y ?? 0, inner.width, inner.height].join(':') : null,
            preview, targetRect;

        if (me.mainPreviewWindowSignature && me.mainPreviewWindowSignature !== signature) {
            affordances.invalidateGeometry()
        }

        me.mainPreviewWindowSignature = signature;
        affordances.ensureGeometry();

        const {geometry} = affordances;

        if (!geometry) {
            renderer && (renderer.dockPreview = null);
            return null
        }

        preview = affordances.resolvePreview({groupNodeId, itemId, pointer, sourceNodeId});

        // Stored-home acquisition fallback: the window hit-test already admitted the gesture, so a
        // pointer inside the window but outside every zone still acquires the stored-home target —
        // the preview (and its painting) binds that exact node rect, never the pointer's empty
        // position. On-zone positions keep the full placement grammar resolved above.
        if (!preview) {
            const home = geometry.zones.find(zone => zone.nodeId === targetNodeId);

            preview = home ? affordances.producer.produce({
                groupNodeId,
                itemId,
                pointer: {x: home.rect.x + home.rect.width / 2, y: home.rect.y + home.rect.height / 2},
                sourceNodeId,
                zones  : [home]
            }) : null
        }

        targetRect = affordances.previewTargetRect(preview);

        if (renderer) {
            renderer.dockPreview = preview;
            preview && targetRect && renderer.applyTargetGeometry(affordances.localRect(targetRect, geometry.hostRect))
        }

        return preview
    }

    /**
     * Clears one target's transient preview without touching committed workspace state.
     * @param {String} workspaceId
     * @protected
     */
    clearCrossWindowPreview(workspaceId) {
        this.crossWindowPreviewGeometries.delete(workspaceId);

        if (workspaceId === Workspace.MAIN_WORKSPACE_ID) {
            this.mainPreviewWindowSignature = null;
            this.dragAffordances?.clear()
        } else {
            let state   = this.vesselWorkspaces.get(workspaceId),
                preview = state?.preview;

            preview && (preview.dockPreview = null);
            state?.indicators?.clear();
            state && !state.committed && (state.document = null)
        }
    }

    /**
     * Applies an ordinary same-workspace operation through the matching owner.
     * @param {String} workspaceId
     * @param {Object} descriptor
     * @returns {{document:Object,errors:String[]}|null}
     * @protected
     */
    commitLocalWorkspaceOperation(workspaceId, descriptor) {
        let me       = this,
            state    = me.vesselWorkspaces.get(workspaceId),
            document = workspaceId === Workspace.MAIN_WORKSPACE_ID || state?.committed
                ? me.getWorkspaceDocument(workspaceId)
                : null,
            result   = document && Operations.applyOperation(document, descriptor);

        if (!result || result.errors.length) return result;

        if (workspaceId === Workspace.MAIN_WORKSPACE_ID) {
            me.onDockZoneDocumentChange(result.document)
        } else {
            me.vesselWorkspaces.get(workspaceId).document = result.document
        }

        return result
    }

    /**
     * Publishes one executor-validated document pair synchronously, then queues target-first render
     * reconciliation. First dock-into composes the incoming pane transfer with a second pure
     * transfer of the already-detached vessel owner, then adopts the final pair exactly once.
     * @param {Object} data
     * @returns {Boolean}
     * @protected
     */
    commitCrossWindowTransfer(data) {
        let me = this,
            {
                descriptor,
                sourceDocument,
                sourceWorkspaceId,
                targetDocument,
                targetWorkspaceId
            } = data || {},
            sourceState  = me.vesselWorkspaces.get(sourceWorkspaceId),
            targetState  = me.vesselWorkspaces.get(targetWorkspaceId),
            mainToVessel = sourceWorkspaceId === Workspace.MAIN_WORKSPACE_ID && Boolean(targetState),
            vesselToMain = targetWorkspaceId === Workspace.MAIN_WORKSPACE_ID && Boolean(sourceState),
            registeredTarget = false;

        if (!descriptor || (!mainToVessel && !vesselToMain)) return false;
        if (mainToVessel && (targetState.committed || targetState.reconciling)) return false;
        if (vesselToMain && (!sourceState.committed || !me.workspaceSet.has(sourceWorkspaceId))) return false;

        if (mainToVessel && !targetState.committed) {
            if (descriptor.operation !== 'transferItem' || me.workspaceSet.has(targetWorkspaceId)) return false;

            const ownerTransfer = Operations.transferItem(sourceDocument, targetDocument, {
                itemId: targetState.itemId,
                sourceWorkspaceId,
                targetWorkspaceId,
                target: {
                    operation : 'addTab',
                    tabsNodeId: Workspace.vesselTabsNodeId(targetState.itemId),
                    index     : 0
                }
            });

            if (ownerTransfer.errors.length) {
                targetState.document = null;
                return false
            }

            sourceDocument = ownerTransfer.sourceDocument;
            targetDocument = ownerTransfer.targetDocument;
            registeredTarget = me.workspaceSet.register(targetWorkspaceId, {
                getDocument: () => targetState.document,
                setDocument: document => targetState.document = document
            });

            if (!registeredTarget) {
                targetState.document = null;
                return false
            }
        }

        try {
            if (!me.workspaceSet.adoptTransfer({
                sourceDocument,
                sourceWorkspaceId,
                targetDocument,
                targetWorkspaceId
            })) {
                registeredTarget && me.workspaceSet.unregister(targetWorkspaceId);
                registeredTarget && (targetState.document = null);
                return false
            }
        } catch (error) {
            registeredTarget && me.workspaceSet.unregister(targetWorkspaceId);
            registeredTarget && (targetState.document = null);
            me.lastCrossWindowTransfer = {applied: false, errors: [error.message]};
            return false
        }

        if (registeredTarget) {
            targetState.committed   = true;
            targetState.reconciling = true
        }

        const receipt = me.lastCrossWindowTransfer = {
            applied       : true,
            closeRequested: false,
            descriptor    : WorkspaceDocument.clone(descriptor),
            phases        : ['documents-adopted'],
            reconciled    : false,
            sourceWorkspaceId,
            targetWorkspaceId,
            topologyExited: false
        };

        if (!mainToVessel && sourceState.windowId && sourceState.app?.mainView && !sourceState.app.mainView.isDestroyed) {
            // Presentation only, fire-and-forget: the source vessel's content was just adopted
            // away and its window closes within the second — the departing overlay fades in over
            // the un-projection so the terminal window never presents a raw yank. No phase or
            // ordering change rides this; the close still dispatches through the refresh chain.
            // The class mounts on the vessel's VIEWPORT, never `document.body`: retheming fans to
            // each vessel's mainView while the body keeps its BOOT theme class, so only the
            // viewport resolves the LIVE `--workstation-ground` (see setWorkspaceTheme).
            // The dispatch owns its terminal outcome: a vessel that already closed rejects with
            // bare `undefined` (worker.Base closed-port) — moot presentation, silent settle;
            // reasoned rejections are live-window delta failures and stay visible.
            Neo.applyDeltas(sourceState.windowId, [
                {cls: {add: ['workstation-vessel-departing']}, id: sourceState.app.mainView.id}
            ]).catch(reason => {
                reason !== undefined && console.error('Workspace: departing overlay dispatch failed', {reason})
            })
        }

        me.refreshPromise = (me.refreshPromise || Promise.resolve())
            .then(() => me.timeout(0))
            .then(async () => {
                if (mainToVessel) {
                    if (me.vesselWorkspaces.get(targetWorkspaceId) !== targetState) {
                        throw new Error('vessel target retired before projection')
                    }
                    if (!await me.mountVesselWorkspace(targetWorkspaceId) ||
                        me.vesselWorkspaces.get(targetWorkspaceId) !== targetState) {
                        throw new Error('vessel target projection did not settle')
                    }
                    receipt.phases.push('target-projected');

                    await me.refreshDockWorkspace(null, me.dockModel, {
                        preserveItemIds: Object.keys(targetState.document?.items || {})
                    });
                    receipt.phases.push('main-projected');
                    targetState.reconciling = false
                } else {
                    await me.refreshDockWorkspace(null, me.dockModel, me.getRefreshOptions({operation: descriptor?.operation}));
                    receipt.phases.push('main-projected');

                    if (me.vesselWorkspaces.get(sourceWorkspaceId) === sourceState) {
                        await me.retireReturnedVessel(sourceWorkspaceId)
                    }
                }

                receipt.reconciled = true;
                return receipt
            })
            .catch(error => {
                targetState && (targetState.reconciling = false);
                receipt.errors  = [error.message];
                return receipt
            });

        return true
    }

    /**
     * Replaces a bare vessel pane with its first real dock projection while reusing every cached
     * pane instance. The existing preview overlay moves into the host; no pane is recreated.
     * @param {String} workspaceId
     * @returns {Promise<Boolean>}
     * @protected
     */
    async mountVesselWorkspace(workspaceId) {
        let me       = this,
            state    = me.vesselWorkspaces.get(workspaceId),
            document = state?.document,
            mainView = state?.app?.mainView;

        if (!state || !document || !mainView || mainView.isDestroyed) return false;
        if (state.host && !state.host.isDestroyed) return false;

        Object.keys(document.items || {}).forEach(itemId => {
            let pane = me.paneCache[itemId];

            pane?.parent?.remove(pane, false)
        });
        state.preview?.parent?.remove(state.preview, false);
        state.indicators?.parent?.remove(state.indicators, false);

        state.host = mainView.add({
            module: Container,
            cls   : ['workstation-vessel-dock-host', 'neo-dashboard'],
            flex  : 1,
            items : [
                me.projectVesselDockModel(workspaceId),
                state.preview    || {module: DockPreview},
                state.indicators || {module: DockDropIndicators}
            ],
            layout: {ntype: 'fit'}
        });
        state.preview    ??= state.host.down({ntype: 'dock-preview'});
        state.indicators ??= state.host.down({ntype: 'dashboard-dock-drop-indicators'});

        await state.host.promiseUpdate();
        state.participation?.destroy();
        state.participation = null;
        me.crossWindowParticipations.delete(workspaceId);

        return true
    }

    /**
     * Projects a committed vessel document with one whole-stack drag grip and no nested tear-out.
     * @param {String} workspaceId
     * @returns {Object}
     * @protected
     */
    projectVesselDockModel(workspaceId) {
        let me       = this,
            state    = me.vesselWorkspaces.get(workspaceId),
            document = state?.document;

        return DockLayoutAdapter.project(document, {
            applyDockZoneOperation   : descriptor => me.commitLocalWorkspaceOperation(workspaceId, descriptor),
            crossWindowSortGroup     : Workspace.CROSS_WINDOW_SORT_GROUP,
            enableStackDrag          : true,
            onDockCrossZoneDragCancel: () => me.clearCrossWindowPreview(Workspace.MAIN_WORKSPACE_ID),
            onDockCrossZoneDrop      : () => me.clearCrossWindowPreview(Workspace.MAIN_WORKSPACE_ID),
            onDockStackDragTerminal  : () => me.clearCrossWindowPreview(Workspace.MAIN_WORKSPACE_ID),
            onDockZoneDocumentChange : nextDocument => state.document = nextDocument,
            resolveComponentRef      : (componentRef, item, itemId) => me.resolvePane(itemId, item),
            resolveRevealComponentRef: (componentRef, item, itemId) => me.resolvePane(itemId, item),
            workspaceId
        })
    }

    /**
     * Closes an emptied vessel only after the main target projection has adopted the committed
     * stack. Physical disconnect remains the topology-exit terminal.
     * @param {String} workspaceId
     * @returns {Promise<Boolean>}
     * @protected
     */
    async retireReturnedVessel(workspaceId) {
        let me      = this,
            state   = me.vesselWorkspaces.get(workspaceId),
            vessel  = state && me.resolveTearOutVessel(state.itemId),
            receipt = me.lastCrossWindowTransfer;

        if (!state || Object.keys(state.document?.items || {}).length || !vessel) return false;

        if (
            receipt?.sourceWorkspaceId === workspaceId &&
            receipt.targetWorkspaceId === Workspace.MAIN_WORKSPACE_ID
        ) {
            receipt.phases ??= [];
            receipt.phases.push('close-dispatched')
        }

        // Through the engine's retirement, not the platform seam directly: the fence it holds keeps a
        // late bind for the same item cleanup-only while the close is in flight.
        const closed = await me.retireTearOutVessel(vessel);

        if (closed) {
            state.closeRequested = true;
            state.participation?.destroy();
            state.participation = null;
            me.crossWindowParticipations.delete(workspaceId);

            if (
                me.lastCrossWindowTransfer?.sourceWorkspaceId === workspaceId &&
                me.lastCrossWindowTransfer.targetWorkspaceId === Workspace.MAIN_WORKSPACE_ID
            ) {
                me.lastCrossWindowTransfer.closeRequested = true;
                me.lastCrossWindowTransfer.phases ??= [];
                me.lastCrossWindowTransfer.phases.push('close-acknowledged')
            }
        }

        return closed
    }

    /**
     * Atomically recovers every pane from a committed vessel whose physical window disappeared
     * before an authored whole-stack return. The headless document remains registered if any
     * executor/adoption gate refuses, so the only surviving A+B truth is never discarded.
     * @param {String} itemId
     * @returns {Boolean}
     * @protected
     */
    recoverDisconnectedVesselWorkspace(itemId) {
        let me          = this,
            workspaceId = Workspace.vesselWorkspaceId(itemId),
            state       = workspaceId && me.vesselWorkspaces.get(workspaceId),
            itemIds     = Object.keys(state?.document?.items || {});

        if (!state?.committed || !me.workspaceSet.has(workspaceId)) return false;
        if (!itemIds.length) return true;

        let placement  = me.tearOutPlacements[itemId],
            storedHome = placement && me.dockModel.nodes?.[placement.tabsNodeId]?.type === 'tabs'
                ? placement.tabsNodeId
                : null,
            targetNodeId = storedHome
                || Object.entries(me.dockModel.nodes || {}).find(([, node]) => node.type === 'tabs')?.[0],
            nodeId       = WorkspaceDocument.resolveStackRoot(state.document);

        if (!nodeId || !targetNodeId) {
            me.lastCrossWindowTransfer = {
                applied: false,
                errors : ['disconnected vessel has no recoverable stack or main target']
            };
            return false
        }

        const descriptor = {
                operation        : 'transferNode',
                nodeId,
                sourceWorkspaceId: workspaceId,
                targetWorkspaceId: Workspace.MAIN_WORKSPACE_ID,
                target           : {targetNodeId, placement: {kind: 'tab-into'}}
            },
            result = Operations.transferNode(state.document, me.dockModel, descriptor);

        if (result.errors.length) {
            me.lastCrossWindowTransfer = {applied: false, errors: result.errors};
            return false
        }

        try {
            if (!me.workspaceSet.adoptTransfer({
                sourceDocument   : result.sourceDocument,
                sourceWorkspaceId: workspaceId,
                targetDocument   : result.targetDocument,
                targetWorkspaceId: Workspace.MAIN_WORKSPACE_ID
            })) {
                me.lastCrossWindowTransfer = {
                    applied: false,
                    errors : ['workspace-set refused disconnected-vessel recovery']
                };
                return false
            }
        } catch (error) {
            me.lastCrossWindowTransfer = {applied: false, errors: [error.message]};
            return false
        }

        me.lastCrossWindowTransfer = {
            applied              : true,
            descriptor           : WorkspaceDocument.clone(descriptor),
            recoveredOnDisconnect: true,
            sourceWorkspaceId    : workspaceId,
            targetWorkspaceId    : Workspace.MAIN_WORKSPACE_ID,
            topologyExited       : true
        };
        me.onDockZoneDocumentChange(me.dockModel, {preserveItemIds: itemIds});

        return true
    }

    /**
     * Removes only dead render-target seams while retaining a committed headless document for
     * retry and diagnostics after recovery refused.
     * @param {Object} state
     * @protected
     */
    demoteDisconnectedVesselWorkspace(state) {
        if (!state) return;

        state.participation?.destroy();
        this.crossWindowParticipations.delete(state.workspaceId);
        state.app            = null;
        state.closeRequested = false;
        state.disconnected   = true;
        state.host           = null;
        state.indicators     = null;
        state.participation  = null;
        state.preview        = null;
        state.reconciling    = false;
        state.windowId       = null
    }

    /**
     * Assigns a new trend array to a registered visible scale record and refreshes the
     * viewport pool. Coarse dock projection preserves cached pane identities, while a resized
     * viewport pool can allocate new Canvas cells whose registration settles asynchronously;
     * the bounded wait observes that lifecycle fact instead of guessing with a screenplay delay.
     * @param {String|null} [componentId=null] Optional exact visible Sparkline identity.
     * @returns {Promise<Object|Boolean>}
     */
    async pulseScaleSparkline(componentId=null) {
        let pane = this.paneCache.scale,
            sparkline,
            record;

        for (let attempt = 0; attempt < 40; attempt++) {
            if (componentId) {
                sparkline = Neo.getComponent(componentId)
            } else {
                sparkline = pane?.body?.items.flatMap(row => Object.values(row.components || {}))
                    .find(candidate => candidate.offscreenRegistered && candidate.record)
            }

            record = sparkline?.record;

            if (record && sparkline.offscreenRegistered) break;

            await this.timeout(50)
        }

        if (!record || !sparkline?.offscreenRegistered) return false;

        let signal = record.trend.at(-1) ?? 50;

        record.trend = Array.from({length: 12}, (_, point) => {
            signal = Math.max(8, Math.min(92, signal + ((this.feedSequence + point * 5) % 9) - 4));
            return signal
        });
        pane?.body?.createViewData(false, true);

        return {componentId: sparkline.id, recordId: record.id, values: [...record.trend]}
    }

    /**
     * @summary Returns a serializable identity receipt for one live logical tab surface.
     * @param {String} nodeId
     * @returns {Object|null}
     */
    getTabChromeIdentity(nodeId) {
        const
            shell = this.getReference('dock-host')?.items[0],
            tab   = DockProjectionReconciler.collectProjectedTabs(shell).get(nodeId);

        if (!tab) return null;

        const
            bar     = tab.getTabBar(),
            body    = tab.getCardContainer(),
            plugin  = bar.getPlugin('tab-overflow'),
            buttons = {};

        Object.entries(this.paneCache).forEach(([itemId, pane]) => {
            const index = body.items.indexOf(pane);

            index > -1 && (buttons[itemId] = bar.items[index]?.id || null)
        });

        return {
            bodyId           : body.id,
            buttons,
            containerId      : tab.id,
            headerId         : bar.id,
            overflowControlId: plugin?.control?.id || null,
            overflowPluginId : plugin?.id || null,
            stripId          : tab.getTabStrip().id
        }
    }

    /**
     * Chrome that must retire before every re-projection: the active gesture session's geometry
     * and the drag-affordance overlays — a stale geometry promise must never survive a topology
     * change (the controller's generation guards depend on it). Both are absolute overlay
     * bookkeeping, so running after the FLIP first-snapshot cannot alter the captured pane rects.
     * @param {Object} document The committed document this refresh projects.
     * @param {Object} refreshOptions The options {@link #getRefreshOptions} produced for it.
     */
    beforeRefreshDockWorkspace(document, refreshOptions) {
        let me = this;

        me.crossWindowPreviewGeometries.delete(Workspace.MAIN_WORKSPACE_ID);
        me.dragAffordances?.clear()
    }

    /**
     * The reconciler seams this host owns: retained tab bars suppress their CSS entry animation
     * across native reparenting (restored in {@link #afterRefreshDockWorkspace} once the chrome
     * window elapsed), and overflow projections are awaited through the app's four-fact readiness
     * check. Refreshes serialize on the class's settled-tail chain, so the suppressed-bars field
     * never sees two transactions at once.
     * @param {Object|null} document The committed document this refresh projects.
     * @param {Object} refreshOptions The options {@link #getRefreshOptions} produced for it.
     * @returns {Object}
     */
    getReconcileOptions(document, refreshOptions) {
        let me = this;

        me.animationSuppressedBars = [];

        return {
            onProjectionStaged: ({plans}) => {
                const retainedTabBars = [...plans.values()]
                    .filter(plan => plan.tab)
                    .map(plan => plan.tab.getTabBar());

                me.animationSuppressedBars = retainedTabBars
                    .filter(bar => !bar.cls.includes('neo-no-animation'));

                // Native reparenting keeps each toolbar DOM node, but CSS animations restart when it
                // re-enters the document. Retained indicators settle immediately; new chrome still enters.
                me.animationSuppressedBars.forEach(bar => {
                    bar.setSilent({cls: [...bar.cls, 'neo-no-animation']})
                })
            },
            waitForOverflowProjection: plugin => me.waitForOverflowProjection(plugin)
        }
    }

    /**
     * Maps both commit shapes onto the reconciler's fast paths — engine surfaces pass the semantic
     * descriptor, this host's own paths pass their options object. The geometry admission is the
     * ENGINE's now: it derives `geometryOnly` from the operation's declared change class, so this
     * override adds only the one thing the engine cannot see — an explicit `geometryOnly` on this
     * host's own options-object commits. Either way it is an admission REQUEST for the in-place
     * projection path, never a claim that the topology is stable: the reconciler validates it,
     * falls back to the staged transaction on any structural delta, and `DockFlip` is told the
     * resulting `landedInPlace`, not this request. `detachItem` / `transferNode` admit the
     * stable-topology fast path (a transferNode
     * adoption keeps the structural shell — one tabs node's items grow — and the validator still
     * rejects any transfer that does mutate structure). A commit-scoped `preserveItemIds` parks
     * owner-held panes instead of destroying them (a terminal-first tear-out vessel owns its pane
     * before it connects).
     * @param {Object|null} descriptor The committing surface's identification — a semantic
     *     descriptor or this host's options object.
     * @param {Object|null} source The committing surface, when it identifies itself.
     * @returns {Object}
     */
    getRefreshOptions(descriptor, source) {
        let {geometryOnly = false, operation = null, preserveItemIds} = descriptor || {},
            base = super.getRefreshOptions(descriptor, source);

        return {
            geometryOnly  : geometryOnly === true || base.geometryOnly === true,
            retainTopology: operation === 'detachItem' || operation === 'transferNode',
            ...(Array.isArray(preserveItemIds) && preserveItemIds.length > 0 ? {preserveItemIds} : {})
        }
    }

    /**
     * The post-projection sequence this host orders behind the motion: the heavy tab bar's
     * overflow-menu readiness, the awaited FLIP play, the chrome-animation window, the suppressed
     * bars' restore, one host update, and the cross-window participation refresh.
     * @param {Object} data
     * @param {Object|null} data.result The reconciler's outcome; `nextShell` carries the live
     *     projection shell on both paths.
     * @param {Promise|null} data.played Settles when the FLIP motion finishes; awaited here
     *     because retained-indicator restore and the participation refresh must trail the motion.
     * @returns {Promise<void>}
     */
    async afterRefreshDockWorkspace({result, played}) {
        let me   = this,
            host = me.getDockHost();

        const heavyOverflow = result?.nextShell?.down({dockNodeId: 'heavy-tabs'})
            ?.getTabBar()?.getPlugin('tab-overflow');

        await me.waitForOverflowMenu(heavyOverflow);

        // Changing only animation-duration keeps the same CSS Animation object. Waiting out the
        // theme's 260ms window before restoring it prevents a delayed replay on retained indicators.
        const chromeAnimationSettle = me.timeout(300);

        await played;
        await chromeAnimationSettle;

        (me.animationSuppressedBars || []).forEach(bar => {
            bar.setSilent({cls: bar.cls.filter(cls => cls !== 'neo-no-animation')})
        });
        me.animationSuppressedBars = [];

        host.updateDepth = -1;
        host.update();
        await host.promiseUpdate();
        await me.refreshCrossWindowParticipation(Workspace.MAIN_WORKSPACE_ID)
    }

    /**
     * Waits for the tab-overflow projection and its asynchronously imported menu surface.
     * `project()` intentionally coalesces while a measurement is in flight, and button menus
     * load after control construction, so readiness requires all four lifecycle facts rather
     * than a screenplay delay.
     * @param {Neo.tab.plugin.Overflow|null} plugin
     * @returns {Promise<Neo.button.Base|null>}
     */
    async waitForOverflowMenu(plugin) {
        if (!plugin) return null;

        for (let attempt = 0; attempt < 100; attempt++) {
            const control = plugin.control;

            if (!plugin.measuring && !plugin.projectQueued
                && control?.mounted && control.menuList) {
                return control
            }

            await this.timeout(0)
        }

        return null
    }

    /**
     * Waits until one coalescing overflow projection has drained its current and queued passes.
     * @param {Neo.tab.plugin.Overflow|null} plugin
     * @returns {Promise<Boolean>}
     */
    async waitForOverflowProjection(plugin) {
        if (!plugin) return false;

        for (let attempt = 0; attempt < 100; attempt++) {
            if (!plugin.measuring && !plugin.projectQueued) return true;

            await this.timeout(0)
        }

        return false
    }

    /**
     * Returns the model-owned tab label used by both staged projection shells and live panes.
     * The shared resolver keeps a placeholder-built tab bar structurally identical to the one
     * a live pane would have produced, including natural widths for the overflow plugin.
     * @param {String} itemId
     * @param {Object} item
     * @returns {String}
     */
    getPaneHeaderText(itemId, item) {
        return {
            audit    : 'Audit',
            commits  : 'Commits',
            graph    : 'Graph',
            inspector: 'Inspector',
            metrics  : 'Metrics',
            queues   : 'Queues',
            scale    : '100k Matrix'
        }[itemId] ?? item?.title ?? itemId
    }

    /**
     * @summary Creates one pane instance without consulting or mutating {@link #paneCache}.
     * @param {String} itemId
     * @param {Object} item
     * @returns {Neo.component.Base}
     * @protected
     */
    createPane(itemId, item) {
        let me = this,
            store;

        if (itemId === 'scale') {
            store = me.getStateProvider().getStore('scale');
            return Neo.create({module: ScalePane, store})
        }

        if (itemId === 'feed') {
            store = me.getStateProvider().getStore('feed');
            return Neo.create({module: FeedPane, store})
        }

        const story = paneStories[itemId] || {
            detail: 'resident operational',
            icon  : 'fa-circle-nodes',
            kicker: 'LIVE MODULE',
            metric: 'READY'
        };

        return Neo.create({
            module: Component,
            cls   : ['workstation-pane', 'workstation-placeholder', `workstation-pane-${itemId}`],
            html  : `<div class="workstation-resident-card">
                <div class="workstation-resident-kicker"><span></span>${story.kicker}</div>
                <i class="fa ${story.icon} workstation-resident-icon"></i>
                <div class="workstation-resident-metric">${story.metric}</div>
                <div class="workstation-resident-title">${item?.title ?? itemId}</div>
                <div class="workstation-resident-footer">
                    <span>${story.detail}</span><strong>LIVE</strong>
                </div>
                <div class="workstation-resident-wave"><i></i><i></i><i></i><i></i><i></i><i></i></div>
            </div>`
        })
    }

    /**
     * @summary Applies the model-owned presentation shared by cached and fresh panes.
     * @param {Neo.component.Base} pane
     * @param {String} itemId
     * @param {Object} item
     * @returns {Neo.component.Base}
     * @protected
     */
    configurePane(pane, itemId, item) {
        // The adapter can decorate plain configs, but this showcase deliberately returns LIVE
        // instances. Carry the canonical tab header on the instance itself so tab.Container and
        // Neo.tab.plugin.Overflow receive a meaningful title.
        pane.header = {text: this.getPaneHeaderText(itemId, item)};
        pane.addCls(`workstation-pane-${itemId}`);

        return pane
    }

    /**
     * Returns the one live pane instance for an item id.
     * @param {String} itemId
     * @param {Object} item
     * @returns {Neo.component.Base}
     */
    resolvePane(itemId, item) {
        let me    = this,
            cache = me.paneCache,
            pane  = cache[itemId];

        if (!pane || pane.isDestroyed) {
            pane = cache[itemId] = me.createPane(itemId, item)
        }

        return me.configurePane(pane, itemId, item)
    }

    /**
     * @summary Creates a replacement without publishing it to the live pane cache.
     * @param {String} itemId
     * @param {Object} item
     * @returns {Neo.component.Base}
     */
    resolveFreshPane(itemId, item) {
        return this.configurePane(this.createPane(itemId, item), itemId, item)
    }

    /**
     * @summary Adopts only the exact replacement committed by the base recreate transaction.
     * @param {String} itemId
     * @param {Neo.component.Base} livePane
     * @param {Object} [options]
     * @returns {{errors:String[],pane:?Neo.component.Base}|null}
     * @protected
     */
    recreateDockPane(itemId, livePane, options) {
        const result = super.recreateDockPane(itemId, livePane, options);

        if (result?.pane && result.errors.length === 0) {
            this.paneCache[itemId] = result.pane
        }

        return result
    }

    /**
     * Replays one script's document tier from a fresh document in spec mode. Runtime-only
     * cues remain the visible tour's responsibility and are verified through its receipt.
     * By default the replay result stays live (the driver contract journey specs and the film
     * pipeline continue from); `restoreDocument: true` turns the replay into a pure probe that
     * restores the displaced live document afterwards.
     * @param {Object} [script=workstationTourScript] `null` also resolves to the default script.
     * @param {Object} [opts]
     * @param {Boolean} [opts.restoreDocument=false] Restore the pre-replay live document after the run.
     * @returns {Promise<Object>}
     */
    async runTourSpec(script=workstationTourScript, {restoreDocument=false}={}) {
        let me           = this,
            dockService  = Neo.create(DockService, {}),
            liveDocument = me.dockModel,
            runner;

        // Transport callers can only deliver `null` for "use the default script".
        script ??= workstationTourScript;

        runner = Neo.create(TourRunner, {
            componentId: me.id,
            dockService,
            mode       : 'spec',
            script
        });

        // Two consumer contracts share this front door. As a DRIVER (default), the replay's
        // resulting document stays live — the film pipeline and journey specs continue from it.
        // As a PROBE (`restoreDocument: true`), the displaced live document is restored after
        // the replay, so a replay can never edit the surface it measures. The transaction owns
        // the baseline swap too: a rejecting entry projection must still destroy the runner and
        // service, and must still restore the probe's displaced document.
        //
        // The ENTRY projection REQUESTS `geometryOnly` — a validated in-place ADMISSION, not a
        // skip, and not a claim about the outcome. What reaches `DockFlip.play` is the reconciler's
        // reported `landedInPlace`, so a reset across a diverged layout can no longer declare
        // stable topology over a swap that already happened:
        // `DockProjectionReconciler.reconcileProjection` (:314) attempts
        // `reconcileStableTopology` (:130), which returns null on ANY node/type/ancestry/order/
        // orientation delta and falls back to the full staged transaction. The workspace boots
        // from the same `initialDocument` the entry re-stages, so the proven-stable in-place
        // path applies and the staged shell swap — whose intermediate state presents a cleared
        // workspace body on camera (one compositor frame, measured at capture minFrameIndex
        // 7/59, minEntropy 0.41 vs baseline 5.30) — never runs on the same-topology path. A
        // genuinely changed topology still takes the staged path unchanged (the residual blank
        // for that branch is documented on the ticket; present-no-intermediate-state is the
        // deferred stronger shape). The RESTORE projection stays full deliberately: at
        // probe-restore time the shell typically diverges from the displaced document, so
        // admission would validate-and-fall-back with no gain.
        let completed = false,
            out       = null;

        try {
            me.dockModel = WorkspaceDocument.clone(initialDocument);
            await me.refreshDockWorkspace(null, me.dockModel, {geometryOnly: true});

            // The entry projection is finished and the replay has not begun. Published because a
            // frame-capturing consumer cannot otherwise tell the two apart: both happen inside one
            // `runTourSpec` call, so an oracle measuring the whole call attributes an entry-time
            // frame to the replay step it names. A wall-clock stamp rather than a marker element or
            // an event, so the consumer bands frames it has ALREADY collected instead of racing a
            // poll against frame arrival — the boundary is read after the fact, never observed live.
            const entryCompletedAt = Date.now(),
                  result           = await runner.start();

            await me.refreshPromise;

            out = {...result, document: WorkspaceDocument.clone(me.dockModel), phases: {entryCompletedAt}};

            // A structured runner failure is a primary outcome the caller must receive intact —
            // only a genuinely clean replay may let a restore failure replace the return.
            completed = result?.completed === true && !result?.errors?.length;

            return out
        } finally {
            runner.destroy();
            dockService.destroy();

            if (restoreDocument && !me.isDestroyed) {
                me.dockModel = liveDocument;

                // The document assignment IS the restore. Restore-projection failure precedence:
                // a clean replay propagates it (a probe may not report success over an
                // un-projected surface); a structured primary keeps its result and RECORDS the
                // restore failure as a namespaced entry in the returned errors; a thrown primary
                // owns the return channel and the restore failure stays suppressed.
                completed
                    ? await me.refreshDockWorkspace()
                    : await me.refreshDockWorkspace().catch(error => {
                        out?.errors?.push(`restore projection failed: ${error.message}`)
                    })
            }
        }
    }

    /**
     * Scrolls the scale grid through one View-owned VDOM update.
     *
     * The View is the closest common parent of the native scrollport and every pooled body.
     * Retargeting its VNode `scrollTop` together with `syncBodies()` therefore lets one delta
     * move the viewport and recycle the fixed rows atomically, without a transient blank frame.
     *
     * @param {Number} index
     * @returns {Promise<Boolean>}
     */
    async scrollScaleGrid(index=50000) {
        let pane = this.paneCache.scale,
            target;

        if (!pane?.view?.id) return false;

        target = Math.max(0, Math.min(index, pane.store.count - 1)) * pane.rowHeight;
        pane.view.vdom.scrollTop = target;
        pane.view.syncBodies(target);
        await pane.view.promiseUpdate();

        return Math.abs(pane.view.scrollTop - target) <= pane.rowHeight
    }

    /**
     * @param {Number} count
     */
    async setPipProgress(count) {
        const pips = this.getReference('tour-pips');

        if (!pips) return;

        let {vdom} = pips;

        vdom.cn.forEach((pip, index) => {
            pip.cls = index < count
                ? ['workstation-pip', 'workstation-pip-done']
                : ['workstation-pip']
        });
        pips.update();
        await pips.promiseUpdate()
    }

    /**
     * @param {String} text
     */
    setTourCaption(text) {
        const caption = this.getReference('tour-caption');

        caption && (caption.html = text)
    }

    /**
     * Applies the theme to every render target of this app, not only to the workspace.
     *
     * A theme in Neo is a CSS class an ancestor carries, and `afterSetTheme` writes it onto the
     * component it was set on — so setting it here reaches this window's subtree and nothing else.
     * A tear-out vessel is a SECOND document driven by the same App Worker, whose only theme
     * carrier is the class the Stylesheet addon puts on its `body` at boot. Nothing propagates a
     * later flip across documents, so an open vessel stayed on the theme it was born with while
     * the workspace beside it changed.
     *
     * Fanning reaches the viewport because that is where this app's token bridge lives, so a vessel
     * restyles from its own theme class rather than inheriting a stale one from its boot-time body.
     *
     * `Neo.appsByName[appName]` rather than `Neo.apps`: the worker-global registry is keyed by
     * window and can carry more than one app name (`controller/Application.mjs` indexes both), so
     * iterating it would let a Workstation toggle retheme an unrelated co-hosted app. The
     * name-keyed registry is the same set restricted to this app's own render targets — one window
     * today, one per open vessel tomorrow.
     * @param {String} theme
     * @returns {String}
     */
    setWorkspaceTheme(theme) {
        const me = this;

        me.theme = theme;
        me.syncThemeToggle(theme);

        (Neo.appsByName?.[me.appName] || []).forEach(app => {
            const view = app?.mainView;

            view && view !== me && view.theme !== theme && (view.theme = theme)
        });

        return theme
    }

    /**
     * Keeps the one theme control phrased as the available action.
     * @param {String} theme
     */
    syncThemeToggle(theme) {
        const
            button  = this.getReference('theme-toggle'),
            isLight = theme === 'neo-theme-neo-light';

        if (button) {
            button.iconCls = isLight ? 'fa fa-moon' : 'fa fa-sun';
            button.text    = isLight ? 'Dark mode' : 'Light mode'
        }
    }

    /**
     * @summary Flips the workspace theme, revealed from the pointer where the browser supports it.
     *
     * The flip happens AFTER the awaited call, deliberately: `startViewTransition()` resolves once
     * the transition has started, and `delay` is the window this method has to mutate the DOM
     * before the new state is captured. Flipping first would let the transition capture the
     * already-changed DOM as both states and the reveal would play over no visible difference.
     *
     * The reveal is decorative, and that holds for every way it can fail: no View Transition API
     * returns false, a failed reveal is caught inside the engine, and a rejected remote round trip
     * is caught here. The flip runs in all three cases, so a browser or a transport that cannot
     * deliver the animation still behaves exactly as before.
     *
     * Raw pointer coordinates go to the engine rather than a radius computed here: the App worker
     * knows where the pointer was, not how a pseudo-element resolves a length, so the unit decision
     * stays in `DomUtils.createRevealAnimation()` instead of gaining a copy per app.
     * @param {Object} [data] The click event. Absent coordinates yield NO circular reveal:
     * `createRevealAnimation()` returns null, the transition still runs as the browser's default
     * cross-fade, and the flip is unaffected. Nothing here throws on a missing event
     * @returns {Promise<String>} The newly applied theme.
     */
    async toggleWorkspaceTheme(data) {
        const me = this;

        // The catch is the decorative promise kept. The engine resolves rather than rejects — no API
        // returns false, a failed reveal is caught inside — but this is a REMOTE method, and the
        // transport can reject for reasons the callee never sees. Without this, a rejected round trip
        // would skip the flip entirely and leave the button doing nothing at all, which is a worse
        // outcome than the missing animation it was supposed to guard.
        await Neo.main.DomAccess.startViewTransition({
            delay   : 100,
            reveal  : {x: data?.clientX, y: data?.clientY},
            windowId: me.windowId
        }).catch(() => {});

        return me.setWorkspaceTheme(me.theme === 'neo-theme-neo-light'
            ? 'neo-theme-neo-dark'
            : 'neo-theme-neo-light')
    }

    /**
     * Runs the screenplay from a fresh document on every replay.
     * @returns {Promise<Object>|undefined}
     */
    async startTour() {
        let me = this;

        if (me.tourRunner.running) {
            me.setTourCaption('Tour already running — the live stores continue underneath it.');
            return
        }

        me.cueErrors       = [];
        me.cuePromise      = Promise.resolve();
        me.cueReceipts     = [];
        me.cueSettlements.clear();
        me.lastTourReceipt = null;
        me.progressPromise = Promise.resolve();
        me.dockModel       = WorkspaceDocument.clone(initialDocument);
        await me.setPipProgress(0);

        await me.refreshDockWorkspace(null, me.dockModel, {geometryOnly: true});

        const
            feedStore      = me.getStateProvider().getStore('feed'),
            feedStartCount = feedStore.count,
            feedStartBatch = me.feedBatchCount,
            startedAt      = Date.now(),
            runnerResult   = await me.tourRunner.start();

        const
            errors      = [...runnerResult.errors, ...me.cueErrors],
            appendError = (label, result) => {
                if (result.status === 'rejected') {
                    const
                        detail          = result.reason?.message || String(result.reason),
                        alreadyRecorded = errors.some(error => error === detail || error.endsWith(`: ${detail}`));

                    alreadyRecorded || errors.push(`${label} failed: ${detail}`)
                }
            },
            settlements = await Promise.allSettled([
                me.cuePromise,
                me.refreshPromise,
                me.progressPromise
            ]);

        ['surface cue settlement', 'dock refresh settlement', 'progress settlement']
            .forEach((label, index) => appendError(label, settlements[index]));

        const [finalProgress] = await Promise.allSettled([
            me.setPipProgress(Workspace.totalBeats().length)
        ]);

        appendError('final progress paint', finalProgress);

        const
            elapsedMs    = Date.now() - startedAt,
            feedEndCount = feedStore.count,
            receipt      = {
                completed  : runnerResult.completed && errors.length === 0,
                cueReceipts: me.cueReceipts.map(entry => ({cue: {...entry.cue}, receipt: entry.receipt})),
                document   : WorkspaceDocument.clone(me.dockModel),
                elapsedMs,
                errors,
                feed       : {
                    batches       : me.feedBatchCount - feedStartBatch,
                    configuredRate: Workspace.FEED_BATCH_SIZE * 1000 / Workspace.FEED_INTERVAL_MS,
                    endCount      : feedEndCount,
                    growth        : feedEndCount - feedStartCount,
                    maxRecords    : feedStore.maxRecords,
                    produced      : (me.feedBatchCount - feedStartBatch) * Workspace.FEED_BATCH_SIZE,
                    startCount    : feedStartCount
                },
                log       : runnerResult.log
            };

        me.lastTourReceipt = receipt;
        me.setTourCaption(receipt.completed
            ? `Tour complete — ${receipt.log.length} deterministic beats and ${receipt.cueReceipts.length} surface cues settled.`
            : `Tour stopped — ${errors[0]}`);

        return receipt
    }

    /**
     * @returns {Object[]} Flattened screenplay steps.
     * @static
     */
    static totalBeats() {
        return workstationTourScript.scenes.flatMap(scene => scene.steps)
    }

    /**
     * Updates the visible runtime receipt without creating another state authority.
     */
    updateStatusBar() {
        let target = this.getReference('status-bar');

        if (target) {
            let scale = this.getStateProvider().getStore('scale'),
                feed  = this.getStateProvider().getStore('feed');

            target.html = `<span>20 dock items</span><span>${new Intl.NumberFormat().format(scale.count)} scale rows</span><span>${feed.count}/${feed.maxRecords} feed rows</span><span>${Workspace.FEED_BATCH_SIZE * 1000 / Workspace.FEED_INTERVAL_MS} events/sec</span>`
        }
    }

    /**
     * @summary Opens one theme-correct vessel window for a mid-gesture boundary exit.
     *
     * Reuses the workstation viewport's `?popout=` pure-pane-host mode. The vessel carries the slot the
     * engine reserved in this workspace's Group through `Main.windowOpen`; which pane it shows is
     * content and stays in the URL, whom it belongs to is identity and never does. The bound child
     * immediately carries the same live pane through {@link Neo.dashboard.dock.window.VesselEmbodiment};
     * it owns no workspace document. Fail-closed per the admission contract: `windowOpen` returns
     * a BOOLEAN (a blocked popup never throws), and any falsy/throwing acquisition returns `null`
     * so the gesture degrades to its in-window fallback. The theme bootstrap is part of that
     * acquisition rather than optional presentation: an unavailable authority reaches the outer
     * diagnostic boundary and prevents an unthemed child from opening.
     * @param {Object} request
     * @param {String} request.itemId
     * @param {Object} request.proxyRect
     * @param {Object} request.topologyIdentity The reserved slot, written into the vessel's carrier.
     * @returns {Promise<{popupHeight: Number, popupWidth: Number, windowName: String}|null>}
     * @protected
     */
    async openTearOutVessel({itemId, proxyRect, topologyIdentity}) {
        let me         = this,
            {windowId} = me,
            windowName = `tearout-${itemId}`;

        // Diagnostic trail for the birth gate: absence has three distinct layers (admission
        // refused / platform refused the window / window granted but never bound), and the
        // failure diag must name which one this gesture died in.
        me.lastVesselOpen = {itemId, stage: 'invoked'};

        try {
            let [winData, bootstrap] = await Promise.all([
                    Neo.Main.getWindowData({windowId}),
                    Neo.Main.getByPath({path: 'WorkstationBootstrap', windowId})
                ]),
                schemes       = bootstrap?.schemes || {},
                selectedTheme = Object.hasOwn(schemes, me.theme)
                    ? me.theme
                    : bootstrap?.defaultTheme || me.theme,
                width  = Math.max(Math.round(proxyRect?.width  || 480), 320),
                height = Math.max(Math.round(proxyRect?.height || 360), 240),
                left   = Math.round((proxyRect?.x ?? 120) + winData.screenLeft),
                top    = Math.round((proxyRect?.y ?? 120) + (winData.outerHeight - winData.innerHeight) + winData.screenTop);

            let opened = await Neo.Main.windowOpen({
                nativeCapabilities: {close: true, position: true, resize: true},
                stagedColorScheme : schemes[selectedTheme],
                topologyIdentity,
                url               : `./index.html?popout=${itemId}&theme=${encodeURIComponent(selectedTheme)}`,
                windowFeatures    : `height=${height},left=${left},top=${top},width=${width}`,
                windowId,
                windowName
            });

            me.lastVesselOpen.stage = opened === false ? 'windowOpen-false' : 'granted';

            if (opened === false) {
                return null
            }

            me.tearOutVesselDims = {height, width};

            return {popupHeight: height, popupWidth: width, windowName}
        } catch (error) {
            me.lastVesselOpen.stage = 'threw';
            me.lastVesselOpen.error = String(error?.message || error);
            return null
        }
    }

    /**
     * The tear-out retirement seam: closes a vessel the gesture no longer needs (re-entry, cancel,
     * or a refused model commit). Identity is the slot's lineage token — a successor admission for
     * the same item shares the window name, never the token — so a retirement presenting a superseded
     * token is refused and the live vessel survives it. The engine's `retireTearOutVessel` holds the
     * retirement fence and clears the ownership records around this call; the platform close and its
     * receipt are this host's, and an explicit refusal retains exact retry authority.
     * @param {Object} vessel
     * @param {String} [vessel.generationToken] The reservation's lineage token.
     * @param {String} vessel.itemId
     * @param {Object} [vessel.nativeRoute] Exact opener-minted physical route when available.
     * @param {String} vessel.windowName
     * @returns {Promise<Boolean>}
     * @protected
     */
    async closeTearOutVessel({generationToken, itemId, nativeRoute, windowName}) {
        let me               = this,
            entry            = me.resolveTearOutVessel(itemId),
            admission        = me.tearOutAdmissions.get(itemId),
            expected         = `tearout-${itemId}`,
            exactToken       = entry?.generationToken ?? admission?.generationToken ?? null,
            embodiedWindowId = entry?.windowId ?? admission?.windowId ?? me.tearOutEmbodiment.getWindowId(itemId),
            closed           = false;

        const closeReceipt = me.lastTearOutClose = {
            identity: {
                entryNameMatches : !entry || entry.windowName === windowName,
                hasEntry         : Boolean(entry),
                hasItemId        : Boolean(itemId),
                lineageMatches   : !generationToken || !exactToken || generationToken === exactToken,
                windowNameMatches: windowName === expected
            },
            itemId: itemId ?? null,
            stage : 'validating-identity'
        };

        if (
            !itemId || windowName !== expected || (entry && entry.windowName !== windowName) ||
            (generationToken && exactToken && generationToken !== exactToken)
        ) {
            closeReceipt.stage = 'identity-refused';
            return false
        }

        nativeRoute ??= entry?.nativeRoute ?? (
            admission?.windowId && Neo.manager?.Window?.get(admission.windowId)?.nativeRoute
        );

        const exactWindowId = entry?.windowId ?? admission?.windowId;

        closeReceipt.route = {
            closeCapable      : !nativeRoute || nativeRoute.capabilities?.close === true,
            exactTargetMatches: !nativeRoute || !exactWindowId || nativeRoute.targetWindowId === exactWindowId,
            exactWindowId     : exactWindowId ?? null,
            hasHandle         : !nativeRoute || Boolean(nativeRoute.nativeHandleKey),
            ownerMatches      : !nativeRoute || nativeRoute.ownerWindowId === me.windowId,
            ownerWindowId     : nativeRoute?.ownerWindowId ?? null,
            present           : Boolean(nativeRoute),
            targetPresent     : !nativeRoute || Boolean(nativeRoute.targetWindowId),
            targetWindowId    : nativeRoute?.targetWindowId ?? null
        };

        if (nativeRoute && (
            !nativeRoute.nativeHandleKey || nativeRoute.ownerWindowId !== me.windowId ||
            !nativeRoute.targetWindowId || nativeRoute.capabilities?.close !== true ||
            (exactWindowId && nativeRoute.targetWindowId !== exactWindowId)
        )) {
            closeReceipt.stage = 'route-refused';
            return false
        }

        // The engine established retirement before this call; a refused close retains the exact
        // route + tear-out machine slot for retry, but the content goes safely home first.
        if (embodiedWindowId && me.tearOutEmbodiment.isStaged(itemId)) {
            const sourceOwns = Boolean(WorkspaceDocument.findContainingTabsId(me.dockModel, itemId)),
                  settled    = me.tearOutEmbodiment[sourceOwns ? 'restore' : 'promote']({
                      itemId, windowId: embodiedWindowId
                  });

            closeReceipt.embodiment = {settled, sourceOwns, staged: true};

            if (!settled) {
                closeReceipt.stage = 'embodiment-refused';
                return false
            }
        }

        try {
            if (nativeRoute) {
                closeReceipt.stage = 'native-dispatched';
                closed = await Neo.Main.windowNativeClose({
                    nativeHandleKey: nativeRoute.nativeHandleKey,
                    targetWindowId : nativeRoute.targetWindowId,
                    windowId       : me.windowId
                }) === true
            } else {
                closeReceipt.stage = 'semantic-dispatched';
                // Before connect there is no exact route to correlate yet; the active tear-out
                // slot's unguessable semantic name is the only available authority. Once a route
                // exists, ANY invalidity above fails closed — never downgrade to same-name close.
                await Neo.Main.windowClose({names: [windowName], windowId: me.windowId});
                closed = true
            }
        } catch (error) {
            closeReceipt.error = String(error?.message || error);
            closeReceipt.stage = 'threw';
            return false
        }

        closeReceipt.closed = closed;

        if (!closed) {
            closeReceipt.stage = 'platform-refused';
            return false
        }

        delete me.tearOutParkGeometries[itemId];
        closeReceipt.stage = 'acknowledged';

        return true
    }

    /**
     * @summary Resolves the exact live vessel identity for one torn item, connect- or commit-side.
     * @param {String} itemId
     * @returns {Object|null}
     * @protected
     */
    resolveTearOutVessel(itemId) {
        let entry = this.tearOutConnects[itemId] ?? this.tearOutPanes[itemId];

        if (!entry?.windowId) return null;

        return {
            ...entry,
            itemId,
            nativeRoute: entry.nativeRoute ?? Neo.manager?.Window?.get(entry.windowId)?.nativeRoute ?? null,
            windowName : entry.windowName ?? `tearout-${itemId}`
        }
    }

    /**
     * Consumes the tear-out machine's active slot, then closes its exact parked vessel — the ONE
     * settle path for a committed conversion; a refusal retains exact retry authority.
     * @param {Object} vessel
     * @param {String} vessel.itemId
     * @param {String} vessel.windowName
     * @returns {Promise<Boolean>}
     * @protected
     */
    async disposeParkedTearOutVessel({itemId, windowName}) {
        let me    = this,
            entry = me.resolveTearOutVessel(itemId),
            route = entry?.nativeRoute;

        const disposed = await me.tearOutHandlers.retireActiveVessel({itemId, windowName});

        if (disposed) {
            delete me.tearOutParkGeometries[itemId];
            delete me.tearOutParkAttempts[itemId];

            route?.nativeHandleKey && await Neo.main.addon.DragDrop.retireWindowDragOrphanRecovery({
                nativeHandleKey: route.nativeHandleKey,
                targetWindowId : route.targetWindowId,
                windowId       : me.windowId,
                windowName
            })
        }

        return disposed
    }

    /**
     * Parks one converted vessel behind its conversion target — the cover geometry that keeps
     * the REAL OS window alive while the proxy embodies over the target. Close-and-reopen is a
     * one-way door (mid-gesture popup acquisition reads as unsolicited), so conversion parks
     * instead: the same exact generation re-shows on out-conversion or restore. The focus /
     * resize / move / refocus chain is the platform-law choreography (z-order hides the parked
     * vessel). A source whose outer frame cannot fit behind the target first shrinks through its
     * exact native route; a refocus refusal compensates to the original extent and source rect.
     * On the native-titlebar path to the MAIN window nothing is parked at all — the hold is the
     * gesture: the transfer lands when the dwell completes and the popup retires right after, so the
     * park answers satisfied with no platform effect (the platform never grants a popup an opener
     * focus without a user activation, and an OS titlebar drag carries none).
     * @param {Object} vessel
     * @param {String} vessel.itemId
     * @param {Boolean} [vessel.nativeTitlebar=false] The park follows an OS titlebar drag terminal
     * @param {String} vessel.windowName
     * @returns {Promise<Boolean>}
     * @protected
     */
    async parkTearOutVessel({itemId, nativeTitlebar=false, windowName}) {
        let me           = this,
            entry        = me.resolveTearOutVessel(itemId),
            route        = entry?.nativeRoute,
            sourceWindow = Neo.manager?.Window?.get(entry?.windowId),
            targetWindow = Neo.manager?.Window?.get(me.vesselConversionTargetWindowId),
            targetRoute  = targetWindow?.nativeRoute,
            targetIsMain = me.vesselConversionTargetWindowId === me.windowId,
            // The size check and the authority check speak published inner-window geometry (a child
            // omitting outerRect never rejects an authorized live vessel); the park POSITION is a
            // frame: `moveTo` places the source frame on the target's frame origin, so the parked
            // window lies behind the target's chrome and content alike.
            sourceRect   = sourceWindow?.innerRect,
            sourceOuter  = sourceWindow?.outerRect ?? sourceRect,
            targetRect   = targetWindow?.innerRect,
            targetOuter  = targetWindow?.outerRect ?? targetRect,
            needsResize  = !nativeTitlebar && Boolean(sourceOuter && targetRect && (
                sourceOuter.width > targetRect.width || sourceOuter.height > targetRect.height
            )),
            parkSize      = needsResize ? {
                height: Math.min(sourceOuter.height, targetRect.height),
                width : Math.min(sourceOuter.width, targetRect.width)
            } : null,
            restoreRect   = sourceOuter ? {
                height: sourceOuter.height,
                width : sourceOuter.width,
                x     : sourceOuter.x,
                y     : sourceOuter.y
            } : null,
            parkGeometry  = needsResize ? {
                park   : {...parkSize, x: targetOuter?.x, y: targetOuter?.y},
                restore: restoreRect
            } : null;

        me.lastVesselParkReceipt = {
            authority: {
                entryNameMatches     : entry?.windowName === windowName,
                sourceHasHandle      : Boolean(route?.nativeHandleKey),
                sourceOwnerMatches   : route?.ownerWindowId === me.windowId,
                sourcePositionCapable: route?.capabilities?.position === true,
                sourceResizeCapable  : route?.capabilities?.resize === true,
                sourceTargetMatches  : route?.targetWindowId === entry?.windowId,
                targetFocusCapable   : targetRoute?.capabilities?.focus === true,
                targetHasHandle      : Boolean(targetRoute?.nativeHandleKey),
                targetOwnerMatches   : targetRoute?.ownerWindowId === me.windowId,
                targetTargetMatches  : targetRoute?.targetWindowId === me.vesselConversionTargetWindowId
            },
            needsResize,
            parkSize,
            sourceInner: sourceRect && {
                height: sourceRect.height, width: sourceRect.width, x: sourceRect.x, y: sourceRect.y
            },
            sourceOuter: sourceOuter && {
                height: sourceOuter.height, width: sourceOuter.width, x: sourceOuter.x, y: sourceOuter.y
            },
            targetInner: targetRect && {
                height: targetRect.height, width: targetRect.width, x: targetRect.x, y: targetRect.y
            },
            targetOuter: targetOuter && {
                height: targetOuter.height, width: targetOuter.width, x: targetOuter.x, y: targetOuter.y
            }
        };
        me.lastVesselRestoreReceipt = null;

        me.lastVesselParkReceipt.parkAttempts = me.tearOutParkAttempts[itemId] = (me.tearOutParkAttempts[itemId] ?? 0) + 1;

        if (
            !route?.nativeHandleKey || route.ownerWindowId !== me.windowId ||
            route.targetWindowId !== entry.windowId || route.capabilities?.position !== true ||
            (needsResize && route.capabilities?.resize !== true) ||
            (!targetIsMain && (
                !targetRoute?.nativeHandleKey || targetRoute.ownerWindowId !== me.windowId ||
                targetRoute.targetWindowId !== me.vesselConversionTargetWindowId ||
                targetRoute.capabilities?.focus !== true
            )) ||
            entry.windowName !== windowName || !sourceRect || !sourceOuter || !targetRect ||
            (nativeTitlebar && (
                sourceRect.width > targetRect.width || sourceRect.height > targetRect.height
            ))
        ) {
            me.lastVesselParkReceipt.reason = 'native route or live cover geometry refused';
            return false
        }

        // The hold is the gesture for a native-titlebar drop INTO this main window: the transfer lands
        // when the dwell completes and the popup is retired right after, so there is nothing to park —
        // and the park's focus step could never be granted on this path anyway (no user activation
        // reaches a popup during an OS titlebar drag, so a popup asking its opener to take focus is
        // declined for as long as the user holds, and after). The strict park is answered as satisfied
        // with no physical effect; the receipt says so, the attempt counter resets as after a park, and
        // the conversion bookkeeping around this call runs exactly as for a parked vessel. Popup
        // targets keep the physical park below.
        if (nativeTitlebar && targetIsMain) {
            delete me.tearOutParkAttempts[itemId];
            me.lastVesselParkReceipt.parked   = true;
            me.lastVesselParkReceipt.physical = false;
            me.lastVesselParkReceipt.reason   = 'main-window target: nothing to park, the popup retires after the commit';
            return true
        }

        // The root window has no opener-minted nativeRoute, so a main target is focused through the
        // popup's own Main actor (`opener.focus()`, granted under the user activation a keyboard
        // command carries — the pointer conversion path); a popup target is focused by its owner
        // through the handle it minted.
        //
        // A main-window target under a native titlebar never arrives here: it returns satisfied
        // above, having nothing to park. So the main branch below serves the pointer conversion
        // path alone — there is no native-titlebar main case to find.
        const focusTarget = () => targetIsMain
            ? Neo.Main.windowFocus({windowId: entry.windowId})
            : Neo.Main.windowNativeFocus({
                nativeHandleKey: targetRoute.nativeHandleKey,
                targetWindowId : targetRoute.targetWindowId,
                windowId       : me.windowId
            });

        try {
            let focused = await focusTarget() === true;

            me.lastVesselParkReceipt.focused = focused;

            if (!focused) {
                // A popup target: the owner focuses a window it opened, which the platform grants
                // once the OS releases the dragged source. The coordinator retries the park.
                me.lastVesselParkReceipt.refusedAt = 'focus';
                return false
            }

            const moveData = {
                nativeHandleKey: route.nativeHandleKey,
                targetWindowId : route.targetWindowId,
                windowId       : me.windowId,
                windowName,
                x              : targetOuter.x,
                y              : targetOuter.y
            };

            if (!nativeTitlebar) {
                moveData.parkSize    = parkSize;
                moveData.restoreRect = restoreRect
            }

            let moved = await (nativeTitlebar
                ? Neo.Main.windowNativeMoveTo(moveData)
                : Neo.main.addon.DragDrop.parkWindowDrag(moveData)) === true;

            me.lastVesselParkReceipt.moved = moved;

            if (!moved) {
                me.lastVesselParkReceipt.refusedAt = 'move';
                return false
            }

            parkGeometry && (me.tearOutParkGeometries[itemId] = parkGeometry);

            let refocused = await focusTarget() === true;

            me.lastVesselParkReceipt.refocused = refocused;

            if (!refocused) {
                const restoreData = {
                    nativeHandleKey: route.nativeHandleKey,
                    targetWindowId : route.targetWindowId,
                    windowId       : me.windowId,
                    windowName,
                    x              : sourceOuter.x,
                    y              : sourceOuter.y
                };
                let compensated = await (nativeTitlebar
                    ? Neo.Main.windowNativeMoveTo(restoreData)
                    : Neo.main.addon.DragDrop.resumeWindowDrag(restoreData)) === true;

                me.lastVesselParkReceipt.compensated = compensated;
                me.lastVesselParkReceipt.parked      = !compensated;
                me.lastVesselParkReceipt.refusedAt   = 'refocus';
                compensated && delete me.tearOutParkGeometries[itemId];

                // Recovery ownership and visual admission are separate: if target refocus failed,
                // the real source may still cover the target. Never publish conversion-ready on
                // that frame, even when exact source restoration also needs a later retry.
                return false
            }

            delete me.tearOutParkAttempts[itemId];
            me.lastVesselParkReceipt.parked = true;

            return true
        } catch (error) {
            me.lastVesselParkReceipt.error  = String(error?.message || error);
            me.lastVesselParkReceipt.reason = 'platform effect threw';
            return false
        }
    }

    /**
     * Re-shows the same exact parked generation at the logical pointer-owned origin. During a
     * live gesture the DragDrop addon also resumes physical pointer-follow; at a native drag
     * terminal that addon has already reset its session, so a strict refusal falls through to
     * the same exact Main route for the final restore; semantic-name routing is never used.
     * @param {Object} vessel
     * @param {String} vessel.itemId
     * @param {Object} vessel.rect
     * @param {Boolean} [vessel.terminal=false]
     * @param {String} vessel.windowName
     * @returns {Promise<Boolean>}
     * @protected
     */
    async reshowTearOutVessel({itemId, rect, terminal=false, windowName}) {
        let me       = this,
            entry    = me.resolveTearOutVessel(itemId),
            route    = entry?.nativeRoute,
            geometry = me.tearOutParkGeometries[itemId] ?? null,
            // `rect` is where the pane's CONTENT re-shows — the proxy's logical rect, or the
            // viewport rect captured at conversion-in. `moveTo` places the FRAME, so the window's
            // own chrome comes off the content origin; a window that never published chrome
            // re-shows content-on-frame, the pre-chrome behaviour.
            chrome   = Neo.manager?.Window?.get(entry?.windowId)?.chrome,
            frame    = Number.isFinite(rect?.x) && Number.isFinite(rect?.y) ? {
                x: rect.x - (chrome?.left ?? 0),
                y: rect.y - (chrome?.top  ?? 0)
            } : null;

        me.lastVesselRestoreReceipt = {
            frame,
            geometry,
            rect: rect && {height: rect.height, width: rect.width, x: rect.x, y: rect.y},
            terminal
        };

        if (
            !route?.nativeHandleKey || route.ownerWindowId !== me.windowId ||
            route.targetWindowId !== entry.windowId || route.capabilities?.position !== true ||
            (geometry && route.capabilities?.resize !== true) ||
            entry.windowName !== windowName ||
            !Number.isFinite(rect?.x) || !Number.isFinite(rect?.y)
        ) {
            me.lastVesselRestoreReceipt.reason = 'native route or restore geometry refused';
            return false
        }

        let data = {
            nativeHandleKey: route.nativeHandleKey,
            targetWindowId : route.targetWindowId,
            windowId       : me.windowId,
            windowName,
            x              : frame.x,
            y              : frame.y
        };

        try {
            if (!terminal) {
                const admitted = await Neo.main.addon.DragDrop.resumeWindowDrag(data) === true;

                me.lastVesselRestoreReceipt.admitted = admitted;
                admitted && delete me.tearOutParkGeometries[itemId];

                return admitted
            }

            const addonRestored = await Neo.main.addon.DragDrop.resumeWindowDrag(data) === true;

            me.lastVesselRestoreReceipt.addonRestored = addonRestored;

            if (addonRestored) {
                delete me.tearOutParkGeometries[itemId];
                me.lastVesselRestoreReceipt.admitted = true;

                return true
            }

            const recoveryPending = await Neo.main.addon.DragDrop.hasWindowDragOrphanRecovery(data) === true;

            me.lastVesselRestoreReceipt.recoveryPending = recoveryPending;

            // A matching predecessor effect still owns exact recovery. Never race it with a second
            // direct route mutation or degrade a required extent restore into position-only success.
            if (recoveryPending) return false;

            if (geometry) {
                const resized = await Neo.Main.windowNativeResizeTo({
                    nativeHandleKey: route.nativeHandleKey,
                    targetWindowId : route.targetWindowId,
                    windowId       : me.windowId,
                    ...geometry.restore
                }) === true;

                me.lastVesselRestoreReceipt.resized = resized;

                if (!resized) {
                    await Neo.Main.windowNativeResizeTo({
                        nativeHandleKey: route.nativeHandleKey,
                        targetWindowId : route.targetWindowId,
                        windowId       : me.windowId,
                        ...geometry.park
                    });
                    return false
                }
            }

            const moved = await Neo.Main.windowNativeMoveTo({
                nativeHandleKey: route.nativeHandleKey,
                targetWindowId : route.targetWindowId,
                windowId       : me.windowId,
                x              : rect.x,
                y              : rect.y
            }) === true;

            me.lastVesselRestoreReceipt.moved = moved;

            if (!moved) {
                if (geometry) {
                    const compensationResized = await Neo.Main.windowNativeResizeTo({
                        nativeHandleKey: route.nativeHandleKey,
                        targetWindowId : route.targetWindowId,
                        windowId       : me.windowId,
                        ...geometry.park
                    }) === true;

                    me.lastVesselRestoreReceipt.compensationResized = compensationResized;

                    if (compensationResized) {
                        me.lastVesselRestoreReceipt.compensationMoved =
                            await Neo.Main.windowNativeMoveTo({
                                nativeHandleKey: route.nativeHandleKey,
                                targetWindowId : route.targetWindowId,
                                windowId       : me.windowId,
                                x              : geometry.park.x,
                                y              : geometry.park.y
                            }) === true
                    }
                }

                return false
            }

            me.lastVesselRestoreReceipt.admitted = true;
            delete me.tearOutParkGeometries[itemId];
            await Neo.main.addon.DragDrop.acknowledgeWindowDragOrphanRecovery(data);

            return true
        } catch (error) {
            me.lastVesselRestoreReceipt.error = String(error?.message || error);
            return false
        }
    }

    /**
     * Resolves one dragged vessel's exact live inner rect for conversion sampling — the metric
     * speaks published inner-window geometry, and only the runtime window identity may select
     * the manager-owned rect (the logical drag proxy is intentionally ignored).
     * @param {Object} data
     * @param {String|null} data.itemId
     * @returns {Object|null}
     * @protected
     */
    resolveVesselConversionSourceRect({itemId}) {
        let windowId = this.resolveTearOutVessel(itemId)?.windowId,
            rect     = windowId && Neo.manager?.Window?.get(windowId)?.innerRect;

        return rect && {height: rect.height, width: rect.width, x: rect.x, y: rect.y}
    }

    /**
     * @summary The tear-out commit seam with exact-position capture riding it: the
     * `{tabsNodeId, index}` pair is readable only BEFORE a detach commit removes the item from
     * the tree, and a refused commit deletes its own capture — no stale placement outlives a
     * gesture that never committed. Every non-detach descriptor passes through untouched.
     * @param {Object} descriptor
     * @returns {{document: Object, errors: String[]}|null}
     * @protected
     */
    applyTearOutOperation(descriptor) {
        let me       = this,
            isDetach = descriptor?.operation === 'detachItem',
            captured = isDetach ? WorkspaceDocument.captureItemPlacement(me.dockModel, descriptor.itemId) : null,
            result;

        captured && (me.tearOutPlacements[descriptor.itemId] = captured);

        result = me.applyDockZoneOperation(descriptor);

        isDetach && result?.errors?.length && delete me.tearOutPlacements[descriptor.itemId];

        return result
    }

    /**
     * @summary Commits a detached terminal without sacrificing the live pane to projection order.
     * @description A connect-first vessel already carries the pane and leaves an exact-slot source
     * placeholder for ordinary projection cleanup. A terminal-first vessel has no placeholder, so
     * the source reconciler must preserve the pane until the granted child arrives.
     * @param {Object} document
     * @param {Object} operation
     * @param {Object} vessel The admitted vessel identity: the reservation's slot and lineage token.
     * @protected
     */
    onTearOutDocumentChange(document, operation, vessel) {
        let me       = this,
            detached = operation?.operation === 'detachItem',
            itemId   = operation?.itemId;

        if (!detached) {
            me.onDockZoneDocumentChange(document);
            return
        }

        me.onDockZoneDocumentChange(document, {
            operation      : operation.operation,
            preserveItemIds: me.tearOutEmbodiment.isStaged(itemId) ? [] : [itemId]
        });
        me.adoptTearOutPane(itemId, vessel)
    }

    /**
     * The vessel owns the pane now. If it had already bound (the long-drag order) it also becomes a
     * dock target — a vessel workspace registers lazily on its first dock-INTO, this only opens the
     * door. A vessel that binds later registers from {@link #afterTearOutWindowConnect}.
     * @param {Object} data
     * @param {Object|null} data.connection The connection the engine adopted, when the vessel had already bound.
     * @param {String} data.itemId
     * @protected
     */
    afterTearOutPaneAdopt({connection, itemId}) {
        let me = this;

        connection && me.registerVesselWorkspaceTarget({
            app     : Neo.apps[connection.windowId],
            itemId,
            windowId: connection.windowId
        }).catch(error => {
            me.lastCrossWindowTransfer = {applied: false, errors: [error.message]}
        })
    }

    /**
     * Moves the LIVE cached pane into a bound tear-out vessel — pure render-target work; the model
     * already committed at the terminal. A pane the connect-first order already staged into the
     * vessel stays where it is: the exact-slot placeholder retires with the promotion instead of the
     * pane moving twice.
     * @param {String} itemId
     * @param {Object} target `{windowId}`
     * @returns {Boolean}
     * @protected
     */
    reparentTearOutPane(itemId, target) {
        let me         = this,
            {windowId} = target,
            app        = Neo.apps[windowId],
            pane       = me.paneCache[itemId];

        me.tearOutPanes[itemId] && Object.assign(me.tearOutPanes[itemId], target);

        if (me.tearOutEmbodiment.isStaged(itemId)) {
            return me.tearOutEmbodiment.promote({itemId, windowId}) !== false
        }

        if (!app || !pane || pane.isDestroyed) return false;

        if (pane.parent !== app.mainView) {
            pane.parent?.remove(pane, false);
            app.mainView.add(pane)
        }

        return true
    }

    /**
     * @summary Brings a torn-out item HOME on vessel death — the exact-position return.
     *
     * The stored `{tabsNodeId, index}` pair (captured at the detach terminal) is the placement
     * truth; recovery is SEMANTIC, never geometric: a stored home node that left the tree falls
     * back to the first surviving tabs node (append). Exact-once and idempotent: an item some
     * other flow already re-treed is left where it is, and the placement record is consumed
     * regardless. An item whose document no longer catalogs it, or a document with no surviving
     * tabs node, stays catalog-only — the honest terminal, with zero mutation.
     * @param {String} itemId
     * @protected
     */
    reintegrateTearOutItem(itemId) {
        let me         = this,
            placement  = me.tearOutPlacements[itemId],
            doc        = me.dockModel,
            storedHome = placement && doc.nodes?.[placement.tabsNodeId]?.type === 'tabs' ? placement.tabsNodeId : null,
            fallback   = storedHome || Object.entries(doc.nodes || {}).find(([, node]) => node.type === 'tabs')?.[0],
            result;

        delete me.tearOutPlacements[itemId];

        if (!doc.items?.[itemId] || !fallback || WorkspaceDocument.findContainingTabsId(doc, itemId)) {
            return
        }

        result = me.applyDockZoneOperation({
            operation : 'addTab',
            itemId,
            tabsNodeId: fallback,
            ...(storedHome ? {index: placement.index} : {})
        });

        result?.errors?.length === 0 && me.onDockZoneDocumentChange(result.document)
    }

    /**
     * Retirement authority is established before any awaited close: a vessel that binds while its
     * retirement is in flight is cleanup-only, and no content is ever staged into a closing realm.
     * The engine's `retireTearOutVessel` holds the fence; this host only reads it.
     * @param {Object} context
     * @param {String} context.itemId
     * @returns {Boolean}
     * @protected
     */
    admitTearOutConnection({itemId}) {
        for (const vessel of this.tearOutRetirements.values()) {
            if (vessel.itemId === itemId) return false
        }

        return true
    }

    /**
     * A vessel bound its reserved slot: the engine recorded the connection (pre-terminal) or moved the
     * committed pane into it (terminal-first). Pre-terminal, the SAME live pane embodies into the
     * vessel right away while a hidden exact-slot placeholder keeps the source tab/card indices
     * coherent — model truth stays untouched until the terminal. Terminal-first, the vessel becomes a
     * dock target. The instance moves trees; nothing is recreated.
     * @param {Object} context
     * @param {Neo.controller.Application} context.app
     * @param {Object} context.connection
     * @param {String} context.itemId
     * @param {String} context.windowId
     * @protected
     */
    async afterTearOutWindowConnect({app, connection, itemId, windowId}) {
        let me = this;

        if (me.tearOutPanes[itemId]?.windowId === windowId) {
            await me.registerVesselWorkspaceTarget({app, itemId, windowId});
            return
        }

        const staged = await me.tearOutEmbodiment.stage({itemId, windowId});

        // A re-entry, cancel or physical death may retire the vessel while the cross-window render
        // transaction is still painting; the connection this stage began for is then gone, and a dead
        // generation must never publish itself. A terminal landing meanwhile promoted the stage.
        if (
            staged && (me.isDestroyed || (
                me.tearOutConnects[itemId] !== connection && me.tearOutPanes[itemId]?.windowId !== windowId
            ))
        ) {
            me.tearOutEmbodiment.restore({itemId, windowId})
        }
    }

    /**
     * A vessel window left the shared heap. Physical death is authoritative: before the engine clears
     * the ownership records and brings a committed item home, this host retires what only it knows —
     * the native drop candidate, the target-proxy embodiment, a pane still staged in the dying realm,
     * and a committed vessel WORKSPACE, whose whole stack comes home atomically or, when recovery is
     * refused, survives headless as the only A+B truth.
     * @param {Object} data
     * @param {String} data.groupId
     * @param {String} data.windowId
     * @protected
     */
    async onTopologyRelease(data) {
        let me         = this,
            {windowId} = data;

        if (me.isDestroyed || data.groupId !== me.topologyGroupId) return;

        // Physical source death is the one cancellation that must NOT attempt a restore. Retire
        // the coordinator's exact candidate/retry generation before the vessel machines clear
        // their matching slots.
        Neo.manager.DragCoordinator?.clearNativeWindowDropCandidate(windowId, {restoreSource: false});
        Neo.manager.DragCoordinator?.endNativeGesture(windowId);

        // A disconnect can invalidate either side of the nested popup→target-proxy transaction.
        // Restore it before the outer main→popup embodiment decides restore vs promote.
        me.vesselProxyEmbodiment.restoreByWindow(windowId);

        const
            committedItemId = Object.entries(me.tearOutPanes).find(([, entry]) => entry.windowId === windowId)?.[0],
            itemId          = committedItemId ?? Object.entries(me.tearOutConnects).find(([, entry]) => entry.windowId === windowId)?.[0];

        if (itemId && me.tearOutEmbodiment.isStaged(itemId)) {
            const sourceOwns = Boolean(WorkspaceDocument.findContainingTabsId(me.dockModel, itemId));

            me.tearOutEmbodiment[sourceOwns ? 'restore' : 'promote']({itemId, windowId})
        }

        if (committedItemId) {
            const
                workspaceId = Workspace.vesselWorkspaceId(committedItemId),
                state       = me.vesselWorkspaces.get(workspaceId);

            if (
                state?.committed && Object.keys(state.document?.items || {}).length &&
                !me.recoverDisconnectedVesselWorkspace(committedItemId)
            ) {
                // Recovery refused: the headless document is the only surviving A+B truth, so the item
                // does not come home and only the dead render-target seams go.
                const entry = me.tearOutPanes[committedItemId];

                delete me.tearOutPanes[committedItemId];
                delete me.tearOutConnects[committedItemId];
                me.clearTearOutAdmission(committedItemId);
                me.tearOutHandlers?.onVesselRetired({...entry, itemId: committedItemId});
                me.afterTearOutWindowDisconnect({committed: true, data, entry, itemId: committedItemId, pane: null, recovered: false});
                me.demoteDisconnectedVesselWorkspace(state);
                return
            }

            if (
                state?.committed &&
                me.lastCrossWindowTransfer?.sourceWorkspaceId === workspaceId &&
                me.lastCrossWindowTransfer.targetWorkspaceId === Workspace.MAIN_WORKSPACE_ID
            ) {
                me.lastCrossWindowTransfer.topologyExited = true;
                me.lastCrossWindowTransfer.phases ??= [];
                me.lastCrossWindowTransfer.phases.push('topology-exited')
            }

            me.retireVesselWorkspaceTarget(committedItemId)
        }

        await super.onTopologyRelease(data)
    }

    /**
     * The engine cleared a vessel's ownership records — on its release, its lease running out, or a
     * refused recovery — and brought a committed item home. The park and native-park machines, the
     * park geometry and, unless the workspace survives headless, the vessel target retire with it.
     * @param {Object} data
     * @param {String} data.itemId
     * @param {Boolean} [data.recovered=true] `false` when the vessel's workspace stays registered headless.
     * @protected
     */
    afterTearOutWindowDisconnect({itemId, recovered=true}) {
        let me = this;

        delete me.tearOutParkGeometries[itemId];
        me.vesselParkHandlers.onVesselRetired({itemId, retirement: true});
        me.nativeVesselParkHandlers.onVesselRetired({itemId, retirement: true});
        recovered && me.retireVesselWorkspaceTarget(itemId)
    }

    /**
     * @summary Creates the film-only cursor that rides one gesture executor's own coordinates.
     *
     * CDP-dispatched pointer events move no OS cursor, so an unassisted take reads as
     * UI-moving-itself. The create shape carries the required `className`, floating-component
     * mount pair, stable `document.body` parent, and owning `windowId` for every subsequent
     * style delta.
     * @param {Number} clientX
     * @param {Number} clientY
     * @param {String|Number} [windowId=this.windowId]
     * @returns {Neo.component.Base}
     * @protected
     */
    createFilmCursorDot(clientX, clientY, windowId=this.windowId) {
        let me        = this,
            cursorDot = Neo.create({
                className    : 'Neo.component.Base',
                appName      : me.appName,
                autoInitVnode: true,
                autoMount    : true,
                parentId     : 'document.body',
                windowId,
                cls          : ['film-cursor'],
                style        : {
                    backgroundColor: 'rgba(255, 90, 0, 0.92)',
                    borderRadius   : '50%',
                    boxShadow      : '0 0 10px rgba(255, 90, 0, 0.95), 0 0 3px rgba(255, 255, 255, 0.85)',
                    display        : 'block',
                    height         : '16px',
                    left           : `${clientX - 8}px`,
                    pointerEvents  : 'none',
                    position       : 'fixed',
                    top            : `${clientY - 8}px`,
                    width          : '16px',
                    zIndex         : 99999
                }
            });

        cursorDot.mountedPromise.then(() => {
            console.log(`[film-cursor] dot mounted in ${windowId} at client (${clientX}, ${clientY})`)
        });

        return cursorDot
    }

    /**
     * @summary Retires one film cursor from component, VDOM, and physical body-node truth.
     * @param {Neo.component.Base|null} cursorDot
     * @returns {Promise<Boolean>} True after a live cursor's physical removal is acknowledged.
     * @protected
     */
    async retireFilmCursorDot(cursorDot) {
        if (!cursorDot || cursorDot.isDestroyed) {
            return false
        }

        const removalReceipt = Neo.applyDeltas(cursorDot.windowId, {
            action: 'removeNode',
            id    : cursorDot.vdom.id
        });

        // Retire component truth without dispatching a second physical delta. Awaiting the
        // explicit receipt keeps cross-window replacement creation behind source-node removal.
        cursorDot.destroy();
        await removalReceipt;

        return true
    }

    /**
     * @summary Drives the in-window showcase beat through real simulated pointer input.
     *
     * One live tab crosses at least two foreign zones and two placement kinds. Each dwell first
     * seeds the target zone's indicator menu, then aims at the indicator component's OWN computed
     * geometry; the receipt comes from `DockDragAffordances`' live `activeCandidate.preview`, never
     * a parallel DOM or pointer inference. Commit compares the resulting document with the exact
     * preview operation applied to the pre-gesture document. Cancel proves byte-identical document
     * truth and fully retired overlay/session state.
     * @param {Object} step
     * @param {Object[]} step.dwells Ordered `{targetNodeId, placementKind}` dwell requests.
     * @param {String} step.itemId The live dock item to drag.
     * @param {String} step.sourceNodeId The tabs node currently holding it.
     * @param {'commit'|'cancel'} [step.terminal='commit']
     * @param {Object} [options={}]
     * @param {Number} [options.dwellDelay=120] Milliseconds each accepted preview stays visible.
     * @param {Number} [options.moveDelay=16] Milliseconds between pointer samples.
     * @param {Number} [options.moveSteps=12] Samples per path leg.
     * @param {Number} [options.safetyMargin=48] Required inset from every window edge.
     * @param {Boolean} [options.showCursor=false] Film mode: show the shared synthetic cursor.
     * @returns {Promise<Object>}
     */
    async executeCrossZoneShowcaseStep(step, {dwellDelay=120, moveDelay=16, moveSteps=12, safetyMargin=48, showCursor=false}={}) {
        let me = this,
            {dwells=[], itemId, sourceNodeId, terminal='commit'} = step || {},
            document                                 = me.dockModel,
            sourceNode                               = document?.nodes?.[sourceNodeId],
            button                                   = null,
            cursorDot                                = null,
            lastPoint                                = null,
            proxyPopupEnabled                        = null,
            restoreProxyPopupConfig                  = () => {
                if (!sortZone || sortZone.isDestroyed || proxyPopupEnabled === null) {
                    return {after: null, before: proxyPopupEnabled, restored: false}
                }

                sortZone.enableProxyToPopup = proxyPopupEnabled;

                return {
                    after   : sortZone.enableProxyToPopup,
                    before  : proxyPopupEnabled,
                    restored: sortZone.enableProxyToPopup === proxyPopupEnabled
                }
            },
            sortZone                                 = null,
            tabs                                     = null,
            windowRect                               = null;

        if (!itemId || sourceNode?.type !== 'tabs' || !sourceNode.items.includes(itemId)) {
            return {applied: false, errors: ['cross-zone showcase must name a live item held by its source tabs node']}
        }

        if (!Array.isArray(dwells) || dwells.length < 2
            || new Set(dwells.map(dwell => dwell?.targetNodeId)).size < 2
            || new Set(dwells.map(dwell => dwell?.placementKind)).size < 2
            || dwells.some(dwell => !dwell?.targetNodeId || !dwell?.placementKind || dwell.targetNodeId === sourceNodeId)) {
            return {applied: false, errors: ['cross-zone showcase requires two distinct foreign zones and two distinct placement kinds']}
        }

        if (!['commit', 'cancel'].includes(terminal)) {
            return {applied: false, errors: [`unsupported cross-zone terminal '${terminal}'`]}
        }

        try {
            await me.refreshPromise;

            let host          = me.getReference('dock-host'),
                itemIndex     = sourceNode.items.indexOf(itemId),
                WindowManager = (await import('../../../src/manager/Window.mjs')).default;

            tabs     = host?.down({dockNodeId: sourceNodeId});
            sortZone = tabs?.getTabBar()?.sortZone;
            button   = tabs?.getTabAtIndex(itemIndex);

            let window       = WindowManager.get(button?.windowId),
                [buttonRect] = button ? await button.getDomRect([button.id], button.windowId) : [];

            if (!button || !sortZone || !buttonRect || !window?.innerRect) {
                return {applied: false, errors: ['cross-zone gesture surfaces are not ready']}
            }

            windowRect        = window.innerRect;
            proxyPopupEnabled = sortZone.enableProxyToPopup;
            // Tear-out hysteresis is measured against the SOURCE TOOLBAR, not the browser edge:
            // an ordinary cross-zone path necessarily leaves that strip. Disarm only the popup
            // conversion branch for this gesture; `finally` restores the live config on every
            // terminal. The window inset below remains a visual-stage safety rule.
            sortZone.enableProxyToPopup = false;

            let documentBefore = WorkspaceDocument.clone(document),
                startX         = buttonRect.x + buttonRect.width / 2,
                startY         = buttonRect.y + buttonRect.height / 2,
                directionX     = startX > window.innerRect.width  / 2 ? -1 : 1,
                directionY     = startY > window.innerRect.height / 2 ? -1 : 1,
                opt            = (clientX, clientY, buttons) => ({
                    bubbles   : true,
                    button    : 0,
                    buttons,
                    cancelable: true,
                    clientX,
                    clientY,
                    screenX   : window.innerRect.x + clientX,
                    screenY   : window.innerRect.y + clientY
                }),
                safe           = ({x, y}) => Number.isFinite(x) && Number.isFinite(y)
                    && x >= safetyMargin && y >= safetyMargin
                    && x <= window.innerRect.width  - safetyMargin
                    && y <= window.innerRect.height - safetyMargin,
                releaseAt      = point => ({
                    clientX: point?.x ?? startX,
                    clientY: point?.y ?? startY,
                    screenX: window.innerRect.x + (point?.x ?? startX),
                    screenY: window.innerRect.y + (point?.y ?? startY)
                }),
                waitUntil      = async (predicate, attempts=120) => {
                    for (let attempt = 0; attempt <= attempts && !me.isDestroyed; attempt++) {
                        if (predicate()) return true;

                        attempt < attempts && await me.timeout(16)
                    }

                    return Boolean(predicate())
                },
                moveTo         = (x, y) => {
                    if (cursorDot) {
                        cursorDot.style = {...cursorDot.style, left: `${x - 8}px`, top: `${y - 8}px`}
                    }

                    return me.interactionService.simulateEvent({events: [{
                        delay  : moveDelay,
                        // Once the sort starts, its render can replace the source button DOM identity.
                        // Native drag sensors are document-global after arming, so keep the synthetic
                        // stream on the same stable owner instead of addressing a stale source node.
                        targetId: 'document.body',
                        type    : 'mousemove',
                        windowId: button.windowId,
                        options : opt(x, y, 1)
                    }]})
                },
                walkTo         = async point => {
                    if (!safe(point)) {
                        throw new Error(`cross-zone path point violates the ${safetyMargin}px window-edge margin`)
                    }

                    let from     = lastPoint,
                        distance = from ? Math.hypot(point.x - from.x, point.y - from.y) : 0,
                        steps    = distance < 1 ? 1 : Math.max(2, Math.floor(moveSteps));

                    for (let index = 1; index <= steps; index++) {
                        let ratio = index / steps;

                        await moveTo(
                            Math.round(from.x + (point.x - from.x) * ratio),
                            Math.round(from.y + (point.y - from.y) * ratio)
                        )
                    }

                    lastPoint = point
                },
                overlaysRetired = () => !me.dragAffordances.dragGeometry
                    && !me.dragAffordances.indicators?.candidateSet
                    && !me.dragAffordances.indicators?.activeCandidate
                    && !me.dragAffordances.preview?.dockPreview;

            if (!safe({x: startX, y: startY})) {
                return {applied: false, errors: [`source tab violates the ${safetyMargin}px window-edge margin`]}
            }

            let armOne = {x: startX + directionX * 8,  y: startY + directionY * 2},
                armTwo = {x: startX + directionX * 16, y: startY + directionY * 24};

            if (![armOne, armTwo].every(safe)) {
                return {applied: false, errors: [`drag-arming path violates the ${safetyMargin}px window-edge margin`]}
            }

            await me.interactionService.simulateEvent({events: [{
                targetId: button.id,
                type    : 'mousedown',
                windowId: button.windowId,
                options : opt(startX, startY, 1)
            }, {
                delay   : 120,
                targetId: button.id,
                type    : 'mousemove',
                windowId: button.windowId,
                options : opt(armOne.x, armOne.y, 1)
            }]});

            lastPoint = armOne;

            if (!await me.waitForTearOutDragArmed(sortZone)) {
                let cancellation = await me.cancelTearOutGesture(
                    button,
                    releaseAt(lastPoint),
                    {sortZone, targetId: 'document.body'}
                );

                return {applied: false, errors: ['cross-zone drag did not arm'], proof: {cancellation}}
            }

            // The first threshold-crossing move can replace the source tab DOM. Only after the
            // sensor reports its document-global ownership do we advance on the stable carrier.
            await moveTo(armTwo.x, armTwo.y);
            lastPoint = armTwo;

            showCursor && (cursorDot = me.createFilmCursorDot(lastPoint.x, lastPoint.y));

            let geometry = await me.dragAffordances.ensureGeometry();

            if (!geometry) {
                throw new Error('cross-zone geometry did not become measurable')
            }

            let beats        = [],
                finalPreview = null;

            for (let [index, dwell] of dwells.entries()) {
                let zone = geometry.zones.find(entry => entry.nodeId === dwell.targetNodeId);

                if (!zone) {
                    throw new Error(`cross-zone target '${dwell.targetNodeId}' is not measurable`)
                }

                let seedPoint = {
                    x: Math.round(zone.rect.x + zone.rect.width  / 2),
                    y: Math.round(zone.rect.y + zone.rect.height / 2)
                };

                await walkTo(seedPoint);

                let candidateSetReady = await waitUntil(() =>
                    me.dragAffordances.indicators?.candidateSet?.zone?.nodeId === dwell.targetNodeId);

                if (!candidateSetReady) {
                    throw new Error(
                        `indicator set did not settle on '${dwell.targetNodeId}' — ` +
                        `current=${me.dragAffordances.indicators?.candidateSet?.zone?.nodeId ?? 'null'} ` +
                        `seed=(${seedPoint.x},${seedPoint.y}) zones=${geometry.zones.map(entry => entry.nodeId).join(',')} ` +
                        `dragProxy=${Boolean(sortZone.dragProxy)} startIndex=${sortZone.startIndex} currentIndex=${sortZone.currentIndex}`
                    )
                }

                let indicators = me.dragAffordances.indicators,
                    candidate  = indicators.candidateSet.cross
                        .find(entry => entry.preview?.placement?.kind === dwell.placementKind),
                    indicatorPoint = candidate && indicators.getCandidateHitPoint(candidate.preview?.previewId);

                if (!candidate || !indicatorPoint) {
                    throw new Error(`indicator hit geometry is unavailable for '${dwell.placementKind}'`)
                }

                await walkTo(indicatorPoint);

                let candidateActive = await waitUntil(() =>
                    indicators.activeCandidate?.preview?.previewId === candidate.preview.previewId);

                if (!candidateActive) {
                    throw new Error(`indicator '${candidate.preview.previewId}' never became active`)
                }

                dwellDelay > 0 && await me.timeout(dwellDelay);

                // The dwell is a TOCTOU window: the candidate verified active above can be lost
                // while it elapses — a human-pause dwell can outlive the gesture claim's
                // arbitration TTL, retiring the candidate mid-gesture — or be preempted by a
                // competing candidate. Re-verify identity before the read: a loss or swap fails
                // the step through the receipts channel naming the gate, instead of an
                // unattributed null-read or a silently adopted wrong preview here.
                let preview = indicators.activeCandidate?.preview;

                if (preview?.previewId !== candidate.preview.previewId) {
                    throw new Error(
                        `active candidate '${candidate.preview.previewId}' lost during the ${dwellDelay}ms dwell — ` +
                        `gate=dwell-reverify active=${preview?.previewId ?? 'null'} ` +
                        `dwell=${index + 1}/${dwells.length} target='${dwell.targetNodeId}' placement='${dwell.placementKind}'`
                    )
                }

                finalPreview = JSON.parse(JSON.stringify(preview));
                beats.push({
                    dwell        : index + 1,
                    placementKind: preview.placement.kind,
                    previewId    : preview.previewId,
                    targetNodeId : preview.target.nodeId
                })
            }

            if (terminal === 'cancel') {
                let cancellation = await me.cancelTearOutGesture(
                        button,
                        releaseAt(lastPoint),
                        {sortZone, targetId: 'document.body'}
                    ),
                    retired      = await waitUntil(overlaysRetired),
                    documentAfter = WorkspaceDocument.clone(me.dockModel),
                    unchanged     = JSON.stringify(documentAfter) === JSON.stringify(documentBefore),
                    popupConfig   = restoreProxyPopupConfig();

                return {
                    applied  : false,
                    beatLog  : beats,
                    cancelled: true,
                    errors   : cancellation.settled && retired && unchanged
                        ? []
                        : ['cross-zone cancel left drag, document, or overlay residue'],
                    proof : {
                        cancellation,
                        documentAfter,
                        documentBefore,
                        documentsUnchanged: unchanged,
                        overlaysRetired   : retired,
                        popupConfig
                    }
                }
            }

            let descriptor     = previewToOperation(finalPreview),
                expectedResult = descriptor && Operations.applyOperation(
                    WorkspaceDocument.clone(documentBefore),
                    descriptor
                );

            if (!descriptor || !expectedResult || expectedResult.errors?.length || !expectedResult.document) {
                throw new Error('final active preview did not resolve to one valid document operation')
            }

            let expectedDocument   = WorkspaceDocument.clone(expectedResult.document),
                expectedSerialized = JSON.stringify(expectedDocument);

            await me.interactionService.simulateEvent({events: [{
                targetId: 'document.body',
                type    : 'mouseup',
                windowId: button.windowId,
                options : opt(lastPoint.x, lastPoint.y, 0)
            }]});

            let settled = await waitUntil(() => JSON.stringify(me.dockModel) === expectedSerialized);

            settled && await me.refreshPromise;

            let documentAfter          = WorkspaceDocument.clone(me.dockModel),
                documentMatchesPreview = JSON.stringify(documentAfter) === expectedSerialized,
                retired                = await waitUntil(overlaysRetired),
                popupConfig            = restoreProxyPopupConfig(),
                applied                = settled && documentMatchesPreview && retired && popupConfig.restored;

            return {
                applied,
                beatLog: beats,
                errors : applied ? [] : ['cross-zone commit did not equal the previewed operation or retire its overlays'],
                proof  : {
                    descriptor,
                    documentAfter,
                    documentBefore,
                    documentMatchesPreview,
                    expectedDocument,
                    finalPreview,
                    overlaysRetired: retired,
                    popupConfig
                }
            }
        } catch (error) {
            let clientX = lastPoint?.x ?? 0,
                clientY = lastPoint?.y ?? 0;

            button && await me.cancelTearOutGesture(
                button,
                {
                    clientX,
                    clientY,
                    screenX: (windowRect?.x ?? 0) + clientX,
                    screenY: (windowRect?.y ?? 0) + clientY
                },
                {sortZone, targetId: 'document.body'}
            ).catch(() => {});

            return {applied: false, errors: [error?.message || String(error)]}
        } finally {
            restoreProxyPopupConfig();
            await me.retireFilmCursorDot(cursorDot)
        }
    }

    /**
     * @summary Reads the semantic, rendered, arbitration, and physical-park truth for one
     * cross-window pointer frame.
     *
     * The film executors use this as their pre-release gate: mouseup is withheld until the
     * coordinator has exactly one stable claim, its winning target is engaged, and the target's
     * semantic preview equals the preview rendered in that window. A converting tear-out can add
     * `parkedItemId`, which additionally requires the exact source vessel to be strictly parked.
     * @param {Object} context
     * @param {String|null} [context.parkedItemId=null]
     * @param {Neo.dashboard.dock.interaction.TabSortZone|null} [context.sourceZone=null]
     * @param {String|null} [context.sourceZoneId=null] Clone-safe Neural Link alternative.
     * @param {String} context.targetWorkspaceId
     * @returns {Object}
     * @protected
     */
    readCrossWindowGestureSnapshot({parkedItemId=null, sourceZone=null, sourceZoneId=null, targetWorkspaceId}={}) {
        sourceZone ??= sourceZoneId ? Neo.get(sourceZoneId) : null;

        let me            = this,
            isMain        = targetWorkspaceId === Workspace.MAIN_WORKSPACE_ID,
            state         = isMain ? null : me.vesselWorkspaces.get(targetWorkspaceId),
            participation = me.crossWindowParticipations.get(targetWorkspaceId),
            target        = participation?.target,
            coordinator   = sourceZone?.dragCoordinator,
            arbiter       = coordinator?.pointerClaimArbiter,
            winner        = arbiter?.resolve?.() ?? null,
            semantic      = target?.currentPreview ?? null,
            renderer      = isMain ? me.dragAffordances?.preview : state?.preview,
            rendered      = renderer?.dockPreview ?? null,
            indicatorMenu = isMain ? me.dragAffordances?.indicators : state?.indicators,
            indicatorSet  = indicatorMenu?.candidateSet ?? null,
            sensor        = sourceZone?.vesselConversionSensor,
            parkedVessel  = me.vesselParkHandlers?.parkedVessel ?? null,
            sourceVessel  = parkedItemId && me.resolveTearOutVessel(parkedItemId),
            targetProxy   = parkedItemId && me.vesselProxyEmbodiment.snapshot(parkedItemId),
            snapshot      = {
                claimCount: arbiter?.claimCount ?? 0,
                converted : sensor?.converted === true && sensor?.transitioning !== true,
                engaged   : coordinator?.activeTargetZone === target,
                indicators: indicatorSet ? {
                    activePreviewId: indicatorMenu.activeCandidate?.preview?.previewId ?? null,
                    candidateCount : (indicatorSet.cross?.length ?? 0) + (indicatorSet.root?.chips?.length ?? 0),
                    itemId         : indicatorSet.itemId ?? null,
                    visible        : !indicatorMenu.cls?.includes?.('neo-dashboard-dock-drop-indicators-hidden')
                } : null,
                parkedItemId: parkedVessel?.itemId ?? null,
                parkReceipt : me.lastVesselParkReceipt
                    ? WorkspaceDocument.clone(me.lastVesselParkReceipt)
                    : null,
                preview              : semantic ? WorkspaceDocument.clone(semantic) : null,
                rendered             : rendered ? WorkspaceDocument.clone(rendered) : null,
                sourceVesselConnected: Boolean(
                    sourceVessel?.windowId && Neo.manager?.Window?.get(sourceVessel.windowId)
                ),
                sourceVesselWindowId: sourceVessel?.windowId ?? null,
                restoreReceipt      : me.lastVesselRestoreReceipt
                    ? WorkspaceDocument.clone(me.lastVesselRestoreReceipt)
                    : null,
                targetProxy,
                targetWorkspaceId,
                winnerStableId      : winner?.stableId ?? null
            };

        snapshot.ready = snapshot.claimCount === 1
            && snapshot.engaged
            && snapshot.winnerStableId === targetWorkspaceId
            && Boolean(snapshot.preview?.previewId)
            && snapshot.rendered?.previewId === snapshot.preview.previewId
            && snapshot.indicators?.activePreviewId === snapshot.preview.previewId
            && (parkedItemId == null || (
                snapshot.converted && snapshot.parkedItemId === parkedItemId &&
                snapshot.sourceVesselConnected &&
                snapshot.indicators?.itemId === parkedItemId &&
                snapshot.indicators.candidateCount >= 5 &&
                snapshot.indicators.visible &&
                targetProxy?.itemId === parkedItemId &&
                targetProxy.ownsPane &&
                targetProxy.settled &&
                targetProxy.sourceWindowId === snapshot.sourceVesselWindowId &&
                targetProxy.targetWindowId === target?.windowId &&
                targetProxy.visible
            ));

        return snapshot
    }

    /**
     * @summary Polls one exact cross-window transfer through model adoption and queued projection.
     * @param {Object} expected
     * @param {String} expected.sourceWorkspaceId
     * @param {String} expected.targetWorkspaceId
     * @param {Object} [options={}]
     * @param {Number} [options.attempts=240]
     * @param {Number} [options.delay=16]
     * @returns {Promise<Object|null>}
     * @protected
     */
    async waitForCrossWindowTransfer(expected, {attempts=240, delay=16}={}) {
        let me = this,
            receipt;

        for (let attempt = 0; attempt <= attempts && !me.isDestroyed; attempt++) {
            receipt = me.lastCrossWindowTransfer;

            if (
                receipt?.applied === true && receipt.reconciled === true &&
                receipt.sourceWorkspaceId === expected?.sourceWorkspaceId &&
                receipt.targetWorkspaceId === expected?.targetWorkspaceId
            ) {
                return receipt
            }

            attempt < attempts && await me.timeout(delay)
        }

        return receipt ?? null
    }

    /**
     * @summary Scene 3's real-pointer executor: converts a second tear-out while the gesture remains
     * down, parks that exact OS window over a committed sibling vessel, and releases only after one
     * semantic + rendered target claim has settled.
     *
     * The source stays on the ordinary tab-drag path. It first crosses the source workspace boundary
     * to acquire its real vessel; subsequent events keep source-local coordinates outside while
     * moving in global screen space over the target vessel. The landed conversion sensor and
     * coordinator therefore own the park, preview, arbitration, and atomic transfer. This method
     * drives and reports those seams; it never calls a reducer or target commit directly.
     * @param {Object} step
     * @param {String} step.itemId Incoming pane id.
     * @param {String} step.sourceNodeId Main-workspace tabs node currently holding the pane.
     * @param {String} step.targetItemId Existing detached pane whose vessel becomes the target.
     * @param {Object} [options={}]
     * @param {Number} [options.attempts=240]
     * @param {Number} [options.dwellDelay=0] Optional headed-witness hold after target readiness.
     * @param {Number} [options.moveDelay=16]
     * @param {Number} [options.moveSteps=4]
     * @param {Boolean} [options.showCursor=false] Film mode: show the synthetic cursor in whichever
     * window currently owns the visible leg of the gesture.
     * @returns {Promise<Object>}
     */
    async executeCrossWindowDockStep(
        step,
        {attempts=240, dwellDelay=0, moveDelay=16, moveSteps=4, showCursor=false}={}
    ) {
        let me                                   = this,
            {itemId, sourceNodeId, targetItemId} = step || {},
            targetWorkspaceId                    = Workspace.vesselWorkspaceId(targetItemId),
            targetState                          = targetWorkspaceId && me.vesselWorkspaces.get(targetWorkspaceId),
            sourceDocument                       = me.dockModel,
            sourceNode                           = sourceDocument?.nodes?.[sourceNodeId],
            button                               = null,
            cursorDot                            = null,
            release                              = null,
            sortZone                             = null;

        if (
            !itemId || !targetItemId || itemId === targetItemId ||
            sourceNode?.type !== 'tabs' || !sourceNode.items.includes(itemId)
        ) {
            return {applied: false, errors: ['cross-window dock step must name distinct live source and target panes']}
        }
        if (
            !targetState || targetState.committed || targetState.closeRequested ||
            !me.tearOutPanes[targetItemId]
        ) {
            return {applied: false, errors: ['target vessel is not an available first-dock workspace']}
        }

        let pane = me.paneCache[itemId];

        if (!pane || pane.isDestroyed || !sourceDocument.items?.[itemId]) {
            return {applied: false, errors: ['incoming pane is not live and owned by the main workspace']}
        }

        try {
            await me.refreshPromise;
            targetState.participationPromise && await targetState.participationPromise;

            let host          = me.getReference('dock-host'),
                tabs          = host?.down({dockNodeId: sourceNodeId}),
                itemIndex     = sourceNode.items.indexOf(itemId),
                WindowManager = (await import('../../../src/manager/Window.mjs')).default;

            button   = tabs?.getTabAtIndex(itemIndex);
            sortZone = tabs?.getTabBar()?.sortZone;

            let [buttonRect] = button ? await button.getDomRect([button.id], button.windowId) : [],
                sourceWindow = WindowManager.get(button?.windowId),
                targetWindow = WindowManager.get(targetState.windowId);

            if (
                !button || !sortZone || !buttonRect || !sourceWindow?.innerRect ||
                !targetWindow?.innerRect || !targetState.participation
            ) {
                return {applied: false, errors: ['cross-window dock gesture surfaces are not ready']}
            }

            let startX  = buttonRect.x + buttonRect.width / 2,
                startY  = buttonRect.y + buttonRect.height / 2,
                startSX = sourceWindow.innerRect.x + startX,
                startSY = sourceWindow.innerRect.y + startY,
                opt     = (clientX, clientY, screenX, screenY, buttons) => ({
                    bubbles: true, button: 0, buttons, cancelable: true,
                    clientX, clientY, screenX, screenY
                }),
                moveCursor = (clientX, clientY) => {
                    if (cursorDot) {
                        cursorDot.style = {
                            ...cursorDot.style,
                            left: `${clientX - 8}px`,
                            top : `${clientY - 8}px`
                        }
                    }
                };

            delete me.tearOutConnects[itemId];
            showCursor && (cursorDot = me.createFilmCursorDot(startX, startY, button.windowId));

            await me.interactionService.simulateEvent({events: [{
                targetId: button.id, type: 'mousedown', windowId: button.windowId,
                options : opt(startX, startY, startSX, startSY, 1)
            }, {
                delay  : 120, targetId: button.id, type: 'mousemove', windowId: button.windowId,
                options: opt(startX + 8, startY + 2, startSX + 8, startSY + 2, 1)
            }, {
                delay  : moveDelay, targetId: button.id, type: 'mousemove', windowId: button.windowId,
                options: opt(startX + 16, startY + 24, startSX + 16, startSY + 24, 1)
            }]});

            if (!await me.waitForTearOutDragArmed(sortZone)) {
                release = {clientX: startX, clientY: startY, screenX: startSX, screenY: startSY};

                let cancellation = await me.cancelTearOutGesture(button, release, {sortZone});

                return {
                    applied: false,
                    errors : ['cross-window source drag did not arm'],
                    proof  : {cancellation}
                }
            }

            let boundary = sortZone.boundaryContainerRect,
                right    = boundary.right  ?? boundary.x + boundary.width,
                bottom   = boundary.bottom ?? boundary.y + boundary.height,
                outX     = Math.round(right + 120),
                outY     = Math.round(bottom + 120);

            for (let index = 1; index <= moveSteps; index++) {
                let t       = index / moveSteps,
                    clientX = Math.round(startX + (outX - startX) * t),
                    clientY = Math.round(startY + (outY - startY) * t);

                moveCursor(clientX, clientY);

                await me.interactionService.simulateEvent({events: [{
                    delay  : moveDelay, targetId: button.id, type: 'mousemove', windowId: button.windowId,
                    options: opt(
                        clientX,
                        clientY,
                        sourceWindow.innerRect.x + clientX,
                        sourceWindow.innerRect.y + clientY,
                        1
                    )
                }]})
            }

            if (!await me.waitForTearOutVessel(itemId, {attempts})) {
                release = {
                    clientX: outX,
                    clientY: outY,
                    screenX: sourceWindow.innerRect.x + outX,
                    screenY: sourceWindow.innerRect.y + outY
                };

                let cancellation = await me.cancelTearOutGesture(button, release, {sortZone});

                return {
                    applied: false,
                    errors : ['cross-window source vessel was not born while the gesture remained down'],
                    proof  : {cancellation}
                }
            }

            let remoteSnapshot;

            if (showCursor) {
                await me.retireFilmCursorDot(cursorDot);
                cursorDot = null
            }

            for (let attempt = 0; attempt <= attempts && !me.isDestroyed; attempt++) {
                targetWindow = WindowManager.get(targetState.windowId);

                if (!targetWindow?.innerRect) break;

                let targetClientX = Math.round(targetWindow.innerRect.width  / 2) + attempt % 2,
                    targetClientY = Math.round(targetWindow.innerRect.height / 2),
                    targetScreenX = Math.round(targetWindow.innerRect.x + targetClientX),
                    targetScreenY = Math.round(targetWindow.innerRect.y + targetClientY);

                showCursor && !cursorDot &&
                    (cursorDot = me.createFilmCursorDot(targetClientX, targetClientY, targetState.windowId));
                moveCursor(targetClientX, targetClientY);

                release = {clientX: outX, clientY: outY, screenX: targetScreenX, screenY: targetScreenY};

                await me.interactionService.simulateEvent({events: [{
                    delay  : moveDelay, targetId: button.id, type: 'mousemove', windowId: button.windowId,
                    options: opt(outX + attempt % 2, outY, targetScreenX, targetScreenY, 1)
                }]});

                let transition = sortZone.vesselConversionSensor?.transitionPromise;

                transition && await transition;
                remoteSnapshot = me.readCrossWindowGestureSnapshot({
                    parkedItemId: itemId,
                    sourceZone  : sortZone,
                    targetWorkspaceId
                });

                if (remoteSnapshot.ready) break
            }

            if (!remoteSnapshot?.ready) {
                let cancellation = await me.cancelTearOutGesture(button, release, {sortZone});

                return {
                    applied: false,
                    errors : ['target vessel did not reach one parked semantic + rendered claim'],
                    proof  : {cancellation, remoteSnapshot}
                }
            }

            dwellDelay > 0 && await me.timeout(dwellDelay);

            me.lastCrossWindowTransfer = null;

            await me.interactionService.simulateEvent({events: [{
                targetId: button.id, type: 'mouseup', windowId: button.windowId,
                options : opt(release.clientX, release.clientY, release.screenX, release.screenY, 0)
            }]});

            let transfer = await me.waitForCrossWindowTransfer({
                    sourceWorkspaceId: Workspace.MAIN_WORKSPACE_ID,
                    targetWorkspaceId
                }, {attempts}),
                sourceAfter = WorkspaceDocument.clone(me.dockModel),
                targetAfter = WorkspaceDocument.clone(me.vesselWorkspaces.get(targetWorkspaceId)?.document),
                retired     = await me.waitForTearOutVesselRetired(itemId, {attempts}),
                targetItems = targetAfter?.nodes?.[Workspace.vesselTabsNodeId(targetItemId)]?.items || [],
                sourceOwns  = WorkspaceDocument.findContainingTabsId(sourceAfter, itemId) != null
                    || WorkspaceDocument.findContainingTabsId(sourceAfter, targetItemId) != null,
                applied     = transfer?.reconciled === true && retired && !sourceOwns
                    && targetItems.length === 2
                    && targetItems[0] === targetItemId
                    && targetItems[1] === itemId;

            return {
                applied,
                errors: applied ? [] : ['cross-window dock did not settle as one A+B target adoption'],
                proof : {
                    remoteSnapshot,
                    sourceDocument     : sourceAfter,
                    sourceVesselRetired: retired,
                    targetDocument     : targetAfter,
                    transfer           : transfer ? WorkspaceDocument.clone(transfer) : null
                }
            }
        } catch (error) {
            button && await me.cancelTearOutGesture(button, release, {sortZone}).catch(() => {});

            return {applied: false, errors: [error?.message || String(error)]}
        } finally {
            await me.retireFilmCursorDot(cursorDot)
        }
    }

    /**
     * @summary Scene 4's real-pointer executor: drags a committed vessel's model-resolved stack
     * grip home and waits through atomic `transferNode`, main projection, native close request, and
     * physical topology exit.
     *
     * The pointer starts on the actual nested `.neo-dock-stack-handle`, so
     * {@link Neo.dashboard.dock.interaction.TabSortZone} authors the group payload. The executor never invokes
     * `transferNode` itself; it withholds mouseup until the main target's one semantic + rendered
     * claim settles, then observes the resulting receipt through window disconnect.
     * @param {Object} step
     * @param {String} step.ownerItemId The pane whose committed vessel owns the stack.
     * @param {Object} [options={}]
     * @param {Number} [options.attempts=240]
     * @param {Number} [options.moveDelay=16]
     * @param {Boolean} [options.showCursor=false] Film mode: move the synthetic cursor from the
     * committed vessel into the main window with the physical gesture.
     * @returns {Promise<Object>}
     */
    async executeStackReturnStep(step, {attempts=240, moveDelay=16, showCursor=false}={}) {
        let me            = this,
            {ownerItemId} = step || {},
            workspaceId   = Workspace.vesselWorkspaceId(ownerItemId),
            state         = workspaceId && me.vesselWorkspaces.get(workspaceId),
            button        = null,
            cursorDot     = null,
            handleId      = null,
            release       = null,
            sortZone      = null;

        if (!state?.committed || !state.document || !me.workspaceSet.has(workspaceId)) {
            return {applied: false, errors: ['stack return requires one committed vessel workspace']}
        }

        try {
            await me.refreshPromise;
            await me.crossWindowParticipationPromise;

            let nodeId        = WorkspaceDocument.resolveStackRoot(state.document),
                tabsNodeId    = Workspace.vesselTabsNodeId(ownerItemId),
                tabsNode      = state.document.nodes?.[tabsNodeId],
                activeItemId  = tabsNode?.activeItemId ?? tabsNode?.items?.[0],
                activeIndex   = tabsNode?.items?.indexOf(activeItemId) ?? -1,
                tabs          = state.host?.down({dockNodeId: tabsNodeId}),
                WindowManager = (await import('../../../src/manager/Window.mjs')).default;

            button   = tabs?.getTabAtIndex(activeIndex);
            sortZone = tabs?.getTabBar()?.sortZone;
            handleId = DockLayoutAdapter.stackHandleDomId(activeItemId);

            let [handleRect] = button && handleId
                    ? await button.getDomRect([handleId], button.windowId)
                    : [],
                sourceWindow = WindowManager.get(state.windowId),
                targetWindow = WindowManager.get(me.windowId);

            if (
                !nodeId || !button || !sortZone || !handleRect || !sourceWindow?.innerRect ||
                !targetWindow?.innerRect || !me.crossWindowParticipations.get(Workspace.MAIN_WORKSPACE_ID)
            ) {
                return {applied: false, errors: ['whole-stack gesture surfaces are not ready']}
            }

            let startX  = handleRect.x + handleRect.width / 2,
                startY  = handleRect.y + handleRect.height / 2,
                startSX = sourceWindow.innerRect.x + startX,
                startSY = sourceWindow.innerRect.y + startY,
                opt     = (clientX, clientY, screenX, screenY, buttons) => ({
                    bubbles: true, button: 0, buttons, cancelable: true,
                    clientX, clientY, screenX, screenY
                }),
                moveCursor = (clientX, clientY) => {
                    if (cursorDot) {
                        cursorDot.style = {
                            ...cursorDot.style,
                            left: `${clientX - 8}px`,
                            top : `${clientY - 8}px`
                        }
                    }
                };

            showCursor && (cursorDot = me.createFilmCursorDot(startX, startY, state.windowId));

            await me.interactionService.simulateEvent({events: [{
                targetId: handleId, type: 'mousedown', windowId: button.windowId,
                options : opt(startX, startY, startSX, startSY, 1)
            }, {
                delay  : 120, targetId: handleId, type: 'mousemove', windowId: button.windowId,
                options: opt(startX + 8, startY, startSX + 8, startSY, 1)
            }, {
                delay  : moveDelay, targetId: handleId, type: 'mousemove', windowId: button.windowId,
                options: opt(startX + 24, startY, startSX + 24, startSY, 1)
            }]});

            let armed = false;

            for (let attempt = 0; attempt <= 120 && !me.isDestroyed; attempt++) {
                armed = Boolean(sortZone.stackDragActive && sortZone.dragProxy && sortZone.dragCoordinator);

                if (armed) break;

                attempt < 120 && await me.timeout(16)
            }

            if (!armed) {
                release = {clientX: startX, clientY: startY, screenX: startSX, screenY: startSY};

                let cancellation = await me.cancelTearOutGesture(button, release, {sortZone, targetId: handleId});

                return {
                    applied: false,
                    errors : ['whole-stack source drag did not arm from the rendered grip'],
                    proof  : {
                        cancellation,
                        sourceArm: {
                            dockGroupNodeId: sortZone.dockGroupNodeId,
                            dragComponent  : sortZone.dragComponent?.id ?? null,
                            dragProxyReady : Boolean(sortZone.dragProxy),
                            stackDragActive: sortZone.stackDragActive === true,
                            startIndex     : sortZone.startIndex
                        }
                    }
                }
            }

            let remoteSnapshot;

            if (showCursor) {
                await me.retireFilmCursorDot(cursorDot);
                cursorDot = null
            }

            // The film gesture aims at the semantic return target itself: the indicator
            // menu's active candidate is selected geometrically, so the synthetic cursor
            // hovers the stored-home tabs node (window center can lie outside it).
            let storedHome   = me.tearOutPlacements[state.itemId]?.tabsNodeId,
                returnNodeId = me.dockModel.nodes?.[storedHome]?.type === 'tabs'
                    ? storedHome
                    : Object.entries(me.dockModel.nodes || {}).find(([, node]) => node.type === 'tabs')?.[0],
                returnHost   = me.dragAffordances?.host,
                returnNode   = returnNodeId && returnHost?.down({dockNodeId: returnNodeId}),
                [returnRect] = returnNode ? await returnHost.getDomRect([returnNode.id], me.windowId) : [];

            for (let attempt = 0; attempt <= attempts && !me.isDestroyed; attempt++) {
                targetWindow = WindowManager.get(me.windowId);

                if (!targetWindow?.innerRect) break;

                let targetClientX = returnRect
                        ? Math.round(returnRect.x + returnRect.width  / 2) + attempt % 2
                        : Math.round(targetWindow.innerRect.width  / 2) + attempt % 2,
                    targetClientY = returnRect
                        ? Math.round(returnRect.y + returnRect.height / 2)
                        : Math.round(targetWindow.innerRect.height / 2),
                    targetScreenX = Math.round(targetWindow.innerRect.x + targetClientX),
                    targetScreenY = Math.round(targetWindow.innerRect.y + targetClientY);

                showCursor && !cursorDot &&
                    (cursorDot = me.createFilmCursorDot(targetClientX, targetClientY, me.windowId));
                moveCursor(targetClientX, targetClientY);

                release = {
                    clientX: startX + 32,
                    clientY: startY,
                    screenX: targetScreenX,
                    screenY: targetScreenY
                };

                await me.interactionService.simulateEvent({events: [{
                    delay  : moveDelay, targetId: handleId, type: 'mousemove', windowId: button.windowId,
                    options: opt(
                        release.clientX + attempt % 2,
                        release.clientY,
                        release.screenX,
                        release.screenY,
                        1
                    )
                }]});

                remoteSnapshot = me.readCrossWindowGestureSnapshot({
                    sourceZone       : sortZone,
                    targetWorkspaceId: Workspace.MAIN_WORKSPACE_ID
                });

                if (remoteSnapshot.ready) break
            }

            if (!remoteSnapshot?.ready) {
                let cancellation = await me.cancelTearOutGesture(button, release, {sortZone, targetId: handleId});

                return {
                    applied: false,
                    errors : ['main workspace did not reach one semantic + rendered stack-return claim'],
                    proof  : {cancellation, remoteSnapshot}
                }
            }

            let sourceWindowId = state.windowId,
                sourceItemIds  = [
                    ...(state.document.nodes?.[nodeId]?.items || Object.keys(state.document.items || {}))
                ];

            me.lastCrossWindowTransfer = null;

            await me.interactionService.simulateEvent({events: [{
                targetId: handleId, type: 'mouseup', windowId: button.windowId,
                options : opt(release.clientX, release.clientY, release.screenX, release.screenY, 0)
            }]});

            let transfer = await me.waitForCrossWindowTransfer({
                sourceWorkspaceId: workspaceId,
                targetWorkspaceId: Workspace.MAIN_WORKSPACE_ID
            }, {attempts});

            for (let attempt = 0; attempt <= attempts && !me.isDestroyed; attempt++) {
                if (transfer?.topologyExited === true && !WindowManager.get(sourceWindowId)) break;

                attempt < attempts && await me.timeout(16)
            }

            let mainAfter        = WorkspaceDocument.clone(me.dockModel),
                targetNodeId     = remoteSnapshot.preview?.target?.nodeId,
                returnedItems    = mainAfter.nodes?.[targetNodeId]?.items || [],
                requiredPhases   = ['documents-adopted', 'main-projected', 'close-dispatched', 'topology-exited'],
                phaseOrder       = (transfer?.phases || []).filter(phase => requiredPhases.includes(phase)),
                sourceWindowGone = !WindowManager.get(sourceWindowId),
                applied          = transfer?.descriptor?.operation === 'transferNode'
                    && transfer.closeRequested === true
                    && transfer.topologyExited === true
                    && JSON.stringify(phaseOrder) === JSON.stringify(requiredPhases)
                    && sourceWindowGone
                    && sourceItemIds.every(itemId => returnedItems.includes(itemId));

            return {
                applied,
                errors: applied ? [] : ['whole-stack return did not settle through model-before-close topology exit'],
                proof : {
                    closeReceipt: me.lastTearOutClose ? WorkspaceDocument.clone(me.lastTearOutClose) : null,
                    mainDocument: mainAfter,
                    phaseOrder,
                    remoteSnapshot,
                    sourceItemIds,
                    sourceWindowGone,
                    sourceWindowId,
                    transfer    : transfer ? WorkspaceDocument.clone(transfer) : null
                }
            }
        } catch (error) {
            button && await me.cancelTearOutGesture(button, release, {sortZone, targetId: handleId}).catch(() => {});

            return {applied: false, errors: [error?.message || String(error)]}
        } finally {
            await me.retireFilmCursorDot(cursorDot)
        }
    }

    /**
     * @summary The app-owned tear-out journey executor — scene 2's real-pointer drive.
     *
     * Arms a tab drag, flings the proxy past the window boundary so
     * {@link Neo.dashboard.dock.interaction.TabSortZone} fires `dockTearOutExit`, the host opens a `?popout=`
     * vessel, then — gated on that vessel's ACTUAL birth (its slot binding through
     * {@link Neo.dashboard.dock.Workspace#onTopologyBind}) — survives
     * deliberate post-birth moves and settles one of three terminals: release while detached
     * (`dockTearOutTerminal` → the `detachItem` commit + adoption), Escape-cancel (zero-mutation
     * vessel close), or RE-ENTRY (`reenter` — the drag walks back inside past the reattach
     * threshold, the vessel retires MID-GESTURE with zero mutation and the in-window proxy
     * resumes: the film's back-IN morph beat, then cancelled cleanly).
     *
     * The proof is OBSERVABLE-ONLY — committed document truth + vessel bookkeeping, never the
     * machine's internal drag state. Path and pace are tunable for the film takes (D-010):
     * `curve` bows the pointer path (0 = straight, deterministic either way), `moveSteps` and
     * `moveDelay` set the sampling density and rhythm.
     * @param {Object} step
     * @param {String} step.itemId The dock item to tear out.
     * @param {String} step.sourceNodeId The tabs node currently holding it.
     * @param {Object} [options={}]
     * @param {Number} [options.birthAttempts=180] Vessel-birth poll attempts (16ms each) — film
     *     pacing widens this: vsync-limited boot can push the popup's shared-heap join past the
     *     default three-second gate.
     * @param {Boolean} [options.cancel=false] Escape while detached — the zero-mutation witness.
     * @param {Number} [options.curve=0] Perpendicular path bow as a fraction of path length.
     * @param {Number} [options.moveDelay=16] Milliseconds between pointer samples.
     * @param {Number} [options.moveSteps=4] Pointer samples per path leg.
     * @param {Number} [options.postBirthMoves=2] Outward moves after birth (survival probe; floored at 2).
     * @param {Boolean} [options.reenter=false] Walk back inside instead of releasing — the morph witness.
     * @param {Boolean} [options.showCursor=false] Film mode: ride a visible synthetic cursor dot on
     *     the logged pointer coordinates — CDP events move no OS cursor, and the camera needs one.
     * @returns {Promise<Object>}
     */
    async executeTearOutStep(step, {birthAttempts=180, cancel=false, curve=0, moveDelay=16, moveSteps=4, postBirthMoves=2, reenter=false, showCursor=false}={}) {
        let me                     = this,
            {itemId, sourceNodeId} = step || {},
            document               = me.dockModel,
            node                   = document?.nodes?.[sourceNodeId],
            button                 = null,
            cursorDot              = null,
            release                = null;

        if (!itemId || node?.type !== 'tabs' || !node.items.includes(itemId)) {
            return {applied: false, errors: ['tear-out step must name a live item held by a tabs node']}
        }

        let pane = me.paneCache[itemId];

        if (!pane || pane.isDestroyed || !document.items?.[itemId]) {
            return {applied: false, errors: ['source pane is not live and owned by the workspace']}
        }

        try {
            // Drain the host-owned projection queue before reading tab chrome.
            await me.refreshPromise;

            let host          = me.getReference('dock-host'),
                tabs          = host?.down({dockNodeId: sourceNodeId}),
                sortZone      = tabs?.getTabBar()?.sortZone,
                itemIndex     = node.items.indexOf(itemId),
                WindowManager = (await import('../../../src/manager/Window.mjs')).default;

            button = tabs?.getTabAtIndex(itemIndex);

            let window       = WindowManager.get(button?.windowId),
                [buttonRect] = button ? await button.getDomRect([button.id], button.windowId) : [];

            if (!button || !sortZone || !buttonRect || !window?.innerRect) {
                return {applied: false, errors: ['tear-out gesture surfaces are not ready']}
            }

            // The committed document BEFORE the gesture — the zero-mutation (cancel/reenter) and
            // detach-commit (terminal) proofs both compare against this snapshot.
            let documentBefore = WorkspaceDocument.clone(document),
                catalogBefore  = Object.keys(documentBefore.items);

            let startX  = buttonRect.x + buttonRect.width / 2,
                startY  = buttonRect.y + buttonRect.height / 2,
                startSX = window.innerRect.x + startX,
                startSY = window.innerRect.y + startY,
                opt     = (clientX, clientY, screenX, screenY, buttons) => ({
                    bubbles: true, button: 0, buttons, cancelable: true, clientX, clientY, screenX, screenY
                }),
                moveTo  = (x, y) => {
                    // The visible cursor rides the executor's own coordinate log — never a
                    // second derivation that could disagree with what the gesture actually did.
                    if (cursorDot) {
                        cursorDot.style = {...cursorDot.style, left: `${x - 8}px`, top: `${y - 8}px`}
                    }

                    return me.interactionService.simulateEvent({events: [{
                        delay  : moveDelay, targetId: button.id, type: 'mousemove', windowId: button.windowId,
                        options: opt(x, y, window.innerRect.x + x, window.innerRect.y + y, 1)
                    }]})
                };

            // A stale record from a prior gesture would false-open the birth gate.
            delete me.tearOutConnects[itemId];

            // Phase 1: own the native sensor + cross the LOCAL drag arming threshold (delay+distance).
            await me.interactionService.simulateEvent({events: [{
                targetId: button.id, type: 'mousedown', windowId: button.windowId,
                options : opt(startX, startY, startSX, startSY, 1)
            }, {
                delay  : 120, targetId: button.id, type: 'mousemove', windowId: button.windowId,
                options: opt(startX + 8, startY + 2, startSX + 8, startSY + 2, 1)
            }, {
                delay  : 16, targetId: button.id, type: 'mousemove', windowId: button.windowId,
                options: opt(startX + 16, startY + 24, startSX + 16, startSY + 24, 1)
            }]});

            // The drag arms ASYNC — gate on proxy + boundary + itemRects before any outward sample
            // or the exit never fires (arming precedes boundary moves).
            let armed = await me.waitForTearOutDragArmed(sortZone);

            if (!armed) {
                let cancellation = await me.cancelTearOutGesture(button, {clientX: startX, clientY: startY, screenX: startSX, screenY: startSY});

                return {applied: false, errors: ['tear-out drag did not arm'], proof: {armed: false, cancellation, documentBefore}}
            }

            if (showCursor) {
                cursorDot = me.createFilmCursorDot(startX, startY)
            }

            // Pre-birth entry sentinels: a curved outward path can transiently re-cover the strip
            // AFTER the exit fired, retiring the newborn vessel before it ever connects — the
            // birth-failure diag must carry whether that happened, or the death reads as absence.
            let preBirthBoundaryEntries = 0,
                preBirthEntries         = 0,
                preBirthBoundaryProbe   = () => {preBirthBoundaryEntries++},
                preBirthEntryProbe      = () => {preBirthEntries++};

            sortZone.on('dragBoundaryEntry', preBirthBoundaryProbe);
            tabs.on('dockTearOutEntry', preBirthEntryProbe);

            // The tear-out exit fires when the proxy LEAVES `boundaryContainerRect`. Target past
            // its bottom-right corner, fully outside, so intersectionRatio collapses below the
            // reattach threshold.
            let b       = sortZone.boundaryContainerRect,
                bRight  = b.right  ?? (b.x + b.width),
                bBottom = b.bottom ?? (b.y + b.height),
                outX    = Math.round(bRight  + 120),
                outY    = Math.round(bBottom + 120),
                outSX   = window.innerRect.x + outX,
                outSY   = window.innerRect.y + outY;

            release = {clientX: outX, clientY: outY, screenX: outSX, screenY: outSY};

            // The deterministic pointer path: a quadratic bow through a perpendicular control
            // point (curve=0 degenerates to the straight line). t runs 0→1 outward.
            let pathPoint = t => {
                let mx = startX + (outX - startX) / 2 + (outY - startY) * curve,
                    my = startY + (outY - startY) / 2 - (outX - startX) * curve,
                    ax = startX + (mx - startX) * t, ay = startY + (my - startY) * t,
                    bx = mx + (outX - mx) * t,       by = my + (outY - my) * t;

                return {x: Math.round(ax + (bx - ax) * t), y: Math.round(ay + (by - ay) * t)}
            };

            // Phase 2: PROGRESSIVE outward moves — each further out so intersectionRatio steps
            // down: dragBoundaryExit → dockTearOutExit → the host acquires the vessel.
            for (let stepIndex = 1; stepIndex <= moveSteps; stepIndex++) {
                let p = pathPoint(stepIndex / moveSteps);

                await moveTo(p.x, p.y)
            }

            // Gate on the vessel's ACTUAL birth: a `?popout=` window binding its reserved slot.
            let born = await me.waitForTearOutVessel(itemId, {attempts: birthAttempts});

            sortZone.un('dragBoundaryEntry', preBirthBoundaryProbe);
            tabs.un('dockTearOutEntry', preBirthEntryProbe);

            if (!born) {
                let diag         = `exitFired=${Boolean(sortZone.isWindowDragging)} vesselOpen=${JSON.stringify(me.lastVesselOpen ?? null)} preBirthBoundaryEntries=${preBirthBoundaryEntries} preBirthEntries=${preBirthEntries} lastRatio=${sortZone.lastIntersectionRatio} boundary=${JSON.stringify(b)} out=(${outX},${outY}) itemRects=${sortZone.itemRects?.length ?? 'null'}`,
                    cancellation = await me.cancelTearOutGesture(button, release);

                return {
                    applied: false,
                    errors : [`tear-out vessel was not born after the boundary exit — ${diag}`],
                    proof  : {armed: true, born: false, diag, cancellation, documentBefore}
                }
            }

            // Post-birth survival probe: deliberate OUTWARD moves must NOT reap the newborn vessel.
            let probeMoves = Math.max(2, postBirthMoves);

            for (let i = 1; i <= probeMoves; i++) {
                await moveTo(outX, outY + i * 12)
            }

            let survivedProbe = Boolean(me.tearOutConnects[itemId]);

            if (reenter) {
                // The morph beat: walk back INSIDE until the PROXY re-enters past the reattach
                // threshold — dockTearOutEntry retires the vessel MID-GESTURE with zero mutation
                // and the zone resumes its in-window embodiment. Then end the resumed in-window
                // drag with a clean cancel; the document stays byte-identical.
                //
                // The re-entry target is a point ~35% into the boundary rect, NOT the source
                // button: the tear-out proxy is pane-sized and the grab corner is unknown, so a
                // button near a window edge can never recover 60% overlap — the interior point
                // guarantees the ratio for any grab corner.
                let vesselWindowId    = me.tearOutConnects[itemId]?.windowId ?? null,
                    inX               = Math.round(b.x + (b.width  ?? 0) * 0.35),
                    inY               = Math.round(b.y + (b.height ?? 0) * 0.35),
                    boundaryEntrySeen = false,
                    entrySeen         = false,
                    boundaryProbe     = () => {boundaryEntrySeen = true},
                    entryProbe        = () => {entrySeen = true};

                sortZone.on('dragBoundaryEntry', boundaryProbe);
                tabs.on('dockTearOutEntry', entryProbe);

                for (let stepIndex = 1; stepIndex <= moveSteps; stepIndex++) {
                    let t = stepIndex / moveSteps;

                    await moveTo(
                        Math.round(outX + (inX - outX) * t),
                        Math.round(outY + (inY - outY) * t)
                    )
                }

                let retired     = await me.waitForTearOutVesselRetired(itemId),
                    reentryDiag = `boundaryEntrySeen=${boundaryEntrySeen} entrySeen=${entrySeen} isWindowDragging=${Boolean(sortZone.isWindowDragging)} reattachArmed=${Boolean(sortZone.reattachArmed)} lastRatio=${sortZone.lastIntersectionRatio} placeholder=${Boolean(sortZone.dragPlaceholder)} indexMap=${JSON.stringify(sortZone.indexMap)} ownerItems=${sortZone.owner?.items?.length} itemRectsLen=${sortZone.itemRects?.length} activeVessel=${Boolean(me.tearOutHandlers.activeVessel)} connects=${Boolean(me.tearOutConnects[itemId])} staged=${me.tearOutEmbodiment.isStaged(itemId)} boundary=${JSON.stringify(b)} in=(${inX},${inY}) vesselDims=${JSON.stringify(me.tearOutVesselDims)}`;

                sortZone.un('dragBoundaryEntry', boundaryProbe);
                tabs.un('dockTearOutEntry', entryProbe);

                let
                    cancellation  = await me.cancelTearOutGesture(button, {clientX: inX, clientY: inY, screenX: window.innerRect.x + inX, screenY: window.innerRect.y + inY}),
                    documentAfter = WorkspaceDocument.clone(me.dockModel),
                    windowGone    = !vesselWindowId || !WindowManager.get(vesselWindowId);

                return {
                    applied  : false,
                    errors   : retired ? [] : [`vessel did not retire on re-entry — ${reentryDiag}`],
                    reentered: retired,
                    proof    : {
                        born              : true,
                        survivedProbe,
                        retired,
                        windowGone,
                        cancellation,
                        documentBefore,
                        documentAfter,
                        documentsUnchanged: JSON.stringify(documentBefore) === JSON.stringify(documentAfter),
                        vesselWindowName  : `tearout-${itemId}`
                    }
                }
            }

            if (cancel) {
                // Escape while detached → dockTearOutCancel → the host closes its vessel. The
                // committed document must be byte-identical — the zero-mutation invariant.
                let cancellation  = await me.cancelTearOutGesture(button, release),
                    documentAfter = WorkspaceDocument.clone(me.dockModel);

                return {
                    applied  : false,
                    cancelled: true,
                    errors   : [],
                    proof    : {
                        born              : true,
                        survivedProbe,
                        cancellation,
                        documentBefore,
                        documentAfter,
                        documentsUnchanged: JSON.stringify(documentBefore) === JSON.stringify(documentAfter),
                        vesselWindowName  : `tearout-${itemId}`
                    }
                }
            }

            // Terminal: release while detached → dockTearOutTerminal → the detachItem commit +
            // adoption (the vessel owns the pane now).
            await me.interactionService.simulateEvent({events: [{
                targetId: button.id, type: 'mouseup', windowId: button.windowId,
                options : opt(outX, outY, outSX, outSY, 0)
            }]});

            let committed = await me.waitForTearOutCommit(itemId);

            committed && await me.refreshPromise;

            let
                documentAfter  = WorkspaceDocument.clone(me.dockModel),
                absentFromTree = !Object.values(documentAfter.nodes).some(zoneNode => zoneNode.items?.includes(itemId)),
                keptInCatalog  = Boolean(documentAfter.items?.[itemId]);

            return {
                applied: committed && absentFromTree && keptInCatalog,
                errors : committed && absentFromTree && keptInCatalog ? [] : ['detachItem commit did not reach committed document truth'],
                proof  : {
                    born              : true,
                    survivedProbe,
                    committed,
                    documentBefore,
                    documentAfter,
                    detachCommitted   : absentFromTree && keptInCatalog,
                    itemAbsentFromTree: absentFromTree,
                    itemKeptInCatalog : keptInCatalog,
                    catalogPreserved  : catalogBefore.every(id => Boolean(documentAfter.items?.[id])),
                    vesselWindowName  : `tearout-${itemId}`
                }
            }
        } catch (error) {
            button && await me.cancelTearOutGesture(button, release).catch(() => {});

            return {applied: false, errors: [error?.message || String(error)]}
        } finally {
            // The synthetic cursor is per-gesture presentation: it never outlives the take's
            // gesture, and it never enters worker truth (pointer-events:none, no dock document).
            await me.retireFilmCursorDot(cursorDot)
        }
    }

    /**
     * Polls until the base drag has ARMED — a live proxy AND the async main-thread
     * `boundaryContainerRect` AND measured `itemRects` are all present: exactly the facts
     * the sort zone needs before it will sample a boundary exit.
     * @param {Neo.draggable.container.SortZone} sortZone
     * @param {Object} [options={}]
     * @param {Number} [options.attempts=120]
     * @param {Number} [options.delay=16]
     * @returns {Promise<Boolean>}
     * @protected
     */
    async waitForTearOutDragArmed(sortZone, {attempts=120, delay=16}={}) {
        let me    = this,
            armed = () => Boolean(sortZone?.dragProxy && sortZone?.boundaryContainerRect && sortZone?.itemRects);

        for (let attempt = 0; attempt <= attempts && !me.isDestroyed; attempt++) {
            if (armed()) return true;

            attempt < attempts && await me.timeout(delay)
        }

        return armed()
    }

    /**
     * Gates on the tear-out vessel's ACTUAL birth: the `?popout=<itemId>` window binding its
     * reserved slot ({@link Neo.dashboard.dock.Workspace#onTopologyBind}). Polls that observable
     * rather than any internal drag flag.
     * @param {String} itemId
     * @param {Object} [options={}]
     * @param {Number} [options.attempts=180]
     * @param {Number} [options.delay=16]
     * @returns {Promise<Boolean>}
     * @protected
     */
    async waitForTearOutVessel(itemId, {attempts=180, delay=16}={}) {
        let me = this;

        for (let attempt = 0; attempt <= attempts && !me.isDestroyed; attempt++) {
            if (me.tearOutConnects[itemId] || me.tearOutPanes[itemId]) return true;

            attempt < attempts && await me.timeout(delay)
        }

        return Boolean(me.tearOutConnects[itemId] || me.tearOutPanes[itemId])
    }

    /**
     * Gates on a re-entry retirement fully settling: no connect entry, no pending admission,
     * no staged embodiment, and the tear-out machine's slot cleared.
     * @param {String} itemId
     * @param {Object} [options={}]
     * @param {Number} [options.attempts=180]
     * @param {Number} [options.delay=16]
     * @returns {Promise<Boolean>}
     * @protected
     */
    async waitForTearOutVesselRetired(itemId, {attempts=180, delay=16}={}) {
        let me      = this,
            retired = () => Boolean(
                !me.tearOutConnects[itemId] && !me.tearOutAdmissions.has(itemId) &&
                !me.tearOutEmbodiment.isStaged(itemId) && !me.tearOutHandlers.activeVessel
            );

        for (let attempt = 0; attempt <= attempts && !me.isDestroyed; attempt++) {
            if (retired()) return true;

            attempt < attempts && await me.timeout(delay)
        }

        return retired()
    }

    /**
     * Gates on the committed detach reaching document truth: the item leaves every node's
     * `items` (the vessel owns it) while the catalog entry stays.
     * @param {String} itemId
     * @param {Object} [options={}]
     * @param {Number} [options.attempts=180]
     * @param {Number} [options.delay=16]
     * @returns {Promise<Boolean>}
     * @protected
     */
    async waitForTearOutCommit(itemId, {attempts=180, delay=16}={}) {
        let me       = this,
            detached = () => {
                let document = me.dockModel;

                return !Object.values(document.nodes).some(zoneNode => zoneNode.items?.includes(itemId))
                    && Boolean(document.items?.[itemId])
            };

        for (let attempt = 0; attempt <= attempts && !me.isDestroyed; attempt++) {
            if (detached()) return true;

            attempt < attempts && await me.timeout(delay)
        }

        return detached()
    }

    /**
     * Cancels a live tear-out gesture: an Escape keydown (the drag-cancel signal the sort zone
     * consumes) followed by a settling mouseup.
     * @param {Neo.component.Base} button The dragged tab button.
     * @param {Object} release `{clientX, clientY, screenX, screenY}` the release point.
     * @param {Object} [options={}]
     * @param {Neo.draggable.container.SortZone|null} [options.sortZone=null] Zone whose idle facts gate settlement.
     * @param {String} [options.targetId=button.id] Stable DOM owner for both terminal events.
     * @returns {Promise<Object>}
     * @protected
     */
    async cancelTearOutGesture(button, release, {sortZone=null, targetId=button?.id}={}) {
        let me = this;

        if (!button || !targetId) return {escapeDispatched: false, releaseDispatched: false, settled: false};

        let {clientX=0, clientY=0, screenX=0, screenY=0} = release || {},
            escapeDispatched = await me.interactionService.dispatch({
                id      : targetId,
                type    : 'keydown',
                windowId: button.windowId,
                options : {bubbles: true, cancelable: true, code: 'Escape', key: 'Escape'}
            }),
            releaseDispatched = await me.interactionService.dispatch({
                id      : targetId,
                type    : 'mouseup',
                windowId: button.windowId,
                options : {bubbles: true, button: 0, buttons: 0, cancelable: true, clientX, clientY, screenX, screenY}
            });

        if (!sortZone) {
            return {escapeDispatched, releaseDispatched, settled: true}
        }

        for (let attempt = 0; attempt <= 60 && !me.isDestroyed; attempt++) {
            let settled = sortZone.owner?.cls?.includes?.('neo-is-dragging') !== true
                && sortZone.dragEndActive !== true
                && sortZone.data == null
                && !sortZone.dragPlaceholder
                && !sortZone.dragProxy;

            if (settled) return {escapeDispatched, releaseDispatched, settled: true};

            attempt < 60 && await me.timeout(16)
        }

        return {escapeDispatched, releaseDispatched, settled: false}
    }

    /**
     * Tears down the workspace-owned producer, tour seams, and cached pane instances.
     * @param {...*} args
     */
    destroy(...args) {
        let me = this;

        if (me.#feedIntervalId !== null) {
            clearInterval(me.#feedIntervalId);
            me.#feedIntervalId = null
        }

        // Vessels close through this host's seam, which settles a staged pane through the embodiment
        // first — so the sweep runs while the embodiments are alive, and the engine's own sweep in
        // `super.destroy` finds nothing left.
        me.retireTearOutState();

        me.crossWindowParticipations.forEach(participation => participation?.destroy());
        me.crossWindowParticipations.clear();
        me.crossWindowPreviewGeometries.clear();
        me.vesselWorkspaces.clear();
        me.tourRunner?.destroy();
        me.dockService?.destroy();
        me.perspectiveStore?.destroy();
        me.dragAffordances?.destroy();
        me.interactionService?.destroy();
        me.vesselProxyEmbodiment?.destroy();
        me.tearOutEmbodiment?.destroy();
        me.cueSettlements.clear();

        Object.values(me.paneCache).forEach(pane => {
            pane?.isDestroyed || pane?.destroy?.()
        });
        me.paneCache = {};

        super.destroy(...args)
    }
}

export default Neo.setupClass(Workspace);
