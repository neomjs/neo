import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'CompareFunctionIdentityTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';

/**
 * @summary `Neo.core.Compare.isEqual` on functions.
 *
 * Behavioural equivalence is not decidable from a function's source text, so the only sound answer
 * is reference identity. Comparing `name` + `toString()` instead reports two functions carrying
 * DIFFERENT captured state as equal, and a reactive config whose change detection answers "equal"
 * silently drops the replacement.
 */
test.describe('Neo.core.Compare — functions compare by identity', () => {
    test('two bound functions from one target are not equal, though name and source are identical', () => {
        function handler() { return this.id }

        const first  = handler.bind({id: 1}),
              second = handler.bind({id: 2});

        // Non-vacuity: the two properties the old implementation compared really are identical here,
        // so this arm fails against name+toString rather than passing for an unrelated reason.
        expect(first.name).toBe(second.name);
        expect(first.toString()).toBe(second.toString());
        expect(first(), 'and yet they behave differently').toBe(1);
        expect(second()).toBe(2);

        expect(Neo.core.Compare.isEqual(first, second)).toBe(false)
    });

    test('two closures from one factory are not equal, though their source text is identical', () => {
        const make   = x => () => x,
              first  = make(1),
              second = make(2);

        expect(first.toString()).toBe(second.toString());
        expect(first()).toBe(1);
        expect(second()).toBe(2);

        expect(Neo.core.Compare.isEqual(first, second)).toBe(false)
    });

    test('the same reference is equal — the comparison is identity, not a blanket false', () => {
        const fn = () => 'stable';

        // The control that stops the two arms above from being satisfied by an always-false rule.
        expect(Neo.core.Compare.isEqual(fn, fn)).toBe(true);
        expect(Neo.core.Compare.isEqual({handler: fn}, {handler: fn})).toBe(true);
        expect(Neo.core.Compare.isEqual([{handler: fn}], [{handler: fn}])).toBe(true)
    });

    test('the rule reaches functions nested in the list shapes reactive configs actually carry', () => {
        function handler() { return this.id }

        const bound = handler.bind({id: 1});

        expect(Neo.core.Compare.isEqual(
            [{action: 'lock', handler: bound}],
            [{action: 'lock', handler: handler.bind({id: 2})}]
        )).toBe(false);

        // Same list, same reference: the no-op case an identical re-projection must produce.
        expect(Neo.core.Compare.isEqual(
            [{action: 'lock', handler: bound}],
            [{action: 'lock', handler: bound}]
        )).toBe(true)
    });

    test('non-function comparison is untouched', () => {
        // Scope control: identity applies to functions only. A structural change here would show up
        // as these arms flipping, so they pin what the change must NOT do.
        expect(Neo.core.Compare.isEqual({a: 1, b: [2, 3]}, {a: 1, b: [2, 3]})).toBe(true);
        expect(Neo.core.Compare.isEqual({a: 1}, {a: 2})).toBe(false);
        expect(Neo.core.Compare.isEqual([1, 2], [1, 2])).toBe(true);
        expect(Neo.core.Compare.isEqual(new Date(0), new Date(0))).toBe(true);
        expect(Neo.core.Compare.isEqual(/x/g, /x/g)).toBe(true)
    })
});
