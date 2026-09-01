import {test, expect} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';
import DockService    from '../../../../../src/ai/client/DockService.mjs';
import Operations     from '../../../../../src/dashboard/dock/model/Operations.mjs';
import TourRunner     from '../../../../../src/ai/client/TourRunner.mjs';

import {
    RESERVED_STEP_TYPES, STEP_TYPES, TOUR_SCRIPT_SCHEMA, evaluateExpectations, validateTourScript
} from '../../../../../src/ai/client/tourScript.mjs';

/**
 * @summary Creates a valid dockZone.v1 fixture the real reducers accept.
 *
 * Shape parity note: mirrors the committed `examples/dashboard/dock` workspace class
 * (edge-zone root, one horizontal split, two tabs nodes) so the unit smoke and the live
 * example exercise the same document topology; the live-page replay belongs to the
 * whitebox-e2e tier.
 * @returns {Object}
 */
function doc() {
    return {
        schema: 'neo.dock.zone.v1',
        root  : 'root',
        items : {
            strategy: {componentRef: 'strategy', title: 'Strategy', kind: 'panel'},
            swarm   : {componentRef: 'swarm',    title: 'Swarm',    kind: 'panel'},
            terminal: {componentRef: 'terminal', title: 'Terminal', kind: 'terminal'}
        },
        nodes: {
            root        : {type: 'edge-zone', zones: {center: {nodeId: 'main-split'}}},
            'main-split': {type: 'split', orientation: 'horizontal', children: ['main-tabs', 'side-tabs'], sizes: [0.5, 0.5]},
            'main-tabs' : {type: 'tabs', items: ['strategy', 'swarm'], activeItemId: 'strategy'},
            'side-tabs' : {type: 'tabs', items: ['terminal'], activeItemId: 'terminal'}
        }
    }
}

/**
 * @summary The canonical reducer smoke script: two real semantic operations plus a topology
 * assert and a (tiny) pause. The conditionally executable cross-window type has its own host
 * suite below; every reducer-owned type remains predictable against one document.
 * @returns {Object}
 */
function smokeScript() {
    return {
        schema: TOUR_SCRIPT_SCHEMA,
        id    : 'unit-smoke',
        title : 'Unit smoke tour',
        scenes: [{
            id     : 's1',
            title  : 'Auto-hide + resize',
            caption: 'field flip, viewer beat, splitter settle',
            steps  : [
                {
                    type      : 'op',
                    caption   : 'terminal tucks away',
                    descriptor: {operation: 'setItemAutoHidden', itemId: 'terminal', autoHidden: true},
                    expect    : [{path: 'items.terminal.autoHidden', equals: true}]
                },
                {type: 'pause', ms: 1, caption: 'viewer beat'},
                {
                    type      : 'op',
                    caption   : 'main split settles 70/30',
                    descriptor: {operation: 'resizeSplit', splitNodeId: 'main-split', sizes: [0.7, 0.3]},
                    expect    : [{path: 'nodes.main-split.sizes', equals: [0.7, 0.3]}]
                },
                {
                    type  : 'topology-assert',
                    expect: [
                        {path: 'items.terminal.autoHidden', equals: true},
                        {path: 'nodes.main-split.sizes.0',  equals: 0.7}
                    ]
                },
                {
                    type      : 'op',
                    caption   : 'the wave rolls back',
                    descriptor: {operation: 'setItemAutoHidden', itemId: 'terminal', autoHidden: false},
                    expect    : [{path: 'items.terminal.autoHidden', equals: false}]
                }
            ]
        }]
    }
}

/**
 * @summary One semantic cross-window step with no runtime window, DOM or geometry data.
 * @returns {Object}
 */
function crossWindowScript() {
    return {
        schema: TOUR_SCRIPT_SCHEMA,
        id    : 'unit-cross-window',
        title : 'Unit cross-window tour',
        scenes: [{
            id   : 'cross',
            title: 'Cross-window',
            steps: [{
                type             : 'cross-window',
                caption          : 'move the live workbench',
                itemId           : 'workbench',
                sourceWorkspaceId: 'demo-b-main',
                targetWorkspaceId: 'demo-b-popup',
                targetNodeId     : 'popup-tabs'
            }]
        }]
    }
}

/**
 * @summary A successful host receipt. Runtime witness values are deliberately configurable
 * so determinism tests can prove they never leak into TourRunner.log.
 * @param {Object} options
 * @returns {Object}
 */
function crossWindowReceipt({instanceId = 'neo-component-runtime-1', mountCount = 1} = {}) {
    return {
        applied       : true,
        errors        : [],
        sourceDocument: {schema: 'source.v1'},
        targetDocument: {schema: 'target.v1'},
        witness       : {instanceId, mountCount}
    }
}

/**
 * @summary Wires a fresh document holder into `Neo.getComponent` and returns it. The holder
 * follows the plain-field commit path: the service writes each post-op document back onto
 * `dockZoneDocument`, so the document advances across steps exactly like a live workspace.
 * @returns {Object}
 */
function createHolder() {
    const holder = {dockZoneDocument: doc(), id: 'tour-zone-1'};

    Neo.getComponent = () => holder;

    return holder
}

test.describe.serial('Neo.ai.client.TourRunner', () => {
    let originalGetComponent, runner, service;

    test.beforeEach(() => {
        originalGetComponent = Neo.getComponent;
        service              = Neo.create(DockService, {})
    });

    test.afterEach(() => {
        Neo.getComponent = originalGetComponent;
        runner?.destroy?.();
        runner = null;
        service.destroy?.()
    });

    /**
     * Creates a runner against a fresh holder with the shared defaults.
     * @param {Object} config
     * @returns {Neo.ai.client.TourRunner}
     */
    function createRunner(config = {}) {
        createHolder();

        runner = Neo.create(TourRunner, {
            componentId: 'tour-zone-1',
            dockService: service,
            mode       : 'spec',
            script     : smokeScript(),
            ...config
        });

        return runner
    }

    test.describe('tourScript validator (fail-closed)', () => {
        const operations = Operations.operations;

        test('the smoke script validates against the real executor vocabulary', () => {
            const result = validateTourScript(smokeScript(), {operations});

            expect(result.errors).toEqual([]);
            expect(result.valid).toBe(true)
        });

        test('unknown step types are rejected with the vocabulary enumerated', () => {
            const script = smokeScript();

            script.scenes[0].steps.push({type: 'teleport'});

            const {valid, errors} = validateTourScript(script, {operations});

            expect(valid).toBe(false);
            expect(errors.join('\n')).toContain(`unknown 'teleport'. The v1 vocabulary is: ${STEP_TYPES.join(', ')}`)
        });

        test('future reserved step types are rejected as reserved, not unknown', () => {
            RESERVED_STEP_TYPES.forEach(type => {
                const script = smokeScript();

                script.scenes[0].steps.push({type});

                const {valid, errors} = validateTourScript(script, {operations});

                expect(valid).toBe(false);
                expect(errors.join('\n')).toContain(`'${type}' is reserved`)
            })
        });

        test('cross-window remains reserved without a compatible host executor', () => {
            const {valid, errors} = validateTourScript(crossWindowScript(), {operations});

            expect(valid).toBe(false);
            expect(errors.join('\n')).toContain("'cross-window' remains reserved")
        });

        test('cross-window validates only its four semantic ids when a host is available', () => {
            const valid = validateTourScript(crossWindowScript(), {
                crossWindowAvailable: true,
                operations
            });

            expect(valid).toEqual({errors: [], valid: true});

            const missing = crossWindowScript();

            missing.scenes[0].steps[0].itemId = '';

            const sameWorkspace = crossWindowScript();

            sameWorkspace.scenes[0].steps[0].targetWorkspaceId = 'demo-b-main';

            const runtimeLeak = crossWindowScript();

            runtimeLeak.scenes[0].steps[0].screenX = 720;

            expect(validateTourScript(missing, {crossWindowAvailable: true, operations}).errors.join('\n'))
                .toContain('itemId: required non-empty semantic id string');
            expect(validateTourScript(sameWorkspace, {crossWindowAvailable: true, operations}).errors.join('\n'))
                .toContain('must identify different workspaces');
            expect(validateTourScript(runtimeLeak, {crossWindowAvailable: true, operations}).errors.join('\n'))
                .toContain('screenX: cross-window steps accept semantic ids only')
        });

        test('unknown operations are rejected with the executable vocabulary enumerated', () => {
            const script = smokeScript();

            script.scenes[0].steps[0].descriptor.operation = 'teleportItem';

            const {valid, errors} = validateTourScript(script, {operations});

            expect(valid).toBe(false);
            expect(errors.join('\n')).toContain(`unknown 'teleportItem'. The executable vocabulary is: ${operations.join(', ')}`)
        });

        test('function values violate the JSON-first contract', () => {
            const script = smokeScript();

            script.scenes[0].steps[0].onRun = () => {};

            const {valid, errors} = validateTourScript(script, {operations});

            expect(valid).toBe(false);
            expect(errors.join('\n')).toContain('function values violate the JSON-first contract')
        });

        test('a pause without a valid ms is rejected', () => {
            const script = smokeScript();

            script.scenes[0].steps[1].ms = -5;

            expect(validateTourScript(script, {operations}).valid).toBe(false)
        });

        test('a topology-assert without predicates is rejected', () => {
            const script = smokeScript();

            delete script.scenes[0].steps[3].expect;

            const {valid, errors} = validateTourScript(script, {operations});

            expect(valid).toBe(false);
            expect(errors.join('\n')).toContain('requires at least one {path, equals} predicate')
        });

        test('non-finite numbers, sparse arrays and cycles are rejected — JSON-first is round-trip-checked', () => {
            const nonFinite = smokeScript();

            nonFinite.scenes[0].steps[1].ms = NaN;
            expect(validateTourScript(nonFinite, {operations}).errors.join('\n')).toContain('non-finite number');

            const sparse = smokeScript();

            sparse.scenes[0].steps[0].expect = [{path: 'items', equals: ['a', , 'c']}]; // eslint-disable-line no-sparse-arrays
            expect(validateTourScript(sparse, {operations}).errors.join('\n')).toContain('sparse array');

            const cyclic = smokeScript();

            cyclic.scenes[0].loop = cyclic.scenes[0]; // a cycle must reject, never overflow the stack
            expect(validateTourScript(cyclic, {operations}).errors.join('\n')).toContain('cyclic reference');

            // the equalization bypass: a hole masked by a non-index own property must still reject
            const masked = smokeScript(), arr = ['a', , 'c']; // eslint-disable-line no-sparse-arrays

            arr.note = 'equalizer';
            masked.scenes[0].steps[0].expect = [{path: 'items', equals: arr}];

            const maskedErrors = validateTourScript(masked, {operations}).errors.join('\n');

            expect(maskedErrors).toContain('sparse array');
            expect(maskedErrors).toContain('non-index own properties')
        });

        test('descriptor-complete rejection: symbols, hidden toJSON, throwing getters — the serialization-blind spots', () => {
            // symbol-keyed own property: validates as invisible, disappears on the wire
            const withSymbol = smokeScript();

            withSymbol.scenes[0].steps[0].descriptor[Symbol('ghost')] = 1;
            expect(validateTourScript(withSymbol, {operations}).errors.join('\n')).toContain('symbol-keyed own properties');

            // hidden non-enumerable toJSON: would silently rewrite the serialized payload
            const withToJSON = smokeScript();

            Object.defineProperty(withToJSON.scenes[0].steps[0].descriptor, 'toJSON', {
                enumerable: false,
                value     : () => ({operation: 'closeItem', itemId: 'editor'})
            });
            expect(validateTourScript(withToJSON, {operations}).errors.join('\n')).toContain('toJSON would silently REWRITE');

            // enumerable throwing getter: must surface as a structured error, never a raw exception
            const withGetter = smokeScript();

            Object.defineProperty(withGetter.scenes[0].steps[0].descriptor, 'trap', {
                enumerable: true,
                get() { throw new Error('boom') }
            });

            const getterResult = validateTourScript(withGetter, {operations});

            expect(getterResult.valid).toBe(false);
            expect(getterResult.errors.join('\n')).toContain('accessor property');

            // non-enumerable EXTRA on an array: own-name accounting catches what keys-count missed
            const withHiddenExtra = smokeScript(), arr = ['a', 'b'];

            Object.defineProperty(arr, 'stash', {enumerable: false, value: 1});
            withHiddenExtra.scenes[0].steps[0].expect = [{path: 'items', equals: arr}];
            expect(validateTourScript(withHiddenExtra, {operations}).errors.join('\n')).toContain('non-index own properties')
        });

        test('a wrong schema tag is rejected fail-closed', () => {
            const script = smokeScript();

            script.schema = 'neo.tour.script.v2';

            expect(validateTourScript(script, {operations}).valid).toBe(false)
        });

        test('evaluateExpectations reports path-level mismatches with actual values', () => {
            const {passed, failures} = evaluateExpectations(
                [{path: 'nodes.main-split.sizes.0', equals: 0.9}],
                doc()
            );

            expect(passed).toBe(false);
            expect(failures).toEqual([{actual: 0.5, expected: 0.9, path: 'nodes.main-split.sizes.0'}])
        });

        test('number predicates absorb IEEE float noise but still fail real differences', () => {
            const document = {sizes: [0.7, 1 - 0.7]}; // 0.30000000000000004 — the normalized-reducer reality

            expect(evaluateExpectations([{path: 'sizes.1', equals: 0.3}], document).passed).toBe(true);
            expect(evaluateExpectations([{path: 'sizes.1', equals: 0.31}], document).passed).toBe(false);

            // explicit per-predicate tolerance for authors who need coarser matching
            expect(evaluateExpectations([{path: 'sizes.1', equals: 0.31, epsilon: 0.02}], document).passed).toBe(true);

            // and the validator rejects a malformed epsilon fail-closed
            const script = smokeScript();

            script.scenes[0].steps[3].expect[0].epsilon = -1;

            const {valid, errors} = validateTourScript(script, {operations});

            expect(valid).toBe(false);
            expect(errors.join('\n')).toContain('epsilon: must be a finite number >= 0')
        });
    });

    test.describe('runner preflight (structured refusals)', () => {
        test('a missing dock service aborts with a structured error, never a throw', async () => {
            createRunner({dockService: null});

            const result = await runner.start();

            expect(result.completed).toBe(false);
            expect(result.errors.join('\n')).toContain('dockService: required')
        });

        test('record mode refuses to start unless reducedMotion was probed false', async () => {
            createRunner({mode: 'record'});

            const result = await runner.start();

            expect(result.completed).toBe(false);
            expect(result.errors.join('\n')).toContain('record mode requires reducedMotion === false');

            runner.destroy();
            createRunner({mode: 'record', reducedMotion: false});

            const ok = await runner.start();

            expect(ok.errors).toEqual([]);
            expect(ok.completed).toBe(true)
        });

        test('an invalid script surfaces the validator errors', async () => {
            const script = smokeScript();

            script.scenes[0].steps[0].descriptor.operation = 'teleportItem';
            createRunner({script});

            const result = await runner.start();

            expect(result.completed).toBe(false);
            expect(result.errors.join('\n')).toContain("unknown 'teleportItem'")
        });

        test('a malformed host settlement boundary is refused before dispatch', async () => {
            createRunner({stepSettlement: {}});

            const result = await runner.start();

            expect(result.completed).toBe(false);
            expect(result.errors.join('\n')).toContain('stepSettlement: must be a Function or null')
        });

        test('cross-window refuses an absent or incompatible executor before dispatch', async () => {
            createRunner({script: crossWindowScript()});

            let result = await runner.start();

            expect(result.completed).toBe(false);
            expect(result.errors.join('\n')).toContain("'cross-window' remains reserved");

            runner.destroy();
            createRunner({crossWindowExecutor: {}, script: crossWindowScript()});

            result = await runner.start();

            expect(result.completed).toBe(false);
            expect(result.errors.join('\n')).toContain("'cross-window' remains reserved")
        });
    });

    test.describe('execution against the real reducers', () => {
        test('the smoke tour completes: documents advance, events fire in order', async () => {
            const events = [], settledEvents = [];

            createRunner();

            const holder = Neo.getComponent('tour-zone-1');

            runner.on({
                beat       : data => events.push(`beat:${data.stepIndex}:${data.stepType}`),
                complete   : () => events.push('complete'),
                scene      : data => events.push(`scene:${data.sceneId}`),
                stepSettled: data => {
                    settledEvents.push(data);
                    events.push(`settled:${data.stepIndex}:${data.stepType}:log-${runner.log.length}`)
                }
            });

            const result = await runner.start();

            expect(result.completed).toBe(true);
            expect(result.errors).toEqual([]);

            // the holder's committed document advanced through the real commit path
            // (close-to, not exact: the reducer normalizes split sizes to sum 1, so IEEE noise is inherent)
            const {sizes} = holder.dockZoneDocument.nodes['main-split'];

            expect(sizes[0]).toBeCloseTo(0.7, 9);
            expect(sizes[1]).toBeCloseTo(0.3, 9);
            expect(holder.dockZoneDocument.items.terminal.autoHidden).toBe(false);

            expect(events).toEqual([
                'scene:s1',
                'beat:0:op',              'settled:0:op:log-1',
                'beat:1:pause',           'settled:1:pause:log-2',
                'beat:2:op',              'settled:2:op:log-3',
                'beat:3:topology-assert', 'settled:3:topology-assert:log-4',
                'beat:4:op',              'settled:4:op:log-5',
                'complete'
            ]);
            expect(settledEvents).toEqual([
                {completedCount: 1, logLength: 1, sceneId: 's1', sceneIndex: 0, source: runner.id, stepIndex: 0, stepType: 'op'},
                {completedCount: 2, logLength: 2, sceneId: 's1', sceneIndex: 0, source: runner.id, stepIndex: 1, stepType: 'pause'},
                {completedCount: 3, logLength: 3, sceneId: 's1', sceneIndex: 0, source: runner.id, stepIndex: 2, stepType: 'op'},
                {completedCount: 4, logLength: 4, sceneId: 's1', sceneIndex: 0, source: runner.id, stepIndex: 3, stepType: 'topology-assert'},
                {completedCount: 5, logLength: 5, sceneId: 's1', sceneIndex: 0, source: runner.id, stepIndex: 4, stepType: 'op'}
            ]);
            expect(JSON.parse(JSON.stringify(settledEvents)), 'the payload is JSON-safe and timestamp-free')
                .toEqual(settledEvents)
        });

        test('a paced pause settles only after its runner-owned wait', async () => {
            const script = {
                schema: TOUR_SCRIPT_SCHEMA,
                id    : 'paced-pause',
                title : 'Paced pause',
                scenes: [{id: 'paced', title: 'Paced', steps: [{type: 'pause', ms: 7}]}]
            };

            createRunner({mode: 'demo', paceMultiplier: 2, script});

            const events = [];

            runner.timeout = async ms => events.push(`wait:${ms}`);
            runner.on('stepSettled', data => events.push(`settled:${data.stepType}:${data.completedCount}`));

            const result = await runner.start();

            expect(result.completed).toBe(true);
            expect(events).toEqual(['wait:14', 'settled:pause:1'])
        });

        test('an injected host settlement blocks the next beat without changing the replay log', async () => {
            let release, enteredResolve;
            const
                entered = new Promise(resolve => enteredResolve = resolve),
                events  = [];

            createRunner({
                stepSettlement(data) {
                    events.push(`host:${data.stepIndex}:${data.stepType}:log-${data.logLength}`);

                    if (data.stepIndex === 0) {
                        enteredResolve();
                        data.stepIndex = 99;
                        return new Promise(resolve => release = resolve)
                    }
                }
            });
            runner.on({
                beat       : data => events.push(`beat:${data.stepIndex}`),
                stepSettled: data => events.push(`settled:${data.stepIndex}`)
            });

            const running = runner.start();

            await entered;

            expect(events).toEqual(['beat:0', 'host:0:op:log-1']);
            expect(runner.log).toHaveLength(1);

            release();

            const result = await running;

            expect(result.completed).toBe(true);
            expect(events.slice(0, 4)).toEqual([
                'beat:0',
                'host:0:op:log-1',
                'settled:0',
                'beat:1'
            ]);
            expect(events).not.toContain('settled:99');
            expect(events.filter(event => event.startsWith('host:'))).toEqual([
                'host:0:op:log-1',
                'host:1:pause:log-2',
                'host:2:op:log-3',
                'host:3:topology-assert:log-4',
                'host:4:op:log-5'
            ]);
            expect(result.log).toHaveLength(smokeScript().scenes[0].steps.length)
        });

        test('destroying the runner rejects a pending host settlement without a late step event', async () => {
            let release, enteredResolve;
            const
                entered = new Promise(resolve => enteredResolve = resolve),
                settled = [];

            createRunner({
                stepSettlement() {
                    enteredResolve();
                    return new Promise(resolve => release = resolve)
                }
            });
            runner.on('stepSettled', data => settled.push(data));

            const running = runner.start();

            await entered;
            runner.destroy();

            expect(await running).toEqual({
                completed: false,
                errors   : ['TourRunner destroyed mid-tour'],
                log      : [expect.objectContaining({stepIndex: 0, type: 'op'})]
            });
            expect(settled).toEqual([]);

            release();
            await Promise.resolve();

            expect(settled).toEqual([])
        });

        test('a rejected host settlement aborts structurally without a successful step event', async () => {
            const settled = [];

            createRunner({stepSettlement: async () => { throw new Error('surface vanished') }});
            runner.on('stepSettled', data => settled.push(data));

            const result = await runner.start();

            expect(result.completed).toBe(false);
            expect(result.errors.join('\n')).toContain('host step settlement failed: surface vanished');
            expect(result.log).toHaveLength(1);
            expect(settled).toEqual([])
        });

        test('cross-window awaits one host dispatch before settlement and logs semantics only', async () => {
            let release;
            const
                calls    = [],
                executor = {
                    executeCrossWindowStep(step) {
                        calls.push(step);
                        return new Promise(resolve => release = resolve)
                    }
                },
                settled = [];

            createRunner({crossWindowExecutor: executor, script: crossWindowScript()});
            runner.on('stepSettled', data => settled.push(data));

            const running = runner.start();

            await Promise.resolve();

            expect(calls).toHaveLength(1);
            expect(calls[0]).toEqual(crossWindowScript().scenes[0].steps[0]);
            expect(calls[0]).not.toBe(runner.script.scenes[0].steps[0]);
            expect(settled).toEqual([]);

            release(crossWindowReceipt());

            const result = await running;

            expect(result.completed).toBe(true);
            expect(settled).toHaveLength(1);
            expect(result.log).toEqual([{
                applied: true,
                errors : [],
                sceneId: 'cross',
                step   : {
                    itemId           : 'workbench',
                    sourceWorkspaceId: 'demo-b-main',
                    targetWorkspaceId: 'demo-b-popup',
                    targetNodeId     : 'popup-tabs'
                },
                stepIndex: 0,
                type     : 'cross-window'
            }]);
            expect(JSON.stringify(result.log)).not.toContain('neo-component-runtime-1');
            expect(JSON.stringify(result.log)).not.toContain('mountCount')
        });

        test('destroying the runner settles a pending cross-window host without a late step event', async () => {
            let release;
            const settled = [];

            createRunner({
                crossWindowExecutor: {
                    executeCrossWindowStep: () => new Promise(resolve => release = resolve)
                },
                script: crossWindowScript()
            });
            runner.on('stepSettled', data => settled.push(data));

            const running = runner.start();

            await Promise.resolve();
            runner.destroy();

            expect(await running).toEqual({
                completed: false,
                errors   : ['TourRunner destroyed mid-tour'],
                log      : []
            });
            expect(settled).toEqual([]);

            release(crossWindowReceipt());
            await Promise.resolve();

            expect(settled).toEqual([])
        });

        test('cross-window rejection, throw and malformed success abort structurally without settlement', async () => {
            const run = async executeCrossWindowStep => {
                const settled = [];

                runner?.destroy?.();
                createRunner({crossWindowExecutor: {executeCrossWindowStep}, script: crossWindowScript()});
                runner.on('stepSettled', data => settled.push(data));

                const result = await runner.start();

                expect(result.completed).toBe(false);
                expect(settled).toEqual([]);

                return result
            };

            let result = await run(async () => ({applied: false, errors: ['target refused']}));

            expect(result.errors.join('\n')).toContain('target refused');
            expect(result.log).toHaveLength(1);

            result = await run(async () => { throw new Error('host vanished') });

            expect(result.errors.join('\n')).toContain('cross-window executor failure: host vanished');
            expect(result.log).toEqual([]);

            result = await run(async () => ({applied: true, errors: []}));

            expect(result.errors.join('\n')).toContain('requires a plain sourceDocument');
            expect(result.errors.join('\n')).toContain('requires witness');
            expect(result.log).toEqual([])
        });

        test('changing runtime witnesses across runs cannot change the cross-window replay log', async () => {
            let   run      = 0;
            const executor = {
                executeCrossWindowStep: async () => crossWindowReceipt({
                    instanceId: `runtime-${++run}`,
                    mountCount: run
                })
            };

            createRunner({crossWindowExecutor: executor, script: crossWindowScript()});

            const first  = await runner.start(),
                  second = await runner.start();

            expect(first.completed && second.completed).toBe(true);
            expect(second.log).toEqual(first.log)
        });

        test('cross-window logs are mode-identical while the host receipt settles correctness', async () => {
            const executor = {executeCrossWindowStep: async () => crossWindowReceipt()};
            let   results  = [];

            for (const mode of ['spec', 'demo', 'record']) {
                runner?.destroy?.();
                createRunner({
                    crossWindowExecutor: executor,
                    mode,
                    reducedMotion      : mode === 'record' ? false : null,
                    script             : crossWindowScript()
                });

                results.push(await runner.start())
            }

            results.forEach(result => {
                expect(result.completed).toBe(true);
                expect(result.errors).toEqual([]);
                expect(result.log).toHaveLength(1);
                expect(result.log[0].type).toBe('cross-window')
            });

            const logs = results.map(result => JSON.stringify(result.log));

            expect(logs[1]).toBe(logs[0]);
            expect(logs[2]).toBe(logs[0])
        });

        test('log entries carry the complete cloned descriptor — the log IS the replay wire format', async () => {
            createRunner();

            const result = await runner.start();

            expect(result.completed).toBe(true);
            expect(result.log[0].descriptor).toEqual({operation: 'setItemAutoHidden', itemId: 'terminal', autoHidden: true});
            // a clone, never a live reference into the script
            expect(result.log[0].descriptor).not.toBe(smokeScript().scenes[0].steps[0].descriptor);
            expect(result.log[0].descriptor).not.toBe(runner.script.scenes[0].steps[0].descriptor)
        });

        test('a live-seam failure aborts structured — the runner never leaks a raw throw', async () => {
            createRunner();
            Neo.getComponent = () => null; // the holder disappears before the first op

            const result = await runner.start();

            expect(result.completed).toBe(false);
            expect(result.errors.join('\n')).toContain('dock seam failure');
            expect(result.errors.join('\n')).toContain('Component not found')
        });

        test('two consecutive runs produce identical operation logs (the determinism falsifier)', async () => {
            createRunner();

            const first = await runner.start();

            expect(first.completed).toBe(true);

            runner.destroy();
            createRunner();

            const second = await runner.start();

            expect(second.completed).toBe(true);
            expect(second.log).toEqual(first.log)
        });

        test('mode changes pace, never order: spec / demo / record logs are identical', async () => {
            createRunner({mode: 'spec'});

            const specRun = await runner.start();

            runner.destroy();
            createRunner({mode: 'demo', paceMultiplier: 0});

            const demoRun = await runner.start();

            runner.destroy();
            createRunner({mode: 'record', reducedMotion: false});

            const recordRun = await runner.start();

            expect(specRun.completed && demoRun.completed && recordRun.completed).toBe(true);
            expect(demoRun.log).toEqual(specRun.log);
            expect(recordRun.log).toEqual(specRun.log)
        });

        test('a failed post-op expectation aborts with the path and both values', async () => {
            const script = smokeScript();

            script.scenes[0].steps[0].expect = [{path: 'items.terminal.autoHidden', equals: false}];
            createRunner({script});

            const errorEvents = [], settledEvents = [];

            runner.on('error', data => errorEvents.push(data));
            runner.on('stepSettled', data => settledEvents.push(data));

            const result = await runner.start();

            expect(result.completed).toBe(false);
            expect(result.errors.join('\n')).toContain("expectation failed at 'items.terminal.autoHidden': expected false, got true");
            expect(errorEvents).toHaveLength(1);
            expect(settledEvents, 'failed expectations never emit a successful settlement').toEqual([]);

            // the log keeps the entries up to and including the failed step — an honest partial record
            expect(result.log).toHaveLength(1);
            expect(result.log[0]).toMatchObject({applied: true, operation: 'setItemAutoHidden', type: 'op'})
        });

        test('an executor-rejected operation aborts with the structured executor errors', async () => {
            const script = smokeScript();

            script.scenes[0].steps[0].descriptor.itemId = 'ghost';
            createRunner({script});

            const settledEvents = [];

            runner.on('stepSettled', data => settledEvents.push(data));

            const result = await runner.start();

            expect(result.completed).toBe(false);
            expect(result.errors.join('\n')).toContain('rejected by the executor');
            expect(result.errors.join('\n')).toContain('unknown item "ghost"');
            expect(settledEvents, 'rejected operations never emit a successful settlement').toEqual([])
        });

        test('start() while running throws — a programming error, not a tour failure', async () => {
            createRunner();

            const running = runner.start();

            await expect(runner.start()).rejects.toThrow('already running');
            await running
        });
    });
});
