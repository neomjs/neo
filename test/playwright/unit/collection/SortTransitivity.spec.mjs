import {setup} from '../../setup.mjs';

const appName = 'CollectionSortTransitivityTest';

setup({
    appConfig: {
        name: appName
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Collection     from '../../../../src/collection/Base.mjs';
import Sorter         from '../../../../src/collection/Sorter.mjs';

/**
 * `5 > 'abc'` and `5 < 'abc'` are both false, so a comparator built on the relational operators alone
 * reports a TIE for any number against a non-coercing string while still ordering two numbers. That is
 * intransitive, and `Array.prototype.sort` is specified only for a consistent comparator — so the emitted
 * order becomes a function of the element count and the engine's algorithm rather than of the data.
 *
 * These arms assert the PROPERTY, not one permutation. A permutation assertion passes on the day V8's
 * sort happens to agree with it and says nothing about the relation, which is the thing that was broken.
 */

/**
 * The mixed population every arm below is checked against. Deliberately includes both sides of each
 * decision: numbers, a non-coercing string, a coercing string, an empty string (which coerces to 0),
 * and both nullish values.
 */
const values = [5, 1, 'abc', 'zz', '10', '', null, undefined];

/**
 * Exhaustively checks that `compare` is a consistent ordering over `population`: antisymmetric across
 * every pair and transitive across every triple. Reports the offending operands, because a bare
 * "expected 1 to be -1" on a triple loop is unusable.
 * @param {Function} compare
 * @param {Array} population
 */
function assertConsistentOrdering(compare, population) {
    for (const a of population) {
        for (const b of population) {
            // Summed rather than negated: `-0` is not `0` under `Object.is`, so the obvious
            // `toBe(-compare(b, a))` reds on every genuine tie. The sum is the property anyway.
            expect(compare(a, b) + compare(b, a), `antisymmetry: ${String(a)} vs ${String(b)}`).toBe(0);

            for (const c of population) {
                if (compare(a, b) <= 0 && compare(b, c) <= 0) {
                    expect(
                        compare(a, c) <= 0,
                        `transitivity: ${String(a)} <= ${String(b)} <= ${String(c)}, so ${String(a)} <= ${String(c)}`
                    ).toBe(true);
                }
            }
        }
    }
}

test.describe('Neo.collection sorting is a consistent ordering (#19027)', () => {
    test('the shared rule is antisymmetric and transitive over mixed types, in BOTH directions', () => {
        assertConsistentOrdering((a, b) => Sorter.compareValues(a, b,  1), values);
        assertConsistentOrdering((a, b) => Sorter.compareValues(a, b, -1), values);
    });

    test('no pair reports a tie unless it is genuinely equal', () => {
        // The tie is the defect: a comparator may return 0 only for values a caller would call equal.
        for (const a of values) {
            for (const b of values) {
                const bothNullish = a == null && b == null;

                expect(
                    Sorter.compareValues(a, b, 1) === 0,
                    `tie: ${String(a)} vs ${String(b)}`
                ).toBe(a === b || bothNullish);
            }
        }
    });

    test('a number sorts before a non-coercing string, and that rank FOLLOWS the direction', () => {
        // Unlike the nullish rule, which is about absence and therefore sinks both ways. Both operands
        // here are present values, so the pair is an ordering question and flips with the ordering.
        expect(Sorter.compareValues(5, 'abc',  1)).toBe(-1);
        expect(Sorter.compareValues('abc', 5,  1)).toBe( 1);
        expect(Sorter.compareValues(5, 'abc', -1)).toBe( 1);
        expect(Sorter.compareValues('abc', 5, -1)).toBe(-1);
    });

    test('nullish still sinks on ASC and DESC alike — the February rule is untouched', () => {
        expect(Sorter.compareValues(null, 'Acme',       1)).toBe(1);
        expect(Sorter.compareValues(null, 'Acme',      -1)).toBe(1);
        expect(Sorter.compareValues(undefined, 5,       1)).toBe(1);
        expect(Sorter.compareValues(undefined, 5,      -1)).toBe(1);
        expect(Sorter.compareValues('Acme', null,       1)).toBe(-1);
        expect(Sorter.compareValues('Acme', null,      -1)).toBe(-1);
    });

    test('a string that coerces is still compared as a number, so the rank never reaches it', () => {
        expect(Sorter.compareValues('10', 5, 1)).toBe( 1);  // ten is greater than five
        expect(Sorter.compareValues(5, '10', 1)).toBe(-1);
        expect(Sorter.compareValues('',  5,  1)).toBe(-1);  // '' coerces to 0
        expect(Sorter.compareValues(5,  '',  1)).toBe( 1);
    });

    test('BOTH collection sort paths emit the same order — the drift that caused this bug class', () => {
        // `doSort` routes through Sorter.compareValues for plain sorters and through `defaultSortBy`
        // once any sorter carries a custom `sortBy`. The February repair reached one path and not the
        // other, so the two are asserted against each other rather than each against a literal.
        const items = () => [
            {id: 1, v: 5},
            {id: 2, v: 'abc'},
            {id: 3, v: 1},
            {id: 4, v: 'zz'},
            {id: 5, v: null},
            {id: 6, v: '10'}
        ];

        const plain = Neo.create(Collection, {
            items  : items(),
            sorters: [{direction: 'ASC', property: 'v'}]
        });

        const viaDefaultSortBy = Neo.create(Collection, {
            items  : items(),
            sorters: [
                // A no-op custom sorter flips `doSort` onto the `defaultSortBy` path for the real one.
                {direction: 'ASC', property: 'id', sortBy: () => 0},
                {direction: 'ASC', property: 'v'}
            ]
        });

        expect(viaDefaultSortBy.getRange().map(item => item.id))
            .toEqual(plain.getRange().map(item => item.id));
    });

    test('the emitted order is actually ordered — the observable payoff', () => {
        // [5, 'abc', 1] used to come back unchanged, and an eleven-element input ordered only its tail.
        const collection = Neo.create(Collection, {
            items  : [{id: 1, v: 5}, {id: 2, v: 'abc'}, {id: 3, v: 1}],
            sorters: [{direction: 'ASC', property: 'v'}]
        });

        expect(collection.getRange().map(item => item.v)).toEqual([1, 5, 'abc']);

        collection.sorters = [{direction: 'DESC', property: 'v'}];
        expect(collection.getRange().map(item => item.v)).toEqual(['abc', 5, 1]);
    });

    test('the order does not depend on the element count', () => {
        // The old comparator ordered only part of an eleven-element input. Sorting the same population
        // twice at different lengths must agree on the overlap.
        const build = vs => Neo.create(Collection, {
            items  : vs.map((v, index) => ({id: index, v})),
            sorters: [{direction: 'ASC', property: 'v'}]
        }).getRange().map(item => item.v);

        const short = build([5, 'abc', 1]),
              long  = build([5, 'abc', 1, 9, 'zz', 3, 7, 'mm', 2, 8, 4]);

        expect(short).toEqual([1, 5, 'abc']);
        expect(long.filter(v => typeof v === 'number')).toEqual([1, 2, 3, 4, 5, 7, 8, 9]);
        expect(long.slice(-3)).toEqual(['abc', 'mm', 'zz']);
    });
});
