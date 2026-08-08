import {test, expect} from '@playwright/test';

import {
    SCAN_OUTCOME,
    SCAN_REASON,
    TARGET_VISIBILITY,
    isPublishBlocked,
    scanForConfidentialTokens
} from '../../../../../../ai/services/shared/confidentiality/confidentialTokenScanner.mjs';

const DENYLIST = ['Acme Corp', 'Northwind'];

/**
 * @summary A confidentiality guard is only worth having if every non-blocking answer says why it did
 * not block.
 *
 * The defect being replaced is a validator that returned a bare pass on a body it never examined, so
 * the assertions below are weighted toward the paths that do NOT block. A spec that only proved
 * "a token is caught" would pass against a guard that is permissive everywhere else — which is the
 * shape that already shipped once.
 */
test.describe('confidential token scanner — blocking', () => {
    test('a token in a public body is blocked with its ORIGINAL offset', () => {
        const text   = 'Rolled out for Acme Corp last week.',
              result = scanForConfidentialTokens(text, {
                  denylist        : DENYLIST,
                  targetVisibility: TARGET_VISIBILITY.public
              });

        expect(result.outcome).toBe(SCAN_OUTCOME.blocked);
        expect(result.reason).toBe(SCAN_REASON.targetPublic);
        expect(isPublishBlocked(result)).toBe(true);

        // The offset must address the ORIGINAL string. Folding collapses separators, so a
        // folded-space index would point the author at the wrong character of their own body — and
        // `indexOf` here is an independent derivation, not the scanner's own arithmetic echoed back.
        expect(result.matches[0].offset).toBe(text.indexOf('Acme Corp'));
        expect(text.slice(result.matches[0].offset)).toContain('Acme Corp');
    });

    test('separator and case variants all match one entry — the config-prefix leak shape', () => {
        // A recorded leak carried an engagement through a config-entry prefix with no prose at all,
        // so case folding alone would have caught only the last of these.
        for (const variant of ['acme-corp', 'ACME_CORP', 'AcmeCorp', 'acme corp', 'acme.corp']) {
            const result = scanForConfidentialTokens(`key: ${variant}-tenant`, {
                denylist        : DENYLIST,
                targetVisibility: TARGET_VISIBILITY.public
            });

            expect(result.outcome, `variant ${variant}`).toBe(SCAN_OUTCOME.blocked);
        }
    });

    test('every occurrence is reported, not just the first', () => {
        const result = scanForConfidentialTokens('Acme Corp and later Acme Corp again', {
            denylist        : DENYLIST,
            targetVisibility: TARGET_VISIBILITY.public
        });

        // Reporting one match invites a scrub-and-repost loop: the author fixes the named occurrence,
        // reposts, and is blocked again by the one the tool already knew about.
        expect(result.matches).toHaveLength(2);
        expect(result.matches[0].offset).not.toBe(result.matches[1].offset);
    });
});

test.describe('confidential token scanner — the paths that do NOT block', () => {
    test('a clean public body is clean, and says it was scanned against a real list', () => {
        // The inverse control. Without it, a scanner that blocked everything would satisfy every
        // blocking assertion above and be worse than useless.
        const result = scanForConfidentialTokens('Rolled out for an external deployment.', {
            denylist        : DENYLIST,
            targetVisibility: TARGET_VISIBILITY.public
        });

        expect(result.outcome).toBe(SCAN_OUTCOME.clean);
        expect(result.reason).toBe(SCAN_REASON.targetPublic);
        expect(isPublishBlocked(result)).toBe(false);
    });

    test('an unconfigured list is UNCHECKED, never clean', () => {
        const result = scanForConfidentialTokens('Rolled out for Acme Corp.', {
            denylist        : [],
            targetVisibility: TARGET_VISIBILITY.public
        });

        // This is the whole defect restated: a body containing a real token, with no list to catch it.
        // Reporting `clean` would be indistinguishable from a body that was examined and was safe.
        expect(result.outcome).toBe(SCAN_OUTCOME.unchecked);
        expect(result.outcome).not.toBe(SCAN_OUTCOME.clean);
        expect(result.reason).toBe(SCAN_REASON.listUnconfigured);
    });

    test('a list of only blank entries is unconfigured, not a configured list that matches nothing', () => {
        // `['']` would fold to an empty key and match at every position, blocking every body. Treating
        // it as unconfigured is both correct and the safer of the two failure modes.
        const result = scanForConfidentialTokens('anything at all', {
            denylist        : ['', '   ', '---'],
            targetVisibility: TARGET_VISIBILITY.public
        });

        expect(result.outcome).toBe(SCAN_OUTCOME.unchecked);
    });

    test('a private target is SKIPPED and named as such — client specifics belong there', () => {
        const result = scanForConfidentialTokens('Rolled out for Acme Corp.', {
            denylist        : DENYLIST,
            targetVisibility: TARGET_VISIBILITY.private
        });

        expect(result.outcome).toBe(SCAN_OUTCOME.skipped);
        expect(result.reason).toBe(SCAN_REASON.targetPrivate);
        expect(isPublishBlocked(result)).toBe(false);
    });

    test('a private target is answered BEFORE the list is consulted', () => {
        // Precedence matters: an unconfigured list on a private deployment is not a gap, and reporting
        // `unchecked` there would send an operator chasing a denylist they do not need.
        const result = scanForConfidentialTokens('Rolled out for Acme Corp.', {
            denylist        : [],
            targetVisibility: TARGET_VISIBILITY.private
        });

        expect(result.outcome).toBe(SCAN_OUTCOME.skipped);
        expect(result.outcome).not.toBe(SCAN_OUTCOME.unchecked);
    });
});

test.describe('confidential token scanner — unknown visibility', () => {
    test('unknown visibility scans, and is DISTINGUISHABLE from public', () => {
        const result = scanForConfidentialTokens('Rolled out for Acme Corp.', {
            denylist        : DENYLIST,
            targetVisibility: TARGET_VISIBILITY.unknown
        });

        // Behaviour identical to public — it must block.
        expect(result.outcome).toBe(SCAN_OUTCOME.blocked);

        // Diagnosis opposite. An operator on a private deployment whose metadata fetch fails
        // structurally would otherwise read this as a content problem, redact a legitimate name, and
        // be blocked again on the next one with nothing pointing at the token scope.
        expect(result.reason).toBe(SCAN_REASON.targetUnknown);
        expect(result.reason).not.toBe(SCAN_REASON.targetPublic);
    });

    test('an absent or malformed visibility fails toward scanning, never toward silence', () => {
        for (const visibility of [undefined, null, '', 'PUBLIC', 'internal', 42]) {
            const result = scanForConfidentialTokens('Rolled out for Acme Corp.', {
                denylist: DENYLIST,
                ...(visibility === undefined ? {} : {targetVisibility: visibility})
            });

            // A permissive default here would be the whole defect wearing a different hat: the
            // guard silently not running because an input it did not recognise looked like a skip.
            expect(result.outcome, `visibility ${JSON.stringify(visibility)}`).toBe(SCAN_OUTCOME.blocked);
            expect(result.reason).toBe(SCAN_REASON.targetUnknown);
        }
    });

    test('unknown visibility with no list is unchecked — it does not silently become clean', () => {
        const result = scanForConfidentialTokens('Rolled out for Acme Corp.', {
            denylist        : [],
            targetVisibility: TARGET_VISIBILITY.unknown
        });

        // Both signals absent at once is the worst case and the one most likely in a broken
        // deployment. It must still not report a pass.
        expect(result.outcome).toBe(SCAN_OUTCOME.unchecked);
        expect(isPublishBlocked(result)).toBe(false);
    });
});

test.describe('confidential token scanner — totality', () => {
    test('never throws, whatever it is handed', () => {
        // The guard sits on every public write. A throw here fails the write for the wrong reason and
        // teaches authors to route around the guard.
        for (const text of [undefined, null, '', 0, {}, [], 'ordinary text']) {
            expect(() => scanForConfidentialTokens(text, {denylist: DENYLIST}), `text ${JSON.stringify(text)}`)
                .not.toThrow();
        }

        expect(() => scanForConfidentialTokens('x', {denylist: null})).not.toThrow();
        expect(() => scanForConfidentialTokens('x', {denylist: 'Acme Corp'})).not.toThrow();
        expect(() => scanForConfidentialTokens('x')).not.toThrow();
    });

    test('a non-array denylist is unconfigured, not silently iterated as characters', () => {
        // A bare string would otherwise iterate per character, folding each to a one-letter key that
        // matches nearly every body — a guard that blocks everything and gets disabled by lunchtime.
        const result = scanForConfidentialTokens('ordinary text', {
            denylist        : 'Acme Corp',
            targetVisibility: TARGET_VISIBILITY.public
        });

        expect(result.outcome).toBe(SCAN_OUTCOME.unchecked);
    });

    test('isPublishBlocked is false for every non-blocking outcome, including malformed input', () => {
        for (const outcome of [SCAN_OUTCOME.clean, SCAN_OUTCOME.unchecked, SCAN_OUTCOME.skipped]) {
            expect(isPublishBlocked({outcome}), outcome).toBe(false);
        }

        expect(isPublishBlocked(null)).toBe(false);
        expect(isPublishBlocked({})).toBe(false);
        expect(isPublishBlocked({outcome: SCAN_OUTCOME.blocked})).toBe(true);
    });
});
