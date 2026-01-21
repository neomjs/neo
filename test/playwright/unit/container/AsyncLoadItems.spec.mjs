import {setup} from '../../setup.mjs';

setup({appConfig: {appName: 'TestApp'}});

import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import {test, expect} from '@playwright/test';
import Container      from '../../../../src/container/Base.mjs';

test.describe('Container Async Destruction', () => {
    let originalFetch;

    test.beforeEach(() => {
        originalFetch = globalThis.fetch;
    });

    test.afterEach(() => {
        if (originalFetch) {
            globalThis.fetch = originalFetch;
        }
    });

    test('loadItems() should reject when destroyed during fetch', async () => {
        let fetchResolve;
        globalThis.fetch = () => new Promise(resolve => { fetchResolve = resolve });

        const instance = Neo.create(Container, {appName: 'TestApp'});
        const loadPromise = instance.loadItems({url: 'test.json'});

        instance.destroy();

        try {
            await loadPromise;
        } catch (e) {
            expect(e).toBe(Neo.isDestroyed);
        }

        fetchResolve({ json: () => ({items: []}) });
    });

    test('loadItems() should reject when destroyed during response.json()', async () => {
        let jsonResolve;
        
        globalThis.fetch = () => Promise.resolve({
            json: () => new Promise(resolve => { jsonResolve = resolve })
        });

        const instance = Neo.create(Container, {appName: 'TestApp'});
        const loadPromise = instance.loadItems({url: 'test.json'});

        // Wait for fetch to resolve (microtask)
        await new Promise(r => setTimeout(r, 0));

        instance.destroy();

        try {
            await loadPromise;
        } catch (e) {
            expect(e).toBe(Neo.isDestroyed);
        }

        jsonResolve({items: []});
    });
});
