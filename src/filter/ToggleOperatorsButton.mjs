import Button from '../component/Button.mjs';
import Filter from '../collection/Filter.mjs';

/**
 * @class Neo.filter.ToggleOperatorsButton
 * @extends Neo.component.Button
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
         * @member {String[]|null} operators_=null
         */
        operators_: null,
        /**
         * @member {String|null} value_=null
         */
        value_: null
    }}

    /**
     *
     * @param {Object} config
     */
    constructor(config) {
        super(config);

        let me = this;

        me.handler = me.onButtonClick;

        me.text = '==='; // todo
    }

    /**
     * Triggered after the value config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     */
    afterSetValue(value, oldValue) {
        if (oldValue !== undefined) {
            this.fire('change', {
                component: this,
                oldValue : oldValue,
                value    : value
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
     *
     * @param {Object} data
     */
    onButtonClick(data) {
        console.log('onButtonClick', data)
    }
}

Neo.applyClassConfig(ToggleOperatorsButton);

export {ToggleOperatorsButton as default};