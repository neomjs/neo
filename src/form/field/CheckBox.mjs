import Base     from './Base.mjs';
import NeoArray from '../../util/Array.mjs';

/**
 * @class Neo.form.field.CheckBox
 * @extends Neo.form.field.Base
 */
class CheckBox extends Base {
    /**
     * Valid values for labelPosition
     * @member {String[]} labelPositions=['left','top']
     * @protected
     * @static
     */
    static labelPositions = ['left', 'top']

    static config = {
        /**
         * @member {String} className='Neo.form.field.CheckBox'
         * @protected
         */
        className: 'Neo.form.field.CheckBox',
        /**
         * @member {String} ntype='checkboxfield'
         * @protected
         */
        ntype: 'checkboxfield',
        /**
         * @member {String[]} baseCls=['neo-checkboxfield']
         */
        baseCls: ['neo-checkboxfield'],
        /**
         * @member {Boolean} checked_=false
         */
        checked_: false,
        /**
         * @member {String|null} error_=null
         */
        error_: null,
        /**
         * @member {String} errorTextRequired='Required'
         */
        errorTextRequired: 'Required',
        /**
         * @member {Boolean} groupRequired_=false
         */
        groupRequired_: false,
        /**
         * @member {Boolean} hideLabel_=false
         */
        hideLabel_: false,
        /**
         * @member {String[]} iconCls=['far','fa-square']
         */
        iconCls: ['far', 'fa-square'],
        /**
         * @member {String[]} iconClsChecked=['fas','fa-check']
         */
        iconClsChecked: ['fas', 'fa-check'],
        /**
         * @member {String} inputType_='checkbox'
         */
        inputType_: 'checkbox',
        /**
         * @member {String[]} labelBaseCls=['neo-checkbox-label']
         */
        labelBaseCls: ['neo-checkbox-label'],
        /**
         * @member {String[]} labelCls_=[]
         */
        labelCls_: [],
        /**
         * Valid values: 'left', 'top'
         * @member {String} labelPosition_='left'
         */
        labelPosition_: 'left',
        /**
         * @member {String} labelText_='LabelText'
         */
        labelText_: 'LabelText',
        /**
         * defaults to px
         * @member {Number|String} labelWidth_=150
         */
        labelWidth_: 150,
        /**
         * @member {String} The name (group) of the input dom node
         */
        name_: '',
        /**
         * @member {Boolean} required_=false
         */
        required_: false,
        /**
         * In case the CheckBox does not belong to a group (multiple fields with the same name),
         * you can pass a custom value for the unchecked state.
         * @member {*} uncheckedValue=false
         */
        uncheckedValue: false,
        /**
         * @member {Boolean|Number|String|null} value=true
         */
        value: true,
        /**
         * @member {String|null} valueLabelText_=null
         */
        valueLabelText_: null,
        /**
         * @member {Object} _vdom
         */
        _vdom:
        {cn: [
            {tag: 'label', cls: ['neo-checkbox-label'], cn: [
                {tag: 'span',  cls: []},
                {tag: 'input', cls: ['neo-checkbox-input']},
                {tag: 'i',     cls: ['neo-checkbox-icon']},
                {tag: 'span',  cls: ['neo-checkbox-value-label']}
            ]},
            {cls: ['neo-error'], removeDom: true}
        ]}
    }

    /**
     * Set this value to false, in case a field should display errors up front.
     * Otherwise, errors will stay hidden on mounting, unless you trigger validate(false).
     * @member {Boolean} clean=true
     */
    clean = true

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        me.addDomListeners(
            {change: me.onInputValueChange, scope: me}
        )
    }

    /**
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetChecked(value, oldValue) {
        let me      = this,
            labelEl = me.vdom.cn[0],
            iconCls = labelEl.cn[2].cls,
            newCls  = value ? me.iconClsChecked : me.iconCls,
            oldCls  = value ? me.iconCls : me.iconClsChecked;

        me.validate(); // silent

        labelEl.cn[1].checked = value;

        NeoArray.removeAdd(iconCls, oldCls, newCls);

        me.update();

        if (oldValue !== undefined) {
            me.fireChangeEvent(me.getValue(), null)
        }
    }

    /**
     * Triggered after the error config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetError(value, oldValue) {
        this.updateError(value)
    }

    /**
     * Triggered after the required groupRequired got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetGroupRequired(value, oldValue) {
        oldValue !== undefined && this.validate(false)
    }

    /**
     * Triggered after the hideLabel config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetHideLabel(value, oldValue) {
        this.vdom.cn[0].cn[0].removeDom = value;
        this.update()
    }

    /**
     * Triggered after the id config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetId(value, oldValue) {
        let me      = this,
            vdom    = me.vdom,
            labelEl = vdom.cn[0];

        labelEl.cn[0].id = me.getLabelId();
        labelEl.cn[1].id = me.getInputElId();
        labelEl.cn[2].id = me.getIconElId();
        labelEl.cn[3].id = me.getValueLabelId();

        // silent vdom update, the super call will trigger the engine
        super.afterSetId(value, oldValue)
    }

    /**
     * Triggered after the inputType config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetInputType(value, oldValue) {
        this.vdom.cn[0].cn[1].type = value;
        this.update()
    }

    /**
     * Triggered after the labelCls config got changed
     * @param {String[]} value
     * @param {String[]} oldValue
     * @protected
     */
    afterSetLabelCls(value, oldValue) {
        let me  = this,
            cls = me.vdom.cn[0].cn[0].cls;

        NeoArray.remove(cls, oldValue);
        NeoArray.add(cls, value);

        me.update()
    }

    /**
     * Triggered after the labelPosition config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetLabelPosition(value, oldValue) {
        let me  = this,
            cls = me.cls;

        NeoArray.remove(cls, 'neo-label-' + oldValue);
        NeoArray.add(   cls, 'neo-label-' + value);
        me.cls = cls
    }

    /**
     * Triggered after the labelText config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetLabelText(value, oldValue) {
        this.vdom.cn[0].cn[0].innerHTML = value;
        this.update()
    }

    /**
     * Triggered after the labelWidth config got changed
     * @param {Number|String} value
     * @param {Number|String} oldValue
     * @protected
     */
    afterSetLabelWidth(value, oldValue) {
        let me = this;

        if (!me.hideLabel) {
            me.vdom.cn[0].cn[0].width = value;
            me.update()
        }
    }

    /**
     * Triggered after the name config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetName(value, oldValue) {
        this.vdom.cn[0].cn[1].name = value;
        this.update()
    }

    /**
     * Triggered after the required config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetRequired(value, oldValue) {
        oldValue !== undefined && this.validate(false)
    }

    /**
     * Triggered after the value config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetValue(value, oldValue) {
        if (value) {
            this.vdom.cn[0].cn[1].value = value;
            this.update()
        }
    }

    /**
     * Triggered after the valueLabel config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetValueLabelText(value, oldValue) {
        let me         = this,
            valueLabel = me.vdom.cn[0].cn[3],
            showLabel  = !!value; // hide the label, in case value === null || value === ''

        if (showLabel) {
            valueLabel.innerHTML = value;
        }

        valueLabel.removeDom = !showLabel;
        me.update()
    }

    /**
     * Triggered before the groupRequired config gets changed.
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    beforeSetGroupRequired(value, oldValue) {
        if (value && this.required) {
            console.warn('Do not use groupRequired & required at the same time. Switching to required.', this);
            return false
        }

        return value
    }

    /**
     * Triggered before the labelCls config gets changed.
     * @param {String[]} value
     * @param {String[]} oldValue
     * @protected
     */
    beforeSetLabelCls(value, oldValue) {
        return NeoArray.union(value || [], this.labelBaseCls)
    }

    /**
     * Triggered before the labelPosition config gets changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     * @returns {String}
     */
    beforeSetLabelPosition(value, oldValue) {
        return this.beforeSetEnumValue(value, oldValue, 'labelPosition')
    }

    /**
     * @returns {String}
     */
    getIconElId() {
        return `${this.id}__icon`
    }

    /**
     * @returns {String}
     */
    getInputElId() {
        return `${this.id}__input`
    }

    /**
     * @returns {String}
     */
    getLabelId() {
        return `${this.id}__label`
    }

    /**
     * @returns {String|null}
     */
    getValue() {
        let me = this;

        return me.checked ? me.value : me.uncheckedValue
    }

    /**
     * @returns {String}
     */
    getValueLabelId() {
        return `${this.id}__value-label`
    }

    /**
     * @returns {Boolean}
     */
    isValid() {
        return this.error ? false : super.isValid()
    }

    /**
     * Gets triggered when a user checks a checkbox input.
     * @param {Object} data
     */
    onInputValueChange(data) {
        let me      = this,
            checked = data.target.checked;

        // keep the vdom & vnode in sync for future updates
        me.vnode.childNodes[0].childNodes[me.hideLabel ? 0 : 1].attributes.checked = `${checked}`;

        me.checked = checked
    }

    /**
     @param {String|null} value
     @param {Boolean} silent=false
     */
    updateError(value, silent=false) {
        let me  = this,
            cls = me.cls,
            errorNode;

        if (!(me.clean && !me.mounted)) {
            me._error = value; // silent update

            NeoArray[value ? 'add' : 'remove'](cls, 'neo-invalid');
            me.cls = cls;

            errorNode = me.vdom.cn[1];

            if (value) {
                errorNode.html = value;
            } else {
                delete errorNode.html;
            }

            errorNode.removeDom = !value;

            !silent && me.update()
        }
    }

    /**
     * Checks for client-side field errors
     * @param {Boolean} silent=true
     * @returns {Boolean} Returns true in case there are no client-side errors
     */
    validate(silent=true) {
        let me          = this,
            returnValue = true;

        if (!silent) {
            // in case we manually call validate(false) on a form or field before it is mounted, we do want to see errors.
            me.clean = false;
        }

        if (me.required && !me.checked) {
            me._error = me.errorTextRequired;
            returnValue = false;
        }

        if (returnValue) {
            me._error = null;
        }

        !me.clean && me.updateError(me._error, silent);

        return !returnValue ? false : super.validate(silent)
    }
}

Neo.applyClassConfig(CheckBox);

export default CheckBox;
