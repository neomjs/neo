import Base from '../core/Base.mjs';

/**
 * Utility class for Matrix based calculations
 * @class Neo.util.Matrix
 * @extends Neo.core.Base
 */
class Matrix extends Base {
    static getConfig() {return {
        className: 'Neo.util.Matrix',
        items_   : null
    }}

    /**
     * Returns the element (i,j) of the matrix
     * @param i
     * @param j
     * @returns {*}
     */
    getElement(i, j) {
        let items = this.items;

        if (i < 1 || i > items.length || j < 1 || j > items[0].length) {
            return null;
        }

        return items[i - 1][j - 1];
    }

    /**
     * shortcut for getElement
     */
    e(i, j) {
        return this.getElement(i, j);
    }

    /**
     * Returns the result of multiplying the matrix from the right by the argument.
     * @param matrix
     * @returns {*}
     */
    multiply(matrix) {
        let me    = this,
            M     = matrix.items || matrix,
            items = me.items,
            ni    = items.length,
            ki    = ni,
            kj    = M[0].length,
            cols  = items[0].length,
            els   = [],
            c, i, j, nc, nj, sum;

        do {
            i      = ki - ni;
            els[i] = [];
            nj     = kj;

            do { j = kj - nj;
                sum = 0;
                nc  = cols;

                do {
                    c = cols - nc;
                    sum += items[i][c] * M[c][j];
                } while (--nc);
                els[i][j] = sum;
            } while (--nj);
        } while (--ni);

        matrix.items = els;

        return matrix;
    }

    /**
     * shortcut for multiply
     */
    x(matrix) {
        return this.multiply(matrix);
    }

    /**
     *
     * @param t
     * @returns {*}
     */
    static rotateX(t) {
        let c = Math.cos(t),
            s = Math.sin(t);

        return [
            [1, 0,  0, 0],
            [0, c, -s, 0],
            [0, s,  c, 0],
            [0, 0,  0, 1]
        ];
    }

    /**
     *
     * @param t
     * @returns {*}
     */
    static rotateY(t) {
        let c = Math.cos(t),
            s = Math.sin(t);

        return [
            [c, 0, -s, 0],
            [0, 1,  0, 0],
            [s, 0,  c, 0],
            [0, 0,  0, 1]
        ];
    }

    /**
     *
     * @param t
     * @returns {*}
     */
    static rotateZ(t) {
        let c = Math.cos(t),
            s = Math.sin(t);

        return [
            [c, -s, 0, 0],
            [s,  c, 0, 0],
            [0,  0, 1, 0],
            [0,  0, 0, 1]
        ];
    }

    /**
     *
     */
    getTransformStyle() {
        let me = this,
            p  = 10, // precision
            s;

        s  = 'matrix3d(';
        s += me.e(1,1).toFixed(p) + ',' + me.e(1,2).toFixed(p) + ',' + me.e(1,3).toFixed(p) + ',' + me.e(1,4).toFixed(p) + ',';
        s += me.e(2,1).toFixed(p) + ',' + me.e(2,2).toFixed(p) + ',' + me.e(2,3).toFixed(p) + ',' + me.e(2,4).toFixed(p) + ',';
        s += me.e(3,1).toFixed(p) + ',' + me.e(3,2).toFixed(p) + ',' + me.e(3,3).toFixed(p) + ',' + me.e(3,4).toFixed(p) + ',';
        s += me.e(4,1).toFixed(p) + ',' + me.e(4,2).toFixed(p) + ',' + me.e(4,3).toFixed(p) + ',' + me.e(4,4).toFixed(p);
        s += ')';

        return s;
    }
}

Neo.applyClassConfig(Matrix);

export default Matrix;