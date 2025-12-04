import Model from '../../../src/data/Model.mjs';

/**
 * @class AgentOS.model.Intervention
 * @extends Neo.data.Model
 */
class Intervention extends Model {
    static config = {
        /**
         * @member {String} className='AgentOS.model.Intervention'
         * @protected
         */
        className: 'AgentOS.model.Intervention',
        /**
         * @member {Object[]} fields
         */
        fields: [{
            name: 'id',
            type: 'String'
        }, {
            name: 'timestamp',
            type: 'Date'
        }, {
            name: 'message',
            type: 'String'
        }, {
            name: 'priority',
            type: 'String' // 'normal', 'warning', 'error'
        }]
    }
}

export default Neo.setupClass(Intervention);
