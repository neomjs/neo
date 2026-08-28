import ClockPane                          from './ClockPane.mjs';
import Container                          from '../../../src/container/Base.mjs';
import DockDragAffordances                from '../../../src/dashboard/dock/interaction/DragAffordances.mjs';
import DockDropIndicators                 from '../../../src/dashboard/dock/interaction/DropIndicators.mjs';
import DockPreview                        from '../../../src/dashboard/dock/interaction/Preview.mjs';
import DockService                        from '../../../src/ai/client/DockService.mjs';
import DockWorkspace                      from '../../../src/dashboard/dock/Workspace.mjs';
import DockZoneModel                      from '../../../src/dashboard/DockZoneModel.mjs';
import TourRunner                         from '../../../src/ai/client/TourRunner.mjs';
import {demoATourScript, initialDocument} from './demoADockChoreography.mjs';
import '../../../src/button/Base.mjs';   // registers the `button` ntype the tour bar composes
import '../../../src/tab/Container.mjs'; // registers the `tab-container` ntype the projection emits
import '../../../src/toolbar/Base.mjs';  // registers the `toolbar` ntype the tour bar uses

/**
 * @summary The Demo-A showcase workspace: the reducer-container that hosts the dock
 * choreography and plays its screenplay through the tour runner.
 *
 * The normative workspace host is the engine class {@link Neo.dashboard.dock.Workspace}, which the
 * docking design record fixes as canonical; this class is one of its CONSUMERS, not the pattern
 * itself. Everything the holder contract requires — the committed dock-zone document as single
 * source of truth, the pure reducer, the read half Neural Link topology calls before any operation
 * ran, and the deferred view-sync that re-projects from each committed document — is inherited.
 * What stays here is what the demo actually is: the screenplay, the tour bar, and the panes.
 *
 * Because the holder contract is satisfied by the base class, this workspace is drivable
 * identically by all three consumers of the trinity: the tour bar's play button (this class), an
 * agent through the Neural Link dock tools, and the whitebox replay specs — every one of them
 * dispatches semantic operation descriptors through the same commit path; there is no parallel
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
 * @extends Neo.dashboard.dock.Workspace
 */
class DemoAWorkspace extends DockWorkspace {
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
         * The projection mounts into the dock host, not into the workspace itself: the tour bar is
         * a sibling ABOVE it, and the preview + indicator overlays are persistent siblings BESIDE
         * it that must survive every re-projection.
         * @member {String} dockHostReference='dock-host'
         */
        dockHostReference: 'dock-host',
        /**
         * The demo's own FLIP correlation prefix, kept from before the engine class owned the
         * stamping. Item ids in this screenplay are the lower-cased component refs (`editor` for
         * `Editor`), so the engine's itemId-keyed marker reproduces the class names the panes
         * carried when {@link #resolvePane} stamped them by hand.
         * @member {String} flipMarkerPrefix='agentos-dockdemo-pane-'
         */
        flipMarkerPrefix: 'agentos-dockdemo-pane-',
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         */
        layout: {ntype: 'vbox', align: 'stretch'}
        // `items` is built in construct() — the projection is instance-bound, so it cannot live
        // in static config.
    }

    /**
     * Beats executed in the current run — the pip strip's progress counter.
     * @member {Number} beatCount=0
     */
    beatCount = 0

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
     * @member {Neo.dashboard.dock.interaction.DragAffordances|null} dragAffordances=null
     */
    dragAffordances = null

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
     * A re-projection ends any drag-affordance session: rects go stale and the drop pipeline
     * restarts its measurement lazily on the next gesture. The base class runs this AFTER the FLIP
     * snapshot of the outgoing geometry, so clearing here can never alter the captured first rects.
     * @param {Object} document The committed document this refresh projects.
     * @param {Object} refreshOptions The options the scheduling commit produced.
     */
    beforeRefreshDockWorkspace(document, refreshOptions) {
        this.dragAffordances.clear()
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
     * The screenplay's `workspace` advisory block (the hover-reveal opt-in) plus the drag-affordance
     * layer's gesture seams. The controller owns its own placement producer, so routing the drop
     * seam here deliberately overrides the base class's built-in cross-zone drop path — the reducer
     * and view-sync bindings stay class-owned and are not overridable from this hook.
     * @returns {Object}
     */
    getDockProjectionOptions() {
        let me = this;

        return {
            ...demoATourScript.workspace,
            onDockCrossZoneDragCancel: data => me.dragAffordances.onDragCancel(data),
            onDockCrossZoneDragMove  : data => me.dragAffordances.onDragMove(data),
            onDockCrossZoneDrop      : data => me.dragAffordances.onDrop(data)
        }
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
     * Resolves a catalog item to its rendered pane. The editor carries the ticking-clock witness
     * (the demo's continuity proof); the other panes stay labeled placeholders with the stable cls
     * hook the SCSS skin targets.
     *
     * Keyed on the item id rather than the component ref: the id is the stable workspace identity
     * the committed document and the FLIP correlation both use, and it is what the base class hands
     * every resolver. The per-item marker class is stamped by {@link #flipMarkerPrefix}, never here.
     * @param {String} itemId The stable workspace identity from the item catalog.
     * @param {Object} item The persisted item record.
     * @returns {Object}
     */
    resolvePane(itemId, item) {
        const componentRef = item?.componentRef ?? itemId;

        if (componentRef === 'Editor') {
            return {cls: ['agentos-dockdemo-clock-pane'], module: ClockPane}
        }

        return {
            cls  : ['agentos-dockdemo-pane'],
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
