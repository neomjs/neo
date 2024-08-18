import BaseStore from '../../../src/data/Store.mjs';
import Model     from './Model.mjs';

/**
 * @class Neo.examples.grid.covid.Store
 * @extends Neo.data.Store
 */
class Store extends BaseStore {
    static config = {
        /**
         * @member {String} className='Neo.examples.grid.covid.Store'
         * @protected
         */
        className: 'Neo.examples.grid.covid.Store',
        /**
         * @member {String} keyProperty='country'
         */
        keyProperty: 'country',
        /**
         * @member {Neo.data.Model} model=Model
         */
        model: Model,
        /**
         * @member {Object[]} sorters
         */
        sorters: [{
            property : 'active',
            direction: 'DESC'
        }]
    }
}

export default Neo.setupClass(Store);
