import {setup} from '../../../setup.mjs';

const appName = 'AiProviderTimeoutContractTest';

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
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';

import * as timeoutContract from '../../../../../ai/provider/createTimeoutError.mjs';

const {
    OPENAI_COMPATIBLE_REQUEST_TIMEOUT_CODE,
    PROVIDER_TIMEOUT_CODE,
    isProviderTimeoutCode
} = timeoutContract;

/**
 * The shared provider-timeout identity.
 *
 * The predicate is one line, so these cases exist for the SET it tests rather than the branching.
 * The four codes had been re-typed at four call sites in three shapes, and the failure mode this
 * guards is not "the predicate returns the wrong boolean" but "a fifth code is added to one list and
 * silently disagrees with the other three". The negative cases matter more than the positive ones:
 * caller abort, an open circuit, generic provider failures, and provider-busy responses must never
 * read as a provider timeout, because this predicate gates a circuit hook that suppresses another
 * repository's dispatch.
 */
test.describe('ai/provider/createTimeoutError — shared provider-timeout identity (#16997)', () => {
    test('recognizes exactly the four provider-timeout codes', () => {
        expect(isProviderTimeoutCode(PROVIDER_TIMEOUT_CODE), 'native provider timeout').toBe(true);
        expect(isProviderTimeoutCode(OPENAI_COMPATIBLE_REQUEST_TIMEOUT_CODE), 'OpenAI-compatible transport timeout').toBe(true);
        expect(isProviderTimeoutCode('ETIMEDOUT'), 'socket-layer timeout').toBe(true);
        expect(isProviderTimeoutCode('ESOCKETTIMEDOUT'), 'socket-layer timeout').toBe(true);

    });

    test('AC-7 negative matrix: nothing else reads as a provider timeout', () => {
        // Each of these reaches the same catch blocks as a real timeout, and each has a DIFFERENT
        // correct outcome. An abort is caller-owned, a circuit-open is already the suppressed
        // outcome, and a busy/model-load response means retry rather than open.
        for (const code of [
            'ABORT_ERR',
            'KB_VECTOR_EMBED_PROVIDER_CIRCUIT_OPEN',
            'ECONNREFUSED',
            'ECONNRESET',
            'EPIPE',
            'MODEL_NOT_RESIDENT',
            'KB_VECTOR_EMBED_FAILED'
        ]) {
            expect(isProviderTimeoutCode(code), `${code} must not read as a provider timeout`).toBe(false);
        }
    });

    test('absent, empty, and non-string codes are false rather than throwing', () => {
        // Every call site passes `error?.code` from an error it did not construct, so an error with
        // no code at all is the ordinary case, not a defensive one.
        for (const code of [undefined, null, '', 0, false, {}, []]) {
            expect(isProviderTimeoutCode(code), `${JSON.stringify(code) ?? String(code)} must be false`).toBe(false);
        }
    });

    test('a near-miss code is not matched by prefix or case', () => {
        // The membership test is exact. A transport that stamped a lowercase or suffixed variant
        // would be a producer bug worth failing loudly, not something to absorb here.
        for (const code of [
            'etimedout',
            'ETIMEDOUT_',
            'X_ETIMEDOUT',
            'PROVIDER_TIMEOUT_EXCEEDED',
            'provider_timeout'
        ]) {
            expect(isProviderTimeoutCode(code), `${code} must not match`).toBe(false);
        }
    });

    test('no mutable classifier crosses the module boundary', () => {
        // Written after the first draft of this spec asserted `Object.isFrozen(PROVIDER_TIMEOUT_CODES)`
        // and passed while proving nothing: `Object.freeze` does NOT stop `Set.prototype.add`, so a
        // frozen exported set is a shared mutable classifier that any one consumer could widen for
        // every other consumer at once. The durable fix was to stop exporting it, and this is the
        // assertion that keeps it unexported — the predicate is the whole public surface.
        expect(timeoutContract.PROVIDER_TIMEOUT_CODES, 'the code set must stay module-private').toBeUndefined();

        for (const [name, value] of Object.entries(timeoutContract)) {
            expect(
                value instanceof Set || Array.isArray(value),
                `export "${name}" must not be a mutable collection`
            ).toBe(false);
        }
    });
});
