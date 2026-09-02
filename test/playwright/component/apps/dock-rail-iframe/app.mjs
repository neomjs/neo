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
 *
 * The left zone holds `source`, a plain pane carrying a native drag source — the row a consumer's
 * grid would drag into an editor frame. It sits on the far side from the rail so an open reveal on
 * the right never covers it, and every frame document is a native drop target, so the drop's
 * arrival can be read from inside the frame the drag was aimed at.
 */
const fixtureDocument = {
    schema: 'neo.dock.zone.v1',
    root  : 'root',
    items : {
        source: {componentRef: 'source', title: 'Source', kind: 'panel'},
        plain : {componentRef: 'plain',  title: 'Plain',  kind: 'panel'},
        cancel: {componentRef: 'cancel', title: 'Cancel', kind: 'panel'},
        pinned: {componentRef: 'pinned', title: 'Pinned', kind: 'panel'},
        railed: {componentRef: 'railed', title: 'Railed', kind: 'panel', autoHidden: true}
    },
    nodes: {
        root         : {type: 'edge-zone', zones: {left: {nodeId: 'source-tabs', extent: 0.2}, center: {nodeId: 'root-split'}, right: {nodeId: 'edge-tabs', extent: 0.3}}},
        'root-split' : {type: 'split', orientation: 'horizontal', children: ['plain-tabs', 'cancel-tabs'], sizes: [0.5, 0.5]},
        'source-tabs': {type: 'tabs', items: ['source'],           activeItemId: 'source'},
        'plain-tabs' : {type: 'tabs', items: ['plain'],            activeItemId: 'plain'},
        'cancel-tabs': {type: 'tabs', items: ['cancel'],           activeItemId: 'cancel'},
        'edge-tabs'  : {type: 'tabs', items: ['pinned', 'railed'], activeItemId: 'pinned'}
    }
};

/**
 * One nested document per frame. Each carries a large, labelled button so a spec can click a real
 * element inside the frame rather than its empty body, and each is a native drop target that
 * records what arrived on its own window (`__nativeDrop`) — the live drag store read from a real
 * `drop`, never a constructed event — so a spec can tell whether a drag aimed at the frame reached
 * its document or was hit-tested onto the parent beneath it.
 * @param {String} id The target element's id inside the frame.
 * @param {Boolean} cancelMousedown Whether the document cancels the `mousedown` default.
 * @returns {String} The `srcdoc` markup.
 */
const frameDocument = (id, cancelMousedown) =>
    `<!DOCTYPE html><html><head><style>body{margin:0}button{width:100%;height:120px;font:16px sans-serif}</style>` +
    (cancelMousedown ? `<script>document.addEventListener('mousedown', event => event.preventDefault())</script>` : '') +
    `<script>` +
    `document.addEventListener('dragover', event => {event.preventDefault(); (window.__nativeDrop ||= {}).dragoverAt ??= Date.now()});` +
    `document.addEventListener('drop', event => {event.preventDefault(); Object.assign(window.__nativeDrop ||= {}, {droppedAt: Date.now(), plain: event.dataTransfer.getData('text/plain')})})` +
    `</script>` +
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
     * @summary Resolves one pane: an iframe for the three frame items, the native drag source for
     * `source`, a plain component otherwise.
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

        if (itemId === 'source') {
            return {
                cls  : ['dock-rail-iframe-pane'],
                id   : 'dock-rail-iframe-pane-source',
                ntype: 'component',
                // The declared shape a consumer grid uses: the row's id rides the drag store.
                nativeDragZone: {
                    delegate     : '.dock-rail-iframe-entity',
                    effectAllowed: 'copy',
                    types        : {'text/plain': 'entity:{data-record-id}'}
                },
                vdom: {cn: [
                    {tag: 'span', text: 'Source pane'},
                    {tag: 'span', cls: ['dock-rail-iframe-entity'], 'data-record-id': 'row-7', style: {display: 'block', padding: '20px'}, text: 'row 7'}
                ]}
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
