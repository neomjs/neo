import Component                   from '../../component/Base.mjs';
import Container                   from '../../container/Base.mjs';
import NeoArray                    from '../../util/Array.mjs';
import {isDescriptor}              from '../../core/ConfigSymbols.mjs';
import LayoutAdapter               from './projection/LayoutAdapter.mjs';
import MotionSignal                from './projection/MotionSignal.mjs';
import PreviewProducer             from './interaction/PreviewProducer.mjs';
import Reconciler                  from './projection/Reconciler.mjs';
import {createDockTearOutHandlers} from './window/TearOut.mjs';
import Document                    from './model/Document.mjs';
import Operations                  from './model/Operations.mjs';
import {previewToOperation}        from './model/PreviewContract.mjs';

/**
 * @summary The engine-owned dock workspace host: the reducer-container that owns one committed
 * `dockZone.v1` document and turns it into a live projection through the single sanctioned
 * mutation path.
 *
 * Every docking workspace needs the same loop: a pure reducer over the committed document
 * ({@link #applyDockZoneOperation}), a view-sync that stores the next document and re-projects it
 * ({@link #onDockZoneDocumentChange}), a projection of the document into ordinary container configs
 * ({@link #projectDockModel} over {@link Neo.dashboard.dock.projection.LayoutAdapter}), and a reconciliation
 * that hands the surviving live panes into the next projection instead of recreating them
 * ({@link #refreshDockWorkspace} over {@link Neo.dashboard.dock.projection.Reconciler}, bracketed by
 * the FLIP motion signal). Before this class, each consumer wrote that loop by hand; this class owns
 * it once, and a consumer contributes only what is genuinely its own through template hooks:
 *
 * - {@link #resolvePane} — which live component or config renders a catalog item (the one hook
 *   every consumer overrides);
 * - {@link #resolveRevealPane} — the same resolution for auto-hide reveal overlays;
 * - {@link #getPreservedItemIds} — consumer-held panes that must survive a projection they are
 *   absent from (the engine adds its own tear-out handles independently);
 * - {@link #beforeRefreshDockWorkspace} — app chrome that syncs on every re-projection;
 * - {@link #getDockProjectionOptions} — extra adapter options: the hover-reveal opt-in, a
 *   drag-affordance layer's cross-zone seams, tear-out policy;
 * - {@link #getRefreshOptions} — the reconciler's geometry-only / retained-topology fast paths.
 *
 * With {@link #enableDockTearOutLifecycle}, the workspace also composes
 * {@link Neo.dashboard.dock.window.TearOut} and owns the cross-window half of the same truth: exact
 * gesture admission, pre-terminal versus committed connection state, placement capture before
 * `detachItem`, same-instance semantic return after physical disconnect, and exact-once teardown.
 * Host/flow/admission-token checks run before the optional {@link #admitTearOutConnection} policy
 * hook; applications contribute only platform vessel open/close, live-pane resolution, optional
 * grant policy, lifecycle observers, and continuations for window routes unrelated to tear-out.
 * The default is inert, so existing Workstation/Demo hosts keep their application lifecycle until
 * their own explicit migration leaves.
 *
 * The class satisfies the dock-holder contract Neural Link tooling resolves against
 * (`getDockZoneDocument()` / `applyDockZoneOperation()` / `onDockZoneDocumentChange()`, see
 * `src/ai/client/DockService.mjs`) and the `owner` duck-type of
 * {@link Neo.dashboard.dock.interaction.DragAffordances} (`dockModel` plus the reducer and the view-sync), so an
 * agent, a splitter, a rail, a drag gesture and a tour runner all commit through one path.
 *
 * Two invariants every method here protects: the committed document advances ONLY inside
 * {@link #onDockZoneDocumentChange}, and every re-projection is ONE atomic ownership transaction —
 * commits schedule off the SETTLED tail of {@link #refreshPromise}, so a later commit can never
 * start a second staged shell before the first settled, and a FAILED transaction stays observable
 * on its own {@link #refreshPromise} snapshot without suppressing any later one. A configured
 * {@link #dockHostReference} that resolves to no live host rejects the refresh loudly: the
 * committed truth already advanced, and settling silently would freeze stale chrome over it.
 *
 * The projection mounts into the dock host — this container itself by default, or a dedicated child
 * named by {@link #dockHostReference} when a consumer keeps persistent overlay siblings (a preview
 * renderer, drop indicators) beside the projected shell. {@link #dockShellIndex} names the shell's
 * index inside that host, so app chrome may precede it.
 *
 * Theme scope — two classes, two jobs: the projected tree carries `.neo-dashboard` on every zone
 * (the adapter stamps it), and that projected class is the DEFAULT CARRIER — the engine re-declares
 * its `--dock-*` defaults there so the affordance floor reaches a projected zone in a host that has
 * adopted nothing; a value set on an outer scope is shadowed by the nested projected one. This
 * class's own `neo-dock-workspace` baseCls appears exactly once per workspace and is the OVERRIDE
 * ANCHOR a consumer's token values scope to. The defaults never move onto the root. The dock motion
 * and token contract lives in the `Neo.dashboard.Container` theme file, which this class declares
 * as an additional theme dependency; a subclass that declares its own `additionalThemeFiles`
 * replaces the list and must keep that entry.
 *
 * @class Neo.dashboard.dock.Workspace
 * @extends Neo.container.Base
 * @see Neo.dashboard.dock.projection.LayoutAdapter
 * @see Neo.dashboard.dock.projection.Reconciler
 * @see Neo.dashboard.dock.model.Document
 * @see learn/agentos/DockZoneModel.md
 * @see learn/guides/uibuildingblocks/DockLayouts.md
 */
class Workspace extends Container {
    static config = {
        /**
         * @member {String} className='Neo.dashboard.dock.Workspace'
         * @protected
         */
        className: 'Neo.dashboard.dock.Workspace',
        /**
         * @member {String} ntype='dock-workspace'
         * @protected
         */
        ntype: 'dock-workspace',
        /**
         * The dock motion/token contract (`--dock-transition-*`, reveal keyframes, splitter
         * cursors) lives in the `Neo.dashboard.Container` theme file — the projected dock tree is
         * plain containers, so per-class loading never fetches it; the workspace declares the
         * dependency. A subclass declaring its own list must repeat this entry.
         * @member {String[]} additionalThemeFiles=['Neo.dashboard.Container']
         */
        additionalThemeFiles: ['Neo.dashboard.Container'],
        /**
         * @member {String[]} baseCls=['neo-dock-workspace']
         */
        baseCls: ['neo-dock-workspace'],
        /**
         * Reference name of the child container the projection mounts into, for consumers that
         * keep persistent overlay siblings beside the projected shell. `null` mounts the
         * projection into this container itself.
         * @member {String|null} dockHostReference=null
         */
        dockHostReference: null,
        /**
         * Config merged into every projected shell (e.g. `{flex: 1}` when the shell shares a
         * vbox with app chrome). `null` projects the adapter output unchanged.
         * @member {Object|null} dockProjectionConfig=null
         */
        dockProjectionConfig: null,
        /**
         * Projects one persistent close action into each Dock tab header. Enabled by default;
         * explicit `false` retains the compatibility escape.
         * @member {Boolean} enableDockCloseAction=true
         */
        enableDockCloseAction: true,
        /**
         * Projects one engine-owned lock toggle into each Dock tab header. The committed
         * `locked` item field is the hard boundary: close, detach and source movement fail
         * closed in the reducer. Workspace presentation mirrors that truth by making the pane
         * inert, hiding close, and suppressing the tab drag source while preserving exact prior
         * inert and drag-token ownership for unlock. Disabled by default.
         *
         * The content half is delegable, exactly like reload: a pane implementing
         * `dockLock(locked: Boolean): void` owns what locked means for its content (a form
         * disables its fields, a grid turns cell editing off, a read-only view keeps scrolling
         * and selecting) and receives `true` on lock and `false` on unlock, once per transition,
         * on the in-flow card and on the revealed rail pane alike; the engine then writes no
         * `inert` at all. The probe is a pure `typeof` on the live card, never a resolver call.
         * The structural half — the reducer's refusals, the hidden close action, the suppressed
         * drag source, the `neo-dock-pane-locked` frame cue — is never delegated.
         * @member {Boolean} enableDockLockAction=false
         */
        enableDockLockAction: false,
        /**
         * Icon of the projected lock action while the active item is unlocked.
         * @member {String} dockLockIconCls='fa fa-lock'
         */
        dockLockIconCls: 'fa fa-lock',
        /**
         * Icon of the projected lock action while the active item is locked.
         * @member {String} dockUnlockIconCls='fa fa-lock-open'
         */
        dockUnlockIconCls: 'fa fa-lock-open',
        /**
         * Projects one persistent pin action into each Dock tab header — the entry half of the
         * collapse-to-rail round-trip (docking design record §2.7). Pressing it on an edge-owned pane
         * collapses that pane to its owning edge rail; the way back is the rail's existing reveal
         * overlay and its pin control. Enabled by default; explicit `false` removes the action.
         * @member {Boolean} enableDockPinAction=true
         */
        enableDockPinAction: true,
        /**
         * Projects one engine-owned, delegation-only reload action into each Dock tab header —
         * runtime only: no operation is committed and the document never changes. A pane
         * implementing `dockReload(): void | Promise<*>` owns what reload means (its stores,
         * caches, re-render — the author's decision, opted into by implementing the method); a
         * pane without the contract simply hides the action, decided by a pure `typeof` probe on
         * the live card, never a resolver call. One invocation per item may be in flight (the
         * action disables for the window), and every completion — sync throw, async rejection,
         * async success — settles exactly once through the `dockReloadSettled` event
         * (`{dockNodeId, itemId, errors}`); a failing `dockReload()` keeps the pane, always.
         * Destroy-and-recreate is deliberately NOT here: resolved panes are moved, never
         * destroyed (docking design record §2.6) — the recreate capability lives with the
         * two-phase transaction that can honestly promise rollback. Enabled by default; explicit
         * `false` removes the action.
         * @member {Boolean} enableDockReloadAction=true
         */
        enableDockReloadAction: true,
        /**
         * Projects one engine-owned maximize toggle into each Dock tab header — presentation
         * only: the committed document, perspectives and topology diffs never observe maximize
         * state. Enabled by default; explicit `false` removes the action.
         *
         * Input contract while a node is maximized: in-strip tab reordering stays live;
         * cross-zone drag sources and tear-out affordances of the maximized node are suppressed
         * (every drop target sits under the maximized plane); engaging maximize closes an
         * in-progress reveal overlay; `Escape` restores and returns focus to the restored
         * node's active header button. A committed dock operation that reaches beyond the
         * maximized node clears maximize BEFORE applying, terminally for the re-projection rule
         * on {@link #maximizedNodeId}; operations confined to the node itself (activating one
         * of its tabs; closing, reordering or adding an item within it) defer to that rule
         * instead, which re-applies onto the surviving node and clears when the node collapsed.
         * @member {Boolean} enableDockMaximizeAction=true
         */
        enableDockMaximizeAction: true,
        /**
         * @summary Projects a `pop-out` header action that detaches the active pane into its own
         * vessel window, through the drag tear-out's own commit path.
         *
         * The stable action projects by default, while availability derives from the one effective
         * {@link #tearOutHandlers} bundle. A workspace with no handler keeps the action hidden; a
         * host-owned handler is sufficient and must not force the base tear-out lifecycle beside it.
         *
         * **Focus and announcement stay host-owned, deliberately.** The pane moves; this workspace
         * makes no promise about where focus lands or what a screen reader hears. Both belong to the
         * host: it opened the vessel through its own admission seam, so only it can honestly promise
         * focus into that window, and an announcement without a host-owned `aria-live` region is
         * theater. A host wanting focus-follow implements it at the seam it already owns. If
         * focus-on-pop-out becomes family policy it arrives as its own leaf with the full a11y
         * story, not smuggled in here.
         * @member {Boolean} enableDockPopOutAction=true
         */
        enableDockPopOutAction: true,
        /**
         * Icon of the projected pop-out action.
         * @member {String} dockPopOutIconCls='far fa-window-restore'
         */
        dockPopOutIconCls: 'far fa-window-restore',
        /**
         * Icon of the projected maximize action while its node is not maximized.
         * @member {String} dockMaximizeIconCls='far fa-window-maximize'
         */
        dockMaximizeIconCls: 'far fa-window-maximize',
        /**
         * Icon of the projected maximize action while its node is maximized — the restore half
         * of the toggle, the {@link Neo.dialog.Base} icon-pair precedent.
         * @member {String} dockMinimizeIconCls='far fa-window-minimize'
         */
        dockMinimizeIconCls: 'far fa-window-minimize',
        /**
         * Tooltip texts of the engine-owned header actions and the rail's reveal pin, keyed by
         * action state: `lock` / `unlock`, `reload`, `unpin`, `popOut`, `maximize` / `restore`,
         * `close`, `revealPin`. A consumer restates wording or language per key: the map deep-merges
         * over these defaults, and a key set to `null` leaves that action without a tooltip — for a
         * toggle, in the state that key names: a `null` `unlock` clears the tooltip while the pane is
         * locked and `lock` restores it on unlock. Toggles keep text, icon and accessible name
         * coherent on the retained action instance ({@link #syncDockLockAction},
         * {@link #syncDockMaximizeActionPresentation}, both through {@link #syncDockActionTooltip}).
         * @member {Object} dockActionTooltips_
         * @reactive
         */
        dockActionTooltips_: {
            [isDescriptor]: true,
            clone         : 'deep',
            merge         : 'deep',
            value         : {
                close    : 'Close',
                lock     : 'Lock pane',
                maximize : 'Maximize',
                popOut   : 'Pop out into a window',
                reload   : 'Reload pane',
                restore  : 'Restore',
                revealPin: 'Pin back into the layout',
                unlock   : 'Unlock pane',
                unpin    : 'Unpin into the rail'
            }
        },
        /**
         * Enables the engine-owned dock tear-out admission/document/window lifecycle. Disabled
         * by default so ordinary workspaces and hosts carrying their own legacy lifecycle remain
         * byte-behaviorally unchanged until their migration leaf.
         * @member {Boolean} enableDockTearOutLifecycle=false
         */
        enableDockTearOutLifecycle: false,
        /**
         * Maximum time between an opened gesture vessel and its admitted worker connection.
         * @member {Number} tearOutConnectWindowMs=20000
         */
        tearOutConnectWindowMs: 20000,
        /**
         * Index of the projected shell inside the dock host — `1` when one toolbar precedes it.
         * @member {Number} dockShellIndex=0
         */
        dockShellIndex: 0,
        /**
         * Prefix of the per-item marker class the FLIP addon correlates across a re-projection.
         * {@link #resolveProjectedPane} stamps `<prefix><encoded item id>` onto every plain pane
         * config, so consumers never carry the marker by hand.
         * @member {String} flipMarkerPrefix='dock-flip-item-'
         */
        flipMarkerPrefix: 'dock-flip-item-',
        /**
         * `Escape` restores an active maximize. The binding is static, the effect is not: the
         * handler no-ops unless {@link #maximizedNodeId} is set, so every other Escape consumer
         * (dialogs, reveal overlays, transfer cycles) keeps its ordinary meaning.
         * @member {Object} keys={Escape:'onDockMaximizeEscape'}
         */
        keys: {
            Escape: 'onDockMaximizeEscape'
        },
        /**
         * Prefix of the per-node marker class the maximize FLIP correlates. Stamped lazily onto
         * every live tabs node right before a toggle captures its first rects — the projection
         * itself stays byte-identical while nothing has ever been maximized.
         * @member {String} maximizeMarkerPrefix='dock-maximize-node-'
         */
        maximizeMarkerPrefix: 'dock-maximize-node-',
        /**
         * The workspace-transient maximize target — the projected tabs node currently painting
         * the measured workspace rect. Deliberately NOT part of the committed dock document:
         * maximize is presentation, so perspectives, persistence and topology diffs never see
         * it. Deterministic across re-projection: the presentation is re-applied iff this id
         * still resolves to a projected tabs node, and cleared otherwise — never a third
         * outcome. Committed operations clear it before they apply, terminally.
         * @member {String|null} maximizedNodeId_=null
         * @reactive
         */
        maximizedNodeId_: null,
        /**
         * URL-search parameter whose value identifies this workspace as a tear-out vessel's
         * owner. The engine default is product-neutral; legacy consumers may select their
         * existing parameter name without teaching the engine that name.
         * @member {String} tearOutHostParam='hostId'
         */
        tearOutHostParam: 'hostId'
    }

    /**
     * The live committed dock-zone document — the single source of truth the view projects from.
     * Advanced exclusively by {@link #onDockZoneDocumentChange}; readable through the holder
     * contract's {@link #getDockZoneDocument} before any operation has run.
     * @member {Object|null} dockModel=null
     */
    dockModel = null

    /**
     * The placement producer behind the in-window cross-zone drop path. Created here, destroyed
     * here; a consumer composing {@link Neo.dashboard.dock.interaction.DragAffordances} routes its drop seam
     * through that controller's own producer instead (see {@link #getDockProjectionOptions}).
     * @member {Neo.dashboard.dock.interaction.PreviewProducer|null} dockPreviewProducer=null
     * @protected
     */
    dockPreviewProducer = null

    /**
     * The in-flight deferred re-projection, tracked as an awaitable: every committed operation
     * defers its view-sync one tick, so any consumer that must observe a SETTLED surface — a tour
     * replay, a reveal cue, a teardown-sensitive probe — awaits this promise instead of racing that
     * deferral. Commits chain with their document and one-use descriptor snapshots, so staged
     * transactions cannot overlap or cross-correlate. Each commit stores the promise of ITS OWN
     * transaction here: a rejection belongs to whoever awaits the snapshot taken at that commit,
     * and the next commit schedules off the settled tail, never off the rejection.
     * @member {Promise|null} refreshPromise=null
     * @protected
     */
    refreshPromise = null

    /**
     * Gesture admission tokens keyed by item while the platform vessel is opening or waiting to
     * connect. The token is engine-owned gesture identity, distinct from optional product grants.
     * @member {Map<String,Object>} tearOutAdmissions=new Map()
     * @protected
     */
    tearOutAdmissions = new Map()

    /**
     * Monotonic engine generation for opened-vessel admission records.
     * @member {Number} tearOutAdmissionGeneration=0
     * @protected
     */
    tearOutAdmissionGeneration = 0

    /**
     * Tear-out windows that connected before the detach terminal committed.
     * @member {Object} tearOutConnects={}
     * @protected
     */
    tearOutConnects = {}

    /**
     * The four gesture callbacks produced by {@link Neo.dashboard.dock.window.TearOut} for this workspace.
     * @member {Object|null} tearOutHandlers=null
     * @protected
     */
    tearOutHandlers = null

    /**
     * Post-commit vessel ownership records keyed by dock item id.
     * @member {Object} tearOutPanes={}
     * @protected
     */
    tearOutPanes = {}

    /**
     * Live pane handles captured before detach re-projection, owned by the generic lifecycle.
     * @member {Object} tearOutPaneHandles={}
     * @protected
     */
    tearOutPaneHandles = {}

    /**
     * Exact semantic return positions captured before detach removes an item from its tabs node.
     * @member {Object} tearOutPlacements={}
     * @protected
     */
    tearOutPlacements = {}

    /**
     * Platform vessels whose close hook explicitly refused or threw. Retained by exact item/window
     * identity so exceptional cleanup never turns a live OS resource into untracked state; the
     * next acquisition retries these before opening another vessel.
     * @member {Map<String,Object>} tearOutRetirements=new Map()
     * @protected
     */
    tearOutRetirements = new Map()

    /**
     * One-refresh same-instance return slots. {@link #resolveProjectedPane} consumes each slot
     * before asking the app resolver, so a dead vessel can never strand its live pane.
     * @member {Object} returningTearOutPanes={}
     * @protected
     */
    returningTearOutPanes = {}

    /**
     * One-shot motion intent for the next {@link #maximizedNodeId} transition: 'animate' (the
     * gesture default) or 'instant' (operation-driven clears, fail-safes, re-projection
     * continuity). Consumed and reset by `afterSetMaximizedNodeId`.
     * @member {String} dockMaximizeMotion='animate'
     * @protected
     */
    dockMaximizeMotion = 'animate'

    /**
     * True while the workspace root is registered with the main-thread ResizeObserver addon for
     * maximize re-measurement — the observation exists exactly as long as a presentation does.
     * @member {Boolean} dockMaximizeResizeObserved=false
     * @protected
     */
    dockMaximizeResizeObserved = false

    /**
     * True once the maximize resize dom listener is wired; the listener itself is a cheap no-op
     * while nothing is maximized.
     * @member {Boolean} dockMaximizeResizeWired=false
     * @protected
     */
    dockMaximizeResizeWired = false

    /**
     * Exact pre-lock root-inert snapshots keyed by the live pane instance:
     * `{owned:Boolean, value:*}`. A WeakMap cannot prolong a retired pane's lifetime.
     * @member {WeakMap<Neo.component.Base,Object>} dockLockPaneState=new WeakMap()
     * @protected
     */
    dockLockPaneState = new WeakMap()

    /**
     * Whether each live tab button owned the SortZone's `neo-draggable` token before lock
     * suppressed it. Unlock restores that exact ownership instead of globally arming drag.
     * @member {WeakMap<Neo.component.Base,Boolean>} dockLockDragState=new WeakMap()
     * @protected
     */
    dockLockDragState = new WeakMap()

    /**
     * Restoration snapshot while a maximize presentation is applied:
     * `{nodeId, zone: {allowOverdrag, boundaryContainerId, enableProxyToPopup}|null, zoneId}`.
     * Doubles as the presentation-applied flag the clear path consumes exactly once.
     * @member {Object|null} dockMaximizeRestore=null
     * @protected
     */
    dockMaximizeRestore = null

    /**
     * Item ids with a `dockReload()` invocation in flight — the single-flight guard: a second
     * activation during the window neither invokes nor settles.
     * @member {Set<String>} dockReloadInFlight=new Set()
     * @protected
     */
    dockReloadInFlight = new Set()

    /**
     * Item ids with a recreate transaction in flight — the same single-flight contract the reload
     * guard above uses, for the same reason: one settlement per invocation.
     * @member {Set<String>} dockRecreateInFlight=new Set()
     * @protected
     */
    dockRecreateInFlight = new Set()

    /**
     * The in-flight maximizedNodeId transition as an awaitable — every consumer that must
     * observe settled maximize presentation (the refresh chain, the continuity sync) awaits
     * this instead of racing the async clear/apply pair.
     * @member {Promise|null} dockMaximizeTransition=null
     * @protected
     */
    dockMaximizeTransition = null

    /**
     * The in-flight maximize FLIP window (a settled-safe promise). Opposite-direction style
     * mutations and resize re-applies serialize on it: a play's end-of-window cleanup restores
     * the inline-style snapshot it captured at invert time, so geometry written INSIDE the
     * window would be silently overwritten by stale values when the window closes.
     * @member {Promise|null} dockMaximizePlay=null
     * @protected
     */
    dockMaximizePlay = null

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        if (this.enableDockCloseAction) {
            // Closing a node's last item prunes its empty TabContainer. The surviving workspace
            // root is therefore the semantic focus fallback and must accept programmatic focus.
            this.vdom.tabIndex = -1
        }

        this.dockPreviewProducer = Neo.create(PreviewProducer)

        if (this.enableDockTearOutLifecycle) {
            this.tearOutHandlers = createDockTearOutHandlers({
                applyOperation  : descriptor => this.applyTearOutOperation(descriptor),
                closeVessel     : vessel => this.retireTearOutVessel(vessel),
                onDocumentChange: (document, operation, vessel) => this.onTearOutDocumentChange(document, operation, vessel),
                openVessel      : request => this.acquireTearOutVessel(request)
            });

            Neo.currentWorker.on({
                connect   : this.onWindowConnect,
                disconnect: this.onWindowDisconnect,
                scope     : this
            })
        }

        // Cross-window hit testing reads manager.Window as its one geometry authority, and the
        // manager only learns what the Main realm publishes. The host's own render target publishes
        // live extents from construction — the same stream every admitted vessel opens on connect —
        // so a moved or resized main window never claims with a stale frame. Not gated on the
        // engine lifecycle flag: a host may run its own admission (the Workstation does) and still
        // dock across windows; the app's opt-in is loading the `WindowPosition` addon at all.
        this.observeWindowGeometry(this.windowId)
    }

    /**
     * The pure reducer of the holder contract: applies one semantic operation descriptor against
     * the live committed document and returns `model.Operations`' fail-closed `{document, errors}`
     * result. Never mutates {@link #dockModel} — the view-sync {@link #onDockZoneDocumentChange}
     * is the only writer, called by the committing surface on success.
     * @param {Object} descriptor The semantic operation descriptor.
     * @returns {{document: Object, errors: String[]}}
     */
    applyDockZoneOperation(descriptor) {
        return Operations.applyOperation(this.dockModel, descriptor)
    }

    /**
     * @summary Opens one platform vessel under the gesture admission token the engine owns.
     * @param {Object} request
     * @param {Number} request.admissionToken
     * @param {String} request.itemId
     * @returns {Promise<Object|null>}
     * @protected
     */
    async acquireTearOutVessel(request={}) {
        let me                       = this,
            {admissionToken, itemId} = request,
            admission, vessel;

        if (typeof itemId !== 'string' || !itemId) {
            return null
        }

        if (!await me.retryTearOutRetirements(itemId)) return null;

        if (!Number.isFinite(admissionToken)) {
            admissionToken = me.tearOutAdmissionGeneration + 1;
            request = {...request, admissionToken}
        }

        admission = {
            connected         : false,
            connectingWindowId: null,
            generation        : ++me.tearOutAdmissionGeneration,
            itemId,
            sortZone          : request.sortZone || null,
            timerId           : null,
            token             : admissionToken,
            windowId          : null,
            windowName        : null
        };
        me.tearOutAdmissions.set(itemId, admission);

        // Captured while the workspace is still alive, for the destroyed branch below — see the
        // comment there for why reading the hook after the await is not the same thing.
        const closeVessel = me.closeTearOutVessel.bind(me);

        try {
            vessel = await me.openTearOutVessel(request)
        } catch (error) {
            vessel = null
        }

        if (!vessel) {
            me.tearOutAdmissions.get(itemId) === admission && me.clearTearOutAdmission(itemId, admission);
            return null
        }

        // `destroy()` can land inside the await above, and this is the one gap where teardown cannot
        // clean up after itself: `retireTearOutState` sweeps vessels by `windowName`, and a pending
        // admission has none yet — the host is still deciding. So the sweep skips this record, then
        // the host answers with a REAL OS window that no map still remembers. Everything below reads
        // admission state that teardown has already dismantled; reaching it throws, the coordinator's
        // `openVessel` try/catch swallows that as a failed admission, and the window is orphaned with
        // nobody holding its name.
        //
        // Closed through the hook captured ABOVE, not through {@link #retireTearOutVessel} and not
        // through `me.closeTearOutVessel` read here: the retirement bookkeeping lives in the very
        // maps teardown just reset, and `Neo.core.Base#destroy` deletes the instance's own
        // properties — so a consumer hook assigned per instance is already gone by this line, and
        // reading it now would silently fall back to a prototype default that no longer knows about
        // this vessel. The reference captured while the workspace was alive is the one that owns it.
        //
        // Exactly once: this branch runs at most once per admission and then refuses, so no later
        // path can retire the same vessel again. Wrapped because a hook that throws here would
        // surface as an unhandled rejection — the caller discards this promise.
        if (me.isDestroyed) {
            try {
                await closeVessel({...vessel, admissionToken, generation: admission.generation, itemId})
            } catch (error) {}

            return null
        }

        // The engine token is exact. A product hook may not replace the gesture identity it was
        // asked to carry, and a stale async open may never orphan the OS window it already created.
        if (
            me.tearOutAdmissions.get(itemId) !== admission ||
            (Number.isFinite(vessel.admissionToken) && vessel.admissionToken !== admissionToken)
        ) {
            await me.retireTearOutVessel({
                ...vessel,
                admissionToken,
                generation: admission.generation,
                itemId
            });
            return null
        }

        admission.windowName = vessel.windowName || admission.windowName || null;

        const connection = me.tearOutConnects[itemId];

        connection && !connection.windowName && (connection.windowName = admission.windowName);

        if (!admission.connected) {
            admission.timerId = setTimeout(() => {
                me.expireTearOutAdmission(itemId, admission)
            }, me.tearOutConnectWindowMs)
        }

        return {
            ...vessel,
            admissionToken,
            generation: admission.generation
        }
    }

    /**
     * @summary Clears one exact admission record and its connect bound.
     * @param {String} itemId
     * @param {Object|null} [admission=this.tearOutAdmissions.get(itemId)]
     * @protected
     */
    clearTearOutAdmission(itemId, admission=this.tearOutAdmissions.get(itemId)) {
        if (!admission || this.tearOutAdmissions.get(itemId) !== admission) return false;

        admission.timerId && clearTimeout(admission.timerId);
        this.tearOutAdmissions.delete(itemId);

        return true
    }

    /**
     * @summary Expires an opened vessel that never established an admitted worker connection.
     * @param {String} itemId
     * @param {Object} admission
     * @protected
     */
    async expireTearOutAdmission(itemId, admission) {
        let me = this;

        if (admission?.connected) return;
        if (!admission || me.tearOutAdmissions.get(itemId) !== admission) return;

        const entry  = me.tearOutPanes[itemId],
              vessel = {
                  admissionToken: admission.token,
                  generation    : admission.generation,
                  itemId,
                  windowName    : admission.windowName || entry?.windowName
              };

        if (!await me.retireTearOutVessel(vessel)) return;

        me.tearOutHandlers?.onVesselRetired(vessel);
        !entry && admission.sortZone?.endWindowDrag();

        if (entry && !entry.windowId) {
            const pane = me.releaseTearOutPane(itemId);

            delete me.tearOutPanes[itemId];
            await me.reintegrateTearOutItem(itemId, pane);
            me.afterTearOutWindowDisconnect({committed: true, entry, expired: true, itemId, pane})
        }
    }

    /**
     * @summary Returns the stable retained-retirement identity for one platform vessel.
     * @param {Object} vessel
     * @returns {String|null}
     * @protected
     */
    getTearOutRetirementKey(vessel={}) {
        return typeof vessel.itemId === 'string' && vessel.itemId &&
            typeof vessel.windowName === 'string' && vessel.windowName
            ? `${vessel.itemId}:${vessel.windowName}`
            : null
    }

    /**
     * @summary Retries every retained close for an item before another vessel may open.
     * @param {String} itemId
     * @returns {Promise<Boolean>}
     * @protected
     */
    async retryTearOutRetirements(itemId) {
        const retained = [...this.tearOutRetirements.values()]
            .filter(vessel => vessel.itemId === itemId);

        for (const vessel of retained) {
            if (!await this.retireTearOutVessel(vessel)) return false
        }

        return true
    }

    /**
     * @summary Retires one exact vessel through the app-owned platform close hook, retaining
     * refusal/throw authority for retry and clearing only matching admission/connection state.
     * @param {Object} vessel
     * @returns {Promise<Boolean>}
     * @protected
     */
    async retireTearOutVessel(vessel={}) {
        let me  = this,
            key = me.getTearOutRetirementKey(vessel),
            closed;

        key && me.tearOutRetirements.set(key, vessel);

        try {
            closed = await me.closeTearOutVessel(vessel)
        } catch (error) {
            closed = false
        }

        if (closed !== false) {
            key && me.tearOutRetirements.get(key) === vessel && me.tearOutRetirements.delete(key);

            const matches = entry => Boolean(entry &&
                (Number.isFinite(vessel.admissionToken)
                    ? (entry.token ?? entry.admissionToken) === vessel.admissionToken
                    : entry.windowName === vessel.windowName) &&
                (!Number.isFinite(vessel.generation) || entry.generation === vessel.generation)
            );

            const admission = me.tearOutAdmissions.get(vessel.itemId);

            matches(admission) && me.clearTearOutAdmission(vessel.itemId, admission);
            matches(me.tearOutConnects[vessel.itemId]) && delete me.tearOutConnects[vessel.itemId]
        }

        return closed !== false
    }

    /**
     * @summary Opens the tear-out vessel, defaulting to the engine's own connect vocabulary.
     *
     * This hook used to return `null`, so pop-out and drag tear-out were both inert for any host
     * that wrote no window code: the action rendered, the click opened nothing, and no signal said
     * why. The engine was asking each consumer to re-implement a SENDER for a protocol only the
     * engine defines — `onWindowConnect` parses `tearout`, the host param, `vesselFlow` and
     * `vesselAdmission` off the vessel's own URL — from a specification that existed nowhere but
     * one app's source.
     *
     * Nothing in those four parameters is app-specific, so the default constructs them and reopens
     * the host's own document. A consumer that wants a dedicated vessel shell, its own routing or
     * staged theming still overrides, and the override remains authoritative.
     * @param {Object} request
     * @param {Number} request.admissionToken The engine's gesture token; echoed back in the URL.
     * @param {String} request.itemId
     * @param {Object} [request.proxyRect] Where the user released the drag proxy.
     * @returns {Promise<Object|null>} `{admissionToken, windowName}`, or `null` when no vessel opened.
     * @protected
     */
    async openTearOutVessel({admissionToken, itemId, proxyRect}={}) {
        let me         = this,
            {windowId} = me;

        // `useSharedWorkers` is the real capability gate: a vessel window adopts a LIVE pane from
        // this workspace's app worker, which only a shared worker can serve to a second window.
        // Without it there is no vessel to open, and the action should not have rendered — see the
        // `enableDockPopOutAction` guard rather than failing here.
        if (!Neo.config.useSharedWorkers || !itemId) {
            return null
        }

        try {
            let [hostUrl, winData] = await Promise.all([
                    Neo.Main.getByPath({path: 'document.URL', windowId}),
                    Neo.Main.getWindowData({windowId})
                ]),
                url = new URL(hostUrl);

            // The vessel boots the SAME document with the engine's own connect vocabulary — the
            // exact four parameters `onWindowConnect` parses. Nothing about them is app-specific,
            // which is why the engine can construct this and every consumer was re-deriving it.
            // Stripping first matters: a vessel re-torn from a vessel would otherwise inherit the
            // parent's item and admission and connect as the wrong pane.
            ['tearout', 'vesselFlow', 'vesselAdmission', me.tearOutHostParam].forEach(param => url.searchParams.delete(param));

            url.searchParams.set('tearout',         itemId);
            url.searchParams.set(me.tearOutHostParam, me.id);
            url.searchParams.set('vesselFlow',      'tear-out');
            url.searchParams.set('vesselAdmission', String(admissionToken));

            // The proxy rect is the pane the user dragged, so the vessel opens where they let go.
            // Floors keep a degenerate rect (a collapsed rail tab) from opening an unusable window.
            let height     = Math.max(Math.round(proxyRect?.height || 360), 240),
                width      = Math.max(Math.round(proxyRect?.width  || 480), 320),
                left       = Math.round((proxyRect?.x ?? 120) + (winData?.screenLeft || 0)),
                top        = Math.round((proxyRect?.y ?? 120) + ((winData?.outerHeight - winData?.innerHeight) || 0) + (winData?.screenTop || 0)),
                windowName = `neo-dock-tearout-${itemId}`;

            const opened = await Neo.Main.windowOpen({
                nativeCapabilities: {close: true, position: true, resize: true},
                url               : url.href,
                windowFeatures    : `height=${height},left=${left},top=${top},width=${width}`,
                windowId,
                windowName
            });

            if (opened === false) {
                // A blocked popup is the one failure a user can act on, so it must not be silent —
                // the whole class this seam exists to remove.
                console.warn(`Dock tear-out: the platform refused a vessel window for "${itemId}"`, me.id);
                return null
            }

            return {admissionToken, windowName}
        } catch (error) {
            console.warn(`Dock tear-out: opening a vessel for "${itemId}" threw`, me.id, error);
            return null
        }
    }

    /**
     * Hook: closes the consumer's platform-specific tear-out vessel. Explicit false retains retry
     * authority; legacy void success remains admitted by {@link Neo.dashboard.dock.window.TearOut}.
     * @param {Object} vessel
     * @returns {Promise<Boolean|void>|Boolean|void}
     * @protected
     */
    closeTearOutVessel(vessel) {
        return false
    }

    /**
     * @summary Captures exact pre-detach placement before routing through the pure holder reducer.
     * @param {Object} descriptor
     * @returns {{document:Object,errors:String[]}|null}
     * @protected
     */
    applyTearOutOperation(descriptor) {
        let me       = this,
            isDetach = descriptor?.operation === 'detachItem',
            captured = isDetach ? Document.captureItemPlacement(me.dockModel, descriptor.itemId) : null,
            result;

        captured && (me.tearOutPlacements[descriptor.itemId] = captured);

        result = me.applyDockZoneOperation(descriptor);

        isDetach && result?.errors?.length && delete me.tearOutPlacements[descriptor.itemId];

        return result
    }

    /**
     * @summary Commits the admitted detach while preserving and adopting the live pane through
     * explicit consumer hooks.
     * @param {Object} document
     * @param {Object} operation
     * @param {Object} vessel
     * @protected
     */
    onTearOutDocumentChange(document, operation, vessel) {
        let me       = this,
            detached = operation?.operation === 'detachItem',
            itemId   = operation?.itemId;

        detached && me.captureTearOutPane(itemId);
        me.onDockZoneDocumentChange(document, operation, me);
        detached && me.adoptTearOutPane(itemId, vessel)
    }

    /**
     * @summary Captures the app-resolved live pane before detach re-projection can retire it.
     * @param {String} itemId
     * @protected
     */
    captureTearOutPane(itemId) {
        const pane = this.resolveTearOutPane(itemId);

        pane && !pane.isDestroyed && (this.tearOutPaneHandles[itemId] = pane)
    }

    /**
     * @summary Promotes one committed item into post-terminal vessel ownership.
     * @param {String} itemId
     * @param {Object} [vessel={}]
     * @protected
     */
    adoptTearOutPane(itemId, vessel={}) {
        let me         = this,
            connection = me.tearOutConnects[itemId],
            entry      = {
                admissionToken: vessel.admissionToken ?? connection?.admissionToken ?? null,
                generation    : vessel.generation ?? connection?.generation ?? null,
                windowId      : connection?.windowId ?? null,
                windowName    : vessel.windowName || connection?.windowName || `tearout-${itemId}`
            };

        me.tearOutPanes[itemId] = entry;

        if (connection) {
            delete me.tearOutConnects[itemId];
            me.clearTearOutAdmission(itemId);

            if (!me.reparentTearOutPane(itemId, connection)) {
                me.compensateFailedTearOutAdoption(itemId, entry);
                throw new Error(`Workspace ${me.id}: tear-out pane "${itemId}" could not enter its admitted vessel`)
            }
        }

        me.afterTearOutPaneAdopt({connection, entry, itemId, vessel})
    }

    /**
     * Hook: observes the post-commit adoption moment after engine ownership state is written.
     * @param {Object} data
     * @protected
     */
    afterTearOutPaneAdopt(data) {}

    /**
     * @summary Resolves the live pane a vessel should embody, defaulting to the engine's own projection.
     *
     * This was a hook whose default declined, and the decline was not survivable: `captureTearOutPane`
     * stores nothing, so `reparentTearOutPane` finds no pane, returns `false`, and
     * `compensateFailedTearOutAdoption` CLOSES the vessel the consumer was just asked to open. A host
     * that writes no pane resolver therefore gets a pop-out that opens a window and kills it — measured
     * at ~530ms on a real consumer, with no signal anywhere.
     *
     * The engine does not need to be told: `projection.LayoutAdapter` stamps `dockItemId` on every
     * projected pane it emits, so the live component is a lookup away.
     *
     * **The lookup excludes tab header buttons deliberately.** The adapter stamps the SAME identity on
     * the header it builds from the pane's config, so the button carries `dockItemId` structurally too
     * (that is what makes keyboard identity work). An unqualified `down()` returns whichever comes
     * first, and a header button reparented into a vessel is a defect that would look like a success.
     *
     * A consumer that owns its pane lifecycle still overrides this; the override remains authoritative.
     * @param {String} itemId
     * @returns {Neo.component.Base|null}
     * @protected
     */
    resolveTearOutPane(itemId) {
        const held = this.tearOutPaneHandles[itemId];

        // The held handle FIRST, and this is what makes the default actually adopt. The tear-out
        // sequence is capture → re-project → adopt: `captureTearOutPane` stores the pane while it is
        // still in the tree, the detach re-projection then removes it, and adoption runs afterwards.
        // A tree-only lookup therefore succeeds at capture and returns null at the moment it matters,
        // so a hook-free consumer got a vessel window that opened and never received its pane.
        if (held && !held.isDestroyed) {
            return held
        }

        const matches = this.getDockHost()?.down({dockItemId: itemId}, false) || [];

        return matches.find(component => this.isDockTearOutCandidate(component)) || null
    }

    /**
     * @summary Whether one component carrying a dock item's identity is the PANE, not a stand-in.
     *
     * `dockItemId` is stamped on more than the pane, and every stand-in that carries it would
     * reparent into a vessel and report success while the real content stayed behind:
     *
     * - **the tab header button** — `LayoutAdapter` stamps the pane's identity onto the header it
     *   builds from the pane's own config, which is what makes keyboard identity work;
     * - **the projection placeholder** — `LayoutAdapter.createPlaceholder` mints an
     *   `ntype: 'dashboard-panel'` node carrying the same `dockItemId`, so it passes any check that
     *   only excludes the button.
     *
     * The placeholder is the dangerous one, and not as an edge case: a placeholder exists exactly
     * when a pane could not be materialized, and for a host that writes no `resolveFreshPane` that
     * is the ORDINARY state — the same epic's row 2. Tearing one out would open a vessel holding a
     * titled blank and lose the pane, silently.
     * @param {Neo.component.Base} component
     * @returns {Boolean}
     * @protected
     */
    isDockTearOutCandidate(component) {
        const cls = component?.cls || [];

        // Excluded by CATEGORY, not one instance at a time. Every stand-in found so far is a
        // BUTTON — the tab header button and the rail tab both carry the pane's `dockItemId` so a
        // click can resolve the item without id bookkeeping — and naming them individually lost
        // twice in one night. A dock pane is never a button, so the category is safe to refuse.
        return !cls.includes('neo-button')
            && !component?.ntype?.endsWith('button')
            && !cls.includes('neo-dashboard-dock-rail-tab')
            && !cls.includes('neo-dashboard-dock-placeholder')
            && component?.data?.missingComponentRef !== true
    }

    /**
     * Hook: releases one app-owned pane handle for return. The default resolves without retaining
     * a second owner; consumers with handle maps override and delete atomically.
     * @param {String} itemId
     * @returns {Neo.component.Base|null}
     * @protected
     */
    releaseTearOutPane(itemId) {
        const pane = this.tearOutPaneHandles[itemId] || null;

        delete this.tearOutPaneHandles[itemId];

        return pane
    }

    /**
     * @summary Compensates an admitted connection that cannot embody its live pane.
     *
     * Returns the reporting promise. Both callers throw immediately after and ignore it, but the
     * compensation's own completion is otherwise unobservable — and an outcome nothing can await is
     * an outcome nothing can assert.
     * @param {String} itemId
     * @param {Object} entry
     * @returns {Promise<void>}
     * @protected
     */
    compensateFailedTearOutAdoption(itemId, entry={}) {
        let me     = this,
            pane   = me.releaseTearOutPane(itemId),
            vessel = {...entry, itemId};

        delete me.tearOutPanes[itemId];
        delete me.tearOutConnects[itemId];
        Promise.resolve(me.retireTearOutVessel(vessel)).then(closed => {
            closed && me.tearOutHandlers?.onVesselRetired(vessel)
        });
        // Reported HERE because this is the one place both failing paths already meet: the
        // document-change adoption and the window-connect adoption each call it before throwing.
        // Their throws do not reach anyone — `onWindowConnect` is registered as a worker event
        // listener, so an async throw becomes a rejected promise the emitter drops, which is why a
        // vessel could die with nothing but an unattributed unhandled rejection in the console.
        //
        // The report waits for the return to actually resolve, matching the `retireTearOutVessel`
        // line above. Reading a pane HANDLE instead would answer a different question — one that is
        // true in exactly the case worth alarming on, since a failed adoption is precisely when a
        // pane was held and could still fail to come home.
        return Promise.resolve(me.reintegrateTearOutItem(itemId, pane)).then(reintegrated => {
            me.onTearOutAdoptionFailed({entry, itemId, pane, reintegrated})
        })
    }

    /**
     * @summary Reports an adoption that could not embody its pane, on the lifecycle's own channel.
     *
     * The engine opened a window, moved a pane out of the shell, failed to place it, closed the
     * window again and put the pane back — a full round trip the user sees as "pop-out does
     * nothing". That sequence must be attributable, and a throw into an event listener is not:
     * it names no item, reaches no consumer, and cannot be told from an unrelated rejection.
     *
     * Fires `dockTearOutAdoptionFailed` and warns. A consumer that wants to surface it in its own
     * UI listens; one that wants silence overrides. `reintegrated` distinguishes the recoverable
     * case (the pane came home) from the one worth alarming on (it did not).
     * @param {Object} data
     * @param {Object} data.entry The vessel record the adoption was attempting.
     * @param {String} data.itemId
     * @param {Neo.component.Base|null} data.pane The released pane, or null when none was held.
     * @param {Boolean} data.reintegrated
     * @protected
     */
    onTearOutAdoptionFailed(data) {
        const me = this;

        console.warn(
            `Dock tear-out: "${data.itemId}" could not enter its admitted vessel; the vessel was retired and the pane ${data.reintegrated ? 'returned' : 'was NOT returned'}`,
            me.id
        );

        me.fire('dockTearOutAdoptionFailed', {component: me, ...data})
    }

    /**
     * @summary Moves one live pane into a connected vessel without changing document truth.
     * @param {String} itemId
     * @param {Object} target
     * @param {String} target.windowId
     * @returns {Boolean}
     * @protected
     */
    reparentTearOutPane(itemId, target={}) {
        let me         = this,
            {windowId} = target,
            app        = Neo.apps[windowId],
            pane       = me.resolveTearOutPane(itemId),
            oldParent  = pane?.parent;

        if (!app || !pane || pane.isDestroyed) return false;

        try {
            if (oldParent !== app.mainView) {
                oldParent?.remove(pane, false);
                app.mainView.add(pane)
            }
        } catch (error) {
            try {
                !pane.isDestroyed && !pane.parent && oldParent?.add(pane)
            } catch (restoreError) {/* the engine retains the live handle for semantic return */}

            return false
        }

        me.tearOutPanes[itemId] && Object.assign(me.tearOutPanes[itemId], target);

        return true
    }

    /**
     * @summary Opens one render target's live geometry stream into `Neo.manager.Window`.
     *
     * `Neo.main.addon.WindowPosition` publishes `windowPositionChange` only behind two configs it
     * defaults off: `observeMovement` (the config-owned poll — pointer travel alone cannot arm it
     * for a titlebar grabbed from outside page content) and `observeResize` (a fixed-origin resize
     * is a geometry change the poll never sees). Without both, the manager's row for that window
     * stays the connect-time snapshot and every cross-window claim hit-tests a stale frame. The
     * engine host arms both — for its own window at construction, for each admitted vessel before
     * ownership publication — so an adopter that EXTENDS this host never has to know the addon
     * exists. A host COMPOSED from the dock pieces onto a plain container never runs this
     * constructor and must arm the same pair itself; half of it (resize only) leaves the row blind
     * to a titlebar drag, which is the defect the composition example carried. Overridable for a
     * realm that publishes geometry another way.
     * @param {String} windowId The render target whose Main realm publishes
     * @returns {Promise<void>|undefined} The addon's remote settle, or `undefined` off the browser
     * @protected
     */
    observeWindowGeometry(windowId) {
        return Neo.main?.addon?.WindowPosition?.setConfigs({observeMovement: true, observeResize: true, windowId})
    }

    /**
     * Hook: optional product grant policy after engine host/flow/token admission. Fleet's zero-grant
     * consumer inherits true; rich hosts override without exporting a grant format to the engine.
     * @param {Object} context
     * @returns {Boolean|Promise<Boolean>}
     * @protected
     */
    admitTearOutConnection(context) {
        return true
    }

    /**
     * Hook: observes an admitted tear-out connection after engine ownership state is updated.
     * @param {Object} context
     * @protected
     */
    afterTearOutWindowConnect(context) {}

    /**
     * Hook: handles an owner-matching worker connection that is not a gesture tear-out.
     * @param {Object} data
     * @param {Object} context
     * @returns {Promise<void>|void}
     * @protected
     */
    onUnhandledWindowConnect(data, context) {}

    /**
     * Hook: captures app-owned generation state synchronously before the worker URL round trip.
     * @param {Object} data
     * @returns {*}
     * @protected
     */
    captureWindowConnectContext(data) {
        return null
    }

    /**
     * @summary Admits one worker window into pre-terminal or committed tear-out ownership.
     * @param {Object} data
     * @protected
     */
    async onWindowConnect(data) {
        let me              = this,
            {windowId}      = data,
            app             = Neo.apps[windowId],
            consumerContext = me.captureWindowConnectContext(data);

        if (!app || me.isDestroyed) return;

        let url, params;

        try {
            url    = await Neo.Main.getByPath({path: 'document.URL', windowId});
            params = new URL(url).searchParams
        } catch (error) {
            return
        }

        if (me.isDestroyed || params.get(me.tearOutHostParam) !== me.id) return;

        let itemId         = params.get('tearout'),
            flow           = params.get('vesselFlow'),
            admissionToken = Number(params.get('vesselAdmission'));

        if (!itemId) {
            await me.onUnhandledWindowConnect(data, {app, consumerContext, params});
            return
        }
        if (flow === null) return;
        if (flow !== 'tear-out') return;

        const admission = me.tearOutAdmissions.get(itemId);

        if (!Number.isFinite(admissionToken) || !admission || admission.token !== admissionToken) {
            return
        }

        if (admission.connectingWindowId && admission.connectingWindowId !== windowId) return;

        admission.connectingWindowId = windowId;

        const activeVessel = me.tearOutHandlers?.activeVessel,
              context      = {activeVessel, admission, admissionToken, app, consumerContext, data, itemId, params, windowId};

        try {
            if (await me.admitTearOutConnection(context) === false) {
                me.tearOutAdmissions.get(itemId) === admission && (admission.connectingWindowId = null);
                return
            }
        } catch (error) {
            me.tearOutAdmissions.get(itemId) === admission && (admission.connectingWindowId = null);
            throw error
        }

        // Geometry-ready is part of admission: the vessel's Main realm publishes movement AND
        // resize before the connection reaches any ownership branch. A header-action pop-out births
        // the vessel with its titlebar under the pointer, so the native-titlebar drag never crosses
        // page content and never emits the `mouseout` that would otherwise arm the poll.
        await me.observeWindowGeometry(windowId);

        // The grant hook and the geometry arming are async boundaries. Retirement, timeout or a
        // successor admission may have replaced this exact record while they were pending.
        if (
            me.isDestroyed || me.tearOutAdmissions.get(itemId) !== admission ||
            admission.connectingWindowId !== windowId || !Neo.apps[windowId]
        ) {
            return
        }

        const connection = {
            admissionToken,
            generation: me.tearOutPanes[itemId]?.generation ?? activeVessel?.generation ?? admission.generation,
            windowId,
            windowName: activeVessel?.windowName || me.tearOutPanes[itemId]?.windowName || admission.windowName
        };

        admission.connected = true;
        admission.windowId  = windowId;
        admission.timerId && clearTimeout(admission.timerId);
        admission.timerId = null;

        if (me.tearOutPanes[itemId]) {
            if (!me.reparentTearOutPane(itemId, connection)) {
                me.compensateFailedTearOutAdoption(itemId, me.tearOutPanes[itemId]);
                throw new Error(`Workspace ${me.id}: tear-out pane "${itemId}" could not enter its admitted vessel`)
            }

            me.clearTearOutAdmission(itemId, admission)
        } else {
            me.tearOutConnects[itemId] = connection
        }

        me.afterTearOutWindowConnect({...context, connection})
    }

    /**
     * Hook: app-owned pane preparation immediately before semantic return starts.
     * @param {Object} data
     * @protected
     */
    beforeTearOutPaneReturn(data) {}

    /**
     * Hook: observes the semantic return disposition.
     * @param {Object} data
     * @protected
     */
    afterTearOutPaneReturn(data) {}

    /**
     * @summary Settles a live pane only when no semantic home can own it.
     * @param {Neo.component.Base|null} pane
     * @protected
     */
    settleTearOutPane(pane) {
        if (pane && !pane.isDestroyed) {
            pane.parent?.remove(pane, false);
            pane.destroy()
        }
    }

    /**
     * @summary Returns a dead vessel's item to its exact semantic position and same live pane.
     * @param {String} itemId
     * @param {Neo.component.Base|null} pane
     * @protected
     */
    async reintegrateTearOutItem(itemId, pane) {
        let me        = this,
            placement = me.tearOutPlacements[itemId],
            doc       = me.dockModel,
            // The first tabs node in document order is not a placement — it is wherever enumeration
            // happens to start. It stands in only for an item with NO record at all, because a pane
            // somewhere valid beats a pane dropped out of the tree.
            lastResort = () => Object.entries(doc?.nodes || {}).find(([, node]) => node.type === 'tabs')?.[0],
            target     = placement || {tabsNodeId: lastResort()},
            live       = pane && !pane.isDestroyed,
            result;

        delete me.tearOutPlacements[itemId];

        if (!doc?.items?.[itemId] || !target.tabsNodeId) {
            me.settleTearOutPane(pane);
            me.afterTearOutPaneReturn({itemId, pane, returned: false});
            return false
        }

        if (live) {
            pane.parent?.remove(pane, false);
            me.returningTearOutPanes[itemId] = pane
        }

        me.beforeTearOutPaneReturn({itemId, pane});

        if (Document.findContainingTabsId(doc, itemId)) {
            me.onDockZoneDocumentChange(doc);

            try {
                await me.refreshPromise;
                me.afterTearOutPaneReturn({itemId, pane, returned: true});
                return true
            } catch (error) {
                me.afterTearOutPaneReturn({error, itemId, pane, returned: false});
                return false
            }
        }

        result = me.applyDockZoneOperation({operation: 'restoreTab', itemId, ...target});

        if (result?.errors?.length > 0 && placement) {
            // The recorded home resolved to nothing — its zone AND the sibling it collapsed into are
            // both gone. Losing the position is bad; losing the pane is worse.
            result = me.applyDockZoneOperation({operation: 'restoreTab', itemId, tabsNodeId: lastResort()})
        }

        if (result?.errors?.length === 0) {
            me.onDockZoneDocumentChange(result.document);

            try {
                await me.refreshPromise;
                me.afterTearOutPaneReturn({itemId, pane, returned: true});
                return true
            } catch (error) {
                me.afterTearOutPaneReturn({error, itemId, pane, returned: false});
                return false
            }
        } else {
            delete me.returningTearOutPanes[itemId];
            me.settleTearOutPane(pane);
            me.afterTearOutPaneReturn({errors: result?.errors || [], itemId, pane, returned: false});
            return false
        }
    }

    /**
     * Hook: handles a disconnect unrelated to an engine-owned gesture tear-out.
     * @param {Object} data
     * @protected
     */
    onUnhandledWindowDisconnect(data) {}

    /**
     * @summary Reconciles physical vessel death against pre-terminal or committed ownership.
     * @param {Object} data
     * @protected
     */
    async onWindowDisconnect(data) {
        let me = this;

        if (me.isDestroyed) return;

        for (const [itemId, entry] of Object.entries(me.tearOutPanes)) {
            if (entry.windowId === data.windowId) {
                const pane = me.releaseTearOutPane(itemId);

                delete me.tearOutPanes[itemId];
                delete me.tearOutConnects[itemId];
                me.clearTearOutAdmission(itemId);
                me.tearOutHandlers?.onVesselRetired({...entry, itemId});
                await me.reintegrateTearOutItem(itemId, pane);
                me.afterTearOutWindowDisconnect({committed: true, data, entry, itemId, pane});
                return
            }
        }

        for (const [itemId, entry] of Object.entries(me.tearOutConnects)) {
            if (entry.windowId === data.windowId) {
                const admission = me.tearOutAdmissions.get(itemId);

                delete me.tearOutConnects[itemId];
                me.clearTearOutAdmission(itemId, admission);
                me.tearOutHandlers?.onVesselRetired({...entry, itemId});
                admission?.sortZone?.endWindowDrag();
                me.afterTearOutWindowDisconnect({committed: false, data, entry, itemId, pane: null});
                return
            }
        }

        me.onUnhandledWindowDisconnect(data)
    }

    /**
     * Hook: observes physical tear-out retirement after state reconciliation.
     * @param {Object} data
     * @protected
     */
    afterTearOutWindowDisconnect(data) {}

    /**
     * @summary Closes every admitted vessel and settles all owner-held panes exactly once.
     * @protected
     */
    retireTearOutState() {
        let me = this;

        const vessels = new Map();

        const collect = (itemId, entry={}) => {
            const windowName = entry.windowName;

            windowName && vessels.set(`${itemId}:${windowName}`, {...entry, itemId, windowName})
        };

        Object.entries(me.tearOutPanes || {}).forEach(([itemId, entry]) => collect(itemId, entry));
        Object.entries(me.tearOutConnects || {}).forEach(([itemId, entry]) => collect(itemId, entry));
        me.tearOutAdmissions?.forEach((entry, itemId) => collect(itemId, entry));
        me.tearOutRetirements?.forEach(vessel => collect(vessel.itemId, vessel));

        const active = me.tearOutHandlers?.activeVessel;

        active && collect(active.itemId, active);
        vessels.forEach(vessel => {
            Promise.resolve(me.closeTearOutVessel(vessel)).catch(() => {})
        });

        const panes = new Set([
            ...Object.values(me.returningTearOutPanes || {}),
            ...Object.values(me.tearOutPaneHandles || {})
        ]);

        panes.forEach(pane => me.settleTearOutPane(pane));

        me.tearOutAdmissions?.forEach((entry, itemId) => me.clearTearOutAdmission(itemId, entry));
        me.tearOutConnects       = {};
        me.tearOutPaneHandles    = {};
        me.tearOutPanes          = {};
        me.tearOutPlacements     = {};
        me.tearOutRetirements    = new Map();
        me.returningTearOutPanes = {}
    }

    /**
     * Hook: the post-projection moment — runs after the staged transaction landed and the FLIP
     * play (when any) was dispatched, and is AWAITED by the refresh, so a host that must sequence
     * chrome behind the motion (an overflow-menu settle, a bar-animation restore, a cross-window
     * participation refresh) can do so without owning the loop. `played` is the play's
     * settled-safe promise — motion failures resolve it to `null`, motion never fails truth — or
     * `null` when no play was dispatched; awaiting it is the HOST's choice. The default does
     * nothing, so every other host keeps fire-and-forget semantics, and the motion signal's
     * `leave` stays class-owned, firing when the play settles independent of this hook.
     * @param {Object} data
     * @param {Object|null} data.document The committed document this refresh projected.
     * @param {Object} data.refreshOptions The options the scheduling commit produced.
     * @param {Object|null} data.result The reconciler's outcome; `landedInPlace` reports the path
     *     it ACTUALLY took, never the requested one.
     * @param {Promise|null} data.played Settles when the FLIP motion finishes (`null` on motion
     *     failure or without a dispatched play).
     * @returns {Promise<void>|void}
     */
    afterRefreshDockWorkspace(data) {}

    /**
     * Hook: app chrome that must sync on every re-projection (a perspective toolbar, a control
     * bar, a drag-affordance session to invalidate). Runs AFTER the FLIP snapshot of the outgoing
     * geometry and before the staged projection, so chrome mutation can never alter the captured
     * first rects. A thrown error rejects this refresh transaction loudly — and only this one.
     * The default does nothing.
     * @param {Object} document The committed document this refresh projects.
     * @param {Object} refreshOptions The options {@link #getRefreshOptions} produced for it.
     */
    beforeRefreshDockWorkspace(document, refreshOptions) {}

    /**
     * Creates the hidden stand-in the reconciler materializes a projected item through before the
     * live pane or its resolved config takes the slot. Override only to change the placeholder's
     * shape; its header text rides {@link #getPaneHeaderText}.
     * @param {String} itemId
     * @param {Object} item The persisted item record.
     * @param {String} componentRef
     * @returns {Neo.component.Base}
     * @protected
     */
    createProjectionPlaceholder(itemId, item, componentRef) {
        return Neo.create({
            module: Component,
            header: {text: this.getPaneHeaderText(itemId, item, componentRef)},
            hidden: true
        })
    }

    /**
     * Stamps the FLIP marker class onto a plain pane config so a newly materialized pane joins the
     * addon's geometry correlation. `cls` is accepted as a single class String or a String[] and
     * normalized to an array either way. Live component instances are returned untouched — their
     * identity resolves through the committed document, never through a class stamp.
     * @param {*} config Resolved pane config or live component instance.
     * @param {String} itemId
     * @returns {*}
     * @protected
     */
    decorateFlipMarker(config, itemId) {
        if (!config || config.constructor !== Object) {
            return config
        }

        let {cls} = config;

        cls = Array.isArray(cls) ? cls : cls ? [cls] : [];

        return {
            ...config,
            cls: [...new Set([...cls, `${this.flipMarkerPrefix}${encodeURIComponent(itemId)}`])]
        }
    }

    /**
     * Tears down the producer and pending refresh chain. An enabled tear-out lifecycle first
     * unregisters its worker routes, closes every pending/connected/committed vessel, and settles
     * every owner-held pane exactly once; a refresh scheduled before teardown no-ops on its
     * `isDestroyed` guard.
     * @param {...*} args
     */
    destroy(...args) {
        let me = this;

        if (me.enableDockTearOutLifecycle) {
            Neo.currentWorker.un({
                connect   : me.onWindowConnect,
                disconnect: me.onWindowDisconnect,
                scope     : me
            });
            me.retireTearOutState();
            me.tearOutHandlers = null
        }

        if (me.dockMaximizeResizeObserved) {
            me.dockMaximizeResizeObserved = false;
            Neo.main.addon.ResizeObserver?.unregister({componentId: me.id, id: me.id, windowId: me.windowId})
        }

        me.dockMaximizeRestore = null;

        me.dockPreviewProducer?.destroy();
        me.dockPreviewProducer = null;
        me.refreshPromise      = null;

        super.destroy(...args)
    }

    /**
     * The container the projection mounts into: the child named by {@link #dockHostReference},
     * or this workspace itself.
     * @returns {Neo.container.Base|null}
     */
    getDockHost() {
        let {dockHostReference} = this;

        return dockHostReference ? this.getReference(dockHostReference) : this
    }

    /**
     * Hook: extra options for every {@link Neo.dashboard.dock.projection.LayoutAdapter#project} call — the
     * hover-reveal opt-in, a drag-affordance layer's `onDockCrossZoneDragMove` /
     * `onDockCrossZoneDragCancel` / `onDockCrossZoneDrop` seams, tear-out or conversion policy.
     * Returned keys override the default cross-zone drop seam; they never replace the reducer and
     * view-sync callbacks, which stay bound to this instance. The default contributes nothing.
     *
     * **Host header actions** arrive here too: return `resolveDockHeaderActions: nodeId => [...]` to
     * project a host's own actions into that tabs node's header. The set is node-static and lives for
     * the node's retained lifetime — vary an action per active item by moving `hidden` on its stable
     * instance, the way {@link #syncDockCloseAction} does, not by returning a different list. Names
     * must be unique per node, and every engine-owned name is reserved while its own opt-in is on —
     * `close` under {@link #enableDockCloseAction}, `lock` under {@link #enableDockLockAction},
     * `maximize` under {@link #enableDockMaximizeAction}, `pin` under {@link #enableDockPinAction},
     * `reload` under {@link #enableDockReloadAction}, and `pop-out` under
     * {@link #enableDockPopOutAction}. Pop-out availability is a separate state derived from
     * {@link #dockPopOutActionActive}; both violations throw at projection rather than silently
     * unaddressing an action. Their intent surfaces on the `dockHeaderAction` event — see
     * {@link #onDockHeaderAction}.
     * @returns {Object}
     */
    getDockProjectionOptions() {
        return this.enableDockTearOutLifecycle
            ? {enableDockTearOut: true, ...this.tearOutHandlers}
            : {}
    }

    /**
     * @summary The single effective predicate for the pop-out action: is the engine the owner?
     *
     * Two questions must never disagree — *may a host own the name `pop-out`?* and *does the engine
     * intercept a `pop-out` intent?* Answering them from different expressions is what let the
     * adapter free the name (it gates on both configs) while the router still swallowed the host's
     * intent (it gated on the action config alone). One reader, so they cannot drift.
     *
     * `enableDockPopOutAction` alone is not sufficient: dispatch requires one effective
     * {@link #tearOutHandlers} bundle, whether base-owned or supplied by the host.
     * @returns {Boolean}
     */
    get dockPopOutActionActive() {
        return this.enableDockPopOutAction === true && !!this.tearOutHandlers
    }

    /**
     * Resolves the current Dock item from live tab order, never a closure-captured model index.
     * The reconciler owns `dockItemIds`; the TabContainer owns `activeIndex`.
     * @param {Neo.tab.Container|null} tabContainer
     * @returns {String|null}
     * @protected
     */
    getActiveDockItemId(tabContainer) {
        let itemIds = tabContainer?.getTabBar()?.sortZoneConfig?.dockItemIds,
            index   = tabContainer?.activeIndex;

        return Array.isArray(itemIds) && Number.isInteger(index) ? itemIds[index] ?? null : null
    }

    /**
     * Synchronizes one retained close action against the live active item and committed policy.
     * Hidden-state changes stay on the stable action instance so Overflow receives its existing
     * `actionVisibilityChange` signal instead of an action-group replacement.
     *
     * Gated on {@link #enableDockCloseAction} for the reason given on {@link #syncDockPinAction}: the
     * name is only this class's while its own opt-in is on.
     * @param {Neo.tab.Container|null} tabContainer
     * @protected
     */
    syncDockCloseAction(tabContainer) {
        if (!this.enableDockCloseAction) return;

        let action = tabContainer?.getActionItem?.('close'),
            itemId = this.getActiveDockItemId(tabContainer),
            item   = this.dockModel?.items?.[itemId],
            hidden = !itemId || item?.closable === false || item?.locked === true;

        action && action.hidden !== hidden && (action.hidden = hidden)
    }

    /**
     * @summary Re-evaluates the retained pop-out action against current truth after every commit.
     *
     * Pop-out was the one engine action with no sync. Its `hidden` is projected once as
     * `!activeItemId || !dockPopOutActionAvailable` and then lives on a RETAINED action instance
     * that survives re-projection, so nothing ever recomputed it: the control was correct at boot
     * and silently gone after the first layout commit. For a consumer whose reason to be here is
     * multi-window, the feature disappeared until reload.
     *
     * Mirrors the projected expression from the same reader (`dockPopOutActionActive`), so the
     * projected and the synced answer cannot drift. Change-guarded like its siblings, so re-walking
     * retained nodes stays idempotent.
     * @param {Neo.tab.Container} tabContainer
     * @protected
     */
    syncDockPopOutAction(tabContainer) {
        if (!this.enableDockPopOutAction) return;

        let action = tabContainer?.getActionItem?.('pop-out'),
            itemId = this.getActiveDockItemId(tabContainer),
            hidden = !itemId || !this.dockPopOutActionActive;

        action && action.hidden !== hidden && (action.hidden = hidden)
    }

    /**
     * Synchronizes the retained lock action and every projected pane/button against committed
     * item truth. The action stays one stable instance; per-item hidden/icon state moves on it.
     *
     * Presentation is deliberately a second layer beneath the model guards. Lock stamps
     * `vdom.inert` plus `neo-dock-pane-locked` in one pane update and removes only the tab
     * button's `neo-draggable` source token. Unlock restores the exact prior inert ownership/value
     * and exact prior drag-token ownership. Locked headers remain legal drop targets. The ordinary
     * lock gesture is focus-gated; once the protective state persists, its unlock reversal becomes
     * persistent too, so discoverability never depends on re-entering a transient focus context.
     * @param {Neo.tab.Container|null} tabContainer
     * @protected
     */
    syncDockLockAction(tabContainer) {
        let me = this;

        if (!me.enableDockLockAction) return;

        let action       = tabContainer?.getActionItem?.('lock'),
            activeItemId = me.getActiveDockItemId(tabContainer),
            activeItem   = me.dockModel?.items?.[activeItemId],
            hidden       = !activeItemId || activeItem?.lockable === false,
            iconCls      = activeItem?.locked === true ? me.dockUnlockIconCls : me.dockLockIconCls,
            ariaLabel    = activeItem?.locked === true ? 'unlock' : 'lock',
            tooltipKey   = activeItem?.locked === true ? 'unlock' : 'lock',
            showOnFocus  = activeItem?.locked !== true,
            changes      = {};

        if (action) {
            let ariaLabelChanged = action.vdom?.['aria-label'] !== ariaLabel;

            action.hidden  !== hidden  && (changes.hidden  = hidden);
            action.iconCls !== iconCls && (changes.iconCls = iconCls);
            action.showOnFocus !== showOnFocus && (changes.showOnFocus = showOnFocus);
            me.syncDockActionTooltip(action, tooltipKey, changes);

            if (Object.keys(changes).length || ariaLabelChanged) {
                // `setSilent()` consumes non-config class-field keys from its input, so remember
                // this transition BEFORE handing the batch over.
                let focusGateChanged = Object.hasOwn(changes, 'showOnFocus');

                Object.keys(changes).length && action.setSilent(changes);
                ariaLabelChanged && (action.vdom['aria-label'] = ariaLabel);

                // `showOnFocus` is a stable-instance policy flip, not an action-list rebuild. The
                // toolbar owns the inert/aria/tab-index presentation and must release/re-arm it
                // before this one update publishes the changed action.
                focusGateChanged && tabContainer?.getTabBar?.()?.applyContextualActionState(true);

                action.update()
            }
        }

        let itemIds = tabContainer?.getTabBar?.()?.sortZoneConfig?.dockItemIds || [],
            panes   = tabContainer?.getCardContainer?.()?.items || [],
            buttons = tabContainer?.getTabButtons?.() || [];

        itemIds.forEach((itemId, index) => {
            me.syncDockLockItemPresentation({
                button: buttons[index],
                locked: me.dockModel?.items?.[itemId]?.locked === true,
                pane  : panes[index]
            })
        })
    }

    /**
     * Applies or restores one item's lock presentation without changing model state.
     *
     * The content half is delegable, the reload precedent: a pane implementing
     * `dockLock(locked)` owns what locked means for its content — a form disables its fields, a
     * grid turns cell editing off, a stream keeps scrolling — and the engine writes no `inert` for
     * it. The probe is a pure `typeof` on the live card, never a resolver call. The hook fires
     * once per transition, recorded in the same per-pane state as the inert snapshot, so a sweep
     * that runs on every active-item change never re-locks a pane its author already locked.
     * Without the hook the engine's inert default stands, byte-identical, with its exact-restore
     * clause.
     * @param {Object} data
     * @param {Neo.tab.header.Button|null} data.button
     * @param {Boolean} data.locked
     * @param {Neo.component.Base|null} data.pane
     * @protected
     */
    syncDockLockItemPresentation({button, locked, pane}={}) {
        let me = this;

        if (pane && !pane.isDestroyed) {
            let cls       = Array.isArray(pane.cls) ? [...pane.cls] : pane.cls ? [pane.cls] : [],
                hadCls    = cls.includes('neo-dock-pane-locked'),
                changed   = false,
                delegated = typeof pane.dockLock === 'function',
                prior,
                vdom      = pane.vdom;

            if (locked) {
                if (delegated) {
                    if (!me.dockLockPaneState.has(pane)) {
                        me.dockLockPaneState.set(pane, {delegated: true});
                        pane.dockLock(true)
                    }
                } else {
                    if (!me.dockLockPaneState.has(pane)) {
                        me.dockLockPaneState.set(pane, {
                            owned: Object.hasOwn(vdom, 'inert'),
                            value: vdom.inert
                        })
                    }

                    if (vdom.inert !== true) {
                        vdom.inert = true;
                        changed = true
                    }
                }
            } else if (me.dockLockPaneState.has(pane)) {
                prior = me.dockLockPaneState.get(pane);
                me.dockLockPaneState.delete(pane);

                // Reverse along the path that locked: the record decides, never the current probe,
                // so a pane cannot be handed an unlock it never received a lock for.
                if (prior.delegated) {
                    pane.dockLock(false)
                } else {
                    if (prior.owned) {
                        vdom.inert = prior.value
                    } else {
                        delete vdom.inert
                    }

                    changed = true
                }
            }

            NeoArray.toggle(cls, 'neo-dock-pane-locked', locked);

            if (hadCls !== locked) {
                pane.setSilent({cls});
                changed = true
            }

            changed && pane.update()
        }

        if (button && !button.isDestroyed) {
            let cls       = Array.isArray(button.wrapperCls) ? [...button.wrapperCls] : [],
                draggable = cls.includes('neo-draggable'),
                restore;

            if (locked) {
                !me.dockLockDragState.has(button) && me.dockLockDragState.set(button, draggable);
                NeoArray.remove(cls, 'neo-draggable')
            } else if (me.dockLockDragState.has(button)) {
                restore = me.dockLockDragState.get(button);
                me.dockLockDragState.delete(button);
                NeoArray.toggle(cls, 'neo-draggable', restore)
            }

            draggable !== cls.includes('neo-draggable') && (button.wrapperCls = cls)
        }
    }

    /**
     * Synchronizes the currently materialized rail-reveal panes against committed lock truth.
     *
     * Rails are synthetic affordances retained across stable-topology reconciliation, so their
     * projection config is not a state-update channel. The materialization callback covers first
     * reveal; this sweep covers a lock transition while the same overlay remains open. Dismissed
     * cached panes restore on their next materialization callback.
     * @protected
     */
    syncDockLockRails() {
        let me = this;

        if (!me.enableDockLockAction) return;

        me.forEachDockRail(rail => {
            let itemId = rail.revealOverlay?.revealPaneItemId,
                pane   = rail.revealOverlay?.paneSlot?.items?.[0];

            if (itemId && pane) {
                me.syncDockLockItemPresentation({
                    locked: me.dockModel?.items?.[itemId]?.locked === true,
                    pane
                })
            }
        })
    }

    /**
     * Visits every projected edge rail below the dock shell. Rails are leaves of the walk: their
     * reveal overlays host application content, never dock nodes.
     * @param {Function} callback Receives one {@link Neo.dashboard.dock.interaction.Rail}.
     * @protected
     */
    forEachDockRail(callback) {
        const visit = component => {
            if (!component || component.isDestroyed) return;

            if (component.dockNodeType === 'edge-rail') {
                callback(component);
                return
            }

            component.items?.forEach(visit)
        };

        visit(this.getDockHost()?.items?.[this.dockShellIndex])
    }

    /**
     * Releases every rail-cached reveal pane whose item leaves auto-hidden state with the incoming
     * document — BEFORE the projection materializes that item's flow pane. The rail releases on its
     * own leave paths (pin escape, reconciled leaver); this sweep covers the ones that never pass
     * through it — a restored perspective, a transfer — which take the staged path that tears the
     * old rail down only AFTER the new shell minted the flow pane. Awaited: the releases have to
     * LAND before the projection stages a node under a released id.
     * See {@link Neo.dashboard.dock.interaction.Rail#releaseRevealPane}.
     *
     * The reveal STATE retires with the pane, exactly as on the rail's own leave paths: the state
     * machine's contract names restore and transfer as `itemCleared` transitions, and an overlay
     * whose `revealPaneItemId` still names a departed item would take `syncRevealPane`'s
     * same-id early return onto an empty slot the next time that item is revealed.
     * @param {Object|null} document The committed document this refresh projects.
     * @returns {Promise<void>}
     * @protected
     */
    async releaseStaleRevealPanes(document) {
        const pending = [];

        this.forEachDockRail(rail => {
            Object.keys(rail.revealPaneCache || {}).forEach(itemId => {
                if (document?.items?.[itemId]?.autoHidden !== true) {
                    pending.push(rail.releaseRevealPane(itemId));
                    rail.revealMachine?.itemCleared(itemId)
                }
            })
        });

        await Promise.all(pending)
    }

    /**
     * Synchronizes one retained pin action against the live active item and committed policy.
     *
     * Hidden wherever the collapse could not complete, so the header never offers a gesture the model
     * or the projection would refuse: no active item, `pinnable: false` (which
     * {@link Neo.dashboard.dock.model.Operations#setItemAutoHidden} rejects), or an item no edge owns
     * (§2.7 — center never rails). The edge answer comes from
     * {@link Neo.dashboard.dock.model.Document#findOwningEdge}, the same derivation the projection
     * rails by, so the action cannot disagree with the rail it would collapse into.
     *
     * Like {@link #syncDockCloseAction}, hidden-state changes stay on the stable action instance so
     * Overflow receives its existing `actionVisibilityChange` signal instead of an action-group
     * replacement.
     *
     * **The opt-in gates policy synchronization, not only projection and dispatch.** `pin` is a
     * reserved engine name exactly while {@link #enableDockPinAction} is on — that is the contract
     * {@link #getDockProjectionOptions} states and the throw it enforces. While the flag is off the
     * name belongs to whoever projected it through `resolveDockHeaderActions`, so resolving it here
     * would let a disabled engine action move a host's `hidden` on every active-item change and
     * reconciliation sweep. Default-off has to mean behaviorally inert, not merely unprojected.
     * @param {Neo.tab.Container|null} tabContainer
     * @protected
     */
    syncDockPinAction(tabContainer) {
        if (!this.enableDockPinAction) return;

        let action = tabContainer?.getActionItem?.('pin'),
            itemId = this.getActiveDockItemId(tabContainer),
            model  = this.dockModel,
            hidden = !itemId
                || model?.items?.[itemId]?.pinnable === false
                || !model
                || !Document.findOwningEdge(model, itemId);

        action && action.hidden !== hidden && (action.hidden = hidden)
    }

    /**
     * The boot-time header-action sync. A consumer may mount its FIRST projection statically —
     * items assembled in `construct()` — without ever entering {@link #refreshDockWorkspace},
     * and on that path no header-action sync runs at all: projected action rows are
     * projection-constant by design (per-item state must never vary the actions array), so a
     * pane-dependent action such as reload would stay at its projected default forever. Mount is
     * the one surface every boot path shares.
     *
     * A workspace whose boot DID run the refresh already synced on settled chrome (the
     * post-reconcile sweep), so this hook narrows to the never-refreshed case: `refreshPromise`
     * present means the refresh owns boot truth and writing again from the mount window would
     * only race the initial application train (observed on slow rigs as duplicated bar chrome).
     * For the static case the sync is additionally deferred off the mount cascade (the
     * MonacoEditor post-mount idiom) — container mount flips every child's `mounted` in the same
     * frame. Every write in the sweep is change-guarded and idempotent, and `timeout()` is
     * destroy-rejected, so a torn-down workspace never runs it.
     *
     * The guard is re-derived AT WRITE TIME, not only at mount. The mount-time read proves nothing
     * beyond "no refresh had started 100ms ago", and a refresh that BEGINS inside the deferral
     * window owns boot truth exactly as much as one already open when the hook sampled. The
     * never-refreshed case is unaffected — awaiting `null` is a no-op — while the overlapping case
     * stops writing into an open application train. Settled tail and not resolution: a rejection
     * belongs to whoever awaited that commit's snapshot, and chrome still needs its sync either way.
     *
     * A SETTLED PROMISE IS NOT THE SETTLED TAIL, because `refreshPromise` is a mutable field. A
     * second commit can replace it while the snapshot this sweep awaited is still pending; that
     * snapshot settling would then authorize the write ahead of the reconcile that replaced it —
     * the same race one door further in. So the wait re-reads the field and repeats until the
     * promise it awaited is still the one the workspace holds. Each commit chains off its
     * predecessor's settled tail, so the loop drains rather than spins, and it needs no timer.
     *
     * Returns the deferred chain (or `null` when no sweep is scheduled) so the boot path is
     * awaitable. Callers ignore it; a witness cannot observe a deferral it has no handle on.
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @returns {Promise|null}
     * @protected
     */
    afterSetMounted(value, oldValue) {
        super.afterSetMounted(value, oldValue);

        if (!value || this.refreshPromise) {
            return null
        }

        return this.timeout(100).then(async () => {
            let me = this,
                awaited;

            do {
                awaited = me.refreshPromise;

                try {
                    await awaited
                } catch (error) {
                    // Not this sweep's rejection to handle — the chrome still wants syncing.
                }
            } while (!me.isDestroyed && me.refreshPromise !== awaited);

            !me.isDestroyed && me.syncDockHeaderActions()
        }).catch(() => null)
    }

    /**
     * Synchronizes every projected engine header action after reconciliation, including retained tabs
     * whose action instance outlived a model-policy or active-item change.
     *
     * Walks the SETTLED shell, never a map handed in from the reconciler: that map is the OLD shell's
     * tabs (`Reconciler.collectProjectedTabs(oldShell)`), so a node the projection just CREATED — a
     * railed item pinned back into flow, a fresh boot's placeholders — is not in it, and `reload`'s
     * availability, projected as a constant `hidden: true` by the stable-instance rule, is revealed
     * by nothing else. Every write below is change-guarded, so re-walking retained nodes is idempotent.
     *
     * Each action's own sync guards on its own opt-in and is a no-op when the action was never
     * projected — the opt-in guard is load-bearing, not redundant: a host may legally own an
     * engine action NAME while that engine flag is off (the reserved-name guard fires only for
     * enabled actions), and `getActionItem` finds the host's action by name. Without the guard,
     * this sweep would rewrite consumer-owned action state.
     * @protected
     */
    syncDockHeaderActions() {
        let me    = this,
            shell = me.getDockHost()?.items?.[me.dockShellIndex];

        shell && Reconciler.collectProjectedTabs(shell).forEach(tab => {
            me.syncDockCloseAction(tab);
            me.syncDockLockAction(tab);
            me.syncDockPinAction(tab);
            me.syncDockPopOutAction(tab);
            me.syncDockReloadAction(tab)
        });

        me.enableDockLockAction && me.syncDockLockRails()
    }

    /**
     * Commits user tab activation through the document reducer, independently of close-action UI.
     *
     * Reconciliation can re-emit the already-committed index; that path is a byte-identical no-op.
     * A stale/invalid projection is restored to document truth so a rejected activation changes
     * neither durable state nor the rendered selection.
     * @param {Object} data
     * @param {String} data.dockNodeId
     * @param {Neo.component.Base|null} [data.item]
     * @param {Neo.tab.Container|null} [data.tabContainer]
     * @returns {{document:Object,errors:String[]}|null}
     */
    onDockActiveIndexChange({dockNodeId, item, tabContainer}={}) {
        let me        = this,
            container = tabContainer || item?.parent?.parent || null,
            itemId    = me.getActiveDockItemId(container),
            committed = me.dockModel?.nodes?.[dockNodeId]?.activeItemId,
            descriptor, result;

        me.syncDockCloseAction(container);
        me.syncDockLockAction(container);
        me.syncDockPinAction(container);

        if (!me.dockModel || !itemId || committed === itemId) {
            // No commit follows (a reconciliation re-emit, or no model): this sync is the only
            // writer of the reload action's per-item state for this activation.
            me.syncDockReloadAction(container);
            return null
        }

        // A commit follows, and with it the post-reconcile header-action sync on settled chrome.
        // Reload's sync WRITES on every contract boundary (hidden/disabled flip), so running it
        // here too would put a vdom update in flight against the reconcile's own updates on the
        // same subtree — the race that intermittently dropped retained tab chrome.

        descriptor = {operation: 'setActiveItem', tabsNodeId: dockNodeId, itemId};
        result     = me.applyDockZoneOperation(descriptor);

        if (result && !result.errors?.length && result.document) {
            me.onDockZoneDocumentChange(result.document, descriptor, container)
        } else if (container) {
            let itemIds = container.getTabBar()?.sortZoneConfig?.dockItemIds || [],
                index   = itemIds.indexOf(committed);

            if (index > -1 && container.activeIndex !== index) {
                container.activeIndex = index
            }
        }

        return result
    }

    /**
     * Routes one persistent header action through the model and the class-owned projection chain,
     * and re-emits everything it does not own.
     *
     * This class owns the ENGINE SET, each action only while its own opt-in is on: `close`
     * ({@link #enableDockCloseAction}), `maximize` ({@link #enableDockMaximizeAction} — a pure
     * presentation toggle that never reaches the reducer), `lock`
     * ({@link #enableDockLockAction}), `pin` ({@link #enableDockPinAction}), `reload`
     * ({@link #enableDockReloadAction} — runtime-only like maximize: delegation into the pane's own
     * `dockReload()`, never an operation) and `pop-out` ({@link #enableDockPopOutAction}, itself
     * double-gated on {@link #enableDockTearOutLifecycle}). Every other intent —
     * including host actions projected through `resolveDockHeaderActions` — is re-emitted as a
     * **`dockHeaderAction`** event carrying `{action, dockNodeId, tabContainer}`, so a host receives it
     * without subclassing this class or overriding a protected method, and this method returns `null`
     * for it.
     *
     * Routing lives here and the effect lives in one handler per action, so a further engine action is
     * a new handler plus a row below rather than another branch grown into this method.
     *
     * **`pop-out` is the one asynchronous row**, because vessel admission is: it returns the
     * settlement as a Promise of the same `{document, errors}` envelope the synchronous rows return,
     * never a bare Boolean. The projection wire discards this return, so the shape is a contract for
     * a subclass or a direct caller rather than for the button — which is exactly why it must not
     * quietly differ per action.
     * @param {Object} data
     * @param {String} data.action
     * @param {String} data.dockNodeId
     * @param {Neo.tab.Container} data.tabContainer
     * @returns {{document:Object,errors:String[]}|Promise<{document:Object,errors:String[]}>|null}
     */
    onDockHeaderAction({action, dockNodeId, tabContainer}={}) {
        let me = this;

        if (action === 'close' && me.enableDockCloseAction) {
            return me.handleDockCloseAction({dockNodeId, tabContainer})
        }

        if (action === 'lock' && me.enableDockLockAction) {
            return me.handleDockLockAction({dockNodeId, tabContainer})
        }

        if (action === 'pin' && me.enableDockPinAction) {
            return me.handleDockPinAction({dockNodeId, tabContainer})
        }

        // `dockPopOutActionActive`, not `enableDockPopOutAction`: ownership of the NAME and
        // interception of the INTENT must use one predicate. Gating projection on both configs while
        // gating the router on one meant that with the action opted in and the lifecycle off, the
        // adapter correctly freed `pop-out` for a host to own — and the engine then swallowed that
        // host's intent here instead of re-emitting it.
        if (action === 'pop-out' && me.dockPopOutActionActive) {
            return me.handleDockPopOutAction({dockNodeId, tabContainer})
        }

        if (action === 'maximize' && me.enableDockMaximizeAction) {
            me.toggleDockMaximize(dockNodeId);
            return null
        }

        if (action === 'reload' && me.enableDockReloadAction) {
            return me.handleDockReloadAction({dockNodeId, tabContainer})
        }

        // Not an action this class owns. Re-emit it so a host that projected its own actions
        // through `resolveDockHeaderActions` receives the intent with its tabs node identified,
        // without having to override a protected method or subclass at all. Dropping it here is
        // what made the header slot unusable for anyone but the close action.
        me.fire('dockHeaderAction', {action, dockNodeId, tabContainer});

        return null
    }

    /**
     * Commits the engine-owned close action.
     *
     * Live reconciled order owns the close target at dispatch time. The current model locates that
     * item's semantic tabs node, and the committed result owns its focus successor. Successful focus
     * is chained onto `refreshPromise`, so it cannot reach chrome the reconciler retires.
     * @param {Object} data
     * @param {String} data.dockNodeId
     * @param {Neo.tab.Container} data.tabContainer
     * @returns {{document:Object,errors:String[]}|null}
     * @protected
     */
    handleDockCloseAction({dockNodeId, tabContainer}={}) {
        let me     = this,
            itemId = me.getActiveDockItemId(tabContainer);

        if (!itemId) {
            return {document: me.dockModel, errors: ['Dock close action requires an active item']}
        }

        if (!me.dockModel) {
            return {document: me.dockModel, errors: ['Dock close action requires a committed document']}
        }

        let modelNodeId = Document.findContainingTabsId(me.dockModel, itemId) || dockNodeId,
            descriptor  = {operation: 'closeItem', itemId},
            result      = me.applyDockZoneOperation(descriptor);

        if (result && !result.errors?.length && result.document) {
            let focusId = result.document.nodes?.[modelNodeId]?.activeItemId ?? null;

            me.onDockZoneDocumentChange(result.document, descriptor, tabContainer);
            me.refreshPromise = me.refreshPromise.then(() => {
                me.focusDockCloseTarget({dockNodeId: modelNodeId, itemId: focusId})
            })
        }

        return result
    }

    /**
     * @summary Toggles the active item's committed lock state through the reducer.
     *
     * On success the committed document advances through the ordinary holder seam, then current
     * chrome receives the derived presentation immediately; reconciliation repeats the same sync
     * on retained/new instances. The reducer owns every refusal, including `lockable:false`.
     * @param {Object} data
     * @param {String} data.dockNodeId
     * @param {Neo.tab.Container|null} data.tabContainer
     * @returns {{document:Object,errors:String[]}|null}
     * @protected
     */
    handleDockLockAction({dockNodeId, tabContainer}={}) {
        let me     = this,
            itemId = me.getActiveDockItemId(tabContainer);

        if (!itemId) {
            return {document: me.dockModel, errors: ['Dock lock action requires an active item']}
        }

        if (!me.dockModel) {
            return {document: me.dockModel, errors: ['Dock lock action requires a committed document']}
        }

        let descriptor = {
                operation: 'setItemLocked',
                itemId,
                locked   : me.dockModel.items[itemId]?.locked !== true
            },
            result = me.applyDockZoneOperation(descriptor);

        if (result && !result.errors?.length && result.document) {
            me.onDockZoneDocumentChange(result.document, descriptor, tabContainer);
            me.syncDockCloseAction(tabContainer);
            me.syncDockLockAction(tabContainer)
        }

        return result
    }

    /**
     * @summary Detaches the active pane into its own vessel window, through the drag tear-out's
     * own commit path.
     *
     * **One vessel pipeline, one detach commit — provably, not by inspection.** This dispatches
     * `onDockTearOutExit` then `onDockTearOutTerminal`, which is literally what the pointer
     * gesture's terminal calls. It is not a second sequence that resembles the drag path; it is
     * that path, entered from a click. So admission, the exactly-once `detachItem` commit, the
     * throwing-reducer refusal route and vessel retirement are all inherited rather than restated,
     * and none of them can drift out of agreement with the gesture.
     *
     * The only delta from the drag entry is **geometry**: the gesture supplies a live proxy rect,
     * a click has none, so the pane's current box is measured first and the vessel opens over it —
     * the pane appears to lift in place rather than materialising at a default position.
     *
     * `onDockTearOutExit` is admission-first and fail-closed: a falsy resolution means the host
     * refused the window, and the pane stays exactly where it is with nothing committed. Terminal
     * is only reached on an admitted vessel.
     *
     * Focus and announcement are **not** performed here — see {@link #enableDockPopOutAction} for
     * why that bound is deliberate and whose job they are.
     *
     * Settles as the same `{document, errors}` envelope every other engine action returns. The
     * terminal itself answers with a bare Boolean — that is the drag path's internal grammar, and
     * translating it here rather than leaking it keeps one shape across the router's rows.
     *
     * @param {Object}                  data
     * @param {String}                  data.dockNodeId
     * @param {Neo.tab.Container|null}  data.tabContainer
     * @returns {Promise<{document:Object,errors:String[]}>}
     * @protected
     */
    async handleDockPopOutAction({dockNodeId, tabContainer}={}) {
        let me     = this,
            itemId = me.getActiveDockItemId(tabContainer);

        if (!itemId) {
            return {document: me.dockModel, errors: ['Dock pop-out action requires an active item']}
        }

        if (!me.tearOutHandlers) {
            // Unreachable while the availability contract holds. Kept because the router is
            // directly callable, and a missing effective host pipeline must refuse rather than throw.
            return {document: me.dockModel, errors: ['Dock pop-out action requires a tear-out handler bundle']}
        }

        const proxyRect = await me.measureDockPaneRect(tabContainer);

        // A click is asynchronous across two awaits and `destroy()` nulls `tearOutHandlers`, so the
        // pipeline is re-checked after EVERY await rather than captured once. Nothing here may
        // commit into a workspace that is already gone.
        if (me.isDestroyed || !me.tearOutHandlers) {
            return {document: me.dockModel, errors: ['Dock pop-out abandoned: the workspace was destroyed before admission']}
        }

        // Admission-first. A refused vessel leaves the pane untouched and uncommitted.
        const admitted = await me.admitDockPopOut({itemId, proxyRect, sortZone: null});

        if (admitted === false) {
            return {document: me.dockModel, errors: ['Dock pop-out was refused by the host vessel seam']}
        }

        if (me.isDestroyed || !me.tearOutHandlers) {
            // Admitted, then the workspace went away before the commit. The vessel is real and open,
            // so abandoning it silently would orphan a window; retire it through the machine that
            // opened it rather than leaving the caller to guess.
            me.tearOutHandlers?.retireActiveVessel?.();

            return {document: me.dockModel, errors: ['Dock pop-out abandoned: the workspace was destroyed after admission']}
        }

        // Captured BEFORE the terminal so the check below needs positive evidence of a transition.
        // Reading only the "after" state would let an absent or empty document read as a detach —
        // `findContainingTabsId` returns null for "not in the tree" AND for "no tree at all", so a
        // success would be reported from the absence of any evidence.
        const wasInTree = !!Document.findContainingTabsId(me.dockModel, itemId);

        await me.tearOutHandlers.onDockTearOutTerminal({itemId});

        // **The terminal's return value cannot separate commit from refusal.** It resolves `true` on
        // a committed detach, and on refusal it resolves `retireVessel(vessel)` — which is ALSO true
        // when the retirement succeeds. So a reducer refusal whose cleanup worked is indistinguishable
        // from a commit by that Boolean, and reading it as success would report a detach that never
        // happened.
        //
        // The committed document is the honest witness: a detached item is no longer in any tabs
        // node. Read AFTER the terminal, so a success reports the advanced document rather than the
        // one this method started with.
        const detached = wasInTree && !Document.findContainingTabsId(me.dockModel, itemId);

        return detached
            ? {document: me.dockModel, errors: []}
            : {document: me.dockModel, errors: ['Dock pop-out was refused by the detach commit']}
    }

    /**
     * @summary Enters the effective host tear-out admission path for a header-action pop-out.
     *
     * Pointer tear-out already reaches host-specific exit policy through projection callbacks. The
     * header action must use the same policy rather than bypassing it through the raw handler bundle.
     * Hosts with an augmented exit seam override this method; the base delegates to its one bundle.
     * @param {Object} data
     * @returns {Promise<Boolean>}
     * @protected
     */
    async admitDockPopOut(data) {
        return this.tearOutHandlers ? this.tearOutHandlers.onDockTearOutExit(data) : false
    }

    /**
     * @summary The active pane's current global box, used as the vessel's opening geometry.
     *
     * Measures the tabs node rather than the workspace: the vessel should lift the **pane** the
     * button sits on, not the whole dock. A failed or degenerate measurement resolves `null`, which
     * the tear-out seam accepts — the vessel then opens at the host's default geometry instead of
     * at a wrong one, which is the safer of the two failures.
     *
     * @param {Neo.tab.Container|null} tabContainer
     * @returns {Promise<Object|null>}
     * @protected
     */
    async measureDockPaneRect(tabContainer) {
        let me   = this,
            id   = tabContainer?.id,
            rect = null;

        if (!id) {
            return null
        }

        try {
            rect = await Neo.main.DomAccess.getBoundingClientRect({id, windowId: me.windowId})
        } catch (error) {
            rect = null
        }

        Array.isArray(rect) && (rect = rect[0]);

        return (rect?.width > 0 && rect?.height > 0) ? rect : null
    }

    /**
     * Commits the engine-owned pin action — docking design record §2.7's collapse-to-rail sequence.
     *
     * §2.7 specifies a two-step sequence and forbids a composite operation: `setItemPinned(false)`
     * when the item is pinned (the model rejects `autoHidden` on a pinned item), then
     * `setItemAutoHidden(true)`. Each step is an INDEPENDENT commit — reduced through
     * {@link #applyDockZoneOperation} and published through {@link #onDockZoneDocumentChange} on its
     * own — so both steps stay visible at the class's own write seam, the one `DockService` and
     * `DockSplitter` already reach a holder through. Folding them into a single published change
     * would make step 2 bypass that seam, since the seam reduces against the committed `dockModel`
     * and step 2 needs step 1's result.
     *
     * A step-2 rejection therefore leaves the item unpinned and still visible. That is §2.7's own
     * intermediate state, which it calls benign, and it is the price of the independence the row
     * requires; the alternative buys atomicity by making half the gesture unobservable.
     *
     * An UNPINNED item — the ordinary case — is a single step and a single refresh; only collapsing a
     * pinned pane commits twice.
     *
     * **Eligibility is re-derived here, from the current document, and not inherited from the chrome
     * that emitted the intent.** {@link #syncDockPinAction} hides the action wherever no edge owns the
     * item, but that visibility is a projection of the document as it stood at the last sweep, and the
     * sweep is deferred behind reconciliation. Between a commit that moves an item to the root center
     * and the refresh that re-hides its action, a retained-but-stale action is still visible and still
     * dispatchable — and collapsing a center item is precisely what §2.7 forbids. Deciding from
     * `dockModel` at dispatch closes that window: the same predicate, evaluated against the document
     * the commit will actually reduce against.
     * @param {Object} data
     * @param {String} data.dockNodeId
     * @param {Neo.tab.Container} data.tabContainer
     * @returns {{document:Object,errors:String[]}|null}
     * @protected
     */
    handleDockPinAction({dockNodeId, tabContainer}={}) {
        let me     = this,
            itemId = me.getActiveDockItemId(tabContainer);

        if (!itemId) {
            return {document: me.dockModel, errors: ['Dock pin action requires an active item']}
        }

        if (!me.dockModel) {
            return {document: me.dockModel, errors: ['Dock pin action requires a committed document']}
        }

        if (!Document.findOwningEdge(me.dockModel, itemId)) {
            return {document: me.dockModel, errors: ['Dock pin action requires an item owned by an edge zone']}
        }

        let descriptors = [],
            result      = null;

        me.dockModel.items?.[itemId]?.pinned === true &&
            descriptors.push({operation: 'setItemPinned', itemId, pinned: false});

        descriptors.push({operation: 'setItemAutoHidden', itemId, autoHidden: true});

        for (const descriptor of descriptors) {
            result = me.applyDockZoneOperation(descriptor);

            if (!result || result.errors?.length || !result.document) {
                return result
            }

            // Publishing here is what lets the NEXT step reduce against this one: the seam reads the
            // committed `dockModel`, and this assigns it synchronously before the refresh is chained.
            me.onDockZoneDocumentChange(result.document, descriptor, tabContainer)
        }

        return result
    }

    /**
     * Runs the engine-owned, delegation-only reload for the active pane: `dockReload()` when the
     * pane implements the contract — the author owns what reload means, and the method is
     * explicitly promise-aware (`void | Promise<*>`). Runtime-only by contract: no operation is
     * committed and the document never changes. Every completion — sync throw, async rejection,
     * async success — settles exactly once through the `dockReloadSettled` event
     * (`{dockNodeId, itemId, errors}`), because the action wire has no result channel
     * (`Observable.fire` discards listener returns). A failing `dockReload()` keeps the pane,
     * always. One invocation per item may be in flight; the action's `disabled` state derives
     * from the ACTIVE item's in-flight membership through {@link #syncDockReloadAction} — both
     * at the flight edges here and on every active-item change — so switching panes mid-flight
     * never inherits another item's window. Teardown mid-flight settles terminally through
     * `core.Base#trap`: destroy rejects the trapped delegation even when the pane's producer
     * never settles, and the post-destroy continuation returns without touching erased state.
     * The no-active race (teardown, active-item flip mid-dispatch) settles through the channel
     * too, carrying `itemId: null` — one settlement per activation, with the single-flight
     * absorption as the only silent path.
     * @param {Object} data
     * @param {String} data.dockNodeId
     * @param {Neo.tab.Container} data.tabContainer
     * @returns {Promise<{errors: String[]}|null>} `null` when an in-flight invocation absorbed
     *     the activation.
     * @protected
     */
    async handleDockReloadAction({dockNodeId, tabContainer}={}) {
        let me     = this,
            itemId = me.getActiveDockItemId(tabContainer),
            errors = [];

        if (!itemId) {
            // The no-active race (teardown, active-item flip mid-dispatch) settles through the
            // SAME channel as every other completion — the action wire discards returns, so an
            // unsettled early return here would be an activation the event contract never saw.
            errors.push('Dock reload action requires an active item');
            !me.isDestroyed && me.fire('dockReloadSettled', {dockNodeId, errors, itemId: null});
            return {errors}
        }

        // Single-flight: a second activation during the window neither invokes nor settles —
        // one settlement per invocation is the channel's contract.
        if (me.dockReloadInFlight.has(itemId)) {
            return null
        }

        let itemIds = tabContainer.getTabBar()?.sortZoneConfig?.dockItemIds || [],
            index   = itemIds.indexOf(itemId),
            pane    = index > -1 ? tabContainer.getCard(index) : null;

        if (!pane || pane.isDestroyed) {
            // No live card at all: a race (teardown, active-item flip mid-dispatch). There is
            // nothing to delegate to and nothing to replace — settle it honestly.
            errors.push(`Dock reload has no live pane for item "${itemId}"`)
        } else if (typeof pane.dockReload !== 'function') {
            // THE FALLBACK. A pane that never implemented the delegation contract has no other
            // recovery once its own state is wedged, which is the entire reason the recreate
            // transaction exists. Delegation first, recreate only when it is absent — a pane that
            // owns `dockReload()` decides what reload means, and replacing it instead would
            // discard that authority AND its identity.
            //
            // `settle: false` because THIS method settles the activation. Without it one click
            // emits two terminal events — `dockRecreateSettled` from the transaction and
            // `dockReloadSettled` from here — and a consumer counting completions would see the
            // action fire twice. The transaction's own channel stays for direct callers.
            const recreated = me.recreateDockPane(itemId, pane, {dockNodeId, settle: false});

            recreated?.errors?.length && errors.push(...recreated.errors)
        } else {
            me.dockReloadInFlight.add(itemId);
            me.syncDockReloadAction(tabContainer);

            try {
                // trap() is the engine-native teardown race: destroy rejects every registered
                // async, so this await settles even when the pane's producer never does — and a
                // producer settling later lands in the trap's already-settled no-op handlers,
                // never as an unhandled rejection.
                await me.trap(Promise.resolve().then(() => pane.dockReload()))
            } catch (error) {
                error !== Neo.isDestroyed && errors.push(`dockReload() failed for item "${itemId}": ${error?.message || error}`)
            }

            // Teardown rejected the trap: settle terminally — destroy erased the instance
            // fields this continuation would otherwise mutate.
            if (me.isDestroyed) {
                return {errors}
            }

            me.dockReloadInFlight.delete(itemId);

            // Re-derive both action axes from current truth: the active item may have changed
            // mid-flight, so assigning `disabled = false` here would leak across items. The
            // settle edge queues BEHIND any in-flight refresh (settled tail, never a raw write
            // beside a reconcile) — a settlement is not latency-sensitive, and the post-reconcile
            // sweep re-derives the same truth anyway when a commit is what changed the item.
            (me.refreshPromise?.catch(() => {}) || Promise.resolve()).then(() => {
                !me.isDestroyed && me.syncDockReloadAction(tabContainer)
            })
        }

        !me.isDestroyed && me.fire('dockReloadSettled', {dockNodeId, errors, itemId});

        return {errors}
    }

    /**
     * Synchronizes one retained reload action against the live active pane, owning BOTH state
     * axes: `hidden` while no active item resolves OR the active card does not carry the
     * `dockReload()` contract; `disabled` while the ACTIVE item — not whichever item started a
     * flight — has an invocation in flight. Deriving both here (called at the flight edges and
     * on every active-item change) is what keeps per-item single-flight and the one node-level
     * action instance consistent when the active item changes mid-flight. The contract probe is
     * pure — a `typeof` on the card instance, or on its config's `module` prototype while the
     * card container has not instantiated the slot yet (the post-reconcile sync runs before
     * card children materialize) — never a resolver call, which may be side-effectful.
     * @param {Neo.tab.Container|null} tabContainer
     * @protected
     */
    syncDockReloadAction(tabContainer) {
        // Opt-in guard first (the pin precedent): while the engine flag is off, a host may own
        // the semantic name `reload` — getActionItem() would find THAT action, and writing to it
        // here would overwrite consumer-owned state. Default-off means behaviorally inert.
        if (!this.enableDockReloadAction) return;

        let action   = tabContainer?.getActionItem?.('reload'),
            itemId   = this.getActiveDockItemId(tabContainer),
            disabled = false,
            hidden   = true;

        if (action && itemId) {
            let itemIds = tabContainer.getTabBar()?.sortZoneConfig?.dockItemIds || [],
                index   = itemIds.indexOf(itemId),
                pane    = index > -1 ? tabContainer.getCard(index) : null,
                carrier = pane?.isDestroyed ? null : (pane?.dockReload ?? pane?.module?.prototype?.dockReload);

            disabled = this.dockReloadInFlight.has(itemId) || this.dockRecreateInFlight.has(itemId);

            // An absent delegation hook no longer hides the action on its own: the recreate
            // fallback serves exactly those panes, so hiding them would hide the only recovery
            // they have. Hidden only when NEITHER path can serve the item.
            hidden = typeof carrier !== 'function' && !this.hasDockRecreateFallback()
        }

        // ONE batched update for both axes (`set()`), never two sequential writes: each write
        // opens its own vdom round trip on the tab bar, and stacked in-flight bar updates racing
        // a following reconcile is exactly the collision that duplicated retained chrome on slow
        // rigs.
        if (action && (action.disabled !== disabled || action.hidden !== hidden)) {
            action.set({disabled, hidden})
        }
    }

    /**
     * Focuses the committed close successor after reconciliation. The exact item id is resolved
     * back through the reconciled `dockItemIds`; an empty tabs node focuses its own root.
     * @param {Object} data
     * @param {String} data.dockNodeId
     * @param {String|null} data.itemId
     * @protected
     */
    focusDockCloseTarget({dockNodeId, itemId}={}) {
        let tabContainer = this.getDockHost()?.down?.({dockNodeId});

        if (!tabContainer) {
            this.focus();
            return
        }

        if (itemId) {
            let itemIds = tabContainer.getTabBar()?.sortZoneConfig?.dockItemIds || [],
                index   = itemIds.indexOf(itemId);

            if (index > -1) {
                tabContainer.getTabButtons()[index]?.focus();
                return
            }
        }

        tabContainer.focus()
    }

    /**
     * Triggered after the maximizedNodeId config got changed — the single presentation writer:
     * clearing restores the previous node, setting applies the new one, and an A→B switch
     * restores A instantly underneath B's animation. The one-shot {@link #dockMaximizeMotion}
     * intent decides whether the transition animates (the gesture default) or lands instantly
     * (operation-driven clears, fail-safes, re-projection continuity).
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetMaximizedNodeId(value, oldValue) {
        if (oldValue === undefined) {
            return
        }

        let me             = this,
            animate        = me.dockMaximizeMotion !== 'instant',
            transitionTail = me.dockMaximizeTransition?.catch(() => {}) || Promise.resolve();

        me.dockMaximizeMotion = 'animate';

        // Transitions are one ordered lane. A superseding value used to start its apply while the
        // prior clear was still live; that clear could then remove the new presentation while the
        // reactive id correctly survived. Clear first, then wait for the latest committed projection
        // before resolving the live tabs instance the apply mutates. `syncDockMaximizeProjection`
        // remains the refresh-owned idempotent reapply inside that projection.
        me.dockMaximizeTransition = transitionTail.then(async () => {
            oldValue && await me.clearDockMaximizePresentation({animate: animate && !value});

            if (value) {
                await (me.refreshPromise?.catch(() => {}) || Promise.resolve());

                if (me.maximizedNodeId === value && !me.isDestroyed) {
                    await me.applyDockMaximizePresentation(value, {animate})
                }
            }
        }).catch(() => null)
    }

    /**
     * Header-action dispatch for the engine-owned maximize toggle. Restoring returns focus to
     * the restored node's active header button — the input contract's focus half.
     * @param {String} dockNodeId
     * @protected
     */
    toggleDockMaximize(dockNodeId) {
        let me       = this,
            restored = me.maximizedNodeId === dockNodeId;

        me.maximizedNodeId = restored ? null : dockNodeId;

        restored && me.focusDockMaximizeTarget(dockNodeId)
    }

    /**
     * `Escape` restores an active maximize and returns focus to the restored node's active
     * header button. A no-op while nothing is maximized, so every other Escape consumer keeps
     * its ordinary meaning.
     * @param {Object} data
     * @protected
     */
    onDockMaximizeEscape(data) {
        let me     = this,
            nodeId = me.maximizedNodeId;

        if (nodeId) {
            me.maximizedNodeId = null;
            me.focusDockMaximizeTarget(nodeId)
        }
    }

    /**
     * Focuses the restored node's active header button after a maximize restore; an
     * unresolvable button falls back to the tabs root.
     * @param {String} nodeId
     * @protected
     */
    focusDockMaximizeTarget(nodeId) {
        let tabContainer = this.getDockHost()?.down?.({dockNodeId: nodeId});

        if (tabContainer) {
            let buttons = tabContainer.getTabButtons?.() || [],
                index   = tabContainer.activeIndex;

            (buttons[index] || tabContainer).focus?.()
        }
    }

    /**
     * Measures the dock host's live viewport rect — the geometry authority for the maximize
     * presentation. A maximized pane fills the DOCK AREA, not the app view: a workspace that
     * frames its host with a tour bar or a status bar keeps them in sight. The host is measured
     * explicitly (the workspace root stands in while no host is mounted): `inset: 0` would answer
     * to the viewport or an incidental fixed containing block instead. `null` is the fail-safe
     * trigger (unmounted mid-gesture, zero-area rect).
     * @returns {Promise<Object|null>}
     * @protected
     */
    async measureDockMaximizeRect() {
        let me   = this,
            id   = me.getDockHost()?.id || me.id,
            rect = null;

        try {
            rect = await Neo.main.DomAccess.getBoundingClientRect({id, windowId: me.windowId})
        } catch (error) {
            rect = null
        }

        Array.isArray(rect) && (rect = rect[0]);

        return (rect?.width > 0 && rect?.height > 0) ? rect : null
    }

    /**
     * @summary The four inline rect values of a maximized node: the measured host rect inset by
     * the gap token on every side.
     *
     * The gap is a paint-contract value (`--dock-maximize-gap` on `.neo-dashboard`), never a
     * worker literal, so the rect is written as `calc()` against the token and resolves in CSS —
     * a consumer tunes the gap without a worker round trip. The FLIP measures the DOM and is
     * unaffected by how the values are expressed.
     * @param {Object} rect The host's live viewport rect
     * @returns {Object} `{height, left, top, width}`
     * @protected
     */
    dockMaximizeRectStyle(rect) {
        const gap = 'var(--dock-maximize-gap, 0px)';

        return {
            height: `calc(${rect.height}px - 2 * ${gap})`,
            left  : `calc(${rect.left}px + ${gap})`,
            top   : `calc(${rect.top}px + ${gap})`,
            width : `calc(${rect.width}px - 2 * ${gap})`
        }
    }

    /**
     * The fail-safe half of the geometry contract: an unresolvable measurement or projection
     * clears the transient through the ordinary restore path — never a half state.
     * @param {String} nodeId The transition this failure belongs to.
     * @protected
     */
    failDockMaximize(nodeId) {
        let me = this;

        if (me.maximizedNodeId === nodeId) {
            me.dockMaximizeMotion = 'instant';
            me.maximizedNodeId    = null
        }
    }

    /**
     * Stamps the maximize FLIP marker onto every live projected tabs node (idempotent) and
     * flushes, so a following capture sees each node's pre-toggle rect: the maximized node
     * glides, and the siblings reflowing around its vacated flow slot glide with it instead of
     * snapping. Stamped lazily at gesture time — a workspace that never maximizes projects
     * byte-identically.
     * @returns {Promise<void>}
     * @protected
     */
    async stampDockMaximizeMarkers() {
        let me     = this,
            prefix = me.maximizeMarkerPrefix,
            shell  = me.getDockHost()?.items?.[me.dockShellIndex],
            tabs   = shell ? Reconciler.collectProjectedTabs(shell) : new Map(),
            dirty  = [];

        tabs.forEach(tab => {
            let marker = `${prefix}${encodeURIComponent(tab.dockNodeId)}`;

            if (!tab.cls.includes(marker)) {
                tab.cls = [...new Set([...tab.cls, marker])];
                dirty.push(tab)
            }
        });

        await Promise.all(dirty.map(tab => tab.promiseUpdate?.()))
    }

    /**
     * FLIP first-phase for a maximize transition, over the dedicated maximize marker family —
     * separate from {@link #flipMarkerPrefix} so committed-operation refreshes and maximize
     * gestures never consume each other's snapshots.
     * @returns {Promise<Neo.container.Base|null>} The dock host, for the paired play call.
     * @protected
     */
    async captureDockMaximizeFirst() {
        let me   = this,
            host = me.getDockHost(),
            flip = Neo.main?.addon?.DockFlip;

        if (!host?.mounted) {
            return null
        }

        try {
            await flip?.captureFirst({hostId: host.id, markerPrefix: me.maximizeMarkerPrefix, windowId: host.windowId})
        } catch (error) {/* instant landing */}

        return host
    }

    /**
     * FLIP second-phase for a maximize transition — the same fail-safe discipline as
     * {@link #refreshDockWorkspace}: gate on the play capability, bracket the motion signal, and
     * let every failure land the final geometry instantly. Truth never waits on motion.
     * @param {Neo.container.Base|null} host
     * @returns {Promise<*>}
     * @protected
     */
    playDockMaximizeFlip(host) {
        let me   = this,
            flip = Neo.main?.addon?.DockFlip,
            played;

        if (!host || typeof flip?.play !== 'function' || me.isDestroyed) {
            return Promise.resolve(null)
        }

        MotionSignal.enter(me);

        try {
            played = flip.play({hostId: host.id, markerPrefix: me.maximizeMarkerPrefix, windowId: host.windowId})
        } catch (error) {
            played = Promise.reject(error)
        }

        played = Promise.resolve(played).catch(() => null);
        played.finally(() => MotionSignal.leave(me));

        me.dockMaximizePlay = played;

        return played
    }

    /**
     * Engaging maximize closes an in-progress reveal — one overlay tier at a time, and
     * deterministically: the reveal machine gets an explicit dismissal input rather than the
     * presentation relying on the overlay's focus/outside-click decay to arrive in time.
     * @protected
     */
    dismissDockRevealOverlays() {
        let walk = item => {
            if (!item) {
                return
            }

            if (item.ntype === 'dashboard-dock-rail') {
                item.revealMachine?.outsideClick?.();
                return
            }

            (item.items || []).forEach(walk)
        };

        walk(this.getDockHost()?.items?.[this.dockShellIndex])
    }

    /**
     * The input-contract guard while a node is maximized: in-strip reorder stays live (the zone
     * keeps sorting, clamped to its own toolbar), while cross-zone exits and tear-out are
     * suppressed — every drop target sits under the maximized plane, so offering the gesture
     * would be dishonest. Idempotent per zone instance: re-application onto the same live zone
     * keeps the original snapshot, so restore always lands the pre-maximize values.
     * @param {Neo.tab.Container} tabContainer
     * @protected
     */
    suppressDockMaximizeDragSources(tabContainer) {
        let me   = this,
            bar  = tabContainer.getTabBar?.(),
            zone = bar?.sortZone || null;

        if (me.dockMaximizeRestore?.zoneId && me.dockMaximizeRestore.zoneId === zone?.id) {
            return
        }

        me.dockMaximizeRestore = {
            nodeId: tabContainer.dockNodeId,
            zone  : zone && {
                allowOverdrag      : zone.allowOverdrag,
                boundaryContainerId: zone.boundaryContainerId,
                enableProxyToPopup : zone.enableProxyToPopup
            },
            zoneId: zone?.id || null
        };

        // One coherent batched mutation per direction — the core reactive-config idiom.
        zone?.set({
            allowOverdrag      : false,
            boundaryContainerId: bar.id,
            enableProxyToPopup : false
        })
    }

    /**
     * Applies the maximize presentation onto the live projected tabs node: the measured
     * workspace rect as four inline values plus the class toggle — never a re-parent (a pane
     * hosting an iframe reloads its browsing context on re-parent), never a committed operation
     * (the document, perspectives and topology diffs never observe maximize). Fail-safe: an
     * unresolvable node or measurement clears the transient instead of leaving a half state.
     * Idempotent, so the re-projection continuity can re-enter it.
     * @param {String} nodeId
     * @param {Object} [options={}]
     * @param {Boolean} [options.animate=true]
     * @returns {Promise<void>}
     * @protected
     */
    async applyDockMaximizePresentation(nodeId, {animate=true}={}) {
        let me   = this,
            host = null,
            rect, tabContainer;

        tabContainer = me.getDockHost()?.down?.({dockNodeId: nodeId});

        if (!tabContainer || tabContainer.isDestroyed) {
            me.failDockMaximize(nodeId);
            return
        }

        rect = await me.measureDockMaximizeRect();

        if (!rect) {
            me.failDockMaximize(nodeId);
            return
        }

        if (me.maximizedNodeId !== nodeId || me.isDestroyed) {
            return
        }

        // Serialize on any in-flight FLIP window before WRITING: its end-of-window cleanup
        // restores the inline-style snapshot from invert time, which would overwrite geometry
        // written inside the window. Deliberately after the fail-guards — a fail-safe clear
        // writes nothing and must never queue behind motion.
        await me.dockMaximizePlay;

        if (me.maximizedNodeId !== nodeId || me.isDestroyed) {
            return
        }

        me.dismissDockRevealOverlays();
        me.suppressDockMaximizeDragSources(tabContainer);

        if (animate) {
            await me.stampDockMaximizeMarkers();
            host = await me.captureDockMaximizeFirst();

            if (me.maximizedNodeId !== nodeId || me.isDestroyed) {
                return
            }
        }

        // wrapperStyle is the dock's geometry carrier (the reconciler writes split flex through
        // it) and a shallow-merge descriptor: only the four rect keys ride here, and `null`
        // removes — the `style` config cannot remove against the wrapperStyle/vdom mirror loop.
        tabContainer.set({
            cls: [...new Set([
                ...tabContainer.cls.filter(c => c !== 'neo-dock-maximize-restoring'),
                'neo-dock-maximized'
            ])],
            wrapperStyle: me.dockMaximizeRectStyle(rect)
        });

        if (animate) {
            // The mutation→motion boundary must be deterministic: play() measures Last and
            // snapshots inline styles for its cleanup, so an un-flushed delta makes it capture
            // the OLD geometry — and its cleanup would then resurrect the stale inline values.
            try {
                await tabContainer.promiseUpdate?.()
            } catch (error) {/* destroyed mid-flight: the play gate below lands instantly */}

            me.playDockMaximizeFlip(host)
        }

        me.syncDockMaximizeActionPresentation(tabContainer, true);
        await me.registerDockMaximizeResizeObserver(true)
    }

    /**
     * Restores the ordinary presentation: removes the class and the four inline rect values,
     * lifts the drag-source suppression, and (for gesture-driven restores) FLIP-glides the node
     * from the workspace rect back into its flow slot while `neo-dock-maximize-restoring` holds
     * its paint order above the re-expanded layout until the motion settles.
     * @param {Object} [options={}]
     * @param {Boolean} [options.animate=true]
     * @returns {Promise<void>}
     * @protected
     */
    async clearDockMaximizePresentation({animate=true}={}) {
        let me      = this,
            restore = me.dockMaximizeRestore,
            host    = null,
            tabContainer, zone;

        if (!restore) {
            // A failed superseding apply can clear the reactive id after the prior clear already
            // consumed the restore snapshot. The observer may still be live because its generation
            // guard correctly refused to unregister while that superseding id was non-null. Once the
            // id is null, this clear remains the lifecycle owner even without geometry left to restore.
            !me.maximizedNodeId && await me.registerDockMaximizeResizeObserver(false);
            return
        }

        me.dockMaximizeRestore = null;

        // Same serialization as the apply path: never mutate geometry inside a live FLIP
        // window whose cleanup will re-stamp its stale snapshot.
        await me.dockMaximizePlay;

        tabContainer = me.getDockHost()?.down?.({dockNodeId: restore.nodeId});

        if (tabContainer && !tabContainer.isDestroyed) {
            zone = tabContainer.getTabBar?.()?.sortZone;

            if (restore.zone && zone && zone.id === restore.zoneId) {
                // One coherent batched mutation — the same idiom as the suppress direction.
                zone.set(restore.zone)
            }

            if (animate) {
                await me.stampDockMaximizeMarkers();
                host = await me.captureDockMaximizeFirst()
            }

            // Null values through the shallow-merge wrapperStyle descriptor are the house
            // removal idiom (the reconciler un-sets flex the same way).
            tabContainer.set({
                cls: [
                    ...tabContainer.cls.filter(c => c !== 'neo-dock-maximized'),
                    ...(animate ? ['neo-dock-maximize-restoring'] : [])
                ],
                wrapperStyle: {height: null, left: null, top: null, width: null}
            });

            if (animate) {
                // Same deterministic boundary as the apply path: an un-flushed delta lets play()
                // snapshot the maximize rect as "inline styles to restore" — its cleanup would
                // stamp the fullscreen values back onto the restored node.
                try {
                    await tabContainer.promiseUpdate?.()
                } catch (error) {/* destroyed mid-flight */}

                me.playDockMaximizeFlip(host).then(() => {
                    !tabContainer.isDestroyed && (tabContainer.cls = tabContainer.cls.filter(c => c !== 'neo-dock-maximize-restoring'))
                })
            }

            me.syncDockMaximizeActionPresentation(tabContainer, false)
        }

        await me.registerDockMaximizeResizeObserver(false)
    }

    /**
     * Flips the node's projected maximize action between its maximize and restore presentation —
     * icon, accessible name and tooltip together, on the stable action instance, the same
     * discipline every action consumer relies on. The glyph names the NEXT action, so the name and
     * the tooltip follow it: `restore` while the node is maximized. One batched update, like
     * {@link #syncDockLockAction}.
     * @param {Neo.tab.Container|null} tabContainer
     * @param {Boolean} maximized
     * @protected
     */
    syncDockMaximizeActionPresentation(tabContainer, maximized) {
        let me     = this,
            action = tabContainer?.getActionItem?.('maximize');

        if (!action) return;

        let iconCls          = maximized ? me.dockMinimizeIconCls : me.dockMaximizeIconCls,
            ariaLabel        = maximized ? 'restore' : 'maximize',
            ariaLabelChanged = action.vdom?.['aria-label'] !== ariaLabel,
            changes          = {};

        action.iconCls !== iconCls && (changes.iconCls = iconCls);
        me.syncDockActionTooltip(action, maximized ? 'restore' : 'maximize', changes);

        if (Object.keys(changes).length || ariaLabelChanged) {
            Object.keys(changes).length && action.setSilent(changes);
            ariaLabelChanged && (action.vdom['aria-label'] = ariaLabel);
            action.update()
        }
    }

    /**
     * The text a projected action currently offers as its tooltip. `component.Base#tooltip` reads
     * back the shared-instance config object once the tooltip module has loaded and the plain
     * string before that, so a sync compares text, never the container.
     * @param {Neo.component.Base|null} action
     * @returns {String|null}
     * @protected
     */
    readDockActionTooltip(action) {
        let {tooltip} = action || {};

        return typeof tooltip === 'string' ? tooltip : (tooltip?.text ?? null)
    }

    /**
     * Stages the tooltip a toggle state owes its retained action into one batched change set.
     *
     * The map distinguishes two things the projection also keeps apart: a key that is ABSENT
     * leaves whatever the projection gave the action, and a key set to `null` is the documented
     * opt-out — it clears the tooltip in that state, so a toggle never keeps naming the state it
     * just left. The opposite half of the pair restores its own text on the way back.
     * @param {Neo.component.Base} action
     * @param {String} key One of the map's keys (`lock`, `unlock`, `maximize`, `restore`).
     * @param {Object} changes The batch handed to `setSilent()`.
     * @protected
     */
    syncDockActionTooltip(action, key, changes) {
        let tips = this.dockActionTooltips || {};

        if (key in tips) {
            let tooltip = tips[key] ?? null;

            this.readDockActionTooltip(action) !== tooltip && (changes.tooltip = tooltip)
        }
    }

    /**
     * Classifies a committed operation descriptor as confined to the maximized node — the ops
     * that must NOT pre-clear the transient: their effect stays inside the pane the user is
     * looking at, so the continuity rule ({@link #syncDockMaximizeProjection}) decides from the
     * committed outcome instead (node survived ⇒ re-apply; collapsed away ⇒ clear). Everything
     * else — topology mutations, boundary crossings, whole-document applies (a `null`
     * descriptor included) — clears terminally before it applies.
     * @param {Object|null} descriptor
     * @returns {Boolean}
     * @protected
     */
    isDockMaximizeNeutralOperation(descriptor) {
        let me                                            = this,
            nodeId                                        = me.maximizedNodeId,
            {itemId, operation, tabsNodeId, targetNodeId} = descriptor || {};

        if (!operation || !nodeId) {
            return false
        }

        switch (operation) {
            case 'addTab': {
                // The addTab handler re-dispatches an already-contained item to moveItem, so a
                // descriptor targeting the maximized node can still RELOCATE the item out of a
                // sibling — that reaches beyond the node. Neutral only for a catalog-only item
                // or one already inside the maximized node.
                let source = Document.findContainingTabsId(me.dockModel, itemId);

                return tabsNodeId === nodeId && (!source || source === nodeId)
            }
            case 'closeItem':
                return Document.findContainingTabsId(me.dockModel, itemId) === nodeId;
            case 'moveItem':
                return targetNodeId === nodeId && Document.findContainingTabsId(me.dockModel, itemId) === nodeId;
            case 'setActiveItem':
                return tabsNodeId === nodeId;
            default:
                return false
        }
    }

    /**
     * The deterministic re-projection half of the transient contract: after a refresh, the
     * presentation is re-applied iff {@link #maximizedNodeId} still resolves to a projected
     * tabs node, and cleared otherwise — never a third outcome. Committed operations that reach
     * beyond the maximized node clear the transient BEFORE their refresh runs (see
     * {@link #onDockZoneDocumentChange}), and that clear is terminal, so this continuity path
     * only ever re-applies a transient that survived.
     * @protected
     */
    async syncDockMaximizeProjection() {
        let me     = this,
            nodeId = me.maximizedNodeId,
            tabContainer;

        if (!nodeId) {
            return
        }

        tabContainer = me.getDockHost()?.down?.({dockNodeId: nodeId});

        if (tabContainer && me.dockModel?.nodes?.[nodeId]?.type === 'tabs') {
            await me.applyDockMaximizePresentation(nodeId, {animate: false})
        } else {
            me.failDockMaximize(nodeId);

            // This method runs INSIDE refreshDockWorkspace. A value-bearing transition may be
            // waiting for this same refreshPromise before it applies, so awaiting the transition
            // here closes a refresh → transition → refresh cycle. No projected node remains to
            // restore in this branch; clear the independently-owned observer now and let the queued
            // reactive clear drain after this refresh releases its tail.
            await me.registerDockMaximizeResizeObserver(false)
        }
    }

    /**
     * Registers/unregisters the workspace root with the main-thread ResizeObserver addon — a
     * NEW observation scoped exactly to the maximize lifetime: no standing cost while
     * un-maximized, unregistered again on restore, node-clear and destroy.
     * @param {Boolean} register
     * @returns {Promise<void>}
     * @protected
     */
    async registerDockMaximizeResizeObserver(register) {
        let me         = this,
            {windowId} = me,
            addon;

        if (me.dockMaximizeResizeObserved === register || me.isDestroyed) {
            return
        }

        if (register && !me.dockMaximizeResizeWired) {
            me.dockMaximizeResizeWired = true;
            me.addDomListeners({resize: me.onDockMaximizeResize, scope: me})
        }

        addon = await Neo.currentWorker.getAddon('ResizeObserver', windowId);

        if (me.isDestroyed || !addon) {
            return
        }

        if (register && me.maximizedNodeId) {
            addon.register({componentId: me.id, id: me.id, windowId});
            me.dockMaximizeResizeObserved = true
        } else if (!register && me.dockMaximizeResizeObserved && !me.maximizedNodeId) {
            // The generation guard: a restore's deferred unregister can land AFTER a newer
            // maximize registered — the observation is keyed on the one workspace id, so tearing
            // it down here would leave the newer presentation blind. While any maximize is live,
            // the observation stays; the final restore (transient null) tears down.
            addon.unregister({componentId: me.id, id: me.id, windowId});
            me.dockMaximizeResizeObserved = false
        }
    }

    /**
     * Re-measures and re-applies the maximize rect while the workspace resizes — geometry only,
     * no motion. An unresolvable measurement takes the fail-safe restore path.
     * @param {Object} data
     * @protected
     */
    async onDockMaximizeResize(data) {
        let me     = this,
            nodeId = me.maximizedNodeId,
            rect, tabContainer;

        if (!nodeId) {
            return
        }

        rect = await me.measureDockMaximizeRect();

        if (!rect) {
            me.failDockMaximize(nodeId);
            return
        }

        if (me.maximizedNodeId !== nodeId) {
            return
        }

        await me.dockMaximizePlay;

        if (me.maximizedNodeId !== nodeId) {
            return
        }

        tabContainer = me.getDockHost()?.down?.({dockNodeId: nodeId});

        tabContainer && !tabContainer.isDestroyed && tabContainer.set({
            wrapperStyle: me.dockMaximizeRectStyle(rect)
        })
    }

    /**
     * The read half of the dock-holder contract (`src/ai/client/DockService.mjs`): the live
     * committed document, readable before any operation has run.
     * @returns {Object|null}
     */
    getDockZoneDocument() {
        return this.dockModel
    }

    /**
     * Header text for a projected pane's placeholder and default resolution.
     * @param {String} itemId
     * @param {Object} item The persisted item record.
     * @param {String} componentRef
     * @returns {String}
     */
    getPaneHeaderText(itemId, item, componentRef) {
        return item?.title ?? componentRef ?? itemId
    }

    /**
     * Hook: item ids whose live panes the consumer holds OUTSIDE the current projection and that
     * the reconciler must park rather than retire — for example a click-detached pane. Engine-owned
     * tear-out handles are merged separately and never depend on an app override. The default
     * holds none.
     * @returns {Iterable<String>}
     */
    getPreservedItemIds() {
        return []
    }

    /**
     * Hook: extra options for the reconciler's staged transaction. Exactly three keys are
     * SANCTIONED and consumed — `onProjectionStaged` (a tab-bar animation-suppression seam),
     * `waitForOverflowProjection` (an overflow-readiness wait), and `retainTopology` (a
     * host-forced stable-topology admission, winning over the commit's own value when present).
     * Every other returned key is DISCARDED: the projection identity — `host`, `nextConfig`,
     * `placeholders`, the merged `preserveItemIds`, `resolveItem`, `shellIndex`, `geometryOnly` —
     * is class-owned and mechanically unreachable from this hook. The default contributes
     * nothing.
     * @param {Object|null} document The committed document this refresh projects.
     * @param {Object} refreshOptions The options {@link #getRefreshOptions} produced for it.
     * @returns {Object}
     */
    getReconcileOptions(document, refreshOptions) {
        return {}
    }

    /**
     * Hook: the reconciler's fast-path options for the refresh a commit schedules —
     * `{geometryOnly}` for a pure `resizeSplit`, `{retainTopology}` for item-only deltas on a
     * proven-identical shell, `{preserveItemIds}` for owner-held ids known only at THIS commit (a
     * pane parked by the operation itself), merged with the standing {@link #getPreservedItemIds}
     * set. The default takes the full staged transaction every time. The committing surface passes
     * `descriptor` as it identifies the operation — engine surfaces pass the semantic descriptor;
     * a host's own paths may pass their options object — and the override maps whatever shapes its
     * commit sites produce.
     * @param {Object|null} descriptor The semantic operation that produced the document, when known.
     * @param {Object|null} source The committing surface, when it identifies itself.
     * @returns {Object}
     */
    getRefreshOptions(descriptor, source) {
        // Derived, not declined. `model/Operations` declares what each operation can change beside
        // the reducer that implements it, so the engine answers from knowledge a consumer cannot
        // have: only the reducer knows `setItemLocked` assigns one item field and touches `nodes`
        // nowhere, while `moveItem` restructures. Before this, the default was `{}` — the full
        // staged transaction for every commit — so one lock click re-parented the splits and edge
        // rows and every retained header in the app repainted.
        //
        // An operation with no declared class falls through to `topology`, i.e. exactly the old
        // behaviour, so a vocabulary that outgrows the map degrades to slow rather than to wrong.
        // Only the item-flag class is wired. `geometry` is declared honestly in the class map but
        // deliberately NOT emitted yet: on `dev` a resize takes the full transaction, this ticket
        // measured only the lock flicker, and its AC-4 requires resize to keep its current
        // behaviour. Putting every drag-resize on an unmeasured fast path is a separate change with
        // its own evidence, not a free rider on this one.
        if (Operations.changeClassFor(descriptor?.operation) === 'itemFlags') {
            return this.isDockRailedItem(descriptor?.itemId) ? {} : {retainTopology: true}
        }

        return {}
    }

    /**
     * @summary Whether an item currently renders on an edge rail rather than inside the shell.
     *
     * The change-class in `model/Operations` describes what an operation does to the DOCUMENT, and
     * it is exact: the three item-flag reducers clone and assign one field, touching `nodes` nowhere.
     * That is necessary for the item-only fast path but not sufficient, because a railed pane is
     * projected OUTSIDE the shell. `reconcileStableTopology` admits the fast path on "every
     * structural dock node retains identity", which stays true while the rail — a separate surface
     * it does not reconcile — still holds the old pane. The result is a stale rail copy beside a
     * fresh one, which is worse than the slow path this fast path replaces.
     *
     * So placement is the workspace's half of the answer: `Operations` cannot know it, and the
     * document alone does not carry it. Reconciling rail surfaces inside the stable-topology path
     * would let this guard retire; until then a railed item takes the full transaction.
     *
     * **This reads the PRE-COMMIT document, and that is only sound because it is reached solely for
     * placement-NEUTRAL operations.** `getRefreshOptions` runs before `dockModel` is reassigned, so
     * for an operation that moves a pane the answer here would describe where the item *was*, not
     * where it is going — `setItemAutoHidden(true)` would read "not railed" on the very commit that
     * rails it. That is why `setItemPinned` and `setItemAutoHidden` are classed `topology` rather
     * than guarded here: a placement change cannot be rescued by asking about placement beforehand.
     * `setItemLocked` never moves a pane, so before and after agree by construction.
     * @param {String|null} itemId
     * @returns {Boolean}
     * @protected
     */
    isDockRailedItem(itemId) {
        const item = itemId ? this.dockModel?.items?.[itemId] : null;

        return item?.autoHidden === true && item?.pinned !== true
    }

    /**
     * Returns the one-use projection correlation only when the committed descriptor creates a
     * globally absent header. `model.Operations` downgrades `addTab` to `moveItem` whenever the item
     * already lives in any tabs node; those identity-preserving relocations use FLIP alone. A
     * same-node reorder, malformed descriptor, restore, and initial path fail closed to an instant
     * projection.
     *
     * The returned object is deliberately normalized instead of retaining caller or runtime
     * fields, and is carried only by the scheduled projection closure — it never enters
     * {@link #dockModel}, a saved perspective, or persistence.
     * @param {Object} document The post-commit dock-zone document.
     * @param {Object|null} descriptor The semantic operation that produced `document`.
     * @returns {Object|null}
     * @protected
     */
    getTabInsertProjectionDescriptor(document, descriptor) {
        let {itemId, operation, tabsNodeId} = descriptor || {},
            oldItems                        = this.dockModel?.nodes?.[tabsNodeId]?.items,
            newItems                        = document?.nodes?.[tabsNodeId]?.items;

        return operation === 'addTab'
            && typeof itemId === 'string'
            && typeof tabsNodeId === 'string'
            && Array.isArray(oldItems)
            && Array.isArray(newItems)
            && !Document.findContainingTabsId(this.dockModel, itemId)
            && !oldItems.includes(itemId)
            && newItems.includes(itemId)
                ? {itemId, operation: 'addTab', tabsNodeId}
                : null
    }

    /**
     * The default in-window cross-zone drop seam: a dock tab header released outside its own
     * toolbar reports its release point here (via {@link Neo.dashboard.dock.interaction.TabSortZone}). The
     * producer resolves the placement kind from the pointer and every other tabs zone's rect — a
     * tabs node's parent-split orientation lets it choose `split-*` over an edge band —
     * `previewToOperation` maps that `dockPreview.v1` to the semantic operation, and exactly one
     * commit follows. A same-zone drop is a no-op (the within-toolbar reorder already committed);
     * a pointer over no zone commits nothing.
     * @param {Object} data
     * @param {Number} data.clientX
     * @param {Number} data.clientY
     * @param {String} data.itemId       The dock item id being dragged.
     * @param {String} data.sourceNodeId The tabs node the drag started in.
     */
    async onDockCrossZoneDrop({clientX, clientY, itemId, sourceNodeId}) {
        let me    = this,
            host  = me.getDockHost(),
            nodes = me.dockModel?.nodes || {},
            zones = Object.keys(nodes)
                .filter(nodeId => nodes[nodeId].type === 'tabs' && nodeId !== sourceNodeId)
                .map(nodeId => ({nodeId, container: host?.down({dockNodeId: nodeId})}))
                .filter(zone => zone.container);

        if (!zones.length) {
            return
        }

        let rects = await me.getDomRect(zones.map(zone => zone.container.id));

        if (me.isDestroyed) {
            return
        }

        let producerZones = zones
                .map((zone, index) => ({
                    nodeId     : zone.nodeId,
                    rect       : rects[index],
                    orientation: Object.values(nodes).find(node => node.type === 'split' && node.children?.includes(zone.nodeId))?.orientation ?? null
                }))
                .filter(zone => zone.rect),
            preview    = me.dockPreviewProducer?.produce({pointer: {x: clientX, y: clientY}, zones: producerZones, itemId, sourceNodeId}),
            descriptor = preview && previewToOperation(preview);

        if (descriptor) {
            let result = me.applyDockZoneOperation(descriptor);

            if (result && !result.errors?.length && result.document) {
                me.onDockZoneDocumentChange(result.document, descriptor, me)
            }
        }
    }

    /**
     * The view-sync half of the holder contract, called by every committing surface on success
     * (a splitter, a rail, the cross-zone drop, the Neural Link dock service): stores the committed
     * document and schedules the re-projection.
     *
     * Deferred one tick: commits fire synchronously from inside the committing surface's handler
     * (e.g. a splitter's `onDragEnd`), and reconciliation retires that surface with its old shell —
     * refreshing mid-handler would be a use-after-destroy on the rest of the handler. Every
     * projection is an atomic ownership transaction across the old shell, the staged shell, and
     * their closest common parent; scheduling off the SETTLED tail of {@link #refreshPromise}
     * preserves that atomicity across rapid commits AND keeps one failed transaction from
     * suppressing every later one: each commit's {@link #refreshPromise} snapshot carries that
     * refresh's own outcome, so a rejection is the awaiting caller's to observe and the next
     * commit still projects. The one-use `addTab` correlation and the refresh options are captured
     * in THIS closure, so they are consumed by exactly one projection.
     * @param {Object|null} document The committed dock-zone document; `null` clears the workspace
     *     toward the empty projection.
     * @param {Object|null} [descriptor=null] The semantic operation that produced `document`.
     * @param {Object|null} [source=null] The committing surface, when it identifies itself.
     */
    onDockZoneDocumentChange(document, descriptor=null, source=null) {
        let me = this,
            tabInsertDescriptor, refreshOptions, tail;

        // A committed operation clears maximize BEFORE applying — and that clear is terminal:
        // the re-projection continuity in refreshDockWorkspace() re-applies only a transient
        // that survived, never one an operation cleared. Operations confined to the maximized
        // node itself (activating a tab, reordering or closing within it) are the exception:
        // they defer to that same continuity rule, which re-applies onto the surviving node —
        // without the exception, switching tabs INSIDE a maximized pane would restore it.
        if (me.maximizedNodeId && !me.isDockMaximizeNeutralOperation(descriptor)) {
            me.dockMaximizeMotion = 'instant';
            me.maximizedNodeId    = null
        }

        tabInsertDescriptor = me.getTabInsertProjectionDescriptor(document, descriptor);
        refreshOptions      = me.getRefreshOptions(descriptor, source);
        tail                = me.refreshPromise?.catch(() => {}) || Promise.resolve();

        me.dockModel = document;
        // A currently revealed rail pane is retained outside tab chrome. It already exists at the
        // commit boundary, so lock presentation follows the sole worker-truth write immediately;
        // the post-reconcile sweep repeats this for newly materialized/retained surfaces.
        me.enableDockLockAction && me.syncDockLockRails?.();

        me.refreshPromise = tail
            .then(() => me.timeout(0))
            .then(() => {
                if (!me.isDestroyed) {
                    return me.refreshDockWorkspace(tabInsertDescriptor, document, refreshOptions)
                }
            })
    }

    /**
     * Projects a committed document into the dock shell config, threading the instance-bound
     * reducer and view-sync onto every projected affordance, the consumer's resolvers, and the
     * hook-provided options. {@link #dockProjectionConfig} is merged onto the result.
     *
     * This Workspace's component id is always the ordinary tab-sort boundary, so a sort-first
     * gesture can leave its source toolbar and reach sibling dock zones without enabling tear-out.
     * An explicit `dockTearOutBoundaryContainerId` supplied by {@link #getDockProjectionOptions}
     * keeps higher precedence inside the adapter.
     *
     * A `null` document projects the EMPTY shell — the model contract's recoverable fallback
     * (`dockModel === null` → empty projection) — still carrying the `neo-dashboard`
     * default-carrier class, so the token floor reaches an empty workspace.
     * @param {Object|null} [tabInsertDescriptor=null] One-use normalized `addTab` correlation.
     * @param {Function|null} [itemResolver=null] Item resolver for a staged projection (the
     *     reconciler's placeholder factory); `null` resolves through {@link #resolvePane}.
     * @param {Object|null} [document=this.dockModel] Committed document snapshot to project.
     * @returns {Object}
     */
    projectDockModel(tabInsertDescriptor=null, itemResolver=null, document=this.dockModel) {
        let me = this,
            config;

        if (!document) {
            config = {ntype: 'container', cls: ['neo-dashboard'], items: []}
        } else {
            config = LayoutAdapter.project(document, {
                onDockCrossZoneDrop: me.onDockCrossZoneDrop.bind(me),
                ...me.getDockProjectionOptions(),
                // The Workspace component is the DOM-root authority for ordinary cross-zone tab
                // motion. An explicit dockTearOutBoundaryContainerId from the hook still wins in
                // LayoutAdapter; direct adapter consumers must supply this field themselves.
                dockWorkspaceBoundaryContainerId: me.id,
                onDockActiveIndexChange         : me.onDockActiveIndexChange.bind(me),
                // Bound unconditionally: a host can project its OWN header actions without enabling
                // the close action, and wiring the seam inside that opt-in left those intents with
                // nowhere to arrive.
                onDockHeaderAction   : me.onDockHeaderAction.bind(me),
                enableDockCloseAction: me.enableDockCloseAction,
                ...(me.enableDockLockAction && {
                    dockLockIconCls     : me.dockLockIconCls,
                    dockUnlockIconCls   : me.dockUnlockIconCls,
                    enableDockLockAction: true
                }),
                enableDockMaximizeAction : me.enableDockMaximizeAction,
                enableDockPinAction      : me.enableDockPinAction,
                enableDockPopOutAction   : me.enableDockPopOutAction,
                enableDockReloadAction   : me.enableDockReloadAction,
                dockActionTooltips       : me.dockActionTooltips,
                dockMaximizeIconCls      : me.dockMaximizeIconCls,
                dockPopOutActionAvailable: me.dockPopOutActionActive,
                dockPopOutIconCls        : me.dockPopOutIconCls,
                applyDockZoneOperation   : me.applyDockZoneOperation.bind(me),
                onDockZoneDocumentChange : me.onDockZoneDocumentChange.bind(me),
                resolveComponentRef      : itemResolver || ((componentRef, item, itemId) => me.resolveProjectedPane(itemId, item)),
                resolveRevealComponentRef: (componentRef, item, itemId) => me.decorateFlipMarker(me.resolveRevealPane(itemId, item), itemId),
                syncDockLockPane         : (pane, itemId) => me.syncDockLockItemPresentation({
                    locked: me.dockModel?.items?.[itemId]?.locked === true,
                    pane
                }),
                tabInsertDescriptor
            })
        }

        return me.dockProjectionConfig ? {...config, ...me.dockProjectionConfig} : config
    }

    /**
     * Re-projects a committed document through the identity-preserving reconciler: the outgoing
     * geometry is FLIP-snapshotted FIRST, then the consumer's chrome hook runs (so chrome mutation
     * can never alter the captured first rects), the staged shell is projected with hidden
     * placeholders, the reconciler hands every surviving pane and tab button into it, and the FLIP
     * play brackets the motion signal. Any motion failure lands the new layout instantly — the
     * try/catch guards motion, never truth.
     *
     * A `null` document reconciles toward the EMPTY projection: every pane retires, the shell
     * survives. A configured {@link #dockHostReference} that resolves to no live host throws —
     * the committed document is not rendered, and that must fail loudly, never settle silently.
     * Before the first mount, the host's own {@link Neo.component.Base#promiseUpdate} is the
     * ordering boundary: it settles when the initial tree mounts (or rejects on destruction), so
     * the reconciler can never insert a staging shell into the tree that `initVnode()` is serializing.
     * The reconciler's outcome is captured and its `landedInPlace` — the path it ACTUALLY took,
     * never the requested one — rides the FLIP play as `geometryOnly`; after the play is
     * dispatched, {@link #afterRefreshDockWorkspace} is awaited with the outcome and the play's
     * settled-safe promise.
     * @param {Object|null} [tabInsertDescriptor=null] One-use normalized `addTab` correlation
     *     captured by the commit that scheduled this refresh.
     * @param {Object|null} [document=this.dockModel] Committed document snapshot owned by this
     *     refresh.
     * @param {Object} [refreshOptions={}]
     * @param {Boolean} [refreshOptions.geometryOnly=false] Admit the reconciler's strict in-place
     *     geometry path.
     * @param {String[]} [refreshOptions.preserveItemIds] Per-commit owner-held ids, merged with
     *     the standing {@link #getPreservedItemIds} set.
     * @param {Boolean} [refreshOptions.retainTopology=false] Admit in-place item reconciliation on
     *     a proven-identical structural shell.
     * @returns {Promise<void>}
     * @protected
     */
    async refreshDockWorkspace(tabInsertDescriptor=null, document=this.dockModel, refreshOptions={}) {
        const
            me                 = this,
            host               = me.getDockHost(),
            flip               = Neo.main?.addon?.DockFlip,
            placeholders       = new Map(),
            {flipMarkerPrefix} = me,
            {geometryOnly=false, retainTopology=false} = refreshOptions;

        if (!host) {
            throw new Error(`Workspace ${me.id}: dockHostReference "${me.dockHostReference}" resolved to no live dock host — the committed document is not rendered`)
        }

        if (!host.mounted) {
            try {
                await host.promiseUpdate()
            } catch (error) {
                if (error === Neo.isDestroyed || me.isDestroyed || host.isDestroyed) {
                    return
                }

                throw error
            }
        }

        if (me.isDestroyed || host.isDestroyed) {
            return
        }

        try {
            // windowId routes the call to the host's OWN main thread: without it, SharedWorker
            // port resolution falls back to the first connected window — the wrong realm the
            // moment a second window exists.
            await flip?.captureFirst({hostId: host.id, markerPrefix: flipMarkerPrefix, windowId: host.windowId})
        } catch (error) {/* instant landing */}

        if (me.isDestroyed) {
            return
        }

        me.beforeRefreshDockWorkspace(document, refreshOptions);

        await me.releaseStaleRevealPanes(document);

        if (me.isDestroyed) {
            return
        }

        const nextConfig = me.projectDockModel(tabInsertDescriptor, (componentRef, item, itemId) => {
            const placeholder = me.createProjectionPlaceholder(itemId, item, componentRef);

            placeholders.set(itemId, placeholder);

            return placeholder
        }, document);

        // The hook extends the reconciler's SEAMS, never its identity: only the three sanctioned
        // keys are read off its result — a hostile or accidental override cannot displace the
        // class-owned projection identity below.
        const {onProjectionStaged, retainTopology: forcedRetainTopology, waitForOverflowProjection} =
            me.getReconcileOptions(document, refreshOptions) || {};

        const projection = {
            geometryOnly,
            host,
            nextConfig,
            onProjectionStaged,
            placeholders,
            preserveItemIds: [...new Set([
                ...me.getPreservedItemIds(),
                ...(me.enableDockTearOutLifecycle ? Object.keys(me.tearOutPaneHandles) : []),
                ...(refreshOptions.preserveItemIds || [])
            ])],
            resolveItem    : itemId => {
                const item = document?.items?.[itemId];

                return LayoutAdapter.decorateProjectedItem(
                    me.resolveProjectedPane(itemId, item),
                    itemId,
                    item,
                    {
                        nodeId: tabInsertDescriptor?.tabsNodeId,
                        tabInsertDescriptor
                    }
                )
            },
            retainTopology: forcedRetainTopology ?? retainTopology,
            shellIndex    : me.dockShellIndex,
            waitForOverflowProjection
        };

        // `try`/`await` rather than a `.catch()` on the call: the reconciler is the seam consumers and
        // specs substitute, and a double is free to return a plain result rather than a promise.
        // Chaining `.catch()` onto the return would make this method require a thenable that the
        // contract never promised — a pre-existing spec double proved it by throwing here.
        let result;

        try {
            result = await Reconciler.reconcileProjection(projection)
        } catch (error) {
            result = me.onDockProjectionFailed(error, document, tabInsertDescriptor, refreshOptions)
        }

        // The failure path owns the remainder of this cycle. Running the maximize sync and the FLIP
        // over a shell the committed document does not describe would animate the recovery itself,
        // and `afterRefreshDockWorkspace` consumers read `result` as a completed projection.
        if (result === null) return;

        // Awaited on purpose: refreshPromise is the settled-surface contract, and a maximize
        // presentation that re-applies after it settles is a surface nobody can await.
        await me.syncDockMaximizeProjection();

        // FLIP phase 2: fire-and-forget by default — the addon self-waits for the swap, inverts and
        // plays; the counted motion signal brackets the awaited animation window. Gate on the
        // CAPABILITY, not on the addon's presence: a partial addon (a test double, a degraded main
        // thread) must land the layout instantly rather than throw after the document already
        // committed. `geometryOnly` rides the reconciler's ACTUAL path, never the requested one.
        let played = null;

        if (typeof flip?.play === 'function' && !me.isDestroyed) {
            let rawPlayed;

            MotionSignal.enter(me);

            try {
                rawPlayed = flip.play({geometryOnly: result?.landedInPlace === true, hostId: host.id, markerPrefix: flipMarkerPrefix, windowId: host.windowId})
            } catch (error) {
                rawPlayed = Promise.reject(error)
            }

            played = Promise.resolve(rawPlayed).catch(() => null);
            played.finally(() => MotionSignal.leave(me))
        }

        if (!me.isDestroyed) {
            await me.afterRefreshDockWorkspace({document, refreshOptions, result, played});

            // Header-action state syncs on the SETTLED tree, never beside the projection
            // application: a bar write with the refresh's own update train still open is the
            // collision that duplicated retained chrome on slow rigs. Every write is
            // change-guarded, so post-settle is both the safe and the idempotent slot.
            me.syncDockHeaderActions();

            // Once more on SETTLED chrome: the pre-settle sync above can run while projected
            // header actions are still instantiating (a fresh boot's first refresh), and a
            // pane-dependent action state (reload's contract probe) corrected on chrome that
            // does not exist yet is a correction nobody received. Every write in the sync is
            // change-guarded, so re-running it on settled chrome is idempotent.
            me.syncDockHeaderActions()
        }
    }

    /**
     * @summary Surfaces a failed dock projection and spends ONE clean re-projection repairing it.
     *
     * A projection phase that rejects has already settled the host back to a single visible shell
     * ({@link Neo.dashboard.dock.projection.Reconciler#settleFailedProjection}), so what is left is
     * a shell whose CONTENT may lag the committed document. The document itself is untouched by a
     * failed projection and a rejected vdom flight adopts no vnode, so re-projecting from that same
     * document is the repair — this is the caller-side half of the reject-then-re-diff contract that
     * `VdomLifecycle#executeVdomUpdate` provides.
     *
     * Observability is the other half of the fix. Before this, the rejection escaped as an unhandled
     * rejection: `onDockZoneDocumentChange` attaches its `.catch` to the PREVIOUS refresh, never the
     * one it is starting, so nothing on the live path ever saw the failure.
     *
     * **Exactly one retry.** A deterministic failure must not hot-loop, so the re-projection carries
     * `isDockProjectionRetry` and a second failure surfaces without scheduling a third attempt. The
     * retry replaces `refreshPromise` rather than chaining onto it — the current value IS this cycle,
     * and awaiting it from inside itself would never settle.
     * @param {Error} error The failure, marked `isDockProjectionFailure` with a `projectionRecovery` verdict.
     * @param {Object} document The committed dock document the repair re-projects from.
     * @param {Object} tabInsertDescriptor
     * @param {Object} [refreshOptions={}]
     * @returns {null} Signals the caller that this cycle is over and was handled.
     * @protected
     */
    onDockProjectionFailed(error, document, tabInsertDescriptor, refreshOptions={}) {
        const me = this;

        // Only the transaction's own typed failure is recoverable this way. Anything else is a bug
        // in the projection inputs and must keep its original loud path.
        if (!error?.isDockProjectionFailure) {
            throw error
        }

        const isRetry  = refreshOptions.isDockProjectionRetry === true,
              recovery = error.projectionRecovery;

        console.warn(
            `Dock projection failed (${recovery}); ${isRetry ? 'the repair attempt failed too, not retrying again' : 'scheduling one clean re-projection'}`,
            me.id, error
        );

        me.fire('dockProjectionFailed', {component: me, error, isRetry, recovery});

        if (!isRetry && !me.isDestroyed) {
            me.refreshPromise = me.timeout(0).then(() => {
                if (!me.isDestroyed) {
                    return me.refreshDockWorkspace(tabInsertDescriptor, document, {
                        ...refreshOptions,
                        isDockProjectionRetry: true
                    })
                }
            })
        }

        return null
    }

    /**
     * Hook: resolves a catalog item to the live component or the plain config that renders it.
     * The default renders a titled placeholder pane — the model contract's recoverable fallback
     * for an item no consumer claimed — so a workspace is never silently empty; every consumer
     * overrides this with its own panes. The title renders as ESCAPED text: persisted titles are
     * data, never markup. A thrown error fails the projection loudly.
     * @param {String} itemId The stable workspace identity from the item catalog.
     * @param {Object} item The persisted item record (`componentRef`, `title`, `kind`, policy hints).
     * @returns {Object|Neo.component.Base}
     */
    resolvePane(itemId, item) {
        return {
            cls  : ['neo-dock-workspace-placeholder'],
            ntype: 'component',
            text : this.getPaneHeaderText(itemId, item, item?.componentRef)
        }
    }

    /**
     * The resolution the projection consumes: the consumer's {@link #resolvePane} result, stamped
     * with the FLIP marker.
     * @param {String} itemId
     * @param {Object} item The persisted item record.
     * @returns {Object|Neo.component.Base}
     * @protected
     */
    resolveProjectedPane(itemId, item) {
        const returning = this.returningTearOutPanes?.[itemId];

        if (returning) {
            delete this.returningTearOutPanes[itemId];

            if (!returning.isDestroyed) {
                returning.parent?.remove(returning, false);
                return returning
            }
        }

        return this.decorateFlipMarker(this.resolvePane(itemId, item), itemId)
    }

    /**
     * Hook: resolves a catalog item for an auto-hide reveal overlay. Defaults to
     * {@link #resolvePane}; override when a reveal must render differently from the tab flow.
     * @param {String} itemId
     * @param {Object} item The persisted item record.
     * @returns {Object|Neo.component.Base}
     */
    resolveRevealPane(itemId, item) {
        return this.resolvePane(itemId, item)
    }

    /**
     * Hook: produces a **fresh** candidate pane for an item, bypassing any live-instance cache.
     *
     * Deliberately a separate hook rather than an option on {@link #resolvePane}. Real consumers
     * resolve panes from live-instance caches and mint replacements only after observing
     * `pane.isDestroyed`; an option those consumers do not implement would be silently ignored and
     * hand back **the very instance the recreate is meant to replace**. A distinct hook cannot be
     * accidentally satisfied by a cache, and its default says the honest thing: this consumer does
     * not support recreate.
     *
     * Returning `null` is a legitimate answer, not a failure of contract — it declines the
     * capability, and {@link #prepareRecreateCandidate} reports that as a named refusal with the
     * live pane untouched.
     * @param {String} itemId The stable workspace identity from the item catalog.
     * @param {Object} item The persisted item record.
     * @returns {Object|Neo.component.Base|null}
     */
    resolveFreshPane(itemId, item) {
        return null
    }

    /**
     * Whether this workspace can serve a recreate at all — i.e. whether a consumer overrode
     * {@link #resolveFreshPane}.
     *
     * Derived from the prototype rather than by calling the factory, because this is consulted by
     * {@link #syncDockReloadAction} on every active-item change and a visibility sync must not have
     * side effects: invoking a consumer factory to decide whether to show a button would mint panes
     * nobody asked for.
     *
     * It answers "is the capability wired", not "will this particular item succeed". A consumer that
     * overrides the hook and then declines a specific item still gets a **visible** action that
     * settles with a named refusal — which is the honest behaviour: hiding it would leave a wedged
     * pane with no affordance and no explanation.
     * @returns {Boolean}
     */
    hasDockRecreateFallback() {
        return this.resolveFreshPane !== Workspace.prototype.resolveFreshPane
    }

    /**
     * Phase 1 of the two-phase recreate transaction: obtain and validate a fresh candidate **without
     * touching the live pane**.
     *
     * Rollback is by construction rather than by repair — nothing is destroyed here, so every
     * refusal below leaves the workspace exactly as it was. The docking record's user-triggered
     * recreate exception is conditioned on this phase — without a validated candidate the exception
     * does not apply and the never-destroyed guarantee stands unmodified.
     * @see ADR 0029 §2.6 — ticket-ref-ok: the record IS this method's authority, not a tracking ref;
     *      the contract is unreadable without it and an accepted ADR section does not close.
     *
     * The three refusals are the ones a cache-backed resolver actually produces:
     *
     * | refusal | why it is not a candidate |
     * |---|---|
     * | `threw` | the factory raised; the error is carried, never swallowed |
     * | `declined` | returned `null` — including the default, i.e. recreate unsupported |
     * | `live-instance` | returned the pane that is already mounted, so "replacing" it is a no-op that would destroy the only copy |
     *
     * The `live-instance` check is the load-bearing one and the reason a factory seam alone is not
     * enough: a resolver reading its own cache answers with the current instance, which looks like a
     * successful candidate and is the exact shape that turns a recovery click into silent pane loss.
     * @param {String} itemId The stable workspace identity from the item catalog.
     * @param {Neo.component.Base} livePane The currently mounted pane for that item.
     * @returns {{ok: Boolean, candidate: ?Object, reason: ?String, error: ?Error}}
     */
    prepareRecreateCandidate(itemId, livePane) {
        // The same read the rest of this class uses for a catalog record; an item the committed
        // document does not carry resolves to null and the factory decides what that means.
        const item = this.dockModel?.items?.[itemId] || null;

        let candidate;

        try {
            candidate = this.resolveFreshPane(itemId, item)
        } catch (error) {
            return {ok: false, candidate: null, reason: 'threw', error}
        }

        if (!candidate) {
            return {ok: false, candidate: null, reason: 'declined', error: null}
        }

        // Identity, not equality: a config object that merely describes the same pane is a valid
        // candidate; the mounted instance itself is not.
        if (livePane && candidate === livePane) {
            return {ok: false, candidate: null, reason: 'live-instance', error: null}
        }

        return {ok: true, candidate, reason: null, error: null}
    }

    /**
     * Phase 2 of the two-phase recreate transaction: replace exactly the card-body slot, then — and
     * only then — destroy the instance that was there.
     *
     * **Never a bare destroy.** `core.Base#destroy` unregisters an instance without removing it from
     * `parent.items`, and the reconciler fills its live map positionally from `body.items` and
     * prefers that entry over the resolver. A destroyed-but-still-listed pane is therefore handed
     * back as the live answer on the very next refresh. Structural removal belongs to the container,
     * so this goes through `removeAt` + `insert`.
     *
     * `removeAt`'s `destroyItem` argument **defaults to true** and is passed `false` here. That
     * default is the whole ordering hazard: taking it would destroy the old pane during removal, so
     * a failure to insert the candidate afterwards would leave the slot empty with nothing to
     * restore — the silent pane loss this transaction exists to prevent.
     *
     * Only the card body is touched, so tab, header-action and overflow identities are preserved by
     * construction rather than by repair: the tab bar is never in the mutation path.
     * @param {Neo.component.Base} livePane The mounted pane to replace.
     * @param {Object|Neo.component.Base} candidate A candidate validated by
     *     {@link #prepareRecreateCandidate} — never call this with an unvalidated one.
     * @returns {{ok: Boolean, index: Number, pane: ?Neo.component.Base, reason: ?String}}
     */
    commitRecreateCandidate(livePane, candidate) {
        // Teardown mid-transaction. Phase 1 and Phase 2 are separate calls, so a workspace or tab
        // container can be destroyed in the gap between validating a candidate and committing it —
        // a pane closed, a vessel torn down, a window disconnected. Every one of those must settle
        // as a **refusal**, not as a throw and not as a partial mutation: by this point the caller
        // holds a validated candidate and would otherwise commit it into a corpse.
        //
        // Checked before the container is touched, so a torn-down transaction mutates nothing at all
        // rather than mutating and then failing.
        if (!livePane || livePane.isDestroyed || this.isDestroyed) {
            return {ok: false, index: -1, pane: null, reason: 'torn-down'}
        }

        const container = livePane.parent;

        if (!container || container.isDestroyed) {
            return {ok: false, index: -1, pane: null, reason: 'no-container'}
        }

        const index = container.indexOf(livePane.id);

        if (index < 0) {
            return {ok: false, index, pane: null, reason: 'not-in-container'}
        }

        // INSERT FIRST, then remove. The reverse order — remove, then insert — has a window between
        // the two calls where the slot is empty and the predecessor is orphaned, and an `insert`
        // that throws (an invalid candidate config is ordinary consumer input) leaves it that way
        // permanently. That is the silent pane loss this whole transaction exists to prevent, so the
        // failure mode cannot live inside the commit either.
        //
        // Inserting at `index` shifts the predecessor to `index + 1`; nothing is removed until the
        // candidate is demonstrably in the container.
        let pane;

        try {
            // `candidate` may be a config; the container owns instantiation and returns the exact
            // component that entered the live slot. Returning that identity is what lets a
            // cache-backed consumer adopt the commit rather than the unmaterialized input.
            pane = container.insert(index, candidate)
        } catch (error) {
            // Nothing was removed, so there is nothing to restore — rollback by construction here
            // too, not by repair.
            return {ok: false, index, pane: null, reason: 'insert-failed', error}
        }

        // `false`: the predecessor must outlive its own removal, so a failure here still leaves a
        // live pane in the container rather than a destroyed one.
        container.removeAt(index + 1, false);

        // The candidate is in the slot; the predecessor is now safe to release. The ordering is the
        // contract, not an implementation detail.
        livePane.destroy();

        return {ok: true, index, pane, reason: null, error: null}
    }

    /**
     * The two phases run as one transaction, settling exactly once through a named channel.
     *
     * Mirrors the reload leaf's contract deliberately — `dockReloadSettled` / `dockReloadInFlight` —
     * because a second settlement channel with different semantics on the same header would be a
     * worse cost than the duplication. **Every completion settles**, including each refusal: the
     * action wire has no result channel (`Observable.fire` discards listener returns), so an
     * unsettled early return is an invocation the event contract never saw.
     *
     * Unlike reload this is **synchronous** — both phases are — so there is no producer to trap and
     * no async teardown race. Teardown is still handled, by
     * {@link #commitRecreateCandidate}'s `torn-down` refusal, and it settles through this channel
     * like everything else.
     *
     * **Single-flight per item, and absorption is the only silent path** — a re-entrant invocation
     * during the window neither runs nor settles, exactly as reload's does. Re-entrancy is not
     * hypothetical here: `resolveFreshPane` is consumer code, and a consumer that recreates from
     * inside its own factory would otherwise recurse.
     * @param {String} itemId The stable workspace identity from the item catalog.
     * @param {Neo.component.Base} livePane The mounted pane to replace.
     * **`settle: false` is for callers that own the settlement themselves.** The reload action is
     * the one in tree: it serves a contract-less pane through this transaction and then settles on
     * `dockReloadSettled`, so firing here too would emit **two terminal events for one activation**.
     * The single-flight guard still applies — only the event is suppressed, never the transaction.
     * @param {Object} [options]
     * @param {String|null} [options.dockNodeId=null] Carried through to the settlement payload.
     * @param {Boolean} [options.settle=true] `false` when an outer channel settles this invocation.
     * @returns {{errors: String[],pane: ?Neo.component.Base}|null} `pane` is the exact committed
     *     component; `null` when the transaction refused or an in-flight invocation absorbed it.
     * @protected
     */
    recreateDockPane(itemId, livePane, {dockNodeId=null, settle=true}={}) {
        const me     = this,
              errors = [];
        let pane = null;

        // Absorption: neither runs nor settles. The only silent path, by design.
        if (me.dockRecreateInFlight.has(itemId)) {
            return null
        }

        me.dockRecreateInFlight.add(itemId);

        try {
            const prepared = me.prepareRecreateCandidate(itemId, livePane);

            if (!prepared.ok) {
                // The refusal reason IS the error. A caller that only learns "it failed" cannot tell
                // a consumer that declined the capability from one whose factory handed back the
                // live instance — and those need different fixes.
                errors.push(`Dock recreate refused for item "${itemId}": ${prepared.reason}`);

                prepared.error && errors.push(prepared.error.message)
            } else {
                const committed = me.commitRecreateCandidate(livePane, prepared.candidate);

                if (!committed.ok) {
                    errors.push(`Dock recreate could not commit item "${itemId}": ${committed.reason}`);

                    committed.error && errors.push(committed.error.message)
                } else {
                    pane = committed.pane
                }
            }
        } finally {
            me.dockRecreateInFlight.delete(itemId)
        }

        settle && !me.isDestroyed && me.fire('dockRecreateSettled', {dockNodeId, errors, itemId});

        return {errors, pane}
    }
}

export default Neo.setupClass(Workspace);
