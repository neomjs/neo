import {setup} from '../../setup.mjs';

setup();

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import Base           from '../../../../src/core/Base.mjs';
import Compare        from '../../../../src/core/Compare.mjs';

class CompareProbe extends Base {
    static config = {
        className: 'Neo.test.CompareProbe',
        foo_     : null
    }

    afterSetFooCount = 0

    afterSetFoo(value, oldValue) {
        this.afterSetFooCount++
    }
}

CompareProbe = Neo.setupClass(CompareProbe);

/**
 * @summary Tests for Neo.core.Compare.isEqual
 * One case per type in Compare.map, the rules for own keys, NaN and cycles,
 * and a config that has to notice a change in the key set.
 */
test.describe('Neo.core.Compare', () => {
    test('Arrays compare by position', () => {
        expect(Compare.isEqual([1, [2, 3]], [1, [2, 3]])).toBe(true);
        expect(Compare.isEqual([1, 2], [2, 1])).toBe(false);
        expect(Compare.isEqual([1], [1, 2])).toBe(false);
    });

    test('Dates compare by time value', () => {
        expect(Compare.isEqual(new Date(0), new Date(0))).toBe(true);
        expect(Compare.isEqual(new Date(0), new Date(1))).toBe(false);
    });

    test('Functions compare by name and source', () => {
        const a = function f() {return 1};
        const b = function f() {return 1};
        const c = function f() {return 2};

        expect(Compare.isEqual(a, b)).toBe(true);
        expect(Compare.isEqual(a, c)).toBe(false);
    });

    test('Maps compare their values by identity', () => {
        const value = {};

        expect(Compare.isEqual(new Map([['a', value]]), new Map([['a', value]]))).toBe(true);
        expect(Compare.isEqual(new Map([['a', {}]]),    new Map([['a', {}]]))).toBe(false);
        expect(Compare.isEqual(new Map([['a', undefined]]), new Map([['b', undefined]]))).toBe(false);
    });

    test('Neo instances compare by id', () => {
        const instance = Neo.create(CompareProbe);

        expect(Compare.isEqual(instance, instance)).toBe(true);
        expect(Compare.isEqual(instance, Neo.create(CompareProbe))).toBe(false);
    });

    test('Objects compare deeply', () => {
        expect(Compare.isEqual({a: 1, b: {c: [1]}}, {b: {c: [1]}, a: 1})).toBe(true);
        expect(Compare.isEqual({a: 1}, {a: 2})).toBe(false);
    });

    test('RegExps compare by source and flags', () => {
        expect(Compare.isEqual(/a/g, /a/g)).toBe(true);
        expect(Compare.isEqual(/a/g, /a/i)).toBe(false);
    });

    test('Sets compare their members by identity', () => {
        expect(Compare.isEqual(new Set([1, 2]), new Set([2, 1]))).toBe(true);
        expect(Compare.isEqual(new Set([1]),    new Set([2]))).toBe(false);
    });

    test('Objects with different own keys are not equal', () => {
        expect(Compare.isEqual({a: undefined}, {b: undefined})).toBe(false);
        expect(Compare.isEqual({a: 1, b: undefined}, {a: 1, c: undefined})).toBe(false);
    });

    test('NaN equals NaN, and 0 still equals -0', () => {
        expect(Compare.isEqual(NaN, NaN)).toBe(true);
        expect(Compare.isEqual(new Date(NaN), new Date(NaN))).toBe(true);
        expect(Compare.isEqual(0, -0)).toBe(true);
        expect(Compare.isEqual(NaN, 0)).toBe(false);
    });

    test('Cyclic structures are compared without overflowing the stack', () => {
        const a = {name: 'x'},
              b = {name: 'x'},
              c = {name: 'y'};

        a.self = a;
        b.self = b;
        c.self = c;

        expect(Compare.isEqual(a, b)).toBe(true);
        expect(Compare.isEqual(a, c)).toBe(false);

        const list1 = [1],
              list2 = [1];

        list1.push(list1);
        list2.push(list2);

        expect(Compare.isEqual(list1, list2)).toBe(true);
    });

    test('A config notices a change in its key set', () => {
        const probe = Neo.create(CompareProbe);

        probe.foo = {a: undefined};

        const count = probe.afterSetFooCount;

        probe.foo = {b: undefined};

        expect(probe.afterSetFooCount).toBe(count + 1);
        expect(Object.hasOwn(probe.foo, 'b')).toBe(true);
    });
});
