import {default as Container} from '../container/Base.mjs';
import Number                 from '../form/field/Number.mjs';

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
         * @member {Array} cls=['neo-filter-numbercontainer']
         */
        cls: ['neo-filter-numbercontainer'],
        /**
         * @member {Object} layout={ntype: 'hbox', align: 'center'}
         */
        layout: {ntype: 'hbox', align: 'center'},
        /**
         * Pass config to the Radio Fields
         * @member {Object|null} numberConfig=null
         */
        numberConfig: null,
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
            module: Number,
            listeners: {change: me.onNumberFieldChange, scope: me},
            ...numberConfig || {}
        }];

        super.createItems();
    }

    /**
     *
     * @param {Object} data
     */
    onNumberFieldChange(data) {
        if (data.value) {
            this.value = data.component.fieldValue;
        }
    }
}

Neo.applyClassConfig(NumberContainer);

export {NumberContainer as default};