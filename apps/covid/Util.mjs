import Base from '../../src/core/Base.mjs';

/**
 * Static utility class
 * @class Covid.Util
 * @extends Neo.core.Base
 */
class Util extends Base {
    static getStaticConfig() {return {
        /**
         * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number/toLocaleString
         * Change this config to enforce a county specific formatting (e.g. 'de-DE')
         * @member {String} locales='default'
         * @private
         * @static
         */
        locales: 'default'
    }}

    static getConfig() {return {
        /**
         * @member {String} className='Covid.Util'
         * @private
         */
        className: 'Covid.Util'
    }}

    /**
     *
     * @param {Number} value
     * @return {String}
     */
    static formatNumber(value) {
        return value.toLocaleString(Util.locales);
    }
}

Neo.applyClassConfig(Util);

export default Util;