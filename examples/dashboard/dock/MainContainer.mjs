import Component                from '../../../src/component/Base.mjs';
import DockLayoutAdapter        from '../../../src/dashboard/DockLayoutAdapter.mjs';
import DockMotionSignal         from '../../../src/dashboard/DockMotionSignal.mjs';
import DockPreviewProducer      from '../../../src/dashboard/DockPreviewProducer.mjs';
import DockProjectionReconciler from '../../../src/dashboard/DockProjectionReconciler.mjs';
import DockService              from '../../../src/ai/client/DockService.mjs';
import DockZoneModel            from '../../../src/dashboard/DockZoneModel.mjs';
import TourRunner               from '../../../src/ai/client/TourRunner.mjs';
import Viewport                 from '../../../src/container/Viewport.mjs';
import {previewToOperation}     from '../../../src/dashboard/dockPreviewContract.mjs';
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
 * Resolves a model `componentRef` to the component config rendered inside its dock zone. For this example, a simple
 * centered label per panel; a real app resolves each ref to its feature view.
 * @param {String} componentRef
 * @param {Object} _item The persisted item record.
 * @param {String} itemId The stable workspace identity from the item catalog.
 * @returns {Object}
 */
const resolveComponentRef = (componentRef, _item, itemId) => ({
    // the flip marker class carries stable item identity across reconciled geometry changes
    cls  : [`dock-flip-item-${encodeURIComponent(itemId)}`],
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
 * delivered the static render. See `learn/agentos/DockZoneModel.md` for the model/projection contract.
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
         * The dock motion/token contract (`--dock-transition-*`, reveal keyframes, splitter
         * cursors) lives in the `Neo.dashboard.Container` theme file — the projected dock tree
         * is plain containers, so per-class loading never fetches it; the workspace declares
         * the dependency (the projection root carries the matching `.neo-dashboard` scope).
         * @member {String[]} additionalThemeFiles=['Neo.dashboard.Container']
         */
        additionalThemeFiles: ['Neo.dashboard.Container'],
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
     * The in-flight deferred re-projection, tracked as an awaitable: every committed operation
     * defers its view-sync one tick ({@link #onDockZoneDocumentChange}), so any consumer that
     * must observe a SETTLED surface — the tour-replay adapter, teardown-sensitive probes —
     * awaits this promise instead of racing that deferral. Commits chain with their document and
     * one-use descriptor snapshots, so staged transactions cannot overlap or cross-correlate.
     * @member {Promise|null} refreshPromise=null
     * @protected
     */
    refreshPromise = null

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

        me.dockPreviewProducer = Neo.create(DockPreviewProducer);
        me.layoutCollection    = me.createDefaultLayoutCollection();
        me.dockModel           = DockZoneModel.restoreActiveSavedLayout(me.layoutCollection).document || DockZoneModel.clone(initialDockModel);

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
     * The read half of the dock-holder contract (`src/ai/client/DockService.mjs`): exposes the
     * live committed document so Neural Link topology reads work BEFORE any operation has run.
     * The write half is {@link #applyDockZoneOperation}; the state sync stays in
     * {@link #onDockZoneDocumentChange}, which advances `dockModel` on each commit.
     * @returns {Object} The current committed dockZone.v1 document.
     */
    getDockZoneDocument() {
        return this.dockModel
    }

    /**
     * An example-local tour-replay ADAPTER consuming the two-part holder contract (the read half
     * {@link #getDockZoneDocument} / the write half {@link #applyDockZoneOperation}, driven through
     * the app-side dock seam) — deliberately NOT a third holder-contract member. It replays one
     * `neo.tour.script.v1` script against THIS holder in `spec` mode and returns the runner's
     * structured result plus the SETTLED post-run document. One call = one hydrated, settled run —
     * the whitebox-e2e L3 smoke drives it twice and diffs the operation logs (the determinism
     * falsifier: entries carry descriptors and assertion outcomes, never timestamps).
     *
     * Two synchronization guarantees callers rely on:
     * 1. Runs only start against the HYDRATED document (storage restore awaited) — a replay racing
     *    the restore would mutate a baseline the restore then overwrites.
     * 2. Resolution only after the LAST deferred re-projection settles ({@link #refreshPromise}),
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
        let dockConfig = this.projectDockModel(tabInsertDescriptor);

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
     * Returns the one-use projection correlation only when the committed descriptor creates a
     * globally absent header. `DockZoneModel` downgrades `addTab` to `moveItem` whenever the item
     * already lives in any tabs node; those identity-preserving relocations use FLIP alone. A
     * same-node reorder, malformed descriptor, restore, and initial path fail closed to an instant
     * projection.
     *
     * The returned object is deliberately normalized instead of retaining caller/runtime fields,
     * and is carried only by the scheduled projection closure — it never enters `dockModel`, a
     * saved perspective, or persistence.
     * @param {Object} document The post-commit dock-zone document.
     * @param {Object|null} descriptor The semantic operation that produced `document`.
     * @returns {Object|null}
     * @protected
     */
    getTabInsertProjectionDescriptor(document, descriptor) {
        let {itemId, operation, tabsNodeId} = descriptor || {},
            oldItems                        = this.dockModel?.nodes?.[tabsNodeId]?.items,
            newItems                        = document?.nodes?.[tabsNodeId]?.items;

        return operation === 'addTab'
            && typeof itemId === 'string'
            && typeof tabsNodeId === 'string'
            && Array.isArray(oldItems)
            && Array.isArray(newItems)
            && !DockZoneModel.findContainingTabsId(this.dockModel, itemId)
            && !oldItems.includes(itemId)
            && newItems.includes(itemId)
                ? {itemId, operation: 'addTab', tabsNodeId}
                : null
    }

    /**
     * The view-sync `DockSplitter` / DockService calls after a successful commit: stores the new
     * committed document and re-projects the layout from it.
     *
     * Deferred one tick: this fires synchronously from inside the committing splitter's `onDragEnd`
     * (via `commitResizeSplit`). Reconciliation still retires that splitter with its old shell, so
     * doing it mid-handler would create a use-after-destroy on the rest of `onDragEnd`. The
     * `isDestroyed` guard covers teardown before the tick fires.
     * A real `addTab` captures its exact normalized correlation in THIS scheduled closure; every
     * other call carries `null`, so the descriptor is consumed by one projection only.
     * @param {Object} document The committed dock-zone document.
     * @param {Object|null} [descriptor=null] The semantic operation that produced `document`.
     */
    onDockZoneDocumentChange(document, descriptor=null) {
        let me                  = this,
            tabInsertDescriptor = me.getTabInsertProjectionDescriptor(document, descriptor);

        me.dockModel = document;

        // Retained as an awaitable (NOT fire-and-forget): a consumer asserting page survival or
        // settled geometry must be able to await the projection this commit just scheduled —
        // otherwise its verdict window closes before the staged transaction has executed.
        me.refreshPromise = (me.refreshPromise || Promise.resolve())
            .then(() => me.timeout(0))
            .then(() => {
                if (!me.isDestroyed) {
                    return me.refreshDockWorkspace(tabInsertDescriptor, document)
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
     * Reconciles the dock projection while synchronizing the persistent perspective toolbar.
     * @param {Object|null} [tabInsertDescriptor=null] One-use normalized `addTab` correlation
     * captured by the commit that scheduled this refresh.
     * @param {Object} [document=this.dockModel] Committed document snapshot owned by this refresh.
     */
    async refreshDockWorkspace(tabInsertDescriptor=null, document=this.dockModel) {
        const
            me           = this,
            flip         = Neo.main?.addon?.DockFlip,
            placeholders = new Map();

        // FLIP phase 1 (presentation-only, fail-safe): snapshot outgoing pane geometry so the
        // committed re-layout GLIDES — a human drop and an NL operation animate identically
        try {
            await flip?.captureFirst({hostId: me.id, markerPrefix: 'dock-flip-item-'})
        } catch (e) {/* instant landing */}

        me.syncPerspectiveToolbar();

        const nextConfig = me.projectDockModel(tabInsertDescriptor, (componentRef, item, itemId) => {
            const placeholder = Neo.create({
                module: Component,
                header: {text: item?.title ?? componentRef ?? itemId},
                hidden: true
            });

            placeholders.set(itemId, placeholder);

            return placeholder
        }, document);

        nextConfig.flex = 1;

        await DockProjectionReconciler.reconcileProjection({
            host       : me,
            nextConfig,
            placeholders,
            resolveItem: itemId => {
                const item = document.items[itemId];

                return DockLayoutAdapter.decorateProjectedItem(
                    resolveComponentRef(item?.componentRef, item, itemId),
                    itemId,
                    item,
                    {
                        nodeId: tabInsertDescriptor?.tabsNodeId,
                        tabInsertDescriptor
                    }
                )
            },
            shellIndex: 1
        });

        // FLIP phase 2: fire-and-forget — the addon self-waits for the swap, inverts, plays
        // the counted motion signal brackets the awaited animation window — ownership
        // lives in DockMotionSignal (fail-safe backstopped), never in the addon
        if (flip) {
            DockMotionSignal.enter(me);
            flip.play({hostId: me.id, markerPrefix: 'dock-flip-item-'})
                .catch(() => {})
                .finally(() => DockMotionSignal.leave(me))
        }
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

    /**
     * Projects the live committed {@link #dockModel} into a dock-zone container config, threading
     * the instance-bound commit-loop callbacks onto every projected affordance.
     * @param {Object|null} [tabInsertDescriptor=null] One-use normalized `addTab` correlation.
     * @param {Function} [itemResolver=resolveComponentRef] Pane resolver used by this projection.
     * @param {Object} [document=this.dockModel] Committed document snapshot to project.
     * @returns {Object}
     */
    projectDockModel(tabInsertDescriptor=null, itemResolver=resolveComponentRef, document=this.dockModel) {
        let me = this;

        return DockLayoutAdapter.project(document, {
            applyDockZoneOperation   : me.applyDockZoneOperation.bind(me),
            onDockCrossZoneDrop      : me.onDockCrossZoneDrop.bind(me),
            onDockZoneDocumentChange : me.onDockZoneDocumentChange.bind(me),
            resolveComponentRef      : itemResolver,
            resolveRevealComponentRef: resolveComponentRef,
            tabInsertDescriptor
        })
    }

    /**
     * Cross-zone drop reducer: a dock tab-header released outside its own toolbar reports its release point
     * here (via {@link Neo.dashboard.DockTabSortZone}). Resolves which tabs zone is under the pointer and,
     * when it differs from the source, commits a semantic `moveItem` — relocating the item across zones in
     * the committed dockZone.v1 document. A same-zone drop is a no-op (the within-toolbar reorder already
     * committed via the `moveTo` listener).
     * @param {Object} data
     * @param {Number} data.clientX
     * @param {Number} data.clientY
     * @param {String} data.itemId       The dock item id being dragged.
     * @param {String} data.sourceNodeId The tabs node the drag started in.
     */
    async onDockCrossZoneDrop({clientX, clientY, itemId, sourceNodeId}) {
        let me    = this,
            nodes = me.dockModel?.nodes || {},
            zones = Object.keys(nodes)
                .filter(nodeId => nodes[nodeId].type === 'tabs' && nodeId !== sourceNodeId)
                .map(nodeId => ({nodeId, container: me.down({dockNodeId: nodeId})}))
                .filter(zone => zone.container);

        if (!zones.length) {
            return
        }

        let rects = await me.getDomRect(zones.map(zone => zone.container.id));

        // The producer resolves the placement KIND (tab-into / edge-* / split-*) from the pointer and
        // each zone's rect; a tabs node's parent-split orientation lets it pick split-before/after vs an
        // edge band. `previewToOperation` maps that dockPreview.v1 to the semantic op the reducer applies
        // — replacing the former crude "which rect contains the pointer" → hardcoded moveItem shortcut.
        let producerZones = zones
                .map((zone, index) => ({
                    nodeId     : zone.nodeId,
                    rect       : rects[index],
                    orientation: Object.values(nodes).find(node => node.type === 'split' && node.children?.includes(zone.nodeId))?.orientation ?? null
                }))
                .filter(zone => zone.rect),
            preview    = me.dockPreviewProducer.produce({pointer: {x: clientX, y: clientY}, zones: producerZones, itemId, sourceNodeId}),
            descriptor = previewToOperation(preview);

        if (descriptor) {
            let result = me.applyDockZoneOperation(descriptor);

            if (result && !result.errors?.length && result.document) {
                me.onDockZoneDocumentChange(result.document, descriptor, me)
            }
        }
    }
}

export default Neo.setupClass(MainContainer);
