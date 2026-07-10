import ClockPane                          from './ClockPane.mjs';
import Container                          from '../../../../../src/container/Base.mjs';
import DockDropIndicators                 from '../../../../../src/dashboard/DockDropIndicators.mjs';
import DockLayoutAdapter                  from '../../../../../src/dashboard/DockLayoutAdapter.mjs';
import DockMotionSignal                   from '../../../../../src/dashboard/DockMotionSignal.mjs';
import DockPreview                        from '../../../view/DockPreview.mjs';
import DockPreviewProducer                from '../../../../../src/dashboard/DockPreviewProducer.mjs';
import DockService                        from '../../../../../src/ai/client/DockService.mjs';
import DockZoneModel                      from '../../../../../src/dashboard/DockZoneModel.mjs';
import TourRunner                         from '../../../../../src/ai/client/TourRunner.mjs';
import {previewToOperation}               from '../../../../../src/dashboard/dockPreviewContract.mjs';
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
         * childapp, so it is declared as an additional theme dependency here. The
         * `Neo.dashboard.Container` entry carries the dock motion/token contract
         * (`--dock-transition-*`, reveal keyframes) — the projected dock tree is plain
         * containers, so nothing loads it per-class; the projection root carries the
         * matching `.neo-dashboard` scope class.
         * @member {String[]} additionalThemeFiles=['AgentOS.view.Viewport','Neo.dashboard.Container']
         */
        additionalThemeFiles: ['AgentOS.view.Viewport', 'Neo.dashboard.Container'],
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
     * Measured drag-session geometry (host rect + tabs-zone rects + the chips' root target),
     * built lazily on the first drag-move of a gesture and invalidated on drop, Escape, and
     * every re-projection. Doubles as the drag-active flag for the Escape guard. Runtime-only.
     * @member {Object|null} dragGeometry=null
     * @protected
     */
    dragGeometry = null
    /**
     * Set by mid-drag Escape: the §06 cancel — indicator menu and preview clear immediately,
     * and the release commits NOTHING. The proxy visual stays with the base drag until
     * release (no drag-layer abort API exists; documented residual on the ticket).
     * @member {Boolean} dragSuppressed=false
     * @protected
     */
    dragSuppressed = false
    /**
     * The in-flight deferred re-projection, tracked as an awaitable. Every committed
     * operation defers its view-sync one tick ({@link #onDockZoneDocumentChange}); any
     * consumer that must resolve PROJECTED components — the reveal cue path — awaits this
     * promise instead of racing that deferral (an unawaited lookup runs within ~0ms of
     * the commit, resolves `null`, and no-ops silently). Stale-safe: each commit
     * overwrites it, so awaiting always settles on the LATEST projection.
     * @member {Promise|null} refreshPromise=null
     * @protected
     */
    refreshPromise = null

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

        // Escape = the §06 mid-drag cancel; the keydown bubbles up from the dragged tab
        // button (focus lives inside the projection during a header drag).
        me.addDomListeners([{keydown: me.onWorkspaceKeyDown, scope: me}]);

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
            // The projection child is index 0 and the ONLY child the coarse refresh replaces;
            // the preview renderer + indicator menu are PERSISTENT siblings (absolute overlays
            // via the skin) — object permanence across every re-projection.
            items: [me.projectDockModel(), {
                module   : DockPreview,
                reference: 'dock-preview'
            }, {
                module   : DockDropIndicators,
                reference: 'drop-indicators'
            }]
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

        me.refreshPromise = me.timeout(0).then(() => {
            if (!me.isDestroyed) {
                return me.refreshDockWorkspace()
            }
        })
    }

    /**
     * Ends a drag affordance session: geometry cache dropped (it doubles as the drag-active
     * flag), Escape suppression reset, indicator menu and preview cleared. Called on drop,
     * on Escape, and by every re-projection.
     * @protected
     */
    clearDragAffordances() {
        let me = this;

        me.dragGeometry   = null;
        me.dragSuppressed = false;

        me.getReference('drop-indicators')?.clear();

        let preview = me.getReference('dock-preview');

        preview && (preview.dockPreview = null)
    }

    /**
     * Measures the drag-session geometry once per gesture (memoized as a promise so the
     * ~60hz move stream never stacks measurements): the host rect (the indicator layer's
     * coordinate origin), every projected tabs-zone rect with its parent-split orientation,
     * and the chips' root target — the edge-zone's CENTER node when the document root is an
     * edge-zone ("split the main workspace area"), the root itself otherwise. `splitNode`
     * accepts any existing node as its wrap target, so the chip commits are well-defined.
     * @returns {Promise<Object|null>} {hostRect, zones, root} or null when nothing is measurable
     * @protected
     */
    ensureDragGeometry() {
        let me = this;

        if (me.dragGeometry) return me.dragGeometry;

        let host  = me.getReference('dock-host'),
            nodes = me.dockModel?.nodes || {};

        if (!host) return Promise.resolve(null);

        let zoneEntries = Object.keys(nodes)
                .filter(nodeId => nodes[nodeId].type === 'tabs')
                .map(nodeId => ({nodeId, container: host.down({dockNodeId: nodeId})}))
                .filter(zone => zone.container),
            rootId      = nodes[me.dockModel.root]?.type === 'edge-zone'
                ? (nodes[me.dockModel.root].zones?.center ?? me.dockModel.root)
                : me.dockModel.root;

        me.dragGeometry = me.getDomRect([host.id, ...zoneEntries.map(zone => zone.container.id)]).then(([hostRect, ...zoneRects]) => {
            let geometry = hostRect && {
                hostRect,
                root : {nodeId: rootId, rect: hostRect},
                zones: zoneEntries
                    .map((zone, index) => ({
                        nodeId     : zone.nodeId,
                        rect       : zoneRects[index],
                        orientation: Object.values(nodes).find(node => node.type === 'split' && node.children?.includes(zone.nodeId))?.orientation ?? null
                    }))
                    .filter(zone => zone.rect)
            };

            // A gesture's FIRST move can outrace measurability (fresh mount, mid-layout):
            // a degenerate result must not latch for the whole gesture — uncache so the
            // next move frame re-measures and the session self-heals.
            if (!geometry || geometry.zones.length < 1) {
                me.dragGeometry = null;
                return null
            }

            let indicators = me.getReference('drop-indicators');

            indicators && (indicators.hostRect = geometry.hostRect);

            return geometry
        });

        return me.dragGeometry
    }

    /**
     * Converts a measured viewport rect into the dock-host's local space — the coordinate
     * system both overlay children (preview renderer, indicator menu) position in.
     * @param {Object} rect viewport-space {x, y, width, height}
     * @param {Object} hostRect the measured host rect
     * @returns {Object}
     * @protected
     */
    localRect(rect, hostRect) {
        return {x: rect.x - hostRect.x, y: rect.y - hostRect.y, width: rect.width, height: rect.height}
    }

    /**
     * The per-frame drag consumer (`dockCrossZoneDragMove` via the projection): the §06
     * primary tier. The indicator menu follows the hovered zone (candidate set swaps on zone
     * change only — object permanence lets the cross GLIDE); the pointer selects an indicator
     * geometrically; the selected candidate's preview — or the pointer-inference FALLBACK
     * tier when no indicator is hovered — feeds the renderer with its exact target region.
     * @param {Object} data {clientX, clientY, itemId, sourceNodeId}
     */
    async onDockCrossZoneDragMove({clientX, clientY, itemId, sourceNodeId}) {
        let me = this;

        if (me.dragSuppressed) return;

        let geometry = await me.ensureDragGeometry();

        // re-check after the await: Escape or a re-projection may have ended the session
        if (!geometry || me.dragSuppressed || me.isDestroyed) return;

        let pointer    = {x: clientX, y: clientY},
            indicators = me.getReference('drop-indicators'),
            preview    = me.getReference('dock-preview'),
            producer   = me.dockPreviewProducer,
            zone       = producer.hitTestZone(geometry.zones, pointer);

        if (indicators) {
            if ((zone?.nodeId ?? null) !== (indicators.candidateSet?.zone?.nodeId ?? null)) {
                indicators.candidateSet = zone
                    ? producer.produceCandidates({pointer, zones: geometry.zones, itemId, sourceNodeId, root: geometry.root})
                    : null
            }
        }


        let candidate   = indicators?.updatePointer(pointer) ?? null,
            dockPreview = candidate?.preview
                ?? producer.produce({pointer, zones: geometry.zones, itemId, sourceNodeId});

        if (preview) {
            preview.dockPreview = dockPreview;

            if (dockPreview) {
                let targetRect = dockPreview.target.nodeId === geometry.root.nodeId
                    ? geometry.root.rect
                    : geometry.zones.find(entry => entry.nodeId === dockPreview.target.nodeId)?.rect;

                targetRect && preview.applyTargetGeometry(me.localRect(targetRect, geometry.hostRect))
            }
        }
    }

    /**
     * The drop half (`dockCrossZoneDrop` via the projection): the indicator is re-hit-tested
     * at the RELEASE coordinates — release truth, never cached hover truth (a pointer that
     * left the menu after hovering an indicator must not commit the stale selection), and a
     * candidate only counts when it was built for the item THIS gesture drags. A release-point
     * indicator wins over pointer inference — the §06 tier order — and both commit through
     * `previewToOperation` unchanged. An Escape-suppressed gesture commits nothing. Same-zone
     * pointer drops stay excluded from the fallback (the within-toolbar reorder already
     * handled them); indicator drops keep self-targets deliberately (splitting your own zone
     * is a real operation).
     * @param {Object} data {clientX, clientY, itemId, sourceNodeId}
     */
    async onDockCrossZoneDrop({clientX, clientY, itemId, sourceNodeId}) {
        let me         = this,
            suppressed = me.dragSuppressed,
            geometry   = me.dragGeometry ? await me.dragGeometry : null,
            pointer    = {x: clientX, y: clientY},
            preview    = null;

        if (!suppressed) {
            let candidate = me.getReference('drop-indicators')?.hitTest(pointer);

            if (candidate?.preview?.itemId === itemId) {
                preview = candidate.preview
            } else if (geometry) {
                preview = me.dockPreviewProducer.produce({
                    pointer,
                    zones: geometry.zones.filter(zone => zone.nodeId !== sourceNodeId),
                    itemId,
                    sourceNodeId
                })
            }
        }

        me.clearDragAffordances();

        let descriptor = previewToOperation(preview);

        if (descriptor) {
            let result = me.applyDockZoneOperation(descriptor);

            if (result && !result.errors?.length && result.document) {
                me.onDockZoneDocumentChange(result.document)
            }
        }
    }

    /**
     * Escape during a live drag cancels the affordance session (§06, absorbs tree line C5):
     * menu and preview clear instantly, the release commits nothing. Outside a drag the key
     * passes through untouched.
     * @param {Object} data The keydown event data.
     */
    onWorkspaceKeyDown(data) {
        let me = this;

        if (data.key === 'Escape' && me.dragGeometry) {
            me.dragSuppressed = true;

            me.getReference('drop-indicators')?.clear();

            let preview = me.getReference('dock-preview');

            preview && (preview.dockPreview = null)
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
            onDockCrossZoneDragMove : me.onDockCrossZoneDragMove.bind(me),
            onDockCrossZoneDrop     : me.onDockCrossZoneDrop.bind(me),
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
        const
            me   = this,
            host = me.getReference('dock-host');

        if (host) {
            const flip = Neo.main?.addon?.DockFlip;

            // A re-projection ends any drag affordance session: rects go stale and the drop
            // pipeline restarts its measurement lazily on the next gesture.
            me.clearDragAffordances();

            // FLIP phase 1: snapshot the outgoing geometry (presentation-only — any failure
            // lands the new layout instantly, so the try/catch guards motion, never truth)
            try {
                await flip?.captureFirst({hostId: host.id, markerPrefix: 'agentos-dockdemo-pane-'})
            } catch (e) {/* instant landing */}

            // Surgical: only the projection child (index 0) rebuilds — the preview renderer
            // and the indicator menu are persistent overlay siblings and must survive.
            host.removeAt(0);
            host.insert(0, this.projectDockModel());

            // FLIP phase 2: fire-and-forget — the addon self-waits for the new tree to paint,
            // inverts the survivors onto their old geometry and releases the transition
            // the counted motion signal brackets the awaited animation window — ownership
            // lives in DockMotionSignal (fail-safe backstopped), never in the addon
            if (flip) {
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
