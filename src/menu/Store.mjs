import Model     from './Model.mjs';
import BaseStore from '../../src/data/Store.mjs';

/**
 * @class Neo.menu.Store
 * @extends Neo.data.Store
 */
class Store extends BaseStore {
    static config = {
        /**
         * @member {String} className='Neo.menu.Store'
         * @protected
         */
        className: 'Neo.menu.Store',
        /**
         * @member {Neo.menu.Model} model=Model
         */
        model: Model
    }
}

export default Neo.setupClass(Store);
