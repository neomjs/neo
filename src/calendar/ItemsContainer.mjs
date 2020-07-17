import {default as Container}     from '../container/Base.mjs';
import {default as CalendarStore} from './store/Calendars.mjs';

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
         * @member {Neo.data.Store} store_=CalendarStore
         * @protected
         */
        store_: CalendarStore
    }}
}

Neo.applyClassConfig(ItemsContainer);

export {ItemsContainer as default};