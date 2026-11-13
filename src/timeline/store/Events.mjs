import EventModel from '../model/Event.mjs';
import Store      from '../../data/Store.mjs';

/**
 * @summary Shared timeline event store with interval range queries.
 * @description Extends `Neo.data.Store` with `Neo.timeline.model.Event` and provides
 * `getRangeRecords(start, end, resourceId)` (plus static `Events.getRangeRecords(store, start, end, resourceId)`)
 * to query all single-day, multi-day, and zero-duration milestone records whose `[startDate, endDate)` interval
 * intersects `[start, end)`. Range queries scan linearly and `Neo.timeline.util.IntervalPacker` sorts its own working
 * copy, so shared stores that are unsorted or sorted by another domain field work without requiring ascending
 * `startDate`.
 * @class Neo.timeline.store.Events
 * @extends Neo.data.Store
 */
class Events extends Store {
    /**
     * @summary Compares resource identifiers across numeric model keys and string DOM values.
     * Null and undefined represent an absent key; an empty string remains distinct.
     * @param {*} a
     * @param {*} b
     * @returns {Boolean}
     */
    static sameResourceId(a, b) {
        return a == null || b == null ? a == null && b == null : String(a) === String(b)
    }

    /**
     * @summary Tests millisecond bounds against a half-open window, including milestones and point queries.
     * @param {Number} start Event start
     * @param {Number} end Event end
     * @param {Number} windowStart Window start
     * @param {Number} windowEnd Window end
     * @returns {Boolean}
     */
    static intersectsRange(start, end, windowStart, windowEnd) {
        if (!Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(windowStart) ||
            !Number.isFinite(windowEnd) || windowEnd < windowStart) return false;

        if (start === end) {
            return start >= windowStart && (start < windowEnd || windowStart === windowEnd && start === windowStart)
        }
        if (windowStart === windowEnd) return start <= windowStart && end > windowStart;
        return start < windowEnd && end > windowStart
    }

    static config = {
        /**
         * @member {String} className='Neo.timeline.store.Events'
         * @protected
         */
        className: 'Neo.timeline.store.Events',
        /**
         * @member {String} keyProperty='id'
         */
        keyProperty: 'id',
        /**
         * @member {Neo.data.Model} model=EventModel
         * @reactive
         */
        model: EventModel,
        /**
         * Default chronological ordering by `startDate` (`ASC`). Note that `getRangeRecords()` scans linearly and
         * `IntervalPacker.pack()` sorts its own working copy, so shared stores may omit or override `sorters`.
         * @member {Object[]} sorters
         */
        sorters: [{
            property : 'startDate',
            direction: 'ASC'
        }]
    }

    /**
     * @summary Returns all records in `store` whose `[startDate, endDate)` interval intersects `[start, end)`.
     * @param {Neo.data.Store} store Store instance exposing `getCount()` and `getAt(index)`
     * @param {Date|Number|String} start Range start (inclusive)
     * @param {Date|Number|String} end Range end (exclusive for positive-duration intervals)
     * @param {String|Number|null} [resourceId=null] Optional resourceId filter for Scheduler rows
     * @returns {Neo.data.Model[]}
     */
    static getRangeRecords(store, start, end, resourceId=null) {
        if (!store || typeof store.getCount !== 'function') {
            return []
        }

        const
            startMs   = start instanceof Date ? start.getTime() : new Date(start).getTime(),
            endMs     = end   instanceof Date ? end.getTime()   : new Date(end).getTime(),
            filterRes = resourceId !== null && resourceId !== undefined,
            result    = [],
            count     = store.getCount();

        if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
            return result
        }

        for (let i = 0; i < count; i++) {
            const record = store.getAt(i);

            if (!record || (filterRes && !Events.sameResourceId(record.resourceId, resourceId))) {
                continue
            }

            const
                recStart = record.startDate instanceof Date ? record.startDate.getTime() : new Date(record.startDate).getTime(),
                recEnd   = record.endDate   instanceof Date ? record.endDate.getTime()   : new Date(record.endDate).getTime();

            if (Events.intersectsRange(recStart, recEnd, startMs, endMs)) {
                result.push(record)
            }
        }

        return result
    }

    /**
     * @summary Returns all records whose `[startDate, endDate)` interval intersects `[start, end)`.
     * @param {Date|Number|String} start Range start (inclusive)
     * @param {Date|Number|String} end Range end (exclusive for positive-duration intervals)
     * @param {String|Number|null} [resourceId=null] Optional resourceId filter for Scheduler rows
     * @returns {Neo.timeline.model.Event[]}
     */
    getRangeRecords(start, end, resourceId=null) {
        return Events.getRangeRecords(this, start, end, resourceId)
    }
}

export default Neo.setupClass(Events);
