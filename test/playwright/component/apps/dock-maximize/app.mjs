import Component     from '../../../../../src/component/Base.mjs';
import DockWorkspace from '../../../../../src/dashboard/dock/Workspace.mjs';
import Persistence   from '../../../../../src/dashboard/dock/model/Persistence.mjs';
import Viewport      from '../../../../../src/container/Viewport.mjs';
import '../../../../../src/tab/Container.mjs';

/**
 * @summary A pane owning the reload contract: `dockReload()` counts its invocations — the
 * delegation witness (asked, never recreated).
 */
class ReloadProbe extends Component {
    static config = {
        /**
         * @member {String} className='Test.Playwright.Component.DockMaximize.ReloadProbe'
         * @protected
         */
        className: 'Test.Playwright.Component.DockMaximize.ReloadProbe',
        /**
         * @member {String} ntype='dock-maximize-reload-probe'
         * @protected
         */
        ntype: 'dock-maximize-reload-probe'
    }

    /**
     * Spec-readable invocation counter.
     * @member {Number} reloadCount=0
     */
    reloadCount = 0

    /**
     * 'sync' resolves immediately; 'defer' returns a promise the spec resolves through the
     * workspace trigger; 'reject' returns an async rejection.
     * @member {String} reloadMode='sync'
     */
    reloadMode = 'sync'

    /**
     * The deferred resolver while {@link #reloadMode} is 'defer' and an invocation is in flight.
     * @member {Function|null} resolveDeferred=null
     */
    resolveDeferred = null

    /**
     * The reload contract: the author owns what reload means — including whether it is async.
     * A deferred producer's resolver is ALSO stashed on the standing fixture probe (which
     * outlives the workspace), so the teardown arm can release the producer AFTER destroy —
     * the falsifier for post-destroy continuation mutations. One deferred flight at a time.
     * @returns {void|Promise<*>}
     */
    dockReload() {
        this.reloadCount++;

        if (this.reloadMode === 'reject') {
            return Promise.reject(new Error('async refusal'))
        }

        if (this.reloadMode === 'defer') {
            return new Promise(resolve => {
                this.resolveDeferred = resolve;

                const probe = Neo.get('dock-maximize-probe');

                probe && (probe.deferredRelease = resolve)
            })
        }
    }
}

ReloadProbe = Neo.setupClass(ReloadProbe);

/**
 * @summary The standing fixture probe: a spec-readable mirror component that OUTLIVES the
 * workspace. Carries the observer lifecycle log and the post-destroy release channel for a
 * deferred `dockReload()` producer — `releaseDeferredCount` is the spec's only way to settle a
 * producer after the workspace (and every trigger config on it) is gone.
 */
class FixtureProbe extends Component {
    static config = {
        /**
         * @member {String} className='Test.Playwright.Component.DockMaximize.FixtureProbe'
         * @protected
         */
        className: 'Test.Playwright.Component.DockMaximize.FixtureProbe',
        /**
         * @member {String} ntype='dock-maximize-fixture-probe'
         * @protected
         */
        ntype: 'dock-maximize-fixture-probe',
        /**
         * Trigger: releases the stashed deferred resolver — usable after workspace destroy.
         * @member {Number} releaseDeferredCount_=0
         */
        releaseDeferredCount_: 0
    }

    /**
     * The stashed resolver of the one in-flight deferred `dockReload()` producer.
     * @member {Function|null} deferredRelease=null
     */
    deferredRelease = null

    /**
     * Spec-readable: how many deferred producers this probe has released.
     * @member {Number} deferredReleasedTotal=0
     */
    deferredReleasedTotal = 0

    /**
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetReleaseDeferredCount(value, oldValue) {
        if (oldValue === undefined) {
            return
        }

        let me = this;

        if (me.deferredRelease) {
            me.deferredRelease();
            me.deferredRelease = null;
            me.deferredReleasedTotal++
        }
    }
}

FixtureProbe = Neo.setupClass(FixtureProbe);

/**
 * @summary A pane whose `dockReload()` throws — the containment witness: the pane is kept,
 * the error surfaces, and no recreate ever runs.
 */
class ThrowingReloadProbe extends Component {
    static config = {
        /**
         * @member {String} className='Test.Playwright.Component.DockMaximize.ThrowingReloadProbe'
         * @protected
         */
        className: 'Test.Playwright.Component.DockMaximize.ThrowingReloadProbe',
        /**
         * @member {String} ntype='dock-maximize-throwing-probe'
         * @protected
         */
        ntype: 'dock-maximize-throwing-probe'
    }

    /**
     * The reload contract, refusing: containment must keep this pane.
     */
    dockReload() {
        throw new Error('probe refuses to reload')
    }
}

ThrowingReloadProbe = Neo.setupClass(ThrowingReloadProbe);

const fixtureDocument = {
    schema: 'neo.dock.zone.v1',
    root  : 'root',
    items : {
        alpha: {componentRef: 'Alpha',  title: 'Alpha',  kind: 'panel'},
        beta : {componentRef: 'Beta',   title: 'Beta',   kind: 'panel'},
        // catalog-only: in no tabs node, so an addTab targeting it is a REAL add, never a move
        delta : {componentRef: 'Delta',  title: 'Delta',  kind: 'panel'},
        frame : {componentRef: 'Frame',  title: 'Frame',  kind: 'panel'},
        gamma : {componentRef: 'Gamma',  title: 'Gamma',  kind: 'panel'},
        pinned: {componentRef: 'Pinned', title: 'Pinned', kind: 'panel'},
        railed: {componentRef: 'Railed', title: 'Railed', kind: 'panel', autoHidden: true}
    },
    nodes: {
        root        : {type: 'edge-zone', zones: {center: {nodeId: 'root-split'}, right: {nodeId: 'edge-tabs', extent: 0.25}}},
        'root-split': {type: 'split', orientation: 'horizontal', children: ['main-tabs', 'side-tabs'], sizes: [0.6, 0.4]},
        'main-tabs' : {type: 'tabs', items: ['alpha', 'beta'],  activeItemId: 'alpha'},
        'side-tabs' : {type: 'tabs', items: ['frame', 'gamma'], activeItemId: 'frame'},
        'edge-tabs' : {type: 'tabs', items: ['pinned', 'railed'], activeItemId: 'pinned'}
    }
};

// Spec-readable observer lifecycle log, mirrored onto a probe component that OUTLIVES the
// workspace — the destroy arm reads it after destroyNeoInstance.
const observerLog = [];

const syncObserverProbe = () => {
    const probe = Neo.get('dock-maximize-probe');

    probe && (probe.observerLogJson = JSON.stringify(observerLog))
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
         * Spec trigger: sets the alpha probe's reload mode ('sync' | 'defer' | 'reject') —
         * worker-side state the page realm cannot reach directly.
         * @member {String|null} alphaReloadMode_=null
         * @reactive
         */
        alphaReloadMode_: null,
        /**
         * Spec trigger: each bump resolves the alpha probe's deferred `dockReload()` promise.
         * @member {Number} alphaReloadResolveCount_=0
         * @reactive
         */
        alphaReloadResolveCount_: 0,
        /**
         * Spec trigger: each bump dispatches `handleDockReloadAction` with NO resolvable active
         * item (null tabContainer) — the no-active race arm: settlement must still reach the
         * `dockReloadSettled` channel, with `itemId: null`.
         * @member {Number} dispatchNoActiveReloadCount_=0
         * @reactive
         */
        dispatchNoActiveReloadCount_: 0,
        /**
         * Spec trigger: JSON `{itemId, tabsNodeId, index}` commits one `addTab` operation —
         * the confinement arms need the catalog-only, in-node, and cross-node variants.
         * @member {String|null} addTabJson_=null
         * @reactive
         */
        addTabJson_: null,
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
         * @member {Boolean} enableDockReloadAction=true
         */
        enableDockReloadAction: true,
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
         * Spec gate: holds the next maximize clear before it mutates presentation.
         * @member {Boolean} holdMaximizeClear_=false
         * @reactive
         */
        holdMaximizeClear_: false,
        /**
         * Spec trigger: releases the held maximize clear.
         * @member {Number} releaseMaximizeClearCount_=0
         * @reactive
         */
        releaseMaximizeClearCount_: 0,
        /**
         * Spec trigger: builds the refreshPromise ↔ dockMaximizeTransition cycle and records
         * whether the refresh-owned sync can settle without its own promise being released first.
         * @member {Number} maximizeCycleProbeCount_=0
         * @reactive
         */
        maximizeCycleProbeCount_: 0,
        /**
         * Debug trigger: each bump snapshots the main-tabs container's style surfaces into
         * {@link #styleProbeJson}.
         * @member {Number} styleProbeCount_=0
         * @reactive
         */
        styleProbeCount_: 0,
        /**
         * Spec trigger: each bump awaits the live {@link #refreshPromise} and then SYNCHRONOUSLY
         * snapshots the maximize surface into {@link #settleJson} — the settled-surface witness:
         * if re-apply outlived the refresh chain, the snapshot catches it stale.
         * @member {Number} settleProbeCount_=0
         * @reactive
         */
        settleProbeCount_: 0,
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
     * Spec-readable settled-surface snapshot, refreshed per {@link #settleProbeCount} bump.
     * @member {String|null} settleJson=null
     */
    settleJson = null

    /**
     * Resolver for the held maximize clear.
     * @member {Function|null} maximizeClearRelease=null
     */
    maximizeClearRelease = null

    /**
     * Ordered fixture-only transition trace.
     * @member {String[]} maximizeTransitionLog=[]
     */
    maximizeTransitionLog = []

    /**
     * Spec-readable transition trace.
     * @member {String} maximizeTransitionLogJson='[]'
     */
    maximizeTransitionLogJson = '[]'

    /**
     * Spec-readable settlement of the refresh-owned maximize sync.
     * @member {Boolean} maximizeCycleSyncSettled=false
     */
    maximizeCycleSyncSettled = false

    /**
     * Spec-readable mirror of the PRODUCTION settlement channel: the fixture subscribes to the
     * engine's `dockReloadSettled` event like any application would — the mirror proves the
     * public surface, not a test-only override.
     * @member {String|null} lastReloadResultJson=null
     */
    lastReloadResultJson = null

    /**
     * @param {Object} config
     */
    onConstructed() {
        super.onConstructed();

        this.on('dockReloadSettled', data => {
            this.lastReloadResultJson = JSON.stringify({errors: data.errors, itemId: data.itemId})
        })
    }

    /**
     * @param {Object} data
     */
    onDockMaximizeResize(data) {
        this.resizeEventCount++;

        return super.onDockMaximizeResize(data)
    }

    /**
     * @param {Boolean} register
     */
    async registerDockMaximizeResizeObserver(register) {
        await super.registerDockMaximizeResizeObserver(register);

        observerLog.push(`${register ? 'reg' : 'unreg'}:${this.dockMaximizeResizeObserved}`);
        syncObserverProbe()
    }

    /**
     * Records when a maximize apply starts. The production method still owns every effect.
     * @param {String} nodeId
     * @param {Object} options
     * @returns {Promise<void>}
     */
    async applyDockMaximizePresentation(nodeId, options) {
        this.holdMaximizeClear && this.recordMaximizeTransition(`apply:${nodeId}`);

        return super.applyDockMaximizePresentation(nodeId, options)
    }

    /**
     * Holds one clear before its destructive presentation mutation so the spec can issue a
     * superseding maximize and observe whether the two transitions overlap.
     * @param {Object} options
     * @returns {Promise<void>}
     */
    async clearDockMaximizePresentation(options) {
        if (this.holdMaximizeClear) {
            this.recordMaximizeTransition('clear:start');

            await new Promise(resolve => {
                this.maximizeClearRelease = resolve
            });

            this.recordMaximizeTransition('clear:apply')
        }

        return super.clearDockMaximizePresentation(options)
    }

    /**
     * Appends one transition token and refreshes the spec-readable mirror.
     * @param {String} token
     */
    recordMaximizeTransition(token) {
        this.maximizeTransitionLog.push(token);
        this.maximizeTransitionLogJson = JSON.stringify(this.maximizeTransitionLog)
    }

    /**
     * @param {...*} args
     */
    destroy(...args) {
        const wasObserved = this.dockMaximizeResizeObserved;

        super.destroy(...args);

        // Post-destroy the engine wipes instance fields, so read "torn" as any non-true value.
        observerLog.push(`destroy:${wasObserved}->${this.dockMaximizeResizeObserved ? 'live' : 'torn'}`);
        syncObserverProbe()
    }

    /**
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetAlphaReloadMode(value, oldValue) {
        if (oldValue === undefined || !value) {
            return
        }

        const probe = Neo.get('dock-maximize-pane-alpha');

        probe && (probe.reloadMode = value)
    }

    /**
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetAlphaReloadResolveCount(value, oldValue) {
        if (oldValue === undefined) {
            return
        }

        const probe = Neo.get('dock-maximize-pane-alpha');

        probe?.resolveDeferred?.();
        probe && (probe.resolveDeferred = null)
    }

    /**
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetDispatchNoActiveReloadCount(value, oldValue) {
        if (oldValue === undefined) {
            return
        }

        this.handleDockReloadAction({dockNodeId: 'main-tabs', tabContainer: null})
    }

    /**
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetAddTabJson(value, oldValue) {
        if (oldValue === undefined || !value) {
            return
        }

        const descriptor = {operation: 'addTab', ...JSON.parse(value)},
              result     = this.applyDockZoneOperation(descriptor);

        if (result && !result.errors?.length && result.document) {
            this.onDockZoneDocumentChange(result.document, descriptor, this)
        }
    }

    /**
     * Debug mirror: worker-side style config + vdom-root style of the main-tabs container.
     * @member {String|null} styleProbeJson=null
     */
    styleProbeJson = null

    /**
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetStyleProbeCount(value, oldValue) {
        if (oldValue === undefined) {
            return
        }

        const tab = this.getDockHost()?.down?.({dockNodeId: 'main-tabs'});

        this.styleProbeJson = JSON.stringify({
            cls     : tab?.cls,
            style   : tab?.style,
            vdomRoot: tab?.getVdomRoot?.()?.style,
            wrapper : tab?.wrapperStyle
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

        this.settleJson = JSON.stringify({
            maximizedNodeId: this.maximizedNodeId,
            observed       : this.dockMaximizeResizeObserved,
            restore        : !!this.dockMaximizeRestore
        })
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
    afterSetReleaseMaximizeClearCount(value, oldValue) {
        if (oldValue === undefined) {
            return
        }

        this.maximizeClearRelease?.();
        this.maximizeClearRelease = null
    }

    /**
     * Reproduces the two-lane dependency without timing: the apply transition waits on a held
     * refresh promise; the refresh-owned sync encounters the unresolved node and may not wait on
     * that transition before releasing the same refresh.
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetMaximizeCycleProbeCount(value, oldValue) {
        if (oldValue === undefined) {
            return
        }

        let releaseRefresh;

        this.maximizeCycleSyncSettled = false;
        this.refreshPromise = new Promise(resolve => {
            releaseRefresh = resolve
        });
        this.maximizedNodeId = 'ghost-tabs';

        this.syncDockMaximizeProjection().then(() => {
            this.maximizeCycleSyncSettled = true;
            releaseRefresh()
        })
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

        // alpha and beta both own the reload contract — two contract carriers in ONE node is
        // what witnesses per-item single-flight across active-item switches; pinned owns it too,
        // as the EDGE node's carrier for the rail round-trip arm (the action has to come back
        // with the pane); gamma's contract throws (containment witness); frame stays
        // contract-free — the hidden witness.
        const module = itemId === 'alpha' || itemId === 'beta' || itemId === 'pinned' ? ReloadProbe
            : itemId === 'gamma' ? ThrowingReloadProbe
            : null;

        return {
            ...(module ? {module} : {ntype: 'component'}),
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
        items : [
            {module: MaximizeFixtureWorkspace, flex: 1},
            // The standing probe: outlives the workspace — observer log + post-destroy release.
            {module: FixtureProbe, id: 'dock-maximize-probe', style: {display: 'none'}}
        ]
    },
    name: 'Test.Playwright.DockMaximize'
});
