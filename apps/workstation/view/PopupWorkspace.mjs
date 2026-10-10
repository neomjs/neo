import DockWorkspace     from '../../../src/dashboard/dock/Workspace.mjs';
import Participation     from '../../../src/dashboard/dock/window/Participation.mjs';
import WorkspaceDocument from '../../../src/dashboard/dock/model/WorkspaceDocument.mjs';

/**
 * @summary Owns one popup document while resolving the root's existing live pane instances.
 * @description The Group owns membership and history; the native window is only this Workspace's
 * render target. A warm reload remounts this same owner, including its header Provider.
 * @class Workstation.view.PopupWorkspace
 * @extends Neo.dashboard.dock.Workspace
 */
class PopupWorkspace extends DockWorkspace {
    static config = {
        /**
         * @member {String} className='Workstation.view.PopupWorkspace'
         * @protected
         */
        className: 'Workstation.view.PopupWorkspace',
        /**
         * @member {String[]} cls=['workstation-vessel-dock-host','neo-dashboard']
         */
        cls: ['workstation-vessel-dock-host', 'neo-dashboard'],
        /**
         * The engine participation, declared as a module so the façade composes it synchronously
         * (the class is already in this app's closure); {@link #getDockParticipationConfig} adds
         * the popup's two seams.
         * @member {Object} dockParticipation={module: Participation}
         */
        dockParticipation: {module: Participation},
        /** @member {String} nativeWindowClosePolicy='return' */
        nativeWindowClosePolicy: 'return',
        /** @member {String} nativeWindowReturnTargetKey='main' */
        nativeWindowReturnTargetKey: 'main',
        /**
         * @member {Workstation.view.Workspace|null} rootWorkspace=null
         */
        rootWorkspace: null,
        /**
         * @member {String|null} workspaceKey=null
         */
        workspaceKey: null
    }

    /**
     * The Group's injected dock adapter.
     * @member {Object|null} workspaceSet=null
     */
    workspaceSet = null

    /**
     * Items a cross-window transfer landed here whose pane has not been re-rastered yet.
     * @member {Set<String>} landingItemIds
     * @protected
     */
    landingItemIds = new Set()

    /**
     * Presentation and connection references owned by this popup; membership lives in its Group.
     * Supplied at creation by the root's `createPopupWorkspace`, so the Group registration in
     * {@link #construct} already finds it — a reader reacting to that membership must resolve it.
     * @member {Object|null} runtimeState=null
     */
    runtimeState = null

    /**
     * @summary Registers the document owner before any render target is required.
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);
        const me = this;
        me.workspaceSet.register(me.workspaceKey, {
            ...me.getDockParticipantSeams(me.workspaceKey),
            dispose: () => { if (!me.isDestroyed) me.destroy() }
        })
    }

    /**
     * @summary The popup's two seams over the engine participation the façade composes: the root's
     * proxy embodiment, and a hit-test that admits drops only while populated — an empty retained
     * vessel cannot target its own next tear-out.
     * @returns {Object}
     */
    getDockParticipationConfig() {
        const me = this;

        return {
            dragEmbodiment: me.rootWorkspace.vesselProxyEmbodiment,
            hitTest       : (x, y) => Object.keys(me.dockModel.items).length > 0 && me.participation?.defaultHitTest(x, y) === true
        }
    }

    /**
     * @summary Publishes the Workspace's semantic identity to its projected drag sources.
     * @returns {Object}
     */
    getDockProjectionOptions() {
        return {...super.getDockProjectionOptions(), workspaceId: this.workspaceKey,
            crossWindowSortGroup: this.rootWorkspace.constructor.CROSS_WINDOW_SORT_GROUP, enableStackDrag: true}
    }

    /**
     * @summary A full popup presents a vessel SHELL, so its dockable boundary is the content inside
     * that shell — see {@link Neo.dashboard.dock.Workspace#resolveDockableRoot} for why the pair
     * travels together.
     *
     * Wrapping the shell would leave {@link Neo.dashboard.dock.model.WorkspaceDocument#resolveStackRoot}
     * unable to resolve, and `window.Participation` refuses whole-stack admission unless that
     * resolution matches the transferred `groupNodeId` — so a wrapped shell would keep docking and
     * silently stop being transferable.
     *
     * Two ways to decline, and neither substitutes a rect from a different node. No stack root: the
     * document is not shell-shaped, so the inherited arrangement boundary applies. A stack root with
     * no projected container: nothing measurable represents it, so no boundary is offered at all —
     * naming the stack while measuring the shell is the very mismatch this seam exists to end.
     * @returns {Object|null}
     */
    resolveDockableRoot() {
        let me     = this,
            nodeId = WorkspaceDocument.resolveStackRoot(me.dockModel);

        if (!nodeId) return super.resolveDockableRoot();

        let component = me.getDockHost().down({dockNodeId: nodeId});

        return component ? {component, nodeId} : null
    }

    /**
     * @summary Retains panes that another participant owns after a Group commit.
     * @param {Object} descriptor
     * @param {Object} source
     * @returns {Object}
     */
    getRefreshOptions(descriptor, source) {
        return {...super.getRefreshOptions(descriptor, source), preserveItemIds: descriptor?.preserveItemIds ?? []}
    }

    /**
     * @summary Records the items a cross-window transfer lands in this vessel for {@link #refreshDockWorkspace}.
     * @param {Object|null} document
     * @param {Object|null} [descriptor=null]
     * @param {Object|null} [source=null]
     * @param {Object} [projectionOptions={}]
     * @returns {Promise}
     * @protected
     */
    projectDockZoneDocument(document, descriptor=null, source=null, projectionOptions={}) {
        const me       = this,
              previous = projectionOptions.previousDocument ?? me.dockModel;

        if (['transferItem', 'transferNode'].includes(descriptor?.operation) && descriptor.targetWorkspaceId === projectionOptions.workspaceKey) {
            Object.keys(document?.items ?? {})
                .filter(itemId => !Object.hasOwn(previous?.items ?? {}, itemId))
                .forEach(itemId => me.landingItemIds.add(itemId))
        }

        return super.projectDockZoneDocument(document, descriptor, source, projectionOptions)
    }

    /**
     * @summary Re-rasters each landing pane after the first refresh that finds it seated in this window.
     * @description Chrome can present a vessel's freshly composed pane incomplete — a resident card's kicker
     * and icon without its metric and title — while its DOM is complete and unclipped, until the next
     * invalidation of that region. The transfer's own projection can settle before the pane is
     * seated here, so each refresh checks again; an item that leaves first is dropped.
     * @param {...*} args
     * @returns {Promise}
     * @protected
     */
    async refreshDockWorkspace(...args) {
        const me     = this,
              result = await super.refreshDockWorkspace(...args);

        me.landingItemIds.forEach(itemId => {
            const pane   = me.rootWorkspace.paneCache[itemId],
                  seated = pane?.windowId === me.windowId;

            if (seated || !Object.hasOwn(me.dockModel?.items ?? {}, itemId)) {
                me.landingItemIds.delete(itemId);
                seated && me.repaintLandedPane(pane)
            }
        });

        return result
    }

    /**
     * @summary Gives a landed pane one rendered frame on its own compositing layer: entering the layer rasters
     * the pane from its current layout, leaving it rasters the pane into its parent again.
     * @description A failed render rejects like a destruction does, but the pane survives it: the failure is
     * reported and the layer still comes off. A window that leaves while the frame is in flight rejects the same
     * way and is no failure, so only its departure goes unreported. Only a destroyed pane is left alone.
     * @param {Neo.component.Base|null} pane
     * @returns {Promise<void>}
     * @protected
     */
    async repaintLandedPane(pane) {
        const cls = 'workstation-pane-repaint';

        if (!pane || pane.isDestroyed) return;

        pane.addCls(cls);

        try {
            await pane.promiseUpdate()
        } catch (error) {
            if (pane.isDestroyed) return;
            Neo.currentWorker.isDeparture(error) || console.error('PopupWorkspace: the landed pane\'s repaint render failed', error)
        }

        pane.isDestroyed || pane.removeCls(cls)
    }

    /**
     * @summary Uses the same cached pane, controller, Provider and Store across render targets.
     * @param {String} itemId
     * @param {Object} item
     * @returns {Neo.component.Base}
     */
    resolvePane(itemId, item) {
        return this.rootWorkspace.resolvePane(itemId, item)
    }

    /**
     * @summary Supplies this popup's current physical route to the shared native lifecycle.
     * @returns {Object|null}
     */
    getNativeWindowRoute() { return this.runtimeState?.nativeRoute ?? null }

    /** @summary Identifies the root which opened this render target. @returns {String|null} */
    getNativeWindowOwnerWindowId() { return this.rootWorkspace.windowId }

    /** @summary Uses the root's product URL and window presentation. @param {Object} reservation @returns {Object} */
    getNativeWindowOpenConfig(reservation) { return this.rootWorkspace.getNativeWindowOpenConfig(reservation) }

    /** @summary Supplies the recorded pane homes without owning the return algorithm. @returns {Object} */
    getNativeWindowReturnPlacements() { return this.rootWorkspace.tearOutHandlers.placements }

    /**
     * @summary Detaches only this popup's presentation; its document and membership stay retained.
     * @param {Object} data The released native generation.
     */
    onNativeWindowDetached(data) {
        this.parent?.remove(this, false, true);
        this.windowId = null;
        const state = this.runtimeState;
        if (state) {
            state.disconnected = true;
            state.windowId = state.app = state.renderTarget = null
        }
        if (this.rootWorkspace.lastCrossWindowTransfer?.sourceWorkspaceId === this.workspaceKey) {
            this.rootWorkspace.lastCrossWindowTransfer.topologyExited = true
        }
    }

    /** @summary Forwards the shared return receipt to the product's root. @param {Object} receipt @returns {void} */
    onDockWorkspaceReturn(receipt) { return this.rootWorkspace.onDockWorkspaceReturn(receipt) }

    /**
     * @summary Retires this popup's Group membership and interaction registration.
     */
    destroy() {
        if (Neo.manager.Transaction.getParticipant(this.topologyGroupId, this.workspaceKey)?.componentId === this.id) {
            this.workspaceSet.unregister(this.workspaceKey)
        }
        this.runtimeState = null;
        super.destroy()
    }
}

export default Neo.setupClass(PopupWorkspace);
