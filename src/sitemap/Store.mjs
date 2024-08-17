import BaseStore from '../data/Store.mjs';
import Model     from './Model.mjs';

/**
 * @class Neo.sitemap.Store
 * @extends Neo.data.Store
 */
class Store extends BaseStore {
    static config = {
        /*
         * @member {String} className='Neo.sitemap.Store'
         * @protected
         */
        className: 'Neo.sitemap.Store',
        /*
         * @member {Neo.data.Model} model=Model
         */
        model: Model
    }
}

export default Neo.setupClass(Store);
