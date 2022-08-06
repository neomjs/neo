import Model from '../../data/Model.mjs';

/**
 * @class Neo.sitemap.model.Group
 * @extends Neo.data.Model
 */
class Group extends Model {
    static getConfig() {return {
        /*
         * @member {String} className='Neo.sitemap.model.Group'
         * @protected
         */
        className: 'Neo.sitemap.model.Group',
        /*
         * @member {Object[]} fields
         */
        fields: [{
            name: 'id',
            type: 'String'
        }]
    }}
}

Neo.applyClassConfig(Group);

export default Group;
