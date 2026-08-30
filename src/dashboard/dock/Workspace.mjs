import Component                   from '../../component/Base.mjs';
import Container                   from '../../container/Base.mjs';
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
         * Projects one persistent close action into each Dock tab header. Disabled by default;
         * applications opt into model-authoritative close semantics explicitly.
         * @member {Boolean} enableDockCloseAction=false
         */
        enableDockCloseAction: false,
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

        try {
            vessel = await me.openTearOutVessel(request)
        } catch (error) {
            vessel = null
        }

        if (!vessel) {
            me.tearOutAdmissions.get(itemId) === admission && me.clearTearOutAdmission(itemId, admission);
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
     * Hook: opens the consumer's platform-specific tear-out vessel. The engine owns gesture
     * admission and passes its token; a consumer owns URL, shell and geometry.
     * @param {Object} request
     * @returns {Promise<Object|null>|Object|null}
     * @protected
     */
    openTearOutVessel(request) {
        return null
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
     * Hook: resolves the app-owned live pane that a vessel should embody.
     * @param {String} itemId
     * @returns {Neo.component.Base|null}
     * @protected
     */
    resolveTearOutPane(itemId) {
        return null
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
     * @param {String} itemId
     * @param {Object} entry
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
        me.reintegrateTearOutItem(itemId, pane)
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

        // The grant hook is an async boundary. Retirement, timeout or a successor admission may
        // have replaced this exact record while policy was deciding.
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
        let me         = this,
            placement  = me.tearOutPlacements[itemId],
            doc        = me.dockModel,
            storedHome = placement && doc?.nodes?.[placement.tabsNodeId]?.type === 'tabs' ? placement.tabsNodeId : null,
            fallback   = storedHome || Object.entries(doc?.nodes || {}).find(([, node]) => node.type === 'tabs')?.[0],
            live       = pane && !pane.isDestroyed,
            result;

        delete me.tearOutPlacements[itemId];

        if (!doc?.items?.[itemId] || !fallback) {
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

        result = me.applyDockZoneOperation({
            operation : 'addTab',
            itemId,
            tabsNodeId: fallback,
            ...(storedHome ? {index: placement.index} : {})
        });

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
     * must be unique per node and `close` is reserved while {@link #enableDockCloseAction} is on;
     * both violations throw at projection rather than silently unaddressing an action. Their intent
     * surfaces on the `dockHeaderAction` event — see {@link #onDockHeaderAction}.
     * @returns {Object}
     */
    getDockProjectionOptions() {
        return this.enableDockTearOutLifecycle
            ? {enableDockTearOut: true, ...this.tearOutHandlers}
            : {}
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
     * @param {Neo.tab.Container|null} tabContainer
     * @protected
     */
    syncDockCloseAction(tabContainer) {
        let action = tabContainer?.getActionItem?.('close'),
            itemId = this.getActiveDockItemId(tabContainer),
            hidden = !itemId || this.dockModel?.items?.[itemId]?.closable === false;

        action && action.hidden !== hidden && (action.hidden = hidden)
    }

    /**
     * Synchronizes every projected close action after reconciliation, including retained tabs
     * whose action instance outlived a model-policy or active-item change.
     * @param {Map<String,Neo.tab.Container>|null} [tabs=null]
     * @protected
     */
    syncDockCloseActions(tabs=null) {
        let projectedTabs = tabs;

        if (!projectedTabs) {
            let shell = this.getDockHost()?.items?.[this.dockShellIndex];

            projectedTabs = shell ? Reconciler.collectProjectedTabs(shell) : new Map()
        }

        projectedTabs?.forEach?.(tab => this.syncDockCloseAction(tab))
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

        if (!me.dockModel || !itemId || committed === itemId) {
            return null
        }

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
     * This class owns exactly one action: `close`, and only while {@link #enableDockCloseAction} is
     * on. Every other intent — including host actions projected through
     * `resolveDockHeaderActions` — is re-emitted as a **`dockHeaderAction`** event carrying
     * `{action, dockNodeId, tabContainer}`, so a host receives it without subclassing this class or
     * overriding a protected method, and this method returns `null` for it.
     * Live reconciled order owns the close target at dispatch time. The current model locates that
     * item's semantic tabs node, and the committed result owns its focus successor. Successful focus
     * is chained onto `refreshPromise`, so it cannot reach chrome the reconciler retires.
     * @param {Object} data
     * @param {String} data.action
     * @param {String} data.dockNodeId
     * @param {Neo.tab.Container} data.tabContainer
     * @returns {{document:Object,errors:String[]}|null}
     */
    onDockHeaderAction({action, dockNodeId, tabContainer}={}) {
        if (action !== 'close' || !this.enableDockCloseAction) {
            // Not an action this class owns. Re-emit it so a host that projected its own actions
            // through `resolveDockHeaderActions` receives the intent with its tabs node identified,
            // without having to override a protected method or subclass at all. Dropping it here is
            // what made the header slot unusable for anyone but the close action.
            this.fire('dockHeaderAction', {action, dockNodeId, tabContainer});

            return null
        }

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
        let me                  = this,
            tabInsertDescriptor = me.getTabInsertProjectionDescriptor(document, descriptor),
            refreshOptions      = me.getRefreshOptions(descriptor, source),
            tail                = me.refreshPromise?.catch(() => {}) || Promise.resolve();

        me.dockModel = document;

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
                onDockActiveIndexChange: me.onDockActiveIndexChange.bind(me),
                // Bound unconditionally: a host can project its OWN header actions without enabling
                // the close action, and wiring the seam inside that opt-in left those intents with
                // nowhere to arrive.
                onDockHeaderAction     : me.onDockHeaderAction.bind(me),
                ...(me.enableDockCloseAction && {enableDockCloseAction: true}),
                applyDockZoneOperation   : me.applyDockZoneOperation.bind(me),
                onDockZoneDocumentChange : me.onDockZoneDocumentChange.bind(me),
                resolveComponentRef      : itemResolver || ((componentRef, item, itemId) => me.resolveProjectedPane(itemId, item)),
                resolveRevealComponentRef: (componentRef, item, itemId) => me.decorateFlipMarker(me.resolveRevealPane(itemId, item), itemId),
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

        const result = await Reconciler.reconcileProjection({
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
        });

        me.syncDockCloseActions(result?.currentTabs);

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
}

export default Neo.setupClass(Workspace);
