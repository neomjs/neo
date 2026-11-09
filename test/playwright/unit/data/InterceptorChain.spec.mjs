import {setup} from '../../setup.mjs';

setup({appConfig: {name: 'DataInterceptorChainTest'}});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Interceptor    from '../../../../src/data/interceptor/Base.mjs';
import Chain          from '../../../../src/data/interceptor/Chain.mjs';
import Instance       from '../../../../src/manager/Instance.mjs';

let created = [], destroyed = [], gates = new Map(), partialIds = [];

/** @summary A caller-controlled asynchronous readiness boundary. */
function deferred() {
    let resolve;
    const promise = new Promise(done => resolve = done);
    return {promise, resolve}
}

/** @summary Records real handler construction and destruction, with optional asynchronous initialization. */
class Handler extends Interceptor {
    static config = {
        className: 'Test.Unit.Data.InterceptorChain.Handler',
        gate     : null,
        label    : ''
    }

    /** @summary Records the newly owned instance. @param {Object} config */
    construct(config) {
        super.construct(config);
        created.push(this)
    }

    /** @summary Waits for the test's explicit readiness release. */
    async initAsync() {
        await super.initAsync();
        if (this.gate) await gates.get(this.gate).promise
    }

    /** @summary Records exact-once resource retirement. */
    destroy() {
        destroyed.push({id: this.id, label: this.label});
        super.destroy()
    }
}
Handler = Neo.setupClass(Handler);

/** @summary A handler whose public readiness contract rejects. */
class RejectingReady extends Handler {
    static config = {className: 'Test.Unit.Data.InterceptorChain.RejectingReady'}

    /** @summary Rejects through ready(), not the Core Base initAsync rejection gap. */
    ready() {
        return Promise.reject(new Error('handler readiness refused'))
    }
}
RejectingReady = Neo.setupClass(RejectingReady);

/** @summary Throws after registration so the owner must recover the provisional instance id. */
class ThrowingConstructor extends Interceptor {
    static config = {className: 'Test.Unit.Data.InterceptorChain.ThrowingConstructor'}

    /** @summary Leaves a partial registration before refusing construction. @param {Object} config */
    construct(config) {
        super.construct(config);
        partialIds.push(this.id);
        throw new Error('handler construction refused')
    }

    /** @summary Makes partial-instance disposal observable. */
    destroy() {
        destroyed.push({id: this.id, label: 'partial'});
        super.destroy()
    }
}
ThrowingConstructor = Neo.setupClass(ThrowingConstructor);

test.describe('Pipeline interceptor chains', () => {
    let chains, standalone;

    test.beforeEach(() => {
        created = [];
        destroyed = [];
        gates = new Map();
        partialIds = [];
        chains = [];
        standalone = []
    });

    test.afterEach(() => {
        gates.forEach(gate => gate.resolve());
        chains.forEach(chain => chain.retire());
        standalone.forEach(handler => handler.destroy())
    });

    /** @summary Tracks a chain for failure-path cleanup. @param {Array} descriptors */
    const createChain = descriptors => {
        const chain = Neo.create(Chain, {descriptors});
        chains.push(chain);
        return chain
    };

    test('base hooks preserve values and the original rejection', async () => {
        const handler = Neo.create(Interceptor), value = {id: 1}, failure = new Error('transport');
        standalone.push(handler);
        await handler.ready();

        expect(handler.request(value, {})).toBe(value);
        expect(handler.response(value, {})).toBe(value);
        expect(handler.postParse(value, {})).toBe(value);
        expect(() => handler.responseError(failure, {})).toThrow(failure)
    });

    test('class and config descriptors create ordered distinct handlers and strip loader metadata', async () => {
        const chain = createChain([
            Handler,
            {className: Handler.prototype.className, label: 'second', modulePath: 'apps/demo/data/Handler.mjs'}
        ]);
        const lease = await chain.acquire();

        expect(lease.handlers).toBe(chain.handlers);
        expect(Object.isFrozen(lease.handlers)).toBe(true);
        expect(lease.handlers.map(handler => handler.label)).toEqual(['', 'second']);
        expect(new Set(lease.handlers.map(handler => handler.id)).size).toBe(2);
        expect(lease.handlers.every(handler => handler instanceof Handler)).toBe(true);
        expect('modulePath' in lease.handlers[1]).toBe(false);
        expect(() => lease.handlers.push(lease.handlers[0])).toThrow();
        lease.release()
    });

    test('descriptor validation copies nested data without mutating the caller', () => {
        const descriptors = [{module: Handler, options: {headers: {token: 'one'}, values: [1, null, true]}}],
              copy        = Chain.validateDescriptors(descriptors);

        expect(copy[0].module).toBe(Handler);
        expect(copy[0].className).toBe(Handler.prototype.className);
        expect(descriptors[0].className).toBeUndefined();
        copy[0].options.headers.token = 'two';
        copy[0].options.values.push(2);
        expect(descriptors[0].options).toEqual({headers: {token: 'one'}, values: [1, null, true]})
    });

    test('acquire retains before own and handler readiness; retirement cannot cut off the admitted lease', async () => {
        const own = deferred(), handlerReady = deferred();
        gates.set('handler', handlerReady);
        const chain = createChain([{module: Handler, gate: 'handler'}]);
        chain.ready = () => own.promise;
        let   acquired = false;
        const pending  = chain.acquire().then(lease => {acquired = true; return lease});

        chain.retire();
        await expect(chain.acquire()).rejects.toThrow('retired');
        expect(chain.isDestroyed).toBeFalsy();
        expect(destroyed).toEqual([]);
        handlerReady.resolve();
        await Promise.resolve();
        expect(acquired).toBe(false);

        own.resolve();
        const lease = await pending;
        expect(lease.handlers[0].isReady).toBe(true);
        expect(lease.handlers[0].isDestroyed).toBeFalsy();
        lease.release();
        expect(chain.isDestroyed).toBe(true);
        expect(destroyed).toHaveLength(1)
    });

    test('multiple leases keep one ordered snapshot until the last idempotent release', async () => {
        const chain      = createChain([{module: Handler, label: 'first'}, {module: Handler, label: 'second'}]),
              id         = chain.id,
              [one, two] = await Promise.all([chain.acquire(), chain.acquire()]);

        expect(one.handlers).toBe(two.handlers);
        chain.retire();
        chain.retire();
        one.release();
        one.release();
        expect(destroyed).toEqual([]);
        expect(Instance.get(id)).toBe(chain);

        two.release();
        two.release();
        chain.retire();
        expect(destroyed.map(handler => handler.label)).toEqual(['first', 'second']);
        expect(Instance.get(id)).toBeNull();
        expect(chain.handlers).toEqual([])
    });

    test('an unused chain retires immediately and never creates a new lease', async () => {
        const chain = createChain([Handler]), handler = chain.handlers[0];
        chain.retire();
        chain.retire();

        expect(handler.isDestroyed).toBe(true);
        expect(destroyed).toHaveLength(1);
        await expect(chain.acquire()).rejects.toThrow('retired')
    });

    test('a readiness refusal releases the acquisition and retires every owned handler', async () => {
        const chain    = createChain([{module: Handler, label: 'healthy'}, {module: RejectingReady, label: 'refused'}]);
        const handlers = chain.handlers;
        await expect(chain.acquire()).rejects.toThrow('handler readiness refused');

        expect(chain.isDestroyed).toBe(true);
        expect(handlers.every(handler => handler.isDestroyed)).toBe(true);
        expect(destroyed.map(handler => handler.label)).toEqual(['healthy', 'refused']);
        await expect(chain.acquire()).rejects.toThrow('retired')
    });

    test('a constructor refusal removes its partial registration, predecessors and the failed chain', async () => {
        const id = 'interceptor-chain-constructor-refusal';
        expect(() => Neo.create(Chain, {id, descriptors: [Handler, ThrowingConstructor]}))
            .toThrow('handler construction refused');

        expect(partialIds).toHaveLength(1);
        expect(Instance.get(partialIds[0])).toBeNull();
        expect(created).toHaveLength(1);
        expect(created[0].isDestroyed).toBe(true);
        expect(Instance.get(created[0].id)).toBeNull();
        expect(Instance.get(id)).toBeNull();
        expect(destroyed.map(handler => handler.id).sort()).toEqual([created[0].id, partialIds[0]].sort());
        await Promise.resolve()
    });

    test('borrowed instances and singleton names refuse without destroying their owner', () => {
        const borrowed = Neo.create(Handler);
        standalone.push(borrowed);
        expect(() => Chain.validateDescriptors([borrowed])).toThrow();
        expect(() => Chain.validateDescriptors([{module: borrowed}])).toThrow();
        expect(() => Chain.validateDescriptors([{module: Handler, options: {borrowed}}])).toThrow();
        expect(() => createChain([{className: Instance.className}])).toThrow(/singleton|borrowed/);
        expect(borrowed.isDestroyed).toBeFalsy();
        expect(Instance.isDestroyed).toBeFalsy()
    });

    for (const modulePath of [
        'apps/demo/Handler.mjs', 'examples/data/Handler.mjs', 'docs/app/data/Handler.mjs', 'src/data/interceptor/Base.mjs'
    ]) {
        test(`accepts the existing module root: ${modulePath}`, () => {
            expect(Chain.validateDescriptors([{module: Handler, modulePath}])[0].modulePath).toBe(modulePath)
        })
    }

    for (const modulePath of [
        '../apps/Handler.mjs', 'apps/../Handler.mjs', 'apps//Handler.mjs', 'apps/./Handler.mjs',
        '/apps/Handler.mjs', 'test/Handler.mjs', 'apps/Handler.js', 'apps/Handler.mjs?x=1',
        'apps/Handler.mjs#x', 'apps/%2e%2e/Handler.mjs', 'apps\\Handler.mjs'
    ]) {
        test(`refuses an unsupported or escaping module path: ${modulePath}`, () => {
            expect(() => Chain.validateDescriptors([{module: Handler, modulePath}])).toThrow('modulePath')
        })
    }

    test('malformed descriptors refuse before any handler is constructed', () => {
        const circular = {}; circular.self = circular;
        const invalid  = [
            null, {}, [null], [{}], [() => {}], [{module: () => {}}],
            [{module: Handler, className: 'Other.Handler'}], [{className: ''}],
            [{module: Handler, options: {callback() {}}}], [{module: Handler, options: {callback: async () => {}}}],
            [{module: Handler, options: circular}], [{module: Handler, options: new Map()}],
            [{module: Handler, options: [1, , 2]}], new Array(1)
        ];
        for (const descriptors of invalid) expect(() => Chain.validateDescriptors(descriptors)).toThrow();
        expect(created).toEqual([])
    });

    test('accessors and hidden behavior are refused without invoking them', () => {
        let   reads   = 0;
        const options = Object.defineProperty({}, 'token', {enumerable: true, get() {reads++; return 'secret'}}),
              descriptor = {module: Handler};
        Object.defineProperty(descriptor, 'hidden', {value: () => {}});
        expect(() => Chain.validateDescriptors([{module: Handler, options}])).toThrow();
        expect(() => Chain.validateDescriptors([descriptor])).toThrow();
        expect(() => Chain.validateDescriptors([{module: Handler, options: {[Symbol('hook')]: () => {}}}])).toThrow();
        expect(reads).toBe(0)
    });

    for (const key of ['id', 'ntype', 'request', 'response', 'responseError', 'postParse', 'ready', 'destroy', 'isDestroyed', 'initAsync']) {
        test(`config cannot replace owned identity or behavior: ${key}`, () => {
            expect(() => Chain.validateDescriptors([{module: Handler, [key]: 'replacement'}])).toThrow('unsupported option')
        })
    }
});
