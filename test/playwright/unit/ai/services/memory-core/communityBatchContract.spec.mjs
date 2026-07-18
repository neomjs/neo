import {setup} from '../../../../setup.mjs';

const appName = 'CommunityBatchContractTest';

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

import {test, expect}                                              from '@playwright/test';
import Neo                                                         from '../../../../../../src/Neo.mjs';
import * as core                                                   from '../../../../../../src/core/_export.mjs';
import {BATCH_SCHEMA_VERSION, canonicalBatchDigest, validateBatch} from '../../../../../../ai/services/memory-core/communityBatchContract.mjs';

/**
 * @summary Contract witnesses for community-activity batch admission.
 *
 * The load-bearing pair is the ordering pin: the occurrence COLLECTION is order-insensitive (a
 * connector re-serializing from a map must not raise an integrity conflict), while ordering INSIDE
 * an occurrence is preserved (nothing in the contract makes nested array order non-authoritative, and
 * silently normalizing it is precisely how corruption detection weakens without a test noticing).
 */
test.describe('community-activity-batch.v1 contract', () => {
    const occurrence = (id, over = {}) => ({
        providerEntityId: id,
        occurrenceKind  : 'issue.opened',
        occurredAt      : '2026-07-18T10:00:00Z',
        ...over
    });

    const batch = (over = {}) => ({
        schemaVersion    : BATCH_SCHEMA_VERSION,
        batchId          : 'batch-1',
        sourceInstanceId : 'src-1',
        registrationEpoch: 2,
        partition        : 'issues',
        coverage         : {fromBasis: 'c1', toBasis: 'c9', complete: true},
        occurrences      : [occurrence('e1'), occurrence('e2')],
        ...over
    });

    // ------------------------------------------------------------------ the ordering decision

    test('reordering the occurrence collection yields the SAME digest (retry, not corruption)', () => {
        const forward  = batch(),
              reversed = batch({occurrences: [...forward.occurrences].reverse()});

        expect(canonicalBatchDigest(reversed)).toBe(canonicalBatchDigest(forward));
    });

    test('mutating any occurrence field yields a DIFFERENT digest (integrity conflict)', () => {
        const base    = batch(),
              mutated = batch({occurrences: [occurrence('e1'), occurrence('e2', {occurrenceKind: 'issue.closed'})]});

        expect(canonicalBatchDigest(mutated)).not.toBe(canonicalBatchDigest(base));
    });

    test('ordering INSIDE an occurrence stays significant — no blanket array sort', () => {
        const a = batch({occurrences: [occurrence('e1', {reactionKinds: ['x', 'y']})]}),
              b = batch({occurrences: [occurrence('e1', {reactionKinds: ['y', 'x']})]});

        expect(canonicalBatchDigest(b), 'a blanket sort would collapse these and weaken detection')
            .not.toBe(canonicalBatchDigest(a));
    });

    test('digest is stable across key insertion order', () => {
        const a = batch(),
              b = {occurrences: a.occurrences, coverage: a.coverage, partition: a.partition,
                   registrationEpoch: a.registrationEpoch, sourceInstanceId: a.sourceInstanceId,
                   batchId          : a.batchId, schemaVersion: a.schemaVersion};

        expect(canonicalBatchDigest(b)).toBe(canonicalBatchDigest(a));
    });

    test('batch identity fields participate in the digest', () => {
        expect(canonicalBatchDigest(batch({registrationEpoch: 3}))).not.toBe(canonicalBatchDigest(batch()));
        expect(canonicalBatchDigest(batch({partition: 'pulls'}))).not.toBe(canonicalBatchDigest(batch()));
    });

    // ------------------------------------------------------------------ validation (AC1/AC6/AC7)

    test('a well-formed batch validates', () => {
        expect(validateBatch(batch())).toEqual({valid: true, errors: []});
    });

    test('an unsupported schema version is refused', () => {
        const {valid, errors} = validateBatch(batch({schemaVersion: 'community-activity-batch.v2'}));

        expect(valid).toBe(false);
        expect(errors).toContain('BATCH_SCHEMA_VERSION_UNSUPPORTED');
    });

    test('prose is REFUSED, not silently stripped', () => {
        const {valid, errors} = validateBatch(batch({occurrences: [occurrence('e1', {title: 'Crash on load'})]}));

        expect(valid).toBe(false);
        expect(errors).toContain('OCCURRENCE_0_CARRIES_PROSE_TITLE');
    });

    test('a complete window cannot also claim gaps, and an incomplete one must', () => {
        expect(validateBatch(batch({coverage: {fromBasis: 'c1', toBasis: 'c9', complete: true, gaps: [{fromBasis: 'c4', toBasis: 'c5', reason: 'rate-limit'}]}})).errors)
            .toContain('COVERAGE_COMPLETE_CONTRADICTS_GAPS');

        expect(validateBatch(batch({coverage: {fromBasis: 'c1', toBasis: 'c9', complete: false}})).errors)
            .toContain('COVERAGE_INCOMPLETE_WITHOUT_GAPS');
    });

    test('absence must be one of the three evidenced dispositions', () => {
        expect(validateBatch(batch({occurrences: [occurrence('e1', {absence: 'probably-gone'})]})).errors)
            .toContain('OCCURRENCE_0_ABSENCE_DISPOSITION_INVALID');

        ['deleted', 'inaccessible', 'unknown'].forEach(disposition => {
            expect(validateBatch(batch({occurrences: [occurrence('e1', {absence: disposition})]})).valid).toBe(true);
        });
    });

    test('a non-current-shaped registration epoch is refused', () => {
        expect(validateBatch(batch({registrationEpoch: 0})).errors).toContain('BATCH_REGISTRATION_EPOCH_INVALID');
        expect(validateBatch(batch({registrationEpoch: '2'})).errors).toContain('BATCH_REGISTRATION_EPOCH_INVALID');
    });

    test('missing required identity is refused', () => {
        expect(validateBatch(batch({sourceInstanceId: null})).errors).toContain('BATCH_MISSING_SOURCEINSTANCEID');
        expect(validateBatch(null)).toEqual({valid: false, errors: ['BATCH_NOT_AN_OBJECT']});
    });
});
