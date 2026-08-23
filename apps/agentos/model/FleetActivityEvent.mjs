import Model from '../../../src/data/Model.mjs';

/**
 * @class AgentOS.model.FleetActivityEvent
 * @extends Neo.data.Model
 *
 * @summary One producer-owned fact in the Fleet activity history.
 *
 * `eventId` is the durable, source-qualified identity emitted by the adapter. The model carries
 * the source DTO without deriving presentation identity, counts, or ordering; the Store owns
 * reconciliation and the pooled row owns rendering.
 */
class FleetActivityEvent extends Model {
    static config = {
        /**
         * @member {String} className='AgentOS.model.FleetActivityEvent'
         * @protected
         */
        className: 'AgentOS.model.FleetActivityEvent',
        /**
         * @member {String} keyProperty='eventId'
         * @reactive
         */
        keyProperty: 'eventId',
        /**
         * @member {Object[]} fields
         */
        fields: [{
            name: 'eventId',
            type: 'String'
        }, {
            name        : 'type',
            type        : 'String',
            defaultValue: null
        }, {
            name        : 'source',
            type        : 'String',
            defaultValue: null
        }, {
            name        : 'agentId',
            type        : 'String',
            defaultValue: null
        }, {
            name        : 'confidence',
            type        : 'String',
            defaultValue: null
        }, {
            name        : 'occurredAt',
            type        : 'String',
            defaultValue: null
        }, {
            name        : 'payload',
            type        : 'Object',
            defaultValue: null
        }]
    }
}

export default Neo.setupClass(FleetActivityEvent);
