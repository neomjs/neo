import {default as Container} from '../container/Base.mjs';
import Radio                  from '../form/field/Radio.mjs';

/**
 * @class Neo.filter.BooleanContainer
 * @extends Neo.container.Base
 */
class BooleanContainer extends Container {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.filter.BooleanContainer'
         * @protected
         */
        className: 'Neo.filter.BooleanContainer',
        /**
         * @member {String} ntype='filter-booleancontainer'
         * @protected
         */
        ntype: 'filter-booleancontainer',
        /**
         * @member {Array} cls=['neo-filter-booleancontainer']
         */
        cls: ['neo-filter-booleancontainer'],
        /**
         * @member {Object} layout={ntype: 'hbox', align: 'center'}
         */
        layout: {ntype: 'hbox', align: 'center'},
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
    afterSetValue(value, oldValue) {console.log(value, oldValue);
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

        const defaults = {
            module        : Radio,
            hideLabel     : true,
            hideValueLabel: false,
            listeners     : {change: me.onRadioChange, scope: me},
            name          : me.id
        };

        me.items = [{
            ...defaults,
            fieldValue    : true,
            valueLabelText: '<i class="fa fa-check"></i>'
        }, {
            ...defaults,
            fieldValue    : false,
            valueLabelText: '<i class="fa fa-times"></i>'
        }, {
            ...defaults,
            fieldValue    : null,
            valueLabelText: '<i class="fa fa-check"></i> <i class="fa fa-times"></i>'
        }];

        super.createItems();
    }

    /**
     *
     * @param {Object} data
     */
    onRadioChange(data) {
        if (data.value) {console.log(data.component.fieldValue);
            this.value = data.component.fieldValue;
        }
    }
}

Neo.applyClassConfig(BooleanContainer);

export {BooleanContainer as default};