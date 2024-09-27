import Base             from './Base.mjs';
import ComponentManager from '../../manager/Component.mjs';
import NeoArray         from '../../util/Array.mjs';

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
         * Useful for fields inside a css grid where errors should live outside the layout
         * @member {Boolean} errorPositionAbsolute_=false
         */
        errorPositionAbsolute_: false,
        /**
         * @member {Function} errorTextGroupRequired='Required'
         */
        errorTextGroupRequired: data => `Please check at least one item of the group: ${data.name}`,
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
         * Edge-case config in case we want to render leading content with their own selectors like:
         * <span class="my-label-id-cls">E10</span> · Firstname
         * @member {String|null} labelId_=null
         */
        labelId_: null,
        /**
         * CSS rules for labelId
         * @member {String[]} labelIdCls_=[]
         */
        labelIdCls_: [],
        /**
         * Separator between labelId & labelText
         * @member {String} labelIdSeparator_=' · '
         */
        labelIdSeparator_: ' · ',
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
         * @member {Boolean} required_=false
         */
        required_: false,
        /**
         * Use case: Set this config to false for all but one item with the same name.
         * @member {Boolean} showErrorTexts_=true
         */
        showErrorTexts_: true,
        /**
         * In case the CheckBox does not belong to a group (multiple fields with the same name),
         * you can pass a custom value for the unchecked state.
         * @member {*} uncheckedValue=false
         */
        uncheckedValue: false,
        /**
         * Using the alert state will display an empty but required field in orange instead of red.
         * Intended to get combined with form.Container: getFormState().
         * See apps/form as an example.
         * @member {Boolean} useAlertState_=false
         */
        useAlertState_: false,
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
            {cls: ['neo-error-wrapper'], removeDom: true, cn: [
                {cls: ['neo-error']}
            ]}
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

        if (oldValue) {
            me.clean = false
        }

        me.validate(); // silent

        labelEl.cn[1].checked = value;

        NeoArray.removeAdd(iconCls, oldCls, newCls);

        me.update();

        if (oldValue !== undefined) {
            me.fireChangeEvent(me.getSubmitValue(), me.getOldSubmitValue())
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
     * Triggered after the errorPositionAbsolute config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetErrorPositionAbsolute(value, oldValue) {
        let me  = this,
            cls = me.vdom.cn[1].cn[0].cls;

        NeoArray[value ? 'add' : 'remove'](cls, 'neo-absolute');

        me.update()
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
            labelEl = me.vdom.cn[0];

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
        this.changeInputElKey('type', value)
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
        let me    = this,
            {cls} = me;

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
        let me = this;

        if (me.labelId) {
            value = `<span class="${me.labelIdCls.join(',')}">${me.labelId}</span>${me.labelIdSeparator + value}`
        }

        me.vdom.cn[0].cn[0].innerHTML = value;
        me.update()
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
     * Triggered after the required config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetRequired(value, oldValue) {
        oldValue !== undefined && this.validate(false)
    }

    /**
     * Triggered after the showErrorTexts config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetShowErrorTexts(value, oldValue) {
        oldValue !== undefined && this.validate(false)
    }

    /**
     * Triggered after the useAlertState groupRequired got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetUseAlertState(value, oldValue) {
        let {cls} = this;
        NeoArray.toggle(cls, 'neo-use-alert-state', value);
        this.cls = cls
    }

    /**
     * Triggered after the value config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetValue(value, oldValue) {
        this.changeInputElKey('value', value)
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
            valueLabel.innerHTML = value
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
     * Triggered before the renderName config gets changed.
     * CheckBoxes & radios rely on this flag being set to true
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    beforeSetRenderName(value, oldValue) {
        return true
    }

    /**
     * @returns {String[]}
     */
    getGroupValue() {
        let form   = this.getClosestForm(),
            path   = this.getPath(),
            value  = [],
            fields;

        if (path) {
            fields = ComponentManager.find({path});

            fields.forEach(field => {
                if (field.checked && field.getClosestForm() === form) {
                    NeoArray.add(value, field.value)
                }
            })
        }

        return value
    }

    /**
     * @returns {String}
     */
    getIconElId() {
        return `${this.id}__icon`
    }

    /**
     * @returns {Object|null}
     */
    getInputEl() {
        return this.vdom.cn[0].cn[1]
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
     * Counterpart to getSubmitValue(), returning the uncheckedValue if checked
     * @returns {String|null}
     */
    getOldSubmitValue() {
        let me = this;

        return me.checked ? me.uncheckedValue : me.value
    }

    /**
     * @deprecated in v7.x
     * @returns {String|null}
     */
    getOldValue() {
        return this.getOldSubmitValue()
    }

    /**
     * Returns this.value if checked, otherwise this.uncheckedValue
     * @returns {String|null}
     */
    getSubmitValue() {
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
    isEmptyAndRequired() {
        // Assuming that checkboxes & radios can only validate false in case they are empty & required
        return !this.validate(false)
    }

    /**
     * @returns {Boolean}
     */
    isValid() {
        this.validate(true); // silent

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

        me.checked = checked;

        me.fireUserChangeEvent(me.getSubmitValue(), me.getOldSubmitValue())
    }

    /**
     @param {String|null} value
     @param {Boolean} silent=false
     */
    updateError(value, silent=false) {
        let me        = this,
            {cls}     = me,
            showError = value && me.showErrorTexts,
            errorNode, errorWrapper;

        if (!(me.clean && !me.mounted)) {
            me._error = value; // silent update

            NeoArray[value ? 'add' : 'remove'](cls, 'neo-invalid');
            me.cls = cls;

            errorWrapper = me.vdom.cn[1];
            errorNode    = errorWrapper.cn[0];

            if (showError) {
                errorNode.html = value
            } else {
                delete errorNode.html
            }

            errorWrapper.removeDom = !showError;

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
            {name}      = me,
            returnValue = true,
            checkBox, checkBoxes;

        if (!silent) {
            // in case we manually call validate(false) on a form or field before it is mounted, we do want to see errors.
            me.clean = false;
        }

        if (me.groupRequired) {
            returnValue = false;

            // discuss: we could limit this to checkBoxes / radios inside the same form, IF a top level form is used
            checkBoxes = ComponentManager.find({
                ntype: me.ntype,
                name
            });

            // get the group validity state first
            for (checkBox of checkBoxes) {
                if (checkBox.checked) {
                    returnValue = true;
                    break
                }
            }

            // update all group items
            for (checkBox of checkBoxes) {
                if (checkBox.id !== me.id) {
                    if (!me.clean) {
                        checkBox.clean = false;
                    }

                    checkBox[me.clean ? '_error' : 'error'] = returnValue ? null : checkBox.errorTextGroupRequired({name})
                }
            }

            if (!returnValue) {
                me._error = me.errorTextGroupRequired({name})
            }
        } else if (me.required && !me.checked) {
            me._error = me.errorTextRequired;
            returnValue = false
        }

        if (returnValue) {
            me._error = null
        }

        !me.clean && me.updateError(me._error, silent);

        return !returnValue ? false : super.validate(silent)
    }
}

export default Neo.setupClass(CheckBox);
