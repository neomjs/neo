import Component                          from '../../../../../src/component/Base.mjs';
import Container                          from '../../../../../src/container/Base.mjs';
import CounterPane                        from './CounterPane.mjs';
import DockLayoutAdapter                  from '../../../../../src/dashboard/DockLayoutAdapter.mjs';
import DockMotionSignal                   from '../../../../../src/dashboard/DockMotionSignal.mjs';
import DockPerspectiveStore               from '../../../../../src/dashboard/DockPerspectiveStore.mjs';
import DockProjectionReconciler           from '../../../../../src/dashboard/DockProjectionReconciler.mjs';
import DockService                        from '../../../../../src/ai/client/DockService.mjs';
import DockTopologyReconciler             from '../../../../../src/dashboard/DockTopologyReconciler.mjs';
import DockZoneModel                      from '../../../../../src/dashboard/DockZoneModel.mjs';
import TourRunner                         from '../../../../../src/ai/client/TourRunner.mjs';
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
     * parked only for explicit window moves, torn down only with the workspace. THE
     * object-permanence substrate: `resolvePane` hands the adapter these live instances,
     * so no morph, pop-out, or reattach ever remounts a pane.
     * @member {Object} paneCache={}
     * @protected
     */
    paneCache = {}
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
        me.dockService      = Neo.create(DockService, {});
        me.perspectiveStore = Neo.create(DockPerspectiveStore, {});

        me.tourRunner = Neo.create(TourRunner, {
            componentId: me.id,
            dockService: me.dockService,
            mode       : 'demo',
            script     : demoBTourScript
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
            module   : Container,
            cls      : ['agentos-dockdemo-dock-host', 'neo-dashboard'],
            flex     : 1,
            items    : [me.projectDockModel()],
            layout   : {ntype: 'fit'},
            reference: 'dock-host-b'
        }])
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

            preview.hasLivePopup && (me.popupDocument = preview.documents[1]);
            me.onDockZoneDocumentChange(preview.documents[0]);

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

        if (commit) {
            hasLivePopup && (me.popupDocument = result.documents[1]);
            me.onDockZoneDocumentChange(result.documents[0])
        }

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

        let url    = await Neo.Main.getByPath({path: 'document.URL', windowId}),
            params = new URL(url).searchParams,
            itemId = params.get('popout');

        if (params.get('hostId') !== me.id || !itemId) return;

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
     * Projects the committed document, threading the instance-bound holder callbacks.
     * @param {Function|null} [resolveComponentRef=null]
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
                await Neo.Main.windowClose({names: [`demo-b-${itemId}`], windowId: me.windowId})
            } catch (error) {
                return {errors: [`popup close failed: ${error?.message || error}`], reattached: true}
            }
        }

        return {errors: [], reattached: true}
    }

    /**
     * Reconciles the toolbar-adjacent projection from the committed document, FLIP-bracketed.
     * The shared projection reconciler moves cached panes and tab chrome into the staged tree
     * before retiring the empty shell, so object permanence no longer depends on coarse parking.
     * @protected
     */
    async refreshDockWorkspace() {
        const
            me           = this,
            host         = me.getReference('dock-host-b'),
            placeholders = new Map();

        if (host) {
            const flip = Neo.main?.addon?.DockFlip;

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
            });

            await DockProjectionReconciler.reconcileProjection({
                host,
                nextConfig,
                placeholders,
                resolveItem: itemId => me.resolvePane(itemId, me.dockModel.items[itemId])
            });

            if (flip) {
                DockMotionSignal.enter(me);
                flip.play({hostId: host.id, markerPrefix: 'agentos-dockdemo-pane-'})
                    .catch(() => {})
                    .finally(() => DockMotionSignal.leave(me))
            }
        }
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
     * Plays the screenplay from the top; reruns reset the stage and re-capture cleanly
     * (perspective saves use `replace: true`).
     */
    async startTour() {
        let me = this;

        if (me.tourRunner.running) {
            me.setTourCaption('Tour already running — let it finish its story.');
            return
        }

        if (me.tourRunner.log.length) {
            me.dockModel     = DockZoneModel.clone(initialDocument);
            me.popupDocument = DemoBWorkspace.createPopupDocument();
            me.refreshDockWorkspace()
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

        me.tourRunner?.destroy();
        me.dockService?.destroy();
        me.perspectiveStore?.destroy();

        Object.values(me.paneCache).forEach(pane => {
            pane?.isDestroyed || pane?.destroy?.()
        });
        me.paneCache = {};

        super.destroy(...args)
    }
}

export default Neo.setupClass(DemoBWorkspace);
