import Button from '../component/Button.mjs';

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
         * @member {String|null} value_=null
         */
        value_: null
    }}

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
     *
     * @param {Object} data
     */
    onButtonClick(data) {
        console.log('onButtonClick', data)
    }
}

Neo.applyClassConfig(ToggleOperatorsButton);

export {ToggleOperatorsButton as default};