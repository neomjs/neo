import {setup} from '../../setup.mjs';

const appName = 'ComponentStoreLoadingTest';

setup({neoConfig: {unitTestMode: true}, appConfig: {name: appName}});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Gallery        from '../../../../src/component/Gallery.mjs';
import Helix          from '../../../../src/component/Helix.mjs';
import Model          from '../../../../src/data/Model.mjs';
import Store          from '../../../../src/data/Store.mjs';

/** @summary Creates controlled real API stores, without a timer or transport singleton. */
test.describe('Gallery and Helix Store feedback', () => {
    let view, stores;

    test.beforeEach(() => { stores = [] });
    test.afterEach(() => {
        view?.destroy();
        stores.forEach(store => store.destroy());
        delete Neo.ComponentStoreLoadingApi
    });

    async function createStore() {
        const store = Neo.create(Store, {
            api  : {read: 'Neo.ComponentStoreLoadingApi.read'},
            model: {module: Model, fields: [{name: 'id', type: 'Integer'}, {name: 'image', type: 'String'}]}
        });
        stores.push(store);
        await store.ready();
        return store
    }

    const masks = cls => view.vdom.cn.filter(node => node.cls?.includes(cls));

    for (const View of [Gallery, Helix]) {
        test(`${View.config.className} reflects initial pending state, rows and settlement without stealing manual masks`, async () => {
            let settle;
            Neo.ComponentStoreLoadingApi = {read: () => new Promise(resolve => { settle = resolve })};
            const store = await createStore(), pending = store.load();

            view = Neo.create(View, {appName, store, isLoading: 'Manual work', maxItems: 2});
            await view.ready();
            expect(masks('neo-store-load-mask')).toHaveLength(1);
            expect(masks('neo-load-mask')).toHaveLength(1);
            expect(view.isLoading).toBe('Manual work');
            expect(view.vdom['aria-busy']).toBe('true');

            // Exercise Helix's item projection without mounting a DOM/ResizeObserver in this unit test.
            view._mounted = true;
            store.add({id: 1, image: 'one.png'});
            expect(view.getItemsRoot().cn).toHaveLength(1);
            expect(view.wrapperCls).toContain('neo-store-loading-with-items');
            store.sort('id');
            expect(masks('neo-store-load-mask')).toHaveLength(1);

            view.destroyItems();
            expect(view.getItemsRoot().cn).toHaveLength(0);
            expect(view.wrapperCls).not.toContain('neo-store-loading-with-items');
            store.add({id: 2, image: 'two.png'});
            expect(view.wrapperCls).toContain('neo-store-loading-with-items');
            view._mounted = false;
            store.clear();
            expect(view.getItemsRoot().cn).toHaveLength(0);
            expect(view.wrapperCls).not.toContain('neo-store-loading-with-items');

            view.isLoading = false;
            expect(masks('neo-load-mask')).toHaveLength(0);
            expect(masks('neo-store-load-mask')).toHaveLength(1);

            view.isLoading = 'Other work';
            settle({success: false});
            await pending;
            expect(masks('neo-store-load-mask')).toHaveLength(0);
            expect(masks('neo-load-mask')).toHaveLength(1);
            expect(view.isLoading).toBe('Other work');
            expect(view.vdom['aria-busy']).toBeUndefined()
        });

        test(`${View.config.className} releases old-store callbacks on replacement and owner destruction`, async () => {
            const resolvers = [];
            Neo.ComponentStoreLoadingApi = {read: () => new Promise(resolve => resolvers.push(resolve))};
            const first = await createStore(), second = await createStore();

            view = Neo.create(View, {appName, store: first});
            await view.ready();
            const oldLoad = first.load().catch(error => error), newLoad = second.load();
            view.store = second;
            expect(masks('neo-store-load-mask')).toHaveLength(1);
            resolvers[0]({success: false});
            await oldLoad;
            expect(masks('neo-store-load-mask')).toHaveLength(1);

            view.destroy();
            resolvers[1]({success: false});
            await newLoad;
            expect(second.isLoadPending).toBe(false)
        })
    }
});
