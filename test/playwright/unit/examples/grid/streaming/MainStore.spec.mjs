import {setup} from '../../../../setup.mjs';

setup({
    appConfig: {name: 'GridStreamingUnitTest'},
    neoConfig: {allowVdomUpdatesInTests: true, useDomApiRenderer: true, useVdomWorker: false}
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';
import '../../../../../../src/manager/Instance.mjs';
import VdomHelper    from '../../../../../../src/vdom/Helper.mjs';
import FooterToolbar from '../../../../../../examples/grid/streaming/FooterToolbar.mjs';
import MainStore     from '../../../../../../examples/grid/streaming/MainStore.mjs';
import {
    SEED, TOTAL_ROWS, buildSettlementLine
}                            from '../../../../../../examples/grid/streaming/StreamConnection.mjs';
import {createSeededRandom}  from '../../../../../../src/util/Random.mjs';

/**
 * @summary Unit coverage for the streaming 50k grid store, deterministic row generation, and progress footer.
 */
test.describe('Neo.examples.grid.streaming.MainStore & FooterToolbar', () => {
    let owned;

    test.beforeEach(() => {
        owned = []
    });

    test.afterEach(() => {
        owned.reverse().forEach(instance => instance?.destroy())
    });

    /**
     * @summary Builds an isolated store and footer toolbar pair with controllable chunk delay.
     * @param {Object} [options={}]
     * @param {Boolean} [options.autoLoad=false]
     * @param {Number} [options.chunkDelay=15]
     * @param {Number} [options.initialDelay=0]
     * @returns {Promise<{footer: Neo.examples.grid.streaming.FooterToolbar, store: Neo.examples.grid.streaming.MainStore}>}
     */
    async function createHarness({autoLoad=false, chunkDelay=15, initialDelay=0}={}) {
        const store = Neo.create(MainStore, {
            autoLoad
        });

        owned.push(store);
        await store.ready();
        await store.pipeline.ready();
        await store.pipeline.connection.ready();
        await store.pipeline.parser.ready();

        store.pipeline.connection.set({
            chunkDelay,
            initialDelay
        });

        const footer = Neo.create(FooterToolbar, {
            appName: 'GridStreamingUnitTest',
            store
        });

        owned.push(footer);
        await footer.ready();
        await footer.initVnode();
        footer.mounted = true;

        return {footer, store}
    }

    test('produces deterministic seeded NDJSON settlement rows anchored at STL-100001', () => {
        const
            randomA = createSeededRandom(SEED),
            randomB = createSeededRandom(SEED),
            rowA0   = JSON.parse(buildSettlementLine(0, randomA)),
            rowA1   = JSON.parse(buildSettlementLine(1, randomA)),
            rowB0   = JSON.parse(buildSettlementLine(0, randomB));

        expect(rowA0).toEqual(rowB0);
        expect(rowA0.id).toBe(1);
        expect(rowA0.settlementId).toBe('STL-100001');
        expect(rowA1.id).toBe(2);
        expect(rowA1.settlementId).toBe('STL-100002')
    });

    test('streams 50,000 rows progressively with isStreaming true mid-flight and drives FooterToolbar progress', async () => {
        const
            {footer, store} = await createHarness({chunkDelay: 20}),
            label           = footer.getItem('statusLabel'),
            progressBar     = footer.getItem('progressBar'),
            midSnapshots    = [],
            progressEvents  = [];

        store.on('load', data => {
            if (store.isStreaming) {
                midSnapshots.push({
                    count      : store.getCount(),
                    isStreaming: store.isStreaming,
                    labelText  : label.text,
                    postChunk  : Boolean(data?.postChunkLoad),
                    progressVal: progressBar.value
                })
            }
        });

        store.on('progress', data => {
            progressEvents.push(data)
        });

        await store.load();

        expect(midSnapshots.length).toBeGreaterThan(2);
        expect(midSnapshots[0].count).toBeGreaterThan(0);
        expect(midSnapshots[0].count).toBeLessThan(TOTAL_ROWS);
        expect(midSnapshots.some(snap => snap.count > 0 && snap.count < TOTAL_ROWS && snap.isStreaming)).toBe(true);
        expect(midSnapshots.some(snap => snap.labelText.startsWith('Streaming '))).toBe(true);
        expect(progressEvents.length).toBeGreaterThan(0);

        expect(store.isStreaming).toBe(false);
        expect(store.getCount()).toBe(TOTAL_ROWS);
        expect(store.items[0].settlementId).toBe('STL-100001');
        expect(store.items[TOTAL_ROWS - 1].settlementId).toBe(`STL-${100000 + TOTAL_ROWS}`);
        expect(label.text).toBe('50,000 / 50,000 rows');
        expect(progressBar.value).toBe(TOTAL_ROWS)
    });

    test('reloadStream aborts a mid-flight stream, clears to 0 with footer sync, and streams a clean 50,000 rows', async () => {
        const
            {footer, store}  = await createHarness({chunkDelay: 25, initialDelay: 30}),
            label            = footer.getItem('statusLabel'),
            progressBar      = footer.getItem('progressBar'),
            clearedSnapshots = [];

        store.on('mutate', () => {
            if (store.getCount() === 0) {
                clearedSnapshots.push({
                    count      : store.getCount(),
                    labelText  : label.text,
                    progressVal: progressBar.value
                })
            }
        });

        const firstLoad = store.load();

        await expect.poll(() => store.getCount()).toBeGreaterThan(0);
        expect(store.isStreaming).toBe(true);
        expect(store.getCount()).toBeLessThan(TOTAL_ROWS);

        await store.reloadStream();
        await firstLoad.catch(() => {});

        expect(clearedSnapshots.length).toBeGreaterThanOrEqual(1);
        expect(clearedSnapshots[0].count).toBe(0);
        expect(clearedSnapshots[0].progressVal).toBe(0);
        expect(clearedSnapshots[0].labelText).toMatch(/0 \/ 50,000 rows$/);
        expect(store.isStreaming).toBe(false);
        expect(store.getCount()).toBe(TOTAL_ROWS);
        expect(store.items[0].settlementId).toBe('STL-100001');
        expect(label.text).toBe('50,000 / 50,000 rows');
        expect(progressBar.value).toBe(TOTAL_ROWS);

        const listenerCount = () => {
            const eventMap = store[Object.getOwnPropertySymbols(store).find(symbol => symbol.description === 'eventMap')] || {};
            return ['filter', 'load', 'mutate', 'progress'].reduce(
                (sum, eventName) => sum + (eventMap[eventName] || []).filter(listener => listener.scope === footer).length,
                0
            )
        };

        expect(listenerCount()).toBe(4);
        footer.destroy();
        expect(listenerCount()).toBe(0)
    });
});
