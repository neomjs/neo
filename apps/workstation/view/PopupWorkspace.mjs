import DockWorkspace from '../../../src/dashboard/dock/Workspace.mjs';
import Participation from '../../../src/dashboard/dock/window/Participation.mjs';

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
     * @member {Neo.dashboard.dock.window.Participation|null} participation=null
     */
    participation = null

    /**
     * Presentation and connection references owned by this popup; membership lives in its Group.
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
            componentId: me.id,
            dispose: () => { if (!me.isDestroyed) me.destroy() },
            getDocument: () => me.dockModel,
            setDocument: value => me.dockModel = value,
            project: context => me.projectDockZoneDocument(context.snapshot.participants[me.workspaceKey], context.descriptor, me, {
                preserveItemIds: context.preserveItemIds
            })
        });
        me.syncParticipation()
    }

    /**
     * @summary Rebinds the document's interaction owner to its current window.
     * @param {String|null} value
     * @param {String|null} oldValue
     */
    afterSetWindowId(value, oldValue) {
        super.afterSetWindowId(value, oldValue);
        this.configsApplied && this.syncParticipation()
    }

    /**
     * @summary Owns one interaction participant per live popup render target.
     */
    syncParticipation() {
        const me = this;
        me.participation?.destroy();
        me.participation = me.windowId && me.workspaceSet ? Neo.create(Participation, {
            dragEmbodiment: me.rootWorkspace.vesselProxyEmbodiment,
            sortGroup     : me.rootWorkspace.constructor.CROSS_WINDOW_SORT_GROUP,
            windowId      : me.windowId, workspace: me, workspaceId: me.workspaceKey, workspaceSet: me.workspaceSet
        }) : null
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
     * @summary Retains panes that another participant owns after a Group commit.
     * @param {Object} descriptor
     * @param {Object} source
     * @returns {Object}
     */
    getRefreshOptions(descriptor, source) {
        return {...super.getRefreshOptions(descriptor, source), preserveItemIds: descriptor?.preserveItemIds ?? []}
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
     * @summary Retires this popup's Group membership and interaction registration.
     */
    destroy() {
        this.participation?.destroy();
        if (Neo.manager.Transaction.getParticipant(this.topologyGroupId, this.workspaceKey)?.componentId === this.id) {
            this.workspaceSet.unregister(this.workspaceKey)
        }
        this.runtimeState = null;
        super.destroy()
    }
}

export default Neo.setupClass(PopupWorkspace);
