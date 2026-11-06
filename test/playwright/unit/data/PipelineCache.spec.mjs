import {setup} from '../../setup.mjs';

setup({appConfig: {name: 'PipelineCacheTest'}});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Connection     from '../../../../src/data/connection/Base.mjs';
import Parser         from '../../../../src/data/parser/Base.mjs';
import Normalizer     from '../../../../src/data/normalizer/Base.mjs';
import Pipeline       from '../../../../src/data/Pipeline.mjs';
import Stream         from '../../../../src/data/parser/Stream.mjs';
import Store          from '../../../../src/data/Store.mjs';
import Model          from '../../../../src/data/Model.mjs';
import '../../../../src/manager/Instance.mjs';

/** @summary Exercises completed-read caching at the executing Pipeline's real stage boundary. */
test.describe('Pipeline read cache', () => {
    let pipelines;

    test.beforeEach(() => {pipelines = []});
    test.afterEach(() => pipelines.forEach(pipeline => !pipeline.isDestroyed && pipeline.destroy()));

    /**
     * @summary Creates real owned stages and records which stages actually execute.
     * @param {Object} [config]
     * @returns {Promise<Object>}
     */
    async function create(config = {}) {
        const pipeline   = Neo.create(Pipeline, config),
              connection = Neo.create(Connection),
              parser     = Neo.create(Parser),
              normalizer = Neo.create(Normalizer),
              calls      = {connection: 0, parser: 0, normalizer: 0};

        pipelines.push(pipeline);
        await Promise.all([pipeline.ready(), connection.ready(), parser.ready(), normalizer.ready()]);

        connection.read = async () => ({data: [{id: ++calls.connection}]});
        parser.read = async value => {calls.parser++; return value.data};
        normalizer.normalize = async value => {calls.normalizer++; return value.map(row => ({...row, shaped: true}))};
        pipeline.set({connection, parser, normalizer});

        return {pipeline, connection, parser, normalizer, calls}
    }

    test('default-off reads retain their original transport and shaping behavior', async () => {
        const {pipeline, calls} = await create();

        expect(await pipeline.read({page: 1})).toEqual([{id: 1, shaped: true}]);
        expect(await pipeline.read({page: 1})).toEqual([{id: 2, shaped: true}]);
        expect(calls).toEqual({connection: 2, parser: 2, normalizer: 2})
    });

    test('opted-in repeated reads reuse the completed shaped result', async () => {
        const {pipeline, calls} = await create({cache: true});

        expect(await pipeline.read({page: 1})).toEqual([{id: 1, shaped: true}]);
        expect(await pipeline.read({page: 1})).toEqual([{id: 1, shaped: true}]);
        expect(calls).toEqual({connection: 1, parser: 1, normalizer: 1})
    });

    test('request keys canonicalize objects and retain null, undefined and sparse-array distinctions', async () => {
        const {pipeline, calls} = await create({cache: true});
        const first             = {a: 1, nested: {x: 2, y: [3, 4]}};

        await pipeline.read(first);
        await pipeline.read({nested: {y: [3, 4], x: 2}, a: 1});
        expect(calls.connection).toBe(1);
        for (const value of [{a: null}, {a: undefined}, {}, {a: [null]}, {a: [undefined]}, {a: Array(1)}]) {
            await pipeline.read(value)
        }
        expect(calls.connection).toBe(7)
    });

    test('snapshots isolate the first caller and every cache-hit caller', async () => {
        const {pipeline, calls} = await create({cache: true});
        const first             = await pipeline.read();
        first[0].id = 500;
        first.push({id: 900});
        const second = await pipeline.read();
        expect(second).toEqual([{id: 1, shaped: true}]);
        second[0].shaped = false;
        expect(await pipeline.read()).toEqual([{id: 1, shaped: true}]);
        expect(calls.connection).toBe(1)
    });

    test('separate Pipelines do not share endpoint or shaping results', async () => {
        const left = await create({cache: true}), right = await create({cache: true});
        left.normalizer.normalize = async () => 'left endpoint';
        right.normalizer.normalize = async () => 'right endpoint';
        expect(await left.pipeline.read({page: 1})).toBe('left endpoint');
        expect(await right.pipeline.read({page: 1})).toBe('right endpoint');
        expect(await left.pipeline.read({page: 1})).toBe('left endpoint');
        expect([left.calls.connection, right.calls.connection]).toEqual([1, 1])
    });

    test('TTL expires from completion without a sliding extension on hits', async () => {
        const {pipeline, calls} = await create({cache: true, cacheTTL: 10});
        const original          = Date.now;
        let   now               = 100;
        Date.now = () => now;
        try {
            await pipeline.read();
            now = 109;
            await pipeline.read();
            expect(calls.connection).toBe(1);
            now = 110;
            await pipeline.read();
            expect(calls.connection).toBe(2)
        } finally {Date.now = original}
    });

    test('zero TTL retains an entry until explicit clear', async () => {
        const {pipeline, calls} = await create({cache: true});
        const original          = Date.now;
        let   now               = 100;
        Date.now = () => now;
        try {
            await pipeline.read();
            now = 1e12;
            await pipeline.read();
            expect(calls.connection).toBe(1);
            expect(await pipeline.clearCache()).toBe(1);
            await pipeline.read();
            expect(calls.connection).toBe(2)
        } finally {Date.now = original}
    });

    for (const cacheTTL of [-1, Infinity, NaN, '10']) {
        test(`invalid TTL ${cacheTTL} refuses construction`, async () => {
            await expect(create({cache: true, cacheTTL})).rejects.toThrow('cacheTTL')
        })
    }

    test('clear during a pending read prevents its old result from replacing a newer read', async () => {
        const {pipeline, connection} = await create({cache: true});
        let finish, reads = 0;
        connection.read = async () => ++reads === 1 ? new Promise(resolve => {finish = resolve}) : {data: [{id: 2}]};
        const first = pipeline.read({page: 1});
        await Promise.resolve();
        await pipeline.clearCache();
        expect(await pipeline.read({page: 1})).toEqual([{id: 2, shaped: true}]);
        finish({data: [{id: 1}]});
        expect(await first).toEqual([{id: 1, shaped: true}]);
        expect(await pipeline.read({page: 1})).toEqual([{id: 2, shaped: true}]);
        expect(reads).toBe(2)
    });

    test('a slower earlier read cannot replace the newer completed result', async () => {
        const {pipeline, connection} = await create({cache: true});
        let finish, reads = 0;
        connection.read = async () => ++reads === 1 ? new Promise(resolve => {finish = resolve}) : {data: [{id: 2}]};
        const first = pipeline.read({page: 1});
        expect(await pipeline.read({page: 1})).toEqual([{id: 2, shaped: true}]);
        finish({data: [{id: 1}]});
        await first;
        expect(await pipeline.read({page: 1})).toEqual([{id: 2, shaped: true}]);
        expect(reads).toBe(2)
    });

    test('stage replacement invalidates a completed read', async () => {
        const {pipeline, calls} = await create({cache: true});
        await pipeline.read();
        const normalizer = Neo.create(Normalizer);
        await normalizer.ready();
        normalizer.normalize = async () => 'new shape';
        pipeline.normalizer = normalizer;
        expect(await pipeline.read()).toBe('new shape');
        expect(calls.connection).toBe(2)
    });

    for (const operation of ['create', 'update', 'execute']) {
        test(`${operation} invalidates read snapshots`, async () => {
            const {pipeline, connection, calls} = await create({cache: true});
            connection[operation] = async () => ({data: [], success: true});
            await pipeline.read();
            operation === 'execute' ? await pipeline.execute('save') : await pipeline[operation]();
            expect(await pipeline.read()).toEqual([{id: 2, shaped: true}]);
            expect(calls.connection).toBe(2)
        })
    }

    test('pushes invalidate read snapshots without entering the cache', async () => {
        const {pipeline, calls} = await create({cache: true});
        const pushed            = [];
        pipeline.on('push', value => pushed.push(value));
        await pipeline.read();
        await pipeline.onConnectionPush({data: [{id: 10}]});
        await pipeline.onConnectionPush({data: [{id: 11}]});
        expect(pushed.map(value => value[0].id)).toEqual([10, 11]);
        expect(await pipeline.read()).toEqual([{id: 2, shaped: true}]);
        expect(calls.connection).toBe(2)
    });

    test('event-delivered parser data is not replaced by a cached terminal', async () => {
        const {pipeline, parser, calls} = await create({cache: true});
        let   delivered                 = 0;
        parser.read = async value => {parser.fire('data', value.data); return value.data};
        pipeline.on('data', () => delivered++);
        await pipeline.read();
        await pipeline.read();
        expect(delivered).toBe(2);
        expect(calls.connection).toBe(2)
    });

    test('streaming reads deliver every record population again', async () => {
        const {pipeline, connection, calls} = await create({cache: true});
        pipeline.normalizer = null;
        pipeline.parser = Neo.create(Stream);
        await pipeline.parser.ready();
        connection.read = async () => {
            calls.connection++;
            return {stream: new ReadableStream({start(controller) {
                controller.enqueue(new TextEncoder().encode('{"id":1}\n'));
                controller.close()
            }}), total: 9}
        };
        let deliveries = 0;
        pipeline.on('data', () => deliveries++);
        await pipeline.read();
        await pipeline.read();
        expect({deliveries, reads: calls.connection}).toEqual({deliveries: 2, reads: 2})
    });

    test('unsupported request data bypasses cache without invoking its accessors or toJSON', async () => {
        const {pipeline, calls} = await create({cache: true});
        const cyclic            = {}; cyclic.self = cyclic;
        const accessor          = Object.defineProperty({}, 'token', {enumerable: true, get() {throw new Error('must not read')}});
        const inputs            = [cyclic, accessor, {toJSON() {throw new Error('must not call')}}, {callback() {}}];
        for (const input of inputs) {
            await pipeline.read(input);
            await pipeline.read(input)
        }
        expect(calls.connection).toBe(8)
    });

    test('behavioral result instances keep their identity and remain uncached', async () => {
        const {pipeline, normalizer, calls} = await create({cache: true});
        class Result {value() {return 1}}
        normalizer.normalize = async () => new Result();
        expect(await pipeline.read()).toBeInstanceOf(Result);
        expect(await pipeline.read()).toBeInstanceOf(Result);
        expect(calls.connection).toBe(2)
    });

    test('failed reads are retried by the next call instead of being cached', async () => {
        const {pipeline, connection} = await create({cache: true});
        let   reads                  = 0;
        const error                  = new Error('read failed');
        connection.read = async () => {if (++reads === 1) throw error; return {data: [{id: reads}]}};
        await expect(pipeline.read()).rejects.toBe(error);
        expect(await pipeline.read()).toEqual([{id: 2, shaped: true}]);
        expect(await pipeline.read()).toEqual([{id: 2, shaped: true}]);
        expect(reads).toBe(2)
    });

    test('destruction clears snapshots and pending reads cannot publish afterward', async () => {
        const {pipeline, connection} = await create({cache: true});
        pipeline.set({parser: null, normalizer: null});
        let finish;
        connection.read = () => new Promise(resolve => {finish = resolve});
        const entries = pipeline.readCacheEntries, result = pipeline.read();
        pipeline.destroy();
        finish({data: [{id: 1}]});
        await result;
        expect(entries.size).toBe(0)
    });

    test('decorated Dates and non-enumerable request fields bypass structural caching', async () => {
        const {pipeline, calls} = await create({cache: true});
        for (const params of [
            {date: Object.assign(new Date(0), {zone: 'UTC'})},
            {date: Object.assign(new Date(0), {zone: 'local'})},
            Object.defineProperty({}, 'page', {value: 1, enumerable: false}),
            {page: 1}
        ]) await pipeline.read(params);
        expect(calls.connection).toBe(4)
    });

    test('Array subclasses and decorated intrinsic results retain their original data and behavior', async () => {
        const {pipeline, normalizer, calls} = await create({cache: true});
        class Rows extends Array {marker() {return 1}}
        for (const value of [
            new Rows({id: 1}),
            Object.assign(new Date(0), {zone: 'UTC'}),
            Object.assign(new ArrayBuffer(2), {label: 'bytes'})
        ]) {
            await pipeline.clearCache();
            normalizer.normalize = async () => value;
            expect(await pipeline.read()).toBe(value);
            expect(await pipeline.read()).toBe(value)
        }
        expect(calls.connection).toBe(6)
    });

    test('unsupported result inspection cannot turn a successful read into a failure', async () => {
        const {pipeline, normalizer, calls} = await create({cache: true});
        const value                         = new Proxy({}, {getOwnPropertyDescriptor() {throw new Error('unsupported result')}});
        normalizer.normalize = async () => value;
        expect(await pipeline.read()).toBe(value);
        expect(await pipeline.read()).toBe(value);
        expect(calls.connection).toBe(2)
    });

    test('profiling a cached read keeps the data carrier and reports no executed stages', async () => {
        const {pipeline, calls} = await create({cache: true, telemetry: true});
        const samples           = [];
        pipeline.on('telemetry', sample => samples.push(sample));
        expect(await pipeline.read()).toEqual([{id: 1, shaped: true}]);
        expect(await pipeline.read()).toEqual([{id: 1, shaped: true}]);
        expect(calls).toEqual({connection: 1, parser: 1, normalizer: 1});
        expect(samples).toHaveLength(2);
        expect(samples[1]).toMatchObject({connectionStart: null, parserStart: null, normalizerStart: null, status: 'fulfilled'});
        expect(samples[0].id).not.toBe(samples[1].id)
    });

    test('a changed connection URL cannot reuse another endpoint snapshot', async () => {
        const {pipeline, connection, calls} = await create({cache: true});
        connection.url = '/first';
        connection.read = async () => ({data: [{id: ++calls.connection, endpoint: connection.url}]});
        expect((await pipeline.read())[0].endpoint).toBe('/first');
        connection.url = '/second';
        expect((await pipeline.read())[0].endpoint).toBe('/second');
        expect(calls.connection).toBe(2)
    });

    test('ordinary Date data retains its intrinsic value and caller isolation', async () => {
        const {pipeline, normalizer, calls} = await create({cache: true});
        normalizer.normalize = async () => ({date: new Date(100)});
        const first = await pipeline.read({date: new Date(200)});
        first.date.setTime(999);
        const second = await pipeline.read({date: new Date(200)});
        expect(second.date).toBeInstanceOf(Date);
        expect(second.date.getTime()).toBe(100);
        expect(calls.connection).toBe(1)
    });

    test('null and structured refusal terminals remain uncached', async () => {
        const {pipeline, connection} = await create({cache: true});
        pipeline.set({parser: null, normalizer: null});
        let reads = 0;
        connection.read = async () => [null, {success: false}, {success: true}][Math.min(++reads - 1, 2)];
        expect(await pipeline.read()).toBeNull();
        expect(await pipeline.read()).toEqual({success: false});
        expect(await pipeline.read()).toEqual({success: true});
        expect(await pipeline.read()).toEqual({success: true});
        expect(reads).toBe(3)
    });

    test('Store.load reuses opted-in reads and explicit clear makes refresh fetch again', async () => {
        const {pipeline, calls} = await create({cache: true});
        const store             = Neo.create(Store, {pipeline, model: {module: Model, fields: [{name: 'id', type: 'Integer'}]}});
        try {
            await store.load();
            expect(store.getAt(0).id).toBe(1);
            await store.load();
            expect(store.getAt(0).id).toBe(1);
            await pipeline.clearCache();
            await store.load();
            expect(store.getAt(0).id).toBe(2);
            expect(calls.connection).toBe(2)
        } finally {store.destroy()}
    })
});
