import DockWorkspace from '../../../../../src/dashboard/dock/Workspace.mjs';
import Viewport      from '../../../../../src/container/Viewport.mjs';
import '../../../../../src/tab/Container.mjs';

/**
 * @summary The flag-off subject: `enableDockReloadAction` stays at its false default while the
 * HOST legally owns the semantic name `reload` through `resolveDockHeaderActions` (the reserved-
 * name guard fires only for enabled engine actions). The negative arm proves default-off is
 * behaviorally INERT: no engine sweep may rewrite this consumer-owned action's state.
 */
class HostReloadFixtureWorkspace extends DockWorkspace {
    static config = {
        /**
         * @member {String} className='Test.Playwright.Component.DockMaximize.HostWorkspace'
         * @protected
         */
        className: 'Test.Playwright.Component.DockMaximize.HostWorkspace',
        /**
         * One engine action ON, so the header projects an action rail at all — close's opt-in
         * must not leak reload's sync.
         * @member {Boolean} enableDockCloseAction=true
         */
        enableDockCloseAction: true,
        /**
         * @member {String} id='dock-hostreload-workspace'
         */
        id: 'dock-hostreload-workspace',
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         */
        layout: {ntype: 'vbox', align: 'stretch'}
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        this.add(this.projectDockModel());
        this.onDockZoneDocumentChange(structuredClone(hostFixtureDocument))
    }

    /**
     * Host header actions ride the projection options hook. The host-owned action carries the
     * ENGINE-RESERVABLE name while the engine flag is off; `showOnFocus: false` keeps it ungated
     * — consumer-owned state the sweep must not touch.
     * @returns {Object}
     */
    getDockProjectionOptions() {
        return {
            ...super.getDockProjectionOptions(),
            resolveDockHeaderActions: () => [{action: 'reload', hidden: false, iconCls: 'fa fa-rotate-right', showOnFocus: false}]
        }
    }

    /**
     * @param {String} itemId
     * @param {Object} item
     * @returns {Object}
     */
    resolvePane(itemId, item) {
        return {
            id   : `dock-host-pane-${itemId}`,
            ntype: 'component',
            text : item?.title || itemId
        }
    }
}

HostReloadFixtureWorkspace = Neo.setupClass(HostReloadFixtureWorkspace);

const hostFixtureDocument = {
    schema: 'neo.dock.zone.v1',
    root  : 'host-root',
    items : {
        'host-a': {componentRef: 'HostA', title: 'HostA', kind: 'panel'},
        'host-b': {componentRef: 'HostB', title: 'HostB', kind: 'panel'}
    },
    nodes: {
        'host-root': {type: 'tabs', items: ['host-a', 'host-b'], activeItemId: 'host-a'}
    }
};

export const onStart = () => Neo.app({
    mainView: {
        module: Viewport,
        items : [
            {module: HostReloadFixtureWorkspace, flex: 1}
        ]
    },
    name: 'Test.Playwright.DockHostReload'
});
