import DockService   from '../../../src/ai/client/DockService.mjs';
import DockWorkspace from '../../../src/dashboard/DockWorkspace.mjs';
import DockZoneModel from '../../../src/dashboard/DockZoneModel.mjs';
import TourRunner    from '../../../src/ai/client/TourRunner.mjs';
import '../../../src/button/Base.mjs';    // registers the `button` ntype used by the perspective toolbar
import '../../../src/tab/Container.mjs'; // registers the `tab-container` ntype the projection emits for tab zones
import '../../../src/toolbar/Base.mjs';  // registers the `toolbar` ntype used by the perspective toolbar

/**
 * A representative dock-zone document (`neo.harness.dockZone.v1`): an edge-zone root whose center is a
 * horizontal split of a two-tab main zone and a vertical side-split of two single-tab zones, plus a
 * right edge band holding a single-tab inspector zone — the auto-hide surface (committing
 * `setItemAutoHidden` on an edge-band item collapses it to a `Neo.dashboard.DockRail` edge tab).
 * The shape `Neo.dashboard.DockLayoutAdapter.project` consumes — see its spec for the full contract.
 * Used as the example's INITIAL committed document; the live document advances on each commit
 * (see `MainContainer#dockModel`).
 * @type {Object}
 */
const initialDockModel = {
    schema: 'neo.harness.dockZone.v1',
    root  : 'root',
    items : {
        strategy : {componentRef: 'Strategy',  title: 'Strategy',  kind: 'panel'},
        swarm    : {componentRef: 'Swarm',     title: 'Swarm',     kind: 'panel'},
        terminal : {componentRef: 'Terminal',  title: 'Terminal',  kind: 'terminal'},
        logs     : {componentRef: 'Logs',      title: 'Logs',      kind: 'panel'},
        inspector: {componentRef: 'Inspector', title: 'Inspector', kind: 'panel'},
        metrics  : {componentRef: 'Metrics',   title: 'Metrics',   kind: 'panel'},
        timeline : {componentRef: 'Timeline',  title: 'Timeline',  kind: 'panel'},
        agents   : {componentRef: 'Agents',    title: 'Agents',    kind: 'panel'},
        alerts   : {componentRef: 'Alerts',    title: 'Alerts',    kind: 'panel'},
        history  : {componentRef: 'History',   title: 'History',   kind: 'panel'}
    },
    nodes: {
        root            : {type: 'edge-zone', zones: {center: 'root-split', right: 'inspector-tabs'}},
        'root-split'    : {type: 'split', orientation: 'horizontal', children: ['main-tabs', 'side-split'], sizes: [0.65, 0.35]},
        'main-tabs'     : {type: 'tabs',  items: ['strategy', 'swarm', 'metrics', 'timeline', 'agents', 'alerts', 'history'], activeItemId: 'strategy'},
        'side-split'    : {type: 'split', orientation: 'vertical', children: ['terminal-tabs', 'logs-tabs'], sizes: [0.6, 0.4]},
        'terminal-tabs' : {type: 'tabs',  items: ['terminal'],  activeItemId: 'terminal'},
        'logs-tabs'     : {type: 'tabs',  items: ['logs'],      activeItemId: 'logs'},
        'inspector-tabs': {type: 'tabs',  items: ['inspector'], activeItemId: 'inspector'}
    }
};

const reviewDockModel = DockZoneModel.clone(initialDockModel);

reviewDockModel.nodes['root-split'].sizes = [0.48, 0.52];
reviewDockModel.nodes['main-tabs'].activeItemId = 'swarm';
reviewDockModel.nodes['side-split'].sizes = [0.42, 0.58];

/**
 * Example-local saved perspectives, persisted through the same `DockZoneModel` collection helpers as user-saved
 * layouts. The documents stay JSON-only and storage-backend agnostic.
 * @type {Object[]}
 */
const seededPerspectives = [{
    document: initialDockModel,
    layoutId: 'operator-default',
    title   : 'Operator'
}, {
    document: reviewDockModel,
    layoutId: 'review-focus',
    title   : 'Review'
}];

/**
 * @summary Standalone, interactive example for the dashboard dock-zone layout system — the minimal
 * consumer of {@link Neo.dashboard.DockWorkspace}.
 *
 * The engine class owns the whole host loop: the committed document ({@link #dockModel}), the pure
 * reducer (`applyDockZoneOperation`), the deferred, promise-chained re-projection through
 * `DockLayoutAdapter` and `DockProjectionReconciler` (`onDockZoneDocumentChange`), the FLIP motion
 * bracket, and the in-window cross-zone drop path. Dragging a splitter commits a `resizeSplit`
 * operation through `DockZoneModel`, and the layout re-projects from the new committed document —
 * the example adds nothing to that mechanism.
 *
 * What the example owns is exactly what an adopting app owns: which pane renders a catalog item
 * ({@link #resolvePane}), and its own chrome — a perspective toolbar consuming the saved-layout
 * collection helpers the model exposes (seed perspectives stored as `neo.harness.dockLayoutCollection.v1`,
 * selecting a perspective calls `restoreActiveSavedLayout()`, Save Current upserts the live committed
 * document, Delete Active keeps a valid replacement active) plus browser-local persistence through the
 * main-thread `LocalStorage` addon, so App-Worker code never reaches for `window.localStorage` directly.
 * The toolbar re-syncs on every re-projection through the {@link #beforeRefreshDockWorkspace} hook.
 *
 * The example is also the app root: single inheritance puts the dock host on this class, so the
 * `Neo.container.Viewport` traits the standalone page relies on — self-mounting, the `neo-viewport`
 * sizing class together with the Viewport stylesheet that sizes it, and the flex-centered,
 * overflow-hidden body class — are declared explicitly (see the `additionalThemeFiles` and
 * `autoMount` configs and {@link #onConstructed}).
 *
 * See `learn/agentos/DockZoneModel.md` for the model/projection contract and
 * `learn/guides/uibuildingblocks/DockLayouts.md` for the adoption guide.
 * @class Neo.examples.dashboard.dock.MainContainer
 * @extends Neo.dashboard.DockWorkspace
 */
class MainContainer extends DockWorkspace {
    static config = {
        /**
         * @member {String} className='Neo.examples.dashboard.dock.MainContainer'
         * @protected
         */
        className: 'Neo.examples.dashboard.dock.MainContainer',
        /**
         * Theme files load per class in an instance's prototype chain, so a subclass list REPLACES
         * the engine class's entry and must repeat it. The second entry is part of the viewport
         * contract below: `body > .neo-viewport` lives in the Viewport stylesheet, which nothing
         * on this page would otherwise load now that no `Neo.container.Viewport` instance exists.
         * @member {String[]} additionalThemeFiles=['Neo.dashboard.Container','Neo.container.Viewport']
         */
        additionalThemeFiles: ['Neo.dashboard.Container', 'Neo.container.Viewport'],
        /**
         * The app root keeps the viewport contract — single inheritance puts the dock host on this
         * class, so the `Neo.container.Viewport` traits the standalone page relies on are declared
         * here: it mounts itself, it carries the `neo-viewport` sizing class AND loads the stylesheet
         * that gives `body > .neo-viewport` its full height and width (see `additionalThemeFiles`),
         * and it applies the body class in {@link #onConstructed}.
         * @member {Boolean} autoMount=true
         */
        autoMount: true,
        /**
         * @member {String[]} cls=['neo-viewport']
         */
        cls: ['neo-viewport'],
        /**
         * The projected shell shares the root vbox with the perspective toolbar above it.
         * @member {Object} dockProjectionConfig={flex:1}
         */
        dockProjectionConfig: {flex: 1},
        /**
         * The standalone example opts into the engine-owned, model-authoritative close action.
         * @member {Boolean} enableDockCloseAction=true
         */
        enableDockCloseAction: true,
        /**
         * The perspective toolbar sits at index 0; the projected shell follows it.
         * @member {Number} dockShellIndex=1
         */
        dockShellIndex: 1,
        /**
         * @member {Object} layout={ntype:'vbox', align:'stretch'}
         */
        layout: {ntype: 'vbox', align: 'stretch'}
        // `items` is built in construct() — not here — so each projection can carry the instance-bound
        // reducer and view-sync callbacks the commit loop needs.
    }

    /**
     * Browser-local storage key for the example's named-perspective collection.
     * @member {String} layoutCollectionStorageKey='neo.examples.dashboard.dock.layoutCollection'
     */
    layoutCollectionStorageKey = 'neo.examples.dashboard.dock.layoutCollection'

    /**
     * The active named-perspective collection backing the toolbar.
     * @member {Object|null} layoutCollection=null
     */
    layoutCollection = null

    /**
     * Last asynchronous storage-load promise, exposed for unit tests and smoke probes.
     * @member {Promise|null} layoutCollectionLoadPromise=null
     */
    layoutCollectionLoadPromise = null

    /**
     * Monotonic suffix for user-saved example perspectives.
     * @member {Number} savedPerspectiveCount=0
     */
    savedPerspectiveCount = 0

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        me.layoutCollection = me.createDefaultLayoutCollection();
        me.dockModel        = DockZoneModel.restoreActiveSavedLayout(me.layoutCollection).document || DockZoneModel.clone(initialDockModel);

        me.add(me.buildWorkspaceItems());
        me.layoutCollectionLoadPromise = me.loadLayoutCollectionFromStorage()
    }

    /**
     * The perspective toolbar re-syncs on every re-projection: layout buttons keep identity, move
     * into collection order, and update their active state in place.
     * @param {Object} document The committed document this refresh projects.
     * @param {Object} refreshOptions
     */
    beforeRefreshDockWorkspace(document, refreshOptions) {
        this.syncPerspectiveToolbar()
    }

    /**
     * The body contract of a viewport root: the flex-centered, overflow-hidden page this standalone
     * example lays out against.
     */
    onConstructed() {
        super.onConstructed();

        Neo.main.DomAccess.applyBodyCls({
            cls     : ['neo-body-viewport'],
            windowId: this.windowId
        })
    }

    /**
     * Resolves a catalog item to the pane rendered inside its dock zone. For this example, a simple
     * centered label per panel; a real app resolves each item to its feature view. The FLIP marker
     * class is stamped by the engine class, never here.
     * @param {String} itemId The stable workspace identity from the item catalog.
     * @param {Object} item The persisted item record.
     * @returns {Object}
     */
    resolvePane(itemId, item) {
        return {
            ntype: 'component',
            style: {alignItems: 'center', color: '#888', display: 'flex', fontSize: '20px', justifyContent: 'center'},
            html : item?.componentRef ?? itemId
        }
    }

    /**
     * An example-local tour-replay ADAPTER consuming the two-part holder contract (the read half
     * `getDockZoneDocument` / the write half `applyDockZoneOperation`, driven through the app-side
     * dock seam) — deliberately NOT a third holder-contract member. It replays one
     * `neo.tour.script.v1` script against THIS holder in `spec` mode and returns the runner's
     * structured result plus the SETTLED post-run document. One call = one hydrated, settled run —
     * the whitebox-e2e L3 smoke drives it twice and diffs the operation logs (the determinism
     * falsifier: entries carry descriptors and assertion outcomes, never timestamps).
     *
     * Two synchronization guarantees callers rely on:
     * 1. Runs only start against the HYDRATED document (storage restore awaited) — a replay racing
     *    the restore would mutate a baseline the restore then overwrites.
     * 2. Resolution only after the LAST deferred re-projection settles (`refreshPromise`),
     *    so a page error thrown by the projection lands inside the caller's verdict window.
     *
     * Example-tier by design: the same composition the dockdemo workspaces wire at construct time,
     * exposed on demand so the shipped dock example is tour-replayable without carrying a tour bar.
     * Spec mode skips `pause` waits entirely, so a replay never blocks the live surface.
     * @param {Object} script A `neo.tour.script.v1` script (validated fail-closed by the runner)
     * @returns {Promise<Object>} `{completed, errors, log, document}` — the runner's structured
     * result plus a deep clone of the settled committed document
     */
    async runTourSpec(script) {
        const me = this;

        await me.layoutCollectionLoadPromise;

        const
            dockService = Neo.create(DockService, {}),
            runner      = Neo.create(TourRunner, {componentId: me.id, dockService, mode: 'spec', script});

        try {
            const result = await runner.start();

            await me.refreshPromise;

            return {...result, document: DockZoneModel.clone(me.dockModel)}
        } finally {
            runner.destroy();
            dockService.destroy()
        }
    }

    /**
     * Builds a valid default collection from the example's seeded perspectives.
     * @returns {Object}
     */
    createDefaultLayoutCollection() {
        let layouts = seededPerspectives.map(({document, layoutId, title}) => {
                let {layout, errors} = DockZoneModel.createSavedLayout(document, {
                    layoutId,
                    title,
                    metadata: {
                        source: 'examples/dashboard/dock'
                    }
                });

                if (errors.length) {
                    throw new Error(`Failed to create seeded dock perspective "${layoutId}": ${errors.join('; ')}`)
                }

                return layout
            }),
            {collection, errors} = DockZoneModel.createSavedLayoutCollection(layouts, {
                activeLayoutId: 'operator-default',
                metadata      : {
                    owner: 'examples/dashboard/dock'
                }
            });

        if (errors.length) {
            throw new Error(`Failed to create dock perspective collection: ${errors.join('; ')}`)
        }

        return collection
    }

    /**
     * Creates the persistent top-level toolbar plus the initial dock projection.
     * @param {Object|null} [tabInsertDescriptor=null] One-use normalized `addTab` correlation
     * captured by the committing refresh; omitted for boot, restore, and unrelated projections.
     * @returns {Object[]}
     */
    buildWorkspaceItems(tabInsertDescriptor=null) {
        return [
            this.createPerspectiveToolbar(),
            this.projectDockModel(tabInsertDescriptor)
        ]
    }

    /**
     * Builds a compact named-perspective toolbar from the current collection.
     * @returns {Object}
     */
    createPerspectiveToolbar() {
        let me            = this,
            collection    = me.layoutCollection,
            layoutButtons = Object.values(collection?.layouts || {}).map(layout => me.createPerspectiveButton(layout));

        return {
            cls         : ['neo-dashboard-dock-perspective-toolbar'],
            dockNodeType: 'perspective-toolbar',
            // Size to content: without this the toolbar inherits the root vbox's growing default and
            // splits the viewport ~50/50 with the flex:1 dock. `flex:'none'` keeps it a compact strip.
            flex        : 'none',
            itemDefaults: {
                ntype: 'button',
                style: {margin: '0 8px 0 0'}
            },
            items: [{
                ntype: 'component',
                style: {
                    alignItems : 'center',
                    color      : '#777',
                    display    : 'flex',
                    fontWeight : 600,
                    marginRight: '12px',
                    whiteSpace : 'nowrap'
                },
                html: 'Perspectives'
            }, ...layoutButtons, {
                iconCls: 'fa fa-save',
                handler: () => me.saveCurrentPerspective(),
                text   : 'Save Current'
            }, {
                iconCls: 'fa fa-trash',
                handler: () => me.removeActivePerspective(),
                text   : 'Delete Active'
            }],
            layout: {ntype: 'hbox', align: 'center'},
            ntype : 'toolbar',
            style : {
                borderBottom: '1px solid var(--sem-color-border-default, #ddd)',
                padding     : '8px 10px'
            }
        }
    }

    /**
     * Creates one identity-keyed perspective button from the current saved-layout collection.
     * @param {Object} layout Saved layout record.
     * @returns {Object}
     */
    createPerspectiveButton(layout) {
        let me       = this,
            isActive = layout.layoutId === me.layoutCollection?.activeLayoutId;

        return {
            cls      : isActive ? ['neo-dashboard-dock-perspective-active'] : [],
            handler  : () => me.restorePerspective(layout.layoutId),
            pressed  : isActive,
            reference: `dock-perspective-${layout.layoutId}`,
            text     : layout.title
        }
    }

    /**
     * @summary Reconciles dynamic perspective buttons inside the persistent toolbar.
     *
     * The label and Save/Delete controls retain identity. Layout buttons key by `layoutId`, move
     * silently into collection order, update active/title state in place, and are created or
     * destroyed only when the saved-layout membership itself changes.
     */
    syncPerspectiveToolbar() {
        let me        = this,
            toolbar   = me.items[0],
            layouts   = Object.values(me.layoutCollection?.layouts || {}),
            layoutIds = new Set(layouts.map(layout => layout.layoutId)),
            buttons;

        if (toolbar?.dockNodeType !== 'perspective-toolbar') return;

        buttons = new Map(toolbar.items
            .filter(item => item.reference?.startsWith('dock-perspective-'))
            .map(item => [item.reference.slice('dock-perspective-'.length), item]));

        buttons.forEach((button, layoutId) => {
            if (!layoutIds.has(layoutId)) {
                toolbar.remove(button, true, true)
            }
        });

        layouts.forEach((layout, index) => {
            let targetIndex = index + 1,
                button      = buttons.get(layout.layoutId),
                currentIndex,
                isActive;

            if (!button || button.isDestroyed) {
                button = toolbar.insert(targetIndex, me.createPerspectiveButton(layout), true)
            } else {
                currentIndex = toolbar.indexOf(button);

                if (currentIndex !== targetIndex) {
                    toolbar.remove(button, false, true, true);
                    toolbar.insert(targetIndex, button, true, false)
                }
            }

            isActive = layout.layoutId === me.layoutCollection.activeLayoutId;
            button.set({
                cls: isActive
                    ? [...new Set([...button.cls, 'neo-dashboard-dock-perspective-active'])]
                    : button.cls.filter(cls => cls !== 'neo-dashboard-dock-perspective-active'),
                pressed: isActive,
                text   : layout.title
            })
        })
    }

    /**
     * Reads the persisted named-perspective collection and applies it only when both the collection and active restore
     * validate. Invalid payloads fail closed to the seeded collection/current document.
     * @returns {Promise<{collection:(Object|null), document:(Object|null), errors:String[], loaded:Boolean}>}
     */
    async loadLayoutCollectionFromStorage() {
        let me      = this,
            storage = Neo.main?.addon?.LocalStorage;

        if (!storage?.readLocalStorageItem) {
            return {collection: null, document: null, errors: ['LocalStorage addon is unavailable'], loaded: false}
        }

        try {
            let {value} = await storage.readLocalStorageItem({
                    key     : me.layoutCollectionStorageKey,
                    windowId: me.windowId
                }),
                parsed, errors, restored;

            if (!value) {
                return {collection: null, document: null, errors: [], loaded: false}
            }

            parsed = JSON.parse(value);
            errors = DockZoneModel.validateSavedLayoutCollection(parsed);

            if (errors.length) {
                return {collection: null, document: null, errors, loaded: false}
            }

            restored = DockZoneModel.restoreActiveSavedLayout(parsed);

            if (restored.errors.length) {
                return {collection: null, document: null, errors: restored.errors, loaded: false}
            }

            me.layoutCollection = DockZoneModel.clone(parsed);
            me.onDockZoneDocumentChange(restored.document);
            await me.refreshPromise;

            return {collection: me.layoutCollection, document: me.dockModel, errors: [], loaded: true}
        } catch (error) {
            return {collection: null, document: null, errors: [error.message], loaded: false}
        }
    }

    /**
     * Persists the current named-perspective collection via the main-thread LocalStorage addon.
     * @param {Object} [collection=this.layoutCollection]
     * @returns {Promise<{persisted:Boolean, error:(String|null)}>|undefined}
     */
    persistLayoutCollection(collection=this.layoutCollection) {
        let storage = Neo.main?.addon?.LocalStorage;

        if (!storage?.updateLocalStorageItem || !collection) {
            return undefined
        }

        return Promise.resolve(storage.updateLocalStorageItem({
            key     : this.layoutCollectionStorageKey,
            value   : JSON.stringify(collection),
            windowId: this.windowId
        })).then(() => ({
            error    : null,
            persisted: true
        })).catch(error => ({
            error    : error?.message || 'LocalStorage update rejected',
            persisted: false
        }))
    }

    /**
     * Selects and restores a named perspective through `DockZoneModel.restoreActiveSavedLayout()`.
     * @param {String} layoutId
     * @returns {{collection:Object, document:(Object|null), errors:String[]}}
     */
    restorePerspective(layoutId) {
        let me       = this,
            selected = DockZoneModel.selectSavedLayout(me.layoutCollection, layoutId),
            restored;

        if (selected.errors.length) {
            return {collection: me.layoutCollection, document: null, errors: selected.errors}
        }

        restored = DockZoneModel.restoreActiveSavedLayout(selected.collection);

        if (restored.errors.length) {
            return {collection: me.layoutCollection, document: null, errors: restored.errors}
        }

        me.layoutCollection = selected.collection;
        me.persistLayoutCollection();
        me.onDockZoneDocumentChange(restored.document);

        return {collection: me.layoutCollection, document: me.dockModel, errors: []}
    }

    /**
     * Saves the current committed dock document as a new named perspective and activates it.
     * @returns {{collection:Object, layout:(Object|null), errors:String[]}}
     */
    saveCurrentPerspective() {
        let me       = this,
            layoutId = me.nextSavedPerspectiveId(),
            title    = `Saved ${me.savedPerspectiveCount}`,
            saved    = DockZoneModel.createSavedLayout(me.dockModel, {
                layoutId,
                title,
                metadata: {
                    source: 'examples/dashboard/dock',
                    saved : true
                }
            }),
            upserted;

        if (saved.errors.length) {
            return {collection: me.layoutCollection, layout: null, errors: saved.errors}
        }

        upserted = DockZoneModel.upsertSavedLayout(me.layoutCollection, saved.layout, {activate: true});

        if (upserted.errors.length) {
            return {collection: me.layoutCollection, layout: null, errors: upserted.errors}
        }

        me.layoutCollection = upserted.collection;
        me.persistLayoutCollection();
        me.onDockZoneDocumentChange(me.dockModel);

        return {collection: me.layoutCollection, layout: saved.layout, errors: []}
    }

    /**
     * Removes the active saved perspective and restores the next available replacement.
     * @returns {{collection:Object, document:(Object|null), errors:String[]}}
     */
    removeActivePerspective() {
        let me             = this,
            collection     = me.layoutCollection,
            layoutIds      = Object.keys(collection?.layouts || {}),
            activeLayoutId = collection?.activeLayoutId,
            replacementId  = layoutIds.find(layoutId => layoutId !== activeLayoutId),
            removed, restored;

        if (!activeLayoutId || !replacementId) {
            return {collection, document: null, errors: ['at least one replacement perspective must remain']}
        }

        removed = DockZoneModel.removeSavedLayout(collection, {
            layoutId           : activeLayoutId,
            replacementLayoutId: replacementId
        });

        if (removed.errors.length) {
            return {collection, document: null, errors: removed.errors}
        }

        restored = DockZoneModel.restoreActiveSavedLayout(removed.collection);

        if (restored.errors.length) {
            return {collection, document: null, errors: restored.errors}
        }

        me.layoutCollection = removed.collection;
        me.persistLayoutCollection();
        me.onDockZoneDocumentChange(restored.document);

        return {collection: me.layoutCollection, document: me.dockModel, errors: []}
    }

    /**
     * Returns the next free example-generated perspective id and updates the visible suffix counter.
     * @returns {String}
     */
    nextSavedPerspectiveId() {
        let me = this,
            id;

        do {
            me.savedPerspectiveCount++;
            id = `saved-perspective-${me.savedPerspectiveCount}`
        } while (me.layoutCollection?.layouts?.[id]);

        return id
    }
}

export default Neo.setupClass(MainContainer);
