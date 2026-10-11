import Base                                       from '../../core/Base.mjs';
import {evaluateExpectations, validateTourScript} from './tourScript.mjs';

/**
 * @summary True only for plain JSON-object-shaped values.
 * @param {*} value
 * @returns {Boolean}
 */
function isPlainObject(value) {
    if (value === null || typeof value !== 'object') return false;

    const proto = Object.getPrototypeOf(value);

    return proto === Object.prototype || proto === null
}

/**
 * @summary Validates the settlement receipt returned by an injected cross-window host.
 * Rejected steps may omit document/witness data; successful steps must prove both document
 * outcomes plus the surviving component identity and target-document mount lifecycle.
 * @param {*} result
 * @returns {String[]} validation errors
 */
function validateCrossWindowResult(result) {
    const errors = [];

    if (!isPlainObject(result)) {
        return ['cross-window executor returned a non-object receipt']
    }

    if (typeof result.applied !== 'boolean') {
        errors.push('cross-window receipt.applied must be a Boolean')
    }

    if (!Array.isArray(result.errors) || result.errors.some(error => typeof error !== 'string')) {
        errors.push('cross-window receipt.errors must be an array of strings')
    }

    if (result.applied === true) {
        if (result.errors?.length) {
            errors.push('cross-window receipt cannot be applied with non-empty errors')
        }

        if (!isPlainObject(result.sourceDocument)) {
            errors.push('cross-window applied receipt requires a plain sourceDocument')
        }

        if (!isPlainObject(result.targetDocument)) {
            errors.push('cross-window applied receipt requires a plain targetDocument')
        }

        if (!isPlainObject(result.witness)) {
            errors.push('cross-window applied receipt requires witness {instanceId, mountCount}')
        } else {
            if (typeof result.witness.instanceId !== 'string' || result.witness.instanceId.length < 1) {
                errors.push('cross-window witness.instanceId must be a non-empty string')
            }

            if (!Number.isInteger(result.witness.mountCount) || result.witness.mountCount < 0) {
                errors.push('cross-window witness.mountCount must be a non-negative integer')
            }
        }
    } else if (result.applied === false && result.errors?.length < 1) {
        errors.push('cross-window rejected receipt requires at least one error')
    }

    return errors
}

/**
 * @summary Executes `neo.tour.script.v1` scripts against a live dock workspace with
 * deterministic operation ordering — the player behind demo tours, e2e replays and video takes.
 *
 * The runner is the "trinity enabler": ONE reviewed script is the demo a viewer watches, the
 * e2e scenario the replay specs execute, and the video take a recording captures.
 * It composes the app-side Neural Link dock seam ({@link Neo.ai.client.DockService}) plus an
 * optional host-owned cross-window executor and NEVER mutates dock truth directly. Ordinary
 * operations ride the same `execute_dock_operation` path as a live agent; cross-window steps
 * await one real gesture and accept only its structured document + continuity receipt.
 *
 * **Determinism contract:** steps settle on an executor-owned result (post-operation document,
 * structured cross-window receipt, or explicit `topology-assert` read) — never on wall-clock
 * time. `pause` steps are viewer PACING only: modes may scale or skip the waiting, but every
 * step always appends the same log entry, so two runs in any mode produce identical logs.
 * The log records order, descriptors and assertion outcomes; deliberately no timestamps.
 *
 * **Modes** (pace differs, correctness never):
 * - `demo`   — pauses honored, scaled by {@link #paceMultiplier}; captions surface via events.
 * - `record` — pauses honored at script-authored durations (multiplier pinned to 1 — the same
 *              run twice is the same video); refuses to start unless {@link #reducedMotion}
 *              was explicitly probed `false` by the hosting surface (fail-closed: a capture
 *              with motion disabled would record a lie about the product).
 * - `spec`   — pause waits skipped entirely; assertions identical. The whitebox-e2e replay mode.
 *
 * Hosting-surface cues and projection remain external to the replay log. A host that must prevent
 * its asynchronous surface work from being overtaken can inject {@link #stepSettlement}; the runner
 * awaits that opaque boundary after its own step succeeds and before the next beat starts.
 *
 * Events (observable): `beat` (before each step — the tour bar's caption feed), `stepSettled`
 * (after runner and optional host settlement), `scene` (scene boundary), `error` (abort with
 * structured failures), `complete` (full log).
 * As with every object event, `Neo.core.Observable` adds the runner id as `source`.
 *
 * Script schema + fail-closed validator: `tourScript.mjs` (same directory) · dock documents:
 * `learn/agentos/DockZoneModel.md` (the JSON-first workspace contract).
 * @class Neo.ai.client.TourRunner
 * @extends Neo.core.Base
 */
class TourRunner extends Base {
    /**
     * True automatically applies the core.Observable mixin — the tour bar and specs
     * subscribe to `beat` / `stepSettled` / `scene` / `error` / `complete`.
     * @member {Boolean} observable=true
     * @static
     */
    static observable = true
    /**
     * The valid execution modes. `mode` is validated against this set via
     * {@link Neo.core.Base#beforeSetEnumValue}.
     * @member {String[]} modes=['demo','record','spec']
     * @protected
     * @static
     */
    static modes = ['demo', 'record', 'spec']

    static config = {
        /**
         * @member {String} className='Neo.ai.client.TourRunner'
         * @protected
         */
        className: 'Neo.ai.client.TourRunner',
        /**
         * The dock-document holder's component id — the same id an agent passes to the
         * `execute_dock_operation` NL tool. v1 deliberately requires the concrete id
         * (no parent-chain guessing), mirroring the DockService holder contract.
         * @member {String|null} componentId=null
         */
        componentId: null,
        /**
         * Optional app-side executor for semantic `cross-window` steps. The runner never
         * resolves window ids, DOM ids or coordinates; a compatible host exposes exactly
         * `executeCrossWindowStep(step)` and returns the structured settlement receipt.
         * @member {Object|null} crossWindowExecutor=null
         */
        crossWindowExecutor: null,
        /**
         * The app-side dock seam instance ({@link Neo.ai.client.DockService} or a
         * spec fixture exposing the same `executeDockOperation` / `getDockTopology`
         * surface). Explicit injection keeps the runner free of namespace guessing
         * and makes the seam swappable in unit specs.
         * @member {Neo.ai.client.DockService|null} dockService=null
         */
        dockService: null,
        /**
         * Execution mode: `'demo'`, `'record'` or `'spec'` — see the class summary for
         * the pace-vs-correctness contract.
         * @member {String} mode_='demo'
         * @reactive
         */
        mode_: 'demo',
        /**
         * The executable dock-operation vocabulary handed to the script validator.
         * `null` resolves to the injected service's exported SSOT
         * (`DockService.operations`, itself read by reference from `model.Operations`).
         * Override only in specs that fixture the seam.
         * @member {String[]|null} operations=null
         */
        operations: null,
        /**
         * Demo-mode pacing scale applied to `pause` step durations. Ignored in `record`
         * mode (pinned to the script-authored durations) and `spec` mode (waits skipped).
         * Pace, never correctness: the operation log is multiplier-independent.
         * @member {Number} paceMultiplier=1
         */
        paceMultiplier: 1,
        /**
         * Record-mode precondition, probed by the HOSTING SURFACE (main-thread media query
         * `(prefers-reduced-motion: reduce)`) and passed in explicitly — app-worker code
         * cannot and must not reach for the DOM. `record` refuses to start unless this is
         * exactly `false` — reduced-motion OFF is asserted fail-closed before any take.
         * @member {Boolean|null} reducedMotion=null
         */
        reducedMotion: null,
        /**
         * Optional host-owned settlement boundary. Called after runner-owned work succeeds and
         * before `stepSettled` / the next beat, with the JSON-safe settlement payload. The runner
         * neither interprets nor logs the returned value; it only awaits the promise so external
         * cues and projections cannot be overtaken by a later document mutation. The callback may
         * await only work already initiated by the current `beat`; awaiting `stepSettled`, `complete`,
         * a progress boundary downstream of this callback, or a later beat creates a dependency cycle.
         * @member {Function|null} stepSettlement=null
         */
        stepSettlement: null,
        /**
         * The `neo.tour.script.v1` script to execute. Validated fail-closed at
         * {@link #start} time against the resolved operation vocabulary.
         * @member {Object|null} script=null
         */
        script: null
    }

    /**
     * True while a tour is executing. One runner instance plays one tour at a time;
     * concurrent `start()` calls throw (a programming error, not a tour failure).
     * @member {Boolean} #running=false
     * @private
     */
    #running = false

    /**
     * The operation log of the most recent (or currently executing) run: plain JSON
     * entries recording order, descriptors and assertion outcomes — no timestamps, by
     * the determinism contract. Two runs of one script are `Neo.isEqual`-identical here.
     * @member {Object[]} log=[]
     */
    log = []

    /**
     * True while a tour is executing — the public read hosting surfaces use to make a
     * second play-click a true no-op BEFORE touching any stage state (a re-entrant
     * `start()` throws, but by then a careless caller may already have reset its stage).
     * @returns {Boolean}
     */
    get running() {
        return this.#running
    }

    /**
     * Triggered before the mode config gets changed. Validates against {@link .modes}.
     * @param {String} value
     * @param {String} oldValue
     * @returns {String}
     * @protected
     */
    beforeSetMode(value, oldValue) {
        return this.beforeSetEnumValue(value, oldValue, 'mode')
    }

    /**
     * Aborts the current run with a structured result: logs the failure entry, fires
     * `error`, and returns the shape `start()` resolves with.
     * @param {String[]} errors
     * @returns {Object} `{completed: false, errors, log}`
     * @private
     */
    #abort(errors) {
        const me = this;

        me.fire('error', {errors, log: me.log});

        return {completed: false, errors, log: me.log}
    }

    /**
     * Validates the injected seam + script and resolves the operation vocabulary.
     * @returns {Object} `{errors, operations}` — non-empty errors block the run
     * @private
     */
    #preflight() {
        const
            me                                                 = this,
            {crossWindowExecutor, dockService, stepSettlement} = me,
            crossWindowAvailable                               = typeof crossWindowExecutor?.executeCrossWindowStep === 'function',
            errors                                             = [];

        if (typeof dockService?.executeDockOperation !== 'function' || typeof dockService?.getDockTopology !== 'function') {
            errors.push('dockService: required — inject Neo.ai.client.DockService (or a fixture exposing executeDockOperation + getDockTopology)')
        }

        if (typeof me.componentId !== 'string' || me.componentId.length < 1) {
            errors.push('componentId: required — the dock-document holder component id (the execute_dock_operation target)')
        }

        if (stepSettlement !== null && typeof stepSettlement !== 'function') {
            errors.push('stepSettlement: must be a Function or null')
        }

        if (me.mode === 'record' && me.reducedMotion !== false) {
            errors.push(
                'record mode requires reducedMotion === false, probed by the hosting surface — ' +
                'a capture under reduced motion would record a lie about the product (fail-closed)'
            )
        }

        const operations = me.operations || dockService?.constructor?.operations || [];

        if (errors.length === 0) {
            const {valid, errors: scriptErrors} = validateTourScript(me.script, {
                crossWindowAvailable,
                operations
            });

            if (!valid) {
                errors.push(...scriptErrors)
            }
        }

        return {errors, operations}
    }

    /**
     * Executes the configured script from the first scene. Resolves with a structured
     * result in every outcome — assertion failures and rejected operations abort the run
     * and surface as `errors` (mirroring the executor's structured-errors contract),
     * never as raw throws. Only misuse throws: calling `start()` while already running.
     *
     * @example
     * const runner = Neo.create(TourRunner, {
     *     componentId: 'dock-workspace-1',
     *     dockService: Neo.ai.client.DockService,  // the app-side NL seam
     *     mode       : 'spec',
     *     script     : demoATourScript
     * });
     *
     * const {completed, log} = await runner.start();
     *
     * @returns {Promise<Object>} `{completed, errors, log}`
     */
    async start() {
        const me = this;

        if (me.#running) {
            throw new Error('TourRunner.start(): a tour is already running on this instance')
        }

        const {errors: preflightErrors} = me.#preflight();

        if (preflightErrors.length > 0) {
            me.log = [];
            return me.#abort(preflightErrors)
        }

        me.#running = true;
        me.log      = [];

        const log = me.log;

        try {
            return await me.#run()
        } catch (e) {
            if (e === Neo.isDestroyed) {
                // destroy() rejected a pending pause via the registered-async contract —
                // the tour ends quietly with an honest partial log
                return {completed: false, errors: ['TourRunner destroyed mid-tour'], log}
            }

            throw e
        } finally {
            me.#running = false
        }
    }

    /**
     * The scene/step execution loop. Split from {@link #start} so the running-flag and
     * destroy handling stay in one place.
     * @returns {Promise<Object>} `{completed, errors, log}`
     * @private
     */
    async #run() {
        const
            me                                                              = this,
            {componentId, crossWindowExecutor, dockService, stepSettlement} = me,
            {scenes}                                                        = me.script;

        let sceneIndex = 0;

        for (const scene of scenes) {
            const sceneId = scene.id || `scene-${sceneIndex}`;

            me.fire('scene', {caption: scene.caption, index: sceneIndex, sceneId, title: scene.title});

            let stepIndex = 0;

            for (const step of scene.steps) {
                me.fire('beat', {
                    caption : step.caption,
                    // data-only surface cue passthrough: hosting surfaces may perform a
                    // runtime-only interaction at this beat (e.g. a transient rail reveal) —
                    // the runner stays document-tier and never interprets the cue itself
                    cue     : step.cue,
                    sceneId,
                    sceneIndex,
                    stepIndex,
                    stepType: step.type
                });

                if (step.type === 'op') {
                    let result;

                    try {
                        result = await dockService.executeDockOperation({componentId, descriptor: step.descriptor})
                    } catch (e) {
                        // a live-seam failure (holder unresolvable / gone mid-run) stays inside the
                        // structured-outcome contract — the runner never leaks a raw throw
                        if (e === Neo.isDestroyed) throw e;

                        return me.#abort([`${sceneId}[${stepIndex}] dock seam failure executing '${step.descriptor.operation}': ${e.message}`])
                    }

                    const entry = {
                        applied  : result.applied,
                        // the log IS the replay wire format: the complete descriptor travels in every
                        // entry (JSON-cloned — scripts are validated JSON-pure), so two runs with
                        // different arguments can never produce identical logs
                        descriptor: JSON.parse(JSON.stringify(step.descriptor)),
                        operation : step.descriptor.operation,
                        sceneId,
                        stepIndex,
                        type      : 'op'
                    };

                    me.log.push(entry);

                    if (!result.applied) {
                        return me.#abort([
                            `${sceneId}[${stepIndex}] op '${step.descriptor.operation}' rejected by the executor: ` +
                            (result.errors || []).join('; ')
                        ])
                    }

                    if (step.expect) {
                        const {passed, failures} = evaluateExpectations(step.expect, result.document);

                        entry.assertsPassed = passed;

                        if (!passed) {
                            return me.#abort(failures.map(failure =>
                                `${sceneId}[${stepIndex}] post-op expectation failed at '${failure.path}': ` +
                                `expected ${JSON.stringify(failure.expected)}, got ${JSON.stringify(failure.actual)}`
                            ))
                        }
                    }
                }

                else if (step.type === 'cross-window') {
                    const
                        executorStep = JSON.parse(JSON.stringify(step)),
                        semanticStep = {
                            itemId           : step.itemId,
                            sourceWorkspaceId: step.sourceWorkspaceId,
                            targetWorkspaceId: step.targetWorkspaceId,
                            targetNodeId     : step.targetNodeId
                        };
                    let result;

                    try {
                        result = await me.trap(crossWindowExecutor.executeCrossWindowStep(executorStep))
                    } catch (e) {
                        if (e === Neo.isDestroyed) throw e;

                        return me.#abort([
                            `${sceneId}[${stepIndex}] cross-window executor failure: ${e?.message || String(e)}`
                        ])
                    }

                    const receiptErrors = validateCrossWindowResult(result);

                    if (receiptErrors.length > 0) {
                        return me.#abort(receiptErrors.map(error => `${sceneId}[${stepIndex}] ${error}`))
                    }

                    me.log.push({
                        applied: result.applied,
                        errors : [...result.errors],
                        sceneId,
                        step   : semanticStep,
                        stepIndex,
                        type   : 'cross-window'
                    });

                    if (!result.applied) {
                        return me.#abort([
                            `${sceneId}[${stepIndex}] cross-window step rejected by the executor: ${result.errors.join('; ')}`
                        ])
                    }
                }

                else if (step.type === 'topology-assert') {
                    let topology;

                    try {
                        topology = await dockService.getDockTopology({componentId})
                    } catch (e) {
                        if (e === Neo.isDestroyed) throw e;

                        return me.#abort([`${sceneId}[${stepIndex}] dock seam failure reading topology: ${e.message}`])
                    }

                    const {passed, failures} = evaluateExpectations(step.expect, topology.document);

                    me.log.push({assertsPassed: passed, sceneId, stepIndex, type: 'topology-assert'});

                    if (!passed) {
                        return me.#abort(failures.map(failure =>
                            `${sceneId}[${stepIndex}] topology expectation failed at '${failure.path}': ` +
                            `expected ${JSON.stringify(failure.expected)}, got ${JSON.stringify(failure.actual)}`
                        ))
                    }
                }

                else if (step.type === 'pause') {
                    // the log entry is mode-invariant; only the WAITING differs by mode
                    me.log.push({ms: step.ms, sceneId, stepIndex, type: 'pause'});

                    if (me.mode !== 'spec') {
                        const ms = me.mode === 'record' ? step.ms : step.ms * me.paceMultiplier;

                        ms > 0 && await me.timeout(ms)
                    }
                }

                // The explicit callback is the host's asynchronous settlement boundary. Events
                // remain observational and are never awaited; the callback's return value never
                // enters the deterministic replay log.
                const
                    logLength  = me.log.length,
                    settlement = {
                        completedCount: logLength,
                        logLength,
                        sceneId,
                        sceneIndex,
                        stepIndex,
                        stepType      : step.type
                };

                if (stepSettlement) {
                    try {
                        await me.trap(Promise.resolve(stepSettlement({...settlement})))
                    } catch (e) {
                        if (e === Neo.isDestroyed) throw e;

                        return me.#abort([
                            `${sceneId}[${stepIndex}] host step settlement failed: ${e?.message || String(e)}`
                        ])
                    }
                }

                me.fire('stepSettled', settlement);

                stepIndex++
            }

            sceneIndex++
        }

        const result = {completed: true, errors: [], log: me.log};

        me.fire('complete', result);

        return result
    }
}

export default Neo.setupClass(TourRunner);
