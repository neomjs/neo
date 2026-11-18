import {setup} from '../../setup.mjs';

const appName = 'ListCollectionStoreTest';

setup({
    appConfig: {
        name    : appName,
        mainView: {id: 'list-collection-store-main-view', addDomListeners() {}, removeDomListeners() {}}
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Instance       from '../../../../src/manager/Instance.mjs';
import Collection     from '../../../../src/collection/Base.mjs';
import List           from '../../../../src/list/Base.mjs';

/**
 * @summary A list supports collections as well as stores (`getKeyProperty()`). The time field's picker is
 * the shipped case: a plain collection with `useInternalId: false`, whose picks reach `getItemRecordId()`.
 */
test.describe('Neo.list.Base on a collection', () => {
    let list;

    test.afterEach(() => {
        list?.destroy();
        list = null
    });

    test('an item id resolves to the record key of a string-keyed collection', () => {
        list = Neo.create(List, {
            appName,
            displayField : 'id',
            store        : Neo.create(Collection, {items: [{id: '10:15'}, {id: '10:30'}]}),
            useInternalId: false
        });

        expect(list.getItemRecordId(list.getItemId('10:30'))).toBe('10:30')
    });

    test('an item id resolves to the numeric key of an integer-keyed collection', () => {
        list = Neo.create(List, {
            appName,
            displayField : 'name',
            store        : Neo.create(Collection, {items: [{id: 1, name: 'one'}, {id: 2, name: 'two'}]}),
            useInternalId: false
        });

        expect(list.getItemRecordId(list.getItemId(2))).toBe(2)
    })
});
