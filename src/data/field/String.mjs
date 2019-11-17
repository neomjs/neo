import Field from './Field.mjs';

/**
 * @class Neo.data.field.String
 * @extends Neo.data.field.Field
 */
class StringField extends Field {
    static getConfig() {return {
        className : 'Neo.data.field.String',
        ntype     : 'field-string',
        emptyValue: ''
    }}

    beforeSetValue(value, oldValue) {
        let emptyValue = this.nullableValue ? null : this.emptyValue;
        return (value === null || value === undefined) ? emptyValue : String(value);
    }
}

Neo.applyClassConfig(StringField);

export {StringField as default};