import {setup} from '../../setup.mjs';

const appName = 'CollectionSortNullTest';

setup({
    appConfig: {
        name: appName
    }
});

import {test, expect}  from '@playwright/test';
import Neo             from '../../../../src/Neo.mjs';
import * as core       from '../../../../src/core/_export.mjs';
import Collection      from '../../../../src/collection/Base.mjs';

test.describe('Neo.collection.Base Null Sorting', () => {
    test('Sort with null and undefined values', () => {
        let collection = Neo.create(Collection, {
            items: [
                {id: 1, company: 'Google'},
                {id: 2, company: null},
                {id: 3, company: 'Apple'},
                {id: 4, company: undefined},
                {id: 5, company: 'Microsoft'},
                {id: 6, company: null}
            ],
            sorters: [{direction: 'ASC', property: 'company'}]
        });

        // ASC check: nulls and undefined at the bottom
        let ids = collection.getRange().map(item => item.id);
        expect(ids.slice(0, 3)).toEqual([3, 1, 5]); // Apple, Google, Microsoft
        expect(ids.slice(3)).toContain(2);
        expect(ids.slice(3)).toContain(4);
        expect(ids.slice(3)).toContain(6);

        // DESC check: nulls and undefined still at the bottom
        collection.sorters = [{direction: 'DESC', property: 'company'}];
        ids = collection.getRange().map(item => item.id);
        expect(ids.slice(0, 3)).toEqual([5, 1, 3]); // Microsoft, Google, Apple
        expect(ids.slice(3)).toContain(2);
        expect(ids.slice(3)).toContain(4);
        expect(ids.slice(3)).toContain(6);
    });
});
