import Component                              from '../../../../src/component/Base.mjs';
import {listHarnessTypes, resolveHarnessType} from '../../config/harnessTypes.mjs';
import {
    listMcpServers,
    normalizeMcpOverrides,
    resolveMcpMatrix
} from '../../config/mcpServers.mjs';

/**
 * @class AgentOS.view.fleet.AgentConfigCard
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
         * @member {String} className='AgentOS.view.fleet.AgentConfigCard'
         * @protected
         */
        className: 'AgentOS.view.fleet.AgentConfigCard',
        /**
         * @member {String} ntype='fm-agent-config-card'
         * @protected
         */
        ntype: 'fm-agent-config-card',
        /**
         * @member {String[]} baseCls=['fm-agent-config-card']
         */
        baseCls: ['fm-agent-config-card'],
        /**
         * The empty-state line rendered when no record is seated. Owners override it to stay honest
         * in their own context: the keeper-view's "select an agent" differs from the detail tab's
         * "this agent has no stored definition".
         * @member {String} emptyText='Select an agent to see its configuration.'
         */
        emptyText: 'Select an agent to see its configuration.',
        /**
         * The selected agent's record (an {@link AgentOS.model.AgentDefinition} row) — null renders
         * the empty state ("Select an agent").
         * @member {Object|null} record_=null
         * @reactive
         */
        record_: null,
        /**
         * Ephemeral save feedback for the currently rendered record. This is deliberately component
         * state, never AgentDefinition data: pending/rejected are transport facts, not durable fleet
         * configuration.
         * @member {Object|null} saveStatus_=null
         * @reactive
         */
        saveStatus_: null
    }

    /**
     * @summary One delegated click listener resolves every interactive row (see {@link #onCardClick}).
     */
    construct(config) {
        super.construct(config);
        this.addDomListeners({click: this.onCardClick, scope: this})
    }

    /**
     * Triggered after the record config got changed
     * @param {Object|null} value
     * @param {Object|null} oldValue
     * @protected
     */
    afterSetRecord(value, oldValue) {
        this.saveStatus = {agentId: value?.id ?? null, state: 'idle', reason: ''};
        this.refresh()
    }

    /**
     * @summary Re-derive the card's vdom from the CURRENT record data. Public on purpose: a
     * `recordChange` mutates record fields without changing record identity, so the reactive
     * `record` config never re-fires — the owning view calls `refresh()` on roster changes to keep
     * the card live (the same-record propagation contract).
     */
    refresh() {
        this.vdom.cn = this.createCardContent(this.record);
        this.update()
    }

    /**
     * @summary Resolve a click on an interactive row into a `configIntent` event — the card never
     * mutates anything itself (the owning view drives the bridge round-trip and writes the record
     * from the RESPONSE). Rows encode their intent in DOM ids: `<cardId>__srv__<key>` toggles one
     * MCP server; `<cardId>__harness__<type>` picks a harness.
     * @param {Object} data DOM click event data.
     * @protected
     */
    onCardClick(data) {
        const
            me     = this,
            record = me.record,
            node   = data.path?.find(item => item.id?.startsWith(`${me.id}__`));

        if (!node || !record || (me.saveStatus?.agentId === record.id && me.saveStatus.state === 'pending')) {
            return
        }

        const [, kind, key] = node.id.replace(`${me.id}__`, '__').split('__');

        if (kind === 'srv') {
            const matrix = resolveMcpMatrix(record.mcpServers);
            matrix[key] = !matrix[key];

            me.fire('configIntent', {id: record.id, mcpServers: normalizeMcpOverrides(matrix)})
        } else if (kind === 'harness' && key !== record.harnessType) {
            me.fire('configIntent', {id: record.id, harnessType: key})
        }
    }

    /**
     * @summary Render one save-state transition only when the card still shows the originating
     * agent. A slow response after selection changed must never paint the next agent's card.
     * @param {String} agentId
     * @param {'idle'|'pending'|'accepted'|'rejected'} state
     * @param {String} [reason=''] Operator-facing status or rejection reason.
     * @returns {Boolean} True when the visible card accepted the state.
     */
    setSaveStatus(agentId, state, reason='') {
        if (this.record?.id !== agentId) {
            return false
        }

        this.saveStatus = {agentId, state, reason};
        this.refresh();

        return true
    }

    /**
     * @summary Build the card's vdom from one record via the registries. Pure derivation — the
     * record and the two registries are the only inputs, so the card can never drift from the
     * configuration model. Server rows and harness chips are interactive (see {@link #onCardClick});
     * operational rows are read-only observations.
     * @param {Object|null} record
     * @returns {Object[]} vdom child nodes
     */
    createCardContent(record) {
        if (!record) {
            return [{cls: ['fm-config-empty'], text: this.emptyText}]
        }

        const
            me         = this,
            harness    = resolveHarnessType(record.harnessType),
            matrix     = resolveMcpMatrix(record.mcpServers),
            saveStatus = me.saveStatus?.agentId === record.id
                ? me.saveStatus
                : {state: 'idle', reason: ''};

        return [{
            cls: ['fm-config-identity'],
            cn : [
                {tag: 'strong', cls: ['fm-config-name'], text: record.displayName || record.githubUsername},
                {cls: ['fm-config-status'], text: record.statusText || ''}
            ]
        }, {
            cls: ['fm-config-row'],
            cn : [
                {cls: ['fm-config-label'], text: 'Harness'},
                {cls: ['fm-config-value'], text: harness?.label ?? 'Unknown harness'}
            ]
        }, {
            cls: ['fm-config-chips'],
            cn : listHarnessTypes().map(entry => ({
                id  : `${me.id}__harness__${entry.type}`,
                cls : ['fm-chip', entry.type === record.harnessType ? 'is-selected' : 'is-selectable'],
                text: entry.label
            }))
        }, {
            cls: ['fm-config-section'],
            cn : [
                {tag: 'strong', cls: ['fm-config-heading'], text: 'Servers'},
                ...listMcpServers().map(server => ({
                    id : `${me.id}__srv__${server.key}`,
                    cls: ['fm-config-row', 'fm-config-toggle', matrix[server.key] ? 'is-enabled' : 'is-disabled'],
                    cn : [
                        {cls: ['fm-config-label'], text: server.label},
                        {cls: ['fm-config-value'], text: matrix[server.key] ? 'On' : 'Off'}
                    ]
                }))
            ]
        }, {
            cls: ['fm-config-section'],
            cn : [
                {tag: 'strong', cls: ['fm-config-heading'], text: 'Operations'},
                this.createToggleRow('Hooks',              record.hooksActive),
                this.createToggleRow('Wake subscriptions', record.wakeSubscriptionsActive)
            ]
        }, {
            cls : ['fm-config-save-status', `is-${saveStatus.state}`],
            text: saveStatus.reason
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
            cls: ['fm-config-row', known ? (state ? 'is-enabled' : 'is-disabled') : 'is-unknown'],
            cn : [
                {cls: ['fm-config-label'], text: label},
                {cls: ['fm-config-value'], text: known ? (state ? 'On' : 'Off') : 'Not read back yet'}
            ]
        }
    }
}

export default Neo.setupClass(AgentConfigCard);
