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
}

Neo.applyClassConfig(Rectangle);

export default Rectangle;