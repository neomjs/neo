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
            name: 'disabled',
            type: 'Boolean'
        }, {
            name: 'groupId',
            type: 'Number'
        }, {
            name: 'id',
            type: 'Number'
        }, {
            name: 'level', // indentation
            type: 'Number'
        }, {
            name: 'name',
            type: 'String'
        }, {
            name: 'route',
            type: 'String'
        }, {
            name: 'url',
            type: 'String'
        }]
    }}
}

Neo.applyClassConfig(Item);

export default Item;
