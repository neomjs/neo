import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'PipelineRemoteExecutionTest'
    }
});

import {test, expect}     from '@playwright/test';
import Neo                from '../../../../src/Neo.mjs';
import * as core          from '../../../../src/core/_export.mjs';
import Pipeline           from '../../../../src/data/Pipeline.mjs';
import Rpc                from '../../../../src/data/connection/Rpc.mjs';
import InstanceManager    from '../../../../src/manager/Instance.mjs';
import RemoteMethodAccess from '../../../../src/worker/mixin/RemoteMethodAccess.mjs';
import {execFileSync}     from 'node:child_process';

/** @summary Unit-only facade that executes the real RemoteMethodAccess receiver boundary. */
class RmaReceiver extends Neo.core.Base {
    static config = {
        className: 'Test.Unit.Data.PipelineRemoteExecution.RmaReceiver',
        mixins   : [RemoteMethodAccess]
    }
}
RmaReceiver = Neo.setupClass(RmaReceiver);

test('remote progressive loads retain streaming state and continuation through the App receiver', () => {
    const script = `
        import assert from 'node:assert/strict';
        import {setup} from './test/playwright/setup.mjs';
        import Neo from './src/Neo.mjs';
        import * as core from './src/core/_export.mjs';
        import Pipeline from './src/data/Pipeline.mjs';
        import Store from './src/data/Store.mjs';
        import Model from './src/data/Model.mjs';
        import Stream from './src/data/parser/Stream.mjs';
        import Connection from './src/data/connection/Base.mjs';
        import RemoteMethodAccess from './src/worker/mixin/RemoteMethodAccess.mjs';
        setup();
        delete Neo.worker.App;
        Neo.overwrites = {Neo: {worker: {App: {singleton: false}}}};
        const {default: App} = await import('./src/worker/App.mjs');
        class Receiver extends Neo.core.Base {
            static config = {className: 'Test.Unit.Data.PipelineRemoteStreaming.Receiver', mixins: [RemoteMethodAccess]};
        }
        Neo.setupClass(Receiver);
        const receiver = Neo.create(Receiver), requests = [], events = [], pending = new Map();
        receiver.resolve = (msg, data) => pending.get(msg.id).resolve(structuredClone(data));
        receiver.reject = (msg, error) => pending.get(msg.id).reject(error);
        Neo.workerId = 'app';
        Neo.config.unitTestMode = false;
        Neo.currentWorker = {
            isSharedWorker: false,
            promiseMessage(destination, opts, buffer) {
                assert.equal(destination, 'data');
                assert.equal(buffer, undefined);
                const id = 'stream-wire-' + requests.length;
                requests.push(structuredClone(opts));
                return new Promise((resolve, reject) => {
                    pending.set(id, {resolve, reject});
                    receiver.onRemoteMethod({...structuredClone(opts), id, origin: 'app'});
                });
            },
            sendMessage(destination, message) {
                assert.equal(destination, 'app');
                const msg = structuredClone(message);
                assert.equal(msg.action, 'pipelineEvent');
                events.push(msg);
                App.prototype.onPipelineEvent.call({}, msg);
            }
        };
        const source = Neo.create(Pipeline), target = Neo.create(Pipeline, {
            connection: {module: Connection},
            parser: {module: Stream, chunkSize: 1, initialChunkSize: 1}
        });
        await Promise.all([source.ready(), target.ready()]);
        target.appPipelineId = source.id;
        source.workerExecution = 'data';
        source.remoteId = target.id;
        source.maxRemoteRetries = 0;
        source.parser = {className: Stream.className, chunkSize: 1, initialChunkSize: 1};
        const store = Neo.create(Store, {
            pipeline: source,
            model: {module: Model, fields: [{name: 'id', type: 'Integer'}]}
        });
        await store.ready();
        assert.equal(target.store ?? null, null);
        assert.equal(target.parser.store ?? null, null);
        const snapshots = [], loads = [], encoder = new TextEncoder();
        let controller, delivered, started;
        const connected = new Promise(resolve => {started = resolve});
        target.connection.read = async () => ({stream: new ReadableStream({start(value) {
            controller = value;
            started();
        }})});
        source.on('data', () => queueMicrotask(() => delivered()));
        store.on('load', ({postChunkLoad, isMutation}) => loads.push({
            count: store.count, isMutation: !!isMutation, postChunkLoad, streaming: !!store.isStreaming
        }));
        const loading = store.load();
        await connected;
        for (const id of [1, 2]) {
            const chunk = new Promise(resolve => {delivered = resolve});
            controller.enqueue(encoder.encode(JSON.stringify({id}) + '\\n'));
            await chunk;
            snapshots.push({count: store.count, streaming: store.isStreaming});
        }
        controller.close();
        await loading;
        snapshots.push({count: store.count, streaming: store.isStreaming});
        assert.equal(requests.length, 1);
        assert.equal(requests[0].remoteId, target.id);
        assert.deepEqual(events.filter(event => event.event === 'data').map(event => event.data), [[{id: 1}], [{id: 2}]]);
        assert.ok(events.every(event => event.id === source.id));
        assert.deepEqual(store.items.map(item => item.id), [1, 2]);
        assert.equal(target.store ?? null, null);
        assert.equal(target.parser.store ?? null, null);
        source.remoteId = null;
        source.workerExecution = 'app';
        store.destroy(); target.destroy(); receiver.destroy();
        console.log(JSON.stringify({snapshots, loads}));
    `;
    const output = execFileSync(process.execPath, ['--input-type=module', '--eval', script], {
        cwd: new URL('../../../../', import.meta.url), encoding: 'utf8', timeout: 15000
    });
    const {snapshots, loads} = JSON.parse(output.trim().split('\n').at(-1));

    expect(snapshots).toEqual([
        {count: 1, streaming: true},
        {count: 2, streaming: true},
        {count: 2, streaming: false}
    ]);
    expect(loads).toContainEqual({count: 2, isMutation: true, postChunkLoad: true, streaming: true});
    expect(loads.at(-1).streaming).toBe(false);
});

test('profiling selects a known carrier through real RMA and App receivers without changing data or retries', () => {
    const script = `
        import assert from 'node:assert/strict';
        import {setup} from './test/playwright/setup.mjs';
        import Neo from './src/Neo.mjs';
        import * as core from './src/core/_export.mjs';
        import Pipeline from './src/data/Pipeline.mjs';
        import Connection from './src/data/connection/Base.mjs';
        import RemoteMethodAccess from './src/worker/mixin/RemoteMethodAccess.mjs';
        setup();
        delete Neo.worker.App;
        Neo.overwrites = {Neo: {worker: {App: {singleton: false}}}};
        const {default: App} = await import('./src/worker/App.mjs');
        class Receiver extends Neo.core.Base {
            static config = {className: 'Test.Unit.Data.PipelineTelemetry.RemoteReceiver', mixins: [RemoteMethodAccess]};
        }
        Neo.setupClass(Receiver);
        const receiver = Neo.create(Receiver), pending = new Map(), wire = [], metrics = [], pushes = [];
        receiver.resolve = (msg, data) => pending.get(msg.id).resolve(structuredClone(data));
        receiver.reject = (msg, error) => pending.get(msg.id).reject(error);
        Neo.workerId = 'app';
        Neo.config.unitTestMode = false;
        const source = Neo.create(Pipeline), target = Neo.create(Pipeline), connection = Neo.create(Connection);
        await Promise.all([source.ready(), target.ready(), connection.ready()]);
        target.connection = connection;
        target.appPipelineId = source.id;
        source.maxRemoteRetries = 1;
        source.on('telemetry', record => metrics.push(record));
        source.on('push', data => pushes.push(data));
        const result = {result: 'business result', telemetry: 'business metadata', data: [{id: 7}]};
        const calls = [];
        connection.read = async params => {calls.push(params); return result};
        connection.execute = async (method, params) => {calls.push({method, params}); return result};
        connection.create = connection.update = async params => {calls.push(params); return result};
        Neo.currentWorker = {
            isSharedWorker: false,
            promiseMessage(destination, opts, buffer) {
                assert.equal(destination, 'data');
                assert.equal(buffer, undefined);
                const id = 'wire-' + wire.length;
                wire.push(structuredClone(opts));
                return new Promise((resolve, reject) => {
                    pending.set(id, {resolve, reject});
                    receiver.onRemoteMethod({...structuredClone(opts), id, origin: 'app'});
                });
            },
            sendMessage(destination, message) {
                assert.equal(destination, 'app');
                const msg = structuredClone(message);
                if (msg.action === 'pipelineTelemetry') App.prototype.onPipelineTelemetry.call({}, msg);
                else if (msg.action === 'pipelinePush') App.prototype.onPipelinePush.call({}, msg);
                else assert.fail('Unexpected notification');
            }
        };
        const configurations = [];
        Neo.worker.Data = {
            async createInstance({config}) {configurations.push(config); return {success: true, id: target.id}}
        };
        source.workerExecution = 'data';
        await source.initRemoteExecution();
        const params = {telemetry: 'business parameter', limit: 7};
        assert.deepEqual(await source.read(params), result);
        assert.equal(metrics.length, 0);
        assert.deepEqual(wire.at(-1).data, params);

        source.telemetry = true;
        assert.deepEqual(await source.read(params), result);
        assert.deepEqual(wire.at(-1).data, {operation: 'read', params, method: 'read'});
        assert.equal(metrics.at(-1).pipelineId, source.id);
        assert.equal(metrics.at(-1).operation, 'read');
        assert.deepEqual(calls.at(-1), params);
        assert.deepEqual(await source.execute('search', params), result);
        assert.deepEqual(calls.at(-1), {method: 'search', params});
        assert.deepEqual(await source.create(params), result);
        assert.deepEqual(await source.update(params), result);
        assert.deepEqual(metrics.slice(-4).map(record => record.operation), ['read', 'execute', 'create', 'update']);

        const start = metrics.length;
        let attempts = 0;
        connection.read = async () => ++attempts === 1 ? null : result;
        assert.deepEqual(await source.read(params), result);
        assert.equal(attempts, 2);
        assert.equal(metrics.length - start, 2);
        assert.notEqual(metrics.at(-1).id, metrics.at(-2).id);
        assert.equal(configurations.at(-1).telemetry, true);

        const failureStart = metrics.length;
        attempts = 0;
        connection.read = async () => {if (++attempts === 1) throw new Error('private failure'); return result};
        assert.deepEqual(await source.read(params), result);
        assert.deepEqual(metrics.slice(failureStart).map(record => record.status), ['rejected', 'fulfilled']);
        assert.equal(JSON.stringify(metrics).includes('private failure'), false);

        for (const enabled of [true, false]) {
            let release, started;
            const inFlight = new Promise(resolve => {started = resolve});
            connection.read = () => {started(); return new Promise(resolve => {release = resolve})};
            source.telemetry = enabled;
            const read = source.read(params);
            await inFlight;
            source.telemetry = !enabled;
            release(result);
            assert.deepEqual(await read, result);
        }

        const beforePush = metrics.length;
        target.telemetry = true;
        await target.onConnectionPush({id: 8, status: 'updated'});
        assert.equal(pushes.length, 1);
        assert.equal(pushes[0].id, 8);
        assert.equal(pushes[0].result, undefined);
        assert.equal(metrics.length, beforePush + 1);
        assert.equal(metrics.at(-1).operation, 'push');
        assert.equal(new Set(metrics.map(record => record.id)).size, metrics.length);
        source.remoteId = null;
        source.workerExecution = 'app';
        source.destroy(); target.destroy(); receiver.destroy();
        console.log(JSON.stringify({metrics: metrics.length, pushes: pushes.length, wire: wire.length}));
    `;
    const output = execFileSync(process.execPath, ['--input-type=module', '--eval', script], {
        cwd: new URL('../../../../', import.meta.url), encoding: 'utf8', timeout: 15000
    });
    expect(JSON.parse(output.trim().split('\n').at(-1))).toMatchObject({pushes: 1});
});

/**
 * @summary Guards the generic Pipeline method/params payload across instance RMA.
 *
 * Instance proxies accept one business-data argument plus an optional transfer/options argument.
 * A multi-argument remote call therefore travels as one Array payload, which `onRemoteMethod()`
 * spreads at the destination. Passing `method` and `params` as two proxy arguments silently puts
 * `params` into `postMessage` options and makes the Data-side Pipeline default it to `{}`.
 */
test.describe('Neo.data.Pipeline — remote generic execution', () => {
    test('preserves method and params through Base proxy, RMA receiver, and Rpc connection', async () => {
        const
            previousCurrentWorker = Neo.currentWorker,
            previousUnitTestMode  = Neo.config.unitTestMode,
            previousWorkerId      = Neo.workerId,
            rpcNamespace          = Neo.ns('Neo.manager.rpc', true),
            previousRpcMessage    = rpcNamespace.Message,
            backendMessages       = [],
            wireMessages          = [],
            params                = {limit: 7, query: 'needle'};

        let receiver, sourcePipeline, targetPipeline;

        try {
            receiver = Neo.create(RmaReceiver);

            receiver.resolve = (msg, data) => receiver.pendingResolve(data);
            receiver.reject  = (msg, error) => receiver.pendingReject(error);

            Neo.config.unitTestMode = false;
            Neo.workerId            = 'app';
            Neo.currentWorker       = {
                isSharedWorker: false,
                promiseMessage(destination, opts, buffer) {
                    wireMessages.push({buffer, destination, opts});

                    return new Promise((resolve, reject) => {
                        receiver.pendingResolve = resolve;
                        receiver.pendingReject  = reject;
                        receiver.onRemoteMethod({...opts, id: `wire-${wireMessages.length}`, origin: 'app'})
                    })
                }
            };

            targetPipeline = Neo.create(Pipeline);
            sourcePipeline = Neo.create(Pipeline);

            await Promise.all([
                targetPipeline.ready(),
                sourcePipeline.ready()
            ]);

            rpcNamespace.Message = {
                onMessage: async message => {
                    backendMessages.push(message);
                    return {ok: true}
                }
            };

            // Keep the real RMA receiver and Rpc connection terminal while avoiding a backend.
            targetPipeline.execute = (method, receivedParams) => Rpc.prototype.execute.call({
                api      : 'Probe.Backend',
                className: 'Test.Unit.Data.PipelineRemoteExecution.RpcTerminal'
            }, method, receivedParams);

            sourcePipeline.maxRemoteRetries = 0;
            sourcePipeline.remoteId         = targetPipeline.id;
            sourcePipeline.workerExecution  = 'data';

            await expect(sourcePipeline.execute('search', params)).resolves.toEqual({ok: true});

            expect(wireMessages).toHaveLength(1);
            expect(wireMessages[0].buffer).toBeUndefined();
            expect(wireMessages[0].opts.data).toEqual(['search', params]);
            expect(wireMessages[0].opts.remoteId).toBe(targetPipeline.id);

            expect(backendMessages).toEqual([{
                method : 'search',
                params : [params],
                service: 'Backend'
            }])
        } finally {
            if (sourcePipeline) {
                sourcePipeline.remoteId        = null;
                sourcePipeline.workerExecution = 'app';
                sourcePipeline.destroy()
            }

            targetPipeline?.destroy();
            receiver      ?.destroy();

            if (previousRpcMessage === undefined) {
                delete rpcNamespace.Message
            } else {
                rpcNamespace.Message = previousRpcMessage
            }

            Neo.currentWorker       = previousCurrentWorker;
            Neo.config.unitTestMode = previousUnitTestMode;
            Neo.workerId            = previousWorkerId
        }
    });

    test('keeps create, read, and update on their existing one-payload remote calls', async () => {
        const pipeline = Neo.create(Pipeline),
              calls    = [],
              params   = {id: 7};

        pipeline.maxRemoteRetries = 0;
        pipeline.remoteId         = 'data-pipeline-existing-operations';
        pipeline.remote           = {
            data: Object.fromEntries(['create', 'read', 'update'].map(operation => [operation, async (...args) => {
                calls.push({args, operation});
                return {operation}
            }]))
        };
        pipeline.workerExecution = 'data';

        try {
            await pipeline.create(params);
            await pipeline.read(params);
            await pipeline.update(params);

            expect(calls).toEqual([
                {args: [params], operation: 'create'},
                {args: [params], operation: 'read'},
                {args: [params], operation: 'update'}
            ])
        } finally {
            pipeline.remoteId        = null;
            pipeline.workerExecution = 'app';
            pipeline.destroy()
        }
    })
});
