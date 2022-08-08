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
            name: 'action',
            type: 'String'
        }, {
            name        : 'actionType',
            defaultValue: 'route',
            type        : 'String'
        }, {
            name: 'column',
            type: 'Number' // zero based
        }, {
            name: 'disabled',
            type: 'Boolean'
        }, {
            name: 'groupId',
            type: 'Number'
        }, {
            name: 'hidden',
            type: 'Boolean'
        }, {
            name: 'id',
            type: 'Number'
        }, {
            name: 'level', // indentation
            type: 'Number'
        }, {
            name: 'name',
            type: 'String'
        }]
    }}
}

Neo.applyClassConfig(Item);

export default Item;
