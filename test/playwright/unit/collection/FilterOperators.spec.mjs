import {setup} from '../../setup.mjs';

const appName = 'FilterOperatorsTest';

setup({
    appConfig: {
        name: appName
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Filter         from '../../../../src/collection/Filter.mjs';

/**
 * @summary Tests for the Neo.collection.Filter operator matrix
 *
 * The operator matrix is unpinned. The indirect specs elsewhere in this tier assert *that* filtering
 * happened, never *what an operator decided*, so an operator could start returning `true` for a case
 * it used to reject and nothing would notice.
 *
 * Every expectation below was read off a live `Filter` before it was written down, at the boundary
 * value rather than the middle of a range, and the values are literal and deterministic: no
 * `new Date()` without an argument, no locale, no dependence on test order.
 *
 * Two facts drive the shapes here. `isFiltered` calls `Filter[operator](recordValue, filterValue)`,
 * so the RECORD is the first argument; and it returns `!Filter[operator](...)`, so a `true` return
 * means the item is filtered OUT. Both are easy to read backwards.
 */
test.describe('Neo.collection.Filter operators', () => {
    /**
     * The sixteen operators, in the order `static operators` declares them. Named here only to
     * assert the array's contents are stable; every implementation check iterates the array itself.
     */
    const EXPECTED_OPERATORS = [
        '==', '===', '!=', '!==', '<', '<=', '>', '>=', 'doesNotStartWith', 'endsWith', 'excluded',
        'included', 'isDefined', 'isUndefined', 'like', 'startsWith'
    ];

    /**
     * A true case and a false case per operator, as `[operator, recordValue, filterValue]`.
     *
     * The two argument orders are not interchangeable: for `included` and `excluded` the collection
     * is the SECOND value, since `isFiltered` passes the record first and the filter value second.
     */
    const CASES = [
        ['==',                1,              '1'                    ],
        ['===',               1,              1                      ],
        ['!=',                1,              2                      ],
        ['!==',               1,              '1'                    ],
        ['<',                 1,              2                      ],
        ['<=',                2,              2                      ],
        ['>',                 2,              1                      ],
        ['>=',                2,              2                      ],
        ['doesNotStartWith',  'beta',         'al'                   ],
        ['endsWith',          'report.pdf',   '.PDF'                 ],
        ['excluded',          'z',            ['a', 'b', 'c']        ],
        ['included',          'b',            ['a', 'b', 'c']        ],
        ['isDefined',         'x',            undefined              ],
        ['isUndefined',       undefined,      undefined              ],
        ['like',              'Hello World',  'WORLD'                ],
        ['startsWith',        'alpha',        'AL'                   ]
    ];

    /**
     * The false case for each operator above, chosen to differ in exactly one way from its true
     * case so a failure names the operator rather than the fixture.
     */
    const NEGATIVES = {
        '=='              : [1,              2          ],
        '==='             : [1,              '1'        ],
        '!='              : [1,              '1'        ],
        '!=='             : [1,              1          ],
        '<'               : [2,              1          ],
        '<='              : [3,              2          ],
        '>'               : [1,              2          ],
        '>='              : [1,              2          ],
        'doesNotStartWith': ['alpha',        'al'       ],
        'endsWith'        : ['report.doc',   '.pdf'     ],
        'excluded'        : ['b',            ['a','b','c']],
        'included'        : ['z',            ['a','b','c']],
        'isDefined'       : [undefined,      undefined  ],
        'isUndefined'     : ['x',            undefined  ],
        'like'            : ['Hello World',  'xyz'      ],
        'startsWith'      : ['beta',         'al'       ]
    };

    test('every listed operator has an implementation', () => {
        // Iterated rather than hand-listed, so an operator added to the array without a matching
        // static function fails here and names itself. This assertion alone is worth more than any
        // individual case below.
        expect(Filter.operators).toEqual(EXPECTED_OPERATORS);

        const unimplemented = Filter.operators.filter(operator => typeof Filter[operator] !== 'function');

        expect(unimplemented).toEqual([]);
    });

    test('each operator returns true for its true case and false for its false case', () => {
        for (const [operator, recordValue, filterValue] of CASES) {
            expect(
                Filter[operator](recordValue, filterValue),
                `${operator} should match`
            ).toBe(true);

            const [nRecord, nFilter] = NEGATIVES[operator];

            expect(
                Filter[operator](nRecord, nFilter),
                `${operator} should not match`
            ).toBe(false);
        }
    });

    test('like is case-insensitive and coerces a non-string record', () => {
        expect(Filter['like']('Hello World', 'hello')).toBe(true);
        // A substring that only appears once the record has been stringified.
        expect(Filter['like'](12345, '234')).toBe(true);
        // Every string contains the empty string, which is the boundary a naive implementation misses.
        expect(Filter['like']('abc', '')).toBe(true);
    });

    test('included and excluded take the collection as the second argument', () => {
        const collection = ['a', 'b', 'c'];

        expect(Filter['included']('b', collection)).toBe(true);
        expect(Filter['included']('z', collection)).toBe(false);
        expect(Filter['excluded']('z', collection)).toBe(true);
        expect(Filter['excluded']('b', collection)).toBe(false);

        // The empty collection is the boundary: nothing is included, and everything is excluded.
        expect(Filter['included']('b', [])).toBe(false);
        expect(Filter['excluded']('b', [])).toBe(true);
    });

    test('isDefined and isUndefined separate null from undefined', () => {
        // The distinction the pair exists for: null is DEFINED, only undefined is not.
        expect(Filter['isDefined'](null)).toBe(true);
        expect(Filter['isDefined'](undefined)).toBe(false);
        expect(Filter['isUndefined'](null)).toBe(false);
        expect(Filter['isUndefined'](undefined)).toBe(true);
    });

    test('doesNotStartWith is the exact inverse of startsWith, case folded', () => {
        // It is absent from the class doc comment and undocumented, so it is pinned as it behaves.
        const probes = [
            ['alpha', 'al'],
            ['beta',  'al'],
            ['Hello', 'he'],
            [123,     '1'],
            ['abc',   '']
        ];

        for (const [a, b] of probes) {
            expect(
                Filter['doesNotStartWith'](a, b),
                `doesNotStartWith(${JSON.stringify(a)}, ${JSON.stringify(b)})`
            ).toBe(!Filter['startsWith'](a, b));
        }

        // Spelled out for the two that surprise: an empty prefix means every string starts with it,
        // and a non-string record is stringified rather than rejected.
        expect(Filter['doesNotStartWith']('abc', '')).toBe(false);
        expect(Filter['doesNotStartWith'](123, '1')).toBe(false);
    });

    test('isFiltered returns the negation, so true means the item is filtered out', () => {
        const filter = Neo.create(Filter, {operator: '===', property: 'name', value: 'Rich'});

        // The line most likely to be misread later: a matching item is NOT filtered.
        expect(filter.isFiltered({name: 'Rich'})).toBe(false);
        expect(filter.isFiltered({name: 'Nils'})).toBe(true);

        // A missing item is filtered without consulting the operator at all.
        expect(filter.isFiltered(null)).toBe(true);
    });

    test('both-Date values are coerced with valueOf before the operator runs', () => {
        const ISO = '2026-03-01T00:00:00.000Z';
        const ms  = new Date(ISO).valueOf();

        // Both sides Date: the coercion applies, so two Date objects for the same instant are equal
        // under ===, which they would not be without it.
        const bothDates = Neo.create(Filter, {operator: '===', property: 'when', value: new Date(ISO)});
        expect(bothDates.isFiltered({when: new Date(ISO)})).toBe(false);

        // The boundary: a Date against a number does NOT take that path, so the same instant is not
        // equal and the item is filtered out. This is the case the coercion's condition excludes.
        const mixed = Neo.create(Filter, {operator: '===', property: 'when', value: ms});
        expect(mixed.isFiltered({when: new Date(ISO)})).toBe(true);

        // And both numbers, where no coercion is needed and equality holds again.
        const bothNumbers = Neo.create(Filter, {operator: '===', property: 'when', value: ms});
        expect(bothNumbers.isFiltered({when: ms})).toBe(false);
    });
});
