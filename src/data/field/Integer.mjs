import Field from './Field.mjs';

/**
 * @class Neo.data.field.Integer
 * @extends Neo.data.field.Field
 */
class IntegerField extends Field {
    static getConfig() {return {
        className : 'Neo.data.field.Integer',
        ntype     : 'field-integer',
        emptyValue: 0
    }}

    beforeSetValue(value, oldValue) {
        let emptyValue = this.nullableValue ? null : this.emptyValue;
        return (value === null || value === undefined) ? emptyValue : parseInt(value, 10);
    }
}

Neo.applyClassConfig(IntegerField);

export {IntegerField as default};