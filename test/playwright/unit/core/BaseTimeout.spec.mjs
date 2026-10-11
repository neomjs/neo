import {test, expect}      from '@playwright/test';
import {getEventListeners} from 'node:events';
import Neo                 from '../../../../src/Neo.mjs';
import * as core           from '../../../../src/core/_export.mjs';

/**
 * @summary Observes native timers and the real Base registry without replacing their behavior.
 * @param {Neo.core.Base} instance
 * @returns {Object} Counters and restoration for this test's scoped spies.
 */
const observeTimeouts = instance => {
    const set       = globalThis.setTimeout, clear = globalThis.clearTimeout,
          register  = instance.registerAsync, unregister = instance.unregisterAsync,
          scheduled = [], cleared = [], registered = [], unregistered = [], pending = new Set();

    globalThis.setTimeout = (...args) => {
        const id = set(...args);
        scheduled.push(id);
        return id
    };
    globalThis.clearTimeout = id => {
        cleared.push(id);
        return clear(id)
    };
    instance.registerAsync = (id, reject) => {
        registered.push(id);
        pending.add(id);
        return register.call(instance, id, reject)
    };
    instance.unregisterAsync = id => {
        unregistered.push(id);
        pending.delete(id);
        return unregister.call(instance, id)
    };

    return {
        scheduled, cleared, registered, unregistered, pending,
        restore() {
            globalThis.setTimeout = set;
            globalThis.clearTimeout = clear;
            if (!instance.isDestroyed) {
                delete instance.registerAsync;
                delete instance.unregisterAsync
            }
        }
    }
};

test.describe('core/Base bounded predicate waits', () => {
    test('immediate success schedules no timeout', async () => {
        const instance = Neo.create(core.Base);
        let   waits    = 0;

        instance.timeout = async () => { waits++ };

        try {
            await expect(instance.waitFor(() => true)).resolves.toBe(true);
            expect(waits).toBe(0)
        } finally {
            instance.destroy()
        }
    });

    test('uses the instance timeout until a predicate succeeds', async () => {
        const instance = Neo.create(core.Base),
              delays   = [];
        let samples = 0;

        instance.timeout = async delay => { delays.push(delay) };

        try {
            await expect(instance.waitFor(() => ++samples === 3, {attempts: 5, delay: 7})).resolves.toBe(true);
            expect(samples).toBe(3);
            expect(delays).toEqual([7, 7])
        } finally {
            instance.destroy()
        }
    });

    for (const finalResult of [false, true]) {
        test(`exhaustion performs the final sample: ${finalResult}`, async () => {
            const instance = Neo.create(core.Base),
                  delays   = [];
            let samples = 0;

            instance.timeout = async delay => { delays.push(delay) };

            try {
                await expect(instance.waitFor(() => ++samples === 4 && finalResult, {
                    attempts: 2,
                    delay   : 9
                })).resolves.toBe(finalResult);
                expect(samples).toBe(4);
                expect(delays).toEqual([9, 9])
            } finally {
                instance.destroy()
            }
        })
    }

    test('propagates a predicate failure', async () => {
        const instance = Neo.create(core.Base),
              failure  = new Error('predicate failed');

        try {
            await expect(instance.waitFor(() => { throw failure })).rejects.toBe(failure)
        } finally {
            instance.destroy()
        }
    });

    test('destroy rejects a pending wait without changing another instance', async () => {
        const instance = Neo.create(core.Base),
              other    = Neo.create(core.Base);
        let samples = 0;

        try {
            const pending = instance.waitFor(() => { samples++; return false }, {delay: 1000});

            instance.destroy();

            await expect(pending).rejects.toBe(Neo.isDestroyed);
            expect(samples).toBe(1);
            await expect(other.waitFor(() => true)).resolves.toBe(true);
            expect(other.isDestroyed).toBeFalsy()
        } finally {
            !instance.isDestroyed && instance.destroy();
            other.destroy()
        }
    })
});

test.describe('core/Base Timeout Handling', () => {
    test('an aborted wait clears its timer while the owner remains alive', async () => {
        const instance = Neo.create(core.Base), controller = new AbortController(),
              clear    = globalThis.clearTimeout, cleared = [], reason = new Error('superseded');
        let outcome;

        globalThis.clearTimeout = id => { cleared.push(id); clear(id) };
        const pending = instance.timeout(60_000, {signal: controller.signal}).catch(error => { outcome = error });

        try {
            controller.abort(reason);
            expect(cleared).toHaveLength(1);
            await pending;
            expect(outcome).toBe(reason);
            expect(instance.isDestroyed).not.toBe(true)
        } finally {
            instance.destroy();
            await pending;
            globalThis.clearTimeout = clear
        }
    });

    test('timeout() should resolve after the specified delay', async () => {
        class TestClass extends core.Base {
            static config = {
                className: 'Neo.test.TimeoutTestClass'
            }
        }
        TestClass = Neo.setupClass(TestClass);

        const instance = Neo.create(TestClass);
        const start    = Date.now();
        await instance.timeout(100);
        const end = Date.now();

        expect(end - start).toBeGreaterThanOrEqual(95); // Allow small margin
    });

    test('timeout() should be rejected with Neo.isDestroyed when instance is destroyed', async () => {
        class TestClass extends core.Base {
            static config = {
                className: 'Neo.test.TimeoutDestroyTestClass'
            }
        }
        TestClass = Neo.setupClass(TestClass);

        const instance = Neo.create(TestClass);
        let error;

        // Start timeout but don't await immediately to allow destruction
        const timeoutPromise = instance.timeout(500);

        // Destroy instance before timeout completes
        instance.destroy();

        try {
            await timeoutPromise;
        } catch (e) {
            error = e;
        }

        expect(error).toBe(Neo.isDestroyed);
    });

    test('destroy() should clear Node Timeout object ids from timeout()', async () => {
        class TestClass extends core.Base {
            static config = {
                className: 'Neo.test.NodeTimeoutDestroyTestClass'
            }
        }
        TestClass = Neo.setupClass(TestClass);

        const
            instance     = Neo.create(TestClass),
            clearTimeout = globalThis.clearTimeout,
            clearedIds   = [];

        globalThis.clearTimeout = id => {
            clearedIds.push(id);
            return clearTimeout(id)
        };

        try {
            const timeoutPromise = instance.timeout(500);

            instance.destroy();

            await expect(timeoutPromise).rejects.toBe(Neo.isDestroyed);
        } finally {
            globalThis.clearTimeout = clearTimeout
        }

        expect(clearedIds).toHaveLength(1);
        expect(typeof clearedIds[0]).toBe('object');
        expect(clearedIds[0]?.constructor?.name).toBe('Timeout');
    });

    test('destroy() should still clear browser-style numeric timeout ids', () => {
        class TestClass extends core.Base {
            static config = {
                className: 'Neo.test.NumericTimeoutDestroyTestClass'
            }
        }
        TestClass = Neo.setupClass(TestClass);

        const
            instance     = Neo.create(TestClass),
            clearTimeout = globalThis.clearTimeout,
            clearedIds   = [];

        let rejectedWith;

        globalThis.clearTimeout = id => {
            clearedIds.push(id);
            return clearTimeout(id)
        };

        try {
            instance.registerAsync(42, reason => { rejectedWith = reason });
            instance.destroy()
        } finally {
            globalThis.clearTimeout = clearTimeout
        }

        expect(clearedIds).toEqual([42]);
        expect(rejectedWith).toBe(Neo.isDestroyed);
    });

    test('destroy() should not pass trap() Symbol ids to clearTimeout', async () => {
        class TestClass extends core.Base {
            static config = {
                className: 'Neo.test.TrapSymbolDestroyTestClass'
            }
        }
        TestClass = Neo.setupClass(TestClass);

        const
            instance     = Neo.create(TestClass),
            clearTimeout = globalThis.clearTimeout,
            clearedIds   = [],
            trapped      = instance.trap(new Promise(() => {}));

        globalThis.clearTimeout = id => {
            clearedIds.push(id);
            return clearTimeout(id)
        };

        try {
            instance.destroy();

            await expect(trapped).rejects.toBe(Neo.isDestroyed);
        } finally {
            globalThis.clearTimeout = clearTimeout
        }

        expect(clearedIds).toEqual([]);
    });

    test('Multiple timeouts should be handled correctly', async () => {
        class TestClass extends core.Base {
            static config = {
                className: 'Neo.test.MultipleTimeoutTestClass'
            }
        }
        TestClass = Neo.setupClass(TestClass);

        const instance = Neo.create(TestClass);
        let error1, error2;

        const p1 = instance.timeout(200);
        const p2 = instance.timeout(400);

        instance.destroy();

        try {
            await p1;
        } catch (e) {
            error1 = e;
        }

        try {
            await p2;
        } catch (e) {
            error2 = e;
        }

        expect(error1).toBe(Neo.isDestroyed);
        expect(error2).toBe(Neo.isDestroyed);
    });

    test('Completed timeouts should not prevent destruction or throw errors', async () => {
        class TestClass extends core.Base {
            static config = {
                className: 'Neo.test.CompletedTimeoutTestClass'
            }
        }
        TestClass = Neo.setupClass(TestClass);

        const instance = Neo.create(TestClass);

        await instance.timeout(50); // let it finish

        // Should not throw
        instance.destroy();
        expect(instance.isDestroyed).toBe(true);
    });
});

test.describe('core/Base optional timeout signals', () => {
    test('a pre-aborted signal allocates no timer, listener or async registration', async () => {
        const instance = Neo.create(core.Base), controller = new AbortController(),
              reason   = {superseded: true}, observed = observeTimeouts(instance);

        controller.abort(reason);

        try {
            const result = instance.timeout(60_000, {signal: controller.signal}).catch(error => error);

            expect(observed.scheduled).toEqual([]);
            expect(observed.registered).toEqual([]);
            expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
            expect(await result).toBe(reason);
            instance.destroy();
            expect(observed.cleared).toEqual([])
        } finally {
            try { !instance.isDestroyed && instance.destroy() } finally { observed.restore() }
        }
    });

    test('aborting one wait leaves its sibling registered and able to complete', async () => {
        const instance = Neo.create(core.Base), first = new AbortController(), second = new AbortController(),
              reason   = new Error('replace only the first wait'), observed = observeTimeouts(instance);
        let cancelled, sibling;

        try {
            cancelled = instance.timeout(60_000, {signal: first.signal}).catch(error => error);
            sibling = instance.timeout(0, {signal: second.signal});
            sibling.catch(() => {});
            const [firstId, secondId] = observed.registered;

            expect(observed.pending.size).toBe(2);
            expect(getEventListeners(first.signal, 'abort')).toHaveLength(1);
            expect(getEventListeners(second.signal, 'abort')).toHaveLength(1);
            first.abort(reason);

            expect(observed.cleared).toEqual([firstId]);
            expect([...observed.pending]).toEqual([secondId]);
            expect(getEventListeners(first.signal, 'abort')).toHaveLength(0);
            expect(getEventListeners(second.signal, 'abort')).toHaveLength(1);
            expect(await cancelled).toBe(reason);
            expect(await sibling).toBeUndefined();
            expect(observed.pending.size).toBe(0);
            expect(getEventListeners(second.signal, 'abort')).toHaveLength(0);
            expect(instance.isDestroyed).not.toBe(true);
            instance.destroy();
            expect(observed.cleared).toEqual([firstId])
        } finally {
            try {
                !instance.isDestroyed && instance.destroy();
                await Promise.allSettled([cancelled, sibling])
            } finally { observed.restore() }
        }
    });

    for (const terminal of ['elapsed', 'aborted', 'destroyed']) {
        test(`${terminal} removes the listener and registry entry before a late abort`, async () => {
            const instance = Neo.create(core.Base), controller = new AbortController(),
                  reason   = new Error('cancelled by caller'), observed = observeTimeouts(instance), settlements = [];
            let result;

            try {
                result = instance.timeout(terminal === 'elapsed' ? 0 : 60_000, {signal: controller.signal}).then(
                    value => { settlements.push({status: 'fulfilled', value}) },
                    error => { settlements.push({status: 'rejected', error}) }
                );
                const [id] = observed.registered;

                expect(observed.pending.size).toBe(1);
                expect(getEventListeners(controller.signal, 'abort')).toHaveLength(1);
                if (terminal === 'aborted') controller.abort(reason);
                if (terminal === 'destroyed') instance.destroy();
                await result;

                expect(settlements).toHaveLength(1);
                if (terminal === 'elapsed') {
                    expect(settlements[0]).toEqual({status: 'fulfilled', value: undefined})
                } else {
                    expect(settlements[0].status).toBe('rejected');
                    expect(settlements[0].error).toBe(terminal === 'aborted' ? reason : Neo.isDestroyed)
                }
                expect(observed.pending.size).toBe(0);
                expect(observed.unregistered).toEqual([id]);
                expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
                const clears = [...observed.cleared];

                expect(clears).toEqual(terminal === 'elapsed' ? [] : [id]);
                controller.abort(new Error('too late'));
                !instance.isDestroyed && instance.destroy();
                await Promise.resolve();

                expect(settlements).toHaveLength(1);
                expect(observed.cleared).toEqual(clears);
                expect(observed.unregistered).toEqual([id]);
                expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0)
            } finally {
                try {
                    !instance.isDestroyed && instance.destroy();
                    await result
                } finally { observed.restore() }
            }
        })
    }

    test('repeated cancellation retires obsolete waits before the next one is armed', async () => {
        const instance = Neo.create(core.Base), observed = observeTimeouts(instance), controllers = [], results = [];

        try {
            for (let index = 0; index < 25; index++) {
                const controller = new AbortController();
                controllers.push(controller);
                results.push(instance.timeout(60_000, {signal: controller.signal}).catch(error => error));
                expect(observed.pending.size).toBe(1);
                controller.abort('superseded');
                expect(observed.pending.size).toBe(0)
            }

            expect(await Promise.all(results)).toEqual(Array(25).fill('superseded'));
            expect(observed.registered).toHaveLength(25);
            expect(new Set(observed.cleared)).toEqual(new Set(observed.registered));
            expect(observed.cleared).toHaveLength(25);
            controllers.forEach(controller => expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0));

            await instance.timeout(0);
            expect(observed.pending.size).toBe(0);
            instance.destroy();
            expect(observed.cleared).toHaveLength(25)
        } finally {
            try {
                !instance.isDestroyed && instance.destroy();
                await Promise.allSettled(results)
            } finally { observed.restore() }
        }
    })
});
