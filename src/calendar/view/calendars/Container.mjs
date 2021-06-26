import BaseContainer from '../../../container/Base.mjs';
import List          from './List.mjs';

/**
 * @class Neo.calendar.view.calendars.Container
 * @extends Neo.container.Base
 */
class Container extends BaseContainer {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.calendar.view.calendars.Container'
         * @protected
         */
        className: 'Neo.calendar.view.calendars.Container',
        /**
         * @member {String} ntype='calendar-calendars-container'
         * @protected
         */
        ntype: 'calendar-calendars-container',
        /**
         * @member {Object} bind
         */
        bind: {
            calendarStore: 'stores.calendars'
        },
        /**
         * @member {Neo.calendar.store.Calendars|null} calendarStore_=null
         */
        calendarStore: null,
        /**
         * @member {String[]} cls=['neo-calendar-calendarscontainer', 'neo-container']
         */
        cls: ['neo-calendar-calendarscontainer', 'neo-container'],
        /**
         * @member {Array} items
         */
        items: [{
            module: List
        }],
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         * @protected
         */
        layout: {ntype: 'vbox', align: 'stretch'}
    }}
}

Neo.applyClassConfig(Container);

export {Container as default};
