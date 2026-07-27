import Model from '../../../src/data/Model.mjs';

/**
 * @class AgentOS.model.FleetTenant
 * @extends Neo.data.Model
 *
 * @summary Public remote Agent-OS tenant descriptor for the Fleet Manager configuration surface.
 * It intentionally contains no credential field: the endpoint is selectable product state, while
 * the provider bearer stays Brain-side in `FleetTenantService`.
 */
class FleetTenant extends Model {
    static config = {
        /**
         * @member {String} className='AgentOS.model.FleetTenant'
         * @protected
         */
        className: 'AgentOS.model.FleetTenant',
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
            name: 'endpoint',
            type: 'String'
        }, {
            name: 'status',
            type: 'String'
        }, {
            name: 'deploymentClass',
            type: 'String'
        }, {
            name: 'connectedAt',
            type: 'String'
        }]
    }
}

export default Neo.setupClass(FleetTenant);
