import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';

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
