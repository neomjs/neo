import Model from '../../../src/data/Model.mjs';

/**
 * @class DevIndex.model.Content
 * @extends Neo.data.Model
 */
class Content extends Model {
    static config = {
        /**
         * @member {String} className='DevIndex.model.Content'
         * @protected
         */
        className: 'DevIndex.model.Content',
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
