import {test, expect} from '@playwright/test';

import {
    buildSourceReceipt,
    deriveLineage,
    derivesEmpty,
    LINEAGE,
    READ_COMPLETENESS,
    ROW_STATE
} from '../../../../../../ai/services/shared/captureReceipt.mjs';

/**
 * @summary The receipt vocabulary and its single derivation rule.
 *
 * The predecessor of this module collapsed three independent facts onto one `captured | empty |
 * unavailable` enum and was Drop+Superseded for it: a changed collection identity was read as data
 * loss, which Neo's own re-embed disproves — `VectorService` rebuilds into a shadow collection and
 * promotes it live → parking, shadow → canonical, so every healthy re-embed changes the canonical
 * identity with nothing lost. These specs pin the axes as orthogonal and `empty` as the one derived
 * claim, so the collapse cannot come back by accident.
 */
test.describe('ai/services/shared/captureReceipt — three facts, one derived claim', () => {
    test('`empty` requires zero rows AND a complete read AND a continuous lineage', () => {
        expect(derivesEmpty({
            rowState        : ROW_STATE.zero,
            readCompleteness: READ_COMPLETENESS.complete,
            lineage         : LINEAGE.same
        })).toBe(true);
    });

    test('a CHANGED lineage never derives `empty` — the falsifier that dropped the predecessor', () => {
        // A re-embed promotes a shadow collection into the canonical name, and a restore drops and
        // re-resolves. Both change the identity deliberately, with nothing lost. Reading that as
        // "the corpus was gone" is the exact defect this module exists to prevent.
        const promoted = buildSourceReceipt({
            source      : 'neo-knowledge-base',
            rowCount    : 0,
            readComplete: true,
            collectionId: 'shadow-id-after-promote',
            previousId  : 'canonical-id-before-promote'
        });

        expect(promoted.lineage).toBe(LINEAGE.changed);
        expect(promoted.empty).toBe(false);
        // The facts survive rather than collapsing: a consumer can still see there were zero rows.
        expect(promoted.rowState).toBe(ROW_STATE.zero);
        expect(promoted.readCompleteness).toBe(READ_COMPLETENESS.complete);
    });

    test('an UNKNOWN lineage never derives `empty` — first run has nothing to compare against', () => {
        const firstRun = buildSourceReceipt({
            source      : 'neo-agent-memory',
            rowCount    : 0,
            readComplete: true,
            collectionId: 'some-id',
            previousId  : null
        });

        expect(firstRun.lineage).toBe(LINEAGE.unknown);
        expect(firstRun.empty).toBe(false);
    });

    test('an INCOMPLETE read never derives `empty` — the zero describes the read, not the store', () => {
        const unread = buildSourceReceipt({
            source      : 'neo-agent-memory',
            rowCount    : 0,
            readComplete: false,
            collectionId: 'same-id',
            previousId  : 'same-id'
        });

        expect(unread.readCompleteness).toBe(READ_COMPLETENESS.unavailable);
        expect(unread.empty).toBe(false);
    });

    test('rows are self-evidencing: a populated source is never `empty`, whatever its lineage', () => {
        for (const previousId of ['same-id', 'different-id', null]) {
            const populated = buildSourceReceipt({
                source      : 'neo-agent-memory',
                rowCount    : 94325,
                readComplete: true,
                collectionId: 'same-id',
                previousId
            });

            expect(populated.rowState, `previousId=${previousId}`).toBe(ROW_STATE.populated);
            expect(populated.empty,    `previousId=${previousId}`).toBe(false);
        }
    });

    test('a populated source with a CHANGED lineage keeps both facts — positive rows must not erase the change', () => {
        // The May-2026 partial specimen in reverse: positive row parity is not a reason to stop
        // reporting that the source is not the one the previous bundle observed.
        const receipt = buildSourceReceipt({
            source      : 'neo-agent-sessions',
            rowCount    : 12,
            readComplete: true,
            collectionId: 'b',
            previousId  : 'a'
        });

        expect(receipt.rowState).toBe(ROW_STATE.populated);
        expect(receipt.lineage).toBe(LINEAGE.changed);
    });

    test('lineage compares IDENTITY, and a missing id on either side is `unknown` rather than `same`', () => {
        expect(deriveLineage({currentId: 'a',  previousId: 'a'})).toBe(LINEAGE.same);
        expect(deriveLineage({currentId: 'a',  previousId: 'b'})).toBe(LINEAGE.changed);
        // Absent evidence is not evidence of continuity — the failure mode that would silently
        // manufacture `empty` for every source whose id could not be observed.
        expect(deriveLineage({currentId: 'a',  previousId: null})).toBe(LINEAGE.unknown);
        expect(deriveLineage({currentId: null, previousId: 'a'})).toBe(LINEAGE.unknown);
        expect(deriveLineage({currentId: null, previousId: null})).toBe(LINEAGE.unknown);
        expect(deriveLineage()).toBe(LINEAGE.unknown);
    });

    test('`partial` is absent from the completeness vocabulary until a producer exists', () => {
        // Every partial read in this substrate becomes a thrown abort (`PARTIAL_COLLECTION_EXPORT`),
        // so no published bundle can carry the value. Shipping it would be a promise the contract
        // cannot keep; this pins its absence so it is re-added deliberately, with a producer.
        expect(Object.values(READ_COMPLETENESS)).toEqual(['complete', 'unavailable']);
        expect(Object.values(READ_COMPLETENESS)).not.toContain('partial');
    });

    test('the axis vocabularies are frozen — a consumer cannot widen a verdict at runtime', () => {
        expect(Object.isFrozen(ROW_STATE)).toBe(true);
        expect(Object.isFrozen(READ_COMPLETENESS)).toBe(true);
        expect(Object.isFrozen(LINEAGE)).toBe(true);
    });
});
