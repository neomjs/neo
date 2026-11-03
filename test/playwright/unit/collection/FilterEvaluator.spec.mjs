import {setup} from '../../setup.mjs';

const appName = 'FilterEvaluatorTest';

setup({
    appConfig: {
        name: appName
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Filter         from '../../../../src/collection/Filter.mjs';
import SearchFilter   from '../../../../src/collection/SearchFilter.mjs';

/**
 * @summary Pins `Neo.collection.Filter#createEvaluator()`: a scan reads the filter's configs once and decides each
 * item as `isFiltered()` does.
 *
 * A `true` decision means the item is filtered OUT.
 */
test.describe('Neo.collection.Filter#createEvaluator', () => {
    /**
     * `[case, filter config, item, decision]`, one per step of the decision order.
     */
    const CASES = [
        ['disabled keeps every item',                   {disabled: true, property: 'v', value: 1},                        {v: 2},             false],
        ['a missing item is filtered out',              {property: 'v', value: 1},                                         null,               true ],
        ['filterBy decides before an empty value',      {filterBy: ({item}) => item.v > 1, value: null},                   {v: 2},             true ],
        ['an empty value keeps every item',             {property: 'v', operator: 'like', value: ''},                      {v: 'x'},           false],
        ['without includeEmptyValues, empty filters',   {includeEmptyValues: false, property: 'v', value: ''},             {v: 'x'},           true ],
        ['typedIncluded keeps a listed value',          {property: 'v', operator: 'typedIncluded', value: [0, 'a']},       {v: 0},             false],
        ['typedIncluded tells 0 from "0"',              {property: 'v', operator: 'typedIncluded', value: [0]},            {v: '0'},           true ],
        ['two Dates compare by time',                   {property: 'v', value: new Date(5)},                               {v: new Date(5)},   false],
        ['like keeps a substring, ignoring case',       {property: 'v', operator: 'like', value: 'WOR'},                   {v: 'Hello World'}, false],
        ['=== drops a value of another type',           {property: 'v', value: 1},                                         {v: '1'},           true ]
    ];

    test('the evaluator decides each step of the order as isFiltered() does', () => {
        for (const [name, config, item, decision] of CASES) {
            const filter = Neo.create(Filter, config);

            expect(filter.isFiltered(item), `isFiltered: ${name}`).toBe(decision);
            expect(filter.createEvaluator()(item), `evaluator: ${name}`).toBe(decision);

            filter.destroy()
        }
    });

    /**
     * `[record value, filter value, kept]` per operator, a kept and a dropped case each. `includeEmptyValues: false`
     * lets `undefined` and empty filter values reach the operator.
     */
    const OPERATOR_CASES = {
        '=='              : [[1, '1', true],            [1, 2, false]],
        '==='             : [[1, 1, true],              [1, '1', false]],
        '!='              : [[1, 2, true],              [1, '1', false]],
        '!=='             : [[1, '1', true],            [1, 1, false]],
        '<'               : [[1, 2, true],              [2, 1, false]],
        '<='              : [[2, 2, true],              [3, 2, false]],
        '>'               : [[2, 1, true],              [1, 2, false]],
        '>='              : [[2, 2, true],              [1, 2, false]],
        'doesNotStartWith': [['beta', 'al', true],      ['alpha', 'al', false]],
        'endsWith'        : [['report.pdf', '.PDF', true], ['report.doc', '.pdf', false]],
        'excluded'        : [['z', ['a', 'b'], true],   ['b', ['a', 'b'], false]],
        'included'        : [['b', ['a', 'b'], true],   ['z', ['a', 'b'], false]],
        'isDefined'       : [['x', undefined, true],    [undefined, undefined, false]],
        'isUndefined'     : [[undefined, undefined, true], ['x', undefined, false]],
        'like'            : [['Hello World', 'WORLD', true], ['Hello World', 'xyz', false]],
        'startsWith'      : [['alpha', 'AL', true],     ['beta', 'al', false]],
        'typedIncluded'   : [[0, [false, '0', 0], true], [0, [false, '0'], false]]
    };

    test('every operator decides through the evaluator as through isFiltered()', () => {
        // An operator added without a case fails here and names itself
        expect(Object.keys(OPERATOR_CASES)).toEqual(Filter.operators);

        for (const operator of Filter.operators) {
            for (const [recordValue, value, kept] of OPERATOR_CASES[operator]) {
                const filter = Neo.create(Filter, {includeEmptyValues: false, operator, property: 'v', value}),
                      item   = {v: recordValue};

                expect(filter.isFiltered(item), `isFiltered: ${operator} ${String(recordValue)}`).toBe(!kept);
                expect(filter.createEvaluator()(item), `evaluator: ${operator} ${String(recordValue)}`).toBe(!kept);

                filter.destroy()
            }
        }
    });

    test('filterBy receives the scan arguments, its scope and the value', () => {
        const scope  = {},
              calls  = [],
              filter = Neo.create(Filter, {
                  filterBy(args) {calls.push({...args, self: this}); return false},
                  scope,
                  value: 'v'
              }),
              items  = [{id: 1}];

        filter.createEvaluator()(items[0], items, items);

        expect(calls).toEqual([{allItems: items, filteredItems: items, item: items[0], self: scope, value: 'v'}]);

        filter.destroy()
    });

    test('an evaluator keeps the configs it read; the next scan reads the change', () => {
        const filter   = Neo.create(Filter, {property: 'v', value: 1}),
              evaluate = filter.createEvaluator();

        filter.value = 2;

        expect(evaluate({v: 1})).toBe(false);
        expect(filter.createEvaluator()({v: 1})).toBe(true);
        expect(filter.isFiltered({v: 1})).toBe(true);

        filter.destroy()
    });

    test('a subclass that overrides isFiltered() decides through its override', () => {
        const filter   = Neo.create(SearchFilter, {fields: ['name'], value: 'ada'}),
              evaluate = filter.createEvaluator();

        expect(evaluate({name: 'Ada Lovelace'})).toBe(false);
        expect(evaluate({name: 'Grace Hopper'})).toBe(true);

        filter.destroy()
    });
});
