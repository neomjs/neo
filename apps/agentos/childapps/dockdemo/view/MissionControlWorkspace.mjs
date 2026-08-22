import Component                  from '../../../../../src/component/Base.mjs';
import Container                  from '../../../../../src/container/Base.mjs';
import FleetCockpit               from '../../../view/fleet/cockpit/Container.mjs';
import TourRunner                 from '../../../../../src/ai/client/TourRunner.mjs';
import cockpitDockDocument        from '../../../util/cockpitDockDocument.mjs';
import {fusionTourScript}         from '../../../tour/fusionFlagship.mjs';
import {missionControlTourScript} from '../../../tour/missionControlWalkthrough.mjs';
import '../../../../../src/button/Base.mjs';  // registers the `button` ntype the tour bar composes
import '../../../../../src/toolbar/Base.mjs'; // registers the `toolbar` ntype the tour bar uses

/**
 * @summary The demo/witness host for the real AgentOS Fleet Manager: it COMPOSES the production
 * `FleetCockpit` module unchanged and owns the tour orchestration around it — the `TourRunner`,
 * the play control, the caption feed, and the settled-cue chain. It is the correct home for the
 * choreography that used to live inside the product cockpit: the cockpit manages a real fleet,
 * this host proves and presents it.
 *
 * **Composition, never a fork.** The child at `composed-cockpit` is the literal product class; it
 * self-boots its own `dockService` + `dockModel`, so it needs no config here. The host drives it
 * exactly as an external agent would over the Neural Link — through the cockpit's own PUBLIC
 * verbs on that live instance (the dock reducer/view-sync, the perspective and vessel verbs, the
 * activity-stream reactive seam, the selection controller). No demo-only code is added to the
 * product, and no new product API is invented; the machinery is re-homed, not weakened, so every
 * screenplay/replay/beat-log falsifier is preserved — addressed to this host, not the product.
 *
 * **The single-flight take contract** mirrors the cockpit's former one exactly: `tourRunner` is
 * claimed synchronously before any await (a concurrent play refuses at the guard), the report
 * publishes CURRENT-attempt truth (a prior take's success can never leak into a failed run), the
 * runner never awaits host cues so the settled `cuePromise` chain must drain before the report
 * exists, and the `finally` releases ownership + restores any activity-stream state a burst
 * displaced. The fusion tour is the play button; the mission-control walkthrough is driven
 * programmatically by its e2e leg and the recording pipeline through {@link #playWalkthroughTour}.
 *
 * @class AgentOS.childapps.dockdemo.view.MissionControlWorkspace
 * @extends Neo.container.Base
 */
class MissionControlWorkspace extends Container {
    static config = {
        /**
         * @member {String} className='AgentOS.childapps.dockdemo.view.MissionControlWorkspace'
         * @protected
         */
        className: 'AgentOS.childapps.dockdemo.view.MissionControlWorkspace',
        /**
         * The composed cockpit and its sub-tree carry `--fm-*` tokens defined in the main app
         * Viewport's theme layer; per-class CSS loading would never fetch it from a childapp, so
         * it is declared as an additional theme dependency here (the Demo A/B precedent). The
         * dashboard container entry carries the dock motion/token contract for the projected tree.
         * @member {String[]} additionalThemeFiles=['AgentOS.view.Viewport','Neo.dashboard.Container']
         */
        additionalThemeFiles: ['AgentOS.view.Viewport', 'Neo.dashboard.Container'],
        /**
         * @member {String[]} cls=['agentos-dockdemo-workspace','agentos-dockdemo-mission']
         */
        cls: ['agentos-dockdemo-workspace', 'agentos-dockdemo-mission'],
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         */
        layout: {ntype: 'vbox', align: 'stretch'}
        // `items` is built in construct() — the composed cockpit + the host-owned tour bar.
    }

    /**
     * The serialized hosting-cue chain (the Workstation settlement pattern): each beat's cue
     * chains here and {@link #playTour} awaits the WHOLE chain before reporting — a tour can be
     * green in the runner log yet fail on a surface cue.
     * @member {Promise} cuePromise
     */
    cuePromise = Promise.resolve()

    /**
     * Settled cue receipts for the current take — the observable proof each hosting cue landed.
     * @member {Object[]} cueReceipts
     */
    cueReceipts = []

    /**
     * Cue failures for the current take; a non-empty list fails the report even on a green runner.
     * @member {String[]} cueErrors
     */
    cueErrors = []

    /**
     * The CURRENT ATTEMPT's settled tour report. Cleared synchronously at play-start so a reader
     * can never attribute a previous take's success to this attempt.
     * @member {Object|null} lastTourReport=null
     */
    lastTourReport = null

    /**
     * The composed cockpit's activity-stream state an `activity-burst` cue displaced, captured
     * once for the take-terminal restore ({@link #restoreTourStream}). `null` when no burst ran.
     * @member {Object|null} tourStreamRestore=null
     */
    tourStreamRestore = null

    /**
     * The tour runner playing a screenplay against the composed cockpit; exists only while a tour
     * plays (created in {@link #playTour}, destroyed on the terminal), so `!!tourRunner` is the
     * live-take signal.
     * @member {Neo.ai.client.TourRunner|null} tourRunner=null
     */
    tourRunner = null

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        me.add([me.createTourBar(), {
            module   : FleetCockpit,
            flex     : 1,
            reference: 'composed-cockpit'
        }])
    }

    /**
     * The live composed product cockpit this host drives.
     * @returns {AgentOS.view.fleet.cockpit.Container}
     */
    get cockpit() {
        return this.getReference('composed-cockpit')
    }

    /**
     * The host's tour chrome — the play control + the caption feed, the ONLY demo affordances,
     * composed from real child components riding the `handler` contract (zero manual DOM listeners).
     * @returns {Object}
     */
    createTourBar() {
        let me = this;

        return {
            cls   : ['agentos-dockdemo-tourbar'],
            // explicit: the surrounding vbox writes flex inline on unflexed items, which would
            // stretch the bar to half the stage
            flex  : 'none',
            layout: {ntype: 'hbox', align: 'center'},
            ntype : 'toolbar',
            items : [{
                cls      : ['agentos-dockdemo-tour-play'],
                handler  : () => me.playFusionTour(),
                iconCls  : 'fa fa-play',
                ntype    : 'button',
                reference: 'tour-play',
                text     : 'Play tour'
            }, {
                cls      : ['agentos-dockdemo-tour-caption', 'fm-tour-caption'],
                flex     : 1,
                hidden   : true,
                ntype    : 'component',
                reference: 'mission-tour-caption',
                style    : {padding: '0 12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}
            }]
        }
    }

    /**
     * @summary Plays the flagship fusion tour on the composed cockpit (cockpit → docked panel →
     * OS window → share). Delegates to {@link #playTour}.
     * @returns {Promise<Object>} The runner's completion result `{completed, errors, log}`.
     */
    playFusionTour() {
        return this.playTour(fusionTourScript)
    }

    /**
     * @summary Plays the mission-control walkthrough on the composed cockpit — the public story
     * ("watch a real AI engineering team run"). Delegates to {@link #playTour}; driven over the
     * Neural Link by the walkthrough's e2e leg and the recording pipeline.
     * @returns {Promise<Object>} The runner's completion result `{completed, errors, log}`.
     */
    playWalkthroughTour() {
        return this.playTour(missionControlTourScript)
    }

    /**
     * @summary Plays ONE `neo.tour.script.v1` screenplay against the composed cockpit through the
     * standard runner trinity. The runner exists only while the tour plays; a second invocation
     * while one runs is a guarded refusal (one stage, one take). Document ops ride the composed
     * cockpit's own `execute_dock_operation` seam a live agent drives; every host transition
     * arrives as a cue ({@link #onTourBeat}) and reuses the cockpit's OWN verbs — no tour-only
     * code path touches dock truth.
     * @param {Object} script The `neo.tour.script.v1` screenplay to play.
     * @returns {Promise<Object>} The runner's completion result `{completed, errors, log}`.
     */
    async playTour(script) {
        let me      = this,
            cockpit = me.cockpit;

        if (me.tourRunner) {
            return {completed: false, cueErrors: [], errors: ['a tour is already running'], log: []}
        }

        // fail-closed preconditions for a deterministic take: a detached detail pane belongs to a
        // previous (possibly failed) vessel cycle — reattach is a host decision, never implicit.
        if (cockpit?.detachedDetail) {
            return {completed: false, cueErrors: [], errors: ['agent-detail is detached — reattach before a take'], log: []}
        }

        // SINGLE-FLIGHT: ownership is claimed SYNCHRONOUSLY — `tourRunner` is set before any await,
        // and the stale report clears in the SAME synchronous window.
        me.cuePromise     = Promise.resolve();
        me.cueReceipts    = [];
        me.cueErrors      = [];
        me.lastTourReport = null;

        me.tourRunner = Neo.create(TourRunner, {
            componentId: cockpit.id,
            dockService: cockpit.dockService,
            mode       : 'demo',
            script
        });

        me.tourRunner.on({
            beat    : me.onTourBeat,
            complete: me.onTourComplete,
            error   : me.onTourComplete,
            scope   : me
        });

        try {
            // REPLAY contract: every take starts from the screenplay's own opening stage.
            me.resetTourStage();
            await cockpit.refreshPromise;

            const result = await me.tourRunner.start();

            // the runner never awaits host cues (its documented contract) — the tour's OWN truth is
            // runner-log AND settled-cue truth together, so the pending chain must drain first.
            await me.cuePromise;

            me.lastTourReport = {
                ...result,
                completed  : result.completed && me.cueErrors.length === 0,
                cueErrors  : [...me.cueErrors],
                cueReceipts: me.cueReceipts.length
            };

            return me.lastTourReport
        } catch (error) {
            // CURRENT-ATTEMPT terminal truth: a thrown reset/refresh/start still publishes a
            // structured failed report before ownership releases.
            me.lastTourReport = {
                completed  : false,
                cueErrors  : [...me.cueErrors],
                cueReceipts: me.cueReceipts.length,
                errors     : [error?.message || String(error)],
                log        : []
            };

            return me.lastTourReport
        } finally {
            me.restoreTourStream();
            me.tourRunner?.destroy?.();
            me.tourRunner = null;
            me.setTourCaption('')
        }
    }

    /**
     * @summary Restores the composed cockpit's activity-stream state an `activity-burst` cue
     * displaced — the take-terminal half of the burst's reversibility contract. Inert when none ran.
     */
    restoreTourStream() {
        let me      = this,
            restore = me.tourStreamRestore;

        if (!restore) return;

        me.tourStreamRestore = null;
        me.cockpit?.getReference('activity-stream')?.set(restore)
    }

    /**
     * @summary Commits the cockpit's opening document as the live stage — the tour replay seam.
     * Rides the composed cockpit's standard commit loop, so the reset re-projects exactly like any
     * committed operation; the caller awaits the cockpit's `refreshPromise` for the settled view.
     * @returns {Object} The freshly committed opening document.
     */
    resetTourStage() {
        let document = cockpitDockDocument();

        this.cockpit?.onDockZoneDocumentChange(document);
        return document
    }

    /**
     * @summary Caption feed + the SETTLED surface cues (the Workstation hosting pattern): each cue
     * chains serially onto {@link #cuePromise}, its consumer returns an observable receipt, and
     * failures fold into {@link #cueErrors} — TourRunner deliberately never awaits host cues, so
     * this chain is what {@link #playTour} awaits before reporting.
     * @param {Object} data The runner's beat payload.
     */
    onTourBeat(data) {
        let me    = this,
            {cue} = data;

        data.caption && me.setTourCaption(data.caption);

        if (!cue) return;

        me.cuePromise = me.cuePromise.then(async () => {
            const receipt = await me.executeTourCue(cue);

            me.cueReceipts.push({cue: {...cue}, receipt})
        }).catch(error => {
            const message = `${cue.type}: ${error.message}`;

            me.cueErrors.push(message);
            me.setTourCaption(`Surface cue failed: ${message}`)
        })
    }

    /**
     * @summary Executes ONE hosting cue against the COMPOSED cockpit's existing verbs and returns
     * its observable receipt — perspective saves ride the cockpit's DockService capture verb, loads
     * ride its `activatePerspective`, export/import ride its share round-trip, the vessel beats ride
     * its detail vessel state machine, `activity-burst` rides the cockpit's stream reactive seam,
     * and `drill` rides its production selection seam. None are dock-document ops, so none
     * masquerade as descriptors; every refused verb THROWS so the settlement chain folds it — an
     * unknown cue type fails closed the same way.
     * @param {Object} cue `{type, name?, itemId?, count?}`
     * @returns {Promise<Object>} The verb's result object — the cue's receipt.
     */
    async executeTourCue(cue) {
        let me      = this,
            cockpit = me.cockpit,
            result;

        switch (cue.type) {
            case 'perspective-save':
                result = await cockpit.dockService.capturePerspective({
                    componentId    : cockpit.id,
                    layoutId       : `tour-${cue.name.toLowerCase().replace(/\s+/g, '-')}`,
                    perspectiveName: cue.name,
                    replace        : true
                });
                cockpit.syncControlBar();
                if (!result.stored) throw new Error(result.errors?.[0] || 'capture not stored');
                return result;
            case 'perspective-load':
                result = cockpit.activatePerspective(cue.name);
                if (!result.switched) throw new Error(result.errors[0] || 'perspective not switched');
                return result;
            case 'perspective-export':
                result = cockpit.exportPerspectiveArtifact(cue.name);
                if (!result.exported) throw new Error(result.errors[0] || 'export refused');
                return result;
            case 'perspective-import':
                result = cockpit.importPerspectiveArtifact();
                if (!result.imported) throw new Error(result.errors[0] || 'import refused');
                return result;
            case 'popout':
                result = await cockpit.popOutAgentDetail();
                if (!result.detached) throw new Error(result.errors[0] || 'pop-out refused');
                return result;
            case 'reattach':
                result = await cockpit.reattachAgentDetail();
                if (!result.reattached) throw new Error(result.errors[0] || 'reattach refused');
                return result;
            case 'activity-burst': {
                // inject `count` DEMO events through the cockpit stream's OWN reactive seam
                // (distinct actors + monotone timestamps so coalescing never collapses them).
                // Honest by construction: an explicit bounded positive-integer count (no hidden
                // default), TOUR provenance (never a Memory Core source), the adapter state is NOT
                // touched (a sample surface stays labeled sample), and the displaced owner-held
                // state is captured once for the take-terminal restore.
                const stream = cockpit.getReference('activity-stream');

                if (!stream) throw new Error('no activity stream is mounted');

                const count = cue.count;

                if (!Number.isInteger(count) || count < 1 || count > 200) {
                    throw new Error(`activity-burst needs an explicit integer count 1-200, got "${count}"`)
                }

                me.tourStreamRestore ??= {adapterState: stream.adapterState, events: stream.events};

                const events = Array.from({length: count}, (_, i) => ({
                    agentId   : `tour-burst-${i}`,
                    occurredAt: new Date(Date.UTC(2026, 6, 18, 12, 0, 0) + i * 60000).toISOString(),
                    payload   : {text: `demo fleet event ${i}`},
                    source    : 'tour:demo-burst',
                    type      : 'a2a-activity'
                }));

                stream.set({events});
                return {injected: count, provenance: 'tour:demo-burst'}
            }
            case 'drill': {
                // NAME-addressed against the public roster (deterministic across runs), through the
                // production selection seam — the same path the operator's click drives
                const controller = cockpit.getController(),
                      grid       = cockpit.getReference('fleet-grid'),
                      record     = grid?.store?.items?.find(item => item.agentId === cue.name);

                if (!record) throw new Error(`no roster resident "${cue.name}"`);

                controller.onAgentSelect({agentId: record.agentId});
                return {drilled: record.agentId}
            }
            default:
                throw new Error(`unknown cue type "${cue.type}"`)
        }
    }

    /**
     * @summary Tour teardown on `complete` AND `error` (one handler — both terminal): the caption
     * clears via the shared `finally` in {@link #playTour}; this hook keeps the terminal observable.
     * @param {Object} data `{completed, errors, log}` (or the runner's structured error payload).
     */
    onTourComplete(data) {
        // deliberately empty beyond observability: playTour's finally owns the teardown
    }

    /**
     * @summary Renders the current tour caption into the host's caption strip.
     * @param {String} caption Empty string clears (and hides) the strip.
     */
    setTourCaption(caption) {
        let strip = this.getReference('mission-tour-caption');

        strip?.set({hidden: !caption, html: caption})
    }

    /**
     * Tears down the runner with the workspace (the composed cockpit owns its own teardown).
     */
    destroy(...args) {
        let me = this;

        me.tourRunner?.destroy?.();
        me.tourRunner = null;

        super.destroy(...args)
    }
}

export default Neo.setupClass(MissionControlWorkspace);
