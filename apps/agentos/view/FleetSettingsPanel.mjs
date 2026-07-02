import AgentDefinitions from '../store/AgentDefinitions.mjs';
import Button           from '../../../src/button/Base.mjs';
import DashboardPanel   from '../../../src/dashboard/Panel.mjs';
import GridContainer    from '../../../src/grid/Container.mjs';
import Toolbar          from '../../../src/toolbar/Base.mjs';

/**
 * @class AgentOS.view.FleetSettingsPanel
 * @extends Neo.dashboard.Panel
 *
 * @summary The **Fleet view** — run the fleet: the live, redacted roster (grid) + the lifecycle
 * controls (Start / Stop / Restart). Reads the shared `AgentDefinitions` roster singleton that
 * `AgentOS.view.Accounts` writes into; identity *setup* + all credential handling live in `Accounts`
 * (the cockpit keeper-view split). This view holds no credential logic — it is read + lifecycle only:
 * the lifecycle controls call the injected fleet registry bridge (`globalThis.AgentOS.fleet.registryBridge`,
 * the same Node↔Body transport `Accounts` defines through) and fail closed when it is absent, exactly
 * like `Accounts`. Richer per-agent control-surface UX (selection, per-row toggles, live health) is the
 * cockpit Lane-B evolution on top of this minimal start/stop/restart path.
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
            text: 'Fleet'
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
            flex     : 1,
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
            module: Toolbar,
            cls   : ['agent-fleet-actions'],
            flex  : 'none',
            items : ['->', {
                module : Button,
                cls    : ['agent-button', 'agent-lifecycle-button'],
                handler: 'up.onStartAgentClick',
                iconCls: 'fa fa-play',
                text   : 'Start'
            }, {
                module : Button,
                cls    : ['agent-button', 'agent-lifecycle-button'],
                handler: 'up.onStopAgentClick',
                iconCls: 'fa fa-stop',
                text   : 'Stop'
            }, {
                module : Button,
                cls    : ['agent-button', 'agent-lifecycle-button'],
                handler: 'up.onRestartAgentClick',
                iconCls: 'fa fa-rotate-right',
                text   : 'Restart'
            }]
        }]
    }

    /**
     * @summary The lifecycle target: the first real (non-placeholder) roster agent. Selection-based
     * targeting is a Lane-B cockpit enhancement; the minimal start path acts on the defined agent.
     * @returns {Object|null} an `AgentDefinitions` record, or `null` when no real agent is defined yet.
     */
    getTargetAgentRecord() {
        return AgentDefinitions.getRange().find(record => record.id !== 'bridge-pending') || null
    }

    /**
     * @summary Start the target agent through the injected fleet registry bridge (or fail closed).
     * @returns {Promise<void>}
     */
    onStartAgentClick() {
        return this.runLifecycleAction('startAgent', 'starting', 'running')
    }

    /**
     * @summary Stop the target agent through the injected fleet registry bridge (or fail closed).
     * @returns {Promise<void>}
     */
    onStopAgentClick() {
        return this.runLifecycleAction('stopAgent', 'stopping', 'stopped')
    }

    /**
     * @summary Restart the target agent through the injected fleet registry bridge (or fail closed).
     * @returns {Promise<void>}
     */
    onRestartAgentClick() {
        return this.runLifecycleAction('restartAgent', 'restarting', 'running')
    }

    /**
     * @summary Shared lifecycle runner: resolve the target agent + the injected registry bridge, invoke
     * the bridge verb with the agent id, and reflect the outcome onto the roster record. Fail-closed —
     * an absent bridge (dev-server without the fleet server, or before the shell injects it) marks the
     * record `gated` and invents no browser-side lifecycle state, mirroring `Accounts`' bridge discipline.
     * The PAT never crosses this boundary: the bridge carries only the agent id.
     * @param {String} method One of the registry-bridge lifecycle verbs (`startAgent` / `stopAgent` / `restartAgent`).
     * @param {String} pendingState The `lifecycleState` shown while the call is in flight.
     * @param {String} doneState    The fallback `lifecycleState` on success (the bridge result's `state` wins).
     * @returns {Promise<void>}
     */
    async runLifecycleAction(method, pendingState, doneState) {
        const record = this.getTargetAgentRecord(),
              bridge = globalThis.AgentOS?.fleet?.registryBridge;

        if (!record) return;

        if (!bridge?.[method]) {
            record.lifecycleState = 'gated';
            record.statusText     = 'Fleet Registry bridge unavailable; lifecycle controls fail closed. Start the fleet server (npm run ai:fleet-server).';
            return
        }

        record.lifecycleState = pendingState;
        record.statusText     = `${method} requested through the Fleet Registry bridge…`;

        try {
            const result = await bridge[method](record.id);
            record.lifecycleState = result?.state || doneState;
            record.statusText     = `Agent ${record.id} → ${result?.state || doneState}.`
        } catch (error) {
            record.lifecycleState = 'error';
            record.statusText     = error?.message || `${method} failed.`
        }
    }
}

export default Neo.setupClass(FleetSettingsPanel);
