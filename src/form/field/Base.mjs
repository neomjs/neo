import {default as Component} from '../../component/Base.mjs';

/**
 * Abstract base class for form fields
 * @class Neo.form.field.Base
 * @extends Neo.component.Base
 */
class Base extends Component {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.form.field.Base'
         * @private
         */
        className: 'Neo.form.field.Base',
        /**
         * @member {String} ntype='basefield'
         * @private
         */
        ntype: 'basefield',
        /**
         * @member {*} value_=null
         * @private
         */
        value_: null
    }}

    /**
     * @param {*} value
     * @param {*} oldValue
     */
    afterSetValue(value, oldValue) {
        if (oldValue !== undefined) {
            this.fire('change', {
                oldValue: oldValue,
                value   : value
            });
        }
    }

    /**
     *
     * @returns {*} this.value
     */
    getSubmitValue() {
        return this.value;
    }

    /**
     *
     * @returns {Boolean}
     */
    isValid() {
        return true;
    }
}

/**
 * The change event fires after the value config gets changed
 * @event change
 * @param {*} value
 * @param {*} oldValue
 * @returns {Object}
 */

Neo.applyClassConfig(Base);

export {Base as default};