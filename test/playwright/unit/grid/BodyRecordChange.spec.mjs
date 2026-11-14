/**
 * @file test/playwright/unit/grid/BodyRecordChange.spec.mjs
 * @summary A body locates a changed record in its row pool instead of asking the store for an index.
 *
 * `onStoreRecordChange` only needs to know whether the changed record is one of the rows it
 * currently renders. Looking the record up in the store scans every visible row and repeats work
 * the store already paid for while publishing the event.
 *
 * @see Neo.grid.Body#onStoreRecordChange
 * @see https://github.com/neomjs/neo/issues/20855
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
        name             : 'GridBodyRecordChangeTest',
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import GridBody       from '../../../../src/grid/Body.mjs';
import Store          from '../../../../src/data/Store.mjs';

/**
 * @summary The grid body's record-change lookup must stay inside its pooled rows.
 */
test.describe('Neo.grid.Body recordChange repaint (#20855)', () => {
    let body, store;

    test.beforeEach(async () => {
        store = Neo.create(Store, {
            data: Array.from({length: 10}, (_, i) => ({id: i + 1, name: 'row ' + (i + 1)}))
        });

        await store.ready();

        body = Neo.create(GridBody, {
            appName: 'GridBodyRecordChangeTest',
            store
        })
    });

    test.afterEach(() => {
        body.items = [];
        body.destroy();
        store.destroy()
    });

    const createRow = record => ({
        record,
        repaints: 0,
        createVdom() {
            this.repaints++
        },
        destroy() {}
    });

    const trackIndexLookups = () => {
        const original = store.indexOf;
        let   calls    = 0;

        store.indexOf = function (...args) {
            calls++;
            return original.apply(this, args)
        };

        return () => calls
    };

    test('repaints the pooled row that holds the changed record without an index lookup', () => {
        const rows         = [createRow(store.getAt(0)), createRow(store.getAt(1))],
              indexLookups = trackIndexLookups();

        body.items       = rows;
        body.mountedRows = [0, 1];

        body.onStoreRecordChange({fields: [{name: 'name'}], record: store.getAt(1)});

        expect(rows[0].repaints, 'the untouched row stays put').toBe(0);
        expect(rows[1].repaints, 'the changed row repainted').toBe(1);
        expect(indexLookups(), 'the body never asked the store for a position').toBe(0)
    });

    test('leaves the pool untouched for a record it does not render', () => {
        const rows         = [createRow(store.getAt(0)), createRow(store.getAt(1))],
              indexLookups = trackIndexLookups();

        body.items       = rows;
        body.mountedRows = [0, 1];

        body.onStoreRecordChange({fields: [{name: 'name'}], record: store.getAt(5)});

        expect(rows[0].repaints + rows[1].repaints).toBe(0);
        expect(indexLookups()).toBe(0)
    });

    test('a colspanField change still rebuilds the view data', () => {
        const indexLookups = trackIndexLookups();

        let rebuilds = 0;

        body.createViewData = () => rebuilds++;

        body.onStoreRecordChange({fields: [{name: 'colspan'}], record: store.getAt(2)});

        expect(rebuilds).toBe(1);
        expect(indexLookups()).toBe(0)
    })
});
