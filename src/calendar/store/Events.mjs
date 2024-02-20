import DateUtil from '../../util/Date.mjs';
import Event    from '../model/Event.mjs';
import Store    from '../../../src/data/Store.mjs';

/**
 * @class Neo.calendar.store.Events
 * @extends Neo.data.Store
 */
class Events extends Store {
    static config = {
        /**
         * @member {String} className='Neo.calendar.store.Events'
         * @protected
         */
        className: 'Neo.calendar.store.Events',
        /**
         * @member {String} keyProperty='id'
         */
        keyProperty: 'id',
        /**
         * @member {Neo.data.Model} model=Event
         */
        model: Event,
        /**
         * The event related algorithms rely on the startDate based sorting
         * @member {Object[]} sorters
         */
        sorters: [{
            property : 'startDate',
            direction: 'ASC'
        }]
    }

    /**
     * @param {Date} date
     * @returns {Neo.calendar.model.Event[]}
     */
    getDayRecords(date) {
        let me         = this,
            dayRecords = [],
            i          = 0,
            len        = me.getCount(),
            record;

        for (; i < len; i++) {
            record = me.items[i];

            if (DateUtil.matchDate(date, record.startDate)) {
                if (DateUtil.matchDate(date, record.endDate)) {
                    dayRecords.push(record);
                }
            }
        }

        return dayRecords;
    }
}

Neo.setupClass(Events);

export default Events;
