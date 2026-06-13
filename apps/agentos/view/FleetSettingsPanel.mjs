import Button             from '../../../src/button/Base.mjs';
import DashboardPanel     from '../../../src/dashboard/Panel.mjs';
import FormContainer      from '../../../src/form/Container.mjs';
import GridContainer      from '../../../src/grid/Container.mjs';
import PasswordField      from '../../../src/form/field/Password.mjs';
import Radio              from '../../../src/form/field/Radio.mjs';
import TextField          from '../../../src/form/field/Text.mjs';
import Toolbar            from '../../../src/toolbar/Base.mjs';
import AgentDefinitions   from '../store/AgentDefinitions.mjs';

/**
 * @class AgentOS.view.FleetSettingsPanel
 * @extends Neo.dashboard.Panel
 *
 * @summary First Body-side Fleet Manager settings pane. It renders public agent definitions and
 * collects a credential only long enough to submit it to the Brain-side Fleet Registry bridge. If
 * that bridge is absent, submission fails closed, clears the PAT field, and stores nothing in the
 * browser/App Worker surface.
 */
class FleetSettingsPanel extends DashboardPanel {
    static config = {
        /**
         * @member {String} className='AgentOS.view.FleetSettingsPanel'
         * @protected
         */
        className: 'AgentOS.view.FleetSettingsPanel',
        /**
         * @member {String[]} cls=['agent-panel-settings']
         * @reactive
         */
        cls: ['agent-panel-settings'],
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
            text: 'Fleet Settings'
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
            module   : GridContainer,
            cls      : ['agent-definition-grid'],
            flex     : 'none',
            height   : 150,
            reference: 'agent-grid',
            store    : AgentDefinitions,

            columns: [{
                dataField: 'githubUsername',
                text     : 'GitHub',
                width    : 140
            }, {
                dataField: 'harnessType',
                text     : 'Harness',
                width    : 130
            }, {
                dataField: 'credentialState',
                text     : 'Credential',
                width    : 120,
                renderer : ({value}) => ({
                    cls : ['agent-status-pill', `is-${value}`],
                    text: value
                })
            }, {
                dataField: 'lifecycleState',
                text     : 'Lifecycle',
                width    : 110,
                renderer : ({value}) => ({
                    cls : ['agent-status-pill', `is-${value}`],
                    text: value
                })
            }, {
                dataField: 'statusText',
                flex     : 1,
                text     : 'Status'
            }]
        }, {
            module   : FormContainer,
            cls      : ['agent-definition-form'],
            flex     : 'none',
            layout   : {ntype: 'vbox', align: 'stretch'},
            reference: 'agent-form',

            items: [{
                ntype: 'component',
                cls  : ['agent-form-copy'],
                html : '<strong>Agent definition</strong>'
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
                }, '->', {
                    module  : Button,
                    cls     : ['agent-button', 'agent-lifecycle-button'],
                    disabled: true,
                    iconCls : 'fa fa-play',
                    text    : 'Start',
                    tooltip : {
                        text     : 'Lifecycle controls are gated until the service bridge is consumed.',
                        showDelay: 0,
                        hideDelay: 0
                    }
                }, {
                    module  : Button,
                    cls     : ['agent-button', 'agent-lifecycle-button'],
                    disabled: true,
                    iconCls : 'fa fa-stop',
                    text    : 'Stop',
                    tooltip : {
                        text     : 'Lifecycle controls are gated until the service bridge is consumed.',
                        showDelay: 0,
                        hideDelay: 0
                    }
                }, {
                    module  : Button,
                    cls     : ['agent-button', 'agent-lifecycle-button'],
                    disabled: true,
                    iconCls : 'fa fa-rotate-right',
                    text    : 'Restart',
                    tooltip : {
                        text     : 'Lifecycle controls are gated until the service bridge is consumed.',
                        showDelay: 0,
                        hideDelay: 0
                    }
                }]
            }, {
                ntype    : 'component',
                cls      : ['agent-bridge-status', 'is-waiting'],
                html     : 'Fleet Registry bridge unavailable in dev-server mode. Submit fails closed; no PAT is stored in browser state.',
                reference: 'bridge-status'
            }]
        }]
    }

    /**
     * @summary Create the redacted projection that can safely render in the Body-side app.
     * @param {Object} values
     * @returns {Object} Public agent definition suitable for the grid; never includes a credential.
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
     * app has no Brain-side bridge object, so the pane fails closed instead of inventing browser
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
     * @summary Replace any prior public row for the same agent with the redacted projection.
     * @param {Object} definition
     */
    upsertPublicAgentDefinition(definition) {
        const store = this.getReference('agent-grid').store;
        store.remove(definition.id);
        store.add(definition)
    }

    /**
     * @summary Update the bridge-state message without persisting any submitted values.
     * @param {String} stateCls
     * @param {String} message
     */
    updateBridgeStatus(stateCls, message) {
        const status = this.getReference('bridge-status');
        status.cls  = ['agent-bridge-status', stateCls];
        status.html = message
    }
}

export default Neo.setupClass(FleetSettingsPanel);
