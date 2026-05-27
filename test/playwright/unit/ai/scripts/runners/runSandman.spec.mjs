import {setup} from '../../../../setup.mjs';

const appName = 'RunSandmanDiagnosticsTest';

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
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';

/**
 * @summary Validates the remaining runSandman REM orchestration seams after provider-readiness extraction.
 *
 * Provider target resolution and durable failure diagnostics live in
 * `ai/services/graph/providerReadiness.mjs`; this runner spec now focuses on
 * the CLI wrapper behavior that should remain in `runSandman.mjs`.
 */
test.describe('runSandman.mjs REM orchestration wrapper (#10587)', () => {
    test.describe.configure({mode: 'serial'});

    let runSandmanModule;

    test.beforeAll(async () => {
        runSandmanModule = await import('../../../../../../ai/scripts/runners/runSandman.mjs');
    });

    test('runRemPipeline propagates REM failures without printing success (#11698)', async () => {
        const logs = [];

        await expect(runSandmanModule.runRemPipeline({
            dreamService: {
                processUndigestedSessions: async () => {
                    throw new Error('simulated REM failure');
                }
            },
            goldenPathSynthesizer: {
                synthesizeGoldenPath: async () => {
                    throw new Error('Golden Path must not run after REM failure');
                }
            },
            output: {
                log: message => logs.push(message)
            }
        })).rejects.toThrow('simulated REM failure');

        expect(logs.some(message => message.includes('Sandman cycle complete'))).toBe(false);
    });
});
