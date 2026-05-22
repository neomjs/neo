import {setup} from '../../../setup.mjs';

const appName = 'WakeDualModeExportsTest';

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

import Neo       from '../../../../../src/Neo.mjs';
import * as core from '../../../../../src/core/_export.mjs';

import {test, expect} from '@playwright/test';

/**
 * @summary Dual-mode export smoke coverage for the wake scripts converted by #10795.
 *
 * Importing these modules must expose callable functions without executing their CLI
 * wrappers, so `SwarmHeartbeatService` can use the same logic directly while the
 * scripts keep their existing command-line contract for manual / standalone use.
 */
test.describe('ai/scripts wake dual-mode exports', () => {
    test('converted wake scripts expose function entrypoints without running CLI wrappers', async () => {
        const [
            sunsetModule,
            resumeModule,
            allIdleModule,
            nudgeModule,
            trioModule
        ] = await Promise.all([
            import('../../../../../ai/scripts/checkSunsetted.mjs'),
            import('../../../../../ai/scripts/resumeHarness.mjs'),
            import('../../../../../ai/scripts/checkAllAgentIdle.mjs'),
            import('../../../../../ai/scripts/idleOutNudge.mjs'),
            import('../../../../../ai/scripts/trioWakeCooldown.mjs')
        ]);

        expect(typeof sunsetModule.checkSunsetted).toBe('function');
        expect(typeof resumeModule.resumeHarness).toBe('function');
        expect(typeof allIdleModule.checkAllAgentIdle).toBe('function');
        expect(typeof nudgeModule.idleOutNudge).toBe('function');
        expect(typeof trioModule.trioWakeCooldown).toBe('function');
    });
});
