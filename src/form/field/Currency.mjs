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
}

Neo.applyClassConfig(Currency);

export default Currency;
