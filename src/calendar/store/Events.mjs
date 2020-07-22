import Event from '../model/Calendar.mjs';
import Store from '../../../src/data/Store.mjs';

/**
 * @class Neo.calendar.store.Events
 * @extends Neo.data.Store
 */
class Events extends Store {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.calendar.store.Events'
         * @protected
         */
        className: 'Neo.calendar.store.Events',
        /**
         * @member {String} keyProperty='id'
         * @protected
         */
        keyProperty: 'id',
        /**
         * @member {Neo.data.Model} model=Event
         * @protected
         */
        model: Event,
        /**
         * @member {Object[]} sorters
         * @protected
         */
        sorters: [{
            property : 'startDate',
            direction: 'ASC'
        }]
    }}
}

Neo.applyClassConfig(Events);

export {Events as default};