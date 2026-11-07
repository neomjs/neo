import {setup} from '../../setup.mjs';

setup({
    appConfig: {name: 'StoreStreamingTest'},
    neoConfig: {allowVdomUpdatesInTests: true, useDomApiRenderer: true, useVdomWorker: false}
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Store          from '../../../../src/data/Store.mjs';
import Connection     from '../../../../src/data/connection/Base.mjs';
import StreamParser   from '../../../../src/data/parser/Stream.mjs';
import Normalizer     from '../../../../src/data/normalizer/Base.mjs';
import Grid           from '../../../../src/grid/Container.mjs';
import VdomHelper     from '../../../../src/vdom/Helper.mjs';

/** @summary A real stream parser delivers independently controlled batches to its receiving Store. */
test.describe('Store progressive read lifetime', () => {
    let owned, controllers;

    test.beforeEach(() => {owned = []; controllers = []});
    test.afterEach(() => {
        controllers.forEach(controller => {try {controller.close()} catch {}});
        owned.reverse().forEach(instance => instance.destroy())
    });

    const create = async () => {
        let controller;
        const stream = new ReadableStream({start(value) {controller = value}}),
              store  = Neo.create(Store, {
                  model   : {fields: [{name: 'id'}, {name: 'name'}]},
                  pipeline: {
                      connection: {module: Connection},
                      parser    : {module: StreamParser, initialChunkSize: 1, chunkSize: 1, initialBurstCount: 0}
                  }
              });
        owned.push(store);
        controllers.push(controller);
        await store.ready();
        await store.pipeline.ready();
        await store.pipeline.parser.ready();
        store.pipeline.connection.read = async () => ({stream, total: 0});
        return {store, controller, stream}
    };
    const send = (controller, id) => controller.enqueue(new TextEncoder().encode(
        JSON.stringify({id, name: 'Record ' + id}) + '\n'));

    test('later parser chunks preserve a mounted grid while ordinary replacement still resets it', async () => {
        const {store, controller} = await create(), loads = [], resets = [],
              originalScroll      = Neo.main.DomAccess.scrollTo,
              grid                = Neo.create(Grid, {
                  appName: 'StoreStreamingTest', height: 200, width: 600, rowHeight: 40, store,
                  columns: [{dataField: 'name', text: 'Name', width: 300}]
              });
        owned.push(grid);
        await grid.ready();
        await grid.initVnode();
        grid.mounted = grid.body.mounted = true;
        await grid.timeout(80);
        Neo.main.DomAccess.scrollTo = async config => resets.push(config);
        store.on('load', event => loads.push({count: store.count, ...event}));

        try {
            const loading = store.load();
            send(controller, 1);
            await expect.poll(() => store.count).toBe(1);
            expect(store.isStreaming).toBe(true);
            await grid.timeout(80);
            resets.length = 0;
            loads.length = 0;

            for (const id of [2, 3]) {
                send(controller, id);
                await expect.poll(() => store.count).toBe(id);
                expect(store.isStreaming).toBe(true)
            }
            controller.close();
            await loading;
            await grid.timeout(80);
            expect(store.isStreaming).toBe(false);
            expect(loads.map(event => event.postChunkLoad)).toEqual([true, true, true]);
            expect(resets).toEqual([]);

            store.data = [{id: 4, name: 'Replacement'}];
            await grid.timeout(80);
            expect(resets).toContainEqual(expect.objectContaining({direction: 'top', value: 0}));
            expect(store.isStreaming).toBe(false)
        } finally {
            Neo.main.DomAccess.scrollTo = originalScroll
        }
    });

    for (const terminal of ['success', 'error', 'abort']) {
        test(`a ${terminal} terminal releases streaming before its caller resumes`, async () => {
            const {store, controller} = await create(),
                  reason              = terminal === 'abort' ? new DOMException('Stopped', 'AbortError') : new Error('Refused'),
                  loading             = store.load();
            const result = terminal === 'error' ? expect(loading).rejects.toBe(reason) : loading;
            send(controller, 1);
            await expect.poll(() => store.count).toBe(1);
            expect(store.isStreaming).toBe(true);
            if (terminal === 'success') controller.close();
            else controller.error(reason);
            await result;
            expect(store.isStreaming).toBe(false);
            expect(store.isLoadPending).toBe(false)
        })
    }

    test('an empty stream never starts streaming state', async () => {
        const {store, controller} = await create(), loading = store.load();
        expect(store.isStreaming).toBe(false);
        controller.close();
        await loading;
        expect(store.isStreaming).toBe(false);
        expect(store.count).toBe(0)
    });

    test('a null normalized terminal releases state without discarding rendered chunks', async () => {
        const {store, controller} = await create();
        store.pipeline.normalizer = {module: Normalizer};
        store.pipeline.normalizer.normalize = () => null;
        const loading = store.load();
        send(controller, 1);
        await expect.poll(() => store.count).toBe(1);
        expect(store.isStreaming).toBe(true);
        controller.close();
        expect(await loading).toBe(null);
        expect(store.count).toBe(1);
        expect(store.isStreaming).toBe(false)
    });

    for (const firstSettled of [0, 1]) {
        test(`settling overlapping read ${firstSettled} does not clear the other stream`, async () => {
            const first = await create(), {store} = first;
            let secondController;
            const secondStream = new ReadableStream({start(value) {secondController = value}}),
                  streams      = [first.stream, secondStream],
                  controls     = [first.controller, secondController];
            controllers.push(secondController);
            store.pipeline.connection.read = async () => ({stream: streams.shift(), total: 0});
            const reads = [store.load(), store.load({append: true})];
            send(controls[0], 1);
            send(controls[1], 2);
            await expect.poll(() => store.count).toBe(2);
            expect(store.isStreaming).toBe(true);

            controls[firstSettled].close();
            await reads[firstSettled];
            expect(store.isStreaming).toBe(true);
            expect(store.isLoadPending).toBe(true);
            send(controls[1 - firstSettled], 3);
            await expect.poll(() => store.count).toBe(3);
            controls[1 - firstSettled].close();
            await reads[1 - firstSettled];
            expect(store.isStreaming).toBe(false);
            expect(store.isLoadPending).toBe(false)
        })
    }

    test('destruction releases the flag and a late stream publishes nothing', async () => {
        const {store, controller} = await create(), late = [], fire = store.fire,
              loading             = store.load(), rejected = expect(loading).rejects.toBe(Neo.isDestroyed);
        store.fire = function(event, ...args) {
            if (this.isDestroyed && ['load', 'progress'].includes(event)) late.push(event);
            return fire.call(this, event, ...args)
        };
        send(controller, 1);
        await expect.poll(() => store.count).toBe(1);
        expect(store.isStreaming).toBe(true);
        store.destroy();
        expect(store.isStreaming).toBe(false);
        send(controller, 2);
        controller.close();
        await rejected;
        expect(store.isStreaming).toBe(false);
        expect(late).toEqual([])
    });
});
