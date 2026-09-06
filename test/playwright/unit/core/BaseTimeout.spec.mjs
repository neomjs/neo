import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';

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
    test('timeout() should resolve after the specified delay', async () => {
        class TestClass extends core.Base {
            static config = {
                className: 'Neo.test.TimeoutTestClass'
            }
        }
        TestClass = Neo.setupClass(TestClass);

        const instance = Neo.create(TestClass);
        const start = Date.now();
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
