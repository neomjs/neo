import Controller          from '../../../src/controller/Component.mjs';
import TransactionManager  from '../../../src/manager/Transaction.mjs';
import {resolveBootIntent} from '../BootIntent.mjs';

/**
 * @summary Workstation actions, durable topology, window adoption and optional tour-controller activation.
 * @class Workstation.view.WorkspaceController
 * @extends Neo.controller.Component
 */
class WorkspaceController extends Controller {
    static config = {
        /** @member {String} className='Workstation.view.WorkspaceController' */
        className: 'Workstation.view.WorkspaceController'
    }

    /** @member {Promise|null} tourControllerPromise=null */
    tourControllerPromise = null

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        Neo.currentWorker.on({connect: this.onWindowConnect, scope: this});
        TransactionManager.on({leaseExpired: this.onPopupLeaseExpired, scope: this})
    }

    /**
     * @param {...*} args
     */
    destroy(...args) {
        Neo.currentWorker.un({connect: this.onWindowConnect, scope: this});
        TransactionManager.un({leaseExpired: this.onPopupLeaseExpired, scope: this});

        super.destroy(...args)
    }

    /**
     * @summary A window bound into this root's Group announced itself: the root adopts it.
     *
     * The worker publishes `connect` once the window's app and main view exist, so the render target is
     * live. The binding says which slot the window took; the window's own URL says what it came FOR, and
     * the two must agree — a non-matching arrival is ignored rather than adopted, the owner's half of the
     * fail-closed contract whose other half is the arriving viewport's refusal. Both halves read the URL
     * through `resolveBootIntent`, so neither can call an intent what the other calls none. Three arrivals
     * are adopted:
     *
     * - the root's own `main` slot (the one {@link Workstation.view.Workspace#registerMainWorkspace} binds
     *   under) rebound to a new window — a reload of the main window while this worker lives — so the root
     *   moves itself into the new render target;
     * - a restored `?workspace=<key>` window bound under `key`;
     * - a reloaded vessel window bound under its item's key.
     *
     * A vessel connecting for the first time belongs to the tear-out lifecycle, which registers its target
     * itself; this handler recognises an already-mounted host and leaves it alone.
     * @param {Object} data
     * @param {String} data.windowId
     * @returns {Promise<Boolean>} Whether this call adopted the window.
     */
    async onWindowConnect({windowId}) {
        const me = this, root = me.component;

        if (!root || root.isDestroyed || windowId === root.windowId) return false;

        const binding = TransactionManager.findByWindow(windowId);

        if (!binding || binding.groupId !== root.topologyGroupId) return false;

        const target = Neo.apps[windowId]?.mainView;

        if (!target || target.isDestroyed) return false;

        const intent = resolveBootIntent(windowId);

        if (binding.workspaceKey === 'main') {
            if (intent.mode !== 'default') return false;

            // The old render target is gone; detach silently before the ordinary cross-window add.
            root.parent?.remove(root, false, true);
            target.add(root);

            return true
        }

        const declared = intent.mode === 'workspace' ? intent.key
            : intent.mode === 'popout' ? root.tearOutWorkspaceKey(intent.key) : null;

        if (declared !== binding.workspaceKey) return false;

        const state = root.getPopupState(binding.workspaceKey);

        if (!state || (state.windowId === windowId && state.host?.parent === target && !state.disconnected)) {
            return false
        }

        // A retained vessel whose stack went home holds an empty document: nothing to remount. A vessel window
        // arriving under its key is the item's NEXT tear-out, born pre-terminal — the tear-out lifecycle
        // stages the pane now and mounts this host at the terminal, once the transfer has filled it. Mounting
        // it here would seat an empty dock host beside the staged pane, each at half the window.
        if (intent.mode === 'popout' && !Object.keys(state.document?.items ?? {}).length) return false;

        return me.mountTopologyWorkspace(binding.workspaceKey, target)
    }

    /**
     * @summary Recovers a formerly bound popup after its reconnect lease expires.
     * An opener reload may lose physical-handle observation. Lease expiry is a separate semantic
     * recovery boundary; never-bound admissions keep their existing recovery policy.
     * @param {Object} data
     * @param {String} data.groupId
     * @param {String} data.workspaceKey
     * @returns {Promise<Boolean>|undefined}
     */
    onPopupLeaseExpired({groupId, workspaceKey}) {
        const root = this.component, state = root.getPopupState(workspaceKey);
        if (groupId === root.topologyGroupId && Neo.apps[root.windowId] && state?.awaitingClosure && state.disconnected) {
            return root.returnClosedPopupWorkspace(workspaceKey, 'popup-reconnect-expired')
        }
    }

    /**
     * @summary Installs the optional playback controller on its real toolbar at first activation.
     * @returns {Promise<Workstation.view.TourController>}
     */
    async getTourController() {
        const me = this, bar = me.getReference('tour-bar');
        if (me.isDestroyed || !bar || bar.isDestroyed) throw Neo.isDestroyed;
        if (bar.controller && !bar.controller.isDestroyed) return bar.controller;
        return me.tourControllerPromise ??= (async () => {
            await me.trap(Promise.resolve(bar.controller?.settledPromise));
            const {default: TourController} = await me.trap(import('./TourController.mjs'));
            if (bar.isDestroyed) throw Neo.isDestroyed;
            bar.controller = {module: TourController, workspace: me.component};
            return bar.controller
        })().finally(() => {
            if (!me.isDestroyed) me.tourControllerPromise = null
        })
    }

    /** @summary Routes the declarative start action to the activated playback controller. @returns {Promise<Object>} */
    async onStartTour() {
        return (await this.getTourController()).startTour()
    }

    /** @summary Routes the film start action to the activated playback controller. @returns {Promise<Object>} */
    async onStartFilmTour() {
        return (await this.getTourController()).startFilmTour()
    }

    /**
     * @summary Resolves the running playback's pending viewer gate. The click that reaches this
     * handler is the user activation the gated window beat needs, so nothing is deferred here.
     * @returns {Boolean} False when no playback is waiting at a gate.
     */
    onContinueTour() {
        const controller = this.getReference('tour-bar')?.controller;
        return controller && !controller.isDestroyed ? controller.continueTour() : false
    }

    /** @summary Keeps the ordinary theme action independent of playback activation. @param {Object} data @returns {Promise<String>} */
    onToggleWorkspaceTheme(data) {
        return this.component.toggleWorkspaceTheme(data)
    }


    /**
     * @summary Presents an already hydrated participant without changing its document or history.
     * @param {String} workspaceKey
     * @param {Neo.container.Base} target A user-activated window or the root's inline fallback.
     * @returns {Promise<Boolean>}
     */
    async mountTopologyWorkspace(workspaceKey, target) {
        const state = this.component.getPopupState(workspaceKey);
        if (!state || !target || target.isDestroyed) return false;

        state.renderTarget = target;
        state.windowId = target.windowId;
        state.awaitingClosure = false;
        state.app = Neo.apps[target.windowId];
        await this.component.observeWindowGeometry(target.windowId);
        state.nativeRoute = Neo.manager.Window.get(target.windowId)?.nativeRoute ?? state.nativeRoute ?? null;
        if (TransactionManager.getBinding(this.component.topologyGroupId, workspaceKey)?.windowId === target.windowId) {
            await this.component.dockPlacement.restoreBinding(workspaceKey)
        }
        if (state.host && !state.host.isDestroyed) {
            state.host.parent?.remove(state.host, false, true);
            target.add(state.host);
            state.disconnected = false;
            return true
        }
        const mounted = await this.component.mountVesselWorkspace(workspaceKey);
        if (mounted) state.disconnected = false;
        return mounted
    }

    /**
     * @summary Requests a render target only from an explicit user action; refusal keeps its owner.
     * @param {String} workspaceKey
     * @returns {Promise<Object>} A separate native-effect receipt, never semantic restore success.
     */
    async openTopologyWorkspace(workspaceKey) {
        const state = this.component.getPopupState(workspaceKey);
        if (!state) return {opened: false, errors: ['unknown workspace']};
        const reservation = TransactionManager.reserve({groupId: this.component.topologyGroupId, workspaceKey});
        if (!reservation) return {opened: false, errors: ['workspace already has a window']};

        // Relative, as in VesselWorkspace: `windowOpen` resolves it against the opener's page. Under
        // webpack, `new URL(…, import.meta.url)` becomes a copy of the source page that cannot boot.
        const params = new URLSearchParams({workspace: workspaceKey, theme: this.component.theme});

        let opened = false;
        try {
            opened = await Neo.Main.windowOpen({
                topologyIdentity: reservation,
                url             : `./index.html?${params}`,
                windowFeatures  : 'width=700,height=600',
                windowId        : this.component.windowId,
                windowName      : `workstation-restored-${crypto.randomUUID()}`
            }) === true
        } catch {
            opened = false
        }
        if (!opened) TransactionManager.revoke(reservation);
        return {opened, errors: opened ? [] : ['window was refused; the workspace remains available here']}
    }

    /**
     * @summary Durably saves before clearing every carried Group identity and releasing its windows.
     * @returns {Promise<Object>} Persistence or carrier refusal leaves the Workspace open.
     */
    async closeTopology() {
        const saved = await this.component.saveTopology();
        if (!saved.persisted || !saved.current) return {closed: false, errors: saved.errors};
        const group    = TransactionManager.get(this.component.topologyGroupId),
              queue    = group.queue,
              bindings = [...group.bindings.values()].filter(binding => binding.windowId).map(binding => ({...binding})),
              windows  = bindings.map(binding => binding.windowId);
        const cleared = await Promise.all(windows.map(windowId =>
            Neo.Main.clearTopologyIdentity({groupId: group.id, windowId}).then(value => value === true, () => false)
        ));
        if (cleared.some(value => value !== true) || group.queue !== queue) {
            await Promise.allSettled(bindings.filter((binding, index) => cleared[index] === true).map(binding =>
                Neo.Main.setTopologyIdentity({...binding, groupId: group.id, onlyIfEmpty: true})
            ));
            return {closed: false, errors: ['workspace changed or a window refused to clear its identity']}
        }

        windows.forEach(windowId => {
            Neo.Main.closeTopologyWindow({windowId}).catch(() => {});
        });
        return {closing: true, errors: []}
    }

    /**
     * @summary Reports semantic boot and persistence state without exposing live owner references.
     * @returns {Object}
     */
    getTopologyState() {
        const group = TransactionManager.get(this.component.topologyGroupId);
        return {
            groupId       : group.id,
            historyCount  : group.history?.count ?? 0,
            historyCursor : group.history?.cursor ?? -1,
            libraryVersion: this.component.topologyLibrary.version,
            snapshot      : group.snapshot ?? null,
            workspaceHosts: Object.fromEntries(this.component.getPopupStates().map(state => [state.workspaceId, {
                disconnected: state.disconnected,
                hostId      : state.host?.id ?? null,
                windowId    : state.windowId
            }])),
            workspaceKeys: this.component.workspaceSet.ids()
        }
    }

}

export default Neo.setupClass(WorkspaceController);
