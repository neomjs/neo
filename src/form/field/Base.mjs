import Component from '../../component/Base.mjs';

/**
 * Abstract base class for form fields
 * @class Neo.form.field.Base
 * @extends Neo.component.Base
 */
class Base extends Component {
    static config = {
        /**
         * @member {String} className='Neo.form.field.Base'
         * @protected
         */
        className: 'Neo.form.field.Base',
        /**
         * @member {String} ntype='basefield'
         * @protected
         */
        ntype: 'basefield',
        /**
         * @member {*} value_=null
         */
        value_: null
    }

    /**
     * Triggered after the value config got changed
     * @param {*} value
     * @param {*} oldValue
     */
    afterSetValue(value, oldValue) {
        if (oldValue !== undefined) {
            this.fireChangeEvent(value, oldValue);
        }
    }

    /**
     * Override this method as needed
     * @param {*} value
     * @param {*} oldValue
     */
    fireChangeEvent(value, oldValue) {
        this.fire('change', {
            component: this,
            oldValue,
            value
        });
    }

    /**
     * @returns {*}
     */
    getValue() {
        return this.value;
    }

    /**
     * @returns {Boolean}
     */
    isValid() {
        return true;
    }

    /**
     * Resets the field to a new value or null
     * @param {*} [value=null]
     */
    reset(value) {
        this.value = value;
    }

    /**
     * Checks for client-side field errors
     * @param {Boolean} silent=true
     * @returns {Boolean} Returns true in case there are no client-side errors
     */
    validate(silent=true) {
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

export default Base;
