import FormContainer     from '../../../../src/form/Container.mjs';
import Button            from '../../../../src/button/Base.mjs';
import Label             from '../../../../src/component/Label.mjs';
import List              from '../../../../src/list/Base.mjs';
import Radio             from '../../../../src/form/field/Radio.mjs';
import RecipientChipList from './RecipientChipList.mjs';
import Store             from '../../../../src/data/Store.mjs';
import SwitchField       from '../../../../src/form/field/Switch.mjs';
import TextField         from '../../../../src/form/field/Text.mjs';
import TextAreaField     from '../../../../src/form/field/TextArea.mjs';

const BROADCAST_ID = 'AGENT:*';

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
 * **Removable selection.** The list opts into `toggleOnClick` (click a selected row to
 * unselect), and the CURRENT selection renders through {@link AgentOS.view.fleet.RecipientChipList}
 * — a projection over the picker's own Store instance (shared, never owned) rendering the
 * selected subset of the SAME records, so a roster rename or removal converges into the chips
 * instead of freezing in a snapshot. Each chip's native close button removes exactly that
 * recipient, routed through the selection model. The `AGENT:*` sentinel is exclusive: it and
 * named picks never co-exist — whichever side was newly picked wins, the other yields. Priority is
 * a three-option radio group (the whole decision space visible), `high` remaining the shipped
 * default per the AC-7 steering rationale.
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
         * The send outcome, written back by the owning cockpit once the compose verb settles (this form
         * fires the intent and holds no transport, so the RESULT returns as owner-set state, never off the
         * fire-and-forget event): `null` = nothing sent yet, `{status:'pending', count}` while the fan-out
         * is in flight, or `{results:[{to, outcome}]}` — one honest per-recipient verdict (sent / not-wired
         * / rejected / error). Rendered so a refusal is never invisible.
         * @member {Object|null} composeOutcome_=null
         * @reactive
         */
        composeOutcome_: null,
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
                // the CURRENT selection as removable chips — a projection over the picker's OWN
                // Store instance (handed over in onConstructed, shared never owned): the chips
                // render the selected subset of the SAME records, so a roster rename or removal
                // after selection converges instead of freezing in a snapshot
                module   : RecipientChipList,
                reference: 'compose-recipient-chips',
                flex     : 'none'
            }, {
                module      : List,
                reference   : 'compose-recipients',
                cls         : ['fm-operator-compose-recipients-list'],
                displayField: 'name',
                height      : 132,
                // real multi-select: one, several, or the AGENT:* broadcast row. singleSelect:false is the
                // shipped multi-select the single-select ComboBox/Chip primitive can't express (its value is
                // one scalar) — the operator steering several peers at once is the whole point of the surface.
                // toggleOnClick is the removable-selection floor: clicking a selected row unselects it.
                selectionModel: {ntype: 'selection-listmodel', singleSelect: false, toggleOnClick: true},
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
            // priority as a 3-option radio group (operator UX: "combo for 3 items is bad
            // UX" — the whole decision space visible at zero cost). The Accounts harness-picker
            // idiom: shared name, per-option valueLabel, one field label on the first. HIGH stays
            // the default — the shipped product decision (operator steering ranks first at the
            // recipient's turn-start drain; today's wake-priority incident is its proof), amending
            // the ticket's original normal-default line.
            ntype : 'container',
            cls   : ['fm-compose-priority'],
            flex  : 'none',
            layout: {ntype: 'hbox', align: 'center'},
            items : [
                {id: 'low', label: 'low'}, {id: 'normal', label: 'normal'}, {id: 'high', label: 'high'}
            ].map((entry, index) => ({
                module        : Radio,
                reference     : `compose-priority-${entry.id}`,
                checked       : entry.id === 'high',
                hideValueLabel: false,
                labelText     : index === 0 ? 'Priority' : '',
                name          : 'priority',
                value         : entry.id,
                valueLabel    : entry.label
            }))
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
        }, {
            // the send-outcome surface — per-recipient verdicts land here so a refusal/failure is never
            // silent; empty until the owner writes `composeOutcome` back (see afterSetComposeOutcome)
            ntype    : 'component',
            reference: 'compose-outcome',
            cls      : ['fm-operator-compose-outcome'],
            flex     : 'none'
        }]
    }

    /**
     * The previous recipient selection (canonical ids) — the direction memory the broadcast
     * exclusivity rule needs: knowing WHICH side of AGENT:*-vs-named was newly picked decides
     * which side yields.
     * @member {Set} #lastRecipientIds=new Set()
     * @private
     */
    #lastRecipientIds = new Set()
    /**
     * Reentrancy guard: the exclusivity rule deselects from INSIDE the selectionChange handler,
     * which re-fires it — one pass settles the state, the echo returns early.
     * @member {Boolean} #syncingSelection=false
     * @private
     */
    #syncingSelection = false

    /**
     * @summary Bind the recipient chips + broadcast rule to the list's selection lifecycle, and
     * complete the projection wiring: the chip row receives the picker's Store INSTANCE (shared,
     * never owned) once both exist. The selectionModel fires `selectionChange` for select AND
     * deselect (the toggle path included), so one subscription owns the whole presentation sync.
     */
    onConstructed() {
        super.onConstructed();

        let me    = this,
            chips = me.getReference('compose-recipient-chips'),
            list  = me.getReference('compose-recipients');

        if (chips && list?.store) {
            chips.store = list.store;
            chips.on('removerecipient', me.onRecipientChipRemove, me)
        }

        list?.selectionModel?.on('selectionChange', me.onRecipientSelectionChange, me)
    }

    /**
     * @summary The one selection-truth sync: applies the broadcast exclusivity rule —
     * `AGENT:*` and named recipients never co-exist; whichever side was newly picked wins and the
     * other yields — then writes the settled selection into the chip projection's id-filter. The
     * chips stay a filtered view over the picker's records, never a second truth.
     * @protected
     */
    onRecipientSelectionChange() {
        let me    = this,
            list  = me.getReference('compose-recipients'),
            model = list?.selectionModel;

        if (!model || me.#syncingSelection) {
            return
        }

        let records = model.items
                .map(vdomId => list.store.get(list.getItemRecordId(vdomId)))
                .filter(Boolean),
            ids       = new Set(records.map(record => record.id)),
            broadcast = ids.has(BROADCAST_ID);

        // exclusivity: decide by what is NEW relative to the last settled state
        if (broadcast && ids.size > 1) {
            const broadcastIsNew = !me.#lastRecipientIds.has(BROADCAST_ID);

            me.#syncingSelection = true;

            try {
                records.forEach(record => {
                    const yields = broadcastIsNew ? record.id !== BROADCAST_ID : record.id === BROADCAST_ID;
                    yields && model.deselect(record)
                })
            } finally {
                me.#syncingSelection = false
            }

            // re-read the settled selection for the chip row
            records = model.items
                .map(vdomId => list.store.get(list.getItemRecordId(vdomId)))
                .filter(Boolean);
            ids = new Set(records.map(record => record.id))
        }

        me.#lastRecipientIds = ids;

        // ONE id-list write projects the settled selection into the chip row — the records
        // themselves stay the picker Store's, rendered in place
        const chips = me.getReference('compose-recipient-chips');

        chips && (chips.selectedIds = [...ids])
    }

    /**
     * @summary A chip's close button removes exactly its recipient — routed through the selection
     * model, so the picker row unhighlights and the chip projection follows via its filter.
     * @param {Object} data
     * @param {String} data.recipientId
     * @protected
     */
    onRecipientChipRemove({recipientId}) {
        let list   = this.getReference('compose-recipients'),
            record = list?.store.get(recipientId);

        record && list.selectionModel.deselect(record)
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

        // the honest "in flight" state — shown until the owner writes the settled per-recipient outcome back
        me.composeOutcome = {status: 'pending', count: to.length};

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
     * Triggered after the recipient options changed — feed them to the picker's own option store,
     * then converge the selection state onto the new roster: a selected recipient the roster no
     * longer carries is pruned from the selection model, and the chip projection re-syncs, so the
     * picker rows, the chips, and the eventual `to` array agree after every roster replacement.
     * @param {Object[]} value
     * @param {Object[]} oldValue
     * @protected
     */
    afterSetRecipientOptions(value, oldValue) {
        if (!this.isConstructed) return;

        let me    = this,
            list  = me.getReference('compose-recipients'),
            model = list?.selectionModel;

        if (!list?.store) return;

        // the selection holds RENDERED item ids, which rotate with a data replacement — so the
        // canonical recipient ids are read out BEFORE the swap; they are the durable identity
        const selectedRecipientIds = model?.getSelection()
            .map(itemId => list.store.get(list.getItemRecordId(itemId))?.id)
            .filter(Boolean) || [];

        // feed the live roster into the multi-select list's own store, so an already-materialized picker
        // stays current across roster load / reconciliation (never snapshotted once at creation)
        list.store.data = value;

        // re-key the selection onto the new records: survivors re-select by canonical id, a
        // recipient the roster no longer carries is pruned by construction — then one settled
        // re-sync converges the exclusivity memory and the chip projection in every case
        // (including zero survivors and rename-only)
        if (model) {
            const survivors = selectedRecipientIds.map(id => list.store.get(id)).filter(Boolean);

            model.deselectAll(true);
            survivors.length && model.select(survivors)
        }

        me.onRecipientSelectionChange()
    }

    /**
     * Triggered after the send outcome changed — render the per-recipient verdicts (or the pending line,
     * or clear). The owner writes this once the compose verb settles; it is the ONLY place a refusal /
     * failure becomes visible, since the form fires the send intent-only and never sees the promise itself.
     * @param {Object|null} value
     * @param {Object|null} oldValue
     * @protected
     */
    afterSetComposeOutcome(value, oldValue) {
        if (!this.isConstructed) return;

        const outcome = this.getReference('compose-outcome');

        if (outcome) {
            outcome.vdom.cn = this.buildOutcomeRows(value);
            outcome.update()
        }
    }

    /**
     * @summary Build the outcome vdom rows: none when idle, one pending line while the fan-out is in flight,
     * or one line PER recipient carrying its own verdict — sent (a messageId came back), not-wired, rejected,
     * or error — each with a status class the skin colors. The several-recipient path renders several rows,
     * so a partial batch (one sent, one refused) is shown honestly, never collapsed to a single verdict.
     * @param {Object|null} value
     * @returns {Object[]}
     * @protected
     */
    buildOutcomeRows(value) {
        if (!value) return [];

        if (value.status === 'pending') {
            return [{cls: ['fm-compose-outcome-row', 'is-pending'], text: `Sending to ${value.count}…`}]
        }

        return (value.results || []).map(({to, outcome}) => {
            let cls = ['fm-compose-outcome-row'], text;

            if (outcome?.messageId) {
                cls.push('is-sent');    text = `${to} — sent`
            } else if (outcome?.status === 'not-wired') {
                cls.push('is-refused'); text = `${to} — not wired`
            } else if (outcome?.status === 'rejected') {
                cls.push('is-refused'); text = `${to} — ${outcome.reason || 'rejected'}`
            } else {
                cls.push('is-error');   text = `${to} — ${outcome?.reason || 'failed'}`
            }

            return {cls, text}
        })
    }
}

export default Neo.setupClass(OperatorComposeForm);
