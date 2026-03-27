import {setup} from '../../setup.mjs';

const appName = 'StoreValueBandingCountTest';

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
import Collection     from '../../../../src/collection/Base.mjs';

test.describe('Neo.data.Store valueBanding Calls', () => {
    test('Should only recalculate bands efficiently', () => {
        // We will monkey patch calcValueBands to count calls
        const originalCalc = Collection.prototype.calcValueBands;
        let callCount = 0;
        Collection.prototype.calcValueBands = function() {
            callCount++;
            originalCalc.apply(this, arguments);
        };

        class TestModel extends Model {
            static config = {
                className: 'Test.Unit.Data.ValueBanding.CountModel',
                fields: [{name: 'id', type: 'Number'}, {name: 'country', type: 'String'}]
            }
        }
        const model = Neo.setupClass(TestModel);

        callCount = 0; // reset
        
        let data = [];
        for(let i=0; i<100; i++) {
            data.push({id: i, country: 'A'});
        }

        let store = Neo.create(Store, {
            className: 'Test.Unit.Data.ValueBanding.CountStore',
            model    : model,
            valueBandingFields: ['country'],
            data     : data
        });

        // Assert it's called a reasonable number of times (e.g. < 5)
        expect(callCount).toBeLessThan(10);
        // Restore
        Collection.prototype.calcValueBands = originalCalc;
        store.destroy();
    });
});
