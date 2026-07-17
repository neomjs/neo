import Model from '../../../src/data/Model.mjs';

/**
 * @class AgentOS.model.MailboxMessage
 * @extends Neo.data.Model
 *
 * @summary One immutable A2A mailbox mirror row for the AgentDetail mailbox tab — the record
 * contract IS the Fleet mailbox read adapter's frozen row shape, field for field (the S1 Brain
 * half's `createMirrorRow` projection): body-free summary facts only, keyed by the durable
 * `messageId`. Rows are timestamped facts, never live views — the store replaces them wholesale on
 * each adapter snapshot; nothing mutates a row in place, matching the surface's read-only MUST-NOT
 * (no mark-read anywhere on this side of the seam).
 *
 * `threadCollapsed` is the ONE view-owned exception: pure display state for the thread-collapse
 * affordance (a thread head renders collapsed with a count chip until expanded in place). It never
 * round-trips anywhere — expanding a thread is navigation, not data mutation.
 */
class MailboxMessage extends Model {
    static config = {
        /**
         * @member {String} className='AgentOS.model.MailboxMessage'
         * @protected
         */
        className: 'AgentOS.model.MailboxMessage',
        /**
         * The durable message identity from the Memory Core graph — never presentation.
         * @member {String} keyProperty='messageId'
         * @reactive
         */
        keyProperty: 'messageId',
        /**
         * @member {Object[]} fields
         */
        fields: [{
            name: 'messageId',
            type: 'String'
        }, {
            // redacted + length-bounded by the adapter; rendered as escaped text, never markup
            name: 'subject',
            type: 'String'
        }, {
            // canonical `@`-form sender from the adapter's identity normalization
            name: 'from',
            type: 'String'
        }, {
            // 'agent' | 'broadcast' | 'unknown' | 'other' — the adapter's recipient projection
            // (exact recipient ids stay Brain-side; the class is the honest display fact)
            name: 'recipientClass',
            type: 'String'
        }, {
            name        : 'priority',
            type        : 'String',
            defaultValue: null
        }, {
            // 'unread' | 'read' | 'retracted' — the SUBJECT agent's read state, displayed as a
            // fact about the agent's queue; the viewer can never change it from this surface
            name: 'status',
            type: 'String'
        }, {
            // A2A task envelope state ('Submitted' | 'Working' | ... ) when the message carries one;
            // null = plain message — typeless so null survives
            name        : 'taskState',
            defaultValue: null
        }, {
            // thread membership for the collapse grouping; null = standalone message
            name        : 'partOfThread',
            defaultValue: null
        }, {
            // ascending-sorted ticket numbers from the adapter's normalization
            name        : 'relatedTickets',
            type        : 'Array',
            defaultValue: null
        }, {
            name        : 'wakeSuppressed',
            type        : 'Boolean',
            defaultValue: false
        }, {
            // ISO timestamps — immutable facts; `readAt` null = unread at capture time
            name: 'sentAt',
            type: 'String'
        }, {
            name        : 'readAt',
            defaultValue: null
        }, {
            // VIEW-OWNED display state (see class summary): thread heads start collapsed
            name        : 'threadCollapsed',
            type        : 'Boolean',
            defaultValue: true
        }]
    }
}

export default Neo.setupClass(MailboxMessage);
