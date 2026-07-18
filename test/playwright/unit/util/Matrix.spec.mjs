import {setup} from '../../setup.mjs';
setup({
    appConfig: {
        name: 'MatrixTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Matrix         from '../../../../src/util/Matrix.mjs';

test.describe('Neo.util.Matrix', () => {
    test('createElement returns a 4x4 identity matrix', () => {
        let matrix = new Matrix();
        matrix.items = [
            [1, 0, 0, 0],
            [0, 1, 0, 0],
            [0, 0, 1, 0],
            [0, 0, 0, 1]
        ];
        expect(matrix.e(1, 1)).toBe(1);
        expect(matrix.e(2, 2)).toBe(1);
        expect(matrix.e(3, 3)).toBe(1);
        expect(matrix.e(4, 4)).toBe(1);
    });

    test('getElement returns the element at the specified position', () => {
        let matrix = new Matrix();
        matrix.items = [
            [1, 2, 3, 4],
            [5, 6, 7, 8],
            [9, 10, 11, 12],
            [13, 14, 15, 16]
        ];
        expect(matrix.e(1, 1)).toBe(1);
        expect(matrix.e(1, 2)).toBe(2);
        expect(matrix.e(2, 1)).toBe(5);
        expect(matrix.e(2, 2)).toBe(6);
    });

    test('getTransformStyle returns a CSS transform style string', () => {
        let matrix = new Matrix();
        matrix.items = [
            [1, 0, 0, 0],
            [0, 1, 0, 0],
            [0, 0, 1, 0],
            [0, 0, 0, 1]
        ];
        expect(matrix.getTransformStyle()).toBe('matrix3d(1.0000000000,0.0000000000,0.0000000000,0.0000000000,0.0000000000,1.0000000000,0.0000000000,0.0000000000,0.0000000000,0.0000000000,1.0000000000,0.0000000000,0.0000000000,0.0000000000,0.0000000000,1.0000000000)');
    });

    test('multiply returns the result of multiplying the matrix by another matrix', () => {
        let matrix = new Matrix();
        matrix.items = [
            [1, 0, 0, 0],
            [0, 1, 0, 0],
            [0, 0, 1, 0],
            [0, 0, 0, 1]
        ];
        let otherMatrix = [
            [2, 0, 0, 0],
            [0, 2, 0, 0],
            [0, 0, 2, 0],
            [0, 0, 0, 2]
        ];
        let result = matrix.multiply(otherMatrix);
        expect(result.items[0][0]).toBe(2);
        expect(result.items[1][1]).toBe(2);
        expect(result.items[2][2]).toBe(2);
        expect(result.items[3][3]).toBe(2);
    });

    test('rotateX returns a rotation matrix around the X axis', () => {
        let angle = Math.PI / 2;
        let matrix = Matrix.rotateX(angle);
        expect(matrix[1][1]).toBeCloseTo(0);
        expect(matrix[1][2]).toBeCloseTo(-1);
        expect(matrix[2][1]).toBeCloseTo(1);
        expect(matrix[2][2]).toBeCloseTo(0);
    });

    test('rotateY returns a rotation matrix around the Y axis', () => {
        let angle = Math.PI / 2;
        let matrix = Matrix.rotateY(angle);
        expect(matrix[0][0]).toBeCloseTo(0);
        expect(matrix[0][2]).toBeCloseTo(-1);
        expect(matrix[2][0]).toBeCloseTo(1);
        expect(matrix[2][2]).toBeCloseTo(0);
    });

    test('rotateZ returns a rotation matrix around the Z axis', () => {
        let angle = Math.PI / 2;
        let matrix = Matrix.rotateZ(angle);
        expect(matrix[0][0]).toBeCloseTo(0);
        expect(matrix[0][1]).toBeCloseTo(-1);
        expect(matrix[1][0]).toBeCloseTo(1);
        expect(matrix[1][1]).toBeCloseTo(0);
    });
});