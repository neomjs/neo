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
         * @protected
         */
        layout: {ntype: 'hbox', align: 'center'}
    }}

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
        if (data.value) {
            console.log('onRadioChange', data.component.fieldValue);
        }
    }
}

Neo.applyClassConfig(BooleanContainer);

export {BooleanContainer as default};