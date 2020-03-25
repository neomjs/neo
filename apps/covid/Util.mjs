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
     * This method will get used as a grid renderer, so the 2nd param is an overload (would be {Object} record)
     * @param {Number} value
     * @param {String} [color]
     * @return {String}
     */
    static formatNumber(value, color) {
        if (!Neo.isNumber(value)) {
            return '';
        }

        value = value.toLocaleString(Util.locales);

        return typeof color !== 'string' ? value : `<span style="color:${color};">${value}</span>`;
    }
}

Neo.applyClassConfig(Util);

export default Util;