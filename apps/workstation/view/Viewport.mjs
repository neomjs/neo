import BaseViewport from '../../../src/container/Viewport.mjs';
import Transaction  from '../../../src/manager/Transaction.mjs';
import Workspace    from './Workspace.mjs';

/**
 * @summary Standalone viewport for the living-data Workstation flagship.
 *
 * The viewport owns only the render root. Workstation owns the state provider, dock document,
 * stores, pane cache, and deterministic tour so the application remains independently bootable.
 *
 * Two boot modes, resolved from the window's own search params (async — the worker reads the
 * URL through the main-thread seam, so the workspace mounts in `onConstructed`):
 *
 * - default         → the dense living-data workspace (`Workspace`)
 * - `?popout=<id>`  → an EMPTY pop-out host: this window carries no workspace of its own; the
 *   opener's workspace reparents the live pane into this viewport (the shared-heap contract —
 *   one App Worker, two render targets; the dockdemo vessel-shell sibling pattern).
 * - `?workspace=<key>` → a render target for an already hydrated keyed document.
 *
 * @class Workstation.view.Viewport
 * @extends Neo.container.Viewport
 */
class Viewport extends BaseViewport {
    static config = {
        /**
         * @member {String} className='Workstation.view.Viewport'
         * @protected
         */
        className: 'Workstation.view.Viewport',
        /**
         * @member {String[]} cls=['workstation-viewport']
         */
        cls: ['workstation-viewport'],
        /**
         * @member {Object} layout
         */
        layout: {ntype: 'vbox', align: 'stretch'}
    }

    /**
     * @summary Resolves the boot mode and mounts the Group's retained Workspace on a warm rebind. A fresh
     * root creates its Workspace; a pop-out vessel waits for its live pane instead.
     */
    async onConstructed() {
        super.onConstructed();

        let me     = this,
            url    = await Neo.Main.getByPath({path: 'document.URL', windowId: me.windowId}),
            params = new URL(url).searchParams;

        if (me.isDestroyed) return;

        if (params.get('popout')) {
            me.addCls('workstation-popout-host');
            return
        }

        if (params.has('workspace')) {
            const binding = Transaction.findByWindow(me.windowId),
                  owner   = binding && Transaction.getParticipant(binding.groupId, binding.workspaceKey),
                  root    = owner?.componentId && Neo.getComponent(owner.componentId);
            if (root && binding.workspaceKey === params.get('workspace')) {
                await root.getController().mountTopologyWorkspace(binding.workspaceKey, me)
            } else {
                me.add({ntype: 'component', html: 'This saved window is waiting for its original workspace.'})
            }
            return
        }

        const binding     = Transaction.findByWindow(me.windowId),
              participant = binding && Transaction.getParticipant(binding.groupId, Workspace.MAIN_WORKSPACE_ID),
              workspace   = participant?.componentId && Neo.getComponent(participant.componentId);

        if (workspace) {
            // The old render target is gone; detach silently before the ordinary cross-window add.
            workspace.parent?.remove(workspace, false, true);
            me.add(workspace)
        } else {
            await me.createRoot(binding, params.get('layout') ?? undefined)
        }
    }

    /**
     * @summary Hydrates one explicitly selected topology before mounting its root render target.
     * @description Only a root binding can read storage. Popup carriers never select saved roots.
     * The library is reused with the Workspace on warm F5; this path runs only for a new heap owner.
     * @param {Object} binding The admitted Group binding.
     * @param {String} [layoutId] Omission uses only the persisted activeLayoutId.
     * @returns {Promise<void>}
     */
    async createRoot(binding, layoutId) {
        const me = this;
        if (!binding || binding.workspaceKey !== 'main') {
            me.add({ntype: 'component', html: 'This window is waiting for its original workspace.'});
            return
        }

        const {default: TopologyLibrary} = await import('../../../src/dashboard/dock/persistence/TopologyLibrary.mjs'),
              library                    = Neo.create(TopologyLibrary, {
                  persistenceAdapter: TopologyLibrary.createIndexedDBAdapter(binding.groupId)
              }),
              loaded = await library.hydrate();

        let selection = {topology: null, errors: []}, workspace;
        if (loaded.hydrated || layoutId !== undefined) selection = library.prepareSelection(layoutId);

        const errors = [...loaded.errors, ...selection.errors];
        if (selection.topology && !selection.topology.workspaces[Workspace.MAIN_WORKSPACE_ID]) {
            errors.push('saved topology has no Workstation root')
        }

        if (me.isDestroyed || errors.length) {
            library.destroy();
            if (!me.isDestroyed) me.showRootFailure();
            return
        }

        try {
            workspace = Neo.create(Workspace, {
                flex           : 1,
                initialTopology: selection.topology,
                topologyGroupId: binding.groupId,
                topologyLibrary: library,
                windowId       : me.windowId
            });

            if (selection.topology) {
                await Transaction.write({
                    cause       : 'cold-hydrate',
                    changes     : Object.entries(selection.topology.workspaces).map(([workspaceKey, document]) => ({workspaceKey, input: document})),
                    cursorAction: 'preserve',
                    descriptor  : {operation: 'hydrateTopology', layoutId: selection.topology.layoutId},
                    groupId     : binding.groupId,
                    provenance  : {source: 'cold-hydrate'}
                });
                library.adoptCollection(selection.collection, {expectedVersion: selection.version})
            }

            if (me.isDestroyed) {
                workspace.destroy();
                return
            }

            workspace.getController().attachTopologyLibrary();
            me.add(workspace);
            if (!selection.topology) await workspace.saveTopology()
        } catch (error) {
            workspace?.destroy();
            library.destroy();
            if (!me.isDestroyed) me.showRootFailure();
            throw error
        }
    }

    /**
     * @summary Offers an explicit fresh root when a persisted selection cannot be used.
     */
    showRootFailure() {
        this.add([
            {ntype: 'component', html: 'The saved workspace could not be loaded.'},
            {ntype: 'button', text: 'Start a new workspace', handler: () => this.startBlankRoot()}
        ])
    }

    /**
     * @summary Starts a new logical root without replacing the refused saved collection.
     * @returns {Promise<void>}
     */
    async startBlankRoot() {
        Transaction.release(this.windowId);
        const binding = await Transaction.admit({topologyIdentity: {}, windowId: this.windowId});
        if (binding.outcome === 'refused' || this.isDestroyed) return;
        this.removeAll();
        await this.createRoot(binding)
    }
}

export default Neo.setupClass(Viewport);
