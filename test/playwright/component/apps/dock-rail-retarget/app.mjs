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
        main : {reference: 'main',  title: 'Main',  kind: 'panel'},
        alpha: {reference: 'alpha', title: 'Alpha', kind: 'panel', autoHidden: true},
        beta : {reference: 'beta',  title: 'Beta',  kind: 'panel', autoHidden: true}
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
        style: {position: 'relative'},
        /** @member {Boolean} observeRevealWaits_=false Enables the fixture's real-wait witness. */
        observeRevealWaits_: false
    }

    /** @member {Object|null} revealWaitProbe=null Test observations survive the Rail's teardown. */
    revealWaitProbe = null

    /**
     * @summary Observes the existing owner's inherited waits without replacing timer behavior.
     * @param {Boolean} value
     */
    afterSetObserveRevealWaits(value) {
        if (!value || this.revealWaitProbe) return;
        const rail     = this.down({dockNodeType: 'edge-rail', dockEdge: 'right'}),
              owner    = rail.revealMachine, timeout = owner.timeout,
              register = owner.registerAsync, unregister = owner.unregisterAsync,
              probe    = this.revealWaitProbe = {
                  railId    : rail.id, ownerId: owner.id, owner,
                  registered: 0, pending: new Set(), waits: []
              };

        owner.registerAsync = (id, reject) => {
            probe.registered++;
            probe.pending.add(id);
            return register.call(owner, id, reject)
        };
        owner.unregisterAsync = id => {
            probe.pending.delete(id);
            return unregister.call(owner, id)
        };
        owner.timeout = (delay, options) => {
            const receipt = {delay, itemId: owner.pendingItemId ?? owner.revealedItemId, state: owner.state, status: 'pending'},
                  wait    = timeout.call(owner, delay, options);
            probe.waits.push(receipt);
            wait.then(() => {receipt.status = 'elapsed'}, error => {
                receipt.status = error === Neo.isDestroyed ? 'destroyed' :
                    options.signal.aborted && error === options.signal.reason ? 'aborted' : `error:${String(error)}`
            });
            return wait
        }
    }

    /** @summary Returns serializable observations of the real reveal owner and its async lifetime. @returns {Object|null} */
    get revealWaitState() {
        const probe = this.revealWaitProbe;
        if (!probe) return null;
        return {
            railId         : probe.railId, ownerId: probe.ownerId,
            state          : probe.owner.state ?? null,
            pendingItemId  : probe.owner.pendingItemId ?? null,
            revealedItemId : probe.owner.revealedItemId ?? null,
            registeredWaits: probe.registered,
            pendingWaits   : probe.pending.size,
            ownerDestroyed : probe.owner.isDestroyed === true,
            ownerRegistered: !!Neo.get(probe.ownerId),
            waits          : probe.waits.map(receipt => ({...receipt})),
            documentJson   : JSON.stringify(this.dockModel)
        }
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
