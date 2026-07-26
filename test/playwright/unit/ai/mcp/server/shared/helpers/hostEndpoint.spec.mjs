import {test, expect}       from '@playwright/test';
import {formatHostEndpoint} from '../../../../../../../../ai/mcp/server/shared/helpers/hostEndpoint.mjs';

// Pure formatter (no config / I/O) — imported directly, mirrors detectionRetentionSla.spec.
//
// Why this spec exists as a SEPARATE witness from the Server tip test: the tip test reads the same
// resolved config the implementation reads, so it can only ever assert "whatever host resolved, the
// tip printed it" — it cannot fail on a rendering bug, and unit mode never selects an IPv6 host
// anyway. Asserting the IPv6 rendering needs a host the local config never chooses, supplied
// explicitly and with no mutation of the shared config singleton.

test.describe('formatHostEndpoint', () => {
    test('brackets a bare IPv6 literal — the naive template produces a malformed authority', () => {
        expect(formatHostEndpoint('::1', 8000)).toBe('[::1]:8000');
        expect(formatHostEndpoint('2001:db8::dead:beef', 443)).toBe('[2001:db8::dead:beef]:443');
    });

    test('a ZONE-SCOPED address is bracketed for display but is NOT a valid URL authority', () => {
        // Pinning the documented limit rather than asserting support this helper does not provide.
        // A zone ID cannot appear in a URL authority: Node rejects both the raw and percent-encoded
        // forms, so bracketing cannot rescue it and a zone-ID parser does not belong in a logging
        // helper. Bracketing is still the right DISPLAY form, so the output stays readable — the
        // claim is narrowed, the behaviour is unchanged.
        expect(formatHostEndpoint('fe80::1%eth0', 8000)).toBe('[fe80::1%eth0]:8000');
        expect(() => new URL('http://[fe80::1%eth0]:8000')).toThrow();
        expect(() => new URL('http://[fe80::1%25eth0]:8000')).toThrow();
    });

    test('the bracketed form is a parseable URL authority and the bare form is NOT', () => {
        // The whole reason bracketing is required rather than cosmetic. This assertion is the
        // discriminator: it fails if the formatter ever regresses to `${host}:${port}`.
        expect(() => new URL(`http://${formatHostEndpoint('::1', 8000)}`)).not.toThrow();
        expect(() => new URL('http://::1:8000')).toThrow();
    });

    test('leaves DNS names and IPv4 untouched — no stray brackets in the common case', () => {
        expect(formatHostEndpoint('localhost', 8000)).toBe('localhost:8000');
        expect(formatHostEndpoint('127.0.0.1', 8000)).toBe('127.0.0.1:8000');
        expect(formatHostEndpoint('chroma', 8000)).toBe('chroma:8000');
        expect(formatHostEndpoint('my.host.example', 5432)).toBe('my.host.example:5432');
    });

    test('is idempotent on an already-bracketed host — config may carry brackets', () => {
        expect(formatHostEndpoint('[::1]', 8000)).toBe('[::1]:8000');
        expect(formatHostEndpoint('[2001:db8::1]', 443)).toBe('[2001:db8::1]:443');
    });

    test('accepts a numeric or string port identically', () => {
        expect(formatHostEndpoint('::1', 8000)).toBe(formatHostEndpoint('::1', '8000'));
        expect(formatHostEndpoint('localhost', 8000)).toBe(formatHostEndpoint('localhost', '8000'));
    });

    test('tolerates padded / empty host without inventing an authority', () => {
        expect(formatHostEndpoint('  ::1  ', 8000)).toBe('[::1]:8000');
        expect(formatHostEndpoint('', 8000)).toBe(':8000');
        expect(formatHostEndpoint(undefined, 8000)).toBe(':8000');
    });
});
