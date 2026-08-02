import {setup} from '../../../../setup.mjs';

const appName = 'MemoryServiceWithTimeoutTest';

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

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';
import {withTimeout,
        WITH_TIMEOUT_CODE} from '../../../../../../ai/services/memory-core/MemoryService.mjs';

/**
 * Unit coverage for the backfill timeout guard. The miniSummary backfill wraps its model call
 * and content-store fetch with `withTimeout` so a hung downstream endpoint rejects (then fails
 * soft via the per-memory catch) instead of wedging the supervised maintenance child forever.
 */
test.describe('Neo.ai.memory-core MemoryService.withTimeout', () => {
    test('rejects with a labeled error when the promise exceeds the timeout', async () => {
        const hung = new Promise(() => {}); // never settles
        await expect(withTimeout(hung, 25, 'unit op')).rejects.toThrow('unit op timed out after 25ms');
    });

    test('resolves with the value when the promise completes in time', async () => {
        await expect(withTimeout(Promise.resolve('done'), 1000, 'unit op')).resolves.toBe('done');
    });

    test('propagates the original rejection when the promise fails before the timeout', async () => {
        await expect(withTimeout(Promise.reject(new Error('upstream boom')), 1000, 'unit op'))
            .rejects.toThrow('upstream boom');
    });

    test('a timeout rejection is identifiable by code rather than by message', async () => {
        const hung  = new Promise(() => {}),
              error = await withTimeout(hung, 25, 'unit op').catch(caught => caught);

        expect(error.code).toBe(WITH_TIMEOUT_CODE);
        expect(error.label).toBe('unit op');
        expect(error.timeoutMs).toBe(25);
    });

    test('an unrelated rejection that mentions a timeout in prose does not carry the code', async () => {
        // The message-matching failure mode the code replaces: a downstream error whose text happens to
        // read like a timeout must not classify as one.
        const impostor = new Error('provider said: request timed out after 25ms'),
              error    = await withTimeout(Promise.reject(impostor), 1000, 'unit op').catch(caught => caught);

        expect(error.code).toBeUndefined();
    });
});
