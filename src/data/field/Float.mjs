import Field from './Field.mjs';

/**
 * @class Neo.data.field.Float
 * @extends Neo.data.field.Field
 */
class FloatField extends Field {
    static getConfig() {return {
        className : 'Neo.data.field.Float',
        ntype     : 'field-float',
        emptyValue: 0
    }}

    beforeSetValue(value, oldValue) {
        let emptyValue = this.nullableValue ? null : this.emptyValue;
        return (value === null || value === undefined) ? emptyValue : parseFloat(value);
    }
}

Neo.applyClassConfig(FloatField);

export {FloatField as default};