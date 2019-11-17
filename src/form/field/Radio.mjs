import CheckBox                      from './CheckBox.mjs';
import {default as ComponentManager} from '../../manager/Component.mjs'

/**
 * @class Neo.form.field.Radio
 * @extends Neo.form.field.CheckBox
 */
class Radio extends CheckBox {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.form.field.Radio'
         * @private
         */
        className: 'Neo.form.field.Radio',
        /**
         * @member {String} ntype='radiofield'
         * @private
         */
        ntype: 'radiofield',
        /**
         * @member {Array} cls=['neo-radiofield']
         */
        cls: ['neo-radiofield'],
        /**
         * @member {String} inputType='radio'
         */
        inputType: 'radio',
        /**
         * @member {Object} _vdom
         */
        _vdom: {
            cn: [{
                tag: 'label',
                cls: ['neo-radio-label']
            }, {
                tag: 'input',
                cls: ['neo-radio-input']
            }, {
                tag: 'label',
                cls: ['neo-radio-value-label']
            }]
        }
    }}

    /**
     *
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @private
     */
    afterSetChecked(value, oldValue) {
        super.afterSetChecked(value, oldValue);

        // update radios with the same name to be unchecked
        if (value) {
            this.uncheckGroupItems();
        }
    }

    /**
     * Gets triggered when a user checks a radio input.
     * @param {Object} data
     */
    onInputValueChange(data) {
        super.onInputValueChange(data);
        this.uncheckGroupItems();
    }

    /**
     * Radios do not fire a change event for "uncheck", so we need to iterate over other radios with the same name.
     */
    uncheckGroupItems() {
        let me = this,
            radios;

        // discuss: we could limit this to radios inside the same form, IF a top level form is used
        radios = ComponentManager.find({
            ntype: 'radiofield',
            name : me.name
        });

        radios.forEach(item => {
            if (item.id !== me.id && item._checked) {
                item._checked = false; // silent update

                // keep the vdom & vnode in sync for future updates
                item.vdom.cn[1].checked = false;
                item.vnode.childNodes[1].attributes.checked = 'false';

                item.fire('change', {
                    oldValue: true,
                    value   : false
                });
            }
        });
    }
}

Neo.applyClassConfig(Radio);

export {Radio as default};