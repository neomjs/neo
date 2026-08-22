import ClockPane                          from './ClockPane.mjs';
import Component                          from '../../../src/component/Base.mjs';
import Container                          from '../../../src/container/Base.mjs';
import DockDropIndicators                 from '../../../src/dashboard/DockDropIndicators.mjs';
import DockLayoutAdapter                  from '../../../src/dashboard/DockLayoutAdapter.mjs';
import DockMotionSignal                   from '../../../src/dashboard/DockMotionSignal.mjs';
import DockDragAffordances                from '../../../src/dashboard/DockDragAffordances.mjs';
import DockPreview                        from '../../../src/dashboard/DockPreview.mjs';
import DockProjectionReconciler           from '../../../src/dashboard/DockProjectionReconciler.mjs';
import DockService                        from '../../../src/ai/client/DockService.mjs';
import DockZoneModel                      from '../../../src/dashboard/DockZoneModel.mjs';
import TourRunner                         from '../../../src/ai/client/TourRunner.mjs';
import {previewToOperation}               from '../../../src/dashboard/dockPreviewContract.mjs';
import {demoATourScript, initialDocument} from './demoADockChoreography.mjs';
import '../../../src/button/Base.mjs';   // registers the `button` ntype the tour bar composes
import '../../../src/tab/Container.mjs'; // registers the `tab-container` ntype the projection emits
import '../../../src/toolbar/Base.mjs';  // registers the `toolbar` ntype the tour bar uses

/**
 * @summary The Demo-A showcase workspace: the reducer-container that hosts the dock
 * choreography and plays its screenplay through the tour runner.
 *
 * This class is the normative workspace-ownership pattern (the reducer-container the docking
 * design record fixes as canonical): it owns the committed dock-zone document as the single
 * source of truth, `applyDockZoneOperation()` is the pure reducer, `getDockZoneDocument()`
 * is the read half of the dock-holder contract (Neural Link topology reads work before any
 * operation ran), and `onDockZoneDocumentChange()` is the view-sync that stores each
 * committed document and re-projects the layout from it.
 *
 * Because the workspace implements the holder contract, it is drivable identically by all
 * three consumers of the trinity: the tour bar's play button (this class), an agent through
 * the Neural Link dock tools, and the whitebox replay specs — every one of them dispatches
 * semantic operation descriptors through the same commit path; there is no parallel
 * mutation route.
 *
 * The tour bar composes real `button.Base` children riding the `handler` contract (zero
 * manual DOM listeners) — the composition bar the dock affordance layer set. The caption
 * feed binds the runner's `beat` / `scene` / `complete` / `error` events; captions narrate
 * the operations in vocabulary terms, so the tour teaches the API by describing itself.
 *
 * Re-projection follows the shared staged ownership transaction: surviving panes and tab chrome
 * move into the next projected shell while the preview and indicator overlays remain persistent
 * siblings. The `workspace` advisory block of the screenplay (hover-reveal opt-in) is threaded
 * into the projection options — inert until the rail interaction layer lands, correct afterwards.
 * @class Neo.examples.dashboard.choreography.DemoAWorkspace
 * @extends Neo.container.Base
 */
class DemoAWorkspace extends Container {
    static config = {
        /**
         * @member {String} className='Neo.examples.dashboard.choreography.DemoAWorkspace'
         * @protected
         */
        className: 'Neo.examples.dashboard.choreography.DemoAWorkspace',
        /**
         * `Neo.examples.dashboard.Palette` carries the example-owned surface vocabulary;
         * the demo never imports a product app's palette to render. The
         * `Neo.dashboard.Container` entry carries the dock motion/token contract
         * (`--dock-transition-*`, reveal keyframes) — the projected dock tree is plain
         * containers, so nothing loads it per-class; the projection root carries the
         * matching `.neo-dashboard` scope class.
         * @member {String[]} additionalThemeFiles=['Neo.examples.dashboard.Palette','Neo.dashboard.Container']
         */
        additionalThemeFiles: ['Neo.examples.dashboard.Palette', 'Neo.dashboard.Container'],
        /**
         * @member {String[]} cls=['agentos-dockdemo-workspace']
         */
        cls: ['agentos-dockdemo-workspace'],
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         */
        layout: {ntype: 'vbox', align: 'stretch'}
        // `items` is built in construct() — each projection carries the instance-bound
        // reducer + view-sync callbacks, so it cannot live in static config.
    }

    /**
     * Beats executed in the current run — the pip strip's progress counter.
     * @member {Number} beatCount=0
     */
    beatCount = 0

    /**
     * The live committed dock-zone document — the single source of truth the view projects.
     * Mutated exclusively through {@link #applyDockZoneOperation} results.
     * @member {Object|null} dockModel=null
     */
    dockModel = null

    /**
     * The app-side Neural Link dock seam this workspace registers against and the tour
     * runner drives operations through.
     * @member {Neo.ai.client.DockService|null} dockService=null
     */
    dockService = null

    /**
     * The shared drag-affordance gesture controller (owner duck-type: this workspace).
     * Composed in {@link #construct} over the persistent overlay siblings; cleared on every
     * re-projection and destroyed with the workspace.
     * @member {Neo.dashboard.DockDragAffordances|null} dragAffordances=null
     */
    dragAffordances = null

    /**
     * The in-flight deferred re-projection, tracked as an awaitable. Every committed
     * operation defers its view-sync one tick ({@link #onDockZoneDocumentChange}); any
     * consumer that must resolve PROJECTED components — the reveal cue path — awaits this
     * promise instead of racing that deferral (an unawaited lookup runs within ~0ms of
     * the commit, resolves `null`, and no-ops silently). Commits chain onto this promise
     * with their document snapshot, so staged shell transactions never overlap.
     * @member {Promise|null} refreshPromise=null
     * @protected
     */
    refreshPromise = null

    /**
     * The tour runner playing the Demo-A screenplay against this workspace.
     * @member {Neo.ai.client.TourRunner|null} tourRunner=null
     */
    tourRunner = null

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        me.dockModel   = DockZoneModel.clone(initialDocument);
        me.dockService = Neo.create(DockService, {});

        me.tourRunner = Neo.create(TourRunner, {
            componentId: me.id,
            dockService: me.dockService,
            mode       : 'demo',
            script     : demoATourScript
        });

        me.tourRunner.on({
            beat    : me.onTourBeat,
            complete: me.onTourComplete,
            error   : me.onTourError,
            scene   : me.onTourScene,
            scope   : me
        });

        me.add([me.createTourBar(), {
            module   : Container,
            // `neo-dashboard` on the HOST, not only the projected child: custom properties
            // inherit downward only, and the two overlay layers below are SIBLINGS of the
            // projection — motion tokens (incl. the reduced-motion collapse) must live on
            // their shared ancestor or the overlays silently fall out of the contract.
            cls      : ['agentos-dockdemo-dock-host', 'neo-dashboard'],
            flex     : 1,
            layout   : {ntype: 'fit'},
            reference: 'dock-host',
            // The projection child is index 0 and the ONLY child the shared reconciler stages;
            // the preview renderer + indicator menu are PERSISTENT siblings (absolute overlays
            // via the skin) — object permanence across every re-projection.
            items: [me.projectDockModel(), {
                module   : DockPreview,
                reference: 'dock-preview'
            }, {
                module   : DockDropIndicators,
                reference: 'drop-indicators'
            }]
        }]);

        // The shared gesture controller composes the overlays it just created — one
        // app-neutral owner (producer lifecycle, memoized geometry, §06 tiers, release-truth
        // drop, generation guards) instead of a workspace-local orchestration copy.
        me.dragAffordances = Neo.create(DockDragAffordances, {
            host      : me.getReference('dock-host'),
            indicators: me.getReference('drop-indicators'),
            owner     : me,
            preview   : me.getReference('dock-preview')
        })
    }

    /**
     * The pure reducer of the workspace-ownership pattern: applies one semantic operation
     * descriptor against the live committed document and returns the executor's fail-closed
     * `{document, errors}` result. View sync happens exclusively in
     * {@link #onDockZoneDocumentChange}, which the dock seam calls on success.
     * @param {Object} descriptor The semantic operation descriptor.
     * @returns {{document: Object, errors: String[]}}
     */
    applyDockZoneOperation(descriptor) {
        return DockZoneModel.applyOperation(this.dockModel, descriptor)
    }

    /**
     * The tour bar — the only demo chrome: a play button and the caption feed, composed
     * from real child components riding the `handler` contract.
     * @returns {Object}
     */
    createTourBar() {
        let me = this;

        return {
            cls   : ['agentos-dockdemo-tourbar'],
            // explicit: the surrounding vbox writes flex inline on unflexed items,
            // which would stretch the bar to half the stage
            flex  : 'none',
            layout: {ntype: 'hbox', align: 'center'},
            ntype : 'toolbar',
            items : [{
                cls      : ['agentos-dockdemo-tour-play'],
                handler  : () => me.startTour(),
                iconCls  : 'fa fa-play',
                ntype    : 'button',
                reference: 'tour-play',
                text     : 'Tour'
            }, {
                cls : ['agentos-dockdemo-tour-caption'],
                flex: 1,
                // the cold-open invite: the human drag comes FIRST, the agent tour second —
                // the §06 camera beat opens on a hand on the layout, then "watch an agent do it"
                html     : `${demoATourScript.title} — drag any tab: every drop option lights up. Then press Tour to watch an agent drive the same operations.`,
                ntype    : 'component',
                reference: 'tour-caption',
                style    : {padding: '0 12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}
            }, {
                cls      : ['agentos-dockdemo-tour-pips'],
                flex     : 'none',
                ntype    : 'component',
                reference: 'tour-pips',
                vdom     : {cn: DemoAWorkspace.totalBeats().map(() => ({cls: ['agentos-dockdemo-pip']}))}
            }]
        }
    }

    /**
     * One entry per script step — the pip strip's build source and the progress divisor.
     * @returns {Object[]} The flattened step list of the screenplay.
     * @static
     */
    static totalBeats() {
        return demoATourScript.scenes.flatMap(scene => scene.steps)
    }

    /**
     * The read half of the dock-holder contract: exposes the live committed document, so
     * Neural Link topology reads and the tour runner's asserts see truth before and after
     * every operation.
     * @returns {Object} The current committed dockZone.v1 document.
     */
    getDockZoneDocument() {
        return this.dockModel
    }

    /**
     * The view-sync half: stores the committed document and re-projects the layout,
     * deferred one tick so a committing interaction surface is never destroyed mid-handler
     * (the normative guard from the reference workspace).
     * @param {Object} document The committed dock-zone document.
     */
    onDockZoneDocumentChange(document) {
        let me = this;

        me.dockModel = document;

        me.refreshPromise = (me.refreshPromise || Promise.resolve())
            .then(() => me.timeout(0))
            .then(() => {
                if (!me.isDestroyed) {
                    return me.refreshDockWorkspace(document)
                }
            })
    }

    /**
     * Caption feed + progress strip: every step surfaces its narration before executing
     * and lights its pip.
     * @param {Object} data The runner's beat payload.
     */
    async onTourBeat(data) {
        let me = this;

        data.caption && me.setTourCaption(data.caption);
        me.setPipProgress(++me.beatCount);

        // surface cues make narrated beats executable — the reveal cue feeds the rail's
        // machine through the same entry a native tab click uses (runtime-only; the next
        // committed operation's re-projection releases the overlay)
        if (data.cue?.type === 'reveal') {
            // the preceding commit's re-projection is deferred one tick — the rail this cue
            // targets exists only after it lands. Await the tracked settle, or the lookup
            // below resolves null and the chain no-ops silently.
            await me.refreshPromise;

            if (me.isDestroyed) return;

            me.getReference('dock-host')
                ?.down({ntype: 'dashboard-dock-rail'})
                ?.onTabClick({component: {dockItemId: data.cue.itemId}})
        }
    }

    /**
     * @param {Object} data `{completed, errors, log}`
     */
    onTourComplete(data) {
        let me = this;

        me.setTourCaption(`Tour complete — ${data.log.length} beats, every transition a committed operation.`);
        me.setPipProgress(DemoAWorkspace.totalBeats().length)
    }

    /**
     * Honest failure surface: an aborted tour names its reason instead of freezing silently.
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
     * Projects the committed document into the live container config, carrying the
     * instance-bound reducer + view-sync callbacks and the screenplay's workspace advisory
     * (the hover-reveal opt-in) as projection options.
     * @param {Function|null} [resolveComponentRef=null] Optional item resolver for staged projections.
     * @param {Object} [document=this.dockModel] Committed document snapshot to project.
     * @returns {Object}
     */
    projectDockModel(resolveComponentRef=null, document=this.dockModel) {
        let me = this;

        return DockLayoutAdapter.project(document, {
            ...demoATourScript.workspace,
            applyDockZoneOperation   : me.applyDockZoneOperation.bind(me),
            onDockCrossZoneDragCancel: data => me.dragAffordances.onDragCancel(data),
            onDockCrossZoneDragMove  : data => me.dragAffordances.onDragMove(data),
            onDockCrossZoneDrop      : data => me.dragAffordances.onDrop(data),
            onDockZoneDocumentChange : me.onDockZoneDocumentChange.bind(me),
            resolveComponentRef      : resolveComponentRef
                || (componentRef => me.resolvePane(componentRef)),
            resolveRevealComponentRef    : componentRef => me.resolvePane(componentRef)
        })
    }

    /**
     * Re-projection from the committed document, scoped to the dock-host subtree. The shared
     * reconciler stages shell index 0 and transfers surviving tab chrome/panes before cleanup;
     * the tour bar stays outside the host while preview/indicator overlays remain its persistent
     * siblings. Drag-affordance geometry is still invalidated before structural ownership moves.
     * @param {Object} [document=this.dockModel] Committed document snapshot owned by this refresh.
     * @protected
     */
    async refreshDockWorkspace(document=this.dockModel) {
        const
            me           = this,
            host         = me.getReference('dock-host'),
            placeholders = new Map();

        if (host) {
            const flip = Neo.main?.addon?.DockFlip;

            // A re-projection ends any drag affordance session: rects go stale and the drop
            // pipeline restarts its measurement lazily on the next gesture.
            me.dragAffordances.clear();

            // FLIP phase 1: snapshot the outgoing geometry (presentation-only — any failure
            // lands the new layout instantly, so the try/catch guards motion, never truth)
            try {
                await flip?.captureFirst({hostId: host.id, markerPrefix: 'agentos-dockdemo-pane-'})
            } catch (e) {/* instant landing */}

            const nextConfig = me.projectDockModel((componentRef, item, itemId) => {
                const placeholder = Neo.create({
                    module: Component,
                    header: {text: item?.title ?? componentRef ?? itemId},
                    hidden: true
                });

                placeholders.set(itemId, placeholder);

                return placeholder
            }, document);

            await DockProjectionReconciler.reconcileProjection({
                host,
                nextConfig,
                placeholders,
                resolveItem: itemId => {
                    const item = document.items[itemId];

                    return DockLayoutAdapter.decorateProjectedItem(
                        me.resolvePane(item?.componentRef ?? itemId),
                        itemId,
                        item
                    )
                }
            });

            // FLIP phase 2: fire-and-forget — the addon self-waits for the new tree to paint,
            // inverts the survivors onto their old geometry and releases the transition
            // the counted motion signal brackets the awaited animation window — ownership
            // lives in DockMotionSignal (fail-safe backstopped), never in the addon
            // Guard on the CAPABILITY, not on truthiness. `Neo.main.addon.DockFlip` holds the
            // registered CLASS until an instance replaces it, and a class is truthy with no
            // `play` — so `if (flip)` admits it and the call below throws. This matches the
            // optional-chained `flip?.captureFirst` two calls up, which never had the problem.
            if (flip?.play) {
                DockMotionSignal.enter(me);
                flip.play({hostId: host.id, markerPrefix: 'agentos-dockdemo-pane-'})
                    .catch(() => {})
                    .finally(() => DockMotionSignal.leave(me))
            }
        }
    }

    /**
     * Resolves a model `componentRef` to its rendered pane. The editor carries the
     * ticking-clock witness (the demo's continuity proof); the other panes stay labeled
     * placeholders with stable cls hooks the SCSS skin targets.
     * @param {String} componentRef
     * @returns {Object}
     */
    resolvePane(componentRef) {
        if (componentRef === 'Editor') {
            // the flip marker rides the cls config so newly materialized panes join FLIP correlation
            return {cls: ['agentos-dockdemo-clock-pane', 'agentos-dockdemo-pane-editor'], module: ClockPane}
        }

        return {
            cls  : ['agentos-dockdemo-pane', `agentos-dockdemo-pane-${componentRef.toLowerCase()}`],
            html : componentRef,
            ntype: 'component',
            style: {alignItems: 'center', display: 'flex', fontSize: '18px', justifyContent: 'center'}
        }
    }

    /**
     * Lights the first `count` pips of the progress strip.
     * @param {Number} count
     */
    setPipProgress(count) {
        const pips = this.getReference('tour-pips');

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
     * Updates the caption feed component.
     * @param {String} text
     */
    setTourCaption(text) {
        const caption = this.getReference('tour-caption');

        caption && (caption.html = text)
    }

    /**
     * Plays the screenplay from the top. A second click while running is a narrated no-op
     * (the runner throws on concurrent starts — the guard stays in one place).
     */
    async startTour() {
        let me = this;

        // the running-guard comes FIRST: a second click during a tour must be a true
        // no-op — resetting the stage before the runner's re-entrancy throw would trash
        // the active choreography mid-flight
        if (me.tourRunner.running) {
            me.setTourCaption('Tour already running — let it finish its story.');
            return
        }

        if (me.tourRunner.log.length) {
            // restart semantics: reset the stage to the opening document before replaying
            me.onDockZoneDocumentChange(DockZoneModel.clone(initialDocument));
            await me.refreshPromise
        }

        me.beatCount = 0;
        me.setPipProgress(0);

        await me.tourRunner.start()
    }

    /**
     * Tears down the runner, seam and preview producer with the workspace.
     */
    destroy(...args) {
        let me = this;

        me.tourRunner?.destroy();
        me.dockService?.destroy();
        me.dragAffordances?.destroy();

        super.destroy(...args)
    }
}

export default Neo.setupClass(DemoAWorkspace);
