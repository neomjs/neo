import Component                          from '../../../../../src/component/Base.mjs';
import Container                          from '../../../../../src/container/Base.mjs';
import CounterPane                        from './CounterPane.mjs';
import DockDropIndicators                 from '../../../../../src/dashboard/DockDropIndicators.mjs';
import DockLayoutAdapter                  from '../../../../../src/dashboard/DockLayoutAdapter.mjs';
import DockMotionSignal                   from '../../../../../src/dashboard/DockMotionSignal.mjs';
import DockPerspectiveStore               from '../../../../../src/dashboard/DockPerspectiveStore.mjs';
import DockPreview                        from '../../../../../src/dashboard/DockPreview.mjs';
import DockPreviewProducer                from '../../../../../src/dashboard/DockPreviewProducer.mjs';
import DockProjectionReconciler           from '../../../../../src/dashboard/DockProjectionReconciler.mjs';
import DockService                        from '../../../../../src/ai/client/DockService.mjs';
import DockTopologyReconciler             from '../../../../../src/dashboard/DockTopologyReconciler.mjs';
import DockZoneModel                      from '../../../../../src/dashboard/DockZoneModel.mjs';
import InteractionService                 from '../../../../../src/ai/client/InteractionService.mjs';
import TourRunner                         from '../../../../../src/ai/client/TourRunner.mjs';
import {previewToOperation}               from '../../../../../src/dashboard/dockPreviewContract.mjs';
import {demoBTourScript, initialDocument} from '../../../tour/demoBPerspectives.mjs';
import '../../../../../src/button/Base.mjs';   // registers the `button` ntype the bars compose
import '../../../../../src/tab/Container.mjs'; // registers the `tab-container` ntype the projection emits
import '../../../../../src/toolbar/Base.mjs';  // registers the `toolbar` ntype the bars use

/**
 * @summary The Demo-B showcase workspace: named perspectives that MORPH, and a pane that
 * leaves for its own OS window and returns with its state unbroken — the only-Neo story.
 *
 * Same reducer-container ownership pattern as Demo A (committed `dockZone.v1` document as
 * the single source of truth; the pure reducer + view-sync halves of the dock-holder
 * contract), plus the two capabilities this demo exists to show:
 *
 * - **Perspectives** ride a {@link Neo.dashboard.DockPerspectiveStore}: ordinary views are
 *   window-scoped; the detached view captures BOTH worker-owned workspace documents through
 *   `captureTopologyPerspective`. Loading that record composes the real
 *   {@link Neo.dashboard.DockTopologyReconciler} and renders its structured remainder.
 *   The switcher bar rebuilds from store lifecycle events — buttons are born from
 *   `perspectiveSaved`, never hardcoded.
 * - **Pop-out** rides the shared-heap vessel: panes are INSTANCE-CACHED (created once,
 *   handed across every re-projection by `DockProjectionReconciler`), so detaching the
 *   workbench moves the LIVE component into the popup window's view tree
 *   (`mainView.add(instance)` — both windows share one App Worker) and reattaching moves it
 *   home. The {@link AgentOS.childapps.dockdemo.view.CounterPane} witness makes the
 *   reparent-never-recreate contract visible: its count survives because its instance does.
 *   Document honesty: pop-out and reattach use the atomic two-document `transferItem` seam,
 *   so ownership moves commit-or-neither while component reparenting stays orthogonal.
 *
 * @class AgentOS.childapps.dockdemo.view.DemoBWorkspace
 * @extends Neo.container.Base
 */
class DemoBWorkspace extends Container {
    /**
     * Shared coordinator registry key for the two active Demo-B workspaces.
     * @member {String} CROSS_WINDOW_SORT_GROUP='demo-b-cross-window'
     * @static
     */
    static CROSS_WINDOW_SORT_GROUP = 'demo-b-cross-window'
    /**
     * Stable worker-owned workspace id for the primary document.
     * @member {String} MAIN_WORKSPACE_ID='demo-b-main'
     * @static
     */
    static MAIN_WORKSPACE_ID = 'demo-b-main'
    /**
     * Stable worker-owned workspace id for the popup document.
     * @member {String} POPUP_WORKSPACE_ID='demo-b-popup'
     * @static
     */
    static POPUP_WORKSPACE_ID = 'demo-b-popup'

    static config = {
        /**
         * @member {String} className='AgentOS.childapps.dockdemo.view.DemoBWorkspace'
         * @protected
         */
        className: 'AgentOS.childapps.dockdemo.view.DemoBWorkspace',
        /**
         * Theme dependencies: the FM token bridge, the dock motion/token contract file (the
         * projected tree is plain containers; nothing loads it per-class), and Demo A's skin
         * (this workspace reuses its tourbar/pip/pane visual family — in `?demo=b` mode
         * Demo A never instantiates, so its sheet must be declared, not assumed).
         * @member {String[]} additionalThemeFiles
         */
        additionalThemeFiles: [
            'AgentOS.view.Viewport',
            'Neo.dashboard.Container',
            'AgentOS.childapps.dockdemo.view.DemoAWorkspace'
        ],
        /**
         * @member {String[]} cls=['agentos-dockdemo-workspace','agentos-dockdemo-workspace-b']
         */
        cls: ['agentos-dockdemo-workspace', 'agentos-dockdemo-workspace-b'],
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         */
        layout: {ntype: 'vbox', align: 'stretch'}
        // `items` is built in construct() — each projection carries the instance-bound
        // reducer + view-sync callbacks, so it cannot live in static config.
    }

    /**
     * The live committed dock-zone document — the single source of truth.
     * @member {Object|null} dockModel=null
     */
    dockModel = null
    /**
     * The popup render target's worker-owned dock-zone document. It participates in topology
     * capture while the live pane instance remains owned by {@link #paneCache}.
     * @member {Object|null} popupDocument=null
     */
    popupDocument = null
    /**
     * The app-side Neural Link dock seam (tour + agent drivability).
     * @member {Neo.ai.client.DockService|null} dockService=null
     */
    dockService = null
    /**
     * Existing ordered DOM-event driver used by the real two-window falsifier.
     * @member {Neo.ai.client.InteractionService|null} interactionService=null
     */
    interactionService = null
    /**
     * Runtime-only dock-preview producer shared by the two window surfaces.
     * @member {Neo.dashboard.DockPreviewProducer|null} dockPreviewProducer=null
     */
    dockPreviewProducer = null
    /**
     * The named-perspective home. Lifecycle events feed the switcher bar.
     * @member {Neo.dashboard.DockPerspectiveStore|null} perspectiveStore=null
     */
    perspectiveStore = null
    /**
     * The tour runner playing the Demo-B screenplay.
     * @member {Neo.ai.client.TourRunner|null} tourRunner=null
     */
    tourRunner = null
    /**
     * Pane instances by item id — created ONCE, handed across every re-projection and
     * parked for explicit window moves or an unrestored topology remainder, torn down only
     * with the workspace. THE object-permanence substrate: `resolvePane` hands the adapter
     * these live instances, so no morph or reattach recreates a pane. Moving an existing pane
     * into a different browser document still runs that render target's required mount lifecycle.
     * @member {Object} paneCache={}
     * @protected
     */
    paneCache = {}
    /**
     * Live render hosts keyed by worker-owned workspace id. The main host is a descendant of
     * this component; the popup host is a sibling render target beneath the second window's
     * viewport, so neither component-tree ancestry nor a window id owns document truth.
     * @member {Map<String,Neo.container.Base>} crossWindowHosts
     * @protected
     */
    crossWindowHosts = new Map()
    /**
     * Registered target-side participation adapters keyed by workspace id.
     * @member {Map<String,Neo.dashboard.DockCrossWindowParticipation>} crossWindowParticipations
     * @protected
     */
    crossWindowParticipations = new Map()
    /**
     * Paint-confirmed, window-local drag geometry keyed by workspace id.
     * @member {Map<String,Object>} crossWindowGeometry
     * @protected
     */
    crossWindowGeometry = new Map()
    /**
     * Runtime proof counters for the current gesture. A remote commit must produce one transfer,
     * one source-side remote-drop-out notification, and zero source-local drop callbacks.
     * @member {Object} crossWindowStats
     * @protected
     */
    crossWindowStats = {localDropFires: 0, remoteDropOutFires: 0, transferCommits: 0}
    /**
     * The popup render target currently bound to {@link #POPUP_WORKSPACE_ID}.
     * @member {String|null} crossWindowTargetWindowId=null
     * @protected
     */
    crossWindowTargetWindowId = null
    /**
     * Connect-settled promise for the deterministic two-window stage.
     * @member {Promise|null} crossWindowStagePromise=null
     * @protected
     */
    crossWindowStagePromise = null
    /**
     * Resolver for {@link #crossWindowStagePromise}; set before windowOpen so a cold, fast
     * connection cannot outrun the owner.
     * @member {Function|null} crossWindowStageResolve=null
     * @protected
     */
    crossWindowStageResolve = null
    /**
     * Rejecter for {@link #crossWindowStagePromise}.
     * @member {Function|null} crossWindowStageReject=null
     * @protected
     */
    crossWindowStageReject = null
    /**
     * Monotonic target-ownership generation. Every open attempt captures the current value;
     * disconnect and destroy advance it so an awaited popup mount cannot resurrect stale state.
     * @member {Number} crossWindowStageGeneration=0
     * @protected
     */
    crossWindowStageGeneration = 0
    /**
     * Whether projections opt into coordinator participation. Demo B starts enabled so every
     * source SortZone warms the coordinator off the gesture hot path; without a registered
     * remote target, ordinary in-window and legacy pop-out behavior remains unchanged.
     * @member {Boolean} crossWindowEnabled=true
     * @protected
     */
    crossWindowEnabled = true
    /**
     * Gesture settlement resolver installed before InteractionService dispatch.
     * @member {Function|null} crossWindowGestureResolve=null
     * @protected
     */
    crossWindowGestureResolve = null
    /**
     * Runtime-only source-zone and continuity snapshot for the gesture being driven.
     * @member {Object|null} crossWindowGestureContext=null
     * @protected
     */
    crossWindowGestureContext = null
    /**
     * Detached-pane bookkeeping: itemId → {tabsNodeId, windowId|null}. `tabsNodeId` is the
     * home the reattach commit targets; `windowId` fills in when the popup connects.
     * @member {Object} detachedPanes={}
     * @protected
     */
    detachedPanes = {}
    /**
     * Plain structured result of the most recent topology reconciliation. This is rendered
     * into the workspace so remainder semantics are visible rather than buried in logs.
     * @member {Object|null} restoreReport=null
     */
    restoreReport = null
    /**
     * The serialized projection queue. Exposing its settled promise keeps topology specs on
     * the same deferred view-sync boundary as the live tour instead of racing the next commit.
     * @member {Promise} refreshPromise=Promise.resolve()
     * @protected
     */
    refreshPromise = Promise.resolve()
    /**
     * Latest atomic projection request per worker-owned workspace. Document truth and
     * owner-preservation policy coalesce together; transaction metadata can never trail behind
     * and mutate a newer document.
     * @member {Map<String,Object>} workspaceProjectionRequests
     * @protected
     */
    workspaceProjectionRequests = new Map()
    /**
     * Beats executed in the current run — the pip strip's progress counter.
     * @member {Number} beatCount=0
     */
    beatCount = 0

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        me.dockModel        = DockZoneModel.clone(initialDocument);
        me.popupDocument    = DemoBWorkspace.createPopupDocument();
        me.dockPreviewProducer = Neo.create(DockPreviewProducer);
        me.dockService      = Neo.create(DockService, {});
        me.interactionService = Neo.create(InteractionService, {});
        me.perspectiveStore = Neo.create(DockPerspectiveStore, {});

        me.tourRunner = Neo.create(TourRunner, {
            componentId        : me.id,
            crossWindowExecutor: me,
            dockService        : me.dockService,
            mode               : 'demo',
            script             : demoBTourScript
        });

        me.tourRunner.on({
            beat    : me.onTourBeat,
            complete: me.onTourComplete,
            error   : me.onTourError,
            scene   : me.onTourScene,
            scope   : me
        });

        // switcher buttons are BORN from store lifecycle — never hardcoded
        me.perspectiveStore.on({
            collectionChange: me.syncSwitcher,
            scope           : me
        });

        // popup lifecycle: the pop-out pane reparents on connect, comes home on disconnect
        Neo.currentWorker.on({
            connect   : me.onWindowConnect,
            disconnect: me.onWindowDisconnect,
            scope     : me
        });

        me.add([me.createTourBar(), me.createSwitcherBar(), {
            cls      : ['agentos-dockdemo-restore-report'],
            hidden   : true,
            html     : '',
            ntype    : 'component',
            reference: 'restore-report-b'
        }, {
            module: Container,
            cls   : ['agentos-dockdemo-dock-host', 'neo-dashboard'],
            flex  : 1,
            items : [me.projectDockModel(), {
                module: DockPreview
            }, {
                module: DockDropIndicators
            }],
            layout   : {ntype: 'fit'},
            reference: 'dock-host-b'
        }]);

        me.crossWindowHosts.set(DemoBWorkspace.MAIN_WORKSPACE_ID, me.getReference('dock-host-b'))
    }

    /**
     * The pure reducer half of the holder contract.
     * @param {Object} descriptor
     * @returns {{document: Object, errors: String[]}}
     */
    applyDockZoneOperation(descriptor) {
        return DockZoneModel.applyOperation(this.dockModel, descriptor)
    }

    /**
     * Resolves worker-owned document truth by semantic workspace id.
     * @param {String} workspaceId
     * @returns {Object|null}
     */
    getWorkspaceDocument(workspaceId) {
        if (workspaceId === DemoBWorkspace.MAIN_WORKSPACE_ID) {
            return this.dockModel
        }

        if (workspaceId === DemoBWorkspace.POPUP_WORKSPACE_ID) {
            return this.popupDocument
        }

        return null
    }

    /**
     * Applies one ordinary single-document operation against a named live workspace.
     * @param {String} workspaceId
     * @param {Object} descriptor
     * @returns {{document:Object,errors:String[]}|null}
     * @protected
     */
    applyWorkspaceOperation(workspaceId, descriptor) {
        let document = this.getWorkspaceDocument(workspaceId);

        return document ? DockZoneModel.applyOperation(document, descriptor) : null
    }

    /**
     * Captures the CURRENT committed workspace state as a named perspective through the real
     * §2.2 path. Window scope persists the primary document; topology scope persists the
     * primary + popup documents with one composed fingerprint.
     * `replace: true` keeps tour reruns idempotent — re-capturing your own name is the
     * demo's update flow, not a collision dispute.
     * @param {String} name
     * @param {Object} [options={}]
     * @param {'window'|'topology'} [options.scope='window']
     * @returns {{saved: Boolean, errors: String[]}}
     */
    capturePerspective(name, {scope = 'window'} = {}) {
        let me       = this,
            metadata = {
                layoutId       : `demo-b-${name.toLowerCase()}`,
                perspectiveName: name,
                title          : name
            },
            created;

        if (scope !== 'window' && scope !== 'topology') {
            return {errors: [`unknown perspective capture scope "${scope}"`], saved: false}
        }

        created = scope === 'topology'
            ? DockZoneModel.captureTopologyPerspective([me.dockModel, me.popupDocument], metadata)
            : DockZoneModel.createSavedLayout(me.dockModel, metadata);

        if (created.errors.length) {
            return {errors: created.errors, saved: false}
        }

        let result = me.perspectiveStore.savePerspective(created.layout, {replace: true});

        return {errors: result.errors, saved: result.saved}
    }

    /**
     * The switcher bar: one button per stored perspective (rebuilt from store lifecycle
     * events) + the capture button. Real `button.Base` children riding the handler contract.
     * @returns {Object}
     */
    createSwitcherBar() {
        let me = this;

        return {
            cls      : ['agentos-dockdemo-switcher'],
            flex     : 'none',
            layout   : {ntype: 'hbox', align: 'center'},
            ntype    : 'toolbar',
            reference: 'switcher-bar',
            items    : [{
                cls  : ['agentos-dockdemo-switcher-label'],
                html : 'Perspectives',
                ntype: 'component',
                style: {marginRight: '8px', opacity: 0.7, whiteSpace: 'nowrap'}
            }]
        }
    }

    /**
     * The tour bar — play button, caption feed, pip strip (the Demo-A pattern).
     * @returns {Object}
     */
    createTourBar() {
        let me = this;

        return {
            cls   : ['agentos-dockdemo-tourbar'],
            flex  : 'none',
            layout: {ntype: 'hbox', align: 'center'},
            ntype : 'toolbar',
            items : [{
                cls      : ['agentos-dockdemo-tour-play'],
                handler  : () => me.startTour(),
                iconCls  : 'fa fa-play',
                ntype    : 'button',
                reference: 'tour-play-b',
                text     : 'Tour'
            }, {
                cls      : ['agentos-dockdemo-tour-caption'],
                flex     : 1,
                html     : `${demoBTourScript.title} — press Tour: three perspectives get captured live, morph into each other, and a pane leaves for its own OS window without dropping a beat.`,
                ntype    : 'component',
                reference: 'tour-caption-b',
                style    : {padding: '0 12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}
            }, {
                cls      : ['agentos-dockdemo-tour-pips'],
                flex     : 'none',
                ntype    : 'component',
                reference: 'tour-pips-b',
                vdom     : {cn: DemoBWorkspace.totalBeats().map(() => ({cls: ['agentos-dockdemo-pip']}))}
            }]
        }
    }

    /**
     * The read half of the dock-holder contract.
     * @returns {Object}
     */
    getDockZoneDocument() {
        return this.dockModel
    }

    /**
     * Loads a stored perspective. Window-scope records commit the restored primary document;
     * topology-scope records go through the changed-topology reconciler and expose its remainder.
     * @param {String} name
     * @returns {{loaded: Boolean, errors: String[], report: (Object|undefined)}}
     */
    loadPerspectiveByName(name) {
        let me         = this,
            summary    = me.perspectiveStore.list().find(entry => entry.perspectiveName === name || entry.layoutId === name),
            collection = me.perspectiveStore.collection,
            layout     = summary ? collection.layouts[summary.layoutId] : null;

        // Reconcile BEFORE `loadPerspective` advances the store's active id. A malformed
        // topology record or live document must leave both layout truth and selection truth
        // untouched — fail-closed means more than avoiding a document assignment.
        if (layout?.captureScope === 'topology') {
            let preview = me.restoreTopologyPerspective(layout, {commit: false});

            if (!preview.loaded) return preview;

            let activated = me.perspectiveStore.loadPerspective(name);

            if (activated.errors.length) {
                return {errors: activated.errors, loaded: false, report: preview.report}
            }

            me.commitTopologyRestore(preview);

            return {errors: [], loaded: true, report: preview.report}
        }

        let result = me.perspectiveStore.loadPerspective(name);

        if (result.errors.length || !result.document) {
            return {errors: result.errors, loaded: false}
        }

        me.onDockZoneDocumentChange(result.document);

        return {errors: [], loaded: true}
    }

    /**
     * @summary Commits a validated topology result while preserving panes that remain owner-held
     * but cannot be projected because their captured window is not live.
     * @param {Object} result
     * @param {Object[]} result.documents Reconciled documents for the currently live topology.
     * @param {Boolean} result.hasLivePopup Whether a second render target currently exists.
     * @param {Object} result.report Structured reconciliation remainder.
     * @returns {Promise}
     * @protected
     */
    commitTopologyRestore({documents, hasLivePopup, report}) {
        let me              = this,
            liveDocuments   = hasLivePopup ? documents.slice(0, 2) : documents.slice(0, 1),
            liveItemIds     = new Set(liveDocuments.flatMap(document => Object.keys(document?.items || {}))),
            preserveItemIds = (report?.unrestored || [])
                .map(entry => entry.itemId)
                .filter(itemId => !liveItemIds.has(itemId));

        hasLivePopup && (me.popupDocument = documents[1]);

        return me.onWorkspaceDocumentChange(DemoBWorkspace.MAIN_WORKSPACE_ID, documents[0], {
            preserveItemIds
        })
    }

    /**
     * @summary Reconciles one topology record onto the currently live workspace documents.
     * A connected/detached popup contributes its worker-owned document; otherwise the live
     * topology is intentionally one window. Validation errors mutate neither document.
     * @param {Object} layout A topology-scope saved-layout record.
     * @param {Object} [options={}]
     * @param {Boolean} [options.commit=true] Commit reconciled documents; false is a preflight.
     * @returns {{loaded: Boolean, errors: String[], report: Object, documents: Object[], hasLivePopup: Boolean}}
     */
    restoreTopologyPerspective(layout, {commit = true} = {}) {
        let me            = this,
            hasLivePopup  = Object.keys(me.detachedPanes).length > 0,
            liveDocuments = hasLivePopup ? [me.dockModel, me.popupDocument] : [me.dockModel],
            result        = DockTopologyReconciler.reconcile(layout, liveDocuments),
            report        = DockZoneModel.clone({
                applied        : result.applied,
                displaced      : result.displaced,
                errors         : result.errors,
                mapping        : result.mapping,
                noWindowSpawned: true,
                unmatchedLive  : result.unmatchedLive,
                unrestored     : result.unrestored
            });

        me.restoreReport = report;
        me.renderRestoreReport();

        if (result.errors.length) {
            return {documents: result.documents, errors: result.errors, hasLivePopup, loaded: false, report}
        }

        commit && me.commitTopologyRestore({documents: result.documents, hasLivePopup, report});

        return {documents: result.documents, errors: [], hasLivePopup, loaded: true, report}
    }

    /**
     * @summary Renders the structured topology remainder into a dedicated visible strip.
     * Item ids are escaped because saved layouts are data, not trusted markup.
     * @protected
     */
    renderRestoreReport() {
        let me     = this,
            target = me.getReference('restore-report-b'),
            report = me.restoreReport,
            escape = value => String(value)
                .replaceAll('&', '&amp;')
                .replaceAll('<', '&lt;')
                .replaceAll('>', '&gt;'),
            entries = values => values.length
                ? values.map(entry => `${escape(entry.itemId)} (${escape(entry.reason)})`).join(', ')
                : 'none';

        if (!target || !report) return;

        target.html = report.errors.length
            ? `<strong>Topology restore rejected.</strong> Validation failed; live documents stayed untouched. ${report.errors.map(escape).join('; ')}`
            : `<strong>Topology restore — no window spawned.</strong> Unrestored: ${entries(report.unrestored)}. Displaced: ${report.displaced.length ? report.displaced.map(entry => escape(entry.itemId)).join(', ') : 'none'}. Unmatched live slots: ${report.unmatchedLive.length ? report.unmatchedLive.join(', ') : 'none'}.`;
        target.hidden = false
    }

    /**
     * The view-sync half: stores the committed document and re-projects, deferred one tick
     * (the normative guard — a committing interaction surface is never destroyed mid-handler).
     * @param {Object} document
     * @returns {Promise}
     */
    onDockZoneDocumentChange(document) {
        return this.onWorkspaceDocumentChange(DemoBWorkspace.MAIN_WORKSPACE_ID, document)
    }

    /**
     * @summary Publishes one named workspace document, then serializes a deferred projection refresh.
     *
     * Ordinary queued refreshes coalesce onto the latest worker-owned document for that
     * workspace; the atomic cross-window commit owns its explicit target-first pair separately.
     * @param {String} workspaceId
     * @param {Object} document
     * @param {Object} [options={}] Projection-lifecycle options
     * @param {Iterable<String>} [options.preserveItemIds=[]] Owner-held panes absent from this
     * document which the shared reconciler must park instead of destroy.
     * @returns {Promise}
     * @protected
     */
    onWorkspaceDocumentChange(workspaceId, document, {preserveItemIds = []} = {}) {
        let me      = this,
            request = {document, preserveItemIds: [...preserveItemIds]};

        if (workspaceId === DemoBWorkspace.MAIN_WORKSPACE_ID) {
            me.dockModel = document
        } else if (workspaceId === DemoBWorkspace.POPUP_WORKSPACE_ID) {
            me.popupDocument = document
        } else {
            return Promise.reject(new Error(`unknown Demo-B workspace "${workspaceId}"`))
        }

        me.workspaceProjectionRequests.set(workspaceId, request);
        me.refreshPromise = me.refreshPromise
            .then(() => me.timeout(0))
            .then(() => {
                if (!me.isDestroyed) {
                    const latest = me.workspaceProjectionRequests.get(workspaceId);

                    return me.refreshWorkspace(workspaceId, latest.document, {
                        preserveItemIds: latest.preserveItemIds
                    })
                }
            });

        return me.refreshPromise
    }

    /**
     * Caption feed + pip progress + the surface cues that make narrated beats EXECUTABLE:
     * perspective saves/loads ride the store, pop-out/reattach ride the vessel — none of
     * them are dock-document ops, so none of them masquerade as descriptors.
     * @param {Object} data The runner's beat payload.
     */
    onTourBeat(data) {
        let me    = this,
            {cue} = data;

        data.caption && me.setTourCaption(data.caption);
        me.setPipProgress(++me.beatCount);

        if (!cue) return;

        cue.type === 'perspective-save' && me.capturePerspective(cue.name, {scope: cue.scope});
        cue.type === 'perspective-load' && me.loadPerspectiveByName(cue.name);
        cue.type === 'popout'           && me.popOutPane(cue.itemId);
        cue.type === 'reattach'         && me.reattachPane(cue.itemId)
    }

    /**
     * @param {Object} data `{completed, errors, log}`
     */
    onTourComplete(data) {
        let me = this;

        me.setTourCaption(`Tour complete — ${data.log.length} beats; the workbench counter never reset.`);
        me.setPipProgress(DemoBWorkspace.totalBeats().length)
    }

    /**
     * Honest failure surface: an aborted tour names its reason.
     * @param {Object} data `{errors, log}`
     */
    onTourError(data) {
        this.setTourCaption(`Tour stopped: ${data.errors[0] || 'unknown reason'}`)
    }

    /**
     * @param {Object} data The runner's scene payload.
     */
    onTourScene(data) {
        this.setTourCaption(`${data.title}${data.caption ? ' — ' + data.caption : ''}`)
    }

    /**
     * Creates the target-side participation adapter lazily after the popup window has joined.
     * The dynamic import keeps the DragCoordinator/Window chain out of headless holder tests
     * until a real cross-window stage exists.
     * @param {String} workspaceId
     * @param {String} windowId
     * @returns {Promise<Neo.dashboard.DockCrossWindowParticipation>}
     * @protected
     */
    async createCrossWindowParticipation(workspaceId, windowId, host, generation) {
        let me            = this,
            Participation = (await import('../../../../../src/dashboard/DockCrossWindowParticipation.mjs')).default;

        if (!me.isCrossWindowTargetCurrent(workspaceId, windowId, host, generation)) {
            return null
        }

        me.crossWindowParticipations.get(workspaceId)?.destroy();

        let participation = Neo.create(Participation, {
            clearPreview: () => me.clearWorkspaceAffordances(workspaceId),
            commitLocal : operation => {
                let result = me.applyWorkspaceOperation(workspaceId, operation);

                if (result && !result.errors?.length && result.document) {
                    me.onWorkspaceDocumentChange(workspaceId, result.document)
                }

                return result
            },
            commitTransfer    : data => me.commitCrossWindowTransfer(data),
            getDocument       : () => me.getWorkspaceDocument(workspaceId),
            getForeignDocument: sourceWorkspaceId => me.getWorkspaceDocument(sourceWorkspaceId),
            hitTest           : (localX, localY) => me.hitTestWorkspace(workspaceId, localX, localY),
            previewFor        : data => me.renderWorkspacePreview(workspaceId, data),
            previewToOperation,
            sortGroup         : DemoBWorkspace.CROSS_WINDOW_SORT_GROUP,
            windowId,
            workspaceId
        });

        me.crossWindowParticipations.set(workspaceId, participation);

        return participation
    }

    /**
     * Checks that an async popup continuation still belongs to the live target generation.
     * @param {String} workspaceId
     * @param {String} windowId
     * @param {Neo.container.Base} host
     * @param {Number} generation
     * @returns {Boolean}
     * @protected
     */
    isCrossWindowTargetCurrent(workspaceId, windowId, host, generation) {
        let me = this;

        return !me.isDestroyed
            && me.crossWindowStageGeneration === generation
            && me.crossWindowTargetWindowId === windowId
            && me.crossWindowHosts.get(workspaceId) === host
            && !host.isDestroyed
    }

    /**
     * Mounts the popup workspace projection into a newly connected render target, registers its
     * target participation, and resolves only after real DOM geometry is measurable.
     * @param {Neo.app.Base} app
     * @param {String} windowId
     * @returns {Promise<Object>}
     * @protected
     */
    async mountCrossWindowTarget(app, windowId) {
        let me          = this,
            workspaceId = DemoBWorkspace.POPUP_WORKSPACE_ID,
            generation  = me.crossWindowStageGeneration,
            host        = app.mainView.add({
                module: Container,
                cls   : ['agentos-dockdemo-dock-host', 'neo-dashboard'],
                flex  : 1,
                items : [me.projectDockModel(null, workspaceId), {
                    module: DockPreview
                }, {
                    module: DockDropIndicators
                }],
                layout: {ntype: 'fit'}
            });

        me.crossWindowTargetWindowId = windowId;
        me.crossWindowHosts.set(workspaceId, host);

        try {
            await app.mainView.promiseUpdate();

            if (!me.isCrossWindowTargetCurrent(workspaceId, windowId, host, generation)) {
                return null
            }

            let participation = await me.createCrossWindowParticipation(workspaceId, windowId, host, generation);

            if (!participation || !me.isCrossWindowTargetCurrent(workspaceId, windowId, host, generation)) {
                participation?.destroy();
                return null
            }

            let geometry = await me.waitForWorkspaceGeometry(workspaceId);

            if (!geometry || !me.isCrossWindowTargetCurrent(workspaceId, windowId, host, generation)) {
                throw new Error('popup workspace geometry is not measurable')
            }

            let receipt = {windowId, workspaceId, hostId: host.id};

            me.crossWindowStageResolve?.(receipt);
            me.crossWindowStageResolve = null;
            me.crossWindowStageReject  = null;

            return receipt
        } catch (error) {
            if (me.crossWindowStageGeneration === generation) {
                me.crossWindowStageReject?.(error);
                me.crossWindowStageResolve = null;
                me.crossWindowStageReject  = null
            }

            if (me.isCrossWindowTargetCurrent(workspaceId, windowId, host, generation)) {
                throw error
            }

            return null
        }
    }

    /**
     * Opens two non-overlapping active workspaces and resolves from the worker connect + measured
     * geometry contract, never from a blind sleep.
     * @returns {Promise<Object>}
     */
    async openCrossWindowStage() {
        let me          = this,
            workspaceId = DemoBWorkspace.POPUP_WORKSPACE_ID,
            host        = me.crossWindowHosts.get(workspaceId),
            windowId    = me.crossWindowTargetWindowId;

        // A physical popup close can precede the worker disconnect callback. Reuse only a
        // complete, live owner bundle; a partial/destroyed cache must enter the ordinary cold
        // open path instead of handing the gesture a stale target id.
        if (windowId && host && !host.isDestroyed
            && me.crossWindowParticipations.has(workspaceId)
            && me.crossWindowGeometry.has(workspaceId)) {
            return {
                hostId: host.id,
                windowId,
                workspaceId
            }
        }

        if (me.crossWindowStagePromise) return me.crossWindowStagePromise;

        if (Object.keys(me.popupDocument?.items || {}).length) {
            return Promise.reject(new Error('popup workspace is not empty; cross-window stage refuses split ownership'))
        }

        me.crossWindowStageGeneration++;
        me.popupDocument = DemoBWorkspace.createPopupDocument();

        me.crossWindowStagePromise = new Promise((resolve, reject) => {
            me.crossWindowStageResolve = resolve;
            me.crossWindowStageReject  = reject
        });

        let winData = await Neo.Main.getWindowData({windowId: me.windowId}),
            left    = winData.screenLeft > 660
                ? winData.screenLeft - 640
                : winData.screenLeft + (winData.innerWidth || 1280) + 40,
            top     = winData.screenTop;

        try {
            await Neo.Main.windowOpen({
                url           : `./index.html?workspaceId=${workspaceId}&hostId=${me.id}`,
                windowFeatures: `height=520,width=600,left=${left},top=${top}`,
                windowId      : me.windowId,
                windowName    : 'demo-b-cross-window'
            })
        } catch (error) {
            me.crossWindowStageReject?.(error);
            me.crossWindowStagePromise = null;
            me.crossWindowStageResolve = null;
            me.crossWindowStageReject  = null;
            throw error
        }

        let timeout = me.timeout(10000).then(() => {
            throw new Error('cross-window target did not connect and become measurable within 10s')
        });

        try {
            return await Promise.race([me.crossWindowStagePromise, timeout])
        } catch (error) {
            me.crossWindowStagePromise = null;
            throw error
        }
    }

    /**
     * Publishes the atomic transfer pair, then reconciles target before source. Target-first is
     * load-bearing: it adopts the cached pane across the window boundary before the source shell
     * can classify the now-absent item as a retirement.
     * @param {Object} data
     * @returns {Promise}
     * @protected
     */
    commitCrossWindowTransfer(data) {
        let me = this,
            {
                descriptor,
                sourceDocument,
                sourceWorkspaceId,
                targetDocument,
                targetWorkspaceId
            } = data;

        const
            context       = me.crossWindowGestureContext,
            generation    = me.crossWindowStageGeneration,
            itemId        = descriptor.itemId,
            isPopupDetach = sourceWorkspaceId === DemoBWorkspace.MAIN_WORKSPACE_ID
                && targetWorkspaceId === DemoBWorkspace.POPUP_WORKSPACE_ID,
            targetWindowId   = me.crossWindowTargetWindowId,
            ownsTransfer     = () => !me.isDestroyed
                && me.crossWindowStageGeneration === generation
                && me.crossWindowTargetWindowId === targetWindowId
                && (!isPopupDetach || me.detachedPanes[itemId]?.windowId === targetWindowId);

        me.crossWindowStats.transferCommits++;

        sourceWorkspaceId === DemoBWorkspace.MAIN_WORKSPACE_ID
            ? (me.dockModel = sourceDocument)
            : (me.popupDocument = sourceDocument);
        targetWorkspaceId === DemoBWorkspace.MAIN_WORKSPACE_ID
            ? (me.dockModel = targetDocument)
            : (me.popupDocument = targetDocument);

        // The document pair and vessel ownership are one worker-side commit. A physical close can
        // arrive before either projection settles; publishing this entry synchronously lets the
        // disconnect path reattach the item instead of misclassifying committed truth as a cold
        // cancellation. The generation predicate below prevents that superseded projection from
        // writing stale source/target chrome after the recovery transaction has taken ownership.
        if (isPopupDetach) {
            me.detachedPanes[itemId] = {
                tabsNodeId: context?.sourceNodeId,
                windowId  : targetWindowId,
                windowName: 'demo-b-cross-window'
            }
        }

        me.refreshPromise = me.refreshPromise
            .then(() => me.timeout(0))
            .then(async () => {
                if (!ownsTransfer()) return;

                // `onRemoteDropOut()` and the source-local suppression decision both finish on
                // the coordinator's synchronous mouseup stack, before this deferred projection.
                // Snapshot their counters now: the source projection intentionally destroys its
                // empty tabs zone, so reading a field from that zone after reconciliation would
                // manufacture false evidence from a torn-down object.
                let sourceDecision = {
                    localDropFires    : me.crossWindowStats.localDropFires,
                    remoteDropOutFires: me.crossWindowStats.remoteDropOutFires
                };

                try {
                    await me.refreshWorkspace(targetWorkspaceId, targetDocument)
                } catch (error) {
                    if (!ownsTransfer()) return;
                    throw error
                }

                if (!ownsTransfer()) return;

                await me.refreshWorkspace(sourceWorkspaceId, sourceDocument);

                if (!ownsTransfer()) return;

                let pane         = me.paneCache[itemId],
                    framesAfter  = pane?.frames ?? -1,
                    targetTabsId = DockZoneModel.findContainingTabsId(targetDocument, itemId),
                    proof        = {
                        framesAfter,
                        framesBefore      : context?.frames ?? null,
                        framesNotReset    : framesAfter >= (context?.frames ?? Infinity),
                        localDropFires    : sourceDecision.localDropFires,
                        mountDelta        : (pane?.mountCount ?? 0) - (context?.mountCount ?? 0),
                        remoteDropOutFires: sourceDecision.remoteDropOutFires,
                        remoteSnapshot    : context?.remoteSnapshot ?? null,
                        sameInstance      : pane === context?.pane,
                        sourceItemRemoved : !sourceDocument.items?.[itemId]
                            && DockZoneModel.findContainingTabsId(sourceDocument, itemId) === null,
                        sourceSuppressionConsumed: sourceDecision.remoteDropOutFires === 1
                            && sourceDecision.localDropFires === 0,
                        targetItemPlaced        : !!targetDocument.items?.[itemId]
                            && targetTabsId === descriptor.target?.tabsNodeId,
                        targetTabsId,
                        transferCommits         : me.crossWindowStats.transferCommits
                    },
                    checks         = [
                        ['transfer committed exactly once', proof.transferCommits === 1],
                        ['source remote-drop-out fired exactly once', proof.remoteDropOutFires === 1],
                        ['source local drop stayed suppressed', proof.localDropFires === 0],
                        ['remote semantic and rendered preview settled', proof.remoteSnapshot?.ready === true],
                        ['source document relinquished the item', proof.sourceItemRemoved],
                        ['target document placed the item', proof.targetItemPlaced],
                        ['worker component instance stayed identical', proof.sameInstance],
                        ['instance heartbeat did not reset', proof.framesNotReset],
                        ['target document added exactly one mount', proof.mountDelta === 1],
                        ['continuity witness is complete', typeof pane?.id === 'string'
                            && Number.isInteger(pane?.mountCount)]
                    ],
                    errors         = checks.filter(([, passed]) => !passed).map(([message]) => message),
                    receipt        = {
                        applied       : errors.length === 0,
                        errors,
                        sourceDocument: DockZoneModel.clone(sourceDocument),
                        targetDocument: DockZoneModel.clone(targetDocument),
                        witness       : {
                            instanceId: pane?.id ?? null,
                            mountCount: pane?.mountCount ?? null
                        },
                        proof
                    };

                me.crossWindowGestureResolve?.(receipt);
                me.crossWindowGestureResolve = null
            });

        return me.refreshPromise
    }

    /**
     * @summary Installs a gesture-local witness around the source's remote-drop-out hook.
     * The hook itself stays authoritative and runs unchanged; this wrapper only counts how
     * often the coordinator selected that exact completion path before projection teardown.
     * @param {Neo.dashboard.DockTabSortZone} sourceZone
     * @returns {Object}
     * @protected
     */
    installCrossWindowSourceProbe(sourceZone) {
        let me       = this,
            stats    = me.crossWindowStats,
            hadOwn   = Object.hasOwn(sourceZone, 'onRemoteDropOut'),
            original = sourceZone.onRemoteDropOut,
            probe    = function(draggedItem) {
                stats.remoteDropOutFires++;
                return original.call(sourceZone, draggedItem)
            };

        sourceZone.onRemoteDropOut = probe;

        return {hadOwn, original, probe, sourceZone}
    }

    /**
     * @summary Removes a gesture-local source witness when the source zone survived the probe.
     * A successful singleton transfer destroys that empty source zone, in which case teardown
     * has already removed the own wrapper and there is nothing to restore.
     * @param {Object|null} sourceProbe
     * @protected
     */
    restoreCrossWindowSourceProbe(sourceProbe) {
        let {hadOwn, original, probe, sourceZone} = sourceProbe || {};

        if (!sourceZone || sourceZone.onRemoteDropOut !== probe) return;

        if (hadOwn) {
            sourceZone.onRemoteDropOut = original
        } else {
            delete sourceZone.onRemoteDropOut
        }
    }

    /**
     * @summary Reads the live source SortZone's drag-session readiness contract.
     * @param {Object} context
     * @returns {Object}
     * @protected
     */
    readCrossWindowDragReadiness(context) {
        let {itemId, sourceWorkspaceId, sourceZone} = context || {},
            draggedItem                             = sourceZone?.dragComponent,
            snapshot                                = {
                coordinatorReady: !!sourceZone?.dragCoordinator,
                dragProxyReady  : !!sourceZone?.dragProxy,
                dragging        : sourceZone?.owner?.cls?.includes?.('neo-is-dragging') === true,
                itemId          : draggedItem?.dockItemId ?? null,
                workspaceId     : draggedItem?.dockSourceWorkspaceId ?? null
            };

        snapshot.ready = snapshot.coordinatorReady
            && snapshot.dragProxyReady
            && snapshot.dragging
            && snapshot.itemId === itemId
            && snapshot.workspaceId === sourceWorkspaceId;

        return snapshot
    }

    /**
     * @summary Polls source gesture state, never elapsed time, before any remote screen move.
     * @param {Object} context
     * @param {Object} [options={}]
     * @param {Number} [options.attempts=120]
     * @param {Number} [options.delay=16]
     * @returns {Promise<Object>}
     * @protected
     */
    async waitForCrossWindowDragReadiness(context, {attempts=120, delay=16}={}) {
        let me = this,
            snapshot;

        for (let attempt = 0; attempt <= attempts && !me.isDestroyed; attempt++) {
            snapshot = me.readCrossWindowDragReadiness(context);

            if (snapshot.ready || attempt === attempts) break;

            await me.timeout(delay)
        }

        return snapshot || {ready: false}
    }

    /**
     * @summary Captures the remote target while the pointer is still down. This JSON-safe
     * snapshot is the Whitebox/NL observation seam: coordinator engagement, semantic preview,
     * rendered preview, and menu selection all become inspectable before mouseup commits.
     * @param {Object} context
     * @returns {Object}
     * @protected
     */
    readCrossWindowRemoteSnapshot(context) {
        let me                                            = this,
            {sourceZone, targetNodeId, targetWorkspaceId} = context || {},
            coordinator                                   = sourceZone?.dragCoordinator,
            participation                                 = me.crossWindowParticipations.get(targetWorkspaceId),
            target                                        = participation?.target,
            host                                          = me.crossWindowHosts.get(targetWorkspaceId),
            renderer                                      = host?.down({ntype: 'dock-preview'}),
            indicators                                    = host?.down({ntype: 'dashboard-dock-drop-indicators'}),
            preview                                       = target?.currentPreview ?? null,
            rendered                                      = renderer?.dockPreview ?? null,
            candidateSet                                  = indicators?.candidateSet ?? null,
            snapshot                                      = {
                coordinator: coordinator?.toJSON?.() ?? null,
                engaged    : coordinator?.activeTargetZone === target,
                indicators : {
                    activePreviewId: indicators?.activeCandidate?.preview?.previewId ?? null,
                    candidateCount : (candidateSet?.cross?.length ?? 0)
                        + (candidateSet?.root?.chips?.length ?? 0),
                    schema         : candidateSet?.schema ?? null
                },
                preview : preview ? DockZoneModel.clone(preview) : null,
                rendered: rendered ? DockZoneModel.clone(rendered) : null,
                targetNodeId
            };

        snapshot.ready = snapshot.engaged
            && snapshot.preview?.target?.nodeId === targetNodeId
            && snapshot.rendered?.previewId === snapshot.preview?.previewId;

        return snapshot
    }

    /**
     * @summary Polls the target's semantic + rendered hover state before allowing mouseup.
     * @param {Object} context
     * @param {Object} [options={}]
     * @param {Number} [options.attempts=120]
     * @param {Number} [options.delay=16]
     * @returns {Promise<Object>}
     * @protected
     */
    async waitForCrossWindowRemotePreview(context, {attempts=120, delay=16}={}) {
        let me = this,
            snapshot;

        for (let attempt = 0; attempt <= attempts && !me.isDestroyed; attempt++) {
            snapshot = me.readCrossWindowRemoteSnapshot(context);

            if (snapshot.ready || attempt === attempts) break;

            await me.timeout(delay)
        }

        return snapshot || {ready: false}
    }

    /**
     * @summary Reads every terminal state the Escape journey must clear after remote hover.
     * @param {Object} context
     * @returns {Object}
     * @protected
     */
    readCrossWindowCancellationSnapshot(context) {
        let me                              = this,
            {sourceZone, targetWorkspaceId} = context || {},
            coordinator                     = sourceZone?.dragCoordinator,
            participation                   = me.crossWindowParticipations.get(targetWorkspaceId),
            host                            = me.crossWindowHosts.get(targetWorkspaceId),
            renderer                        = host?.down({ntype: 'dock-preview'}),
            indicators                      = host?.down({ntype: 'dashboard-dock-drop-indicators'}),
            snapshot                        = {
                activeTargetZone      : coordinator?.toJSON?.().activeTargetZone ?? null,
                activeCandidateId     : indicators?.activeCandidate?.preview?.previewId ?? null,
                candidateSetSchema    : indicators?.candidateSet?.schema ?? null,
                dragDataPresent       : sourceZone?.data != null,
                dragEndActive         : sourceZone?.dragEndActive === true,
                dragPlaceholderPresent: !!sourceZone?.dragPlaceholder,
                dragProxyPresent      : !!sourceZone?.dragProxy,
                draggingClass         : sourceZone?.owner?.cls?.includes?.('neo-is-dragging') === true,
                nativeCandidateCount  : coordinator?.nativeWindowDropCandidates?.size ?? 0,
                semanticPreviewId     : participation?.target?.currentPreview?.previewId ?? null,
                renderedPreviewId     : renderer?.dockPreview?.previewId ?? null
            };

        snapshot.ready = snapshot.activeTargetZone === null
            && snapshot.activeCandidateId === null
            && snapshot.candidateSetSchema === null
            && snapshot.dragDataPresent === false
            && snapshot.dragEndActive === false
            && snapshot.dragPlaceholderPresent === false
            && snapshot.dragProxyPresent === false
            && snapshot.draggingClass === false
            && snapshot.nativeCandidateCount === 0
            && snapshot.semanticPreviewId === null
            && snapshot.renderedPreviewId === null;

        return snapshot
    }

    /**
     * @summary Polls the full cancellation contract rather than treating one cleared CSS class
     * as proof that coordinator, target, proxy and render affordances all settled.
     * @param {Object} context
     * @param {Object} [options={}]
     * @param {Number} [options.attempts=120]
     * @param {Number} [options.delay=16]
     * @returns {Promise<Object>}
     * @protected
     */
    async waitForCrossWindowCancellation(context, {attempts=120, delay=16}={}) {
        let me = this,
            snapshot;

        for (let attempt = 0; attempt <= attempts && !me.isDestroyed; attempt++) {
            snapshot = me.readCrossWindowCancellationSnapshot(context);

            if (snapshot.ready || attempt === attempts) break;

            await me.timeout(delay)
        }

        return snapshot || {ready: false}
    }

    /**
     * @summary Cancels a failed probe through the real main-thread Escape route, then releases
     * the native mouse sensor so the next cold gesture starts from a clean owner state.
     * @param {Object|null} context
     * @returns {Promise<Object>}
     * @protected
     */
    async cancelCrossWindowGesture(context) {
        let me = this,
            {
                sourceButtonId,
                sourceWindowId,
                sourceX,
                sourceY,
                sourceScreenX,
                sourceScreenY,
                sourceZone
            } = context || {};

        if (!sourceButtonId || sourceWindowId == null || !sourceZone) {
            sourceZone?.dragCoordinator?.onDragCancel({sourceSortZone: sourceZone});
            return {escapeDispatched: false, releaseDispatched: false, settled: false}
        }

        let escapeDispatched = await me.interactionService.dispatch({
                id      : sourceButtonId,
                type    : 'keydown',
                windowId: sourceWindowId,
                options : {bubbles: true, cancelable: true, code: 'Escape', key: 'Escape'}
            }),
            releaseDispatched = await me.interactionService.dispatch({
                id      : sourceButtonId,
                type    : 'mouseup',
                windowId: sourceWindowId,
                options : {
                    bubbles: true, button: 0, buttons: 0, cancelable: true,
                    clientX: sourceX, clientY: sourceY, screenX: sourceScreenX, screenY: sourceScreenY
                }
            });

        for (let attempt = 0; attempt <= 60 && !me.isDestroyed; attempt++) {
            let settled = sourceZone.owner?.cls?.includes?.('neo-is-dragging') !== true
                && sourceZone.dragEndActive !== true
                && sourceZone.data == null
                && !sourceZone.dragPlaceholder
                && !sourceZone.dragProxy;

            if (settled) return {escapeDispatched, releaseDispatched, settled: true};

            attempt < 60 && await me.timeout(16)
        }

        return {escapeDispatched, releaseDispatched, settled: false}
    }

    /**
     * @summary Places the popup outside the source viewport and proves the Window manager sees
     * two non-overlapping rectangles. Browsers may ignore `window.open(left=...)`; therefore the
     * requested feature is only an intent, while the live Window manager projection is the
     * readiness authority used by global drag hit-testing.
     * @param {Object} [options={}]
     * @param {Number} [options.attempts=120]
     * @param {Number} [options.delay=16]
     * @returns {Promise<Object>}
     * @protected
     */
    async positionCrossWindowStage({attempts=120, delay=16}={}) {
        let me            = this,
            WindowManager = (await import('../../../../../src/manager/Window.mjs')).default,
            sourceWindow  = WindowManager.get(me.windowId),
            targetWindow  = WindowManager.get(me.crossWindowTargetWindowId),
            sourceData    = await Neo.Main.getWindowData({windowId: me.windowId}),
            screen        = sourceData?.screen,
            sourceRect    = sourceWindow?.innerRect,
            targetRect    = targetWindow?.innerRect,
            gap           = 40,
            candidates, desired, snapshot;

        if (!sourceRect || !targetRect || !screen) {
            return {ready: false, reason: 'window geometry or screen bounds are unavailable'}
        }

        candidates = [{x: sourceRect.right + gap, y: sourceRect.y}, {
            x: sourceRect.x - targetRect.width - gap,
            y: sourceRect.y
        }, {
            x: sourceRect.x,
            y: sourceRect.bottom + gap
        }, {
            x: sourceRect.x,
            y: sourceRect.y - targetRect.height - gap
        }];

        desired = candidates.find(point => point.x >= screen.availLeft
            && point.y >= screen.availTop
            && point.x + targetRect.width <= screen.availLeft + screen.availWidth
            && point.y + targetRect.height <= screen.availTop + screen.availHeight);

        if (!desired) {
            return {
                ready : false,
                reason: 'the available screen cannot hold both configured viewports without overlap',
                screen,
                source: sourceRect,
                target: targetRect
            }
        }

        await Neo.Main.windowMoveTo({
            windowId  : me.windowId,
            windowName: 'demo-b-cross-window',
            x         : desired.x,
            y         : desired.y
        });

        for (let attempt = 0; attempt <= attempts && !me.isDestroyed; attempt++) {
            sourceWindow = WindowManager.get(me.windowId);
            targetWindow = WindowManager.get(me.crossWindowTargetWindowId);
            sourceRect   = sourceWindow?.innerRect;
            targetRect   = targetWindow?.innerRect;

            let overlaps = sourceRect && targetRect
                && sourceRect.x < targetRect.right
                && sourceRect.right > targetRect.x
                && sourceRect.y < targetRect.bottom
                && sourceRect.bottom > targetRect.y;

            snapshot = {
                desired,
                ready : !!sourceRect && !!targetRect && !overlaps,
                source: sourceRect,
                target: targetRect
            };

            if (snapshot.ready || attempt === attempts) break;

            await me.timeout(delay)
        }

        return snapshot || {desired, ready: false}
    }

    /**
     * @summary Phase-0 falsifier: drives the real first pointer gesture through InteractionService.
     * The step carries semantic ids only; this host resolves live windows, component ids, and
     * coordinates immediately before dispatch.
     * @param {Object} step
     * @param {Object} [options={}]
     * @param {Boolean} [options.cancelAtTarget=false] Whitebox-only branch: Escape after
     * remote preview settles, before mouseup. This option never enters tour-script data.
     * @returns {Promise<Object>}
     */
    async executeCrossWindowStep(step, {cancelAtTarget = false} = {}) {
        let me          = this,
            sourceProbe = null,
            {
                itemId,
                sourceWorkspaceId,
                targetWorkspaceId,
                targetNodeId
            } = step || {};

        if (itemId !== 'workbench'
            || sourceWorkspaceId !== DemoBWorkspace.MAIN_WORKSPACE_ID
            || targetWorkspaceId !== DemoBWorkspace.POPUP_WORKSPACE_ID
            || targetNodeId !== 'popup-tabs') {
            return {applied: false, errors: ['unsupported Demo-B cross-window step']}
        }

        let pane = me.paneCache[itemId];

        if (!me.getWorkspaceDocument(sourceWorkspaceId)?.items?.[itemId]
            || !pane
            || pane.isDestroyed) {
            return {applied: false, errors: ['source Workbench pane is not live and owned by the source workspace']}
        }

        try {
            // Surface cues are deliberately data-only and fire synchronously from TourRunner. A
            // perspective load can therefore enqueue a projection immediately before this step,
            // especially in spec mode where viewer pauses are skipped. Drain the host-owned queue
            // before opening the second vessel so gesture geometry never reads stale tab chrome.
            await me.awaitProjectionIdle();
            await me.openCrossWindowStage();
            await me.waitForWorkspaceGeometry(sourceWorkspaceId);
            await me.waitForWorkspaceGeometry(targetWorkspaceId);

            let stagePlacement = await me.positionCrossWindowStage();

            if (!stagePlacement.ready) {
                return {
                    applied: false,
                    errors : ['cross-window stage could not establish two non-overlapping active windows'],
                    debug  : {stagePlacement}
                }
            }

            let sourceDocument = me.getWorkspaceDocument(sourceWorkspaceId),
                sourceNodeId   = DockZoneModel.findContainingTabsId(sourceDocument, itemId),
                sourceItems    = sourceDocument.nodes[sourceNodeId]?.items || [],
                sourceHost     = me.crossWindowHosts.get(sourceWorkspaceId),
                sourceTabs     = sourceHost?.down({dockNodeId: sourceNodeId}),
                itemIndex      = sourceDocument.nodes[sourceNodeId]?.items.indexOf(itemId) ?? -1,
                sourceButton   = sourceTabs?.getTabAtIndex(itemIndex),
                sourceBar      = sourceTabs?.getTabBar(),
                sourceZone     = sourceBar?.sortZone,
                projectedItems = sourceZone?.dockItemIds || [],
                [buttonRect]   = sourceButton
                    ? await sourceButton.getDomRect([sourceButton.id], sourceButton.windowId)
                    : [],
                targetGeometry = me.crossWindowGeometry.get(targetWorkspaceId),
                targetRect     = targetGeometry?.zones.find(zone => zone.nodeId === targetNodeId)?.rect,
                WindowManager  = (await import('../../../../../src/manager/Window.mjs')).default,
                sourceWindow   = WindowManager.get(sourceButton?.windowId),
                targetWindow   = WindowManager.get(me.crossWindowTargetWindowId);

            if (sourceItems.length !== 1 || sourceItems[0] !== itemId) {
                return {
                    applied: false,
                    errors : ['Demo-B cross-window projection currently supports only its singleton Workbench source tab']
                }
            }

            if (sourceTabs?.dockNodeId !== sourceNodeId
                || sourceZone?.dockWorkspaceId !== sourceWorkspaceId
                || sourceBar?.items?.length !== sourceItems.length
                || projectedItems.length !== sourceItems.length
                || projectedItems.some((projectedItemId, index) => projectedItemId !== sourceItems[index])) {
                return {
                    applied: false,
                    errors : ['source drag chrome does not match the current workspace document']
                }
            }

            if (!sourceButton || !sourceZone || !buttonRect || !targetRect
                || !sourceWindow?.innerRect || !targetWindow?.innerRect) {
                return {applied: false, errors: ['cross-window gesture surfaces are not ready']}
            }

            if (!sourceZone.dragCoordinator) {
                return {applied: false, errors: ['source cross-window coordinator is not ready']}
            }

            let sourceX       = buttonRect.x + buttonRect.width / 2,
                sourceY       = buttonRect.y + buttonRect.height / 2,
                sourceScreenX = sourceWindow.innerRect.x + sourceX,
                sourceScreenY = sourceWindow.innerRect.y + sourceY,
                targetX       = targetRect.x + targetRect.width / 2,
                targetY       = targetRect.y + targetRect.height / 2,
                targetScreenX = targetWindow.innerRect.x + targetX,
                targetScreenY = targetWindow.innerRect.y + targetY;

            me.crossWindowStats          = {localDropFires: 0, remoteDropOutFires: 0, transferCommits: 0};
            sourceProbe                  = me.installCrossWindowSourceProbe(sourceZone);
            me.crossWindowGestureContext = {
                frames        : pane?.frames ?? 0,
                itemId,
                mountCount    : pane?.mountCount ?? 0,
                pane,
                sourceButtonId: sourceButton.id,
                sourceNodeId,
                sourceScreenX,
                sourceScreenY,
                sourceWorkspaceId,
                sourceWindowId: sourceButton.windowId,
                sourceX,
                sourceY,
                sourceZone,
                targetNodeId,
                targetWorkspaceId
            };

            let settled = new Promise(resolve => me.crossWindowGestureResolve = resolve),
                options = (clientX, clientY, screenX, screenY, buttons) => ({
                    bubbles: true, button: 0, buttons, cancelable: true,
                    clientX, clientY, screenX, screenY
                });

            // Phase 1: own the native sensor and cross the local drag threshold. The next phase
            // cannot begin until the worker-side SortZone exposes its readiness state.
            await me.interactionService.simulateEvent({events: [{
                targetId: sourceButton.id,
                type    : 'mousedown',
                windowId: sourceButton.windowId,
                options : options(sourceX, sourceY, sourceScreenX, sourceScreenY, 1)
            }, {
                delay   : 120,
                targetId: sourceButton.id,
                type    : 'mousemove',
                windowId: sourceButton.windowId,
                options : options(sourceX + 8, sourceY, sourceScreenX + 8, sourceScreenY, 1)
            }, {
                delay   : 16,
                targetId: sourceButton.id,
                type    : 'mousemove',
                windowId: sourceButton.windowId,
                options : options(sourceX + 24, sourceY, sourceScreenX + 24, sourceScreenY, 1)
            }]});

            let readiness = await me.waitForCrossWindowDragReadiness(me.crossWindowGestureContext);

            if (!readiness.ready) {
                let cancellation = await me.cancelCrossWindowGesture(me.crossWindowGestureContext);

                me.restoreCrossWindowSourceProbe(sourceProbe);
                me.crossWindowGestureResolve = null;
                me.crossWindowGestureContext = null;

                return {
                    applied: false,
                    errors : ['source drag did not reach the landed readiness contract'],
                    debug  : {cancellation, readiness}
                }
            }

            // Phase 2: move in screen space while the source document still owns the pointer.
            // Mouseup remains withheld until the target's semantic AND rendered preview agree.
            await me.interactionService.simulateEvent({events: [{
                delay   : 16,
                targetId: sourceButton.id,
                type    : 'mousemove',
                windowId: sourceButton.windowId,
                options : options(sourceX + 32, sourceY, targetScreenX, targetScreenY, 1)
            }, {
                delay   : 16,
                targetId: sourceButton.id,
                type    : 'mousemove',
                windowId: sourceButton.windowId,
                options : options(sourceX + 34, sourceY, targetScreenX + 2, targetScreenY, 1)
            }]});

            let remoteSnapshot = await me.waitForCrossWindowRemotePreview(me.crossWindowGestureContext);

            if (!remoteSnapshot.ready) {
                let cancellation = await me.cancelCrossWindowGesture(me.crossWindowGestureContext);

                me.restoreCrossWindowSourceProbe(sourceProbe);
                me.crossWindowGestureResolve = null;
                me.crossWindowGestureContext = null;

                return {
                    applied: false,
                    errors : ['remote target did not expose a settled semantic preview'],
                    debug  : {cancellation, readiness, remoteSnapshot}
                }
            }

            me.crossWindowGestureContext.remoteSnapshot = remoteSnapshot;

            if (cancelAtTarget) {
                let sourceBefore = DockZoneModel.clone(me.getWorkspaceDocument(sourceWorkspaceId)),
                    targetBefore = DockZoneModel.clone(me.getWorkspaceDocument(targetWorkspaceId)),
                    cancellation = await me.cancelCrossWindowGesture(me.crossWindowGestureContext),
                    cleanup      = await me.waitForCrossWindowCancellation(me.crossWindowGestureContext),
                    sourceAfter  = DockZoneModel.clone(me.getWorkspaceDocument(sourceWorkspaceId)),
                    targetAfter  = DockZoneModel.clone(me.getWorkspaceDocument(targetWorkspaceId)),
                    result       = {
                        applied       : false,
                        cancelled     : true,
                        errors        : ['cross-window gesture cancelled before commit'],
                        sourceDocument: sourceAfter,
                        targetDocument: targetAfter,
                        proof         : {
                            cancellation,
                            cleanup,
                            documentsUnchanged: JSON.stringify(sourceBefore) === JSON.stringify(sourceAfter)
                                && JSON.stringify(targetBefore) === JSON.stringify(targetAfter),
                            remoteSnapshot,
                            stats: {...me.crossWindowStats}
                        }
                    };

                me.restoreCrossWindowSourceProbe(sourceProbe);
                me.crossWindowGestureResolve = null;
                me.crossWindowGestureContext = null;

                return result
            }

            // Phase 3: release only after the mid-gesture receipt is captured. The coordinator
            // now has one unambiguous target and can commit through its ordinary onDragEnd path.
            await me.interactionService.simulateEvent({events: [{
                targetId: sourceButton.id,
                type    : 'mouseup',
                windowId: sourceButton.windowId,
                options : options(sourceX + 34, sourceY, targetScreenX + 2, targetScreenY, 0)
            }]});

            let timeout = me.timeout(5000).then(() => ({
                applied: false,
                errors : ['real cross-window gesture did not settle through the target commit path'],
                debug  : {
                    coordinator: sourceZone.dragCoordinator?.toJSON?.() ?? null,
                    source     : {
                        buttonRect,
                        sortGroup          : sourceZone.sortGroup,
                        windowId           : sourceZone.windowId,
                        remoteDropCommitted: sourceZone.remoteDropCommitted
                    },
                    sourceWindow: sourceWindow.innerRect,
                    stagePlacement,
                    stats       : {...me.crossWindowStats},
                    target      : {nodeId: targetNodeId, rect: targetRect},
                    targetWindow: targetWindow.innerRect
                }
            }));

            let result = await Promise.race([settled, timeout]);

            if (!result.applied) {
                await me.cancelCrossWindowGesture(me.crossWindowGestureContext)
            }

            me.restoreCrossWindowSourceProbe(sourceProbe);
            me.crossWindowGestureResolve = null;
            me.crossWindowGestureContext = null;

            return result
        } catch (error) {
            await me.cancelCrossWindowGesture(me.crossWindowGestureContext).catch(() => {});
            me.restoreCrossWindowSourceProbe(sourceProbe);
            me.crossWindowGestureResolve = null;
            me.crossWindowGestureContext = null;

            return {applied: false, errors: [error?.message || String(error)]}
        }
    }

    /**
     * A popup window joined the shared heap: if it is one of OURS (the pop-out URL carries
     * `popout=<itemId>&hostId=<this.id>`), reparent the LIVE cached pane into its main view.
     * The instance moves trees; nothing is recreated — the counter proves it.
     * @param {Object} data `{appName, windowId}`
     */
    async onWindowConnect(data) {
        let me         = this,
            {windowId} = data,
            app        = Neo.apps[windowId];

        if (!app || me.isDestroyed) return;

        let url         = await Neo.Main.getByPath({path: 'document.URL', windowId}),
            params      = new URL(url).searchParams,
            workspaceId = params.get('workspaceId'),
            itemId      = params.get('popout');

        if (params.get('hostId') !== me.id) return;

        if (workspaceId === DemoBWorkspace.POPUP_WORKSPACE_ID) {
            await me.mountCrossWindowTarget(app, windowId);
            return
        }

        if (!itemId) return;

        let entry = me.detachedPanes[itemId],
            pane  = me.paneCache[itemId];

        if (entry && pane && me.popupDocument?.items?.[itemId]) {
            entry.windowId = windowId;
            app.mainView.add(pane)
        }
    }

    /**
     * A popup closed: whatever pane it hosted comes HOME — the reattach commit brings the
     * item back into the document; the re-projection re-adopts the parked instance.
     * @param {Object} data `{appName, windowId}`
     */
    onWindowDisconnect(data) {
        let me = this;

        if (me.isDestroyed) return;

        if (data.windowId === me.crossWindowTargetWindowId) {
            let workspaceId    = DemoBWorkspace.POPUP_WORKSPACE_ID,
                detachedItemId = Object.entries(me.detachedPanes)
                    .find(([, entry]) => entry.windowId === data.windowId)?.[0];

            me.crossWindowStageGeneration++;
            me.crossWindowGestureContext?.sourceZone?.dragCoordinator?.onDragCancel({
                sourceSortZone: me.crossWindowGestureContext.sourceZone
            });
            me.crossWindowGestureResolve?.({
                applied: false,
                errors : ['cross-window target disconnected before the gesture settled']
            });
            me.crossWindowStageReject?.(new Error('cross-window target disconnected before readiness settled'));

            me.crossWindowParticipations.get(workspaceId)?.destroy();
            me.crossWindowParticipations.delete(workspaceId);
            me.crossWindowHosts.delete(workspaceId);
            me.crossWindowGeometry.delete(workspaceId);
            me.crossWindowTargetWindowId = null;
            me.crossWindowStagePromise   = null;
            me.crossWindowStageResolve   = null;
            me.crossWindowStageReject    = null;
            me.crossWindowGestureResolve = null;
            me.crossWindowGestureContext = null;

            // A post-commit manual close is a terminal vessel event, not ownership loss.
            // A pre-commit close has no detached entry and remains a cancelled gesture.
            detachedItemId && me.reattachPane(detachedItemId, {windowAlreadyClosed: true});
            return
        }

        for (const [itemId, entry] of Object.entries(me.detachedPanes)) {
            if (entry.windowId === data.windowId) {
                me.reattachPane(itemId, {windowAlreadyClosed: true});
                break
            }
        }
    }

    /**
     * The pop-out moment: atomically transfers the item record + placement from the primary
     * workspace document into the popup document, parks the live pane out of the projection,
     * and opens the popup on the SAME app. The SharedWorker heap makes the new window a second
     * render target for the one worker; `onWindowConnect` moves the cached instance in.
     * @param {String} itemId
     * @returns {Promise<{detached: Boolean, errors: String[]}>}
     */
    async popOutPane(itemId) {
        let me   = this,
            pane = me.paneCache[itemId],
            home = DockZoneModel.findContainingTabsId(me.dockModel, itemId);

        if (!pane || !home || me.detachedPanes[itemId]) {
            return {detached: false, errors: [`"${itemId}" is not a docked, cached, attached pane`]}
        }

        // A prior round-trip normalizes the now-empty popup tree. Re-seed its valid landing
        // tabs before the next transfer; no item state exists there to preserve at that point.
        let sourceBefore = me.dockModel,
            popupBefore  = me.popupDocument,
            popup        = Object.keys(me.popupDocument.items || {}).length
                ? me.popupDocument
                : DemoBWorkspace.createPopupDocument(),
            result       = DockZoneModel.transferItem(sourceBefore, popup, {
                itemId,
                sourceWorkspaceId: 'main',
                targetWorkspaceId: 'popup',
                target           : {operation: 'addTab', tabsNodeId: 'popup-tabs'}
            });

        if (result.errors.length) {
            return {detached: false, errors: result.errors}
        }

        me.detachedPanes[itemId] = {tabsNodeId: home, windowId: null};

        // park BEFORE the re-projection tears the old tree down
        pane.parent?.remove(pane, false);

        me.popupDocument = result.targetDocument;
        me.onDockZoneDocumentChange(result.sourceDocument);

        try {
            let winData = await Neo.Main.getWindowData({windowId: me.windowId});

            await Neo.Main.windowOpen({
                url           : `./index.html?popout=${itemId}&hostId=${me.id}`,
                windowFeatures: `height=420,width=560,left=${winData.screenLeft + 120},top=${winData.screenTop + 120}`,
                windowId      : me.windowId,
                windowName    : `demo-b-${itemId}`
            })
        } catch (error) {
            // The vessel failed after the pure transfer result was staged. Restore BOTH pristine
            // inputs: the source's old home may have normalized away after losing its sole item,
            // so replaying another placement is weaker than the transfer's commit-or-neither truth.
            delete me.detachedPanes[itemId];
            me.popupDocument = popupBefore;
            me.onDockZoneDocumentChange(sourceBefore);

            return {
                detached: false,
                errors  : [`popup open failed: ${error?.message || error}`]
            }
        }

        return {detached: true, errors: []}
    }

    /**
     * Measures one active workspace's host and tabs geometry. The result is window-local and
     * runtime-only; it is invalidated by every projection refresh and never enters a document.
     * @param {String} workspaceId
     * @returns {Promise<Object|null>}
     * @protected
     */
    async measureWorkspaceGeometry(workspaceId) {
        let me       = this,
            host     = me.crossWindowHosts.get(workspaceId),
            document = me.getWorkspaceDocument(workspaceId),
            nodes    = document?.nodes || {};

        if (!host || host.isDestroyed) return null;

        let zoneEntries = Object.keys(nodes)
                .filter(nodeId => nodes[nodeId].type === 'tabs')
                .map(nodeId => ({nodeId, container: host.down({dockNodeId: nodeId})}))
                .filter(zone => zone.container),
            rootId      = nodes[document.root]?.type === 'edge-zone'
                ? (nodes[document.root].zones?.center ?? document.root)
                : document.root,
            [hostRect, ...zoneRects] = await host.getDomRect(
                [host.id, ...zoneEntries.map(zone => zone.container.id)],
                host.windowId
            ),
            geometry;

        geometry = hostRect && {
            hostRect,
            root : {nodeId: rootId, rect: hostRect},
            zones: zoneEntries
                .map((zone, index) => ({
                    nodeId: zone.nodeId,
                    rect  : zone.nodeId === rootId
                        && nodes[zone.nodeId].items?.length === 0
                        && (!zoneRects[index]?.width || !zoneRects[index]?.height)
                            ? hostRect
                            : zoneRects[index],
                    orientation: Object.values(nodes).find(node =>
                        node.type === 'split' && node.children?.includes(zone.nodeId)
                    )?.orientation ?? null
                }))
                .filter(zone => zone.rect)
        };

        if (!geometry
            || geometry.hostRect.width < 1
            || geometry.hostRect.height < 1
            || geometry.zones.length < 1
            || geometry.zones.some(zone => zone.rect.width < 1 || zone.rect.height < 1)) {
            me.crossWindowGeometry.delete(workspaceId);
            return null
        }

        me.crossWindowGeometry.set(workspaceId, geometry);

        let indicators = host.down({ntype: 'dashboard-dock-drop-indicators'});

        indicators && (indicators.hostRect = geometry.hostRect);

        return geometry
    }

    /**
     * Waits for main-thread paint evidence instead of assuming a worker update acknowledgement
     * implies measurable geometry. Every retry is routed through the host's own render target;
     * the bounded delay is cadence only, while non-zero host + zone rects are the readiness fact.
     * @param {String} workspaceId
     * @param {Object} [options={}]
     * @param {Number} [options.attempts=120]
     * @param {Number} [options.delay=16]
     * @returns {Promise<Object|null>}
     * @protected
     */
    async waitForWorkspaceGeometry(workspaceId, {attempts=120, delay=16}={}) {
        let me       = this,
            geometry = await me.measureWorkspaceGeometry(workspaceId);

        if (!geometry && attempts > 0 && !me.isDestroyed) {
            await me.timeout(delay);
            return me.waitForWorkspaceGeometry(workspaceId, {attempts: attempts - 1, delay})
        }

        return geometry
    }

    /**
     * Converts a viewport-space rect into a dock host's local overlay coordinates.
     * @param {Object} rect
     * @param {Object} hostRect
     * @returns {Object}
     * @protected
     */
    localDockRect(rect, hostRect) {
        return {x: rect.x - hostRect.x, y: rect.y - hostRect.y, width: rect.width, height: rect.height}
    }

    /**
     * Clears transient preview state for one workspace.
     * @param {String} workspaceId
     * @protected
     */
    clearWorkspaceAffordances(workspaceId) {
        let host = this.crossWindowHosts.get(workspaceId);

        host?.down({ntype: 'dashboard-dock-drop-indicators'})?.clear();

        let preview = host?.down({ntype: 'dock-preview'});

        preview && (preview.dockPreview = null)
    }

    /**
     * Synchronous remote-target hit test over pre-measured window-local tabs geometry.
     * @param {String} workspaceId
     * @param {Number} localX
     * @param {Number} localY
     * @returns {Boolean}
     * @protected
     */
    hitTestWorkspace(workspaceId, localX, localY) {
        return !!this.dockPreviewProducer.hitTestZone(
            this.crossWindowGeometry.get(workspaceId)?.zones,
            {x: localX, y: localY}
        )
    }

    /**
     * Computes and renders one preview through the same producer/indicator/converter pipeline
     * used by an in-window drag. This method stays synchronous for coordinator callbacks.
     * @param {String} workspaceId
     * @param {Object} data
     * @returns {Object|null}
     * @protected
     */
    renderWorkspacePreview(workspaceId, data) {
        let me                = this,
            host              = me.crossWindowHosts.get(workspaceId),
            geometry          = me.crossWindowGeometry.get(workspaceId),
            draggedItem       = data.draggedItem,
            itemId            = data.itemId ?? draggedItem?.dockItemId,
            sourceWorkspaceId = draggedItem?.dockSourceWorkspaceId ?? workspaceId,
            sourceNodeId      = data.sourceNodeId
                ?? DockZoneModel.findContainingTabsId(me.getWorkspaceDocument(sourceWorkspaceId), itemId),
            pointer    = {x: data.localX ?? data.clientX, y: data.localY ?? data.clientY};

        if (!host || !geometry || !itemId || !Neo.isNumber(pointer.x) || !Neo.isNumber(pointer.y)) {
            return null
        }

        let producer   = me.dockPreviewProducer,
            indicators = host.down({ntype: 'dashboard-dock-drop-indicators'}),
            renderer   = host.down({ntype: 'dock-preview'}),
            zone       = producer.hitTestZone(geometry.zones, pointer);

        if (indicators && (zone?.nodeId ?? null) !== (indicators.candidateSet?.zone?.nodeId ?? null)) {
            indicators.candidateSet = zone
                ? producer.produceCandidates({pointer, zones: geometry.zones, itemId, sourceNodeId, root: geometry.root})
                : null
        }

        let candidate = indicators?.updatePointer(pointer) ?? null,
            preview   = candidate?.preview
                ?? producer.produce({pointer, zones: geometry.zones, itemId, sourceNodeId});

        if (renderer) {
            renderer.dockPreview = preview;

            if (preview) {
                let targetRect = preview.target.nodeId === geometry.root.nodeId
                    ? geometry.root.rect
                    : geometry.zones.find(entry => entry.nodeId === preview.target.nodeId)?.rect;

                targetRect && renderer.applyTargetGeometry(me.localDockRect(targetRect, geometry.hostRect))
            }
        }

        return preview
    }

    /**
     * Local drag-move adapter for either active workspace.
     * @param {String} workspaceId
     * @param {Object} data
     * @protected
     */
    async onDockCrossZoneDragMove(workspaceId, data) {
        this.crossWindowGeometry.has(workspaceId) || await this.measureWorkspaceGeometry(workspaceId);
        this.renderWorkspacePreview(workspaceId, data)
    }

    /**
     * Local release path. A committed remote drop must suppress this callback entirely; the
     * counter is the product witness for that one-shot source decision.
     * @param {String} workspaceId
     * @param {Object} data
     * @returns {Object|null}
     * @protected
     */
    onDockCrossZoneDrop(workspaceId, data) {
        let me         = this,
            preview    = me.renderWorkspacePreview(workspaceId, data),
            descriptor = previewToOperation(preview),
            result     = null;

        me.crossWindowStats.localDropFires++;
        me.clearWorkspaceAffordances(workspaceId);

        if (descriptor) {
            result = me.applyWorkspaceOperation(workspaceId, descriptor);

            if (result && !result.errors?.length && result.document) {
                me.onWorkspaceDocumentChange(workspaceId, result.document)
            }
        }

        return result
    }

    /**
     * Cancels every window-local affordance and resolves the cancellation readiness signal.
     * @param {String} workspaceId
     * @param {Object} data
     * @protected
     */
    onDockCrossZoneDragCancel(workspaceId, data) {
        this.crossWindowHosts.forEach((host, id) => this.clearWorkspaceAffordances(id));
        this.crossWindowGestureResolve?.({
            applied: false,
            errors : ['cross-window gesture cancelled before commit'],
            itemId : data?.itemId,
            workspaceId
        });
        this.crossWindowGestureResolve = null
    }

    /**
     * Projects one named committed document, threading the same holder and drag callbacks into
     * both render targets. Cross-window participation is opt-in for the dedicated scene only.
     * @param {Function|null} [resolveComponentRef=null]
     * @param {String} [workspaceId=DemoBWorkspace.MAIN_WORKSPACE_ID]
     * @param {Object} [document]
     * @returns {Object}
     */
    projectDockModel(
        resolveComponentRef=null,
        workspaceId=DemoBWorkspace.MAIN_WORKSPACE_ID,
        document=this.getWorkspaceDocument(workspaceId)
    ) {
        let me = this;

        return DockLayoutAdapter.project(document, {
            applyDockZoneOperation   : descriptor => me.applyWorkspaceOperation(workspaceId, descriptor),
            crossWindowSortGroup     : me.crossWindowEnabled ? DemoBWorkspace.CROSS_WINDOW_SORT_GROUP : null,
            onDockCrossZoneDragCancel: data => me.onDockCrossZoneDragCancel(workspaceId, data),
            onDockCrossZoneDragMove  : data => me.onDockCrossZoneDragMove(workspaceId, data),
            onDockCrossZoneDrop      : data => me.onDockCrossZoneDrop(workspaceId, data),
            onDockZoneDocumentChange : nextDocument => me.onWorkspaceDocumentChange(workspaceId, nextDocument),
            resolveComponentRef      : resolveComponentRef
                || ((componentRef, item, itemId) => me.resolvePane(itemId, item)),
            resolveRevealComponentRef: (componentRef, item, itemId) => me.resolvePane(itemId, item),
            workspaceId
        })
    }

    /**
     * The reattach: atomically transfers the item from the popup document into its primary
     * tabs home, closes the popup (unless it already closed itself), and lets the projection
     * re-adopt the parked instance — same count, same instance, home again.
     * @param {String} itemId
     * @param {Object} [options={}]
     * @param {Boolean} [options.windowAlreadyClosed=false]
     * @returns {Promise<{reattached: Boolean, errors: String[]}>}
     */
    async reattachPane(itemId, {windowAlreadyClosed = false} = {}) {
        let me    = this,
            entry = me.detachedPanes[itemId],
            pane  = me.paneCache[itemId];

        if (!entry || !pane) {
            return {errors: [`"${itemId}" is not detached`], reattached: false}
        }

        // home fallback: if the remembered tabs node left the tree (a perspective moved on),
        // the first tabs node adopts the returning pane — never a dangling reattach
        let home = me.dockModel.nodes[entry.tabsNodeId]?.type === 'tabs'
                ? entry.tabsNodeId
                : Object.keys(me.dockModel.nodes).find(id => me.dockModel.nodes[id].type === 'tabs'),
            result = DockZoneModel.transferItem(me.popupDocument, me.dockModel, {
                itemId,
                sourceWorkspaceId: 'popup',
                targetWorkspaceId: 'main',
                target           : {operation: 'addTab', tabsNodeId: home}
            });

        if (result.errors.length) {
            return {errors: result.errors, reattached: false}
        }

        delete me.detachedPanes[itemId];

        // Commit model ownership before awaiting the vessel. The deleted bookkeeping entry is
        // the disconnect re-entrancy guard; a close failure leaves an empty popup, not split truth.
        pane.parent?.remove(pane, false);
        me.popupDocument = result.sourceDocument;
        me.onDockZoneDocumentChange(result.targetDocument);

        if (!windowAlreadyClosed) {
            try {
                await Neo.Main.windowClose({
                    names   : [entry.windowName || `demo-b-${itemId}`],
                    windowId: me.windowId
                })
            } catch (error) {
                return {errors: [`popup close failed: ${error?.message || error}`], reattached: true}
            }
        }

        return {errors: [], reattached: true}
    }

    /**
     * @summary Reconciles one workspace projection from its atomic document/preservation request.
     *
     * The shared projection reconciler moves cached panes and tab chrome into the staged tree
     * before retiring the empty shell, so object permanence no longer depends on coarse parking.
     * @param {String} workspaceId Worker-owned workspace id.
     * @param {Object} [document=this.getWorkspaceDocument(workspaceId)] Document to project.
     * @param {Object} [options={}] Projection policy.
     * @param {Iterable<String>} [options.preserveItemIds=[]] Owner-held panes to park.
     * @returns {Promise}
     * @protected
     */
    async refreshWorkspace(
        workspaceId,
        document=this.getWorkspaceDocument(workspaceId),
        {preserveItemIds=[]}={}
    ) {
        const
            me           = this,
            host         = me.crossWindowHosts.get(workspaceId),
            placeholders = new Map();

        if (host) {
            const flip = workspaceId === DemoBWorkspace.MAIN_WORKSPACE_ID
                ? Neo.main?.addon?.DockFlip
                : null;

            me.crossWindowGeometry.delete(workspaceId);
            me.clearWorkspaceAffordances(workspaceId);

            try {
                await flip?.captureFirst({hostId: host.id, markerPrefix: 'agentos-dockdemo-pane-'})
            } catch (e) {/* instant landing */}

            const nextConfig = me.projectDockModel((componentRef, item, itemId) => {
                const placeholder = Neo.create({
                    module: Component,
                    header: {text: item?.title ?? itemId},
                    hidden: true
                });

                placeholders.set(itemId, placeholder);

                return placeholder
            }, workspaceId, document);

            await DockProjectionReconciler.reconcileProjection({
                host,
                nextConfig,
                placeholders,
                preserveItemIds,
                resolveItem: itemId => me.resolvePane(itemId, document.items[itemId])
            });

            me.crossWindowEnabled && await me.measureWorkspaceGeometry(workspaceId);

            if (flip) {
                DockMotionSignal.enter(me);
                flip.play({hostId: host.id, markerPrefix: 'agentos-dockdemo-pane-'})
                    .catch(() => {})
                    .finally(() => DockMotionSignal.leave(me))
            }
        }
    }

    /**
     * Backward-compatible primary-workspace refresh seam used by the perspective tests and tour.
     * @returns {Promise}
     * @protected
     */
    refreshDockWorkspace() {
        return this.refreshWorkspace(DemoBWorkspace.MAIN_WORKSPACE_ID, this.dockModel)
    }

    /**
     * @summary Resolves only after every currently queued projection has committed or failed.
     * Whitebox journeys use this worker-owned boundary instead of guessing from runner timing.
     * @returns {Promise}
     */
    awaitProjectionIdle() {
        return this.refreshPromise
    }

    /**
     * Resolves a pane to its CACHED live instance, creating it on first request — the
     * workbench is the counter witness; the rest are labeled placeholder components with
     * stable skin hooks. The FLIP marker cls rides every instance.
     * @param {String} itemId
     * @param {Object} item The model item record.
     * @returns {Neo.component.Base}
     */
    resolvePane(itemId, item) {
        let me    = this,
            cache = me.paneCache;

        if (cache[itemId] && !cache[itemId].isDestroyed) {
            return cache[itemId]
        }

        cache[itemId] = Neo.create(itemId === 'workbench' ? {
            module: CounterPane,
            cls   : ['agentos-dockdemo-counter-pane', 'agentos-dockdemo-pane-workbench']
        } : {
            module: Component,
            cls   : ['agentos-dockdemo-pane', `agentos-dockdemo-pane-${itemId}`],
            html  : item?.title ?? itemId,
            style : {alignItems: 'center', display: 'flex', fontSize: '18px', justifyContent: 'center'}
        });

        return cache[itemId]
    }

    /**
     * Lights the first `count` pips.
     * @param {Number} count
     */
    setPipProgress(count) {
        const pips = this.getReference('tour-pips-b');

        if (pips) {
            let {vdom} = pips;

            vdom.cn.forEach((pip, index) => {
                pip.cls = index < count
                    ? ['agentos-dockdemo-pip', 'agentos-dockdemo-pip-done']
                    : ['agentos-dockdemo-pip']
            });

            pips.update()
        }
    }

    /**
     * Updates the caption feed.
     * @param {String} text
     */
    setTourCaption(text) {
        const caption = this.getReference('tour-caption-b');

        caption && (caption.html = text)
    }

    /**
     * @summary Plays the screenplay from the top. A rerun first drains the prior projection
     * transaction, then serializes the opening-stage reset through the same refresh queue as
     * every tour mutation; reset and replay can therefore never reconcile the tab chrome at
     * the same time. Perspective saves remain idempotent through `replace: true`.
     */
    async startTour() {
        let me = this;

        if (me.tourRunner.running) {
            me.setTourCaption('Tour already running — let it finish its story.');
            return
        }

        if (me.tourRunner.log.length) {
            await me.refreshPromise;

            me.popupDocument = DemoBWorkspace.createPopupDocument();
            await me.onWorkspaceDocumentChange(
                DemoBWorkspace.MAIN_WORKSPACE_ID,
                DockZoneModel.clone(initialDocument)
            )
        }

        me.beatCount = 0;
        me.setPipProgress(0);

        await me.tourRunner.start()
    }

    /**
     * Rebuilds the switcher buttons from the store's current collection — fired by every
     * store lifecycle event; buttons load their perspective through the same path the tour
     * cues use (one code path, human- and agent-driven alike).
     * @protected
     */
    syncSwitcher() {
        let me  = this,
            bar = me.getReference('switcher-bar');

        if (!bar) return;

        let collection = me.perspectiveStore.collection,
            layouts    = collection?.layouts ?? {},
            names      = Object.values(layouts).map(record => record.perspectiveName ?? record.layoutId);

        // children after the label are the perspective buttons — rebuild in place
        while (bar.items.length > 1) {
            bar.removeAt(bar.items.length - 1)
        }

        names.forEach(name => {
            bar.add({
                cls            : ['agentos-dockdemo-switcher-btn'],
                handler        : () => me.loadPerspectiveByName(name),
                ntype          : 'button',
                text           : name,
                useRippleEffect: false
            })
        })
    }

    /**
     * One entry per script step — the pip strip's build source.
     * @returns {Object[]}
     * @static
     */
    static totalBeats() {
        return demoBTourScript.scenes.flatMap(scene => scene.steps)
    }

    /**
     * @summary Creates the valid empty popup workspace used as the target of an atomic transfer.
     * The empty tabs node is intentional: it is the landing slot and is normalized away when
     * the last item transfers home, after which the next pop-out creates a fresh target.
     * @returns {Object}
     * @static
     */
    static createPopupDocument() {
        return {
            schema: DockZoneModel.SCHEMA,
            root  : 'popup-root',
            items : {},
            nodes : {
                'popup-root': {type: 'edge-zone', zones: {center: 'popup-tabs'}},
                'popup-tabs': {type: 'tabs', items: [], activeItemId: null}
            }
        }
    }

    /**
     * Tears down the runner, seam, store, and every cached pane with the workspace.
     * @param {...*} args
     */
    destroy(...args) {
        let me = this;

        me.crossWindowStageGeneration++;
        me.crossWindowGestureContext?.sourceZone?.dragCoordinator?.onDragCancel({
            sourceSortZone: me.crossWindowGestureContext.sourceZone
        });
        me.crossWindowGestureResolve?.({applied: false, errors: ['Demo-B workspace destroyed']});
        me.crossWindowStageReject?.(new Error('Demo-B workspace destroyed'));
        me.crossWindowParticipations.forEach(participation => participation.destroy());
        me.crossWindowParticipations.clear();
        me.crossWindowHosts.clear();
        me.crossWindowGeometry.clear();
        me.workspaceProjectionRequests.clear();
        me.crossWindowStagePromise   = null;
        me.crossWindowStageResolve   = null;
        me.crossWindowStageReject    = null;
        me.crossWindowGestureResolve = null;
        me.crossWindowGestureContext = null;

        me.tourRunner?.destroy();
        me.dockService?.destroy();
        me.dockPreviewProducer?.destroy();
        me.interactionService?.destroy();
        me.perspectiveStore?.destroy();

        Object.values(me.paneCache).forEach(pane => {
            pane?.isDestroyed || pane?.destroy?.()
        });
        me.paneCache = {};

        super.destroy(...args)
    }
}

export default Neo.setupClass(DemoBWorkspace);
