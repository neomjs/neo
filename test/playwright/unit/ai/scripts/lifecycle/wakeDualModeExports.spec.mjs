import {setup} from '../../../../setup.mjs';

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

import Neo       from '../../../../../../src/Neo.mjs';
import * as core from '../../../../../../src/core/_export.mjs';

import {test, expect} from '@playwright/test';

/**
 * @summary Dual-mode export smoke coverage for the converted wake scripts.
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
            swarmModule
        ] = await Promise.all([
            import('../../../../../../ai/scripts/lifecycle/checkSunsetted.mjs'),
            import('../../../../../../ai/scripts/lifecycle/resumeHarness.mjs'),
            import('../../../../../../ai/scripts/lifecycle/checkAllAgentIdle.mjs'),
            import('../../../../../../ai/scripts/lifecycle/idleOutNudge.mjs'),
            import('../../../../../../ai/scripts/lifecycle/swarmWakeCooldown.mjs')
        ]);

        expect(typeof sunsetModule.checkSunsetted).toBe('function');
        expect(typeof resumeModule.resumeHarness).toBe('function');
        expect(typeof allIdleModule.checkAllAgentIdle).toBe('function');
        expect(typeof nudgeModule.idleOutNudge).toBe('function');
        expect(typeof swarmModule.swarmWakeCooldown).toBe('function');
    });
});
