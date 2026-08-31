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

/** @summary Unit-only facade that executes the real RemoteMethodAccess receiver boundary. */
class RmaReceiver extends Neo.core.Base {
    static config = {
        className: 'Test.Unit.Data.PipelineRemoteExecution.RmaReceiver',
        mixins   : [RemoteMethodAccess]
    }
}
RmaReceiver = Neo.setupClass(RmaReceiver);

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
