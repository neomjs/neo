import Field from './Field.mjs';

/**
 * @class Neo.data.field.Float
 * @extends Neo.data.field.Field
 */
class FloatField extends Field {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.data.field.Field'
         * @private
         */
        className: 'Neo.data.field.Float',
        /**
         * @member {String} ntype='data-field-float'
         * @private
         */
        ntype: 'data-field-float',
        /**
         * @member {Number|null} defaultValue=0
         */
        defaultValue: 0
    }}

    /**
     * Triggered before the value config gets changed.
     * @param {Array|String|null} value
     * @param {Array|String|null} oldValue
     * @returns {Array}
     * @private
     */
    beforeSetValue(value, oldValue) {
        let me           = this,
            defaultValue = me.defaultValue ? me.defaultValue : me.nullableValue ? null : undefined;

        return (value === null || value === undefined) ? defaultValue : parseFloat(value);
    }
}

Neo.applyClassConfig(FloatField);

export {FloatField as default};