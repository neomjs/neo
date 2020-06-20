import Base from '../../core/Base.mjs';

/**
 * @class Neo.data.field.Field
 * @extends Neo.core.Base
 */
class Field extends Base {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.data.field.Field'
         * @protected
         */
        className: 'Neo.data.field.Field',
        /**
         * @member {String} ntype='data-field'
         * @protected
         */
        ntype: 'data-field',
        /**
         * @member {*|null} defaultValue=null
         */
        defaultValue: null,
        /**
         * @member {*|null} nullableValue=true
         * @protected
         */
        nullableValue: true,
        /**
         * @member {*|null} value_=null
         * @protected
         */
        value_: null
    }}

    /**
     * Triggered after the value config got changed
     * @param {*|null} value
     * @param {*|null} oldValue
     * @protected
     */
    afterSetValue(value, oldValue) {
        console.log('afterSetValue', value, oldValue);
    }
}

Neo.applyClassConfig(Field);

export {Field as default};