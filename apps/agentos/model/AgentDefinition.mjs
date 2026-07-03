import Model from '../../../src/data/Model.mjs';

/**
 * @class AgentOS.model.AgentDefinition
 * @extends Neo.data.Model
 *
 * @summary Public, Body-side shape for Fleet Manager agent definitions. This model deliberately
 * contains no credential field: PAT bytes remain Brain-side in FleetRegistryService and may only
 * surface here as redacted state.
 */
class AgentDefinition extends Model {
    static config = {
        /**
         * @member {String} className='AgentOS.model.AgentDefinition'
         * @protected
         */
        className: 'AgentOS.model.AgentDefinition',
        /**
         * @member {Object[]} fields
         */
        fields: [{
            name: 'id',
            type: 'String'
        }, {
            name: 'githubUsername',
            type: 'String'
        }, {
            name: 'harnessType',
            type: 'String'
        }, {
            name: 'credentialState',
            type: 'String'
        }, {
            name: 'lifecycleState',
            type: 'String'
        }, {
            name: 'statusText',
            type: 'String'
        }, {
            name: 'updatedAt',
            type: 'String'
        }]
    }
}

export default Neo.setupClass(AgentDefinition);
