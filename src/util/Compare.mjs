import Base from '../core/Base.mjs';

/**
 * @class Neo.util.Compare
 * @extends Neo.core.Base
 */
class Compare extends Base {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.util.Compare'
         * @protected
         */
        className: 'Neo.util.Compare'
    }}

    /**
     *
     * @param {*} item1
     * @param {*} item2
     */
    static isEqual(item1, item2) {

    }
}

Neo.applyClassConfig(Compare);

export default Compare;
