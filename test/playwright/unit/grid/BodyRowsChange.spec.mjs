/**
 * @file test/playwright/unit/grid/BodyRowsChange.spec.mjs
 * @summary A body repaints a store batch's mounted rows in one forced pass, never through the load path that
 * scrolls the view to the top, and leaves the batch's own `recordChange` events to that pass.
 *
 * @see Neo.grid.Body#onStoreRowsChange
 * @see Neo.data.Store#updateRows
 * @see https://github.com/neomjs/neo/issues/20968
 */

import {setup} from '../../setup.mjs';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        unitTestMode           : true,
        useDomApiRenderer      : true,
        useVdomWorker          : false
    },
    appConfig: {
        name             : 'GridBodyRowsChangeTest',
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import GridBody       from '../../../../src/grid/Body.mjs';
import Model          from '../../../../src/data/Model.mjs';
import Store          from '../../../../src/data/Store.mjs';

/**
 * @summary The grid body follows a store batch with one repaint of the rows it renders.
 */
test.describe('Neo.grid.Body rowsChange repaint (#20968)', () => {
    let body, loads, passes, rows, store, updates;

    const createRow = record => ({
        record,
        repaints: [],
        createVdom(...args) {
            this.repaints.push(args)
        },
        destroy() {}
    });

    test.beforeEach(async () => {
        store = Neo.create(Store, {
            autoInitRecords: false,
            data           : Array.from({length: 10}, (_, i) => ({id: i + 1, name: 'row ' + (i + 1)})),
            model          : {module: Model, fields: [
                {name: 'id', type: 'Integer'}, {name: 'name', type: 'String'}, {name: 'colspan'}
            ]}
        });

        await store.ready();

        body = Neo.create(GridBody, {
            appName: 'GridBodyRowsChangeTest',
            store
        });

        // the body renders the first two rows: they are records, the other eight stay raw
        rows             = [createRow(store.getAt(0)), createRow(store.getAt(1))];
        body.items       = rows;
        body.mountedRows = [0, 1];

        passes  = [];
        loads   = 0;
        updates = 0;
        body.createViewData = (...args) => passes.push(args);
        body.update         = () => updates++;
        store.on('load', () => loads++)
    });

    test.afterEach(() => {
        body.isVdomUpdating = false;
        body.items = [];
        body.destroy();
        store.destroy()
    });

    test('a batch repaints the mounted rows it changed in one update, never through the load path', () => {
        store.updateRows([{key: 2, values: {name: 'changed'}}, {key: 7, values: {name: 'changed'}}]);

        expect(rows.map(row => row.repaints), 'the changed row rebuilt silently, without recycling').toEqual([[], [[true, false]]]);
        expect(updates, 'one update carries the batch').toBe(1);
        expect(passes, 'no view-data pass').toEqual([]);
        expect(loads, 'no load, so no scroll to the top').toBe(0)
    });

    test('a batch rebuilds its rows at once while an update is in flight', () => {
        // createViewData() would defer the pass past this flight, after AnimatedChange marked the cells it found
        body.isVdomUpdating = true;

        store.updateRows([{key: 1, values: {name: 'changed'}}]);

        expect(rows.map(row => row.repaints)).toEqual([[[true, false]], []]);
        expect(passes).toEqual([])
    });

    test('a batch that changed no mounted row repaints nothing', () => {
        store.updateRows([{key: 7, values: {name: 'changed'}}, {key: 8, values: {name: 'changed'}}]);

        expect(rows.map(row => row.repaints)).toEqual([[], []]);
        expect([updates, passes.length]).toEqual([0, 0])
    });

    test('a batch that changed the colspan field rebuilds the view data, forced', () => {
        store.updateRows([{key: 7, values: {colspan: {name: 2}}}]);

        expect(passes).toEqual([[false, true]])
    });

    test('a single edit outside a batch still repaints its own row', () => {
        rows[1].record.name = 'changed';

        expect(rows.map(row => row.repaints.length)).toEqual([0, 1]);
        expect(passes).toEqual([])
    })
});
