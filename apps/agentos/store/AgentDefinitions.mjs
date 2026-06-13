import AgentDefinitionModel from '../model/AgentDefinition.mjs';
import Store                from '../../../src/data/Store.mjs';

/**
 * @class AgentOS.store.AgentDefinitions
 * @extends Neo.data.Store
 *
 * @summary Redacted Fleet Manager agent definition list for the settings pane. The seed row is a
 * local bridge-state placeholder, not persisted registry data, and carries no credential bytes.
 */
class AgentDefinitions extends Store {
    static config = {
        /**
         * @member {String} className='AgentOS.store.AgentDefinitions'
         * @protected
         */
        className: 'AgentOS.store.AgentDefinitions',
        /**
         * @member {Object[]} data
         */
        data: [{
            id             : 'bridge-pending',
            githubUsername : 'bridge-pending',
            harnessType    : 'codex',
            credentialState: 'redacted',
            lifecycleState : 'gated',
            statusText     : 'Fleet Registry bridge required; PAT values are never loaded into the app worker.',
            updatedAt      : 'not connected'
        }],
        /**
         * @member {Neo.data.Model} model=AgentDefinitionModel
         * @reactive
         */
        model: AgentDefinitionModel
    }
}

export default Neo.setupClass(AgentDefinitions);
