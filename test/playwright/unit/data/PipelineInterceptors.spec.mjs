import {setup} from '../../setup.mjs';

setup({appConfig: {name: 'PipelineInterceptorsTest'}});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Connection     from '../../../../src/data/connection/Base.mjs';
import Interceptor    from '../../../../src/data/interceptor/Base.mjs';
import Normalizer     from '../../../../src/data/normalizer/Base.mjs';
import Parser         from '../../../../src/data/parser/Base.mjs';
import Pipeline       from '../../../../src/data/Pipeline.mjs';

let controls = new Map(), events = [], handlers = [], retired = [];

/** @summary Class behavior is controlled here; no callback enters an interceptor descriptor. */
class Controlled extends Interceptor {
    static config = {
        className: 'Test.Unit.Data.PipelineInterceptors.Controlled',
        label    : ''
    }

    /** @summary Records the real owned instance. @param {Object} config */
    construct(config) {
        super.construct(config);
        handlers.push(this)
    }

    /** @summary Records and optionally delays request preparation. @param {*} value @param {Object} context */
    async request(value, context) {
        events.push(`${this.label}.request`);
        return controls.get(this.label)?.request ? controls.get(this.label).request(value, context) : value
    }

    /** @summary Records and optionally transforms a successful response. @param {*} value @param {Object} context */
    async response(value, context) {
        events.push(`${this.label}.response`);
        return controls.get(this.label)?.response ? controls.get(this.label).response(value, context) : value
    }

    /** @summary Records the exact error/recovery state seen by this handler. @param {*} error @param {Object} context */
    async responseError(error, context) {
        events.push(`${this.label}.responseError`);
        if (controls.get(this.label)?.responseError) return controls.get(this.label).responseError(error, context);
        throw error
    }

    /** @summary Records and optionally delays parsed output. @param {*} value @param {Object} context */
    async postParse(value, context) {
        events.push(`${this.label}.postParse`);
        return controls.get(this.label)?.postParse ? controls.get(this.label).postParse(value, context) : value
    }

    /** @summary Makes snapshot retirement independently observable. */
    destroy() {
        const destroy = controls.get(this.label)?.destroy;
        retired.push({id: this.id, label: this.label});
        super.destroy();
        destroy?.()
    }
}
Controlled = Neo.setupClass(Controlled);

/** @summary Refuses the public readiness contract during replacement. */
class Refused extends Controlled {
    static config = {className: 'Test.Unit.Data.PipelineInterceptors.Refused'}

    /** @summary A rejecting ready() is distinguishable from an unwired Core Base initAsync rejection. */
    ready() {
        return Promise.reject(new Error('replacement refused'))
    }
}
Refused = Neo.setupClass(Refused);

test.describe('Pipeline awaited interceptor composition', () => {
    let pipelines, pending, gates;

    /** @summary Creates an explicitly released boundary, including cleanup after a failed assertion. */
    const deferred = () => {
        let resolve;
        const promise = new Promise(done => resolve = done), gate = {promise, resolve};
        gates.push(gate);
        return gate
    };

    /** @summary Retains pending operations for deterministic fixture teardown. @param {Promise} promise */
    const track = promise => {
        pending.push(promise);
        promise.catch(() => {});
        return promise
    };

    /** @summary Makes one descriptor without embedding any behavior in its options. @param {String} label */
    const descriptor = label => ({module: Controlled, label});

    /** @summary Restores the no-policy realm state after exercising public global replacement. */
    async function clearGlobals() {
        await Pipeline.setGlobalInterceptors([])
    }

    test.beforeEach(async () => {
        await clearGlobals();
        controls = new Map();
        events = [];
        handlers = [];
        retired = [];
        pipelines = [];
        pending = [];
        gates = []
    });

    test.afterEach(async () => {
        pipelines.forEach(pipeline => pipeline.destroy());
        gates.forEach(gate => gate.resolve());
        await Promise.allSettled(pending);
        await clearGlobals()
    });

    /** @summary Creates a real executing Pipeline and counts its transport attempts. @param {Object} config */
    async function create(config = {}) {
        const pipeline = Neo.create(Pipeline, {...config, connection: {module: Connection, url: '/same-resource'}}),
              calls    = [];
        pipelines.push(pipeline);
        await Promise.all([pipeline.ready(), pipeline.connection.ready()]);
        pipeline.connection.read = async params => {
            calls.push(structuredClone(params));
            events.push('transport');
            return {serial: calls.length}
        };
        return {pipeline, calls, connection: pipeline.connection}
    }

    test('global then local hooks await every stage and carry the effective request into parsing', async () => {
        const requestEntered    = deferred(), requestRelease = deferred(),
              responseEntered   = deferred(), responseRelease = deferred(),
              parsedEntered     = deferred(), parsedRelease = deferred(),
              {pipeline, calls} = await create(), contexts = [];
        controls.set('global', {
            request: async (params, context) => {
                contexts.push(context); requestEntered.resolve();
                await requestRelease.promise;
                return {...params, auth: 'prepared'}
            },
            response: async (value, context) => {
                contexts.push(context); responseEntered.resolve();
                await responseRelease.promise;
                return {...value, response: true}
            },
            postParse: async (value, context) => {
                contexts.push(context); parsedEntered.resolve();
                await parsedRelease.promise;
                return {...value, global: true}
            }
        });
        controls.set('local', {
            request  : params => ({...params, local: true}),
            response : value => ({...value, localResponse: true}),
            postParse: value => ({...value, local: true})
        });
        pipeline.parser = Neo.create(Parser);
        pipeline.normalizer = Neo.create(Normalizer);
        await Promise.all([pipeline.parser.ready(), pipeline.normalizer.ready()]);
        pipeline.parser.read = async value => {
            events.push('parser');
            expect(value).toEqual({serial: 1, response: true, localResponse: true});
            return {parsed: true}
        };
        pipeline.normalizer.normalize = value => {events.push('normalizer'); return {...value, normalized: true}};
        await Pipeline.setGlobalInterceptors([descriptor('global')]);
        await pipeline.setInterceptors([descriptor('local')]);

        const result = track(pipeline.read({page: 1}));
        await requestEntered.promise;
        expect(events).toEqual(['global.request']);
        expect(calls).toEqual([]);
        requestRelease.resolve();
        await responseEntered.promise;
        expect(calls).toEqual([{page: 1, auth: 'prepared', local: true}]);
        expect(events).toEqual(['global.request', 'local.request', 'transport', 'global.response']);
        responseRelease.resolve();
        await parsedEntered.promise;
        expect(events.slice(-3)).toEqual(['local.response', 'parser', 'global.postParse']);
        parsedRelease.resolve();

        expect(await result).toEqual({parsed: true, global: true, local: true, normalized: true});
        expect(events.slice(-2)).toEqual(['local.postParse', 'normalizer']);
        expect(contexts.every(context => context.pipeline === pipeline && context.operation === 'read' && context.method === 'read')).toBe(true);
        expect(contexts.slice(1).map(context => context.params)).toEqual([calls[0], calls[0]])
    });

    test('undefined keeps a rejection, throwing replaces it, recovery resumes successful response hooks', async () => {
        const original               = {status: 401}, replacement = new Error('replacement error'),
              recoveryEntered        = deferred(), recoveryRelease = deferred(),
              {pipeline, connection} = await create();
        let attempts = 0;
        connection.read = async () => {attempts++; throw original};
        controls.set('keep', {responseError: error => {expect(error).toBe(original); return undefined}});
        controls.set('throw', {responseError: error => {expect(error).toBe(original); throw replacement}});
        controls.set('recover', {responseError: async error => {
            expect(error).toBe(replacement); recoveryEntered.resolve();
            await recoveryRelease.promise;
            return {recovered: true}
        }});
        controls.set('success', {response: value => ({...value, successfulTail: true})});
        await Pipeline.setGlobalInterceptors([descriptor('keep'), descriptor('throw')]);
        await pipeline.setInterceptors([descriptor('recover'), descriptor('success')]);
        const result = track(pipeline.read());
        await recoveryEntered.promise;
        expect(events.filter(event => /response/i.test(event))).toEqual(['keep.responseError', 'throw.responseError', 'recover.responseError']);
        recoveryRelease.resolve();
        expect(await result).toEqual({recovered: true, successfulTail: true});
        expect(events).toContain('success.response');
        expect(events).not.toContain('success.responseError');
        expect(attempts).toBe(1)
    });

    test('an unrecovered responseError undefined preserves the original rejection', async () => {
        const failure = {status: 401, body: 'refused'}, {pipeline, connection} = await create();
        connection.read = async () => {throw failure};
        controls.set('keep', {responseError: () => undefined});
        await pipeline.setInterceptors([descriptor('keep')]);
        await expect(track(pipeline.read())).rejects.toBe(failure)
    });

    for (const heldStage of ['request', 'postParse']) {
        test(`old global ${heldStage} cannot hit or overwrite the newer policy cache`, async () => {
            const entered = deferred(), release = deferred(), {pipeline, calls} = await create({cache: true});
            controls.set('old', {
                request: async value => {
                    if (heldStage === 'request') {entered.resolve(); await release.promise}
                    return value
                },
                postParse: async value => {
                    if (heldStage === 'postParse') {entered.resolve(); await release.promise}
                    return {...value, policy: 'old'}
                }
            });
            controls.set('new', {postParse: value => ({...value, policy: 'new'})});
            await Pipeline.setGlobalInterceptors([descriptor('old')]);
            const oldHandler = handlers.find(handler => handler.label === 'old'),
                  oldRead    = track(pipeline.read({key: 'same'}));
            await entered.promise;
            await Pipeline.setGlobalInterceptors([descriptor('new')]);
            expect(oldHandler.isDestroyed).toBeFalsy();
            const current = await pipeline.read({key: 'same'});
            expect(current.policy).toBe('new');
            expect(await pipeline.read({key: 'same'})).toEqual(current);
            expect(calls).toHaveLength(heldStage === 'request' ? 1 : 2);
            release.resolve();
            expect((await oldRead).policy).toBe('old');
            expect(oldHandler.isDestroyed).toBe(true);
            expect(retired.filter(handler => handler.id === oldHandler.id)).toHaveLength(1);
            expect(await pipeline.read({key: 'same'})).toEqual(current);
            expect(calls).toHaveLength(2)
        })
    }

    test('local replacement failure preserves the admitted chain and its cache; success retires it once', async () => {
        const {pipeline, calls} = await create({cache: true});
        controls.set('old', {postParse: value => ({...value, policy: 'old'})});
        controls.set('new', {postParse: value => ({...value, policy: 'new'})});
        await pipeline.setInterceptors([descriptor('old')]);
        const oldHandler = handlers.find(handler => handler.label === 'old'), first = await pipeline.read();
        await expect(pipeline.setInterceptors([{module: Refused, label: 'refused'}])).rejects.toThrow('replacement refused');
        expect(oldHandler.isDestroyed).toBeFalsy();
        expect(await pipeline.read()).toEqual(first);
        expect(calls).toHaveLength(1);
        expect(retired.filter(handler => handler.label === 'refused')).toHaveLength(1);

        await pipeline.setInterceptors([descriptor('new')]);
        expect((await pipeline.read()).policy).toBe('new');
        expect(calls).toHaveLength(2);
        expect(retired.filter(handler => handler.id === oldHandler.id)).toHaveLength(1);
        await pipeline.setInterceptors([]);
        expect(await pipeline.read()).toEqual({serial: 3});
        expect(retired.filter(handler => handler.label === 'new')).toHaveLength(1)
    });

    test('global replacement reaches an existing Pipeline and retires unused handlers without a read', async () => {
        const {pipeline} = await create();
        for (const label of ['first', 'second']) {
            controls.set(label, {postParse: value => ({...value, policy: label})});
            await Pipeline.setGlobalInterceptors([descriptor(label)])
        }
        expect(retired.map(handler => handler.label)).toEqual(['first']);
        expect((await pipeline.read()).policy).toBe('second');
        await Pipeline.setGlobalInterceptors([]);
        expect(retired.map(handler => handler.label)).toEqual(['first', 'second']);
        expect(await pipeline.read()).toEqual({serial: 2})
    });

    for (const scope of ['global', 'local']) {
        for (const inFlight of [false, true]) {
            test(`${scope}: teardown failure preserves replacement and ${inFlight ? 'leased' : 'subsequent'} reads`, async () => {
                const {pipeline} = await create(), entered = deferred(), release = deferred(),
                      replace    = definitions => scope === 'global'
                          ? Pipeline.setGlobalInterceptors(definitions) : pipeline.setInterceptors(definitions);
                controls.set('old', {
                    destroy: () => {throw new Error('teardown refused')},
                    request: async value => {
                        if (inFlight) {entered.resolve(); await release.promise}
                        return value
                    },
                    postParse: value => ({...value, policy: 'old'})
                });
                controls.set('new', {postParse: value => ({...value, policy: 'new'})});
                await replace([descriptor('old'), descriptor('tail')]);
                const oldRead = inFlight ? track(pipeline.read()) : null;
                if (inFlight) await entered.promise;

                await expect(replace([descriptor('new')])).resolves.toBe(1);
                expect((await pipeline.read()).policy).toBe('new');
                if (inFlight) {
                    expect(retired).toEqual([]);
                    release.resolve();
                    expect((await oldRead).policy).toBe('old')
                }
                expect(retired.map(handler => handler.label)).toEqual(['old', 'tail']);
                expect(handlers.find(handler => handler.label === 'new').isDestroyed).toBeFalsy();
                expect((await pipeline.read()).policy).toBe('new')
            })
        }

        test(`${scope}: clearing invalidates policy-shaped cached results`, async () => {
            const {pipeline, calls} = await create({cache: true}),
                  replace           = definitions => scope === 'global'
                      ? Pipeline.setGlobalInterceptors(definitions) : pipeline.setInterceptors(definitions);
            controls.set('shape', {postParse: value => ({...value, policy: 'shaped'})});
            await replace([descriptor('shape')]);
            expect(await pipeline.read()).toEqual({serial: 1, policy: 'shaped'});
            await replace([]);
            expect(await pipeline.read()).toEqual({serial: 2});
            expect(await pipeline.read()).toEqual({serial: 2});
            expect(calls).toHaveLength(2)
        });

        test(`${scope}: clearing restores the never-configured destruction path`, async () => {
            const {pipeline: never} = await create(), {pipeline: cleared} = await create();
            const destroyDuringRead = async pipeline => {
                const entered = deferred(), release = deferred();
                pipeline.connection.read = async () => {entered.resolve(); await release.promise; return {ok: true}};
                const read = track(pipeline.read()).then(value => ({value}), error => ({error}));
                await entered.promise;
                pipeline.destroy();
                release.resolve();
                return read
            };
            const expected = await destroyDuringRead(never),
                  replace  = definitions => scope === 'global'
                      ? Pipeline.setGlobalInterceptors(definitions) : cleared.setInterceptors(definitions);
            await replace([descriptor('cleared')]);
            await replace([]);
            const chain  = scope === 'global' ? Pipeline.globalInterceptorChain : cleared.interceptorChain,
                  config = cleared.interceptors;
            expect(await destroyDuringRead(cleared)).toEqual(expected);
            expect(chain).toBeNull();
            expect(config).toBeNull()
        })
    }

    for (const [label, makeFailure, message] of [
        ['callable property', () => ({message: 'hook refused', callback() {}}), 'hook refused'],
        ['throwing accessor', () => Object.defineProperty({}, 'message', {
            enumerable: true, get() {throw new Error('accessor refused')}
        }), 'Pipeline interception failed'],
        ['symbol', () => Symbol('refused'), 'Pipeline interception failed'],
        ['revoked proxy', () => {const proxy = Proxy.revocable({}, {}); proxy.revoke(); return proxy.proxy},
            'Pipeline interception failed'],
        ['uncloneable cause', () => new Error('hook refused', {cause: {callback() {}}}), 'hook refused']
    ]) {
        test(`remote rejection with ${label} produces a cloneable carrier`, async () => {
            const {pipeline} = await create(), failure = makeFailure();
            controls.set('reject', {request: () => {throw failure}});
            await pipeline.setInterceptors([descriptor('reject')]);
            pipeline.appPipelineId = 'interceptor-rejection-caller';
            const carrier = await pipeline.read().then(() => null, error => error);
            expect(carrier.code).toBe('NEO_PIPELINE_INTERCEPTION_REJECTED');
            const copy = structuredClone(carrier);
            expect(copy.reason.message).toBe(message)
        })
    }

    test('remote rejection preserves an already cloneable business error payload', async () => {
        const {pipeline} = await create(), failure = {status: 401, detail: {retry: false}};
        controls.set('reject', {request: () => {throw failure}});
        await pipeline.setInterceptors([descriptor('reject')]);
        pipeline.appPipelineId = 'interceptor-rejection-caller';
        const carrier = await pipeline.read().then(() => null, error => error);
        expect(structuredClone(carrier)).toEqual({code: 'NEO_PIPELINE_INTERCEPTION_REJECTED', reason: failure})
    });

    test('connection pushes await post-parse in arrival order without request or response hooks', async () => {
        const entered                = deferred(), release = deferred(), completed = deferred(),
              {pipeline, connection} = await create(), started = [], pushed = [];
        controls.set('push', {postParse: async value => {
            started.push(value.id);
            if (value.id === 1) {entered.resolve(); await release.promise}
            return {...value, transformed: true}
        }});
        await pipeline.setInterceptors([descriptor('push')]);
        pipeline.on('push', value => {pushed.push(value); if (value.id === 2) completed.resolve()});
        connection.fire('push', {id: 1});
        track(pipeline.pushTail);
        connection.fire('push', {id: 2});
        track(pipeline.pushTail);
        await entered.promise;
        expect(started).toEqual([1]);
        expect(pushed).toEqual([]);
        release.resolve();
        await completed.promise;
        expect(pushed).toEqual([
            {id: 1, transformed: true, source: pipeline.id},
            {id: 2, transformed: true, source: pipeline.id}
        ]);
        expect(events).toEqual(['push.postParse', 'push.postParse'])
    });

    test('a rejected connection push reports its error and does not poison the next arrival', async () => {
        const completed = deferred(), {pipeline, connection} = await create(), errors = [], pushed = [];
        controls.set('push', {postParse: value => {
            if (value.id === 1) throw new Error('push refused');
            return value
        }});
        await pipeline.setInterceptors([descriptor('push')]);
        pipeline.on('error', value => errors.push(value));
        pipeline.on('push', value => {pushed.push(value); completed.resolve()});
        connection.fire('push', {id: 1});
        track(pipeline.pushTail);
        connection.fire('push', {id: 2});
        track(pipeline.pushTail);
        await completed.promise;
        expect(errors).toEqual([{operation: 'push', message: 'push refused', source: pipeline.id}]);
        expect(pushed).toEqual([{id: 2, source: pipeline.id}])
    });

    test('destruction during a push handler releases its snapshot and publishes no late event', async () => {
        const entered = deferred(), release = deferred(), {pipeline, connection} = await create(), published = [];
        controls.set('push', {postParse: async value => {entered.resolve(); await release.promise; return value}});
        await pipeline.setInterceptors([descriptor('push')]);
        const handler = handlers.find(item => item.label === 'push');
        pipeline.on({push: value => published.push(value), error: value => published.push(value), telemetry: value => published.push(value)});
        connection.fire('push', {id: 1});
        const delivery = track(pipeline.pushTail);
        await entered.promise;
        pipeline.destroy();
        expect(handler.isDestroyed).toBeFalsy();
        release.resolve();
        await Promise.allSettled([delivery]);
        expect(handler.isDestroyed).toBe(true);
        expect(retired.filter(item => item.id === handler.id)).toHaveLength(1);
        expect(published).toEqual([])
    });

    test('a failed configured Data preload settles both concurrent setup callers', async () => {
        const previousData = Neo.worker.Data, preload = deferred(), entered = deferred(),
              {pipeline}   = await create();
        let creations = 0, loads = 0, secondSettled = false;
        Neo.worker.Data = {
            loadDataModule: async () => ({success: true}),
            loadModule    : () => {loads++; entered.resolve(); return preload.promise},
            createInstance: async () => {creations++; return {success: true, id: 'unexpected-counterpart'}}
        };
        pipeline.interceptors = [{className: Controlled.prototype.className, modulePath: 'apps/probe/Handler.mjs'}];
        pipeline.workerExecution = 'data';

        try {
            const first = track(pipeline.initRemoteExecution());
            await entered.promise;
            // Do not retain the potentially stranded waiter in fixture cleanup: the assertion must
            // report the missing terminal rather than hanging teardown behind that same defect.
            pipeline.initRemoteExecution().then(() => secondSettled = true, () => secondSettled = true);
            preload.resolve({success: false, error: 'custom handler preload refused'});
            await Promise.allSettled([first]);
            await new Promise(resolve => setImmediate(resolve));

            expect({secondSettled, loads, creations}).toEqual({secondSettled: true, loads: 1, creations: 0})
        } finally {
            pipeline.workerExecution = 'app';
            Neo.worker.Data = previousData
        }
    });

    test('a configured cold Data read rejects its preload error before counterpart creation or dispatch', async () => {
        const previousData = Neo.worker.Data, preload = deferred(), entered = deferred(),
              {pipeline}   = await create();
        let creations = 0, dispatches = 0;
        Neo.worker.Data = {
            loadDataModule: async () => ({success: true}),
            loadModule    : () => {entered.resolve(); return preload.promise},
            createInstance: async () => {creations++; return {success: true, id: 'unexpected-counterpart'}}
        };
        pipeline.interceptors = [{className: Controlled.prototype.className, modulePath: 'apps/probe/Handler.mjs'}];
        pipeline.workerExecution = 'data';
        pipeline.maxRemoteRetries = 0;
        pipeline.remote = {data: {read: async () => {dispatches++; return 'unexpected transport result'}}};

        try {
            const read = track(pipeline.read({page: 1}));
            await entered.promise;
            preload.resolve({success: false, error: 'custom handler preload refused'});
            const outcome = await read.then(value => ({state: 'fulfilled', value}), error => ({state: 'rejected', message: error.message}));

            expect({outcome, creations, dispatches}).toEqual({
                outcome: {state: 'rejected', message: 'custom handler preload refused'}, creations: 0, dispatches: 0
            })
        } finally {
            pipeline.workerExecution = 'app';
            Neo.worker.Data = previousData
        }
    });

    for (const workerExecution of ['app', 'data']) {
        test(`${workerExecution}: callable construction options reject before Pipeline registration`, () => {
            const id      = `pipeline-callable-construction-${workerExecution}`,
                  manager = Neo.manager.Instance, register = manager.register, registrations = [];
            manager.register = function(instance) {
                if (instance.id === id) registrations.push(id);
                return register.call(this, instance)
            };
            try {
                expect(() => Neo.create(Pipeline, {
                    id, workerExecution,
                    interceptors: [{module: Controlled, options: {callback: () => 'not wire data'}}]
                })).toThrow();
                expect(registrations).toEqual([]);
                expect(Neo.get(id)?.id ?? null).toBeNull()
            } finally {
                manager.register = register;
                const partial = Neo.get(id);
                if (partial) {
                    partial.workerExecution = 'app';
                    partial.destroy()
                }
            }
        })
    }

    test('Data global admissions serialize module preloads in call order', async () => {
        const previousWorkerId = Neo.workerId, previousWorker = Neo.currentWorker,
              firstEntered     = deferred(), firstRelease = deferred(),
              secondEntered    = deferred(), secondRelease = deferred(), loads = [];
        Neo.workerId = 'data';
        Neo.currentWorker = {...previousWorker, loadModule: ({path}) => {
            loads.push(path);
            if (path.endsWith('/First.mjs')) {firstEntered.resolve(); return firstRelease.promise}
            secondEntered.resolve();
            return secondRelease.promise
        }};

        try {
            const first  = track(Pipeline.setGlobalInterceptors([{...descriptor('first'), modulePath: 'apps/probe/First.mjs'}])),
                  second = track(Pipeline.setGlobalInterceptors([{...descriptor('second'), modulePath: 'apps/probe/Second.mjs'}]));
            await firstEntered.promise;
            await new Promise(resolve => setImmediate(resolve));
            expect(loads).toEqual(['apps/probe/First.mjs']);

            firstRelease.resolve({success: true});
            await first;
            await secondEntered.promise;
            expect(Pipeline.globalInterceptorChain.handlers.map(handler => handler.label)).toEqual(['first']);
            secondRelease.resolve({success: true});
            await second;

            expect(loads).toEqual(['apps/probe/First.mjs', 'apps/probe/Second.mjs']);
            expect(Pipeline.globalInterceptorChain.handlers.map(handler => handler.label)).toEqual(['second']);
            expect(retired.filter(handler => handler.label === 'first')).toHaveLength(1)
        } finally {
            Neo.workerId = previousWorkerId;
            Neo.currentWorker = previousWorker
        }
    });
});
