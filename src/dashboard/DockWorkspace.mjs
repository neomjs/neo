import Component                from '../component/Base.mjs';
import Container                from '../container/Base.mjs';
import DockLayoutAdapter        from './DockLayoutAdapter.mjs';
import DockMotionSignal         from './DockMotionSignal.mjs';
import DockPreviewProducer      from './DockPreviewProducer.mjs';
import DockProjectionReconciler from './DockProjectionReconciler.mjs';
import DockZoneModel            from './DockZoneModel.mjs';
import {previewToOperation}     from './dockPreviewContract.mjs';

/**
 * @summary The engine-owned dock workspace host: the reducer-container that owns one committed
 * `dockZone.v1` document and turns it into a live projection through the single sanctioned
 * mutation path.
 *
 * Every docking workspace needs the same loop: a pure reducer over the committed document
 * ({@link #applyDockZoneOperation}), a view-sync that stores the next document and re-projects it
 * ({@link #onDockZoneDocumentChange}), a projection of the document into ordinary container configs
 * ({@link #projectDockModel} over {@link Neo.dashboard.DockLayoutAdapter}), and a reconciliation
 * that hands the surviving live panes into the next projection instead of recreating them
 * ({@link #refreshDockWorkspace} over {@link Neo.dashboard.DockProjectionReconciler}, bracketed by
 * the FLIP motion signal). Before this class, each consumer wrote that loop by hand; this class owns
 * it once, and a consumer contributes only what is genuinely its own through template hooks:
 *
 * - {@link #resolvePane} — which live component or config renders a catalog item (the one hook
 *   every consumer overrides);
 * - {@link #resolveRevealPane} — the same resolution for auto-hide reveal overlays;
 * - {@link #getPreservedItemIds} — owner-held panes that must survive a projection they are
 *   absent from (a detached pane, a tear-out handle);
 * - {@link #beforeRefreshDockWorkspace} — app chrome that syncs on every re-projection;
 * - {@link #getDockProjectionOptions} — extra adapter options: the hover-reveal opt-in, a
 *   drag-affordance layer's cross-zone seams, tear-out policy;
 * - {@link #getRefreshOptions} — the reconciler's geometry-only / retained-topology fast paths.
 *
 * The class satisfies the dock-holder contract Neural Link tooling resolves against
 * (`getDockZoneDocument()` / `applyDockZoneOperation()` / `onDockZoneDocumentChange()`, see
 * `src/ai/client/DockService.mjs`) and the `owner` duck-type of
 * {@link Neo.dashboard.DockDragAffordances} (`dockModel` plus the reducer and the view-sync), so an
 * agent, a splitter, a rail, a drag gesture and a tour runner all commit through one path.
 *
 * Two invariants every method here protects: the committed document advances ONLY inside
 * {@link #onDockZoneDocumentChange}, and every re-projection is ONE atomic ownership transaction —
 * commits chain on {@link #refreshPromise}, so a later commit can never start a second staged shell
 * before the first retired its source.
 *
 * The projection mounts into the dock host — this container itself by default, or a dedicated child
 * named by {@link #dockHostReference} when a consumer keeps persistent overlay siblings (a preview
 * renderer, drop indicators) beside the projected shell. {@link #dockShellIndex} names the shell's
 * index inside that host, so app chrome may precede it.
 *
 * Theme scope: the projected tree carries the `.neo-dashboard` scope class, and the dock motion and
 * token contract lives in the `Neo.dashboard.Container` theme file, which this class declares as an
 * additional theme dependency. A subclass that declares its own `additionalThemeFiles` replaces the
 * list and must keep that entry.
 *
 * @class Neo.dashboard.DockWorkspace
 * @extends Neo.container.Base
 * @see Neo.dashboard.DockLayoutAdapter
 * @see Neo.dashboard.DockProjectionReconciler
 * @see Neo.dashboard.DockZoneModel
 * @see learn/agentos/DockZoneModel.md
 * @see learn/guides/uibuildingblocks/DockLayouts.md
 */
class DockWorkspace extends Container {
    static config = {
        /**
         * @member {String} className='Neo.dashboard.DockWorkspace'
         * @protected
         */
        className: 'Neo.dashboard.DockWorkspace',
        /**
         * @member {String} ntype='dock-workspace'
         * @protected
         */
        ntype: 'dock-workspace',
        /**
         * The dock motion/token contract (`--dock-transition-*`, reveal keyframes, splitter
         * cursors) lives in the `Neo.dashboard.Container` theme file — the projected dock tree is
         * plain containers, so per-class loading never fetches it; the workspace declares the
         * dependency. A subclass declaring its own list must repeat this entry.
         * @member {String[]} additionalThemeFiles=['Neo.dashboard.Container']
         */
        additionalThemeFiles: ['Neo.dashboard.Container'],
        /**
         * @member {String[]} baseCls=['neo-dock-workspace']
         */
        baseCls: ['neo-dock-workspace'],
        /**
         * Reference name of the child container the projection mounts into, for consumers that
         * keep persistent overlay siblings beside the projected shell. `null` mounts the
         * projection into this container itself.
         * @member {String|null} dockHostReference=null
         */
        dockHostReference: null,
        /**
         * Config merged into every projected shell (e.g. `{flex: 1}` when the shell shares a
         * vbox with app chrome). `null` projects the adapter output unchanged.
         * @member {Object|null} dockProjectionConfig=null
         */
        dockProjectionConfig: null,
        /**
         * Index of the projected shell inside the dock host — `1` when one toolbar precedes it.
         * @member {Number} dockShellIndex=0
         */
        dockShellIndex: 0,
        /**
         * Prefix of the per-item marker class the FLIP addon correlates across a re-projection.
         * {@link #resolveProjectedPane} stamps `<prefix><encoded item id>` onto every plain pane
         * config, so consumers never carry the marker by hand.
         * @member {String} flipMarkerPrefix='dock-flip-item-'
         */
        flipMarkerPrefix: 'dock-flip-item-'
    }

    /**
     * The live committed dock-zone document — the single source of truth the view projects from.
     * Advanced exclusively by {@link #onDockZoneDocumentChange}; readable through the holder
     * contract's {@link #getDockZoneDocument} before any operation has run.
     * @member {Object|null} dockModel=null
     */
    dockModel = null

    /**
     * The placement producer behind the in-window cross-zone drop path. Created here, destroyed
     * here; a consumer composing {@link Neo.dashboard.DockDragAffordances} routes its drop seam
     * through that controller's own producer instead (see {@link #getDockProjectionOptions}).
     * @member {Neo.dashboard.DockPreviewProducer|null} dockPreviewProducer=null
     * @protected
     */
    dockPreviewProducer = null

    /**
     * The in-flight deferred re-projection, tracked as an awaitable: every committed operation
     * defers its view-sync one tick, so any consumer that must observe a SETTLED surface — a tour
     * replay, a reveal cue, a teardown-sensitive probe — awaits this promise instead of racing that
     * deferral. Commits chain with their document and one-use descriptor snapshots, so staged
     * transactions cannot overlap or cross-correlate.
     * @member {Promise|null} refreshPromise=null
     * @protected
     */
    refreshPromise = null

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);
        this.dockPreviewProducer = Neo.create(DockPreviewProducer)
    }

    /**
     * The pure reducer of the holder contract: applies one semantic operation descriptor against
     * the live committed document and returns `DockZoneModel`'s fail-closed `{document, errors}`
     * result. Never mutates {@link #dockModel} — the view-sync {@link #onDockZoneDocumentChange}
     * is the only writer, called by the committing surface on success.
     * @param {Object} descriptor The semantic operation descriptor.
     * @returns {{document: Object, errors: String[]}}
     */
    applyDockZoneOperation(descriptor) {
        return DockZoneModel.applyOperation(this.dockModel, descriptor)
    }

    /**
     * Hook: app chrome that must sync on every re-projection (a perspective toolbar, a control
     * bar, a drag-affordance session to invalidate). Runs before the FLIP snapshot of the outgoing
     * geometry. The default does nothing.
     * @param {Object} document The committed document this refresh projects.
     * @param {Object} refreshOptions The options {@link #getRefreshOptions} produced for it.
     */
    beforeRefreshDockWorkspace(document, refreshOptions) {}

    /**
     * Creates the hidden stand-in the reconciler materializes a projected item through before the
     * live pane or its resolved config takes the slot. Override only to change the placeholder's
     * shape; its header text rides {@link #getPaneHeaderText}.
     * @param {String} itemId
     * @param {Object} item The persisted item record.
     * @param {String} componentRef
     * @returns {Neo.component.Base}
     * @protected
     */
    createProjectionPlaceholder(itemId, item, componentRef) {
        return Neo.create({
            module: Component,
            header: {text: this.getPaneHeaderText(itemId, item, componentRef)},
            hidden: true
        })
    }

    /**
     * Stamps the FLIP marker class onto a plain pane config so a newly materialized pane joins the
     * addon's geometry correlation. Live component instances are returned untouched — their
     * identity resolves through the committed document, never through a class stamp.
     * @param {*} config Resolved pane config or live component instance.
     * @param {String} itemId
     * @returns {*}
     * @protected
     */
    decorateFlipMarker(config, itemId) {
        if (!config || config.constructor !== Object) {
            return config
        }

        return {
            ...config,
            cls: [...new Set([...(config.cls || []), `${this.flipMarkerPrefix}${encodeURIComponent(itemId)}`])]
        }
    }

    /**
     * Tears down the producer with the workspace and drops the pending refresh chain; a refresh
     * scheduled before teardown no-ops on its `isDestroyed` guard.
     * @param {...*} args
     */
    destroy(...args) {
        let me = this;

        me.dockPreviewProducer?.destroy();
        me.dockPreviewProducer = null;
        me.refreshPromise      = null;

        super.destroy(...args)
    }

    /**
     * The container the projection mounts into: the child named by {@link #dockHostReference},
     * or this workspace itself.
     * @returns {Neo.container.Base|null}
     */
    getDockHost() {
        let {dockHostReference} = this;

        return dockHostReference ? this.getReference(dockHostReference) : this
    }

    /**
     * Hook: extra options for every {@link Neo.dashboard.DockLayoutAdapter#project} call — the
     * hover-reveal opt-in, a drag-affordance layer's `onDockCrossZoneDragMove` /
     * `onDockCrossZoneDragCancel` / `onDockCrossZoneDrop` seams, tear-out or conversion policy.
     * Returned keys override the default cross-zone drop seam; they never replace the reducer and
     * view-sync callbacks, which stay bound to this instance. The default contributes nothing.
     * @returns {Object}
     */
    getDockProjectionOptions() {
        return {}
    }

    /**
     * The read half of the dock-holder contract (`src/ai/client/DockService.mjs`): the live
     * committed document, readable before any operation has run.
     * @returns {Object|null}
     */
    getDockZoneDocument() {
        return this.dockModel
    }

    /**
     * Header text for a projected pane's placeholder and default resolution.
     * @param {String} itemId
     * @param {Object} item The persisted item record.
     * @param {String} componentRef
     * @returns {String}
     */
    getPaneHeaderText(itemId, item, componentRef) {
        return item?.title ?? componentRef ?? itemId
    }

    /**
     * Hook: item ids whose live panes this workspace holds OUTSIDE the current projection and
     * that the reconciler must park rather than retire — a detached pane, a tear-out handle.
     * The default holds none.
     * @returns {Iterable<String>}
     */
    getPreservedItemIds() {
        return []
    }

    /**
     * Hook: the reconciler's fast-path options for the refresh a commit schedules —
     * `{geometryOnly}` for a pure `resizeSplit`, `{retainTopology}` for item-only deltas on a
     * proven-identical shell. The default takes the full staged transaction every time.
     * @param {Object|null} descriptor The semantic operation that produced the document, when known.
     * @param {Object|null} source The committing surface, when it identifies itself.
     * @returns {Object}
     */
    getRefreshOptions(descriptor, source) {
        return {}
    }

    /**
     * Returns the one-use projection correlation only when the committed descriptor creates a
     * globally absent header. `DockZoneModel` downgrades `addTab` to `moveItem` whenever the item
     * already lives in any tabs node; those identity-preserving relocations use FLIP alone. A
     * same-node reorder, malformed descriptor, restore, and initial path fail closed to an instant
     * projection.
     *
     * The returned object is deliberately normalized instead of retaining caller or runtime
     * fields, and is carried only by the scheduled projection closure — it never enters
     * {@link #dockModel}, a saved perspective, or persistence.
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
     * The default in-window cross-zone drop seam: a dock tab header released outside its own
     * toolbar reports its release point here (via {@link Neo.dashboard.DockTabSortZone}). The
     * producer resolves the placement kind from the pointer and every other tabs zone's rect — a
     * tabs node's parent-split orientation lets it choose `split-*` over an edge band —
     * `previewToOperation` maps that `dockPreview.v1` to the semantic operation, and exactly one
     * commit follows. A same-zone drop is a no-op (the within-toolbar reorder already committed);
     * a pointer over no zone commits nothing.
     * @param {Object} data
     * @param {Number} data.clientX
     * @param {Number} data.clientY
     * @param {String} data.itemId       The dock item id being dragged.
     * @param {String} data.sourceNodeId The tabs node the drag started in.
     */
    async onDockCrossZoneDrop({clientX, clientY, itemId, sourceNodeId}) {
        let me    = this,
            host  = me.getDockHost(),
            nodes = me.dockModel?.nodes || {},
            zones = Object.keys(nodes)
                .filter(nodeId => nodes[nodeId].type === 'tabs' && nodeId !== sourceNodeId)
                .map(nodeId => ({nodeId, container: host?.down({dockNodeId: nodeId})}))
                .filter(zone => zone.container);

        if (!zones.length) {
            return
        }

        let rects = await me.getDomRect(zones.map(zone => zone.container.id));

        if (me.isDestroyed) {
            return
        }

        let producerZones = zones
                .map((zone, index) => ({
                    nodeId     : zone.nodeId,
                    rect       : rects[index],
                    orientation: Object.values(nodes).find(node => node.type === 'split' && node.children?.includes(zone.nodeId))?.orientation ?? null
                }))
                .filter(zone => zone.rect),
            preview    = me.dockPreviewProducer?.produce({pointer: {x: clientX, y: clientY}, zones: producerZones, itemId, sourceNodeId}),
            descriptor = preview && previewToOperation(preview);

        if (descriptor) {
            let result = me.applyDockZoneOperation(descriptor);

            if (result && !result.errors?.length && result.document) {
                me.onDockZoneDocumentChange(result.document, descriptor, me)
            }
        }
    }

    /**
     * The view-sync half of the holder contract, called by every committing surface on success
     * (a splitter, a rail, the cross-zone drop, the Neural Link dock service): stores the committed
     * document and schedules the re-projection.
     *
     * Deferred one tick: commits fire synchronously from inside the committing surface's handler
     * (e.g. a splitter's `onDragEnd`), and reconciliation retires that surface with its old shell —
     * refreshing mid-handler would be a use-after-destroy on the rest of the handler. Every
     * projection is an atomic ownership transaction across the old shell, the staged shell, and
     * their closest common parent; chaining on {@link #refreshPromise} preserves that atomicity
     * across rapid commits. The one-use `addTab` correlation and the refresh options are captured
     * in THIS closure, so they are consumed by exactly one projection.
     * @param {Object} document The committed dock-zone document.
     * @param {Object|null} [descriptor=null] The semantic operation that produced `document`.
     * @param {Object|null} [source=null] The committing surface, when it identifies itself.
     */
    onDockZoneDocumentChange(document, descriptor=null, source=null) {
        let me                  = this,
            tabInsertDescriptor = me.getTabInsertProjectionDescriptor(document, descriptor),
            refreshOptions      = me.getRefreshOptions(descriptor, source);

        me.dockModel = document;

        me.refreshPromise = (me.refreshPromise || Promise.resolve())
            .then(() => me.timeout(0))
            .then(() => {
                if (!me.isDestroyed) {
                    return me.refreshDockWorkspace(tabInsertDescriptor, document, refreshOptions)
                }
            })
    }

    /**
     * Projects a committed document into the dock shell config, threading the instance-bound
     * reducer and view-sync onto every projected affordance, the consumer's resolvers, and the
     * hook-provided options. {@link #dockProjectionConfig} is merged onto the result.
     * @param {Object|null} [tabInsertDescriptor=null] One-use normalized `addTab` correlation.
     * @param {Function|null} [itemResolver=null] Item resolver for a staged projection (the
     *     reconciler's placeholder factory); `null` resolves through {@link #resolvePane}.
     * @param {Object} [document=this.dockModel] Committed document snapshot to project.
     * @returns {Object}
     */
    projectDockModel(tabInsertDescriptor=null, itemResolver=null, document=this.dockModel) {
        let me     = this,
            config = DockLayoutAdapter.project(document, {
                onDockCrossZoneDrop: me.onDockCrossZoneDrop.bind(me),
                ...me.getDockProjectionOptions(),
                applyDockZoneOperation   : me.applyDockZoneOperation.bind(me),
                onDockZoneDocumentChange : me.onDockZoneDocumentChange.bind(me),
                resolveComponentRef      : itemResolver || ((componentRef, item, itemId) => me.resolveProjectedPane(itemId, item)),
                resolveRevealComponentRef: (componentRef, item, itemId) => me.resolveRevealPane(itemId, item),
                tabInsertDescriptor
            });

        return me.dockProjectionConfig ? {...config, ...me.dockProjectionConfig} : config
    }

    /**
     * Re-projects a committed document through the identity-preserving reconciler: the outgoing
     * geometry is FLIP-snapshotted, the consumer's chrome hook runs, the staged shell is projected
     * with hidden placeholders, the reconciler hands every surviving pane and tab button into it,
     * and the FLIP play brackets the motion signal. Any motion failure lands the new layout
     * instantly — the try/catch guards motion, never truth.
     * @param {Object|null} [tabInsertDescriptor=null] One-use normalized `addTab` correlation
     *     captured by the commit that scheduled this refresh.
     * @param {Object} [document=this.dockModel] Committed document snapshot owned by this refresh.
     * @param {Object} [refreshOptions={}]
     * @param {Boolean} [refreshOptions.geometryOnly=false] Admit the reconciler's strict in-place
     *     geometry path.
     * @param {Boolean} [refreshOptions.retainTopology=false] Admit in-place item reconciliation on
     *     a proven-identical structural shell.
     * @returns {Promise<void>}
     * @protected
     */
    async refreshDockWorkspace(tabInsertDescriptor=null, document=this.dockModel, refreshOptions={}) {
        const
            me                 = this,
            host               = me.getDockHost(),
            flip               = Neo.main?.addon?.DockFlip,
            placeholders       = new Map(),
            {flipMarkerPrefix} = me,
            {geometryOnly=false, retainTopology=false} = refreshOptions;

        if (!host || !document) {
            return
        }

        me.beforeRefreshDockWorkspace(document, refreshOptions);

        try {
            await flip?.captureFirst({hostId: host.id, markerPrefix: flipMarkerPrefix})
        } catch (error) {/* instant landing */}

        if (me.isDestroyed) {
            return
        }

        const nextConfig = me.projectDockModel(tabInsertDescriptor, (componentRef, item, itemId) => {
            const placeholder = me.createProjectionPlaceholder(itemId, item, componentRef);

            placeholders.set(itemId, placeholder);

            return placeholder
        }, document);

        await DockProjectionReconciler.reconcileProjection({
            geometryOnly,
            host,
            nextConfig,
            placeholders,
            preserveItemIds: me.getPreservedItemIds(),
            resolveItem    : itemId => {
                const item = document.items[itemId];

                return DockLayoutAdapter.decorateProjectedItem(
                    me.resolveProjectedPane(itemId, item),
                    itemId,
                    item,
                    {
                        nodeId: tabInsertDescriptor?.tabsNodeId,
                        tabInsertDescriptor
                    }
                )
            },
            retainTopology,
            shellIndex: me.dockShellIndex
        });

        // FLIP phase 2: fire-and-forget — the addon self-waits for the swap, inverts and plays; the
        // counted motion signal brackets the awaited animation window. Gate on the CAPABILITY, not
        // on the addon's presence: a partial addon (a test double, a degraded main thread) must land
        // the layout instantly rather than throw after the document already committed.
        if (typeof flip?.play === 'function' && !me.isDestroyed) {
            let played;

            DockMotionSignal.enter(me);

            try {
                played = flip.play({hostId: host.id, markerPrefix: flipMarkerPrefix})
            } catch (error) {
                played = Promise.reject(error)
            }

            Promise.resolve(played)
                .catch(() => {})
                .finally(() => DockMotionSignal.leave(me))
        }
    }

    /**
     * Hook: resolves a catalog item to the live component or the plain config that renders it.
     * The default renders a titled placeholder pane — the model contract's recoverable fallback
     * for an item no consumer claimed — so a workspace is never silently empty; every consumer
     * overrides this with its own panes. A thrown error fails the projection loudly.
     * @param {String} itemId The stable workspace identity from the item catalog.
     * @param {Object} item The persisted item record (`componentRef`, `title`, `kind`, policy hints).
     * @returns {Object|Neo.component.Base}
     */
    resolvePane(itemId, item) {
        return {
            cls  : ['neo-dock-workspace-placeholder'],
            html : this.getPaneHeaderText(itemId, item, item?.componentRef),
            ntype: 'component'
        }
    }

    /**
     * The resolution the projection consumes: the consumer's {@link #resolvePane} result, stamped
     * with the FLIP marker.
     * @param {String} itemId
     * @param {Object} item The persisted item record.
     * @returns {Object|Neo.component.Base}
     * @protected
     */
    resolveProjectedPane(itemId, item) {
        return this.decorateFlipMarker(this.resolvePane(itemId, item), itemId)
    }

    /**
     * Hook: resolves a catalog item for an auto-hide reveal overlay. Defaults to
     * {@link #resolvePane}; override when a reveal must render differently from the tab flow.
     * @param {String} itemId
     * @param {Object} item The persisted item record.
     * @returns {Object|Neo.component.Base}
     */
    resolveRevealPane(itemId, item) {
        return this.resolvePane(itemId, item)
    }
}

export default Neo.setupClass(DockWorkspace);
