import {default as Container}     from '../../container/Base.mjs';
import {default as CalendarStore} from './../store/Calendars.mjs';
import {default as CheckBoxField} from '../../form/field/CheckBox.mjs';

/**
 * @class Neo.calendar.view.CalendarsContainer
 * @extends Neo.container.Base
 */
class CalendarsContainer extends Container {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.calendar.view.CalendarsContainer'
         * @protected
         */
        className: 'Neo.calendar.view.CalendarsContainer',
        /**
         * @member {String} ntype='calendar-calendarscontainer'
         * @protected
         */
        ntype: 'calendar-calendarscontainer',
        /**
         * @member {String[]} cls=['neo-calendar-calendarscontainer', 'neo-container']
         */
        cls: ['neo-calendar-calendarscontainer', 'neo-container'],
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
        this.items = [{
            checked       : true,
            valueLabelText: 'Calendar 1'
        }, {
            checked       : true,
            valueLabelText: 'Calendar 2'
        }];
    }
}

Neo.applyClassConfig(CalendarsContainer);

export {CalendarsContainer as default};