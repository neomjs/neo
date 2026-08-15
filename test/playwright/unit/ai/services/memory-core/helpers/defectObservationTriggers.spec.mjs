import {test, expect}          from '@playwright/test';
import {defectNoteFingerprint} from '../../../../../../../ai/services/memory-core/helpers/defectObservationFold.mjs';
import {
    buildDigestBody,
    collectSuppressedFingerprints,
    DIGEST_SUBJECT_PREFIX,
    independentSecondOccurrence,
    parseDigestCoverage,
    selectDigestRecords
} from '../../../../../../../ai/services/memory-core/helpers/defectObservationTriggers.mjs';

// Pure module — no Neo runtime, no fs, no clock (coverage and suppression are caller-fed).

const NOTE = 'defect-note: query_summaries broke returns zero-content rows for populated sessions';

/**
 * Builds a standing record shaped like the fold's output.
 * @param {Object} overrides
 * @returns {Object}
 */
function record(overrides = {}) {
    return {
        fingerprint: 'aaaabbbbccccdddd',
        surface    : 'query_summaries',
        symptom    : 'returns zero-content rows for populated sessions',
        parseable  : true,
        count      : 2,
        reporters  : ['@a', '@b'],
        firstSeenAt: '2026-08-15T08:00:00.000Z',
        lastSeenAt : '2026-08-15T09:00:00.000Z',
        state      : 'red',
        ...overrides
    };
}

test.describe('defectObservationTriggers — the defect-ledger observer layer', () => {
    test('independent second occurrence holds at and only at its boundary', () => {
        expect(independentSecondOccurrence(record())).toBe(true);
        expect(independentSecondOccurrence(record({count: 3}))).toBe(true);
        // One reporter re-confirming their own sighting is an echo, not corroboration.
        expect(independentSecondOccurrence(record({reporters: ['@a']}))).toBe(false);
        expect(independentSecondOccurrence(record({count: 1, reporters: ['@a']}))).toBe(false);
        expect(independentSecondOccurrence(null)).toBe(false);
    });

    test('selectDigestRecords keeps only open, qualifying, unsuppressed, unreported records', () => {
        const qualifying = record();

        expect(selectDigestRecords({records: [qualifying]})).toHaveLength(1);
        // Recovered and quiet records stay silent regardless of count.
        expect(selectDigestRecords({records: [record({state: 'recovered'})]})).toHaveLength(0);
        expect(selectDigestRecords({records: [record({state: 'quiet'})]})).toHaveLength(0);
        // A record reported at its current count is not news.
        expect(selectDigestRecords({
            records      : [qualifying],
            priorCoverage: {aaaabbbbccccdddd: 2}
        })).toHaveLength(0);
        // Count growth re-qualifies — new sightings are new evidence (the re-open case included).
        expect(selectDigestRecords({
            records      : [record({count: 3})],
            priorCoverage: {aaaabbbbccccdddd: 2}
        })).toHaveLength(1);
        // Suppression wins over qualification.
        expect(selectDigestRecords({
            records               : [qualifying],
            suppressedFingerprints: new Set(['aaaabbbbccccdddd'])
        })).toHaveLength(0);
        // An empty qualifying set selects nothing — the digest's no-message case is decided here.
        expect(selectDigestRecords({records: []})).toHaveLength(0);
    });

    test('suppression: any seat promotes, only the operator dismisses, recovery never suppresses', () => {
        const promotedRow = {from: '@a', subject: NOTE.replace('defect-note:', 'defect-note: [promoted #17136]')},
              dismissedOp = {from: '@tobiu', subject: NOTE.replace('defect-note:', 'defect-note: [dismissed]')},
              dismissedPg = {from: '@b', subject: NOTE.replace('defect-note:', 'defect-note: [dismissed]')},
              recovered   = {from: '@a', subject: NOTE.replace('defect-note:', 'defect-note: [recovered]')};

        const noteFingerprint = selectDigestRecords({
            records: [record({fingerprint: defectNoteFingerprint(NOTE)})]
        });

        expect(noteFingerprint).toHaveLength(1); // sanity: the plain note qualifies

        const byPromotion = collectSuppressedFingerprints([promotedRow]);

        expect(selectDigestRecords({
            records               : [record({fingerprint: defectNoteFingerprint(NOTE)})],
            suppressedFingerprints: byPromotion
        })).toHaveLength(0);

        const byOperator = collectSuppressedFingerprints([dismissedOp]);

        expect(byOperator.size).toBe(1);
        // A peer's "dismissed" is prose — only the operator's is a disposition.
        expect(collectSuppressedFingerprints([dismissedPg]).size).toBe(0);
        // Recovery is a state the fold computes, never a suppression.
        expect(collectSuppressedFingerprints([recovered]).size).toBe(0);
    });

    test('digest coverage round-trips: max count per fingerprint, malformed bodies cover nothing', () => {
        const body = buildDigestBody({records: [record(), record({fingerprint: 'eeee111122223333', count: 5})]});

        expect(parseDigestCoverage([body])).toEqual({aaaabbbbccccdddd: 2, eeee111122223333: 5});
        // Later digests widen coverage monotonically.
        expect(parseDigestCoverage([body, buildDigestBody({records: [record({count: 4})]})]))
            .toEqual({aaaabbbbccccdddd: 4, eeee111122223333: 5});
        expect(parseDigestCoverage(['no machine block here', undefined])).toEqual({});

        // The rendered digest names the promotion/dismissal convention it suppresses against.
        expect(body).toContain('[promoted #N]');
        expect(body).toContain('[dismissed]');
    });

    test('the digest subject prefix is a stable, filterable channel marker', () => {
        expect(DIGEST_SUBJECT_PREFIX).toBe('defect-ledger-digest:');
        expect(DIGEST_SUBJECT_PREFIX.startsWith('defect-note:')).toBe(false);
    });
});
