import Component                                from '../../../src/component/Base.mjs';
import Container                                from '../../../src/container/Base.mjs';
import Feed                                     from '../store/Feed.mjs';
import FeedPane                                 from './FeedPane.mjs';
import Scale                                    from '../store/Scale.mjs';
import ScalePane                                from './ScalePane.mjs';
import DockDragAffordances                      from '../../../src/dashboard/DockDragAffordances.mjs';
import DockDropIndicators                       from '../../../src/dashboard/DockDropIndicators.mjs';
import DockLayoutAdapter                        from '../../../src/dashboard/DockLayoutAdapter.mjs';
import DockMotionSignal                         from '../../../src/dashboard/DockMotionSignal.mjs';
import DockPreview                              from '../../../src/dashboard/DockPreview.mjs';
import DockProjectionReconciler                 from '../../../src/dashboard/DockProjectionReconciler.mjs';
import DockService                              from '../../../src/ai/client/DockService.mjs';
import DockZoneModel                            from '../../../src/dashboard/DockZoneModel.mjs';
import InteractionService                       from '../../../src/ai/client/InteractionService.mjs';
import StateProvider                            from '../../../src/state/Provider.mjs';
import TourRunner                               from '../../../src/ai/client/TourRunner.mjs';
import {createDockTearOutHandlers}              from '../../../src/dashboard/DockTearOut.mjs';
import {createDockVesselEmbodiment}             from '../../../src/dashboard/DockVesselEmbodiment.mjs';
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
     * The shared drag-affordance gesture controller (producer lifecycle, memoized geometry,
     * release-truth drop, generation guards) — composed at construct, destroyed with the view.
     * @member {Neo.dashboard.DockDragAffordances|null} dragAffordances=null
     */
    dragAffordances = null
    /**
     * Real-pointer gesture driver for the app-owned journey executors (spec + film replays).
     * @member {Neo.ai.client.InteractionService|null} interactionService=null
     */
    interactionService = null
    /**
     * @member {Object} paneCache={}
     * @protected
     */
    paneCache = {}
    /**
     * The transient render embodiment for admitted tear-out vessels (live pane staged into the
     * vessel while a hidden exact-slot placeholder holds the source indices).
     * @member {Object|null} tearOutEmbodiment=null
     */
    tearOutEmbodiment = null
    /**
     * The tear-out gesture choreography (admission chain + commit-at-terminal routing).
     * @member {Object|null} tearOutHandlers=null
     */
    tearOutHandlers = null
    /**
     * Connect-time admission tokens for tear-out vessels whose render stage is still settling.
     * @member {Map} tearOutConnectAdmissions=new Map()
     * @protected
     */
    tearOutConnectAdmissions = new Map()
    /**
     * Pre-terminal connected tear-out vessels by item id.
     * @member {Object} tearOutConnects={}
     * @protected
     */
    tearOutConnects = {}
    /**
     * Post-commit vessel-owned panes by item id (the detached terminal committed).
     * @member {Object} tearOutPanes={}
     * @protected
     */
    tearOutPanes = {}
    /**
     * Exact `{tabsNodeId, index}` placement captured at each detach commit — the return truth.
     * @member {Object} tearOutPlacements={}
     * @protected
     */
    tearOutPlacements = {}
    /**
     * Retirement fences: items whose vessel close is in flight (connects stay cleanup-only).
     * @member {Set} tearOutRetirements=new Set()
     * @protected
     */
    tearOutRetirements = new Set()
    /**
     * Product-semantic vessel owner grants by `flow:itemId`.
     * @member {Map} vesselOwnerGrants=new Map()
     * @protected
     */
    vesselOwnerGrants = new Map()
    /**
     * Monotonic grant generation counter.
     * @member {Number} vesselOwnerGrantGeneration=0
     * @protected
     */
    vesselOwnerGrantGeneration = 0
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

        // The shared gesture controller composes the overlays it just created — the same
        // app-neutral owner Demo-A rides; the flagship adds zero orchestration of its own.
        me.dragAffordances = Neo.create(DockDragAffordances, {
            host      : me.getReference('dock-host'),
            indicators: me.getReference('drop-indicators'),
            owner     : me,
            preview   : me.getReference('dock-preview')
        });

        me.interactionService = Neo.create(InteractionService, {});

        me.tearOutEmbodiment = createDockVesselEmbodiment({
            resolvePane: itemId => me.paneCache[itemId]
                ?? (me.dockModel?.items?.[itemId] && me.resolvePane(itemId, me.dockModel.items[itemId])),
            resolveTarget: windowId => Neo.apps[windowId]?.mainView ?? null
        });

        // The gesture tear-out choreography. The composition law (dockdemo sibling): a tear-out
        // vessel NEVER writes shared detach bookkeeping mid-gesture — model truth is untouched
        // until the detached terminal, so a cancelled or re-entered tear-out is zero-mutation
        // by GUARD. Post-commit adoption uses its own bookkeeping (tearOutPanes/tearOutConnects).
        me.tearOutHandlers = createDockTearOutHandlers({
            applyOperation  : descriptor => me.applyTearOutOperation(descriptor),
            closeVessel     : vessel => me.closeTearOutVessel(vessel),
            onDocumentChange: (document, operation, vessel) => me.onTearOutDocumentChange(document, operation, vessel),
            openVessel      : request => me.openTearOutVessel(request)
        });

        // vessel lifecycle: a granted `?popout=` window adopts the live pane on connect,
        // and a vessel death brings its item home on disconnect
        Neo.currentWorker.on({
            connect   : me.onWindowConnect,
            disconnect: me.onWindowDisconnect,
            scope     : me
        });

        // The reactive afterSet fires before the dock host exists during construction —
        // re-apply the active language now that the host is live (both orders converge).
        me.previewLanguage && me.afterSetPreviewLanguage(me.previewLanguage, null);

        me.updateStatusBar();
        me.#feedIntervalId = setInterval(
            () => me.appendFeedBatch(Workspace.FEED_BATCH_SIZE),
            Workspace.FEED_INTERVAL_MS
        )
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
     * @param {Object} [options={}]
     * @param {String[]} [options.preserveItemIds] Owner-held panes the reconciler must park.
     */
    onDockZoneDocumentChange(document, options={}) {
        let me = this;

        me.dockModel = document;
        // Every projection is an atomic ownership transaction across the old shell, the staged shell,
        // and their closest common parent. Preserve that atomicity across rapid reducer commits too:
        // replacing this promise would allow a later commit to start a second transaction before the
        // first removed its source shell, exposing duplicate projections and racing Canvas registration.
        me.refreshPromise = (me.refreshPromise || Promise.resolve())
            .then(() => me.timeout(0))
            .then(() => {
                if (!me.isDestroyed) return me.refreshDockWorkspace(options)
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
            applyDockZoneOperation   : me.applyDockZoneOperation.bind(me),
            // Tear-out opt-in (§2.8): arms the window-boundary hysteresis + overdrag on every
            // projected tabs zone; the gesture handlers below route through the tear-out machine.
            enableDockTearOut        : true,
            onDockCrossZoneDragCancel: data => me.dragAffordances.onDragCancel(data),
            onDockCrossZoneDragMove  : data => me.dragAffordances.onDragMove(data),
            onDockCrossZoneDrop      : data => me.dragAffordances.onDrop(data),
            onDockTearOutCancel      : data => me.tearOutHandlers.onDockTearOutCancel(data),
            onDockTearOutEntry       : data => me.tearOutHandlers.onDockTearOutEntry(data),
            onDockTearOutExit        : data => me.tearOutHandlers.onDockTearOutExit(data),
            onDockTearOutTerminal    : data => me.tearOutHandlers.onDockTearOutTerminal(data),
            onDockZoneDocumentChange : me.onDockZoneDocumentChange.bind(me),
            resolveComponentRef      : resolveComponentRef
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
     * @param {Object} [options={}]
     * @param {String[]} [options.preserveItemIds=[]] Owner-held panes the reconciler must park
     *     instead of destroy (a terminal-first tear-out vessel owns its pane before it connects).
     * @returns {Promise<void>}
     */
    async refreshDockWorkspace({preserveItemIds=[]}={}) {
        const
            me           = this,
            host         = me.getReference('dock-host'),
            flip         = Neo.main?.addon?.DockFlip,
            placeholders = new Map();

        if (!host) return;

        // Every re-projection retires the active gesture session — a stale geometry promise
        // must never survive a topology change (the controller's generation guards depend on it).
        me.dragAffordances?.clear();

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
            preserveItemIds,
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
     * Applies the theme to every render target of this app, not only to the workspace.
     *
     * A theme in Neo is a CSS class an ancestor carries, and `afterSetTheme` writes it onto the
     * component it was set on — so setting it here reaches this window's subtree and nothing else.
     * A tear-out vessel is a SECOND document driven by the same App Worker, whose only theme
     * carrier is the class the Stylesheet addon puts on its `body` at boot. Nothing propagates a
     * later flip across documents, so an open vessel stayed on the theme it was born with while
     * the workspace beside it changed.
     *
     * Fanning across `Neo.apps` is the same seam the tear-out already resolves vessels through
     * (`resolveTarget: windowId => Neo.apps[windowId]?.mainView`), and the viewport is where the
     * app's token bridge lives — so a vessel restyles from its own theme class rather than
     * inheriting a stale one from its boot-time body.
     * @param {String} theme
     * @returns {String}
     */
    setWorkspaceTheme(theme) {
        const me = this;

        me.theme = theme;
        me.syncThemeToggle(theme);

        Object.values(Neo.apps || {}).forEach(app => {
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
     * @summary Mints one product-semantic vessel grant and supersedes the prior generation for
     * the same flow/item. The token is a bearer hint only; {@link #consumeVesselOwnerGrant}
     * additionally requires the opener-minted native route for the exact connected child.
     * @param {String} flow Vessel flow discriminator (`tear-out`).
     * @param {String} itemId
     * @returns {{generation: Number, token: String}}
     * @protected
     */
    createVesselOwnerGrant(flow, itemId) {
        let grant = {
            generation: ++this.vesselOwnerGrantGeneration,
            token     : crypto.randomUUID()
        };

        this.vesselOwnerGrants.set(`${flow}:${itemId}`, grant);

        return grant
    }

    /**
     * @summary Consumes one exact product grant after validating the generic native route.
     * Consumption precedes every reparent, making replay and same-name reuse inert.
     * @param {Object} data
     * @param {Object} data.windowData
     * @param {String} flow
     * @param {Number} generation
     * @param {String} grant
     * @param {String} itemId
     * @param {String} windowId
     * @returns {Boolean}
     * @protected
     */
    consumeVesselOwnerGrant({data, flow, generation, grant, itemId, windowId}) {
        let me     = this,
            key    = `${flow}:${itemId}`,
            stored = me.vesselOwnerGrants.get(key),
            route  = data.windowData?.nativeRoute;

        if (
            !stored || !grant || stored.token !== grant || stored.generation !== generation ||
            !route?.nativeHandleKey || route.ownerWindowId !== me.windowId || route.targetWindowId !== windowId
        ) {
            return false
        }

        me.vesselOwnerGrants.delete(key);

        return true
    }

    /**
     * @summary Revokes the current semantic grant for one flow/item admission.
     * @param {String} flow
     * @param {String} itemId
     * @protected
     */
    revokeVesselOwnerGrant(flow, itemId) {
        this.vesselOwnerGrants.delete(`${flow}:${itemId}`)
    }

    /**
     * The tear-out admission seam: opens the vessel window for a mid-gesture boundary exit.
     * Reuses the workstation viewport's `?popout=` pure-pane-host mode. The granted child
     * immediately carries the same live pane through {@link Neo.dashboard.DockVesselEmbodiment};
     * it owns no workspace document. Fail-closed per the admission contract: `windowOpen` returns
     * a BOOLEAN (a blocked popup never throws), and any falsy/throwing acquisition returns `null`
     * so the gesture degrades to its in-window fallback.
     * @param {Object} request
     * @param {Number} request.admissionToken
     * @param {String} request.itemId
     * @param {Object} request.proxyRect
     * @returns {Promise<{admissionToken: Number, generation: Number, popupHeight: Number, popupWidth: Number, windowName: String}|null>}
     * @protected
     */
    async openTearOutVessel({admissionToken, itemId, proxyRect}) {
        let me         = this,
            {windowId} = me,
            windowName = `tearout-${itemId}`,
            ownerGrant = me.createVesselOwnerGrant('tear-out', itemId);

        admissionToken = Number.isFinite(admissionToken) ? admissionToken : ownerGrant.generation;
        ownerGrant.admissionToken = admissionToken;

        // Diagnostic trail for the birth gate: absence has three distinct layers (admission
        // refused / platform refused the window / window granted but never connected), and the
        // failure diag must name which one this gesture died in.
        me.lastVesselOpen = {itemId, stage: 'invoked'};

        if (me.tearOutRetirements.has(itemId)) {
            me.lastVesselOpen.stage = 'blocked-by-retirement';
            me.revokeVesselOwnerGrant('tear-out', itemId);
            return null
        }

        try {
            let winData = await Neo.Main.getWindowData({windowId}),
                width   = Math.max(Math.round(proxyRect?.width  || 480), 320),
                height  = Math.max(Math.round(proxyRect?.height || 360), 240),
                left    = Math.round((proxyRect?.x ?? 120) + winData.screenLeft),
                top     = Math.round((proxyRect?.y ?? 120) + (winData.outerHeight - winData.innerHeight) + winData.screenTop);

            let opened = await Neo.Main.windowOpen({
                nativeCapabilities: {close: true, position: true},
                url               : `./index.html?popout=${itemId}&hostId=${me.id}`
                    + `&vesselFlow=tear-out&vesselGrant=${ownerGrant.token}`
                    + `&vesselGeneration=${ownerGrant.generation}`
                    + `&vesselAdmission=${admissionToken}`,
                windowFeatures: `height=${height},left=${left},top=${top},width=${width}`,
                windowId,
                windowName
            });

            me.lastVesselOpen.stage = opened === false ? 'windowOpen-false' : 'granted';

            if (opened === false) {
                me.revokeVesselOwnerGrant('tear-out', itemId);
                return null
            }

            me.tearOutVesselDims = {height, width};

            return {
                admissionToken,
                generation : ownerGrant.generation,
                popupHeight: height,
                popupWidth : width,
                windowName
            }
        } catch (error) {
            me.lastVesselOpen.stage = 'threw';
            me.lastVesselOpen.error = String(error?.message || error);
            me.revokeVesselOwnerGrant('tear-out', itemId);
            return null
        }
    }

    /**
     * The tear-out retirement seam: closes a vessel the gesture no longer needs (re-entry,
     * cancel, or a refused model commit). The live connection and owner grant remain recoverable
     * until the platform strictly admits the close; an explicit refusal can therefore be retried
     * instead of orphaning a parked native generation.
     * @param {Object} vessel
     * @param {Number} [vessel.admissionToken]
     * @param {Number} [vessel.generation]
     * @param {String} vessel.itemId
     * @param {Object} [vessel.nativeRoute] Exact opener-minted physical route when available.
     * @param {String} vessel.windowName
     * @returns {Promise<Boolean>}
     * @protected
     */
    async closeTearOutVessel({admissionToken, generation, itemId, nativeRoute, windowName}) {
        let me               = this,
            entry            = me.resolveTearOutVessel(itemId),
            admission        = me.tearOutConnectAdmissions.get(itemId),
            ownerGrant       = me.vesselOwnerGrants.get(`tear-out:${itemId}`),
            expected         = `tearout-${itemId}`,
            exactGeneration  = entry?.generation ?? admission?.generation ?? ownerGrant?.generation,
            exactToken       = entry?.admissionToken ?? admission?.admissionToken ?? ownerGrant?.admissionToken,
            embodiedWindowId = entry?.windowId ?? admission?.windowId ?? me.tearOutEmbodiment.getWindowId(itemId),
            closed           = false;

        if (
            !itemId || windowName !== expected || (entry && entry.windowName !== windowName) ||
            (Number.isFinite(generation) && generation !== exactGeneration) ||
            (Number.isFinite(admissionToken) && admissionToken !== exactToken)
        ) {
            return false
        }

        nativeRoute ??= entry?.nativeRoute ?? admission?.nativeRoute ?? (
            admission?.windowId && Neo.manager?.Window?.get(admission.windowId)?.nativeRoute
        );

        const exactWindowId = entry?.windowId ?? admission?.windowId;

        if (nativeRoute && (
            !nativeRoute.nativeHandleKey || nativeRoute.ownerWindowId !== me.windowId ||
            !nativeRoute.targetWindowId || nativeRoute.capabilities?.close !== true ||
            (exactWindowId && nativeRoute.targetWindowId !== exactWindowId)
        )) return false;

        // Establish retirement before restoring any source embodiment or awaiting the platform.
        // A refused close retains the exact route + tear-out machine slot for retry, but the
        // content stays safely home.
        me.tearOutRetirements.add(itemId);
        admission && (admission.invalidated = true);

        if (embodiedWindowId && me.tearOutEmbodiment.isStaged(itemId)) {
            const sourceOwns = Boolean(DockZoneModel.findContainingTabsId(me.dockModel, itemId)),
                  settled    = me.tearOutEmbodiment[sourceOwns ? 'restore' : 'promote']({
                      itemId, windowId: embodiedWindowId
                  });

            if (!settled) return false
        }

        try {
            if (nativeRoute) {
                closed = await Neo.Main.windowNativeClose({
                    nativeHandleKey: nativeRoute.nativeHandleKey,
                    targetWindowId : nativeRoute.targetWindowId,
                    windowId       : me.windowId
                }) === true
            } else {
                // Before connect there is no exact route to correlate yet; the active tear-out
                // slot's unguessable semantic name is the only available authority. Once a route
                // exists, ANY invalidity above fails closed — never downgrade to same-name close.
                await Neo.Main.windowClose({names: [windowName], windowId: me.windowId});
                closed = true
            }
        } catch (error) {
            return false
        }

        if (!closed) return false;

        delete me.tearOutConnects[itemId];
        me.tearOutConnectAdmissions.delete(itemId);
        me.revokeVesselOwnerGrant('tear-out', itemId);
        me.tearOutRetirements.delete(itemId);

        return true
    }

    /**
     * @summary Resolves the exact live vessel identity for one torn item, connect- or commit-side.
     * @param {String} itemId
     * @returns {Object|null}
     * @protected
     */
    resolveTearOutVessel(itemId) {
        let entry = this.tearOutConnects[itemId] ?? this.tearOutPanes[itemId];

        if (!entry?.windowId) return null;

        const resolved = {
            ...entry,
            nativeRoute: entry.nativeRoute ?? Neo.manager?.Window?.get(entry.windowId)?.nativeRoute ?? null,
            windowName : entry.windowName ?? `tearout-${itemId}`
        };

        Object.defineProperties(resolved, {
            admissionToken: {value: entry.admissionToken},
            generation    : {value: entry.generation}
        });

        return resolved
    }

    /**
     * @summary The tear-out commit seam with exact-position capture riding it: the
     * `{tabsNodeId, index}` pair is readable only BEFORE a detach commit removes the item from
     * the tree, and a refused commit deletes its own capture — no stale placement outlives a
     * gesture that never committed. Every non-detach descriptor passes through untouched.
     * @param {Object} descriptor
     * @returns {{document: Object, errors: String[]}|null}
     * @protected
     */
    applyTearOutOperation(descriptor) {
        let me       = this,
            isDetach = descriptor?.operation === 'detachItem',
            captured = isDetach ? DockZoneModel.captureItemPlacement(me.dockModel, descriptor.itemId) : null,
            result;

        captured && (me.tearOutPlacements[descriptor.itemId] = captured);

        result = me.applyDockZoneOperation(descriptor);

        isDetach && result?.errors?.length && delete me.tearOutPlacements[descriptor.itemId];

        return result
    }

    /**
     * @summary Commits a detached terminal without sacrificing the live pane to projection order.
     * @description A connect-first vessel already carries the pane and leaves an exact-slot source
     * placeholder for ordinary projection cleanup. A terminal-first vessel has no placeholder, so
     * the source reconciler must preserve the pane until the granted child arrives.
     * @param {Object} document
     * @param {Object} operation
     * @param {Object} vessel Exact admitted vessel identity, including its private generation.
     * @protected
     */
    onTearOutDocumentChange(document, operation, vessel) {
        let me       = this,
            detached = operation?.operation === 'detachItem',
            itemId   = operation?.itemId;

        if (!detached) {
            me.onDockZoneDocumentChange(document);
            return
        }

        me.onDockZoneDocumentChange(document, {
            preserveItemIds: me.tearOutEmbodiment.isStaged(itemId) ? [] : [itemId]
        });
        me.adoptTearOutPane(itemId, vessel?.generation, vessel?.admissionToken)
    }

    /**
     * The post-commit adoption: the detached terminal committed `detachItem` (the item left the
     * tree, catalog preserved), so the vessel now OWNS the pane. Writes the {@link #tearOutPanes}
     * entry and — if the vessel already connected ({@link #tearOutConnects}, the long-drag order)
     * — reparents the live pane into it immediately; otherwise {@link #onWindowConnect} adopts on
     * arrival (the fast-terminal order).
     * @param {String} itemId
     * @param {Number} [generation] Exact owner-grant generation for terminal-first adoption.
     * @param {Number} [admissionToken] Exact gesture admission for terminal-first adoption.
     * @protected
     */
    adoptTearOutPane(itemId, generation, admissionToken) {
        let me        = this,
            connected = me.tearOutConnects[itemId];

        me.tearOutPanes[itemId] = connected
            ? {...connected}
            : {windowName: `tearout-${itemId}`, windowId: null};

        Object.defineProperties(me.tearOutPanes[itemId], {
            admissionToken: {
                configurable: true,
                value       : connected?.admissionToken ?? admissionToken ?? null,
                writable    : true
            },
            generation: {
                configurable: true,
                value       : connected?.generation ?? generation ?? null,
                writable    : true
            },
            nativeRoute: {
                configurable: true,
                value       : connected?.nativeRoute ?? null,
                writable    : true
            }
        });

        if (connected) {
            // Promotion is synchronous and single-owner: committed disconnects may only match
            // tearOutPanes from this point onward, never the pre-terminal connect branch first.
            delete me.tearOutConnects[itemId];

            if (me.tearOutEmbodiment.isStaged(itemId)) {
                me.tearOutEmbodiment.promote({itemId, windowId: connected.windowId})
            } else {
                me.reparentTearOutPane(itemId, connected)
            }
        }
    }

    /**
     * Moves the LIVE cached pane into a connected tear-out vessel — pure render-target work;
     * the model already committed at the terminal.
     * @param {String} itemId
     * @param {Object} target `{windowId}`
     * @returns {Boolean}
     * @protected
     */
    reparentTearOutPane(itemId, target) {
        let me         = this,
            {windowId} = target,
            app        = Neo.apps[windowId],
            pane       = me.paneCache[itemId];

        if (!app || !pane || pane.isDestroyed) return false;

        me.tearOutPanes[itemId] && Object.assign(me.tearOutPanes[itemId], target);

        if (pane.parent !== app.mainView) {
            pane.parent?.remove(pane, false);
            app.mainView.add(pane)
        }

        return true
    }

    /**
     * @summary Brings a torn-out item HOME on vessel death — the exact-position return.
     *
     * The stored `{tabsNodeId, index}` pair (captured at the detach terminal) is the placement
     * truth; recovery is SEMANTIC, never geometric: a stored home node that left the tree falls
     * back to the first surviving tabs node (append). Exact-once and idempotent: an item some
     * other flow already re-treed is left where it is, and the placement record is consumed
     * regardless. An item whose document no longer catalogs it, or a document with no surviving
     * tabs node, stays catalog-only — the honest terminal, with zero mutation.
     * @param {String} itemId
     * @protected
     */
    reintegrateTearOutItem(itemId) {
        let me         = this,
            placement  = me.tearOutPlacements[itemId],
            doc        = me.dockModel,
            storedHome = placement && doc.nodes?.[placement.tabsNodeId]?.type === 'tabs' ? placement.tabsNodeId : null,
            fallback   = storedHome || Object.entries(doc.nodes || {}).find(([, node]) => node.type === 'tabs')?.[0],
            result;

        delete me.tearOutPlacements[itemId];

        if (!doc.items?.[itemId] || !fallback || DockZoneModel.findContainingTabsId(doc, itemId)) {
            return
        }

        result = me.applyDockZoneOperation({
            operation : 'addTab',
            itemId,
            tabsNodeId: fallback,
            ...(storedHome ? {index: placement.index} : {})
        });

        result?.errors?.length === 0 && me.onDockZoneDocumentChange(result.document)
    }

    /**
     * A popup window joined the shared heap: if it is one of OURS (the pop-out URL carries
     * `popout=<itemId>&hostId=<this.id>` plus an exact vessel grant), reparent the LIVE cached
     * pane into its main view. The instance moves trees; nothing is recreated.
     * @param {Object} data `{appName, windowId, windowData}`
     */
    async onWindowConnect(data) {
        let me         = this,
            {windowId} = data,
            app        = Neo.apps[windowId];

        if (!app || me.isDestroyed) return;

        let url            = await Neo.Main.getByPath({path: 'document.URL', windowId}),
            params         = new URL(url).searchParams,
            itemId         = params.get('popout'),
            flow           = params.get('vesselFlow'),
            grant          = params.get('vesselGrant'),
            admissionValue = params.get('vesselAdmission'),
            admissionToken = admissionValue === null ? NaN : Number(admissionValue),
            generation     = Number(params.get('vesselGeneration'));

        if (params.get('hostId') !== me.id) return;
        if (!itemId || flow !== 'tear-out' || !Number.isFinite(admissionToken)) return;

        // Geometry-ready is part of child admission: do not publish the connected vessel to any
        // ownership branch until its Main realm has installed resize observation.
        await Neo.main.addon.WindowPosition?.setConfigs({observeResize: true, windowId});

        // Retirement authority is established before any awaited close. A connect continuation
        // that resumes after that boundary is cleanup-only. Consume its exact grant and retain
        // the route for a refused-close retry, but never stage content into the closing realm.
        if (me.tearOutRetirements.has(itemId)) {
            if (me.consumeVesselOwnerGrant({data, flow, generation, grant, itemId, windowId})) {
                const admission = {admissionToken, generation, invalidated: true, windowId};

                Object.defineProperty(admission, 'nativeRoute', {value: data.windowData.nativeRoute});
                me.tearOutConnectAdmissions.set(itemId, admission)
            }
            return
        }

        if (!me.consumeVesselOwnerGrant({data, flow, generation, grant, itemId, windowId})) return;

        // A granted tear-out embodies immediately: the same live pane moves into the vessel while
        // a hidden exact-slot placeholder keeps source tab/card indices coherent. Model truth
        // remains untouched until the terminal.
        const
            admission  = {admissionToken, generation, invalidated: false, windowId},
            connection = {windowId};

        Object.defineProperties(connection, {
            admissionToken: {value: admissionToken},
            generation    : {value: generation},
            nativeRoute   : {value: data.windowData.nativeRoute}
        });
        Object.defineProperty(admission, 'nativeRoute', {value: data.windowData.nativeRoute});
        me.tearOutConnectAdmissions.set(itemId, admission);

        const staged = await me.tearOutEmbodiment.stage({itemId, windowId});

        // A re-entry/cancel may retire the semantic vessel while the cross-window render
        // transaction is still painting. The exact admission token is durable across a close
        // acknowledgement clearing the transient retirement fence, so a dead generation can
        // never resume here and publish itself after its disconnect already fired.
        if (
            me.tearOutConnectAdmissions.get(itemId) !== admission || admission.invalidated ||
            me.tearOutRetirements.has(itemId)
        ) {
            staged && me.tearOutEmbodiment.restore({itemId, windowId});
            return
        }

        me.tearOutConnectAdmissions.delete(itemId);

        if (me.tearOutPanes[itemId]) {
            Object.assign(me.tearOutPanes[itemId], connection);
            Object.defineProperties(me.tearOutPanes[itemId], {
                admissionToken: {configurable: true, value: admissionToken, writable: true},
                generation    : {configurable: true, value: generation, writable: true},
                nativeRoute   : {configurable: true, value: data.windowData.nativeRoute, writable: true}
            });

            if (staged) {
                me.tearOutEmbodiment.promote({itemId, windowId})
            } else {
                me.reparentTearOutPane(itemId, connection)
            }
        } else {
            me.tearOutConnects[itemId] = connection
        }
    }

    /**
     * A vessel window left the shared heap. Physical death is authoritative: clear every state
     * owner so a successor gesture cannot inherit or be blocked by the retired generation, and
     * bring a committed item HOME (model commit precedes every render effect; the reintegration
     * is exact-once and idempotent).
     * @param {Object} data `{appName, windowId}`
     */
    onWindowDisconnect(data) {
        let me = this;

        if (me.isDestroyed) return;

        // A child can disconnect while its live-pane stage is still awaiting renderer settlement.
        // The connect is not in tearOutConnects yet, so this private generation token is the only
        // exact owner. Retire it now; the stage continuation observes the deleted token and cannot
        // republish the dead window.
        for (const [itemId, admission] of me.tearOutConnectAdmissions) {
            if (admission.windowId === data.windowId) {
                const
                    committed  = Boolean(me.tearOutPanes[itemId]),
                    windowName = `tearout-${itemId}`;

                me.tearOutConnectAdmissions.delete(itemId);
                me.tearOutRetirements.add(itemId);

                if (me.tearOutEmbodiment.isStaged(itemId)) {
                    me.tearOutEmbodiment.restore({itemId, windowId: data.windowId})
                }

                me.tearOutHandlers.onVesselRetired({
                    admissionToken: admission.admissionToken,
                    generation    : admission.generation,
                    itemId,
                    windowName
                });
                me.revokeVesselOwnerGrant('tear-out', itemId);
                me.tearOutRetirements.delete(itemId);
                delete me.tearOutPanes[itemId];
                committed && me.reintegrateTearOutItem(itemId);
                return
            }
        }

        // A pre-terminal tear-out may disconnect after an exact close returned false (the native
        // event can outrun its Boolean acknowledgement) or after the user closes the retained
        // window manually. Clear BOTH state owners.
        for (const [itemId, entry] of Object.entries(me.tearOutConnects)) {
            if (entry.windowId === data.windowId) {
                const windowName = `tearout-${itemId}`;

                me.tearOutRetirements.add(itemId);

                if (me.tearOutEmbodiment.isStaged(itemId)) {
                    const sourceOwns = Boolean(DockZoneModel.findContainingTabsId(me.dockModel, itemId));

                    me.tearOutEmbodiment[sourceOwns ? 'restore' : 'promote']({itemId, windowId: entry.windowId})
                }

                delete me.tearOutConnects[itemId];
                me.tearOutHandlers.onVesselRetired({
                    admissionToken: entry.admissionToken,
                    generation    : entry.generation,
                    itemId,
                    windowName
                });
                me.revokeVesselOwnerGrant('tear-out', itemId);
                me.tearOutRetirements.delete(itemId);
                return
            }
        }

        // Tear-out vessel death after the commit: the item comes HOME. A pre-terminal disconnect
        // has no entry in either map and needs nothing.
        for (const [itemId, entry] of Object.entries(me.tearOutPanes)) {
            if (entry.windowId === data.windowId) {
                const windowName = entry.windowName ?? `tearout-${itemId}`;

                delete me.tearOutPanes[itemId];
                delete me.tearOutConnects[itemId];
                me.tearOutRetirements.delete(itemId);
                me.tearOutHandlers.onVesselRetired({
                    admissionToken: entry.admissionToken,
                    generation    : entry.generation,
                    itemId,
                    windowName
                });
                me.reintegrateTearOutItem(itemId);
                break
            }
        }
    }

    /**
     * @summary The app-owned tear-out journey executor — scene 2's real-pointer drive.
     *
     * Arms a tab drag, flings the proxy past the window boundary so
     * {@link Neo.dashboard.DockTabSortZone} fires `dockTearOutExit`, the host opens a `?popout=`
     * vessel, then — gated on that vessel's ACTUAL birth ({@link #onWindowConnect}) — survives
     * deliberate post-birth moves and settles one of three terminals: release while detached
     * (`dockTearOutTerminal` → the `detachItem` commit + adoption), Escape-cancel (zero-mutation
     * vessel close), or RE-ENTRY (`reenter` — the drag walks back inside past the reattach
     * threshold, the vessel retires MID-GESTURE with zero mutation and the in-window proxy
     * resumes: the film's back-IN morph beat, then cancelled cleanly).
     *
     * The proof is OBSERVABLE-ONLY — committed document truth + vessel bookkeeping, never the
     * machine's internal drag state. Path and pace are tunable for the film takes (D-010):
     * `curve` bows the pointer path (0 = straight, deterministic either way), `moveSteps` and
     * `moveDelay` set the sampling density and rhythm.
     * @param {Object} step
     * @param {String} step.itemId The dock item to tear out.
     * @param {String} step.sourceNodeId The tabs node currently holding it.
     * @param {Object} [options={}]
     * @param {Number} [options.birthAttempts=180] Vessel-birth poll attempts (16ms each) — film
     *     pacing widens this: vsync-limited boot can push the popup's shared-heap join past the
     *     default three-second gate.
     * @param {Boolean} [options.cancel=false] Escape while detached — the zero-mutation witness.
     * @param {Number} [options.curve=0] Perpendicular path bow as a fraction of path length.
     * @param {Number} [options.moveDelay=16] Milliseconds between pointer samples.
     * @param {Number} [options.moveSteps=4] Pointer samples per path leg.
     * @param {Number} [options.postBirthMoves=2] Outward moves after birth (survival probe; floored at 2).
     * @param {Boolean} [options.reenter=false] Walk back inside instead of releasing — the morph witness.
     * @returns {Promise<Object>}
     */
    async executeTearOutStep(step, {birthAttempts=180, cancel=false, curve=0, moveDelay=16, moveSteps=4, postBirthMoves=2, reenter=false}={}) {
        let me                     = this,
            {itemId, sourceNodeId} = step || {},
            document               = me.dockModel,
            node                   = document?.nodes?.[sourceNodeId],
            button                 = null,
            release                = null;

        if (!itemId || node?.type !== 'tabs' || !node.items.includes(itemId)) {
            return {applied: false, errors: ['tear-out step must name a live item held by a tabs node']}
        }

        let pane = me.paneCache[itemId];

        if (!pane || pane.isDestroyed || !document.items?.[itemId]) {
            return {applied: false, errors: ['source pane is not live and owned by the workspace']}
        }

        try {
            // Drain the host-owned projection queue before reading tab chrome.
            await me.refreshPromise;

            let host          = me.getReference('dock-host'),
                tabs          = host?.down({dockNodeId: sourceNodeId}),
                sortZone      = tabs?.getTabBar()?.sortZone,
                itemIndex     = node.items.indexOf(itemId),
                WindowManager = (await import('../../../src/manager/Window.mjs')).default;

            button = tabs?.getTabAtIndex(itemIndex);

            let window       = WindowManager.get(button?.windowId),
                [buttonRect] = button ? await button.getDomRect([button.id], button.windowId) : [];

            if (!button || !sortZone || !buttonRect || !window?.innerRect) {
                return {applied: false, errors: ['tear-out gesture surfaces are not ready']}
            }

            // The committed document BEFORE the gesture — the zero-mutation (cancel/reenter) and
            // detach-commit (terminal) proofs both compare against this snapshot.
            let documentBefore = DockZoneModel.clone(document),
                catalogBefore  = Object.keys(documentBefore.items);

            let startX  = buttonRect.x + buttonRect.width / 2,
                startY  = buttonRect.y + buttonRect.height / 2,
                startSX = window.innerRect.x + startX,
                startSY = window.innerRect.y + startY,
                opt     = (clientX, clientY, screenX, screenY, buttons) => ({
                    bubbles: true, button: 0, buttons, cancelable: true, clientX, clientY, screenX, screenY
                }),
                moveTo  = (x, y) => me.interactionService.simulateEvent({events: [{
                    delay  : moveDelay, targetId: button.id, type: 'mousemove', windowId: button.windowId,
                    options: opt(x, y, window.innerRect.x + x, window.innerRect.y + y, 1)
                }]});

            // A stale record from a prior gesture would false-open the birth gate.
            delete me.tearOutConnects[itemId];

            // Phase 1: own the native sensor + cross the LOCAL drag arming threshold (delay+distance).
            await me.interactionService.simulateEvent({events: [{
                targetId: button.id, type: 'mousedown', windowId: button.windowId,
                options : opt(startX, startY, startSX, startSY, 1)
            }, {
                delay  : 120, targetId: button.id, type: 'mousemove', windowId: button.windowId,
                options: opt(startX + 8, startY + 2, startSX + 8, startSY + 2, 1)
            }, {
                delay  : 16, targetId: button.id, type: 'mousemove', windowId: button.windowId,
                options: opt(startX + 16, startY + 24, startSX + 16, startSY + 24, 1)
            }]});

            // The drag arms ASYNC — gate on proxy + boundary + itemRects before any outward sample
            // or the exit never fires (arming precedes boundary moves).
            let armed = await me.waitForTearOutDragArmed(sortZone);

            if (!armed) {
                let cancellation = await me.cancelTearOutGesture(button, {clientX: startX, clientY: startY, screenX: startSX, screenY: startSY});

                return {applied: false, errors: ['tear-out drag did not arm'], proof: {armed: false, cancellation, documentBefore}}
            }

            // Pre-birth entry sentinels: a curved outward path can transiently re-cover the strip
            // AFTER the exit fired, retiring the newborn vessel before it ever connects — the
            // birth-failure diag must carry whether that happened, or the death reads as absence.
            let preBirthBoundaryEntries = 0,
                preBirthEntries         = 0,
                preBirthBoundaryProbe   = () => {preBirthBoundaryEntries++},
                preBirthEntryProbe      = () => {preBirthEntries++};

            sortZone.on('dragBoundaryEntry', preBirthBoundaryProbe);
            tabs.on('dockTearOutEntry', preBirthEntryProbe);

            // The tear-out exit fires when the proxy LEAVES `boundaryContainerRect`. Target past
            // its bottom-right corner, fully outside, so intersectionRatio collapses below the
            // reattach threshold.
            let b       = sortZone.boundaryContainerRect,
                bRight  = b.right  ?? (b.x + b.width),
                bBottom = b.bottom ?? (b.y + b.height),
                outX    = Math.round(bRight  + 120),
                outY    = Math.round(bBottom + 120),
                outSX   = window.innerRect.x + outX,
                outSY   = window.innerRect.y + outY;

            release = {clientX: outX, clientY: outY, screenX: outSX, screenY: outSY};

            // The deterministic pointer path: a quadratic bow through a perpendicular control
            // point (curve=0 degenerates to the straight line). t runs 0→1 outward.
            let pathPoint = t => {
                let mx = startX + (outX - startX) / 2 + (outY - startY) * curve,
                    my = startY + (outY - startY) / 2 - (outX - startX) * curve,
                    ax = startX + (mx - startX) * t, ay = startY + (my - startY) * t,
                    bx = mx + (outX - mx) * t,       by = my + (outY - my) * t;

                return {x: Math.round(ax + (bx - ax) * t), y: Math.round(ay + (by - ay) * t)}
            };

            // Phase 2: PROGRESSIVE outward moves — each further out so intersectionRatio steps
            // down: dragBoundaryExit → dockTearOutExit → the host acquires the vessel.
            for (let stepIndex = 1; stepIndex <= moveSteps; stepIndex++) {
                let p = pathPoint(stepIndex / moveSteps);

                await moveTo(p.x, p.y)
            }

            // Gate on the vessel's ACTUAL birth: a `?popout=` window connecting through onWindowConnect.
            let born = await me.waitForTearOutVessel(itemId, {attempts: birthAttempts});

            sortZone.un('dragBoundaryEntry', preBirthBoundaryProbe);
            tabs.un('dockTearOutEntry', preBirthEntryProbe);

            if (!born) {
                let diag         = `exitFired=${Boolean(sortZone.isWindowDragging)} vesselOpen=${JSON.stringify(me.lastVesselOpen ?? null)} preBirthBoundaryEntries=${preBirthBoundaryEntries} preBirthEntries=${preBirthEntries} lastRatio=${sortZone.lastIntersectionRatio} boundary=${JSON.stringify(b)} out=(${outX},${outY}) itemRects=${sortZone.itemRects?.length ?? 'null'}`,
                    cancellation = await me.cancelTearOutGesture(button, release);

                return {
                    applied: false,
                    errors : [`tear-out vessel was not born after the boundary exit — ${diag}`],
                    proof  : {armed: true, born: false, diag, cancellation, documentBefore}
                }
            }

            // Post-birth survival probe: deliberate OUTWARD moves must NOT reap the newborn vessel.
            let probeMoves = Math.max(2, postBirthMoves);

            for (let i = 1; i <= probeMoves; i++) {
                await moveTo(outX, outY + i * 12)
            }

            let survivedProbe = Boolean(me.tearOutConnects[itemId]);

            if (reenter) {
                // The morph beat: walk back INSIDE until the PROXY re-enters past the reattach
                // threshold — dockTearOutEntry retires the vessel MID-GESTURE with zero mutation
                // and the zone resumes its in-window embodiment. Then end the resumed in-window
                // drag with a clean cancel; the document stays byte-identical.
                //
                // The re-entry target is a point ~35% into the boundary rect, NOT the source
                // button: the tear-out proxy is pane-sized and the grab corner is unknown, so a
                // button near a window edge can never recover 60% overlap — the interior point
                // guarantees the ratio for any grab corner.
                let vesselWindowId    = me.tearOutConnects[itemId]?.windowId ?? null,
                    inX               = Math.round(b.x + (b.width  ?? 0) * 0.35),
                    inY               = Math.round(b.y + (b.height ?? 0) * 0.35),
                    boundaryEntrySeen = false,
                    entrySeen         = false,
                    boundaryProbe     = () => {boundaryEntrySeen = true},
                    entryProbe        = () => {entrySeen = true};

                sortZone.on('dragBoundaryEntry', boundaryProbe);
                tabs.on('dockTearOutEntry', entryProbe);

                for (let stepIndex = 1; stepIndex <= moveSteps; stepIndex++) {
                    let t = stepIndex / moveSteps;

                    await moveTo(
                        Math.round(outX + (inX - outX) * t),
                        Math.round(outY + (inY - outY) * t)
                    )
                }

                let retired     = await me.waitForTearOutVesselRetired(itemId),
                    reentryDiag = `boundaryEntrySeen=${boundaryEntrySeen} entrySeen=${entrySeen} isWindowDragging=${Boolean(sortZone.isWindowDragging)} reattachArmed=${Boolean(sortZone.reattachArmed)} lastRatio=${sortZone.lastIntersectionRatio} placeholder=${Boolean(sortZone.dragPlaceholder)} indexMap=${JSON.stringify(sortZone.indexMap)} ownerItems=${sortZone.owner?.items?.length} itemRectsLen=${sortZone.itemRects?.length} activeVessel=${Boolean(me.tearOutHandlers.activeVessel)} connects=${Boolean(me.tearOutConnects[itemId])} staged=${me.tearOutEmbodiment.isStaged(itemId)} boundary=${JSON.stringify(b)} in=(${inX},${inY}) vesselDims=${JSON.stringify(me.tearOutVesselDims)}`;

                sortZone.un('dragBoundaryEntry', boundaryProbe);
                tabs.un('dockTearOutEntry', entryProbe);

                let
                    cancellation  = await me.cancelTearOutGesture(button, {clientX: inX, clientY: inY, screenX: window.innerRect.x + inX, screenY: window.innerRect.y + inY}),
                    documentAfter = DockZoneModel.clone(me.dockModel),
                    windowGone    = !vesselWindowId || !WindowManager.get(vesselWindowId);

                return {
                    applied  : false,
                    errors   : retired ? [] : [`vessel did not retire on re-entry — ${reentryDiag}`],
                    reentered: retired,
                    proof    : {
                        born              : true,
                        survivedProbe,
                        retired,
                        windowGone,
                        cancellation,
                        documentBefore,
                        documentAfter,
                        documentsUnchanged: JSON.stringify(documentBefore) === JSON.stringify(documentAfter),
                        vesselWindowName  : `tearout-${itemId}`
                    }
                }
            }

            if (cancel) {
                // Escape while detached → dockTearOutCancel → the host closes its vessel. The
                // committed document must be byte-identical — the zero-mutation invariant.
                let cancellation  = await me.cancelTearOutGesture(button, release),
                    documentAfter = DockZoneModel.clone(me.dockModel);

                return {
                    applied  : false,
                    cancelled: true,
                    errors   : [],
                    proof    : {
                        born              : true,
                        survivedProbe,
                        cancellation,
                        documentBefore,
                        documentAfter,
                        documentsUnchanged: JSON.stringify(documentBefore) === JSON.stringify(documentAfter),
                        vesselWindowName  : `tearout-${itemId}`
                    }
                }
            }

            // Terminal: release while detached → dockTearOutTerminal → the detachItem commit +
            // adoption (the vessel owns the pane now).
            await me.interactionService.simulateEvent({events: [{
                targetId: button.id, type: 'mouseup', windowId: button.windowId,
                options : opt(outX, outY, outSX, outSY, 0)
            }]});

            let committed      = await me.waitForTearOutCommit(itemId),
                documentAfter  = DockZoneModel.clone(me.dockModel),
                absentFromTree = !Object.values(documentAfter.nodes).some(zoneNode => zoneNode.items?.includes(itemId)),
                keptInCatalog  = Boolean(documentAfter.items?.[itemId]);

            return {
                applied: committed && absentFromTree && keptInCatalog,
                errors : committed && absentFromTree && keptInCatalog ? [] : ['detachItem commit did not reach committed document truth'],
                proof  : {
                    born              : true,
                    survivedProbe,
                    committed,
                    documentBefore,
                    documentAfter,
                    detachCommitted   : absentFromTree && keptInCatalog,
                    itemAbsentFromTree: absentFromTree,
                    itemKeptInCatalog : keptInCatalog,
                    catalogPreserved  : catalogBefore.every(id => Boolean(documentAfter.items?.[id])),
                    vesselWindowName  : `tearout-${itemId}`
                }
            }
        } catch (error) {
            button && await me.cancelTearOutGesture(button, release).catch(() => {});

            return {applied: false, errors: [error?.message || String(error)]}
        }
    }

    /**
     * Polls until the base drag has ARMED — a live proxy AND the async main-thread
     * `boundaryContainerRect` AND measured `itemRects` are all present: exactly the facts
     * the sort zone needs before it will sample a boundary exit.
     * @param {Neo.draggable.container.SortZone} sortZone
     * @param {Object} [options={}]
     * @param {Number} [options.attempts=120]
     * @param {Number} [options.delay=16]
     * @returns {Promise<Boolean>}
     * @protected
     */
    async waitForTearOutDragArmed(sortZone, {attempts=120, delay=16}={}) {
        let me    = this,
            armed = () => Boolean(sortZone?.dragProxy && sortZone?.boundaryContainerRect && sortZone?.itemRects);

        for (let attempt = 0; attempt <= attempts && !me.isDestroyed; attempt++) {
            if (armed()) return true;

            attempt < attempts && await me.timeout(delay)
        }

        return armed()
    }

    /**
     * Gates on the tear-out vessel's ACTUAL birth: the `?popout=<itemId>` window connecting
     * through {@link #onWindowConnect}. Polls that observable rather than any internal drag flag.
     * @param {String} itemId
     * @param {Object} [options={}]
     * @param {Number} [options.attempts=180]
     * @param {Number} [options.delay=16]
     * @returns {Promise<Boolean>}
     * @protected
     */
    async waitForTearOutVessel(itemId, {attempts=180, delay=16}={}) {
        let me = this;

        for (let attempt = 0; attempt <= attempts && !me.isDestroyed; attempt++) {
            if (me.tearOutConnects[itemId] || me.tearOutPanes[itemId]) return true;

            attempt < attempts && await me.timeout(delay)
        }

        return Boolean(me.tearOutConnects[itemId] || me.tearOutPanes[itemId])
    }

    /**
     * Gates on a re-entry retirement fully settling: no connect entry, no pending admission,
     * no staged embodiment, and the tear-out machine's slot cleared.
     * @param {String} itemId
     * @param {Object} [options={}]
     * @param {Number} [options.attempts=180]
     * @param {Number} [options.delay=16]
     * @returns {Promise<Boolean>}
     * @protected
     */
    async waitForTearOutVesselRetired(itemId, {attempts=180, delay=16}={}) {
        let me      = this,
            retired = () => Boolean(
                !me.tearOutConnects[itemId] && !me.tearOutConnectAdmissions.has(itemId) &&
                !me.tearOutEmbodiment.isStaged(itemId) && !me.tearOutHandlers.activeVessel
            );

        for (let attempt = 0; attempt <= attempts && !me.isDestroyed; attempt++) {
            if (retired()) return true;

            attempt < attempts && await me.timeout(delay)
        }

        return retired()
    }

    /**
     * Gates on the committed detach reaching document truth: the item leaves every node's
     * `items` (the vessel owns it) while the catalog entry stays.
     * @param {String} itemId
     * @param {Object} [options={}]
     * @param {Number} [options.attempts=180]
     * @param {Number} [options.delay=16]
     * @returns {Promise<Boolean>}
     * @protected
     */
    async waitForTearOutCommit(itemId, {attempts=180, delay=16}={}) {
        let me       = this,
            detached = () => {
                let document = me.dockModel;

                return !Object.values(document.nodes).some(zoneNode => zoneNode.items?.includes(itemId))
                    && Boolean(document.items?.[itemId])
            };

        for (let attempt = 0; attempt <= attempts && !me.isDestroyed; attempt++) {
            if (detached()) return true;

            attempt < attempts && await me.timeout(delay)
        }

        return detached()
    }

    /**
     * Cancels a live tear-out gesture: an Escape keydown (the drag-cancel signal the sort zone
     * consumes) followed by a settling mouseup.
     * @param {Neo.component.Base} button The dragged tab button.
     * @param {Object} release `{clientX, clientY, screenX, screenY}` the release point.
     * @returns {Promise<Object>}
     * @protected
     */
    async cancelTearOutGesture(button, release) {
        let me = this;

        if (!button) return {escapeDispatched: false, releaseDispatched: false, settled: false};

        let {clientX=0, clientY=0, screenX=0, screenY=0} = release || {},
            escapeDispatched = await me.interactionService.dispatch({
                id      : button.id,
                type    : 'keydown',
                windowId: button.windowId,
                options : {bubbles: true, cancelable: true, code: 'Escape', key: 'Escape'}
            }),
            releaseDispatched = await me.interactionService.dispatch({
                id      : button.id,
                type    : 'mouseup',
                windowId: button.windowId,
                options : {bubbles: true, button: 0, buttons: 0, cancelable: true, clientX, clientY, screenX, screenY}
            });

        return {escapeDispatched, releaseDispatched, settled: true}
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

        Neo.currentWorker.un({
            connect   : me.onWindowConnect,
            disconnect: me.onWindowDisconnect,
            scope     : me
        });

        me.tourRunner?.destroy();
        me.dockService?.destroy();
        me.dragAffordances?.destroy();
        me.interactionService?.destroy();
        me.tearOutEmbodiment?.destroy();
        me.cueSettlements.clear();

        Object.values(me.paneCache).forEach(pane => {
            pane?.isDestroyed || pane?.destroy?.()
        });
        me.paneCache = {};

        super.destroy(...args)
    }
}

export default Neo.setupClass(Workspace);
