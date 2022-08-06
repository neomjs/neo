import Model from '../../data/Model.mjs';

/**
 * @class Neo.sitemap.model.Item
 * @extends Neo.data.Model
 */
class Item extends Model {
    static getConfig() {return {
        /*
         * @member {String} className='Neo.sitemap.model.Item'
         * @protected
         */
        className: 'Neo.sitemap.model.Item',
        /*
         * @member {Object[]} fields
         */
        fields: [{
            name: 'id',
            type: 'String'
        }]
    }}
}

Neo.applyClassConfig(Item);

export default Item;
