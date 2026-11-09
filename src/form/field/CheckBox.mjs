import ComponentManager from '../../manager/Component.mjs';
import Field            from './Base.mjs';
import NeoArray         from '../../util/Array.mjs';

/**
 * @summary A checkbox with individual or form-scoped group validation and one shared group error message.
 * @class Neo.form.field.CheckBox
 * @extends Neo.form.field.Base
 */
class CheckBox extends Field {
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
         * @reactive
         */
        checked_: false,
        /**
         * @member {String|null} error_=null
         * @reactive
         */
        error_: null,
        /**
         * Useful for fields inside a css grid where errors should live outside the layout
         * @member {Boolean} errorPositionAbsolute_=false
         * @reactive
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
         * @reactive
         */
        groupRequired_: false,
        /**
         * @member {Boolean} hideLabel_=false
         * @reactive
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
         * @reactive
         */
        inputType_: 'checkbox',
        /**
         * @member {String[]} labelBaseCls=['neo-checkbox-label']
         */
        labelBaseCls: ['neo-checkbox-label'],
        /**
         * @member {String[]} labelCls_=[]
         * @reactive
         */
        labelCls_: [],
        /**
         * Edge-case config in case we want to render leading content with their own selectors like:
         * <span class="my-label-id-cls">E10</span> · Firstname
         * @member {String|null} labelId_=null
         * @reactive
         */
        labelId_: null,
        /**
         * CSS rules for labelId
         * @member {String[]} labelIdCls_=[]
         * @reactive
         */
        labelIdCls_: [],
        /**
         * Separator between labelId & labelText
         * @member {String} labelIdSeparator_=' · '
         * @reactive
         */
        labelIdSeparator_: ' · ',
        /**
         * Valid values: 'left', 'top'
         * @member {String} labelPosition_='left'
         * @reactive
         */
        labelPosition_: 'left',
        /**
         * The label text or VDOM.
         * Supports:
         * - String: Renders as safe text (textContent).
         * - Object: A single VDOM object.
         * - Object[]: An array of VDOM objects.
         * @member {Object|Object[]|String} labelText_='LabelText'
         * @reactive
         */
        labelText_: 'LabelText',
        /**
         * defaults to px
         * @member {Number|String} labelWidth_=150
         * @reactive
         */
        labelWidth_: 150,
        /**
         * Allows error text on this field. A required group displays its message on its last eligible member.
         * @member {Boolean} showErrorTexts_=true
         * @reactive
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
         * @reactive
         */
        useAlertState_: false,
        /**
         * @member {Boolean|Number|String|null} value=true
         * @reactive
         */
        value: true,
        /**
         * The label text or VDOM to display next to the checkbox.
         * Supports:
         * - String: Renders as safe text (textContent).
         * - Object: A single VDOM object (e.g. {tag: 'i', cls: 'fa fa-check'}).
         * - Object[]: An array of VDOM objects.
         * @member {Object|Object[]|String|null} valueLabel_=null
         * @reactive
         */
        valueLabel_: null,
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
     * @summary Updates the checked state and refreshes requirements shared by optional group members.
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
        !me.groupRequired && me.getGroupItems().find(field => field.groupRequired)?.validate();

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
     * @summary Revalidates the group when a member gains or releases its requirement.
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetGroupRequired(value, oldValue) {
        if (oldValue !== undefined) {
            this.validate(false);
            !value && this.getGroupItems().find(field => field.groupRequired)?.validate(false)
        }
    }

    /**
     * Triggered after the hideLabel config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetHideLabel(value, oldValue) {
        this.getLabelEl().removeDom = value;
        this.update()
    }

    /**
     * @protected
     */
    ensureStableIds() {
        super.ensureStableIds();

        let me      = this,
            labelEl = me.vdom.cn[0];

        labelEl.cn[0].id = me.getLabelId();
        labelEl.cn[1].id = me.getInputElId();
        labelEl.cn[2].id = me.getIconElId();
        labelEl.cn[3].id = me.getValueLabelId()
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
            cls = me.getLabelEl().cls;

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
        this.removeAddCls('neo-label-' + oldValue, 'neo-label-' + value)
    }

    /**
     * Triggered after the labelText config got changed
     * @param {Object|Object[]|String} value
     * @param {Object|Object[]|String} oldValue
     * @protected
     */
    afterSetLabelText(value, oldValue) {
        let me      = this,
            labelEl = me.getLabelEl();

        if (me.labelId) {
            value = [{
                tag : 'span',
                cls : me.labelIdCls,
                text: me.labelId
            }, {
                tag : 'span',
                text: me.labelIdSeparator
            }, ...(Array.isArray(value) ? value : (Neo.isString(value) ? [{text: value}] : [value]))];

            labelEl.cn = value;
            delete labelEl.text
        } else {
            if (Neo.isString(value)) {
                labelEl.text = value;
                delete labelEl.cn
            } else {
                labelEl.cn = Array.isArray(value) ? value : [value];
                delete labelEl.text
            }
        }

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
            me.getLabelEl().width = value;
            me.update()
        }
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
     * @param {Object|Object[]|String|null} value
     * @param {Object|Object[]|String|null} oldValue
     * @protected
     */
    afterSetValueLabel(value, oldValue) {
        let me         = this,
            valueLabel = me.vdom.cn[0].cn[3],
            showLabel  = !!value; // hide the label, in case value === null || value === ''

        if (showLabel) {
            if (Neo.isString(value)) {
                valueLabel.text = value;
                delete valueLabel.cn
            } else {
                valueLabel.cn = Array.isArray(value) ? value : [value];
                delete valueLabel.text
            }
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
     * @summary Returns the logical value group in container order, or the rendered group for native radio selection.
     * Logical groups use the full data path and closest form. Native groups use the rendered name and form owner.
     * Both stay within one input type and window. Unnamed inputs are independent; unattached peers keep registration order.
     * @param {Boolean} useDomGrouping=false
     * @returns {Neo.form.field.CheckBox[]}
     */
    getGroupItems(useDomGrouping=false) {
        const me      = this,
              getName = field => useDomGrouping && !field.renderPath ? field.name : field.getPath(),
              getForm = field => useDomGrouping ?
                  ComponentManager.getParents(field).find(parent => parent.getVdomRoot().tag === 'form') : field.getClosestForm(),
              name    = getName(me),
              form    = getForm(me);

        if (!name) return [me];

        const fields = ComponentManager.find({inputType: me.inputType, windowId: me.windowId}).filter(field =>
            field instanceof CheckBox && getForm(field) === form && getName(field) === name),
              paths = new Map(fields.map(field => [field, [...ComponentManager.getParents(field).reverse(), field]])),
              roots = [...new Set([...paths.values()].map(path => path[0]))];

        return fields.sort((first, second) => {
            const firstPath  = paths.get(first),
                  secondPath = paths.get(second);

            for (let index = 0; index < Math.min(firstPath.length, secondPath.length); index++) {
                if (firstPath[index] !== secondPath[index]) {
                    if (!index) return roots.indexOf(firstPath[0]) - roots.indexOf(secondPath[0]);

                    const parent = firstPath[index - 1],
                          items  = parent.items || ComponentManager.getDirectChildren(parent.id);

                    return items.indexOf(firstPath[index]) - items.indexOf(secondPath[index])
                }
            }

            return firstPath.length - secondPath.length
        })
    }

    /**
     * @summary Returns checked group values within this field's logical form and data path.
     * A logical form can render as a div; native radio exclusivity then spans a wider rendered group.
     * @returns {Array}
     */
    getGroupValue() {
        const value = [];

        if (this.name) {
            this.getGroupItems().forEach(field => {
                field.checked && NeoArray.add(value, field.value)
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
     * @returns {Object|null}
     */
    getLabelEl() {
        return this.vdom.cn[0].cn[0]
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
     * @summary Updates field validity while allowing group validation to select a single text owner.
     * @param {String|null} value
     * @param {Boolean} silent=false
     * @param {Boolean} showText=true
     */
    updateError(value, silent=false, showText=true) {
        let me        = this,
            {cls}     = me,
            showError = value && me.showErrorTexts && showText,
            errorNode, errorWrapper;

        if (!(me.clean && !me.mounted)) {
            me._error = value; // silent update

            NeoArray.toggle(cls, 'neo-invalid', value);
            me.cls = cls;

            errorWrapper = me.vdom.cn[1];
            errorNode    = errorWrapper.cn[0];

            if (showError) {
                errorNode.text = value
            } else {
                delete errorNode.text
            }

            errorWrapper.removeDom = !showError;

            !silent && me.update()
        }
    }

    /**
     * @summary Validates individual requirements or updates all required group members with one shared message.
     * @param {Boolean} silent=true
     * @returns {Boolean} Returns true in case there are no client-side errors
     */
    validate(silent=true) {
        let me          = this,
            returnValue = true,
            checkBoxes;

        if (!silent) {
            // in case we manually call validate(false) on a form or field before it is mounted, we do want to see errors.
            me.clean = false;
        }

        if (me.groupRequired) {
            checkBoxes  = me.getGroupItems();
            returnValue = checkBoxes.some(field => field.checked);
            checkBoxes  = checkBoxes.filter(field => field.groupRequired);

            const clean = checkBoxes.every(field => field.clean),
                  owner = checkBoxes.findLast(field => field.showErrorTexts && !field.hidden &&
                      !ComponentManager.getParents(field).some(parent => parent.hidden));

            for (const field of checkBoxes) {
                const error = returnValue ? null : field.errorTextGroupRequired({name: field.name});

                if (!clean) field.clean = false;
                field[clean ? '_error' : 'error'] = error;
                !clean && field.updateError(error, field === me && silent, field === owner)
            }

            return returnValue ? super.validate(silent) : false
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

    /**
     * Serializes the field into a JSON-compatible object.
     * @returns {Object}
     */
    toJSON() {
        let me = this;

        return {
            ...super.toJSON(),
            checked       : me.checked,
            error         : me.error,
            groupRequired : me.groupRequired,
            hideLabel     : me.hideLabel,
            iconCls       : me.iconCls,
            iconClsChecked: me.iconClsChecked,
            inputType     : me.inputType,
            labelPosition : me.labelPosition,
            labelText     : me.labelText,
            labelWidth    : me.labelWidth,
            uncheckedValue: me.uncheckedValue,
            valueLabel    : me.valueLabel
        }
    }
}

export default Neo.setupClass(CheckBox);
