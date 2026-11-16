import EventStore              from '../../../src/timeline/store/Events.mjs';
import WorkItem                from '../model/WorkItem.mjs';
import {planDay, workItemRows} from './plan.mjs';

/**
 * @summary The work items of the planning arrangement: one store instance that every planning view shows.
 *
 * An event store, so the schedule's range queries run on it unchanged; its records also carry the board's
 * `status` and `order`. The root provider creates it once and the panes borrow it, so moving a bar or a card
 * is one `record.set()` on a record every view and every window reads.
 *
 * @class Workstation.store.WorkItems
 * @extends Neo.timeline.store.Events
 */
class WorkItems extends EventStore {
    static config = {
        /**
         * @member {String} className='Workstation.store.WorkItems'
         * @protected
         */
        className: 'Workstation.store.WorkItems',
        /**
         * The plan day the seeded dates count from, midnight UTC. Null seeds around today.
         * @member {Date|null} baseDate=null
         */
        baseDate: null,
        /**
         * @member {String} keyProperty='id'
         */
        keyProperty: 'id',
        /**
         * @member {Neo.data.Model} model=WorkItem
         */
        model: WorkItem,
        /**
         * No store order. A sort fires `load`, and a board re-projects every column on `load`; each view orders
         * its own records, the schedule by time and the board by `order`.
         * @member {Object[]} sorters=[]
         */
        sorters: []
    }

    /**
     * @summary Seeds the plan once, unless records were passed in.
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        me.baseDate ??= planDay();

        if (!me.getCount()) {
            me.add(me.generateData(me.baseDate))
        }
    }

    /**
     * @summary Builds the work items from the plan's rows: dates from day offsets, and an `order` that numbers
     * each status column in steps of 1000, the gaps a board's move ranks into.
     * @param {Date} baseDate Midnight UTC of the plan day
     * @returns {Object[]}
     */
    generateData(baseDate) {
        const
            base     = baseDate.getTime(),
            msPerDay = 86_400_000,
            ranks    = {};

        return workItemRows.map(({days, person, start, ...row}) => {
            ranks[row.status] = (ranks[row.status] ?? 0) + 1000;

            return {
                ...row,
                endDate   : new Date(base + (start + days) * msPerDay),
                order     : ranks[row.status],
                resourceId: person,
                startDate : new Date(base + start * msPerDay)
            }
        })
    }
}

export default Neo.setupClass(WorkItems);
