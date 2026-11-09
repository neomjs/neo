import Button        from '../../../../../src/button/Base.mjs';
import Component     from '../../../../../src/component/Base.mjs';
import Container     from '../../../../../src/container/Base.mjs';
import DockWorkspace from '../../../../../src/dashboard/dock/Workspace.mjs';
import Viewport      from '../../../../../src/container/Viewport.mjs';
import '../../../../../src/tab/Container.mjs';

/**
 * One center pane and one auto-hidden item on the right rail: the smallest dock in which an
 * application holds a reveal open while a person keeps working beside it.
 */
const fixtureDocument = {
    schema: 'neo.dock.zone.v1',
    root  : 'root',
    items : {
        main  : {reference: 'main',   title: 'Main'},
        detail: {reference: 'detail', title: 'Detail', autoHidden: true}
    },
    nodes: {
        root: {type: 'edge-zone', zones: {
            center: {nodeId: 'main-tabs'},
            right : {nodeId: 'detail-tabs', extent: 0.3}
        }},
        'main-tabs'  : {type: 'tabs', items: ['main'],   activeItemId: 'main'},
        'detail-tabs': {type: 'tabs', items: ['detail'], activeItemId: 'detail'}
    }
};

/**
 * @summary The fixture workspace for the app-held reveal. It writes every reveal change it relays
 * into the log line a spec reads, the way an application keeps its own state in step with a reveal
 * the person may end.
 * @class Test.Playwright.Component.DockRailHeld.Workspace
 * @extends Neo.dashboard.dock.Workspace
 */
class RailHeldWorkspace extends DockWorkspace {
    static config = {
        /**
         * @member {String} className='Test.Playwright.Component.DockRailHeld.Workspace'
         * @protected
         */
        className: 'Test.Playwright.Component.DockRailHeld.Workspace',
        /**
         * @member {String} id='dock-rail-held-workspace'
         */
        id: 'dock-rail-held-workspace',
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * Both shipping consumers position their dock host.
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
        this.onDockZoneDocumentChange(structuredClone(fixtureDocument));
        this.on('dockRailRevealChange', this.onRevealChange, this)
    }

    /**
     * @summary Writes the relayed reveal state where a spec reads it: `<state>:<itemId>`.
     * @param {Object} data
     * @param {Object} data.next {revealedItemId, state}
     */
    onRevealChange({next}) {
        Neo.getComponent('dock-rail-held-log').text = `${next.state}:${next.revealedItemId ?? ''}`
    }

    /**
     * @summary Each pane carries one button: a focus target beside the reveal, and one inside it.
     * @param {String} itemId
     * @param {Object} item
     * @returns {Object}
     */
    resolvePane(itemId, item) {
        return {
            module: Container,
            id    : `dock-rail-held-pane-${itemId}`,
            items : [{module: Button, id: `dock-rail-held-${itemId}-button`, text: `${item?.title || itemId} action`}]
        }
    }
}

RailHeldWorkspace = Neo.setupClass(RailHeldWorkspace);

const workspace = () => Neo.getComponent('dock-rail-held-workspace');

export const onStart = () => Neo.app({
    mainView: {
        module: Viewport,
        layout: {ntype: 'vbox', align: 'stretch'},
        items : [{
            module: Container,
            layout: {ntype: 'hbox', align: 'center'},
            items : [
                {module: Button,    id: 'dock-rail-held-hold',    text: 'Hold detail', handler: () => workspace().revealRailItem('detail')},
                {module: Button,    id: 'dock-rail-held-release', text: 'Let go',      handler: () => workspace().dismissRailReveal('detail')},
                {module: Component, id: 'dock-rail-held-log',     text: 'idle:'}
            ]
        }, {
            module: RailHeldWorkspace,
            flex  : 1
        }]
    },
    name: 'Test.Playwright.DockRailHeld'
});
