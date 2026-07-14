import Component                                from '../../../src/component/Base.mjs';
import Container                                from '../../../src/container/Base.mjs';
import Feed                                     from '../store/Feed.mjs';
import FeedPane                                 from './FeedPane.mjs';
import Scale                                    from '../store/Scale.mjs';
import ScalePane                                from './ScalePane.mjs';
import DockLayoutAdapter                        from '../../../src/dashboard/DockLayoutAdapter.mjs';
import DockMotionSignal                         from '../../../src/dashboard/DockMotionSignal.mjs';
import DockProjectionReconciler                 from '../../../src/dashboard/DockProjectionReconciler.mjs';
import DockService                              from '../../../src/ai/client/DockService.mjs';
import DockZoneModel                            from '../../../src/dashboard/DockZoneModel.mjs';
import StateProvider                            from '../../../src/state/Provider.mjs';
import TourRunner                               from '../../../src/ai/client/TourRunner.mjs';
import {workstationTourScript, initialDocument} from '../tour/denseWorkstation.mjs';
import '../../../src/button/Base.mjs';
import '../../../src/tab/Container.mjs';
import '../../../src/toolbar/Base.mjs';

/**
 * Target-owned narrative data for Workstation's lightweight resident panes. These are presentation
 * facts only: stores and dock state remain owned by their existing authorities.
 * @type {Object}
 */
const paneStories = Object.freeze({
    activity : {detail: '12 residents reporting', icon: 'fa-wave-square', kicker: 'SYSTEM PULSE',      metric: 'LIVE'},
    alerts   : {detail: '2 require attention',    icon: 'fa-bell',        kicker: 'PRIORITY SIGNALS', metric: '07'},
    audit    : {detail: 'all gates evidenced',    icon: 'fa-shield-alt',  kicker: 'EVIDENCE CHAIN',   metric: '100%'},
    builds   : {detail: '8 parallel checks',      icon: 'fa-cubes',       kicker: 'BUILD FABRIC',     metric: '8/8'},
    commits  : {detail: '5 branches converging',  icon: 'fa-code-branch', kicker: 'CHANGE STREAM',    metric: '+42'},
    console  : {detail: 'semantic ops ready',     icon: 'fa-terminal',    kicker: 'COMMAND PLANE',    metric: 'ARMED'},
    deploys  : {detail: '3 regions synchronized', icon: 'fa-rocket',      kicker: 'FLIGHT DECK',      metric: '03'},
    files    : {detail: 'workspace graph indexed',icon: 'fa-folder-tree', kicker: 'SOURCE SURFACE',   metric: '25K'},
    graph    : {detail: 'dependency edges awake', icon: 'fa-project-diagram', kicker: 'DEPENDENCY GRAPH',  metric: '20K+'},
    inspector: {detail: 'selection follows focus',icon: 'fa-crosshairs',  kicker: 'CONTEXT LENS',     metric: 'LOCK'},
    logs     : {detail: 'zero fatal events',      icon: 'fa-align-left',  kicker: 'STRUCTURED LOGS',  metric: '0 ERR'},
    memory   : {detail: 'pressure stays bounded', icon: 'fa-brain',       kicker: 'MEMORY TELEMETRY',      metric: 'SYNC'},
    metrics  : {detail: 'system envelope stable', icon: 'fa-chart-line',  kicker: 'LIVE METRICS',     metric: '99.9'},
    queues   : {detail: '18 lanes in motion',     icon: 'fa-stream',      kicker: 'TASK PRESSURE',    metric: '18'},
    runtime  : {detail: 'all residents responsive', icon: 'fa-heartbeat', kicker: 'RUNTIME HEALTH',  metric: 'GREEN'},
    security : {detail: 'continuous policy scan', icon: 'fa-lock',        kicker: 'TRUST ENVELOPE',  metric: 'CLEAR'},
    topology : {detail: '20 panes · one identity',icon: 'fa-sitemap',     kicker: 'WORKSPACE SHAPE',  metric: '20'},
    traces   : {detail: '4 active continuations', icon: 'fa-route',       kicker: 'TRACE FABRIC',     metric: '04'}
});

/**
 * @summary Workstation: the dense, themed, living-data workstation showcase.
 *
 * The workspace owns one committed `dockZone.v1` document, one root StateProvider, two
 * provider-created Store<Model> instances, and one feed timer. Pane instances are cached
 * and parked across coarse dock projections, so split/return/overflow operations preserve
 * the owning grid and store identities. Built-in grid and Sparkline families own pooling,
 * hydration, and OffscreenCanvas registration; this class owns only composition and story.
 *
 * @class Workstation.view.Workspace
 * @extends Neo.container.Base
 */
class Workspace extends Container {
    /**
     * Five records every 500ms: the declared 10-records/sec producer contract.
     * @member {Number} FEED_BATCH_SIZE=5
     * @static
     */
    static FEED_BATCH_SIZE = 5
    /**
     * @member {Number} FEED_INTERVAL_MS=500
     * @static
     */
    static FEED_INTERVAL_MS = 500

    static config = {
        /**
         * @member {String} className='Workstation.view.Workspace'
         * @protected
         */
        className: 'Workstation.view.Workspace',
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
         * @member {Object} layout
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * The one root provider owns both stores; cached panes receive these exact instances.
         * @member {Object} stateProvider
         */
        stateProvider: {
            module: StateProvider,
            stores: {
                feed : {module: Feed},
                scale: {module: Scale}
            }
        }
    }

    /**
     * @member {Object|null} dockModel=null
     */
    dockModel = null
    /**
     * @member {Neo.ai.client.DockService|null} dockService=null
     */
    dockService = null
    /**
     * @member {Neo.ai.client.TourRunner|null} tourRunner=null
     */
    tourRunner = null
    /**
     * @member {Object} paneCache={}
     * @protected
     */
    paneCache = {}
    /**
     * @member {Promise|null} refreshPromise=null
     * @protected
     */
    refreshPromise = null
    /**
     * Number of coalesced producer batches appended over this workspace lifetime.
     * @member {Number} feedBatchCount=0
     */
    feedBatchCount = 0
    /**
     * Monotonic feed key; padded string ordering keeps newest-first stable.
     * @member {Number} feedSequence=0
     */
    feedSequence = 0
    /**
     * Serialized surface-cue chain for the current visible tour.
     * @member {Promise} cuePromise
     * @protected
     */
    cuePromise = Promise.resolve()
    /**
     * Hosting-surface cue promises indexed by the runner's scene/step identity. `stepSettled`
     * consumes each entry after runner-owned work succeeds; the map never becomes runner state.
     * @member {Map<String,Promise>} cueSettlements
     * @protected
     */
    cueSettlements = new Map()
    /**
     * Serialized, paint-confirmed tour progress. `TourRunner.stepSettled` proves runner-owned
     * work only, so this local projection additionally waits for its cue and dock refresh before
     * exposing progress to the viewer.
     * @member {Promise} progressPromise
     * @protected
     */
    progressPromise = Promise.resolve()
    /**
     * Fail-closed surface-cue errors for the current visible tour.
     * @member {String[]} cueErrors
     * @protected
     */
    cueErrors = []
    /**
     * Ordered observable receipts returned by the screenplay's surface cues.
     * @member {Object[]} cueReceipts
     * @protected
     */
    cueReceipts = []
    /**
     * The most recent fully settled visible-tour result.
     * @member {Object|null} lastTourReceipt=null
     */
    lastTourReceipt = null
    /**
     * Five records every 500ms = an honest 10 records/sec.
     * @member {Number|null} #feedIntervalId=null
     * @private
     */
    #feedIntervalId = null

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        me.dockModel   = DockZoneModel.clone(initialDocument);
        me.dockService = Neo.create(DockService, {});
        me.tourRunner  = Neo.create(TourRunner, {
            componentId: me.id,
            dockService: me.dockService,
            mode       : 'demo',
            script     : workstationTourScript
        });

        me.tourRunner.on({
            beat       : me.onTourBeat,
            complete   : me.onTourComplete,
            error      : me.onTourError,
            scene      : me.onTourScene,
            stepSettled: me.onTourStepSettled,
            scope      : me
        });

        me.appendFeedBatch(25);

        me.add([me.createTourBar(), me.createStatusBar(), {
            module   : Container,
            cls      : ['workstation-dock-host', 'neo-dashboard', 'neo-dashboard-dock-query-host'],
            flex     : 1,
            items    : [me.projectDockModel()],
            layout   : {ntype: 'fit'},
            reference: 'dock-host'
        }]);

        me.updateStatusBar();
        me.#feedIntervalId = setInterval(
            () => me.appendFeedBatch(Workspace.FEED_BATCH_SIZE),
            Workspace.FEED_INTERVAL_MS
        )
    }

    /**
     * @param {Object} descriptor
     * @returns {{document:Object, errors:String[]}}
     */
    applyDockZoneOperation(descriptor) {
        return DockZoneModel.applyOperation(this.dockModel, descriptor)
    }

    /**
     * Adds one coalesced feed batch, then trims the capped tail in one splice.
     * @param {Number} amount
     * @returns {Number} Current feed count.
     */
    appendFeedBatch(amount=Workspace.FEED_BATCH_SIZE) {
        let me      = this,
            store   = me.getStateProvider().getStore('feed'),
            records = [],
            now     = new Date();

        for (let index = 0; index < amount; index++) {
            const sequence = ++me.feedSequence,
                  base     = (sequence * 13) % 101;

            records.push({
                id       : `feed-${String(sequence).padStart(8, '0')}`,
                name     : `runtime.event.${sequence % 17}`,
                status   : sequence % 5 ? 'accepted' : 'observed',
                timestamp: now.toLocaleTimeString('en-GB'),
                value    : base,
                counter  : sequence,
                progress : base,
                trend    : Array.from({length: 10}, (_, point) => (base + point * 9) % 101)
            })
        }

        store.add(records);
        me.feedBatchCount++;

        if (store.count > store.maxRecords) {
            store.splice(store.maxRecords, store.count - store.maxRecords)
        }

        me.updateStatusBar();

        return store.count
    }

    /**
     * @returns {Object} Tour/status toolbar config.
     */
    createStatusBar() {
        return {
            cls      : ['workstation-statusbar'],
            flex     : 'none',
            html     : '',
            ntype    : 'component',
            reference: 'status-bar'
        }
    }

    /**
     * @returns {Object} Tour toolbar config.
     */
    createTourBar() {
        let me      = this,
            isLight = me.theme === 'neo-theme-neo-light';

        return {
            cls   : ['workstation-tourbar'],
            flex  : 'none',
            layout: {ntype: 'hbox', align: 'center'},
            ntype : 'toolbar',
            items : [{
                cls      : ['workstation-tour-play'],
                handler  : () => me.startTour(),
                iconCls  : 'fa fa-play',
                ntype    : 'button',
                reference: 'tour-play',
                text     : 'Start dense tour'
            }, {
                module: Container,
                cls   : ['workstation-tour-story'],
                flex  : 1,
                items : [{
                    cls      : ['workstation-tour-caption'],
                    flex     : 'none',
                    html     : `${workstationTourScript.title} — twenty panes, 100k rows, a 10/sec feed, real overflow, and two themes.`,
                    ntype    : 'component',
                    reference: 'tour-caption'
                }, {
                    cls      : ['workstation-tour-pips'],
                    flex     : 'none',
                    ntype    : 'component',
                    reference: 'tour-pips',
                    vdom     : {cn: Workspace.totalBeats().map(() => ({cls: ['workstation-pip']}))}
                }],
                layout: {ntype: 'vbox', align: 'stretch', pack: 'center'}
            }, {
                cls      : ['workstation-theme-button'],
                handler  : () => me.toggleWorkspaceTheme(),
                iconCls  : isLight ? 'fa fa-moon' : 'fa fa-sun',
                ntype    : 'button',
                reference: 'theme-toggle',
                text     : isLight ? 'Dark mode' : 'Light mode'
            }]
        }
    }

    /**
     * Executes a surface cue for the visual take. Spec-mode correctness waits on explicit
     * E2E oracles because TourRunner intentionally does not await event listeners.
     * @param {Object} cue
     * @returns {Promise<*>}
     */
    async executeCue(cue) {
        switch (cue.type) {
            case 'overflow':
                return this.navigateOverflowMenu(cue.itemId)
            case 'scroll':
                return this.scrollScaleGrid(cue.index)
            case 'canvas-update':
                await this.refreshPromise;
                return this.pulseScaleSparkline()
            case 'theme':
                return this.setWorkspaceTheme(cue.theme)
            default:
                return false
        }
    }

    /**
     * @returns {Object} Live committed dock document.
     */
    getDockZoneDocument() {
        return this.dockModel
    }

    /**
     * Returns one cached pane identity for Neural Link continuity receipts.
     * @param {String} itemId
     * @returns {String|null}
     */
    getPaneIdentity(itemId) {
        const item = this.dockModel.items[itemId];

        return item ? this.resolvePane(itemId, item).id : null
    }

    /**
     * Returns the last fully settled visible-tour receipt.
     * @returns {Object|null}
     */
    getTourReceipt() {
        return this.lastTourReceipt
    }

    /**
     * Opens the real overflow control, briefly shows its menu, then invokes the first menu
     * item's ordinary activeIndex handler. The E2E clicks this same surface as a human.
     * @param {String} itemId Narrated target id (used for the caption/evidence contract).
     * @returns {Promise<Boolean>}
     */
    async navigateOverflowMenu(itemId) {
        // The reducer schedules projection asynchronously. Resolve the consumer only after that transaction,
        // otherwise `down()` can capture the retiring source toolbar and wait on its deliberately hidden control.
        await this.refreshPromise;

        let tabs   = this.down({dockNodeId: 'heavy-tabs'}),
            plugin = tabs?.getTabBar()?.getPlugin('tab-overflow'),
            control;

        // The hidden staging transaction already captured natural widths. This consumer boundary only
        // refreshes the visible extent so the cue never turns a stable cache into a second measurement pass.
        await plugin?.project(false);
        control = await this.waitForOverflowMenu(plugin);

        if (!control) return false;

        await control.toggleMenu();
        await this.timeout(700);

        const
            menuItems = control.menuList?.items || [],
            item      = menuItems.find(entry => entry.text === this.dockModel.items[itemId]?.title);

        item?.handler?.();
        control.menuList && (control.menuList.hidden = true);

        return item ? {activatedItemId: itemId, menuItemCount: menuItems.length} : false
    }

    /**
     * Defers the instance-preserving re-projection after a successful reducer commit.
     * @param {Object} document
     */
    onDockZoneDocumentChange(document) {
        let me = this;

        me.dockModel = document;
        // Every projection is an atomic ownership transaction across the old shell, the staged shell,
        // and their closest common parent. Preserve that atomicity across rapid reducer commits too:
        // replacing this promise would allow a later commit to start a second transaction before the
        // first removed its source shell, exposing duplicate projections and racing Canvas registration.
        me.refreshPromise = (me.refreshPromise || Promise.resolve())
            .then(() => me.timeout(0))
            .then(() => {
                if (!me.isDestroyed) return me.refreshDockWorkspace()
            })
    }

    /**
     * @param {Object} data
     */
    onTourBeat(data) {
        let me            = this,
            cueSettlement = Promise.resolve();

        data.caption && me.setTourCaption(data.caption);

        if (data.cue) {
            const cue = data.cue;

            me.cuePromise = me.cuePromise.then(async () => {
                const receipt = await me.executeCue(cue);

                if (!receipt) {
                    throw new Error(`${cue.type} returned no observable receipt`)
                }

                me.cueReceipts.push({cue: {...cue}, receipt});

                return receipt
            }).catch(error => {
                const message = `${cue.type}: ${error.message}`;

                me.cueErrors.push(message);
                me.setTourCaption(`Surface cue failed: ${message}`);

                return false
            });
            cueSettlement = me.cuePromise
        }

        me.cueSettlements.set(`${data.sceneIndex}:${data.stepIndex}`, cueSettlement)
    }

    /**
     * Projects one successful runner step only after the hosting surface's corresponding cue
     * and dock refresh have also settled. The runner event deliberately does not claim either
     * hosting-surface boundary.
     * @param {Object} data `TourRunner.stepSettled` payload.
     */
    onTourStepSettled(data) {
        let me            = this,
            key           = `${data.sceneIndex}:${data.stepIndex}`,
            cueSettlement = me.cueSettlements.get(key) || Promise.resolve();

        me.cueSettlements.delete(key);
        me.progressPromise = me.progressPromise.then(async () => {
            await cueSettlement;
            await me.refreshPromise;
            await me.setPipProgress(data.completedCount);
            // Adjacent document operations can settle within one browser frame. Keep each
            // evidenced state visible long enough to read instead of letting VDOM paints coalesce.
            await me.timeout(90)
        })
    }

    /**
     * @param {Object} data
     */
    onTourComplete(data) {
        this.setTourCaption(`Document playback complete — settling ${data.log.length} deterministic beats and surface cues.`)
    }

    /**
     * @param {Object} data
     */
    onTourError(data) {
        this.cueSettlements.clear();
        this.setTourCaption(`Tour stopped: ${data.errors[0] || 'unknown reason'}`)
    }

    /**
     * @param {Object} data
     */
    onTourScene(data) {
        this.setTourCaption(`${data.title}${data.caption ? ' — ' + data.caption : ''}`)
    }

    /**
     * Projects the committed document with instance-bound reducer/view callbacks.
     * @param {Function|null} [resolveComponentRef=null] Optional staging resolver.
     * @returns {Object}
     */
    projectDockModel(resolveComponentRef=null) {
        let me = this;

        return DockLayoutAdapter.project(me.dockModel, {
            applyDockZoneOperation  : me.applyDockZoneOperation.bind(me),
            onDockZoneDocumentChange: me.onDockZoneDocumentChange.bind(me),
            resolveComponentRef     : resolveComponentRef
                || ((componentRef, item, itemId) => me.resolvePane(itemId, item)),
            resolveRevealComponentRef  : (componentRef, item, itemId) => me.resolvePane(itemId, item)
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
            signal = Math.max(8, Math.min(92, signal + ((this.feedSequence + point * 5) % 9) - 4));
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
     * Atomically hands cached panes from the current projection to a staged next projection.
     *
     * {@link Neo.dashboard.DockProjectionReconciler} owns the renderer-safe staged ownership
     * transaction shared with other docking workspaces. Workstation supplies its cached-pane resolver,
     * header text, FLIP motion, retained-indicator suppression, and the heavy Overflow menu witness.
     * @returns {Promise<void>}
     */
    async refreshDockWorkspace() {
        const
            me           = this,
            host         = me.getReference('dock-host'),
            flip         = Neo.main?.addon?.DockFlip,
            placeholders = new Map();

        if (!host) return;

        try {
            await flip?.captureFirst({hostId: host.id, markerPrefix: 'workstation-pane-'})
        } catch (error) {/* instant landing */}

        const nextConfig = me.projectDockModel((componentRef, item, itemId) => {
            const placeholder = Neo.create({
                module: Component,
                header: {text: me.getPaneHeaderText(itemId, item)},
                hidden: true
            });

            placeholders.set(itemId, placeholder);

            return placeholder
        });

        let animationSuppressedBars = [];

        const {nextShell} = await DockProjectionReconciler.reconcileProjection({
            host,
            nextConfig,
            placeholders,
            resolveItem: itemId => me.resolvePane(itemId, me.dockModel.items[itemId]),
            onProjectionStaged({plans}) {
                const retainedTabBars = [...plans.values()]
                    .filter(plan => plan.tab)
                    .map(plan => plan.tab.getTabBar());

                animationSuppressedBars = retainedTabBars
                    .filter(bar => !bar.cls.includes('neo-no-animation'));

                // Native reparenting keeps each toolbar DOM node, but CSS animations restart when it
                // re-enters the document. Retained indicators settle immediately; new chrome still enters.
                animationSuppressedBars.forEach(bar => {
                    bar.setSilent({cls: [...bar.cls, 'neo-no-animation']})
                })
            },
            waitForOverflowProjection: plugin => me.waitForOverflowProjection(plugin)
        });

        const heavyOverflow = nextShell.down({dockNodeId: 'heavy-tabs'})
            ?.getTabBar()?.getPlugin('tab-overflow');

        await me.waitForOverflowMenu(heavyOverflow);

        // Changing only animation-duration keeps the same CSS Animation object. Waiting out the
        // theme's 260ms window before restoring it prevents a delayed replay on retained indicators.
        const chromeAnimationSettle = me.timeout(300);

        if (flip) {
            DockMotionSignal.enter(me);

            try {
                await flip.play({hostId: host.id, markerPrefix: 'workstation-pane-'})
            } catch (error) {/* instant landing */}
            finally {
                DockMotionSignal.leave(me)
            }
        }

        await chromeAnimationSettle;
        animationSuppressedBars.forEach(bar => {
            bar.setSilent({cls: bar.cls.filter(cls => cls !== 'neo-no-animation')})
        });
        host.updateDepth = -1;
        host.update();
        await host.promiseUpdate()
    }

    /**
     * Waits for the tab-overflow projection and its asynchronously imported menu surface.
     * `project()` intentionally coalesces while a measurement is in flight, and button menus
     * load after control construction, so readiness requires all four lifecycle facts rather
     * than a screenplay delay.
     * @param {Neo.tab.plugin.Overflow|null} plugin
     * @returns {Promise<Neo.button.Base|null>}
     */
    async waitForOverflowMenu(plugin) {
        if (!plugin) return null;

        for (let attempt = 0; attempt < 100; attempt++) {
            const control = plugin.control;

            if (!plugin.measuring && !plugin.projectQueued
                && control?.mounted && control.menuList) {
                return control
            }

            await this.timeout(0)
        }

        return null
    }

    /**
     * Waits until one coalescing overflow projection has drained its current and queued passes.
     * @param {Neo.tab.plugin.Overflow|null} plugin
     * @returns {Promise<Boolean>}
     */
    async waitForOverflowProjection(plugin) {
        if (!plugin) return false;

        for (let attempt = 0; attempt < 100; attempt++) {
            if (!plugin.measuring && !plugin.projectQueued) return true;

            await this.timeout(0)
        }

        return false
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
     * Returns the one live pane instance for an item id.
     * @param {String} itemId
     * @param {Object} item
     * @returns {Neo.component.Base}
     */
    resolvePane(itemId, item) {
        let me    = this,
            cache = me.paneCache,
            pane  = cache[itemId],
            store;

        if (!pane || pane.isDestroyed) {
            if (itemId === 'scale') {
                store = me.getStateProvider().getStore('scale');
                pane  = cache[itemId] = Neo.create({module: ScalePane, store})
            } else if (itemId === 'feed') {
                store = me.getStateProvider().getStore('feed');
                pane  = cache[itemId] = Neo.create({module: FeedPane, store})
            } else {
                const story = paneStories[itemId] || {
                    detail: 'resident operational',
                    icon  : 'fa-circle-nodes',
                    kicker: 'LIVE MODULE',
                    metric: 'READY'
                };

                pane = cache[itemId] = Neo.create({
                    module: Component,
                    cls   : ['workstation-pane', 'workstation-placeholder', `workstation-pane-${itemId}`],
                    html  : `<div class="workstation-resident-card">
                        <div class="workstation-resident-kicker"><span></span>${story.kicker}</div>
                        <i class="fa ${story.icon} workstation-resident-icon"></i>
                        <div class="workstation-resident-metric">${story.metric}</div>
                        <div class="workstation-resident-title">${item?.title ?? itemId}</div>
                        <div class="workstation-resident-footer">
                            <span>${story.detail}</span><strong>LIVE</strong>
                        </div>
                        <div class="workstation-resident-wave"><i></i><i></i><i></i><i></i><i></i><i></i></div>
                    </div>`
                })
            }
        }

        // The adapter can decorate plain configs, but this showcase deliberately returns cached LIVE
        // instances to preserve identity across re-projection. Carry the canonical tab header on the
        // instance itself so tab.Container and Neo.tab.plugin.Overflow receive a meaningful title. The
        // surrounding navigation groups use compact labels; the twelve-item heavy group keeps the full
        // canonical titles and therefore owns the showcase's one intentional overflow affordance.
        pane.header = {text: me.getPaneHeaderText(itemId, item)};
        pane.addCls(`workstation-pane-${itemId}`);

        return pane
    }

    /**
     * Replays one script's document tier from a fresh document in spec mode. Runtime-only
     * cues remain the visible tour's responsibility and are verified through its receipt.
     * @param {Object} [script=workstationTourScript]
     * @returns {Promise<Object>}
     */
    async runTourSpec(script=workstationTourScript) {
        let me          = this,
            dockService = Neo.create(DockService, {}),
            runner      = Neo.create(TourRunner, {
                componentId: me.id,
                dockService,
                mode       : 'spec',
                script
            });

        me.dockModel = DockZoneModel.clone(initialDocument);
        await me.refreshDockWorkspace();

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
     * Scrolls the scale grid through one View-owned VDOM update.
     *
     * The View is the closest common parent of the native scrollport and every pooled body.
     * Retargeting its VNode `scrollTop` together with `syncBodies()` therefore lets one delta
     * move the viewport and recycle the fixed rows atomically, without a transient blank frame.
     *
     * @param {Number} index
     * @returns {Promise<Boolean>}
     */
    async scrollScaleGrid(index=50000) {
        let pane = this.paneCache.scale,
            target;

        if (!pane?.view?.id) return false;

        target = Math.max(0, Math.min(index, pane.store.count - 1)) * pane.rowHeight;
        pane.view.vdom.scrollTop = target;
        pane.view.syncBodies(target);
        await pane.view.promiseUpdate();

        return Math.abs(pane.view.scrollTop - target) <= pane.rowHeight
    }

    /**
     * @param {Number} count
     */
    async setPipProgress(count) {
        const pips = this.getReference('tour-pips');

        if (!pips) return;

        let {vdom} = pips;

        vdom.cn.forEach((pip, index) => {
            pip.cls = index < count
                ? ['workstation-pip', 'workstation-pip-done']
                : ['workstation-pip']
        });
        pips.update();
        await pips.promiseUpdate()
    }

    /**
     * @param {String} text
     */
    setTourCaption(text) {
        const caption = this.getReference('tour-caption');

        caption && (caption.html = text)
    }

    /**
     * @param {String} theme
     * @returns {String}
     */
    setWorkspaceTheme(theme) {
        this.theme = theme;
        this.syncThemeToggle(theme);
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
     * @returns {String} The newly applied theme.
     */
    toggleWorkspaceTheme() {
        return this.setWorkspaceTheme(this.theme === 'neo-theme-neo-light'
            ? 'neo-theme-neo-dark'
            : 'neo-theme-neo-light')
    }

    /**
     * Runs the screenplay from a fresh document on every replay.
     * @returns {Promise<Object>|undefined}
     */
    async startTour() {
        let me = this;

        if (me.tourRunner.running) {
            me.setTourCaption('Tour already running — the live stores continue underneath it.');
            return
        }

        me.cueErrors       = [];
        me.cuePromise      = Promise.resolve();
        me.cueReceipts     = [];
        me.cueSettlements.clear();
        me.lastTourReceipt = null;
        me.progressPromise = Promise.resolve();
        me.dockModel       = DockZoneModel.clone(initialDocument);
        await me.setPipProgress(0);

        await me.refreshDockWorkspace();

        const
            feedStore      = me.getStateProvider().getStore('feed'),
            feedStartCount = feedStore.count,
            feedStartBatch = me.feedBatchCount,
            startedAt      = Date.now(),
            runnerResult   = await me.tourRunner.start();

        await me.cuePromise;
        await me.refreshPromise;
        await me.progressPromise;
        await me.setPipProgress(Workspace.totalBeats().length);

        const
            elapsedMs    = Date.now() - startedAt,
            errors       = [...runnerResult.errors, ...me.cueErrors],
            feedEndCount = feedStore.count,
            receipt      = {
                completed  : runnerResult.completed && errors.length === 0,
                cueReceipts: me.cueReceipts.map(entry => ({cue: {...entry.cue}, receipt: entry.receipt})),
                document   : DockZoneModel.clone(me.dockModel),
                elapsedMs,
                errors,
                feed       : {
                    batches       : me.feedBatchCount - feedStartBatch,
                    configuredRate: Workspace.FEED_BATCH_SIZE * 1000 / Workspace.FEED_INTERVAL_MS,
                    endCount      : feedEndCount,
                    growth        : feedEndCount - feedStartCount,
                    maxRecords    : feedStore.maxRecords,
                    produced      : (me.feedBatchCount - feedStartBatch) * Workspace.FEED_BATCH_SIZE,
                    startCount    : feedStartCount
                },
                log       : runnerResult.log
            };

        me.lastTourReceipt = receipt;
        me.setTourCaption(receipt.completed
            ? `Tour complete — ${receipt.log.length} deterministic beats and ${receipt.cueReceipts.length} surface cues settled.`
            : `Tour stopped — ${errors[0]}`);

        return receipt
    }

    /**
     * @returns {Object[]} Flattened screenplay steps.
     * @static
     */
    static totalBeats() {
        return workstationTourScript.scenes.flatMap(scene => scene.steps)
    }

    /**
     * Updates the visible runtime receipt without creating another state authority.
     */
    updateStatusBar() {
        let target = this.getReference('status-bar');

        if (target) {
            let scale = this.getStateProvider().getStore('scale'),
                feed  = this.getStateProvider().getStore('feed');

            target.html = `<span>20 dock items</span><span>${new Intl.NumberFormat().format(scale.count)} scale rows</span><span>${feed.count}/${feed.maxRecords} feed rows</span><span>${Workspace.FEED_BATCH_SIZE * 1000 / Workspace.FEED_INTERVAL_MS} events/sec</span>`
        }
    }

    /**
     * Tears down the workspace-owned producer, tour seams, and cached pane instances.
     * @param {...*} args
     */
    destroy(...args) {
        let me = this;

        if (me.#feedIntervalId !== null) {
            clearInterval(me.#feedIntervalId);
            me.#feedIntervalId = null
        }

        me.tourRunner?.destroy();
        me.dockService?.destroy();
        me.cueSettlements.clear();

        Object.values(me.paneCache).forEach(pane => {
            pane?.isDestroyed || pane?.destroy?.()
        });
        me.paneCache = {};

        super.destroy(...args)
    }
}

export default Neo.setupClass(Workspace);
