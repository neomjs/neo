import {test, expect}           from '@playwright/test';
import {redactSensitiveContent} from '../../../../../../../ai/services/github-workflow/shared/redactSensitiveContent.mjs';

/**
 * Pins the pure redactor. Uses a generic "acme" fixture so the test itself carries no real sensitive
 * term. Covers: ordered literal deny-pairs (handle before substring), literal (no regex metachars), and
 * the fail-SAFE contract (non-string / non-array / malformed pairs never throw or partially mangle).
 */
test.describe('ai/services/github-workflow/shared/redactSensitiveContent', () => {
    test('applies ordered literal deny-pairs (handle before substring)', () => {
        const pairs = [['@kmunk-acme', 'a partner contributor'], ['Acme', 'Client'], ['acme', 'client']];
        const input = 'Hi @kmunk-acme, the Acme migration and acme work are tracked.';
        expect(redactSensitiveContent(input, pairs))
            .toBe('Hi a partner contributor, the Client migration and client work are tracked.');
    });

    test('literal replacement — no regex metachar interpretation', () => {
        expect(redactSensitiveContent('a.b+c', [['a.b+c', 'X']])).toBe('X');
        expect(redactSensitiveContent('axb',   [['a.b', 'X']])).toBe('axb'); // '.' is literal, not any-char
    });

    test('order matters — handle redacted before its bare substring', () => {
        const ordered = [['@kmunk-acme', 'a partner contributor'], ['acme', 'client']];
        expect(redactSensitiveContent('@kmunk-acme filed it', ordered)).toBe('a partner contributor filed it');
    });

    test('fail-SAFE: non-string text returned unchanged', () => {
        expect(redactSensitiveContent(null,      [['a', 'b']])).toBe(null);
        expect(redactSensitiveContent(undefined, [['a', 'b']])).toBe(undefined);
        expect(redactSensitiveContent(42,        [['a', 'b']])).toBe(42);
    });

    test('fail-SAFE: non-array or malformed deny-pairs are skipped', () => {
        expect(redactSensitiveContent('acme', 'notarray')).toBe('acme');
        // malformed pairs skipped, the one valid pair still applied
        expect(redactSensitiveContent('acme', [['acme'], null, ['acme', 'client']])).toBe('client');
    });

    test('no deny-pairs → text unchanged', () => {
        expect(redactSensitiveContent('untouched', [])).toBe('untouched');
    });
});
