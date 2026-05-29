import {setup} from '../../setup.mjs';

const appName = 'StoreApiPipelineTest';

setup({
    appConfig: {
        name: appName
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Model          from '../../../../src/data/Model.mjs';
import Pipeline       from '../../../../src/data/Pipeline.mjs';
import Store          from '../../../../src/data/Store.mjs';

const model = {
    module: Model,
    fields: [
        {name: 'id',   type: 'String'},
        {name: 'name', type: 'String'}
    ]
};

/**
 * @summary Regression: an api-configured Store must NOT auto-create a default Pipeline.
 * If it did, Store.load()'s `if (me.pipeline)` branch would shadow the `else if (me.api)` RPC branch,
 * so an `autoLoad: true` api store would never fire its remotes-api request.
 */
test.describe.serial('Neo.data.Store api vs pipeline', () => {
    test('api-configured store has pipeline === null', () => {
        const store = Neo.create(Store, {
            api: {read: 'My.backend.Service.read'},
            model
        });

        expect(store.api).not.toBe(null);
        expect(store.pipeline).toBe(null);

        store.destroy()
    });

    test('api-configured store with autoLoad: true still has pipeline === null', () => {
        const store = Neo.create(Store, {
            api     : {read: 'My.backend.Service.read'},
            autoLoad: true,
            model
        });

        // pipeline is resolved synchronously during construction; destroy() below cancels the
        // pending autoLoad microtask (trap reject) before it would fire an RPC.
        expect(store.pipeline).toBe(null);

        store.destroy()
    });

    test('store without api or url still gets a default Pipeline (default preserved)', () => {
        const store = Neo.create(Store, {
            model,
            items: [{id: '1', name: 'Item 1'}]
        });

        expect(store.api).toBe(null);
        expect(store.pipeline).toBeInstanceOf(Pipeline);

        store.destroy()
    });
});
