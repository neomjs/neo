import TaskStore                  from '../../../src/gantt/TaskStore.mjs';
import {planDay, releaseTaskRows} from './plan.mjs';

/**
 * @summary The release plan's task tree: four phases and their tasks, seeded around the plan day.
 *
 * @class Workstation.store.PlanTasks
 * @extends Neo.gantt.TaskStore
 */
class PlanTasks extends TaskStore {
    static config = {
        /**
         * @member {String} className='Workstation.store.PlanTasks'
         * @protected
         */
        className: 'Workstation.store.PlanTasks',
        /**
         * The plan day the seeded dates count from, midnight UTC. Null seeds around today.
         * @member {Date|null} baseDate=null
         */
        baseDate: null
    }

    /**
     * @summary Seeds the release plan once, unless records were passed in.
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
     * @summary Builds the task records from the plan's rows: a phase is a parent, its tasks are leaves, and a
     * milestone starts and ends on its day.
     * @param {Date} baseDate Midnight UTC of the plan day
     * @returns {Object[]}
     */
    generateData(baseDate) {
        const
            base     = baseDate.getTime(),
            msPerDay = 86_400_000,
            parents  = new Set(releaseTaskRows.map(row => row.parent));

        return releaseTaskRows.map(({days=0, milestone=false, parent, start, ...row}) => ({
            ...row,
            collapsed   : false,
            duration    : days,
            durationUnit: 'day',
            endDate     : new Date(base + (start + days) * msPerDay),
            isLeaf      : !parents.has(row.id),
            milestone,
            parentId    : parent,
            startDate   : new Date(base + start * msPerDay)
        }))
    }
}

export default Neo.setupClass(PlanTasks);
