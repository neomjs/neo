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
        main : {reference: 'main',  title: 'Main'},
        alpha: {reference: 'alpha', title: 'Alpha', autoHidden: true},
        beta : {reference: 'beta',  title: 'Beta',  autoHidden: true}
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

    /** @member {String[]} PROBED_METHODS The machine methods the probe wraps, and restores. @static */
    static PROBED_METHODS = ['registerAsync', 'unregisterAsync', 'timeout']

    /**
     * @summary Observes the existing owner's waits by wrapping its methods, shaped exactly as they are, for as long as it observes.
     *
     * Wrapped, not read, because the machine exposes no seam for either fact this fixture reports:
     * `core/Base` keeps async registrations in a private field, and a wait's outcome lives only in the
     * promise `transitionAfter` awaits and drops — the machine fires no event, and its state is a plain
     * field. Each wrapper mirrors the signature it wraps and forwards through the original, so a call
     * production makes cannot fail here and pass there; `false` puts the originals back.
     * @param {Boolean} value
     */
    afterSetObserveRevealWaits(value) {
        const me = this;

        if (!value) {
            me.restoreRevealWaitProbe();
            return
        }

        if (me.revealWaitProbe && !me.revealWaitProbe.restored) return;

        const rail      = me.down({dockNodeType: 'edge-rail', dockEdge: 'right'}),
              owner     = rail.revealMachine,
              originals = Object.fromEntries(RailRetargetWorkspace.PROBED_METHODS.map(key => [key, {
                  own: Object.hasOwn(owner, key), value: owner[key]
              }])),
              probe     = me.revealWaitProbe = {
                  railId    : rail.id, ownerId: owner.id, owner, originals,
                  registered: 0, pending: new Set(), restored: false, waits: []
              };

        // Registrations: the engine keeps them in a private field, so they are counted here or nowhere.
        owner.registerAsync = (id, reject) => {
            probe.registered++;
            probe.pending.add(id);
            return originals.registerAsync.value.call(owner, id, reject)
        };
        owner.unregisterAsync = id => {
            probe.pending.delete(id);
            return originals.unregisterAsync.value.call(owner, id)
        };
        // Outcomes: the wait's promise is awaited and dropped inside the machine, so elapsed, aborted
        // and destroyed are told apart here or nowhere — a state observer sees the same abort on all three.
        owner.timeout = (time, options = {}) => {
            const receipt = {delay: time, itemId: owner.pendingItemId ?? owner.revealedItemId, state: owner.state, status: 'pending'},
                  wait    = originals.timeout.value.call(owner, time, options);

            probe.waits.push(receipt);
            wait.then(() => {receipt.status = 'elapsed'}, error => {
                receipt.status = error === Neo.isDestroyed ? 'destroyed' :
                    options.signal?.aborted && error === options.signal.reason ? 'aborted' : `error:${String(error)}`
            });
            return wait
        }
    }

    /**
     * @summary Puts the machine's own methods back; what the probe observed stays readable.
     * @returns {Boolean} Whether anything was restored.
     */
    restoreRevealWaitProbe() {
        const probe = this.revealWaitProbe, owner = probe?.owner;

        if (!owner || probe.restored) return false;

        probe.restored = true;

        Object.entries(probe.originals).forEach(([key, {own, value}]) => {
            if (own) owner[key] = value;
            else delete owner[key]
        });

        return true
    }

    /**
     * @param {...*} args
     */
    destroy(...args) {
        this.restoreRevealWaitProbe();
        super.destroy(...args)
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
            // Read off the instance, not off the probe's own bookkeeping: whether the machine carries
            // the wrappers as own properties right now.
            wrapped     : RailRetargetWorkspace.PROBED_METHODS.some(key => Object.hasOwn(probe.owner, key)),
            waits       : probe.waits.map(receipt => ({...receipt})),
            documentJson: JSON.stringify(this.dockModel)
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
