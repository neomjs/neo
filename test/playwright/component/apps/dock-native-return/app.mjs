import DockWorkspace           from '../../../../../src/dashboard/dock/Workspace.mjs';
import NativeVesselTransaction from '../../../../../src/dashboard/dock/window/NativeVesselTransaction.mjs';
import WorkspaceDocument       from '../../../../../src/dashboard/dock/model/WorkspaceDocument.mjs';
import WorkspaceSet            from '../../../../../src/dashboard/dock/window/WorkspaceSet.mjs';
import TransactionManager      from '../../../../../src/manager/Transaction.mjs';
import BaseViewport            from '../../../../../src/container/Viewport.mjs';
import '../../../../../src/button/Base.mjs';
import '../../../../../src/tab/Container.mjs';
import '../../../../../src/toolbar/Base.mjs';

/** @summary Supplies ordinary named pane configs to a minimal two-workspace host. */
const documentFor = (root, itemIds) => ({
    schema: 'neo.dock.zone.v1', root: `${root}-shell`,
    items : Object.fromEntries(itemIds.map(itemId => [itemId, {title: itemId}])),
    nodes : {
        [`${root}-shell`]: {type: 'edge-zone', zones: {center: {nodeId: root}}},
        [root]           : {type: 'tabs', items: itemIds, activeItemId: itemIds[0]}
    }
});

/**
 * @summary A small consumer of shared native-window return, with no app-specific return algorithm.
 * @class Test.Playwright.DockNativeReturn.Workspace
 * @extends Neo.dashboard.dock.Workspace
 */
class Workspace extends DockWorkspace {
    static config = {
        /** @member {String} className='Test.Playwright.DockNativeReturn.Workspace' @protected */
        className: 'Test.Playwright.DockNativeReturn.Workspace',
        /** @member {Object|null} rootWorkspace=null Owner of the opener's URL and native window. */
        rootWorkspace: null,
        /** @member {String|null} workspaceKey=null Semantic document identity. */
        workspaceKey: null,
        /** @member {Object} layout={ntype:'vbox',align:'stretch'} */
        layout: {ntype: 'vbox', align: 'stretch'}
    }

    /** @member {Object|null} nativeRoute=null Route retained when a render target disconnects. */
    nativeRoute = null

    /** @member {Object|null} lastReturnReceipt=null Latest shared return outcome for the host's presentation. */
    lastReturnReceipt = null

    /** @summary Projects the initial document without creating a history row. @param {Object} config */
    construct(config) {
        super.construct(config);
        if (this.windowId) this.add(this.projectDockModel())
    }

    /** @summary Resolves each live pane once, including after return and undo. @param {String} itemId @returns {Object} */
    resolvePane(itemId) {
        return Neo.get(`native-return-pane-${itemId}`) || {
            ntype: 'component', id: `native-return-pane-${itemId}`, text: itemId
        }
    }

    /** @summary Supplies the exact opener-minted native route after detachment. @returns {Object|null} */
    getNativeWindowRoute() { return this.nativeRoute }

    /** @summary Opens a retained document from the root's live render target. @returns {String|null} */
    getNativeWindowOwnerWindowId() { return this.rootWorkspace?.windowId ?? this.windowId }

    /** @summary Supplies product URL and features; the engine adds the reserved topology identity. @returns {Object} */
    getNativeWindowOpenConfig() {
        const url = new URL(this.rootWorkspace.appUrl);
        url.searchParams.set('popup', '1');
        return {url: url.href, windowName: `native-return-${crypto.randomUUID()}`,
            nativeCapabilities: {close: true, position: true, resize: true},
            windowFeatures    : 'height=480,width=640'}
    }

    /** @summary Supplies serialized homes; ordering and transfer belong to WorkspaceSet. @returns {Object} */
    getNativeWindowReturnPlacements() {
        return {alpha: {tabsNodeId: 'landing-tabs', index: 1}, beta: {tabsNodeId: 'landing-tabs', index: 2}}
    }

    /** @summary Exposes an ordinary product command to re-embody the same semantic participant. @returns {Promise<Object>} */
    openPopup() { return NativeVesselTransaction.embodyWorkspace(this.workspaceSet, 'detached-document') }

    /** @summary Keeps the engine's return outcome available to product presentation. @param {Object} receipt */
    onDockWorkspaceReturn(receipt) {
        super.onDockWorkspaceReturn(receipt);
        this.lastReturnReceipt = receipt
    }
}

Workspace = Neo.setupClass(Workspace);

/**
 * @summary Mounts the same registered Workspace into each popup generation's empty render target.
 * @class Test.Playwright.DockNativeReturn.Viewport
 * @extends Neo.container.Viewport
 */
class Viewport extends BaseViewport {
    static config = {
        /** @member {String} className='Test.Playwright.DockNativeReturn.Viewport' @protected */
        className: 'Test.Playwright.DockNativeReturn.Viewport',
        /** @member {Object} layout={ntype:'vbox',align:'stretch'} */
        layout: {ntype: 'vbox', align: 'stretch'}
    }

    /** @summary Boots either the root documents or a render target for an existing participant. */
    async onConstructed() {
        super.onConstructed();
        const url     = await Neo.Main.getByPath({path: 'document.URL', windowId: this.windowId}),
              params  = new URL(url).searchParams,
              binding = TransactionManager.findByWindow(this.windowId);

        if (params.has('popup')) {
            const participant = TransactionManager.getParticipant(binding.groupId, 'detached-document'),
                  workspace   = Neo.get(participant.componentId);
            workspace.nativeRoute = (await Neo.Main.getWindowData({windowId: this.windowId})).nativeRoute ?? workspace.nativeRoute;
            this.add(workspace);
            if (!workspace.items.length) workspace.add(workspace.projectDockModel());
            return
        }

        const root = this.add({module: Workspace, id: 'native-return-root', flex: 1,
                  dockModel      : documentFor('landing-tabs', ['anchor']),
                  topologyGroupId: binding.groupId, workspaceKey: 'landing-document'}),
              set = Neo.create(WorkspaceSet, {documentModel: WorkspaceDocument, manager: TransactionManager,
                  getGroupId: () => root.topologyGroupId});
        root.appUrl = url;
        root.workspaceSet = set;
        TransactionManager.setHistoryDepth({groupId: binding.groupId, depth: 20});
        set.register('landing-document', root.getDockParticipantSeams(binding.workspaceKey));

        const popup = Neo.create(Workspace, {id: 'native-return-popup', flex: 1, windowId: null,
            dockModel                  : documentFor('departure-tabs', ['beta', 'alpha']),
            rootWorkspace              : root, workspaceKey: 'detached-document', workspaceSet: set,
            topologyGroupId            : binding.groupId,
            nativeWindowClosePolicy    : params.get('policy') === 'retain' ? 'retain' : 'return',
            nativeWindowReturnTargetKey: binding.workspaceKey});
        set.register('detached-document', popup.getDockParticipantSeams('secondary-slot'));
        popup.bindNativeWindowSource();
        this.insert(0, {ntype: 'toolbar', items: [
            {ntype: 'button', text: 'Open popup', handler: () => root.openPopup()},
            {ntype: 'button', text: 'Undo', handler: () => TransactionManager.undo({groupId: root.topologyGroupId})},
            {ntype: 'button', text: 'Redo', handler: () => TransactionManager.redo({groupId: root.topologyGroupId})}
        ]})
    }
}

Viewport = Neo.setupClass(Viewport);

export const onStart = () => Neo.app({mainView: Viewport, name: 'Test.Playwright.DockNativeReturn'});
