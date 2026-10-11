import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'MatrixUtilTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Matrix         from '../../../../src/util/Matrix.mjs';

const identity4 = [
    [1, 0, 0, 0],
    [0, 1, 0, 0],
    [0, 0, 1, 0],
    [0, 0, 0, 1]
];

/**
 * @summary Asserts two numeric matrices element-by-element without treating IEEE `-0` as a mismatch.
 * @param {Number[][]} actual
 * @param {Number[][]} expected
 * @returns {void}
 */
function expectMatrixClose(actual, expected) {
    expect(actual).toHaveLength(expected.length);

    expected.forEach((row, rowIndex) => {
        expect(actual[rowIndex]).toHaveLength(row.length);
        row.forEach((value, columnIndex) => {
            expect(actual[rowIndex][columnIndex]).toBeCloseTo(value)
        })
    })
}

/**
 * @summary Coverage for the public Neo.util.Matrix calculation and CSS-serialization contract.
 */
test.describe('Neo.util.Matrix', () => {
    let instances = [];

    /**
     * @summary Creates a Matrix through the Neo lifecycle and tracks it for deterministic teardown.
     * @param {Number[][]} items
     * @returns {Neo.util.Matrix}
     */
    function createMatrix(items) {
        const matrix = Neo.create(Matrix, {items});

        instances.push(matrix);

        return matrix
    }

    test.afterEach(() => {
        instances.forEach(matrix => matrix.destroy());
        instances = []
    });

    test('rotateX preserves identity at zero and places sine/cosine at pi/2', () => {
        expectMatrixClose(Matrix.rotateX(0), identity4);
        expectMatrixClose(Matrix.rotateX(Math.PI / 2), [
            [1, 0,  0, 0],
            [0, 0, -1, 0],
            [0, 1,  0, 0],
            [0, 0,  0, 1]
        ])
    });

    test('rotateY preserves identity at zero and places sine/cosine at pi/2', () => {
        expectMatrixClose(Matrix.rotateY(0), identity4);
        expectMatrixClose(Matrix.rotateY(Math.PI / 2), [
            [0, 0, -1, 0],
            [0, 1,  0, 0],
            [1, 0,  0, 0],
            [0, 0,  0, 1]
        ])
    });

    test('rotateZ preserves identity at zero and places sine/cosine at pi/2', () => {
        expectMatrixClose(Matrix.rotateZ(0), identity4);
        expectMatrixClose(Matrix.rotateZ(Math.PI / 2), [
            [0, -1, 0, 0],
            [1,  0, 0, 0],
            [0,  0, 1, 0],
            [0,  0, 0, 1]
        ])
    });

    test('getElement and e use one-based coordinates and return null outside the matrix', () => {
        const matrix = createMatrix([
            [1, 2, 3],
            [4, 5, 6]
        ]);

        expect(matrix.getElement(1, 2)).toBe(2);
        expect(matrix.e(2, 3)).toBe(6);
        expect(matrix.getElement(0, 1)).toBeNull();
        expect(matrix.getElement(3, 1)).toBeNull();
        expect(matrix.e(1, 0)).toBeNull();
        expect(matrix.e(1, 4)).toBeNull()
    });

    test('multiply writes a hand-computed product into and returns the argument', () => {
        const left   = createMatrix([[1, 2], [3, 4]]),
              right  = createMatrix([[5, 6], [7, 8]]),
              result = left.multiply(right);

        expect(result).toBe(right);
        expect(result.items).toEqual([[19, 22], [43, 50]]);
        expect(left.items).toEqual([[1, 2], [3, 4]])
    });

    test('x delegates to multiply and preserves an identity product', () => {
        const identity = createMatrix([[1, 0], [0, 1]]),
              target   = createMatrix([[2, 3], [4, 5]]),
              result   = identity.x(target);

        expect(result).toBe(target);
        expect(result.items).toEqual([[2, 3], [4, 5]])
    });

    test('getTransformStyle serializes a 4x4 matrix at ten-decimal precision', () => {
        const matrix = createMatrix(identity4);

        expect(matrix.getTransformStyle()).toBe(
            'matrix3d(1.0000000000,0.0000000000,0.0000000000,0.0000000000,' +
            '0.0000000000,1.0000000000,0.0000000000,0.0000000000,' +
            '0.0000000000,0.0000000000,1.0000000000,0.0000000000,' +
            '0.0000000000,0.0000000000,0.0000000000,1.0000000000)'
        )
    })
});
