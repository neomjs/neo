import Container      from '../../../../../src/container/Base.mjs';
import DockPreview    from '../../../../../src/dashboard/dock/interaction/Preview.mjs';
import DockWorkspace  from '../../../../../src/dashboard/dock/Workspace.mjs';
import DropIndicators from '../../../../../src/dashboard/dock/interaction/DropIndicators.mjs';
import Viewport       from '../../../../../src/container/Viewport.mjs';
import '../../../../../src/tab/Container.mjs';

/**
 * @summary The BARE consumer: a dock host that declares nothing but `position: relative`.
 *
 * Every shipping consumer of the dock either carries an app stylesheet or copied one, so none of
 * them can witness what the engine owes a host that carries neither. This fixture deliberately has
 * no stylesheet at all — the host's only contract is the positioning context, which is what a
 * downstream app supplies when it reads the docs and stops there.
 *
 * The projection is child 0 and the two overlays are PERSISTENT siblings, mirroring the shape both
 * the Workstation and Demo-A give their host: object permanence across every re-projection.
 */
const fixtureDocument = {
    schema: 'neo.dock.zone.v1',
    root  : 'root',
    items : {
        main : {componentRef: 'main',  title: 'Main',  kind: 'panel'},
        aside: {componentRef: 'aside', title: 'Aside', kind: 'panel'}
    },
    nodes: {
        root        : {type: 'tabs', items: ['main', 'aside'], activeItemId: 'main'}
    }
};

class PreviewGeometryWorkspace extends DockWorkspace {
    static config = {
        /**
         * @member {String} className='Test.Playwright.Component.DockPreviewGeometry.Workspace'
         * @protected
         */
        className: 'Test.Playwright.Component.DockPreviewGeometry.Workspace',
        /**
         * @member {String[]} cls=['dock-preview-geometry-workspace']
         */
        cls: ['dock-preview-geometry-workspace'],
        /**
         * The projection mounts into this child, and the overlays sit beside it.
         * @member {String} dockHostReference='dock-host'
         */
        dockHostReference: 'dock-host',
        /**
         * @member {String} id='dock-preview-geometry-workspace'
         */
        id: 'dock-preview-geometry-workspace',
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         */
        layout: {ntype: 'vbox', align: 'stretch'}
    }

    /**
     * Builds the host and its two persistent overlay siblings. The host gets `position: relative`
     * through an inline style rather than a class, so this fixture stays stylesheet-free and the
     * spec measures the engine sheet alone.
     */
    onConstructed() {
        super.onConstructed();

        let me = this;

        me.add({
            cls  : ['dock-preview-geometry-host', 'neo-dashboard', 'neo-dashboard-dock-query-host'],
            flex : 1,
            items: [me.projectDockModel(), {
                module   : DockPreview,
                reference: 'dock-preview'
            }, {
                module   : DropIndicators,
                reference: 'drop-indicators'
            }],
            layout   : {ntype: 'fit'},
            module   : Container,
            reference: 'dock-host',
            style    : {position: 'relative'}
        });

        me.onDockZoneDocumentChange(structuredClone(fixtureDocument))
    }

    /**
     * @summary Resolves one test pane. The panes carry no geometry of their own — the assertions
     * read the host and the preview, never the pane.
     * @param {String} itemId
     * @param {Object} item
     * @returns {Object}
     */
    resolvePane(itemId, item) {
        return {
            cls  : ['dock-preview-geometry-pane', `dock-preview-geometry-pane-${itemId}`],
            id   : `dock-preview-geometry-pane-${itemId}`,
            ntype: 'component',
            vdom : {cn: [{tag: 'span', text: `${item?.title || itemId} pane`}]}
        }
    }
}

PreviewGeometryWorkspace = Neo.setupClass(PreviewGeometryWorkspace);

export const onStart = () => Neo.app({
    mainView: {
        module: Viewport,
        items : [{module: PreviewGeometryWorkspace, flex: 1}]
    },
    name: 'Test.Playwright.DockPreviewGeometry'
});
