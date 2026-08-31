import DockWorkspace from '../../../../../src/dashboard/dock/Workspace.mjs';
import Viewport      from '../../../../../src/container/Viewport.mjs';
import '../../../../../src/tab/Container.mjs';

const fixtureDocument = {
    schema: 'neo.dock.zone.v1',
    root  : 'root',
    items : {
        alpha : {componentRef: 'Alpha',  title: 'Alpha',  kind: 'panel'},
        beta  : {componentRef: 'Beta',   title: 'Beta',   kind: 'panel'},
        gamma : {componentRef: 'Gamma',  title: 'Gamma',  kind: 'panel'},
        pinned: {componentRef: 'Pinned', title: 'Pinned', kind: 'panel'},
        // The railed arm's subject: auto-hidden in the committed document, and it STAYS that way
        // across a detach. Detachment and auto-hide are orthogonal, not mutually exclusive (#17969)
        // — a railed item that pops out keeps `autoHidden: true`, so that its committed collapse
        // state survives the round trip and it rails again on reintegration.
        railed: {componentRef: 'Railed', title: 'Railed', kind: 'panel', autoHidden: true}
    },
    nodes: {
        root        : {type: 'edge-zone', zones: {center: {nodeId: 'root-split'}, right: {nodeId: 'edge-tabs', extent: 0.25}}},
        'root-split': {type: 'split', orientation: 'horizontal', children: ['main-tabs', 'side-tabs'], sizes: [0.6, 0.4]},
        'main-tabs' : {type: 'tabs', items: ['alpha', 'beta'],    activeItemId: 'alpha'},
        'side-tabs' : {type: 'tabs', items: ['gamma'],            activeItemId: 'gamma'},
        // An EDGE node, so its items have an owning edge — which is what makes `pin` paintable
        // here and not in the centre split. The frozen-order arm needs a node where the whole
        // engine set can actually render.
        'edge-tabs' : {type: 'tabs', items: ['pinned', 'railed'], activeItemId: 'pinned'}
    }
};

/**
 * @summary Browser fixture for the engine-owned pop-out header action
 * (`Neo.dashboard.dock.Workspace#enableDockPopOutAction`), witnessed on a rendered workspace.
 *
 * **What this fixture is a host for.** `openTearOutVessel` / `closeTearOutVessel` are the engine's
 * platform hooks — the base class returns `null` / `false` and every real consumer implements them.
 * This fixture implements them as a *recording* seam that admits without opening an OS window. That
 * is not a stub standing in for the code under test: the code under test is the engine half — the
 * projection, the router, the measured rect, and the tear-out pair's own commit — all of which run
 * for real here. What the fixture supplies is exactly the half the ticket rules is the host's, and
 * recording it is the only way a single-page component spec can witness the request the engine sent
 * (its `proxyRect` above all, which no unit spec can compare against a real laid-out box).
 *
 * The full second-window story — a real `?popout=` vessel, its birth, survival and reap — already
 * has its e2e leg on the drag gesture in `e2e/dashboard/DemoBDockTearOutNL.spec.mjs`. Because the
 * click enters *that same pair*, the click path inherits that witness rather than needing its own
 * copy of it; what it does NOT inherit, and what this fixture pins, is everything between the button
 * and the seam.
 *
 * The reactive trigger configs below are the spec's only cross-worker RPC: a component spec reaches
 * the app worker through `getConfigs`/`setConfigs` alone, so every worker-side probe is a config
 * write that recomputes a spec-readable mirror field.
 */
class PopOutFixtureWorkspace extends DockWorkspace {
    static config = {
        /**
         * @member {String} className='Test.Playwright.Component.DockPopOut.Workspace'
         * @protected
         */
        className: 'Test.Playwright.Component.DockPopOut.Workspace',
        /**
         * @member {Boolean} enableDockCloseAction=true
         */
        enableDockCloseAction: true,
        /**
         * @member {Boolean} enableDockMaximizeAction=true
         */
        enableDockMaximizeAction: true,
        /**
         * @member {Boolean} enableDockPinAction=true
         */
        enableDockPinAction: true,
        /**
         * @member {Boolean} enableDockPopOutAction=true
         */
        enableDockPopOutAction: true,
        /**
         * The second half of the double gate. Both flags on is the only configuration that projects
         * the action at all.
         * @member {Boolean} enableDockTearOutLifecycle=true
         */
        enableDockTearOutLifecycle: true,
        /**
         * @member {String} id='dock-popout-workspace'
         */
        id: 'dock-popout-workspace',
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * Spec trigger: JSON `{action, dockNodeId}` routes one header intent through the REAL
         * {@link Neo.dashboard.dock.Workspace#onDockHeaderAction} for a node whose header the spec
         * cannot click — the railed node collapses to its rail, and a control that is not on screen
         * cannot be pressed. The click arms cover the click; this covers the nodes a click cannot
         * reach, through the identical router entry rather than a private one.
         * @member {String|null} routeActionJson_=null
         * @reactive
         */
        routeActionJson_: null,
        /**
         * Spec trigger: while true the host seam declines every vessel, which is the fail-closed
         * arm — admission refused, nothing committed, the pane untouched.
         * @member {Boolean} refuseVessel_=false
         * @reactive
         */
        refuseVessel_: false,
        /**
         * Spec trigger: an item id drives the engine's own dead-vessel compensation — release the
         * pane, retire the vessel, reintegrate. The reintegration arm asserts the item comes home
         * through THIS path, which is the drag path's path; a click-specific return branch would
         * have to exist somewhere for the assertion to be satisfiable any other way.
         * @member {String|null} retireItemId_=null
         * @reactive
         */
        retireItemId_: null,
        /**
         * The default 20s connect window would expire the admission of a vessel that — by this
         * fixture's design — never connects a worker, and the engine would then retire and
         * reintegrate the item mid-spec. Pushing the bound past any run keeps that real behaviour
         * from racing arms that are about the click, not about connect timeouts.
         * @member {Number} tearOutConnectWindowMs=600000
         */
        tearOutConnectWindowMs: 600000
    }

    /**
     * Spec-readable mirror of the committed document, refreshed on every commit.
     * @member {String|null} docJson=null
     */
    docJson = null

    /**
     * Spec-readable log of every host-seam call: `{closed:[…], opened:[{itemId, proxyRect}]}`.
     * @member {String|null} vesselLogJson=null
     */
    vesselLogJson = null

    /**
     * @member {Object[]} closedVessels=[]
     */
    closedVessels = []

    /**
     * @member {Object[]} openedVessels=[]
     */
    openedVessels = []

    /**
     * Refreshes {@link #vesselLogJson} from the two seam logs.
     * @protected
     */
    syncVesselLog() {
        this.vesselLogJson = JSON.stringify({closed: this.closedVessels, opened: this.openedVessels})
    }

    /**
     * The host's platform seam. Records the exact request the engine sent — the measured
     * `proxyRect` is the geometry AC's witness — and admits unless the spec armed a refusal.
     * @param {Object} request
     * @param {String} request.itemId
     * @param {Object|null} request.proxyRect
     * @returns {Object|null}
     * @protected
     */
    openTearOutVessel(request={}) {
        const {itemId, proxyRect, sortZone} = request;

        this.openedVessels.push({itemId, proxyRect: proxyRect || null, sortZone: sortZone ?? null});
        this.syncVesselLog();

        return this.refuseVessel ? null : {windowName: `dock-popout-vessel-${itemId}`}
    }

    /**
     * The host's platform close seam.
     * @param {Object} vessel
     * @returns {Boolean}
     * @protected
     */
    closeTearOutVessel(vessel={}) {
        this.closedVessels.push({itemId: vessel.itemId ?? null, windowName: vessel.windowName ?? null});
        this.syncVesselLog();

        return true
    }

    /**
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetRouteActionJson(value, oldValue) {
        if (oldValue === undefined || !value) {
            return
        }

        const {action, dockNodeId} = JSON.parse(value),
              tabContainer         = this.getDockHost()?.down?.({dockNodeId});

        // Fire-and-forget: pop-out settles asynchronously and the arms poll the committed document.
        this.onDockHeaderAction({action, dockNodeId, tabContainer})
    }

    /**
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetRetireItemId(value, oldValue) {
        if (oldValue === undefined || !value) {
            return
        }

        this.compensateFailedTearOutAdoption(value, {windowName: `dock-popout-vessel-${value}`})
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        // The proven deferred-boot dance: seed the empty shell, then commit the real document.
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
     * @param {String} itemId
     * @param {Object} item
     * @returns {Object}
     */
    resolvePane(itemId, item) {
        return {
            ntype: 'component',
            id   : `dock-popout-pane-${itemId}`,
            style: {alignItems: 'center', display: 'flex', justifyContent: 'center'},
            text : item?.title || itemId
        }
    }
}

PopOutFixtureWorkspace = Neo.setupClass(PopOutFixtureWorkspace);

export const onStart = () => Neo.app({
    mainView: {
        module: Viewport,
        items : [{module: PopOutFixtureWorkspace, flex: 1}]
    },
    name: 'Test.Playwright.DockPopOut'
});
