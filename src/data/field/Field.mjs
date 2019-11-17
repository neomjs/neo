import Base from '../../core/Base.mjs';

/**
 * @class Neo.data.field.Field
 * @extends Neo.core.Base
 */
class Field extends Base {
    static getConfig() {return {
        className    : 'Neo.data.field.Field',
        ntype        : 'model',
        emptyValue   : null,
        nullableValue: true,
        value_       : null
    }}

    afterSetValue(value, oldValue) {
        console.log('afterSetValue', value, oldValue);
    }
}

Neo.applyClassConfig(Field);

export {Field as default};