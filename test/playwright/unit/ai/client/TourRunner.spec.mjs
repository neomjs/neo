import {test, expect} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';
import DockService    from '../../../../../src/ai/client/DockService.mjs';
import DockZoneModel  from '../../../../../src/dashboard/DockZoneModel.mjs';
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
        schema: 'neo.harness.dockZone.v1',
        root  : 'root',
        items : {
            strategy: {componentRef: 'strategy', title: 'Strategy', kind: 'panel'},
            swarm   : {componentRef: 'swarm',    title: 'Swarm',    kind: 'panel'},
            terminal: {componentRef: 'terminal', title: 'Terminal', kind: 'terminal'}
        },
        nodes: {
            root        : {type: 'edge-zone', zones: {center: 'main-split'}},
            'main-split': {type: 'split', orientation: 'horizontal', children: ['main-tabs', 'side-tabs'], sizes: [0.5, 0.5]},
            'main-tabs' : {type: 'tabs', items: ['strategy', 'swarm'], activeItemId: 'strategy'},
            'side-tabs' : {type: 'tabs', items: ['terminal'], activeItemId: 'terminal'}
        }
    }
}

/**
 * @summary The canonical three-step smoke script: two real semantic operations plus a
 * topology assert and a (tiny) pause — every step type of the v1 vocabulary except the
 * reserved ones, executable against the real reducers with predictable post-state.
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
        const operations = DockZoneModel.operations;

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

        test('reserved step types are rejected as reserved, not unknown', () => {
            RESERVED_STEP_TYPES.forEach(type => {
                const script = smokeScript();

                script.scenes[0].steps.push({type});

                const {valid, errors} = validateTourScript(script, {operations});

                expect(valid).toBe(false);
                expect(errors.join('\n')).toContain(`'${type}' is reserved`)
            })
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
