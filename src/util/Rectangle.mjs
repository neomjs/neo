import Base from '../core/Base.mjs';

/**
 * @class Neo.util.Rectangle
 * @extends Neo.core.Base
 */
class Rectangle extends Base {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.util.Rectangle'
         * @protected
         */
        className: 'Neo.util.Rectangle'
    }}

    /**
     * Checks if rect2 is contained inside rect1
     * @param {Object} rect1
     * @param {Object} rect2
     * @returns {Boolean}
     */
    static contains(rect1, rect2) {
        return rect1.bottom >= rect2.bottom
            && rect1.left   <= rect2.left
            && rect1.right  >= rect2.right
            && rect1.top    <= rect2.top;
    }

    /**
     * Adjusts a DOMRect object to a new position
     * @param {Object} rect
     * @param {Number|null} [x=null]
     * @param {Number|null} [y=null]
     * @returns {Boolean}
     */
    static moveBy(rect, x=null, y=null) {
        if (Neo.isNumber(x)) {
            rect.left  += x;
            rect.right += x;
            rect.x     += x;
        }

        if (Neo.isNumber(y)) {
            rect.bottom += y;
            rect.top    += y;
            rect.y      += y;
        }
    }
}

Neo.applyClassConfig(Rectangle);

export default Rectangle;