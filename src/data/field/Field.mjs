import Base from '../../core/Base.mjs';

/**
 * @class Neo.data.field.Field
 * @extends Neo.core.Base
 */
class Field extends Base {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.data.field.Field'
         * @private
         */
        className: 'Neo.data.field.Field',
        /**
         * @member {String} ntype='data-field'
         * @private
         */
        ntype: 'data-field',
        /**
         * @member {*|null} defaultValue=null
         */
        defaultValue: null,
        /**
         * @member {*|null} nullableValue=true
         * @private
         */
        nullableValue: true,
        /**
         * @member {*|null} value_=null
         * @private
         */
        value_: null
    }}

    /**
     * Triggered after the value config got changed
     * @param {*|null} value
     * @param {*|null} oldValue
     * @private
     */
    afterSetValue(value, oldValue) {
        console.log('afterSetValue', value, oldValue);
    }
}

Neo.applyClassConfig(Field);

export {Field as default};