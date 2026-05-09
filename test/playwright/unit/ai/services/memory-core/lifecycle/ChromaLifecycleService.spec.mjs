import { setup } from '../../../../../setup.mjs';

const appName = 'ChromaLifecycleServiceTest';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name: appName,
        isMounted: () => true,
        vnodeInitialising: false
    }
});

import {test, expect}         from '@playwright/test';
import Neo                    from '../../../../../../../src/Neo.mjs';
import * as core              from '../../../../../../../src/core/_export.mjs';
import aiConfig               from '../../../../../../../ai/mcp/server/memory-core/config.mjs';
import ChromaLifecycleService from '../../../../../../../ai/services/memory-core/lifecycle/ChromaLifecycleService.mjs';

test.describe('Neo.ai.services.memory-core.lifecycle.ChromaLifecycleService — permanent unified topology (#11011)', () => {
    test('startDatabase always returns skipped_unified_mode', async () => {
        const result = await ChromaLifecycleService.startDatabase();

        expect(result.status).toBe('skipped_unified_mode');
        expect(result.detail).toMatch(/downstream client of the shared ChromaDB/i);
    });

    test('manageDatabase({action:"start"}) propagates skipped_unified_mode', async () => {
        const result = await ChromaLifecycleService.manageDatabase({action: 'start'});

        expect(result.status).toBe('skipped_unified_mode');
    });

    test('initAsync completes without error', async () => {
        const originalInitPromise = ChromaLifecycleService._initPromise;

        try {
            ChromaLifecycleService._initPromise = null;
            await ChromaLifecycleService.initAsync();
            // Test passes if it does not throw or hang
        } finally {
            ChromaLifecycleService._initPromise = originalInitPromise;
        }
    });
});
