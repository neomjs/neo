import Component                   from '../../component/Base.mjs';
import Container                   from '../../container/Base.mjs';
import NeoArray                    from '../../util/Array.mjs';
import {isDescriptor}              from '../../core/ConfigSymbols.mjs';
import ClassSystemUtil             from '../../util/ClassSystem.mjs';
import HeaderActionPolicy          from './projection/HeaderActionPolicy.mjs';
import LayoutAdapter               from './projection/LayoutAdapter.mjs';
import Maximize                    from './plugin/Maximize.mjs';
import MotionSignal                from './projection/MotionSignal.mjs';
import PreviewProducer             from './interaction/PreviewProducer.mjs';
import Reconciler                  from './projection/Reconciler.mjs';
import StateProvider               from '../../state/Provider.mjs';
import {createDockTearOutHandlers} from './window/TearOut.mjs';
import WorkspaceDocument           from './model/WorkspaceDocument.mjs';
import Operations                  from './model/Operations.mjs';
import {previewToOperation}        from './model/PreviewContract.mjs';
import TopologySeams               from './window/TopologySeams.mjs';

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
 * @see Neo.dashboard.dock.projection.HeaderActionPolicy
 * @see Neo.dashboard.dock.projection.LayoutAdapter
 * @see Neo.dashboard.dock.projection.Reconciler
 * @see Neo.dashboard.dock.model.WorkspaceDocument
 * @see learn/agentos/DockZoneModel.md
 * @see learn/guides/uibuildingblocks/DockLayouts.md
 */
class Workspace extends Container {
    static config = {
        /**
         * A topology restore resolves its holder as the component carrying the dock document, so
         * the seams must be here; their implementation is not.
         * @member {Neo.core.Base[]} mixins=[TopologySeams]
         */
        mixins: [TopologySeams],
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
         * inert and drag-token ownership for unlock.
         *
         * On by default, like the other five. It was the one action a host had to ask for, from a
         * time when the engine did not yet own it: the lock action, the pane delegation contract
         * and the `itemFlags` change class that keeps a toggle from restaging the shell all landed
         * afterwards, leaving a host enabling this to supply nothing. `false` remains the explicit
         * opt-out, and withholds the icon configs from the projection context with it.
         *
         * The content half is delegable, exactly like reload: a pane implementing
         * `dockLock(locked: Boolean): void` owns what locked means for its content (a form
         * disables its fields, a grid turns cell editing off, a read-only view keeps scrolling
         * and selecting) and receives `true` on lock and `false` on unlock, once per transition,
         * on the in-flow card and on the revealed rail pane alike; the engine then writes no
         * `inert` at all. The probe is a pure `typeof` on the live card, never a resolver call.
         * The structural half — the reducer's refusals, the hidden close action, the suppressed
         * drag source, the `neo-dock-pane-locked` frame cue — is never delegated.
         * @member {Boolean} enableDockLockAction=true
         */
        enableDockLockAction: true,
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
         * Projects one engine-owned reload action into each Dock tab header — runtime only: no
         * operation is committed and the document never changes. A pane implementing
         * `dockReload(): void | Promise<*>` owns what reload means (its stores, caches, re-render —
         * the author's decision, opted into by implementing the method), decided by a pure `typeof`
         * probe on the live card, never a resolver call; a pane without the contract keeps the
         * action and is served by the engine's recreate — the two-phase transaction that replaces
         * the live pane only after a validated fresh candidate exists (docking design record §2.6,
         * as amended). The action hides only where the host declared no recreate through
         * {@link #hasDockRecreateFallback}. One invocation per item may be in flight (the action
         * disables for the window), and every completion — sync throw, async rejection, async
         * success — settles exactly once through the `dockReloadSettled` event
         * (`{dockNodeId, itemId, errors}`); a failing `dockReload()` keeps the pane, always.
         * Enabled by default; explicit `false` removes the action.
         * @member {Boolean} enableDockReloadAction=true
         */
        enableDockReloadAction: true,
        /**
         * Installs the engine-owned maximize toggle, {@link Neo.dashboard.dock.plugin.Maximize},
         * at construction unless the consumer already supplied one through `plugins`. The plugin
         * owns every maximize member — the projected action and its icons, the transient
         * `maximizedNodeId`, the FLIP motion, the resize re-measurement and the `Escape` restore.
         * Enabled by default; explicit `false` creates no plugin, so the workspace projects no
         * toggle, registers no observer and binds no key.
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
         * The header-action presentation policy: which engine action is shown, enabled or pressed
         * for which pane, re-derived onto the retained action instances after every commit and
         * active-item change. Resolved to one instance bound to this workspace — a module config or
         * an instance replaces the engine policy without overriding workspace methods, at
         * construction or live: the replacement inherits the retiring policy's lock-restore memory
         * before that policy is destroyed, so a lock held across the swap still unwinds exactly.
         * @member {Neo.dashboard.dock.projection.HeaderActionPolicy|Object|null} dockHeaderActionPolicy_=null
         * @reactive
         */
        dockHeaderActionPolicy_: null,
        /**
         * Tooltip texts of the engine-owned header actions and the rail's reveal pin, keyed by
         * action state: `lock` / `unlock`, `reload`, `unpin`, `popOut`, `maximize` / `restore`,
         * `close`, `revealPin`. A consumer restates wording or language per key: the map deep-merges
         * over these defaults, and a key set to `null` leaves that action without a tooltip — for a
         * toggle, in the state that key names: a `null` `unlock` clears the tooltip while the pane is
         * locked and `lock` restores it on unlock. Both halves of a toggle reach the action as its
         * declared pair, and {@link Neo.toolbar.ActionButton} keeps text, icon and accessible name
         * coherent on the retained instance from whichever half `pressed` selects.
         *
         * A half that is simply ABSENT behaves as a `null` one: supplying `lock` without `unlock`
         * gives that toggle a tooltip while unpressed and none while pressed. The pressed state
         * never inherits the other half's text, because a tooltip naming the state the control
         * just left is worse than none.
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
         * The workspace-level node of the app's provider hierarchy. Header truth lives here under
         * `dock` — per item `closable` / `lockable` / `locked` / `pinnable` / `edge` / `reloadable`, per
         * tabs node the presented item, flights and capabilities — published once per commit by
         * {@link Neo.dashboard.dock.projection.HeaderActionPolicy#publishDocument} and bound by the
         * projected header actions, which resolve this provider through the component tree like any
         * bound component. A consumer's own `stateProvider` config replaces this default and hosts
         * the same keys beside its own; the chain above is untouched either way.
         * @member {Object} stateProvider={module: StateProvider}
         */
        stateProvider: {module: StateProvider},
        /**
         * The Group this workspace belongs to — learned from its window's accepted binding and kept for
         * the workspace's lifetime. A reload releases the window's slot and rebinds the next generation,
         * a vessel closes, a lease runs out: the documents this workspace's host registered stay this
         * Group's, reached through this value and never through the live binding. `null` until the
         * binding is accepted — a first boot mints its identity and awaits the carrier, so the value
         * arrives through {@link #onTopologyBind} after construction; a never-bound host has no
         * membership to reach. Hosts register their participants from {@link #afterSetTopologyGroupId}.
         * @member {String|null} topologyGroupId_=null
         * @reactive
         */
        topologyGroupId_: null
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
     * Host-side context of a reserved tear-out slot, keyed by item, while the platform vessel is
     * opening or waiting to bind: the sort zone that started the gesture and the vessel's window name.
     * Identity, lineage token and clock live with the reservation in `Neo.manager.Transaction`.
     * @member {Map<String,Object>} tearOutAdmissions=new Map()
     * @protected
     */
    tearOutAdmissions = new Map()

    /**
     * `Neo.manager.Transaction`, once the tear-out lifecycle loaded it — `null` until then, and for a
     * workspace that never opted in. The module is not part of a single-window app's closure: the
     * opt-in is the load, so a host with the lifecycle off pays no Group machinery.
     * @member {Neo.manager.Transaction|null} transactionManager=null
     * @protected
     */
    transactionManager = null

    /**
     * Resolves to {@link #transactionManager} once it is loaded and this workspace observes its Group;
     * `null` for a workspace that never asked (see {@link #loadTransactionManager}).
     * @member {Promise<Neo.manager.Transaction>|null} transactionManagerReady=null
     * @protected
     */
    transactionManagerReady = null

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
     * The render target whose geometry stream this Workspace has already armed. This is a
     * duplicate-call guard, not ownership of the realm-global WindowPosition observation: moving
     * away never disables a stream another Workspace may still consume.
     * @member {String|null} observedWindowGeometryId=null
     * @protected
     */
    observedWindowGeometryId = null

    /**
     * @summary Initializes dock-owned services and arms geometry only when already window-bound.
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        if (this.enableDockCloseAction) {
            // Closing a node's last item prunes its empty TabContainer. The surviving workspace
            // root is therefore the semantic focus fallback and must accept programmatic focus.
            this.vdom.tabIndex = -1
        }

        this.dockPreviewProducer = Neo.create(PreviewProducer);

        // The maximize affordance is a declinable collaborator: installed here unless the consumer
        // supplied its own instance through `plugins`, never a member of this class.
        if (this.enableDockMaximizeAction && !this.getPlugin('dock-maximize')) {
            this.plugins = [...(this.plugins || []), {module: Maximize}]
        }

        if (this.enableDockTearOutLifecycle) {
            this.tearOutHandlers = createDockTearOutHandlers({
                applyOperation  : descriptor => this.applyTearOutOperation(descriptor),
                closeVessel     : vessel => this.retireTearOutVessel(vessel),
                onDocumentChange: (document, operation, vessel) => this.onTearOutDocumentChange(document, operation, vessel),
                openVessel      : request => this.acquireTearOutVessel(request)
            });

            // One worker lifecycle subscriber exists — `Neo.manager.Transaction`. This workspace only
            // observes its own Group: slots it reserved bind, release, or run out their lease.
            this.loadTransactionManager()
        }

        // A host that imported the manager was admitted at app registration, before this instance
        // constructed: its Group is readable now. One still awaiting its carrier learns it on bind.
        this.resolveTopologyGroup();

        // Cross-window hit testing reads manager.Window as its one geometry authority, and the
        // manager only learns what the Main realm publishes. The host's own render target publishes
        // live extents as soon as it exists — during construction for an ordinary host, or from the
        // reactive window binding for a headless one — through the same stream every admitted vessel
        // opens on connect. A moved or resized main window therefore never claims with a stale frame.
        // Not gated on the engine lifecycle flag: a host may run its own admission (the Workstation
        // does) and still dock across windows; the app's opt-in is loading the addon at all.
        this.observeBoundWindowGeometry(this.windowId)
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
     * @summary Opens one platform vessel under a slot reserved in this workspace's Group.
     * @param {Object} request
     * @param {Number} [request.gestureToken] The gesture pair's own correlation id, echoed on every vessel record.
     * @param {String} request.itemId
     * @returns {Promise<Object|null>}
     * @protected
     */
    async acquireTearOutVessel(request={}) {
        let me       = this,
            {itemId} = request,
            admission, groupId, manager, reservation, vessel;

        if (typeof itemId !== 'string' || !itemId) {
            return null
        }

        manager = await me.loadTransactionManager();
        groupId = me.resolveTopologyGroup(manager);

        if (me.isDestroyed) {
            return null
        }

        if (!groupId) {
            console.warn(`Dock tear-out: workspace ${me.id} has no topology Group — its window has not bound`, itemId);
            return null
        }

        if (!await me.retryTearOutRetirements(itemId)) return null;

        // The reservation IS the admission: `Neo.manager.Transaction` holds the slot, the lineage
        // token the vessel must present and the clock. This map keeps only what the host needs to
        // answer the binding — the gesture's sort zone and, once the platform names it, the window.
        reservation = manager.reserve({groupId, workspaceKey: me.tearOutWorkspaceKey(itemId)});

        if (!reservation) {
            return null
        }

        admission = {
            connected         : false,
            connectingWindowId: null,
            generationToken   : reservation.generationToken,
            gestureToken      : request.gestureToken ?? null,
            itemId,
            sortZone          : request.sortZone || null,
            windowId          : null,
            windowName        : null,
            workspaceKey      : reservation.workspaceKey
        };
        me.tearOutAdmissions.set(itemId, admission);

        // Captured while the workspace is still alive, for the destroyed branch below — see the
        // comment there for why reading the hook after the await is not the same thing.
        const closeVessel = me.closeTearOutVessel.bind(me);

        try {
            vessel = await me.openTearOutVessel({...request, topologyIdentity: reservation})
        } catch (error) {
            vessel = null
        }

        if (!vessel) {
            me.tearOutAdmissions.get(itemId) === admission && me.clearTearOutAdmission(itemId, admission);
            manager.revoke(reservation);
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
        // Every record of this vessel carries the same exact identity: the reservation's slot and
        // lineage token, and the gesture pair's own correlation id, echoed unread.
        const identity = {...reservation, gestureToken: admission.gestureToken, itemId};

        if (me.isDestroyed) {
            try {
                await closeVessel({...vessel, ...identity})
            } catch (error) {}

            return null
        }

        // A stale async open may never orphan the OS window it already created.
        if (me.tearOutAdmissions.get(itemId) !== admission) {
            await me.retireTearOutVessel({...vessel, ...identity});
            return null
        }

        admission.windowName = vessel.windowName || admission.windowName || null;

        const connection = me.tearOutConnects[itemId];

        connection && !connection.windowName && (connection.windowName = admission.windowName);

        return {...vessel, ...identity}
    }

    /**
     * Loads `Neo.manager.Transaction` and observes this workspace's Group on it — once. The load is the
     * opt-in: the tear-out lifecycle asks at construction, a host running its own admission asks the
     * moment it reserves a slot, and a workspace that does neither never loads the module — which is
     * how a single-window app's closure stays without Group machinery.
     * @returns {Promise<Neo.manager.Transaction>}
     * @protected
     */
    loadTransactionManager() {
        return this.transactionManagerReady ??= import('../../manager/Transaction.mjs').then(({default: manager}) => {
            if (!this.isDestroyed) {
                this.transactionManager = manager;

                manager.on({
                    bind        : this.onTopologyBind,
                    leaseExpired: this.onTopologyLeaseExpired,
                    release     : this.onTopologyRelease,
                    scope       : this
                });

                // A window bound before this subscription existed announces nothing further.
                this.resolveTopologyGroup(manager)
            }

            return manager
        })
    }

    /**
     * Hook: this workspace learned its Group. A host whose participants could not register at
     * construction — its window's binding was still awaiting the carrier — registers them here.
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetTopologyGroupId(value, oldValue) {}

    /**
     * Learns this workspace's Group from an accepted binding of its window, if there is one: at
     * construction, when the app imported the manager and its window bound before this instance
     * existed; when the manager this instance loads on demand has resolved; and when a headless
     * instance receives its window. A window whose binding is still awaiting the carrier learns it
     * later, through {@link #onTopologyBind}. Once learned the Group is kept — see {@link #topologyGroupId}.
     * @param {Neo.manager.Transaction} [manager=this.transactionManager ?? Neo.manager?.Transaction]
     * @returns {String|null}
     * @protected
     */
    resolveTopologyGroup(manager=this.transactionManager ?? Neo.manager?.Transaction) {
        let me = this;

        if (!me.topologyGroupId && me.windowId) {
            const groupId = manager?.findByWindow(me.windowId)?.groupId;

            groupId && (me.topologyGroupId = groupId)
        }

        return me.topologyGroupId
    }

    /**
     * The workspace key a torn-out item's vessel binds under: one slot per item, prefixed so the
     * host can tell its own vessels from the other slots of its Group.
     * @param {String} itemId
     * @returns {String}
     */
    tearOutWorkspaceKey(itemId) {
        return `popup:${itemId}`
    }

    /**
     * @param {String} workspaceKey
     * @returns {String|null} The item id a vessel key names, or `null` for any other slot.
     */
    tearOutItemIdFor(workspaceKey) {
        return typeof workspaceKey === 'string' && workspaceKey.startsWith('popup:') ? workspaceKey.slice(6) : null
    }

    /**
     * @summary Clears one exact admission record.
     * @param {String} itemId
     * @param {Object|null} [admission=this.tearOutAdmissions.get(itemId)]
     * @protected
     */
    clearTearOutAdmission(itemId, admission=this.tearOutAdmissions.get(itemId)) {
        if (!admission || this.tearOutAdmissions.get(itemId) !== admission) return false;

        this.tearOutAdmissions.delete(itemId);

        return true
    }

    /**
     * A reserved slot in this workspace's Group ran out its lease without a window binding: the
     * vessel the host opened for it is retired.
     * @param {Object} data
     * @param {String} data.groupId
     * @param {String} data.workspaceKey
     * @protected
     */
    onTopologyLeaseExpired({groupId, workspaceKey}) {
        let me     = this,
            itemId = me.tearOutItemIdFor(workspaceKey);

        if (me.isDestroyed || groupId !== me.topologyGroupId || !itemId) return;

        const admission = me.tearOutAdmissions.get(itemId);

        admission && !admission.connected && me.expireTearOutAdmission(itemId, admission)
    }

    /**
     * @summary Retires an opened vessel whose slot ran out its lease without ever binding.
     * @param {String} itemId
     * @param {Object} admission
     * @protected
     */
    async expireTearOutAdmission(itemId, admission) {
        let me = this;

        // A lease that ran out after the instance went away has nothing left to expire.
        if (me.isDestroyed || admission?.connected) return;
        if (!admission || me.tearOutAdmissions.get(itemId) !== admission) return;

        const entry  = me.tearOutPanes[itemId],
              vessel = {
                  generationToken: admission.generationToken,
                  gestureToken   : admission.gestureToken,
                  itemId,
                  windowName     : admission.windowName || entry?.windowName,
                  workspaceKey   : admission.workspaceKey
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

            // Exact identity: the reservation's lineage token when the vessel carries one, else the
            // window name — a successor admission for the same item shares the name, never the token.
            const matches = entry => Boolean(entry &&
                (vessel.generationToken
                    ? entry.generationToken === vessel.generationToken
                    : entry.windowName === vessel.windowName)
            );

            const admission = me.tearOutAdmissions.get(vessel.itemId);

            matches(admission) && me.clearTearOutAdmission(vessel.itemId, admission);
            matches(me.tearOutConnects[vessel.itemId]) && delete me.tearOutConnects[vessel.itemId]
        }

        return closed !== false
    }

    /**
     * @summary Opens the tear-out vessel, defaulting to the host's own document.
     *
     * This hook used to return `null`, so pop-out and drag tear-out were both inert for any host
     * that wrote no window code: the action rendered, the click opened nothing, and no signal said
     * why. The default reopens the host's document with the item as its one content parameter and
     * hands the reserved slot to `Main.windowOpen`, which carries it to the vessel; the owner is never
     * in the URL. A consumer that wants a dedicated vessel shell, its own routing or staged theming
     * still overrides, and the override remains authoritative.
     * @param {Object} request
     * @param {String} request.itemId
     * @param {Object} [request.proxyRect] Where the user released the drag proxy.
     * @param {Object} request.topologyIdentity The slot the host reserved; `Main.windowOpen` writes it
     *   into the vessel's carrier, and the vessel presents it when it connects.
     * @returns {Promise<Object|null>} `{windowName}`, or `null` when no vessel opened.
     * @protected
     */
    async openTearOutVessel({itemId, proxyRect, topologyIdentity}={}) {
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

            // The vessel boots the SAME document. Which pane it shows is content, so `tearout` stays a
            // URL parameter; whom it belongs to is identity, which rides the topology carrier — nothing
            // about the owner is in the URL. Stripping first matters: a vessel re-torn from a vessel
            // would otherwise inherit the parent's item and connect as the wrong pane.
            url.searchParams.delete('tearout');
            url.searchParams.set('tearout', itemId);

            // The proxy rect is the pane the user dragged, so the vessel opens where they let go.
            // Floors keep a degenerate rect (a collapsed rail tab) from opening an unusable window.
            let height     = Math.max(Math.round(proxyRect?.height || 360), 240),
                width      = Math.max(Math.round(proxyRect?.width  || 480), 320),
                left       = Math.round((proxyRect?.x ?? 120) + (winData?.screenLeft || 0)),
                top        = Math.round((proxyRect?.y ?? 120) + ((winData?.outerHeight - winData?.innerHeight) || 0) + (winData?.screenTop || 0)),
                windowName = `neo-dock-tearout-${itemId}`;

            const opened = await Neo.Main.windowOpen({
                nativeCapabilities: {close: true, position: true, resize: true},
                topologyIdentity,
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

            return {windowName}
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
            captured = isDetach ? WorkspaceDocument.captureItemPlacement(me.dockModel, descriptor.itemId) : null,
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
                generation     : vessel.generation ?? connection?.generation ?? null,
                generationToken: vessel.generationToken ?? connection?.generationToken ?? null,
                gestureToken   : vessel.gestureToken ?? connection?.gestureToken ?? null,
                windowId       : connection?.windowId ?? null,
                windowName     : vessel.windowName || connection?.windowName || `tearout-${itemId}`,
                workspaceKey   : vessel.workspaceKey ?? connection?.workspaceKey ?? null
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
     * when a pane could not be materialized, which is the ordinary state for a host that writes no
     * {@link #resolvePane}. Tearing one out would open a vessel holding a titled blank.
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
        // Their throws do not reach anyone — `onTopologyBind` is registered as a manager event
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
     * engine host arms both — for its own first real window binding, for each admitted vessel before
     * ownership publication — so an adopter that EXTENDS this host never has to know the addon
     * exists. A host COMPOSED from the dock pieces onto a plain container never runs the binding
     * hook and must arm the same pair itself; half of it (resize only) leaves the row blind to a
     * titlebar drag, which is the defect the composition example carried. Overridable for a realm
     * that publishes geometry another way.
     * @param {String} windowId The render target whose Main realm publishes
     * @returns {Promise<void>|undefined} The addon's remote settle, or `undefined` off the browser
     * @protected
     */
    observeWindowGeometry(windowId) {
        return Neo.main?.addon?.WindowPosition?.setConfigs({observeMovement: true, observeResize: true, windowId})
    }

    /**
     * @summary Arms geometry once for each real render-target binding this Workspace enters.
     *
     * Construction and the reactive window-id hook deliberately share this guard: a Workspace
     * created with a window must not issue two remote writes, while one created headless must issue
     * none until a container supplies its first real id. The previous realm stays armed because
     * WindowPosition's observation flags are realm-global, not Workspace-keyed leases.
     * @param {String|null} windowId The Workspace's current render target.
     * @returns {Promise<void>|undefined} The addon's remote settle, or `undefined` when headless,
     *     already armed, or outside the browser.
     * @protected
     */
    observeBoundWindowGeometry(windowId) {
        if (!windowId || this.observedWindowGeometryId === windowId) {
            return
        }

        this.observedWindowGeometryId = windowId;

        return this.observeWindowGeometry(windowId)
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
     * @summary Admits the window that bound one of this workspace's reserved tear-out slots.
     * @description `Neo.manager.Transaction` announces every binding in the worker; this workspace
     * answers only for its own Group and only for slots it reserved — a `popup:<itemId>` key with a
     * pending admission. Nothing about the owner travels in the vessel's URL.
     * @param {Object} data
     * @param {Number} data.generation
     * @param {String} data.groupId
     * @param {String} data.windowId
     * @param {String} data.workspaceKey
     * @protected
     */
    async onTopologyBind(data) {
        let me                                            = this,
            {generation, groupId, windowId, workspaceKey} = data,
            itemId                                        = me.tearOutItemIdFor(workspaceKey),
            app                                           = Neo.apps[windowId];

        if (me.isDestroyed) return;

        // The host's own window: a first boot's minted identity binds once its carrier accepted it,
        // after this instance constructed. The Group is learned here, before any vessel logic runs.
        if (windowId === me.windowId && !me.topologyGroupId) {
            me.topologyGroupId = groupId
        }

        if (!itemId || !app || groupId !== me.topologyGroupId) return;

        const admission = me.tearOutAdmissions.get(itemId);

        if (!admission || admission.connected) return;

        if (admission.connectingWindowId && admission.connectingWindowId !== windowId) return;

        admission.connectingWindowId = windowId;

        const activeVessel = me.tearOutHandlers?.activeVessel,
              context      = {activeVessel, admission, app, data, generation, itemId, windowId, workspaceKey};

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

        // The grant hook and the geometry arming are async boundaries. Retirement, the lease or a
        // successor admission may have replaced this exact record while they were pending.
        if (
            me.isDestroyed || me.tearOutAdmissions.get(itemId) !== admission ||
            admission.connectingWindowId !== windowId || !Neo.apps[windowId]
        ) {
            return
        }

        const connection = {
            generation,
            generationToken: admission.generationToken,
            gestureToken   : admission.gestureToken,
            windowId,
            windowName     : activeVessel?.windowName || me.tearOutPanes[itemId]?.windowName || admission.windowName,
            workspaceKey
        };

        admission.connected = true;
        admission.windowId  = windowId;

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

        if (WorkspaceDocument.findContainingTabsId(doc, itemId)) {
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
     * @summary Reconciles a released vessel binding against pre-terminal or committed ownership.
     * @description Fired by `Neo.manager.Transaction` when the window holding a binding disconnects.
     * Releasing a binding never destroys anything on its own — the Group keeps the slot for its
     * lineage — so this is where the host decides what the pane does now that its vessel is gone.
     * @param {Object} data
     * @param {String} data.groupId
     * @param {String} data.windowId
     * @param {String} data.workspaceKey
     * @protected
     */
    async onTopologyRelease(data) {
        let me = this;

        if (me.isDestroyed || data.groupId !== me.topologyGroupId) return;

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
     * live pane or its resolved config takes the slot. Asked only for an item inside a tabs node the
     * current shell does not render: a retained node's config is discarded whole, so its items
     * project as their `blueprint` or a placeholder config and no instance is built for them. Override
     * only to change the placeholder's shape; its header text rides {@link #getPaneHeaderText}.
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
     * Tears down the producer and pending refresh chain. The tear-out state this instance owns —
     * every pending/connected/committed vessel, every admission with its expiry timer, every
     * owner-held pane — retires exactly once whether or not the lifecycle opt-in is on, because
     * `acquireTearOutVessel()` arms an admission and opens its vessel without it. Only the worker
     * Group subscription is the opt-in's to unregister, since only the opt-in subscribed. A refresh
     * scheduled before teardown no-ops on its `isDestroyed` guard.
     * @param {...*} args
     */
    destroy(...args) {
        let me = this;

        me.transactionManager?.un({
            bind        : me.onTopologyBind,
            leaseExpired: me.onTopologyLeaseExpired,
            release     : me.onTopologyRelease,
            scope       : me
        });

        me.retireTearOutState();
        me.tearOutHandlers = null;

        me.dockPreviewProducer?.destroy();
        me.dockPreviewProducer = null;
        me.dockHeaderActionPolicy?.destroy();
        me.refreshPromise = null;

        super.destroy(...args)
    }

    /**
     * Resolves the policy config to one instance bound to this workspace; an instance passes
     * through and is bound the same way.
     * @param {Neo.dashboard.dock.projection.HeaderActionPolicy|Object|null} value
     * @returns {Neo.dashboard.dock.projection.HeaderActionPolicy}
     * @protected
     */
    beforeSetDockHeaderActionPolicy(value) {
        let policy = ClassSystemUtil.beforeSetInstance(value, HeaderActionPolicy, {workspace: this});

        policy.workspace = this;

        return policy
    }

    /**
     * A replaced policy hands its lock-presentation memory to the replacement and retires. The
     * memory is keyed by panes and tab buttons that outlive the policy, so a swap while a lock is
     * held must not lose the record of what that lock changed — the next unlock reverses along it.
     * @param {Neo.dashboard.dock.projection.HeaderActionPolicy} value
     * @param {Neo.dashboard.dock.projection.HeaderActionPolicy|null} oldValue
     * @protected
     */
    afterSetDockHeaderActionPolicy(value, oldValue) {
        if (oldValue && oldValue !== value) {
            value.inheritRestoreState(oldValue);
            oldValue.destroy()
        }
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
     * instance, the way the engine's close action binds its `hidden` to the published header truth
     * ({@link Neo.dashboard.dock.projection.HeaderActionPolicy#createActionBindings}), not by returning a different list. Names
     * must be unique per node, and every engine-owned name is reserved while its own opt-in is on —
     * `close` under {@link #enableDockCloseAction}, `lock` under {@link #enableDockLockAction},
     * `maximize` under {@link #enableDockMaximizeAction}, `pin` under {@link #enableDockPinAction},
     * `reload` under {@link #enableDockReloadAction}, and `pop-out` under
     * {@link #enableDockPopOutAction}. Pop-out availability is a separate state derived from
     * {@link #dockPopOutActionActive}; both violations throw at projection rather than silently
     * unaddressing an action. Their intent surfaces on the `dockHeaderAction` event — see
     * {@link #onDockHeaderAction}.
     *
     * **An override MUST spread `super.getDockProjectionOptions()`.** This method is the only
     * carrier of the tear-out opt-ins into the projection context: `enableDockTearOut` is what
     * arms `allowOverdrag` and `enableProxyToPopup` on every tab sort zone, and the handler bundle
     * rides beside it. A host that returns its own object instead of extending this one drops both,
     * so dragging a tab out of the dock becomes unreachable and a dragged popup finds no target.
     *
     * **The pop-out action is not evidence the options arrived.** `dockPopOutActionActive` derives
     * from `tearOutHandlers` on the instance rather than from the context, so the button renders,
     * the vessel opens and the pane comes home while both drag gestures are dead — the failure hides
     * behind a working sibling. `projectDockModel` therefore refuses a projection whose context
     * lacks `enableDockTearOut` while the lifecycle is on, rather than trusting a host to notice.
     * @returns {Object}
     */
    getDockProjectionOptions() {
        return this.enableDockTearOutLifecycle
            ? {enableDockTearOut: true, ...this.tearOutHandlers}
            : {}
    }

    /**
     * The projection surface the owned collaborators contribute: every plugin exposing
     * `getDockProjectionOptions()` (the maximize plugin: its toggle and icon pair) merges into
     * the adapter context, in `plugins` order, ahead of {@link #getDockProjectionOptions} — the
     * consumer's hook overrides a collaborator key, and two collaborators may not claim the same
     * key: that collision throws at projection, naming both, rather than letting the later one win
     * in silence. A declined collaborator contributes nothing, so the adapter projects nothing for it.
     * @returns {Object}
     */
    getDockCollaboratorOptions() {
        let options = {},
            owners  = {},
            contribution, key;

        for (const plugin of this.plugins || []) {
            contribution = plugin.getDockProjectionOptions?.() || {};

            for (key in contribution) {
                if (key in options) {
                    throw new Error(`Dock projection option "${key}" is contributed by two collaborators: ${owners[key]} and ${plugin.className}`)
                }

                options[key] = contribution[key];
                owners[key]  = plugin.className
            }
        }

        return options
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
     * {@link #tearOutHandlers} bundle, whether base-owned or supplied by the host, AND a realm that
     * can actually produce a vessel — see {@link #canOpenTearOutVessel}. An action a consumer
     * enabled, the engine rendered, and the platform then refuses is the defect this whole seam
     * exists to remove: the user clicks and nothing happens.
     * @returns {Boolean}
     */
    get dockPopOutActionActive() {
        const me = this;

        // The capability gates the ENGINE-owned path only. A host that supplies its own
        // `tearOutHandlers` with the lifecycle off has already asserted it can open a vessel — by
        // implementing one — and `Neo.config` is not entitled to contradict it. Gating both routes
        // alike is the tempting shape and it is wrong.
        return me.enableDockPopOutAction === true
            && !!me.tearOutHandlers
            && (!me.enableDockTearOutLifecycle || me.canOpenTearOutVessel)
    }

    /**
     * @summary Whether this realm can produce a tear-out vessel at all.
     *
     * A vessel adopts a LIVE pane from this workspace's app worker, and only a shared worker can
     * serve one worker's components to a second window — so `useSharedWorkers` is the capability,
     * not a preference. The engine's own {@link #openTearOutVessel} declines without it, and an
     * enabled action that renders and then declines is exactly the silence this seam removes.
     *
     * **But the shared worker is only the ENGINE opener's requirement.** A host that supplies its
     * own `openTearOutVessel` — a native shell, a test harness, any non-worker transport — can open
     * a vessel without one, and demanding the config from it would withhold an action that works.
     *
     * So the default asks whether the engine's own opener is the one that will run. That is a
     * prototype comparison, sound here because the base already has a working implementation — so
     * it asks "is it still the base one", not "did anyone implement this". Override this getter
     * directly when the answer is neither.
     * @returns {Boolean}
     * @protected
     */
    get canOpenTearOutVessel() {
        return Neo.config.useSharedWorkers === true
            || this.openTearOutVessel !== Workspace.prototype.openTearOutVessel
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
            // A rail leave path (the pin escape, a reconciled leaver) starts its release without
            // awaiting it, and the release clears the cache below on its first tick — without the
            // lease this sweep would find nothing left to await and stage the projection into a
            // removal still in flight.
            pending.push(...Object.values(rail.revealPaneReleases || {}));

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
     * @summary Projects an unseeded Workspace on first mount, or syncs a statically seeded shell.
     *
     * A headless Workspace owns no visible tree before binding. Once mounted, an absent shell at
     * {@link #dockShellIndex} enters the ordinary committed-document refresh — the same projection
     * path every later operation uses — rather than asking each consumer constructor to seed engine
     * chrome. A consumer which already supplied a shell keeps its static boot path below.
     *
     * A consumer may mount its first projection statically — items assembled in `construct()` —
     * without ever entering {@link #refreshDockWorkspace}. That path needs no correction any more:
     * {@link #projectDockModel} publishes the header truth before the chrome it projects constructs,
     * and the projected actions and containers bind to it, so a pane-dependent action such as reload
     * shows its real state from the first paint.
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @returns {Promise|null} The seeding refresh, or `null`
     * @protected
     */
    afterSetMounted(value, oldValue) {
        super.afterSetMounted(value, oldValue);

        const me = this;

        if (!value || me.refreshPromise) {
            return null
        }

        if (!me.getDockHost()?.items?.[me.dockShellIndex]) {
            me.onDockZoneDocumentChange(me.dockModel);
            return me.refreshPromise
        }

        return null
    }

    /**
     * @summary Opens the Workspace geometry stream when it enters a real render target.
     * @param {String|null} value
     * @param {String|null} oldValue
     * @returns {Promise<void>|undefined}
     * @protected
     */
    afterSetWindowId(value, oldValue) {
        super.afterSetWindowId(value, oldValue);

        // A headless instance receiving its first window may find that window already bound.
        this.resolveTopologyGroup();

        return this.observeBoundWindowGeometry(value)
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

        if (!me.dockModel || !itemId || committed === itemId) {
            // No commit follows (a reconciliation re-emit, or no model). The header presents
            // `itemId` either way, so that is the truth its actions bind to — one self-diffing
            // leaf, a no-op on the ordinary re-emit.
            itemId && me.stateProvider?.setData(`dock.nodes.${dockNodeId}.activeItemId`, itemId);

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
     * ({@link #enableDockCloseAction}), `lock` ({@link #enableDockLockAction}), `pin`
     * ({@link #enableDockPinAction}), `reload` ({@link #enableDockReloadAction} — runtime-only:
     * delegation into the pane's own `dockReload()`, never an operation) and `pop-out`
     * ({@link #enableDockPopOutAction}, itself double-gated on {@link #enableDockTearOutLifecycle}).
     * Every other intent — `maximize`, which the maximize plugin owns as a pure presentation toggle
     * that never reaches the reducer, and host actions projected through `resolveDockHeaderActions`
     * alike — is re-emitted as a **`dockHeaderAction`** event carrying
     * `{action, dockNodeId, tabContainer}`, so a host or a collaborator receives it without
     * subclassing this class or overriding a protected method, and this method returns `null` for it.
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

        let modelNodeId = WorkspaceDocument.findContainingTabsId(me.dockModel, itemId) || dockNodeId,
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
    handleDockLockAction({tabContainer}={}) {
        let me          = this,
            {dockModel} = me,
            itemId      = me.getActiveDockItemId(tabContainer),
            missing     = !itemId ? 'an active item' : !dockModel ? 'a committed document' : null;

        if (missing) {
            return {document: dockModel, errors: [`Dock lock action requires ${missing}`]}
        }

        let descriptor = {operation: 'setItemLocked', itemId, locked: dockModel.items[itemId]?.locked !== true},
            result     = me.applyDockZoneOperation(descriptor);

        if (result && !result.errors?.length && result.document) {
            me.onDockZoneDocumentChange(result.document, descriptor, tabContainer)
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
        const wasInTree = !!WorkspaceDocument.findContainingTabsId(me.dockModel, itemId);

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
        const detached = wasInTree && !WorkspaceDocument.findContainingTabsId(me.dockModel, itemId);

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
     * that emitted the intent.** The pin action's binding ({@link Neo.dashboard.dock.projection.HeaderActionPolicy#createActionBindings}) hides it wherever no edge owns the
     * item, but that visibility is a projection of the document as it stood at the last publish, and the
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

        if (!WorkspaceDocument.findOwningEdge(me.dockModel, itemId)) {
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
     * Runs the engine-owned reload for the active pane: `dockReload()` when the pane implements
     * the contract — the author owns what reload means, and the method is explicitly
     * promise-aware (`void | Promise<*>`) — and the engine's recreate ({@link #recreateDockPane})
     * when it does not. Runtime-only by contract: no operation is
     * committed and the document never changes. Every completion — sync throw, async rejection,
     * async success — settles exactly once through the `dockReloadSettled` event
     * (`{dockNodeId, itemId, errors}`), because the action wire has no result channel
     * (`Observable.fire` discards listener returns). A failing `dockReload()` keeps the pane,
     * always. One invocation per item may be in flight; the action's `disabled` state derives
     * from the ACTIVE item's in-flight membership through its binding
     * ({@link Neo.dashboard.dock.projection.HeaderActionPolicy#createActionBindings}) on the published `flights` — written at
     * the flight edges here, re-read on every active-item change — so switching panes mid-flight
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
            me.stateProvider?.setData(`dock.flights.${itemId}`, 'reload');

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
                !me.isDestroyed && me.stateProvider?.setData(`dock.flights.${itemId}`, null)
            })
        }

        !me.isDestroyed && me.fire('dockReloadSettled', {dockNodeId, errors, itemId});

        return {errors}
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
     * `{geometryOnly}` for a pure boundary move, `{retainTopology}` for item-only deltas on a
     * proven-identical shell, `{preserveItemIds}` for owner-held ids known only at THIS commit (a
     * pane parked by the operation itself), merged with the standing {@link #getPreservedItemIds}
     * set. The default derives both fast paths from the operation's declared change class, so a
     * consumer that overrides nothing already gets them. The committing surface passes
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
        // `topology` is the one class with nothing to emit, because it IS the full transaction.
        //
        // Both emitted values are admission REQUESTS, never claims: `reconcileStableTopology`
        // returns null on any node/type/ancestry/order/orientation delta and the caller falls
        // through to the staged transaction, with `landedInPlace` reporting the path actually
        // taken. A class that were ever wrong would therefore cost one refused validation pass,
        // not a wrong projection — which is why the fast path can be derived at all.
        switch (Operations.changeClassFor(descriptor?.operation)) {
            // Both resize reducers clone the document and write exactly one field —
            // `nodes[id].sizes`, `nodes[id].zones[edge].extent` — and survive `WorkspaceDocument.commit`,
            // normalization included, with the node tree, the node id set and `items` all
            // byte-identical. Nothing moved but the boundary, so nothing needs restaging.
            case 'geometry':
                return {geometryOnly: true};

            // The item-flag reducers write one `items[id]` field and touch `nodes` nowhere, so the
            // shell is stable and only items reconcile — a railed item included: its rail is stable
            // topology too, keyed by its edge-zone node and edge, and reconciles its items in place.
            case 'itemFlags':
                return {retainTopology: true}
        }

        return {}
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
            && !WorkspaceDocument.findContainingTabsId(this.dockModel, itemId)
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

        // A committed operation is announced BEFORE it applies, so a collaborator holding runtime
        // presentation over the outgoing projection (the maximize plugin) can clear it terminally;
        // the re-projection continuity in refreshDockWorkspace() re-applies only what survived.
        // Synchronous, listeners in subscription order, the outgoing document still committed; a
        // listener writes its own state and never throws — a throw here aborts the commit, as it
        // would on any listener.
        me.fire('beforeDockZoneDocumentChange', {descriptor, document, source});

        tabInsertDescriptor = me.getTabInsertProjectionDescriptor(document, descriptor);
        refreshOptions      = me.getRefreshOptions(descriptor, source);
        tail                = me.refreshPromise?.catch(() => {}) || Promise.resolve();

        me.dockModel = document;

        // Header truth is written at the commit boundary: every leaf self-diffs, so the bindings
        // whose inputs this commit changed re-evaluate now — a lock reaches its header, its pane and
        // a revealed rail pane here, as it always did — and nothing else moves. Optional because a
        // test may drive this hook with a hand-built `this`.
        me.dockHeaderActionPolicy?.publishDocument(document);

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
            config, options;

        if (!document) {
            config = {ntype: 'container', cls: ['neo-dashboard'], items: []}
        } else {
            // The header truth this projection's chrome binds to is published first, so a header
            // created from the config reads committed state on its bindings' first run. After a
            // commit this is a no-op; for a shell a consumer projects statically it is the publish.
            me.dockHeaderActionPolicy?.publishDocument(document);

            options = me.getDockProjectionOptions();

            // A host override that returns its own object without spreading `super` drops the
            // tear-out opt-ins, and nothing downstream can tell. The projection succeeds, the dock
            // renders, and the pop-out ACTION still appears — `dockPopOutActionActive` reads
            // `tearOutHandlers` on the INSTANCE, not this context — so two gestures die behind a
            // working button: dragging a tab out becomes unreachable (without `allowOverdrag` the
            // proxy stays clamped to its strip, so the boundary exit can never fire) and a dragged
            // popup finds no target (without a `sortGroup` the zone never registers with the
            // coordinator). Measured on a consumer whose multi-window dock looked finished.
            //
            // Refusing here is the discipline the reserved-name violations already apply: a host
            // that meant to enable tear-out learns at once, and one that meant to disable it turns
            // the lifecycle off rather than silently dropping what the lifecycle promised. The
            // action rendering is not evidence the options arrived.
            //
            // The check compares against the WHOLE bundle, not against `enableDockTearOut` alone.
            // The flag is one of eight keys `super` contributes — the rest are the tear-out gesture
            // handlers `LayoutAdapter.project` reads — so testing the flag would make it a proxy for
            // the bundle, and a host that writes the flag by hand (which `apps/workstation` does)
            // would pass with none of the handlers present. That is this same failure one key
            // deeper, and asking what `super` would have contributed keeps the check true as the
            // bundle grows. It also lets the error name what was dropped.
            if (me.enableDockTearOutLifecycle) {
                const base = Workspace.prototype.getDockProjectionOptions.call(me),
                      lost = Object.keys(base).filter(key => !(key in options));

                if (lost.length) {
                    throw new Error(`Workspace ${me.id}: getDockProjectionOptions() dropped ${lost.join(', ')} while enableDockTearOutLifecycle is on — an override must spread super.getDockProjectionOptions()`)
                }
            }

            config = LayoutAdapter.project(document, {
                onDockCrossZoneDrop: me.onDockCrossZoneDrop.bind(me),
                // Owned collaborators contribute their projected surface (the maximize plugin: its
                // toggle and icons) before the consumer's hook and this class's own options.
                ...me.getDockCollaboratorOptions(),
                ...options,
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
                enableDockPinAction      : me.enableDockPinAction,
                enableDockPopOutAction   : me.enableDockPopOutAction,
                enableDockReloadAction   : me.enableDockReloadAction,
                dockActionTooltips       : me.dockActionTooltips,
                dockPopOutActionAvailable: me.dockPopOutActionActive,
                dockPopOutIconCls        : me.dockPopOutIconCls,
                applyDockZoneOperation   : me.applyDockZoneOperation.bind(me),
                onDockZoneDocumentChange : me.onDockZoneDocumentChange.bind(me),
                // A resolved pane's contract is header truth too: the policy publishes what it can
                // serve as it is resolved, and the reload action's binding reads it.
                resolveComponentRef      : itemResolver || ((componentRef, item, itemId) => me.publishPaneContract(itemId, me.resolveProjectedPane(itemId, item))),
                resolveRevealComponentRef: (componentRef, item, itemId) => me.decorateFlipMarker(me.resolveRevealPane(itemId, item), itemId),
                // Header state is data the projected chrome binds to, resolved against this
                // workspace's provider through the tree: the engine actions carry the policy's
                // formatters, a tabs node's container binds its locked items, a rail its revealed one.
                dockHeaderActionBindings: nodeId => me.dockHeaderActionPolicy?.createActionBindings(nodeId),
                dockNodeLockBinding     : nodeId => me.dockHeaderActionPolicy?.createNodeLockBinding(nodeId),
                dockRailLockBinding     : railId => me.dockHeaderActionPolicy?.createRailLockBinding(railId),
                dockWorkspaceId         : me.id,
                syncDockLockPane        : (pane, itemId) => me.dockHeaderActionPolicy?.syncLockItemPresentation({
                    locked: me.getStateProvider?.()?.getData(`dock.items.${itemId}.locked`) === true,
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

        // The reconciler discards a retained tabs node's config whole, so a stand-in for one of its
        // items never enters a parent; only an item inside a NEW tabs node needs one, for button pairing.
        const
            currentShell       = host.items?.[me.dockShellIndex],
            retainedTabNodeIds = new Set(currentShell ? Reconciler.collectProjectedTabs(currentShell).keys() : []),
            nextConfig         = me.projectDockModel(tabInsertDescriptor, (componentRef, item, itemId, nodeId) => {
                if (retainedTabNodeIds.has(nodeId)) {
                    return null
                }

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
                    me.publishPaneContract(itemId, me.resolveProjectedPane(itemId, item)),
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

        // Awaited on purpose, in plugins order: refreshPromise is the settled-surface contract, and
        // a collaborator presentation that re-applies after it settles is a surface nobody can
        // await. A collaborator that rejects is reported and skipped — presentation never fails a
        // refresh, and the next collaborator still runs.
        for (const plugin of me.plugins || []) {
            try {
                await plugin.syncDockProjection?.()
            } catch (error) {
                console.warn(`Dock collaborator ${plugin.className} failed to sync its projection`, me.id, error);
                me.fire('dockCollaboratorSyncFailed', {component: me, error, plugin})
            }
        }

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
            await me.afterRefreshDockWorkspace({document, refreshOptions, result, played})
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
     * Hands a resolved pane to the header-action policy, which publishes the contract it can serve
     * ({@link Neo.dashboard.dock.projection.HeaderActionPolicy#publishPaneContract}); a hand-built
     * `this` without a policy resolves the pane and publishes nothing.
     * @param {String} itemId
     * @param {Object|Neo.component.Base|null} pane
     * @returns {Object|Neo.component.Base|null} The same pane
     * @protected
     */
    publishPaneContract(itemId, pane) {
        return this.dockHeaderActionPolicy?.publishPaneContract(itemId, pane) ?? pane
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
     * Defaults to {@link #resolvePane} — only the consumer knows how to build its own pane. A
     * cache-backed `resolvePane` is safe here: {@link #prepareRecreateCandidate} compares by
     * identity and refuses with `live-instance`, leaving the live pane untouched.
     *
     * `null` declines for that item.
     * @param {String} itemId The stable workspace identity from the item catalog.
     * @param {Object} item The persisted item record.
     * @returns {Object|Neo.component.Base|null}
     */
    resolveFreshPane(itemId, item) {
        return this.resolvePane(itemId, item)
    }

    /**
     * Whether a recreate path is wired — not whether a given item will succeed. The engine always
     * wires one: {@link #resolveFreshPane} delegates to {@link #resolvePane}, so the default answers
     * `true` and a pane without `dockReload()` keeps its reload action.
     *
     * Never calls the factory: the answer is published as `recreateFallback` for the reload action's
     * binding ({@link Neo.dashboard.dock.projection.HeaderActionPolicy#publishDocument}), and minting a pane to
     * decide whether to show a button would be a side effect.
     *
     * Override to `false` to declare this host serves no recreate; the action then hides for every
     * pane without the contract.
     * @returns {Boolean}
     */
    hasDockRecreateFallback() {
        return true
    }

    /**
     * Phase 1 of the two-phase recreate transaction: obtain and validate a fresh candidate **without
     * touching the live pane**.
     *
     * Rollback is by construction rather than by repair — nothing is destroyed here, so every
     * refusal below leaves the workspace exactly as it was. The docking record's user-triggered
     * recreate exception is conditioned on this phase — without a validated candidate the exception
     * does not apply and the never-destroyed guarantee stands unmodified.
     * @see learn/agentos/decisions/0029-docking-design.md §2.6 — the docking record is this method's
     *      authority, not a tracking reference; the contract is unreadable without it.
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
        me.stateProvider?.setData(`dock.flights.${itemId}`, 'recreate');

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
            me.dockRecreateInFlight.delete(itemId);
            !me.isDestroyed && me.stateProvider?.setData(`dock.flights.${itemId}`, null)
        }

        settle && !me.isDestroyed && me.fire('dockRecreateSettled', {dockNodeId, errors, itemId});

        return {errors, pane}
    }
}

export default Neo.setupClass(Workspace);
