import AgentDefinitionModel from '../model/AgentDefinition.mjs';
import Store                from '../../../src/data/Store.mjs';

/**
 * @class AgentOS.store.AgentDefinitions
 * @extends Neo.data.Store
 *
 * @summary Redacted Fleet Manager agent definition list — the shared fleet roster. The seed row is a
 * local bridge-state placeholder, not persisted registry data, and carries no credential bytes.
 *
 * **Not a singleton**: the sharing scope is the `state.Provider` that hosts it — the Viewport-level
 * provider `stores` block, the shared ancestor of every consumer ("if used inside a state provider,
 * we get it anyway"). `AgentOS.view.accounts.Panel` writes redacted identities into it (after the
 * Brain-side credential submit) via `getStateProvider().getStore('agentDefinitions')`, and the
 * cockpit's detail configuration tab resolves the same instance through its composition.
 * No credential bytes ever enter this Body-side store.
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
