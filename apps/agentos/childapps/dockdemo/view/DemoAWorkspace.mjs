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

        me.add(me.buildWorkspaceItems())
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
     * Builds the tour bar + the dock projection from current state.
     * @returns {Object[]}
     */
    buildWorkspaceItems() {
        let dockConfig = this.projectDockModel();

        dockConfig.flex = 1;

        return [
            this.createTourBar(),
            dockConfig
        ]
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
            }]
        }
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
     * Caption feed: every step surfaces its narration before executing.
     * @param {Object} data The runner's beat payload.
     */
    onTourBeat(data) {
        data.caption && this.setTourCaption(data.caption)
    }

    /**
     * @param {Object} data `{completed, errors, log}`
     */
    onTourComplete(data) {
        this.setTourCaption(`Tour complete — ${data.log.length} beats, every transition a committed operation.`)
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
     * Wholesale re-projection from the committed document — the current normative refresh.
     * @protected
     */
    refreshDockWorkspace() {
        this.removeAll();
        this.add(this.buildWorkspaceItems())
    }

    /**
     * Resolves a model `componentRef` to its rendered pane. Skeleton tier: labeled panes
     * with stable cls hooks; the themed pane content (including the ticking-clock witness
     * inside the editor pane) lands with the visual-polish slice against these same hooks.
     * @param {String} componentRef
     * @returns {Object}
     */
    resolvePane(componentRef) {
        return {
            cls  : ['agentos-dockdemo-pane', `agentos-dockdemo-pane-${componentRef.toLowerCase()}`],
            html : componentRef,
            ntype: 'component',
            style: {alignItems: 'center', display: 'flex', fontSize: '18px', justifyContent: 'center'}
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

        if (me.tourRunner.log.length && !me.tourRunner.isDestroyed) {
            // restart semantics: reset the stage to the opening document before replaying
            me.dockModel = DockZoneModel.clone(initialDocument);
            me.refreshDockWorkspace()
        }

        try {
            await me.tourRunner.start()
        } catch (e) {
            // concurrent-start misuse throws by contract; narrate instead of crashing the surface
            me.setTourCaption('Tour already running — let it finish its story.')
        }
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
