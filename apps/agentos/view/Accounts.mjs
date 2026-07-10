import AgentConfigCard    from './AgentConfigCard.mjs';
import Button             from '../../../src/button/Base.mjs';
import DashboardPanel     from '../../../src/dashboard/Panel.mjs';
import FormContainer      from '../../../src/form/Container.mjs';
import {listHarnessTypes} from '../config/harnessTypes.mjs';
import PasswordField      from '../../../src/form/field/Password.mjs';
import Radio              from '../../../src/form/field/Radio.mjs';
import TextField          from '../../../src/form/field/Text.mjs';
import Toolbar            from '../../../src/toolbar/Base.mjs';

/**
 * @class AgentOS.view.Accounts
 * @extends Neo.dashboard.Panel
 *
 * @summary The **Accounts keeper-view** — set up the cross-family fleet's agent identities (GitHub
 * identity + harness type + provider credential). Extracted from `FleetSettingsPanel` per the cockpit
 * keeper-view decomposition: this view owns identity *setup*; the Fleet view owns the live roster
 * + lifecycle. It also surfaces a **basic NL-MCP connect entry** (the external-harness
 * `manage_connection` start path) through the same fail-closed injected-bridge discipline.
 *
 * Capability-security boundary (the load-bearing reason this is its own surface): a credential is
 * collected only long enough to submit it to the Brain-side Fleet Registry bridge. If that bridge is
 * absent, submission fails closed, the PAT field is cleared, and **nothing is stored in the browser /
 * App Worker** — only a redacted projection reaches the shared `AgentDefinitions` roster, never a
 * credential byte (mirrors `AgentOS.model.AgentDefinition`'s deliberately credential-free shape).
 */
class Accounts extends DashboardPanel {
    static config = {
        /**
         * @member {String} className='AgentOS.view.Accounts'
         * @protected
         */
        className: 'AgentOS.view.Accounts',
        /**
         * The shared roster store, bound from the Viewport provider's `stores.agentDefinitions`
         * (see the `bind` config) — declarative and resolved once at construct. Pop-outs swap the
         * render target only, never the owning component/provider tree (components stay one live
         * object in the shared App-Worker heap), so the bound instance naturally stays valid.
         * Never a module-global singleton.
         * @member {Neo.data.Store|null} agentDefinitionsStore_=null
         * @reactive
         */
        agentDefinitionsStore_: null,
        /**
         * @member {Object} bind={agentDefinitionsStore:'stores.agentDefinitions'}
         */
        bind: {agentDefinitionsStore: 'stores.agentDefinitions'},
        /**
         * @member {String[]} cls=['agent-panel-accounts']
         * @reactive
         */
        cls: ['agent-panel-accounts'],
        /**
         * The durable id of the agent whose configuration renders in the card — the fleet is
         * MULTIPLE agents; this view is scoped to one at a time via the selector strip.
         * @member {String|null} selectedAgentId_=null
         * @reactive
         */
        selectedAgentId_: null,
        /**
         * @member {Number} flex=1
         */
        flex: 1,
        /**
         * @member {Object[]} headers
         */
        headers: [{
            dock: 'top',
            cls : ['neo-draggable'],
            text: 'Accounts'
        }],
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         * @reactive
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * @member {Function|String|null} popupUrl='apps/agentos/childapps/widget/index.html'
         */
        popupUrl: 'apps/agentos/childapps/widget/index.html',
        /**
         * @member {Object[]} items
         */
        items: [{
            // the fleet is MULTIPLE agents: pick one here, configure IT below — the selector strip
            // is rebuilt from the bound roster store (see syncAgentSelector)
            module   : Toolbar,
            cls      : ['agent-selector'],
            flex     : 'none',
            reference: 'agent-selector',
            items    : []
        }, {
            module   : AgentConfigCard,
            flex     : 'none',
            reference: 'agent-config-card'
        }, {
            module   : FormContainer,
            cls      : ['agent-definition-form'],
            flex     : 'none',
            layout   : {ntype: 'vbox', align: 'stretch'},
            reference: 'agent-form',

            items: [{
                ntype: 'component',
                cls  : ['agent-form-copy'],
                vdom : {cn: [{tag: 'strong', text: 'Add an agent'}]}
            }, {
                module         : TextField,
                clearable      : true,
                labelText      : 'GitHub username',
                labelWidth     : 118,
                name           : 'githubUsername',
                placeholderText: 'neo-gpt',
                required       : true
            }, {
                module         : PasswordField,
                clearable      : true,
                labelText      : 'GitHub PAT',
                labelWidth     : 118,
                name           : 'credential',
                placeholderText: 'stored Brain-side only',
                required       : true
            }, {
                module: Toolbar,
                cls   : ['agent-harness-picker'],
                flex  : 'none',
                // one registration in config/harnessTypes.mjs = one more radio here — the form
                // derives from the registry, labels are the registry's product language
                items : listHarnessTypes().map((entry, index) => ({
                    module        : Radio,
                    checked       : index === 0,
                    hideValueLabel: false,
                    labelText     : index === 0 ? 'Harness' : '',
                    labelWidth    : 118,
                    name          : 'harnessType',
                    value         : entry.type,
                    valueLabel    : entry.label
                }))
            }, {
                module: Toolbar,
                cls   : ['agent-form-actions'],
                flex  : 'none',
                items : [{
                    module : Button,
                    cls    : ['agent-button', 'agent-submit-button'],
                    handler: 'up.onSubmitAgentClick',
                    iconCls: 'fa fa-lock',
                    text   : 'Add agent'
                }, {
                    module : Button,
                    cls    : ['agent-button'],
                    handler: 'up.onLoadSampleClick',
                    iconCls: 'fa fa-pen-to-square',
                    text   : 'Use sample'
                }, {
                    module : Button,
                    cls    : ['agent-button', 'agent-connect-button'],
                    handler: 'up.onConnectExternalHarnessClick',
                    iconCls: 'fa fa-plug',
                    text   : 'Connect harness'
                }]
            }, {
                ntype    : 'component',
                cls      : ['agent-bridge-status', 'is-waiting'],
                reference: 'bridge-status',
                vdom     : {cn: [{text: 'Agent setup is unavailable in dev-server mode. Add agent fails closed; no PAT is stored in browser state.'}]}
            }]
        }]
    }

    /**
     * Triggered after the agentDefinitionsStore config got changed — the provider-bound roster
     * arrives post-construct. Listener discipline: per-call copies (on()/un() consume keys off the
     * object they receive), symmetric unbind of the old store.
     * @param {Neo.data.Store|null} value
     * @param {Neo.data.Store|null} oldValue
     * @protected
     */
    afterSetAgentDefinitionsStore(value, oldValue) {
        let me        = this,
            listeners = {
                load        : me.onAgentRosterChange,
                recordChange: me.onAgentRosterChange,
                scope       : me
            };

        value   ?.on({...listeners});
        oldValue?.un({...listeners});

        me.syncAgentSelector()
    }

    /**
     * Triggered after the selectedAgentId config got changed — scope the configuration card to the
     * selected agent's record and reflect the selection on the selector strip.
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetSelectedAgentId(value, oldValue) {
        let me   = this,
            card = me.getReference('agent-config-card');

        if (card) {
            card.record = value ? (me.agentDefinitionsStore?.get(value) ?? null) : null
        }

        me.getReference('agent-selector')?.items?.forEach(item => {
            item.pressed = item.agentId === value
        })
    }

    /**
     * @summary Any roster change (seed load, add, remove, field readback) re-derives the selector
     * strip and refreshes the scoped card.
     * @protected
     */
    onAgentRosterChange() {
        this.syncAgentSelector()
    }

    /**
     * @summary Selector click → scope the view to that agent.
     * @param {Object} data Button click event data.
     */
    onSelectAgentClick(data) {
        this.selectedAgentId = data.component.agentId
    }

    /**
     * @summary Rebuild the selector strip from the bound roster store: one button per agent
     * (product language: the display name, falling back to the GitHub username) plus the selection
     * default — the first agent when nothing valid is selected. The card refreshes through
     * {@link #afterSetSelectedAgentId}.
     * @protected
     */
    syncAgentSelector() {
        let me       = this,
            selector = me.getReference('agent-selector'),
            store    = me.agentDefinitionsStore,
            records  = store?.items || [];

        if (!selector) {
            return
        }

        selector.items = records.map(record => ({
            module : Button,
            agentId: record.id,
            cls    : ['agent-selector-button'],
            pressed: record.id === me.selectedAgentId,
            text   : record.displayName || record.githubUsername || record.id,
            handler: 'up.onSelectAgentClick'
        }));

        const validSelection = me.selectedAgentId && store?.get(me.selectedAgentId);

        if (!validSelection) {
            me.selectedAgentId = records[0]?.id ?? null
        } else {
            // same selection, possibly new record data (readback) — refresh the card
            me.afterSetSelectedAgentId(me.selectedAgentId, me.selectedAgentId)
        }
    }

    /**
     * @summary Detach the roster listeners; the provider owns the store's own teardown.
     * @param {...*} args
     */
    destroy(...args) {
        let me        = this,
            listeners = {
                load        : me.onAgentRosterChange,
                recordChange: me.onAgentRosterChange,
                scope       : me
            };

        me.agentDefinitionsStore?.un({...listeners});
        super.destroy(...args)
    }

    /**
     * @summary Create the redacted projection that can safely render in the Body-side roster.
     * @param {Object} values
     * @returns {Object} Public agent definition suitable for the shared store; never includes a credential.
     */
    createPublicAgentDefinition(values) {
        return {
            id             : values.githubUsername,
            githubUsername : values.githubUsername,
            harnessType    : values.harnessType,
            credentialState: 'stored-node-side',
            lifecycleState : 'gated',
            statusText     : 'Agent added; lifecycle controls remain gated.',
            updatedAt      : new Date().toISOString()
        }
    }

    /**
     * @summary Load a sample public identity without inserting credential bytes.
     * @returns {Promise<void>}
     */
    async onLoadSampleClick() {
        const form = this.getReference('agent-form');

        await form.setValues({
            credential    : '',
            githubUsername: 'neo-gpt',
            harnessType   : 'codex'
        });

        this.updateBridgeStatus(
            'is-waiting',
            'Sample loaded. Enter a PAT to add the agent; the value clears after the attempt.'
        )
    }

    /**
     * @summary Validate the form, attempt the Brain-side bridge submit, then clear the PAT field.
     * @returns {Promise<void>}
     */
    async onSubmitAgentClick() {
        const
            form   = this.getReference('agent-form'),
            valid  = await form.validate(),
            values = await form.getSubmitValues();

        const githubUsername = values.githubUsername?.trim();

        if (!valid || !githubUsername || !values.harnessType || !values.credential) {
            this.updateBridgeStatus('is-error', 'Agent setup incomplete. GitHub username, harness type, and PAT are required.');
            return
        }

        const payload = {
            credential : values.credential,
            githubUsername,
            harnessType: values.harnessType
        };

        try {
            await this.submitToFleetRegistryBridge(payload);
            this.upsertPublicAgentDefinition(this.createPublicAgentDefinition(payload));
            this.updateBridgeStatus('is-live', 'Agent added. PAT was not retained in the app worker.')
        } catch (error) {
            this.updateBridgeStatus('is-error', 'Could not add agent. Nothing was stored in browser state; PAT field was cleared.')
        } finally {
            await this.clearCredentialField()
        }
    }

    /**
     * @summary Attempt the basic NL-MCP external-harness connect through an injected Neural Link
     * connection bridge, or fail closed. Mirrors {@link onSubmitAgentClick}'s bridge discipline: the
     * connect carries no credential, and when no bridge is injected (the dev-server app has none) the
     * view reports the failure without inventing any browser-side connection state.
     * @returns {Promise<void>}
     */
    async onConnectExternalHarnessClick() {
        try {
            const result = await this.connectExternalHarnessBridge({action: 'start'});
            this.updateBridgeStatus('is-live', result?.message || 'External harness connected.')
        } catch (error) {
            this.updateBridgeStatus('is-error', 'Harness connection unavailable in dev-server mode. Connect fails closed; no connection state was stored in the app worker.')
        }
    }

    /**
     * @summary Remove credential bytes from the password field after every bridge attempt.
     * @returns {Promise<void>}
     */
    async clearCredentialField() {
        const field = await this.getReference('agent-form').getField('credential');
        field?.reset('')
    }

    /**
     * @summary Forward the definition to an injected Fleet Registry bridge, or fail closed.
     * Submit via an injected bridge when a future Agent OS shell exposes one. The current dev-server
     * app has no Brain-side bridge object, so the view fails closed instead of inventing browser
     * persistence.
     * @param {Object} payload
     * @returns {Promise<*>}
     */
    async submitToFleetRegistryBridge(payload) {
        const bridge = globalThis.AgentOS?.fleet?.registryBridge;

        if (!bridge?.defineAgent) {
            throw new Error('Fleet Registry bridge unavailable')
        }

        return bridge.defineAgent(payload)
    }

    /**
     * @summary Forward a basic NL-MCP connect request to an injected Neural Link connection bridge,
     * or fail closed. Mirrors {@link submitToFleetRegistryBridge}: an injected bridge is used when a
     * future Agent OS shell exposes one; the current dev-server app has none, so the view fails closed
     * instead of inventing a connection. Carries no credential — the App-Worker → Brain capability
     * boundary is preserved.
     * @param {Object} request The NL-MCP connection request, e.g. `{action:'start'}`.
     * @returns {Promise<*>}
     */
    async connectExternalHarnessBridge(request) {
        const bridge = globalThis.AgentOS?.neuralLink?.connectionBridge;

        if (!bridge?.manageConnection) {
            throw new Error('Neural Link connection bridge unavailable')
        }

        return bridge.manageConnection(request)
    }

    /**
     * @summary Write the redacted projection into the shared roster store (the Viewport-provider-
     * hosted `AgentDefinitions` instance this view binds), replacing any prior row for the same
     * agent. The Fleet view's grid (bound to the same provider store) re-renders reactively — no
     * cross-view reference is needed.
     * @param {Object} definition
     */
    upsertPublicAgentDefinition(definition) {
        const store = this.agentDefinitionsStore;

        store.remove(definition.id);
        store.add(definition);

        // a just-added agent becomes the scoped one — the operator configures it next
        this.selectedAgentId = definition.id
    }

    /**
     * @summary Update the bridge-state message without persisting any submitted values.
     * @param {String} stateCls
     * @param {String} message
     */
    updateBridgeStatus(stateCls, message) {
        const status = this.getReference('bridge-status');
        status.cls             = ['agent-bridge-status', stateCls];
        status.vdom.cn[0].text = message;
        status.update()
    }
}

export default Neo.setupClass(Accounts);
