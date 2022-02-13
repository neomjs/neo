import MainModel from './MainModel.mjs';
import Store     from '../../../src/data/Store.mjs';

/**
 * @class Neo.examples.list.circle.MainStore
 * @extends Neo.data.Store
 */
class MainStore extends Store {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.examples.list.circle.MainStore'
         * @protected
         */
        className: 'Neo.examples.list.circle.MainStore',
        /**
         * @member {Object[]} data
         */
        data: [
            {id: 1, name: 'red',    url: '../../resources/examples/data/circleContacts.json'},
            {id: 2, name: 'pink',   url: '../../resources/examples/data/circleContacts.json'},
            {id: 3, name: 'orange', url: '../../resources/examples/data/circleContacts.json'},
            {id: 4, name: 'yellow', url: '../../resources/examples/data/circleContacts.json'},
            {id: 5, name: 'green',  url: '../../resources/examples/data/circleContacts2.json'},
            {id: 6, name: 'blue',   url: '../../resources/examples/data/circleContacts.json'}
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
    }}
}

Neo.applyClassConfig(MainStore);

export default MainStore;
