import {setup} from '../../setup.mjs';

const appName = 'PipelinePushTest';

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
import Connection         from '../../../../src/data/connection/Base.mjs';
import Pipeline           from '../../../../src/data/Pipeline.mjs';

test.describe('Neo.data.Pipeline - Push Event Forwarding', () => {

    test('Pipeline should forward push events from its connection', async () => {
        // 1. Create a Mock Connection
        class MockConnection extends Connection {
            static observable = true;
            static config = {
                className: 'Test.Unit.Data.PipelinePush.MockConnection'
            }
            
            simulatePush(data) {
                this.fire('push', data);
            }
        }
        MockConnection = Neo.setupClass(MockConnection);

        // 2. Create a Pipeline with the mock connection
        const pipeline = Neo.create(Pipeline, {
            connection: {
                module: MockConnection
            }
        });

        // 3. Setup Spy
        let pushFired = false;
        let pushData = null;
        
        pipeline.on('push', (data) => {
            pushFired = true;
            pushData = data;
        });

        // 4. Simulate Server Push
        pipeline.connection.simulatePush({ id: 99, status: 'mocked' });

        // 5. Yield slightly for async onConnectionPush to resolve
        await pipeline.timeout(10);

        // 6. Verify Event Forwarding
        expect(pushFired).toBe(true);
        expect(pushData.id).toBe(99);
        expect(pushData.status).toBe('mocked');
        
        pipeline.destroy();
    });
});
