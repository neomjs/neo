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
         * Neo itself does not need field names to get mapped to the DOM (input nodes),
         * except for CheckBoxes & Radios to work. It can be useful for testing tools
         * & accessibility though, so the default got set to true.
         * Feel free to change it to false to keep the DOM minimal.
         * @member {Boolean} renderName_=true
         */
        renderName_: true,
        /**
         * In case renderName is set to true, you can optionally render the combination
         * of all formGroup(s) & the field name into the DOM => input node
         * @member {Boolean} renderPath=true
         */
        renderPath: true,
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
     * An internal cache for formGroup(s) and the field name
     * @member {String|null} path=null
     */
    path = null

    /**
     * Triggered after the name config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     */
    afterSetName(value, oldValue) {
        let me = this;

        me.renderName && me.changeInputElKey('name', me.renderPath ? me.getPath() : value)
    }

    /**
     * Triggered after the value config got changed
     * @param {*} value
     * @param {*} oldValue
     */
    afterSetValue(value, oldValue) {
        oldValue !== undefined && this.fireChangeEvent(value, oldValue)
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
    fireChangeEvent(value, oldValue, isUserChange = false) {
        let me            = this,
            FormContainer = Neo.form?.Container,
            opts          = {component: me, oldValue, value};

        if (Neo.isFunction(me.getGroupValue)) {
            opts.groupValue = me.getGroupValue()
        }

        me.fire(isUserChange ? 'userChange' : 'change', opts);

        if (!me.suspendEvents) {
            ComponentManager.getParents(me).forEach(parent => {
                if (FormContainer && parent instanceof FormContainer) {
                    parent.fire('fieldChange', opts)
                }
            })
        }
    }

    /**
     * Forms in neo can be nested. This method will return the closest parent which is a form.Container or null.
     * @returns {Neo.form.Container|null}
     */
    getClosestForm() {
        let me            = this,
            FormContainer = Neo.form?.Container,
            parent;

        for (parent of ComponentManager.getParents(me)) {
            if (FormContainer && parent instanceof FormContainer) {
                return parent
            }
        }

        return null
    }

    /**
     * Override this method as needed
     * @returns {Object|null}
     */
    getInputEl() {
        return this.vdom
    }

    /**
     * Returns the combination of the field formGroup(s) & name
     * @returns {String|null}
     */
    getPath() {
        let me = this,
            path;

        // fields could have formGroups, but no name.
        // returning the namespace can confuse form.Container.adjustTreeLeaves(),
        // since namespaces could be considered as field instances.
        if (!me.name) {
            return null
        }

        if (!me.path) {
            path = me.formGroup ? me.formGroup.split('.') : [];

            me.name && path.push(me.name);

            if (path.length < 1) {
                return null
            }

            me.path = path.join('.');
        }

        if (!me.path) {
            me.path = 'none'
        }

        return me.path === 'none' ? null: me.path
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
            FormContainer = Neo.form?.Container,
            opts          = {...data, component: me, value: me.getValue()};

        if (Neo.isFunction(me.getGroupValue)) {
            opts.groupValue = me.getGroupValue()
        }

        if (!me.suspendEvents) {
            ComponentManager.getParents(me).forEach(parent => {
                if (FormContainer && parent instanceof FormContainer) {
                    parent.fire('fieldFocusLeave', opts)
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
