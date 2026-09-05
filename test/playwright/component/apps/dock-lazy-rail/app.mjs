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
 * @summary Renders the projection-pass context a lazy-load request was raised in.
 *
 * **It never names a primary pass while more than one is pending, and that restraint is the whole
 * contract.** `refreshDockWorkspace` is async, so `activePasses` is a set of passes that have
 * ENTERED, in entry order — not a stack of executing frames. Resuming an ordinary pass while a repair
 * merely sits pending puts the repair last, so any last-entry heuristic names a pass that is not
 * running and lends the request a `REPAIR` flag that is not its own. An `OVERLAP` hint beside a
 * confident primary does not repair that; it decorates a false attribution.
 *
 * So the renderings are:
 * - `no active pass` — raised outside any projection; a real answer, not a missing one
 * - `pass N` / `pass N REPAIR` — exactly one pending context, so attribution is unambiguous
 * - `ambiguous: pass 1, pass 2 REPAIR` — every pending context with its OWN flag and no primary
 *
 * A reader can still draw the cross-pass conclusion from two unambiguous entries; they cannot draw
 * it from an ambiguous one, which is the correct amount of confidence for what this observes.
 * @param {Object[]} active Pending pass descriptors, entry order.
 * @returns {String}
 */
const describePassContext = active => {
    const render = entry => `pass ${entry.id}${entry.isRepair ? ' REPAIR' : ''}`;

    if (!active?.length) {
        return 'no active pass'
    }

    return active.length === 1
        ? render(active[0])
        : `ambiguous: ${active.map(render).join(', ')}`
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
     * `Reconciler.reconcileProjection`, which reaches `Reconciler.reconcileTabChrome` — the function
     * that actually owns the `resolvedItems` memo — exactly once per pass, through either the
     * stable-topology branch or the full path.
     * @member {Number} passSeq=0
     * @static
     */
    static passSeq = 0

    /**
     * The passes that have ENTERED and not yet settled, in entry order.
     *
     * Deliberately not described as a stack: `refreshDockWorkspace` is async, so entry order is not
     * execution order, and the last entry is not the frame whose continuation is running. Reading it
     * as a stack is what made the first version of {@link describePassContext} attribute a request to
     * the wrong pass — see that function for the falsifier. Depth > 1 at request time means the
     * attribution is ambiguous, which is reported rather than resolved.
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
        applyOperationJson_: null,
        /**
         * Spec trigger for the attribution contract itself: a JSON array of synthetic pass
         * descriptors, rendered through the same {@link describePassContext} the loader uses and
         * exposed on {@link #passContextProbeResult}.
         *
         * Synthetic on purpose. The case that matters — an ordinary pass resuming while a repair
         * stays suspended — is a property of the pending SET, and driving it through two real
         * overlapping projections would make a contract test depend on scheduler timing, which is
         * the class of arm this ticket already spent an evening distrusting.
         * @member {String|null} passContextProbeJson_=null
         * @reactive
         */
        passContextProbeJson_: null
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
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetPassContextProbeJson(value, oldValue) {
        if (oldValue === undefined || !value) {
            return
        }

        this.passContextProbeResult = describePassContext(JSON.parse(value))
    }

    /**
     * Spec-readable rendering of the last {@link #passContextProbeJson_} set.
     * @member {String|null} passContextProbeResult=null
     */
    passContextProbeResult = null

    /**
     * Numbers each projection pass so a lazy-load request can name the one it was raised in.
     *
     * `lazyPaneConstructionTrail` already reports WHO asked; on a duplicate both stacks have been
     * observed frame-for-frame identical, which leaves the two remaining mechanisms indistinguishable
     * from the call site alone: one pass resolving the item twice, or two passes each resolving it
     * once. The `resolvedItems` memo is created inside `Reconciler.reconcileTabChrome` — not
     * `reconcileProjection`, which only reaches it — and is written back on insert. Since a pass
     * reaches that function exactly once, the memo dedupes within a pass and has no memory across
     * one, meaning the pass id, not the caller, is the discriminator.
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
                    LazyRailFixtureWorkspace.raiseSites.push(
                        `[${describePassContext(LazyRailFixtureWorkspace.activePasses)}]\n` +
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
