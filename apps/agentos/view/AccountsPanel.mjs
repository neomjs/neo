import AgentConfigCard                                           from './fleet/detail/AgentConfigComponent.mjs';
import {
    createDefineAgentIntent,
    isShellCredentialIngress,
    resolveRegistryBridge,
    validateDefinePayload
}                                                                from '../util/addAgentFlow.mjs';
import {getDefinitionsWriteGeneration, runConfigIntentRoundTrip} from '../util/configIntentRoundTrip.mjs';
import Button                                                    from '../../../src/button/Base.mjs';
import DashboardPanel                                            from '../../../src/dashboard/Panel.mjs';
import FormContainer                                             from '../../../src/form/Container.mjs';
import {listHarnessTypes}                                        from '../config/harnessTypes.mjs';
import PasswordField                                             from '../../../src/form/field/Password.mjs';
import Radio                                                     from '../../../src/form/field/Radio.mjs';
import TextField                                                 from '../../../src/form/field/Text.mjs';
import Toolbar                                                   from '../../../src/toolbar/Base.mjs';

/**
 * @class AgentOS.view.AccountsPanel
 * @extends Neo.dashboard.Panel
 *
 * @summary The **Accounts keeper-view** — set up the cross-family fleet's agent identities (GitHub
 * identity + harness type + provider credential). Extracted from the retired settings panel per the
 * cockpit keeper-view decomposition: this view owns identity *setup*; the cockpit owns the live
 * roster + lifecycle. It also surfaces a **basic NL-MCP connect entry** (the external-harness
 * `manage_connection` start path) through the same fail-closed injected-bridge discipline.
 *
 * Capability-security boundary (the load-bearing reason this is its own surface): direct-browser
 * mode collects a credential only long enough to submit it to the Brain-side Fleet Registry bridge;
 * shell mode renders no credential field and submits only public intent. If that bridge is absent,
 * submission fails closed, the PAT field is cleared, and **nothing is stored in the browser / App
 * Worker** — only the Brain's canonical redacted response reaches the shared
 * `AgentDefinitions` roster, never a credential byte (mirrors
 * `AgentOS.model.AgentDefinition`'s deliberately credential-free shape). An accepted definition
 * emits `agentDefinitionAccepted`; the Viewport composition root owns the separate Fleet-cockpit
 * refresh, so Accounts never maps or reaches into a sibling `FleetAgent` surface.
 */
class Accounts extends DashboardPanel {
    static config = {
        /**
         * @member {String} className='AgentOS.view.AccountsPanel'
         * @protected
         */
        className: 'AgentOS.view.AccountsPanel',
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
         * The provider-hosted public tenant roster. The card consumes this exact Store instance;
         * tenant credentials never enter it.
         * @member {Neo.data.Store|null} fleetTenantsStore_=null
         * @reactive
         */
        fleetTenantsStore_: null,
        /**
         * @member {Object} bind
         */
        bind: {
            agentDefinitionsStore: 'stores.agentDefinitions',
            fleetTenantsStore    : 'stores.fleetTenants'
        },
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
                labelWidth     : 136,
                name           : 'githubUsername',
                placeholderText: 'neo-gpt',
                required       : true
            }, {
                module         : PasswordField,
                clearable      : true,
                labelText      : 'GitHub PAT',
                labelWidth     : 136,
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
                    labelWidth    : 136,
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
     * Monotonic guard for canonical roster reads. An accepted configure response increments the
     * generation so an older listAgents response cannot overwrite newer persisted truth.
     * @member {Number} agentDefinitionsLoadGeneration=0
     * @private
     */
    agentDefinitionsLoadGeneration = 0

    /**
     * Monotonic guard for canonical tenant-roster reads. Only the newest successful, well-formed
     * `listTenants()` response may replace the provider Store; failures preserve last-known rows.
     * @member {Number} fleetTenantsLoadGeneration=0
     * @private
     */
    fleetTenantsLoadGeneration = 0

    /**
     * Ephemeral save status per agent. Selection changes re-project this state onto the card, so a
     * pending/accepted/rejected result never moves to or disappears behind another agent.
     * @member {Map<String,Object>} agentConfigSaveStatuses
     * @private
     */
    agentConfigSaveStatuses = new Map()

    /**
     * @summary Wire the configuration card's intent event — the card renders and fires; this view
     * owns the bridge round-trip (see {@link #onAgentConfigIntent}).
     * @param {...*} args
     */
    onConstructed(...args) {
        super.onConstructed(...args);

        const
            me         = this,
            bridge     = resolveRegistryBridge(),
            form       = me.getReference('agent-form'),
            credential = form?.items.find(item => item.name === 'credential');

        const card = me.getReference('agent-config-card');

        card?.on({configIntent: me.onAgentConfigIntent, scope: me});
        if (card) card.tenantStore = me.fleetTenantsStore;

        if (isShellCredentialIngress(bridge)) {
            credential && form.remove(credential);
            me.updateBridgeStatus(
                'is-live',
                'Credential entry is owned by the native shell and never enters App Worker state.'
            )
        }
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
                // membership changes fire `mutate`, not `load` — the Viewport's accepted-definition
                // upsert lands via `store.add()`, and the selector strip must show the new resident
                mutate      : me.onAgentRosterChange,
                recordChange: me.onAgentRosterChange,
                scope       : me
            };

        value   ?.on({...listeners});
        oldValue?.un({...listeners});

        me.syncAgentSelector();
        value && void me.loadAgentDefinitions?.()
    }

    /**
     * Triggered after the public tenant Store binding changes. The configuration card listens to
     * the exact Store instance for live availability changes; Accounts owns only canonical loading.
     * @param {Neo.data.Store|null} value
     * @param {Neo.data.Store|null} oldValue
     * @protected
     */
    afterSetFleetTenantsStore(value, oldValue) {
        const card = this.getReference('agent-config-card');

        if (card) card.tenantStore = value;
        value && void this.loadFleetTenants?.()
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
            card.record = value ? (me.agentDefinitionsStore?.get(value) ?? null) : null;
            // a recordChange mutates fields WITHOUT changing record identity, and the reactive
            // config setter suppresses same-identity assignments — refresh() closes that gap
            card.refresh();

            const status = me.agentConfigSaveStatuses.get(value) ?? {state: 'idle', reason: ''};
            value && card.setSaveStatus(value, status.state, status.reason)
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
     * @summary The card's `configIntent` → the `configureAgent` bridge round-trip: the registry
     * validates + persists, and the RESPONSE (the public definition — the readback) is written
     * onto the store record, which re-renders the card. Fail-closed: without a bridge nothing
     * mutates locally — a config that did not persist must never render as if it had.
     * @param {Object} intent The one wire shape:
     *     `{id, harnessType?, mcpServers?, mcpTarget?}`.
     * @returns {Promise<void>}
     */
    async onAgentConfigIntent(intent={}) {
        const me = this;

        return runConfigIntentRoundTrip({
            intent,
            owner        : me,
            setSaveStatus: me.setAgentConfigSaveStatus.bind(me),
            store        : me.agentDefinitionsStore
        })
    }

    /**
     * @summary Store one agent's ephemeral save state and project it only when that agent is still
     * visible. The state survives selection changes without entering the durable roster model.
     * @param {String} agentId
     * @param {'idle'|'pending'|'accepted'|'rejected'} state
     * @param {String} [reason='']
     */
    setAgentConfigSaveStatus(agentId, state, reason='') {
        this.agentConfigSaveStatuses.set(agentId, {state, reason});
        this.getReference('agent-config-card')?.setSaveStatus(agentId, state, reason)
    }

    /**
     * @summary Hydrate the provider-hosted AgentDefinitions store from the Brain's canonical public
     * roster. A failed or stale request preserves the last rendered state. A generation guard keeps
     * a slow boot read from overwriting a newer accepted configure response.
     * @returns {Promise<Boolean>} True only when canonical roster data replaced the local projection.
     */
    async loadAgentDefinitions() {
        const
            me         = this,
            store      = me.agentDefinitionsStore,
            bridge     = globalThis.AgentOS?.fleet?.registryBridge,
            generation = (me.agentDefinitionsLoadGeneration || 0) + 1;

        me.agentDefinitionsLoadGeneration = generation;

        if (!store || typeof bridge?.listAgents !== 'function') {
            return false
        }

        // the SHARED write recency: an accepted configure readback from ANY owner (this view's
        // card OR the AgentDetail tab) bumps the store's write generation — a list snapshot older
        // than that write must never regress the store
        const writeGeneration = getDefinitionsWriteGeneration(store);

        try {
            const agents = await bridge.listAgents();

            if (!Array.isArray(agents)) {
                return false
            }
            if (
                generation !== me.agentDefinitionsLoadGeneration ||
                store      !== me.agentDefinitionsStore          ||
                getDefinitionsWriteGeneration(store) !== writeGeneration
            ) {
                return false
            }

            store.data = agents;
            me.syncAgentSelector();

            return true
        } catch (error) {
            return false
        }
    }

    /**
     * @summary Hydrate the provider-hosted FleetTenants Store from the Brain's public descriptor
     * list. The projection is curated field-by-field so a malformed bridge response cannot smuggle
     * credential-shaped data into Body state. Failed, malformed, or stale reads preserve the last
     * known tenant choices.
     * @returns {Promise<Boolean>} True only when canonical public rows replaced the Store.
     */
    async loadFleetTenants() {
        const
            me         = this,
            store      = me.fleetTenantsStore,
            bridge     = globalThis.AgentOS?.fleet?.registryBridge,
            generation = (me.fleetTenantsLoadGeneration || 0) + 1;

        me.fleetTenantsLoadGeneration = generation;

        if (!store || typeof bridge?.listTenants !== 'function') {
            return false
        }

        try {
            const tenants = await bridge.listTenants();

            if (!Array.isArray(tenants) || tenants.some(tenant =>
                !tenant ||
                typeof tenant !== 'object' ||
                Array.isArray(tenant) ||
                typeof tenant.id !== 'string' ||
                !tenant.id ||
                typeof tenant.endpoint !== 'string' ||
                !tenant.endpoint ||
                typeof tenant.status !== 'string' ||
                !tenant.status
            )) {
                return false
            }
            if (generation !== me.fleetTenantsLoadGeneration || store !== me.fleetTenantsStore) {
                return false
            }

            store.data = tenants.map(tenant => ({
                id             : tenant.id,
                endpoint       : tenant.endpoint,
                status         : tenant.status,
                deploymentClass: typeof tenant.deploymentClass === 'string' ? tenant.deploymentClass : null,
                connectedAt    : typeof tenant.connectedAt === 'string' ? tenant.connectedAt : null
            }));

            return true
        } catch {
            return false
        }
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

        // container children materialize through the API — a bare `items = [...]` assignment on a
        // LIVE container does not re-render (the stub-only shape the cycle-2 e2e falsified)
        selector.removeAll();
        selector.add(records.map(record => ({
            module : Button,
            agentId: record.id,
            cls    : ['agent-selector-button'],
            pressed: record.id === me.selectedAgentId,
            text   : record.displayName || record.githubUsername || record.id,
            handler: 'up.onSelectAgentClick'
        })));

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
                mutate      : me.onAgentRosterChange,
                recordChange: me.onAgentRosterChange,
                scope       : me
            };

        me.agentDefinitionsStore?.un({...listeners});
        me.getReference('agent-config-card')?.un({configIntent: me.onAgentConfigIntent, scope: me});
        super.destroy(...args)
    }

    /**
     * @summary Load a sample public identity without inserting credential bytes.
     * @returns {Promise<void>}
     */
    async onLoadSampleClick() {
        const
            bridge = resolveRegistryBridge(),
            form   = this.getReference('agent-form');

        await form.setValues(createDefineAgentIntent({
            credential    : '',
            githubUsername: 'neo-gpt',
            harnessType   : 'codex'
        }, bridge));

        this.updateBridgeStatus(
            'is-waiting',
            isShellCredentialIngress(bridge)
                ? 'Sample loaded. The native shell will supply the credential when you add the agent.'
                : 'Sample loaded. Enter a PAT to add the agent; the value clears after the attempt.'
        )
    }

    /**
     * @summary Validate the form, attempt the Brain-side bridge submit, and apply only the canonical
     * redacted response to the provider-owned AgentDefinitions store. A controlled registry-domain
     * rejection renders its reason without mutating Body state; an unexpected or malformed response
     * stays sanitized. After an accepted readback, `agentDefinitionAccepted` tells the Viewport
     * composition root to refresh the separately-owned Fleet roster from its Brain assembler.
     * The PAT field clears after every attempted bridge submit.
     * @returns {Promise<void>}
     */
    async onSubmitAgentClick() {
        const
            bridge     = resolveRegistryBridge(),
            shellOwned = isShellCredentialIngress(bridge),
            form       = this.getReference('agent-form'),
            valid      = await form.validate(),
            values     = await form.getSubmitValues(),
            payload    = createDefineAgentIntent(values, bridge),
            validation = validateDefinePayload(payload, {credentialRequired: !shellOwned});

        if (!valid || !validation.valid) {
            this.updateBridgeStatus('is-error', `Agent setup incomplete. ${validation.reason}`);
            return
        }

        try {
            const outcome = await this.submitToFleetRegistryBridge(payload);

            if (outcome?.status === 'rejected') {
                this.updateBridgeStatus('is-error', outcome.reason || 'Agent definition was rejected. Nothing was changed.');
                return
            }

            this.upsertPublicAgentDefinition(outcome, payload.credential);
            this.fire('agentDefinitionAccepted', {agent: outcome});
            this.updateBridgeStatus(
                'is-live',
                shellOwned
                    ? 'Agent added. Credential entry stayed in the native shell.'
                    : 'Agent added. PAT was not retained in the app worker.'
            )
        } catch (error) {
            this.updateBridgeStatus(
                'is-error',
                shellOwned
                    ? 'Could not add agent. No credential entered App Worker state.'
                    : 'Could not add agent. Nothing was stored in browser state; PAT field was cleared.'
            )
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
     * @returns {Promise<Object>} Canonical public agent definition on acceptance, or a controlled
     *     `{status:'rejected', reason}` domain outcome.
     */
    async submitToFleetRegistryBridge(payload) {
        const bridge = resolveRegistryBridge();

        if (!bridge?.defineAgent) {
            throw new Error('Fleet Registry bridge unavailable')
        }

        return bridge.defineAgent(createDefineAgentIntent(payload, bridge))
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
     * @summary Validate and write the Brain's canonical redacted response into the Viewport-owned
     * `AgentDefinitions` store. Required public identity fields and the exact submitted credential
     * are checked before mutation; a malformed or echoing response fails closed. Existing records
     * update in place, while a new definition becomes the selected Accounts resident. This is the
     * configuration projection only — the separate FleetAgent roster refreshes through the
     * Viewport-owned `agentDefinitionAccepted` composition seam.
     * @param {Object} definition Canonical public definition returned by the Brain bridge.
     * @param {String} submittedCredential Ephemeral PAT used only to reject an accidental echo.
     */
    upsertPublicAgentDefinition(definition, submittedCredential) {
        const
            store             = this.agentDefinitionsStore,
            hasTopLevelSecret = definition && ['authorization', 'credential', 'password', 'pat', 'token']
                .some(key => Object.hasOwn(definition, key));

        let serializedDefinition;

        try {
            serializedDefinition = JSON.stringify(definition)
        } catch (error) {/* invalid response */}

        if (!store || !definition?.id || !definition.githubUsername || !definition.harnessType ||
            !serializedDefinition || hasTopLevelSecret ||
            (submittedCredential && serializedDefinition.includes(submittedCredential))) {
            throw new Error('Fleet Registry returned an invalid public agent definition')
        }

        const record = store.get(definition.id);

        record ? record.set(definition) : store.add(definition);

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
