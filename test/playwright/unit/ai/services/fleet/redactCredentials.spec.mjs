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
 */
test.describe('Neo.ai.services.fleet.redactCredentials', () => {
    test('every declared family is masked — secret absent first, marker second', () => {
        for (const {name, sample} of CREDENTIAL_FAMILIES) {
            const secret = sample.split(/[\s:=]+/).pop(),
                  output = redactCredentials(`push rejected for ${sample}: retrying`);

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

    test('non-string input is coerced rather than thrown on', () => {
        expect(redactCredentials(null)).toBe('null');
        expect(redactCredentials(new Error('boom'))).toContain('boom');
    });
});
