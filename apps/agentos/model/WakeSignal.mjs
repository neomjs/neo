import Model from '../../../src/data/Model.mjs';

/**
 * @class AgentOS.model.WakeSignal
 * @extends Neo.data.Model
 *
 * @summary One received per-viewer wake as an immutable fact — the envelope's own field names,
 * verbatim (ADR 0002 §6.1.1 grammar: `eventId`, `subscriptionId`, `eventType` as `kind`, `logId`, ticket-ref-ok: decision-record authority for the wake envelope grammar, not issue archaeology
 * `emittedAt`), plus the client's `receivedAt` receipt stamp. Nothing is re-derived: the model
 * stores what the signed envelope said and when this viewer observed it, and never becomes a
 * second delivery authority — `poll-digest` remains the truth lane.
 */
class WakeSignal extends Model {
    static config = {
        /**
         * @member {String} className='AgentOS.model.WakeSignal'
         * @protected
         */
        className: 'AgentOS.model.WakeSignal',
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
            name: 'subscriptionId',
            type: 'String'
        }, {
            // the envelope's `eventType`, carried verbatim (e.g. 'wake/digest')
            name: 'kind',
            type: 'String'
        }, {
            // the GraphLog watermark anchor the envelope vouches — display truth only, the
            // consumer owns the client-held watermark
            name        : 'logId',
            type        : 'Object',
            defaultValue: null
        }, {
            // the envelope's own emission stamp (ISO string), never a client guess
            name        : 'emittedAt',
            type        : 'String',
            defaultValue: null
        }, {
            // client receipt truth: when THIS viewer's stream observed the frame (epoch ms)
            name        : 'receivedAt',
            type        : 'Object',
            defaultValue: null
        }]
    }
}

export default Neo.setupClass(WakeSignal);
