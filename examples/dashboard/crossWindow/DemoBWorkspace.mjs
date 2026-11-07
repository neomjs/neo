import Component                          from '../../../src/component/Base.mjs';
import Container                          from '../../../src/container/Base.mjs';
import CounterPane                        from './CounterPane.mjs';
import {createCrossWindowStage}           from './DemoBCrossWindowStage.mjs';
import DemoBCrossWindowGesture            from './DemoBCrossWindowGesture.mjs';
import DemoBCrossWindowHost               from './DemoBCrossWindowHost.mjs';
import DemoBTourHost                      from './DemoBTourHost.mjs';
import DemoBKeyboardHost                  from './DemoBKeyboardHost.mjs';
import DemoBNativeWindowHost              from './DemoBNativeWindowHost.mjs';
import DemoBPerspectiveHost               from './DemoBPerspectiveHost.mjs';
import DemoBTearOutGesture                from './DemoBTearOutGesture.mjs';
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
import WorkspaceDocument                  from '../../../src/dashboard/dock/model/WorkspaceDocument.mjs';
import Operations                         from '../../../src/dashboard/dock/model/Operations.mjs';
import Persistence                        from '../../../src/dashboard/dock/model/Persistence.mjs';
import InteractionService                 from '../../../src/ai/client/InteractionService.mjs';
import {createDockKeyboardCommands}       from '../../../src/dashboard/dock/interaction/KeyboardCommands.mjs';
import TearOut                            from '../../../src/dashboard/dock/window/TearOut.mjs';
import VesselEmbodiment                   from '../../../src/dashboard/dock/window/VesselEmbodiment.mjs';
import VesselProxyEmbodiment              from '../../../src/dashboard/dock/window/VesselProxyEmbodiment.mjs';
import WorkspaceSet                       from '../../../src/dashboard/dock/window/WorkspaceSet.mjs';
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
        /** @member {Neo.core.Base[]} mixins=[TopologySeams, DemoBCrossWindowGesture, DemoBKeyboardHost, DemoBNativeWindowHost, DemoBPerspectiveHost, DemoBTearOutGesture, DemoBCrossWindowHost, DemoBTourHost] */
        mixins: [TopologySeams, DemoBCrossWindowGesture, DemoBKeyboardHost, DemoBNativeWindowHost, DemoBPerspectiveHost, DemoBTearOutGesture, DemoBCrossWindowHost, DemoBTourHost],
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
     * @summary Restores a topology with this host's semantic workspace identities.
     * @param {Object} topology A keyed topology record.
     * @param {Object} [options={}] Restore/preflight options.
     * @returns {Promise<Object>} The existing restore result.
     * @see Neo.examples.dashboard.crossWindow.DemoBPerspectiveHost#reconcileTopologyPerspective
     */
    async restoreTopologyPerspective(topology, options={}) {
        return this.reconcileTopologyPerspective(topology, options, {
            mainWorkspaceId : DemoBWorkspace.MAIN_WORKSPACE_ID,
            popupWorkspaceId: DemoBWorkspace.POPUP_WORKSPACE_ID
        })
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
     * @summary Drives the single-window tear-out sequence with this host's main workspace identity.
     * @param {Object} step The item and source tabs node.
     * @param {Object} [options={}] Cancellation and post-birth movement options.
     * @returns {Promise<Object>} The gesture's observed outcome.
     * @see Neo.examples.dashboard.crossWindow.DemoBTearOutGesture#runTearOutStep
     */
    executeTearOutStep(step, options) {
        return this.runTearOutStep(step, options, DemoBWorkspace.MAIN_WORKSPACE_ID)
    }

    /**
     * @summary Waits for the detach to reach this host's main document.
     * @param {String} itemId
     * @param {String} sourceNodeId
     * @param {Object} [options={}] Bounded polling options.
     * @returns {Promise<Boolean>}
     * @protected
     */
    waitForTearOutCommit(itemId, sourceNodeId, options) {
        return this.pollTearOutCommit(itemId, sourceNodeId, options, DemoBWorkspace.MAIN_WORKSPACE_ID)
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
     * @summary Publishes a tear-out terminal for this host's main workspace.
     * @param {Object} document The next document.
     * @param {Object} operation The terminal operation.
     * @param {Object} vessel The admitted vessel identity.
     * @returns {Promise<void>} Publication and adoption settlement.
     * @see Neo.examples.dashboard.crossWindow.DemoBNativeWindowHost#publishTearOutDocument
     */
    async onTearOutDocumentChange(document, operation, vessel) {
        return this.publishTearOutDocument(document, operation, vessel, DemoBWorkspace.MAIN_WORKSPACE_ID)
    }

    /**
     * @summary Captures placement and reduces a tear-out operation for this host's main workspace.
     * @param {Object} descriptor The dock operation.
     * @returns {{document:Object, errors:String[]}|null} The existing reducer result.
     * @see Neo.examples.dashboard.crossWindow.DemoBNativeWindowHost#applyTearOutToWorkspace
     */
    applyTearOutOperation(descriptor) {
        return this.applyTearOutToWorkspace(descriptor, DemoBWorkspace.MAIN_WORKSPACE_ID)
    }


    /**
     * @summary Pops a pane out between this host's main and popup documents.
     * @param {String} itemId The pane to transfer.
     * @returns {Promise<{detached: Boolean, errors: String[]}>} The existing acquisition result.
     * @see Neo.examples.dashboard.crossWindow.DemoBNativeWindowHost#openPanePopup
     */
    async popOutPane(itemId) {
        return this.openPanePopup(itemId, {
            mainWorkspaceId : DemoBWorkspace.MAIN_WORKSPACE_ID,
            popupWorkspaceId: DemoBWorkspace.POPUP_WORKSPACE_ID
        })
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
     * @summary Returns a pane between this host's popup and main documents.
     * @param {String} itemId The returning pane.
     * @param {Object} [options={}] Native close options.
     * @returns {Promise<{reattached: Boolean, errors: String[]}>} The existing return receipt.
     * @see Neo.examples.dashboard.crossWindow.DemoBNativeWindowHost#returnPaneFromPopup
     */
    async reattachPane(itemId, options={}) {
        return this.returnPaneFromPopup(itemId, options, {
            mainWorkspaceId : DemoBWorkspace.MAIN_WORKSPACE_ID,
            popupWorkspaceId: DemoBWorkspace.POPUP_WORKSPACE_ID
        })
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
     * @summary Resolves a pane to its cached live instance, creating it on first request — the
     * workbench is the counter witness; the rest are labeled placeholder components with
     * stable skin hooks. Each pane carries its document title as tab-header metadata and a FLIP marker cls.
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
            cls   : ['agentos-dockdemo-counter-pane', 'agentos-dockdemo-pane-workbench'],
            header: {text: item?.title ?? itemId}
        } : {
            module: Component,
            cls   : ['agentos-dockdemo-pane', `agentos-dockdemo-pane-${itemId}`],
            header: {text: item?.title ?? itemId},
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
