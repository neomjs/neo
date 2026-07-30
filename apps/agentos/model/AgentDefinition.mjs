import Model from '../../../src/data/Model.mjs';

/**
 * @class AgentOS.model.AgentDefinition
 * @extends Neo.data.Model
 *
 * @summary Public, Body-side shape for Fleet Manager agent definitions — the per-agent
 * configuration model every account surface binds: identity, ONE harness choice (a registered
 * `config/harnessTypes.mjs` key), the per-agent sparse MCP-server overrides (`mcpServers` — null
 * means every current catalog default applies; resolve via `config/mcpServers.mjs`, never persist
 * the fully resolved matrix), the narrow MCP target (`mcpTarget` — null = resident services;
 * a tenant is only `{kind:'tenant', tenantId}`), and the operational toggles (honest
 * readback: null = state not read back yet, never an
 * optimistic guess). This model deliberately contains no credential field: PAT bytes remain
 * Brain-side in FleetRegistryService and may only surface here as redacted state.
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
            name        : 'displayName',
            type        : 'String',
            defaultValue: null
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
            // sparse per-agent MCP overrides {serverKey: Boolean}; null = all live defaults apply
            name        : 'mcpServers',
            type        : 'Object',
            defaultValue: null
        }, {
            // null = resident services; tenant shape is only {kind:'tenant', tenantId}
            name        : 'mcpTarget',
            type        : 'Object',
            defaultValue: null
        }, {
            // operational toggles: tri-state honesty (true / false / null = not read back yet) —
            // Object-typed so null survives hydration; never an optimistic default
            name        : 'hooksActive',
            type        : 'Object',
            defaultValue: null
        }, {
            name        : 'wakeSubscriptionsActive',
            type        : 'Object',
            defaultValue: null
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
