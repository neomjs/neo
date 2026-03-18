import {setup} from '../../setup.mjs';

const appName = 'StoreValueBandingTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: false,
        unitTestMode           : true,
        useDomApiRenderer      : false
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Model          from '../../../../src/data/Model.mjs';
import Store          from '../../../../src/data/Store.mjs';

test.describe('Neo.data.Store valueBanding', () => {
    test('calcValueBands with Records', () => {
        class TestModel extends Model {
            static config = {
                className: 'Test.Unit.Data.ValueBanding.TestModel',
                fields: [{
                    name: 'id', type: 'Number'
                }, {
                    name: 'country', type: 'String'
                }, {
                    name: 'department', type: 'String'
                }]
            }
        }

        const model = Neo.setupClass(TestModel);

        let store = Neo.create(Store, {
            className: 'Test.Unit.Data.ValueBanding.TestStore',
            model    : model,
            valueBandingFields: ['country', 'department'],
            data: [{
                id        : 1,
                country   : 'Germany',
                department: 'Sales'
            }, {
                id        : 2,
                country   : 'Germany',
                department: 'Sales'
            }, {
                id        : 3,
                country   : 'Germany',
                department: 'HR'
            }, {
                id        : 4,
                country   : 'USA',
                department: 'Sales'
            }]
        });

        // The store creates Records internally for these items
        expect(store.valueBandsMap).toBeTruthy();
        expect(store.valueBandsMap.size).toBe(4);

        // We can get the record to get its internalId, but the map is keyed by the user's id?
        // Wait, store uses getInternalId(record) when useInternalId is true, but map stores the item's key from `me.getKey(item)`.
        // me.getKey(item) for a Store uses store.keyProperty ('id').
        // So the map is keyed by 'id'.

        let bands1 = store.valueBandsMap.get(1);
        expect(bands1.country).toBe(true);
        expect(bands1.department).toBe(true);

        let bands2 = store.valueBandsMap.get(2);
        expect(bands2.country).toBe(true);
        expect(bands2.department).toBe(true);

        let bands3 = store.valueBandsMap.get(3);
        expect(bands3.country).toBe(true);
        expect(bands3.department).toBe(false);

        let bands4 = store.valueBandsMap.get(4);
        expect(bands4.country).toBe(false);
        expect(bands4.department).toBe(true);

        store.destroy();
    });
});
