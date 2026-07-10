import Component                          from '../../../src/component/Base.mjs';
import {resolveHarnessType}               from '../config/harnessTypes.mjs';
import {listMcpServers, resolveMcpMatrix} from '../config/mcpServers.mjs';

/**
 * @class AgentOS.view.AgentConfigCard
 * @extends Neo.component.Base
 *
 * @summary The per-agent configuration card — renders ONE selected agent's configuration from its
 * {@link AgentOS.model.AgentDefinition} record, entirely derived from the registries
 * (`config/harnessTypes.mjs` + `config/mcpServers.mjs`): the harness (registry label, fail-closed
 * "Unknown harness" for unregistered types), the MCP-server matrix (catalog order, effective
 * enable-state via `resolveMcpMatrix` — null matrix = catalog defaults), and the operational
 * toggles with tri-state honesty (On / Off / "Not read back yet" — never an optimistic guess).
 * Every label is operator product language; transport vocabulary never renders.
 */
class AgentConfigCard extends Component {
    static config = {
        /**
         * @member {String} className='AgentOS.view.AgentConfigCard'
         * @protected
         */
        className: 'AgentOS.view.AgentConfigCard',
        /**
         * @member {String} ntype='agent-config-card'
         * @protected
         */
        ntype: 'agent-config-card',
        /**
         * @member {String[]} baseCls=['agent-config-card']
         */
        baseCls: ['agent-config-card'],
        /**
         * The selected agent's record (an {@link AgentOS.model.AgentDefinition} row) — null renders
         * the empty state ("Select an agent").
         * @member {Object|null} record_=null
         * @reactive
         */
        record_: null
    }

    /**
     * Triggered after the record config got changed
     * @param {Object|null} value
     * @param {Object|null} oldValue
     * @protected
     */
    afterSetRecord(value, oldValue) {
        this.vdom.cn = this.createCardContent(value);
        this.update()
    }

    /**
     * @summary Build the card's vdom from one record via the registries. Pure derivation — the
     * record and the two registries are the only inputs, so the card can never drift from the
     * configuration model.
     * @param {Object|null} record
     * @returns {Object[]} vdom child nodes
     */
    createCardContent(record) {
        if (!record) {
            return [{cls: ['agent-config-empty'], text: 'Select an agent to see its configuration.'}]
        }

        const
            harness = resolveHarnessType(record.harnessType),
            matrix  = resolveMcpMatrix(record.mcpServers);

        return [{
            cls: ['agent-config-identity'],
            cn : [
                {tag: 'strong', cls: ['agent-config-name'], text: record.displayName || record.githubUsername},
                {cls: ['agent-config-status'], text: record.statusText || ''}
            ]
        }, {
            cls: ['agent-config-row'],
            cn : [
                {cls: ['agent-config-label'], text: 'Harness'},
                {cls: ['agent-config-value'], text: harness?.label ?? 'Unknown harness'}
            ]
        }, {
            cls: ['agent-config-section'],
            cn : [
                {tag: 'strong', cls: ['agent-config-heading'], text: 'Servers'},
                ...listMcpServers().map(server => ({
                    cls: ['agent-config-row', matrix[server.key] ? 'is-enabled' : 'is-disabled'],
                    cn : [
                        {cls: ['agent-config-label'], text: server.label},
                        {cls: ['agent-config-value'], text: matrix[server.key] ? 'On' : 'Off'}
                    ]
                }))
            ]
        }, {
            cls: ['agent-config-section'],
            cn : [
                {tag: 'strong', cls: ['agent-config-heading'], text: 'Operations'},
                this.createToggleRow('Hooks',              record.hooksActive),
                this.createToggleRow('Wake subscriptions', record.wakeSubscriptionsActive)
            ]
        }]
    }

    /**
     * @summary One operational-toggle row with tri-state honesty: a boolean renders On/Off; null
     * renders "Not read back yet" — the surface never invents a state it has not observed.
     * @param {String} label Product-language row label.
     * @param {Boolean|null} state
     * @returns {Object} vdom node
     */
    createToggleRow(label, state) {
        const known = state === true || state === false;

        return {
            cls: ['agent-config-row', known ? (state ? 'is-enabled' : 'is-disabled') : 'is-unknown'],
            cn : [
                {cls: ['agent-config-label'], text: label},
                {cls: ['agent-config-value'], text: known ? (state ? 'On' : 'Off') : 'Not read back yet'}
            ]
        }
    }
}

export default Neo.setupClass(AgentConfigCard);
