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
         * @member {Object} layout={ntype: 'hbox', align: 'stretch'}
         * @protected
         */
        layout: {ntype: 'hbox', align: 'stretch'}
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
            name          : me.id
        };

        me.items = [{
            ...defaults,
            valueLabelText: 'true'
        }, {
            ...defaults,
            valueLabelText: 'false'
        }, {
            ...defaults,
            valueLabelText: 'both'
        }];

        super.createItems();
    }
}

Neo.applyClassConfig(BooleanContainer);

export {BooleanContainer as default};