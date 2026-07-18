import ComboBoxField from '../../../../src/form/field/ComboBox.mjs';
import FormContainer from '../../../../src/form/Container.mjs';
import Button        from '../../../../src/button/Base.mjs';
import Label         from '../../../../src/component/Label.mjs';
import List          from '../../../../src/list/Base.mjs';
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
 * **Recipients** are a real multi-select {@link Neo.list.Base} (`singleSelect:false`) over the roster
 * store: named peers (one or several) or the `AGENT:*` broadcast row, each a canonical `@`-form / the
 * sentinel. A genuine multi-select is load-bearing — the single-select `ComboBox`/`Chip` primitive
 * collapses its value to one scalar (`getSelection()[0]`) and cannot express "several peers", so the
 * shipped `singleSelect:false` selection model is the one that can. `to` is read as the ARRAY of
 * selected ids, and the owning cockpit fans out per recipient (the compose verb is one-target).
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
            ntype : 'container',
            cls   : ['fm-operator-compose-recipients'],
            flex  : 'none',
            layout: {ntype: 'vbox', align: 'stretch'},
            items : [{
                module: Label,
                cls   : ['fm-operator-compose-recipients-label'],
                text  : 'To'
            }, {
                module      : List,
                reference   : 'compose-recipients',
                cls         : ['fm-operator-compose-recipients-list'],
                displayField: 'name',
                height      : 132,
                // real multi-select: one, several, or the AGENT:* broadcast row. singleSelect:false is the
                // shipped multi-select the single-select ComboBox/Chip primitive can't express (its value is
                // one scalar) — the operator steering several peers at once is the whole point of the surface
                selectionModel: {ntype: 'selection-listmodel', singleSelect: false},
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
            }]
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
            // the transport's own priority vocabulary; HIGH is the default (AC-7): operator steering
            // ranks first at the recipient's turn-start drain — paired with wake-off below it reads
            // "top of your queue when you next look, but I won't interrupt you now"
            value         : 'high',
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
        let me         = this,
            recipients = me.getReference('compose-recipients'),
            // the recipient list is a real multi-select (not a form field), so `to` is read from its
            // selection: each selected item id mapped back to its store record's canonical @-form / sentinel
            to         = recipients.selectionModel.getSelection()
                .map(itemId => recipients.store.get(recipients.getItemRecordId(itemId))?.id)
                .filter(Boolean);

        // require at least one recipient — the list carries no field-level `required`, so this is the gate:
        // a send with no recipient is refused, never a partial or fabricated message (the visible
        // recipient-required cue rides the outcome surface, still to land)
        if (!to.length) {
            return
        }

        if (!await me.isValid()) {
            me.focusFirstInvalidField?.();
            return
        }

        const values = await me.getSubmitValues();

        // The intent, in transport-natural shape. `to` is the ARRAY of chosen recipients — the owning
        // cockpit fans out one authenticated call per named target (AGENT:* is one server-expanded call).
        // `wakeSuppressed` is the transport's field, the INVERSE of the operator's "wake now" choice: wake
        // off ⇒ suppress the wake, keep it durable-quiet. Sender identity is added server-side, never here.
        me.fire('compose', {
            source : me,
            message: {
                to,
                subject       : values.subject,
                body          : values.body,
                priority      : values.priority || 'high',
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

        const list = this.getReference('compose-recipients');

        // feed the live roster into the multi-select list's own store, so an already-materialized picker
        // stays current across roster load / reconciliation (never snapshotted once at creation)
        list?.store && (list.store.data = value)
    }
}

export default Neo.setupClass(OperatorComposeForm);
