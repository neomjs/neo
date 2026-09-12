import Component                  from '../../../src/component/Base.mjs';
import Container                  from '../../../src/container/Base.mjs';
import DockWorkspace              from '../../../src/dashboard/dock/Workspace.mjs';
import NativeVesselTransaction    from '../../../src/dashboard/dock/window/NativeVesselTransaction.mjs';
import PopupWorkspace             from './PopupWorkspace.mjs';
import Feed                       from '../store/Feed.mjs';
import FeedPane                   from './FeedPane.mjs';
import Scale                      from '../store/Scale.mjs';
import ScalePane                  from './ScalePane.mjs';
import DockDragAffordances        from '../../../src/dashboard/dock/interaction/DragAffordances.mjs';
import DockDropIndicators         from '../../../src/dashboard/dock/interaction/DropIndicators.mjs';
import DockLayoutAdapter          from '../../../src/dashboard/dock/projection/LayoutAdapter.mjs';
import PerspectiveLibrary         from '../../../src/dashboard/dock/persistence/PerspectiveLibrary.mjs';
import TopologyLibrary            from '../../../src/dashboard/dock/persistence/TopologyLibrary.mjs';
import Placement                  from '../../../src/dashboard/dock/window/Placement.mjs';
import DockPreview                from '../../../src/dashboard/dock/interaction/Preview.mjs';
import CrossWindowGestureSnapshot from './CrossWindowGestureSnapshot.mjs';
import DockProjectionReconciler   from '../../../src/dashboard/dock/projection/Reconciler.mjs';
import DockService                from '../../../src/ai/client/DockService.mjs';
import WorkspaceDocument          from '../../../src/dashboard/dock/model/WorkspaceDocument.mjs';
import WorkspaceController        from './WorkspaceController.mjs';
import Operations                 from '../../../src/dashboard/dock/model/Operations.mjs';
import Persistence                from '../../../src/dashboard/dock/model/Persistence.mjs';
import StateProvider              from '../../../src/state/Provider.mjs';
import TopologyDiff               from '../../../src/dashboard/dock/model/TopologyDiff.mjs';
import TourToolbar                from './TourToolbar.mjs';
import TransactionManager         from '../../../src/manager/Transaction.mjs';
import WindowManager              from '../../../src/manager/Window.mjs';
import {
    createDockVesselEmbodiment,
    createDockVesselProxyEmbodiment
}                                                from '../../../src/dashboard/dock/window/VesselEmbodiment.mjs';
import WorkspaceSet                        from '../../../src/dashboard/dock/window/WorkspaceSet.mjs';
import VesselPark                          from '../../../src/dashboard/dock/window/VesselPark.mjs';
import {initialTourState, initialDocument} from '../tour/denseWorkstation.mjs';
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
     * @member {String} VESSEL_WORKSPACE_PREFIX='workstation-vessel:'
     * @static
     */
    static VESSEL_WORKSPACE_PREFIX = 'workstation-vessel:'
    /**
     * Returns one vessel's stable semantic workspace identity. Runtime window ids never enter it.
     * @param {String} itemId
     * @returns {String|null}
     * @static
     */
    static vesselWorkspaceId(itemId) {
        return typeof itemId === 'string' && itemId ? `${Workspace.VESSEL_WORKSPACE_PREFIX}${itemId}` : null
    }

    /**
     * @summary Uses the document's semantic key for native admission too.
     * @param {String} itemId
     * @returns {String}
     */
    tearOutWorkspaceKey(itemId) {
        return Workspace.vesselWorkspaceId(itemId)
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
         * The cross-window observation surface. A mixin rather than a helper module because every
         * reader addresses it by name on the instance — the Neural Link resolves
         * `readCrossWindowGestureSnapshot` on this component, and a unit spec reaches it through
         * `Workspace.prototype`. Same shape and same reason as
         * {@link Neo.dashboard.dock.window.TopologySeams}.
         * @member {Neo.core.Base[]} mixins=[CrossWindowGestureSnapshot]
         */
        mixins: [CrossWindowGestureSnapshot],
        /** @member {Neo.controller.Component} controller */
        controller: WorkspaceController,
        /**
         * Workstation opts into bounded Group undo; a generic Transaction remains history-free.
         * Fifty rows match the benchmarked workload of frozen before/after snapshots of the
         * 20-item Workstation document. This is an overridable resource bound, not a tested UX limit.
         * @member {Number} dockHistoryDepth=50
         */
        dockHistoryDepth: 50,
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
            // The `topology` keys are DERIVED here rather than bound, because there is nothing to
            // bind to: `dockModel` is a plain field on the dock Workspace, not a reactive config, so
            // a formatter reading it would never re-run. {@link #syncTopologyState} publishes them
            // from the two places the document actually arrives. Seeded only so the keys exist before
            // the first publish; `construct` overwrites both with the measured answer.
            data  : {topology: {additionalWindows: 0, modified: false}, tour: initialTourState},
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
     * One Group's durable keyed records, independent of the single-Workspace perspective library.
     * @member {Neo.dashboard.dock.persistence.TopologyLibrary|null} topologyLibrary=null
     */
    topologyLibrary = null
    /**
     * Validated cold-boot input. Every keyed semantic document exists before its render host mounts.
     * @member {Object|null} initialTopology=null
     */
    initialTopology = null

    /**
     * The shared drag-affordance gesture controller (producer lifecycle, memoized geometry,
     * release-truth drop, generation guards) — composed at construct, destroyed with the view.
     * @member {Neo.dashboard.dock.interaction.DragAffordances|null} dragAffordances=null
     */
    dragAffordances = null


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
     * @member {Neo.dashboard.dock.window.VesselPark|null} vesselParkHandlers=null
     * @protected
     */
    vesselParkHandlers = null
    /**
     * Post-terminal native-titlebar park/restore authority. Separate from pointer conversion:
     * the generic DragDrop addon has no active pointer-follow session after a dropped popup.
     * @member {Neo.dashboard.dock.window.VesselPark|null} nativeVesselParkHandlers=null
     * @protected
     */
    nativeVesselParkHandlers = null
    /**
     * The worker-owned cross-window workspace registry — `{workspaceId → document accessors}`.
     * @member {Object|null} workspaceSet=null
     * @protected
     */
    workspaceSet = null
    /** @member {Neo.dashboard.dock.window.Placement|null} dockPlacement=null Group-owned relative hints. */
    dockPlacement = null
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
     * @summary Declares the topology bar: explicit save/close, the Group's undo/redo, and the
     * reference through which its controller fills the per-workspace recovery buttons.
     *
     * The structure is the view's; the live membership is the controller's. A factory rather than a
     * module because the undo/redo formatters need this instance — `state.Provider#createBinding`
     * calls a formatter with the provider as scope, so a `static config` on a separate toolbar class
     * could not reach {@link #topologyGroupId}. Same reason `createStatusBar` is a factory.
     *
     * Handlers are declarative names resolved through the configured controller chain, so nothing
     * here closes over the controller instance.
     * @returns {Object}
     * @protected
     */
    createTopologyBar() {
        let me = this;

        return {
            ntype: 'toolbar',
            // Undo and redo are the Group's, and they read it WHERE IT LIVES. `getData` resolves to
            // that leaf's own `core.Config`, so the formatter registers it and re-runs on change —
            // no mirror to keep in step with `setHistoryDepth`, which publishes without a commit.
            // A retired or unknown Group resolves to nothing and reads disabled, so the control
            // fails closed on the same expression rather than through a separate teardown.
            // Same leaf for the depth badges: `historyCursor` and `historyLength` are published
            // alongside the flags above, so they add no second publication path. `historyDepth` is
            // deliberately unused — it is the Group's configured CAP, and would read as a constant.
            actions: [{
                action: 'undo',
                bind  : {
                    // `cursor` starts at -1 and `canUndo` is `cursor > -1`, so the steps behind the
                    // cursor are `cursor + 1`.
                    badgeText: () => me.historyStepBadge(provider => provider.getData('historyCursor') + 1),
                    disabled : () => TransactionManager.getProvider(me.topologyGroupId)?.getData('canUndo') !== true
                },
                handler    : () => TransactionManager.undo({groupId: me.topologyGroupId}),
                iconCls    : 'fa fa-rotate-left',
                showOnFocus: false,
                text       : 'Undo'
            }, {
                action: 'redo',
                bind  : {
                    // `canRedo` is `cursor < count - 1`, so the rows ahead of the cursor are
                    // `count - 1 - cursor`.
                    badgeText: () => me.historyStepBadge(provider =>
                        provider.getData('historyLength') - 1 - provider.getData('historyCursor')),
                    disabled : () => TransactionManager.getProvider(me.topologyGroupId)?.getData('canRedo') !== true
                },
                handler    : () => TransactionManager.redo({groupId: me.topologyGroupId}),
                iconCls    : 'fa fa-rotate-right',
                showOnFocus: false,
                text       : 'Redo'
            }],
            cls : ['workstation-topologybar'],
            flex: 'none',
            // Ordinary items. The controller adds its per-workspace recovery buttons beside them
            // and removes only the ones it flagged, so neither side counts the other's and this
            // list is free to grow.
            items : [
                {ntype: 'button', handler: 'saveTopology',  text: 'Save workspace'},
                {ntype: 'button', handler: 'closeTopology', text: 'Close workspace'},
                // Handled on the view rather than by controller name, like undo and redo above it:
                // the state, the shipped document and the commit seam all live on the view, and a
                // controller method would only forward. Disabled on the shipped arrangement so the
                // control answers "there is nothing to go back to" instead of committing a no-op
                // history row — and it reads the SAME derived key as the readout, so the button and
                // the line beside it can never disagree about whether the user has left the default.
                {
                    ntype  : 'button',
                    bind   : {disabled: data => !data.topology.modified},
                    handler: () => me.resetTopology(),
                    iconCls: 'fa fa-rotate-left',
                    text   : 'Reset to default'
                },
                // Reads the derived keys rather than recomputing: the diff runs once per committed
                // document at its writer, not once per binding evaluation. Both bindings go through
                // the one static formatter so the visibility test and the text can never disagree
                // about whether there is something to say.
                {
                    ntype: 'component',
                    bind : {
                        cls : data => ['workstation-topology-state'].concat(Workspace.topologyStateText(data.topology) ? [] : ['neo-hidden']),
                        html: data => Workspace.topologyStateText(data.topology)
                    },
                    flex : 'none'
                }
            ],
            layout   : {ntype: 'flexbox', align: 'center', direction: 'row', wrap: 'wrap'},
            reference: 'topology-toolbar'
        }
    }

    /**
     * @summary The step count one history control shows on its badge, or `null` for none.
     *
     * Shared by both bindings so the two counts cannot drift into different notions of "available",
     * and so the missing-Group answer is decided once. A retired or unknown Group has no provider
     * and yields `null` — the same fail-closed reading its `disabled` bind takes, rather than a
     * badge surviving on a control that can no longer act.
     *
     * Reads inside the callback are the caller's effect dependencies, so a formatter that consults
     * two keys re-runs on either.
     * @param {Function} count `(provider) => Number` steps available in that direction
     * @returns {String|null} The badge text, or `null` when there is nothing to show
     * @protected
     */
    historyStepBadge(count) {
        const provider = TransactionManager.getProvider(this.topologyGroupId),
              steps    = provider ? count(provider) : 0;

        return Number.isFinite(steps) && steps > 0 ? `${steps}` : null
    }

    /**
     * @summary How the live topology stands against the arrangement the app ships with, as two
     * independent facts.
     *
     * @description **The unit is the whole keyed topology, not this window's document.** What gets
     * persisted and restored is {@link #getDockTopologyWorkspaces} — every registered workspace
     * keyed by identity — because the thing a reader expects back when they open the app URL is
     * their multi-window setup, not one window's panes. So a pane torn out into a second window IS
     * a departure from the shipped arrangement, which ships exactly one workspace.
     *
     * **But that is a second fact, not the same one, and collapsing them made the readout lossy.**
     * An earlier revision returned a single Boolean and answered `true` on any extra key *before*
     * the differ ran. Two costs, and the second is worse than the first: a user whose main document
     * genuinely matches the default was told they had "modified" it, and the document that actually
     * matched was never compared at all — so the answer was not merely coarse, it was unmeasured.
     * It also made reset look broken: reset commits the shipped document and deliberately leaves
     * other windows standing ({@link Neo.dashboard.dock.window.TopologySeams#commitDockTopologyWorkspaces}
     * refuses a commit that does not name every registered key, and retiring a window is neither
     * synchronous nor guaranteed), so the readout lit up the instant the user pressed it.
     *
     * Reported separately, both halves stay true and the user can act on each: the named document
     * is at the default or it is not, and N windows stand beyond the one the app ships. Rendering
     * is {@link Workspace.topologyStateText}'s problem, not this method's.
     *
     * The question is a COMPARISON, not a dirty flag: a flag set on the first operation never
     * clears when the user undoes back to the start, while a comparison recomputed from live state
     * does, for free.
     *
     * Per document, `TopologyDiff.diffDockDocuments` is the comparator rather than
     * `computeShapeFingerprint`, whose own docblock states it carries "no node ids, item ids,
     * sizes, titles or window identity" — shape-only by contract, so it reads a dragged boundary, a
     * reordered tab and a switched pane as unchanged. Those are the operations this workspace is
     * FOR. Categories are read off the returned object rather than listed here: the differ's class
     * comment stood at seven while the code returned eight, so a hand-copied list under-reports
     * exactly where the documentation has drifted.
     *
     * **Window geometry needs no separate test here, and the reason is the shipped arrangement
     * rather than geometry being cosmetic.** It is emphatically not cosmetic:
     * {@link Neo.dashboard.dock.window.Placement} is an auxiliary participant in this same Group
     * history, writes a settled popup move as an appended row, and `undo` applies it natively — a
     * dragged window is an undoable step exactly as a dragged splitter is. But its hints are popup
     * offsets measured RELATIVE TO MAIN (`observedHints` skips the main binding), and this app ships
     * a single window. So any hint worth comparing implies a second workspace, which
     * `additionalWindows` already reports. Testing hints as well would not add a case — it would
     * subtract correctness: `getPlacementHints` reads the raw hint record rather than the pruned
     * one, so a hint outliving a closed popup would report a user who is genuinely back at the
     * default as modified.
     *
     * Three deliberate `modified: false` answers, all of them "no comparison happened" rather than
     * "compared equal". **An unestablished topology** — no workspace registered yet — is not a
     * departure; it is the absence of an answer, and reporting one would light the indicator during
     * boot. **A main workspace that is not registered**, likewise: there is nothing to compare the
     * shipped document against. `additionalWindows` is still counted honestly in that case, because
     * it is a separate fact that remains knowable. **A malformed document** likewise: `errors` means
     * the comparison did not happen, and an indicator that lights up because the differ failed tells
     * the reader something false about their own layout.
     * @returns {{additionalWindows: Number, modified: Boolean}}
     * @protected
     */
    readTopologyState() {
        const me                = this,
              workspaces        = me.getDockTopologyWorkspaces(),
              keys              = Object.keys(workspaces),
              main              = workspaces[Workspace.MAIN_WORKSPACE_ID],
              additionalWindows = keys.filter(key => key !== Workspace.MAIN_WORKSPACE_ID).length;

        if (!main) return {additionalWindows, modified: false};

        const diff = TopologyDiff.diffDockDocuments(initialDocument, main);

        return {
            additionalWindows,
            modified: !diff.errors.length && Object.keys(diff).some(category =>
                category !== 'errors' && category !== 'unchanged' && diff[category]?.length)
        }
    }

    /**
     * @summary The topology bar's state line, or an empty string when there is nothing to say.
     *
     * @description Static and pure so the binding, the spec and any future consumer read one
     * formatter rather than three phrasings that drift. It composes the two facts
     * {@link #readTopologyState} measures; it does not re-derive them.
     *
     * **Silence is a state.** On the shipped arrangement with no extra windows this returns `''`
     * and the component hides. A readout that is always present says nothing — the whole point of
     * the ticket is that "this is the product" and "you made this" look different at a glance.
     *
     * The default-arrangement half appears **only** alongside extra windows. Saying "Default
     * arrangement" on its own would be that always-present readout; saying it beside a window count
     * is what stops the count from reading as an accusation after a reset.
     * @param {Object}  [state={}]
     * @param {Number}  [state.additionalWindows=0]
     * @param {Boolean} [state.modified=false]
     * @returns {String}
     */
    static topologyStateText({additionalWindows=0, modified=false}={}) {
        const parts = [];

        if (modified)               parts.push('Modified from default');
        else if (additionalWindows) parts.push('Default arrangement');

        if (additionalWindows) parts.push(`${additionalWindows} additional window${additionalWindows === 1 ? '' : 's'}`);

        return parts.join(' · ')
    }

    /**
     * @summary Returns the main workspace to the arrangement the app ships with.
     *
     * @description **One commit, and that is the whole design.** The shipped document replaces the
     * main entry of the live keyed topology and every other key is passed through **unchanged**, so
     * the write names exactly the registered keys that
     * {@link Neo.dashboard.dock.window.TopologySeams#commitDockTopologyWorkspaces} requires and no
     * window has to be retired for the commit to be legal.
     *
     * **Leaving other windows standing is the contract, not a shortfall.** Retiring them inside the
     * commit is not buildable: `transaction/Commit.mjs` throws unless adoption is synchronous, while
     * a native close is asynchronous *and* refusable — `Window.mjs` gates `close` as a route
     * capability and defaults a route without one to `{close: false}`. Placed in `prepare`, the only
     * async phase, a blocked popup would abort the restore and the user could not get their layout
     * back because a window would not shut. Placed after the commit it is no longer atomic. So the
     * standing window is reported by {@link #readTopologyState} rather than acted on, and the user
     * closes it themselves.
     *
     * **It commits through the Group rather than assigning `dockModel`.** The nearest precedent in
     * this repo — `TourController`'s `workspace.dockModel = WorkspaceDocument.clone(initialDocument)`
     * — is a direct field write that fires no commit event, so `TopologyLibrary`'s
     * `commit: data => this.persistCurrent()` never runs and the OLD topology stays in IndexedDB to
     * return on the next reload. Copying it would leave the user's arrangement restored on refresh.
     *
     * **Single-commit is also what makes it recoverable.** Persistence is commit-driven, so a
     * multi-step reset would write each intermediate state to IndexedDB as it went and could strand
     * a persisted half-reset whose original was already overwritten by step one. There are no
     * intermediate states here: one write, one auto-save. And `WorkspaceSet.write` defaults to
     * `cursorAction: 'append'`, so this lands as one ordinary history row — undo reverses it exactly
     * as it reverses a dragged splitter, which is why it carries no confirmation ceremony.
     *
     * It deliberately does **not** route through `startBlankRoot()`: that path admits
     * `{topologyIdentity: {}}` and exists for the load-failure case. Blank is not default, and
     * conflating them would delete the product's own layout.
     * @returns {Promise<{errors: String[], reset: Boolean, transactionId: String|null}>}
     */
    async resetTopology() {
        const me         = this,
              workspaces = me.getDockTopologyWorkspaces();

        // Not a defensive guard: with no main workspace registered there is no entry for the shipped
        // document to replace, so the commit would ADD a key and be refused for naming something
        // unregistered. Refusing here names the actual cause instead of the seam's generic shape.
        if (!Object.hasOwn(workspaces, Workspace.MAIN_WORKSPACE_ID)) {
            return {errors: ['the main workspace is not registered'], reset: false, transactionId: null}
        }

        // **Every other workspace is RETIRED first, and the ordering is the whole correctness
        // argument.** Restoring `initialDocument` beside an untouched popup is only safe while that
        // popup holds nothing the shipped document also lists — and the ordinary case violates it:
        // tear a shipped pane into a window and both documents then claim it, the topology is
        // invalid, `Persistence` refuses the capture, and the reset reports success while being
        // unpersistable. Found by @neo-gpt-emmy in review.
        //
        // Reclaiming the pane instead of retiring the workspace does not work either: giving back a
        // popup's only pane prunes its last tabs node and leaves `root` dangling, so the emptied
        // document is refused as `root node "…" is missing`. A window that has handed everything
        // home has no valid document to hold.
        //
        // **Retirement is safe here precisely because it is NOT in the atomic section.**
        // `Transaction#unregisterParticipant` is `participants.delete(workspaceKey)` — synchronous,
        // firing no commit — so it cannot auto-save an intermediate state, which is what made the
        // ticket warn about multi-step resets. What cannot be done is closing the native WINDOW
        // inside the commit: adoption must be synchronous while a native close is asynchronous and
        // refusable. Retiring the participant and closing the window are different acts, and only
        // the second is impossible. The window stays open; it simply no longer participates.
        Object.keys(workspaces)
            .filter(workspaceKey => workspaceKey !== Workspace.MAIN_WORKSPACE_ID)
            .forEach(workspaceKey => me.workspaceSet.unregister(workspaceKey));

        const {errors, transactionId} = await me.commitDockTopologyWorkspaces(
            {[Workspace.MAIN_WORKSPACE_ID]: WorkspaceDocument.clone(initialDocument)},
            {name: 'default', provenance: {origin: 'human'}});

        return {errors, reset: !errors.length, transactionId: transactionId ?? null}
    }

    /**
     * @summary Publishes the first modified readout once the provider is resolvable.
     *
     * Boot is the second place a committed topology arrives and the only one the Group's document
     * setter cannot see: {@link #construct} seeds `dockModel` from a persisted `initialTopology`,
     * which is an arrangement the user already changed. Without this the indicator reads "default"
     * on a cold-hydrated custom perspective — the exact state this affordance exists to expose.
     *
     * It lives here rather than on the controller's `onComponentConstructed` seam because the state
     * is the view's: the view owns `dockModel` and the provider, and a controller that had to call
     * it would impose the method on every component that controller can drive.
     */
    onConstructed() {
        super.onConstructed();
        this.syncTopologyState()
    }

    /**
     * @summary Republishes the modified readout after a Group commit has settled.
     *
     * @description **The seam matters more than the timing.** Presentation runs after the queue
     * releases and, by the manager's contract, "cannot reject the commit" — whereas the participant's
     * document setter runs inside the adopt phase, where a throw becomes an `AggregateError` in
     * `transaction/Commit.mjs`'s rollback and takes the whole transaction down. A status readout must
     * never be able to fail the commit it is reporting on, so it hangs here rather than there.
     *
     * It overrides the class method rather than wrapping the `project` callback in
     * {@link #registerMainWorkspace}, because that registration is deliberately `.call()`-able onto
     * a plain dock Workspace — the transaction specs borrow it to isolate Group behaviour from this
     * app's. Behaviour that belongs to this subclass attaches to this subclass; a borrowed
     * registration keeps the engine's projection untouched.
     *
     * Undo and redo project through here too, which is why undoing back to the shipped arrangement
     * clears the indicator with no path of its own.
     * @param {Object} context The Group participant's projection context.
     * @returns {Promise} This projection's outcome.
     */
    projectDockCommit(context) {
        const projection = super.projectDockCommit(context);

        this.syncTopologyState();

        return projection
    }

    /**
     * @summary Publishes {@link #readTopologyState} for the topology bar's readout.
     *
     * Both keys are written by path in one call rather than replacing the `topology` object, so a
     * key added here later cannot be silently dropped by this publisher, and the pair lands as one
     * update rather than flashing a half-state through the binding.
     * @protected
     */
    syncTopologyState() {
        const me = this;

        if (me.isDestroyed || !me.getStateProvider()) return;

        const {additionalWindows, modified} = me.readTopologyState();

        me.setState({'topology.additionalWindows': additionalWindows, 'topology.modified': modified})
    }

    /**
     * @summary Creates all cold semantic owners before constructing their presentation.
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        me.dockModel         = WorkspaceDocument.clone(me.initialTopology?.workspaces[Workspace.MAIN_WORKSPACE_ID] ?? initialDocument);
        me.dockService       = Neo.create(DockService, {});
        me.perspectiveStore  = Neo.create(PerspectiveLibrary, {});
        me.topologyLibrary ??= Neo.create(TopologyLibrary, {
            collection: Persistence.createTopologyCollection([], {activeLayoutId: null}).collection
        });
        me.workspaceSet = Neo.create(WorkspaceSet, {documentModel: WorkspaceDocument, manager: TransactionManager, getGroupId: () => me.topologyGroupId});

        for (const [workspaceId, document] of Object.entries(me.initialTopology?.workspaces ?? {})) {
            if (workspaceId === Workspace.MAIN_WORKSPACE_ID) continue;
            const host = Neo.create(PopupWorkspace, {
                dockModel      : WorkspaceDocument.clone(document), flex: 1, rootWorkspace: me,
                topologyGroupId: me.topologyGroupId, workspaceKey: workspaceId, workspaceSet: me.workspaceSet,
                stateProvider  : {module: StateProvider, parent: me.stateProvider}
            });
            const state = {
                committed   : true,
                disconnected: true,
                host,
                get document() { return host.dockModel },
                set document(value) { host.dockModel = value },
                windowId    : null,
                workspaceId
            };
            host.runtimeState = state
        }

        me.registerMainWorkspace();

        me.appendFeedBatch(25);

        me.add([{module: TourToolbar}, me.createStatusBar(), me.createTopologyBar(), {
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
        me.crossWindowParticipationPromise = me.refreshCrossWindowParticipation()
            .catch(error => {
                me.lastCrossWindowTransfer = {applied: false, errors: [error.message]};
                return null
            });

        // Conversion never re-acquires a popup: close-and-reopen is a one-way door (mid-gesture
        // acquisition consumes transient activation and reads as unsolicited), so conversion
        // PARKS the real vessel behind its target, out-conversion re-shows the SAME generation,
        // and only a commit disposes — every other outcome restores.
        // The transaction is the engine's; this host supplies the four inputs that vary. It DOES
        // declare a geometry restore, which is what licences its park to shrink an oversized source
        // and obliges its re-show to give the extent back. The park below stays an override: the
        // native-titlebar paths are product policy (an OS titlebar drag carries no user activation,
        // so a main-window target parks nothing at all) and cannot be expressed as a descriptor
        // input without turning this default into a configuration language.
        me.vesselTransaction = NativeVesselTransaction.effectsFor({
            ownerWindowId : () => me.windowId,
            publishReceipt: (key, receipt) => {
                key === 'park' ? (me.lastVesselParkReceipt = receipt) : (me.lastVesselRestoreReceipt = receipt)
            },
            rectPlane      : 'outer',
            resolveVessel  : itemId => me.resolveTearOutVessel(itemId),
            restoreGeometry: itemId => me.tearOutParkGeometries[itemId] ?? null,
            retireVessel   : vessel => me.tearOutHandlers.retireActiveVessel(vessel),
            targetWindowId : () => me.vesselConversionTargetWindowId,
            // Its terminal restore ends a DRAG, so the addon that may still own the gesture is
            // asked before the route is addressed directly.
            terminalRestoreOwner: 'drag'
        });

        me.vesselParkHandlers = Neo.create(VesselPark, {
            disposeVessel: vessel => me.disposeParkedTearOutVessel(vessel),
            parkVessel   : vessel => me.parkTearOutVessel(vessel),
            reshowVessel : vessel => me.reshowTearOutVessel(vessel)
        });
        me.nativeVesselParkHandlers = Neo.create(VesselPark, {
            disposeVessel: ({itemId}) => me.retireReturnedVessel(Workspace.vesselWorkspaceId(itemId)),
            parkVessel   : vessel => me.parkTearOutVessel({...vessel, nativeTitlebar: true}),
            reshowVessel : vessel => me.reshowTearOutVessel(vessel)
        });

        // The reactive afterSet fires before the dock host exists during construction —
        // re-apply the active language now that the host is live (both orders converge).
        me.previewLanguage && me.afterSetPreviewLanguage(me.previewLanguage, null);

        me.syncThemeToggle(me.theme);
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
            for (const state of me.getPopupStates()) {
                item = state.document?.items?.[itemId];

                if (item) break
            }
        }

        return item ? me.resolvePane(itemId, item).id : null
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
        const me = this, firstRegistration = !me.workspaceSet.has(Workspace.MAIN_WORKSPACE_ID);

        const registered = me.workspaceSet.register(Workspace.MAIN_WORKSPACE_ID, {
            bindingKey : 'main',
            componentId: me.id,
            getDocument: () => me.dockModel,
            setDocument: document => me.dockModel = document,
            project    : context => me.projectDockCommit(context)
        });
        if (registered) {
            firstRegistration && TransactionManager.setHistoryDepth({groupId: me.topologyGroupId, depth: me.dockHistoryDepth});
            me.dockPlacement ??= Placement.forGroup({
                groupId: me.topologyGroupId, initialHints: me.initialTopology?.placementHints, mainWorkspaceKey: Workspace.MAIN_WORKSPACE_ID
            })
        }
        return registered
    }

    /** @summary Returns the Group's current relative hints for topology persistence. @returns {Object} */
    getPlacementHints() {
        return this.dockPlacement?.hints ?? {}
    }

    /**
     * @summary The topology collection belongs to the Group library, including writes from DockService.
     * @returns {Object|null}
     */
    get topologyCollection() {
        return this.topologyLibrary?.collection ?? null
    }

    /**
     * @summary Routes a validated collection adoption through its one owner.
     * @param {Object} value
     */
    set topologyCollection(value) {
        this.topologyLibrary.collection = value
    }

    /**
     * @summary Saves the current topology through the root controller and waits for durability.
     * @param {String} [layoutId]
     * @returns {Promise<Object>}
     */
    saveTopology(layoutId) {
        return this.getController().saveTopology(layoutId)
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
                    targetState       = me.getPopupState(targetWorkspaceId);

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
     * @summary Creates the main target using engine affordances and Workstation's saved-home policy.
     * Popup workspaces own their default Participation through their native window lifecycle.
     * @param {Object} data
     * @param {String|Number} data.windowId
     * @returns {Promise<Workstation.window.Participation|null>}
     * @protected
     */
    async createCrossWindowParticipation({windowId}) {
        const me            = this,
              Participation = (await import('../window/Participation.mjs')).default,
              workspaceId   = Workspace.MAIN_WORKSPACE_ID;

        if (me.isDestroyed) return null;

        return Neo.create(Participation, {
            affordances           : me.dragAffordances,
            commitLocal           : operation => me.commitLocalWorkspaceOperation(workspaceId, operation),
            commitTransfer        : data => me.commitCrossWindowTransfer(data),
            dragEmbodiment        : me.vesselProxyEmbodiment,
            resolveOwnershipId    : () => me.resolveTopologyGroup() ?? null,
            resumeNativeWindowDrag: itemId => me.nativeVesselParkHandlers.onGestureTerminal({
                itemId,
                outcome: 'rejected'
            }),
            retireNativeWindowDrag: draggedItem => me.nativeVesselParkHandlers.onGestureTerminal({
                itemId : draggedItem?.dockItemId,
                outcome: 'committed'
            }),
            sortGroup              : Workspace.CROSS_WINDOW_SORT_GROUP,
            suspendNativeWindowDrag: (itemId, data) => {
                me.vesselConversionTargetWindowId = data?.targetWindowId ?? null;

                return me.nativeVesselParkHandlers.onConversionIn({
                    itemId,
                    sourceRect: me.resolveVesselConversionSourceRect({itemId}),
                    windowName: me.resolveTearOutVessel(itemId)?.windowName
                })
            },
            windowId,
            workspace   : me,
            workspaceId,
            workspaceSet: me.workspaceSet
        })
    }

    /**
     * @summary Re-registers the main target after projection without taking ownership of its visuals.
     * The stable target shares its coordinator slot with projected tab zones and registers last.
     * @returns {Promise<Workstation.window.Participation|null>}
     * @protected
     */
    async refreshCrossWindowParticipation() {
        const me = this, windowId = me.windowId, workspaceId = Workspace.MAIN_WORKSPACE_ID;
        if (windowId == null) return null;

        me.crossWindowParticipations.get(workspaceId)?.destroy();
        me.crossWindowParticipations.delete(workspaceId);

        const participation = await me.createCrossWindowParticipation({windowId});

        if (!participation || me.isDestroyed || me.windowId !== windowId) {
            participation?.destroy();
            return null
        }

        me.crossWindowParticipations.set(workspaceId, participation);
        return participation
    }

    /**
     * @summary Mounts the already-admitted full Workspace in its matching native generation.
     * @param {Object} data
     * @returns {Promise<Object|null>}
     */
    async registerVesselWorkspaceTarget({app, itemId, windowId}) {
        const state = this.getPopupState(Workspace.vesselWorkspaceId(itemId));
        if (!state?.host || !app?.mainView) return null;
        if (state.windowId === windowId && state.host.parent === app.mainView) {
            await state.mountPromise;
            return state
        }
        state.app = app;
        state.windowId = windowId;
        state.renderTarget = app.mainView;
        state.mountPromise = this.mountVesselWorkspace(state.workspaceId);
        await state.mountPromise;
        state.disconnected = false;
        return state
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
            state       = workspaceId && me.getPopupState(workspaceId);

        if (!state) return false;

        state.participation?.destroy();
        me.crossWindowParticipations.delete(workspaceId);
        state.host?.parent?.remove(state.host, false, true);
        if (state.host) state.host.windowId = null;
        state.windowId = state.app = state.renderTarget = null;
        state.disconnected = true;
        state.closeRequested = false;

        return true
    }

    /**
     * @summary Resolves committed document truth through the Group's participant membership.
     * @param {String} workspaceId
     * @returns {Object|null}
     * @protected
     */
    getWorkspaceDocument(workspaceId) {
        return workspaceId === Workspace.MAIN_WORKSPACE_ID ? this.dockModel : this.workspaceSet.getDocument(workspaceId)
    }

    /**
     * @summary Resolves popup presentation state through its registered Group participant.
     * @param {String} workspaceId
     * @returns {Object|null}
     */
    getPopupState(workspaceId) {
        const id    = TransactionManager.getParticipant(this.topologyGroupId, workspaceId)?.componentId;
        const owner = id && Neo.getComponent(id);
        return owner?.rootWorkspace === this ? owner.runtimeState ?? null : null
    }

    /**
     * @summary Lists the Group's popup owners without retaining another membership registry.
     * @returns {Object[]}
     */
    getPopupStates() {
        return this.workspaceSet?.ids().map(key => this.getPopupState(key)).filter(Boolean) ?? []
    }

    /**
     * Seeds the empty document of a full popup Workspace before its first atomic pane transfer.
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
     * @summary Routes a local operation through its registered document owner and Group.
     * @param {String} workspaceId
     * @param {Object} descriptor
     * @returns {Promise<Object>}
     */
    async commitLocalWorkspaceOperation(workspaceId, descriptor) {
        try {
            await this.workspaceSet.commit(workspaceId, [descriptor], {provenance: {origin: 'human'}});
            return {document: this.workspaceSet.getDocument(workspaceId), errors: []}
        } catch (error) {
            return {document: this.workspaceSet.getDocument(workspaceId), errors: [error.message]}
        }
    }

    /**
     * @summary Commits one source/target transfer before projection and native retirement.
     * @param {Object} data The validated transfer descriptor.
     * @returns {Promise<Boolean>}
     */
    async commitCrossWindowTransfer({descriptor, sourceWorkspaceId, targetWorkspaceId} = {}) {
        const me = this;
        if (!descriptor || !me.workspaceSet.has(sourceWorkspaceId) || !me.workspaceSet.has(targetWorkspaceId)) return false;
        try {
            const committed = await me.workspaceSet.transfer(descriptor, {provenance: {origin: 'human'}});
            const receipt   = me.lastCrossWindowTransfer = {
                applied      : true, descriptor, sourceWorkspaceId, targetWorkspaceId,
                transactionId: committed.transactionId, phases: ['documents-adopted'],
                reconciled   : false, closeRequested: false, topologyExited: false
            };
            const source = me.getPopupState(sourceWorkspaceId), target = me.getPopupState(targetWorkspaceId);
            await Promise.all([me.refreshPromise, source?.host?.refreshPromise, target?.host?.refreshPromise]);
            receipt.reconciled = true;
            receipt.phases.push('projections-settled');
            if (source && !Object.keys(source.document.items).length) await me.retireReturnedVessel(sourceWorkspaceId);
            return true
        } catch (error) {
            me.lastCrossWindowTransfer = {applied: false, errors: [error.message]};
            return false
        }
    }

    /**
     * @summary Mounts the Group's existing popup owner into its current render target.
     * @param {String} workspaceId
     * @returns {Promise<Boolean>}
     * @protected
     */
    async mountVesselWorkspace(workspaceId) {
        const state  = this.getPopupState(workspaceId), host = state?.host;
        const target = state?.renderTarget ?? state?.app?.mainView;
        if (!host || host.isDestroyed || !target || target.isDestroyed) return false;
        host.parent?.remove(host, false, true);
        target.add(host);
        await host.promiseUpdate();
        return true
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
            state   = me.getPopupState(workspaceId),
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
        const closed = await me.nativeWindows.retire(me.id, vessel);

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
        await me.refreshCrossWindowParticipation()
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
     * token is refused and the live vessel survives it. The Group's native retirement holds the
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
            admission        = me.nativeWindows?.getAdmission(me.id, itemId),
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

        // Absence of a route is not a refusal here: such a vessel closes semantically. Only a route
        // that exists and fails an axis is.
        const
            exactWindowId = entry?.windowId ?? admission?.windowId,
            // No exact window means no target to constrain, which the key's ABSENCE says; passing it
            // as null would instead say the caller lost an id it needed, and refuse.
            auth          = WindowManager.resolveNativeRoute({
                capability: 'close', ownerWindowId: me.windowId, route: nativeRoute,
                ...(exactWindowId && {targetWindowId: exactWindowId})
            });

        closeReceipt.route = {
            closeCapable      : !auth.present || auth.capable,
            exactTargetMatches: !auth.present || auth.targetMatches,
            exactWindowId     : exactWindowId ?? null,
            hasHandle         : !auth.present || auth.hasHandle,
            ownerMatches      : !auth.present || auth.ownerMatches,
            ownerWindowId     : nativeRoute?.ownerWindowId ?? null,
            present           : auth.present,
            targetPresent     : !auth.present || auth.hasTarget,
            targetWindowId    : nativeRoute?.targetWindowId ?? null
        };

        if (auth.present && !auth.granted) {
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
        let entry = this.nativeWindows?.getConnection(this.id, itemId) ?? this.nativeWindows?.getOwner(this.id, itemId);

        if (!entry?.windowId) return null;

        return {
            ...entry,
            itemId,
            nativeRoute: entry.nativeRoute ?? Neo.manager?.Window?.get(entry.windowId)?.nativeRoute ?? null,
            windowName : entry.windowName ?? `tearout-${itemId}`
        }
    }

    /**
     * Retires the parked vessel and its orphan recovery through the engine's default transaction,
     * then clears the two ledgers this host keys by item.
     * @param {Object} vessel
     * @returns {Promise<Boolean>}
     * @protected
     */
    async disposeParkedTearOutVessel(vessel) {
        const disposed = await this.vesselTransaction.disposeVessel(vessel);

        if (disposed) {
            delete this.tearOutParkGeometries[vessel.itemId];
            delete this.tearOutParkAttempts[vessel.itemId]
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

        const
            sourceArgs   = {ownerWindowId: me.windowId, route, targetWindowId: entry?.windowId ?? null},
            targetArgs   = {ownerWindowId: me.windowId, route: targetRoute, targetWindowId: me.vesselConversionTargetWindowId ?? null},
            sourcePos    = WindowManager.resolveNativeRoute({...sourceArgs, capability: 'position'}),
            sourceResize = WindowManager.resolveNativeRoute({...sourceArgs, capability: 'resize'}),
            targetFocus  = WindowManager.resolveNativeRoute({...targetArgs, capability: 'focus'});

        me.lastVesselParkReceipt = {
            // One definition of the authority block, shared with the other consumer and with the
            // default transaction. A hand-written copy here is how the two receipts drifted: nine
            // of ten keys agreed and the tenth was silently absent from the sibling.
            authority  : NativeVesselTransaction.describeAuthority({sourcePos, sourceResize, targetFocus}, entry?.windowName === windowName),
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
            !sourcePos.granted || (needsResize && !sourceResize.granted) ||
            (!targetIsMain && !targetFocus.granted) ||
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
     * Re-shows the parked vessel through the engine's default transaction. This host declares a
     * geometry restore, so the default gives the extent back before the position and compensates
     * both when the move is refused; the park ledger entry is consumed here because it is this
     * host's bookkeeping, not the transaction's.
     * @param {Object} vessel
     * @returns {Promise<Boolean>}
     * @protected
     */
    async reshowTearOutVessel(vessel) {
        const admitted = await this.vesselTransaction.reshowVessel(vessel);

        admitted && delete this.tearOutParkGeometries[vessel.itemId];

        return admitted
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
     * @summary Admits a full popup Workspace and transfers its pane through one Group transaction.
     * @param {Object} document Pure reducer result; source truth is re-read at the queue head.
     * @param {Object} operation
     * @param {Object} vessel Reserved semantic slot and native generation.
     * @returns {Promise<Boolean>}
     */
    async onTearOutDocumentChange(document, operation, vessel) {
        const me = this, itemId = operation?.itemId;
        if (operation?.operation !== 'detachItem') {
            await me.onDockZoneDocumentChange(document, operation);
            return true
        }
        const workspaceId = vessel.workspaceKey ?? Workspace.vesselWorkspaceId(itemId);
        const existing    = me.getPopupState(workspaceId);
        let   state       = existing;
        try {
            if (!me.tearOutHandlers.capturePane(itemId)) throw new Error(`No live pane for ${itemId}`);
            if (!state) {
                const host = Neo.create(PopupWorkspace, {
                    dockModel    : me.createVesselWorkspaceDocument(itemId), flex: 1,
                    rootWorkspace: me, topologyGroupId: me.topologyGroupId,
                    workspaceKey : workspaceId, workspaceSet: me.workspaceSet,
                    stateProvider: {module: StateProvider, parent: me.stateProvider}
                });
                state = {host, itemId, workspaceId, committed: false, disconnected: true,
                    get document() { return host.dockModel },
                    set document(value) { host.dockModel = value }};
                host.runtimeState = state
            }
            await me.workspaceSet.transfer({
                operation        : 'transferItem', itemId, sourceWorkspaceId: Workspace.MAIN_WORKSPACE_ID,
                targetWorkspaceId: workspaceId,
                target           : {operation: 'addTab', tabsNodeId: Workspace.vesselTabsNodeId(itemId)}
            }, {provenance: {origin: 'human'}});
            state.committed = true;
            me.tearOutHandlers.adoptPane(itemId, vessel, me.nativeWindows?.getConnection(me.id, itemId) || null);
            const connection = me.nativeWindows?.getOwner(me.id, itemId);
            if (connection?.windowId) await me.registerVesselWorkspaceTarget({
                app: Neo.apps[connection.windowId], itemId, windowId: connection.windowId
            });
            return true
        } catch (error) {
            const committed = state?.committed === true;
            me.lastCrossWindowTransfer = {applied: committed, errors: [error?.message ?? String(error)]};
            if (!existing && !committed) {
                try {
                    me.workspaceSet.unregister(workspaceId);
                    state?.host?.destroy()
                } catch (cleanupError) {
                    me.lastCrossWindowTransfer.errors.push(`cleanup: ${cleanupError?.message ?? String(cleanupError)}`)
                }
            }
            if (committed) return true;
            throw error
        }
    }

    /**
     * @summary Resolves a retained pane after it leaves the root's projection.
     * @param {String} itemId
     * @returns {Neo.component.Base|null}
     */
    resolveLivePane(itemId) {
        const pane = this.paneCache[itemId];
        return pane && !pane.isDestroyed ? pane : super.resolveLivePane(itemId)
    }

    /**
     * @summary Records pane ownership and mounts its admitted Workspace when already bound.
     * @param {String} itemId
     * @param {Object|null} entry
     * @param {Object|null} [connection=null] The connection the engine adopted, when the vessel had already bound.
     * @param {Boolean} [isMerge=false]
     * @protected
     */
    afterNativeOwnerChange(itemId, entry, connection=null, isMerge=false) {
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
     * @summary Semantic recovery that never resurrects a node.
     *
     * The stored `{tabsNodeId, index}` pair captured at the detach terminal is the placement truth,
     * and recovery is SEMANTIC, never geometric: a stored home that left the tree falls back to the
     * first surviving tabs node and appends. The engine's default answers with `restoreTab`, which
     * re-mints the remembered parent/slot — the exact position back, but a node the user watched
     * collapse comes back with it. This app's contract is the other one.
     * @param {Object} document
     * @param {String} itemId
     * @param {Object|null} placement
     * @returns {Object|null}
     * @protected
     */
    resolveDockReturnDescriptor(document, itemId, placement) {
        return Operations.appendingReturnDescriptor(document, itemId, placement)
    }

    /**
     * @summary Reparents a live pane, leaving admitted Workspace projection to its owner.
     * @param {Neo.component.Base|null} pane
     * @param {Object} target Native window binding.
     * @param {String} itemId
     * @returns {Boolean}
     * @protected
     */
    reparentDockPane(pane, target={}, itemId) {
        let me         = this,
            {windowId} = target;

        // Answered by IDENTITY, not by the component the engine resolved: a pane the connect-first
        // order already staged into the vessel stays where it is, and the exact-slot placeholder
        // retires with the promotion instead of the pane moving twice.
        if (me.tearOutEmbodiment.isStaged(itemId)) {
            return me.tearOutEmbodiment.promote({itemId, windowId}) !== false
        }

        if (me.getPopupState(Workspace.vesselWorkspaceId(itemId))?.host) return true;
        return super.reparentDockPane(me.paneCache[itemId] || pane, target, itemId)
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

        if (me.nativeWindows?.getOwner(me.id, itemId)?.windowId === windowId) {
            await me.registerVesselWorkspaceTarget({app, itemId, windowId});
            return
        }

        const staged = await me.tearOutEmbodiment.stage({itemId, windowId});

        // A re-entry, cancel or physical death may retire the vessel while the cross-window render
        // transaction is still painting; the connection this stage began for is then gone, and a dead
        // generation must never publish itself. A terminal landing meanwhile promoted the stage.
        if (
            staged && (me.isDestroyed || (
                me.nativeWindows?.getConnection(me.id, itemId) !== connection && me.nativeWindows?.getOwner(me.id, itemId)?.windowId !== windowId
            ))
        ) {
            me.tearOutEmbodiment.restore({itemId, windowId})
        }
    }

    /**
     * @summary Unbinds a full Workspace without discarding its document, panes or Group history.
     * @param {Object} data Group and retiring window generation.
     * @returns {Promise<void>}
     */
    async onNativeWindowRelease(data) {
        const me = this, {windowId} = data;
        if (me.isDestroyed || data.groupId !== me.topologyGroupId) return;
        Neo.manager.DragCoordinator?.clearNativeWindowDropCandidate(windowId, {restoreSource: false});
        Neo.manager.DragCoordinator?.endNativeGesture(windowId);
        me.vesselProxyEmbodiment.restoreByWindow(windowId);
        const state = me.getPopupState(data.workspaceKey);
        if (state?.host) {
            state.disconnected = true;
            state.host.parent?.remove(state.host, false, true);
            state.host.windowId = null;
            state.windowId = state.app = state.renderTarget = null;
            if (me.lastCrossWindowTransfer?.sourceWorkspaceId === data.workspaceKey) {
                me.lastCrossWindowTransfer.topologyExited = true
            }
            return false
        }
        await super.onNativeWindowRelease(data)
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

    /** @summary Tears down the workspace's view tree and owned docking resources. @param {...*} args */
    destroy(...args) {
        let me = this;


        if (me.#feedIntervalId !== null) {
            clearInterval(me.#feedIntervalId);
            me.#feedIntervalId = null
        }

        me.crossWindowParticipations.forEach(participation => participation?.destroy());
        me.crossWindowParticipations.clear();
        me.getPopupStates().forEach(state => state.host?.destroy());
        me.dockService?.destroy();
        me.perspectiveStore?.destroy();
        me.workspaceSet?.destroy();
        me.topologyLibrary?.destroy();
        me.dragAffordances?.destroy();
        me.vesselParkHandlers?.destroy();
        me.nativeVesselParkHandlers?.destroy();
        me.vesselProxyEmbodiment?.destroy();
        me.tearOutEmbodiment?.destroy();

        Object.values(me.paneCache).forEach(pane => {
            pane?.isDestroyed || pane?.destroy?.()
        });
        me.paneCache = {};

        super.destroy(...args)
    }
}

export default Neo.setupClass(Workspace);
