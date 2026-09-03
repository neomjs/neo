import {setup} from '../../setup.mjs';

setup({
    appConfig: {name: 'GridNativeDragFieldsTest'}
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Body           from '../../../../src/grid/Body.mjs';
import Store          from '../../../../src/data/Store.mjs';

/**
 * @summary The record values a native drag payload reads, keyed by row node id.
 *
 * `nativeDragZone` payload templates could only read DOM attributes, so putting a business id on
 * the clipboard meant putting it in the DOM first — which for a grid meant `useInternalId: false`,
 * because `getRecordId` otherwise writes neo's own `neo-record-N` into the row identity and the
 * payload silently carries that instead. `internalId` was adopted deliberately for stable DOM
 * keying, so the pairing asked a consumer to opt out of that architecture to use an unrelated
 * feature. These arms are the decoupling: the value is read from the STORE, in the worker where
 * the record lives, and pushed to the addon ahead of any gesture.
 *
 * The methods are borrowed onto a plain object for the reason `BodyCellMapping.spec.mjs` gives —
 * `Object.create(Body.prototype)` trips the reactive config system's private-brand check, and
 * these methods only read `mountedRows`, `store` and `getRowId`.
 *
 * @see https://github.com/neomjs/neo/issues/18113
 */
test.describe('Neo.grid.Body#getNativeDragFields', () => {
    let store;

    test.beforeEach(() => {
        const data = [];

        for (let i = 0; i < 40; i++) {
            data.push({id: `CNET-${i}`, name: `Concept ${i}`, score: i * 10})
        }

        store = Neo.create(Store, {
            data,
            keyProperty: 'id',
            model      : {
                fields: [
                    {name: 'id',    type: 'String'},
                    {name: 'name',  type: 'String'},
                    {name: 'score', type: 'Integer'}
                ]
            }
        })
    });

    test.afterEach(() => {
        store?.destroy?.();
        store = null
    });

    /**
     * A body stand-in over the real store, with the pooled row-id scheme the live class uses.
     * @param {Number[]} mountedRows
     * @param {Number} [rowPoolSize=12]
     * @returns {Object}
     */
    function bodyFake(mountedRows, rowPoolSize = 12) {
        return {
            id                 : 'grid-body-1',
            mountedRows,
            rowPoolSize,
            store,
            useInternalId      : true,
            getNativeDragFields: Body.prototype.getNativeDragFields,
            getRecordId        : Body.prototype.getRecordId,
            getRowId           : Body.prototype.getRowId
        }
    }

    test('a business field reaches the payload while the row identity stays the internal one', () => {
        const body   = bodyFake([0, 3]),
              fields = body.getNativeDragFields(['id', 'name']);

        // AC-6: `useInternalId` is untouched and still true, and the row's OWN identity is still
        // neo's. That is the decoupling — the two settings no longer have to agree.
        expect(body.useInternalId).toBe(true);
        expect(body.getRecordId(store.getAt(0)), 'the DOM identity is still neo\'s')
            .toBe(store.getInternalId(store.getAt(0)));

        expect(fields).toEqual({
            'grid-body-1__row-0': {id: 'CNET-0', name: 'Concept 0'},
            'grid-body-1__row-1': {id: 'CNET-1', name: 'Concept 1'},
            'grid-body-1__row-2': {id: 'CNET-2', name: 'Concept 2'}
        })
    });

    test('the map is bounded by the MOUNTED window, not the store', () => {
        // A pooled surface renders a window over an arbitrarily large store, and a gesture can
        // only start on a node that exists. Keying the map by store size would push 40 entries
        // here and a million on a real dataset, for rows nobody can grab.
        const fields = bodyFake([10, 13]).getNativeDragFields(['id']);

        expect(store.getCount(), 'the store is much larger than the window').toBe(40);
        expect(Object.keys(fields)).toHaveLength(3);
        expect(fields['grid-body-1__row-10']).toEqual({id: 'CNET-10'})
    });

    test('the same node id maps a DIFFERENT record after the window moves', () => {
        // `getRowId` is pool-index based, so node ids recycle across records as the user scrolls.
        // This is why the map is refreshed per render rather than captured at registration: a
        // stale map puts a record the user is not dragging onto the clipboard, with no error.
        const poolSize = 12,
              first    = bodyFake([0, 1], poolSize).getNativeDragFields(['id']),
              // index 12 lands on the same pool slot as index 0
              second   = bodyFake([12, 13], poolSize).getNativeDragFields(['id']);

        expect(Object.keys(first)).toEqual(['grid-body-1__row-0']);
        expect(Object.keys(second), 'the same pooled node id').toEqual(['grid-body-1__row-0']);

        expect(first['grid-body-1__row-0']).toEqual({id: 'CNET-0'});
        expect(second['grid-body-1__row-0'], 'now carries a different record').toEqual({id: 'CNET-12'})
    });

    test('an undeclared field stays undefined, so one place turns a miss into the empty string', () => {
        const fields = bodyFake([0, 1]).getNativeDragFields(['id', 'nonexistent']);

        expect(fields['grid-body-1__row-0'].id).toBe('CNET-0');
        expect(fields['grid-body-1__row-0'].nonexistent,
            'the addon\'s `?? \'\'` is the single fallback site').toBeUndefined()
    });

    test('nothing to map yields null rather than an empty object', () => {
        // `null` is what makes the addon's no-field path identical to its behaviour before
        // fields existed, so the distinction is contractual rather than cosmetic.
        expect(bodyFake([0, 3]).getNativeDragFields([]), 'no template named a field').toBeNull();

        const storeless = bodyFake([0, 3]);

        storeless.store = null;
        expect(storeless.getNativeDragFields(['id']), 'no store to read').toBeNull()
    });

    test('a window running past the end of the store maps only the records that exist', () => {
        // Filtering and the store's tail both leave the mounted window pointing past the data.
        // A row with no record must be absent from the map, not present holding undefined.
        const fields = bodyFake([38, 45]).getNativeDragFields(['id']);

        expect(Object.keys(fields)).toHaveLength(2);
        expect(fields['grid-body-1__row-2']).toEqual({id: 'CNET-38'});
        expect(fields['grid-body-1__row-3']).toEqual({id: 'CNET-39'})
    })
});
