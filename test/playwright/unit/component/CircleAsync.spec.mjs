import {setup} from '../../setup.mjs';

setup({appConfig: {appName: 'TestApp'}});

import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import {test, expect} from '@playwright/test';
import Circle         from '../../../../src/component/Circle.mjs';

test.describe('Circle Async Destruction', () => {
    let originalXhr;

    test.beforeEach(() => {
        originalXhr = Neo.Xhr;
        // Mock Neo.main.DomEvents
        Neo.main = Neo.main || {};
        Neo.main.DomEvents = {
            registerPreventDefaultTargets: () => {}
        };
    });

    test.afterEach(() => {
        if (originalXhr) {
            Neo.Xhr = originalXhr;
        }
        delete Neo.main;
    });

    test('loadData() should reject when destroyed during XHR', async () => {
        let xhrResolve;
        
        Neo.Xhr = {
            promiseJson: () => new Promise(resolve => { xhrResolve = resolve })
        };

        const instance = Neo.create(Circle, {
            appName: 'TestApp',
            url: 'test.json'
        });
        
        const loadPromise = instance.loadData();

        instance.destroy();

        try {
            await loadPromise;
        } catch (e) {
            expect(e).toBe(Neo.isDestroyed);
        }

        xhrResolve({ json: { data: [] } });
    });
});