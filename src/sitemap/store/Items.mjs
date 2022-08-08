import ItemModel from '../model/Item.mjs';
import Store     from '../../data/Store.mjs';

/**
 * @class Neo.sitemap.store.Items
 * @extends Neo.data.Store
 */
class Items extends Store {
    static getConfig() {return {
        /*
         * @member {String} className='Neo.sitemap.store.Items'
         * @protected
         */
        className: 'Neo.sitemap.store.Items',
        /*
         * @member {Neo.data.Model} model=ItemModel
         */
        model: ItemModel
    }}
}

Neo.applyClassConfig(Items);

export default Items;
