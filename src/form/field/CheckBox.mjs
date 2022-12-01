import Base from './Base.mjs';

/**
 * @class Neo.form.field.CheckBox
 * @extends Neo.form.field.Base
 */
class CheckBox extends Base {
    static getConfig() {return {
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
         * @member {Boolean} checked_=false
         */
        checked_: false,
        /**
         * @member {Array} cls=['neo-checkboxfield']
         */
        cls: ['neo-checkboxfield'],
        /**
         * True to change the checked state when clicking on the value label
         * @member {Boolean} enableLabelClicks_=true
         */
        enableLabelClicks_: true,
        /**
         * @member {Boolean} hideLabel_=false
         */
        hideLabel_: false,
        /**
         * @member {Boolean} hideValueLabel_=false
         */
        hideValueLabel_: true,
        /**
         * @member {String} inputType_='checkbox'
         */
        inputType_: 'checkbox',
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
         * @member {String} valueLabelText_='ValueLabel'
         */
        valueLabelText_: 'ValueLabel',
        /**
         * @member {Object} _vdom
         */
        _vdom:
        {cn: [
            {tag: 'label', cls: ['neo-checkbox-label']},
            {tag: 'input', cls: ['neo-checkbox-input']},
            {tag: 'label', cls: ['neo-checkbox-value-label']}
        ]}
    }}

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
        let me = this;

        me.vdom.cn[1].checked = value;
        me.update();

        if (oldValue !== undefined) {
            me.fire('change', {
                component: me,
                oldValue : oldValue,
                value    : value
            });
        }
    }

    /**
     * Triggered after the enableLabelClicks config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetEnableLabelClicks(value, oldValue) {
        let me    = this,
            label = me.vdom.cn[2];

        if (value) {
            label.for = me.getInputElId();
        } else {
            delete label.for;
        }

        me.update();
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
     * Triggered after the hideLabelValue config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetHideValueLabel(value, oldValue) {
        this.vdom.cn[2].removeDom = value;
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
        vdom.cn[2].id = me.getValueLabelId();

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
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetValueLabelText(value, oldValue) {
        let me = this;

        if (!me.hideValueLabel) {
            me.vdom.cn[2].innerHTML = value;
            me.update();
        }
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

        me._checked = checked; // silent update

        // keep the vdom & vnode in sync for future updates
        me.vdom.cn[1].checked = checked;
        me.vnode.childNodes[me.hideLabel ? 0 : 1].attributes.checked = `${checked}`;

        me.fire('change', {
            component: me,
            oldValue : !checked,
            value    : checked
        });
    }
}

Neo.applyClassConfig(CheckBox);

export default CheckBox;
