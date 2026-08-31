import Component                            from '../../../src/component/Base.mjs';
import Container                            from '../../../src/container/Base.mjs';
import CounterPane                          from './CounterPane.mjs';
import {createCrossWindowStage}             from './DemoBCrossWindowStage.mjs';
import DockDropIndicators                   from '../../../src/dashboard/dock/interaction/DropIndicators.mjs';
import DockLayoutAdapter                    from '../../../src/dashboard/dock/projection/LayoutAdapter.mjs';
import DockMotionSignal                     from '../../../src/dashboard/dock/projection/MotionSignal.mjs';
import PerspectiveLibrary                   from '../../../src/dashboard/dock/persistence/PerspectiveLibrary.mjs';
import DockPreview                          from '../../../src/dashboard/dock/interaction/Preview.mjs';
import DockPreviewProducer                  from '../../../src/dashboard/dock/interaction/PreviewProducer.mjs';
import DockProjectionReconciler             from '../../../src/dashboard/dock/projection/Reconciler.mjs';
import DockService                          from '../../../src/ai/client/DockService.mjs';
import DockTopologyReconciler               from '../../../src/dashboard/dock/model/TopologyReconciler.mjs';
import Document                             from '../../../src/dashboard/dock/model/Document.mjs';
import Operations                           from '../../../src/dashboard/dock/model/Operations.mjs';
import Persistence                          from '../../../src/dashboard/dock/model/Persistence.mjs';
import InteractionService                   from '../../../src/ai/client/InteractionService.mjs';
import {createDockKeyboardCommands}         from '../../../src/dashboard/dock/interaction/KeyboardCommands.mjs';
import {createDockTearOutHandlers}          from '../../../src/dashboard/dock/window/TearOut.mjs';
import {createDockVesselEmbodiment}         from '../../../src/dashboard/dock/window/VesselEmbodiment.mjs';
import {createDockWorkspaceSet}             from '../../../src/dashboard/dock/window/WorkspaceSet.mjs';
import {createVesselParkHandlers}           from '../../../src/dashboard/dock/window/VesselPark.mjs';
import TourRunner                           from '../../../src/ai/client/TourRunner.mjs';
import {PREVIEW_SCHEMA, previewToOperation} from '../../../src/dashboard/dock/model/PreviewContract.mjs';
import {demoBTourScript, initialDocument}   from './demoBPerspectives.mjs';
import '../../../src/button/Base.mjs';   // registers the `button` ntype the bars compose
import '../../../src/tab/Container.mjs'; // registers the `tab-container` ntype the projection emits
import '../../../src/toolbar/Base.mjs';  // registers the `toolbar` ntype the bars use

/**
 * @summary The Demo-B showcase workspace: named perspectives that MORPH, and a pane that
 * leaves for its own OS window and returns with its state unbroken — the only-Neo story.
 *
 * **This class hand-rolls a workspace host that the engine now owns, and is not the shape to
 * copy.** {@link Neo.dashboard.dock.Workspace} is the normative host — it owns the committed
 * document, the reducer, the read half of the holder contract, the deferred view-sync and the
 * projection/FLIP loop — and the docking design record fixes it as canonical. Demo A already
 * consumes it; this workspace has not migrated yet because its cross-window tear-out half is
 * coupled to engine work still in flight. Anything starting a new dock host takes the base class.
 * Be aware when reading below that its member signatures differ from the engine's: the base class
 * hands resolvers `(itemId, item)` and passes a tab-insert descriptor as the first argument to the
 * projection and refresh members, so these bodies are not drop-in overrides.
 *
 * The reducer-container ownership it implements by hand (committed `dockZone.v1` document as
 * the single source of truth; the pure reducer + view-sync halves of the dock-holder
 * contract) carries the two capabilities this demo exists to show:
 *
 * - **Perspectives** ride a {@link Neo.dashboard.dock.persistence.PerspectiveLibrary}: ordinary views are
 *   window-scoped; the detached view captures BOTH worker-owned workspace documents through
 *   `captureTopologyPerspective`. Loading that record composes the real
 *   {@link Neo.dashboard.dock.model.TopologyReconciler} and renders its structured remainder.
 *   The switcher bar rebuilds from store lifecycle events — buttons are born from
 *   `perspectiveSaved`, never hardcoded.
 * - **Pop-out** rides the shared-heap vessel: panes are INSTANCE-CACHED (created once,
 *   handed across every re-projection by `DockProjectionReconciler`), so detaching the
 *   workbench moves the LIVE component into the popup window's view tree
 *   (`mainView.add(instance)` — both windows share one App Worker) and reattaching moves it
 *   home. The {@link Neo.examples.dashboard.crossWindow.CounterPane} witness makes the
 *   reparent-never-recreate contract visible: its count survives because its instance does.
 *   Document honesty: pop-out and item return use the atomic two-document `transferItem` seam;
 *   the popup stack-handle return composes the sibling `transferNode` seam. Ownership therefore
 *   moves commit-or-neither while component reparenting stays orthogonal.
 *
 * @class Neo.examples.dashboard.crossWindow.DemoBWorkspace
 * @extends Neo.container.Base
 */
/**
 * @summary Compares the observed source-drag chrome against the committed document, one term at a time.
 *
 * Each term is observed SEPARATELY, for the same reason the coordinator observes its own claim
 * candidates one by one (`manager/DragCoordinator#recordClaimResolution`): `||` short-circuits, so a
 * single collapsed error string cannot distinguish a projection-identity mismatch from a tab-bar arity
 * one. A receipt that proves the step aborted before any gesture started, but not on which term, cannot
 * be re-run into an answer — the term is already gone.
 *
 * Pure by construction: it takes values already read from the live chrome rather than the components
 * that carry them, so the comparison is reachable from a unit spec without a rendered workspace. The
 * caller owns the reads; this owns the verdict AND the message, so a collapse back to one generic
 * receipt cannot happen on one side without failing the other's coverage.
 *
 * Every `actual` is normalized to `null` rather than left `undefined`: an absent surface is exactly
 * when a term mismatches, and `JSON.stringify` DROPS undefined-valued keys — so the untotalled shape
 * lost the field on precisely the failures it exists to explain. Verdicts are computed from the RAW
 * observation before normalization, so the admitted/rejected population is unchanged by it.
 * @param {Object} data
 * @param {Number|undefined} data.observedBarItemCount Rendered tab-bar child count.
 * @param {String|undefined} data.observedNodeId Live `dockNodeId` of the source tabs node.
 * @param {String[]} [data.observedProjectedItemIds=[]] Live projected dock item ids.
 * @param {String|undefined} data.observedWorkspaceId Live `dockWorkspaceId` of the source sort zone.
 * @param {String[]} data.sourceItemIds Committed item ids for the source node.
 * @param {String} data.sourceNodeId Committed source node id.
 * @param {String} data.sourceWorkspaceId Committed source workspace id.
 * @returns {{chromeMismatch:Object,error:String|null,mismatchedTerms:String[]}}
 */
export const describeCrossWindowChromeMismatch = ({
    observedBarItemCount,
    observedNodeId,
    observedProjectedItemIds=[],
    observedWorkspaceId,
    sourceItemIds,
    sourceNodeId,
    sourceWorkspaceId
}={}) => {
    // `barItemCount` compares the tab bar's rendered children against the DOCUMENT's item count, so any
    // header-action chrome the bar carries that is not a projected dock item makes the two disagree —
    // the first term to suspect while header actions keep landing on that surface.
    let chromeMismatch = {
        dockNodeId      : {expected: sourceNodeId,           actual: observedNodeId,                 mismatch: observedNodeId          !== sourceNodeId},
        dockWorkspaceId : {expected: sourceWorkspaceId,      actual: observedWorkspaceId,            mismatch: observedWorkspaceId     !== sourceWorkspaceId},
        barItemCount    : {expected: sourceItemIds.length,   actual: observedBarItemCount,           mismatch: observedBarItemCount    !== sourceItemIds.length},
        projectedCount  : {expected: sourceItemIds.length,   actual: observedProjectedItemIds.length, mismatch: observedProjectedItemIds.length !== sourceItemIds.length},
        projectedItemIds: {expected: [...sourceItemIds],     actual: [...observedProjectedItemIds],  mismatch: observedProjectedItemIds.some((projectedItemId, index) => projectedItemId !== sourceItemIds[index])}
    };

    Object.values(chromeMismatch).forEach(term => {
        term.actual = term.actual ?? null
    });

    let mismatchedTerms = Object.keys(chromeMismatch).filter(term => chromeMismatch[term].mismatch);

    return {
        chromeMismatch,
        error: mismatchedTerms.length > 0
            ? `source drag chrome does not match the current workspace document: ${mismatchedTerms.join(', ')}`
            : null,
        mismatchedTerms
    }
};

class DemoBWorkspace extends Container {
    /**
     * Shared coordinator registry key for the two active Demo-B workspaces.
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
     * The second popup render target's worker-owned dock-zone document. Registered through the
     * same workspace-set seam as the first popup; topology capture stays main+popup-1 scoped,
     * so this document never enters perspective records.
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
     * The tour runner playing the Demo-B screenplay.
     * @member {Neo.ai.client.TourRunner|null} tourRunner=null
     */
    tourRunner = null
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
     * Gesture tear-out bookkeeping, SEPARATE from {@link #detachedPanes} by design (the
     * composition law): `tearOutPanes[itemId] = {windowName, windowId}` is written only
     * POST-COMMIT (the detached terminal), so mid-gesture the click-pop-out machinery —
     * connect-reparent and the model-mutating disconnect-reattach — sees nothing and a
     * cancelled tear-out stays zero-mutation by guard.
     * @member {Object} tearOutPanes={}
     * @protected
     */
    tearOutPanes = {}
    /**
     * The connect-race partner of {@link #tearOutPanes}: records a tear-out vessel window that
     * connected BEFORE its terminal committed (long drags) as `tearOutConnects[itemId] =
     * {windowId}`. Adoption runs at whichever event lands SECOND — terminal or connect. Exact
     * physical authority stays private on manager.Window and is resolved just in time.
     * @member {Object} tearOutConnects={}
     * @protected
     */
    tearOutConnects = {}
    /**
     * Exact connect continuations admitted by one consumed owner grant but not yet published after
     * cross-window pane staging. Closing a vessel deletes this token before awaiting the platform,
     * so the resumed stage can never publish a retired generation after the fence is later cleared.
     * @member {Map<String,Object>} tearOutConnectAdmissions
     * @protected
     */
    tearOutConnectAdmissions = new Map()
    /**
     * Transient render-only pane embodiment. An admitted pre-terminal vessel carries the real pane
     * while an exact-slot placeholder preserves the source card/header pairing. Document truth is
     * untouched until terminal; cancellation restores through the live placeholder position.
     * @member {Object|null} tearOutEmbodiment=null
     * @protected
     */
    tearOutEmbodiment = null
    /**
     * Items whose vessel retirement has started. The mark precedes pane restoration + native close,
     * so a late async connect cannot reparent content into a generation already closing.
     * @member {Set<String>} tearOutRetirements
     * @protected
     */
    tearOutRetirements = new Set()
    /**
     * Monotonic count of actual tear-out `windowOpen` attempts. The headed conversion witness
     * snapshots this counter at first park and after re-show; equality is the mechanical proof
     * that one continuous gesture never tries to reacquire popup activation.
     * @member {Number} tearOutAcquisitionAttempts=0
     * @protected
     */
    tearOutAcquisitionAttempts = 0
    /**
     * Product-semantic owner grants for popup vessels. The merged native-window identity spine
     * proves the exact physical child; this map binds that child to one product flow + item +
     * generation without trusting URL shape, item id, arrival order, or an existing pane entry.
     * Keys are `${flow}:${itemId}` and values are `{generation, token}`.
     * @member {Map} vesselOwnerGrants
     * @protected
     */
    vesselOwnerGrants = new Map()
    /**
     * Monotonic product-vessel generation. A new admission for the same flow/item replaces the
     * prior grant, so reload, replay, and same-name reuse cannot recover semantic ownership.
     * @member {Number} vesselOwnerGrantGeneration=0
     * @protected
     */
    vesselOwnerGrantGeneration = 0
    /**
     * Exact-position return truth: `tearOutPlacements[itemId] = {tabsNodeId, index}`, captured
     * at the detach terminal BEFORE the commit removes the item from the tree (`addTab` appends
     * by default, so this pair is the only way home). Consumed exact-once by
     * {@link #reintegrateTearOutItem} on vessel death; a refused detach commit deletes its own
     * capture, so no stale placement outlives a gesture that never committed.
     * @member {Object} tearOutPlacements={}
     * @protected
     */
    tearOutPlacements = {}
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
     * Latest atomic projection request per worker-owned workspace. Document truth and
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

        me.dockModel        = Document.clone(initialDocument);
        me.popupDocument    = DemoBWorkspace.createPopupDocument();
        me.popup2Document   = DemoBWorkspace.createPopupDocument();

        // Live-rect authority: every Demo-B render target publishes resize geometry into
        // manager.Window. Movement-only snapshots make a post-resize conversion compare against
        // stale extents, violating the metric before threshold calibration even begins.
        Neo.main.addon.WindowPosition?.setConfigs({observeResize: true, windowId: me.windowId});

        // Both workspaces register under their STABLE semantic ids — the seams read/write the
        // live owner fields, so registry resolution always answers with committed truth.
        me.workspaceSet = createDockWorkspaceSet();

        me.workspaceSet.register(DemoBWorkspace.MAIN_WORKSPACE_ID, {
            getDocument: () => me.dockModel,
            setDocument: document => me.dockModel = document
        });

        me.workspaceSet.register(DemoBWorkspace.POPUP_WORKSPACE_ID, {
            getDocument: () => me.popupDocument,
            setDocument: document => me.popupDocument = document
        });

        me.workspaceSet.register(DemoBWorkspace.POPUP2_WORKSPACE_ID, {
            getDocument: () => me.popup2Document,
            setDocument: document => me.popup2Document = document
        });

        me.dockPreviewProducer = Neo.create(DockPreviewProducer);
        me.dockService      = Neo.create(DockService, {});
        me.interactionService = Neo.create(InteractionService, {});
        me.perspectiveStore = Neo.create(PerspectiveLibrary, {});

        // The cross-window stage choreography (decomposition Phase 1): a pure decision
        // machine over host-injected seams. Stage STATE stays host-owned by contract — the
        // unit spec's stage doubles write `crossWindowTargetWindowId` and call
        // `crossWindowStageResolve` directly, so those fields remain this component's public
        // stage surface while the module owns the code manipulating them.
        me.crossWindowStage = createCrossWindowStage({
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
            createVesselOwnerGrant   : (flow, itemId) => me.createVesselOwnerGrant(flow, itemId),
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
            hostComponentId         : me.id,
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
            revokeVesselOwnerGrant: (flow, itemId) => me.revokeVesselOwnerGrant(flow, itemId),
            setPopupDocument      : (workspaceId, document) => workspaceId === DemoBWorkspace.POPUP2_WORKSPACE_ID
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

        me.tearOutEmbodiment = createDockVesselEmbodiment({
            resolvePane: itemId => me.paneCache[itemId]
                ?? (me.dockModel?.items?.[itemId] && me.resolvePane(itemId, me.dockModel.items[itemId])),
            resolveTarget: windowId => Neo.apps[windowId]?.mainView ?? null
        });

        // The gesture tear-out choreography (MAIN workspace only): the admission machine holds the
        // one vessel slot; this host supplies the platform seams. The composition law: a tear-out
        // vessel NEVER writes `detachedPanes` mid-gesture — that single omission keeps the
        // click-pop-out reparent (`onWindowConnect`) and the model-mutating reattach
        // (`onWindowDisconnect` → `reattachPane`) structurally OUT of the gesture path, so a
        // cancelled tear-out is zero-mutation by GUARD. Post-commit adoption uses its own
        // bookkeeping (`tearOutPanes` / `tearOutConnects`).
        me.tearOutHandlers = createDockTearOutHandlers({
            applyOperation  : descriptor => me.applyTearOutOperation(descriptor),
            closeVessel     : vessel => me.closeTearOutVessel(vessel),
            onDocumentChange: (document, operation, vessel) => me.onTearOutDocumentChange(document, operation, vessel),
            openVessel      : request => me.openTearOutVessel(request)
        });

        // Conversion never reacquires a popup. The source-owned admission machines retain the
        // existing tear-out vessel while this host binds their effects to its exact native route.
        me.vesselParkHandlers = createVesselParkHandlers({
            disposeVessel: vessel => me.disposeParkedTearOutVessel(vessel),
            parkVessel   : vessel => me.parkTearOutVessel(vessel),
            reshowVessel : vessel => me.reshowTearOutVessel(vessel)
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
            closeVessel     : vessel => me.closeTearOutVessel(vessel),
            commitTransfer  : data => me.commitKeyboardTransfer(data),
            enumerateTargets: request => me.enumerateKeyboardTargets(request),
            focusVessel     : vessel => me.focusNamedWindow(vessel.windowName),
            focusWorkspace  : ({workspaceId}) => me.focusDockWorkspaceWindow(workspaceId),
            highlightTarget : target => me.setKeyboardTargetHighlight(target),
            onDocumentChange: (document, operation) => me.onTearOutDocumentChange(document, operation),
            openVessel      : request => me.openTearOutVessel(request)
        });

        me.tourRunner = Neo.create(TourRunner, {
            componentId        : me.id,
            crossWindowExecutor: me,
            dockService        : me.dockService,
            mode               : 'demo',
            script             : demoBTourScript
        });

        me.tourRunner.on({
            beat    : me.onTourBeat,
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

        // popup lifecycle: the pop-out pane reparents on connect, comes home on disconnect
        Neo.currentWorker.on({
            connect   : me.onWindowConnect,
            disconnect: me.onWindowDisconnect,
            scope     : me
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
     * @summary Render a keyboard command outcome into EVERY live announcement region — the
     * announcement seam of the keyboard command machine. TEXT only (`.text` is inert by
     * construction); the message is the machine's complete terminal-derived sentence.
     *
     * Both windows carry the same terminal-derived truth: a command's outcome must be audible
     * wherever the operator's focus ends up (a committed transfer moves focus ACROSS windows,
     * so announcing only in the origin window would announce into the window they just left).
     * @param {Object} announcement `{command, itemId, terminal, focusTransferred, message}`.
     * @protected
     */
    announceKeyboardOutcome({message}) {
        let me     = this,
            main   = me.getReference('kbd-live-b'),
            popup  = me.kbdLivePopup,
            popup2 = me.kbdLivePopup2;

        main && (main.text = message);
        popup && !popup.isDestroyed && (popup.text = message);
        popup2 && !popup2.isDestroyed && (popup2.text = message)
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
     * @summary The keyboard command surface's key routing. Entry chords on a focused dock tab
     * header: Ctrl+Shift+D detaches it to its own OS window; Ctrl+Shift+M starts the move cycle.
     * While a cycle is active, Ctrl+Shift+ArrowRight/ArrowLeft cycle the candidates,
     * Ctrl+Shift+Enter commits, and Escape (alone — no native meaning on a header) cancels.
     * Outside a cycle every key keeps its native meaning; the machine's `getActiveCycle()` is
     * the single routing gate.
     * @param {Object} data The keydown DomEvent payload.
     * @returns {Promise<void>}
     * @protected
     */
    async onDockHostKeyDown(data) {
        let me       = this,
            commands = me.keyboardCommands,
            chorded  = data.ctrlKey && data.shiftKey;

        // the routing host that caught this keydown names the ORIGIN window — the directional
        // fact focus mechanics need (a popup focuses its opener; the opener focuses by name)
        me.lastKeyboardOriginWindowId = data.component?.windowId ?? me.windowId;

        if (commands.getActiveCycle()) {
            if (data.key === 'Escape') {
                commands.cycleCancel();
                return
            }

            if (chorded) {
                switch (data.key) {
                    case 'ArrowRight':
                        commands.cycleNext();
                        return
                    case 'ArrowLeft':
                        commands.cyclePrev();
                        return
                    case 'Enter':
                        await commands.cycleCommit();
                        return
                }
            }

            return
        }

        if (!chorded || !['d', 'm'].includes(data.key?.toLowerCase?.())) {
            return
        }

        let focused = me.resolveFocusedDockItem(data);

        if (!focused) return;

        if (data.key.toLowerCase() === 'd') {
            // detach parity with the pointer projection's arming rule: tear-out arms on the
            // MAIN workspace only — a tear-out FROM a vessel window is popup-over-popup
            // territory, deliberately not wired on either input path
            if (focused.workspaceId !== DemoBWorkspace.MAIN_WORKSPACE_ID) return;

            await commands.detachItem(focused)
        } else {
            commands.cycleStart({...focused, instructions: DemoBWorkspace.KEYBOARD_CYCLE_INSTRUCTIONS})
        }
    }

    /**
     * @summary Resolve the dock item the keydown acted on: the event path's tab-header button →
     * its `dockItemId` STAMP when present (structural identity — the projection writes it into
     * every header config it builds, so identity never depends on header order ≡ document
     * order), else the positional fallback: header toolbar index → the owning projected
     * tab-container's `dockNodeId` → its WORKSPACE's document tabs node items at that index.
     * The document is the authority on purpose: DemoB's panes are LIVE instances, which the
     * adapter's item decoration deliberately passes through untouched — only freshly-projected
     * CONTAINER configs carry dock metadata, so the container's node id + the committed document
     * answer identity where the card cannot. Which document is answered by host containment
     * ({@link #resolveDockWorkspaceId}), so a popup-origin keydown resolves against the popup
     * workspace's truth.
     * @param {Object} data The keydown DomEvent payload (carries the component path).
     * @returns {Object|null} `{itemId, itemLabel, workspaceId}` or `null` when the focus is not a dock tab header.
     * @protected
     */
    resolveFocusedDockItem(data) {
        let me     = this,
            button = (data.path || [])
                .map(node => Neo.getComponent(node.id))
                .find(component => component?.ntype === 'tab-header-button');

        if (!button) return null;

        let toolbar      = button.up({ntype: 'tab-header-toolbar'}) || button.parent,
            tabContainer = toolbar?.up({ntype: 'tab-container'}),
            workspaceId  = me.resolveDockWorkspaceId(tabContainer),
            document     = workspaceId ? me.getWorkspaceDocument(workspaceId) : null;

        // structural identity first: the projection's own stamp, immune to any future
        // pinning/reorder/hidden-class change in header order
        if (button.dockItemId) {
            return {
                itemId   : button.dockItemId,
                itemLabel: document?.items?.[button.dockItemId]?.title ?? button.dockItemId,
                workspaceId
            }
        }

        let index = toolbar?.items?.indexOf(button) ?? -1,
            // the projection filters rail-hidden items out of the tab flow — mirror it so the
            // header index maps to the same list the strip renders
            nodeItems = document?.nodes?.[tabContainer?.dockNodeId]?.items?.filter(id =>
                document.items?.[id]?.autoHidden !== true
            ),
            itemId    = index > -1 && Array.isArray(nodeItems) ? nodeItems[index] : null;

        if (!itemId) return null;

        return {
            itemId,
            itemLabel: document?.items?.[itemId]?.title ?? itemId,
            workspaceId
        }
    }

    /**
     * @summary Resolve which registered workspace a projected component belongs to, by walking
     * its parent chain up to a live host in {@link #crossWindowHosts}. Containment is the
     * identity mechanism on purpose: the adapter stamps `dockWorkspaceId` on SortZone configs
     * (created lazily on first drag), while the host registry is live from composition time —
     * one mechanism that answers for every projected child in either window, drag-armed or not.
     * @param {Neo.component.Base|null} component
     * @returns {String|null} The workspace id, or `null` when the component is outside every host.
     * @protected
     */
    resolveDockWorkspaceId(component) {
        let current = component;

        while (current) {
            for (const [workspaceId, host] of this.crossWindowHosts) {
                if (host === current) return workspaceId
            }

            current = current.parent
        }

        return null
    }

    /**
     * @summary Enumerate the legal keyboard-transfer targets across the registered workspaces —
     * every tabs zone in STABLE registry order, excluding the item's current tabs, labeled with
     * the workspace's human name (+ a zone ordinal when a workspace has several).
     * @param {Object} data
     * @param {String} data.itemId
     * @returns {Object[]} `[{workspaceId, tabsId, label}]`
     * @protected
     */
    enumerateKeyboardTargets({itemId}) {
        let me     = this,
            labels = {
                [DemoBWorkspace.MAIN_WORKSPACE_ID]  : 'Main window',
                [DemoBWorkspace.POPUP_WORKSPACE_ID] : 'Popup window',
                [DemoBWorkspace.POPUP2_WORKSPACE_ID]: 'Popup window 2'
            };

        return me.workspaceSet.ids().flatMap(workspaceId => {
            // only workspaces with a LIVE render target are legal keyboard targets: a registered
            // popup workspace whose window never opened cannot show the highlight, cannot take
            // focus, and would leave the operator committing into the invisible
            let host = me.crossWindowHosts.get(workspaceId);

            if (!host || host.isDestroyed) return [];

            let document     = me.workspaceSet.getDocument(workspaceId),
                nodes        = document?.nodes || {},
                sourceTabsId = document?.items?.[itemId]
                    ? Document.findContainingTabsId(document, itemId)
                    : null,
                tabsIds      = Object.keys(nodes).filter(nodeId =>
                    nodes[nodeId].type === 'tabs' && nodeId !== sourceTabsId
                );

            // itemId rides every candidate: the highlight seam renders through the shared
            // dockPreview contract, whose payloads are item-scoped by schema
            return tabsIds.map((tabsId, index) => ({
                itemId,
                label: tabsIds.length > 1
                    ? `${labels[workspaceId] ?? workspaceId}, zone ${index + 1}`
                    : (labels[workspaceId] ?? workspaceId),
                tabsId,
                workspaceId
            }))
        })
    }

    /**
     * @summary Render (or clear) the keyboard cycle's current-candidate highlight through the
     * SHARED drag-affordance consumer: a hand-built `tab-into` dockPreview payload (the contract
     * module is the pure SSOT; the fail-closed renderer validates it) drives the target host's
     * {@link Neo.dashboard.dock.interaction.Preview} — the same overlay, geometry conversion, and skin the
     * pointer hover renders through, so one affordance model serves both input paths. The
     * indicator MENU stays pointer-owned: its semantics are within-zone position choice, which
     * the keyboard cycle's zone-target grammar deliberately does not offer.
     *
     * The overlay's whole-zone band is shape+position — inherently paired with a non-color
     * carrier, the WCAG 1.4.1 duty the command machine's seam documents.
     *
     * Async by necessity (a popup target may need a first geometry measure); the generation
     * token makes it supersession-safe — a stale measure never paints over a newer candidate
     * or a clear. The machine treats the seam as fire-and-forget, so ordering is owned here.
     * @param {Object|null} target `{workspaceId, tabsId, itemId}` or `null` to clear.
     * @returns {Promise<void>}
     * @protected
     */
    async setKeyboardTargetHighlight(target) {
        let me         = this,
            generation = ++me.keyboardHighlightGeneration;

        // every flip clears BOTH windows' overlays first: the previous candidate may render
        // in the other window, and a clear (null) must reach it too
        me.crossWindowHosts.forEach((host, workspaceId) => me.clearWorkspaceAffordances(workspaceId));

        if (!target) return;

        let host = me.crossWindowHosts.get(target.workspaceId);

        if (!host || host.isDestroyed) return;

        let geometry = me.crossWindowGeometry.get(target.workspaceId)
                || await me.measureWorkspaceGeometry(target.workspaceId);

        if (generation !== me.keyboardHighlightGeneration || !geometry || me.isDestroyed) return;

        let renderer = host.down({ntype: 'dock-preview'}),
            zone     = geometry.zones.find(entry => entry.nodeId === target.tabsId);

        if (!renderer || !zone) return;

        renderer.dockPreview = {
            feedback : {state: 'accepted'},
            itemId   : target.itemId,
            placement: {kind: 'tab-into'},
            schema   : PREVIEW_SCHEMA,
            target   : {nodeId: target.tabsId}
        };
        renderer.applyTargetGeometry(me.localDockRect(zone.rect, geometry.hostRect))
    }

    /**
     * @summary The keyboard transfer commit — `Operations.transferItem` produces the
     * commit-or-neither document pair, then the shared two-phase core lands it:
     * {@link #adoptCommittedTransferPair} (both-or-neither adoption, first exit on refusal) and
     * {@link #reconcileTransferPair} (target-first, unguarded — a discrete command has no
     * mid-flight supersession to fence). The pointer path's `commitCrossWindowTransfer` wrapper
     * is deliberately NOT reused: its context/generation predicates and continuity-proof
     * machinery belong to the continuous gesture. Deliberately NO `detachedPanes` bookkeeping
     * here — that classification belongs to the pointer pop-out flow, and close-race policy for
     * transferred items is the whole-stack return leaf's contract, which binds to the same core.
     * @param {Object} data
     * @param {String} data.itemId
     * @param {Object} data.target `{workspaceId, tabsId}` — the committed cycle candidate.
     * @returns {Promise<{errors: String[]}>}
     * @protected
     */
    async commitKeyboardTransfer({itemId, target}) {
        let me                = this,
            sourceWorkspaceId = me.workspaceSet.ids().find(id =>
                !!me.workspaceSet.getDocument(id)?.items?.[itemId]
            );

        if (!sourceWorkspaceId) {
            return {errors: [`unknown item "${itemId}"`]}
        }

        let {sourceDocument, targetDocument, errors} = Operations.transferItem(
            me.workspaceSet.getDocument(sourceWorkspaceId),
            me.workspaceSet.getDocument(target.workspaceId),
            {
                itemId,
                sourceWorkspaceId,
                targetWorkspaceId: target.workspaceId,
                target           : {operation: 'addTab', tabsNodeId: target.tabsId}
            }
        );

        if (errors.length) {
            return {errors}
        }

        let pair = {sourceDocument, sourceWorkspaceId, targetDocument, targetWorkspaceId: target.workspaceId};

        if (!me.adoptCommittedTransferPair(pair)) {
            return {errors: ['workspace-set adoption refused the pair']}
        }

        await me.reconcileTransferPair(pair);

        return {errors: []}
    }

    /**
     * @summary Focus a named popup window through the Main verb — Boolean admission (the
     * `windowOpen` discipline applied to focus): the answer is the verified outcome, and `false`
     * is a legitimate degraded terminal for the command machine to announce, never a throw.
     * @param {String} windowName
     * @returns {Promise<Boolean>}
     * @protected
     */
    async focusNamedWindow(windowName) {
        try {
            return !!(await Neo.Main.windowFocus({windowName, windowId: this.windowId}))
        } catch (error) {
            return false
        }
    }

    /**
     * @summary Transfer focus to the window rendering a workspace — the command machine's
     * `focusWorkspace` seam, DIRECTIONAL because focus-stealing rules are: a window may focus a
     * popup it opened (the named handle lives in its Main actor), and a popup may focus its
     * OPENER (it holds the keystroke's user activation) — so the route is picked from the
     * command's recorded origin window. Same Boolean-admission discipline on every branch; a
     * platform decline is the machine's announced degraded terminal, never a throw.
     * @param {String} workspaceId
     * @returns {Promise<Boolean>}
     * @protected
     */
    async focusDockWorkspaceWindow(workspaceId) {
        let me   = this,
            host = me.crossWindowHosts.get(workspaceId);

        if (!host || host.isDestroyed) return false;

        let targetWindowId = host.windowId,
            originWindowId = me.lastKeyboardOriginWindowId ?? me.windowId;

        // the command ran in the target's own window — focus is already there
        if (targetWindowId === originWindowId) return true;

        // popup-workspace target: the MAIN window opened it, so ITS Main actor holds the handle
        if (targetWindowId !== me.windowId) {
            return me.focusNamedWindow(workspaceId === DemoBWorkspace.POPUP2_WORKSPACE_ID
                ? DemoBWorkspace.POPUP2_WINDOW_NAME
                : 'demo-b-cross-window')
        }

        // main-window target from a popup origin: route the verb to the POPUP's main thread
        // (windowId routing) — omitting windowName makes it focus its opener
        try {
            return !!(await Neo.Main.windowFocus({windowId: originWindowId}))
        } catch (error) {
            return false
        }
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
     * Resolves worker-owned document truth by semantic workspace id — through the workspace-set
     * registry, so an unknown id fails closed instead of guessing.
     * @param {String} workspaceId
     * @returns {Object|null}
     */
    getWorkspaceDocument(workspaceId) {
        return this.workspaceSet.getDocument(workspaceId)
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
                getDocument: () => me.popup2Document,
                setDocument: document => me.popup2Document = document
            })
        }

        return me.workspaceSet.register(DemoBWorkspace.POPUP_WORKSPACE_ID, {
            getDocument: () => me.popupDocument,
            setDocument: document => me.popupDocument = document
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
     * primary + popup documents with one composed fingerprint.
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
            ? Persistence.captureTopologyPerspective([me.dockModel, me.popupDocument], metadata)
            : Persistence.createSavedLayout(me.dockModel, metadata);

        if (created.errors.length) {
            return {errors: created.errors, saved: false}
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
     * The tour bar — play button, caption feed, pip strip (the Demo-A pattern).
     * @returns {Object}
     */
    createTourBar() {
        let me = this;

        return {
            cls   : ['agentos-dockdemo-tourbar'],
            flex  : 'none',
            layout: {ntype: 'hbox', align: 'center'},
            ntype : 'toolbar',
            items : [{
                cls      : ['agentos-dockdemo-tour-play'],
                handler  : () => me.startTour(),
                iconCls  : 'fa fa-play',
                ntype    : 'button',
                reference: 'tour-play-b',
                text     : 'Tour'
            }, {
                cls      : ['agentos-dockdemo-tour-caption'],
                flex     : 1,
                html     : `${demoBTourScript.title} — press Tour: three perspectives get captured live, morph into each other, and a pane leaves for its own OS window without dropping a beat.`,
                ntype    : 'component',
                reference: 'tour-caption-b',
                style    : {padding: '0 12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}
            }, {
                cls      : ['agentos-dockdemo-tour-pips'],
                flex     : 'none',
                ntype    : 'component',
                reference: 'tour-pips-b',
                vdom     : {cn: DemoBWorkspace.totalBeats().map(() => ({cls: ['agentos-dockdemo-pip']}))}
            }]
        }
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
     * @returns {{loaded: Boolean, errors: String[], report: (Object|undefined)}}
     */
    loadPerspectiveByName(name) {
        let me         = this,
            summary    = me.perspectiveStore.list().find(entry => entry.perspectiveName === name || entry.layoutId === name),
            collection = me.perspectiveStore.collection,
            layout     = summary ? collection.layouts[summary.layoutId] : null;

        // Reconcile BEFORE `loadPerspective` advances the store's active id. A malformed
        // topology record or live document must leave both layout truth and selection truth
        // untouched — fail-closed means more than avoiding a document assignment.
        if (layout?.captureScope === 'topology') {
            let preview = me.restoreTopologyPerspective(layout, {commit: false});

            if (!preview.loaded) return preview;

            let activated = me.perspectiveStore.loadPerspective(name);

            if (activated.errors.length) {
                return {errors: activated.errors, loaded: false, report: preview.report}
            }

            me.commitTopologyRestore(preview);

            return {errors: [], loaded: true, report: preview.report}
        }

        let result = me.perspectiveStore.loadPerspective(name);

        if (result.errors.length || !result.document) {
            return {errors: result.errors, loaded: false}
        }

        me.onDockZoneDocumentChange(result.document);

        return {errors: [], loaded: true}
    }

    /**
     * @summary Commits a validated topology result while preserving panes that remain owner-held
     * but cannot be projected because their captured window is not live.
     * @param {Object} result
     * @param {Object[]} result.documents Reconciled documents for the currently live topology.
     * @param {Boolean} result.hasLivePopup Whether a second render target currently exists.
     * @param {Object} result.report Structured reconciliation remainder.
     * @returns {Promise}
     * @protected
     */
    commitTopologyRestore({documents, hasLivePopup, report}) {
        let me              = this,
            liveDocuments   = hasLivePopup ? documents.slice(0, 2) : documents.slice(0, 1),
            liveItemIds     = new Set(liveDocuments.flatMap(document => Object.keys(document?.items || {}))),
            preserveItemIds = (report?.unrestored || [])
                .map(entry => entry.itemId)
                .filter(itemId => !liveItemIds.has(itemId));

        hasLivePopup && (me.popupDocument = documents[1]);

        return me.onWorkspaceDocumentChange(DemoBWorkspace.MAIN_WORKSPACE_ID, documents[0], {
            preserveItemIds
        })
    }

    /**
     * @summary Reconciles one topology record onto the currently live workspace documents.
     * A connected/detached popup contributes its worker-owned document; otherwise the live
     * topology is intentionally one window. Validation errors mutate neither document.
     * @param {Object} layout A topology-scope saved-layout record.
     * @param {Object} [options={}]
     * @param {Boolean} [options.commit=true] Commit reconciled documents; false is a preflight.
     * @returns {{loaded: Boolean, errors: String[], report: Object, documents: Object[], hasLivePopup: Boolean}}
     */
    restoreTopologyPerspective(layout, {commit = true} = {}) {
        let me            = this,
            hasLivePopup  = Object.keys(me.detachedPanes).length > 0,
            liveDocuments = hasLivePopup ? [me.dockModel, me.popupDocument] : [me.dockModel],
            result        = DockTopologyReconciler.reconcile(layout, liveDocuments),
            report        = Document.clone({
                applied        : result.applied,
                displaced      : result.displaced,
                errors         : result.errors,
                mapping        : result.mapping,
                noWindowSpawned: true,
                unmatchedLive  : result.unmatchedLive,
                unrestored     : result.unrestored
            });

        me.restoreReport = report;
        me.renderRestoreReport();

        if (result.errors.length) {
            return {documents: result.documents, errors: result.errors, hasLivePopup, loaded: false, report}
        }

        commit && me.commitTopologyRestore({documents: result.documents, hasLivePopup, report});

        return {documents: result.documents, errors: [], hasLivePopup, loaded: true, report}
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
            : `<strong>Topology restore — no window spawned.</strong> Unrestored: ${entries(report.unrestored)}. Displaced: ${report.displaced.length ? report.displaced.map(entry => escape(entry.itemId)).join(', ') : 'none'}. Unmatched live slots: ${report.unmatchedLive.length ? report.unmatchedLive.join(', ') : 'none'}.`;
        target.hidden = false
    }

    /**
     * The view-sync half: stores the committed document and re-projects, deferred one tick
     * (the normative guard — a committing interaction surface is never destroyed mid-handler).
     * @param {Object} document
     * @returns {Promise}
     */
    onDockZoneDocumentChange(document) {
        return this.onWorkspaceDocumentChange(DemoBWorkspace.MAIN_WORKSPACE_ID, document)
    }

    /**
     * @summary Publishes one named workspace document, then serializes a deferred projection refresh.
     *
     * Ordinary queued refreshes coalesce onto the latest worker-owned document for that
     * workspace; the atomic cross-window commit owns its explicit target-first pair separately.
     * @param {String} workspaceId
     * @param {Object} document
     * @param {Object} [options={}] Projection-lifecycle options
     * @param {Iterable<String>} [options.preserveItemIds=[]] Owner-held panes absent from this
     * document which the shared reconciler must park instead of destroy.
     * @returns {Promise}
     * @protected
     */
    onWorkspaceDocumentChange(workspaceId, document, {preserveItemIds = []} = {}) {
        let me      = this,
            request = {document, preserveItemIds: [...preserveItemIds]};

        if (workspaceId === DemoBWorkspace.MAIN_WORKSPACE_ID) {
            me.dockModel = document
        } else if (workspaceId === DemoBWorkspace.POPUP_WORKSPACE_ID) {
            me.popupDocument = document
        } else if (workspaceId === DemoBWorkspace.POPUP2_WORKSPACE_ID) {
            me.popup2Document = document
        } else {
            return Promise.reject(new Error(`unknown Demo-B workspace "${workspaceId}"`))
        }

        me.workspaceProjectionRequests.set(workspaceId, request);
        me.refreshPromise = me.refreshPromise
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
     * Caption feed + pip progress + the surface cues that make narrated beats EXECUTABLE:
     * perspective saves/loads ride the store, pop-out/reattach ride the vessel — none of
     * them are dock-document ops, so none of them masquerade as descriptors.
     * @param {Object} data The runner's beat payload.
     */
    onTourBeat(data) {
        let me    = this,
            {cue} = data;

        data.caption && me.setTourCaption(data.caption);
        me.setPipProgress(++me.beatCount);

        if (!cue) return;

        cue.type === 'perspective-save' && me.capturePerspective(cue.name, {scope: cue.scope});
        cue.type === 'perspective-load' && me.loadPerspectiveByName(cue.name);
        cue.type === 'popout'           && me.popOutPane(cue.itemId);
        cue.type === 'reattach'         && me.reattachPane(cue.itemId)
    }

    /**
     * @param {Object} data `{completed, errors, log}`
     */
    onTourComplete(data) {
        let me = this;

        me.setTourCaption(`Tour complete — ${data.log.length} beats; the workbench counter never reset.`);
        me.setPipProgress(DemoBWorkspace.totalBeats().length)
    }

    /**
     * Honest failure surface: an aborted tour names its reason.
     * @param {Object} data `{errors, log}`
     */
    onTourError(data) {
        this.setTourCaption(`Tour stopped: ${data.errors[0] || 'unknown reason'}`)
    }

    /**
     * @param {Object} data The runner's scene payload.
     */
    onTourScene(data) {
        this.setTourCaption(`${data.title}${data.caption ? ' — ' + data.caption : ''}`)
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
     * Facade over the extracted cross-window stage module: the SYNCHRONOUS
     * adoption half of the transfer-commit core. Kept as a workspace method because the unit
     * spec wraps it directly.
     * @param {Object} pair
     * @returns {Boolean} false when the workspace-set refused the pair.
     * @protected
     */
    adoptCommittedTransferPair(pair) {
        return this.crossWindowStage.adoptPair(pair)
    }

    /**
     * Facade over the extracted cross-window stage module: the reconcile half
     * of the transfer-commit core (target-first, guard-checked).
     * @param {Object} pair
     * @param {Object} [options]
     * @param {Function} [options.guard] `() => Boolean` — false stops before the next projection.
     * @returns {Promise<Boolean>} true when both projections ran.
     * @protected
     */
    async reconcileTransferPair(pair, options) {
        return this.crossWindowStage.reconcilePair(pair, options)
    }

    /**
     * Facade over the extracted cross-window stage module: retires the
     * logically emptied popup workspace after its stack returned. Kept as a workspace method
     * because the unit spec wraps it directly.
     * @returns {Boolean} true when the popup registry entry existed and was removed.
     * @protected
     */
    retireReturnedPopupWorkspace() {
        return this.crossWindowStage.retireReturnedWorkspace()
    }

    /**
     * Facade over the extracted cross-window stage module: commits the popup's
     * model-resolved stack back into the main workspace as one atomic `transferNode`, then
     * reconciles target-first and retires the emptied popup registry entry.
     * @param {Object} data
     * @returns {Promise<Object>|Boolean} a truthy accepted lifecycle, or false before adoption.
     * @protected
     */
    commitWholeStackReturn(data) {
        return this.crossWindowStage.commitWholeStackReturn(data)
    }

    /**
     * Publishes the atomic transfer pair, then reconciles target before source. Target-first is
     * load-bearing: it adopts the cached pane across the window boundary before the source shell
     * can classify the now-absent item as a retirement.
     * @param {Object} data
     * @returns {Promise}
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
            } = data;

        if (descriptor?.operation === 'transferNode') {
            return me.commitWholeStackReturn(data)
        }

        const
            context       = me.crossWindowGestureContext,
            generation    = me.crossWindowStageGeneration,
            itemId        = descriptor.itemId,
            isPopupDetach = sourceWorkspaceId === DemoBWorkspace.MAIN_WORKSPACE_ID
                && targetWorkspaceId === DemoBWorkspace.POPUP_WORKSPACE_ID,
            targetWindowId   = me.crossWindowTargetWindowId,
            ownsTransfer     = () => !me.isDestroyed
                && me.crossWindowStageGeneration === generation
                && me.crossWindowTargetWindowId === targetWindowId
                && (!isPopupDetach || me.detachedPanes[itemId]?.windowId === targetWindowId);

        // Both-or-neither adoption through the shared core — a refused pair ends the commit here,
        // so the gesture bookkeeping below never diverges from document truth.
        if (!me.adoptCommittedTransferPair({sourceDocument, sourceWorkspaceId, targetDocument, targetWorkspaceId})) {
            return
        }

        // The document pair and vessel ownership are one worker-side commit. A physical close can
        // arrive before either projection settles; publishing this entry synchronously lets the
        // disconnect path reattach the item instead of misclassifying committed truth as a cold
        // cancellation. The generation predicate below prevents that superseded projection from
        // writing stale source/target chrome after the recovery transaction has taken ownership.
        if (isPopupDetach) {
            me.detachedPanes[itemId] = {
                tabsNodeId: context?.sourceNodeId,
                windowId  : targetWindowId,
                windowName: 'demo-b-cross-window'
            }
        }

        me.refreshPromise = me.refreshPromise
            .then(() => me.timeout(0))
            .then(async () => {
                if (!ownsTransfer()) return;

                // `onRemoteDropOut()` and the source-local suppression decision both finish on
                // the coordinator's synchronous mouseup stack, before this deferred projection.
                // Snapshot their counters now: the source projection intentionally destroys its
                // empty tabs zone, so reading a field from that zone after reconciliation would
                // manufacture false evidence from a torn-down object.
                let sourceDecision = {
                    localDropFires    : me.crossWindowStats.localDropFires,
                    remoteDropOutFires: me.crossWindowStats.remoteDropOutFires
                };

                try {
                    if (!await me.reconcileTransferPair(
                        {sourceDocument, sourceWorkspaceId, targetDocument, targetWorkspaceId},
                        {guard: ownsTransfer}
                    )) {
                        return
                    }
                } catch (error) {
                    if (!ownsTransfer()) return;
                    throw error
                }

                if (!ownsTransfer()) return;

                let pane         = me.paneCache[itemId],
                    framesAfter  = pane?.frames ?? -1,
                    targetTabsId = Document.findContainingTabsId(targetDocument, itemId),
                    proof        = {
                        framesAfter,
                        framesBefore      : context?.frames ?? null,
                        framesNotReset    : framesAfter >= (context?.frames ?? Infinity),
                        localDropFires    : sourceDecision.localDropFires,
                        mountDelta        : (pane?.mountCount ?? 0) - (context?.mountCount ?? 0),
                        remoteDropOutFires: sourceDecision.remoteDropOutFires,
                        remoteSnapshot    : context?.remoteSnapshot ?? null,
                        sameInstance      : pane === context?.pane,
                        sourceItemRemoved : !sourceDocument.items?.[itemId]
                            && Document.findContainingTabsId(sourceDocument, itemId) === null,
                        sourceSuppressionConsumed: sourceDecision.remoteDropOutFires === 1
                            && sourceDecision.localDropFires === 0,
                        targetItemPlaced        : !!targetDocument.items?.[itemId]
                            && targetTabsId === descriptor.target?.tabsNodeId,
                        targetMountDelta: Number.isInteger(context?.vesselMountCount)
                            ? (pane?.mountCount ?? 0) - context.vesselMountCount
                            : null,
                        targetTabsId,
                        transferCommits : me.crossWindowStats.transferCommits,
                        vesselMountDelta: Number.isInteger(context?.vesselMountCount)
                            ? context.vesselMountCount - (context?.mountCount ?? 0)
                            : null
                    },
                    checks         = [
                        ['transfer committed exactly once', proof.transferCommits === 1],
                        ['source remote-drop-out fired exactly once', proof.remoteDropOutFires === 1],
                        ['source local drop stayed suppressed', proof.localDropFires === 0],
                        ['remote semantic and rendered preview settled', proof.remoteSnapshot?.ready === true],
                        ['source document relinquished the item', proof.sourceItemRemoved],
                        ['target document placed the item', proof.targetItemPlaced],
                        ['worker component instance stayed identical', proof.sameInstance],
                        ['instance heartbeat did not reset', proof.framesNotReset],
                        ['live vessel added exactly one mount', proof.vesselMountDelta === 1],
                        ['target document added exactly one mount', proof.targetMountDelta === 1],
                        ['live vessel and target added exactly two mounts', proof.mountDelta === 2],
                        ['continuity witness is complete', typeof pane?.id === 'string'
                            && Number.isInteger(pane?.mountCount)]
                    ],
                    errors         = checks.filter(([, passed]) => !passed).map(([message]) => message),
                    receipt        = {
                        applied       : errors.length === 0,
                        errors,
                        sourceDocument: Document.clone(sourceDocument),
                        targetDocument: Document.clone(targetDocument),
                        witness       : {
                            instanceId: pane?.id ?? null,
                            mountCount: pane?.mountCount ?? null
                        },
                        proof
                    };

                me.crossWindowGestureResolve?.(receipt);
                me.crossWindowGestureResolve = null
            });

        return me.refreshPromise
    }

    /**
     * @summary Installs a gesture-local witness around the source's remote-drop-out hook.
     * The hook itself stays authoritative and runs unchanged; this wrapper only counts how
     * often the coordinator selected that exact completion path before projection teardown.
     * @param {Neo.dashboard.dock.interaction.TabSortZone} sourceZone
     * @returns {Object}
     * @protected
     */
    installCrossWindowSourceProbe(sourceZone) {
        let me       = this,
            stats    = me.crossWindowStats,
            hadOwn   = Object.hasOwn(sourceZone, 'onRemoteDropOut'),
            original = sourceZone.onRemoteDropOut,
            probe    = function(draggedItem) {
                stats.remoteDropOutFires++;
                return original.call(sourceZone, draggedItem)
            };

        sourceZone.onRemoteDropOut = probe;

        return {hadOwn, original, probe, sourceZone}
    }

    /**
     * @summary Removes a gesture-local source witness when the source zone survived the probe.
     * A successful singleton transfer destroys that empty source zone, in which case teardown
     * has already removed the own wrapper and there is nothing to restore.
     * @param {Object|null} sourceProbe
     * @protected
     */
    restoreCrossWindowSourceProbe(sourceProbe) {
        let {hadOwn, original, probe, sourceZone} = sourceProbe || {};

        if (!sourceZone || sourceZone.onRemoteDropOut !== probe) return;

        if (hadOwn) {
            sourceZone.onRemoteDropOut = original
        } else {
            delete sourceZone.onRemoteDropOut
        }
    }

    /**
     * @summary Reads the live source SortZone's drag-session readiness contract.
     * @param {Object} context
     * @returns {Object}
     * @protected
     */
    readCrossWindowDragReadiness(context) {
        let {itemId, sourceWorkspaceId, sourceZone} = context || {},
            draggedItem                             = sourceZone?.dragComponent,
            snapshot                                = {
                coordinatorReady: !!sourceZone?.dragCoordinator,
                dragProxyReady  : !!sourceZone?.dragProxy,
                dragging        : sourceZone?.owner?.cls?.includes?.('neo-is-dragging') === true,
                itemId          : draggedItem?.dockItemId ?? null,
                workspaceId     : draggedItem?.dockSourceWorkspaceId ?? null
            };

        snapshot.ready = snapshot.coordinatorReady
            && snapshot.dragProxyReady
            && snapshot.dragging
            && snapshot.itemId === itemId
            && snapshot.workspaceId === sourceWorkspaceId;

        return snapshot
    }

    /**
     * @summary Polls source gesture state, never elapsed time, before any remote screen move.
     * @param {Object} context
     * @param {Object} [options={}]
     * @param {Number} [options.attempts=120]
     * @param {Number} [options.delay=16]
     * @returns {Promise<Object>}
     * @protected
     */
    async waitForCrossWindowDragReadiness(context, {attempts=120, delay=16}={}) {
        let me = this,
            snapshot;

        for (let attempt = 0; attempt <= attempts && !me.isDestroyed; attempt++) {
            snapshot = me.readCrossWindowDragReadiness(context);

            if (snapshot.ready || attempt === attempts) break;

            await me.timeout(delay)
        }

        return snapshot || {ready: false}
    }

    /**
     * @summary Captures the remote target while the pointer is still down. This JSON-safe
     * snapshot is the Whitebox/NL observation seam: coordinator engagement, semantic preview,
     * rendered preview, and menu selection all become inspectable before mouseup commits.
     * @param {Object} context
     * @returns {Object}
     * @protected
     */
    readCrossWindowRemoteSnapshot(context) {
        let me                                            = this,
            {sourceZone, targetNodeId, targetWorkspaceId} = context || {},
            coordinator                                   = sourceZone?.dragCoordinator,
            participation                                 = me.crossWindowParticipations.get(targetWorkspaceId),
            target                                        = participation?.target,
            host                                          = me.crossWindowHosts.get(targetWorkspaceId),
            renderer                                      = host?.down({ntype: 'dock-preview'}),
            indicators                                    = host?.down({ntype: 'dashboard-dock-drop-indicators'}),
            preview                                       = target?.currentPreview ?? null,
            rendered                                      = renderer?.dockPreview ?? null,
            candidateSet                                  = indicators?.candidateSet ?? null,
            snapshot                                      = {
                coordinator: coordinator?.toJSON?.() ?? null,
                engaged    : coordinator?.activeTargetZone === target,
                indicators : {
                    activePreviewId: indicators?.activeCandidate?.preview?.previewId ?? null,
                    candidateCount : (candidateSet?.cross?.length ?? 0)
                        + (candidateSet?.root?.chips?.length ?? 0),
                    schema         : candidateSet?.schema ?? null
                },
                preview : preview ? Document.clone(preview) : null,
                rendered: rendered ? Document.clone(rendered) : null,
                targetNodeId
            };

        snapshot.ready = snapshot.engaged
            && snapshot.preview?.target?.nodeId === targetNodeId
            && snapshot.rendered?.previewId === snapshot.preview?.previewId;

        return snapshot
    }

    /**
     * @summary Polls the target's semantic + rendered hover state before allowing mouseup.
     * @param {Object} context
     * @param {Object} [options={}]
     * @param {Number} [options.attempts=120]
     * @param {Number} [options.delay=16]
     * @returns {Promise<Object>}
     * @protected
     */
    async waitForCrossWindowRemotePreview(context, {attempts=120, delay=16}={}) {
        let me = this,
            snapshot;

        for (let attempt = 0; attempt <= attempts && !me.isDestroyed; attempt++) {
            snapshot = me.readCrossWindowRemoteSnapshot(context);

            if (snapshot.ready || attempt === attempts) break;

            await me.timeout(delay)
        }

        return snapshot || {ready: false}
    }

    /**
     * @summary Reads every terminal state the Escape journey must clear after remote hover.
     * @param {Object} context
     * @returns {Object}
     * @protected
     */
    readCrossWindowCancellationSnapshot(context) {
        let me                              = this,
            {sourceZone, targetWorkspaceId} = context || {},
            coordinator                     = sourceZone?.dragCoordinator,
            participation                   = me.crossWindowParticipations.get(targetWorkspaceId),
            host                            = me.crossWindowHosts.get(targetWorkspaceId),
            renderer                        = host?.down({ntype: 'dock-preview'}),
            indicators                      = host?.down({ntype: 'dashboard-dock-drop-indicators'}),
            snapshot                        = {
                activeTargetZone      : coordinator?.toJSON?.().activeTargetZone ?? null,
                activeCandidateId     : indicators?.activeCandidate?.preview?.previewId ?? null,
                candidateSetSchema    : indicators?.candidateSet?.schema ?? null,
                dragDataPresent       : sourceZone?.data != null,
                dragEndActive         : sourceZone?.dragEndActive === true,
                dragPlaceholderPresent: !!sourceZone?.dragPlaceholder,
                dragProxyPresent      : !!sourceZone?.dragProxy,
                draggingClass         : sourceZone?.owner?.cls?.includes?.('neo-is-dragging') === true,
                nativeCandidateCount  : coordinator?.nativeWindowDropCandidates?.size ?? 0,
                semanticPreviewId     : participation?.target?.currentPreview?.previewId ?? null,
                renderedPreviewId     : renderer?.dockPreview?.previewId ?? null
            };

        snapshot.ready = snapshot.activeTargetZone === null
            && snapshot.activeCandidateId === null
            && snapshot.candidateSetSchema === null
            && snapshot.dragDataPresent === false
            && snapshot.dragEndActive === false
            && snapshot.dragPlaceholderPresent === false
            && snapshot.dragProxyPresent === false
            && snapshot.draggingClass === false
            && snapshot.nativeCandidateCount === 0
            && snapshot.semanticPreviewId === null
            && snapshot.renderedPreviewId === null;

        return snapshot
    }

    /**
     * @summary Polls the full cancellation contract rather than treating one cleared CSS class
     * as proof that coordinator, target, proxy and render affordances all settled.
     * @param {Object} context
     * @param {Object} [options={}]
     * @param {Number} [options.attempts=120]
     * @param {Number} [options.delay=16]
     * @returns {Promise<Object>}
     * @protected
     */
    async waitForCrossWindowCancellation(context, {attempts=120, delay=16}={}) {
        let me = this,
            snapshot;

        for (let attempt = 0; attempt <= attempts && !me.isDestroyed; attempt++) {
            snapshot = me.readCrossWindowCancellationSnapshot(context);

            if (snapshot.ready || attempt === attempts) break;

            await me.timeout(delay)
        }

        return snapshot || {ready: false}
    }

    /**
     * @summary Cancels a failed probe through the real main-thread Escape route, then releases
     * the native mouse sensor so the next cold gesture starts from a clean owner state.
     * @param {Object|null} context
     * @returns {Promise<Object>}
     * @protected
     */
    async cancelCrossWindowGesture(context) {
        let me = this,
            {
                sourceButtonId,
                sourceWindowId,
                sourceX,
                sourceY,
                sourceScreenX,
                sourceScreenY,
                sourceZone
            } = context || {};

        if (!sourceButtonId || sourceWindowId == null || !sourceZone) {
            sourceZone?.dragCoordinator?.onDragCancel({sourceSortZone: sourceZone});
            return {escapeDispatched: false, releaseDispatched: false, settled: false}
        }

        let escapeDispatched = await me.interactionService.dispatch({
                id      : sourceButtonId,
                type    : 'keydown',
                windowId: sourceWindowId,
                options : {bubbles: true, cancelable: true, code: 'Escape', key: 'Escape'}
            }),
            releaseDispatched = await me.interactionService.dispatch({
                id      : sourceButtonId,
                type    : 'mouseup',
                windowId: sourceWindowId,
                options : {
                    bubbles: true, button: 0, buttons: 0, cancelable: true,
                    clientX: sourceX, clientY: sourceY, screenX: sourceScreenX, screenY: sourceScreenY
                }
            });

        for (let attempt = 0; attempt <= 60 && !me.isDestroyed; attempt++) {
            let settled = sourceZone.owner?.cls?.includes?.('neo-is-dragging') !== true
                && sourceZone.dragEndActive !== true
                && sourceZone.data == null
                && !sourceZone.dragPlaceholder
                && !sourceZone.dragProxy;

            if (settled) return {escapeDispatched, releaseDispatched, settled: true};

            attempt < 60 && await me.timeout(16)
        }

        return {escapeDispatched, releaseDispatched, settled: false}
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
     * @summary Phase-0 falsifier: drives the real first pointer gesture through InteractionService.
     * The step carries semantic ids only; this host resolves live windows, component ids, and
     * coordinates immediately before dispatch.
     * @param {Object} step
     * @param {Object} [options={}]
     * @param {Boolean} [options.cancelAtTarget=false] Whitebox-only branch: Escape after
     * remote preview settles, before mouseup. This option never enters tour-script data.
     * @param {Boolean} [options.roundTrip=false] Whitebox-only branch: after first park, leave the
     * target, require same-vessel re-show with zero re-acquisition, then release detached.
     * @param {Number} [options.parkObservationMs=0] Whitebox-only bounded observation window after
     * strict park admission; lets the headed harness inspect real focus/placement before re-show.
     * @returns {Promise<Object>}
     */
    async executeCrossWindowStep(step, {cancelAtTarget = false, parkObservationMs = 0, roundTrip = false} = {}) {
        let me                        = this,
            acquisitionAttemptsBefore = me.tearOutAcquisitionAttempts,
            sourceProbe               = null,
            {
                itemId,
                sourceWorkspaceId,
                targetWorkspaceId,
                targetNodeId
            } = step || {};

        if (itemId !== 'workbench'
            || sourceWorkspaceId !== DemoBWorkspace.MAIN_WORKSPACE_ID
            || targetWorkspaceId !== DemoBWorkspace.POPUP_WORKSPACE_ID
            || targetNodeId !== 'popup-tabs') {
            return {applied: false, errors: ['unsupported Demo-B cross-window step']}
        }

        let pane = me.paneCache[itemId];

        if (!me.getWorkspaceDocument(sourceWorkspaceId)?.items?.[itemId]
            || !pane
            || pane.isDestroyed) {
            return {applied: false, errors: ['source Workbench pane is not live and owned by the source workspace']}
        }

        try {
            // Surface cues are deliberately data-only and fire synchronously from TourRunner. A
            // perspective load can therefore enqueue a projection immediately before this step,
            // especially in spec mode where viewer pauses are skipped. Drain the host-owned queue
            // before opening the second vessel so gesture geometry never reads stale tab chrome.
            await me.awaitProjectionIdle();
            await me.openCrossWindowStage();
            await me.waitForWorkspaceGeometry(sourceWorkspaceId);
            await me.waitForWorkspaceGeometry(targetWorkspaceId);

            let stagePlacement = await me.positionCrossWindowStage();

            if (!stagePlacement.ready) {
                return {
                    applied: false,
                    errors : ['cross-window stage could not establish two non-overlapping active windows'],
                    debug  : {stagePlacement}
                }
            }

            let sourceDocument = me.getWorkspaceDocument(sourceWorkspaceId),
                sourceNodeId   = Document.findContainingTabsId(sourceDocument, itemId),
                sourceItems    = sourceDocument.nodes[sourceNodeId]?.items || [],
                sourceHost     = me.crossWindowHosts.get(sourceWorkspaceId),
                sourceTabs     = sourceHost?.down({dockNodeId: sourceNodeId}),
                itemIndex      = sourceDocument.nodes[sourceNodeId]?.items.indexOf(itemId) ?? -1,
                sourceButton   = sourceTabs?.getTabAtIndex(itemIndex),
                sourceBar      = sourceTabs?.getTabBar(),
                sourceZone     = sourceBar?.sortZone,
                projectedItems = sourceZone?.dockItemIds || [],
                [buttonRect]   = sourceButton
                    ? await sourceButton.getDomRect([sourceButton.id], sourceButton.windowId)
                    : [],
                targetGeometry = me.crossWindowGeometry.get(targetWorkspaceId),
                targetRect     = targetGeometry?.zones.find(zone => zone.nodeId === targetNodeId)?.rect,
                WindowManager  = (await import('../../../src/manager/Window.mjs')).default,
                sourceWindow   = WindowManager.get(sourceButton?.windowId),
                targetWindow   = WindowManager.get(me.crossWindowTargetWindowId);

            if (sourceItems.length !== 1 || sourceItems[0] !== itemId) {
                return {
                    applied: false,
                    errors : ['Demo-B cross-window projection currently supports only its singleton Workbench source tab']
                }
            }

            let {chromeMismatch, error: chromeError} = describeCrossWindowChromeMismatch({
                observedBarItemCount    : sourceBar?.items?.length,
                observedNodeId          : sourceTabs?.dockNodeId,
                observedProjectedItemIds: projectedItems,
                observedWorkspaceId     : sourceZone?.dockWorkspaceId,
                sourceItemIds           : sourceItems,
                sourceNodeId,
                sourceWorkspaceId
            });

            if (chromeError) {
                return {applied: false, errors: [chromeError], debug: {chromeMismatch}}
            }

            if (!sourceButton || !sourceZone || !buttonRect || !targetRect
                || !sourceWindow?.innerRect || !targetWindow?.innerRect) {
                return {applied: false, errors: ['cross-window gesture surfaces are not ready']}
            }

            if (!sourceZone.dragCoordinator) {
                return {applied: false, errors: ['source cross-window coordinator is not ready']}
            }

            let sourceX       = buttonRect.x + buttonRect.width / 2,
                sourceY       = buttonRect.y + buttonRect.height / 2,
                sourceScreenX = sourceWindow.innerRect.x + sourceX,
                sourceScreenY = sourceWindow.innerRect.y + sourceY,
                targetX       = targetRect.x + targetRect.width / 2,
                targetY       = targetRect.y + targetRect.height / 2,
                targetScreenX = targetWindow.innerRect.x + targetX,
                targetScreenY = targetWindow.innerRect.y + targetY;

            me.crossWindowStats          = {localDropFires: 0, remoteDropOutFires: 0, transferCommits: 0};
            sourceProbe                  = me.installCrossWindowSourceProbe(sourceZone);
            me.crossWindowGestureContext = {
                frames        : pane?.frames ?? 0,
                itemId,
                mountCount    : pane?.mountCount ?? 0,
                pane,
                sourceButtonId: sourceButton.id,
                sourceNodeId,
                sourceScreenX,
                sourceScreenY,
                sourceWorkspaceId,
                sourceWindowId: sourceButton.windowId,
                sourceX,
                sourceY,
                sourceZone,
                targetNodeId,
                targetWorkspaceId
            };

            let settled = new Promise(resolve => me.crossWindowGestureResolve = resolve),
                options = (clientX, clientY, screenX, screenY, buttons) => ({
                    bubbles: true, button: 0, buttons, cancelable: true,
                    clientX, clientY, screenX, screenY
                });

            // Phase 1: own the native sensor and cross the local drag threshold. The next phase
            // cannot begin until the worker-side SortZone exposes its readiness state.
            await me.interactionService.simulateEvent({events: [{
                targetId: sourceButton.id,
                type    : 'mousedown',
                windowId: sourceButton.windowId,
                options : options(sourceX, sourceY, sourceScreenX, sourceScreenY, 1)
            }, {
                delay   : 120,
                targetId: sourceButton.id,
                type    : 'mousemove',
                windowId: sourceButton.windowId,
                options : options(sourceX + 8, sourceY, sourceScreenX + 8, sourceScreenY, 1)
            }, {
                delay   : 16,
                targetId: sourceButton.id,
                type    : 'mousemove',
                windowId: sourceButton.windowId,
                options : options(sourceX + 24, sourceY, sourceScreenX + 24, sourceScreenY, 1)
            }]});

            let readiness = await me.waitForCrossWindowDragReadiness(me.crossWindowGestureContext);

            if (!readiness.ready) {
                let cancellation = await me.cancelCrossWindowGesture(me.crossWindowGestureContext);

                me.restoreCrossWindowSourceProbe(sourceProbe);
                me.crossWindowGestureResolve = null;
                me.crossWindowGestureContext = null;

                return {
                    applied: false,
                    errors : ['source drag did not reach the landed readiness contract'],
                    debug  : {cancellation, readiness}
                }
            }

            // Phase 2: move in screen space while the source document still owns the pointer.
            // Mouseup remains withheld until the target's semantic AND rendered preview agree.
            await me.interactionService.simulateEvent({events: [{
                delay   : 16,
                targetId: sourceButton.id,
                type    : 'mousemove',
                windowId: sourceButton.windowId,
                options : options(sourceX + 32, sourceY, targetScreenX, targetScreenY, 1)
            }, {
                delay   : 16,
                targetId: sourceButton.id,
                type    : 'mousemove',
                windowId: sourceButton.windowId,
                options : options(sourceX + 34, sourceY, targetScreenX + 2, targetScreenY, 1)
            }]});

            let conversionSettlement = false,
                remoteSnapshot;

            for (let attempt = 0; attempt <= 120 && !me.isDestroyed; attempt++) {
                remoteSnapshot = me.readCrossWindowRemoteSnapshot(me.crossWindowGestureContext);

                if (remoteSnapshot.ready || attempt === 120) break;

                await me.interactionService.simulateEvent({events: [{
                    delay   : 16,
                    targetId: sourceButton.id,
                    type    : 'mousemove',
                    windowId: sourceButton.windowId,
                    options : options(
                        sourceX + 36 + attempt % 2,
                        sourceY,
                        targetScreenX + 4 + attempt % 2,
                        targetScreenY,
                        1
                    )
                }]});

                let transition = sourceZone.vesselConversionSensor?.transitionPromise;

                transition && (conversionSettlement = await transition)
            }

            if (!remoteSnapshot.ready) {
                let candidateDiagnostics = [],
                    group                = sourceZone.dragCoordinator.sortZones.get(sourceZone.sortGroup);

                group?.forEach((zone, windowId) => {
                    let inner  = WindowManager.get(windowId)?.innerRect,
                        localX = inner ? targetScreenX - inner.x : null,
                        localY = inner ? targetScreenY - inner.y : null;

                    candidateDiagnostics.push({
                        accepts        : inner && typeof zone.acceptsRemoteDrag === 'function'
                            ? zone.acceptsRemoteDrag(localX, localY)
                            : null,
                        innerRect      : inner && {
                            height: inner.height,
                            width : inner.width,
                            x     : inner.x,
                            y     : inner.y
                        },
                        localX,
                        localY,
                        sameAsSource  : zone === sourceZone,
                        stableTargetId: zone.stableTargetId ?? null,
                        windowId
                    })
                });

                let conversion = {
                        converted      : sourceZone.vesselConversionSensor?.converted ?? null,
                        dragComponent  : sourceZone.dragComponent?.id ?? null,
                        dragProxy      : sourceZone.dragProxy?.id ?? null,
                        enabled        : sourceZone.enableVesselConversion,
                        logicalRect    : sourceZone.vesselConversionLogicalRect ?? null,
                        sourceRect     : sourceZone.vesselConversionSourceRect ?? null,
                        targetConverted: sourceZone.vesselConversionSensor?.targetConverted ?? null,
                        targetId       : sourceZone.vesselConversionTargetId ?? null,
                        targetRect     : sourceZone.vesselConversionTargetRect ?? null,
                        transitioning  : sourceZone.vesselConversionSensor?.transitioning ?? null,
                        windowDragging : sourceZone.isWindowDragging
                    },
                    cancellation = await me.cancelCrossWindowGesture(me.crossWindowGestureContext);

                me.restoreCrossWindowSourceProbe(sourceProbe);
                me.crossWindowGestureResolve = null;
                me.crossWindowGestureContext = null;

                return {
                    applied: false,
                    errors : ['remote target did not expose a settled semantic preview'],
                    debug  : {
                        candidateDiagnostics,
                        cancellation,
                        conversion,
                        conversionSettlement,
                        parkReceipt  : me.lastVesselParkReceipt ?? null,
                        readiness,
                        remoteSnapshot,
                        stagePlacement,
                        targetGeometry,
                        targetPointer: {screenX: targetScreenX, screenY: targetScreenY},
                        windows      : WindowManager.toJSON()
                    }
                }
            }

            me.crossWindowGestureContext.remoteSnapshot = remoteSnapshot;
            me.crossWindowGestureContext.vesselMountCount = pane.mountCount;

            if (roundTrip) {
                // Remote preview can settle before the asynchronously-acquired tear-out child has
                // connected and published its exact source rect. Keep driving the real pointer
                // cadence until strict conversion admission settles; a human gesture naturally
                // supplies these frames while crossing the target, and the whitebox screenplay
                // must not mistake preview readiness for physical park readiness.
                for (let attempt = 0; attempt <= 120 && !me.isDestroyed; attempt++) {
                    let sensor = sourceZone.vesselConversionSensor;

                    if (sensor?.converted && !sensor.transitioning && me.lastVesselParkReceipt?.parked === true) break;

                    await me.interactionService.simulateEvent({events: [{
                        delay   : 16,
                        targetId: sourceButton.id,
                        type    : 'mousemove',
                        windowId: sourceButton.windowId,
                        options : options(
                            sourceX + 38 + attempt % 2,
                            sourceY,
                            targetScreenX + 6 + attempt % 2,
                            targetScreenY,
                            1
                        )
                    }]});

                    let transition = sourceZone.vesselConversionSensor?.transitionPromise;

                    transition && (conversionSettlement = await transition)
                }

                let sensor = sourceZone.vesselConversionSensor;

                if (!sensor?.converted || sensor.transitioning || me.lastVesselParkReceipt?.parked !== true) {
                    let cancellation = await me.cancelCrossWindowGesture(me.crossWindowGestureContext);

                    me.restoreCrossWindowSourceProbe(sourceProbe);
                    me.crossWindowGestureResolve = null;
                    me.crossWindowGestureContext = null;

                    return {
                        applied: false,
                        errors : ['tear-out vessel did not reach strict park admission'],
                        debug  : {
                            cancellation,
                            conversionSettlement,
                            parkReceipt: me.lastVesselParkReceipt ?? null,
                            remoteSnapshot,
                            sensor     : {
                                converted      : sensor?.converted ?? null,
                                targetConverted: sensor?.targetConverted ?? null,
                                transitioning  : sensor?.transitioning ?? null
                            }
                        }
                    }
                }

                if (Number.isFinite(parkObservationMs) && parkObservationMs > 0) {
                    await me.timeout(Math.min(parkObservationMs, 2000))
                }

                const identity = () => {
                    let vessel = me.resolveTearOutVessel(itemId),
                        route  = vessel?.nativeRoute;

                    return {
                        nativeHandleKey: route?.nativeHandleKey ?? null,
                        windowId       : vessel?.windowId ?? null,
                        windowName     : vessel?.windowName ?? null
                    }
                };

                let firstIdentity      = identity(),
                    acquisitionsAtPark = me.tearOutAcquisitionAttempts,
                    voidX              = sourceX + 80,
                    voidY              = sourceY + 160,
                    voidScreenX        = sourceWindow.innerRect.x + voidX,
                    voidScreenY        = sourceWindow.innerRect.y + voidY,
                    outSnapshot;

                for (let attempt = 0; attempt <= 120 && !me.isDestroyed; attempt++) {
                    await me.interactionService.simulateEvent({events: [{
                        delay   : 16,
                        targetId: sourceButton.id,
                        type    : 'mousemove',
                        windowId: sourceButton.windowId,
                        options : options(
                            voidX + attempt % 2,
                            voidY,
                            voidScreenX + attempt % 2,
                            voidScreenY,
                            1
                        )
                    }]});

                    let transition = sourceZone.vesselConversionSensor?.transitionPromise;

                    transition && await transition;
                    outSnapshot = me.readCrossWindowRemoteSnapshot(me.crossWindowGestureContext);

                    if (
                        sourceZone.vesselConversionSensor?.converted === false &&
                        sourceZone.vesselConversionSensor?.transitioning === false &&
                        !outSnapshot.engaged && !me.vesselParkHandlers.parkedVessel
                    ) break
                }

                let restoredIdentity = identity(),
                    restored         = sourceZone.vesselConversionSensor?.converted === false
                        && sourceZone.vesselConversionSensor?.transitioning === false
                        && !outSnapshot?.engaged && !me.vesselParkHandlers.parkedVessel;

                if (!restored) {
                    let cancellation = await me.cancelCrossWindowGesture(me.crossWindowGestureContext);

                    me.restoreCrossWindowSourceProbe(sourceProbe);
                    me.crossWindowGestureResolve = null;
                    me.crossWindowGestureContext = null;

                    return {
                        applied: false,
                        errors : ['converted vessel did not re-show after leaving the target'],
                        debug  : {
                            acquisitionsAtPark,
                            cancellation,
                            firstIdentity,
                            outSnapshot,
                            restoredIdentity,
                            sensor: {
                                converted    : sourceZone.vesselConversionSensor?.converted ?? null,
                                transitioning: sourceZone.vesselConversionSensor?.transitioning ?? null
                            }
                        }
                    }
                }

                let acquisitionsAfterRestore = me.tearOutAcquisitionAttempts;

                await me.interactionService.simulateEvent({events: [{
                    targetId: sourceButton.id,
                    type    : 'mouseup',
                    windowId: sourceButton.windowId,
                    options : options(voidX, voidY, voidScreenX, voidScreenY, 0)
                }]});

                let detached;

                for (let attempt = 0; attempt <= 120 && !me.isDestroyed; attempt++) {
                    let sourceDocument = me.getWorkspaceDocument(sourceWorkspaceId),
                        entry          = me.tearOutPanes[itemId];

                    detached = {
                        catalogRetained: !!sourceDocument?.items?.[itemId],
                        entry          : entry ? {...entry} : null,
                        itemAbsent     : Document.findContainingTabsId(sourceDocument, itemId) === null
                    };

                    if (
                        detached.entry?.windowId === firstIdentity.windowId &&
                        detached.catalogRetained && detached.itemAbsent
                    ) break;

                    await me.timeout(16)
                }

                await me.awaitProjectionIdle();

                let terminalIdentity = identity(),
                    sourceAfter      = Document.clone(me.getWorkspaceDocument(sourceWorkspaceId)),
                    targetAfter      = Document.clone(me.getWorkspaceDocument(targetWorkspaceId)),
                    proof            = {
                        acquisitionAttempts: {
                            afterRestore            : acquisitionsAfterRestore,
                            atFirstPark             : acquisitionsAtPark,
                            beforeGesture           : acquisitionAttemptsBefore,
                            midGestureReacquisitions: acquisitionsAfterRestore - acquisitionsAtPark,
                            totalGestureAttempts    : acquisitionsAfterRestore - acquisitionAttemptsBefore
                        },
                        detached,
                        firstIdentity,
                        firstRemoteSnapshot: remoteSnapshot,
                        outSnapshot,
                        parkReceipt        : me.lastVesselParkReceipt ?? null,
                        parkSlotCleared    : !me.vesselParkHandlers.parkedVessel,
                        restoreReceipt     : me.lastVesselRestoreReceipt ?? null,
                        restored,
                        restoredIdentity,
                        sameNativeHandle   : Boolean(firstIdentity.nativeHandleKey)
                            && restoredIdentity.nativeHandleKey === firstIdentity.nativeHandleKey
                            && terminalIdentity.nativeHandleKey === firstIdentity.nativeHandleKey,
                        sameWindowId: Boolean(firstIdentity.windowId)
                            && restoredIdentity.windowId === firstIdentity.windowId
                            && terminalIdentity.windowId === firstIdentity.windowId,
                        stats: {...me.crossWindowStats},
                        terminalIdentity
                    },
                    checks = [
                        ['exactly one tear-out acquisition occurred', proof.acquisitionAttempts.totalGestureAttempts === 1],
                        ['out-conversion performed zero re-acquisitions', proof.acquisitionAttempts.midGestureReacquisitions === 0],
                        ['out-conversion re-showed the same native handle', proof.sameNativeHandle],
                        ['out-conversion retained the same window id', proof.sameWindowId],
                        ['park used a strict exact-handle move', proof.parkReceipt?.parked === true],
                        ['out-conversion used a strict exact-handle move', proof.restoreReceipt?.admitted === true],
                        ['park ownership cleared after re-show', proof.parkSlotCleared],
                        ['detached terminal retained the catalog item', detached?.catalogRetained === true],
                        ['detached terminal removed the item from the dock tree', detached?.itemAbsent === true],
                        ['detached terminal adopted the exact vessel', detached?.entry?.windowId === firstIdentity.windowId],
                        ['remote transfer did not commit', me.crossWindowStats.transferCommits === 0],
                        ['source remote-drop-out did not fire', me.crossWindowStats.remoteDropOutFires === 0],
                        ['source local drop stayed suppressed', me.crossWindowStats.localDropFires === 0]
                    ],
                    errors = checks.filter(([, passed]) => !passed).map(([message]) => message),
                    result = {
                        applied       : errors.length === 0,
                        errors,
                        proof,
                        sourceDocument: sourceAfter,
                        targetDocument: targetAfter,
                        witness       : {
                            instanceId: pane?.id ?? null,
                            mountCount: pane?.mountCount ?? null
                        }
                    };

                me.restoreCrossWindowSourceProbe(sourceProbe);
                me.crossWindowGestureResolve = null;
                me.crossWindowGestureContext = null;

                return result
            }

            if (cancelAtTarget) {
                let sourceBefore = Document.clone(me.getWorkspaceDocument(sourceWorkspaceId)),
                    targetBefore = Document.clone(me.getWorkspaceDocument(targetWorkspaceId)),
                    cancellation = await me.cancelCrossWindowGesture(me.crossWindowGestureContext),
                    cleanup      = await me.waitForCrossWindowCancellation(me.crossWindowGestureContext),
                    sourceAfter  = Document.clone(me.getWorkspaceDocument(sourceWorkspaceId)),
                    targetAfter  = Document.clone(me.getWorkspaceDocument(targetWorkspaceId)),
                    result       = {
                        applied       : false,
                        cancelled     : true,
                        errors        : ['cross-window gesture cancelled before commit'],
                        sourceDocument: sourceAfter,
                        targetDocument: targetAfter,
                        proof         : {
                            cancellation,
                            cleanup,
                            documentsUnchanged: JSON.stringify(sourceBefore) === JSON.stringify(sourceAfter)
                                && JSON.stringify(targetBefore) === JSON.stringify(targetAfter),
                            remoteSnapshot,
                            stats: {...me.crossWindowStats}
                        }
                    };

                me.restoreCrossWindowSourceProbe(sourceProbe);
                me.crossWindowGestureResolve = null;
                me.crossWindowGestureContext = null;

                return result
            }

            // Phase 3: release only after the mid-gesture receipt is captured. The coordinator
            // now has one unambiguous target and can commit through its ordinary onDragEnd path.
            await me.interactionService.simulateEvent({events: [{
                targetId: sourceButton.id,
                type    : 'mouseup',
                windowId: sourceButton.windowId,
                options : options(sourceX + 34, sourceY, targetScreenX + 2, targetScreenY, 0)
            }]});

            let timeout = me.timeout(5000).then(() => ({
                applied: false,
                errors : ['real cross-window gesture did not settle through the target commit path'],
                debug  : {
                    coordinator: sourceZone.dragCoordinator?.toJSON?.() ?? null,
                    source     : {
                        buttonRect,
                        sortGroup          : sourceZone.sortGroup,
                        windowId           : sourceZone.windowId,
                        remoteDropCommitted: sourceZone.remoteDropCommitted
                    },
                    sourceWindow: sourceWindow.innerRect,
                    stagePlacement,
                    stats       : {...me.crossWindowStats},
                    target      : {nodeId: targetNodeId, rect: targetRect},
                    targetWindow: targetWindow.innerRect
                }
            }));

            let result = await Promise.race([settled, timeout]);

            if (!result.applied) {
                await me.cancelCrossWindowGesture(me.crossWindowGestureContext)
            }

            me.restoreCrossWindowSourceProbe(sourceProbe);
            me.crossWindowGestureResolve = null;
            me.crossWindowGestureContext = null;

            return result
        } catch (error) {
            await me.cancelCrossWindowGesture(me.crossWindowGestureContext).catch(() => {});
            me.restoreCrossWindowSourceProbe(sourceProbe);
            me.crossWindowGestureResolve = null;
            me.crossWindowGestureContext = null;

            return {applied: false, errors: [error?.message || String(error)]}
        }
    }

    /**
     * Drives the REAL G1 dock tear-out gesture end-to-end for the e2e witness leg. Unlike
     * {@link #executeCrossWindowStep} (a two-window transfer over the coordinator), this is the
     * single-window boundary grammar: it arms a tab drag, flings the proxy past the window
     * boundary so {@link Neo.dashboard.dock.interaction.TabSortZone} re-fires `dockTearOutExit`, the host opens
     * a `?popout=` vessel, then — gated on that vessel's ACTUAL birth
     * ({@link #onWindowConnect} → {@link #tearOutConnects}) — survives deliberate post-birth moves
     * (the reap-regression survival probe) and either releases while detached (`dockTearOutTerminal`
     * → the host's `detachItem` commit + {@link #adoptTearOutPane}) or cancels via Escape
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
            let documentBefore = Document.clone(document),
                catalogBefore  = Object.keys(documentBefore.items);

            let startX  = buttonRect.x + buttonRect.width / 2,
                startY  = buttonRect.y + buttonRect.height / 2,
                startSX = window.innerRect.x + startX,
                startSY = window.innerRect.y + startY,
                opt     = (clientX, clientY, screenX, screenY, buttons) => ({
                    bubbles: true, button: 0, buttons, cancelable: true, clientX, clientY, screenX, screenY
                });

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

            let survivedProbe = Boolean(me.tearOutConnects[itemId]);

            if (cancel) {
                // Escape while detached (post-exit, pre-up) → processDragEnd(cancelled) →
                // dockTearOutCancel → the host closes its vessel. Assert the committed document is
                // byte-identical — the zero-mutation invariant, proven from the third party (the doc).
                let cancellation  = await me.cancelTearOutGesture(button, release),
                    documentAfter = Document.clone(me.getWorkspaceDocument(workspaceId));

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
            // + adoptTearOutPane (the vessel owns the pane now).
            await me.interactionService.simulateEvent({events: [{
                targetId: button.id, type: 'mouseup', windowId: button.windowId,
                options : opt(outX, outY, outSX, outSY, 0)
            }]});

            let committed      = await me.waitForTearOutCommit(itemId, sourceNodeId),
                documentAfter  = Document.clone(me.getWorkspaceDocument(workspaceId)),
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

        for (let attempt = 0; attempt <= attempts && !me.isDestroyed; attempt++) {
            if (armed()) return true;

            attempt < attempts && await me.timeout(delay)
        }

        return armed()
    }

    /**
     * Gates on the tear-out vessel's ACTUAL birth: the `?popout=<itemId>` window connecting through
     * {@link #onWindowConnect} records {@link #tearOutConnects}. Polls that observable rather than
     * any internal drag flag — the connect is the fact a witness can trust.
     * @param {String} itemId
     * @param {Object} [options={}]
     * @param {Number} [options.attempts=180]
     * @param {Number} [options.delay=16]
     * @returns {Promise<Boolean>}
     * @protected
     */
    async waitForTearOutVessel(itemId, {attempts = 180, delay = 16} = {}) {
        let me = this;

        for (let attempt = 0; attempt <= attempts && !me.isDestroyed; attempt++) {
            if (me.tearOutConnects[itemId] || me.tearOutPanes[itemId]) return true;

            attempt < attempts && await me.timeout(delay)
        }

        return Boolean(me.tearOutConnects[itemId] || me.tearOutPanes[itemId])
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

        for (let attempt = 0; attempt <= attempts && !me.isDestroyed; attempt++) {
            if (detached()) return true;

            attempt < attempts && await me.timeout(delay)
        }

        return detached()
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
     * A popup window joined the shared heap: if it is one of OURS (the pop-out URL carries
     * `popout=<itemId>&hostId=<this.id>`), reparent the LIVE cached pane into its main view.
     * The instance moves trees; nothing is recreated — the counter proves it.
     * @param {Object} data `{appName, windowId}`
     */
    async onWindowConnect(data) {
        let me         = this,
            {windowId} = data,
            app        = Neo.apps[windowId];

        if (!app || me.isDestroyed) return;

        let url            = await Neo.Main.getByPath({path: 'document.URL', windowId}),
            params         = new URL(url).searchParams,
            workspaceId    = params.get('workspaceId'),
            itemId         = params.get('popout'),
            flow           = params.get('vesselFlow'),
            grant          = params.get('vesselGrant'),
            admissionValue = params.get('vesselAdmission'),
            admissionToken = admissionValue === null ? NaN : Number(admissionValue),
            generation     = Number(params.get('vesselGeneration'));

        if (params.get('hostId') !== me.id) return;

        // Geometry-ready is part of child admission: do not publish the connected vessel to any
        // ownership branch until its Main realm has installed resize observation.
        await Neo.main.addon.WindowPosition?.setConfigs({observeResize: true, windowId});

        if (workspaceId === DemoBWorkspace.POPUP_WORKSPACE_ID || workspaceId === DemoBWorkspace.POPUP2_WORKSPACE_ID) {
            if (flow !== 'workspace-target') return;

            if (!me.consumeVesselOwnerGrant({
                data,
                flow,
                generation,
                grant,
                itemId: workspaceId,
                windowId
            })) return;

            await me.mountCrossWindowTarget(app, windowId, workspaceId);
            return
        }

        if (!itemId) return;
        if (flow !== 'click-popout' && flow !== 'tear-out') return;

        if (flow === 'tear-out' && !Number.isFinite(admissionToken)) return;

        // Retirement authority is established before any awaited close. A connect continuation
        // that resumes after that boundary is cleanup-only. Consume its exact grant and retain the
        // route for a refused-close retry, but never stage or publish content into the closing realm.
        if (flow === 'tear-out' && me.tearOutRetirements.has(itemId)) {
            if (me.consumeVesselOwnerGrant({data, flow, generation, grant, itemId, windowId})) {
                const admission = {
                    admissionToken, generation, invalidated: true, windowId
                };

                Object.defineProperty(admission, 'nativeRoute', {value: data.windowData.nativeRoute});
                me.tearOutConnectAdmissions.set(itemId, admission)
            }
            return
        }

        if (!me.consumeVesselOwnerGrant({data, flow, generation, grant, itemId, windowId})) return;

        // Click-popout creates its entry before windowOpen; tear-out deliberately does not.
        // Keeping those births separate is load-bearing: an ungranted connect stays inert rather
        // than becoming stray tearOutConnects state or stealing an existing detachedPanes entry.
        // A granted tear-out DOES embody immediately: the same live pane moves into the vessel while
        // a hidden exact-slot placeholder keeps source tab/card indices coherent. Model truth remains
        // untouched until the terminal.
        if (flow === 'tear-out') {
            const
                admission  = {admissionToken, generation, invalidated: false, windowId},
                connection = {windowId};

            Object.defineProperties(connection, {
                admissionToken: {value: admissionToken},
                generation    : {value: generation},
                nativeRoute   : {value: data.windowData.nativeRoute}
            });
            Object.defineProperty(admission, 'nativeRoute', {value: data.windowData.nativeRoute});
            me.tearOutConnectAdmissions.set(itemId, admission);

            const staged = await me.tearOutEmbodiment.stage({itemId, windowId});

            // A re-entry/cancel may retire the semantic vessel while the cross-window render
            // transaction is still painting. The exact admission token is durable across a close
            // acknowledgement clearing the transient retirement fence, so a dead generation can
            // never resume here and publish itself after its disconnect already fired.
            if (
                me.tearOutConnectAdmissions.get(itemId) !== admission || admission.invalidated ||
                me.tearOutRetirements.has(itemId)
            ) {
                staged && me.tearOutEmbodiment.restore({itemId, windowId});
                return
            }

            me.tearOutConnectAdmissions.delete(itemId);

            if (me.tearOutPanes[itemId]) {
                Object.assign(me.tearOutPanes[itemId], connection);
                Object.defineProperties(me.tearOutPanes[itemId], {
                    admissionToken: {configurable: true, value: admissionToken, writable: true},
                    generation    : {configurable: true, value: generation, writable: true},
                    nativeRoute   : {configurable: true, value: data.windowData.nativeRoute, writable: true}
                });

                if (staged) {
                    me.tearOutEmbodiment.promote({itemId, windowId})
                } else {
                    me.reparentTearOutPane(itemId, connection)
                }
            } else {
                me.tearOutConnects[itemId] = connection;
            }
            return
        }

        let entry = me.detachedPanes[itemId],
            pane  = me.paneCache[itemId];

        if (flow === 'click-popout' && entry && pane && me.popupDocument?.items?.[itemId]) {
            entry.windowId = windowId;
            app.mainView.add(pane)
        }
    }

    /**
     * @summary Mints one product-semantic vessel grant and supersedes the prior generation for
     * the same flow/item. The token is a bearer hint only; {@link #consumeVesselOwnerGrant}
     * additionally requires the opener-minted native route for the exact connected child.
     * @param {String} flow `workspace-target`, `click-popout`, or `tear-out`.
     * @param {String} itemId
     * @returns {{generation: Number, token: String}}
     * @protected
     */
    createVesselOwnerGrant(flow, itemId) {
        let grant = {
            generation: ++this.vesselOwnerGrantGeneration,
            token     : crypto.randomUUID()
        };

        this.vesselOwnerGrants.set(`${flow}:${itemId}`, grant);

        return grant
    }

    /**
     * @summary Consumes one exact product grant after validating the generic native route.
     * Consumption precedes every reparent, making replay and same-name reuse inert.
     * @param {Object} data
     * @param {Object} data.windowData
     * @param {String} flow
     * @param {Number} generation
     * @param {String} grant
     * @param {String} itemId
     * @param {String} windowId
     * @returns {Boolean}
     * @protected
     */
    consumeVesselOwnerGrant({data, flow, generation, grant, itemId, windowId}) {
        let me     = this,
            key    = `${flow}:${itemId}`,
            stored = me.vesselOwnerGrants.get(key),
            route  = data.windowData?.nativeRoute;

        if (
            !stored || !grant || stored.token !== grant || stored.generation !== generation ||
            !route?.nativeHandleKey || route.ownerWindowId !== me.windowId || route.targetWindowId !== windowId
        ) {
            return false
        }

        me.vesselOwnerGrants.delete(key);

        return true
    }

    /**
     * @summary Revokes the current semantic grant for one flow/item admission.
     * @param {String} flow
     * @param {String} itemId
     * @protected
     */
    revokeVesselOwnerGrant(flow, itemId) {
        this.vesselOwnerGrants.delete(`${flow}:${itemId}`)
    }

    /**
     * A popup closed: whatever pane it hosted comes HOME — the reattach commit brings the
     * item back into the document; the re-projection re-adopts the parked instance.
     * @param {Object} data `{appName, windowId}`
     */
    onWindowDisconnect(data) {
        let me = this;

        if (me.isDestroyed) return;

        let disconnectedWorkspaceId = data.windowId === me.crossWindowTargetWindowId
                ? DemoBWorkspace.POPUP_WORKSPACE_ID
                : data.windowId === me.crossWindowTarget2WindowId
                    ? DemoBWorkspace.POPUP2_WORKSPACE_ID
                    : null;

        if (disconnectedWorkspaceId) {
            let isPopup2       = disconnectedWorkspaceId === DemoBWorkspace.POPUP2_WORKSPACE_ID,
                workspaceId    = disconnectedWorkspaceId,
                detachedItemId = Object.entries(me.detachedPanes)
                    .find(([, entry]) => entry.windowId === data.windowId)?.[0];

            me.crossWindowStageGeneration++;
            me.crossWindowGestureContext?.sourceZone?.dragCoordinator?.onDragCancel({
                sourceSortZone: me.crossWindowGestureContext.sourceZone
            });
            me.crossWindowGestureResolve?.({
                applied: false,
                errors : ['cross-window target disconnected before the gesture settled']
            });

            if (isPopup2) {
                me.crossWindowStage2Reject?.(new Error('cross-window target disconnected before readiness settled'))
            } else {
                me.crossWindowStageReject?.(new Error('cross-window target disconnected before readiness settled'))
            }

            me.crossWindowParticipations.get(workspaceId)?.destroy();
            me.crossWindowParticipations.delete(workspaceId);
            me.crossWindowGeometry.delete(workspaceId);

            // The main participation serves every staged popup pair: it retires only when the
            // LAST popup target is gone, never while a sibling stage remains live.
            let siblingTargetId = isPopup2 ? me.crossWindowTargetWindowId : me.crossWindowTarget2WindowId;

            if (!siblingTargetId) {
                me.crossWindowParticipations.get(DemoBWorkspace.MAIN_WORKSPACE_ID)?.destroy();
                me.crossWindowParticipations.delete(DemoBWorkspace.MAIN_WORKSPACE_ID);
                me.crossWindowGeometry.delete(DemoBWorkspace.MAIN_WORKSPACE_ID)
            }

            me.crossWindowHosts.delete(workspaceId);

            if (isPopup2) {
                me.crossWindowTarget2WindowId = null;
                me.crossWindowStage2Promise   = null;
                me.crossWindowStage2Resolve   = null;
                me.crossWindowStage2Reject    = null;
                me.kbdLivePopup2              = null
            } else {
                me.crossWindowTargetWindowId = null;
                me.crossWindowStagePromise   = null;
                me.crossWindowStageResolve   = null;
                me.crossWindowStageReject    = null;
                me.kbdLivePopup              = null
            }

            me.crossWindowGestureResolve = null;
            me.crossWindowGestureContext = null;

            // A post-commit manual close is a terminal vessel event, not ownership loss.
            // A pre-commit close has no detached entry and remains a cancelled gesture.
            detachedItemId && me.reattachPane(detachedItemId, {windowAlreadyClosed: true});
            return
        }

        // A child can disconnect while its live-pane stage is still awaiting renderer settlement.
        // The connect is not in tearOutConnects yet, so this private generation token is the only
        // exact owner. Retire it now; the stage continuation observes the deleted token and cannot
        // republish the dead window.
        for (const [itemId, admission] of me.tearOutConnectAdmissions) {
            if (admission.windowId === data.windowId) {
                const
                    committed  = Boolean(me.tearOutPanes[itemId]),
                    windowName = `tearout-${itemId}`;

                me.tearOutConnectAdmissions.delete(itemId);
                me.tearOutRetirements.add(itemId);

                if (me.tearOutEmbodiment.isStaged(itemId)) {
                    me.tearOutEmbodiment.restore({itemId, windowId: data.windowId})
                }

                me.tearOutHandlers.onVesselRetired({
                    admissionToken: admission.admissionToken,
                    generation    : admission.generation,
                    itemId,
                    windowName
                });
                me.vesselParkHandlers.onVesselRetired({itemId, retirement: true});
                me.revokeVesselOwnerGrant('tear-out', itemId);
                me.tearOutRetirements.delete(itemId);
                delete me.tearOutPanes[itemId];
                committed && me.reintegrateTearOutItem(itemId);
                return
            }
        }

        for (const [itemId, entry] of Object.entries(me.detachedPanes)) {
            if (entry.windowId === data.windowId) {
                me.reattachPane(itemId, {windowAlreadyClosed: true});
                break
            }
        }

        // A pre-terminal tear-out may disconnect after an exact close returned false (the native
        // event can outrun its Boolean acknowledgement) or after the user closes the retained
        // recovery window manually. Physical death is now authoritative: clear BOTH state owners
        // so a successor gesture cannot inherit or be blocked by the retired generation.
        for (const [itemId, entry] of Object.entries(me.tearOutConnects)) {
            if (entry.windowId === data.windowId) {
                const windowName = `tearout-${itemId}`;

                me.tearOutRetirements.add(itemId);

                if (me.tearOutEmbodiment.isStaged(itemId)) {
                    const sourceOwns = Boolean(Document.findContainingTabsId(me.dockModel, itemId));

                    me.tearOutEmbodiment[sourceOwns ? 'restore' : 'promote']({itemId, windowId: entry.windowId})
                }

                delete me.tearOutConnects[itemId];
                me.tearOutHandlers.onVesselRetired({
                    admissionToken: entry.admissionToken,
                    generation    : entry.generation,
                    itemId,
                    windowName
                });
                me.vesselParkHandlers.onVesselRetired({itemId, retirement: true});
                me.revokeVesselOwnerGrant('tear-out', itemId);
                me.tearOutRetirements.delete(itemId);
                return
            }
        }

        // Tear-out vessel death: the item comes HOME. Model commit precedes every render
        // effect, the reintegration is exact-once and idempotent against an already-re-treed
        // item, and the bookkeeping retires with the vessel. A pre-terminal disconnect has no
        // entry in either map and needs nothing.
        for (const [itemId, entry] of Object.entries(me.tearOutPanes)) {
            if (entry.windowId === data.windowId) {
                const windowName = entry.windowName ?? `tearout-${itemId}`;

                delete me.tearOutPanes[itemId];
                delete me.tearOutConnects[itemId];
                me.tearOutRetirements.delete(itemId);
                me.tearOutHandlers.onVesselRetired({
                    admissionToken: entry.admissionToken,
                    generation    : entry.generation,
                    itemId,
                    windowName
                });
                me.vesselParkHandlers.onVesselRetired({itemId, retirement: true});
                me.reintegrateTearOutItem(itemId);
                break
            }
        }
    }

    /**
     * @summary Commits a detached terminal without sacrificing the live pane to projection order.
     * @description A connect-first vessel already carries the pane and leaves an exact-slot source
     * placeholder for ordinary projection cleanup. A terminal-first vessel has no placeholder, so
     * the source reconciler must preserve the pane until the granted child arrives. This decision is
     * captured before publishing the committed document; the deferred projection can never race it.
     * @param {Object} document
     * @param {Object} operation
     * @param {Object} vessel Exact admitted vessel identity, including its private generation.
     * @protected
     */
    onTearOutDocumentChange(document, operation, vessel) {
        let me       = this,
            detached = operation?.operation === 'detachItem',
            itemId   = operation?.itemId;

        if (!detached) {
            me.onWorkspaceDocumentChange(DemoBWorkspace.MAIN_WORKSPACE_ID, document);
            return
        }

        me.onWorkspaceDocumentChange(DemoBWorkspace.MAIN_WORKSPACE_ID, document, {
            preserveItemIds: me.tearOutEmbodiment.isStaged(itemId) ? [] : [itemId]
        });
        me.adoptTearOutPane(itemId, vessel?.generation, vessel?.admissionToken)
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
            captured = isDetach ? Document.captureItemPlacement(me.dockModel, descriptor.itemId) : null,
            result;

        captured && (me.tearOutPlacements[descriptor.itemId] = captured);

        result = me.applyWorkspaceOperation(DemoBWorkspace.MAIN_WORKSPACE_ID, descriptor);

        isDetach && result?.errors?.length && delete me.tearOutPlacements[descriptor.itemId];

        return result
    }

    /**
     * @summary Brings a torn-out item HOME on vessel death — the exact-position return of the
     * vessel close policy (docking design record §2.8; the disposition this host's
     * pre-vessel-lifecycle comment deferred).
     *
     * The stored `{tabsNodeId, index}` pair (captured at the detach terminal) is the placement
     * truth; recovery is SEMANTIC, never geometric: a stored home node that left the tree falls
     * back to the first surviving tabs node (append), mirroring the click path's
     * `reattachPane` fallback. Exact-once and idempotent: an item some other flow already
     * re-treed is left where it is, and the placement record is consumed regardless — a second
     * vessel death for the same item finds nothing to do. An item whose document no longer
     * catalogs it, or a document with no surviving tabs node, stays catalog-only/absent — the
     * honest terminal, with zero mutation.
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

        if (!doc.items?.[itemId] || !fallback || Document.findContainingTabsId(doc, itemId)) {
            return
        }

        result = me.applyWorkspaceOperation(DemoBWorkspace.MAIN_WORKSPACE_ID, {
            operation : 'addTab',
            itemId,
            tabsNodeId: fallback,
            ...(storedHome ? {index: placement.index} : {})
        });

        result?.errors?.length === 0 && me.onWorkspaceDocumentChange(DemoBWorkspace.MAIN_WORKSPACE_ID, result.document)
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
            home = Document.findContainingTabsId(me.dockModel, itemId);

        if (!pane || !home || me.detachedPanes[itemId]) {
            return {detached: false, errors: [`"${itemId}" is not a docked, cached, attached pane`]}
        }

        // A prior round-trip normalizes the now-empty popup tree. Re-seed its valid landing
        // tabs before the next transfer; no item state exists there to preserve at that point.
        let sourceBefore = me.dockModel,
            popupBefore  = me.popupDocument,
            popup        = Object.keys(me.popupDocument.items || {}).length
                ? me.popupDocument
                : DemoBWorkspace.createPopupDocument(),
            result       = Operations.transferItem(sourceBefore, popup, {
                itemId,
                sourceWorkspaceId: 'main',
                targetWorkspaceId: 'popup',
                target           : {operation: 'addTab', tabsNodeId: 'popup-tabs'}
            });

        if (result.errors.length) {
            return {detached: false, errors: result.errors}
        }

        let ownerGrant = me.createVesselOwnerGrant('click-popout', itemId);

        me.detachedPanes[itemId] = {tabsNodeId: home, windowId: null};

        // park BEFORE the re-projection tears the old tree down
        pane.parent?.remove(pane, false);

        me.popupDocument = result.targetDocument;
        me.onDockZoneDocumentChange(result.sourceDocument);

        try {
            let winData = await Neo.Main.getWindowData({windowId: me.windowId});

            let opened = await Neo.Main.windowOpen({
                url           : `./index.html?popout=${itemId}&hostId=${me.id}`
                    + `&vesselFlow=click-popout&vesselGrant=${ownerGrant.token}`
                    + `&vesselGeneration=${ownerGrant.generation}`,
                windowFeatures: `height=420,width=560,left=${winData.screenLeft + 120},top=${winData.screenTop + 120}`,
                windowId      : me.windowId,
                windowName    : `demo-b-${itemId}`
            });

            if (opened === false) {
                throw new Error('popup blocked')
            }
        } catch (error) {
            // The vessel failed after the pure transfer result was staged. Restore BOTH pristine
            // inputs: the source's old home may have normalized away after losing its sole item,
            // so replaying another placement is weaker than the transfer's commit-or-neither truth.
            delete me.detachedPanes[itemId];
            me.revokeVesselOwnerGrant('click-popout', itemId);
            me.popupDocument = popupBefore;
            me.onDockZoneDocumentChange(sourceBefore);

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
     * Converts a viewport-space rect into a dock host's local overlay coordinates.
     * @param {Object} rect
     * @param {Object} hostRect
     * @returns {Object}
     * @protected
     */
    localDockRect(rect, hostRect) {
        return {x: rect.x - hostRect.x, y: rect.y - hostRect.y, width: rect.width, height: rect.height}
    }

    /**
     * Clears transient preview state for one workspace.
     * @param {String} workspaceId
     * @protected
     */
    clearWorkspaceAffordances(workspaceId) {
        let host = this.crossWindowHosts.get(workspaceId);

        host?.down({ntype: 'dashboard-dock-drop-indicators'})?.clear();

        let preview = host?.down({ntype: 'dock-preview'});

        preview && (preview.dockPreview = null)
    }

    /**
     * Synchronous remote-target hit test over pre-measured window-local tabs geometry.
     * @param {String} workspaceId
     * @param {Number} localX
     * @param {Number} localY
     * @returns {Boolean}
     * @protected
     */
    hitTestWorkspace(workspaceId, localX, localY) {
        return !!this.dockPreviewProducer.hitTestZone(
            this.crossWindowGeometry.get(workspaceId)?.zones,
            {x: localX, y: localY}
        )
    }

    /**
     * Computes and renders one preview through the same producer/indicator/converter pipeline
     * used by an in-window drag. This method stays synchronous for coordinator callbacks.
     * @param {String} workspaceId
     * @param {Object} data
     * @returns {Object|null}
     * @protected
     */
    renderWorkspacePreview(workspaceId, data) {
        let me                = this,
            host              = me.crossWindowHosts.get(workspaceId),
            geometry          = me.crossWindowGeometry.get(workspaceId),
            draggedItem       = data.draggedItem,
            groupNodeId       = draggedItem?.dockGroupNodeId ?? null,
            itemId            = data.itemId ?? draggedItem?.dockItemId,
            sourceWorkspaceId = draggedItem?.dockSourceWorkspaceId ?? workspaceId,
            sourceNodeId      = data.sourceNodeId
                ?? Document.findContainingTabsId(me.getWorkspaceDocument(sourceWorkspaceId), itemId),
            pointer    = {x: data.localX ?? data.clientX, y: data.localY ?? data.clientY};

        if (!host || !geometry || !itemId || !Neo.isNumber(pointer.x) || !Neo.isNumber(pointer.y)) {
            return null
        }

        let producer   = me.dockPreviewProducer,
            indicators = host.down({ntype: 'dashboard-dock-drop-indicators'}),
            renderer   = host.down({ntype: 'dock-preview'}),
            zone       = producer.hitTestZone(geometry.zones, pointer);

        if (indicators && (zone?.nodeId ?? null) !== (indicators.candidateSet?.zone?.nodeId ?? null)) {
            indicators.candidateSet = zone
                ? producer.produceCandidates({
                    pointer, zones: geometry.zones, groupNodeId, itemId, sourceNodeId, root: geometry.root
                })
                : null
        }

        let candidate = indicators?.updatePointer(pointer) ?? null,
            preview   = candidate?.preview
                ?? producer.produce({pointer, zones: geometry.zones, groupNodeId, itemId, sourceNodeId});

        if (renderer) {
            renderer.dockPreview = preview;

            if (preview) {
                let targetRect = preview.target.nodeId === geometry.root.nodeId
                    ? geometry.root.rect
                    : geometry.zones.find(entry => entry.nodeId === preview.target.nodeId)?.rect;

                targetRect && renderer.applyTargetGeometry(me.localDockRect(targetRect, geometry.hostRect))
            }
        }

        return preview
    }

    /**
     * Local drag-move adapter for either active workspace.
     * @param {String} workspaceId
     * @param {Object} data
     * @protected
     */
    async onDockCrossZoneDragMove(workspaceId, data) {
        this.crossWindowGeometry.has(workspaceId) || await this.measureWorkspaceGeometry(workspaceId);
        this.renderWorkspacePreview(workspaceId, data)
    }

    /**
     * Local release path. A committed remote drop must suppress this callback entirely; the
     * counter is the product witness for that one-shot source decision.
     * @param {String} workspaceId
     * @param {Object} data
     * @returns {Object|null}
     * @protected
     */
    onDockCrossZoneDrop(workspaceId, data) {
        let me         = this,
            preview    = me.renderWorkspacePreview(workspaceId, data),
            descriptor = previewToOperation(preview),
            result     = null;

        me.crossWindowStats.localDropFires++;
        me.clearWorkspaceAffordances(workspaceId);

        if (descriptor) {
            result = me.applyWorkspaceOperation(workspaceId, descriptor);

            if (result && !result.errors?.length && result.document) {
                me.onWorkspaceDocumentChange(workspaceId, result.document)
            }
        }

        return result
    }

    /**
     * Cancels every window-local affordance and resolves the cancellation readiness signal.
     * @param {String} workspaceId
     * @param {Object} data
     * @protected
     */
    onDockCrossZoneDragCancel(workspaceId, data) {
        this.crossWindowHosts.forEach((host, id) => this.clearWorkspaceAffordances(id));
        this.crossWindowGestureResolve?.({
            applied: false,
            errors : ['cross-window gesture cancelled before commit'],
            itemId : data?.itemId,
            workspaceId
        });
        this.crossWindowGestureResolve = null
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
            onDockStackDragTerminal  : ({itemId, outcome}) =>
                me.vesselParkHandlers?.onGestureTerminal({itemId, outcome}),
            onDockVesselConversionIn : data => me.vesselParkHandlers.onConversionIn({
                itemId    : data.itemId,
                sourceRect: data.record?.sourceRect ?? null,
                windowName: me.resolveTearOutVessel(data.itemId)?.windowName
            }),
            onDockVesselConversionOut: data => me.vesselParkHandlers.onConversionOut({
                rect: data.logicalRect ?? data.record?.sourceRect ?? null
            }),
            onDockVesselConversionTerminal: data => me.vesselParkHandlers.onGestureTerminal(data),
            onDockVesselConversionRetired : data => me.vesselParkHandlers.onVesselRetired(data),
            onDockZoneDocumentChange      : nextDocument => me.onWorkspaceDocumentChange(workspaceId, nextDocument),
            resolveComponentRef           : resolveComponentRef
                || ((componentRef, item, itemId) => me.resolvePane(itemId, item)),
            resolveVesselConversionSourceRect: data => me.resolveVesselConversionSourceRect(data),
            resolveRevealComponentRef        : (componentRef, item, itemId) => me.resolvePane(itemId, item),
            workspaceId,
            ...(tearOut ? me.tearOutHandlers : null),
            onDockTearOutExit: tearOut ? data => me.onDockTearOutExit(data) : undefined
        })
    }

    /**
     * @summary Retries any exact retained retirement before admitting a successor tear-out.
     *
     * A strict close refusal preserves both pure-machine slots. The next boundary exit first retries
     * that same exact generation; only success clears the park owner and permits a fresh popup. A
     * second refusal restores the in-window embodiment and fails closed instead of wedging it in a
     * detached state with no vessel.
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
     * @summary Resolves one tear-out item's exact live vessel rect for conversion sampling.
     *
     * Gesture admission owns `tearOutConnects`; terminal adoption owns `tearOutPanes`. Both race
     * orders retain the same runtime window identity, and only that identity may select the
     * manager-owned live rect. The logical drag proxy is intentionally ignored.
     * @param {Object} data
     * @param {String|null} data.itemId
     * @returns {Object|null}
     * @protected
     */
    resolveVesselConversionSourceRect({itemId}) {
        let me       = this,
            windowId = me.resolveTearOutVessel(itemId)?.windowId,
            rect     = windowId && Neo.manager?.Window?.get(windowId)?.innerRect;

        return rect && {height: rect.height, width: rect.width, x: rect.x, y: rect.y}
    }

    /**
     * @summary Resolves the one connected tear-out generation that may receive physical effects.
     * @param {String} itemId
     * @returns {Object|null}
     * @protected
     */
    resolveTearOutVessel(itemId) {
        let entry = this.tearOutConnects[itemId] ?? this.tearOutPanes[itemId];

        if (!entry?.windowId) return null;

        const resolved = {
            ...entry,
            nativeRoute: entry.nativeRoute ?? Neo.manager?.Window?.get(entry.windowId)?.nativeRoute ?? null,
            windowName : entry.windowName ?? `tearout-${itemId}`
        };

        Object.defineProperties(resolved, {
            admissionToken: {value: entry.admissionToken},
            generation    : {value: entry.generation}
        });

        return resolved
    }

    /**
     * @summary Focuses the already-admitted target, then pauses pointer-follow and parks the exact
     * connected tear-out generation behind it.
     *
     * Focus is admitted BEFORE the physical move, then reasserted AFTER it. A content-bearing moved
     * window can regain document focus on some window managers; the second focus is therefore the
     * cover-order receipt, not ceremony. Initial refusal leaves the source untouched. Move refusal
     * lets DragDrop re-enable pointer-follow, while post-move focus refusal resumes the exact source
     * rect before reporting a refused park. If that compensation is itself refused, admitted parked
     * ownership is retained so the lifecycle machine still owns the only recovery route.
     * @param {Object} vessel
     * @param {String} vessel.itemId
     * @param {String} vessel.windowName
     * @returns {Promise<Boolean>}
     * @protected
     */
    async parkTearOutVessel({itemId, windowName}) {
        let me           = this,
            entry        = me.resolveTearOutVessel(itemId),
            route        = entry?.nativeRoute,
            sourceWindow = Neo.manager?.Window?.get(entry?.windowId),
            targetWindow = Neo.manager?.Window?.get(me.crossWindowTargetWindowId),
            targetRoute  = targetWindow?.nativeRoute,
            // The conversion metric and the exact native move both speak published inner-window
            // geometry. A child can legitimately omit outerRect, so making the optional frame
            // estimate an admission prerequisite would reject a fully-authorized live vessel.
            sourceRect   = sourceWindow?.innerRect,
            targetRect   = targetWindow?.innerRect;

        me.lastVesselParkReceipt = {
            authority: {
                entryNameMatches     : entry?.windowName === windowName,
                sourceHasHandle      : Boolean(route?.nativeHandleKey),
                sourceOwnerMatches   : route?.ownerWindowId === me.windowId,
                sourcePositionCapable: route?.capabilities?.position === true,
                sourceTargetMatches  : route?.targetWindowId === entry?.windowId,
                targetFocusCapable   : targetRoute?.capabilities?.focus === true,
                targetHasHandle      : Boolean(targetRoute?.nativeHandleKey),
                targetOwnerMatches   : targetRoute?.ownerWindowId === me.windowId,
                targetTargetMatches  : targetRoute?.targetWindowId === me.crossWindowTargetWindowId
            },
            source: sourceRect && {
                height: sourceRect.height, width: sourceRect.width, x: sourceRect.x, y: sourceRect.y
            },
            target: targetRect && {
                height: targetRect.height, width: targetRect.width, x: targetRect.x, y: targetRect.y
            }
        };
        me.lastVesselRestoreReceipt = null;

        if (
            !route?.nativeHandleKey || route.ownerWindowId !== me.windowId ||
            route.targetWindowId !== entry.windowId || route.capabilities?.position !== true ||
            !targetRoute?.nativeHandleKey || targetRoute.ownerWindowId !== me.windowId ||
            targetRoute.targetWindowId !== me.crossWindowTargetWindowId ||
            targetRoute.capabilities?.focus !== true ||
            entry.windowName !== windowName || !sourceRect || !targetRect || !targetWindow.innerRect ||
            sourceRect.width > targetRect.width || sourceRect.height > targetRect.height
        ) {
            me.lastVesselParkReceipt.reason = 'native route or cover geometry refused';
            return false
        }

        try {
            let focused = await Neo.Main.windowNativeFocus({
                    nativeHandleKey: targetRoute.nativeHandleKey,
                    targetWindowId : targetRoute.targetWindowId,
                    windowId       : me.windowId
                }) === true;

            me.lastVesselParkReceipt.focused = focused;

            if (!focused) return false;

            me.lastVesselParkReceipt.requested = {
                x: targetWindow.innerRect.x,
                y: targetWindow.innerRect.y
            };

            let moved = await Neo.main.addon.DragDrop.parkWindowDrag({
                nativeHandleKey: route.nativeHandleKey,
                targetWindowId : route.targetWindowId,
                windowId       : me.windowId,
                windowName,
                x              : targetWindow.innerRect.x,
                y              : targetWindow.innerRect.y
            }) === true;

            me.lastVesselParkReceipt.moved = moved;

            if (!moved) return false;

            let refocused = await Neo.Main.windowNativeFocus({
                nativeHandleKey: targetRoute.nativeHandleKey,
                targetWindowId : targetRoute.targetWindowId,
                windowId       : me.windowId
            }) === true;

            me.lastVesselParkReceipt.refocused = refocused;

            if (!refocused) {
                let compensated = await Neo.main.addon.DragDrop.resumeWindowDrag({
                    nativeHandleKey: route.nativeHandleKey,
                    targetWindowId : route.targetWindowId,
                    windowId       : me.windowId,
                    windowName,
                    x              : sourceRect.x,
                    y              : sourceRect.y
                }) === true;

                me.lastVesselParkReceipt.compensated = compensated;
                me.lastVesselParkReceipt.parked      = !compensated;

                return !compensated
            }

            me.lastVesselParkReceipt.parked = true;

            return true
        } catch {
            me.lastVesselParkReceipt.reason = 'platform effect threw';
            return false
        }
    }

    /**
     * @summary Re-shows the same exact native generation at the logical pointer-owned origin.
     *
     * During a live gesture the DragDrop addon also resumes physical pointer-follow. At a native
     * drag terminal that addon has already reset its session, so a strict refusal falls through
     * to the same exact Main route for the final restore; semantic-name routing is never used.
     * @param {Object} vessel
     * @param {String} vessel.itemId
     * @param {Object} vessel.rect
     * @param {Boolean} [vessel.terminal=false]
     * @param {String} vessel.windowName
     * @returns {Promise<Boolean>}
     * @protected
     */
    async reshowTearOutVessel({itemId, rect, terminal=false, windowName}) {
        let me    = this,
            entry = me.resolveTearOutVessel(itemId),
            route = entry?.nativeRoute,
            data;

        if (
            !route?.nativeHandleKey || route.ownerWindowId !== me.windowId ||
            route.targetWindowId !== entry.windowId || route.capabilities?.position !== true ||
            entry.windowName !== windowName ||
            !Number.isFinite(rect?.x) || !Number.isFinite(rect?.y)
        ) return false;

        data = {
            nativeHandleKey: route.nativeHandleKey,
            targetWindowId : route.targetWindowId,
            windowId       : me.windowId,
            windowName,
            x              : rect.x,
            y              : rect.y
        };
        me.lastVesselRestoreReceipt = {
            admitted : false,
            requested: {x: rect.x, y: rect.y},
            terminal,
            windowId : route.targetWindowId
        };

        try {
            const admitted = terminal
                ? await Neo.Main.windowNativeMoveTo(data) === true
                : await Neo.main.addon.DragDrop.resumeWindowDrag(data) === true

            me.lastVesselRestoreReceipt.admitted = admitted;

            return admitted
        } catch {
            return false
        }
    }

    /**
     * @summary Consumes the tear-out machine's active slot, then closes its exact parked vessel.
     * @param {Object} vessel
     * @param {String} vessel.itemId
     * @param {String} vessel.windowName
     * @returns {Promise<Boolean>}
     * @protected
     */
    async disposeParkedTearOutVessel({itemId, windowName}) {
        return this.tearOutHandlers.retireActiveVessel({itemId, windowName})
    }

    /**
     * The tear-out admission seam: opens the vessel window for a mid-gesture boundary exit.
     * Reuses the `?popout=` pure-pane-host viewport mode. The granted child immediately carries
     * the same live pane through {@link Neo.dashboard.dock.window.VesselEmbodiment}; it still owns no
     * workspace document, and NOTHING is written to {@link #detachedPanes}, so click-pop-out model
     * machinery remains structurally absent. Fail-closed per the admission contract: `windowOpen`
     * returns a BOOLEAN (a blocked popup never throws), and any falsy/throwing acquisition returns
     * `null` so the gesture degrades to its in-window fallback.
     * @param {Object} request
     * @param {String} request.itemId
     * @param {Object} request.proxyRect
     * @returns {Promise<{popupHeight: Number, popupWidth: Number, windowName: String}|null>}
     * @protected
     */
    async openTearOutVessel({admissionToken, itemId, proxyRect}) {
        let me         = this,
            {windowId} = me,
            windowName = `tearout-${itemId}`,
            ownerGrant = me.createVesselOwnerGrant('tear-out', itemId);

        admissionToken = Number.isFinite(admissionToken) ? admissionToken : ownerGrant.generation;
        ownerGrant.admissionToken = admissionToken;

        if (me.tearOutRetirements.has(itemId)) {
            me.revokeVesselOwnerGrant('tear-out', itemId);
            return null
        }

        try {
            let winData = await Neo.Main.getWindowData({windowId}),
                width   = Math.max(Math.round(proxyRect?.width  || 480), 320),
                height  = Math.max(Math.round(proxyRect?.height || 360), 240),
                left    = Math.round((proxyRect?.x ?? 120) + winData.screenLeft),
                top     = Math.round((proxyRect?.y ?? 120) + (winData.outerHeight - winData.innerHeight) + winData.screenTop);

            me.tearOutAcquisitionAttempts++;

            let opened = await Neo.Main.windowOpen({
                    nativeCapabilities: {close: true, position: true},
                    url               : `./index.html?popout=${itemId}&hostId=${me.id}`
                        + `&vesselFlow=tear-out&vesselGrant=${ownerGrant.token}`
                        + `&vesselGeneration=${ownerGrant.generation}`
                        + `&vesselAdmission=${admissionToken}`,
                    windowFeatures: `height=${height},left=${left},top=${top},width=${width}`,
                    windowId,
                    windowName
                });

            if (opened === false) {
                me.revokeVesselOwnerGrant('tear-out', itemId);
                return null
            }

            return {
                admissionToken,
                generation : ownerGrant.generation,
                popupHeight: height,
                popupWidth : width,
                windowName
            }
        } catch (error) {
            me.revokeVesselOwnerGrant('tear-out', itemId);
            return null
        }
    }

    /**
     * The tear-out retirement seam: closes a vessel the gesture no longer needs (re-entry,
     * cancel, or a refused model commit). The live connection and owner grant remain recoverable
     * until the platform strictly admits the close; an explicit refusal can therefore be retried
     * instead of orphaning a parked native generation. {@link #onWindowDisconnect} ignores
     * tear-out windows by construction (no {@link #detachedPanes} entry), so no reattach machinery
     * fires after success.
     * @param {Object} vessel
     * @param {String} vessel.itemId
     * @param {String} vessel.windowName
     * @param {Object} [vessel.nativeRoute] Exact opener-minted physical route when available
     * @returns {Promise<Boolean>}
     * @protected
     */
    async closeTearOutVessel({admissionToken, generation, itemId, nativeRoute, windowName}) {
        let me               = this,
            entry            = me.resolveTearOutVessel(itemId),
            admission        = me.tearOutConnectAdmissions.get(itemId),
            ownerGrant       = me.vesselOwnerGrants.get(`tear-out:${itemId}`),
            expected         = `tearout-${itemId}`,
            exactGeneration  = entry?.generation ?? admission?.generation ?? ownerGrant?.generation,
            exactToken       = entry?.admissionToken ?? admission?.admissionToken ?? ownerGrant?.admissionToken,
            embodiedWindowId = entry?.windowId ?? admission?.windowId ?? me.tearOutEmbodiment.getWindowId(itemId),
            closed           = false;

        if (
            !itemId || windowName !== expected || (entry && entry.windowName !== windowName) ||
            (Number.isFinite(generation) && generation !== exactGeneration) ||
            (Number.isFinite(admissionToken) && admissionToken !== exactToken)
        ) {
            return false
        }

        nativeRoute ??= entry?.nativeRoute ?? admission?.nativeRoute ?? (
            admission?.windowId && Neo.manager?.Window?.get(admission.windowId)?.nativeRoute
        );

        const exactWindowId = entry?.windowId ?? admission?.windowId;

        if (nativeRoute && (
            !nativeRoute.nativeHandleKey || nativeRoute.ownerWindowId !== me.windowId ||
            !nativeRoute.targetWindowId || nativeRoute.capabilities?.close !== true ||
            (exactWindowId && nativeRoute.targetWindowId !== exactWindowId)
        )) return false;

        // Establish retirement before restoring any source embodiment or awaiting the platform.
        // A refused close retains the exact route + tear-out machine slot for retry, but the content
        // stays safely home; a committed transfer promotes the staged pane instead, letting the
        // target-first reconciler take it without a false source restoration.
        me.tearOutRetirements.add(itemId);
        admission && (admission.invalidated = true);

        if (embodiedWindowId && me.tearOutEmbodiment.isStaged(itemId)) {
            const sourceOwns = Boolean(Document.findContainingTabsId(me.dockModel, itemId)),
                  settled    = me.tearOutEmbodiment[sourceOwns ? 'restore' : 'promote']({
                      itemId, windowId: embodiedWindowId
                  });

            if (!settled) return false
        }

        try {
            if (nativeRoute) {
                closed = await Neo.Main.windowNativeClose({
                    nativeHandleKey: nativeRoute.nativeHandleKey,
                    targetWindowId : nativeRoute.targetWindowId,
                    windowId       : me.windowId
                }) === true
            } else {
                // Before connect there is no exact route to correlate yet; the active tear-out
                // slot's unguessable semantic name is the only available authority. Once a route
                // exists, ANY invalidity above fails closed — never downgrade to same-name close.
                await Neo.Main.windowClose({names: [windowName], windowId: me.windowId});
                closed = true
            }
        } catch (error) {
            return false
        }

        if (!closed) return false;

        delete me.tearOutConnects[itemId];
        me.tearOutConnectAdmissions.delete(itemId);
        me.revokeVesselOwnerGrant('tear-out', itemId);
        me.tearOutRetirements.delete(itemId);

        return true
    }

    /**
     * The post-commit adoption: the detached terminal committed `detachItem` (the item left the
     * tree, catalog preserved), so the vessel now OWNS the pane. Writes the {@link #tearOutPanes}
     * entry and — if the vessel already connected ({@link #tearOutConnects}, the long-drag order)
     * — reparents the live pane into it immediately; otherwise {@link #onWindowConnect} adopts on
     * arrival (the fast-terminal order). Close-after-adoption reintegration is the vessel-lifecycle
     * leaf's scope, deliberately not handled here.
     * @param {String} itemId
     * @param {Number} [generation] Exact owner-grant generation for terminal-first adoption.
     * @param {Number} [admissionToken] Exact gesture admission for terminal-first adoption.
     * @protected
     */
    adoptTearOutPane(itemId, generation, admissionToken) {
        let me        = this,
            connected = me.tearOutConnects[itemId];

        me.tearOutPanes[itemId] = connected
            ? {...connected}
            : {windowName: `tearout-${itemId}`, windowId: null};

        Object.defineProperties(me.tearOutPanes[itemId], {
            admissionToken: {
                configurable: true,
                value       : connected?.admissionToken ?? admissionToken ?? null,
                writable    : true
            },
            generation: {
                configurable: true,
                value       : connected?.generation ?? generation ?? null,
                writable    : true
            },
            nativeRoute: {
                configurable: true,
                value       : connected?.nativeRoute ?? null,
                writable    : true
            }
        });

        if (connected) {
            // Promotion is synchronous and single-owner: committed disconnects may only match
            // tearOutPanes from this point onward, never the pre-terminal connect branch first.
            delete me.tearOutConnects[itemId];

            if (me.tearOutEmbodiment.isStaged(itemId)) {
                me.tearOutEmbodiment.promote({itemId, windowId: connected.windowId})
            } else {
                me.reparentTearOutPane(itemId, connected)
            }
        }
    }

    /**
     * Moves the LIVE cached pane into a connected tear-out vessel — the same instance-moving
     * reparent the click-pop-out uses, minus every document write (the model already committed
     * at the terminal; this is pure render-target work).
     * @param {String} itemId
     * @param {Object} target `{windowId}`
     * @protected
     */
    reparentTearOutPane(itemId, target) {
        let me         = this,
            {windowId} = target,
            app        = Neo.apps[windowId],
            pane       = me.paneCache[itemId];

        if (!app || !pane || pane.isDestroyed) return false;

        me.tearOutPanes[itemId] && Object.assign(me.tearOutPanes[itemId], target);

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
                : Object.keys(me.dockModel.nodes).find(id => me.dockModel.nodes[id].type === 'tabs'),
            result = Operations.transferItem(me.popupDocument, me.dockModel, {
                itemId,
                sourceWorkspaceId: 'popup',
                targetWorkspaceId: 'main',
                target           : {operation: 'addTab', tabsNodeId: home}
            });

        if (result.errors.length) {
            return {errors: result.errors, reattached: false}
        }

        me.revokeVesselOwnerGrant('click-popout', itemId);
        delete me.detachedPanes[itemId];

        // Commit model ownership before awaiting the vessel. The deleted bookkeeping entry is
        // the disconnect re-entrancy guard; a close failure leaves an empty popup, not split truth.
        pane.parent?.remove(pane, false);
        me.popupDocument = result.sourceDocument;
        me.onDockZoneDocumentChange(result.targetDocument);

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
     * @param {Object} [document=this.getWorkspaceDocument(workspaceId)] Document to project.
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

            const nextConfig = me.projectDockModel((componentRef, item, itemId) => {
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
     * Lights the first `count` pips.
     * @param {Number} count
     */
    setPipProgress(count) {
        const pips = this.getReference('tour-pips-b');

        if (pips) {
            let {vdom} = pips;

            vdom.cn.forEach((pip, index) => {
                pip.cls = index < count
                    ? ['agentos-dockdemo-pip', 'agentos-dockdemo-pip-done']
                    : ['agentos-dockdemo-pip']
            });

            pips.update()
        }
    }

    /**
     * Updates the caption feed.
     * @param {String} text
     */
    setTourCaption(text) {
        const caption = this.getReference('tour-caption-b');

        caption && (caption.html = text)
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

            me.popupDocument = DemoBWorkspace.createPopupDocument();
            await me.onWorkspaceDocumentChange(
                DemoBWorkspace.MAIN_WORKSPACE_ID,
                Document.clone(initialDocument)
            )
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
            schema: Document.SCHEMA,
            root  : 'popup-root',
            items : {},
            nodes : {
                'popup-root': {type: 'edge-zone', zones: {center: {nodeId: 'popup-tabs'}}},
                'popup-tabs': {type: 'tabs', items: [], activeItemId: null}
            }
        }
    }

    /**
     * Tears down the runner, seam, store, and every cached pane with the workspace.
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
        me.vesselOwnerGrants.clear();
        me.tearOutConnectAdmissions.clear();
        me.tearOutEmbodiment?.destroy();
        me.tearOutEmbodiment = null;
        me.tearOutRetirements.clear();
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

        Object.values(me.paneCache).forEach(pane => {
            pane?.isDestroyed || pane?.destroy?.()
        });
        me.paneCache = {};

        super.destroy(...args)
    }
}

export default Neo.setupClass(DemoBWorkspace);
