import Base from '../core/Base.mjs';

/**
 * The class contains utility methods for working with DOMRect Objects
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
     * Returns the overlapping area of rect1 & rect2
     * @param {Object} rect1
     * @param {Object} rect2
     * @returns {Number} The area (x * y)
     */
    static getIntersection(rect1, rect2) {
        return Rectangle.getIntersectionDetails(rect1, rect2).area;
    }

    /**
     * Returns the overlapping area of rect1 & rect2
     * @param {Object} rect1
     * @param {Object} rect2
     * @returns {Object} x, y & area
     */
    static getIntersectionDetails(rect1, rect2) {
        let x = Math.max(0, Math.abs(rect1.left - rect2.left + rect1.width  - rect2.width)),
            y = Math.max(0, Math.abs(rect1.top  - rect2.top  + rect1.height - rect2.height));

        return {
            area: x * y,
            x   : x,
            y   : y
        };
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
     * Checks if rect2 is not contained inside rect1.
     * This could be an intersection or being fully excluded.
     * @param {Object} rect1
     * @param {Object} rect2
     * @param {String} side bottom, left, right or top
     * @returns {Boolean}
     */
    static leavesSide(rect1, rect2, side) {
        if (Rectangle.includes(rect1, rect2)) {
            return false;
        }

        if (side === 'bottom') {
            return rect1.bottom < rect2.bottom;
        }

        if (side === 'left') {
            return rect1.left > rect2.left;
        }

        if (side === 'right') {
            return rect1.right < rect2.right;
        }

        if (side === 'top') {
            return rect1.top > rect2.top;
        }
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
            movedRect.bottom = y + movedRect.height;
            movedRect.top    = y;
            movedRect.y      = y;
        }

        return movedRect;
    }
}

Neo.applyClassConfig(Rectangle);

export default Rectangle;