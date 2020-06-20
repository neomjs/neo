import Field from './Field.mjs';

/**
 * @class Neo.data.field.Integer
 * @extends Neo.data.field.Field
 */
class IntegerField extends Field {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.data.field.Integer'
         * @protected
         */
        className: 'Neo.data.field.Integer',
        /**
         * @member {String} ntype='data-field-integer'
         * @protected
         */
        ntype: 'data-field-integer',
        /**
         * @member {Number|null} defaultValue=0
         */
        defaultValue: 0
    }}

    /**
     * Triggered before the value config gets changed.
     * @param {Number|null} value
     * @param {Number|null} oldValue
     * @returns {Number}
     * @protected
     */
    beforeSetValue(value, oldValue) {
        let me           = this,
            defaultValue = me.defaultValue ? me.defaultValue : me.nullableValue ? null : undefined;

        return (value === null || value === undefined) ? defaultValue : parseInt(value, 10);
    }
}

Neo.applyClassConfig(IntegerField);

export {IntegerField as default};