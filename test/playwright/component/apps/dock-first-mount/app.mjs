import DockWorkspace from '../../../../../src/dashboard/dock/Workspace.mjs';
import Document      from '../../../../../src/dashboard/dock/model/Document.mjs';
import Viewport      from '../../../../../src/container/Viewport.mjs';
import '../../../../../src/tab/Container.mjs';

const bootstrapDocument = {
    schema: 'neo.dock.zone.v1',
    root  : 'root',
    items : {},
    nodes : {
        root        : {type: 'edge-zone', zones: {center: {nodeId: 'empty-tabs'}}},
        'empty-tabs': {type: 'tabs', items: []}
    }
};

const realDocument = {
    schema: 'neo.dock.zone.v1',
    root  : 'root',
    items : {
        strategy : {componentRef: 'Strategy',  title: 'Strategy',  kind: 'panel'},
        terminal : {componentRef: 'Terminal',  title: 'Terminal',  kind: 'terminal'},
        logs     : {componentRef: 'Logs',      title: 'Logs',      kind: 'panel'},
        inspector: {componentRef: 'Inspector', title: 'Inspector', kind: 'panel'},
        metrics  : {componentRef: 'Metrics',   title: 'Metrics',   kind: 'panel'}
    },
    nodes: {
        root            : {
            type : 'edge-zone',
            zones: {
                center: {nodeId: 'root-split'},
                right : {nodeId: 'inspector-tabs', extent: 0.25, resizable: true}
            }
        },
        'root-split'    : {type: 'split', orientation: 'horizontal', children: ['main-tabs', 'side-split'], sizes: [0.65, 0.35]},
        'main-tabs'     : {type: 'tabs', items: ['strategy', 'metrics'], activeItemId: 'strategy'},
        'side-split'    : {type: 'split', orientation: 'vertical', children: ['terminal-tabs', 'logs-tabs'], sizes: [0.6, 0.4]},
        'terminal-tabs' : {type: 'tabs', items: ['terminal'], activeItemId: 'terminal'},
        'logs-tabs'     : {type: 'tabs', items: ['logs'], activeItemId: 'logs'},
        'inspector-tabs': {type: 'tabs', items: ['inspector'], activeItemId: 'inspector'}
    }
};

/**
 * @summary Browser fixture for an empty-zone bootstrap dock whose real document commits before the
 * first mount. No FLIP addon is configured, so the `timeout(0)` refresh reaches the mount boundary
 * without an incidental main-thread round-trip hiding the race.
 */
class DeferredDockWorkspace extends DockWorkspace {
    static config = {
        /**
         * @member {String} className='Test.Playwright.Component.DockFirstMount.Workspace'
         * @protected
         */
        className: 'Test.Playwright.Component.DockFirstMount.Workspace',
        /**
         * Whitebox receipt that this exact fixture, rather than the ordinary dashboard example, is live.
         * @member {Boolean} deferredBootFixture=true
         */
        deferredBootFixture: true,
        /**
         * Browser receipt of whether the deferred refresh crossed the mount boundary too early.
         * @member {Boolean|null} refreshBeforeMount=null
         */
        refreshBeforeMount: null,
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

        this.dockModel = Document.clone(bootstrapDocument);
        this.add(this.projectDockModel());
        this.onDockZoneDocumentChange(Document.clone(realDocument))
    }

    /**
     * Records the host state at the last possible point before projection staging.
     */
    beforeRefreshDockWorkspace() {
        this.refreshBeforeMount = !this.mounted
    }

    /**
     * @param {String} itemId
     * @param {Object} item
     * @returns {Object}
     */
    resolvePane(itemId, item) {
        return {
            ntype: 'component',
            style: {alignItems: 'center', display: 'flex', justifyContent: 'center'},
            text : item?.title || itemId
        }
    }
}

DeferredDockWorkspace = Neo.setupClass(DeferredDockWorkspace);

export const onStart = () => Neo.app({
    mainView: {
        module: Viewport,
        items : [{module: DeferredDockWorkspace, flex: 1}]
    },
    name: 'Test.Playwright.DockFirstMount'
});
