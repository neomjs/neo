import Base from '../core/Base.mjs';

/**
 * @class Neo.util.Rectangle
 * @extends Neo.core.Base
 */
class ClassSystem extends Base {
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
        console.log('contains');

        return true;
    }
}

Neo.applyClassConfig(ClassSystem);

export default ClassSystem;