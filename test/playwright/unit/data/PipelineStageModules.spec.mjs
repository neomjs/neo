import {setup} from '../../setup.mjs';

setup({appConfig: {name: 'PipelineStageModulesTest'}});

import {expect, test} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Pipeline       from '../../../../src/data/Pipeline.mjs';
import Chain          from '../../../../src/data/interceptor/Chain.mjs';

const stages = ['connection', 'parser', 'normalizer'];

/** @summary Describes a class without importing its behavior into the proxy realm. @param {String} stage */
function descriptor(stage) {
    return {className: `Test.Unit.Data.PipelineStageModules.${stage}`,
        modulePath: `examples/data/fixtures/pipeline-stage-modules/${stage}.mjs`, token: stage}
}

test.describe('Pipeline stage modules at the Data-worker boundary', () => {
    let previousData, previousError, pipelines, calls, configurations, dispatches;

    test.beforeEach(() => {
        previousData = Neo.worker.Data;
        previousError = console.error;
        pipelines = [];
        calls = [];
        configurations = [];
        dispatches = 0;
        console.error = () => {};
        Neo.worker.Data = {
            loadDataModule: async config => {calls.push({loader: 'data', ...config}); return {success: true}},
            loadModule    : async config => {calls.push({loader: 'module', ...config}); return {success: true}},
            createInstance: async ({config}) => {configurations.push(structuredClone(config)); return {success: true, id: 'stage-counterpart'}}
        }
    });

    test.afterEach(() => {
        for (const pipeline of pipelines) {
            pipeline.workerExecution = 'app';
            pipeline.destroy()
        }
        Neo.worker.Data = previousData;
        console.error = previousError
    });

    /** @summary Defers the eager setup until all isolated loader facades are in place. @param {Object} configs */
    async function makePipeline(configs) {
        const pipeline = Neo.create(Pipeline);
        pipelines.push(pipeline);
        await pipeline.ready();
        pipeline.workerExecution = 'data';
        for (const [stage, config] of Object.entries(configs)) pipeline[stage] = config;
        pipeline.remote = {data: {read: async () => {dispatches++; return []}}};
        return pipeline
    }

    test('all three custom stages use the scoped loader and consume modulePath before construction', async () => {
        const source   = Object.fromEntries(stages.map(stage => [stage, descriptor(stage)])),
              snapshot = structuredClone(source), pipeline = await makePipeline(source);
        await pipeline.initRemoteExecution();

        expect(pipeline.remoteInitializationError).toBeNull();
        expect(calls).toEqual(expect.arrayContaining(stages.map(stage => ({loader: 'module',
            path: source[stage].modulePath, className: source[stage].className}))));
        expect(calls).toHaveLength(3);
        expect(configurations).toHaveLength(1);
        for (const stage of stages) {
            expect(configurations[0][stage]).toEqual({className: source[stage].className, token: stage});
            expect(pipeline[stage]).toEqual(snapshot[stage])
        }
        expect(source).toEqual(snapshot)
    });

    test('built-in stages retain the folder-scoped loader without modulePath', async () => {
        const config   = Object.fromEntries(stages.map(stage => [stage, {className: `Neo.data.${stage}.Base`}])),
              pipeline = await makePipeline(config);
        await pipeline.initRemoteExecution();

        expect(calls).toHaveLength(3);
        expect(calls.every(call => call.loader === 'data')).toBe(true);
        expect(configurations[0]).toMatchObject(config);
        expect(pipeline.remoteId).toBe('stage-counterpart')
    });

    for (const stage of stages) {
        test(`${stage}: missing modulePath rejects a custom class before any worker call`, async () => {
            const {modulePath, ...custom} = descriptor(stage), pipeline = await makePipeline({
                connection: {className: 'Neo.data.connection.Fetch'}, [stage]: custom
            });
            await expect(pipeline.read()).rejects.toThrow(new RegExp(`${custom.className}.*modulePath`));
            expect(calls).toEqual([]);
            expect(configurations).toEqual([]);
            expect(dispatches).toBe(0)
        });

        for (const modulePath of [
            'test/Stage.mjs', 'apps/../Stage.mjs', 'apps/Stage.mjs?x=1', 'apps/Stage\u0000.mjs',
            '/apps/Stage.mjs', 'apps//Stage.mjs', 'apps/./Stage.mjs', 'apps/Stage.mjs#x',
            'apps/%2e%2e/Stage.mjs', 'apps\\Stage.mjs', 'apps/Stage.js', null, 17
        ]) {
            test(`${stage}: refuses ${JSON.stringify(modulePath)} before loading anything`, async () => {
                const custom = {...descriptor(stage), modulePath}, pipeline = await makePipeline({
                    connection: {className: 'Neo.data.connection.Fetch'}, [stage]: custom
                });
                expect(() => Chain.validateDescriptors([custom])).toThrow('modulePath');
                await expect(pipeline.read()).rejects.toThrow('modulePath');
                expect(calls).toEqual([]);
                expect(configurations).toEqual([]);
                expect(dispatches).toBe(0)
            })
        }

        for (const loader of ['loadModule', 'loadDataModule']) {
            test(`${stage}: ${loader} refusal reports class and reason without construction or read`, async () => {
                const config   = loader === 'loadModule' ? descriptor(stage) : {className: `Neo.data.${stage}.Missing`},
                      pipeline = await makePipeline({[stage]: config});
                let attempts = 0;
                Neo.worker.Data[loader] = async () => {attempts++; return {success: false, error: 'module default export mismatch'}};
                await expect(pipeline.read()).rejects.toThrow(new RegExp(`${config.className}.*module default export mismatch`));
                expect(pipeline.remoteInitializationError.message).toContain(config.className);
                expect(attempts, 'configuration failures do not enter the transport retry loop').toBe(1);
                expect(configurations).toEqual([]);
                expect(dispatches).toBe(0)
            })
        }
    }

    test('a rejected module-loader call retains the stage identity and transport reason', async () => {
        const config = descriptor('parser'), pipeline = await makePipeline({parser: config});
        Neo.worker.Data.loadModule = async () => {throw new Error('worker disconnected')};
        await expect(pipeline.read()).rejects.toThrow(`${config.className}: worker disconnected`);
        expect(configurations).toEqual([]);
        expect(dispatches).toBe(0)
    });

    for (const modulePath of ['apps/demo/Stage.mjs', 'examples/data/Stage.mjs', 'docs/app/data/Stage.mjs', 'src/data/parser/Stream.mjs']) {
        test(`stage and interceptor share the admitted root: ${modulePath}`, async () => {
            const config = {...descriptor('parser'), modulePath}, pipeline = await makePipeline({parser: config});
            expect(Chain.validateDescriptors([config])[0].modulePath).toBe(modulePath);
            await pipeline.initRemoteExecution();
            expect(calls).toEqual([{loader: 'module', path: modulePath, className: config.className}]);
            expect(configurations[0].parser).not.toHaveProperty('modulePath')
        })
    }
});
