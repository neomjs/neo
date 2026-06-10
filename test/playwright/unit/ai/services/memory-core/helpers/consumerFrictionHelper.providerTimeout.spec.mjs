import {setup} from '../../../../../setup.mjs';

const appName = 'ConsumerFrictionProviderTimeoutTest';

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

import {test, expect}         from '@playwright/test';
import Neo                    from '../../../../../../../src/Neo.mjs';
import * as core              from '../../../../../../../src/core/_export.mjs';
import {PROVIDER_TIMEOUT_CODE} from '../../../../../../../ai/provider/createTimeoutError.mjs';

/**
 * @summary Regression coverage for structural provider-timeout discrimination in
 * `categorizeInvocationError`. A provider timeout carries the uniform `error.code`
 * (the cross-provider `PROVIDER_TIMEOUT` contract), so the symptom is detected without
 * depending on the message-wording regex. Kept in a dedicated spec so this coverage does not
 * entangle with the broader consumerFrictionHelper spec.
 */
test.describe.serial('Neo.ai.services.memory-core.helpers.ConsumerFrictionHelper — provider-timeout discrimination', () => {
    let categorizeInvocationError;

    test.beforeAll(async () => {
        ({categorizeInvocationError} = await import('../../../../../../../ai/services/memory-core/helpers/consumerFrictionHelper.mjs'));
    });

    test('detects a provider timeout structurally via error.code, regex-independent', () => {
        // The message matches NEITHER the context-overflow nor the timeout regex — a 'timeout' result
        // can only come from the structural PROVIDER_TIMEOUT_CODE check, not the message wording.
        const err = new Error('the upstream request was cancelled by the interactive budget');
        err.code  = PROVIDER_TIMEOUT_CODE;
        expect(categorizeInvocationError(err)).toBe('timeout');

        // The same message WITHOUT the code falls through to parse-failure (proves the code did the work).
        expect(categorizeInvocationError(new Error('the upstream request was cancelled by the interactive budget'))).toBe('parse-failure');
    });

    test('falls back to the message regex when no structural code is present', () => {
        expect(categorizeInvocationError(new Error('Request timed out after 30000ms'))).toBe('timeout');
        expect(categorizeInvocationError(new Error('context window exceeded'))).toBe('context-overflow');
    });
});
