import DockWorkspace from '../../../../../src/dashboard/dock/Workspace.mjs';
import Viewport      from '../../../../../src/container/Viewport.mjs';
import '../../../../../src/tab/Container.mjs';

/**
 * A rail beside two iframe panes, one per way a nested document can answer a click.
 *
 * `plain` leaves the `mousedown` default alone, so a click inside it moves focus into the frame.
 * `cancel` cancels that default from inside its own document — what an editor managing its own
 * caret does — so focus never leaves the parent and the parent sees no pointer event either.
 * The rail's own revealed pane is an iframe too, so the focus-hold contract for a frame INSIDE the
 * reveal has a witness beside the two OUTSIDE it.
 */
const fixtureDocument = {
    schema: 'neo.dock.zone.v1',
    root  : 'root',
    items : {
        plain : {componentRef: 'plain',  title: 'Plain',  kind: 'panel'},
        cancel: {componentRef: 'cancel', title: 'Cancel', kind: 'panel'},
        pinned: {componentRef: 'pinned', title: 'Pinned', kind: 'panel'},
        railed: {componentRef: 'railed', title: 'Railed', kind: 'panel', autoHidden: true}
    },
    nodes: {
        root         : {type: 'edge-zone', zones: {center: {nodeId: 'root-split'}, right: {nodeId: 'edge-tabs', extent: 0.3}}},
        'root-split' : {type: 'split', orientation: 'horizontal', children: ['plain-tabs', 'cancel-tabs'], sizes: [0.5, 0.5]},
        'plain-tabs' : {type: 'tabs', items: ['plain'],            activeItemId: 'plain'},
        'cancel-tabs': {type: 'tabs', items: ['cancel'],           activeItemId: 'cancel'},
        'edge-tabs'  : {type: 'tabs', items: ['pinned', 'railed'], activeItemId: 'pinned'}
    }
};

/**
 * One nested document per frame. Each carries a large, labelled button so a spec can click a real
 * element inside the frame rather than its empty body.
 * @param {String} id The target element's id inside the frame.
 * @param {Boolean} cancelMousedown Whether the document cancels the `mousedown` default.
 * @returns {String} The `srcdoc` markup.
 */
const frameDocument = (id, cancelMousedown) =>
    `<!DOCTYPE html><html><head><style>body{margin:0}button{width:100%;height:120px;font:16px sans-serif}</style>` +
    (cancelMousedown ? `<script>document.addEventListener('mousedown', event => event.preventDefault())</script>` : '') +
    `</head><body><button id="${id}" type="button">${id}</button></body></html>`;

/**
 * @summary The fixture workspace for the reveal's frame-boundary contract: two sibling iframe panes
 * outside the rail, and an iframe as the revealed pane itself.
 * @class Test.Playwright.Component.DockRailIframe.Workspace
 * @extends Neo.dashboard.dock.Workspace
 */
class RailIframeWorkspace extends DockWorkspace {
    static config = {
        /**
         * @member {String} className='Test.Playwright.Component.DockRailIframe.Workspace'
         * @protected
         */
        className: 'Test.Playwright.Component.DockRailIframe.Workspace',
        /**
         * @member {String} id='dock-rail-iframe-workspace'
         */
        id: 'dock-rail-iframe-workspace',
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
     * @summary Resolves one pane: an iframe for the three frame items, a plain component otherwise.
     * @param {String} itemId
     * @param {Object} item
     * @returns {Object}
     */
    resolvePane(itemId, item) {
        if (itemId === 'pinned') {
            return {
                cls  : ['dock-rail-iframe-pane'],
                id   : 'dock-rail-iframe-pane-pinned',
                ntype: 'component',
                vdom : {cn: [{tag: 'span', text: 'Pinned pane'}]}
            }
        }

        return {
            cls  : ['dock-rail-iframe-pane', `dock-rail-iframe-pane-${itemId}`],
            id   : `dock-rail-iframe-pane-${itemId}`,
            ntype: 'component',
            style: {border: 0, height: '100%', width: '100%'},
            tag  : 'iframe',
            vdom : {tag: 'iframe', srcdoc: frameDocument(`${itemId}-target`, itemId === 'cancel')}
        }
    }
}

RailIframeWorkspace = Neo.setupClass(RailIframeWorkspace);

export const onStart = () => Neo.app({
    mainView: {
        module: Viewport,
        items : [{module: RailIframeWorkspace, flex: 1}]
    },
    name: 'Test.Playwright.DockRailIframe'
});
