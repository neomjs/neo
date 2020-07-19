import {default as Container}     from '../container/Base.mjs';
import {default as CalendarStore} from './store/Calendars.mjs';
import {default as CheckBoxField} from '../form/field/CheckBox.mjs';

/**
 * @class Neo.calendar.ItemsContainer
 * @extends Neo.container.Base
 */
class ItemsContainer extends Container {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.calendar.ItemsContainer'
         * @protected
         */
        className: 'Neo.calendar.ItemsContainer',
        /**
         * @member {String} ntype='calendar-itemscontainer'
         * @protected
         */
        ntype: 'calendar-itemscontainer',
        /**
         * @member {String[]} cls=['neo-calendar-itemscontainer', 'neo-container']
         */
        cls: ['neo-calendar-itemscontainer', 'neo-container'],
        /**
         * @member {Object} itemDefaults
         * @protected
         */
        itemDefaults: {
            module        : CheckBoxField,
            flex          : 'none',
            hideLabel     : true,
            hideValueLabel: false,
        },
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         * @protected
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * @member {Neo.data.Store} store_=CalendarStore
         * @protected
         */
        store_: CalendarStore
    }}

    /**
     *
     * @param config
     */
    constructor(config) {
        super(config);
        this.onStoreLoad(); // todo
    }

    /**
     *
     */
    onStoreLoad() {
        console.log('onStoreLoad');

        this.items = [{
            checked       : true,
            valueLabelText: 'Calendar 1'
        }, {
            checked       : true,
            valueLabelText: 'Calendar 2'
        }];
    }
}

Neo.applyClassConfig(ItemsContainer);

export {ItemsContainer as default};