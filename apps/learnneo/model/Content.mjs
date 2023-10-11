import Model from '../../../src/data/Model.mjs';

/**
 * @class LearnNeo.model.Content
 * @extends Neo.data.Model
 */
class Content extends Model {
    static config = {
        /**
         * @member {String} className='LearnNeo.model.Content'
         * @protected
         */
        className: 'LearnNeo.model.Content',
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
            name: 'id',
            type: 'Integer'
        }, {
            name: 'isLeaf',
            type: 'Boolean'
        }, {
            name: 'name',
            type: 'String'
        }, {
            name: 'parentId',
            type: 'Integer'
        }, {
            name: 'path',
            type: 'String'
        }]
    }
}

Neo.applyClassConfig(Content);

export default Content;
