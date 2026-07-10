import Component                          from '../../../../../src/component/Base.mjs';
import Container                          from '../../../../../src/container/Base.mjs';
import CounterPane                        from './CounterPane.mjs';
import DockLayoutAdapter                  from '../../../../../src/dashboard/DockLayoutAdapter.mjs';
import DockMotionSignal                   from '../../../../../src/dashboard/DockMotionSignal.mjs';
import DockPerspectiveStore               from '../../../../../src/dashboard/DockPerspectiveStore.mjs';
import DockService                        from '../../../../../src/ai/client/DockService.mjs';
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
 * - **Perspectives** ride a {@link Neo.dashboard.DockPerspectiveStore}: the tour CAPTURES
 *   three named layouts live through `createSavedLayout` → `savePerspective` (the ADR's
 *   §2.2 capture path — no pre-baked records), and loading one back is a single committed
 *   document swap the FLIP layer animates. The switcher bar rebuilds from the store's
 *   lifecycle events — buttons are born from `perspectiveSaved`, never hardcoded.
 * - **Pop-out** rides the shared-heap vessel: panes are INSTANCE-CACHED (created once,
 *   parked across every re-projection — the reveal-pane-cache precedent), so detaching the
 *   workbench moves the LIVE component into the popup window's view tree
 *   (`mainView.add(instance)` — both windows share one App Worker) and reattaching moves it
 *   home. The {@link AgentOS.childapps.dockdemo.view.CounterPane} witness makes the
 *   reparent-never-recreate contract visible: its count survives because its instance does.
 *   Document honesty: pop-out commits `detachItem` (the item leaves the tree, keeps its
 *   record), reattach commits `addTab` — the document never lies about what is docked.
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
     * Pane instances by item id — created ONCE, parked (removed without destroy) across
     * every re-projection and window move, torn down only with the workspace. THE
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
     * Captures the CURRENT committed document as a named perspective through the real
     * §2.2 path: `createSavedLayout` (validation + normalization) → `savePerspective`.
     * `replace: true` keeps tour reruns idempotent — re-capturing your own name is the
     * demo's update flow, not a collision dispute.
     * @param {String} name
     * @returns {{saved: Boolean, errors: String[]}}
     */
    capturePerspective(name) {
        let me      = this,
            created = DockZoneModel.createSavedLayout(me.dockModel, {
                layoutId       : `demo-b-${name.toLowerCase()}`,
                perspectiveName: name,
                title          : name
            });

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
     * Loads a stored perspective and re-projects from its restored document — one committed
     * swap, animated by the FLIP layer like every other re-projection.
     * @param {String} name
     * @returns {{loaded: Boolean, errors: String[]}}
     */
    loadPerspectiveByName(name) {
        let me     = this,
            result = me.perspectiveStore.loadPerspective(name);

        if (result.errors.length || !result.document) {
            return {errors: result.errors, loaded: false}
        }

        me.onDockZoneDocumentChange(result.document);

        return {errors: [], loaded: true}
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

        cue.type === 'perspective-save' && me.capturePerspective(cue.name);
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

        if (entry && pane) {
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
     * The pop-out moment: parks the live pane out of the projection, commits `detachItem`
     * (document honesty — the item leaves the tree, keeps its record), and opens the popup
     * on the SAME app: the SharedWorker heap makes the new window a second render target
     * for the one worker, and `onWindowConnect` moves the instance in.
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

        me.detachedPanes[itemId] = {tabsNodeId: home, windowId: null};

        // park BEFORE the re-projection tears the old tree down
        pane.parent?.remove(pane, false);

        let result = me.applyDockZoneOperation({operation: 'detachItem', itemId});

        if (result.errors?.length) {
            delete me.detachedPanes[itemId];
            return {detached: false, errors: result.errors}
        }

        me.onDockZoneDocumentChange(result.document);

        let winData = await Neo.Main.getWindowData({windowId: me.windowId});

        await Neo.Main.windowOpen({
            url           : `./index.html?popout=${itemId}&hostId=${me.id}`,
            windowFeatures: `height=420,width=560,left=${winData.screenLeft + 120},top=${winData.screenTop + 120}`,
            windowId      : me.windowId,
            windowName    : `demo-b-${itemId}`
        });

        return {detached: true, errors: []}
    }

    /**
     * Projects the committed document, threading the instance-bound holder callbacks.
     * @returns {Object}
     */
    projectDockModel() {
        let me = this;

        return DockLayoutAdapter.project(me.dockModel, {
            applyDockZoneOperation  : me.applyDockZoneOperation.bind(me),
            onDockZoneDocumentChange: me.onDockZoneDocumentChange.bind(me),
            resolveComponentRef     : (componentRef, item, itemId) => me.resolvePane(itemId, item)
        })
    }

    /**
     * The reattach: closes the popup (unless it already closed itself), commits `addTab`
     * back to the pane's home tabs node, and lets the re-projection re-adopt the parked
     * instance — same count, same instance, home again.
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

        delete me.detachedPanes[itemId];

        // pull the instance out of the popup's tree first — parked, never destroyed
        pane.parent?.remove(pane, false);

        if (!windowAlreadyClosed) {
            await Neo.Main.windowClose({names: [`demo-b-${itemId}`], windowId: me.windowId})
        }

        // home fallback: if the remembered tabs node left the tree (a perspective moved on),
        // the first tabs node adopts the returning pane — never a dangling reattach
        let home = me.dockModel.nodes[entry.tabsNodeId]?.type === 'tabs'
            ? entry.tabsNodeId
            : Object.keys(me.dockModel.nodes).find(id => me.dockModel.nodes[id].type === 'tabs');

        let result = me.applyDockZoneOperation({operation: 'addTab', itemId, tabsNodeId: home});

        if (result.errors?.length) {
            return {errors: result.errors, reattached: false}
        }

        me.onDockZoneDocumentChange(result.document);

        return {errors: [], reattached: true}
    }

    /**
     * Rebuilds the toolbar-adjacent projection from the committed document, FLIP-bracketed.
     * Cached pane instances are PARKED first (removed without destroy) so the coarse
     * teardown of the old projection shell can never reap them — the object-permanence
     * mechanic every capability in this demo leans on.
     * @protected
     */
    async refreshDockWorkspace() {
        const
            me   = this,
            host = me.getReference('dock-host-b');

        if (host) {
            const flip = Neo.main?.addon?.DockFlip;

            try {
                await flip?.captureFirst({hostId: host.id, markerPrefix: 'agentos-dockdemo-pane-'})
            } catch (e) {/* instant landing */}

            // park every cached live pane before the old projection tree is destroyed
            Object.values(me.paneCache).forEach(pane => {
                pane?.parent && !pane.isDestroyed && pane.parent.remove(pane, false)
            });

            host.removeAt(0);
            host.insert(0, me.projectDockModel());

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
            me.dockModel = DockZoneModel.clone(initialDocument);
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
