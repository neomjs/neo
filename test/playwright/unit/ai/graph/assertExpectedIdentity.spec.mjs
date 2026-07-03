import {test, expect}                                  from '@playwright/test';
import {assertExpectedIdentity, IdentityAssertionCode} from '../../../../../ai/graph/assertExpectedIdentity.mjs';

// Pure function over the static IDENTITIES table — imported directly; no Neo globals, no setup, no I/O.
// Uses REAL identityRoots entries (@neo-gpt, @neo-opus-ada, @system) so the test exercises the live
// mapping, not a fixture. The headline case is the 2026-06-14 drift: the github-workflow token authed
// as neo-opus-ada while the harness expected neo-gpt — this core must catch it.
test.describe('assertExpectedIdentity (fail-closed GitHub identity-drift detection core)', () => {
    test('ok when the authed login matches the expected agent (GitHub surface only)', () => {
        expect(assertExpectedIdentity({expected: '@neo-gpt', actualLogin: 'neo-gpt'}))
            .toEqual({ok: true, reason: null, code: IdentityAssertionCode.OK});
    });

    test('ok when the Memory-Core identity also matches', () => {
        expect(assertExpectedIdentity({expected: '@neo-gpt', actualLogin: 'neo-gpt', memoryCoreIdentity: '@neo-gpt'}))
            .toEqual({ok: true, reason: null, code: IdentityAssertionCode.OK});
    });

    test('normalizes the @ prefix on both the expected and the authed forms', () => {
        expect(assertExpectedIdentity({expected: 'neo-gpt',  actualLogin: '@neo-gpt'}).ok).toBe(true);
        expect(assertExpectedIdentity({expected: '@neo-gpt', actualLogin: 'neo-gpt'}).ok).toBe(true);
    });

    test('FAIL-CLOSED on the 2026-06-14 drift: authed neo-opus-ada, expected neo-gpt', () => {
        const result = assertExpectedIdentity({expected: '@neo-gpt', actualLogin: 'neo-opus-ada'});

        expect(result.ok).toBe(false);
        expect(result.reason).toContain('authed as neo-opus-ada');
        expect(result.reason).toContain('expected neo-gpt');
        expect(result.code).toBe(IdentityAssertionCode.LOGIN_MISMATCH);
    });

    test('fail-closed when the Memory-Core identity drifts even though the GitHub login matches', () => {
        const result = assertExpectedIdentity({expected: '@neo-gpt', actualLogin: 'neo-gpt', memoryCoreIdentity: 'neo-opus-ada'});

        expect(result.ok).toBe(false);
        expect(result.reason).toContain('Memory-Core identity neo-opus-ada');
        expect(result.code).toBe(IdentityAssertionCode.MEMORY_CORE_MISMATCH);
    });

    test('fail-closed when the expected identity is missing or unmappable', () => {
        expect(assertExpectedIdentity({expected: 'nonexistent-agent', actualLogin: 'neo-gpt'}).ok).toBe(false);
        expect(assertExpectedIdentity({expected: '',                   actualLogin: 'neo-gpt'}).ok).toBe(false);
        expect(assertExpectedIdentity({expected: null,                 actualLogin: 'neo-gpt'}).ok).toBe(false);
        expect(assertExpectedIdentity({}).ok).toBe(false);
    });

    test('fail-closed when no authed login resolves', () => {
        expect(assertExpectedIdentity({expected: '@neo-gpt', actualLogin: ''  }).ok).toBe(false);
        expect(assertExpectedIdentity({expected: '@neo-gpt', actualLogin: null}).ok).toBe(false);
    });

    test('fail-closed for an identity that has no githubLogin (e.g. the @system sender)', () => {
        expect(assertExpectedIdentity({expected: '@system', actualLogin: 'neo-gpt'}).ok).toBe(false);
    });

    // Every outcome carries a stable machine `code` so consumers branch on it, not on the
    // human-readable `reason` prose. Each branch maps to exactly one IdentityAssertionCode.
    test('emits a stable code for every outcome branch', () => {
        expect(assertExpectedIdentity({expected: '@neo-gpt', actualLogin: 'neo-gpt'}).code)
            .toBe(IdentityAssertionCode.OK);
        expect(assertExpectedIdentity({expected: 'nonexistent-agent', actualLogin: 'neo-gpt'}).code)
            .toBe(IdentityAssertionCode.EXPECTED_UNMAPPABLE);
        expect(assertExpectedIdentity({expected: '@neo-gpt', actualLogin: null}).code)
            .toBe(IdentityAssertionCode.NO_AUTHED_LOGIN);
        expect(assertExpectedIdentity({expected: '@neo-gpt', actualLogin: 'neo-opus-ada'}).code)
            .toBe(IdentityAssertionCode.LOGIN_MISMATCH);
        expect(assertExpectedIdentity({expected: '@neo-gpt', actualLogin: 'neo-gpt', memoryCoreIdentity: 'neo-opus-ada'}).code)
            .toBe(IdentityAssertionCode.MEMORY_CORE_MISMATCH);
    });

    test('IdentityAssertionCode is a frozen enum of the stable code values', () => {
        expect(Object.isFrozen(IdentityAssertionCode)).toBe(true);
        expect(IdentityAssertionCode).toEqual({
            OK                  : 'OK',
            EXPECTED_UNMAPPABLE : 'EXPECTED_UNMAPPABLE',
            NO_AUTHED_LOGIN     : 'NO_AUTHED_LOGIN',
            LOGIN_MISMATCH      : 'LOGIN_MISMATCH',
            MEMORY_CORE_MISMATCH: 'MEMORY_CORE_MISMATCH'
        });
    });
});
