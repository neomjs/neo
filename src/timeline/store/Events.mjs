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

            if (!record || (filterRes && record.resourceId !== resourceId)) {
                continue
            }

            const
                recStart = record.startDate instanceof Date ? record.startDate.getTime() : new Date(record.startDate).getTime(),
                recEnd   = record.endDate   instanceof Date ? record.endDate.getTime()   : new Date(record.endDate).getTime();

            if (!Number.isFinite(recStart) || !Number.isFinite(recEnd)) {
                continue
            }

            // Zero-duration milestones match when [startMs, endMs) contains recStart;
            // positive-duration intervals match when recStart < endMs && recEnd > startMs (or contain the instant when startMs === endMs).
            const overlaps = recStart === recEnd
                ? (recStart >= startMs && recStart < endMs) || (startMs === endMs && recStart === startMs)
                : startMs === endMs
                    ? (recStart <= startMs && recEnd > startMs)
                    : (recStart < endMs && recEnd > startMs);

            if (overlaps) {
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
