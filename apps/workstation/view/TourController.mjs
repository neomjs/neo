import Controller                               from '../../../src/controller/Component.mjs';
import ClassSystem                              from '../../../src/util/ClassSystem.mjs';
import TourRunner                               from '../../../src/ai/client/TourRunner.mjs';
import NativeGestureDriver                      from '../tour/NativeGestureDriver.mjs';
import WorkspaceDocument                        from '../../../src/dashboard/dock/model/WorkspaceDocument.mjs';
import {workstationTourScript, initialDocument} from '../tour/denseWorkstation.mjs';

/**
 * @summary Optional playback controller attached to Workstation's tour toolbar.
 * Owns runner, gesture driver and settlement queues; borrows workspace, provider and stores.
 * @class Workstation.view.TourController
 * @extends Neo.controller.Component
 */
class TourController extends Controller {
    static config = {
        /** @member {String} className='Workstation.view.TourController' */
        className: 'Workstation.view.TourController',
        /** @member {Workstation.view.Workspace|null} workspace=null */
        workspace: null,
        /** @member {Neo.ai.client.TourRunner|null} tourRunner_=null @reactive */
        tourRunner_: null,
        /** @member {Workstation.tour.NativeGestureDriver|null} gestureDriver_=null @reactive */
        gestureDriver_: null
    }

    /** @member {Promise} cuePromise */
    cuePromise = Promise.resolve()
    /** @member {Map<String,Promise>} cueSettlements */
    cueSettlements = new Map()
    /** @member {Promise} progressPromise */
    progressPromise = Promise.resolve()
    /** @member {String[]} cueErrors */
    cueErrors = []
    /** @member {Object[]} cueReceipts */
    cueReceipts = []
    /** @member {Object|null} lastTourReceipt=null */
    lastTourReceipt = null
    /** @member {Promise|null} playbackPromise=null */
    playbackPromise = null
    /** @member {Set<Neo.ai.client.TourRunner>} specRunners */
    specRunners = new Set()

    /** @member {Promise|null} #settledPromise=null Retains cleanup completion after the controller retires. */
    #settledPromise = null

    /** @summary The owned playback/driver cleanup boundary used before reactivation. @returns {Promise|null} */
    get settledPromise() { return this.#settledPromise }

    /** @summary Retires playback before its workspace starts disposing the borrowed services. */
    onComponentConstructed() {
        this.observeConfig(this.workspace, 'isDestroying', value => value && this.destroy())
    }

    /**
     * @summary Creates the configured owned runner with the host settlement boundary.
     * @param {Object|Neo.ai.client.TourRunner|null} value
     * @param {Neo.ai.client.TourRunner|null} oldValue
     * @returns {Neo.ai.client.TourRunner|null}
     */
    beforeSetTourRunner(value, oldValue) {
        oldValue?.destroy();
        if (!value) return value;
        return ClassSystem.beforeSetInstance(value, TourRunner, {
            componentId   : this.workspace.id,
            dockService   : this.workspace.dockService,
            mode          : 'demo',
            script        : workstationTourScript,
            stepSettlement: data => this.settleTourStep(data),
            listeners     : {
                beat : 'onTourBeat', complete: 'onTourComplete', error: 'onTourError',
                scene: 'onTourScene', stepSettled: 'onTourStepSettled', scope: this
            }
        })
    }

    /**
     * @summary Normalizes an owned driver; its own destruction retains pending input cleanup.
     * @param {Object|Workstation.tour.NativeGestureDriver|null} value
     * @param {Workstation.tour.NativeGestureDriver|null} oldValue
     * @returns {Workstation.tour.NativeGestureDriver|null}
     */
    beforeSetGestureDriver(value, oldValue) {
        oldValue?.destroy();
        return value ? ClassSystem.beforeSetInstance(value, NativeGestureDriver, {workspace: this.workspace}) : value
    }

    /** @summary Creates the owned runner on first playback. @returns {Neo.ai.client.TourRunner} */
    getTourRunner() {
        if (this.isDestroyed) throw Neo.isDestroyed;
        this.tourRunner ||= {};
        return this.tourRunner
    }

    /** @summary Creates the owned gesture driver on an explicit request. @returns {Workstation.tour.NativeGestureDriver} */
    getGestureDriver() {
        if (this.isDestroyed) throw Neo.isDestroyed;
        this.gestureDriver ||= {};
        return this.gestureDriver
    }

    /** @summary Publishes caption state through the existing root provider. @param {String} text */
    setTourCaption(text) {
        if (!this.isDestroyed) this.setState({'tour.caption': text})
    }

    /**
     * @summary Publishes progress through bindings and awaits its actual view paint.
     * @param {Number} count
     * @returns {Promise<void>}
     */
    async setPipProgress(count) {
        if (this.isDestroyed) throw Neo.isDestroyed;
        this.setState({'tour.completedCount': count});
        await this.trap(Promise.resolve(this.getReference('tour-pips')?.promiseUpdate()))
    }

    /** @summary Starts at most one visible playback, including its entry projection. @returns {Promise<Object>} */
    startTour() {
        if (this.isDestroyed) return Promise.reject(Neo.isDestroyed);
        if (this.playbackPromise) {
            this.setTourCaption('Tour already running — the live stores continue underneath it.');
            return this.playbackPromise
        }
        return this.playbackPromise = this.runVisibleTour().catch(error => {
            if (error === Neo.isDestroyed) return {completed: false, cancelled: true, errors: ['Tour cancelled'], log: []};
            throw error
        }).finally(() => {
            if (!this.isDestroyed) {
                this.playbackPromise = null;
                this.setState({'tour.running': false})
            }
        })
    }

    /** @summary Cancels this playback owner and waits for its already-started cue work. @returns {Promise<void>} */
    async cancelTour() {
        const bar = this.component;
        this.destroy();
        await this.settledPromise;
        if (!bar.isDestroyed && bar.controller === this) bar.controller = null
    }

    /** @summary Retires playback-owned objects without disposing borrowed workspace state. */
    destroy() {
        if (this.isDestroyed) return;
        const provider = this.getStateProvider(), driver = this.gestureDriver,
              pending  = [this.playbackPromise, this.cuePromise, this.progressPromise];
        this.tourRunner = null;
        this.gestureDriver = null;
        this.specRunners.forEach(runner => runner.isDestroyed || runner.destroy());
        this.#settledPromise = Promise.allSettled([...pending, driver?.settledPromise]);
        super.destroy();
        provider && !provider.isDestroyed && provider.setData({'tour.running': false})
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
                await this.trap(Promise.resolve(this.workspace.refreshPromise));
                return this.workspace.pulseScaleSparkline()
            case 'cross-zone-showcase':
                return (await this.getGestureDriver()).executeCrossZoneShowcaseStep(cue, cue.options)
            case 'theme':
                return this.workspace.setWorkspaceTheme(cue.theme)
            default:
                return false
        }
    }

    /**
     * @summary Returns the last fully settled visible-tour receipt.
     * @returns {Object|null}
     */
    getTourReceipt() {
        return this.lastTourReceipt
    }

    /**
     * @summary Opens the real overflow control, briefly shows its menu, then invokes the first menu
     * item's ordinary activeIndex handler. The E2E clicks this same surface as a human.
     * @param {String} itemId Narrated target id (used for the caption/evidence contract).
     * @returns {Promise<Boolean>}
     */
    async navigateOverflowMenu(itemId) {
        // The reducer schedules projection asynchronously. Resolve the consumer only after that transaction,
        // otherwise `down()` can capture the retiring source toolbar and wait on its deliberately hidden control.
        const workspace = this.workspace;
        await this.trap(Promise.resolve(workspace.refreshPromise));

        let tabs   = workspace.down({dockNodeId: 'heavy-tabs'}),
            plugin = tabs?.getTabBar()?.getPlugin('tab-overflow'),
            control;

        // The hidden staging transaction already captured natural widths. This consumer boundary only
        // refreshes the visible extent so the cue never turns a stable cache into a second measurement pass.
        await this.trap(Promise.resolve(plugin?.project(false)));
        control = await this.trap(workspace.waitForOverflowMenu(plugin));

        if (!control) return false;

        try {
            await control.toggleMenu();
            if (this.isDestroyed) throw Neo.isDestroyed;
            await this.timeout(700);
            const menuItems = control.menuList?.items || [],
                  item      = menuItems.find(entry => entry.text === workspace.dockModel.items[itemId]?.title);
            item?.handler?.();
            return item ? {activatedItemId: itemId, menuItemCount: menuItems.length} : false
        } finally {
            if (control.menuList && !control.menuList.isDestroyed) control.menuList.hidden = true
        }
    }

    /**
     * @summary Sequences a beat's surface cue and preserves its diagnostic receipt.
     * @param {Object} data
     */
    onTourBeat(data) {
        let me            = this,
            cueSettlement = Promise.resolve();

        data.caption && me.setTourCaption(data.caption);

        if (data.cue) {
            const cue = data.cue;

            me.cuePromise = me.cuePromise.then(async () => {
                if (me.isDestroyed) return false;
                const receipt = await me.executeCue(cue);
                if (me.isDestroyed) return false;

                if (!receipt) {
                    throw new Error(`${cue.type} returned no observable receipt`)
                }

                me.cueReceipts.push({cue: {...cue}, receipt});

                // Settlement is the cue's EFFECT, not its promise: executors report `errors`
                // and `applied` (a cancel terminal settles legitimately un-applied). The
                // receipt stays pushed either way, so a failure carries its own forensics.
                if (receipt.errors?.length) {
                    throw new Error(receipt.errors.join('; '))
                }

                if (receipt.applied === false && !receipt.cancelled) {
                    throw new Error('terminal effect did not apply')
                }

                return receipt
            }).catch(error => {
                if (me.isDestroyed) return false;
                const message = `${cue.type}: ${error?.message || String(error)}`;

                me.cueErrors.push(message);
                me.setTourCaption(`Surface cue failed: ${message}`);

                return false
            });
            cueSettlement = me.cuePromise
        }

        me.cueSettlements.set(`${data.sceneIndex}:${data.stepIndex}`, cueSettlement)
    }

    /**
     * Settles the hosting surface for one runner step before the next screenplay beat may begin.
     * @summary Prevents a following document operation from re-projecting the dock while the
     * current surface cue still owns a live gesture, dwell, or paint boundary.
     * @param {Object} data `TourRunner` settlement payload.
     * @returns {Promise<void>}
     */
    async settleTourStep(data) {
        if (this.isDestroyed) throw Neo.isDestroyed;
        let me            = this, workspace = me.workspace,
            key           = `${data.sceneIndex}:${data.stepIndex}`,
            cueSettlement = me.cueSettlements.get(key) || Promise.resolve();

        await cueSettlement;
        await workspace.refreshPromise
    }

    /**
     * @summary Projects one successful runner step after the injected host barrier has settled its cue and
     * dock refresh. The listener remains observational: it serializes the independent pip paint
     * without making event delivery an execution boundary for `TourRunner`.
     * @param {Object} data `TourRunner.stepSettled` payload.
     */
    onTourStepSettled(data) {
        let me            = this, workspace = me.workspace,
            key           = `${data.sceneIndex}:${data.stepIndex}`,
            cueSettlement = me.cueSettlements.get(key) || Promise.resolve();

        me.cueSettlements.delete(key);
        me.progressPromise = me.progressPromise.then(async () => {
            if (me.isDestroyed) return;
            await cueSettlement;
            if (me.isDestroyed) return;
            await workspace.refreshPromise;
            await me.setPipProgress(data.completedCount);
            // Adjacent document operations can settle within one browser frame. Keep each
            // evidenced state visible long enough to read instead of letting VDOM paints coalesce.
            await me.timeout(90)
        })
    }

    /**
     * @summary Publishes completion while final surface work settles.
     * @param {Object} data
     */
    onTourComplete(data) {
        this.setTourCaption(`WorkspaceDocument playback complete — settling ${data.log.length} deterministic beats and surface cues.`)
    }

    /**
     * @summary Clears unsettled beat entries and publishes the runner failure.
     * @param {Object} data
     */
    onTourError(data) {
        this.cueSettlements.clear();
        this.setTourCaption(`Tour stopped: ${data.errors[0] || 'unknown reason'}`)
    }

    /**
     * @summary Publishes the current scene caption.
     * @param {Object} data
     */
    onTourScene(data) {
        this.setTourCaption(`${data.title}${data.caption ? ' — ' + data.caption : ''}`)
    }

    /**
     * @summary Replays one script's document tier from a fresh document in spec mode. Runtime-only
     * cues remain the visible tour's responsibility and are verified through its receipt.
     * By default the replay result stays live (the driver contract journey specs and the film
     * pipeline continue from); `restoreDocument: true` turns the replay into a pure probe that
     * restores the displaced live document afterwards.
     * @param {Object} [script=workstationTourScript] `null` also resolves to the default script.
     * @param {Object} [options]
     * @param {Boolean} [options.restoreDocument=false] Restore the pre-replay live document after the run.
     * @returns {Promise<Object>}
     */
    runTourSpec(script=workstationTourScript, options={}) {
        if (this.isDestroyed) return Promise.reject(Neo.isDestroyed);
        if (this.playbackPromise) return Promise.reject(new Error('A Workstation playback is already running'));
        this.setState({'tour.running': true});
        return this.playbackPromise = this.runSpecTour(script, options).finally(() => {
            if (!this.isDestroyed) {
                this.playbackPromise = null;
                this.setState({'tour.running': false})
            }
        })
    }

    /**
     * @summary Executes one owned spec replay and restores its displaced document when requested.
     * @param {Object} script
     * @param {Object} options
     * @param {Boolean} [options.restoreDocument=false]
     * @returns {Promise<Object>}
     */
    async runSpecTour(script, {restoreDocument=false}={}) {
        let me           = this, workspace = me.workspace,
            dockService  = workspace.dockService,
            specRunners  = me.specRunners,
            liveDocument = workspace.dockModel,
            runner;

        // Transport callers can only deliver `null` for "use the default script".
        script ??= workstationTourScript;

        runner = Neo.create(TourRunner, {
            componentId: workspace.id,
            dockService,
            mode       : 'spec',
            script
        });

        specRunners.add(runner);

        // A driver leaves its result live; a probe restores the exact displaced document even
        // when entry projection rejects. The request owns its runner and borrows the dock service.
        // Entry requests validated in-place admission; a topology mismatch still stages normally.
        // Restore remains a full projection because the replay can have changed that topology.
        let completed = false,
            out       = null;

        try {
            workspace.dockModel = WorkspaceDocument.clone(initialDocument);
            await me.trap(workspace.refreshDockWorkspace(null, workspace.dockModel, {geometryOnly: true}));

            // The entry projection is finished and the replay has not begun. Published because a
            // frame-capturing consumer cannot otherwise tell the two apart: both happen inside one
            // `runTourSpec` call, so an oracle measuring the whole call attributes an entry-time
            // frame to the replay step it names. A wall-clock stamp rather than a marker element or
            // an event, so the consumer bands frames it has ALREADY collected instead of racing a
            // poll against frame arrival — the boundary is read after the fact, never observed live.
            const entryCompletedAt = Date.now(),
                  result           = await me.trap(runner.start());

            await me.trap(Promise.resolve(workspace.refreshPromise));

            out = {...result, document: WorkspaceDocument.clone(workspace.dockModel), phases: {entryCompletedAt}};

            // A structured runner failure is a primary outcome the caller must receive intact —
            // only a genuinely clean replay may let a restore failure replace the return.
            completed = result?.completed === true && !result?.errors?.length;

            return out
        } finally {
            specRunners.delete(runner);
            runner.isDestroyed || runner.destroy();

            if (restoreDocument && !workspace.isDestroyed) {
                workspace.dockModel = liveDocument;

                // The document assignment IS the restore. Restore-projection failure precedence:
                // a clean replay propagates it (a probe may not report success over an
                // un-projected surface); a structured primary keeps its result and RECORDS the
                // restore failure as a namespaced entry in the returned errors; a thrown primary
                // owns the return channel and the restore failure stays suppressed.
                completed
                    ? await workspace.refreshDockWorkspace()
                    : await workspace.refreshDockWorkspace().catch(error => {
                        out?.errors?.push(`restore projection failed: ${error.message}`)
                    })
            }
        }
    }

    /**
     * @summary Scrolls the scale grid through one View-owned VDOM update.
     *
     * The View is the closest common parent of the native scrollport and every pooled body.
     * Retargeting its VNode `scrollTop` together with `syncBodies()` therefore lets one delta
     * move the viewport and recycle the fixed rows atomically, without a transient blank frame.
     *
     * @param {Number} index
     * @returns {Promise<Boolean>}
     */
    async scrollScaleGrid(index=50000) {
        let pane = this.workspace.paneCache.scale,
            target;

        if (!pane?.view?.id) return false;

        target = Math.max(0, Math.min(index, pane.store.count - 1)) * pane.rowHeight;
        pane.view.vdom.scrollTop = target;
        pane.view.syncBodies(target);
        await pane.view.promiseUpdate();

        return Math.abs(pane.view.scrollTop - target) <= pane.rowHeight
    }

    /**
     * @summary Runs the screenplay from a fresh document on every replay.
     * @returns {Promise<Object>|undefined}
     */
    async runVisibleTour() {
        let me = this, workspace = me.workspace;

        me.getTourRunner();

        if (me.tourRunner.running) {
            me.setTourCaption('Tour already running — the live stores continue underneath it.');
            return
        }

        me.setState({'tour.running': true});
        me.cueErrors       = [];
        me.cuePromise      = Promise.resolve();
        me.cueReceipts     = [];
        me.cueSettlements.clear();
        me.lastTourReceipt = null;
        me.progressPromise = Promise.resolve();
        workspace.dockModel       = WorkspaceDocument.clone(initialDocument);
        await me.trap(me.setPipProgress(0));

        await me.trap(workspace.refreshDockWorkspace(null, workspace.dockModel, {geometryOnly: true}));

        const
            feedStore      = me.getStateProvider().getStore('feed'),
            feedStartCount = feedStore.count,
            feedStartBatch = workspace.feedBatchCount,
            startedAt      = Date.now(),
            runnerResult   = await me.trap(me.tourRunner.start());

        const
            errors      = [...runnerResult.errors, ...me.cueErrors],
            appendError = (label, result) => {
                if (result.status === 'rejected') {
                    const
                        detail          = result.reason?.message || String(result.reason),
                        alreadyRecorded = errors.some(error => error === detail || error.endsWith(`: ${detail}`));

                    alreadyRecorded || errors.push(`${label} failed: ${detail}`)
                }
            },
            settlements = await me.trap(Promise.allSettled([
                me.cuePromise,
                workspace.refreshPromise,
                me.progressPromise
            ]));

        ['surface cue settlement', 'dock refresh settlement', 'progress settlement']
            .forEach((label, index) => appendError(label, settlements[index]));

        const [finalProgress] = await me.trap(Promise.allSettled([
            me.setPipProgress(TourController.totalBeats().length)
        ]));

        appendError('final progress paint', finalProgress);

        const
            elapsedMs    = Date.now() - startedAt,
            feedEndCount = feedStore.count,
            receipt      = {
                completed  : runnerResult.completed && errors.length === 0,
                cueReceipts: me.cueReceipts.map(entry => ({cue: {...entry.cue}, receipt: entry.receipt})),
                document   : WorkspaceDocument.clone(workspace.dockModel),
                elapsedMs,
                errors,
                feed       : {
                    batches       : workspace.feedBatchCount - feedStartBatch,
                    configuredRate: workspace.constructor.FEED_BATCH_SIZE * 1000 / workspace.constructor.FEED_INTERVAL_MS,
                    endCount      : feedEndCount,
                    growth        : feedEndCount - feedStartCount,
                    maxRecords    : feedStore.maxRecords,
                    produced      : (workspace.feedBatchCount - feedStartBatch) * workspace.constructor.FEED_BATCH_SIZE,
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
     * @summary Returns the screenplay's flattened steps for progress presentation.
     * @returns {Object[]} Flattened screenplay steps.
     * @static
     */
    static totalBeats() {
        return workstationTourScript.scenes.flatMap(scene => scene.steps)
    }
}

export default Neo.setupClass(TourController);
