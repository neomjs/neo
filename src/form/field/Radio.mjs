import CheckBox         from './CheckBox.mjs';
import ComponentManager from '../../manager/Component.mjs';

/**
 * @class Neo.form.field.Radio
 * @extends Neo.form.field.CheckBox
 */
class Radio extends CheckBox {
    static config = {
        /**
         * @member {String} className='Neo.form.field.Radio'
         * @protected
         */
        className: 'Neo.form.field.Radio',
        /**
         * @member {String} ntype='radiofield'
         * @protected
         */
        ntype: 'radiofield',
        /**
         * @member {String[]} baseCls=['neo-radiofield','neo-checkboxfield']
         */
        baseCls: ['neo-radiofield', 'neo-checkboxfield'],
        /**
         * @member {String[]} iconCls=['far','fa-circle']
         */
        iconCls: ['far', 'fa-circle'],
        /**
         * @member {String} inputType='radio'
         */
        inputType: 'radio'
    }

    /**
     * Triggered after the checked config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetChecked(value, oldValue) {
        super.afterSetChecked(value, oldValue);

        // update radios with the same name to be unchecked
        value && this.uncheckGroupItems()
    }

    /**
     * Radios should only fire change & fieldChange events if checked.
     * If there was just 1 radio, you can not uncheck it.
     * @param {*} value
     * @param {*} oldValue
     */
    fireChangeEvent(value, oldValue) {
        this.checked && super.fireChangeEvent(value, oldValue)
    }

    /**
     * @returns {String[]}
     */
    getGroupValue() {
        let value = super.getGroupValue();

        return value.length > 0 ? value[0] : []
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
                item.checked = false
            }
        })
    }
}

export default Neo.setupClass(Radio);
