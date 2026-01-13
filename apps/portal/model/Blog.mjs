import Model from '../../../src/data/Model.mjs';

/**
 * @class Portal.model.Blog
 * @extends Neo.data.Model
 */
class Blog extends Model {
    static config = {
        /**
         * @member {String} className='Portal.model.Blog'
         * @protected
         */
        className: 'Portal.model.Blog',
        /**
         * @member {Object[]} fields
         */
        fields: [{
            name        : 'collapsed',
            type        : 'Boolean',
            defaultValue: true
        }, {
            name: 'name',
            type: 'String'
        }, {
            name: 'path',
            type: 'String'
        }, {
            name        : 'isLeaf',
            type        : 'Boolean',
            defaultValue: true
        }, {
            name        : 'parentId',
            type        : 'String',
            defaultValue: null
        }, {
            // Computed field for TreeList display
            name: 'treeNodeName',
            type: 'String',
            /**
             * @param {Object} data
             * @param {String} data.name
             * @returns {String}
             */
            calculate({name}) {
                return name
            }
        }, {
            name: 'id',
            type: 'String'
        }]
    }
}

export default Neo.setupClass(Blog);
