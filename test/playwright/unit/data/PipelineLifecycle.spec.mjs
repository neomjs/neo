import {setup} from '../../setup.mjs';

setup({appConfig: {name: 'PipelineLifecycleTest'}});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Connection     from '../../../../src/data/connection/Base.mjs';
import Normalizer     from '../../../../src/data/normalizer/Base.mjs';
import Parser         from '../../../../src/data/parser/Base.mjs';
import Pipeline       from '../../../../src/data/Pipeline.mjs';
import Instance       from '../../../../src/manager/Instance.mjs';

/** @summary Holds a lifecycle boundary until the test explicitly releases it. */
function deferred() {
    let resolve;
    const promise = new Promise(done => {resolve = done});
    return {promise, resolve}
}

test.describe('Pipeline counterpart disposal', () => {
    let currentWorker, dataApi, pipelines, messages;

    test.beforeEach(() => {
        currentWorker = Neo.currentWorker;
        dataApi = Neo.worker.Data;
        pipelines = [];
        messages = [];
        Neo.worker.Data = {};
        Neo.currentWorker = {...currentWorker, sendMessage: (destination, message) => {
            messages.push({destination, message: structuredClone(message)})
        }}
    });

    test.afterEach(() => {
        for (const pipeline of pipelines) {
            if (!pipeline.isDestroyed) {
                pipeline.workerExecution = 'app';
                pipeline.destroy()
            }
        }
        Neo.currentWorker = currentWorker;
        Neo.worker.Data = dataApi
    });

    /** @summary Creates real owned stages without starting remote construction. */
    async function makePipeline() {
        const pipeline = Neo.create(Pipeline, {
            connection: {module: Connection},
            normalizer: {module: Normalizer},
            parser    : {module: Parser}
        });
        pipelines.push(pipeline);
        await Promise.all([pipeline.ready(), pipeline.connection.ready(), pipeline.parser.ready(), pipeline.normalizer.ready()]);
        return pipeline
    }

    test('connected disposal uses the worker sender once and completes owned stage cleanup', async () => {
        const pipeline = await makePipeline(), id = pipeline.id;
        const stages   = [pipeline.connection, pipeline.parser, pipeline.normalizer];
        pipeline.workerExecution = 'data';
        pipeline.remoteId = 'distinct-data-counterpart';
        expect(Neo.worker.Data.sendMessage).toBeUndefined();
        expect(Instance.get(id)).toBe(pipeline);

        pipeline.destroy();
        pipeline.destroy();

        expect(messages).toEqual([{destination: 'data', message: {action: 'destroyInstance', id: 'distinct-data-counterpart'}}]);
        expect(pipeline.isDestroyed).toBe(true);
        expect(Instance.get(id)).toBeNull();
        expect(stages.map(stage => stage.isDestroyed)).toEqual([true, true, true])
    });

    for (const workerExecution of ['app', 'data']) {
        test(`${workerExecution} disposal without a counterpart stays local and idempotent`, async () => {
            const pipeline = await makePipeline();
            const stages   = [pipeline.connection, pipeline.parser, pipeline.normalizer];
            pipeline.workerExecution = workerExecution;

            pipeline.destroy();
            pipeline.destroy();

            expect(messages).toEqual([]);
            expect(pipeline.isDestroyed).toBe(true);
            expect(stages.map(stage => stage.isDestroyed)).toEqual([true, true, true])
        })
    }

    test('destruction during preload prevents counterpart creation and late state writes', async () => {
        const pipeline = await makePipeline(), preload = deferred(), creates = [];
        Neo.worker.Data = {
            loadDataModule: () => preload.promise,
            createInstance: async config => {creates.push(config); return {success: true, id: 'unwanted-counterpart'}}
        };
        pipeline.workerExecution = 'data';
        const flight = pipeline.initRemoteExecution();
        pipeline.destroy();
        preload.resolve();
        await flight;

        expect(creates).toEqual([]);
        expect(messages).toEqual([]);
        expect(Object.hasOwn(pipeline, 'remoteId')).toBe(false);
        expect(Object.hasOwn(pipeline, 'isRemoteConnecting')).toBe(false)
    });

    test('a creation reply arriving after destruction disposes its returned ID without publication', async () => {
        const pipeline = Neo.create(Pipeline), creation = deferred(), connected = [];
        pipelines.push(pipeline);
        await pipeline.ready();
        pipeline.workerExecution = 'data';
        pipeline.on('remoteConnected', id => connected.push(id));
        Neo.worker.Data = {createInstance: () => creation.promise};
        const flight = pipeline.initRemoteExecution();
        pipeline.destroy();
        creation.resolve({success: true, id: 'late-data-counterpart'});
        await flight;

        expect(messages).toEqual([{destination: 'data', message: {action: 'destroyInstance', id: 'late-data-counterpart'}}]);
        expect(connected).toEqual([]);
        expect(Object.hasOwn(pipeline, 'remoteId')).toBe(false);
        expect(Object.hasOwn(pipeline, 'isRemoteConnecting')).toBe(false);
        await pipeline.initRemoteExecution();
        expect(messages).toHaveLength(1)
    });
});
