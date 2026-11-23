import DateUtil from '../../util/Date.mjs';
import Event    from '../model/Event.mjs';
import Store    from '../../../src/data/Store.mjs';

/**
 * @summary Event store for calendar views with single-day and date-range all-day lookups.
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
         * @reactive
         */
        model: Event,
        /**
         * The event related algorithms rely on the startDate based sorting
         * @member {Object[]} sorters
         */
        sorters: [{
            property             : 'startDate',
            direction            : 'ASC',
            reapplyOnRecordChange: true
        }]
    }

    /**
     * @summary Returns all-day event records overlapping the inclusive `[startDate, endDate]` day range, sorted by `startDate` ascending.
     * Both the `[startDate, endDate]` query bounds and each event's `endDate` are compared as inclusive `yyyy-mm-dd` calendar days.
     * @param {Date} startDate Inclusive range start day
     * @param {Date} endDate Inclusive range end day
     * @returns {Neo.calendar.model.Event[]}
     */
    getAllDayRecords(startDate, endDate) {
        if (!startDate || !endDate) {
            return []
        }

        let me         = this,
            rangeStart = DateUtil.convertToyyyymmdd(startDate),
            rangeEnd   = DateUtil.convertToyyyymmdd(endDate),
            records    = [],
            i          = 0,
            len        = me.getCount(),
            eventEnd, eventStart, record;

        if (rangeEnd < rangeStart) {
            return records
        }

        for (; i < len; i++) {
            record = me.getAt(i);

            if (record.allDay && record.startDate && record.endDate) {
                eventStart = DateUtil.convertToyyyymmdd(record.startDate);
                eventEnd   = DateUtil.convertToyyyymmdd(record.endDate);

                if (eventStart <= rangeEnd && eventEnd >= rangeStart) {
                    records.push(record)
                }
            }
        }

        return records.sort((a, b) => a.startDate - b.startDate)
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
            record = me.getAt(i);

            if (DateUtil.matchDate(date, record.startDate)) {
                if (DateUtil.matchDate(date, record.endDate)) {
                    dayRecords.push(record);
                }
            }
        }

        return dayRecords;
    }
}

export default Neo.setupClass(Events);
