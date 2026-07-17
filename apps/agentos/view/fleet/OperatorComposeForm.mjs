import ChipField     from '../../../../src/form/field/Chip.mjs';
import ComboBoxField from '../../../../src/form/field/ComboBox.mjs';
import FormContainer from '../../../../src/form/Container.mjs';
import Button        from '../../../../src/button/Base.mjs';
import Store         from '../../../../src/data/Store.mjs';
import SwitchField   from '../../../../src/form/field/Switch.mjs';
import TextField     from '../../../../src/form/field/Text.mjs';
import TextAreaField from '../../../../src/form/field/TextArea.mjs';

/**
 * The operator's compose surface — the write half of the FM operator mailbox.
 *
 * @summary Collects one operator steering message (recipients, subject, body, priority, wake choice)
 * and fires it as a `compose` **intent event** — it never calls a transport itself.
 *
 * **Why an intent event, not a bridge call.** The submit target is the authenticated compose verb
 * (the Brain half), whose signature is server-owned and still settling. This form fires `compose`
 * with a natural payload and the cockpit controller maps that intent onto the verb — so the form is
 * decoupled from the verb contract (a signature change is a mapping edit, not a form rewrite) and,
 * like `MailboxPane`, it renders + submits but never fetches a service or authors identity: the
 * sender identity is the authenticated transport's fact end-to-end, never a field on this form.
 *
 * **The wake control is the load-bearing AC (operator-stated).** A late wake is noise
 * arriving after the recipient's turn-start drain already read the message; durability is the
 * contract, wake is the operator's explicit opt-in. So `wake` is a `Switch` **defaulting to off** —
 * the durable-quiet default the operator named preferred — never a class-forced always-wake.
 *
 * **Recipients** compose a `Chip` field: named peers (one or several) or the `AGENT:*` broadcast
 * sentinel, entered as canonical `@`-form / the sentinel. The picker is a real field, never a
 * hand-rolled tag input (`button.Base`/field discipline — the primitive supplies the states a raw
 * tag lacks). Broadcast and named recipients share one field because the transport's `to` already
 * unifies them; the controller splits per-recipient only if the verb requires it.
 *
 * The form owns no `state.Provider` (a leaf form scoped by the cockpit above it) and no `data.Store`
 * of its own — recipient *options* are supplied by the owning cockpit from the live roster it already
 * holds, injected via {@link #recipientOptions}, so this surface never reaches for a roster service.
 *
 * @class AgentOS.view.fleet.OperatorComposeForm
 * @extends Neo.form.Container
 */
class OperatorComposeForm extends FormContainer {
    static config = {
        /**
         * @member {String} className='AgentOS.view.fleet.OperatorComposeForm'
         * @protected
         */
        className: 'AgentOS.view.fleet.OperatorComposeForm',
        /**
         * @member {String} ntype='fm-operator-compose-form'
         * @protected
         */
        ntype: 'fm-operator-compose-form',
        /**
         * @member {String[]} baseCls=['fm-operator-compose-form']
         */
        baseCls: ['fm-operator-compose-form'],
        /**
         * Recipient picker options, supplied by the owning cockpit from the live roster it already
         * holds (canonical `@`-form identities) plus the `AGENT:*` broadcast sentinel. Injected so
         * this leaf never reaches for a roster service; empty until wired.
         * @member {Object[]} recipientOptions_=[]
         * @reactive
         */
        recipientOptions_: [],
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         * @reactive
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * @member {Object[]} items
         */
        items: [{
            module       : ChipField,
            reference    : 'compose-recipients',
            name         : 'to',
            labelText    : 'To',
            labelPosition: 'top',
            displayField : 'name',
            valueField   : 'id',
            // named peers and AGENT:* share one field: the transport's `to` already unifies them
            placeholderText: 'Named peer(s) or AGENT:* — durable delivery to each',
            // a real data.Store of {id: canonical-@-form, name: display} records, fed by the owning
            // cockpit's live roster via `recipientOptions` — never a hand-mapped plain array (apps/** gate)
            store: {
                module: Store,
                model : {
                    fields: [
                        {name: 'id',   type: 'String'},
                        {name: 'name', type: 'String'}
                    ]
                },
                data: []
            }
        }, {
            module       : TextField,
            reference    : 'compose-subject',
            name         : 'subject',
            labelText    : 'Subject',
            labelPosition: 'top',
            required     : true,
            maxLength    : 200
        }, {
            module       : TextAreaField,
            reference    : 'compose-body',
            name         : 'body',
            labelText    : 'Message',
            labelPosition: 'top',
            required     : true,
            height       : 160
        }, {
            module       : ComboBoxField,
            reference    : 'compose-priority',
            name         : 'priority',
            labelText    : 'Priority',
            labelPosition: 'top',
            // the transport's own priority vocabulary; normal is the honest default
            value         : 'normal',
            forceSelection: true,
            store         : {
                data: [
                    {id: 'low',    name: 'low'},
                    {id: 'normal', name: 'normal'},
                    {id: 'high',   name: 'high'}
                ]
            }
        }, {
            module       : SwitchField,
            reference    : 'compose-wake',
            name         : 'wake',
            labelText    : 'Wake recipients now',
            labelPosition: 'top',
            // AC-7: durable-quiet is the default the operator named preferred; wake is an explicit
            // opt-in accelerant, never a class-forced always-wake. A message ALWAYS lands durably and
            // is read at the recipient's turn-start; this only asks whether to also interrupt now.
            checked      : false
        }, {
            ntype : 'container',
            cls   : ['fm-operator-compose-actions'],
            flex  : 'none',
            layout: {ntype: 'hbox', align: 'center'},
            items : [{
                ntype: 'component',
                flex : 1
            }, {
                module   : Button,
                reference: 'compose-submit',
                text     : 'Send',
                iconCls  : 'fa fa-paper-plane',
                ui       : 'ghost',
                handler  : 'up.onSendClick'
            }]
        }]
    }

    /**
     * @summary Gather the validated form values and fire the `compose` intent — the cockpit maps it
     * onto the compose verb. Refuses on invalid input (the form's own field validation is the gate);
     * the send button never fabricates a partial message.
     * @protected
     */
    async onSendClick() {
        let me = this;

        if (!await me.isValid()) {
            me.focusFirstInvalidField?.();
            return
        }

        const values = await me.getSubmitValues();

        // The intent, in transport-natural shape. `wakeSuppressed` is the transport's field, and it is
        // the INVERSE of the operator's "wake now" choice: wake off ⇒ suppress the wake, keep it
        // durable-quiet. The controller maps `to`/`subject`/`body`/`priority`/`wakeSuppressed` onto
        // the compose verb; sender identity is added server-side, never here.
        me.fire('compose', {
            source : me,
            message: {
                to            : values.to,
                subject       : values.subject,
                body          : values.body,
                priority      : values.priority || 'normal',
                wakeSuppressed: !values.wake
            }
        })
    }

    /**
     * Triggered after the recipient options changed — feed them to the picker's own option store.
     * @param {Object[]} value
     * @param {Object[]} oldValue
     * @protected
     */
    afterSetRecipientOptions(value, oldValue) {
        if (!this.isConstructed) return;

        const field = this.getReference('compose-recipients');

        field?.store && (field.store.data = value)
    }
}

export default Neo.setupClass(OperatorComposeForm);
