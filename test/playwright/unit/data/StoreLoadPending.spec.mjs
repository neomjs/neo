import {setup} from '../../setup.mjs';

setup({appConfig: {name: 'StoreLoadPendingTest'}});

import {test, expect} from '@playwright/test';
import fs             from 'node:fs';
import os             from 'node:os';
import path           from 'node:path';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Base           from '../../../../src/core/Base.mjs';
import Model          from '../../../../src/data/Model.mjs';
import Store          from '../../../../src/data/Store.mjs';

/** @summary Controls request settlement without timers or transport infrastructure. */
function deferred() {
    let resolve, reject;
    const promise = new Promise((yes, no) => {resolve = yes; reject = no});
    return {promise, resolve, reject}
}

/** @summary Request pending spans load invocations without replacing progressive-rendering state. */
test.describe('Store request-pending observation', () => {
    let owned, folders;

    test.beforeEach(() => {owned = []; folders = []});
    test.afterEach(() => {
        owned.reverse().forEach(instance => instance.destroy());
        folders.forEach(folder => fs.rmSync(folder, {recursive: true, force: true}));
        delete Neo.StoreLoadPendingTestApi
    });

    const create = (module, config) => {
        const instance = Neo.create(module, config);
        owned.push(instance);
        return instance
    };
    const makeStore = async (transport = 'pipeline', read = async () => null) => {
        Neo.StoreLoadPendingTestApi = {read};
        const store = create(Store, {
            api  : transport === 'api' ? {read: 'Neo.StoreLoadPendingTestApi.read'} : null,
            model: {module: Model, fields: [{name: 'id'}, {name: 'name'}]}
        });
        await store.ready();
        if (transport === 'pipeline') store.pipeline.read = read;
        return store
    };
    const observe = store => {
        const observer = create(Base), changes = [];
        const release  = observer.observeConfig(store, 'isLoadPending', value => changes.push(value));
        return {observer, changes, release}
    };

    test('first progressive data and a coarse sort/load leave the request pending', async () => {
        const read      = deferred(), store = await makeStore('pipeline', () => read.promise),
              {changes} = observe(store), loads = [], rows = [{id: 2, name: 'b'}, {id: 1, name: 'a'}];
        expect(store.isLoadPending).toBe(false);
        expect(store.isConfig('isLoadPending')).toBeTruthy();
        store.on('load', event => loads.push(event));

        const loading = store.load();
        expect(store.isLoadPending).toBe(true);
        expect(store.isLoading).toBe(true);
        store.pipeline.fire('data', rows);
        expect(store.count).toBe(2);
        expect(store.isLoading).toBe(false);
        expect(store.isLoadPending).toBe(true);
        store.sort({property: 'name', direction: 'ASC'});
        expect(loads.some(event => event.isSort)).toBe(true);
        expect(store.isLoadPending).toBe(true);

        read.resolve({data: rows, totalCount: 2});
        expect(await loading).toEqual(store.items);
        expect(store.items.map(item => item.id)).toEqual([1, 2]);
        expect(store.isLoadPending).toBe(false);
        expect(store.isLoading).toBe(false);
        expect(changes).toEqual([true, false])
    });

    for (const transport of ['pipeline', 'api']) {
        for (const outcome of ['success', 'empty', 'rejection']) {
            test(`${transport} clears pending after ${outcome} and preserves its result`, async () => {
                const read      = deferred(), store = await makeStore(transport, () => read.promise),
                      {changes} = observe(store), error = new Error('controlled read failure');
                const loading = store.load();
                expect(store.isLoadPending).toBe(true);

                if (outcome === 'rejection') {
                    const rejected = expect(loading).rejects.toBe(error);
                    read.reject(error);
                    await rejected
                } else {
                    read.resolve(outcome === 'empty' ? (transport === 'api' ? {success: false} : null) :
                        {success: true, data: [{id: 1, name: 'loaded'}], totalCount: 1});
                    expect(await loading).toEqual(outcome === 'empty' ? null : transport === 'api' ? store.data : store.items)
                }
                expect(store.isLoadPending).toBe(false);
                expect(store.isLoading).toBe(false);
                expect(changes).toEqual([true, false])
            })
        }

        test(`${transport} remains pending when a newer overlapping invocation settles first`, async () => {
            const first = deferred(), second = deferred(), reads = [first, second],
                  store = await makeStore(transport, () => reads.shift().promise), {changes} = observe(store),
                  error = new Error('older request rejected');
            const older = store.load(), newer = store.load();
            expect(store.isLoadPending).toBe(true);
            second.resolve(transport === 'api' ? {success: false} : null);
            expect(await newer).toBe(null);
            expect(store.isLoadPending).toBe(true);
            expect(changes).toEqual([true]);

            const rejected = expect(older).rejects.toBe(error);
            first.reject(error);
            await rejected;
            expect(store.isLoadPending).toBe(false);
            expect(changes).toEqual([true, false])
        })
    }

    for (const rejects of [false, true]) {
        test(`URL pipeline readiness is pending before a read, including rejection=${rejects}`, async () => {
            const readiness = deferred(), read = deferred(), entered = deferred(),
                  store     = await makeStore('pipeline', () => {entered.resolve(); return read.promise}),
                  {changes} = observe(store), error = new Error('pipeline import failed');
            store.urlPipelinePromise = readiness.promise;
            const loading = store.load();
            expect(store.isLoadPending).toBe(true);
            expect(store.isLoading).toBe(false);

            if (rejects) {
                const rejected = expect(loading).rejects.toBe(error);
                readiness.reject(error);
                await rejected
            } else {
                readiness.resolve();
                await entered.promise;
                expect(store.isLoadPending).toBe(true);
                read.resolve(null);
                expect(await loading).toBe(null)
            }
            expect(store.isLoadPending).toBe(false);
            expect(changes).toEqual([true, false])
        })
    }

    test('Node filesystem fallback publishes pending and keeps its JSON return value', async () => {
        const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'store-load-pending-')),
              file   = path.join(folder, 'data.json'), rows = [{id: 1, name: 'disk'}];
        folders.push(folder);
        fs.writeFileSync(file, JSON.stringify(rows));
        const store = await makeStore('api'), {changes} = observe(store);
        store.api = null; // The API path constructed no Pipeline, exposing the existing Node fallback.
        expect(store.pipeline).toBe(null);

        const loading = store.load({url: file});
        expect(store.isLoadPending).toBe(true);
        expect(await loading).toEqual(rows);
        expect(store.get(1).name).toBe('disk');
        expect(store.isLoadPending).toBe(false);
        expect(changes).toEqual([true, false])
    });

    test('released and destroyed observers receive no late completion', async () => {
        const read     = deferred(), store = await makeStore('pipeline', () => read.promise),
              released = observe(store), destroyed = observe(store);
        const loading = store.load();
        expect(released.changes).toEqual([true]);
        expect(destroyed.changes).toEqual([true]);
        released.release();
        destroyed.observer.destroy();
        read.resolve(null);
        await loading;
        expect(store.isLoadPending).toBe(false);
        expect(released.changes).toEqual([true]);
        expect(destroyed.changes).toEqual([true])
    });

    test('destroying an API Store preserves the destroy rejection without late pending notifications', async () => {
        const read    = deferred(), store = await makeStore('api', () => read.promise), {changes} = observe(store);
        const loading = store.load(), rejected = expect(loading).rejects.toBe(Neo.isDestroyed);
        expect(store.isLoadPending).toBe(true);
        store.destroy();
        const countAtDestroy = changes.length;
        await rejected;
        read.resolve({success: true, data: []});
        await read.promise;
        expect(changes.length).toBe(countAtDestroy)
    });
});
