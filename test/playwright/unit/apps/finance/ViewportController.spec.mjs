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
    })
});
