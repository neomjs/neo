import {setup} from '../../../../setup.mjs';

const appName = 'RedactCredentialsTest';

setup({
    neoConfig: {unitTestMode: true},
    appConfig: {name: appName, isMounted: () => true, vnodeInitialising: false}
});

import {test, expect}                           from '@playwright/test';
import Neo                                      from '../../../../../../src/Neo.mjs';
import * as core                                from '../../../../../../src/core/_export.mjs';
import {CREDENTIAL_FAMILIES, redactCredentials} from '../../../../../../ai/services/fleet/redactCredentials.mjs';

/**
 * @summary The credential-boundary witness for Fleet diagnostics.
 *
 * Every assertion here checks the SECRET IS ABSENT before it checks that a marker appeared, and the
 * order is the whole point. A redactor whose replacement label is derived from the match turns a
 * delimiter-less token into its own label — the output then reads `[redacted]: [redacted]` while
 * still carrying the live credential, and a witness asserting `toContain('[redacted]')` passes on
 * it. The marker proves a rule fired; only the absence of the secret proves the rule worked.
 *
 * The families are imported rather than restated. Five adapters drifted apart precisely because
 * each restated a contract it had copied; a test that hard-codes its own list drifts the same way,
 * silently and toward fewer families.
 *
 * Each family names its `secret` explicitly rather than having the witness derive it from the
 * sample. The first cut of this suite split the sample on delimiters and took the last field, which
 * structurally could not express a credential CONTAINING delimiters — so `Basic` and `Digest` were
 * unprovable by construction, and both leaked. The instrument could not have caught the bug it was
 * pointed at.
 */
test.describe('Neo.ai.services.fleet.redactCredentials', () => {
    test('every declared family is masked — secret absent first, marker second', () => {
        for (const {name, sample, secret} of CREDENTIAL_FAMILIES) {
            const output = redactCredentials(`push rejected for ${sample}: retrying`);

            expect(output, `${name}: the credential must not survive`).not.toContain(secret);
            expect(output, `${name}: a redaction rule must have fired`).toContain('[redacted');
        }
    });

    test('the fine-grained PAT that all five predecessors leaked', () => {
        const pat    = 'github_pat_11ABCDE0Y0abcdefghijkl_MNOPqrstuvwx',
              output = redactCredentials(`a2a: push rejected for ${pat}: bad credentials`);

        // The exact regression: `\bgh[pousr]_` cannot match `github_pat_` — `[pousr]` fails on the
        // `i` of `github` — so this family passed through every adapter verbatim.
        expect(output).not.toContain(pat);
        expect(output).not.toContain('github_pat_');
        expect(output).toBe('a2a: push rejected for [redacted-token]: bad credentials');
    });

    test('a NON-bearer scheme does not publish its credential one space later', () => {
        // The defect this module shipped inside itself: `bearer` was special-cased and every other
        // scheme fell to the keyed rule, whose value stops at whitespace — so it consumed the SCHEME
        // WORD and left the credential intact. `dXNlcjpwYXNzd29yZA==` is `user:password`.
        const basic = redactCredentials('Authorization: Basic dXNlcjpwYXNzd29yZA== next');

        expect(basic).not.toContain('dXNlcjpwYXNzd29yZA==');
        expect(basic).toBe('Authorization=[redacted] next');

        // Digest's value runs past the first comma; a rule stopping at the comma leaves the tail.
        const digest = redactCredentials('Authorization: Digest username="u", nonce="abc123"');

        expect(digest).not.toContain('abc123');
        expect(digest).toBe('Authorization=[redacted]');
    });

    test('a scheme NOBODY enumerated is still masked — the allow-list has an expiry date', () => {
        // The point of matching the scheme generically. An allow-list of schemes fails exactly the
        // way five copies of a redactor failed: it publishes the token for the first scheme nobody
        // taught it. NTLM appears in no list in this module.
        const output = redactCredentials('Authorization: NTLM TlRMTVNTUAABtoken99');

        expect(output).not.toContain('TlRMTVNTUAABtoken99');
        expect(output).toBe('Authorization=[redacted]');

        const proxied = redactCredentials('Proxy-Authorization: Bearer sk-live-PPPP1111');

        expect(proxied).not.toContain('sk-live-PPPP1111');
    });

    test('the api-key family the union inherited from the composer', () => {
        // The merged authority first shipped the five adapters' gaps rather than the sixth copy's
        // coverage — this PR's own thesis pointed at itself. `fleetActivityComposer` knew these.
        for (const [sample, secret] of [
            ['x-api-key: sk-live-abcdef123456 next',  'sk-live-abcdef123456'],
            ['access_token: at-live-zzz111 next',     'at-live-zzz111'],
            ['refresh-token=rt-live-www333, retry',   'rt-live-www333'],
            ['client_secret: cs-live-qqq222 next',    'cs-live-qqq222']
        ]) {
            const output = redactCredentials(sample);

            expect(output, `must not survive: ${secret}`).not.toContain(secret);
            expect(output).toContain('[redacted]');
        }
    });

    test('bearer is masked BEFORE the keyed rule can truncate at the space', () => {
        // The ordering bug this module exists to prevent: the keyed pattern stops at whitespace, so
        // an authorization-first pass would mask `authorization=bearer` and leave the token one
        // space later, fully intact.
        const token  = 'ghp_AAAABBBBCCCCDDDDEEEEFFFFGGGG1234',
              output = redactCredentials(`Authorization: Bearer ${token}`);

        expect(output).not.toContain(token);
        expect(output).not.toContain('ghp_');
    });

    test('a delimiter-less token does not become its own label', () => {
        // The derived-label defect: a label computed from the match makes the secret the label, so
        // the string announces it was sanitized while carrying the credential — and a marker-only
        // assertion goes green.
        const token  = 'ghp_AAAABBBBCCCCDDDDEEEEFFFFGGGG1234',
              output = redactCredentials(`push rejected for ${token}: [redacted]`);

        expect(output).not.toContain(token);
        expect(output).not.toContain('AAAABBBBCCCC');
    });

    test('POSITIVE CONTROL: an innocent diagnostic is returned unchanged', () => {
        // Without this, a redactor that returned '[redacted-token]' for every input would pass every
        // assertion above. The witness must be able to report "nothing here needed masking".
        const clean = 'wake daemon unreachable: ECONNREFUSED 127.0.0.1:8083';

        expect(redactCredentials(clean)).toBe(clean);
    });

    test('POSITIVE CONTROL: masking a secret does not eat the diagnostic around it', () => {
        // The over-redaction bias is bounded: it applies after an `authorization` value, not to
        // ordinary prose. A redactor that swallowed the rest of every line would pass every
        // absence assertion above while destroying the diagnostic it exists to make safe.
        expect(redactCredentials('auth failed: token=sk-live-1, retry after 30s'))
            .toBe('auth failed: token=[redacted], retry after 30s');
    });

    test('non-string input is coerced rather than thrown on', () => {
        expect(redactCredentials(null)).toBe('null');
        expect(redactCredentials(new Error('boom'))).toContain('boom');
    });
});
