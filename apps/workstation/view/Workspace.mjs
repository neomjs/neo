import Container                           from '../../../src/container/Base.mjs';
import VesselWorkspace                     from './VesselWorkspace.mjs';
import Feed                                from '../store/Feed.mjs';
import FeedPane                            from './FeedPane.mjs';
import ResidentComponent                   from './ResidentComponent.mjs';
import StatusComponent                     from './StatusComponent.mjs';
import Scale                               from '../store/Scale.mjs';
import ScalePane                           from './ScalePane.mjs';
import DockDropIndicators                  from '../../../src/dashboard/dock/interaction/DropIndicators.mjs';
import PerspectiveLibrary                  from '../../../src/dashboard/dock/persistence/PerspectiveLibrary.mjs';
import TopologyLibrary                     from '../../../src/dashboard/dock/persistence/TopologyLibrary.mjs';
import DockPreview                         from '../../../src/dashboard/dock/interaction/Preview.mjs';
import DockProjectionReconciler            from '../../../src/dashboard/dock/projection/Reconciler.mjs';
import DockService                         from '../../../src/ai/client/DockService.mjs';
import WorkspaceDocument                   from '../../../src/dashboard/dock/model/WorkspaceDocument.mjs';
import WorkspaceController                 from './WorkspaceController.mjs';
import Persistence                         from '../../../src/dashboard/dock/model/Persistence.mjs';
import StateProvider                       from '../../../src/state/Provider.mjs';
import TourToolbar                         from './TourToolbar.mjs';
import TopologyToolbar                     from './TopologyToolbar.mjs';
import TransactionManager                  from '../../../src/manager/Transaction.mjs';
import {initialTourState, initialDocument} from '../tour/denseWorkstation.mjs';
import '../../../src/button/Base.mjs';
import '../../../src/tab/Container.mjs';
import '../../../src/toolbar/Base.mjs';

/**
 * @summary Workstation: the dense, themed, living-data workstation showcase.
 *
 * The workspace owns one committed `dockZone.v1` document, one root StateProvider, two
 * provider-created Store<Model> instances; the Feed store owns its one producer. Pane instances are cached
 * and parked across coarse dock projections, so split/return/overflow operations preserve
 * the owning grid and store identities. Built-in grid and Sparkline families own pooling,
 * hydration, and OffscreenCanvas registration; this class owns only composition and story.
 *
 * @class Workstation.view.Workspace
 * @extends Workstation.view.VesselWorkspace
 */
class Workspace extends VesselWorkspace {

    static config = {
        /**
         * @member {String} className='Workstation.view.Workspace'
         * @protected
         */
        className: 'Workstation.view.Workspace',
        /** @member {Neo.controller.Component} controller */
        controller: WorkspaceController,
        /**
         * @member {String[]} additionalThemeFiles
         */
        additionalThemeFiles: [
            'Workstation.view.Viewport',
            'Neo.dashboard.Container',
            'Workstation.view.Workspace'
        ],
        /**
         * @member {String[]} cls
         */
        cls: ['workstation-workspace'],
        /**
         * The projection mounts into the dock-host child built in `construct` — the preview
         * renderer and drop indicators live beside the projected shell as persistent siblings.
         * @member {String|null} dockHostReference='dock-host'
         */
        dockHostReference: 'dock-host',
        /**
         * @member {String} flipMarkerPrefix='workstation-pane-'
         */
        flipMarkerPrefix: 'workstation-pane-',
        /**
         * @member {Object} layout
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * The shipped arrangement, declared rather than supplied: `construct` keeps supplying the saved
         * main document, so `dock.perspective.modified` reads live-versus-shipped while a torn-out
         * pane stays owned by its vessel.
         * @member {Object} perspectives={shipped: initialDocument}
         */
        perspectives: {shipped: initialDocument},
        /**
         * @member {String} activePerspective='shipped'
         */
        activePerspective: 'shipped',
        /**
         * The preview design-language switch (the design-exploration selector): the value maps to a
         * `neo-preview-lang-<value>` modifier cls on the dock host, so skin variants swap live — on
         * the workspace config, from a tour script, or from the console — without touching behavior.
         * `null` renders the default affordance family.
         * @member {String|null} previewLanguage_=null
         * @reactive
         */
        previewLanguage_: null,
        /**
         * The one root provider owns both stores; cached panes receive these exact instances.
         * @member {Object} stateProvider
         */
        stateProvider: {
            module: StateProvider,
            // `topology.additionalWindows` is DERIVED here: {@link #syncTopologyState} publishes it from
            // the two places a committed topology arrives, and the seed only makes the key exist before
            // the first publish. The departure from the shipped arrangement is not derived here — the
            // engine publishes `dock.perspective.modified` on this same provider.
            data  : {topology: {additionalWindows: 0}, tour: initialTourState},
            stores: {
                feed : {module: Feed},
                scale: {module: Scale}
            }
        }
    }

    /**
     * @member {Neo.ai.client.DockService|null} dockService=null
     */
    dockService = null
    /**
     * The named-layout home for the Neural Link perspective trio — the client DockService
     * resolves `holder.perspectiveStore`, so instantiating it here activates capture (stored),
     * list, and restore for this one Workspace. Restore rides the store's fail-closed
     * `loadPerspective` plus this view's `onDockZoneDocumentChange`
     * commit seam — the same path `execute_dock_operation` commits through.
     * @member {Neo.dashboard.dock.persistence.PerspectiveLibrary|null} perspectiveStore=null
     */
    perspectiveStore = null
    /**
     * One Group's durable keyed records, independent of the single-Workspace perspective library.
     * @member {Neo.dashboard.dock.persistence.TopologyLibrary|null} topologyLibrary=null
     */
    topologyLibrary = null

    /**
     * @member {Object} paneCache={}
     * @protected
     */
    paneCache = {}

    /**
     * @summary How many workspaces stand beside the main one: the multi-window fact the engine does
     * not publish.
     *
     * @description **The unit is the whole keyed topology, not this window's document.** What gets
     * persisted and restored is {@link #getDockTopologyWorkspaces} — every registered workspace
     * keyed by identity — because the thing a reader expects back when they open the app URL is
     * their multi-window setup, not one window's panes. Window geometry needs no separate count:
     * popup placement hints are measured relative to main, so any hint worth comparing already
     * implies a second workspace.
     *
     * Whether main left the shipped arrangement is not measured here: the engine compares it with the
     * declared `shipped` perspective and publishes `dock.perspective.modified`, so a pane torn out
     * into a second window reads as both a departure and a window.
     * @returns {{additionalWindows: Number}}
     * @protected
     */
    readTopologyState() {
        const keys = Object.keys(this.getDockTopologyWorkspaces());

        return {additionalWindows: keys.filter(key => key !== Workspace.MAIN_WORKSPACE_ID).length}
    }

    /**
     * @summary A valid document for a workspace that owns no panes.
     *
     * @description The empty **edge-root** shape, not an emptied tree. Detaching a workspace's last
     * pane prunes its final tabs node and leaves `root` pointing at a node that no longer exists, so
     * the result is refused; an edge zone with no zones validates and projects as an empty container.
     * Established by @neo-gpt-emmy's counterexample after I had reported the pruned shape as proof
     * that no valid empty document existed.
     * @returns {Object}
     */
    static createEmptyWorkspaceDocument() {
        return {schema: 'neo.dock.zone.v1', root: 'root', items: {}, nodes: {root: {type: 'edge-zone', zones: {}}}}
    }

    /**
     * @summary Returns the workspace to the arrangement the app ships with, in one undoable commit.
     *
     * @description The shipped document is committed for `main`, and every other workspace gives back
     * the panes `initialDocument` owns — in the SAME write. Both halves matter:
     *
     * - **Give the panes back, do not just restore main.** A pane torn into a window is still listed
     *   by `initialDocument`, so restoring that document beside an untouched popup would leave it
     *   owned twice — an invalid topology `Persistence` refuses to capture, making a reset that
     *   reports success unpersistable.
     * - **A workspace left with nothing becomes the empty edge-root, not a pruned tree.** Detaching
     *   a workspace's last pane prunes its final tabs node and leaves `root` dangling; replacing the
     *   document with `{root: 'root', items: {}, nodes: {root: {type: 'edge-zone', zones: {}}}}`
     *   validates and projects as an empty container.
     *
     * **Every participant is retained, and that is what makes the reset undoable.** Unregistering
     * one would happen outside the transaction, so `undo` could not restore it: the commit would
     * roll back to a document whose panes lived in a workspace that no longer exists, and the torn-out
     * pane would end up owned by nobody. Keeping every key in the write keeps the whole reset inside
     * the one history row that reverses it.
     *
     * Committing through the Group rather than assigning `dockModel` is what makes the result
     * durable: a direct field write fires no commit event, so the auto-save never runs and the old
     * topology returns on the next reload. `WorkspaceSet.write` appends, so this is one ordinary
     * history row — which is why it needs no confirmation ceremony.
     *
     * Not `startBlankRoot()`: that admits `{topologyIdentity: {}}` for the load-failure path, and
     * blank is not default.
     * @returns {Promise<{errors: String[], reset: Boolean, transactionId: String|null}>}
     */
    async resetTopology() {
        const me         = this,
              workspaces = me.getDockTopologyWorkspaces();

        // Not a defensive guard: with no main workspace registered there is no entry for the shipped
        // document to replace, so the commit would ADD a key and be refused for naming something
        // unregistered. Refusing here names the actual cause instead of the seam's generic shape.
        if (!Object.hasOwn(workspaces, Workspace.MAIN_WORKSPACE_ID)) {
            return {errors: ['the main workspace is not registered'], reset: false, transactionId: null}
        }

        const shipped  = new Set(Object.keys(initialDocument.items ?? {})),
              next     = {[Workspace.MAIN_WORKSPACE_ID]: WorkspaceDocument.clone(initialDocument)},
              refusals = [];

        for (const [workspaceKey, document] of Object.entries(workspaces)) {
            if (workspaceKey === Workspace.MAIN_WORKSPACE_ID) continue;

            const owned   = Object.keys(document?.items ?? {}),
                  reclaim = owned.filter(itemId => shipped.has(itemId));

            if (!reclaim.length) {
                next[workspaceKey] = document;
                continue
            }

            if (reclaim.length === owned.length) {
                next[workspaceKey] = Workspace.createEmptyWorkspaceDocument();
                continue
            }

            // Partial reclaim: the same two steps `Operations.transferItem` performs on its source
            // side, then through the shared fail-closed commit so the result is normalized and
            // validated rather than assumed well-formed.
            const working = WorkspaceDocument.clone(document);

            reclaim.forEach(itemId => {
                WorkspaceDocument.detachFromTabs(working, itemId);
                delete working.items[itemId]
            });

            const result = WorkspaceDocument.commit(document, working);

            result.errors.length ? refusals.push(...result.errors) : next[workspaceKey] = result.document
        }

        // A workspace that cannot give a shipped pane back is a refusal, not something to commit
        // around: committing the rest would restore main while leaving the duplicate in place.
        if (refusals.length) return {errors: refusals, reset: false, transactionId: null};

        const {errors, transactionId} = await me.commitDockTopologyWorkspaces(next,
            {name: 'default', provenance: {origin: 'human'}});

        // Bound participants settle their own projections. Headless owners retain the committed
        // document, but their rendering waits for a future mount and cannot gate this reset.
        errors.length || await Promise.all([
            me.refreshPromise,
            ...me.getPopupStates().filter(state => state.host?.windowId != null).map(state => state.host.refreshPromise)
        ].map(promise => Promise.resolve(promise).catch(() => {})));

        return {errors, reset: !errors.length, transactionId: transactionId ?? null}
    }

    /**
     * @summary Publishes the first window count once the provider is resolvable.
     *
     * Boot is the second place a committed topology arrives and the only one the Group's document
     * setter cannot see: `construct` creates the popup workspaces of a persisted topology, so without
     * this the readout counts none of them until the next commit.
     */
    onConstructed() {
        super.onConstructed();
        this.syncTopologyState()
    }

    /**
     * @summary Republishes the window count after a Group commit has settled.
     *
     * @description Presentation runs after the queue releases and cannot reject the commit, whereas
     * the participant's document setter runs inside the adopt phase where a throw takes the whole
     * transaction down. A status readout must never be able to fail the commit it reports on.
     *
     * It overrides the class method rather than wrapping `registerMainWorkspace`'s `project`
     * callback, because that registration is deliberately `.call()`-able onto a plain dock Workspace.
     * Undo and redo project through here too, so a window a commit adds or returns is counted with
     * no path of its own.
     *
     * @param {Object} context The Group participant's projection context.
     * @returns {Promise} This projection's outcome.
     */
    projectDockCommit(context) {
        const projection = super.projectDockCommit(context);

        this.syncTopologyState();

        return projection
    }

    /**
     * @summary Publishes {@link #readTopologyState} for the topology bar's readout.
     *
     * Written by path rather than by replacing the `topology` object, so a key added beside it later
     * cannot be silently dropped by this publisher.
     * @protected
     */
    syncTopologyState() {
        const me = this;

        if (me.isDestroyed || !me.getStateProvider()) return;

        me.setState({'topology.additionalWindows': me.readTopologyState().additionalWindows})
    }

    /**
     * @summary Creates all cold semantic owners before constructing their presentation.
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        me.dockModel         = WorkspaceDocument.clone(me.initialTopology?.workspaces[Workspace.MAIN_WORKSPACE_ID] ?? initialDocument);
        me.dockService       = Neo.create(DockService, {});
        me.perspectiveStore  = Neo.create(PerspectiveLibrary, {declaredPerspectives: () => me.declaredPerspectives()});
        me.topologyLibrary ??= Neo.create(TopologyLibrary, {
            collection: Persistence.createTopologyCollection([], {activeLayoutId: null}).collection
        });
        // A saved record may equal the shipped perspective but never take its name, whoever built the library.
        me.topologyLibrary.declaredPerspectives ??= () => me.declaredPerspectives();
        me.initializeWorkspaceTopology();

        me.getStateProvider().getStore('feed').appendBatch(25);

        me.add([{module: TourToolbar}, {module: StatusComponent}, {module: TopologyToolbar, workspace: me}, {
            module: Container,
            cls   : ['workstation-dock-host', 'neo-dashboard', 'neo-dashboard-dock-query-host'],
            flex  : 1,
            // The projection child is index 0 and the ONLY child the shared reconciler stages;
            // the preview renderer + indicator menu are PERSISTENT siblings (absolute overlays
            // via the skin) — object permanence across every re-projection.
            items: [me.projectDockModel(), {
                module   : DockPreview,
                reference: 'dock-preview'
            }, {
                module   : DockDropIndicators,
                reference: 'drop-indicators'
            }],
            layout   : {ntype: 'fit'},
            reference: 'dock-host'
        }]);

        me.initializeVesselResources();

        // The reactive afterSet fires before the dock host exists during construction —
        // re-apply the active language now that the host is live (both orders converge).
        me.previewLanguage && me.afterSetPreviewLanguage(me.previewLanguage, null);

        me.syncThemeToggle(me.theme);
        me.getStateProvider().getStore('feed').start()
    }

    /**
     * Swaps the preview design-language modifier cls on the dock host. Fires before the host
     * exists during construction — the construct-time add path re-applies the active value once
     * the host is live, so both orders resolve to the same cls state.
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetPreviewLanguage(value, oldValue) {
        let host = this.getReference('dock-host');

        if (host) {
            oldValue && host.removeCls(`neo-preview-lang-${oldValue}`);
            value    && host.addCls(`neo-preview-lang-${value}`)
        }
    }

    /**
     * The current projection shell's instance id — the discriminator between the reconciler's
     * stable-topology fast path (shell retained) and the staged full path (shell replaced).
     * Pane instances AND their DOM survive either path; only the shell identity flips.
     * @returns {String|null}
     */
    getShellIdentity() {
        return this.getReference('dock-host')?.items?.[0]?.id ?? null
    }

    /**
     * Returns one cached pane identity for Neural Link continuity receipts.
     * @param {String} itemId
     * @returns {String|null}
     */
    getPaneIdentity(itemId) {
        let me   = this,
            pane = me.paneCache[itemId],
            item = me.dockModel.items[itemId];

        if (pane && !pane.isDestroyed) return pane.id;

        if (!item) {
            for (const state of me.getPopupStates()) {
                item = state.document?.items?.[itemId];

                if (item) break
            }
        }

        return item ? me.resolvePane(itemId, item).id : null
    }

    /**
     * @summary The topology collection belongs to the Group library, including writes from DockService.
     * @returns {Object|null}
     */
    get topologyCollection() {
        return this.topologyLibrary?.collection ?? null
    }

    /**
     * @summary Routes a validated collection adoption through its one owner.
     * @param {Object} value
     */
    set topologyCollection(value) {
        this.topologyLibrary.collection = value
    }

    /**
     * @summary Captures the full keyed composition under its explicit active layout identity.
     * The record's declared origin is the accepted-write identity, never the collection's pointer.
     * @param {String} [layoutId] Defaults to the collection's save pointer, or the new-root name `default`.
     * @returns {Object} The finite topology producer receipt.
     */
    captureTopology(layoutId=this.topologyCollection?.activeLayoutId ?? 'default') {
        const me       = this,
              selected = me.topologyCollection?.topologies?.[layoutId];

        return Persistence.captureTopologyPerspective(me.getDockTopologyWorkspaces(), {
            layoutId,
            metadata      : {...selected?.metadata, ...me.perspectiveProvenance()},
            placementHints: me.getPlacementHints(),
            title         : selected?.title ?? layoutId,
            ...(selected && Object.hasOwn(selected, 'revision') && {revision: selected.revision}),
            ...(selected && Object.hasOwn(selected, 'perspectiveName') && {perspectiveName: selected.perspectiveName})
        })
    }

    /**
     * @summary Saves a named multi-workspace composition and waits for durable acknowledgement.
     *
     * A command on the component, beside the state it reads — the keyed documents, the placement
     * hints, the library and the Group — and the address the Neural Link already uses. The
     * controller routes the toolbar's click here through `onSaveTopology`, which names no layout.
     * @param {String} [layoutId]
     * @returns {Promise<Object>}
     */
    async saveTopology(layoutId) {
        const me    = this,
              group = TransactionManager.get(me.topologyGroupId);

        if (!group || me.isDestroyed) return {persisted: false, current: false, errors: ['workspace is no longer open']};

        const queue = group.queue;

        await queue;

        if (TransactionManager.get(group.id) !== group || group.queue !== queue) {
            return {persisted: false, current: false, errors: ['workspace changed while waiting to save']}
        }

        const {topology, errors} = me.captureTopology(layoutId);

        if (errors.length) return {persisted: false, errors};

        const saved = me.topologyLibrary.save(topology, {activate: true, replace: true});

        if (saved.errors.length) return {persisted: false, errors: saved.errors};

        const result  = await me.topologyLibrary.persist(),
              current = me.captureTopology(topology.layoutId);

        return {
            ...result,
            current: result.current && group.queue === queue && !current.errors.length &&
                JSON.stringify(current.topology) === JSON.stringify(topology)
        }
    }

    /**
     * @summary Lets the Group library own the reconnect lease and durable disposal of this root.
     * @returns {Boolean}
     */
    attachTopologyLibrary() {
        const me = this;

        return me.topologyLibrary.attachGroup({
            capture: () => me.captureTopology(),
            dispose: () => me.destroy(),
            groupId: me.topologyGroupId,
            manager: TransactionManager
        })
    }

    /**
     * Assigns a new trend array to a registered visible scale record and refreshes the
     * viewport pool. Coarse dock projection preserves cached pane identities, while a resized
     * viewport pool can allocate new Canvas cells whose registration settles asynchronously;
     * the bounded wait observes that lifecycle fact instead of guessing with a screenplay delay.
     * @param {String|null} [componentId=null] Optional exact visible Sparkline identity.
     * @returns {Promise<Object|Boolean>}
     */
    async pulseScaleSparkline(componentId=null) {
        let pane = this.paneCache.scale,
            sparkline,
            record;

        for (let attempt = 0; attempt < 40; attempt++) {
            if (componentId) {
                sparkline = Neo.getComponent(componentId)
            } else {
                sparkline = pane?.body?.items.flatMap(row => Object.values(row.components || {}))
                    .find(candidate => candidate.offscreenRegistered && candidate.record)
            }

            record = sparkline?.record;

            if (record && sparkline.offscreenRegistered) break;

            await this.timeout(50)
        }

        if (!record || !sparkline?.offscreenRegistered) return false;

        let signal = record.trend.at(-1) ?? 50;

        record.trend = Array.from({length: 12}, (_, point) => {
            signal = Math.max(8, Math.min(92, signal + ((this.getStateProvider().getStore('feed').sequence + point * 5) % 9) - 4));
            return signal
        });
        pane?.body?.createViewData(false, true);

        return {componentId: sparkline.id, recordId: record.id, values: [...record.trend]}
    }

    /**
     * @summary Returns a serializable identity receipt for one live logical tab surface.
     * @param {String} nodeId
     * @returns {Object|null}
     */
    getTabChromeIdentity(nodeId) {
        const
            shell = this.getReference('dock-host')?.items[0],
            tab   = DockProjectionReconciler.collectProjectedTabs(shell).get(nodeId);

        if (!tab) return null;

        const
            bar     = tab.getTabBar(),
            body    = tab.getCardContainer(),
            plugin  = bar.getPlugin('tab-overflow'),
            buttons = {};

        Object.entries(this.paneCache).forEach(([itemId, pane]) => {
            const index = body.items.indexOf(pane);

            index > -1 && (buttons[itemId] = bar.items[index]?.id || null)
        });

        return {
            bodyId           : body.id,
            buttons,
            containerId      : tab.id,
            headerId         : bar.id,
            overflowControlId: plugin?.control?.id || null,
            overflowPluginId : plugin?.id || null,
            stripId          : tab.getTabStrip().id
        }
    }

    /**
     * Returns the model-owned tab label used by both staged projection shells and live panes.
     * The shared resolver keeps a placeholder-built tab bar structurally identical to the one
     * a live pane would have produced, including natural widths for the overflow plugin.
     * @param {String} itemId
     * @param {Object} item
     * @returns {String}
     */
    getPaneHeaderText(itemId, item) {
        return {
            audit    : 'Audit',
            commits  : 'Commits',
            graph    : 'Graph',
            inspector: 'Inspector',
            metrics  : 'Metrics',
            queues   : 'Queues',
            scale    : '100k Matrix'
        }[itemId] ?? item?.title ?? itemId
    }

    /**
     * @summary Creates one view; data panes borrow the provider's stores.
     * @param {String} itemId
     * @param {Object} item
     * @returns {Neo.component.Base}
     * @protected
     */
    createPane(itemId, item) {
        const provider = this.getStateProvider();
        if (itemId === 'scale') return Neo.create(ScalePane, {store: provider.getStore('scale')});
        if (itemId === 'feed') return Neo.create(FeedPane, {store: provider.getStore('feed')});
        return Neo.create(ResidentComponent, {itemId, title: item?.title ?? itemId})
    }

    /**
     * @summary Applies the model-owned presentation shared by cached and fresh panes.
     * @param {Neo.component.Base} pane
     * @param {String} itemId
     * @param {Object} item
     * @returns {Neo.component.Base}
     * @protected
     */
    configurePane(pane, itemId, item) {
        // The adapter can decorate plain configs, but this showcase deliberately returns LIVE
        // instances. Carry the canonical tab header on the instance itself so tab.Container and
        // Neo.tab.plugin.Overflow receive a meaningful title.
        pane.header = {text: this.getPaneHeaderText(itemId, item)};
        pane.addCls(`workstation-pane-${itemId}`);

        return pane
    }

    /**
     * Returns the one live pane instance for an item id.
     * @param {String} itemId
     * @param {Object} item
     * @returns {Neo.component.Base}
     */
    resolvePane(itemId, item) {
        let me    = this,
            cache = me.paneCache,
            pane  = cache[itemId];

        if (!pane || pane.isDestroyed) {
            pane = cache[itemId] = me.createPane(itemId, item)
        }

        return me.configurePane(pane, itemId, item)
    }

    /**
     * @summary Creates a replacement without publishing it to the live pane cache.
     * @param {String} itemId
     * @param {Object} item
     * @returns {Neo.component.Base}
     */
    resolveFreshPane(itemId, item) {
        return this.configurePane(this.createPane(itemId, item), itemId, item)
    }

    /**
     * @summary Adopts only the exact replacement committed by the base recreate transaction.
     * @param {String} itemId
     * @param {Neo.component.Base} livePane
     * @param {Object} [options]
     * @returns {{errors:String[],pane:?Neo.component.Base}|null}
     * @protected
     */
    recreateDockPane(itemId, livePane, options) {
        const result = super.recreateDockPane(itemId, livePane, options);

        if (result?.pane && result.errors.length === 0) {
            this.paneCache[itemId] = result.pane
        }

        return result
    }

    /**
     * Applies the theme to every render target of this app, not only to the workspace.
     *
     * A theme in Neo is a CSS class an ancestor carries, and `afterSetTheme` writes it onto the
     * component it was set on — so setting it here reaches this window's subtree and nothing else.
     * A tear-out vessel is a SECOND document driven by the same App Worker, whose only theme
     * carrier is the class the Stylesheet addon puts on its `body` at boot. Nothing propagates a
     * later flip across documents, so an open vessel stayed on the theme it was born with while
     * the workspace beside it changed.
     *
     * Fanning reaches the viewport because that is where this app's token bridge lives, so a vessel
     * restyles from its own theme class rather than inheriting a stale one from its boot-time body.
     *
     * `Neo.appsByName[appName]` rather than `Neo.apps`: the worker-global registry is keyed by
     * window and can carry more than one app name (`controller/Application.mjs` indexes both), so
     * iterating it would let a Workstation toggle retheme an unrelated co-hosted app. The
     * name-keyed registry is the same set restricted to this app's own render targets — one window
     * today, one per open vessel tomorrow.
     * @param {String} theme
     * @returns {String}
     */
    setWorkspaceTheme(theme) {
        const me = this;

        me.theme = theme;
        me.syncThemeToggle(theme);

        (Neo.appsByName?.[me.appName] || []).forEach(app => {
            const view = app?.mainView;

            view && view !== me && view.theme !== theme && (view.theme = theme)
        });

        return theme
    }

    /**
     * Keeps the one theme control phrased as the available action.
     * @param {String} theme
     */
    syncThemeToggle(theme) {
        const
            button  = this.getReference('theme-toggle'),
            isLight = theme === 'neo-theme-neo-light';

        if (button) {
            button.iconCls = isLight ? 'fa fa-moon' : 'fa fa-sun';
            button.text    = isLight ? 'Dark mode' : 'Light mode'
        }
    }

    /**
     * @summary Flips the workspace theme, revealed from the pointer where the browser supports it.
     *
     * The flip happens AFTER the awaited call, deliberately: `startViewTransition()` resolves once
     * the transition has started, and `delay` is the window this method has to mutate the DOM
     * before the new state is captured. Flipping first would let the transition capture the
     * already-changed DOM as both states and the reveal would play over no visible difference.
     *
     * The reveal is decorative, and that holds for every way it can fail: no View Transition API
     * returns false, a failed reveal is caught inside the engine, and a rejected remote round trip
     * is caught here. The flip runs in all three cases, so a browser or a transport that cannot
     * deliver the animation still behaves exactly as before.
     *
     * Raw pointer coordinates go to the engine rather than a radius computed here: the App worker
     * knows where the pointer was, not how a pseudo-element resolves a length, so the unit decision
     * stays in `DomUtils.createRevealAnimation()` instead of gaining a copy per app.
     * @param {Object} [data] The click event. Absent coordinates yield NO circular reveal:
     * `createRevealAnimation()` returns null, the transition still runs as the browser's default
     * cross-fade, and the flip is unaffected. Nothing here throws on a missing event
     * @returns {Promise<String>} The newly applied theme.
     */
    async toggleWorkspaceTheme(data) {
        const me = this;

        // The catch is the decorative promise kept. The engine resolves rather than rejects — no API
        // returns false, a failed reveal is caught inside — but this is a REMOTE method, and the
        // transport can reject for reasons the callee never sees. Without this, a rejected round trip
        // would skip the flip entirely and leave the button doing nothing at all, which is a worse
        // outcome than the missing animation it was supposed to guard.
        await Neo.main.DomAccess.startViewTransition({
            delay   : 100,
            reveal  : {x: data?.clientX, y: data?.clientY},
            windowId: me.windowId
        }).catch(() => {});

        return me.setWorkspaceTheme(me.theme === 'neo-theme-neo-light'
            ? 'neo-theme-neo-dark'
            : 'neo-theme-neo-light')
    }

    /**
     * @summary Releases content owned by this composition after vessel resources have retired.
     * The provider's own teardown destroys its created stores; passed-in stores remain borrowed.
     * @protected
     */
    destroyWorkspaceContent() {
        this.dockService?.destroy();
        this.perspectiveStore?.destroy();
        this.topologyLibrary?.destroy();
        Object.values(this.paneCache).forEach(pane => pane?.isDestroyed || pane?.destroy?.());
        this.paneCache = {}
    }
}

export default Neo.setupClass(Workspace);
