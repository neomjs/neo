import {default as Container} from '../container/Base.mjs';
import Number                 from '../form/field/Number.mjs';
import ToggleOperatorsButton  from './ToggleOperatorsButton.mjs';

/**
 * @class Neo.filter.NumberContainer
 * @extends Neo.container.Base
 */
class NumberContainer extends Container {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.filter.NumberContainer'
         * @protected
         */
        className: 'Neo.filter.NumberContainer',
        /**
         * @member {String} ntype='filter-numbercontainer'
         * @protected
         */
        ntype: 'filter-numbercontainer',
        /**
         * Pass config to the ToggleOperatorsButton
         * @member {Object|null} buttonConfig=null
         */
        buttonConfig: null,
        /**
         * @member {Array} cls=['neo-filter-numbercontainer']
         */
        cls: ['neo-filter-numbercontainer'],
        /**
         * @member {Object} layout={ntype: 'hbox', align: 'center'}
         */
        layout: {ntype: 'hbox', align: 'center'},
        /**
         * Pass config to the Number Field
         * @member {Object|null} numberFieldConfig=null
         */
        numberFieldConfig: null,
        /**
         * @member {Boolean|null} value_=null
         */
        value_: null
    }}

    /**
     * Triggered after the value config got changed
     * @param {Boolean|null} value
     * @param {Boolean|null} oldValue
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
     */
    createItems() {
        let me = this;

        me.items = [{
            module: ToggleOperatorsButton,
            ...me.buttonConfig || {}
        }, {
            module   : Number,
            flex     : '1 1 auto',
            hideLabel: true,
            listeners: {change: me.onNumberFieldChange, scope: me},
            ...me.numberFieldConfig || {}
        }];

        super.createItems();
    }

    /**
     *
     * @param {Object} data
     */
    onNumberFieldChange(data) {
        this.value = data.component.value;
    }
}

Neo.applyClassConfig(NumberContainer);

export {NumberContainer as default};