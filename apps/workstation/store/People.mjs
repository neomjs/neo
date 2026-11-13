import Store    from '../../../src/data/Store.mjs';
import {people} from './plan.mjs';

/**
 * @summary The team of the planning arrangement: one record per person, one row of the schedule each.
 *
 * A work item's `resourceId` names its person by this store's key.
 *
 * @class Workstation.store.People
 * @extends Neo.data.Store
 */
class People extends Store {
    static config = {
        /**
         * @member {String} className='Workstation.store.People'
         * @protected
         */
        className: 'Workstation.store.People',
        /**
         * @member {String} keyProperty='id'
         */
        keyProperty: 'id',
        /**
         * @member {Object} model
         */
        model: {
            fields: [
                {name: 'id',   type: 'String'},
                {name: 'name', type: 'String'},
                {name: 'role', type: 'String'}
            ]
        }
    }

    /**
     * @summary Seeds the team once, unless records were passed in.
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        if (!this.getCount()) {
            this.add(people.map(person => ({...person})))
        }
    }
}

export default Neo.setupClass(People);
