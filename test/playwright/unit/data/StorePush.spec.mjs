import {setup} from '../../setup.mjs';

const appName = 'StorePushTest';

setup({
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    },
    neoConfig: {
        allowVdomUpdatesInTests: true,
        unitTestMode           : true,
        useDomApiRenderer      : true
    }
});

import {test, expect}     from '@playwright/test';
import Neo                from '../../../../src/Neo.mjs';
import * as core          from '../../../../src/core/_export.mjs';
import InstanceManager    from '../../../../src/manager/Instance.mjs';
import Model              from '../../../../src/data/Model.mjs';
import Pipeline           from '../../../../src/data/Pipeline.mjs';
import Store              from '../../../../src/data/Store.mjs';
import DomApiVnodeCreator from '../../../../src/vdom/util/DomApiVnodeCreator.mjs';
import VdomHelper         from '../../../../src/vdom/Helper.mjs';

test.describe('Neo.data.Store - Push Integration', () => {

    test('Store should listen to pipeline push events and update existing records via record.set()', async () => {
        // 1. Create a Mock Model
        class TestModel extends Model {
            static config = {
                className  : 'Test.Unit.Data.StorePush.MockModel',
                keyProperty: 'id',
                fields     : [
                    {name: 'id',     type: 'Integer'},
                    {name: 'status', type: 'String'}
                ]
            }
        }
        TestModel = Neo.setupClass(TestModel);

        // 2. Create a Mock Pipeline that we can manually trigger events on
        class MockPipeline extends Pipeline {
            static config = {
                className: 'Test.Unit.Data.StorePush.MockPipeline'
            }
            
            // Mock connection-less read
            async read() {
                return [{id: 1, status: 'pending'}, {id: 2, status: 'pending'}];
            }
            
            // Helper to simulate an incoming push
            simulatePush(data) {
                this.fire('push', data);
            }
        }
        MockPipeline = Neo.setupClass(MockPipeline);

        // 3. Create Store
        const store = Neo.create(Store, {
            model   : TestModel,
            pipeline: {
                module: MockPipeline
            }
        });

        // 4. Initial Load
        await store.load();
        expect(store.count).toBe(2);
        
        let record1 = store.get(1);
        expect(record1.status).toBe('pending');
        
        // 5. Setup Spy
        let recordChangeFired = false;
        let changedRecordId = null;
        
        store.on('recordChange', (data) => {
            recordChangeFired = true;
            changedRecordId = data.record.id;
        });

        // 6. Simulate Server Push
        store.pipeline.simulatePush({ id: 1, status: 'done' });

        // 7. Verify Surgical Update
        expect(record1.status).toBe('done'); // record.set() worked
        expect(recordChangeFired).toBe(true); // event fired
        expect(changedRecordId).toBe(1);
        
        store.destroy();
    });
});
