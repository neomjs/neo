import {test, expect}           from '@playwright/test';
import {redactSensitiveContent} from '../../../../../../../ai/services/github-workflow/shared/redactSensitiveContent.mjs';

/**
 * Pins the pure redactor. Uses a generic "acme" fixture so the test itself carries no real sensitive
 * term. Covers: ordered literal deny-pairs (handle before substring), literal (no regex metachars), and
 * the fail-SAFE contract (non-string / non-array / malformed pairs never throw or partially mangle).
 */
test.describe('ai/services/github-workflow/shared/redactSensitiveContent', () => {
    test('applies ordered deny-pairs (handle before substring), case-insensitively', () => {
        const pairs = [['@kmunk-acme', 'a partner contributor'], ['acme', 'CLIENT']];
        const input = 'Acme migration, acme work, ACME, and @kmunk-acme filed it.';
        expect(redactSensitiveContent(input, pairs))
            .toBe('CLIENT migration, CLIENT work, CLIENT, and a partner contributor filed it.');
    });

    test('case-insensitive — one pair catches every case variant of a term', () => {
        expect(redactSensitiveContent('Acme ACME acme aCmE', [['acme', 'X']])).toBe('X X X X');
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

    test('allowlist preserves a handle that CONTAINS a deny term (the operator handle exception)', () => {
        const pairs = [['acme', 'the client']];
        const allow = ['kmunk-acme'];
        const input = 'Acme work by @kmunk-acme and acme deploys.';
        expect(redactSensitiveContent(input, pairs, allow))
            .toBe('the client work by @kmunk-acme and the client deploys.');
    });

    test('the sentinel never collides with real digits-in-text', () => {
        // guards against a space-sentinel bug: a numeric body must survive untouched
        expect(redactSensitiveContent('version 3 of 12 builds', [['acme', 'X']], ['kmunk-acme']))
            .toBe('version 3 of 12 builds');
    });
});
