import Calendar from '../model/Calendar.mjs';
import Store    from '../../../src/data/Store.mjs';

/**
 * @class Neo.calendar.store.Calendars
 * @extends Neo.data.Store
 */
class Calendars extends Store {
    static config = {
        /**
         * @member {String} className='Neo.calendar.store.Calendars'
         * @protected
         */
        className: 'Neo.calendar.store.Calendars',
        /**
         * @member {String} keyProperty='id'
         */
        keyProperty: 'id',
        /**
         * @member {Neo.data.Model} model=Calendar
         */
        model: Calendar,
        /**
         * @member {Object[]} sorters
         */
        sorters: [{
            property : 'name',
            direction: 'ASC'
        }]
    }
}

Neo.setupClass(Calendars);

export default Calendars;
