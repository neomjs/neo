import Model from '../../../src/data/Model.mjs';

/**
 * @class AgentOS.model.MemoryTurn
 * @extends Neo.data.Model
 *
 * @summary One view-projection record in the Fleet memories pane: a single turn memory row as the
 * `query_recent_turns` operation returned it. The model is intentionally thin — it stores
 * projection input and never derives a second memory authority. The `summary` convert is the
 * rendering guard for the vocabulary-collision class: a non-string summary becomes `null` and the
 * pane names it honestly, instead of a coerced `[object Object]` row.
 */
class MemoryTurn extends Model {
    static config = {
        /**
         * @member {String} className='AgentOS.model.MemoryTurn'
         * @protected
         */
        className: 'AgentOS.model.MemoryTurn',
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
            name: 'sessionId',
            type: 'String'
        }, {
            name: 'timestamp',
            type: 'String'
        }, {
            name        : 'summary',
            type        : 'String',
            convert     : value => typeof value === 'string' ? value : null,
            defaultValue: null
        }, {
            name        : 'summaryFallback',
            type        : 'Boolean',
            defaultValue: false
        }]
    }
}

export default Neo.setupClass(MemoryTurn);
