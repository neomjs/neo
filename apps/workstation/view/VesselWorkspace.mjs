import DockWorkspace              from '../../../src/dashboard/dock/Workspace.mjs';
import NativeVesselTransaction    from '../../../src/dashboard/dock/window/NativeVesselTransaction.mjs';
import PopupWorkspace             from './PopupWorkspace.mjs';
import DockDragAffordances        from '../../../src/dashboard/dock/interaction/DragAffordances.mjs';
import DockTabContainer           from '../../../src/dashboard/dock/interaction/TabContainer.mjs';
import Placement                  from '../../../src/dashboard/dock/window/Placement.mjs';
import CrossWindowGestureSnapshot from './CrossWindowGestureSnapshot.mjs';
import WorkspaceDocument          from '../../../src/dashboard/dock/model/WorkspaceDocument.mjs';
import Operations                 from '../../../src/dashboard/dock/model/Operations.mjs';
import StateProvider              from '../../../src/state/Provider.mjs';
import TransactionManager         from '../../../src/manager/Transaction.mjs';
import WindowManager              from '../../../src/manager/Window.mjs';
import WorkspaceSet               from '../../../src/dashboard/dock/window/WorkspaceSet.mjs';
import VesselPark                 from '../../../src/dashboard/dock/window/VesselPark.mjs';
import {
    createDockVesselEmbodiment,
    createDockVesselProxyEmbodiment
} from '../../../src/dashboard/dock/window/VesselEmbodiment.mjs';

/**
 * @summary Workstation's Group, popup and native-vessel lifecycle, independent of its pane presentation.
 * The root supplies its document, pane resolver and dock host. This base composes the existing engine
 * owners, preserves panes across window/projection changes, and retires those resources before the
 * root's content cleanup. Group membership remains the only workspace registry.
 * @class Workstation.view.VesselWorkspace
 * @extends Neo.dashboard.dock.Workspace
 */
class VesselWorkspace extends DockWorkspace {

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
        return typeof itemId === 'string' && itemId ? `${VesselWorkspace.VESSEL_WORKSPACE_PREFIX}${itemId}` : null
    }

    /**
     * @summary Uses the document's semantic key for native admission too.
     * @param {String} itemId
     * @returns {String}
     */
    tearOutWorkspaceKey(itemId) {
        return VesselWorkspace.vesselWorkspaceId(itemId)
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
        /** @member {String} className='Workstation.view.VesselWorkspace' */
        className: 'Workstation.view.VesselWorkspace',
        /** @member {Neo.core.Base[]} mixins=[CrossWindowGestureSnapshot] Window observation stays on the instance. */
        mixins: [CrossWindowGestureSnapshot],
        /** @member {Number} dockHistoryDepth=50 Bounded Group history retained across window releases. */
        dockHistoryDepth: 50,
        /** @member {Boolean} enableDockTearOutLifecycle=true The engine owns native admission and retirement. */
        enableDockTearOutLifecycle: true
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
     * The provisional chrome each admitted vessel window shows before its document projection, keyed by
     * window id: one dock tab container created by the stage target seam and retired once the pane has
     * left it — when the committed projection mounts its own chrome, or when the window retires.
     * @member {Object} provisionalVesselChromes={}
     * @protected
     */
    provisionalVesselChromes = {}

    /**
     * @summary Registers the root and saved popup documents before the first pane projection.
     * The root calls this once after supplying its initial document and topology library.
     * @protected
     */
    initializeWorkspaceTopology() {
        const me = this;

        me.workspaceSet = Neo.create(WorkspaceSet, {documentModel: WorkspaceDocument, manager: TransactionManager, getGroupId: () => me.topologyGroupId});

        for (const [workspaceId, document] of Object.entries(me.initialTopology?.workspaces ?? {})) {
            if (workspaceId === VesselWorkspace.MAIN_WORKSPACE_ID) continue;
            me.createPopupWorkspace(workspaceId, WorkspaceDocument.clone(document), {committed: true, windowId: null})
        }

        me.registerMainWorkspace();
    }

    /**
     * @summary Starts the window gesture resources once the root's dock host and overlays exist.
     * Pane/store ownership stays with the root; these engine collaborators borrow its live resolver.
     * @protected
     */
    initializeVesselResources() {
        const me = this;

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
            resolveTarget: windowId => me.resolveVesselStageTarget(windowId)
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
            disposeVessel: ({itemId}) => me.retireReturnedVessel(VesselWorkspace.vesselWorkspaceId(itemId)),
            parkVessel   : vessel => me.parkTearOutVessel({...vessel, nativeTitlebar: true}),
            reshowVessel : vessel => me.reshowTearOutVessel(vessel)
        });
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
        const me = this, firstRegistration = !me.workspaceSet.has(VesselWorkspace.MAIN_WORKSPACE_ID);

        const registered = me.workspaceSet.register(VesselWorkspace.MAIN_WORKSPACE_ID, {
            bindingKey : 'main',
            componentId: me.id,
            getDocument: () => me.dockModel,
            setDocument: document => me.dockModel = document,
            project    : context => me.projectDockCommit(context)
        });
        if (registered) {
            firstRegistration && TransactionManager.setHistoryDepth({groupId: me.topologyGroupId, depth: me.dockHistoryDepth});
            me.dockPlacement ??= Placement.forGroup({
                groupId: me.topologyGroupId, initialHints: me.initialTopology?.placementHints, mainWorkspaceKey: VesselWorkspace.MAIN_WORKSPACE_ID
            })
        }
        return registered
    }

    /** @summary Returns the Group's current relative hints for topology persistence. @returns {Object} */
    getPlacementHints() {
        return this.dockPlacement?.hints ?? {}
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

        value && me.workspaceSet && !me.workspaceSet.has(VesselWorkspace.MAIN_WORKSPACE_ID) && me.registerMainWorkspace()
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

        value && me.workspaceSet && !me.workspaceSet.has(VesselWorkspace.MAIN_WORKSPACE_ID) && me.registerMainWorkspace()
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
            crossWindowSortGroup        : VesselWorkspace.CROSS_WINDOW_SORT_GROUP,
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
                me.vesselConversionTargetWindowId = targetWorkspaceId === VesselWorkspace.MAIN_WORKSPACE_ID
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
            workspaceId                      : VesselWorkspace.MAIN_WORKSPACE_ID
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
              workspaceId   = VesselWorkspace.MAIN_WORKSPACE_ID;

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
            sortGroup              : VesselWorkspace.CROSS_WINDOW_SORT_GROUP,
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
        const me = this, windowId = me.windowId, workspaceId = VesselWorkspace.MAIN_WORKSPACE_ID;
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
        const state = this.getPopupState(VesselWorkspace.vesselWorkspaceId(itemId));
        if (!state?.host || !app?.mainView) return null;
        state.itemId = itemId;
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
            workspaceId = VesselWorkspace.vesselWorkspaceId(itemId),
            state       = workspaceId && me.getPopupState(workspaceId);

        if (!state) return false;

        state.participation?.destroy();
        me.crossWindowParticipations.delete(workspaceId);
        state.host?.parent?.remove(state.host, false, true);
        if (state.host) state.host.windowId = null;
        me.retireProvisionalVesselChrome(state.windowId);
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
        return workspaceId === VesselWorkspace.MAIN_WORKSPACE_ID ? this.dockModel : this.workspaceSet.getDocument(workspaceId)
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
     * @summary Creates the owner of one popup workspace with its runtime state already in place.
     *
     * The state is handed to the owner at creation, so the Group registration the owner performs in
     * its own `construct` — and everything that reacts to that membership, the topology bar included —
     * already resolves the workspace through {@link #getPopupState}. Assigning the state afterwards
     * left a gap in which the membership had changed and the workspace was visible to no reader.
     * @param {String} workspaceId
     * @param {Object} dockModel The workspace's document.
     * @param {Object} fields The state's ownership facts: `committed`, and `itemId` or `windowId` as the site knows them.
     * @returns {Object} The runtime state; its `host` is the new owner.
     */
    createPopupWorkspace(workspaceId, dockModel, fields) {
        const me    = this,
              state = {
                  ...fields, disconnected: true, host: null, workspaceId,
                  get document() { return state.host.dockModel },
                  set document(value) { state.host.dockModel = value }
              };

        state.host = Neo.create(PopupWorkspace, {
            dockModel, flex: 1, rootWorkspace: me, runtimeState: state,
            stateProvider  : {module: StateProvider, parent: me.stateProvider},
            topologyGroupId: me.topologyGroupId, workspaceKey: workspaceId, workspaceSet: me.workspaceSet
        });

        return state
    }

    /**
     * Seeds the empty document of a full popup Workspace before its first atomic pane transfer.
     * @param {String} itemId
     * @returns {Object|null}
     * @protected
     */
    createVesselWorkspaceDocument(itemId) {
        let item       = this.dockModel?.items?.[itemId],
            tabsNodeId = VesselWorkspace.vesselTabsNodeId(itemId);

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
        // Read before the transfer: afterwards an emptied vessel no longer says which items it held.
        const departing = Object.keys(me.getPopupState(sourceWorkspaceId)?.document?.items ?? {});
        try {
            const committed = await me.workspaceSet.transfer(descriptor, {provenance: {origin: 'human'}});
            const receipt   = me.lastCrossWindowTransfer = {
                applied      : true, descriptor, sourceWorkspaceId, targetWorkspaceId,
                transactionId: committed.transactionId, phases: ['documents-adopted'],
                reconciled   : false, closeRequested: false, topologyExited: false
            };
            const source = me.getPopupState(sourceWorkspaceId), target = me.getPopupState(targetWorkspaceId);
            if (descriptor.operation === 'transferNode' && targetWorkspaceId === VesselWorkspace.MAIN_WORKSPACE_ID
                && source && !Object.keys(source.document.items).length) {
                const viewport = source.app?.mainView;
                viewport && !viewport.isDestroyed && viewport.addCls('workstation-vessel-departing')
            }
            await Promise.all([me.refreshPromise, source?.host?.refreshPromise, target?.host?.refreshPromise]);
            receipt.reconciled = true;
            receipt.phases.push('projections-settled');
            if (source && !Object.keys(source.document.items).length) {
                const closed = await me.retireReturnedVessel(sourceWorkspaceId);

                // Home again means main's catalog owns the returned items, so their vessel ownership retires
                // with the vessel. The registry keeps an owner through a release this host retains (the emptied
                // popup Workspace stays registered for a warm reload), and a record left behind receives the
                // NEXT tear-out of the same item as a late binding of THIS adoption: the new vessel opens
                // owned, skips the connect-first stage, and shows nothing.
                if (closed && targetWorkspaceId === VesselWorkspace.MAIN_WORKSPACE_ID) {
                    departing
                        .filter(itemId => !Object.hasOwn(source.document.items, itemId))
                        .forEach(itemId => me.nativeWindows?.recordOwner(me.id, itemId, null))
                }
            }
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
        // The committed projection owns the viewport from here. A provisional chrome still holding the
        // staged pane hands it over detached — the projection re-parents it by identity — and retires
        // before the host mounts, so the vessel never lays out two chromes side by side.
        this.retireProvisionalVesselChrome(state.windowId, {releasePanes: true});
        host.parent?.remove(host, false, true);
        target.add(host);
        await host.promiseUpdate();
        return true
    }

    /**
     * @summary Resolves the container a staged pane embodies into before its vessel's terminal.
     * @description The popout host boots an empty viewport whose vbox imposes width alone, so a pane added
     * to it sits at its own height with no chrome — a born vessel that reads as a dark window with a card
     * in it for as long as the gesture holds it. The pane's box belongs to a dock tab container: the
     * provisional one created here carries the pane's header as a real tab and fills the window, and it
     * retires the moment the committed projection mounts its own chrome into the same viewport.
     * @param {String} windowId
     * @returns {Neo.dashboard.dock.interaction.TabContainer|null}
     * @protected
     */
    resolveVesselStageTarget(windowId) {
        let me       = this,
            viewport = Neo.apps[windowId]?.mainView,
            chrome   = me.provisionalVesselChromes[windowId];

        if (!viewport || viewport.isDestroyed) return null;

        if (!chrome || chrome.isDestroyed || chrome.parent !== viewport) {
            // a chrome that lost its viewport is replaced through the one retire path, pane hand-over included
            chrome && me.retireProvisionalVesselChrome(windowId, {releasePanes: true});

            chrome = me.provisionalVesselChromes[windowId] = viewport.add({
                module : DockTabContainer,
                appName: viewport.appName,
                cls    : ['workstation-vessel-provisional-chrome'],
                flex   : 1,
                windowId
            })
        }

        return chrome
    }

    /**
     * @summary Retires a window's provisional vessel chrome once the pane has left it.
     * @description A chrome that still holds the staged pane stays unless the caller takes the pane
     * over: the embodiment owns that pane's return, and destroying the container would take the live
     * pane with it. The committed projection's mount is the one caller that does take over — it
     * releases the pane detached and re-parents it by identity. The window's own end retires any
     * chrome left behind with everything else it rendered.
     * @param {String|null} windowId
     * @param {Object} [options]
     * @param {Boolean} [options.releasePanes=false] Detach the panes the chrome still holds, keeping them alive
     * @returns {Boolean} true when the chrome was retired
     * @protected
     */
    retireProvisionalVesselChrome(windowId, {releasePanes=false}={}) {
        let me     = this,
            chrome = windowId && me.provisionalVesselChromes[windowId],
            // a tab container's own items are its bar and its body; the staged pane lives in the body
            body   = chrome && !chrome.isDestroyed ? chrome.getCardContainer() : null;

        if (!chrome) return false;

        if (body?.items.length) {
            if (!releasePanes) return false;

            [...body.items].forEach(pane => body.remove(pane, false, true))
        }

        delete me.provisionalVesselChromes[windowId];

        if (!chrome.isDestroyed) {
            chrome.parent ? chrome.parent.remove(chrome, true) : chrome.destroy()
        }

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
            receipt.targetWorkspaceId === VesselWorkspace.MAIN_WORKSPACE_ID
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
                me.lastCrossWindowTransfer.targetWorkspaceId === VesselWorkspace.MAIN_WORKSPACE_ID
            ) {
                me.lastCrossWindowTransfer.closeRequested = true;
                me.lastCrossWindowTransfer.phases ??= [];
                me.lastCrossWindowTransfer.phases.push('close-acknowledged')
            }
        }

        return closed
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
     * ENGINE's now: it derives `geometryOnly` from the operation's declared change class, and so is
     * the item-only admission: an `itemFlags` commit writes one flag on one item, so the engine
     * answers `retainTopology` and this override ADDS to that answer rather than replacing it.
     * Writing either key unconditionally overwrote the engine's `true` with `false`, which is how a
     * lock click here kept taking the staged transaction. What is left is genuinely this host's: an
     * explicit `geometryOnly` on its options-object commits, and `detachItem` / `transferNode`,
     * which carry no change class the engine could read. Either way it is an admission REQUEST for the in-place
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
            retainTopology: base.retainTopology === true || operation === 'detachItem' || operation === 'transferNode',
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
     * The tear-out retirement seam: closes a vessel the gesture no longer needs (re-entry, cancel, or a
     * refused model commit) through the engine's shared close. The Group's native retirement holds the
     * retirement fence and clears the ownership records around this call. This host's part is its
     * trimmings: the `lastTearOutClose` receipt the tour and the Neural Link read, and the park geometry an
     * acknowledged close retires.
     * @param {Object} vessel
     * @param {String} [vessel.generationToken] The reservation's lineage token.
     * @param {String} vessel.itemId
     * @param {Object} [vessel.nativeRoute] Exact opener-minted physical route when available.
     * @param {String} vessel.windowName
     * @returns {Promise<Boolean>}
     * @protected
     */
    async closeTearOutVessel(vessel) {
        const
            me             = this,
            parkGeometries = me.tearOutParkGeometries,
            closed         = await NativeVesselTransaction.closeVessel({
                embodiment    : me.tearOutEmbodiment,
                nativeWindows : me.nativeWindows,
                ownerWindowId : me.windowId,
                publishReceipt: receipt => me.lastTearOutClose = receipt,
                sourceId      : me.id,
                sourceOwns    : itemId => Boolean(WorkspaceDocument.findContainingTabsId(me.dockModel, itemId)),
                windowNameFor : itemId => `tearout-${itemId}`
            }, vessel);

        closed && delete parkGeometries[vessel.itemId];

        return closed
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
     * Resolves one dragged vessel's exact live FRAME rect for conversion sampling. The sensor reads it
     * only as measurable geometry — a live claim over a live frame converts — and the park records it
     * as the pre-conversion rect, on the plane the docking design record names for the park's
     * target-cover admission: the frame is what the user drags by its corner and what will cover the
     * target's content once parked. Only the runtime window identity may select the manager-owned
     * rect (the logical drag proxy is intentionally ignored).
     * A child that publishes no outer rect samples its inner one — this diverges from the park
     * admission, which is fail-closed on its single declared plane; failing open is deliberate, since
     * refusing an otherwise-authorized live vessel over a missing frame is what that admission's own
     * `rectPlane` documentation warns against.
     * @param {Object} data
     * @param {String|null} data.itemId
     * @returns {Object|null}
     * @protected
     */
    resolveVesselConversionSourceRect({itemId}) {
        let windowId = this.resolveTearOutVessel(itemId)?.windowId,
            record   = windowId && Neo.manager?.Window?.get(windowId),
            rect     = record?.outerRect ?? record?.innerRect;

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
        const workspaceId = vessel.workspaceKey ?? VesselWorkspace.vesselWorkspaceId(itemId);
        const existing    = me.getPopupState(workspaceId);
        let   state       = existing, committed = false;
        try {
            if (!me.tearOutHandlers.capturePane(itemId)) throw new Error(`No live pane for ${itemId}`);
            if (!state) {
                state = me.createPopupWorkspace(workspaceId, me.createVesselWorkspaceDocument(itemId), {committed: false, itemId})
            }
            await me.workspaceSet.transfer({
                operation        : 'transferItem', itemId, sourceWorkspaceId: VesselWorkspace.MAIN_WORKSPACE_ID,
                targetWorkspaceId: workspaceId,
                target           : {
                    operation: 'restoreTab', tabsNodeId: VesselWorkspace.vesselTabsNodeId(itemId),
                    home     : {parentId: state.document.root, slot: 'center'}
                }
            }, {provenance: {origin: 'human'}});
            state.committed = committed = true;
            me.tearOutHandlers.adoptPane(itemId, vessel, me.nativeWindows?.getConnection(me.id, itemId) || null);
            const connection = me.nativeWindows?.getOwner(me.id, itemId);
            if (connection?.windowId) await me.registerVesselWorkspaceTarget({
                app: Neo.apps[connection.windowId], itemId, windowId: connection.windowId
            });
            return true
        } catch (error) {
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

        if (me.getPopupState(VesselWorkspace.vesselWorkspaceId(itemId))?.host) return true;
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

    /**
     * @summary Releases root-owned services and pane content after window resources have retired.
     * The concrete Workspace supplies this one cleanup hook; engine teardown follows it.
     * @protected
     */
    destroyWorkspaceContent() {}

    /** @summary Retires window resources before root content and the engine view tree. @param {...*} args */
    destroy(...args) {
        const me = this;

        me.crossWindowParticipations.forEach(participation => participation?.destroy());
        me.crossWindowParticipations.clear();
        me.getPopupStates().forEach(state => state.host?.destroy());
        me.workspaceSet?.destroy();
        me.dragAffordances?.destroy();
        me.vesselParkHandlers?.destroy();
        me.nativeVesselParkHandlers?.destroy();
        me.vesselProxyEmbodiment?.destroy();
        me.tearOutEmbodiment?.destroy();
        Object.keys(me.provisionalVesselChromes).forEach(windowId => me.retireProvisionalVesselChrome(windowId));

        me.destroyWorkspaceContent();
        super.destroy(...args)
    }
}

export default Neo.setupClass(VesselWorkspace);
