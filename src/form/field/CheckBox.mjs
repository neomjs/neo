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
         * In case the CheckBox does not belong to a group (multiple fields with the same name),
         * you can pass a custom value for the unchecked state.
         * @member {*} uncheckedValue=null
         */
        uncheckedValue: null,
        /**
         * @member {String|null} valueLabelText_=null
         */
        valueLabelText_: null,
        /**
         * @member {Object} _vdom
         */
        _vdom:
        {tag: 'label', cn: [
            {tag: 'span',  cls: []},
            {tag: 'input', cls: ['neo-checkbox-input']},
            {tag: 'i',     cls: ['neo-checkbox-icon']},
            {tag: 'span',  cls: ['neo-checkbox-value-label']}
        ]}
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        me.addDomListeners(
            {change: me.onInputValueChange, scope: me}
        );
    }

    /**
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetChecked(value, oldValue) {
        let me      = this,
            iconCls = me.vdom.cn[2].cls,
            newCls  = value ? me.iconClsChecked : me.iconCls,
            oldCls  = value ? me.iconCls : me.iconClsChecked;

        me.vdom.cn[1].checked = value;

        NeoArray.remove(iconCls, oldCls);
        NeoArray.add(iconCls, newCls);

        me.update();

        if (oldValue !== undefined) {
            me.fireChangeEvent(me.getValue(), null);
        }
    }

    /**
     * Triggered after the hideLabel config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetHideLabel(value, oldValue) {
        this.vdom.cn[0].removeDom = value;
        this.update();
    }

    /**
     * Triggered after the id config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetId(value, oldValue) {
        let me   = this,
            vdom = me.vdom;

        vdom.cn[0].id = me.getLabelId();
        vdom.cn[1].id = me.getInputElId();
        vdom.cn[2].id = me.getIconElId();
        vdom.cn[3].id = me.getValueLabelId();

        // silent vdom update, the super call will trigger the engine
        super.afterSetId(value, oldValue);
    }

    /**
     * Triggered after the inputType config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetInputType(value, oldValue) {
        this.vdom.cn[1].type = value;
        this.update();
    }

    /**
     * Triggered after the labelCls config got changed
     * @param {String[]} value
     * @param {String[]} oldValue
     * @protected
     */
    afterSetLabelCls(value, oldValue) {
        let me  = this,
            cls = me.vdom.cn[0].cls;

        NeoArray.remove(cls, oldValue);
        NeoArray.add(cls, value);

        me.update();
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
        me.cls = cls;
    }

    /**
     * Triggered after the labelText config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetLabelText(value, oldValue) {
        this.vdom.cn[0].innerHTML = value;
        this.update();
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
            me.vdom.cn[0].width = value;
            me.update();
        }
    }

    /**
     * Triggered after the name config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetName(value, oldValue) {
        this.vdom.cn[1].name = value;
        this.update();
    }

    /**
     * Triggered after the value config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetValue(value, oldValue) {
        if (value) {
            this.vdom.cn[1].value = value;
            this.update();
        }

        super.afterSetValue(value, oldValue);
    }

    /**
     * Triggered after the valueLabel config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetValueLabelText(value, oldValue) {
        let me         = this,
            valueLabel = me.vdom.cn[3],
            showLabel  = !!value; // hide the label, in case value === null || value === ''

        if (showLabel) {
            valueLabel.innerHTML = value;
        }

        valueLabel.removeDom = !showLabel;
        me.update();
    }

    /**
     * Triggered before the labelCls config gets changed.
     * @param {String[]} value
     * @param {String[]} oldValue
     * @protected
     */
    beforeSetLabelCls(value, oldValue) {
        return NeoArray.union(value || [], this.labelBaseCls);
    }

    /**
     * Triggered before the labelPosition config gets changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     * @returns {String}
     */
    beforeSetLabelPosition(value, oldValue) {
        return this.beforeSetEnumValue(value, oldValue, 'labelPosition');
    }

    /**
     * @returns {String}
     */
    getIconElId() {
        return `${this.id}__icon`;
    }

    /**
     * @returns {String}
     */
    getInputElId() {
        return `${this.id}__input`;
    }

    /**
     * @returns {String}
     */
    getLabelId() {
        return `${this.id}__label`;
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
        return `${this.id}__value-label`;
    }

    /**
     * Gets triggered when a user checks a checkbox input.
     * @param {Object} data
     */
    onInputValueChange(data) {
        let me      = this,
            checked = data.target.checked;

        // keep the vdom & vnode in sync for future updates
        me.vnode.childNodes[me.hideLabel ? 0 : 1].attributes.checked = `${checked}`;

        me.checked = checked;
    }
}

Neo.applyClassConfig(CheckBox);

export default CheckBox;
