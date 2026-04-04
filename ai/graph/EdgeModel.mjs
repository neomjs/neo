import Model from '../../src/data/Model.mjs';

/**
 * @class Neo.ai.graph.EdgeModel
 * @extends Neo.data.Model
 */
class EdgeModel extends Model {
    static config = {
        /**
         * @member {String} className='Neo.ai.graph.EdgeModel'
         * @protected
         */
        className: 'Neo.ai.graph.EdgeModel',
        /**
         * @member {Object[]} fields
         */
        fields: [{
            name: 'id',
            type: 'String'
        }, {
            name: 'source',
            type: 'String'
        }, {
            name: 'target',
            type: 'String'
        }, {
            name: 'type',
            type: 'String'
        }, {
            name: 'properties',
            type: 'Object'
        }]
    }
}

export default Neo.setupClass(EdgeModel);
