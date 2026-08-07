import {setup} from '../../setup.mjs';

const appName = 'StoreSortLoadContractTest';

setup({
    appConfig: {
        name: appName
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Model          from '../../../../src/data/Model.mjs';
import Store          from '../../../../src/data/Store.mjs';

/**
 * Pins `Store.onCollectionSort` re-firing a sort as a `load`.
 *
 * This looks like a conflation — `sort` and `load` are separate events, and the store fires both for one
 * action. It is deliberate: `load` is the coarse change-notification, `sort` the fine-grained one, and
 * several consumers bind `load` ALONE and react to a sort only because of this fire —
 * `form.field.ComboBox`, `toolbar.Paging`, `table.Container`, and critically `table.Body` + `grid.Body`,
 * the row-rendering surfaces of both data grids.
 *
 * Suppressing it stops all of them updating on a sort with no error and no failing test, which is exactly
 * why the behaviour needs a spec rather than a comment.
 */
test.describe('Neo.data.Store sort/load notification contract', () => {
    let store;

    test.beforeEach(() => {
        store = Neo.create(Store, {
            keyProperty: 'id',
            model      : {
                module: Model,
                fields: [
                    {name: 'id',   type: 'String'},
                    {name: 'name', type: 'String'}
                ]
            },
            items: [
                {id: '1', name: 'charlie'},
                {id: '2', name: 'alpha'},
                {id: '3', name: 'bravo'}
            ]
        })
    });

    test('a sort re-fires as a load, so a consumer binding load alone still sees it', () => {
        let loadFires = 0;

        // Deliberately NO `sort` listener: this is the ComboBox / Paging / table.Body shape.
        store.on({load: () => loadFires++});

        store.sort({direction: 'ASC', property: 'name'});

        expect(loadFires).toBe(1);
    });

    test('the load carries the re-ordered items, not the pre-sort ones', () => {
        let received = null;

        store.on({load: data => received = data.items});

        store.sort({direction: 'ASC', property: 'name'});

        // A consumer that rebuilds from this payload must get the NEW order, otherwise binding `load`
        // alone would leave it rendering stale order — which is what makes the coarse notification
        // sufficient for the consumers that rely on it.
        expect(received.map(record => record.name)).toEqual(['alpha', 'bravo', 'charlie']);
    });

    test('both events fire for one sort, and the store\'s own listener runs before any consumer\'s', () => {
        const order = [];

        // A component binds AFTER the store, which registers its collection listener in construct().
        // That ordering is why a component's `sort` handler always runs against a view its `load`
        // handler has already rebuilt — the property that made Gallery's second handler unreachable.
        store.on({
            load: () => order.push('load'),
            sort: () => order.push('sort')
        });

        store.sort({direction: 'ASC', property: 'name'});

        expect(order).toEqual(['load', 'sort']);
    })
});
