import DockWorkspace from '../../../../../src/dashboard/dock/Workspace.mjs';
import Viewport      from '../../../../../src/container/Viewport.mjs';
import '../../../../../src/tab/Container.mjs';

/**
 * One right-edge rail carrying TWO auto-hidden items, so a reveal can be retargeted from one to the
 * other by clicking the second tab while the first is open — the gesture whose motion this fixture
 * exists to witness. The center pane is a plain component; the rail panes are plain components too,
 * each with a large labelled block so the slot visibly holds one or the other.
 */
const fixtureDocument = {
    schema: 'neo.dock.zone.v1',
    root  : 'root',
    items : {
        main : {componentRef: 'main',  title: 'Main',  kind: 'panel'},
        alpha: {componentRef: 'alpha', title: 'Alpha', kind: 'panel', autoHidden: true},
        beta : {componentRef: 'beta',  title: 'Beta',  kind: 'panel', autoHidden: true}
    },
    nodes: {
        root       : {type: 'edge-zone', zones: {center: {nodeId: 'main-tabs'}, right: {nodeId: 'edge-tabs', extent: 0.3}}},
        'main-tabs': {type: 'tabs', items: ['main'],           activeItemId: 'main'},
        'edge-tabs': {type: 'tabs', items: ['alpha', 'beta'],  activeItemId: 'alpha'}
    }
};

/**
 * @summary The fixture workspace for the reveal retarget motion: two items on one rail.
 * @class Test.Playwright.Component.DockRailRetarget.Workspace
 * @extends Neo.dashboard.dock.Workspace
 */
class RailRetargetWorkspace extends DockWorkspace {
    static config = {
        /**
         * @member {String} className='Test.Playwright.Component.DockRailRetarget.Workspace'
         * @protected
         */
        className: 'Test.Playwright.Component.DockRailRetarget.Workspace',
        /**
         * @member {String} id='dock-rail-retarget-workspace'
         */
        id: 'dock-rail-retarget-workspace',
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * Mirrors the shape both shipping consumers give their dock host.
         * @member {Object} style={position:'relative'}
         */
        style: {position: 'relative'}
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        this.add(this.projectDockModel());
        this.onDockZoneDocumentChange(structuredClone(fixtureDocument))
    }

    /**
     * @summary Resolves one pane: a labelled block per item.
     * @param {String} itemId
     * @param {Object} item
     * @returns {Object}
     */
    resolvePane(itemId, item) {
        return {
            cls  : ['dock-rail-retarget-pane', `dock-rail-retarget-pane-${itemId}`],
            id   : `dock-rail-retarget-pane-${itemId}`,
            ntype: 'component',
            style: {padding: '24px'},
            vdom : {cn: [{tag: 'h2', text: `${item.title} pane`}]}
        }
    }
}

RailRetargetWorkspace = Neo.setupClass(RailRetargetWorkspace);

export const onStart = () => Neo.app({
    mainView: {
        module: Viewport,
        items : [{module: RailRetargetWorkspace, flex: 1}]
    },
    name: 'Test.Playwright.DockRailRetarget'
});
