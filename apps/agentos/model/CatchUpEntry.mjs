import Model from '../../../src/data/Model.mjs';

/**
 * @class AgentOS.model.CatchUpEntry
 * @extends Neo.data.Model
 *
 * @summary One view-projection record in the invoked Fleet catch-up pane. Source records carry a
 * source-owned history slot under `payload`; partition records carry a canonical Fleet/agent key.
 * The model is intentionally thin: it stores projection input and never derives or persists a
 * second history authority.
 */
class CatchUpEntry extends Model {
    static config = {
        /**
         * @member {String} className='AgentOS.model.CatchUpEntry'
         * @protected
         */
        className: 'AgentOS.model.CatchUpEntry',
        /**
         * @member {String} keyProperty='id'
         * @reactive
         */
        keyProperty: 'id',
        /**
         * @member {Object[]} fields
         */
        fields: [{
            name: 'id',
            type: 'String'
        }, {
            name: 'kind',
            type: 'String'
        }, {
            name: 'label',
            type: 'String'
        }, {
            name: 'partition',
            type: 'String'
        }, {
            name        : 'payload',
            type        : 'Object',
            defaultValue: null
        }]
    }
}

export default Neo.setupClass(CatchUpEntry);
