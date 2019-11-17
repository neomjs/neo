import Base                          from './Base.mjs';
import {default as ComponentManager} from '../../manager/Component.mjs'

/**
 * @class Neo.form.field.CheckBox
 * @extends Neo.form.field.Base
 */
class CheckBox extends Base {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.form.field.CheckBox'
         * @private
         */
        className: 'Neo.form.field.CheckBox',
        /**
         * @member {String} ntype='checkboxfield'
         * @private
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
        _vdom: {
            cn: [{
                tag: 'label',
                cls: ['neo-checkbox-label']
            }, {
                tag: 'input',
                cls: ['neo-checkbox-input']
            }, {
                tag: 'label',
                cls: ['neo-checkbox-value-label']
            }]
        }
    }}

    /**
     *
     * @param {Object} config
     */
    constructor(config) {
        super(config);

        let me           = this,
            domListeners = Neo.clone(me.domListeners, true),
            vdom         = me.vdom,
            inputEl      = vdom.cn[1];

        inputEl.id = me.id + '-input';
        me.vdom = vdom;

        domListeners.push({
            change: {
                fn   : me.onInputValueChange,
                scope: me
            }
        });

        me.domListeners = domListeners;
    }

    /**
     *
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @private
     */
    afterSetChecked(value, oldValue) {
        let me   = this,
            vdom = me.vdom;

        vdom.cn[1].checked = value;
        me.vdom = vdom;

        if (oldValue !== undefined) {
            me.fire('change', {
                oldValue: value,
                value   : oldValue
            });
        }
    }

    /**
     *
     * @param {String} value
     * @param {String} oldValue
     * @private
     */
    afterSetHideLabel(value) {
        let vdom = this.vdom;

        vdom.cn[0].removeDom = value;
        this.vdom = vdom;
    }

    /**
     *
     * @param {String} value
     * @param {String} oldValue
     * @private
     */
    afterSetHideValueLabel(value) {
        let vdom = this.vdom;

        vdom.cn[2].removeDom = value;
        this.vdom = vdom;
    }

    /**
     *
     * @param {String} value
     * @param {String} oldValue
     * @private
     */
    afterSetInputType(value) {
        let vdom = this.vdom;

        vdom.cn[1].type = value;
        this.vdom = vdom;
    }

    /**
     *
     * @param {String} value
     * @param {String} oldValue
     * @private
     */
    afterSetLabelText(value) {
        let vdom = this.vdom;

        vdom.cn[0].innerHTML = value;
        this.vdom = vdom;
    }

    /**
     *
     * @param {Number|String} value
     * @param {Number|String} oldValue
     * @private
     */
    afterSetLabelWidth(value) {
        let me   = this,
            vdom = me.vdom;

        if (!me.hideLabel) {
            vdom.cn[0].width = value;
            me.vdom = vdom;
        }
    }

    /**
     *
     * @param {String} value
     * @param {String} oldValue
     * @private
     */
    afterSetName(value) {
        let vdom = this.vdom;

        vdom.cn[1].name = value;
        this.vdom = vdom;
    }

    /**
     *
     * @param {String} value
     * @param {String} oldValue
     * @private
     */
    afterSetValue(value, oldValue) {
        if (value) {
            let vdom = this.vdom;

            vdom.cn[1].value = value;
            this.vdom = vdom;
        }

        super.afterSetValue(value, oldValue);
    }

    /**
     *
     * @param {String} value
     * @param {String} oldValue
     * @private
     */
    afterSetValueLabelText(value) {
        let me   = this,
            vdom = me.vdom;

        if (!me.hideValueLabel) {
            vdom.cn[2].innerHTML = value;
            me.vdom = vdom;
        }
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
        me.vnode.childNodes[1].attributes.checked = checked + '';

        me.fire('change', {
            oldValue: !checked,
            value   : checked
        });
    }
}

Neo.applyClassConfig(CheckBox);

export {CheckBox as default};