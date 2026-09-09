import DockService        from '../../../src/ai/client/DockService.mjs';
import DockWorkspace      from '../../../src/dashboard/dock/Workspace.mjs';
import WorkspaceDocument  from '../../../src/dashboard/dock/model/WorkspaceDocument.mjs';
import Persistence        from '../../../src/dashboard/dock/model/Persistence.mjs';
import PerspectiveLibrary from '../../../src/dashboard/dock/persistence/PerspectiveLibrary.mjs';
import ReloadablePane     from './ReloadablePane.mjs';
import TourRunner         from '../../../src/ai/client/TourRunner.mjs';
import '../../../src/button/Base.mjs';    // registers the `button` ntype used by the perspective toolbar
import '../../../src/tab/Container.mjs'; // registers the `tab-container` ntype the projection emits for tab zones
import '../../../src/toolbar/Base.mjs';  // registers the `toolbar` ntype used by the perspective toolbar

/**
 * @class Neo.examples.dashboard.dock.MainContainer
 * @extends Neo.dashboard.dock.Workspace
 * @summary Declarative dock layout with optional example-owned perspectives and tour replay.
 *
 * The panes and zones configs define the complete initial arrangement. Workspace owns lowering,
 * pane resolution, first projection and interaction lifetimes. Named structural IDs below are
 * used by the Review preset and tour operations; other node IDs belong to the engine.
 *
 * The remaining methods demonstrate saved-layout collections, a persistent toolbar and LocalStorage
 * through the main-thread addon. These features consume the captured document and are independent
 * of initial layout authoring. A supplied document retains the host's precedence over declarations.
 *
 * See learn/guides/uibuildingblocks/DockLayouts.md for the adoption guide.
 */
class MainContainer extends DockWorkspace {
    static config = {
        /**
         * @member {String} className='Neo.examples.dashboard.dock.MainContainer'
         * @protected
         */
        className: 'Neo.examples.dashboard.dock.MainContainer',
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
         * And into the engine-owned pin action, so the example demonstrates the WHOLE auto-hide
         * round-trip: a pane collapses to its edge rail from its own header, and the rail's reveal
         * overlay brings it back. Before this the example could only show the way back.
         * @member {Boolean} enableDockPinAction=true
         */
        enableDockPinAction: true,
        /**
         * And into the engine-owned reload action, which delegates to a pane's `dockReload()` when
         * it has one and otherwise recreates the pane through the engine. The Strategy pane
         * implements the contract below, so the example shows both halves of the policy: a
         * delegated reload that counts, and an engine recreate on every pane that does not.
         * @member {Boolean} enableDockReloadAction=true
         */
        enableDockReloadAction: true,
        /**
         * The perspective toolbar sits at index 0; the projected shell follows it.
         * @member {Number} dockShellIndex=1
         */
        dockShellIndex: 1,
        /**
         * @member {Object} layout={ntype:'vbox', align:'stretch'}
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * Ordinary pane configs keyed by their stable workspace identity. Strategy supplies
         * the existing reload delegation demo; the other panes use the host's recreate path.
         * @member {Object} panes
         */
        panes: {
            strategy : {module: ReloadablePane, cls: ['neo-example-dock-pane'], header: {text: 'Strategy'}},
            swarm    : {ntype: 'component', cls: ['neo-example-dock-pane'], header: {text: 'Swarm'}, text: 'Swarm'},
            terminal : {ntype: 'component', cls: ['neo-example-dock-pane'], header: {text: 'Terminal'}, text: 'Terminal'},
            logs     : {ntype: 'component', cls: ['neo-example-dock-pane'], header: {text: 'Logs'}, text: 'Logs'},
            inspector: {ntype: 'component', cls: ['neo-example-dock-pane'], header: {text: 'Inspector'}, text: 'Inspector'},
            metrics  : {ntype: 'component', cls: ['neo-example-dock-pane'], header: {text: 'Metrics'}, text: 'Metrics'},
            timeline : {ntype: 'component', cls: ['neo-example-dock-pane'], header: {text: 'Timeline'}, text: 'Timeline'},
            agents   : {ntype: 'component', cls: ['neo-example-dock-pane'], header: {text: 'Agents'}, text: 'Agents'},
            alerts   : {ntype: 'component', cls: ['neo-example-dock-pane'], header: {text: 'Alerts'}, text: 'Alerts'},
            history  : {ntype: 'component', cls: ['neo-example-dock-pane'], header: {text: 'History'}, text: 'History'}
        },
        /**
         * Nested placement: center tabs beside a vertical split, with an inspector edge band.
         * @member {Object} zones
         */
        zones: {
            center: {
                id      : 'root-split', orientation: 'horizontal', sizes: [0.65, 0.35],
                children: [{
                    id   : 'main-tabs',
                    items: ['strategy', 'swarm', 'metrics', 'timeline', 'agents', 'alerts', 'history']
                }, {
                    id      : 'side-split', orientation: 'vertical', sizes: [0.6, 0.4],
                    children: ['terminal', 'logs']
                }]
            },
            right: {items: ['inspector'], extent: 0.25, resizable: true}
        }
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
     * @summary Creates perspective chrome after Workspace captures the initial declarations.
     * @protected
     */
    onAfterConstructed() {
        super.onAfterConstructed();

        const me = this;

        me.layoutCollection = me.createDefaultLayoutCollection();
        me.add(me.createPerspectiveToolbar());
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

            return {...result, document: WorkspaceDocument.clone(me.dockModel)}
        } finally {
            runner.destroy();
            dockService.destroy()
        }
    }

    /**
     * @summary Derives Operator and Review perspectives from the effective initial document.
     * @returns {Object}
     */
    createDefaultLayoutCollection() {
        const operator = WorkspaceDocument.clone(this.dockModel),
              review   = WorkspaceDocument.clone(operator),
              nodes    = review.nodes;

        // Restored documents can have different topology; adjust only the matching named regions.
        if (nodes['root-split']?.type === 'split' && nodes['root-split'].children.length === 2) nodes['root-split'].sizes = [0.48, 0.52];
        if (nodes['main-tabs']?.items?.includes('swarm')) nodes['main-tabs'].activeItemId = 'swarm';
        if (nodes['side-split']?.type === 'split' && nodes['side-split'].children.length === 2) nodes['side-split'].sizes = [0.42, 0.58];

        let layouts = [
                {document: operator, layoutId: 'operator-default', title: 'Operator'},
                {document: review, layoutId: 'review-focus', title: 'Review'}
            ].map(({document, layoutId, title}) => {
                let {layout, errors} = Persistence.createSavedLayout(document, {
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
            {collection, errors} = PerspectiveLibrary.createSavedLayoutCollection(layouts, {
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
            errors = PerspectiveLibrary.validateSavedLayoutCollection(parsed);

            if (errors.length) {
                return {collection: null, document: null, errors, loaded: false}
            }

            restored = PerspectiveLibrary.restoreActiveSavedLayout(parsed);

            if (restored.errors.length) {
                return {collection: null, document: null, errors: restored.errors, loaded: false}
            }

            me.layoutCollection = WorkspaceDocument.clone(parsed);
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
     * Selects and restores a named perspective through `PerspectiveLibrary.restoreActiveSavedLayout()`.
     * @param {String} layoutId
     * @returns {{collection:Object, document:(Object|null), errors:String[]}}
     */
    restorePerspective(layoutId) {
        let me       = this,
            selected = PerspectiveLibrary.selectSavedLayout(me.layoutCollection, layoutId),
            restored;

        if (selected.errors.length) {
            return {collection: me.layoutCollection, document: null, errors: selected.errors}
        }

        restored = PerspectiveLibrary.restoreActiveSavedLayout(selected.collection);

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
            saved    = Persistence.createSavedLayout(me.dockModel, {
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

        upserted = PerspectiveLibrary.upsertSavedLayout(me.layoutCollection, saved.layout, {activate: true});

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

        removed = PerspectiveLibrary.removeSavedLayout(collection, {
            layoutId           : activeLayoutId,
            replacementLayoutId: replacementId
        });

        if (removed.errors.length) {
            return {collection, document: null, errors: removed.errors}
        }

        restored = PerspectiveLibrary.restoreActiveSavedLayout(removed.collection);

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
