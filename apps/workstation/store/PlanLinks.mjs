import DependencyStore   from '../../../src/gantt/DependencyStore.mjs';
import {releaseLinkRows} from './plan.mjs';

/**
 * @summary The release plan's links: finish-to-start dependencies between the tasks of `Workstation.store.PlanTasks`.
 *
 * @class Workstation.store.PlanLinks
 * @extends Neo.gantt.DependencyStore
 */
class PlanLinks extends DependencyStore {
    static config = {
        /**
         * @member {String} className='Workstation.store.PlanLinks'
         * @protected
         */
        className: 'Workstation.store.PlanLinks'
    }

    /**
     * @summary Seeds the links once, unless records were passed in.
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        if (!this.getCount()) {
            this.add(this.generateData())
        }
    }

    /**
     * @summary Builds one finish-to-start link record per plan row, keyed by its two task ids.
     * @returns {Object[]}
     */
    generateData() {
        return releaseLinkRows.map(([fromId, toId]) => ({id: `${fromId}--${toId}`, fromId, lagUnit: 'day', toId, type: 'FS'}))
    }
}

export default Neo.setupClass(PlanLinks);
