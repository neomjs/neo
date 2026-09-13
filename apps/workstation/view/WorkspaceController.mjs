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

        Neo.currentWorker.on({connect: this.onWindowConnect, scope: this})
    }

    /**
     * @param {...*} args
     */
    destroy(...args) {
        Neo.currentWorker.un({connect: this.onWindowConnect, scope: this});

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

        return me.mountTopologyWorkspace(binding.workspaceKey, target)
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

    /** @summary Keeps the ordinary theme action independent of playback activation. @param {Object} data @returns {Promise<String>} */
    onToggleWorkspaceTheme(data) {
        return this.component.toggleWorkspaceTheme(data)
    }

    /**
     * @summary Declarative handler: the toolbar's Save routes to the component's own command.
     *
     * The click payload stops here. A button invokes a string handler with its click data, and the
     * component's `saveTopology(layoutId)` takes an optional layout id — routed together, the payload
     * became the record's name and the producer refused every click. The handler names no layout, so
     * the save lands under the collection's own pointer.
     * @param {Object} data The click payload; unused by design.
     * @returns {Promise<Object>}
     */
    onSaveTopology(data) {
        return this.component.saveTopology()
    }

    /**
     * @summary Populates the reference-addressed parts of the view once its tree exists.
     *
     * The engine's own seam for controllers that need references, so the view never has to hand
     * itself over to be finished.
     */
    onComponentConstructed() {
        const me = this, set = me.component.workspaceSet;

        me.syncTopologyBar();

        // Membership arrives after boot too — a pane torn into its own window, a saved window reopened —
        // and the bar follows it. The subscription is the observer's: it dies with this controller.
        set && me.observeConfig(set, 'memberIds', () => me.syncTopologyBar())
    }

    /**
     * @summary Fills the view-declared topology bar's per-workspace recovery buttons.
     *
     * The bar itself is declared by the view, which owns its structure; this reaches it through
     * its reference and supplies only the part that depends on live Group membership.
     *
     * Idempotent and re-callable: it runs once at {@link #onComponentConstructed} for the first paint,
     * and again whenever the `WorkspaceSet` republishes its `memberIds`, so a participant registered
     * after boot gains its buttons — and one unregistered loses them — without a reload.
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
