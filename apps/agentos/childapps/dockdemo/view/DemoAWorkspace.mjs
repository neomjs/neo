import ClockPane                          from './ClockPane.mjs';
import Container                          from '../../../../../src/container/Base.mjs';
import DockLayoutAdapter                  from '../../../../../src/dashboard/DockLayoutAdapter.mjs';
import DockPreviewProducer                from '../../../../../src/dashboard/DockPreviewProducer.mjs';
import DockService                        from '../../../../../src/ai/client/DockService.mjs';
import DockZoneModel                      from '../../../../../src/dashboard/DockZoneModel.mjs';
import TourRunner                         from '../../../../../src/ai/client/TourRunner.mjs';
import {demoATourScript, initialDocument} from '../../../tour/demoADockChoreography.mjs';
import '../../../../../src/button/Base.mjs';   // registers the `button` ntype the tour bar composes
import '../../../../../src/tab/Container.mjs'; // registers the `tab-container` ntype the projection emits
import '../../../../../src/toolbar/Base.mjs';  // registers the `toolbar` ntype the tour bar uses

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
 * Refresh note: `refreshDockWorkspace()` follows the current normative coarse pattern
 * (wholesale re-projection). A known stale-DOM defect on retired components under this
 * pattern is tracked on the dashboard lane; recording takes are sequenced behind that fix.
 * The `workspace` advisory block of the screenplay (hover-reveal opt-in) is threaded into
 * the projection options — inert until the rail interaction layer lands, correct afterwards.
 * @class AgentOS.childapps.dockdemo.view.DemoAWorkspace
 * @extends Neo.container.Base
 */
class DemoAWorkspace extends Container {
    static config = {
        /**
         * @member {String} className='AgentOS.childapps.dockdemo.view.DemoAWorkspace'
         * @protected
         */
        className: 'AgentOS.childapps.dockdemo.view.DemoAWorkspace',
        /**
         * The `--fm-*` design tokens this skin consumes are defined in the main app
         * Viewport's theme layer; per-class CSS loading would never fetch it from a
         * childapp, so it is declared as an additional theme dependency here.
         * @member {String[]} additionalThemeFiles=['AgentOS.view.Viewport']
         */
        additionalThemeFiles: ['AgentOS.view.Viewport'],
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
     * The live committed dock-zone document — the single source of truth the view projects
     * from. Initialized to the screenplay's opening stage; advanced by
     * {@link #onDockZoneDocumentChange} on every committed operation.
     * @member {Object|null} dockModel=null
     */
    dockModel = null
    /**
     * The app-side Neural Link dock seam this workspace registers against and the tour
     * runner drives through.
     * @member {Neo.ai.client.DockService|null} dockService=null
     */
    dockService = null
    /**
     * Drag-preview producer enabling manual drive (tab drag previews) alongside the tour —
     * manual interaction stays available the whole time; the tour is a guest, not a lock.
     * @member {Neo.dashboard.DockPreviewProducer|null} dockPreviewProducer=null
     */
    dockPreviewProducer = null
    /**
     * The tour runner playing the Demo-A screenplay against this workspace.
     * @member {Neo.ai.client.TourRunner|null} tourRunner=null
     */
    tourRunner = null
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

        me.dockModel           = DockZoneModel.clone(initialDocument);
        me.dockPreviewProducer = Neo.create(DockPreviewProducer);
        me.dockService         = Neo.create(DockService, {});

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
            cls      : ['agentos-dockdemo-dock-host'],
            flex     : 1,
            items    : [me.projectDockModel()],
            layout   : {ntype: 'fit'},
            reference: 'dock-host'
        }])
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
                cls      : ['agentos-dockdemo-tour-caption'],
                flex     : 1,
                html     : demoATourScript.title,
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

        me.timeout(0).then(() => {
            if (!me.isDestroyed) {
                me.refreshDockWorkspace()
            }
        })
    }

    /**
     * Caption feed + progress strip: every step surfaces its narration before executing
     * and lights its pip.
     * @param {Object} data The runner's beat payload.
     */
    onTourBeat(data) {
        let me = this;

        data.caption && me.setTourCaption(data.caption);
        me.setPipProgress(++me.beatCount);

        // surface cues make narrated beats executable — the reveal cue feeds the rail's
        // machine through the same entry a native tab click uses (runtime-only; the next
        // committed operation's re-projection releases the overlay)
        if (data.cue?.type === 'reveal') {
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
     * @returns {Object}
     */
    projectDockModel() {
        let me = this;

        return DockLayoutAdapter.project(me.dockModel, {
            ...demoATourScript.workspace,
            applyDockZoneOperation  : me.applyDockZoneOperation.bind(me),
            onDockZoneDocumentChange: me.onDockZoneDocumentChange.bind(me),
            resolveComponentRef     : componentRef => me.resolvePane(componentRef)
        })
    }

    /**
     * Re-projection from the committed document, scoped to the dock-host subtree — the tour
     * bar lives OUTSIDE the refreshed container, so the caption feed's rapid per-beat
     * updates never race a teardown of their own component (in-flight vdom replies to a
     * destroyed component wedge, and ancestor updates then yield to the wedge forever).
     * The dock subtree itself still rebuilds coarsely per the current normative pattern.
     * @protected
     */
    async refreshDockWorkspace() {
        const host = this.getReference('dock-host');

        if (host) {
            const flip = Neo.main?.addon?.DockFlip;

            // FLIP phase 1: snapshot the outgoing geometry (presentation-only — any failure
            // lands the new layout instantly, so the try/catch guards motion, never truth)
            try {
                await flip?.captureFirst({hostId: host.id, markerPrefix: 'agentos-dockdemo-pane-'})
            } catch (e) {/* instant landing */}

            host.removeAll();
            host.add(this.projectDockModel());

            // FLIP phase 2: fire-and-forget — the addon self-waits for the new tree to paint,
            // inverts the survivors onto their old geometry and releases the transition
            flip?.play({hostId: host.id, markerPrefix: 'agentos-dockdemo-pane-'})?.catch?.(() => {})
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
            // the flip marker rides the cls config so FLIP correlation survives instance recreation
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
            me.dockModel = DockZoneModel.clone(initialDocument);
            me.refreshDockWorkspace()
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
        me.dockPreviewProducer?.destroy();

        super.destroy(...args)
    }
}

export default Neo.setupClass(DemoAWorkspace);
