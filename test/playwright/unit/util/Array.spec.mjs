import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'ArrayUtilTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import ArrayUtil      from '../../../../src/util/Array.mjs';

test.describe('Neo.util.Array', () => {
    test.describe('add', () => {
        test('should append a scalar item and return the same reference', () => {
            const arr = [1, 2, 3];
            const ref = arr;
            const result = ArrayUtil.add(arr, 4);

            expect(result).toBe(ref);
            expect(result).toEqual([1, 2, 3, 4]);
        });

        test('should append items from an array and return the same reference', () => {
            const arr = [1];
            const ref = arr;
            const result = ArrayUtil.add(arr, [2, 3]);

            expect(result).toBe(ref);
            expect(result).toEqual([1, 2, 3]);
        });

        test('should skip items already present by reference', () => {
            const arr = [1, 2, 3];
            ArrayUtil.add(arr, [2, 4]);

            expect(arr).toEqual([1, 2, 3, 4]);
        });
    });

    test.describe('unshift', () => {
        test('should prepend a scalar item and return the same reference', () => {
            const arr = [2, 3];
            const ref = arr;
            const result = ArrayUtil.unshift(arr, 1);

            expect(result).toBe(ref);
            expect(result).toEqual([1, 2, 3]);
        });

        test('should prepend items from an array and return the same reference', () => {
            const arr = [3];
            const ref = arr;
            const result = ArrayUtil.unshift(arr, [1, 2]);

            expect(result).toBe(ref);
            expect(result).toEqual([2, 1, 3]);
        });

        test('should skip items already present by reference when unshifting', () => {
            const arr = [1, 2, 3];
            ArrayUtil.unshift(arr, [2, 0]);

            expect(arr).toEqual([0, 1, 2, 3]);
        });
    });

    test.describe('hasItem', () => {
        test('should detect membership by reference identity', () => {
            expect(ArrayUtil.hasItem([1, 2, 3], 2)).toBe(true);
            expect(ArrayUtil.hasItem([1, 2, 3], 4)).toBe(false);
        });

        test('should return false for structurally equal but distinct objects', () => {
            const a = {id: 1};
            const b = {id: 1};

            expect(ArrayUtil.hasItem([a], b)).toBe(false);
            expect(ArrayUtil.hasItem([a], a)).toBe(true);
        });
    });

    test.describe('remove', () => {
        test('should remove a scalar item and return the same reference', () => {
            const arr = [1, 2, 3];
            const ref = arr;
            const result = ArrayUtil.remove(arr, 2);

            expect(result).toBe(ref);
            expect(result).toEqual([1, 3]);
        });

        test('should remove items from an array and return the same reference', () => {
            const arr = [1, 2, 3, 4];
            const ref = arr;
            const result = ArrayUtil.remove(arr, [2, 3]);

            expect(result).toBe(ref);
            expect(result).toEqual([1, 4]);
        });

        test('should be a no-op for missing removal targets', () => {
            const arr = [1, 2, 3];
            ArrayUtil.remove(arr, [4, 5]);

            expect(arr).toEqual([1, 2, 3]);
        });
    });

    test.describe('removeAdd', () => {
        test('should remove then add items and return the same reference', () => {
            const arr = [1, 2, 3];
            const ref = arr;
            const result = ArrayUtil.removeAdd(arr, 2, [4, 5]);

            expect(result).toBe(ref);
            expect(result).toEqual([1, 3, 4, 5]);
        });

        test('should accept scalar remove and add targets', () => {
            const arr = [1, 2];
            ArrayUtil.removeAdd(arr, 1, 3);

            expect(arr).toEqual([2, 3]);
        });
    });

    test.describe('toggle', () => {
        test('should add an item when it is not present (default branch)', () => {
            const arr = [1, 2];
            ArrayUtil.toggle(arr, 3);

            expect(arr).toEqual([1, 2, 3]);
        });

        test('should remove an item when it is already present (default branch)', () => {
            const arr = [1, 2, 3];
            ArrayUtil.toggle(arr, 2);

            expect(arr).toEqual([1, 3]);
        });

        test('should add when the explicit add parameter is true regardless of membership', () => {
            const arr = [1, 2];
            ArrayUtil.toggle(arr, 2, true);

            expect(arr).toEqual([1, 2]);
        });

        test('should remove when the explicit add parameter is false regardless of membership', () => {
            const arr = [1, 2];
            ArrayUtil.toggle(arr, 3, false);

            expect(arr).toEqual([1, 2]);
        });

        test('should return the same reference', () => {
            const arr = [1];
            const ref = arr;
            const result = ArrayUtil.toggle(arr, 2);

            expect(result).toBe(ref);
        });
    });

    test.describe('insert', () => {
        test('should insert a new item at the given index and return the same reference', () => {
            const arr = [1, 3];
            const ref = arr;
            const result = ArrayUtil.insert(arr, 1, 2);

            expect(result).toBe(ref);
            expect(result).toEqual([1, 2, 3]);
        });

        test('should insert items from an array and return the same reference', () => {
            const arr = [1, 4];
            const ref = arr;
            const result = ArrayUtil.insert(arr, 1, [2, 3]);

            expect(result).toBe(ref);
            expect(result).toEqual([1, 2, 3, 4]);
        });

        test('should move an existing item to a new index', () => {
            const arr = [1, 2, 3, 4];
            ArrayUtil.insert(arr, 0, 3);

            expect(arr).toEqual([3, 1, 2, 4]);
        });

        test('should be a no-op when an existing item is already at the target index', () => {
            const arr = [1, 2, 3];
            const copy = [...arr];
            ArrayUtil.insert(arr, 1, 2);

            expect(arr).toEqual(copy);
        });
    });

    test.describe('move', () => {
        test('should move an item from fromIndex to toIndex and return the same reference', () => {
            const arr = [1, 2, 3, 4];
            const ref = arr;
            const result = ArrayUtil.move(arr, 0, 2);

            expect(result).toBe(ref);
            expect(result).toEqual([2, 3, 1, 4]);
        });

        test('should be a no-op when fromIndex equals toIndex', () => {
            const arr = [1, 2, 3];
            const copy = [...arr];
            ArrayUtil.move(arr, 1, 1);

            expect(arr).toEqual(copy);
        });

        test('should clamp an oversized fromIndex to the final item', () => {
            const arr = [1, 2, 3];
            ArrayUtil.move(arr, 10, 0);

            expect(arr).toEqual([3, 1, 2]);
        });
    });

    test.describe('difference', () => {
        test('should return items present in array1 but not in array2', () => {
            const result = ArrayUtil.difference([1, 2, 3], [2, 4]);

            expect(result).toEqual([1, 3]);
        });

        test('should not mutate the input arrays', () => {
            const a = [1, 2, 3];
            const b = [2, 4];
            const aCopy = [...a];
            const bCopy = [...b];

            ArrayUtil.difference(a, b);

            expect(a).toEqual(aCopy);
            expect(b).toEqual(bCopy);
        });

        test('should default to empty arrays when no arguments are provided', () => {
            expect(ArrayUtil.difference()).toEqual([]);
            expect(ArrayUtil.difference([1])).toEqual([1]);
        });
    });

    test.describe('intersection', () => {
        test('should return items present in both arrays', () => {
            const result = ArrayUtil.intersection([1, 2, 3], [2, 4]);

            expect(result).toEqual([2]);
        });

        test('should not mutate the input arrays', () => {
            const a = [1, 2, 3];
            const b = [2, 4];
            const aCopy = [...a];
            const bCopy = [...b];

            ArrayUtil.intersection(a, b);

            expect(a).toEqual(aCopy);
            expect(b).toEqual(bCopy);
        });

        test('should default to empty arrays when no arguments are provided', () => {
            expect(ArrayUtil.intersection()).toEqual([]);
            expect(ArrayUtil.intersection([1])).toEqual([]);
        });
    });

    test.describe('union', () => {
        test('should return unique items from multiple arrays', () => {
            const result = ArrayUtil.union([1, 2], [2, 3], [3, 4]);

            expect(result).toEqual([1, 2, 3, 4]);
        });

        test('should not mutate the input arrays', () => {
            const a = [1, 2];
            const b = [2, 3];
            const aCopy = [...a];
            const bCopy = [...b];

            ArrayUtil.union(a, b);

            expect(a).toEqual(aCopy);
            expect(b).toEqual(bCopy);
        });

        test('should handle a single array', () => {
            expect(ArrayUtil.union([1, 2, 2, 3])).toEqual([1, 2, 3]);
        });

        test('should handle no arguments', () => {
            expect(ArrayUtil.union()).toEqual([]);
        });
    });
});
