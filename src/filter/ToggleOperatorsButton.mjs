import Button from '../button/Base.mjs';
import Filter from '../collection/Filter.mjs';

/**
 * @class Neo.filter.ToggleOperatorsButton
 * @extends Neo.button.Base
 */
class ToggleOperatorsButton extends Button {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.filter.ToggleOperatorsButton'
         * @protected
         */
        className: 'Neo.filter.ToggleOperatorsButton',
        /**
         * @member {String} ntype='filter-toggleoperatorsbutton'
         * @protected
         */
        ntype: 'filter-toggleoperatorsbutton',
        /**
         * @member {String[]} operators_=['===', '>', '<']
         */
        operators_: ['===', '>', '<'],
        /**
         * @member {String|null} value_=null
         */
        value_: null
    }}

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        me.handler = me.onButtonClick;

        me.text = me.value || me.operators[0];
    }

    /**
     * Triggered after the value config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     */
    afterSetValue(value, oldValue) {
        if (oldValue !== undefined) {
            let me = this;

            me.text = value;

            me.fire('change', {
                component: me,
                oldValue,
                value
            });
        }
    }

    /**
     * Triggered before the operators config gets changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    beforeSetOperators(value, oldValue) {
        if (Array.isArray(value)) {
            let i   = 0,
                len = value.length;

            for (; i < len; i++) {
                if (this.beforeSetEnumValue(value[i], oldValue, 'operators', Filter.operators) !== value[i]) {
                    return oldValue;
                }
            }
        }

        return value;
    }

    /**
     * @param {Object} data
     */
    onButtonClick(data) {
        let me    = this,
            index = (me.operators.indexOf(data.component.text) + 1) % me.operators.length;

        me.value = me.operators[index];
    }
}

Neo.applyClassConfig(ToggleOperatorsButton);

export default ToggleOperatorsButton;
