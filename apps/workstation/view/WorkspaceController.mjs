import Controller         from '../../../src/controller/Component.mjs';
import Persistence        from '../../../src/dashboard/dock/model/Persistence.mjs';
import TransactionManager from '../../../src/manager/Transaction.mjs';

/**
 * @summary Workstation's durable topology selection and user-activated render targets.
 * @class Workstation.view.WorkspaceController
 * @extends Neo.controller.Component
 */
class WorkspaceController extends Controller {
    static config = {
        /** @member {String} className='Workstation.view.WorkspaceController' */
        className: 'Workstation.view.WorkspaceController'
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
            placementHints: selected?.placementHints ?? {},
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
     * @summary Provides explicit save/close and user-activated recovery for headless saved windows.
     * @returns {Object} Toolbar configuration.
     */
    createTopologyBar() {
        const me    = this,
              items = [{ntype: 'button', text: 'Save workspace', handler: () => me.saveTopology()},
                  {ntype: 'button', text: 'Close workspace', handler: () => me.closeTopology()}];

        for (const workspaceKey of me.component.vesselWorkspaces.keys()) {
            items.push(
                {ntype: 'button', text: `Open ${workspaceKey} as window`, handler: () => me.openTopologyWorkspace(workspaceKey)},
                {ntype: 'button', text: `Show ${workspaceKey} here`, handler: () => me.mountTopologyWorkspace(workspaceKey, me.component)}
            )
        }

        return {
            ntype    : 'toolbar',
            cls      : ['workstation-topologybar'],
            flex     : 'none',
            items,
            layout   : {ntype: 'flexbox', align: 'center', direction: 'row', wrap: 'wrap'},
            reference: 'topology-toolbar'
        }
    }

    /**
     * @summary Presents an already hydrated participant without changing its document or history.
     * @param {String} workspaceKey
     * @param {Neo.container.Base} target A user-activated window or the root's inline fallback.
     * @returns {Promise<Boolean>}
     */
    async mountTopologyWorkspace(workspaceKey, target) {
        const state = this.component.vesselWorkspaces.get(workspaceKey);
        if (!state || !target || target.isDestroyed) return false;

        state.renderTarget = target;
        state.windowId = target.windowId;
        state.app = Neo.apps[target.windowId];
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
        const state = this.component.vesselWorkspaces.get(workspaceKey);
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
            workspaceHosts: Object.fromEntries([...this.component.vesselWorkspaces].map(([key, state]) => [key, {
                disconnected: state.disconnected,
                hostId      : state.host?.id ?? null,
                windowId    : state.windowId
            }])),
            workspaceKeys: TransactionManager.participantKeys(group.id)
        }
    }

}

export default Neo.setupClass(WorkspaceController);
