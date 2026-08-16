import Container           from '../../../../src/container/Base.mjs';
import MailboxPane         from './MailboxPane.mjs';
import OperatorComposeForm from './OperatorComposeForm.mjs';

/**
 * The FM cockpit's **operator mailbox** — the operator's own inbox over the compose surface: the
 * read half the operator asked to steer THROUGH, plus the write half that replaces prompt-only
 * steering.
 *
 * @summary Composes the shipped {@link AgentOS.view.fleet.MailboxPane} (pointed at the operator's
 * own identity) above {@link AgentOS.view.fleet.OperatorComposeForm}, and RELAYS both surfaces'
 * intents up to the cockpit — it performs no transport itself.
 *
 * **Why a relay, not a doer.** Both children fire intents the OWNER services against the
 * authenticated seam: the inbox pane fires `pageRequest` (the cockpit re-reads the operator mirror
 * at the new offset — exactly AgentDetail's read-seam split), and the compose form fires `compose`
 * (the cockpit maps it onto the compose verb). This surface holds neither the read seam nor the
 * verb, so it forwards both — keeping identity a transport fact end-to-end, never authored here.
 *
 * **Capability today = the shipped read-only pane.** The pane is read-only by its own MUST-NOT
 * (operator mark-read would mutate an agent's turn-start signal). The operator's OWN inbox is the
 * one place mark-read is legitimate (own-inbox capability, keyed by the server-stamped viewer↔target
 * relation) — but that write verb is NOT wired here, and this surface does not fake it: own-inbox
 * mark-read is an EXPLICIT deferred acceptance criterion (tracked as remaining ticket work), never
 * silently claimed as landing elsewhere. What ships is the honest read (the pane's four states) + live
 * compose with per-recipient outcomes; the surface is complete and inert-safe for what it does not yet do.
 *
 * The container owns no `state.Provider` (the cockpit scopes it) — `record` / `snapshot` /
 * `recipientOptions` are injected by the cockpit from state it already holds, and passed straight
 * through to the children, so this surface never reaches for a service.
 *
 * @class AgentOS.view.fleet.OperatorMailbox
 * @extends Neo.container.Base
 */
class OperatorMailbox extends Container {
    static config = {
        /**
         * @member {String} className='AgentOS.view.fleet.OperatorMailbox'
         * @protected
         */
        className: 'AgentOS.view.fleet.OperatorMailbox',
        /**
         * @member {String} ntype='fm-operator-mailbox'
         * @protected
         */
        ntype: 'fm-operator-mailbox',
        /**
         * @member {String[]} baseCls=['fm-operator-mailbox']
         */
        baseCls: ['fm-operator-mailbox'],
        /**
         * The operator identity record (only `githubUsername` is read — the pane's subject-match
         * authority); injected by the cockpit. `null` = the inbox's honest unwired state.
         * @member {Object|null} record_=null
         * @reactive
         */
        record_: null,
        /**
         * One Fleet mailbox-mirror snapshot for the OPERATOR's own inbox (server-read via the
         * authenticated viewer identity); `null` = `unobserved`. Passed straight to the inbox pane.
         * @member {Object|null} snapshot_=null
         * @reactive
         */
        snapshot_: null,
        /**
         * Recipient picker options (`{id, name}`), injected by the cockpit from its live roster and
         * passed straight to the compose form.
         * @member {Object[]} recipientOptions_=[]
         * @reactive
         */
        recipientOptions_: [],
        /**
         * The compose send outcome, set by the cockpit once the compose verb settles and passed straight
         * to the compose form to render (per-recipient sent / not-wired / rejected / error). `null` = idle.
         * This surface holds no transport — the outcome is owner-written state, never read here.
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
            module   : MailboxPane,
            flex     : 1,
            header   : {text: 'Your inbox'},
            reference: 'operator-inbox-pane'
        }, {
            // shrinkable, never 'none': in the height-bounded drawer slot the form's natural
            // height exceeds the well, and a rigid form starves the inbox above it to 0px —
            // the read half must survive the write half. The skin adds the internal scroll +
            // the inbox floor.
            module   : OperatorComposeForm,
            flex     : '0 1 auto',
            reference: 'operator-compose-form'
        }]
    }

    /**
     * @summary Wire the two child intents up to the owner AND flush any projection-injected state to the
     * children. Wired explicitly (not via a string handler) — like AgentDetail, this surface carries no
     * controller for one to resolve against.
     *
     * The flush is load-bearing: `afterSetRecord`/`afterSetSnapshot`/`afterSetRecipientOptions` all return
     * early while `!isConstructed`, so `record`/`snapshot`/`recipientOptions` supplied as construction
     * configs (the normal reveal-after-boot path, when the cockpit already holds the resolved operator
     * identity) never reached the children — the pane materialized empty and could not pass possession.
     * Flush them here, then a construction-time identity kicks its first read exactly as a live set does.
     * @param {...*} args
     */
    onConstructed(...args) {
        super.onConstructed(...args);

        const
            me    = this,
            inbox = me.getReference('operator-inbox-pane'),
            form  = me.getReference('operator-compose-form');

        inbox?.on('pageRequest', me.onInboxPageRequest, me);
        form?.on('compose', me.onCompose, me);

        if (inbox) {
            me.record   && (inbox.record   = me.record);
            me.snapshot && (inbox.snapshot = me.snapshot)
        }
        form && me.recipientOptions?.length && (form.recipientOptions = me.recipientOptions);

        // a construction-time identity lands its first inbox read without a page gesture (afterSetRecord
        // was skipped pre-construct, so this is the single fire for the reveal path)
        me.record && me.onInboxPageRequest({offset: 0})
    }

    /**
     * Triggered after the operator record changed — the inbox pane's subject follows it, and a newly-bound
     * identity kicks the first own-inbox read. The owner (cockpit) holds the read seam, so this fires the
     * `inboxPageRequest` relay rather than reading here: a pane materialized after boot — when the operator
     * identity is already resolved owner-side — lands its inbox without a page gesture, exactly as
     * {@link AgentOS.view.fleet.AgentDetail} reads on its record.
     * @param {Object|null} value
     * @param {Object|null} oldValue
     * @protected
     */
    afterSetRecord(value, oldValue) {
        if (!this.isConstructed) return;

        this.getReference('operator-inbox-pane').record = value;
        // a real identity (null → record) triggers the first read; the owner services it against the mirror
        value && this.onInboxPageRequest({offset: 0})
    }

    /**
     * Triggered after the operator inbox snapshot changed — passed straight to the pane.
     * @param {Object|null} value
     * @param {Object|null} oldValue
     * @protected
     */
    afterSetSnapshot(value, oldValue) {
        this.isConstructed && (this.getReference('operator-inbox-pane').snapshot = value)
    }

    /**
     * Triggered after the recipient options changed — passed straight to the compose form.
     * @param {Object[]} value
     * @param {Object[]} oldValue
     * @protected
     */
    afterSetRecipientOptions(value, oldValue) {
        this.isConstructed && (this.getReference('operator-compose-form').recipientOptions = value)
    }

    /**
     * Triggered after the compose outcome changed — passed straight to the compose form, which renders the
     * per-recipient verdicts. Set by the cockpit once the compose verb settles (this surface holds no
     * transport; the outcome is owner-written state).
     * @param {Object|null} value
     * @param {Object|null} oldValue
     * @protected
     */
    afterSetComposeOutcome(value, oldValue) {
        this.isConstructed && (this.getReference('operator-compose-form').composeOutcome = value)
    }

    /**
     * @summary Relay the inbox's page intent to the owner — the cockpit holds the read seam and
     * re-reads the operator mirror at the requested offset.
     * @param {Object} data The pane's `pageRequest` payload (`{offset, source}`).
     * @protected
     */
    onInboxPageRequest(data) {
        this.fire('inboxPageRequest', {...data, source: this})
    }

    /**
     * @summary Relay the compose intent to the owner — the cockpit maps it onto the compose verb.
     * @param {Object} data The form's `compose` payload (`{message, source}`).
     * @protected
     */
    onCompose(data) {
        this.fire('compose', {message: data.message, source: this})
    }
}

export default Neo.setupClass(OperatorMailbox);
