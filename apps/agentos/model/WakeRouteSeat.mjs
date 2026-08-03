import Model from '../../../src/data/Model.mjs';

/**
 * @class AgentOS.model.WakeRouteSeat
 * @extends Neo.data.Model
 *
 * @summary One view-projection record in the Fleet wake-routes pane: a single seat's DECOMPOSED
 * wake path exactly as the `fleetWakeRoutes` read returned it — one field pair per axis (state +
 * reason), never re-fused and never re-derived. The model is intentionally thin projection input;
 * the string converts are the rendering guards for the vocabulary-collision class: a non-string
 * value becomes `null` and the pane names it honestly instead of coercing.
 */
class WakeRouteSeat extends Model {
    static config = {
        /**
         * @member {String} className='AgentOS.model.WakeRouteSeat'
         * @protected
         */
        className: 'AgentOS.model.WakeRouteSeat',
        /**
         * @member {String} keyProperty='agentIdentity'
         * @reactive
         */
        keyProperty: 'agentIdentity',
        /**
         * @member {Object[]} fields
         */
        fields: [{
            name: 'agentIdentity',
            type: 'String'
        }, {
            name        : 'agentId',
            type        : 'String',
            convert     : value => typeof value === 'string' ? value : null,
            defaultValue: null
        }, {
            name        : 'subscriptionState',
            type        : 'String',
            convert     : value => typeof value === 'string' ? value : null,
            defaultValue: null
        }, {
            name        : 'subscriptionReason',
            type        : 'String',
            convert     : value => typeof value === 'string' ? value : null,
            defaultValue: null
        }, {
            name        : 'armedState',
            type        : 'String',
            convert     : value => typeof value === 'string' ? value : null,
            defaultValue: null
        }, {
            name        : 'armedReason',
            type        : 'String',
            convert     : value => typeof value === 'string' ? value : null,
            defaultValue: null
        }, {
            name        : 'deliveryState',
            type        : 'String',
            convert     : value => typeof value === 'string' ? value : null,
            defaultValue: null
        }, {
            name        : 'deliveryReason',
            type        : 'String',
            convert     : value => typeof value === 'string' ? value : null,
            defaultValue: null
        }, {
            name        : 'failureState',
            type        : 'String',
            convert     : value => typeof value === 'string' ? value : null,
            defaultValue: null
        }, {
            name        : 'failureReason',
            type        : 'String',
            convert     : value => typeof value === 'string' ? value : null,
            defaultValue: null
        }, {
            name        : 'failureErrorClass',
            type        : 'String',
            convert     : value => typeof value === 'string' ? value : null,
            defaultValue: null
        }, {
            name        : 'failureAt',
            type        : 'String',
            convert     : value => typeof value === 'string' ? value : null,
            defaultValue: null
        }, {
            name        : 'presenceState',
            type        : 'String',
            convert     : value => typeof value === 'string' ? value : null,
            defaultValue: null
        }, {
            name        : 'presenceLastSeenAt',
            type        : 'String',
            convert     : value => typeof value === 'string' ? value : null,
            defaultValue: null
        }, {
            name        : 'presenceReason',
            type        : 'String',
            convert     : value => typeof value === 'string' ? value : null,
            defaultValue: null
        }]
    }
}

export default Neo.setupClass(WakeRouteSeat);
