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
     * @returns {Boolean}
     */
    static isEqual(item1, item2) {
        if (item1 === item2) {
            return true;
        }

        let type1 = typeof item1,
            type2 = typeof item2;

        if (type1 !== type2) {
            return false;
        }

        if (Array.isArray(item1)) {
            if (item1.length !== item2.length) {
                return false;
            }

            for (const [i, v] of item1.entries()) {
                if (!Compare.isEqual(v, item2[i])) {
                    return false;
                }
            }
        }

        return true;
    }
}

Neo.applyClassConfig(Compare);

export default Compare;
