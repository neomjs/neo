import DockWorkspace from '../../../../../src/dashboard/dock/Workspace.mjs';
import Viewport      from '../../../../../src/container/Viewport.mjs';
import '../../../../../src/tab/Container.mjs';

const fixtureDocument = {
    schema: 'neo.dock.zone.v1',
    root  : 'root',
    items : {
        alpha : {componentRef: 'Alpha',  title: 'Alpha',  kind: 'panel'},
        pinned: {componentRef: 'Pinned', title: 'Pinned', kind: 'panel'},
        lazy  : {componentRef: 'Lazy',   title: 'Lazy',   kind: 'panel', autoHidden: true}
    },
    nodes: {
        root       : {type: 'edge-zone', zones: {center: {nodeId: 'main-tabs'}, right: {nodeId: 'edge-tabs', extent: 0.3}}},
        'main-tabs': {type: 'tabs', items: ['alpha'],          activeItemId: 'alpha'},
        'edge-tabs': {type: 'tabs', items: ['pinned', 'lazy'], activeItemId: 'pinned'}
    }
};

/**
 * @summary Browser fixture for a lazy rail item: an edge tabs node with one visible pane and one
 * auto-hidden item whose pane config is a lazy `module` function — the shape a tab container's
 * card layout loads on activation. The module lives in its own file (`LazyPane.mjs`) so that its
 * registration in the Neo namespace can witness WHEN it loaded: at boot nothing imports it.
 * @class Test.Playwright.Component.DockLazyRail.Workspace
 * @extends Neo.dashboard.dock.Workspace
 */
class LazyRailFixtureWorkspace extends DockWorkspace {
    /**
     * One captured call site per lazy-load request, in order — read through
     * {@link #lazyPaneConstructionTrail}.
     * @member {String[]} raiseSites=[]
     * @static
     */
    static raiseSites = []

    /**
     * Projection passes are numbered in entry order so a load request can name the pass it was
     * raised in. `refreshDockWorkspace` is the pass owner: it builds the projection and hands it to
     * `Reconciler.reconcileProjection`, whose `resolvedItems` memo lives and dies with that one call.
     * @member {Number} passSeq=0
     * @static
     */
    static passSeq = 0

    /**
     * The passes currently executing, innermost last. A stack rather than a scalar because
     * `refreshDockWorkspace` is async: a repair pass scheduled by `onDockProjectionFailed` can be in
     * flight while another is still unwinding, and a scalar would silently report the wrong pass for
     * a request raised during the overlap. Depth > 1 at request time is itself a finding.
     * @member {Object[]} activePasses=[]
     * @static
     */
    static activePasses = []

    static config = {
        /**
         * @member {String} className='Test.Playwright.Component.DockLazyRail.Workspace'
         * @protected
         */
        className: 'Test.Playwright.Component.DockLazyRail.Workspace',
        /**
         * @member {String} id='dock-lazy-rail-workspace'
         */
        id: 'dock-lazy-rail-workspace',
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * Spec trigger: a JSON operation descriptor commits through the REAL reducer + refresh loop
         * (`applyDockZoneOperation` → `onDockZoneDocumentChange`), the way a consumer's own
         * controls commit — the tab-flow arm un-hides the lazy item with it, so the projection has
         * to materialize the lazily resolved pane through the card layout, not the reveal overlay.
         * @member {String|null} applyOperationJson_=null
         * @reactive
         */
        applyOperationJson_: null
    }

    /**
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetApplyOperationJson(value, oldValue) {
        if (oldValue === undefined || !value) {
            return
        }

        const result = this.applyDockZoneOperation(JSON.parse(value));

        result && !result.errors?.length && this.onDockZoneDocumentChange(result.document)
    }

    /**
     * Numbers each projection pass so a lazy-load request can name the one it was raised in.
     *
     * `lazyPaneConstructionTrail` already reports WHO asked; on a duplicate both stacks have been
     * observed frame-for-frame identical, which leaves the two remaining mechanisms indistinguishable
     * from the call site alone: one pass resolving the item twice, or two passes each resolving it
     * once. `Reconciler`'s `resolvedItems` memo is created per `reconcileProjection` call and is
     * written back on insert, so it dedupes within a pass and has no memory across one — meaning the
     * pass id, not the caller, is the discriminator.
     *
     * The stamp lives here rather than in `src/`: the engine already exposes the pass boundary as
     * this method, and the `components` job captures no app-worker console output, so a `console`
     * line could not carry the answer out of CI regardless. The trail travels in the assertion
     * message instead, which is the only channel that reaches a reader on a loaded runner.
     * @param {Object|null} [tabInsertDescriptor=null]
     * @param {Object} [document=this.dockModel]
     * @param {Object} [refreshOptions={}]
     * @returns {Promise<*>}
     */
    async refreshDockWorkspace(tabInsertDescriptor=null, document=this.dockModel, refreshOptions={}) {
        const
            cls   = LazyRailFixtureWorkspace,
            entry = {id: ++cls.passSeq, isRepair: refreshOptions.isDockProjectionRetry === true};

        cls.activePasses.push(entry);

        try {
            return await super.refreshDockWorkspace(tabInsertDescriptor, document, refreshOptions)
        } finally {
            // `finally`, so a thrown projection failure — the very path that schedules the repair
            // pass this instrument exists to catch — cannot leave a stale entry on the stack and
            // mislabel every later request.
            cls.activePasses = cls.activePasses.filter(active => active !== entry)
        }
    }

    /**
     * Spec-readable load witness: the lazy pane class is registered only once its module evaluated.
     * @returns {Boolean}
     */
    get lazyPaneModuleLoaded() {
        return !!Neo.ns('Test.Playwright.Component.DockLazyRail.LazyPane')
    }

    /**
     * Spec-readable identity witness: constructions of the lazy pane class — 0 before the first
     * reveal, 1 after it, still 1 after a dismiss and re-reveal (the cached instance is re-parented).
     * @returns {Number}
     */
    get lazyPaneInstances() {
        return Neo.ns('Test.Playwright.Component.DockLazyRail.LazyPane')?.instances ?? 0
    }

    /**
     * Spec-readable cause witness: one captured call site per load request, in order.
     *
     * `lazyPaneInstances` reports THAT a duplicate happened; this reports WHO asked. Each entry is
     * captured in the loader before the dynamic import is awaited, so it still carries the frame
     * that names the route — `container.Base#insert` or `layout.Card#afterSetActiveIndex`. The arms
     * assert one construction, and when that fails on CI there is no session to attach to, so the
     * sites travel in the failure message instead.
     * @returns {String[]}
     */
    get lazyPaneConstructionTrail() {
        return LazyRailFixtureWorkspace.raiseSites
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
     * @param {String} itemId
     * @param {Object} item
     * @returns {Object}
     */
    resolvePane(itemId, item) {
        if (itemId === 'lazy') {
            return {
                // the lazy shape: loaded on activation — for a rail item, on its first reveal
                //
                // The loader records its own call site, and the timing is the point: this runs
                // BEFORE `#loadModuleOnce` awaits the import, so the caller chain is still on the
                // stack. Capturing at construction instead yields three frames ending at
                // `#loadModuleOnce` — the await starts a fresh microtask stack and severs the very
                // frame that says which route asked. Here the two are plainly distinct:
                // `container.Base#insert` on the already-active insert path, `afterSetActiveIndex`
                // on activation.
                module: () => {
                    const
                        cls    = LazyRailFixtureWorkspace,
                        active = cls.activePasses,
                        pass   = active[active.length - 1],
                        // No active pass means the request did not originate inside a projection at
                        // all — a real answer, not a missing one, so it is spelled out rather than
                        // rendered as an empty string a reader would take for "same pass".
                        label  = pass ? `pass ${pass.id}${pass.isRepair ? ' REPAIR' : ''}` : 'no active pass',
                        // Two passes in flight at request time is a third possible mechanism beside
                        // cross-pass and within-pass, so it has to be visible rather than collapsed
                        // into the innermost one.
                        depth  = active.length > 1 ? ` OVERLAP[${active.map(entry => entry.id).join(',')}]` : '';

                    cls.raiseSites.push(
                        `[${label}${depth}]\n` +
                        (new Error('lazy module requested').stack || '').split('\n').slice(1, 7).join('\n')
                    );

                    return import('./LazyPane.mjs')
                },
                id  : 'dock-lazy-rail-pane-lazy',
                text: 'Lazy pane'
            }
        }

        return {
            ntype: 'component',
            id   : `dock-lazy-rail-pane-${itemId}`,
            style: {alignItems: 'center', display: 'flex', justifyContent: 'center'},
            text : item?.title || itemId
        }
    }
}

LazyRailFixtureWorkspace = Neo.setupClass(LazyRailFixtureWorkspace);

export const onStart = () => Neo.app({
    mainView: {
        module: Viewport,
        items : [{module: LazyRailFixtureWorkspace, flex: 1}]
    },
    name: 'Test.Playwright.DockLazyRail'
});
