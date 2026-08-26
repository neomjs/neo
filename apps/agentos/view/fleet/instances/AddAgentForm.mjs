import Button             from '../../../../../src/button/Base.mjs';
import FormContainer      from '../../../../../src/form/Container.mjs';
import PasswordField      from '../../../../../src/form/field/Password.mjs';
import TextField          from '../../../../../src/form/field/Text.mjs';
import {listHarnessTypes} from '../../../config/harnessTypes.mjs';
import AddAgentFlow       from '../../../util/AddAgentFlow.mjs';

/**
 * @class AgentOS.view.fleet.instances.AddAgentForm
 * @extends Neo.form.Container
 *
 * @summary The S5 add-agent surface (design SSOT Lane D1): username + harness type, plus a PAT only
 * for direct-browser ingress → the Fleet Registry bridge, rendered to the cockpit token layer (`--fm-*`) under the
 * honest-lifecycle contract — `idle → validating → submitting → readback-confirmed | gated |
 * rejected`, with the registry's canonical readback as the ONLY success truth.
 *
 * Mount-independent by design: the form ends at the `agentDefinitionAccepted` event carrying the
 * validated public definition — the mounting owner (dock zone or detail tab, the S5 fork) wires
 * the roster write. It holds no store and no credential state:
 *
 * Credential boundary (the fleet credential matrix): a direct-browser PAT lives in the password
 * field only as long as a submission needs it — never in browser persistent state, never in the URL,
 * never logged or echoed — and the field clears on EVERY settle, terminal state regardless. A bridge
 * marked `credentialIngress: 'shell'` removes that field before mount and sends public intent only;
 * the native shell owns credential entry. Bridge absent → the submit control is
 * **disabled-with-reason** (CARD-CONTRACT controls rule: never hidden), state `gated`, and no fake
 * affordance pretends a round-trip is possible.
 */
class AddAgentForm extends FormContainer {
    static config = {
        /**
         * @member {String} className='AgentOS.view.fleet.instances.AddAgentForm'
         * @protected
         */
        className: 'AgentOS.view.fleet.instances.AddAgentForm',
        /**
         * @member {String} ntype='fm-add-agent-form'
         * @protected
         */
        ntype: 'fm-add-agent-form',
        /**
         * @member {String[]} baseCls=['fm-add-agent-form']
         */
        baseCls: ['fm-add-agent-form'],
        /**
         * The selector-chip primitive's skin (fleet/mailbox/Chips.scss) has no view class of its
         * own — the harness chips this form renders load it via the shared-partial mechanism, the
         * same way the dockdemo workspaces pull 'Neo.dashboard.Container'.
         * @member {String[]} additionalThemeFiles=['AgentOS.view.fleet.mailbox.Chips']
         */
        additionalThemeFiles: ['AgentOS.view.fleet.mailbox.Chips'],
        /**
         * Optional injected Fleet-Registry-bridge resolver — the DI seam (the injected-reader
         * discipline): owners and specs pass a function returning a bridge; null falls back to the
         * global `AgentOS.fleet.registryBridge` seam. The form never constructs a bridge.
         * @member {Function|null} bridgeResolver=null
         */
        bridgeResolver: null,
        /**
         * The flow's rendered lifecycle state — `{state, reason}` with state in the
         * {@link module:apps/agentos/view/fleet/addAgentFlow~ADD_AGENT_STATES flow vocabulary}.
         * Reactive: every transition re-renders the status line + control affordances.
         * @member {Object} flowStatus_={state:'idle',reason:''}
         * @reactive
         */
        flowStatus_: {state: 'idle', reason: ''},
        /**
         * The selected harness type — chip-driven (registry product language), not a form field.
         * @member {String|null} harnessType_=null
         * @reactive
         */
        harnessType_: null,
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         * @reactive
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * The form anatomy — heading · username · PAT · harness chip row (registry-derived) ·
         * actions (submit) · status line. Geometry + skin in `AddAgentForm.scss`, colors token-only.
         * @member {Object[]} items
         */
        // every row is flex:'none': the vbox default (grow 1) would distribute a stretched host's
        // height evenly across the anatomy — exactly the multi-hundred-px gaps the drawer showed.
        // Rows keep their natural height; a taller mount leaves quiet well space instead.
        items: [{
            ntype: 'component',
            cls  : ['fm-add-heading'],
            flex : 'none',
            vdom : {cn: [{tag: 'strong', text: 'Add an agent'}]}
        }, {
            module         : TextField,
            clearable      : true,
            flex           : 'none',
            labelPosition  : 'inline',
            labelText      : 'GitHub username',
            name           : 'githubUsername',
            placeholderText: 'neo-kimi-phoebe',
            reference      : 'field-username',
            required       : true
        }, {
            module         : PasswordField,
            clearable      : true,
            flex           : 'none',
            labelPosition  : 'inline',
            labelText      : 'GitHub PAT',
            name           : 'credential',
            placeholderText: 'stored Brain-side only',
            reference      : 'field-credential',
            required       : true
        }, {
            // one registration in config/harnessTypes.mjs = one more chip here — the row derives
            // from the registry, labels are the registry's product language (config-card twin)
            ntype    : 'container',
            cls      : ['fm-add-harness-row'],
            flex     : 'none',
            layout   : {ntype: 'hbox', align: 'center', wrap: 'wrap'},
            reference: 'harness-row',

            items: listHarnessTypes().map(entry => ({
                module     : Button,
                cls        : ['fm-chip'],
                text       : entry.label,
                handler    : 'up.onHarnessChipClick',
                harnessType: entry.type
            }))
        }, {
            ntype : 'container',
            cls   : ['fm-add-actions'],
            flex  : 'none',
            layout: {ntype: 'hbox', align: 'center'},

            items: [{
                module   : Button,
                cls      : ['fm-add-submit'],
                handler  : 'up.onSubmitClick',
                iconCls  : 'fa fa-lock',
                reference: 'submit-button',
                text     : 'Add agent'
            }]
        }, {
            ntype    : 'component',
            cls      : ['fm-add-status', 'is-idle'],
            flex     : 'none',
            reference: 'flow-status'
        }]
    }

    /**
     * @summary Probe the bridge seam once composed: an absent bridge renders the `gated` state
     * up-front — the operator learns the affordance is closed before typing a credential into it.
     * @param {...*} args
     */
    onConstructed(...args) {
        super.onConstructed(...args);

        const
            me          = this,
            bridge      = AddAgentFlow.resolveRegistryBridge(me.bridgeResolver),
            shellOwned  = AddAgentFlow.isShellCredentialIngress(bridge),
            secretField = me.getReference('field-credential');

        me.harnessType ??= listHarnessTypes()[0]?.type ?? null;
        me.syncHarnessChips();

        if (shellOwned) {
            secretField && me.remove(secretField);
        }

        if (!bridge?.defineAgent) {
            me.flowStatus = {
                state : 'gated',
                reason: 'Fleet Registry bridge unavailable — agent setup fails closed. Start the fleet server from the neo-agent-brain checkout.'
            }
        } else if (shellOwned) {
            me.flowStatus = {
                state : 'idle',
                reason: 'Credential entry is owned by the native shell and never enters App Worker state.'
            }
        }
    }

    /**
     * Triggered after the flowStatus config got changed — render the status line and the submit
     * affordance from the new state. Disabled-with-reason on `gated` and while `submitting`;
     * the reason text IS the status line (never a hidden control, never a tooltip-only fact).
     * @param {Object} value
     * @param {Object} oldValue
     * @protected
     */
    afterSetFlowStatus(value, oldValue) {
        if (oldValue === undefined) {
            return
        }

        const
            me     = this,
            status = me.getReference('flow-status'),
            submit = me.getReference('submit-button'),
            busy   = value.state === 'validating' || value.state === 'submitting';

        status?.set({
            cls : ['fm-add-status', `is-${value.state}`],
            text: value.reason || me.statusLineFor(value.state)
        });

        submit?.set({disabled: value.state === 'gated' || busy})
    }

    /**
     * Triggered after the harnessType config got changed — re-mark the chip row.
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetHarnessType(value, oldValue) {
        oldValue !== undefined && this.syncHarnessChips()
    }

    /**
     * @summary Default operator-facing line per flow state, used when an outcome carries no reason.
     * @param {String} state
     * @returns {String}
     */
    statusLineFor(state) {
        const shellOwned = AddAgentFlow.isShellCredentialIngress(AddAgentFlow.resolveRegistryBridge(this.bridgeResolver));

        return {
            'idle'              : shellOwned
                ? 'Credential entry is owned by the native shell and never enters App Worker state.'
                : 'PAT is submitted to the Brain-side registry and never stored in browser state.',
            'validating'        : 'Checking the definition…',
            'submitting'        : 'Submitting through the Fleet Registry bridge…',
            'readback-confirmed': 'Agent added — roster renders the registry\'s canonical readback.'
        }[state] ?? ''
    }

    /**
     * @summary Mark the selected harness chip (`is-selected`) across the registry-derived row.
     */
    syncHarnessChips() {
        const me = this;

        me.getReference('harness-row')?.items.forEach(chip => {
            chip[chip.harnessType === me.harnessType ? 'addCls' : 'removeCls']('is-selected')
        })
    }

    /**
     * @summary One chip click = the harness selection (config-card interaction twin).
     * @param {Object} data
     */
    onHarnessChipClick(data) {
        this.harnessType = data.component.harnessType
    }

    /**
     * @summary Drive one full flow round-trip: validate → submit → render the terminal outcome —
     * and clear the PAT field on EVERY settle path — the credential outlives no attempt.
     * An accepted readback fires `agentDefinitionAccepted` for the mounting owner's roster write.
     * @returns {Promise<void>}
     */
    async onSubmitClick() {
        const
            me         = this,
            values     = await me.getSubmitValues(),
            bridge     = AddAgentFlow.resolveRegistryBridge(me.bridgeResolver),
            shellOwned = AddAgentFlow.isShellCredentialIngress(bridge),
            payload    = AddAgentFlow.createDefineAgentIntent({
                credential    : values.credential,
                githubUsername: values.githubUsername,
                harnessType   : me.harnessType
            }, bridge);

        me.flowStatus = {state: 'validating', reason: ''};

        try {
            const validation = AddAgentFlow.validateDefinePayload(payload, {credentialRequired: !shellOwned});

            // an incomplete definition never renders `submitting` — nothing is in flight
            if (!validation.valid) {
                me.flowStatus = {state: 'rejected', reason: validation.reason};
                return
            }

            me.flowStatus = {state: 'submitting', reason: ''};

            const outcome = await AddAgentFlow.submitDefineAgent({bridgeResolver: me.bridgeResolver, payload});

            me.flowStatus = {state: outcome.state, reason: outcome.reason};

            if (outcome.state === 'readback-confirmed') {
                me.fire('agentDefinitionAccepted', {agent: outcome.definition})
            }
        } finally {
            me.getReference('field-credential')?.reset('')
        }
    }
}

export default Neo.setupClass(AddAgentForm);
