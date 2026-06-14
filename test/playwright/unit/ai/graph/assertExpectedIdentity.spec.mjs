import {test, expect}          from '@playwright/test';
import {assertExpectedIdentity} from '../../../../../ai/graph/assertExpectedIdentity.mjs';

// Pure function over the static IDENTITIES table: no Neo globals, no setup, no I/O.
test.describe('assertExpectedIdentity (fail-closed GitHub identity-drift detection core)', () => {
    test('ok when the authed login matches the expected agent', () => {
        expect(assertExpectedIdentity({expected: '@neo-gpt', actualLogin: 'neo-gpt'}))
            .toEqual({ok: true, reason: null});
    });

    test('ok when the Memory Core identity also matches', () => {
        expect(assertExpectedIdentity({
            expected          : '@neo-gpt',
            actualLogin       : 'neo-gpt',
            memoryCoreIdentity: '@neo-gpt'
        })).toEqual({ok: true, reason: null});
    });

    test('normalizes the @ prefix on expected and authed forms', () => {
        expect(assertExpectedIdentity({expected: 'neo-gpt', actualLogin: '@neo-gpt'}).ok).toBe(true);
        expect(assertExpectedIdentity({expected: '@neo-gpt', actualLogin: 'neo-gpt'}).ok).toBe(true);
    });

    test('fails closed on the 2026-06-14 drift: authed neo-opus-ada, expected neo-gpt', () => {
        const result = assertExpectedIdentity({expected: '@neo-gpt', actualLogin: 'neo-opus-ada'});

        expect(result.ok).toBe(false);
        expect(result.reason).toContain('authed as neo-opus-ada');
        expect(result.reason).toContain('expected neo-gpt');
    });

    test('fails closed when Memory Core identity drifts even though GitHub login matches', () => {
        const result = assertExpectedIdentity({
            expected          : '@neo-gpt',
            actualLogin       : 'neo-gpt',
            memoryCoreIdentity: 'neo-opus-ada'
        });

        expect(result.ok).toBe(false);
        expect(result.reason).toContain('Memory-Core identity neo-opus-ada');
    });

    test('fails closed when expected identity is missing or unmappable', () => {
        expect(assertExpectedIdentity({expected: 'nonexistent-agent', actualLogin: 'neo-gpt'}).ok).toBe(false);
        expect(assertExpectedIdentity({expected: '', actualLogin: 'neo-gpt'}).ok).toBe(false);
        expect(assertExpectedIdentity({expected: null, actualLogin: 'neo-gpt'}).ok).toBe(false);
        expect(assertExpectedIdentity({}).ok).toBe(false);
    });

    test('fails closed when no authed login resolves', () => {
        expect(assertExpectedIdentity({expected: '@neo-gpt', actualLogin: ''}).ok).toBe(false);
        expect(assertExpectedIdentity({expected: '@neo-gpt', actualLogin: null}).ok).toBe(false);
    });

    test('fails closed for identities that have no GitHub login', () => {
        expect(assertExpectedIdentity({expected: '@system', actualLogin: 'neo-gpt'}).ok).toBe(false);
    });
});
