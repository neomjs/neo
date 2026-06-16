import DockLayoutAdapter from '../../../src/dashboard/DockLayoutAdapter.mjs';
import DockZoneModel     from '../../../src/dashboard/DockZoneModel.mjs';
import Viewport          from '../../../src/container/Viewport.mjs';
import '../../../src/button/Base.mjs';    // registers the `button` ntype used by the perspective toolbar
import '../../../src/tab/Container.mjs'; // registers the `tab-container` ntype the projection emits for tab zones
import '../../../src/toolbar/Base.mjs';  // registers the `toolbar` ntype used by the perspective toolbar

/**
 * A representative dock-zone document (`neo.harness.dockZone.v1`): a horizontal split of a two-tab main zone and a
 * vertical side-split of two single-tab zones, over four items. The shape `Neo.dashboard.DockLayoutAdapter.project`
 * consumes — see its spec for the full contract. Used as the example's INITIAL committed document; the live document
 * advances on each splitter resize (see `MainContainer#dockModel`).
 * @type {Object}
 */
const initialDockModel = {
    schema: 'neo.harness.dockZone.v1',
    root  : 'root',
    items : {
        strategy: {componentRef: 'Strategy', title: 'Strategy', kind: 'panel'},
        swarm   : {componentRef: 'Swarm',    title: 'Swarm',    kind: 'panel'},
        terminal: {componentRef: 'Terminal', title: 'Terminal', kind: 'terminal'},
        logs    : {componentRef: 'Logs',     title: 'Logs',     kind: 'panel'}
    },
    nodes: {
        root           : {type: 'split', orientation: 'horizontal', children: ['main-tabs', 'side-split'], sizes: [0.65, 0.35]},
        'main-tabs'    : {type: 'tabs',  items: ['strategy', 'swarm'], activeItemId: 'strategy'},
        'side-split'   : {type: 'split', orientation: 'vertical', children: ['terminal-tabs', 'logs-tabs'], sizes: [0.6, 0.4]},
        'terminal-tabs': {type: 'tabs',  items: ['terminal'], activeItemId: 'terminal'},
        'logs-tabs'    : {type: 'tabs',  items: ['logs'],     activeItemId: 'logs'}
    }
};

const reviewDockModel = DockZoneModel.clone(initialDockModel);

reviewDockModel.nodes.root.sizes = [0.48, 0.52];
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
 * Resolves a model `componentRef` to the component config rendered inside its dock zone. For this example, a simple
 * centered label per panel; a real app resolves each ref to its feature view.
 * @param {String} componentRef
 * @returns {Object}
 */
const resolveComponentRef = componentRef => ({
    ntype: 'component',
    style: {alignItems: 'center', color: '#888', display: 'flex', fontSize: '20px', justifyContent: 'center'},
    html : componentRef
});

/**
 * @summary Standalone, interactive example for the dashboard dock-zone layout system.
 *
 * Builds a representative {@link Neo.dashboard.DockZoneModel} document, projects it through
 * {@link Neo.dashboard.DockLayoutAdapter} into a live container of split / tab zones with splitter affordances, and
 * wires the **resize commit loop** end-to-end: dragging a splitter commits a `resizeSplit` operation through
 * `DockZoneModel`, and the layout re-projects from the new committed document.
 *
 * The rendered perspective toolbar consumes the same saved-layout collection helpers the model exposes: seed
 * perspectives are stored as `neo.harness.dockLayoutCollection.v1`, selecting a perspective calls
 * `restoreActiveSavedLayout()`, Save Current upserts the live committed document, and Delete Active keeps a valid
 * replacement active. Persistence uses the main-thread `LocalStorage` addon so App-Worker code never reaches for
 * `window.localStorage` directly.
 *
 * The example owns the committed document ({@link #dockModel}) as the single source of truth and drives the loop with
 * the two callbacks `DockSplitter` calls — a clean reducer / view-sync split:
 * - {@link #applyDockZoneOperation} is the **reducer**: a pure `DockZoneModel.applyOperation` over the current document.
 * - {@link #onDockZoneDocumentChange} is the **view-sync**: it stores the committed document and re-projects from it.
 *
 * This is the first *runtime* exercise of the full model → operation → re-projection cycle in a standalone app; Slice 1
 * delivered the static render. See `learn/agentos/HarnessDockZoneModel.md` for the model/projection contract.
 * @class Neo.examples.dashboard.dock.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static config = {
        /**
         * @member {String} className='Neo.examples.dashboard.dock.MainContainer'
         * @protected
         */
        className: 'Neo.examples.dashboard.dock.MainContainer',
        /**
         * @member {Object} layout={ntype:'vbox', align:'stretch'}
         */
        layout: {ntype: 'vbox', align: 'stretch'}
        // `items` is built in construct() — not here — so each projection can carry the instance-bound
        // applyDockZoneOperation + onDockZoneDocumentChange callbacks the resize commit loop needs.
    }

    /**
     * Browser-local storage key for the example's named-perspective collection.
     * @member {String} layoutCollectionStorageKey='neo.examples.dashboard.dock.layoutCollection'
     */
    layoutCollectionStorageKey = 'neo.examples.dashboard.dock.layoutCollection'

    /**
     * The live committed dock-zone document — the single source of truth the view projects from. Initialized to
     * `initialDockModel`; advanced by {@link #onDockZoneDocumentChange} on each committed splitter resize.
     * @member {Object|null} dockModel=null
     */
    dockModel = null

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
     * The owning reducer `DockSplitter.commitResizeSplit` calls: applies a splitter-emitted operation descriptor
     * against the live committed document and returns `DockZoneModel`'s fail-closed `{document, errors}` result.
     * Pure — the view sync happens in {@link #onDockZoneDocumentChange}, which the splitter calls on success.
     * @param {Object} descriptor The `resizeSplit` operation descriptor.
     * @returns {{document: Object, errors: String[]}}
     */
    applyDockZoneOperation(descriptor) {
        return DockZoneModel.applyOperation(this.dockModel, descriptor)
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
     * Creates the top-level toolbar + dock projection items from current state.
     * @returns {Object[]}
     */
    buildWorkspaceItems() {
        let dockConfig = this.projectDockModel();

        dockConfig.flex = 1;

        return [
            this.createPerspectiveToolbar(),
            dockConfig
        ]
    }

    /**
     * Builds a compact named-perspective toolbar from the current collection.
     * @returns {Object}
     */
    createPerspectiveToolbar() {
        let me            = this,
            collection    = me.layoutCollection,
            activeLayoutId = collection?.activeLayoutId,
            layoutButtons = Object.values(collection?.layouts || {}).map(layout => ({
                cls    : layout.layoutId === activeLayoutId ? ['neo-dashboard-dock-perspective-active'] : [],
                data   : {layoutId: layout.layoutId},
                handler: () => me.restorePerspective(layout.layoutId),
                pressed: layout.layoutId === activeLayoutId,
                text   : layout.title
            }));

        return {
            cls         : ['neo-dashboard-dock-perspective-toolbar'],
            dockNodeType: 'perspective-toolbar',
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
                    fontWeight  : 600,
                    marginRight : '12px',
                    whiteSpace  : 'nowrap'
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
     * The view-sync `DockSplitter` calls after a successful commit: stores the new committed document and re-projects
     * the layout from it.
     *
     * Deferred one tick: this fires synchronously from inside the committing splitter's `onDragEnd` (via
     * `commitResizeSplit`). Re-projecting immediately would `removeAll()` — destroying that splitter mid-handler, a
     * use-after-destroy on the rest of `onDragEnd`. The `isDestroyed` guard covers teardown before the tick fires.
     * @param {Object} document The committed dock-zone document.
     */
    onDockZoneDocumentChange(document) {
        let me = this;

        me.dockModel = document;

        me.timeout(0).then(() => {
            if (!me.isDestroyed) {
                me.refreshDockWorkspace()
            }
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
            me.dockModel        = restored.document;
            me.refreshDockWorkspace();

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
     * Rebuilds the toolbar and dock projection from current state.
     */
    refreshDockWorkspace() {
        this.removeAll();
        this.add(this.buildWorkspaceItems())
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
        me.dockModel        = restored.document;
        me.persistLayoutCollection();
        me.refreshDockWorkspace();

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
        me.refreshDockWorkspace();

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
            layoutId            : activeLayoutId,
            replacementLayoutId : replacementId
        });

        if (removed.errors.length) {
            return {collection, document: null, errors: removed.errors}
        }

        restored = DockZoneModel.restoreActiveSavedLayout(removed.collection);

        if (restored.errors.length) {
            return {collection, document: null, errors: restored.errors}
        }

        me.layoutCollection = removed.collection;
        me.dockModel        = restored.document;
        me.persistLayoutCollection();
        me.refreshDockWorkspace();

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

    /**
     * Projects the live committed {@link #dockModel} into a dock-zone container config, threading the instance-bound
     * resize-commit-loop callbacks onto every projected splitter affordance.
     * @returns {Object}
     */
    projectDockModel() {
        let me = this;

        return DockLayoutAdapter.project(me.dockModel, {
            applyDockZoneOperation  : me.applyDockZoneOperation.bind(me),
            onDockZoneDocumentChange: me.onDockZoneDocumentChange.bind(me),
            resolveComponentRef
        })
    }
}

export default Neo.setupClass(MainContainer);
