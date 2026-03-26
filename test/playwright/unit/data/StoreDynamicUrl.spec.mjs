import {setup} from '../../setup.mjs';

const appName = 'StoreDynamicUrlTest';

setup({
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    },
    neoConfig: {
        allowVdomUpdatesInTests: true,
        unitTestMode           : true,
        useDomApiRenderer      : true
    }
});

import {test, expect}     from '@playwright/test';
import Neo                from '../../../../src/Neo.mjs';
import * as core          from '../../../../src/core/_export.mjs';
import Model              from '../../../../src/data/Model.mjs';
import Store              from '../../../../src/data/Store.mjs';
import Pipeline           from '../../../../src/data/Pipeline.mjs';
import FetchConnection    from '../../../../src/data/connection/Fetch.mjs';

test.describe('Neo.data.Store - Dynamic URL Load', () => {

    test('Store should load dynamically passed url without an initial url config', async () => {
        // 1. Create a Mock Model
        class TestModel extends Model {
            static config = {
                className  : 'Test.Unit.Data.StoreDynamicUrl.MockModel',
                keyProperty: 'id',
                fields     : [
                    {name: 'id',     type: 'Integer'},
                    {name: 'name',   type: 'String'}
                ]
            }
        }
        TestModel = Neo.setupClass(TestModel);

        // 2. Create Store WITHOUT url or pipeline
        const store = Neo.create(Store, {
            model   : TestModel,
            autoLoad: false
        });

        expect(store.url).toBeNull();
        expect(store.pipeline).toBeDefined(); // A default pipeline is created

        // 3. Mock the XHR globally to test dynamic connection setup
        globalThis.XMLHttpRequest = class {
            listeners = {};
            addEventListener(type, fn) {
                this.listeners[type] = fn;
            }
            getAllResponseHeaders() {
                return 'Content-Type: application/json\r\n';
            }
            open() {}
            send() {
                setTimeout(() => {
                    this.status = 200;
                    this.response = JSON.stringify([{ id: 1, name: 'Dynamic' }]);
                    this.responseText = this.response;
                    this.readyState = 4;
                    this.onreadystatechange?.();
                    this.listeners['load']?.({ currentTarget: this, target: this });
                }, 1);
            }
            setRequestHeader() {}
        };
        globalThis.location = { href: 'http://localhost' };

        try {
            // 4. Try loading with a dynamic URL
            await store.load({ url: 'dynamic.json' });

            expect(store.count).toBe(1);
            expect(store.get(1).name).toBe('Dynamic');
        } finally {
            delete globalThis.XMLHttpRequest;
            delete globalThis.location;
            store.destroy();
        }
    });
});
