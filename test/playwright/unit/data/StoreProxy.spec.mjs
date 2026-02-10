import {setup} from '../../setup.mjs';

const appName = 'StoreProxyTest';

setup({
    appConfig: {
        name: appName
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Store          from '../../../../src/data/Store.mjs';
import Model          from '../../../../src/data/Model.mjs';
import ProxyBase      from '../../../../src/data/proxy/Base.mjs';

class MockProxy extends ProxyBase {
    static config = {
        className: 'Test.MockProxy',
        ntype: 'mock-proxy'
    }

    async read(operation) {
        this.fire('data', [{id: '1', name: 'Mock 1'}, {id: '2', name: 'Mock 2'}]);
        return {success: true, count: 2};
    }
}

MockProxy = Neo.setupClass(MockProxy);

/**
 * @summary Tests for Neo.data.Store with Proxy
 */
test.describe.serial('Neo.data.Store Proxy Integration', () => {
    
    test('Store should create proxy from config', () => {
        const store = Neo.create(Store, {
            keyProperty: 'id',
            proxy: {
                module: MockProxy
            }
        });

        expect(store.proxy).toBeDefined();
        expect(store.proxy.className).toBe('Test.MockProxy');
        expect(store.proxy instanceof MockProxy).toBe(true);
    });

    test('Store load() should use proxy and progressive loading', async () => {
        const store = Neo.create(Store, {
            keyProperty: 'id',
            model: {
                module: Model,
                fields: [{name: 'id'}, {name: 'name'}]
            },
            proxy: {
                module: MockProxy
            }
        });

        let loadFiredCount = 0;
        store.on('load', () => loadFiredCount++);

        await store.load();

        // Should fire load at least once during stream (progressive) and once at end?
        // MockProxy fires data once (2 items).
        // Store:
        // 1. onData -> add -> isLoading=false -> fire('load') (Count: 1)
        // 2. await proxy.read -> success -> fire('load') (Count: 2)
        
        expect(loadFiredCount).toBeGreaterThanOrEqual(1);
        expect(store.count).toBe(2);
        expect(store.get('1').name).toBe('Mock 1');
        expect(store.get('2').name).toBe('Mock 2');
    });
});
