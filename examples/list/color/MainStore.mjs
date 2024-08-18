import MainModel from './MainModel.mjs';
import Store     from '../../../src/data/Store.mjs';

/**
 * @class Neo.examples.list.color.MainStore
 * @extends Neo.data.Store
 */
class MainStore extends Store {
    static config = {
        /**
         * @member {String} className='Neo.examples.list.color.MainStore'
         * @protected
         */
        className: 'Neo.examples.list.color.MainStore',
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
        model: MainModel
    }
}

export default Neo.setupClass(MainStore);
