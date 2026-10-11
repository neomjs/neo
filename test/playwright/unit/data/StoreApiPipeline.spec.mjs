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
import StreamParser   from '../../../../src/data/parser/Stream.mjs';

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
test.describe('Neo.data.Store api vs pipeline', () => {
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

test.describe('Neo.data.Store append loading', () => {
    let store;

    test.afterEach(() => {
        store?.destroy();
        delete Neo.StoreAppendTestApi
    });

    for (const transport of ['pipeline', 'api']) {
        for (const autoInitRecords of [false, true]) {
            test(`${transport} append retains records and continuation semantics (eager=${autoInitRecords})`, async () => {
                const page   = [{id: '2', name: 'Second'}, {id: '3', name: 'Third'}],
                    loads    = [],
                    requests = [],
                    read     = async params => {
                        requests.push(params);
                        return {success: true, data: page.map(item => ({...item})), totalCount: 3}
                    };

                Neo.StoreAppendTestApi = {read};
                store = Neo.create(Store, {
                    api             : transport === 'api' ? {read: 'Neo.StoreAppendTestApi.read'} : null,
                    autoInitRecords,
                    initialChunkSize: 1,
                    model,
                    data            : [{id: '1', name: 'First'}]
                });
                await store.ready();
                if (store.pipeline) store.pipeline.read = read;
                store.on('load', event => loads.push(event.postChunkLoad));

                const result = await store.load({append: true, params: {page: 2}});

                expect(result).toEqual(store.items);
                expect(store.items.map(item => item.id)).toEqual(['1', '2', '3']);
                expect(store.get('2').name).toBe('Second');
                expect(store.totalCount).toBe(3);
                expect(store.currentPage).toBe(1);
                expect(requests[0].page).toBe(2);
                expect(loads.length).toBeGreaterThan(0);
                expect(loads.every(Boolean)).toBe(true);

                loads.length = 0;
                store.add({id: '4', name: 'Fourth'});
                expect(loads).toEqual([false]);
                loads.length = 0;
                store.sort('name');
                expect(loads.length).toBeGreaterThan(0);
                expect(loads.some(Boolean)).toBe(false);

                loads.length = 0;
                await store.load();
                expect(store.items.map(item => item.id).sort()).toEqual(['2', '3']);
                expect(loads.some(value => !value)).toBe(true)
            });
        }

        test(`${transport} empty and refused append retain rows and caller-owned page`, async () => {
            let   response = {success: true, data: [], totalCount: 1};
            const read     = async () => response;

            Neo.StoreAppendTestApi = {read};
            store = Neo.create(Store, {
                api  : transport === 'api' ? {read: 'Neo.StoreAppendTestApi.read'} : null,
                model,
                items: [{id: '1', name: 'First'}]
            });
            await store.ready();
            if (store.pipeline) store.pipeline.read = read;

            expect(await store.load({append: true})).toEqual(store.items);
            expect(store.items.map(item => item.id)).toEqual(['1']);
            response = transport === 'api' ? {success: false} : null;
            expect(await store.load({append: true, params: {page: 9}})).toBe(null);
            expect(store.items.map(item => item.id)).toEqual(['1']);
            expect(store.currentPage).toBe(1)
        });

        test(`${transport} rejected append does not advance page or leak continuation`, async () => {
            const read = async () => { throw new Error('read failed') };
            Neo.StoreAppendTestApi = {read};
            store = Neo.create(Store, {
                api  : transport === 'api' ? {read: 'Neo.StoreAppendTestApi.read'} : null,
                model,
                items: [{id: '1', name: 'First'}]
            });
            await store.ready();
            if (store.pipeline) store.pipeline.read = read;

            await expect(store.load({append: true, params: {page: 9}})).rejects.toThrow('read failed');
            expect(store.items.map(item => item.id)).toEqual(['1']);
            expect(store.currentPage).toBe(1);
            expect(store.isLoading).toBe(false);
            const loads = [];
            store.on('load', event => loads.push(event.postChunkLoad));
            store.add({id: '2', name: 'Second'});
            expect(loads).toEqual([false])
        });
    }

    for (const emitsRows of [false, true]) {
        test(`Pipeline admits the final array once after ${emitsRows ? 'nonempty' : 'empty'} data events`, async () => {
            const page = [{id: '2', name: 'Second'}], loads = [], additions = [];
            store = Neo.create(Store, {model, items: [{id: '1', name: 'First'}]});
            await store.ready();
            store.on('load', event => loads.push(event.postChunkLoad));
            const add = store.add;
            store.add = function(items) {
                additions.push(...items);
                return add.call(this, items)
            };
            store.pipeline.read = async () => {
                store.pipeline.fire('data', emitsRows ? page : []);
                return {data: page}
            };

            await store.load({append: true});
            expect(store.items.map(item => item.id)).toEqual(['1', '2']);
            expect(additions.map(item => item.id)).toEqual(['2']);
            expect(loads.length).toBeGreaterThan(0);
            expect(loads.every(Boolean)).toBe(true)
        });
    }

    for (const rows of [[], [{id: '2', name: 'Second'}, {id: '3', name: 'Third'}]]) {
        test(`built-in Stream append admits ${rows.length} rows once`, async () => {
            const loads = [], text = rows.map(JSON.stringify).join('\n');
            store = Neo.create(Store, {
                model,
                items   : [{id: '1', name: 'First'}],
                pipeline: {module: Pipeline, parser: {module: StreamParser, initialChunkSize: 1, chunkSize: 1}}
            });
            await store.ready();
            store.on('load', event => loads.push(event.postChunkLoad));
            store.pipeline.read = () => store.pipeline.parser.read({
                stream: new ReadableStream({
                    start(controller) {
                        controller.enqueue(new TextEncoder().encode(text));
                        controller.close()
                    }
                })
            });

            expect(await store.load({append: true})).toEqual(store.items);
            expect(store.items.map(item => item.id)).toEqual(['1', ...rows.map(item => item.id)]);
            expect(loads.length).toBeGreaterThan(0);
            expect(loads.every(Boolean)).toBe(true)
        });
    }
});
