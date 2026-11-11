import {setup} from '../../setup.mjs';

setup({appConfig: {name: 'PipelineTelemetryTest'}});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Connection     from '../../../../src/data/connection/Base.mjs';
import Normalizer     from '../../../../src/data/normalizer/Base.mjs';
import Parser         from '../../../../src/data/parser/Base.mjs';
import StreamParser   from '../../../../src/data/parser/Stream.mjs';
import Pipeline       from '../../../../src/data/Pipeline.mjs';
import Logger         from '../../../../src/util/Logger.mjs';

const stages = ['connection', 'parser', 'normalizer'];

/** @summary Settles overlapping operations in a chosen order without a network or a timer. */
function deferred() {
    let resolve, reject;
    const promise = new Promise((yes, no) => {resolve = yes; reject = no});
    return {promise, resolve, reject}
}

/** @summary Counts clock reads and supplies monotonic ticks only for the operation under test. */
async function withClock(action) {
    const original = performance.now;
    let   ticks    = 0;
    performance.now = () => ++ticks;
    try {
        const value = await action();
        return {value, ticks}
    } finally {
        performance.now = original
    }
}

/** @summary Checks the public metric carrier without admitting payloads, params or error text. */
function expectRecord(record, pipeline, operation, status = 'fulfilled') {
    expect(Object.keys(metricData(record)).sort()).toEqual([
        'connectionEnd', 'connectionStart', 'id', 'normalizerEnd', 'normalizerStart', 'operation',
        'parsedSize', 'parserEnd', 'parserStart', 'pipelineId', 'rawSize', 'status'
    ].sort());
    expect(typeof record.id).toBe('string');
    expect(record.id.length).toBeGreaterThan(0);
    expect(record).toMatchObject({pipelineId: pipeline.appPipelineId || pipeline.id, operation, status});
    for (const size of [record.rawSize, record.parsedSize]) {
        expect(Object.keys(size).sort()).toEqual(['bytes', 'records']);
        for (const value of Object.values(size)) {
            expect(value === null || Number.isSafeInteger(value) && value >= 0).toBe(true)
        }
    }
}

/** @summary Removes only Observable's framework-owned event source before inspecting the metric data. */
function metricData({source, ...record}) {
    return record
}

test.describe('Pipeline telemetry preserves its business carriers', () => {
    let owned, originalLog;

    test.beforeEach(() => {
        owned = [];
        originalLog = Logger.log
    });

    test.afterEach(() => {
        Logger.log = originalLog;
        owned.reverse().forEach(instance => instance.destroy())
    });

    /** @summary Uses actual stage instances while keeping their business work local and deterministic. */
    async function makePipeline(config = {}, methods = {}) {
        const pipeline = Neo.create(Pipeline, config);
        owned.push(pipeline);
        await pipeline.ready();
        for (const [name, module] of [['connection', Connection], ['parser', Parser], ['normalizer', Normalizer]]) {
            if (methods[name]) {
                const stage = Neo.create(module, {pipeline});
                Object.assign(stage, methods[name]);
                pipeline[name] = stage;
                await stage.ready()
            }
        }
        return pipeline
    }

    test('default-off public operations preserve identities with no clock, event or logger work', async () => {
        const result   = {data: [{id: 1}]}, params = {query: 'unchanged'}, calls = [], metrics = [], pushes = [], logs = [];
        const pipeline = await makePipeline({}, {connection: Object.fromEntries(
            ['read', 'create', 'update'].map(operation => [operation, async value => {calls.push(value); return result}])
        )});
        pipeline.connection.execute = async (method, value) => {calls.push([method, value]); return result};
        pipeline.on('telemetry', metric => metrics.push(metric));
        pipeline.on('push', data => pushes.push(data));
        Logger.log = (...args) => logs.push(args);

        const {value, ticks} = await withClock(async () => {
            const results = [await pipeline.read(params), await pipeline.execute('search', params),
                await pipeline.create(params), await pipeline.update(params)];
            await pipeline.onConnectionPush(result);
            return results
        });

        expect(pipeline.telemetry).toBe(false);
        expect(pipeline.logTelemetry).toBe(false);
        value.forEach(response => expect(response).toBe(result));
        expect(calls[0]).toBe(params);
        expect(calls[1]).toEqual(['search', params]);
        expect(calls[1][1]).toBe(params);
        expect(calls[2]).toBe(params);
        expect(calls[3]).toBe(params);
        expect(pushes).toHaveLength(1);
        expect(pushes[0]).toBe(result);
        expect({ticks, metrics, logs}).toEqual({ticks: 0, metrics: [], logs: []})
    });

    test('profile measures local stages even when telemetry is off, preserving params and result identity', async () => {
        const params   = {query: 'same object'}, raw = '€x', parsed = [{id: 1}, {id: 2}], calls = [];
        const pipeline = await makePipeline({appPipelineId: 'origin-app-pipeline'}, {
            connection: {read: async value => {calls.push(['connection', value]); return raw}},
            parser    : {read: async value => {calls.push(['parser', value]); return parsed}},
            normalizer: {normalize: async value => {calls.push(['normalizer', value]); return value}}
        });

        const {value: {result, telemetry}} = await withClock(() => pipeline.profile({operation: 'read', params}));

        expect(pipeline.telemetry).toBe(false);
        expect(result).toBe(parsed);
        expect(calls.map(([name]) => name)).toEqual(stages);
        expect(calls[0][1]).toBe(params);
        expect(calls[1][1]).toBe(raw);
        expect(calls[2][1]).toBe(parsed);
        expectRecord(telemetry, pipeline, 'read');
        const times = stages.flatMap(stage => [telemetry[`${stage}Start`], telemetry[`${stage}End`]]);
        expect(times.every(Number.isFinite)).toBe(true);
        expect(times).toEqual([...times].sort((a, b) => a - b));
        expect(telemetry.rawSize).toEqual({bytes: 4, records: null});
        expect(telemetry.parsedSize).toEqual({bytes: null, records: 2})
    });

    test('a push without shaping stages has null stage times and keeps its raw array', async () => {
        const pipeline            = await makePipeline(), input = [{id: 1}];
        const {result, telemetry} = await pipeline.profile({operation: 'push', params: input});

        expect(result).toBe(input);
        expectRecord(telemetry, pipeline, 'push');
        for (const stage of stages) {
            expect([telemetry[`${stage}Start`], telemetry[`${stage}End`]]).toEqual([null, null])
        }
        expect(telemetry.rawSize).toEqual({bytes: null, records: 1})
    });

    test('execute uses its generic method and original params, with method-specific shaping', async () => {
        const params   = {limit: 7}, raw = {from: 'connection'}, parsed = {from: 'parser'}, result = {from: 'normalizer'}, calls = [];
        const pipeline = await makePipeline({telemetry: true}, {
            connection: {execute: async (method, value) => {calls.push([method, value]); return raw}},
            parser    : {search: async value => {expect(value).toBe(raw); return parsed}},
            normalizer: {search: async value => {expect(value).toBe(parsed); return result}}
        });
        const metrics = [];
        pipeline.on('telemetry', metric => metrics.push(metric));

        expect(await pipeline.execute('search', params)).toBe(result);
        expect(calls).toEqual([['search', params]]);
        expect(calls[0][1]).toBe(params);
        expect(metrics).toHaveLength(1);
        expectRecord(metrics[0], pipeline, 'execute')
    });

    for (const operation of ['create', 'update']) {
        test(`${operation} keeps its own connection and shaping methods`, async () => {
            const params   = {id: 7}, raw = {stage: 'connection'}, parsed = {stage: 'parser'}, result = {stage: 'normalizer'};
            const pipeline = await makePipeline({telemetry: true}, {
                connection: {[operation]: async value => {expect(value).toBe(params); return raw}},
                parser    : {[operation]: async value => {expect(value).toBe(raw); return parsed}},
                normalizer: {[operation]: async value => {expect(value).toBe(parsed); return result}}
            });
            const metrics = [];
            pipeline.on('telemetry', metric => metrics.push(metric));

            expect(await pipeline[operation](params)).toBe(result);
            expect(metrics).toHaveLength(1);
            expectRecord(metrics[0], pipeline, operation)
        })
    }

    test('public pushes publish their metric separately and retain their shaped record', async () => {
        const input    = {id: 1, text: 'private input'}, result = {id: 1, text: 'shaped'}, metrics = [], pushes = [];
        const pipeline = await makePipeline({telemetry: true}, {
            parser    : {read: async value => {expect(value).toBe(input); return result}},
            normalizer: {normalize: async value => value}
        });
        pipeline.on('telemetry', metric => metrics.push(metric));
        pipeline.on('push', data => pushes.push(data));

        await pipeline.onConnectionPush(input);

        expect(pushes).toHaveLength(1);
        expect(pushes[0]).toBe(result);
        expect(metrics).toHaveLength(1);
        expectRecord(metrics[0], pipeline, 'push');
        expect([metrics[0].connectionStart, metrics[0].connectionEnd]).toEqual([null, null]);
        expect(JSON.stringify(metricData(metrics[0]))).not.toContain('private input')
    });

    for (const failingStage of stages) {
        test(`a rejected ${failingStage} preserves the original error and publishes no error content`, async () => {
            const error   = new Error(`private ${failingStage} failure`), metrics = [];
            const perform = stage => async () => {
                if (stage === failingStage) throw error;
                return 'private payload'
            };
            const pipeline = await makePipeline({telemetry: true}, {
                connection: {read: perform('connection')}, parser: {read: perform('parser')},
                normalizer: {normalize: perform('normalizer')}
            });
            pipeline.on('telemetry', metric => metrics.push(metric));

            await expect(pipeline.read({secret: 'private params'})).rejects.toBe(error);

            expect(metrics).toHaveLength(1);
            expectRecord(metrics[0], pipeline, 'read', 'rejected');
            const attempted = stages.indexOf(failingStage);
            stages.forEach((stage, index) => {
                const times = [metrics[0][`${stage}Start`], metrics[0][`${stage}End`]];
                expect(index <= attempted ? times.every(Number.isFinite) : times.every(value => value === null)).toBe(true)
            });
            expect(JSON.stringify(metricData(metrics[0]))).not.toMatch(/private|payload|params|failure/)
        })
    }

    test('overlapping reads finishing out of order retain distinct per-operation records', async () => {
        const first    = deferred(), second = deferred(), metrics = [];
        const pipeline = await makePipeline({telemetry: true}, {connection: {
            read: ({which}) => which === 'first' ? first.promise : second.promise
        }});
        pipeline.on('telemetry', metric => metrics.push(metric));
        const older = pipeline.read({which: 'first'}), newer = pipeline.read({which: 'second'});
        second.resolve('bbb');
        expect(await newer).toBe('bbb');
        expect(metrics).toHaveLength(1);
        const firstReceipt = JSON.stringify(metricData(metrics[0]));
        first.resolve('a');
        expect(await older).toBe('a');

        expect(metrics).toHaveLength(2);
        metrics.forEach(metric => expectRecord(metric, pipeline, 'read'));
        expect(metrics[0]).not.toBe(metrics[1]);
        expect(metrics[0].id).not.toBe(metrics[1].id);
        expect(metrics.map(metric => metric.rawSize.bytes)).toEqual([3, 1]);
        expect(JSON.stringify(metricData(metrics[0]))).toBe(firstReceipt)
    });

    test('enabled observations get distinct UUIDs while disabled profiling never requests random values', async () => {
        const disabled = await makePipeline({}, {connection: {read: async () => 'plain'}});
        const enabled  = await makePipeline({telemetry: true}, {connection: {read: async () => 'profiled'}});
        const metrics  = [], original = crypto.getRandomValues;
        let   calls    = 0, disabledCalls;
        enabled.on('telemetry', metric => metrics.push(metric));
        crypto.getRandomValues = function(...args) {
            calls++;
            return original.apply(this, args)
        };

        try {
            await disabled.read();
            await disabled.read();
            disabledCalls = calls;
            await enabled.read();
            await enabled.read()
        } finally {
            crypto.getRandomValues = original
        }

        expect(disabledCalls).toBe(0);
        expect(calls).toBe(2);
        expect(metrics).toHaveLength(2);
        metrics.forEach(metric => expect(metric.id).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i));
        expect(metrics[0].id).not.toBe(metrics[1].id)
    });

    test('sizes use exact binary spans and record counts without serializing arbitrary objects', async () => {
        const pipeline   = await makePipeline(), buffer = new ArrayBuffer(8);
        let   serialized = 0, getterReads = 0;
        const unknown    = {toJSON() {serialized++; throw new Error('must not serialize')}};
        const cases      = [
            ['π', {bytes: 2, records: null}],
            [buffer, {bytes: 8, records: null}],
            [new Uint8Array(buffer, 2, 3), {bytes: 3, records: null}],
            [new DataView(buffer, 3, 2), {bytes: 2, records: null}],
            [[{id: 1}, {id: 2}], {bytes: null, records: 2}],
            [{data: []}, {bytes: null, records: 0}],
            [Object.create({data: [{id: 1}]}), {bytes: null, records: null}],
            [{get data() {getterReads++; return []}}, {bytes: null, records: null}],
            [unknown, {bytes: null, records: null}]
        ];
        for (const [input, size] of cases) {
            const {result, telemetry} = await pipeline.profile({operation: 'push', params: input});
            expect(result === input).toBe(true);
            expect(telemetry.rawSize).toEqual(size);
            expect(telemetry.parsedSize).toEqual(size)
        }
        expect({serialized, getterReads}).toEqual({serialized: 0, getterReads: 0})
    });

    test('the real Stream parser consumes one reader and retains progressive data and its final summary', async () => {
        const input          = new TextEncoder().encode('{"id":1}\n{"id":2}\n'), metrics = [], records = [];
        const stream         = new ReadableStream({start(controller) {controller.enqueue(input); controller.close()}});
        const originalReader = stream.getReader.bind(stream);
        let   readers        = 0;
        stream.getReader = (...args) => {readers++; return originalReader(...args)};
        const raw      = {stream, total: input.byteLength};
        const pipeline = await makePipeline({telemetry: true}, {connection: {read: async () => raw}});
        pipeline.parser = Neo.create(StreamParser, {pipeline, chunkSize: 1, initialChunkSize: 1, initialBurstCount: 1});
        await pipeline.parser.ready();
        pipeline.on('data', chunk => records.push(...chunk));
        pipeline.on('telemetry', metric => metrics.push(metric));

        expect(await pipeline.read()).toEqual({success: true, count: 2});
        expect(records).toEqual([{id: 1}, {id: 2}]);
        expect(readers).toBe(1);
        expect(metrics).toHaveLength(1);
        expectRecord(metrics[0], pipeline, 'read');
        expect(metrics[0].rawSize).toEqual({bytes: null, records: null});
        expect(metrics[0].parsedSize).toEqual({bytes: null, records: null})
    });

    test('optional Logger output contains one metrics object, with no raw data or params', async () => {
        const output   = [], metrics = [], result = {privateText: 'not for telemetry logs'};
        const pipeline = await makePipeline({telemetry: true, logTelemetry: true}, {connection: {read: async () => result}});
        Logger.log = (...args) => output.push(args);
        pipeline.on('telemetry', metric => metrics.push(metric));

        expect(await pipeline.read({privateText: 'private request'})).toBe(result);
        await expect.poll(() => output.length).toBe(1);
        expect(output[0]).toHaveLength(1);
        expect(output[0][0]).toMatchObject({msg: expect.any(String), data: metricData(metrics[0])});
        expect(JSON.stringify(output)).not.toMatch(/not for telemetry logs|private request/)
    });

    test('a throwing observer cannot replace a fulfilled result or the original business rejection', async () => {
        const result   = {id: 1}, error = new Error('business failure');
        const pipeline = await makePipeline({telemetry: true}, {connection: {
            read: async ({reject} = {}) => {if (reject) throw error; return result}
        }});
        pipeline.on('telemetry', () => {throw new Error('observer failure')});

        expect(await pipeline.read()).toBe(result);
        await expect(pipeline.read({reject: true})).rejects.toBe(error)
    });

    test('a throwing Logger cannot replace a fulfilled result or the original business rejection', async () => {
        const result   = {id: 1}, error = new Error('business failure');
        const pipeline = await makePipeline({telemetry: true, logTelemetry: true}, {connection: {
            read: async ({reject} = {}) => {if (reject) throw error; return result}
        }});
        let calls = 0;
        Logger.log = () => {calls++; throw new Error('logger failure')};

        expect(await pipeline.read()).toBe(result);
        await expect(pipeline.read({reject: true})).rejects.toBe(error);
        await expect.poll(() => calls).toBe(2)
    });

    test('observer edits cannot alter the canonical Logger record or a later observation', async () => {
        const output   = [], observedIds = [];
        const pipeline = await makePipeline({telemetry: true, logTelemetry: true}, {connection: {read: async () => 'raw'}});
        Logger.log = value => output.push(value);
        pipeline.on('telemetry', event => {
            observedIds.push(event.id);
            event.id = 'observer changed id';
            event.operation = 'observer changed operation';
            try {event.rawSize.bytes = 999} catch {}
        });

        expect(await pipeline.read()).toBe('raw');
        expect(await pipeline.read()).toBe('raw');

        expect(new Set(observedIds).size).toBe(2);
        await expect.poll(() => output.length).toBe(2);
        output.forEach((entry, index) => {
            expect(entry.data.id).toBe(observedIds[index]);
            expect(entry.data.operation).toBe('read');
            expect(entry.data.rawSize).toEqual({bytes: 3, records: null})
        })
    });

    for (const telemetry of [false, true]) {
        test(`a normalizer replaced while parsing is awaited runs at its stage, telemetry=${telemetry}`, async () => {
            const parsing   = deferred(), enteredParser = deferred(), calls = [], metrics = [];
            const oldResult = {from: 'old normalizer'}, newResult = {from: 'replacement'}, parsed = {id: 1};
            const pipeline  = await makePipeline({telemetry}, {
                connection: {read: async () => 'raw'},
                parser    : {read: async () => {enteredParser.resolve(); return parsing.promise}},
                normalizer: {normalize: async () => {calls.push('old'); return oldResult}}
            });
            const oldNormalizer = pipeline.normalizer;
            pipeline.on('telemetry', metric => metrics.push(metric));
            const pending = pipeline.read();
            await enteredParser.promise;
            const replacement = Neo.create(Normalizer, {pipeline});
            replacement.normalize = async value => {expect(value).toBe(parsed); calls.push('replacement'); return newResult};
            pipeline.normalizer = replacement;
            parsing.resolve(parsed);

            expect(await pending).toBe(newResult);
            expect(oldNormalizer.isDestroyed).toBe(true);
            expect(calls).toEqual(['replacement']);
            expect(metrics).toHaveLength(telemetry ? 1 : 0)
        })
    }
});
