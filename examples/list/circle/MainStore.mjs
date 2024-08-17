import MainModel from './MainModel.mjs';
import Store     from '../../../src/data/Store.mjs';

/**
 * @class Neo.examples.list.circle.MainStore
 * @extends Neo.data.Store
 */
class MainStore extends Store {
    static config = {
        /**
         * @member {String} className='Neo.examples.list.circle.MainStore'
         * @protected
         */
        className: 'Neo.examples.list.circle.MainStore',
        /**
         * @member {Object[]} data
         */
        data: [
            {id: 1, name: 'Red',    url: '../../resources/examples/data/circles/group1.json'},
            {id: 2, name: 'Pink',   url: '../../resources/examples/data/circles/group4.json'},
            {id: 3, name: 'Orange', url: '../../resources/examples/data/circles/group3.json'},
            {id: 4, name: 'Yellow', url: '../../resources/examples/data/circles/group1.json'},
            {id: 5, name: 'Green',  url: '../../resources/examples/data/circles/group2.json'},
            {id: 6, name: 'Blue',   url: '../../resources/examples/data/circles/group1.json'}
        ],
        /**
         * @member {Neo.data.Model} model=MainModel
         */
        model: MainModel,
        /**
         * @member {Object[]} sorters
         */
        sorters: [{
            property : 'name',
            direction: 'ASC'
        }]
    }
}

export default Neo.setupClass(MainStore);
