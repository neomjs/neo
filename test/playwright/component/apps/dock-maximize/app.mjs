import DockWorkspace from '../../../../../src/dashboard/dock/Workspace.mjs';
import Persistence   from '../../../../../src/dashboard/dock/model/Persistence.mjs';
import Viewport      from '../../../../../src/container/Viewport.mjs';
import '../../../../../src/tab/Container.mjs';

const fixtureDocument = {
    schema: 'neo.dock.zone.v1',
    root  : 'root',
    items : {
        alpha: {componentRef: 'Alpha', title: 'Alpha', kind: 'panel'},
        beta : {componentRef: 'Beta',  title: 'Beta',  kind: 'panel'},
        frame: {componentRef: 'Frame', title: 'Frame', kind: 'panel'},
        gamma: {componentRef: 'Gamma', title: 'Gamma', kind: 'panel'}
    },
    nodes: {
        root        : {type: 'edge-zone', zones: {center: {nodeId: 'root-split'}}},
        'root-split': {type: 'split', orientation: 'horizontal', children: ['main-tabs', 'side-tabs'], sizes: [0.6, 0.4]},
        'main-tabs' : {type: 'tabs', items: ['alpha', 'beta'],  activeItemId: 'alpha'},
        'side-tabs' : {type: 'tabs', items: ['frame', 'gamma'], activeItemId: 'frame'}
    }
};

/**
 * @summary Browser fixture for the engine-owned maximize toggle: both action flags on, a split
 * document with two tabs nodes, and an iframe pane whose browsing context is the no-reparent
 * witness. The reactive trigger configs below are the spec's cross-worker RPC: a component spec
 * can only reach the app worker through `getConfigs`/`setConfigs`, so every worker-side probe is
 * a config write that recomputes a spec-readable mirror field.
 */
class MaximizeFixtureWorkspace extends DockWorkspace {
    static config = {
        /**
         * @member {String} className='Test.Playwright.Component.DockMaximize.Workspace'
         * @protected
         */
        className: 'Test.Playwright.Component.DockMaximize.Workspace',
        /**
         * Spec trigger: each bump captures a perspective of the live committed document into
         * {@link #perspectiveJson}, volatile envelope fields stripped — the byte-equality arm
         * compares captures taken maximized and not.
         * @member {Number} captureCount_=0
         * @reactive
         */
        captureCount_: 0,
        /**
         * Spec trigger: setting an item id commits one `closeItem` operation through the
         * ordinary reducer + view-sync pair — the outside-operation arm cannot click a control
         * that sits under the maximized plane, which is itself part of the contract.
         * @member {String|null} closeItemId_=null
         * @reactive
         */
        closeItemId_: null,
        /**
         * @member {Boolean} enableDockCloseAction=true
         */
        enableDockCloseAction: true,
        /**
         * @member {Boolean} enableDockMaximizeAction=true
         */
        enableDockMaximizeAction: true,
        /**
         * @member {String} id='dock-maximize-workspace'
         */
        id: 'dock-maximize-workspace',
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * Spec trigger: each bump re-runs {@link #refreshDockWorkspace} WITHOUT a committed
         * operation — the continuity arm's non-operation re-projection source.
         * @member {Number} refreshCount_=0
         * @reactive
         */
        refreshCount_: 0,
        /**
         * Spec trigger: each bump snapshots the maximize-relevant sort-zone flags of the
         * `main-tabs` header into {@link #zoneSnapshotJson}.
         * @member {Number} zoneSnapshotCount_=0
         * @reactive
         */
        zoneSnapshotCount_: 0
    }

    /**
     * Spec-readable mirror of the committed document, refreshed on every commit.
     * @member {String|null} docJson=null
     */
    docJson = null

    /**
     * Spec-readable perspective capture, refreshed per {@link #captureCount} bump.
     * @member {String|null} perspectiveJson=null
     */
    perspectiveJson = null

    /**
     * Spec-readable sort-zone flag snapshot, refreshed per {@link #zoneSnapshotCount} bump.
     * @member {String|null} zoneSnapshotJson=null
     */
    zoneSnapshotJson = null

    /**
     * Spec-readable delivery witness for the maximize resize observation.
     * @member {Number} resizeEventCount=0
     */
    resizeEventCount = 0

    /**
     * @param {Object} data
     */
    onDockMaximizeResize(data) {
        this.resizeEventCount++;

        return super.onDockMaximizeResize(data)
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        // The proven deferred-boot dance: seed the empty shell, then commit the real document —
        // the reconciler replaces the shell at `dockShellIndex` rather than inserting blind.
        this.add(this.projectDockModel());
        this.onDockZoneDocumentChange(structuredClone(fixtureDocument))
    }

    /**
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetCaptureCount(value, oldValue) {
        if (oldValue === undefined || !this.dockModel) {
            return
        }

        const {layout} = Persistence.capturePerspective(this.dockModel, {title: 'spec'});

        // The envelope stamps identity + revision metadata per capture; the arm compares the
        // captured MODEL, so volatile envelope fields are stripped from the comparison.
        this.perspectiveJson = JSON.stringify(layout, (key, val) =>
            ['createdAt', 'layoutId', 'revision', 'updatedAt'].includes(key) ? undefined : val
        )
    }

    /**
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetCloseItemId(value, oldValue) {
        if (oldValue === undefined || !value) {
            return
        }

        const descriptor = {operation: 'closeItem', itemId: value},
              result     = this.applyDockZoneOperation(descriptor);

        if (result && !result.errors?.length && result.document) {
            this.onDockZoneDocumentChange(result.document, descriptor, this)
        }
    }

    /**
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetRefreshCount(value, oldValue) {
        if (oldValue === undefined) {
            return
        }

        // Fire-and-forget: the continuity arm polls the DOM outcome.
        this.refreshDockWorkspace()
    }

    /**
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetZoneSnapshotCount(value, oldValue) {
        if (oldValue === undefined) {
            return
        }

        const zone = this.getDockHost()?.down?.({dockNodeId: 'main-tabs'})?.getTabBar?.()?.sortZone || null;

        this.zoneSnapshotJson = JSON.stringify(zone && {
            allowOverdrag      : zone.allowOverdrag,
            boundaryContainerId: zone.boundaryContainerId,
            enableProxyToPopup : zone.enableProxyToPopup
        })
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
     * @param {String} itemId
     * @param {Object} item
     * @returns {Object}
     */
    resolvePane(itemId, item) {
        if (itemId === 'frame') {
            // A real nested browsing context: re-parenting an iframe reloads it, so its child
            // window is the strongest identity witness a maximize round-trip can have.
            return {
                ntype: 'component',
                id   : 'dock-maximize-frame',
                tag  : 'iframe',
                vdom : {tag: 'iframe', src: 'about:blank'},
                style: {border: '0', height: '100%', width: '100%'}
            }
        }

        return {
            ntype: 'component',
            id   : `dock-maximize-pane-${itemId}`,
            style: {alignItems: 'center', display: 'flex', justifyContent: 'center'},
            text : item?.title || itemId
        }
    }
}

MaximizeFixtureWorkspace = Neo.setupClass(MaximizeFixtureWorkspace);

export const onStart = () => Neo.app({
    mainView: {
        module: Viewport,
        items : [{module: MaximizeFixtureWorkspace, flex: 1}]
    },
    name: 'Test.Playwright.DockMaximize'
});
