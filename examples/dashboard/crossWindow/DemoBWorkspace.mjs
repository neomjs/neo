import Component                          from '../../../src/component/Base.mjs';
import Container                          from '../../../src/container/Base.mjs';
import CounterPane                        from './CounterPane.mjs';
import {createCrossWindowStage}           from './DemoBCrossWindowStage.mjs';
import DemoBCrossWindowGesture            from './DemoBCrossWindowGesture.mjs';
import DemoBCrossWindowHost               from './DemoBCrossWindowHost.mjs';
import DemoBTourHost                      from './DemoBTourHost.mjs';
import DemoBKeyboardHost                  from './DemoBKeyboardHost.mjs';
import DemoBNativeWindowHost              from './DemoBNativeWindowHost.mjs';
import DockDropIndicators                 from '../../../src/dashboard/dock/interaction/DropIndicators.mjs';
import DockLayoutAdapter                  from '../../../src/dashboard/dock/projection/LayoutAdapter.mjs';
import DockMotionSignal                   from '../../../src/dashboard/dock/projection/MotionSignal.mjs';
import PerspectiveLibrary                 from '../../../src/dashboard/dock/persistence/PerspectiveLibrary.mjs';
import Placement                          from '../../../src/dashboard/dock/window/Placement.mjs';
import TopologySeams                      from '../../../src/dashboard/dock/window/TopologySeams.mjs';
import DockPreview                        from '../../../src/dashboard/dock/interaction/Preview.mjs';
import DockPreviewProducer                from '../../../src/dashboard/dock/interaction/PreviewProducer.mjs';
import DockProjectionReconciler           from '../../../src/dashboard/dock/projection/Reconciler.mjs';
import DockService                        from '../../../src/ai/client/DockService.mjs';
import DockTopologyReconciler             from '../../../src/dashboard/dock/model/TopologyReconciler.mjs';
import WorkspaceDocument                  from '../../../src/dashboard/dock/model/WorkspaceDocument.mjs';
import Operations                         from '../../../src/dashboard/dock/model/Operations.mjs';
import Persistence                        from '../../../src/dashboard/dock/model/Persistence.mjs';
import InteractionService                 from '../../../src/ai/client/InteractionService.mjs';
import {createDockKeyboardCommands}       from '../../../src/dashboard/dock/interaction/KeyboardCommands.mjs';
import TearOut                            from '../../../src/dashboard/dock/window/TearOut.mjs';
import VesselEmbodiment                   from '../../../src/dashboard/dock/window/VesselEmbodiment.mjs';
import VesselProxyEmbodiment              from '../../../src/dashboard/dock/window/VesselProxyEmbodiment.mjs';
import WorkspaceSet                       from '../../../src/dashboard/dock/window/WorkspaceSet.mjs';
import NativeVesselTransaction            from '../../../src/dashboard/dock/window/NativeVesselTransaction.mjs';
import TourRunner                         from '../../../src/ai/client/TourRunner.mjs';
import TransactionManager                 from '../../../src/manager/Transaction.mjs';
import WindowManager                      from '../../../src/manager/Window.mjs';
import {demoBTourScript, initialDocument} from './demoBPerspectives.mjs';
import '../../../src/button/Base.mjs';   // registers the `button` ntype the bars compose
import '../../../src/tab/Container.mjs'; // registers the `tab-container` ntype the projection emits
import '../../../src/toolbar/Base.mjs';  // registers the `toolbar` ntype the bars use

export {describeCrossWindowChromeMismatch} from './DemoBCrossWindowGesture.mjs';

/**
 * @summary Shows named perspectives and live panes moving between native windows without losing state.
 *
 * New dock hosts use {@link Neo.dashboard.dock.Workspace}. This example composes a
 * {@link Neo.dashboard.dock.window.WorkspaceSet} with three committed documents and permits
 * an absent popup render host. Its resolver and projection signatures differ from the base host;
 * these methods are not drop-in overrides. Projection-owner adoption must preserve those policies.
 *
 * This host retains composition, document/projection publication, semantic identities and teardown.
 * Its example-local mixins provide interaction and presentation code on the same instance.
 *
 * - **Perspectives** use {@link Neo.dashboard.dock.persistence.PerspectiveLibrary} for window views
 *   and capture all registered workspace documents for topology views. Loading composes
 *   {@link Neo.dashboard.dock.model.TopologyReconciler} and renders the structured remainder.
 *   Switcher buttons rebuild from the library's collectionChange event.
 * - **Pop-out** moves a cached live component into another render target on the same App Worker.
 *   The {@link Neo.examples.dashboard.crossWindow.CounterPane} keeps its count because reparenting
 *   preserves its instance. Pop-out and return use atomic two-document transferItem commits;
 *   whole-stack return uses transferNode. Document ownership and component reparenting stay separate.
 *
 * @class Neo.examples.dashboard.crossWindow.DemoBWorkspace
 * @extends Neo.container.Base
 */

class DemoBWorkspace extends Container {
    /**
     * Shared coordinator registry key for Demo B's registered workspaces.
     * @member {String} CROSS_WINDOW_SORT_GROUP='demo-b-cross-window'
     * @static
     */
    static CROSS_WINDOW_SORT_GROUP = 'demo-b-cross-window'
    /**
     * Stable worker-owned workspace id for the primary document.
     * @member {String} MAIN_WORKSPACE_ID='demo-b-main'
     * @static
     */
    static MAIN_WORKSPACE_ID = 'demo-b-main'
    /**
     * Stable worker-owned workspace id for the popup document.
     * @member {String} POPUP_WORKSPACE_ID='demo-b-popup'
     * @static
     */
    static POPUP_WORKSPACE_ID = 'demo-b-popup'
    /**
     * Stable worker-owned workspace id for the second popup document — the third registered
     * claim target the row-6 arbitration receipt measures (a real workspace-set composition,
     * never a vacuous witness).
     * @member {String} POPUP2_WORKSPACE_ID='demo-b-popup-2'
     * @static
     */
    static POPUP2_WORKSPACE_ID = 'demo-b-popup-2'
    /**
     * Native window name of the second popup render target.
     * @member {String} POPUP2_WINDOW_NAME='demo-b-cross-window-2'
     * @static
     */
    static POPUP2_WINDOW_NAME = 'demo-b-cross-window-2'
    static config = {
        /**
         * @member {String} className='Neo.examples.dashboard.crossWindow.DemoBWorkspace'
         * @protected
         */
        className: 'Neo.examples.dashboard.crossWindow.DemoBWorkspace',
        /**
         * Bounded interactive history, matching the Workstation demo's default; zero disables it.
         * @member {Number} dockHistoryDepth=50
         */
        dockHistoryDepth: 50,
        /** @member {Neo.core.Base[]} mixins=[TopologySeams, DemoBCrossWindowGesture, DemoBKeyboardHost, DemoBNativeWindowHost, DemoBCrossWindowHost, DemoBTourHost] */
        mixins: [TopologySeams, DemoBCrossWindowGesture, DemoBKeyboardHost, DemoBNativeWindowHost, DemoBCrossWindowHost, DemoBTourHost],
        /**
         * Theme dependencies: the example-owned palette, the dock motion/token contract file (the
         * projected tree is plain containers; nothing loads it per-class), and Demo A's skin
         * (this workspace reuses its tourbar/pip/pane visual family — in `?demo=b` mode
         * Demo A never instantiates, so its sheet must be declared, not assumed).
         * @member {String[]} additionalThemeFiles
         */
        additionalThemeFiles: [
            'Neo.examples.dashboard.Palette',
            'Neo.dashboard.Container',
            'Neo.examples.dashboard.choreography.DemoAWorkspace'
        ],
        /**
         * @member {String[]} cls=['agentos-dockdemo-workspace','agentos-dockdemo-workspace-b']
         */
        cls: ['agentos-dockdemo-workspace', 'agentos-dockdemo-workspace-b'],
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         */
        layout: {ntype: 'vbox', align: 'stretch'}
        // `items` is built in construct() — each projection carries the instance-bound
        // reducer + view-sync callbacks, so it cannot live in static config.
    }

    /**
     * The live committed dock-zone document — the single source of truth.
     * @member {Object|null} dockModel=null
     */
    dockModel = null
    /**
     * The popup render target's worker-owned dock-zone document. It participates in topology
     * capture while the live pane instance remains owned by {@link #paneCache}.
     * @member {Object|null} popupDocument=null
     */
    popupDocument = null
    /**
     * The second popup render target's worker-owned dock-zone document. It participates in the
     * Group's topology records alongside the primary and first popup documents, including while
     * its native render target is unbound.
     * @member {Object|null} popup2Document=null
     */
    popup2Document = null
    /**
     * The worker-owned `{workspaceId → document}` registry (§2.1 workspace-set composition):
     * both workspaces register their document accessors here, foreign-document resolution rides
     * it, and an atomic transfer's committed pair lands through its both-or-neither adoption.
     * @member {Object|null} workspaceSet=null
     */
    workspaceSet = null
    /** @member {Neo.dashboard.dock.window.Placement|null} dockPlacement=null Group-owned relative hints. */
    dockPlacement = null
    /**
     * The app-side Neural Link dock seam (tour + agent drivability).
     * @member {Neo.ai.client.DockService|null} dockService=null
     */
    dockService = null
    /**
     * Existing ordered DOM-event driver used by the real two-window falsifier.
     * @member {Neo.ai.client.InteractionService|null} interactionService=null
     */
    interactionService = null
    /**
     * Runtime-only dock-preview producer shared by the two window surfaces.
     * @member {Neo.dashboard.dock.interaction.PreviewProducer|null} dockPreviewProducer=null
     */
    dockPreviewProducer = null
    /**
     * The named-perspective home. Lifecycle events feed the switcher bar.
     * @member {Neo.dashboard.dock.persistence.PerspectiveLibrary|null} perspectiveStore=null
     */
    perspectiveStore = null
    /**
     * The keyed multi-workspace topology collection. Kept separate from the Workspace perspective
     * library so `neo.dock.layoutCollection.v1` never admits topology records.
     * @member {Object|null} topologyCollection=null
     */
    topologyCollection = null
    /**
     * The tour runner playing the Demo-B screenplay.
     * @member {Neo.ai.client.TourRunner|null} tourRunner=null
     */
    tourRunner = null
    /**
     * The current beat's surface cue, awaited by the runner before it admits the next beat.
     * @member {Promise} tourCuePromise
     */
    tourCuePromise = Promise.resolve()
    /**
     * Pane instances by item id — created ONCE, handed across every re-projection and
     * parked for explicit window moves or an unrestored topology remainder, torn down only
     * with the workspace. THE object-permanence substrate: `resolvePane` hands the adapter
     * these live instances, so no morph or reattach recreates a pane. Moving an existing pane
     * into a different browser document still runs that render target's required mount lifecycle.
     * @member {Object} paneCache={}
     * @protected
     */
    paneCache = {}
    /**
     * Live render hosts keyed by worker-owned workspace id. The main host is a descendant of
     * this component; the popup host is a sibling render target beneath the second window's
     * viewport, so neither component-tree ancestry nor a window id owns document truth.
     * @member {Map<String,Neo.container.Base>} crossWindowHosts
     * @protected
     */
    crossWindowHosts = new Map()
    /**
     * Registered target-side participation adapters keyed by workspace id.
     * @member {Map<String,Neo.dashboard.dock.window.Participation>} crossWindowParticipations
     * @protected
     */
    crossWindowParticipations = new Map()
    /**
     * Paint-confirmed, window-local drag geometry keyed by workspace id.
     * @member {Map<String,Object>} crossWindowGeometry
     * @protected
     */
    crossWindowGeometry = new Map()
    /**
     * Runtime proof counters for the current gesture. A remote commit must produce one transfer,
     * one source-side remote-drop-out notification, and zero source-local drop callbacks.
     * @member {Object} crossWindowStats
     * @protected
     */
    crossWindowStats = {localDropFires: 0, remoteDropOutFires: 0, transferCommits: 0}
    /**
     * The popup render target currently bound to {@link #POPUP_WORKSPACE_ID}.
     * @member {String|null} crossWindowTargetWindowId=null
     * @protected
     */
    crossWindowTargetWindowId = null
    /**
     * The popup render target currently bound to {@link #POPUP2_WORKSPACE_ID}.
     * @member {String|null} crossWindowTarget2WindowId=null
     * @protected
     */
    crossWindowTarget2WindowId = null
    /**
     * Connect-settled promise for the deterministic two-window stage.
     * @member {Promise|null} crossWindowStagePromise=null
     * @protected
     */
    crossWindowStagePromise = null
    /**
     * Resolver for {@link #crossWindowStagePromise}; set before windowOpen so a cold, fast
     * connection cannot outrun the owner.
     * @member {Function|null} crossWindowStageResolve=null
     * @protected
     */
    crossWindowStageResolve = null
    /**
     * Rejecter for {@link #crossWindowStagePromise}.
     * @member {Function|null} crossWindowStageReject=null
     * @protected
     */
    crossWindowStageReject = null
    /**
     * Connect-settled promise for the second popup's stage.
     * @member {Promise|null} crossWindowStage2Promise=null
     * @protected
     */
    crossWindowStage2Promise = null
    /**
     * Resolver for {@link #crossWindowStage2Promise}.
     * @member {Function|null} crossWindowStage2Resolve=null
     * @protected
     */
    crossWindowStage2Resolve = null
    /**
     * Rejecter for {@link #crossWindowStage2Promise}.
     * @member {Function|null} crossWindowStage2Reject=null
     * @protected
     */
    crossWindowStage2Reject = null
    /**
     * Monotonic target-ownership generation. Every open attempt captures the current value;
     * disconnect and destroy advance it so an awaited popup mount cannot resurrect stale state.
     * @member {Number} crossWindowStageGeneration=0
     * @protected
     */
    crossWindowStageGeneration = 0
    /**
     * Whether projections opt into coordinator participation. Demo B starts enabled so every
     * source SortZone warms the coordinator off the gesture hot path; without a registered
     * remote target, ordinary in-window and legacy pop-out behavior remains unchanged.
     * @member {Boolean} crossWindowEnabled=true
     * @protected
     */
    crossWindowEnabled = true
    /**
     * Gesture settlement resolver installed before InteractionService dispatch.
     * @member {Function|null} crossWindowGestureResolve=null
     * @protected
     */
    crossWindowGestureResolve = null
    /**
     * Runtime-only source-zone and continuity snapshot for the gesture being driven.
     * @member {Object|null} crossWindowGestureContext=null
     * @protected
     */
    crossWindowGestureContext = null
    /**
     * Detached-pane bookkeeping: itemId → {tabsNodeId, windowId|null}. `tabsNodeId` is the
     * home the reattach commit targets; `windowId` fills in when the popup connects.
     * @member {Object} detachedPanes={}
     * @protected
     */
    detachedPanes = {}
    /**
     * The slots this workspace reserved in its Group, keyed by workspace key — `popup:<itemId>` for
     * a tear-out or click pop-out vessel, the popup workspace id for a cross-window stage target.
     * Each remembers the flow that reserved it, the reservation's lineage token and, once bound, the
     * window. `Neo.manager.Transaction` owns identity, token and clock; this map only holds what the
     * host needs to answer a binding, and a stage continuation that finds its reservation gone knows
     * the window died under it.
     * @member {Map<String,Object>} vesselReservations
     * @protected
     */
    vesselReservations = new Map()
    /**
     * Transient render-only pane embodiment. An admitted pre-terminal vessel carries the real pane
     * while an exact-slot placeholder preserves the source card/header pairing. WorkspaceDocument truth is
     * untouched until terminal; cancellation restores through the live placeholder position.
     * @member {Neo.dashboard.dock.window.VesselEmbodiment|null} tearOutEmbodiment=null
     * @protected
     */
    tearOutEmbodiment = null
    /**
     * Target-local live pane ownership while its native source vessel is parked.
     * @member {Neo.dashboard.dock.window.VesselProxyEmbodiment|null} vesselProxyEmbodiment=null
     * @protected
     */
    vesselProxyEmbodiment = null
    /**
     * Monotonic count of actual tear-out `windowOpen` attempts: the cross-window step's proof that
     * each desktop leg of one gesture acquires exactly one vessel.
     * @member {Number} tearOutAcquisitionAttempts=0
     * @protected
     */
    tearOutAcquisitionAttempts = 0
    /**
     * Supersession token for the async keyboard-cycle highlight: every highlight call bumps it,
     * and a paint whose measured geometry resolves after a newer call (or a clear) loses — a
     * fast candidate cycle must never leave a stale zone lit.
     * @member {Number} keyboardHighlightGeneration=0
     * @protected
     */
    keyboardHighlightGeneration = 0
    /**
     * The popup workspace's announcement region instance (composed in
     * {@link #mountCrossWindowTarget}, retired with its window). Kept as an instance ref because
     * it lives in the popup window's view tree, outside this component's reference scope.
     * @member {Neo.component.Base|null} kbdLivePopup=null
     * @protected
     */
    kbdLivePopup = null
    /**
     * The second popup workspace's announcement region instance.
     * @member {Neo.component.Base|null} kbdLivePopup2=null
     * @protected
     */
    kbdLivePopup2 = null
    /**
     * The window the most recent keyboard command originated in — recorded per keydown from the
     * routing host's own `windowId`. Focus mechanics need the ORIGIN because focus-stealing rules
     * are directional: a popup may focus its opener (it holds the keystroke's activation), while
     * the opener focuses a popup through its named handle.
     * @member {String|null} lastKeyboardOriginWindowId=null
     * @protected
     */
    lastKeyboardOriginWindowId = null
    /**
     * Plain structured result of the most recent topology reconciliation. This is rendered
     * into the workspace so remainder semantics are visible rather than buried in logs.
     * @member {Object|null} restoreReport=null
     */
    restoreReport = null
    /**
     * The serialized projection queue. Exposing its settled promise keeps topology specs on
     * the same deferred view-sync boundary as the live tour instead of racing the next commit.
     * @member {Promise} refreshPromise=Promise.resolve()
     * @protected
     */
    refreshPromise = Promise.resolve()
    /**
     * Latest atomic projection request per worker-owned workspace. WorkspaceDocument truth and
     * owner-preservation policy coalesce together; transaction metadata can never trail behind
     * and mutate a newer document.
     * @member {Map<String,Object>} workspaceProjectionRequests
     * @protected
     */
    workspaceProjectionRequests = new Map()
    /**
     * Beats executed in the current run — the pip strip's progress counter.
     * @member {Number} beatCount=0
     */
    beatCount = 0

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        me.dockModel        = WorkspaceDocument.clone(initialDocument);
        me.popupDocument    = DemoBWorkspace.createPopupDocument();
        me.popup2Document   = DemoBWorkspace.createPopupDocument();

        // Live-rect authority: every Demo-B render target publishes movement AND resize geometry
        // into manager.Window. Resize alone left the row where the window was born: the pointer path
        // arms the movement poll only on a document-leaving `mouseout`, which a titlebar placed under
        // the pointer never produces, so a native titlebar drag ran its claims against a stale rect.
        // A host that EXTENDS the engine's dock host inherits this pair; one composed from the dock
        // pieces, as this one is, arms it itself.
        Neo.main.addon.WindowPosition?.setConfigs({observeMovement: true, observeResize: true, windowId: me.windowId});

        // Every workspace registers under its STABLE semantic id — the seams read/write the live
        // owner fields, so resolution always answers with committed truth. Membership lives in this
        // host's Group on `Neo.manager.Transaction`: the app imports the manager, so its window is
        // admitted at registration, and a Group the carrier already held is known before this
        // constructor runs; a first boot's minted identity arrives with its accepted binding, and
        // `onTopologyBind` registers the participants then.
        me.workspaceSet = Neo.create(WorkspaceSet, {manager: TransactionManager, getGroupId: () => me.topologyGroupId, documentModel: WorkspaceDocument});
        me.adoptTopologyGroup(TransactionManager.findByWindow(me.windowId)?.groupId ?? null);

        me.dockPreviewProducer = Neo.create(DockPreviewProducer);
        me.dockService      = Neo.create(DockService, {});
        me.interactionService = Neo.create(InteractionService, {});
        me.perspectiveStore = Neo.create(PerspectiveLibrary, {});
        me.topologyCollection = Persistence.createTopologyCollection().collection;

        me.vesselProxyEmbodiment = Neo.create(VesselProxyEmbodiment, {
            resolvePane       : itemId => me.paneCache[itemId],
            resolveProxyConfig: ({sourceSortZone, targetWindowId}) => ({
                ...sourceSortZone.getDragProxyConfig(),
                appName: Neo.apps[targetWindowId]?.name ?? me.appName
            })
        });

        // The cross-window stage choreography (decomposition Phase 1): a pure decision
        // machine over host-injected seams. Stage STATE stays host-owned by contract — the
        // unit spec's stage doubles write `crossWindowTargetWindowId` and call
        // `crossWindowStageResolve` directly, so those fields remain this component's public
        // stage surface while the module owns the code manipulating them.
        me.crossWindowStage = createCrossWindowStage({
            dragEmbodiment              : me.vesselProxyEmbodiment,
            adoptCommittedTransferPair  : pair => me.adoptCommittedTransferPair(pair),
            retireReturnedPopupWorkspace: () => me.retireReturnedPopupWorkspace(),
            applyWorkspaceOperation     : (workspaceId, descriptor) => me.applyWorkspaceOperation(workspaceId, descriptor),
            attachKeydown               : host => host.addDomListeners([{keydown: me.onDockHostKeyDown, scope: me}]),
            bumpStageGeneration         : () => me.crossWindowStageGeneration++,
            chainProjection             : body => {
                me.refreshPromise = me.refreshPromise
                    .then(() => me.timeout(0))
                    .then(body);

                return me.refreshPromise
            },
            clearWorkspaceAffordances: workspaceId => me.clearWorkspaceAffordances(workspaceId),
            commitCrossWindowTransfer: data => me.commitCrossWindowTransfer(data),
            createPopupDocument      : () => DemoBWorkspace.createPopupDocument(),
            ensurePopupRegistered    : workspaceId => me.ensurePopupWorkspaceRegistered(workspaceId),
            getPopupDocument         : workspaceId => workspaceId === DemoBWorkspace.POPUP2_WORKSPACE_ID
                ? me.popup2Document
                : me.popupDocument,
            getStageGeneration: () => me.crossWindowStageGeneration,
            getStagePromise   : workspaceId => workspaceId === DemoBWorkspace.POPUP2_WORKSPACE_ID
                ? me.crossWindowStage2Promise
                : me.crossWindowStagePromise,
            getStageReject           : workspaceId => workspaceId === DemoBWorkspace.POPUP2_WORKSPACE_ID
                ? me.crossWindowStage2Reject
                : me.crossWindowStageReject,
            getStageResolve          : workspaceId => workspaceId === DemoBWorkspace.POPUP2_WORKSPACE_ID
                ? me.crossWindowStage2Resolve
                : me.crossWindowStageResolve,
            getStageWindowName       : workspaceId => workspaceId === DemoBWorkspace.POPUP2_WORKSPACE_ID
                ? DemoBWorkspace.POPUP2_WINDOW_NAME
                : 'demo-b-cross-window',
            getTargetWindowId        : workspaceId => workspaceId === DemoBWorkspace.POPUP2_WORKSPACE_ID
                ? me.crossWindowTarget2WindowId
                : me.crossWindowTargetWindowId,
            getWindowId             : () => me.windowId,
            getWorkspaceDocument    : workspaceId => me.getWorkspaceDocument(workspaceId),
            hitTestWorkspace        : (workspaceId, localX, localY) => me.hitTestWorkspace(workspaceId, localX, localY),
            hostTimeout             : ms => me.timeout(ms),
            incrementTransferCommits: () => me.crossWindowStats.transferCommits++,
            isHostDestroyed         : () => me.isDestroyed,
            onKbdLiveMounted        : (live, workspaceId) => workspaceId === DemoBWorkspace.POPUP2_WORKSPACE_ID
                ? me.kbdLivePopup2 = live
                : me.kbdLivePopup = live,
            onWorkspaceDocumentChange: (workspaceId, document, options) => me.onWorkspaceDocumentChange(workspaceId, document, options),
            projectDockModel         : (resolveComponentRef, workspaceId) => me.projectDockModel(resolveComponentRef, workspaceId),
            refreshWorkspace         : (workspaceId, document) => me.refreshWorkspace(workspaceId, document),
            registries               : {
                detachedPanes     : me.detachedPanes,
                geometry          : me.crossWindowGeometry,
                hosts             : me.crossWindowHosts,
                participations    : me.crossWindowParticipations,
                projectionRequests: me.workspaceProjectionRequests
            },
            renderWorkspacePreview: (workspaceId, data) => me.renderWorkspacePreview(workspaceId, data),
            resolveGesture        : receipt => {
                me.crossWindowGestureResolve?.(receipt);
                me.crossWindowGestureResolve = null
            },
            resolveOwnershipId: () => me.topologyGroupId ?? null,
            reserveVessel     : (workspaceKey, flow, windowName) => me.reserveVessel(workspaceKey, flow, windowName),
            revokeVessel      : workspaceKey => me.revokeVessel(workspaceKey),
            setPopupDocument  : (workspaceId, document) => workspaceId === DemoBWorkspace.POPUP2_WORKSPACE_ID
                ? me.popup2Document = document
                : me.popupDocument = document,
            setStagePromise          : (workspaceId, promise) => workspaceId === DemoBWorkspace.POPUP2_WORKSPACE_ID
                ? me.crossWindowStage2Promise = promise
                : me.crossWindowStagePromise = promise,
            setStageReject           : (workspaceId, reject) => workspaceId === DemoBWorkspace.POPUP2_WORKSPACE_ID
                ? me.crossWindowStage2Reject = reject
                : me.crossWindowStageReject = reject,
            setStageResolve          : (workspaceId, resolve) => workspaceId === DemoBWorkspace.POPUP2_WORKSPACE_ID
                ? me.crossWindowStage2Resolve = resolve
                : me.crossWindowStageResolve = resolve,
            setTargetWindowId        : (workspaceId, windowId) => workspaceId === DemoBWorkspace.POPUP2_WORKSPACE_ID
                ? me.crossWindowTarget2WindowId = windowId
                : me.crossWindowTargetWindowId = windowId,
            sortGroup   : DemoBWorkspace.CROSS_WINDOW_SORT_GROUP,
            workspaceIds: {
                main  : DemoBWorkspace.MAIN_WORKSPACE_ID,
                popup : DemoBWorkspace.POPUP_WORKSPACE_ID,
                popup2: DemoBWorkspace.POPUP2_WORKSPACE_ID
            },
            workspaceSet          : me.workspaceSet
        });

        me.tearOutEmbodiment = Neo.create(VesselEmbodiment, {
            resolvePane: itemId => me.paneCache[itemId]
                ?? (me.dockModel?.items?.[itemId] && me.resolvePane(itemId, me.dockModel.items[itemId])),
            resolveTarget: windowId => Neo.apps[windowId]?.mainView ?? null
        });

        // The gesture tear-out choreography (MAIN workspace only): the admission machine holds the
        // one vessel slot; this host supplies the platform seams. The composition law: a tear-out
        // vessel NEVER writes `detachedPanes` mid-gesture — that single omission keeps the
        // click-pop-out reparent (`onWindowConnect`) and the model-mutating reattach
        // (`onWindowDisconnect` → `reattachPane`) structurally OUT of the gesture path, so a
        // cancelled tear-out is zero-mutation by GUARD. Post-commit adoption keeps its bookkeeping
        // in the Group's vessel source, never on this host.
        me.tearOutHandlers = Neo.create(TearOut, {
            applyOperation: descriptor => me.applyTearOutOperation(descriptor),
            awaitRefresh  : () => me.refreshPromise,
            closeVessel   : vessel => me.nativeWindows?.retire(me.vesselSourceId, me.exactTearOutVessel(vessel)) ?? false,
            // This host is MULTI-workspace: every document seam names MAIN explicitly, which is the
            // current product reason its return path stays its own rather than the engine's.
            commitReturn        : document => me.onWorkspaceDocumentChange(DemoBWorkspace.MAIN_WORKSPACE_ID, document),
            findContainingTabsId: (document, itemId) => WorkspaceDocument.findContainingTabsId(document, itemId),
            getDocument         : () => me.dockModel,
            onAdoptionFailed    : ({itemId, reintegrated}) => console.warn(
                `Dock tear-out: "${itemId}" could not enter its admitted vessel; the pane ${reintegrated ? 'returned' : 'was NOT returned'}`, me.id
            ),
            onDocumentChange: (document, operation, vessel) => me.onTearOutDocumentChange(document, operation, vessel),
            onPaneAdopted   : (itemId, entry, connection, isMerge, workspaceKey) => me.recordDockPaneOwner(itemId, entry, connection, isMerge, workspaceKey),
            onPaneReturn    : () => {},
            openVessel      : request => me.nativeWindows?.acquire(me.vesselSourceId, request) ?? null,
            reparentPane    : (pane, target, itemId) => me.reparentDockPane(pane, target, itemId),
            resolvePane     : itemId => me.paneCache[itemId] || null,
            // NEVER a resurrected node: the engine's default re-mints the remembered parent/slot,
            // and the user watched that node collapse.
            resolveReturnDescriptor: (document, itemId, placement) =>
                Operations.appendingReturnDescriptor(document, itemId, placement),
            settlePane      : pane => {
                pane && !pane.isDestroyed && (pane.parent?.remove(pane, false), pane.destroy())
            }
        });

        // The keyboard command surface — the discrete a11y-parity twin of the gesture paths,
        // composed over the SAME host seams (detach reuses the tear-out seams verbatim) plus the
        // keyboard-specific ones. The transfer commit composes the OWNED primitives directly
        // (transferItem → adoptTransfer → target-first reconcile) rather than the pointer path's
        // gesture-witness wrapper: that wrapper's context/generation predicates and proof
        // machinery belong to the continuous gesture, not to a discrete command.
        me.keyboardCommands = createDockKeyboardCommands({
            announce        : announcement => me.announceKeyboardOutcome(announcement),
            applyOperation  : descriptor => me.applyWorkspaceOperation(DemoBWorkspace.MAIN_WORKSPACE_ID, descriptor),
            closeVessel     : vessel => me.nativeWindows?.retire(me.vesselSourceId, me.exactTearOutVessel(vessel)) ?? false,
            commitTransfer  : data => me.commitKeyboardTransfer(data),
            enumerateTargets: request => me.enumerateKeyboardTargets(request),
            focusVessel     : vessel => me.focusNamedWindow(vessel.windowName),
            focusWorkspace  : ({workspaceId}) => me.focusDockWorkspaceWindow(workspaceId),
            highlightTarget : target => me.setKeyboardTargetHighlight(target),
            onDocumentChange: (document, operation) => me.onTearOutDocumentChange(document, operation),
            openVessel      : request => me.nativeWindows?.acquire(me.vesselSourceId, request) ?? null
        });

        me.tourRunner = Neo.create(TourRunner, {
            componentId        : me.id,
            crossWindowExecutor: me,
            dockService        : me.dockService,
            mode               : 'demo',
            script             : demoBTourScript,
            stepSettlement     : async () => {
                await me.tourCuePromise;
                await me.awaitProjectionIdle()
            }
        });

        me.tourRunner.on({
            beat    : data => me.tourCuePromise = Promise.resolve(me.onTourBeat(data)),
            complete: me.onTourComplete,
            error   : me.onTourError,
            scene   : me.onTourScene,
            scope   : me
        });

        // switcher buttons are BORN from store lifecycle — never hardcoded
        me.perspectiveStore.on({
            collectionChange: me.syncSwitcher,
            scope           : me
        });

        // Popup lifecycle: `Neo.manager.Transaction` announces every binding and release in the worker;
        // this workspace answers only for the slots it reserved in its own Group — the pop-out pane
        // reparents when its vessel binds, comes home when the binding is released.
        TransactionManager.on({
            bind        : me.onTopologyBind,
            leaseExpired: me.onTopologyLeaseExpired,
            release     : me.onTopologyRelease,
            scope       : me
        });

        me.add([me.createTourBar(), me.createSwitcherBar(), {
            cls      : ['agentos-dockdemo-restore-report'],
            hidden   : true,
            html     : '',
            ntype    : 'component',
            reference: 'restore-report-b'
        }, {
            // The keyboard command surface's announcement region: every outcome terminal the
            // command machine derives lands here as TEXT for the screen reader — visually
            // unobtrusive, never hidden from the accessibility tree. `role` rides the
            // Component.Base config (the renderer owns root-attr routing); aria-live rides the vdom.
            cls      : ['agentos-dockdemo-kbd-live'],
            height   : 14,
            ntype    : 'component',
            reference: 'kbd-live-b',
            role     : 'status',
            vdom     : {'aria-live': 'polite', cn: []}
        }, {
            module: Container,
            cls   : ['agentos-dockdemo-dock-host', 'neo-dashboard'],
            flex  : 1,
            items : [me.projectDockModel(), {
                module: DockPreview
            }, {
                module: DockDropIndicators
            }],
            layout   : {ntype: 'fit'},
            reference: 'dock-host-b'
        }]);

        me.crossWindowHosts.set(DemoBWorkspace.MAIN_WORKSPACE_ID, me.getReference('dock-host-b'));

        // The keyboard command routing — MAIN workspace only, the projection's tear-out arming
        // rule applied to keys. Entry chords act on the FOCUSED tab header; the cycle keys are
        // fully chorded too (no preventDefault crosses the worker boundary, so the grammar avoids
        // every native key meaning instead of suppressing it). Escape alone cancels — it has no
        // native meaning on a header.
        me.getReference('dock-host-b').addDomListeners([
            {keydown: me.onDockHostKeyDown, scope: me}
        ])
    }

    /**
     * The host-owned cycle key grammar, stated in every candidate announcement — fully chorded
     * because no key suppression crosses the worker boundary: the grammar AVOIDS native meanings
     * instead of preventing them.
     * @member {String} KEYBOARD_CYCLE_INSTRUCTIONS
     * @static
     */
    static KEYBOARD_CYCLE_INSTRUCTIONS =
        'Ctrl+Shift+Arrow keys cycle targets, Ctrl+Shift+Enter moves it there, Escape cancels.'

    /**
     * @summary Routes keyboard input with this demo's semantic identity and cycle grammar.
     * @param {Object} data The keydown DomEvent payload.
     * @returns {Promise<void>}
     * @protected
     * @see Neo.examples.dashboard.crossWindow.DemoBKeyboardHost#routeKeyboardInput
     */
    async onDockHostKeyDown(data) {
        return this.routeKeyboardInput(data, {
            mainWorkspaceId: DemoBWorkspace.MAIN_WORKSPACE_ID,
            instructions   : DemoBWorkspace.KEYBOARD_CYCLE_INSTRUCTIONS
        })
    }

    /**
     * @summary Enumerates keyboard targets with this demo's workspace labels.
     * @param {Object} request
     * @param {String} request.itemId
     * @returns {Object[]}
     * @protected
     * @see Neo.examples.dashboard.crossWindow.DemoBKeyboardHost#collectKeyboardTargets
     */
    enumerateKeyboardTargets(request) {
        return this.collectKeyboardTargets(request, {
            [DemoBWorkspace.MAIN_WORKSPACE_ID]  : 'Main window',
            [DemoBWorkspace.POPUP_WORKSPACE_ID] : 'Popup window',
            [DemoBWorkspace.POPUP2_WORKSPACE_ID]: 'Popup window 2'
        })
    }

    /**
     * @summary Focuses a workspace through this demo's named popup targets.
     * @param {String} workspaceId
     * @returns {Promise<Boolean>}
     * @protected
     * @see Neo.examples.dashboard.crossWindow.DemoBKeyboardHost#focusKeyboardWorkspace
     */
    async focusDockWorkspaceWindow(workspaceId) {
        return this.focusKeyboardWorkspace(workspaceId, {
            popup2WorkspaceId: DemoBWorkspace.POPUP2_WORKSPACE_ID,
            popup2WindowName : DemoBWorkspace.POPUP2_WINDOW_NAME,
            popupWindowName  : 'demo-b-cross-window'
        })
    }

    /**
     * The pure reducer half of the holder contract.
     * @param {Object} descriptor
     * @returns {{document: Object, errors: String[]}}
     */
    applyDockZoneOperation(descriptor) {
        return Operations.applyOperation(this.dockModel, descriptor)
    }

    /**
     * Resolves worker-owned document truth by semantic workspace id. The main document is the host's
     * own for the host's lifetime and resolves from its owner field — the same truth its participant
     * seam reads, available before the window's binding is accepted, when there is no membership yet
     * and the first projection cannot wait for one. Every vessel workspace resolves through the
     * workspace set, whose registration IS that workspace's lifetime: a retired popup resolves to
     * `null`, and an unknown id fails closed instead of guessing.
     * @param {String} workspaceId
     * @returns {Object|null}
     */
    getWorkspaceDocument(workspaceId) {
        return workspaceId === DemoBWorkspace.MAIN_WORKSPACE_ID ? this.dockModel : this.workspaceSet.getDocument(workspaceId)
    }

    /**
     * @summary (Re-)registers a popup workspace's live accessors before a cold stage opens.
     *
     * A successful whole-stack return explicitly unregisters the emptied popup entry. The next
     * user-authored stage is a NEW workspace lifetime, so it re-registers the same semantic id
     * against the current owner fields before any participation adapter may resolve it.
     * @param {String} [workspaceId=DemoBWorkspace.POPUP_WORKSPACE_ID] the popup to (re-)register.
     * @returns {Boolean}
     * @protected
     */
    ensurePopupWorkspaceRegistered(workspaceId=DemoBWorkspace.POPUP_WORKSPACE_ID) {
        let me = this;

        if (workspaceId === DemoBWorkspace.POPUP2_WORKSPACE_ID) {
            return me.workspaceSet.register(workspaceId, {
                componentId: me.id,
                getDocument: () => me.popup2Document,
                setDocument: document => me.popup2Document = document,
                project    : context => me.projectWorkspaceDocument(workspaceId, context.snapshot.participants[workspaceId], context)
            })
        }

        return me.workspaceSet.register(DemoBWorkspace.POPUP_WORKSPACE_ID, {
            componentId: me.id,
            getDocument: () => me.popupDocument,
            setDocument: document => me.popupDocument = document,
            project    : context => me.projectWorkspaceDocument(DemoBWorkspace.POPUP_WORKSPACE_ID, context.snapshot.participants[DemoBWorkspace.POPUP_WORKSPACE_ID], context)
        })
    }

    /**
     * Applies one ordinary single-document operation against a named live workspace.
     * @param {String} workspaceId
     * @param {Object} descriptor
     * @returns {{document:Object,errors:String[]}|null}
     * @protected
     */
    applyWorkspaceOperation(workspaceId, descriptor) {
        let document = this.getWorkspaceDocument(workspaceId);

        return document ? Operations.applyOperation(document, descriptor) : null
    }

    /**
     * Captures the CURRENT committed workspace state as a named perspective through the real
     * §2.2 path. Window scope persists the primary document; topology scope persists the
     * Group's registered workspace documents with one composed fingerprint.
     * `replace: true` keeps tour reruns idempotent — re-capturing your own name is the
     * demo's update flow, not a collision dispute.
     * @param {String} name
     * @param {Object} [options={}]
     * @param {'window'|'topology'} [options.scope='window']
     * @returns {{saved: Boolean, errors: String[]}}
     */
    capturePerspective(name, {scope = 'window'} = {}) {
        let me       = this,
            metadata = {
                layoutId       : `demo-b-${name.toLowerCase()}`,
                perspectiveName: name,
                title          : name
            },
            created;

        if (scope !== 'window' && scope !== 'topology') {
            return {errors: [`unknown perspective capture scope "${scope}"`], saved: false}
        }

        created = scope === 'topology'
            ? Persistence.captureTopologyPerspective(
                Object.fromEntries(me.workspaceSet.ids().map(key => [key, me.workspaceSet.getDocument(key)])),
                {...metadata, placementHints: me.getPlacementHints()}
            )
            : Persistence.createSavedLayout(me.dockModel, metadata);

        if (created.errors.length) {
            return {errors: created.errors, saved: false}
        }

        if (scope === 'topology') {
            const topologies = {
                    ...me.topologyCollection.topologies,
                    [created.topology.layoutId]: created.topology
                },
                result = Persistence.createTopologyCollection(topologies, {
                    activeLayoutId: created.topology.layoutId,
                    metadata      : me.topologyCollection.metadata,
                    ...(Object.hasOwn(me.topologyCollection, 'revision') && {
                        revision: me.topologyCollection.revision
                    })
                });

            if (result.errors.length) {
                return {errors: result.errors, saved: false}
            }

            me.topologyCollection = result.collection;
            return {errors: [], saved: true}
        }

        let result = me.perspectiveStore.savePerspective(created.layout, {replace: true});

        return {errors: result.errors, saved: result.saved}
    }

    /**
     * The switcher bar: one button per stored perspective (rebuilt from store lifecycle
     * events) + the capture button. Real `button.Base` children riding the handler contract.
     * @returns {Object}
     */
    createSwitcherBar() {
        let me = this;

        return {
            cls      : ['agentos-dockdemo-switcher'],
            flex     : 'none',
            layout   : {ntype: 'hbox', align: 'center'},
            ntype    : 'toolbar',
            reference: 'switcher-bar',
            items    : [{
                cls  : ['agentos-dockdemo-switcher-label'],
                html : 'Perspectives',
                ntype: 'component',
                style: {marginRight: '8px', opacity: 0.7, whiteSpace: 'nowrap'}
            }]
        }
    }

    /**
     * @summary Builds tour controls from this host's script and beat authority.
     * @returns {Object} The tour bar configuration.
     * @see Neo.examples.dashboard.crossWindow.DemoBTourHost#createTourControls
     */
    createTourBar() {
        return this.createTourControls(demoBTourScript, () => DemoBWorkspace.totalBeats())
    }

    /**
     * The read half of the dock-holder contract.
     * @returns {Object}
     */
    getDockZoneDocument() {
        return this.dockModel
    }

    /**
     * Loads a stored perspective. Window-scope records commit the restored primary document;
     * topology-scope records go through the changed-topology reconciler and expose its remainder.
     * @param {String} name
     * @returns {Promise<Object>} The committed result, including any topology remainder.
     */
    async loadPerspectiveByName(name) {
        let me       = this,
            topology = Object.values(me.topologyCollection?.topologies || {})
                .find(record => record.perspectiveName === name || record.layoutId === name);

        // Reconcile BEFORE `loadPerspective` advances the store's active id. A malformed
        // topology record or live document must leave both layout truth and selection truth
        // untouched — fail-closed means more than avoiding a document assignment.
        if (topology) {
            let preview = await me.restoreTopologyPerspective(topology, {commit: false});

            if (!preview.loaded) return preview;

            let activated = Persistence.createTopologyCollection(me.topologyCollection.topologies, {
                activeLayoutId: topology.layoutId,
                metadata      : me.topologyCollection.metadata,
                ...(Object.hasOwn(me.topologyCollection, 'revision') && {
                    revision: me.topologyCollection.revision
                })
            });

            if (activated.errors.length) {
                return {errors: activated.errors, loaded: false, report: preview.report}
            }

            try { await me.commitTopologyRestore(preview) } catch (error) {
                return {errors: [error.message], loaded: false, report: preview.report}
            }
            me.topologyCollection = activated.collection;
            me.restoreReport = preview.report;
            me.renderRestoreReport();

            return {errors: [], loaded: true, report: preview.report}
        }

        const result = await me.dockService.restorePerspective({componentId: me.id, name});
        return {errors: result.errors, loaded: result.switched}
    }

    /**
     * @summary Commits a validated topology result while preserving panes that remain owner-held
     * but cannot be projected because their captured window is not live.
     * @param {Object} result
     * @param {Object<String,Object>} result.workspaces Reconciled documents keyed by workspace.
     * @param {Boolean} result.hasLivePopup Whether a second render target currently exists.
     * @param {Object} result.report Structured reconciliation remainder.
     * @returns {Promise}
     * @protected
     */
    commitTopologyRestore({workspaces, hasLivePopup, report}) {
        let me              = this,
            liveDocuments   = Object.values(workspaces),
            liveItemIds     = new Set(liveDocuments.flatMap(document => Object.keys(document?.items || {}))),
            preserveItemIds = (report?.unrestored || [])
                .map(entry => entry.itemId)
                .filter(itemId => !liveItemIds.has(itemId));

        return me.workspaceSet.write(workspaces, {
            cause: 'restore-topology', provenance: {origin: 'human'}, descriptor: {preserveItemIds}
        })
    }

    /**
     * @summary Reconciles one topology record onto the currently live workspace documents.
     * A connected/detached popup contributes its worker-owned document; otherwise the live
     * topology is intentionally one window. Validation errors mutate neither document.
     * @param {Object} topology A keyed topology record.
     * @param {Object} [options={}]
     * @param {Boolean} [options.commit=true] Commit reconciled documents; false is a preflight.
     * @returns {Promise<Object>} The committed result, or a read-only preflight when commit is false.
     */
    async restoreTopologyPerspective(topology, {commit = true} = {}) {
        let me             = this,
            hasLivePopup   = Object.keys(me.detachedPanes).length > 0,
            liveWorkspaces = {
                [DemoBWorkspace.MAIN_WORKSPACE_ID]: me.dockModel,
                ...(hasLivePopup && {[DemoBWorkspace.POPUP_WORKSPACE_ID]: me.popupDocument})
            },
            result        = DockTopologyReconciler.reconcile(topology, liveWorkspaces),
            report        = WorkspaceDocument.clone({
                applied        : result.applied,
                displaced      : result.displaced,
                errors         : result.errors,
                noWindowSpawned: true,
                unmatchedLive  : result.unmatchedLive,
                unrestored     : result.unrestored
            });

        if (result.errors.length) {
            me.restoreReport = report;
            me.renderRestoreReport();
            return {workspaces: result.workspaces, errors: result.errors, hasLivePopup, loaded: false, report}
        }

        if (commit) {
            try { await me.commitTopologyRestore({workspaces: result.workspaces, hasLivePopup, report}) } catch (error) {
                return {workspaces: result.workspaces, errors: [error.message], hasLivePopup, loaded: false, report}
            }
            me.restoreReport = report;
            me.renderRestoreReport()
        }

        return {workspaces: result.workspaces, errors: [], hasLivePopup, loaded: true, report}
    }

    /**
     * @summary Renders the structured topology remainder into a dedicated visible strip.
     * Item ids are escaped because saved layouts are data, not trusted markup.
     * @protected
     */
    renderRestoreReport() {
        let me     = this,
            target = me.getReference('restore-report-b'),
            report = me.restoreReport,
            escape = value => String(value)
                .replaceAll('&', '&amp;')
                .replaceAll('<', '&lt;')
                .replaceAll('>', '&gt;'),
            entries = values => values.length
                ? values.map(entry => `${escape(entry.itemId)} (${escape(entry.reason)})`).join(', ')
                : 'none';

        if (!target || !report) return;

        target.html = report.errors.length
            ? `<strong>Topology restore rejected.</strong> Validation failed; live documents stayed untouched. ${report.errors.map(escape).join('; ')}`
            : `<strong>Topology restore — no window spawned.</strong> Unrestored: ${entries(report.unrestored)}. Displaced: ${report.displaced.length ? report.displaced.map(entry => escape(entry.itemId)).join(', ') : 'none'}. Unmatched live workspaces: ${report.unmatchedLive.length ? report.unmatchedLive.join(', ') : 'none'}.`;
        target.hidden = false
    }

    /**
     * The view-sync half: stores the committed document and re-projects, deferred one tick
     * (the normative guard — a committing interaction surface is never destroyed mid-handler).
     * @param {Object} document
     * @param {Object|null} [descriptor=null] The semantic operation admitted by the Group.
     * @returns {Promise}
     */
    onDockZoneDocumentChange(document, descriptor=null) {
        return this.onWorkspaceDocumentChange(DemoBWorkspace.MAIN_WORKSPACE_ID, document, {descriptor})
    }

    /**
     * @summary Publishes one named workspace document, then serializes a deferred projection refresh.
     *
     * Group participant callbacks publish presentation after each accepted document transaction.
     * @param {String} workspaceId
     * @param {Object} document
     * @param {Object} [options={}] Projection-lifecycle options
     * @param {Iterable<String>} [options.preserveItemIds=[]] Owner-held panes absent from this
     * document which the shared reconciler must park instead of destroy.
     * @param {Object|null} [options.descriptor=null] Semantic operation prepared at the queue head.
     * @returns {Promise}
     * @protected
     */
    onWorkspaceDocumentChange(workspaceId, document, {preserveItemIds = [], descriptor=null} = {}) {
        const me = this;
        if (!me.workspaceSet.has(workspaceId)) return Promise.reject(new Error(`unknown Demo-B workspace "${workspaceId}"`));
        if (document === me.workspaceSet.getDocument(workspaceId)) {
            return me.projectWorkspaceDocument(workspaceId, document, {preserveItemIds})
        }
        const options = {cause: 'dock', provenance: {origin: 'human'}, descriptor: {...descriptor, preserveItemIds: [...preserveItemIds]}};
        return descriptor?.operation
            ? me.workspaceSet.commit(workspaceId, [descriptor], options)
            : me.workspaceSet.write({[workspaceId]: document}, options)
    }

    /**
     * @summary Serializes one workspace's presentation without changing its committed document.
     * @param {String} workspaceId
     * @param {Object} document
     * @param {Object} [options={}]
     * @param {Iterable<String>} [options.preserveItemIds=[]] Owner-held panes to retain.
     * @param {Object|null} [options.descriptor=null] Commit-scoped preservation policy.
     * @returns {Promise} The projection outcome, independent of later queued refreshes.
     * @protected
     */
    projectWorkspaceDocument(workspaceId, document, {preserveItemIds = [], descriptor=null} = {}) {
        const me = this;
        preserveItemIds = [...new Set([...preserveItemIds, ...descriptor?.preserveItemIds ?? []])];
        me.workspaceProjectionRequests.set(workspaceId, {document, preserveItemIds: [...preserveItemIds]});
        me.refreshPromise = me.refreshPromise.catch(() => {})
            .then(() => me.timeout(0))
            .then(() => {
                if (!me.isDestroyed) {
                    const latest = me.workspaceProjectionRequests.get(workspaceId);

                    return me.refreshWorkspace(workspaceId, latest.document, {
                        preserveItemIds: latest.preserveItemIds
                    })
                }
            });

        return me.refreshPromise
    }

    /**
     * @summary Publishes tour completion using this host's current beat authority.
     * @param {Object} data The runner completion payload.
     * @returns {void}
     * @see Neo.examples.dashboard.crossWindow.DemoBTourHost#renderTourCompletion
     */
    onTourComplete(data) {
        return this.renderTourCompletion(data, () => DemoBWorkspace.totalBeats())
    }

    /**
     * Facade over the extracted cross-window stage module — the spec-stable
     * public seam. The choreography lives in {@link Neo.examples.dashboard.crossWindow.DemoBCrossWindowStage}.
     * @param {Neo.app.Base} app
     * @param {String} windowId
     * @returns {Promise<Object|null>}
     * @protected
     */
    async mountCrossWindowTarget(app, windowId, workspaceId=DemoBWorkspace.POPUP_WORKSPACE_ID) {
        return this.crossWindowStage.mountTarget(app, windowId, workspaceId)
    }

    /**
     * Facade over the extracted cross-window stage module.
     * @param {String} [workspaceId=DemoBWorkspace.POPUP_WORKSPACE_ID] the popup workspace to stage.
     * @returns {Promise<Object>}
     */
    async openCrossWindowStage(workspaceId=DemoBWorkspace.POPUP_WORKSPACE_ID) {
        return this.crossWindowStage.openStage(workspaceId)
    }

    /**
     * @summary Admits a semantic transfer through the Group's asynchronous commit boundary.
     * @param {Object} pair
     * @returns {Promise<Boolean>} False when the Group refused the transfer.
     * @protected
     */
    adoptCommittedTransferPair(pair) {
        return this.crossWindowStage.adoptPair(pair)
    }

    /**
     * @summary Retires the returned popup's render target while retaining its Group document.
     * @returns {Boolean} Whether the semantic participant remains available for undo.
     * @protected
     */
    retireReturnedPopupWorkspace() {
        return this.crossWindowStage.retireReturnedWorkspace()
    }

    /**
     * @summary Commits a whole-stack return through the Group before retiring its native target.
     * @param {Object} data
     * @returns {Promise} The committed receipt, or false before adoption.
     * @protected
     */
    commitWholeStackReturn(data) {
        return this.crossWindowStage.commitWholeStackReturn(data)
    }

    /**
     * @summary Admits a cross-window transfer with this host's semantic workspace identities.
     * @param {Object} data Transfer data.
     * @returns {Promise<Boolean>} Group admission, before the deferred gesture receipt.
     * @see Neo.examples.dashboard.crossWindow.DemoBCrossWindowHost#publishCrossWindowTransfer
     */
    async commitCrossWindowTransfer(data) {
        return this.publishCrossWindowTransfer(data, {
            mainWorkspaceId : DemoBWorkspace.MAIN_WORKSPACE_ID,
            popupWorkspaceId: DemoBWorkspace.POPUP_WORKSPACE_ID
        })
    }

    /**
     * Facade over the extracted cross-window stage module: places the popup
     * outside the source viewport and proves the Window manager sees two non-overlapping
     * rectangles. The observed manager rectangles are the readiness authority.
     * @param {Object} [options={}]
     * @param {Number} [options.attempts=120]
     * @param {Number} [options.delay=16]
     * @returns {Promise<Object>}
     * @protected
     */
    async positionCrossWindowStage(options) {
        return this.crossWindowStage.positionStage(options)
    }

    /**
     * @summary Runs the cross-window demo gesture with this workspace’s semantic IDs.
     * @param {Object} step
     * @param {Object} [options={}] Gesture options described by the host-bound runner.
     * @returns {Promise<Object>}
     * @see Neo.examples.dashboard.crossWindow.DemoBCrossWindowGesture#runCrossWindowGesture
     */
    async executeCrossWindowStep(step, options={}) {
        return this.runCrossWindowGesture(step, options, {
            main : DemoBWorkspace.MAIN_WORKSPACE_ID,
            popup: DemoBWorkspace.POPUP_WORKSPACE_ID
        })
    }

    /**
     * Drives the REAL G1 dock tear-out gesture end-to-end for the e2e witness leg. Unlike
     * {@link #executeCrossWindowStep} (a two-window transfer over the coordinator), this is the
     * single-window boundary grammar: it arms a tab drag, flings the proxy past the window
     * boundary so {@link Neo.dashboard.dock.interaction.TabSortZone} re-fires `dockTearOutExit`, the host opens
     * a `?popout=` vessel, then — gated on that vessel's ACTUAL birth
     * (the Group publishing the vessel's connection) — survives deliberate post-birth moves
     * (the reap-regression survival probe) and either releases while detached (`dockTearOutTerminal`
     * → the host's `detachItem` commit + the choreography's `adoptPane`) or cancels via Escape
     * (`dockTearOutCancel` → zero-mutation vessel close).
     *
     * The proof is OBSERVABLE-ONLY — committed document truth + vessel bookkeeping. It never reads
     * the machine's internal drag state, because the gesture guards ARE the contract: a cancelled
     * tear-out leaves the committed document byte-identical by construction (nothing writes it until
     * the terminal), and a committed detach is the item ABSENT from every node yet PRESENT in the
     * catalog (the vessel owns it; nothing leaked).
     * @param {Object} step
     * @param {String} step.itemId The dock item to tear out.
     * @param {String} step.sourceNodeId The tabs node currently holding it.
     * @param {Object} [options={}]
     * @param {Boolean} [options.cancel=false] Escape while detached instead of releasing — the zero-mutation witness.
     * @param {Number} [options.postBirthMoves=2] Deliberate outward moves after birth (the survival probe; floored at 2).
     * @returns {Promise<Object>}
     */
    async executeTearOutStep(step, {cancel = false, postBirthMoves = 2} = {}) {
        let me                     = this,
            {itemId, sourceNodeId} = step || {},
            workspaceId            = DemoBWorkspace.MAIN_WORKSPACE_ID,
            document               = me.getWorkspaceDocument(workspaceId),
            node                   = document?.nodes?.[sourceNodeId],
            button                 = null,
            release                = null;

        if (!itemId || node?.type !== 'tabs' || !node.items.includes(itemId)) {
            return {applied: false, errors: ['tear-out step must name a live item held by a tabs node']}
        }

        let pane = me.paneCache[itemId];

        if (!pane || pane.isDestroyed || !document.items?.[itemId]) {
            return {applied: false, errors: ['source pane is not live and owned by the main workspace']}
        }

        try {
            // Drain the host-owned projection queue + confirm painted geometry before reading tab
            // chrome — a perspective load can enqueue a projection immediately before this step.
            await me.awaitProjectionIdle();
            await me.waitForWorkspaceGeometry(workspaceId);

            let host          = me.crossWindowHosts.get(workspaceId),
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

            // The committed document BEFORE the gesture — both the zero-mutation (cancel) and the
            // detach-commit (terminal) proofs compare against this snapshot.
            let documentBefore = WorkspaceDocument.clone(document),
                catalogBefore  = Object.keys(documentBefore.items);

            let startX  = buttonRect.x + buttonRect.width / 2,
                startY  = buttonRect.y + buttonRect.height / 2,
                startSX = window.innerRect.x + startX,
                startSY = window.innerRect.y + startY,
                opt     = (clientX, clientY, screenX, screenY, buttons) => ({
                    bubbles: true, button: 0, buttons, cancelable: true, clientX, clientY, screenX, screenY
                });

            // A stale record from a prior gesture would false-open the birth gate.
            me.nativeWindows?.clearConnection(me.vesselSourceId, me.resolveVesselKey(itemId));

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

            // The drag arms ASYNC — {@link Neo.draggable.DragZone#onDragStart} round-trips main for
            // `boundaryContainerRect`, creates the proxy, and measures `itemRects`;
            // {@link Neo.draggable.container.SortZone#onDragMove} early-returns (before
            // checkWindowBoundary) until all three exist. Gate on them before any outward sample or
            // the exit never fires (mechanic 1: arming precedes boundary moves).
            let armed = await me.waitForTearOutDragArmed(sortZone);

            if (!armed) {
                let cancellation = await me.cancelTearOutGesture(button, {clientX: startX, clientY: startY, screenX: startSX, screenY: startSY});

                return {applied: false, errors: ['tear-out drag did not arm'], proof: {armed: false, cancellation, documentBefore}}
            }

            // The tear-out exit fires when the proxy LEAVES `boundaryContainerRect` — the window-drag
            // boundary (its `enableProxyToPopup` semantics: leaving the window IS the gesture), not the
            // viewport interior. A straight in-viewport move keeps the ratio at 1 (the first diagnostic).
            // Read the LIVE boundary and target past its bottom-right corner, fully outside it, so
            // intersectionRatio collapses below reattachThreshold (pre-armed, no false re-entry).
            let b       = sortZone.boundaryContainerRect,
                bRight  = b.right  ?? (b.x + b.width),
                bBottom = b.bottom ?? (b.y + b.height),
                outX    = Math.round(bRight  + 120),
                outY    = Math.round(bBottom + 120),
                outSX   = window.innerRect.x + outX,
                outSY   = window.innerRect.y + outY;

            release = {clientX: outX, clientY: outY, screenX: outSX, screenY: outSY};

            // Phase 2: PROGRESSIVE outward moves toward the past-the-edge target — each further out so
            // intersectionRatio steps down (isMovingOut): dragBoundaryExit → dockTearOutExit → the host
            // acquires the vessel. Progressive is robust to the initial lastIntersectionRatio.
            for (let stepIndex = 1; stepIndex <= 4; stepIndex++) {
                let px = Math.round(startX + (outX - startX) * stepIndex / 4),
                    py = Math.round(startY + (outY - startY) * stepIndex / 4);

                await me.interactionService.simulateEvent({events: [{
                    delay  : 16, targetId: button.id, type: 'mousemove', windowId: button.windowId,
                    options: opt(px, py, window.innerRect.x + px, window.innerRect.y + py, 1)
                }]})
            }

            // Gate on the vessel's ACTUAL birth: a `?popout=` window connecting through onWindowConnect.
            let born = await me.waitForTearOutVessel(itemId);

            if (!born) {
                // Capture the decisive state BEFORE the cancel resets it: exitFired (isWindowDragging)
                // distinguishes a geometry miss (false → boundary never crossed) from an admission miss
                // (true → the host's openVessel/windowOpen failed); the boundary + out target expose the
                // geometry; itemRects confirms the onDragMove gate cleared.
                let diag         = `exitFired=${Boolean(sortZone.isWindowDragging)} enableProxyToPopup=${Boolean(sortZone.enableProxyToPopup)} lastRatio=${sortZone.lastIntersectionRatio} boundary=${JSON.stringify(b)} out=(${outX},${outY}) itemRects=${sortZone.itemRects?.length ?? 'null'}`,
                    cancellation = await me.cancelTearOutGesture(button, release);

                return {
                    applied: false,
                    errors : [`tear-out vessel was not born after the boundary exit — ${diag}`],
                    proof  : {armed: true, born: false, diag, cancellation, documentBefore}
                }
            }

            // Post-birth survival probe: deliberate OUTWARD moves must NOT reap the newborn
            // vessel — each stays further out (below reattachThreshold), so no false re-entry fires.
            let probeMoves = Math.max(2, postBirthMoves);

            for (let i = 1; i <= probeMoves; i++) {
                await me.interactionService.simulateEvent({events: [{
                    delay  : 16, targetId: button.id, type: 'mousemove', windowId: button.windowId,
                    options: opt(outX, outY + i * 12, outSX, outSY + i * 12, 1)
                }]})
            }

            let survivedProbe = Boolean(me.nativeWindows?.getConnection(me.vesselSourceId, me.resolveVesselKey(itemId)));

            if (cancel) {
                // Escape while detached (post-exit, pre-up) → processDragEnd(cancelled) →
                // dockTearOutCancel → the host closes its vessel. Assert the committed document is
                // byte-identical — the zero-mutation invariant, proven from the third party (the doc).
                let cancellation  = await me.cancelTearOutGesture(button, release),
                    documentAfter = WorkspaceDocument.clone(me.getWorkspaceDocument(workspaceId));

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

            // Terminal: release while detached → dockTearOutTerminal → the host's detachItem commit
            // + the choreography's adoptPane (the vessel owns the pane now).
            await me.interactionService.simulateEvent({events: [{
                targetId: button.id, type: 'mouseup', windowId: button.windowId,
                options : opt(outX, outY, outSX, outSY, 0)
            }]});

            let committed      = await me.waitForTearOutCommit(itemId, sourceNodeId),
                documentAfter  = WorkspaceDocument.clone(me.getWorkspaceDocument(workspaceId)),
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
        }
    }

    /**
     * Polls until the base drag has ARMED — a live proxy AND the async main-thread
     * `boundaryContainerRect` are both present, the two facts
     * {@link Neo.draggable.container.SortZone#checkWindowBoundary} needs before it will sample a
     * boundary exit. {@link Neo.draggable.DragZone#onDragStart} sets the boundary through a main
     * round-trip, so the outward fling must wait for it or the exit silently never fires.
     * @param {Neo.draggable.container.SortZone} sortZone
     * @param {Object} [options={}]
     * @param {Number} [options.attempts=120]
     * @param {Number} [options.delay=16]
     * @returns {Promise<Boolean>}
     * @protected
     */
    async waitForTearOutDragArmed(sortZone, {attempts = 120, delay = 16} = {}) {
        let me = this,
            // dragProxy + boundaryContainerRect + itemRects are exactly the three facts
            // container/SortZone.onDragMove needs before it reaches checkWindowBoundary (@582/@588).
            armed = () => Boolean(sortZone?.dragProxy && sortZone?.boundaryContainerRect && sortZone?.itemRects);

        return me.waitFor(armed, {attempts, delay})
    }

    /**
     * @summary Stamps a retiring vessel with the exact native route of the window it holds.
     * @description Retirement is the last moment that route is knowable. A vessel identity is minted
     * at acquisition, before any window connected, so it names no window; the binding that followed
     * is what knows one — and a refused admission gives that binding up. The Group re-presents the
     * SAME vessel on every retry, so a route not captured here is a route no retry can rediscover,
     * and the close degrades to closing by name. Capturing it is what lets a refusal be retried
     * against the exact generation instead of whatever now answers to that name.
     * @param {Object} vessel
     * @returns {Object} The vessel, carrying its exact route when one is still resolvable.
     * @protected
     */
    exactTearOutVessel(vessel) {
        let me        = this,
            itemId    = vessel?.itemId,
            entry     = itemId ? me.resolveTearOutVessel(itemId) : null,
            admission = itemId ? me.nativeWindows?.getAdmission(me.vesselSourceId, vessel.workspaceKey ?? me.resolveVesselKey(itemId)) : null,
            windowId  = entry?.windowId ?? admission?.windowId ?? admission?.connectingWindowId,
            route     = vessel?.nativeRoute ?? entry?.nativeRoute
                ?? (windowId && Neo.manager?.Window?.get(windowId)?.nativeRoute)
                // A retry presents the vessel identity again, not the copy stamped last time, and by
                // then the refused admission has given its window up. The retirement the Group still
                // holds is where that route was captured — so the retry reads it back from there.
                ?? me.nativeWindows?.pendingRetirements(me.vesselSourceId).find(pending =>
                    pending.itemId === itemId && pending.windowName === vessel?.windowName)?.nativeRoute;

        return route ? {...vessel, nativeRoute: route} : vessel
    }

    /**
     * @summary Whether a tear-out vessel exists for this item in EITHER lifecycle phase.
     * @description Adoption runs at whichever of terminal and connect lands second, so a live vessel
     * is a provisional connection before that race resolves and committed ownership after it. Both
     * are the Group's, and a witness asking "is there a vessel" must not have to know which phase
     * won — that is the question this answers, and the reason it is not two lookups at every caller.
     * @param {String} itemId
     * @returns {Boolean}
     * @protected
     */
    hasTearOutVessel(itemId) {
        let me  = this,
            key = me.resolveVesselKey(itemId);

        return Boolean(me.nativeWindows?.getConnection(me.vesselSourceId, key)
            || me.nativeWindows?.getOwner(me.vesselSourceId, key))
    }

    /**
     * @summary Resolves the Group key of an item's tear-out vessel. Each vessel here holds the one item it
     * was opened for, so the item's newest native record is its vessel.
     * @param {String} itemId
     * @returns {String|null}
     */
    resolveVesselKey(itemId) {
        return this.nativeWindows?.keyOf(this.vesselSourceId, itemId) ?? null
    }

    /**
     * Gates on the tear-out vessel's ACTUAL birth: the `?popout=<itemId>` window connecting through
     * the Group's native lifecycle publishes the vessel's connection. Polls that observable rather
     * than any internal drag flag — the connect is the fact a witness can trust.
     * @param {String} itemId
     * @param {Object} [options={}]
     * @param {Number} [options.attempts=180]
     * @param {Number} [options.delay=16]
     * @returns {Promise<Boolean>}
     * @protected
     */
    async waitForTearOutVessel(itemId, {attempts = 180, delay = 16} = {}) {
        let me = this;

        return me.waitFor(() => me.hasTearOutVessel(itemId), {attempts, delay})
    }

    /**
     * Gates on the committed detach reaching document truth: the item leaves every node's `items`
     * (the vessel owns it) while the catalog entry stays. Polls the committed document only.
     * @param {String} itemId
     * @param {String} sourceNodeId
     * @param {Object} [options={}]
     * @param {Number} [options.attempts=180]
     * @param {Number} [options.delay=16]
     * @returns {Promise<Boolean>}
     * @protected
     */
    async waitForTearOutCommit(itemId, sourceNodeId, {attempts = 180, delay = 16} = {}) {
        let me       = this,
            detached = () => {
                let document = me.getWorkspaceDocument(DemoBWorkspace.MAIN_WORKSPACE_ID);

                return !Object.values(document.nodes).some(zoneNode => zoneNode.items?.includes(itemId))
                    && Boolean(document.items?.[itemId])
            };

        return me.waitFor(detached, {attempts, delay})
    }

    /**
     * Cancels a live tear-out gesture: an Escape keydown (the drag-cancel signal
     * {@link Neo.draggable.container.SortZone#onDragCancel} consumes) followed by a settling
     * mouseup, then polls the zone's own idle contract. Mirrors {@link #cancelCrossWindowGesture}
     * for the single-window boundary grammar.
     * @param {Neo.component.Base} button The dragged tab button.
     * @param {Object} release `{clientX, clientY, screenX, screenY}` the release point.
     * @returns {Promise<Object>}
     * @protected
     */
    async cancelTearOutGesture(button, release) {
        let me = this;

        if (!button) return {escapeDispatched: false, releaseDispatched: false, settled: false};

        let {clientX = 0, clientY = 0, screenX = 0, screenY = 0} = release || {},
            escapeDispatched = await me.interactionService.dispatch({
                id      : button.id,
                type    : 'keydown',
                windowId: button.windowId,
                options : {bubbles: true, cancelable: true, code: 'Escape', key: 'Escape'}
            }),
            releaseDispatched = await me.interactionService.dispatch({
                id      : button.id,
                type    : 'mouseup',
                windowId: button.windowId,
                options : {bubbles: true, button: 0, buttons: 0, cancelable: true, clientX, clientY, screenX, screenY}
            });

        return {escapeDispatched, releaseDispatched, settled: true}
    }

    /**
     * The Group this workspace belongs to — learned from its window's accepted binding and kept for
     * the instance's lifetime, so the documents it registered stay reachable after the window's slot
     * is released or its lease runs out. `null` until the binding is accepted: a first boot mints its
     * identity and awaits the carrier, so {@link #onTopologyBind} adopts the Group after construction.
     * @member {String|null} topologyGroupId=null
     */
    topologyGroupId = null

    /**
     * The Group's single native lifecycle owner, resolved once this host learns its Group. Null
     * until then, and never replaced: unbinding a view withdraws its effects, it does not hand the
     * Group a second owner.
     * @member {Neo.manager.transaction.NativeLifecycle|null} nativeWindows=null
     * @protected
     */
    nativeWindows = null

    /**
     * The source identity for the two vessel flows — `click-popout` and `tear-out` — which share
     * the `popup:<itemId>` key shape.
     * @member {String} vesselSourceId
     * @protected
     */
    get vesselSourceId() {
        return `${this.id}:vessel`
    }

    /**
     * The source identity for the stage-target flow, whose key IS the popup workspace id.
     * @member {String} stageSourceId
     * @protected
     */
    get stageSourceId() {
        return `${this.id}:stage`
    }

    /**
     * @summary Learns the Group and registers the three workspace participants into it — at
     * construction when the window bound before this instance existed, else when its binding arrives.
     * @param {String|null} groupId
     * @protected
     */
    adoptTopologyGroup(groupId) {
        let me = this;

        if (!groupId || me.topologyGroupId) return;

        me.topologyGroupId = groupId;
        TransactionManager.setHistoryDepth({groupId, depth: me.dockHistoryDepth});

        me.workspaceSet.register(DemoBWorkspace.MAIN_WORKSPACE_ID, {
            bindingKey : 'main',
            componentId: me.id,
            getDocument: () => me.dockModel,
            setDocument: document => me.dockModel = document,
            project    : context => me.projectWorkspaceDocument(DemoBWorkspace.MAIN_WORKSPACE_ID, context.snapshot.participants[DemoBWorkspace.MAIN_WORKSPACE_ID], context)
        });

        me.workspaceSet.register(DemoBWorkspace.POPUP_WORKSPACE_ID, {
            componentId: me.id,
            getDocument: () => me.popupDocument,
            setDocument: document => me.popupDocument = document,
            project    : context => me.projectWorkspaceDocument(DemoBWorkspace.POPUP_WORKSPACE_ID, context.snapshot.participants[DemoBWorkspace.POPUP_WORKSPACE_ID], context)
        });

        me.workspaceSet.register(DemoBWorkspace.POPUP2_WORKSPACE_ID, {
            componentId: me.id,
            getDocument: () => me.popup2Document,
            setDocument: document => me.popup2Document = document,
            project    : context => me.projectWorkspaceDocument(DemoBWorkspace.POPUP2_WORKSPACE_ID, context.snapshot.participants[DemoBWorkspace.POPUP2_WORKSPACE_ID], context)
        });
        me.dockPlacement ??= Placement.forGroup({groupId, mainWorkspaceKey: DemoBWorkspace.MAIN_WORKSPACE_ID});
        me.bindNativeWindowSources()
    }

    /** @summary Returns the Group's current relative hints for topology persistence. @returns {Object} */
    getPlacementHints() {
        return this.dockPlacement?.hints ?? {}
    }

    /**
     * @summary Routes a native release through this host's semantic workspace identities.
     * @param {Object} data The TransactionManager release payload.
     * @returns {Promise<Object>|void} The reattach settlement when an item returns.
     * @protected
     */
    onTopologyRelease(data) {
        return this.routeTopologyRelease(data, {
            mainWorkspaceId  : DemoBWorkspace.MAIN_WORKSPACE_ID,
            popupWorkspaceId : DemoBWorkspace.POPUP_WORKSPACE_ID,
            popup2WorkspaceId: DemoBWorkspace.POPUP2_WORKSPACE_ID
        })
    }

    /**
     * @summary Commits a detached terminal without sacrificing the live pane to projection order.
     * @description A connect-first vessel already carries the pane and leaves an exact-slot source
     * placeholder for ordinary projection cleanup. A terminal-first vessel has no placeholder, so
     * the source reconciler must preserve the pane until the granted child arrives. This decision is
     * captured before publishing the committed document; the deferred projection can never race it.
     * @param {Object} document
     * @param {Object} operation
     * @param {Object} vessel The admitted vessel identity: the reservation's slot and lineage token.
     * @returns {Promise<void>} Settles after the Group accepts publication and pane adoption runs.
     * @protected
     */
    async onTearOutDocumentChange(document, operation, vessel) {
        let me       = this,
            detached = operation?.operation === 'detachItem',
            itemId   = operation?.itemId;

        if (!detached) {
            return me.onWorkspaceDocumentChange(DemoBWorkspace.MAIN_WORKSPACE_ID, document, {descriptor: operation})
        }

        await me.onWorkspaceDocumentChange(DemoBWorkspace.MAIN_WORKSPACE_ID, document, {
            descriptor     : operation,
            preserveItemIds: me.tearOutEmbodiment.isStaged(itemId) ? [] : [itemId]
        });
        me.tearOutHandlers.adoptPane(itemId, vessel, me.nativeWindows?.getConnection(me.vesselSourceId, vessel?.workspaceKey) ?? null)
    }

    /**
     * @summary The tear-out commit seam with exact-position capture riding it: the
     * `{tabsNodeId, index}` pair is readable only BEFORE a detach commit removes the item from
     * the tree, and a refused commit deletes its own capture — no stale placement outlives a
     * gesture that never committed. Every non-detach descriptor passes through untouched.
     * @param {Object} descriptor
     * @returns {{document:Object, errors:String[]}|null}
     * @protected
     */
    applyTearOutOperation(descriptor) {
        let me       = this,
            isDetach = descriptor?.operation === 'detachItem',
            captured = isDetach ? WorkspaceDocument.captureItemPlacement(me.dockModel, descriptor.itemId) : null,
            result;

        captured && me.tearOutHandlers.recordPlacement(descriptor.itemId, captured);

        result = me.applyWorkspaceOperation(DemoBWorkspace.MAIN_WORKSPACE_ID, descriptor);

        isDetach && result?.errors?.length && me.tearOutHandlers.forgetPlacement(descriptor.itemId);

        return result
    }


    /**
     * The pop-out moment: atomically transfers the item record + placement from the primary
     * workspace document into the popup document, parks the live pane out of the projection,
     * and opens the popup on the SAME app. The SharedWorker heap makes the new window a second
     * render target for the one worker; `onWindowConnect` moves the cached instance in.
     * @param {String} itemId
     * @returns {Promise<{detached: Boolean, errors: String[]}>}
     */
    async popOutPane(itemId) {
        let me   = this,
            pane = me.paneCache[itemId],
            home = WorkspaceDocument.findContainingTabsId(me.dockModel, itemId);

        if (!pane || !home || me.detachedPanes[itemId]) {
            return {detached: false, errors: [`"${itemId}" is not a docked, cached, attached pane`]}
        }

        const
            workspaceKey = `popup:${itemId}`,
            windowName   = `demo-b-${itemId}`,
            reservation  = me.reserveVessel(workspaceKey, 'click-popout', windowName);

        if (!reservation) {
            return {detached: false, errors: ['no Group slot could be reserved for the pop-out vessel']}
        }

        me.detachedPanes[itemId] = {tabsNodeId: home, windowId: null};

        let committed;
        try {
            committed = await me.workspaceSet.transfer({
                operation        : 'transferItem', itemId,
                sourceWorkspaceId: DemoBWorkspace.MAIN_WORKSPACE_ID,
                targetWorkspaceId: DemoBWorkspace.POPUP_WORKSPACE_ID,
                target           : {operation: 'restoreTab', tabsNodeId: 'popup-tabs', home: {parentId: 'popup-root', slot: 'center'}}
            }, {provenance: {origin: 'human'}});

            pane.parent?.remove(pane, false);
            let winData = await Neo.Main.getWindowData({windowId: me.windowId});

            let opened = await Neo.Main.windowOpen({
                topologyIdentity: reservation,
                url             : `./index.html?popout=${itemId}`,
                windowFeatures  : `height=420,width=560,left=${winData.screenLeft + 120},top=${winData.screenTop + 120}`,
                windowId        : me.windowId,
                windowName
            });

            if (opened === false) {
                throw new Error('popup blocked')
            }
        } catch (error) {
            delete me.detachedPanes[itemId];
            me.revokeVessel(workspaceKey);
            if (committed) {
                const before = committed.participants.find(participant =>
                    participant.workspaceKey === DemoBWorkspace.MAIN_WORKSPACE_ID).before;
                await me.workspaceSet.transfer({
                    operation        : 'transferItem', itemId,
                    sourceWorkspaceId: DemoBWorkspace.POPUP_WORKSPACE_ID,
                    targetWorkspaceId: DemoBWorkspace.MAIN_WORKSPACE_ID,
                    target           : {operation: 'restoreTab', ...WorkspaceDocument.captureItemPlacement(before, itemId)}
                }, {cause: 'dock-popout-refused', provenance: {origin: 'human'}})
            }

            return {
                detached: false,
                errors  : [`popup open failed: ${error?.message || error}`]
            }
        }

        return {detached: true, errors: []}
    }

    /**
     * Facade over the extracted cross-window stage module: measures one active
     * workspace's host and tabs geometry (window-local, runtime-only).
     * @param {String} workspaceId
     * @returns {Promise<Object|null>}
     * @protected
     */
    async measureWorkspaceGeometry(workspaceId) {
        return this.crossWindowStage.measureGeometry(workspaceId)
    }

    /**
     * Facade over the extracted cross-window stage module: waits for
     * main-thread paint evidence instead of assuming a worker update acknowledgement implies
     * measurable geometry.
     * @param {String} workspaceId
     * @param {Object} [options={}]
     * @param {Number} [options.attempts=120]
     * @param {Number} [options.delay=16]
     * @returns {Promise<Object|null>}
     * @protected
     */
    async waitForWorkspaceGeometry(workspaceId, options) {
        return this.crossWindowStage.waitForGeometry(workspaceId, options)
    }

    /**
     * Projects one named committed document, threading the same holder and drag callbacks into
     * both render targets. Cross-window participation is opt-in for the dedicated scene only.
     * @param {Function|null} [resolveComponentRef=null]
     * @param {String} [workspaceId=DemoBWorkspace.MAIN_WORKSPACE_ID]
     * @param {Object} [document]
     * @returns {Object}
     */
    projectDockModel(
        resolveComponentRef=null,
        workspaceId=DemoBWorkspace.MAIN_WORKSPACE_ID,
        document=this.getWorkspaceDocument(workspaceId)
    ) {
        let me = this;

        // Tear-out arms on the MAIN workspace only: the popup-workspace projection is itself a
        // vessel-hosted render target — a tear-out FROM a vessel is popup-over-popup territory
        // (G3), deliberately not wired here.
        let tearOut   = workspaceId === DemoBWorkspace.MAIN_WORKSPACE_ID;
        let stackDrag = workspaceId === DemoBWorkspace.POPUP_WORKSPACE_ID;

        return DockLayoutAdapter.project(document, {
            applyDockZoneOperation   : descriptor => me.applyWorkspaceOperation(workspaceId, descriptor),
            crossWindowSortGroup     : me.crossWindowEnabled ? DemoBWorkspace.CROSS_WINDOW_SORT_GROUP : null,
            enableDockTearOut        : tearOut,
            enableStackDrag          : stackDrag,
            enableVesselConversion   : tearOut && me.crossWindowEnabled,
            onDockCrossZoneDragCancel: data => me.onDockCrossZoneDragCancel(workspaceId, data),
            onDockCrossZoneDragMove  : data => me.onDockCrossZoneDragMove(workspaceId, data),
            onDockCrossZoneDrop      : data => me.onDockCrossZoneDrop(workspaceId, data),
            onDockZoneDocumentChange : (nextDocument, descriptor) => me.onWorkspaceDocumentChange(workspaceId, nextDocument, {descriptor}),
            resolveComponentRef      : resolveComponentRef
                || ((reference, item, itemId) => me.resolvePane(itemId, item)),
            resolveRevealComponentRef: (reference, item, itemId) => me.resolvePane(itemId, item),
            workspaceId,
            ...(tearOut ? me.tearOutHandlers.getProjectionCallbacks() : null),
            onDockTearOutExit: tearOut ? data => me.onDockTearOutExit(data) : undefined
        })
    }

    /**
     * @summary Retries any exact retained retirement before admitting a successor tear-out.
     *
     * A strict close refusal preserves the tear-out slot. The next boundary exit first retries that
     * same exact generation; only success permits a fresh popup. A second refusal restores the
     * in-window embodiment and fails closed instead of wedging it in a detached state with no vessel.
     * @param {Object} data
     * @returns {Promise<Boolean>}
     * @protected
     */
    async onDockTearOutExit(data) {
        let me     = this,
            active = me.tearOutHandlers.activeVessel;

        if (active && !await me.tearOutHandlers.retireActiveVessel(active)) {
            data.sortZone?.endWindowDrag();
            return false
        }

        await me.tearOutHandlers.onDockTearOutExit(data);

        return true
    }

    /**
     * @summary Resolves the one connected tear-out generation that may receive physical effects.
     * @param {String} itemId
     * @returns {Object|null}
     * @protected
     */
    resolveTearOutVessel(itemId) {
        return NativeVesselTransaction.resolveVessel({
            nativeWindows: this.nativeWindows, sourceId: this.vesselSourceId, windowNameFor: (id, key) => this.vesselWindowName(id, key)
        }, itemId)
    }

    /**
     * @summary The semantic name of a tear-out vessel's window: `tearout-<itemId>`, plus the suffix its Group
     * key was minted with when the item's preferred key was taken. Two live vessels never share a name,
     * which `Main#windowOpen` would answer by reusing the first one's window.
     * @param {String} itemId
     * @param {String} [workspaceKey]
     * @returns {String}
     * @protected
     */
    vesselWindowName(itemId, workspaceKey) {
        const preferred = `popup:${itemId}`;

        return `tearout-${itemId}${workspaceKey?.startsWith(preferred) ? workspaceKey.slice(preferred.length) : ''}`
    }

    /**
     * The tear-out admission seam: opens the vessel window for a mid-gesture boundary exit.
     * Reuses the `?popout=` pure-pane-host viewport mode. The granted child immediately carries
     * the same live pane through {@link Neo.dashboard.dock.window.VesselEmbodiment}; it still owns no
     * workspace document, and NOTHING is written to {@link #detachedPanes}, so click-pop-out model
     * machinery remains structurally absent. Fail-closed per the admission contract: `windowOpen`
     * returns a BOOLEAN (a blocked popup never throws), and any falsy/throwing acquisition returns
     * `null` so the gesture degrades to its in-window fallback.
     *
     * This is a PLATFORM effect, not an admission: the Group's native lifecycle owns the slot, its
     * lineage token and the retirement retry, and hands the minted identity in as `topologyIdentity`
     * for this method to ride into the vessel's carrier — nothing about the owner is in the URL. The
     * returned facts are only what the platform decided; `acquire` merges them with the identity, so
     * the seam's caller still receives the full `{generationToken, workspaceKey, …}` descriptor.
     * @param {Object} request
     * @param {String} request.itemId
     * @param {Object} request.proxyRect
     * @param {Object} request.topologyIdentity The reserved slot, supplied by `NativeLifecycle#acquire`.
     * @returns {Promise<{popupHeight: Number, popupWidth: Number, windowName: String}|null>}
     * @protected
     */
    async openTearOutVessel({itemId, proxyRect, topologyIdentity}) {
        let me         = this,
            {windowId} = me,
            windowName = me.vesselWindowName(itemId, topologyIdentity?.workspaceKey);

        // Admission is the caller's: this effect is only ever reached through `acquire`, which has
        // already retried pending retirements, reserved the slot and minted the identity below. An
        // effect invoked without one would open a native window no Group slot admits.
        if (!topologyIdentity) return null;

        let winData = await Neo.Main.getWindowData({windowId}),
            width   = Math.max(Math.round(proxyRect?.width  || 480), 320),
            height  = Math.max(Math.round(proxyRect?.height || 360), 240),
            left    = Math.round((proxyRect?.x ?? 120) + winData.screenLeft),
            top     = Math.round((proxyRect?.y ?? 120) + (winData.outerHeight - winData.innerHeight) + winData.screenTop);

        me.tearOutAcquisitionAttempts++;

        let opened = await Neo.Main.windowOpen({
                nativeCapabilities: {close: true, position: true},
                topologyIdentity,
                url               : `./index.html?popout=${itemId}`,
                windowFeatures    : `height=${height},left=${left},top=${top},width=${width}`,
                windowId,
                windowName
            });

        // A blocked popup resolves `false` rather than throwing; a throw is the platform failing.
        // Both are the same answer here — no vessel — and `acquire` revokes the slot for either.
        return opened === false ? null : {popupHeight: height, popupWidth: width, windowName}
    }

    /**
     * @summary The tear-out retirement seam: closes a vessel the gesture no longer needs (re-entry, cancel,
     * or a refused model commit) through the engine's shared close. The live connection remains
     * recoverable until the platform strictly admits the close, so an explicit refusal can be retried
     * instead of orphaning a parked native generation. {@link #onTopologyRelease} ignores tear-out windows
     * by construction (no {@link #detachedPanes} entry), so no reattach machinery fires after success.
     * This host's trimming is the vessel proxy: its source slot lives inside the vessel, so it unwinds
     * before a restoring settle.
     * @param {Object} vessel
     * @param {String} [vessel.generationToken] The reservation's lineage token.
     * @param {String} vessel.itemId
     * @param {String} vessel.windowName
     * @param {Object} [vessel.nativeRoute] Exact opener-minted physical route when available
     * @returns {Promise<Boolean>}
     * @protected
     */
    closeTearOutVessel(vessel) {
        const me = this;

        return NativeVesselTransaction.closeVessel({
            beforeRestore: ({itemId}) => !me.vesselProxyEmbodiment.isStaged(itemId) || me.vesselProxyEmbodiment.restore({itemId}),
            embodiment   : me.tearOutEmbodiment,
            nativeWindows: me.nativeWindows,
            ownerWindowId: me.windowId,
            sourceId     : me.vesselSourceId,
            sourceOwns   : itemId => Boolean(WorkspaceDocument.findContainingTabsId(me.dockModel, itemId)),
            windowNameFor: (itemId, workspaceKey) => me.vesselWindowName(itemId, workspaceKey)
        }, vessel)
    }

    /**
     * The post-commit ownership write: the detached terminal committed `detachItem` (the item left
     * the tree, catalog preserved), so the vessel now OWNS the pane. The REPARENT that used to
     * follow this write now belongs to the choreography, which calls `reparentPane` right after —
     * so the long-drag and fast-terminal orders converge on one sequence instead of two.
     * @param {String} itemId
     * @param {Object|null} entry The admitted identity for terminal-first adoption, or null to withdraw.
     * @param {Object|null} [connection=null] The bound vessel connection, when one arrived first.
     * @param {Boolean} [isMerge=false] Fold into the existing record instead of replacing it.
     * @param {String} [workspaceKey] The vessel whose record changes.
     * @protected
     */
    recordDockPaneOwner(itemId, entry, connection=null, isMerge=false, workspaceKey=entry?.workspaceKey ?? connection?.workspaceKey) {
        let me = this;

        if (!me.nativeWindows) {
            if (entry === null) return;
            throw new Error('native source is not bound')
        }

        if (isMerge || entry === null) {
            me.nativeWindows.recordOwner(me.vesselSourceId, workspaceKey, entry, null, isMerge);
            return
        }

        // The shape is this host's; the registry is the Group's. A terminal that beat its connect
        // owns an as-yet-unbound window, so the record names the generation and leaves `windowId`
        // for the binding to fill. Passing the connection is what makes the write single-owner:
        // committed disconnects match ownership from here on, never the pre-terminal connect branch.
        const key = workspaceKey ?? `popup:${itemId}`;

        me.nativeWindows.recordOwner(me.vesselSourceId, key, connection ? {...connection, itemId, workspaceKey: key} : {
            generationToken: entry.generationToken ?? null,
            itemId,
            windowId       : null,
            windowName     : entry.windowName ?? `tearout-${itemId}`,
            workspaceKey   : key
        }, connection)
    }

    /**
     * Moves the LIVE cached pane into a connected tear-out vessel — the same instance-moving
     * reparent the click-pop-out uses, minus every document write (the model already committed
     * at the terminal; this is pure render-target work).
     * @param {Neo.component.Base} pane
     * @param {Object} target `{windowId}`
     * @param {String} itemId
     * @returns {Boolean}
     * @protected
     */
    reparentDockPane(pane, target={}, itemId) {
        let me         = this,
            {windowId} = target,
            app        = Neo.apps[windowId];

        if (me.tearOutEmbodiment.isStaged(itemId)) {
            return me.tearOutEmbodiment.promote({itemId, windowId}) !== false
        }

        pane = me.paneCache[itemId] || pane;

        if (!app || !pane || pane.isDestroyed) return false;

        if (pane.parent !== app.mainView) {
            pane.parent?.remove(pane, false);
            app.mainView.add(pane)
        }

        return true
    }

    /**
     * The reattach: atomically transfers the item from the popup document into its primary
     * tabs home, closes the popup (unless it already closed itself), and lets the projection
     * re-adopt the parked instance — same count, same instance, home again.
     * @param {String} itemId
     * @param {Object} [options={}]
     * @param {Boolean} [options.windowAlreadyClosed=false]
     * @returns {Promise<{reattached: Boolean, errors: String[]}>}
     */
    async reattachPane(itemId, {windowAlreadyClosed = false} = {}) {
        let me    = this,
            entry = me.detachedPanes[itemId],
            pane  = me.paneCache[itemId];

        if (!entry || !pane) {
            return {errors: [`"${itemId}" is not detached`], reattached: false}
        }

        // home fallback: if the remembered tabs node left the tree (a perspective moved on),
        // the first tabs node adopts the returning pane — never a dangling reattach
        let home = me.dockModel.nodes[entry.tabsNodeId]?.type === 'tabs'
                ? entry.tabsNodeId
                : Object.keys(me.dockModel.nodes).find(id => me.dockModel.nodes[id].type === 'tabs');

        try {
            await me.workspaceSet.transfer({
                operation        : 'transferItem', itemId,
                sourceWorkspaceId: DemoBWorkspace.POPUP_WORKSPACE_ID,
                targetWorkspaceId: DemoBWorkspace.MAIN_WORKSPACE_ID,
                target           : {operation: 'addTab', tabsNodeId: home}
            }, {provenance: {origin: 'human'}})
        } catch (error) {
            return {errors: [error.message], reattached: false}
        }

        me.revokeVessel(`popup:${itemId}`);
        delete me.detachedPanes[itemId];
        pane.parent?.remove(pane, false);

        // Commit model ownership before awaiting the vessel, and park the pane: the worker reaps the popup's tree
        // once its window is gone. The deleted bookkeeping entry is the disconnect re-entrancy guard; a close
        // failure leaves an empty popup, not split truth.
        if (!windowAlreadyClosed) {
            try {
                await Neo.Main.windowClose({
                    names   : [entry.windowName || `demo-b-${itemId}`],
                    windowId: me.windowId
                })
            } catch (error) {
                return {errors: [`popup close failed: ${error?.message || error}`], reattached: true}
            }
        }

        return {errors: [], reattached: true}
    }

    /**
     * @summary Reconciles one workspace projection from its atomic document/preservation request.
     *
     * The shared projection reconciler moves cached panes and tab chrome into the staged tree
     * before retiring the empty shell, so object permanence no longer depends on coarse parking.
     * @param {String} workspaceId Worker-owned workspace id.
     * @param {Object} [document=this.getWorkspaceDocument(workspaceId)] WorkspaceDocument to project.
     * @param {Object} [options={}] Projection policy.
     * @param {Iterable<String>} [options.preserveItemIds=[]] Owner-held panes to park.
     * @returns {Promise}
     * @protected
     */
    async refreshWorkspace(
        workspaceId,
        document=this.getWorkspaceDocument(workspaceId),
        {preserveItemIds=[]}={}
    ) {
        const
            me           = this,
            host         = me.crossWindowHosts.get(workspaceId),
            placeholders = new Map();

        if (host) {
            const flip = workspaceId === DemoBWorkspace.MAIN_WORKSPACE_ID
                ? Neo.main?.addon?.DockFlip
                : null;

            me.crossWindowGeometry.delete(workspaceId);
            me.clearWorkspaceAffordances(workspaceId);

            try {
                await flip?.captureFirst({hostId: host.id, markerPrefix: 'agentos-dockdemo-pane-'})
            } catch (e) {/* instant landing */}

            const nextConfig = me.projectDockModel((reference, item, itemId) => {
                const placeholder = Neo.create({
                    module: Component,
                    header: {text: item?.title ?? itemId},
                    hidden: true
                });

                placeholders.set(itemId, placeholder);

                return placeholder
            }, workspaceId, document);

            await DockProjectionReconciler.reconcileProjection({
                host,
                nextConfig,
                placeholders,
                preserveItemIds,
                resolveItem: itemId => me.resolvePane(itemId, document.items[itemId])
            });

            me.crossWindowEnabled && await me.measureWorkspaceGeometry(workspaceId);

            // Guard on the CAPABILITY, not on truthiness. `Neo.main.addon.DockFlip` holds the
            // registered CLASS until an instance replaces it, and a class is truthy with no
            // `play` — so `if (flip)` admits it and the call below throws. This matches the
            // optional-chained `flip?.captureFirst` two calls up, which never had the problem.
            if (flip?.play) {
                DockMotionSignal.enter(me);
                flip.play({hostId: host.id, markerPrefix: 'agentos-dockdemo-pane-'})
                    .catch(() => {})
                    .finally(() => DockMotionSignal.leave(me))
            }
        }
    }

    /**
     * Backward-compatible primary-workspace refresh seam used by the perspective tests and tour.
     * @returns {Promise}
     * @protected
     */
    refreshDockWorkspace() {
        return this.refreshWorkspace(DemoBWorkspace.MAIN_WORKSPACE_ID, this.dockModel)
    }

    /**
     * @summary Resolves only after every currently queued projection has committed or failed.
     * Whitebox journeys use this worker-owned boundary instead of guessing from runner timing.
     * @returns {Promise}
     */
    awaitProjectionIdle() {
        return this.refreshPromise
    }

    /**
     * Resolves a pane to its CACHED live instance, creating it on first request — the
     * workbench is the counter witness; the rest are labeled placeholder components with
     * stable skin hooks. The FLIP marker cls rides every instance.
     * @param {String} itemId
     * @param {Object} item The model item record.
     * @returns {Neo.component.Base}
     */
    resolvePane(itemId, item) {
        let me    = this,
            cache = me.paneCache;

        if (cache[itemId] && !cache[itemId].isDestroyed) {
            return cache[itemId]
        }

        cache[itemId] = Neo.create(itemId === 'workbench' ? {
            module: CounterPane,
            cls   : ['agentos-dockdemo-counter-pane', 'agentos-dockdemo-pane-workbench']
        } : {
            module: Component,
            cls   : ['agentos-dockdemo-pane', `agentos-dockdemo-pane-${itemId}`],
            html  : item?.title ?? itemId,
            style : {alignItems: 'center', display: 'flex', fontSize: '18px', justifyContent: 'center'}
        });

        return cache[itemId]
    }

    /**
     * @summary Plays the screenplay from the top. A rerun first drains the prior projection
     * transaction, then serializes the opening-stage reset through the same refresh queue as
     * every tour mutation; reset and replay can therefore never reconcile the tab chrome at
     * the same time. Perspective saves remain idempotent through `replace: true`.
     */
    async startTour() {
        let me = this;

        if (me.tourRunner.running) {
            me.setTourCaption('Tour already running — let it finish its story.');
            return
        }

        if (me.tourRunner.log.length) {
            await me.refreshPromise;

            await me.workspaceSet.write({
                [DemoBWorkspace.MAIN_WORKSPACE_ID]  : WorkspaceDocument.clone(initialDocument),
                [DemoBWorkspace.POPUP_WORKSPACE_ID] : DemoBWorkspace.createPopupDocument(),
                [DemoBWorkspace.POPUP2_WORKSPACE_ID]: DemoBWorkspace.createPopupDocument()
            }, {cause: 'dock-tour-reset', provenance: {origin: 'human'}});
            await me.awaitProjectionIdle()
        }

        me.beatCount = 0;
        me.setPipProgress(0);

        await me.tourRunner.start()
    }

    /**
     * Rebuilds the switcher buttons from the store's current collection — fired by every
     * store lifecycle event; buttons load their perspective through the same path the tour
     * cues use (one code path, human- and agent-driven alike).
     * @protected
     */
    syncSwitcher() {
        let me  = this,
            bar = me.getReference('switcher-bar');

        if (!bar) return;

        let collection = me.perspectiveStore.collection,
            layouts    = collection?.layouts ?? {},
            names      = Object.values(layouts).map(record => record.perspectiveName ?? record.layoutId);

        // children after the label are the perspective buttons — rebuild in place
        while (bar.items.length > 1) {
            bar.removeAt(bar.items.length - 1)
        }

        names.forEach(name => {
            bar.add({
                cls            : ['agentos-dockdemo-switcher-btn'],
                handler        : () => me.loadPerspectiveByName(name),
                ntype          : 'button',
                text           : name,
                useRippleEffect: false
            })
        })
    }

    /**
     * One entry per script step — the pip strip's build source.
     * @returns {Object[]}
     * @static
     */
    static totalBeats() {
        return demoBTourScript.scenes.flatMap(scene => scene.steps)
    }

    /**
     * @summary Creates the valid empty popup workspace used as the target of an atomic transfer.
     * The empty tabs node is intentional: it is the landing slot and is normalized away when
     * the last item transfers home, after which the next pop-out creates a fresh target.
     * @returns {Object}
     * @static
     */
    static createPopupDocument() {
        return {
            schema: WorkspaceDocument.SCHEMA,
            root  : 'popup-root',
            items : {},
            nodes : {
                'popup-root': {type: 'edge-zone', zones: {center: {nodeId: 'popup-tabs'}}},
                'popup-tabs': {type: 'tabs', items: [], activeItemId: null}
            }
        }
    }

    /**
     * @summary Tears down the runner, seam, store, and every cached pane with the workspace.
     * @param {...*} args
     */
    destroy(...args) {
        let me = this;

        me.crossWindowStageGeneration++;
        me.crossWindowGestureContext?.sourceZone?.dragCoordinator?.onDragCancel({
            sourceSortZone: me.crossWindowGestureContext.sourceZone
        });
        me.crossWindowGestureResolve?.({applied: false, errors: ['Demo-B workspace destroyed']});
        me.crossWindowStageReject?.(new Error('Demo-B workspace destroyed'));
        me.crossWindowStage2Reject?.(new Error('Demo-B workspace destroyed'));
        me.crossWindowParticipations.forEach(participation => participation.destroy());
        me.crossWindowParticipations.clear();
        me.crossWindowHosts.clear();
        me.crossWindowGeometry.clear();
        me.workspaceProjectionRequests.clear();
        // Both sources withdraw their effects, or this destroyed host's callbacks stay live on a
        // Group that outlives it — the Group keeps any native windows it still owns, which is the
        // point of withdrawing effects rather than clearing ownership.
        me.nativeWindows?.unregisterSource(me.vesselSourceId);
        me.nativeWindows?.unregisterSource(me.stageSourceId);
        me.nativeWindows = null;

        TransactionManager.un({
            bind        : me.onTopologyBind,
            leaseExpired: me.onTopologyLeaseExpired,
            release     : me.onTopologyRelease,
            scope       : me
        });
        me.vesselReservations.clear();
        me.vesselProxyEmbodiment?.destroy();
        me.vesselProxyEmbodiment = null;
        me.tearOutEmbodiment?.destroy();
        me.tearOutEmbodiment = null;
        me.tearOutHandlers?.destroy();
        me.tearOutHandlers = null;
        me.crossWindowStagePromise   = null;
        me.crossWindowStageResolve   = null;
        me.crossWindowStageReject    = null;
        me.crossWindowStage2Promise  = null;
        me.crossWindowStage2Resolve  = null;
        me.crossWindowStage2Reject   = null;
        me.crossWindowGestureResolve = null;
        me.crossWindowGestureContext = null;

        me.tourRunner?.destroy();
        me.dockService?.destroy();
        me.dockPreviewProducer?.destroy();
        me.interactionService?.destroy();
        me.perspectiveStore?.destroy();
        me.workspaceSet?.destroy();

        Object.values(me.paneCache).forEach(pane => {
            pane?.isDestroyed || pane?.destroy?.()
        });
        me.paneCache = {};

        super.destroy(...args)
    }
}

export default Neo.setupClass(DemoBWorkspace);
