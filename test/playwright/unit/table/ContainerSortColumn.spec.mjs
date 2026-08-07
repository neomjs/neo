import {setup} from '../../setup.mjs';

const appName = 'TableContainerSortColumnTest';

setup({
    appConfig: {
        name: appName
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import CoreBase       from '../../../../src/core/Base.mjs';
import Model          from '../../../../src/data/Model.mjs';
import Store          from '../../../../src/data/Store.mjs';
import TableContainer from '../../../../src/table/Container.mjs';

/**
 * Guards `table.Container#onSortColumn` driving the body's re-render exactly once.
 *
 * `me.store.sort()` runs synchronously into `Store.onCollectionSort`, which re-fires the sort as a
 * `load` — and `table.Body` binds that event itself. The method used to call `me.body.onStoreLoad()`
 * on top of that, so the full row rebuild ran twice on every column-header sort. `grid.Container`
 * never made that call, which is what showed the event path is sufficient on its own.
 *
 * The regression this exists to catch is someone re-adding the explicit call "so the body updates" —
 * it already did.
 */

/**
 * @summary A real Neo instance standing in for `table.Body`, counting its `onStoreLoad` invocations.
 *
 * Deliberately NOT a plain object: `Observable#addListener` resolves a `scope` back through the
 * instance manager, so a scoped listener bound to a scope-less literal never fires at all. A stub that
 * cannot receive the event would make every count below vacuously low, and the spec would pass against
 * the very defect it exists to catch.
 */
class TestTableBody extends CoreBase {
    static config = {
        className: 'Test.Unit.Table.SortColumn.CountingBody'
    }

    loadCalls     = 0;
    orderAtRender = null;
    store         = null;

    onStoreLoad() {
        this.loadCalls++;
        this.orderAtRender = this.store.items.map(record => record.name)
    }
}

TestTableBody = Neo.setupClass(TestTableBody);

test.describe('Neo.table.Container column sorting', () => {
    let body, container, store;

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
        });

        body       = Neo.create(TestTableBody);
        body.store = store;

        // The real binding from `table.Body#afterSetStore` — `load` only, no `sort`.
        store.on({load: body.onStoreLoad, scope: body});

        // A plain object for the container: `onSortColumn` is invoked via `.call`, and it only reads
        // `store`, `body` and `removeSortingCss`. `Object.create(TableContainer.prototype)` does NOT
        // work — Neo's Base keeps config state in a private field, so property access on a
        // prototype-only object throws before the method body runs.
        container = {
            body,
            store,
            removeSortingCss() {}
        }
    });

    test('CONTROL: the store sort alone already re-renders the body', () => {
        // Non-vacuity guard for the assertions below. If the event path did NOT drive the body, then
        // "exactly once" would be satisfied by an explicit call alone, and this spec would go green
        // against the defect it exists to catch.
        store.sort({direction: 'ASC', property: 'name'});

        expect(body.loadCalls).toBe(1);
    });

    test('a column-header sort re-renders the body exactly once, not twice', () => {
        TableContainer.prototype.onSortColumn.call(container, {direction: 'ASC', property: 'name'});

        expect(body.loadCalls).toBe(1);
    });

    test('the UN-sort re-renders the body too, through the event path alone', () => {
        TableContainer.prototype.onSortColumn.call(container, {direction: 'ASC', property: 'name'});
        expect(body.loadCalls).toBe(1);

        // `direction` falsy is the un-sort branch. The removed line was guarded by `opts.direction`, so
        // it never ran here — which is exactly why a spec exercising only the sorted branch cannot show
        // that the un-sort still re-renders. It does, off the same `load` event, and always did.
        //
        // Asserted on the re-render, NOT on the resulting record order: restoring insertion order is a
        // separate mechanism (`Store#sort` sorts by the `initialIndex` symbol, which `collection.Base`
        // stamps only onto items that opt in) and this fixture's records do not carry it. Pinning an
        // order here would test that mechanism through a fixture that never exercises it.
        TableContainer.prototype.onSortColumn.call(container, {property: 'name'});

        expect(body.loadCalls).toBe(2);
    });

    test('the single re-render sees the store already sorted', () => {
        TableContainer.prototype.onSortColumn.call(container, {direction: 'ASC', property: 'name'});

        // Dropping the explicit trailing call is only safe because the event fires AFTER the collection
        // has been re-ordered. If it fired first, removing that call would leave the body on stale order.
        expect(body.orderAtRender).toEqual(['alpha', 'bravo', 'charlie']);
        expect(body.loadCalls).toBe(1);
    })
});
