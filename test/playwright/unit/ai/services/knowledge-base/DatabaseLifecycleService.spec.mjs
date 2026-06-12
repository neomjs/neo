import {setup} from '../../../../setup.mjs';

const appName = 'DatabaseLifecycleServiceTest';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect}            from '@playwright/test';
import DatabaseLifecycleService from '../../../../../../ai/services/knowledge-base/DatabaseLifecycleService.mjs';

/**
 * @summary Coverage for the collapsed DatabaseLifecycleService readiness gate (unified topology).
 *
 * The managed-mode surface (`startDatabase` / `stopDatabase` / `waitForHeartbeat` / `manageDatabase` /
 * `cleanup`, the `chromaProcess` handle, and the `processActive` event) was removed once the
 * orchestrator became the sole Chroma driver; the service is now a readiness + observability gate.
 * These tests pin the kept surface.
 */
test.describe('Neo.ai.services.knowledge-base.DatabaseLifecycleService — unified-topology readiness gate', () => {
    test('initAsync completes without error', async () => {
        await DatabaseLifecycleService.initAsync();
        // Unified topology: no daemon spawn — initAsync only logs and resolves.
        expect(true).toBe(true);
    });

    test('getDatabaseStatus reports external-only state', () => {
        expect(DatabaseLifecycleService.getDatabaseStatus()).toEqual({running: false});
    });
});
