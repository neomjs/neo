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
 * @summary The record values a native drag payload reads, keyed by the record identity the rows
 * already render.
 *
 * `nativeDragZone` payload templates could only read DOM attributes, so putting a business id on
 * the clipboard meant putting it in the DOM first — which for a grid meant `useInternalId: false`,
 * because `getRecordId` otherwise writes neo's own `neo-record-N` into the row identity and the
 * payload silently carries that instead. `internalId` was adopted deliberately for stable DOM
 * keying, so the pairing asked a consumer to opt out of that architecture to use an unrelated
 * feature. These arms are the decoupling: the value is read from the STORE, in the worker where
 * the record lives, and pushed to the addon ahead of any gesture.
 *
 * **The key is the record, not the row slot.** `grid.Row` renders `getRecordId(record)` into
 * `data-record-id` on the row and on every cell, and the addon reads the map by that attribute, so
 * both ends agree by construction. Keying by a pooled row node id would instead make a map that
 * has not caught up resolve to the slot's PREVIOUS occupant — the one wrong answer that reaches a
 * real clipboard. Keyed by record, the same lag yields no entry and the token becomes `''`.
 *
 * The methods are borrowed onto a plain object for the reason `BodyCellMapping.spec.mjs` gives —
 * `Object.create(Body.prototype)` trips the reactive config system's private-brand check, and
 * these methods only read `mountedRows`, `store` and `useInternalId`.
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
     * A body stand-in over the real store.
     * @param {Number[]} mountedRows
     * @param {Boolean} [useInternalId=true]
     * @returns {Object}
     */
    function bodyFake(mountedRows, useInternalId = true) {
        return {
            id                 : 'grid-body-1',
            mountedRows,
            store,
            useInternalId,
            getNativeDragFields: Body.prototype.getNativeDragFields,
            getRecordId        : Body.prototype.getRecordId
        }
    }

    test('a business field reaches the payload while the row identity stays the internal one', () => {
        const body   = bodyFake([0, 3]),
              fields = body.getNativeDragFields(['id', 'name']);

        // The decoupling: `useInternalId` is untouched and still true, so the row's own identity
        // is still neo's — and the payload carries the business id regardless.
        expect(body.useInternalId).toBe(true);

        const firstKey = store.getInternalId(store.getAt(0));

        expect(firstKey, 'the key is neo\'s internal id, not the business one').not.toBe('CNET-0');
        expect(fields[firstKey]).toEqual({id: 'CNET-0', name: 'Concept 0'});
        expect(Object.keys(fields)).toHaveLength(3)
    });

    test('the key is exactly what grid.Row renders into data-record-id', () => {
        // The by-construction claim, asserted rather than trusted: the addon looks the map up by
        // `data-record-id`, `grid.Row` writes that from `getRecordId`, and this map is keyed by
        // the same call. If they ever diverge every field token silently resolves to `''`.
        const body = bodyFake([0, 4]);

        const expected = [0, 1, 2, 3].map(i => body.getRecordId(store.getAt(i)));

        expect(Object.keys(body.getNativeDragFields(['id']))).toEqual(expected)
    });

    test('the business key is the map key when a host opts out of internal ids', () => {
        // The other identity mode must work too, since `useInternalId: false` is what consumers
        // were forced into before this existed and nobody has to migrate off it.
        const fields = bodyFake([0, 2], false).getNativeDragFields(['id']);

        expect(Object.keys(fields)).toEqual(['CNET-0', 'CNET-1']);
        expect(fields['CNET-0']).toEqual({id: 'CNET-0'})
    });

    test('the map is bounded by the MOUNTED window, not the store', () => {
        // A pooled surface renders a window over an arbitrarily large store, and a gesture can
        // only start on a node that exists. Keying the map by store size would push 40 entries
        // here and a million on a real dataset, for rows nobody can grab.
        const body   = bodyFake([10, 13]),
              fields = body.getNativeDragFields(['id']);

        expect(store.getCount(), 'the store is much larger than the window').toBe(40);
        expect(Object.keys(fields)).toHaveLength(3);
        expect(fields[body.getRecordId(store.getAt(10))]).toEqual({id: 'CNET-10'})
    });

    test('two different windows never collide on one key, which a pool slot would', () => {
        // The hazard the record key removes. `getRowId` is pool-index based, so index 0 and index
        // 12 share a slot at pool size 12 — a slot-keyed map would have the later window's record
        // overwrite the earlier one's entry, and a node showing either would resolve to whichever
        // wrote last. Record keys cannot alias.
        const body   = bodyFake([0, 1]),
              first  = Object.keys(body.getNativeDragFields(['id'])),
              second = Object.keys(bodyFake([12, 13]).getNativeDragFields(['id']));

        expect(first).toHaveLength(1);
        expect(second).toHaveLength(1);
        expect(second[0], 'a different record gets a different key').not.toBe(first[0])
    });

    test('an undeclared field stays undefined, so one place turns a miss into the empty string', () => {
        const body   = bodyFake([0, 1]),
              key    = body.getRecordId(store.getAt(0)),
              fields = body.getNativeDragFields(['id', 'nonexistent']);

        expect(fields[key].id).toBe('CNET-0');
        expect(fields[key].nonexistent,
            'the addon\'s `?? \'\'` is the single fallback site').toBeUndefined()
    });

    test('nothing to map yields null rather than an empty object', () => {
        // `null` is what makes the addon's no-field path identical to its behaviour before fields
        // existed, so the distinction is contractual rather than cosmetic.
        expect(bodyFake([0, 3]).getNativeDragFields([]), 'no template named a field').toBeNull();

        const storeless = bodyFake([0, 3]);

        storeless.store = null;
        expect(storeless.getNativeDragFields(['id']), 'no store to read').toBeNull()
    });

    test('a window running past the end of the store maps only the records that exist', () => {
        // Filtering and the store's tail both leave the mounted window pointing past the data.
        // A row with no record must be absent from the map, not present holding undefined.
        const body   = bodyFake([38, 45]),
              fields = body.getNativeDragFields(['id']);

        expect(Object.keys(fields)).toHaveLength(2);
        expect(fields[body.getRecordId(store.getAt(38))]).toEqual({id: 'CNET-38'});
        expect(fields[body.getRecordId(store.getAt(39))]).toEqual({id: 'CNET-39'})
    })
});
