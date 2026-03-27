import {setup} from '../../setup.mjs';

const appName = 'ValueBandingTest';

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
import Collection     from '../../../../src/collection/Base.mjs';

test.describe('Neo.collection.Base valueBanding', () => {
    test('calcValueBands', () => {
        let c = Neo.create(Collection, {
            className: 'Test.Unit.Collection.ValueBanding.TestCollection',
            valueBandingFields: ['country', 'department'],
            items: [{
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

        // Initial banding calculation happens in splice during construction
        expect(c.valueBandsMap.get(1).country).toBe(true);
        expect(c.valueBandsMap.get(1).department).toBe(true);

        expect(c.valueBandsMap.get(2).country).toBe(true);
        expect(c.valueBandsMap.get(2).department).toBe(true);

        expect(c.valueBandsMap.get(3).country).toBe(true);
        expect(c.valueBandsMap.get(3).department).toBe(false);

        expect(c.valueBandsMap.get(4).country).toBe(false);
        expect(c.valueBandsMap.get(4).department).toBe(true);
        c.destroy();
    });
});
