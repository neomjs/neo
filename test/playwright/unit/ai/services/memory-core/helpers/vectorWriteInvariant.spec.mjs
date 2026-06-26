import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../../src/core/_export.mjs';
import {
    classifyRowVector,
    partitionRowsByVectorValidity,
    summarizeVectorRejections,
    VECTOR_REJECTION_REASONS
} from '../../../../../../../ai/services/memory-core/helpers/vectorWriteInvariant.mjs';

// Atomic vector-write invariant: the pure gate-core that makes the metadata-without-vector corruption
// shape unrepresentable at the Memory Core write boundary. A row is persisted only when it carries a
// valid, same-dimension embedding; everything else is partitioned into `rejected` (with a reason) for
// fail-loud routing — never half-written.

const DIM      = 4,
      validVec = (d = DIM) => Array.from({length: d}, (_, i) => (i + 1) * 0.125);

test.describe('vectorWriteInvariant — atomic vector-write invariant (#14029 gate-core)', () => {
    test('valid same-dimension rows all pass, preserving order (no regression to legitimate appends)', () => {
        const rows = [
            {id: 'a', embedding: validVec(), metadata: {}, document: 'doc-a'},
            {id: 'b', embedding: validVec(), metadata: {}, document: 'doc-b'}
        ];

        const {valid, rejected} = partitionRowsByVectorValidity({rows, expectedDimension: DIM});

        expect(rejected).toEqual([]);
        expect(valid).toHaveLength(2);
        expect(valid.map(r => r.id)).toEqual(['a', 'b']);
        expect(valid[0].document).toBe('doc-a');
    });

    test('a missing / null / non-array embedding is rejected (never persisted metadata-only)', () => {
        const rows = [
            {id: 'missing', metadata: {}},
            {id: 'null',    embedding: null},
            {id: 'notArr',  embedding: 'nope'}
        ];

        const {valid, rejected} = partitionRowsByVectorValidity({rows, expectedDimension: DIM});

        expect(valid).toEqual([]);
        expect(rejected).toEqual([
            {id: 'missing', reason: 'missing-embedding'},
            {id: 'null',    reason: 'missing-embedding'},
            {id: 'notArr',  reason: 'missing-embedding'}
        ]);
    });

    test('an empty embedding is rejected', () => {
        const {valid, rejected} = partitionRowsByVectorValidity({
            rows             : [{id: 'e', embedding: []}],
            expectedDimension: DIM
        });

        expect(valid).toEqual([]);
        expect(rejected).toEqual([{id: 'e', reason: 'empty-embedding'}]);
    });

    test('a wrong-dimension embedding is rejected, not stored', () => {
        const {valid, rejected} = partitionRowsByVectorValidity({
            rows: [
                {id: 'short', embedding: validVec(DIM - 1)},
                {id: 'long',  embedding: validVec(DIM + 1)}
            ],
            expectedDimension: DIM
        });

        expect(valid).toEqual([]);
        expect(rejected).toEqual([
            {id: 'short', reason: 'wrong-dimension'},
            {id: 'long',  reason: 'wrong-dimension'}
        ]);
    });

    test('a non-finite (NaN / Infinity) value is rejected', () => {
        const nan = validVec(); nan[1] = NaN;
        const inf = validVec(); inf[2] = Infinity;

        const {valid, rejected} = partitionRowsByVectorValidity({
            rows             : [{id: 'nan', embedding: nan}, {id: 'inf', embedding: inf}],
            expectedDimension: DIM
        });

        expect(valid).toEqual([]);
        expect(rejected).toEqual([
            {id: 'nan', reason: 'non-finite-values'},
            {id: 'inf', reason: 'non-finite-values'}
        ]);
    });

    test('a mixed batch partitions valid from rejected, preserving valid order', () => {
        const rows = [
            {id: 'ok1',      embedding: validVec()},
            {id: 'bad',      embedding: []},
            {id: 'ok2',      embedding: validVec()},
            {id: 'wrongdim', embedding: validVec(DIM + 2)}
        ];

        const {valid, rejected} = partitionRowsByVectorValidity({rows, expectedDimension: DIM});

        expect(valid.map(r => r.id)).toEqual(['ok1', 'ok2']);
        expect(rejected).toEqual([
            {id: 'bad',      reason: 'empty-embedding'},
            {id: 'wrongdim', reason: 'wrong-dimension'}
        ]);
    });

    test('classifyRowVector reports the first / most-fundamental failure', () => {
        expect(classifyRowVector({id: 'x'},             DIM)).toBe(VECTOR_REJECTION_REASONS.missingEmbedding);
        expect(classifyRowVector({embedding: []},       DIM)).toBe(VECTOR_REJECTION_REASONS.emptyEmbedding);
        expect(classifyRowVector({embedding: [1, 2]},   DIM)).toBe(VECTOR_REJECTION_REASONS.wrongDimension);
        expect(classifyRowVector({embedding: validVec()}, DIM)).toBeNull();
    });

    test('enforces the real 4096 production dimension', () => {
        const {valid, rejected} = partitionRowsByVectorValidity({
            rows: [
                {id: 'real',    embedding: validVec(4096)},
                {id: 'realbad', embedding: validVec(4095)}
            ],
            expectedDimension: 4096
        });

        expect(valid.map(r => r.id)).toEqual(['real']);
        expect(rejected).toEqual([{id: 'realbad', reason: 'wrong-dimension'}]);
    });

    test('summarizeVectorRejections gives a fail-loud count + per-reason breakdown', () => {
        const rejected = [
            {id: 'a', reason: 'missing-embedding'},
            {id: 'b', reason: 'missing-embedding'},
            {id: 'c', reason: 'wrong-dimension'}
        ];

        expect(summarizeVectorRejections(rejected)).toEqual({
            count   : 3,
            byReason: {'missing-embedding': 2, 'wrong-dimension': 1}
        });
        expect(summarizeVectorRejections()).toEqual({count: 0, byReason: {}});
    });

    test('rejects invalid inputs (guards the invariant itself)', () => {
        expect(() => partitionRowsByVectorValidity({rows: 'nope', expectedDimension: DIM})).toThrow(/rows must be an array/);
        expect(() => partitionRowsByVectorValidity({rows: [], expectedDimension: 0})).toThrow(/positive integer/);
        expect(() => partitionRowsByVectorValidity({rows: [], expectedDimension: 1.5})).toThrow(/positive integer/);
        expect(() => partitionRowsByVectorValidity({rows: [], expectedDimension: -4096})).toThrow(/positive integer/);
    });
});
