import {setup} from '../../../setup.mjs';

setup({
    appConfig: {
        name: 'FinanceControllerTest'
    }
});

import {test, expect}     from '@playwright/test';
import fs                 from 'node:fs';
import path               from 'node:path';
import {fileURLToPath}    from 'node:url';
import Neo                from '../../../../../src/Neo.mjs';
import * as core          from '../../../../../src/core/_export.mjs';
import CompaniesStore     from '../../../../../apps/finance/store/Companies.mjs';
import GridContainer      from '../../../../../apps/finance/view/GridContainer.mjs';
import ViewportController from '../../../../../apps/finance/view/ViewportController.mjs';

const
    directory = path.dirname(fileURLToPath(import.meta.url)),
    repoRoot  = path.resolve(directory, '../../../../../'),
    fixtures  = JSON.parse(fs.readFileSync(path.join(repoRoot, 'apps/finance/resources/data/companies.json'), 'utf8'));

/**
 * @summary Builds a filterable Finance store + controller harness without DOM mounting.
 * @returns {{controller: Finance.view.ViewportController, store: Finance.store.Companies, state: Object, destroy: Function}}
 */
function createHarness() {
    const
        store      = Neo.create(CompaniesStore, {autoLoad: false, data: structuredClone(fixtures)}),
        state      = {},
        bulkCalls  = [],
        controller = Neo.create(ViewportController, {component: {isConstructed: true, parent: null}});

    controller.getStore     = key => key === 'companies' ? store : null;
    controller.getReference = ref => ref === 'grid' ? {bulkUpdateRecords: items => bulkCalls.push(items)} : {disabled: false};
    controller.setState     = next => Object.assign(state, next);

    return {bulkCalls, controller, destroy() {controller.destroy(); store.destroy()}, state, store}
}

test.describe('Finance.view.ViewportController', () => {
    let harness;

    test.afterEach(() => {
        harness?.destroy();
        harness = null
    });

    test('seeds deterministic opening quotes across every equity and starts the live ticker', () => {
        harness = createHarness();

        const {bulkCalls, controller, state, store} = harness,
              firstA                                = controller.seedQuote('AAPL', 10),
              firstB                                = controller.seedQuote('AAPL', 10);

        expect(firstA).toEqual(firstB);
        expect(firstA.value).toBeGreaterThanOrEqual(45);
        expect(firstA.volume).toBeGreaterThanOrEqual(2_400_000);

        controller.onCompaniesStoreLoad();

        expect(bulkCalls).toHaveLength(1);
        expect(bulkCalls[0]).toHaveLength(store.getCount());
        expect(state).toEqual({
            feedRunning : true,
            totalCount  : store.getCount(),
            visibleCount: store.getCount()
        });
        const activeIntervalId = controller.intervalId,
              clearedIds       = [],
              origClear        = globalThis.clearInterval;

        expect(activeIntervalId).not.toBeNull();
        globalThis.clearInterval = id => { clearedIds.push(id); return origClear(id) };
        try {
            controller.destroy()
        } finally {
            globalThis.clearInterval = origClear
        }

        expect(clearedIds).toContain(activeIntervalId);
        expect(controller.isDestroyed).toBe(true);
        expect(controller.intervalId).toBeUndefined();
        harness = null
    });

    test('narrows rows with SearchFilter across symbol, name, and sector while keeping updateRecord() bounds-safe', () => {
        harness = createHarness();

        const {controller, state, store} = harness;
        controller.onCompaniesStoreLoad();

        store.forEach((record, index) => record.setSilent(controller.seedQuote(record.symbol, index)));

        controller.onSearchChange({value: 'nvidia'});
        controller.onCompaniesStoreFilter();
        expect(store.items.map(record => record.symbol)).toEqual(['NVDA']);
        expect(state.visibleCount).toBe(1);

        expect(() => controller.updateRecord()).not.toThrow();

        controller.onSearchChange({value: 'zzznomatch'});
        controller.onCompaniesStoreFilter();
        expect(store.getCount()).toBe(0);
        expect(state.visibleCount).toBe(0);
        expect(() => controller.updateRecord()).not.toThrow();

        controller.onSearchChange({value: ''});
        controller.onCompaniesStoreFilter();
        expect(state.visibleCount).toBe(fixtures.length)
    });

    test('keeps change and changePercent anchored to priorClose across clamped ticks while Price flash follows tickDelta', () => {
        harness = createHarness();

        const {controller, store} = harness;
        store.forEach((record, index) => record.setSilent(controller.seedQuote(record.symbol, index)));

        // Every seeded quote derives change & changePercent consistently from value - priorClose
        store.forEach(record => {
            expect(record.change, record.symbol).toBe(Number((record.value - record.priorClose).toFixed(2)));
            expect(record.changePercent, record.symbol).toBe(Number(((record.change / record.priorClose) * 100).toFixed(2)))
        });

        // Pin to one record so updateRecord() hits it deterministically
        controller.onSearchChange({value: 'NVDA'});
        const target = store.getAt(0);
        target.setSilent({priorClose: 10, tickDelta: 0, value: 6.2, change: -3.8, changePercent: -38, volume: 1000});

        const origRandom = Math.random;
        Math.random = () => 0; // rawDelta = -4 -> clamps to floor 5 (actual move = -1.2)
        try {
            controller.updateRecord()
        } finally {
            Math.random = origRandom
        }

        expect(target.value).toBe(5);
        expect(target.priorClose).toBe(10);
        expect(target.tickDelta).toBe(-1.2);
        expect(target.change).toBe(-5);
        expect(target.changePercent).toBe(-50);
        expect(target.volume).toBe(1000 + Math.round(1.2 * 12500));

        // Positive day change with a negative tick: day change stays +9 while Price flash follows tickDelta (-1)
        target.setSilent({priorClose: 10, tickDelta: 0, value: 20, change: 10, changePercent: 100});
        Math.random = () => 0.375; // 0.375 * 8 - 4 = -1
        try {
            controller.updateRecord()
        } finally {
            Math.random = origRandom
        }

        expect(target.value).toBe(19);
        expect(target.change).toBe(9);
        expect(target.changePercent).toBe(90);
        expect(target.tickDelta).toBe(-1);

        const priceCol = GridContainer.config.columns.find(col => col.dataField === 'value');
        expect(priceCol.compareField).toBe('tickDelta');
        expect(target[priceCol.compareField]).toBe(-1)
    })
});
