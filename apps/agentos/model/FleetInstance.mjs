import Model from '../../../src/data/Model.mjs';

/**
 * @class AgentOS.model.FleetInstance
 * @extends Neo.data.Model
 *
 * @summary One configured Agent OS instance — a C1 connection-profile record made bindable.
 *
 * The field set mirrors the CLOSED record schema of `apps/agentos/fleet/connectionProfiles.mjs`
 * verbatim (`assertStorableProfileRecord` is the producing guard), plus nothing: every row in the
 * instances Store has passed that guard, so by construction there is no credential field to model —
 * the fleet bearer lives in transport closures, the plane bearer Brain-side. `bearerEnvVar` is the
 * one custodian-admitted credential-ADJACENT field (a NAME, never material, env-indirection only).
 */
class FleetInstance extends Model {
    static config = {
        /**
         * @member {String} className='AgentOS.model.FleetInstance'
         * @protected
         */
        className: 'AgentOS.model.FleetInstance',
        /**
         * @member {String} keyProperty='profileId'
         * @reactive
         */
        keyProperty: 'profileId',
        /**
         * @member {Object[]} fields
         */
        fields: [{
            name: 'profileId',
            type: 'String'
        }, {
            name: 'canonicalEndpoint',
            type: 'String'
        }, {
            name: 'custodian',
            type: 'String'
        }, {
            name: 'label',
            type: 'String'
        }, {
            name: 'contractVersion',
            type: 'Integer'
        }, {
            name: 'generation',
            type: 'Integer'
        }, {
            name: 'bearerEnvVar',
            type: 'String'
        }]
    }
}

export default Neo.setupClass(FleetInstance);
