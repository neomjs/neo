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
         * @member {String|null} name_=null
         */
        name_: null,
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
     * Triggered after the name config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     */
    afterSetName(value, oldValue) {
        this.changeInputElKey('name', value)
    }

    /**
     * Triggered after the value config got changed
     * @param {*} value
     * @param {*} oldValue
     */
    afterSetValue(value, oldValue) {
        if (oldValue !== undefined) {
            this.fireChangeEvent(value, oldValue)
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

        return returnValue
    }

    /**
     * Changes the value of a inputEl vdom object attribute or removes it in case it has no value
     * @param {String} key
     * @param {Array|Number|Object|String|null} value
     * @param {Boolean} silent=false
     */
    changeInputElKey(key, value, silent=false) {
        let me = this;

        if (value || Neo.isBoolean(value) || value === 0) {
            me.getInputEl()[key] = value;
        } else {
            delete me.getInputEl()[key];
        }

        !silent && me.update()
    }

    /**
     * Override this method as needed
     * @param {*} value
     * @param {*} oldValue
     */
    fireChangeEvent(value, oldValue) {
        let me            = this,
            FormContainer = Neo.form?.Container;

        me.fire('change', {
            component: me,
            oldValue,
            value
        });

        if (!me.suspendEvents) {
            ComponentManager.getParents(me).forEach(parent => {
                if (FormContainer && parent instanceof FormContainer) {
                    parent.fire('fieldChange', {
                        component: me,
                        oldValue,
                        value
                    })
                }
            })
        }
    }

    /**
     * Override this method as needed
     * @returns {Object|null}
     */
    getInputEl() {
        return this.vdom
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

        let me            = this,
            FormContainer = Neo.form?.Container;

        if (!me.suspendEvents) {
            ComponentManager.getParents(me).forEach(parent => {
                if (FormContainer && parent instanceof FormContainer) {
                    parent.fire('fieldFocusLeave', {
                        ...data,
                        component: me
                    })
                }
            })
        }
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
