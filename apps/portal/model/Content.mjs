import Model from '../../../src/data/Model.mjs';

/**
 * @class Portal.model.Content
 * @extends Neo.data.Model
 */
class Content extends Model {
    static config = {
        /**
         * @member {String} className='Portal.model.Content'
         * @protected
         */
        className: 'Portal.model.Content',
        /**
         * @member {Object[]} fields
         */
        fields: [{
            name: 'className',
            type: 'String'
        }, {
            name: 'collapsed',
            type: 'Boolean'
        }, {
            name: 'hidden',
            type: 'Boolean'
        }, {
            name: 'id',
            type: 'String'
        }, {
            name        : 'isLeaf',
            type        : 'Boolean',
            defaultValue: true
        }, {
            name: 'name',
            type: 'String'
        }, {
            name: 'parentId',
            type: 'String'
        }]
    }
}

export default Neo.setupClass(Content);
