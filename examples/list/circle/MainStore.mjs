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
            {id: 1, name: 'red'},
            {id: 2, name: 'pink'},
            {id: 3, name: 'orange'},
            {id: 4, name: 'yellow'},
            {id: 5, name: 'green'},
            {id: 6, name: 'blue'}
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
