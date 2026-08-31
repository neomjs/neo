import DockWorkspace from '../../../../../src/dashboard/dock/Workspace.mjs';
import Viewport      from '../../../../../src/container/Viewport.mjs';
import '../../../../../src/tab/Container.mjs';

const fixtureDocument = {
    schema: 'neo.dock.zone.v1',
    root  : 'root',
    items : {
        alpha : {componentRef: 'alpha',  title: 'Alpha',  kind: 'panel'},
        beta  : {componentRef: 'beta',   title: 'Beta',   kind: 'panel'},
        railed: {
            componentRef: 'railed',
            title       : 'Railed',
            kind        : 'panel',
            autoHidden  : true,
            locked      : true
        }
    },
    nodes: {
        root       : {type: 'edge-zone', zones: {
            center: {nodeId: 'main-tabs'},
            right : {nodeId: 'edge-tabs', extent: 0.25}
        }},
        'main-tabs': {type: 'tabs', items: ['alpha', 'beta'], activeItemId: 'alpha'},
        'edge-tabs': {type: 'tabs', items: ['railed'], activeItemId: 'railed'}
    }
};

/**
 * @summary Rendered-browser fixture for committed dock lock, inert restoration, source suppression,
 * and rail-reveal composition.
 */
class LockFixtureWorkspace extends DockWorkspace {
    static config = {
        /**
         * @member {String} className='Test.Playwright.Component.DockLock.Workspace'
         * @protected
         */
        className: 'Test.Playwright.Component.DockLock.Workspace',
        /**
         * @member {Boolean} enableDockCloseAction=true
         */
        enableDockCloseAction: true,
        /**
         * @member {Boolean} enableDockLockAction=true
         */
        enableDockLockAction: true,
        /**
         * @member {String} id='dock-lock-workspace'
         */
        id: 'dock-lock-workspace',
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * Spec trigger: one JSON operation descriptor is reduced through the real model boundary.
         * @member {String|null} operationJson_=null
         * @reactive
         */
        operationJson_: null,
        /**
         * Spec trigger: awaits the live Workspace refresh chain and mirrors the settled value.
         * @member {Number} settleProbeCount_=0
         * @reactive
         */
        settleProbeCount_: 0
    }

    /**
     * Spec-readable committed-document mirror.
     * @member {String|null} docJson=null
     */
    docJson = null

    /**
     * Spec-readable result of the latest programmatic operation.
     * @member {String|null} operationResultJson=null
     */
    operationResultJson = null

    /**
     * Last refresh-chain settlement observed by {@link #settleProbeCount}.
     * @member {Number} settledProbeCount=0
     */
    settledProbeCount = 0

    /**
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetOperationJson(value, oldValue) {
        if (oldValue === undefined || !value) {
            return
        }

        const descriptor = JSON.parse(value),
              result     = this.applyDockZoneOperation(descriptor);

        if (result && !result.errors?.length && result.document) {
            this.onDockZoneDocumentChange(result.document, descriptor, this)
        }

        this.operationResultJson = JSON.stringify({
            errors  : result?.errors || [],
            document: result?.document || null
        })
    }

    /**
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    async afterSetSettleProbeCount(value, oldValue) {
        if (oldValue === undefined) {
            return
        }

        await this.refreshPromise;

        !this.isDestroyed && (this.settledProbeCount = value)
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
     * @param {Object} document
     * @param {Object} [descriptor]
     * @param {Object} [source]
     */
    onDockZoneDocumentChange(document, descriptor, source) {
        super.onDockZoneDocumentChange(document, descriptor, source);
        this.docJson = JSON.stringify(this.dockModel)
    }

    /**
     * @summary Resolves one test pane. Beta deliberately owns inert before dock lock touches it.
     * @param {String} itemId
     * @param {Object} item
     * @returns {Object}
     */
    resolvePane(itemId, item) {
        const vdom = {
            cn: [{
                tag : 'button',
                id  : `dock-lock-control-${itemId}`,
                text: `${item?.title || itemId} control`
            }]
        };

        itemId === 'beta' && (vdom.inert = true);

        return {
            cls  : ['dock-lock-test-pane'],
            id   : `dock-lock-pane-${itemId}`,
            ntype: 'component',
            style: {
                alignItems    : 'center',
                display       : 'flex',
                justifyContent: 'center'
            },
            vdom
        }
    }
}

LockFixtureWorkspace = Neo.setupClass(LockFixtureWorkspace);

export const onStart = () => Neo.app({
    mainView: {
        module: Viewport,
        items : [{module: LockFixtureWorkspace, flex: 1}]
    },
    name: 'Test.Playwright.DockLock'
});
