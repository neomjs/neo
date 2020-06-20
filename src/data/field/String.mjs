import Field from './Field.mjs';

/**
 * @class Neo.data.field.String
 * @extends Neo.data.field.Field
 */
class StringField extends Field {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.data.field.String'
         * @protected
         */
        className : 'Neo.data.field.String',
        /**
         * @member {String} ntype='data-field-string'
         * @protected
         */
        ntype: 'data-field-string',
        /**
         * @member {String|null} defaultValue=''
         */
        defaultValue: ''
    }}

    /**
     * Triggered before the value config gets changed.
     * @param {String|null} value
     * @param {String|null} oldValue
     * @returns {String}
     * @protected
     */
    beforeSetValue(value, oldValue) {
        let me           = this,
            defaultValue = me.defaultValue ? me.defaultValue : me.nullableValue ? null : undefined;

        return (value === null || value === undefined) ? defaultValue : String(value);
    }
}

Neo.applyClassConfig(StringField);

export {StringField as default};