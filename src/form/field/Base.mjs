import Component        from '../../component/Base.mjs';
import ComponentManager from '../../manager/Component.mjs';

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
         * Form groups can get set on any parent component level.
         * An alternative way for using dots in field names.
         * @member {String|null} formGroup_=null
         */
        formGroup_: null,
        /**
         * @member {*} value_=null
         */
        value_: null
    }

    /**
     * An internal cache for formGroups of all parent levels
     * @member {String|null} formGroupString=null
     */
    formGroupString = null

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
     * Triggered when accessing the formGroup config
     * @param {String|null} value
     * @returns {String|null} parents
     * @protected
     */
    beforeGetFormGroup(value) {
        let me    = this,
            group = [],
            returnValue;

        if (me.formGroupString) {
            return me.formGroupString;
        }

        value && group.push(value);

        ComponentManager.getParents(me).forEach(parent => {
            parent.formGroup && group.unshift(parent.formGroup)
        });

        returnValue = group.join('.');

        me.formGroupString = returnValue;

        return returnValue;
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
     * @param {Object} data
     * @param {Object[]} data.oldPath
     * @protected
     */
    onFocusLeave(data) {
        super.onFocusLeave?.(data);

        ComponentManager.getParents(this).forEach(parent => {
            if (parent instanceof Neo.form.Container) {
                parent.fire('fieldFocusLeave', {
                    ...data,
                    field: this
                })
            }
        })
    }

    /**
     * Resets the field to a new value or null
     * @param {*} value=null
     */
    reset(value=null) {
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
