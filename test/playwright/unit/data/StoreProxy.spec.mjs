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
        this.fire('data', {id: '1', name: 'Mock 1'});
        this.fire('data', {id: '2', name: 'Mock 2'});
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

    test('Store load() should use proxy', async () => {
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

        let loadFired = false;
        store.on('load', () => loadFired = true);

        await store.load();

        expect(loadFired).toBe(true);
        expect(store.count).toBe(2);
        expect(store.get('1').name).toBe('Mock 1');
        expect(store.get('2').name).toBe('Mock 2');
    });

    test('Store should suspend events during stream', async () => {
        const store = Neo.create(Store, {
            keyProperty: 'id',
            proxy: {
                module: MockProxy
            }
        });

        let mutateCount = 0;
        store.on('mutate', () => mutateCount++);

        await store.load();

        // mutate should only fire once (from add) or be suppressed if we used suspendEvents?
        // logic: suspendEvents = true.
        // proxy fires data -> onProxyData -> store.add(data) -> super.add -> splice -> fire 'mutate'
        // if suspendEvents is true, Observable.fire checks !me.suspendEvents.
        
        // So mutate should NOT fire during streaming.
        
        // Wait, does store fire 'load' at the end? Yes.
        // Does 'mutate' fire after suspendEvents = false? No, we don't queue events.
        
        expect(mutateCount).toBe(0);
    });
});
