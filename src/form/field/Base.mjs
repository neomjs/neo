import Component        from '../../component/Base.mjs';
import ComponentManager from '../../manager/Component.mjs';
import NeoArray         from '../../util/Array.mjs';

/**
 * Abstract base class for form fields
 * @class Neo.form.field.Base
 * @extends Neo.component.Base
 */
class Base extends Component {
    /**
     * Valid values for isTouchedEvent
     * @member {String[]} isTouchedEvents=['focusEnter','focusLeave']
     * @protected
     * @static
     */
    static isTouchedEvents = ['focusEnter', 'focusLeave']

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
         * True indicates that a user has interacted with the form field
         * @member {Boolean} isTouched_=false
         */
        isTouched_: false,
        /**
         * Event name which sets isTouched to true. Valid options are 'focusEnter' & 'focusLeave'
         * @member {String} isTouched_=false
         */
        isTouchedEvent_: 'focusLeave',
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
     * Base implementation to check if the fields value has changed.
     * Can get overridden in superclasses.
     * @returns {Boolean}
     */
    get isDirty() {
        let originalValue = this.originalConfig.value,
            value         = this.value;

        return value !== originalValue && Neo.isEmpty(value) !== Neo.isEmpty(originalValue)
    }
    /**
     * An internal cache for formGroup(s) and the field name
     * @member {String|null} path=null
     */
    path = null

    /**
     * Triggered after the name isTouched got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     */
    afterSetIsTouched(value, oldValue) {
        let {cls} = this;

        NeoArray.toggle(cls, 'neo-is-touched', value);
        this.cls = cls
    }

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
     * Triggered after the role config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetRole(value, oldValue) {
        this.getInputEl().role = value;
        this.update()
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
            return me.formGroupString
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
     * Triggered before the isTouchedEvent config gets changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    beforeSetIsTouchedEvent(value, oldValue) {
        return this.beforeSetEnumValue(value, oldValue, 'isTouchedEvent')
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
            me.getInputEl()[key] = value
        } else {
            delete me.getInputEl()[key]
        }

        !silent && me.update()
    }

    /**
     * Override this method as needed
     * @param {*}      value
     * @param {*}      oldValue
     * @param {String} eventName
     */
    doFireChangeEvent(value, oldValue, eventName) {
        let me            = this,
            FormContainer = Neo.form?.Container,
            formEvent     = 'field' + Neo.capitalize(eventName),
            opts          = {component: me, oldValue, value};

        if (Neo.isFunction(me.getGroupValue)) {
            opts.groupValue = me.getGroupValue()
        }

        me.fire(eventName, opts);

        if (!me.suspendEvents) {
            ComponentManager.getParents(me).forEach(parent => {
                if (FormContainer && parent instanceof FormContainer) {
                    parent.fire(formEvent, opts)
                }
            })
        }
    }

    /**
     * Override this method as needed
     * @param {*} value
     * @param {*} oldValue
     */
    fireChangeEvent(value, oldValue) {
        this.doFireChangeEvent(value, oldValue, 'change')
    }

    /**
     * Override this method as needed
     * @param {*} value
     * @param {*} oldValue
     */
    fireUserChangeEvent(value, oldValue) {
        this.doFireChangeEvent(value, oldValue, 'userChange')
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
    getSubmitValue() {
        return this.value
    }

    /**
     * @deprecated in v7.x
     * @returns {*}
     */
    getValue() {
        return this.getSubmitValue()
    }

    /**
     * @returns {Boolean}
     */
    isValid() {
        return true
    }

    /**
     * @param {Object} data
     */
    onFocusEnter(data) {
        super.onFocusLeave(data);

        if (this.isTouchedEvent === 'focusEnter') {
            this.isTouched = true
        }
    }

    /**
     * @param {Object} data
     * @param {Object[]} data.oldPath
     * @protected
     */
    onFocusLeave(data) {
        super.onFocusLeave(data);

        let me            = this,
            FormContainer = Neo.form?.Container,
            opts          = {...data, component: me, value: me.getSubmitValue()};

        if (me.isTouchedEvent === 'focusLeave') {
            me.isTouched = true
        }

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
        this.originalConfig.value = value;
        this.value = value
    }

    /**
     * Checks for client-side field errors
     * @param {Boolean} silent=true
     * @returns {Boolean} Returns true in case there are no client-side errors
     */
    validate(silent=true) {
        return true
    }
}

/**
 * The change event fires after the value config gets changed
 * @event change
 * @param {*} value
 * @param {*} oldValue
 * @returns {Object}
 */

Neo.setupClass(Base);

export default Base;
