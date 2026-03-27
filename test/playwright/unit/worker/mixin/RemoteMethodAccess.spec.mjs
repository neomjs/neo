import {setup} from '../../../setup.mjs';

const appName = 'RemoteMethodAccessTest';

setup({
    appConfig: {
        name: appName
    }
});

import {test, expect}       from '@playwright/test';
import Neo                  from '../../../../../src/Neo.mjs';
import * as core            from '../../../../../src/core/_export.mjs';
import InstanceManager      from '../../../../../src/manager/Instance.mjs';
import RemoteMethodAccess   from '../../../../../src/worker/mixin/RemoteMethodAccess.mjs';

// Create a mock worker class to apply the mixin
class MockWorker extends Neo.core.Base {
    static config = {
        className: 'Test.worker.MockWorker',
        mixins: [RemoteMethodAccess],
        workerId: 'test-worker'
    }

    promiseMessage(destination, opts, buffer) {
        // Just return the options to verify routing
        return Promise.resolve(opts);
    }
}
MockWorker = Neo.setupClass(MockWorker);

// Create a mock instance to test routing to
class MockTarget extends Neo.core.Base {
    static config = {
        className: 'Test.worker.MockTarget'
    }

    testMethod(data) {
        return data.value * 2;
    }
}
MockTarget = Neo.setupClass(MockTarget);


test.describe.serial('worker/mixin/RemoteMethodAccess', () => {

    test('generateRemote should include remoteId if present in config', async () => {
        const worker = Neo.create(MockWorker);
        
        const proxy = worker.generateRemote({
            className: 'Test.worker.MockTarget',
            id: 'mock-target-123',
            origin: 'data'
        }, 'testMethod');

        const result = await proxy({value: 5});

        expect(result.action).toBe('remoteMethod');
        expect(result.destination).toBe('data');
        expect(result.remoteClassName).toBe('Test.worker.MockTarget');
        expect(result.remoteMethod).toBe('testMethod');
        expect(result.remoteId).toBe('mock-target-123');
        expect(result.data.value).toBe(5);

        worker.destroy();
    });

    test('onRemoteMethod should resolve instance via InstanceManager if remoteId is provided', () => {
        const worker = Neo.create(MockWorker);
        const target = Neo.create(MockTarget); // Instance manager auto-registers this

        let resolveCalled = false;
        let rejectCalled = false;
        let resolvedData = null;

        // Mock resolve/reject since this is a unit test without real IPC
        worker.resolve = (msg, data) => {
            resolveCalled = true;
            resolvedData = data;
        };

        worker.reject = (msg, err) => {
            rejectCalled = true;
        };

        const msg = {
            remoteClassName: 'Test.worker.MockTarget',
            remoteMethod: 'testMethod',
            remoteId: target.id,
            data: {value: 10}
        };

        worker.onRemoteMethod(msg);

        expect(resolveCalled).toBe(true);
        expect(rejectCalled).toBe(false);
        expect(resolvedData).toBe(20);

        target.destroy();
        worker.destroy();
    });

    test('onRemoteMethod should fall back to namespace routing if no remoteId is provided', () => {
        const worker = Neo.create(MockWorker);
        
        // Setup a mock singleton in the namespace
        Neo.ns('Test.worker.MockSingleton', true);
        Test.worker.MockSingleton.testMethod = (data) => data.value * 3;
        Test.worker.MockSingleton.isReady = true;

        let resolveCalled = false;
        let resolvedData = null;

        worker.resolve = (msg, data) => {
            resolveCalled = true;
            resolvedData = data;
        };

        const msg = {
            remoteClassName: 'Test.worker.MockSingleton',
            remoteMethod: 'testMethod',
            data: {value: 10}
        };

        worker.onRemoteMethod(msg);

        expect(resolveCalled).toBe(true);
        expect(resolvedData).toBe(30);

        worker.destroy();
    });
});
