import Controller         from '../../../src/controller/Component.mjs';
import Persistence        from '../../../src/dashboard/dock/model/Persistence.mjs';
import TransactionManager from '../../../src/manager/Transaction.mjs';

/**
 * @summary Workstation actions, durable topology and optional tour-controller activation.
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

    /** @summary Keeps the ordinary theme action independent of playback activation. @param {Object} data @returns {Promise<String>} */
    onToggleWorkspaceTheme(data) {
        return this.component.toggleWorkspaceTheme(data)
    }

    /**
     * @summary Captures the full keyed composition under its explicit active layout identity.
     * @param {String} [layoutId] Defaults to the selected layout, or the new-root name `default`.
     * @returns {Object} The finite topology producer receipt.
     */
    captureTopology(layoutId=this.component.topologyCollection?.activeLayoutId ?? 'default') {
        const selected = this.component.topologyCollection?.topologies?.[layoutId];
        return Persistence.captureTopologyPerspective(this.component.getDockTopologyWorkspaces(), {
            layoutId,
            metadata      : selected?.metadata ?? {},
            placementHints: this.component.getPlacementHints(),
            title         : selected?.title ?? layoutId,
            ...(selected && Object.hasOwn(selected, 'revision') && {revision: selected.revision}),
            ...(selected && Object.hasOwn(selected, 'perspectiveName') && {perspectiveName: selected.perspectiveName})
        })
    }

    /**
     * @summary Saves a named multi-workspace composition and waits for durable acknowledgement.
     * @param {String} [layoutId]
     * @returns {Promise<Object>}
     */
    async saveTopology(layoutId) {
        const group = TransactionManager.get(this.component.topologyGroupId);
        if (!group || this.isDestroyed) return {persisted: false, current: false, errors: ['workspace is no longer open']};
        const queue = group.queue;
        await queue;
        if (TransactionManager.get(group.id) !== group || group.queue !== queue) {
            return {persisted: false, current: false, errors: ['workspace changed while waiting to save']}
        }
        const {topology, errors} = this.captureTopology(layoutId);
        if (errors.length) return {persisted: false, errors};
        const saved = this.component.topologyLibrary.save(topology, {activate: true, replace: true});
        if (saved.errors.length) return {persisted: false, errors: saved.errors};
        const result  = await this.component.topologyLibrary.persist(),
              current = this.captureTopology(topology.layoutId);
        return {
            ...result,
            current: result.current && group.queue === queue && !current.errors.length &&
                JSON.stringify(current.topology) === JSON.stringify(topology)
        }
    }

    /**
     * @summary Lets the Group library own the reconnect lease and durable disposal of this root.
     * @returns {Boolean}
     */
    attachTopologyLibrary() {
        return this.component.topologyLibrary.attachGroup({
            capture: () => this.captureTopology(),
            dispose: () => this.component.destroy(),
            groupId: this.component.topologyGroupId,
            manager: TransactionManager
        })
    }

    /**
     * @summary Populates the reference-addressed parts of the view once its tree exists.
     *
     * The engine's own seam for controllers that need references, so the view never has to hand
     * itself over to be finished.
     */
    onComponentConstructed() {
        this.syncTopologyBar()
    }

    /**
     * @summary Fills the view-declared topology bar's per-workspace recovery buttons.
     *
     * The bar itself is declared by the view, which owns its structure; this reaches it through
     * its reference and supplies only the part that depends on live Group membership.
     *
     * Idempotent and re-callable, but wired to {@link #onComponentConstructed} alone — the same
     * single population the previous shape performed. `WorkspaceSet` publishes no membership
     * signal, so a participant registered after boot still gains no buttons until a reload; that
     * is unchanged here and needs a signal in the engine, not a second reader in this file.
     * @returns {Boolean} Whether the bar was reachable.
     */
    syncTopologyBar() {
        const me  = this,
              bar = me.getReference('topology-toolbar');

        if (!bar || bar.isDestroyed) return false;

        const recovery = me.component.getPopupStates().flatMap(({workspaceId}) => [
            {handler: 'onOpenTopologyWorkspace', text: `Open ${workspaceId} as window`, workspaceKey: workspaceId},
            {handler: 'onMountTopologyWorkspace', text: `Show ${workspaceId} here`,      workspaceKey: workspaceId}
        ]).map(config => ({ntype: 'button', isTopologyRecoveryButton: true, ...config}));

        // Identity, never position. `items` also carries what the toolbar materialises from the
        // view's `actions` — a spacer plus one item per action — so ANY index into it addresses
        // engine-owned structure. Flagging our own is the same device the toolbar uses for
        // its (`isToolbarAction`, `isToolbarActionSpacer`), and it cannot drift against the view.
        const stale = bar.items.filter(item => item.isTopologyRecoveryButton === true);

        // `remove` routes through `removeAt`, the one path that splices `items` AND
        // `getVdomItemsRoot().cn`. A bare `destroy()` defaults `updateParentVdom` to false and
        // leaves a `{componentId}` placeholder resolving to nothing, which throws on the next
        // viewport vdom sync rather than here.
        stale.forEach(item => bar.remove(item, true, true));

        if (recovery.length > 0) {
            // Ahead of the action spacer, so these join the ordinary items instead of stranding
            // past a `flex: 1` gap on the far side of undo/redo.
            const spacer = bar.getActionSpacer();

            bar.insert(spacer ? bar.items.indexOf(spacer) : bar.items.length, recovery)
        } else if (stale.length > 0) {
            bar.updateDepth = -1;
            bar.update()
        }

        return true
    }

    /**
     * @summary Declarative handler: opens the addressed participant in its own window.
     * @param {Object} data
     */
    onOpenTopologyWorkspace(data) {
        return this.openTopologyWorkspace(data.component.workspaceKey)
    }

    /**
     * @summary Declarative handler: mounts the addressed participant into the root inline.
     * @param {Object} data
     */
    onMountTopologyWorkspace(data) {
        return this.mountTopologyWorkspace(data.component.workspaceKey, this.component)
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
        state.app = Neo.apps[target.windowId];
        await this.component.observeWindowGeometry(target.windowId);
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

        const url = new URL('../index.html', import.meta.url);
        url.searchParams.set('workspace', workspaceKey);
        url.searchParams.set('theme', this.component.theme);

        let opened = false;
        try {
            opened = await Neo.Main.windowOpen({
                topologyIdentity: reservation,
                url             : url.href,
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
        const saved = await this.saveTopology();
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
