import Component     from '../../../../../src/component/Base.mjs';
import DockWorkspace from '../../../../../src/dashboard/dock/Workspace.mjs';
import Viewport      from '../../../../../src/container/Viewport.mjs';
import '../../../../../src/tab/Container.mjs';

/**
 * Every edge zone holds exactly one auto-hidden item, so all four zones render as a rail and each
 * of the four per-edge `inset` rules gets a witness. The two axes matter independently: left/right
 * measure from the inline start/end, top/bottom from the block start/end.
 */
const fixtureDocument = {
    schema: 'neo.dock.zone.v1',
    root  : 'root',
    items : {
        main  : {componentRef: 'main',   title: 'Main',   kind: 'panel'},
        left  : {componentRef: 'left',   title: 'Left',   kind: 'panel', autoHidden: true},
        right : {componentRef: 'right',  title: 'Right',  kind: 'panel', autoHidden: true},
        top   : {componentRef: 'top',    title: 'Top',    kind: 'panel', autoHidden: true},
        bottom: {componentRef: 'bottom', title: 'Bottom', kind: 'panel', autoHidden: true}
    },
    nodes: {
        root: {type: 'edge-zone', zones: {
            center: {nodeId: 'main-tabs'},
            left  : {nodeId: 'left-tabs',   extent: 0.25},
            right : {nodeId: 'right-tabs',  extent: 0.25},
            top   : {nodeId: 'top-tabs',    extent: 0.25},
            bottom: {nodeId: 'bottom-tabs', extent: 0.25}
        }},
        'main-tabs'  : {type: 'tabs', items: ['main'],   activeItemId: 'main'},
        'left-tabs'  : {type: 'tabs', items: ['left'],   activeItemId: 'left'},
        'right-tabs' : {type: 'tabs', items: ['right'],  activeItemId: 'right'},
        'top-tabs'   : {type: 'tabs', items: ['top'],    activeItemId: 'top'},
        'bottom-tabs': {type: 'tabs', items: ['bottom'], activeItemId: 'bottom'}
    }
};

/**
 * @summary The fixture workspace for the reveal overlay's containing-block origin. It carries a
 * consumer-shaped class on its own dashboard root so a spec can pad the dock host the way an app
 * stylesheet does, which is the precondition the engine must hold against — a padded host offsets
 * the rail into the content box while an absolutely positioned overlay resolves against the
 * padding box.
 * @class Test.Playwright.Component.DockRailOrigin.Workspace
 * @extends Neo.dashboard.dock.Workspace
 */
class RailOriginWorkspace extends DockWorkspace {
    static config = {
        /**
         * @member {String} className='Test.Playwright.Component.DockRailOrigin.Workspace'
         * @protected
         */
        className: 'Test.Playwright.Component.DockRailOrigin.Workspace',
        /**
         * The host handle a spec pads, standing in for a consumer's app stylesheet.
         * @member {String[]} cls=['dock-rail-origin-host']
         */
        cls: ['dock-rail-origin-host'],
        /**
         * @member {String} id='dock-rail-origin-workspace'
         */
        id: 'dock-rail-origin-workspace',
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * Mirrors the shape both shipping consumers give their dock host: the Workstation and the
         * Fleet cockpit both position it. That is what makes the unpadded arm a true control — with
         * the host positioned, the only thing separating a correct overlay from an overlapping one
         * is the padding, so the padded arm isolates the padding and nothing else. An unpositioned
         * host is broken further still (the overlay resolves against the viewport), but that is a
         * different distance and it would blur what the padded arm measures.
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
     * @summary Resolves one test pane. The panes carry no geometry of their own — every assertion
     * reads the overlay and the rail, never the pane.
     * @param {String} itemId
     * @param {Object} item
     * @returns {Object}
     */
    resolvePane(itemId, item) {
        return {
            cls  : ['dock-rail-origin-pane', `dock-rail-origin-pane-${itemId}`],
            id   : `dock-rail-origin-pane-${itemId}`,
            ntype: 'component',
            vdom : {cn: [{tag: 'span', text: `${item?.title || itemId} pane`}]}
        }
    }
}

RailOriginWorkspace = Neo.setupClass(RailOriginWorkspace);

export const onStart = () => Neo.app({
    mainView: {
        module: Viewport,
        items : [{module: RailOriginWorkspace, flex: 1}]
    },
    name: 'Test.Playwright.DockRailOrigin'
});
