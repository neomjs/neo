import Model from '../../src/data/Model.mjs';

/**
 * Represents a single Node within the Native Edge Graph Database engine. 
 * Nodes capture entity data in the GraphRAG topologies, pairing with ChrombaDB semantic vectors.
 * Leveraging Neo.data.Model enables exact schema validation and tracks structural changes for disk synchronization.
 * 
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
