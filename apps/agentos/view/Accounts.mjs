import AgentDefinitions from '../store/AgentDefinitions.mjs';
import Button           from '../../../src/button/Base.mjs';
import DashboardPanel   from '../../../src/dashboard/Panel.mjs';
import FormContainer    from '../../../src/form/Container.mjs';
import PasswordField    from '../../../src/form/field/Password.mjs';
import Radio            from '../../../src/form/field/Radio.mjs';
import TextField        from '../../../src/form/field/Text.mjs';
import Toolbar          from '../../../src/toolbar/Base.mjs';

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
         * @member {String[]} cls=['agent-panel-accounts']
         * @reactive
         */
        cls: ['agent-panel-accounts'],
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
            module   : FormContainer,
            cls      : ['agent-definition-form'],
            flex     : 'none',
            layout   : {ntype: 'vbox', align: 'stretch'},
            reference: 'agent-form',

            items: [{
                ntype: 'component',
                cls  : ['agent-form-copy'],
                vdom : {cn: [{tag: 'strong', text: 'Agent identity'}]}
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
                items : [{
                    module        : Radio,
                    checked       : true,
                    hideValueLabel: false,
                    labelText     : 'Harness',
                    labelWidth    : 118,
                    name          : 'harnessType',
                    value         : 'codex',
                    valueLabel    : 'Codex'
                }, {
                    module        : Radio,
                    hideValueLabel: false,
                    labelText     : '',
                    name          : 'harnessType',
                    value         : 'claude-desktop',
                    valueLabel    : 'Claude'
                }, {
                    module        : Radio,
                    hideValueLabel: false,
                    labelText     : '',
                    name          : 'harnessType',
                    value         : 'antigravity',
                    valueLabel    : 'Antigravity'
                }, {
                    module        : Radio,
                    hideValueLabel: false,
                    labelText     : '',
                    name          : 'harnessType',
                    value         : 'native-neo',
                    valueLabel    : 'Native'
                }]
            }, {
                module: Toolbar,
                cls   : ['agent-form-actions'],
                flex  : 'none',
                items : [{
                    module : Button,
                    cls    : ['agent-button', 'agent-submit-button'],
                    handler: 'up.onSubmitAgentClick',
                    iconCls: 'fa fa-lock',
                    text   : 'Submit to Bridge'
                }, {
                    module : Button,
                    cls    : ['agent-button'],
                    handler: 'up.onLoadSampleClick',
                    iconCls: 'fa fa-pen-to-square',
                    text   : 'Edit Sample'
                }, {
                    module : Button,
                    cls    : ['agent-button', 'agent-connect-button'],
                    handler: 'up.onConnectExternalHarnessClick',
                    iconCls: 'fa fa-plug',
                    text   : 'Connect Harness (NL-MCP)'
                }]
            }, {
                ntype    : 'component',
                cls      : ['agent-bridge-status', 'is-waiting'],
                reference: 'bridge-status',
                vdom     : {cn: [{text: 'Fleet Registry bridge unavailable in dev-server mode. Submit fails closed; no PAT is stored in browser state.'}]}
            }]
        }]
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
            statusText     : 'Definition accepted by Fleet Registry bridge; lifecycle controls remain gated.',
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
            'Sample loaded for editing. Enter a PAT to submit; the value will be cleared after the bridge attempt.'
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
            this.updateBridgeStatus('is-error', 'Definition incomplete. GitHub username, harness type, and PAT are required.');
            return
        }

        const payload = {
            credential    : values.credential,
            githubUsername,
            harnessType   : values.harnessType
        };

        try {
            await this.submitToFleetRegistryBridge(payload);
            this.upsertPublicAgentDefinition(this.createPublicAgentDefinition(payload));
            this.updateBridgeStatus('is-live', 'Definition submitted through the Fleet Registry bridge. PAT was not retained in the app worker.')
        } catch (error) {
            this.updateBridgeStatus('is-error', 'Fleet Registry bridge unavailable. Nothing was stored in browser state; PAT field was cleared.')
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
            this.updateBridgeStatus('is-live', result?.message || 'External harness connected through the Neural Link bridge.')
        } catch (error) {
            this.updateBridgeStatus('is-error', 'Neural Link connection bridge unavailable in dev-server mode. Connect fails closed; no connection state was stored in the app worker.')
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
     * @summary Write the redacted projection into the shared `AgentDefinitions` roster singleton,
     * replacing any prior row for the same agent. The Fleet view's grid (bound to the same singleton)
     * re-renders reactively — no cross-view reference is needed.
     * @param {Object} definition
     */
    upsertPublicAgentDefinition(definition) {
        AgentDefinitions.remove(definition.id);
        AgentDefinitions.add(definition)
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
