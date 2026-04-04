import Model from '../../src/data/Model.mjs';

/**
 * @class Neo.ai.graph.NodeModel
 * @extends Neo.data.Model
 */
class NodeModel extends Model {
    static config = {
        /**
         * @member {String} className='Neo.ai.graph.NodeModel'
         * @protected
         */
        className: 'Neo.ai.graph.NodeModel',
        /**
         * @member {Object[]} fields
         */
        fields: [{
            name: 'id',
            type: 'String'
        }, {
            name: 'label',
            type: 'String'
        }, {
            name: 'properties',
            type: 'Object'
        }]
    }
}

export default Neo.setupClass(NodeModel);
