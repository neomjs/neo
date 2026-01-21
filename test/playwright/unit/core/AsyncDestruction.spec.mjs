import {setup} from '../../setup.mjs';

setup();

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import Base           from '../../../../src/core/Base.mjs';
import VdomLifecycle  from '../../../../src/mixin/VdomLifecycle.mjs';

test.describe('Async Destruction Handling', () => {

    test('core.Base.trap() should resolve normal promises', async () => {
        class TestClass extends Base {
            static config = { className: 'Neo.test.TrapTest1' }
        }
        TestClass = Neo.setupClass(TestClass);
        const instance = Neo.create(TestClass);

        const result = await instance.trap(Promise.resolve(123));
        expect(result).toBe(123);
        instance.destroy();
    });

    test('core.Base.trap() should reject normal errors', async () => {
        class TestClass extends Base {
            static config = { className: 'Neo.test.TrapTest2' }
        }
        TestClass = Neo.setupClass(TestClass);
        const instance = Neo.create(TestClass);

        try {
            await instance.trap(Promise.reject('error'));
        } catch (e) {
            expect(e).toBe('error');
        }
        instance.destroy();
    });

    test('core.Base.trap() should reject with Neo.isDestroyed when destroyed', async () => {
        class TestClass extends Base {
            static config = { className: 'Neo.test.TrapTest3' }
        }
        TestClass = Neo.setupClass(TestClass);
        const instance = Neo.create(TestClass);

        let slowPromiseResolve;
        const slowPromise = new Promise(resolve => { slowPromiseResolve = resolve });

        const trapped = instance.trap(slowPromise);

        instance.destroy();

        try {
            await trapped;
        } catch (e) {
            expect(e).toBe(Neo.isDestroyed);
        }
        
        // Ensure cleanup didn't break anything if the original promise resolves later
        slowPromiseResolve(456);
    });

    test('mixin.VdomLifecycle.promiseUpdate() should reject when destroyed', async () => {
        class VdomTestClass extends VdomLifecycle {
            static config = { className: 'Neo.test.VdomTest1' }
            
            // Mock updateVdom to simulate async behavior
            updateVdom(resolve, reject) {
                // In real life, this registers a callback in VDomUpdate.
                // We'll simulate a delayed resolution.
                this.pendingResolve = resolve;
            }
        }
        VdomTestClass = Neo.setupClass(VdomTestClass);
        const instance = Neo.create(VdomTestClass);

        const updatePromise = instance.promiseUpdate();

        instance.destroy();

        try {
            await updatePromise;
        } catch (e) {
            expect(e).toBe(Neo.isDestroyed);
        }
    });
});
