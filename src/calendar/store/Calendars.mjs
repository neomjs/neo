import Calendar from '../model/Calendar.mjs';
import Store    from '../../../src/data/Store.mjs';

/**
 * @class Neo.calendar.store.Calendars
 * @extends Neo.data.Store
 */
class Calendars extends Store {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.calendar.store.Calendars'
         * @protected
         */
        className: 'Neo.calendar.store.Calendars',
        /**
         * @member {String} keyProperty='id'
         * @protected
         */
        keyProperty: 'id',
        /**
         * @member {Neo.data.Model} model=Calendar
         * @protected
         */
        model: Calendar,
        /**
         * @member {Object[]} sorters
         * @protected
         */
        sorters: [{
            property : 'name',
            direction: 'ASC'
        }]
    }}
}

Neo.applyClassConfig(Calendars);

export {Calendars as default};