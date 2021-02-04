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
     * Checks if rect1 does not have an intersection with rect2
     * !includes() is true for intersections as well
     * @param {Object} rect1
     * @param {Object} rect2
     * @returns {Boolean}
     */
    static excludes(rect1, rect2) {
        return rect1.bottom < rect2.top     // rect2 is below rect1
            || rect1.left   > rect2.right   // rect2 is left of rect1
            || rect1.right  < rect2.left    // rect2 is right of rect1
            || rect1.top    > rect2.bottom; // rect2 is above rect1
    }

    /**
     * Checks if rect2 is fully contained inside rect1
     * @param {Object} rect1
     * @param {Object} rect2
     * @returns {Boolean}
     */
    static includes(rect1, rect2) {
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
     * @returns {Object} movedRect
     */
    static moveBy(rect, x=null, y=null) {
        let movedRect = {...rect};

        if (Neo.isNumber(x)) {
            movedRect.left  += x;
            movedRect.right += x;
            movedRect.x     += x;
        }

        if (Neo.isNumber(y)) {
            movedRect.bottom += y;
            movedRect.top    += y;
            movedRect.y      += y;
        }

        return movedRect;
    }

    /**
     * Adjusts a DOMRect object to a new position
     * @param {Object} rect
     * @param {Number|null} [x=null]
     * @param {Number|null} [y=null]
     * @returns {Object} movedRect
     */
    static moveTo(rect, x=null, y=null) {
        let movedRect = {...rect};

        if (Neo.isNumber(x)) {
            movedRect.left  = x;
            movedRect.right = x + movedRect.width;
            movedRect.x     = x;
        }

        if (Neo.isNumber(y)) {
            movedRect.bottom = y;
            movedRect.top    = y + movedRect.height;
            movedRect.y      = y;
        }

        return movedRect;
    }
}

Neo.applyClassConfig(Rectangle);

export default Rectangle;