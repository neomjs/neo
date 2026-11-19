import PersonModel from './PersonModel.mjs';
import Store       from '../../../src/data/Store.mjs';

/**
 * @summary The team wall: the 15 portraits `list/animate` loads, sorted by `order`.
 * @class Neo.examples.list.reorder.PersonStore
 * @extends Neo.data.Store
 */
class PersonStore extends Store {
    static config = {
        /**
         * @member {String} className='Neo.examples.list.reorder.PersonStore'
         * @protected
         */
        className: 'Neo.examples.list.reorder.PersonStore',
        /**
         * @member {Boolean} autoLoad=true
         */
        autoLoad: true,
        /**
         * @member {Neo.data.Model} model=PersonModel
         */
        model: PersonModel,
        /**
         * @member {Object[]} sorters
         */
        sorters: [{property: 'order', reapplyOnRecordChange: true}],
        /**
         * @member {String} url
         */
        url: '../../resources/examples/data/circles/group1.json'
    }
}

export default Neo.setupClass(PersonStore);
