import {setup} from '../../setup.mjs';

const appName = 'CollectionSorterPrecedenceTest';

setup({
    appConfig: {
        name: appName
    }
});

import {test, expect}  from '@playwright/test';
import Neo             from '../../../../src/Neo.mjs';
import * as core       from '../../../../src/core/_export.mjs';
import Collection      from '../../../../src/collection/Base.mjs';

/**
 * Multi-sorter precedence and mixed-type ordering, neither of which was pinned.
 *
 * Every expectation below was read off the running engine rather than derived
 * from the source, because the two composition paths in `collection/Base.mjs`
 * (`hasSortByMethod` versus the mapped-value path) do not implement the
 * comparison in the same code, and the intent for the cases at the bottom is
 * not documented anywhere. Where behaviour looks unintended it is marked in the
 * test body and asserted as-is, so the disagreement is recorded instead of
 * silently blessed.
 */
test.describe('Neo.collection multi-sorter precedence', () => {
    test('the second sorter only breaks ties left by the first', () => {
        let collection = Neo.create(Collection, {
            items: [
                {id: 1, lastName: 'b', age: 30},
                {id: 2, lastName: 'a', age: 50},
                {id: 3, lastName: 'a', age: 20},
                {id: 4, lastName: 'b', age: 10}
            ],
            sorters: [
                {direction: 'ASC', property: 'lastName'},
                {direction: 'ASC', property: 'age'}
            ]
        });

        // A naive implementation that lets the latter sorter win outright would
        // order by age alone: 10, 20, 30, 50.
        expect(collection.items.map(i => [i.lastName, i.age]))
            .toEqual([['a', 20], ['a', 50], ['b', 10], ['b', 30]]);
    });

    test('a DESC second sorter sorts within the first sorter groups only', () => {
        let collection = Neo.create(Collection, {
            items: [
                {id: 1, lastName: 'b', age: 30},
                {id: 2, lastName: 'a', age: 50},
                {id: 3, lastName: 'a', age: 20},
                {id: 4, lastName: 'b', age: 10}
            ],
            sorters: [
                {direction: 'ASC',  property: 'lastName'},
                {direction: 'DESC', property: 'age'}
            ]
        });

        // The first sorter stays ASC while the second runs DESC, so a shared
        // directionMultiplier for the whole sort would produce 50, 30, 20, 10.
        expect(collection.items.map(i => [i.lastName, i.age]))
            .toEqual([['a', 50], ['a', 20], ['b', 30], ['b', 10]]);
    });

    test('precedence composes across three sorters', () => {
        let collection = Neo.create(Collection, {
            items: [
                {id: 1, a: 'x', b: 'p', c: 2},
                {id: 2, a: 'x', b: 'p', c: 1},
                {id: 3, a: 'x', b: 'o', c: 9},
                {id: 4, a: 'w', b: 'z', c: 5}
            ],
            sorters: [
                {direction: 'ASC', property: 'a'},
                {direction: 'ASC', property: 'b'},
                {direction: 'ASC', property: 'c'}
            ]
        });

        // The third sorter reaches items 1 and 2, which agree on both a and b.
        // A two-key special case would leave those two in insertion order.
        expect(collection.items.map(i => [i.a, i.b, i.c]))
            .toEqual([['w', 'z', 5], ['x', 'o', 9], ['x', 'p', 1], ['x', 'p', 2]]);
    });

    test('a sorter carrying sortBy does not change how the others compare', () => {
        const items = () => [
            {id: 1, name: 'Beta'},
            {id: 2, name: 'alpha'},
            {id: 3, name: 'Gamma'}
        ];

        // The two composition paths in collection/Base.mjs are different code.
        // Route the same data through each and require the same ordering.
        let rawPath = Neo.create(Collection, {
            items: items(),
            sorters: [{direction: 'ASC', property: 'name'}]
        });

        // The comparator has to be one that would visibly lose if the code
        // ignored it. `sortBy: () => 0` wins nothing and passes even when
        // custom comparators are dropped entirely, so this one carries a
        // conflicting property and direction: `sortBy` takes precedence over
        // both, which makes a reversed result the only way it can pass.
        let sortByPath = Neo.create(Collection, {
            items: items(),
            sorters: [
                // property + direction alone would give alpha, Beta, Gamma
                {direction: 'ASC', property: 'name', sortBy: (a, b) => b.name.localeCompare(a.name)}
            ]
        });

        expect(rawPath.items.map(i => i.name)).toEqual(['alpha', 'Beta', 'Gamma']);
        expect(sortByPath.items.map(i => i.name)).toEqual(['Gamma', 'Beta', 'alpha']);
    });

    test('a numeric string and a number compare by coerced value', () => {
        let collection = Neo.create(Collection, {
            items: [
                {id: 1, v: 5},
                {id: 2, v: '10'},
                {id: 3, v: 2}
            ],
            sorters: [{direction: 'ASC', property: 'v'}]
        });

        // `'10' > 5` coerces the string, so '10' sorts as ten rather than as
        // "1" followed by "0". Nothing documents this, so the measured order is
        // the record.
        expect(collection.items.map(i => i.v)).toEqual([2, 5, '10']);
    });

    test('useTransformValue false opts out of the lowercase normalisation', () => {
        let collection = Neo.create(Collection, {
            items: [
                {id: 1, name: 'Beta'},
                {id: 2, name: 'alpha'},
                {id: 3, name: 'Gamma'}
            ],
            sorters: [{direction: 'ASC', property: 'name', useTransformValue: false}]
        });

        // Raw code-unit order, so every capital precedes every lowercase letter.
        expect(collection.items.map(i => i.name)).toEqual(['Beta', 'Gamma', 'alpha']);
    });

    test('empty string and zero sort as values while null goes last', () => {
        let collection = Neo.create(Collection, {
            items: [
                {id: 1, v: 1},
                {id: 2, v: ''},
                {id: 3, v: 0},
                {id: 4, v: null}
            ],
            sorters: [{direction: 'ASC', property: 'v'}]
        });

        // Only null and undefined take the early-return path. The other falsy
        // values reach the comparison and compare equal, so they keep input
        // order among themselves.
        expect(collection.items.map(i => [i.v, typeof i.v]))
            .toEqual([['', 'string'], [0, 'number'], [1, 'number'], [null, 'object']]);
    });

    test('nullish values sink inside their first-key group, not to the end', () => {
        let collection = Neo.create(Collection, {
            items: [
                {id: 1, lastName: 'b', v: 1},
                {id: 2, lastName: 'b', v: null},
                {id: 3, lastName: 'a', v: 0},
                {id: 4, lastName: 'a', v: null},
                {id: 5, lastName: 'a', v: undefined}
            ],
            sorters: [
                {direction: 'ASC', property: 'lastName'},
                {direction: 'ASC', property: 'v'}
            ]
        });

        const rows  = collection.items.map(i => [i.lastName, i.v]);
        const group = (name) => rows.filter(r => r[0] === name);

        // A null check applied before the first key would send every nullish
        // item past the whole list. Both keys run in order, so they only sink
        // within the lastName they belong to, and the 'a' group still leads.
        expect(rows[0][0]).toBe('a');
        expect(group('a').slice(-2)).toEqual([['a', null], ['a', undefined]]);
        expect(group('b').slice(-1)).toEqual([['b', null]]);
    });

    test('mixed number and non-numeric string values do not form a total order', () => {
        let collection = Neo.create(Collection, {
            items: [
                {id: 1, v: 5},
                {id: 2, v: 'abc'},
                {id: 3, v: 1}
            ],
            sorters: [{direction: 'ASC', property: 'v'}]
        });

        // Asserted as-is, and this one is worth a decision rather than a fix in
        // a test-only PR: `5 > 'abc'` and `5 < 'abc'` are both false, so the
        // comparator reports a tie for any number against any non-numeric
        // string. 5 and 1 then compare normally to each other, which makes the
        // relation intransitive and leaves the output dependent on the engine's
        // sort algorithm rather than on the data. The array below is NOT in
        // order, and no small change to this spec would make it so.
        expect(collection.items.map(i => i.v)).toEqual([5, 'abc', 1]);
    });

    test('the caller array is left alone but its item objects are shared', () => {
        const source = [{v: 3}, {v: 1}, {v: 2}];
        const before = JSON.stringify(source);

        let collection = Neo.create(Collection, {
            items: source,
            sorters: [{direction: 'ASC', property: 'v'}]
        });

        // The ARRAY is duplicated before the sort, so the caller's order
        // survives. The copy comes from the `items_` descriptor
        // (`clone: 'shallow'` runs Neo.clone(value, false, true) in the setter),
        // verified by removing the later `_items.slice()` and watching this
        // assertion still pass.
        expect(JSON.stringify(source)).toEqual(before);
        expect(collection.items).not.toBe(source);
        expect(collection.items.map(i => i.v)).toEqual([1, 2, 3]);

        // The item OBJECTS are not copied, only the array holding them. A
        // shallow clone keeps the references, so every element is shared and a
        // mutation through the collection is visible in the caller's objects.
        // An earlier version asserted `items[0] !== source[0]`, which passed
        // only because sorting had moved index 0, and claimed "items are
        // copied" while every item was in fact shared.
        expect(collection.items.filter(i => source.includes(i)))
            .toHaveLength(source.length);

        collection.items[0].v = 99;
        expect(source.some(i => i.v === 99)).toBe(true);
    });
});
