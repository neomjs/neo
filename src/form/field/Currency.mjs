import Number from './Number.mjs';

/**
 * @class Neo.form.field.Currency
 * @extends Neo.form.field.Number
 */
class Currency extends Number {
    static config = {
        /**
         * @member {String} className='Neo.form.field.Currency'
         * @protected
         */
        className: 'Neo.form.field.Currency',
        /**
         * @member {String} ntype='currencyfield'
         * @protected
         */
        ntype: 'currencyfield',
        /**
         * @member {Number} stepSize=0.01
         */
        stepSize: 0.01
    }

    /**
     * @param {Number|null} value
     * @returns {Number}
     */
    inputValueAdjustor(value) {
        if (Neo.isString(value)) {
            value = parseFloat(value).toFixed(2);

            return parseInt(value.replace('.', '')) / 100
        }

        return value
    }

    /**
     * @param {Number|null} value
     * @returns {String}
     */
    inputValueRenderer(value) {
        if (value === null) {
            return null
        }

        return value.toFixed(2)
    }
}

Neo.applyClassConfig(Currency);

export default Currency;
