import MailboxMessageModel from '../model/MailboxMessage.mjs';
import Store               from '../../../src/data/Store.mjs';

/**
 * @class AgentOS.store.AgentMailbox
 * @extends Neo.data.Store
 *
 * @summary The AgentDetail mailbox tab's row layer — a Store of
 * {@link AgentOS.model.MailboxMessage} records holding ONE adapter snapshot's frozen rows for the
 * drilled-in resident. **Not a singleton and not provider-hosted**: `AgentDetail` deliberately has
 * no per-view `state.Provider` (the cockpit roster Store is the reactive layer for records), so the
 * mailbox pane owns its store instance directly — created with the pane, replaced wholesale on
 * each snapshot via {@link #applySnapshotRows}, destroyed with the pane.
 *
 * No `url`: this store is NEVER fetched. The Fleet mailbox read adapter (the S1 Brain half) is the
 * only data source, and its viewer-admission + read-only + active-inbox boundaries live on that
 * seam — the store is presentation plumbing over the adapter's immutable rows, newest first.
 */
class AgentMailbox extends Store {
    static config = {
        /**
         * @member {String} className='AgentOS.store.AgentMailbox'
         * @protected
         */
        className: 'AgentOS.store.AgentMailbox',
        /**
         * The durable message key. Declared on the store as well as the model: the collection
         * layer defaults `keyProperty` to `'id'`, which always wins the store-level
         * `this.keyProperty || this.model.keyProperty` fallback — so the model's `messageId` must
         * be mirrored here to take effect.
         * @member {String} keyProperty='messageId'
         */
        keyProperty: 'messageId',
        /**
         * @member {Neo.data.Model} model=MailboxMessageModel
         * @reactive
         */
        model: MailboxMessageModel,
        /**
         * Flat-chronological, newest first — the graduated record's binding render order; thread
         * collapse is a display grouping the view applies OVER this order, never a re-sort.
         * @member {Object[]} sorters
         */
        sorters: [{
            direction: 'DESC',
            property : 'sentAt'
        }]
    }

    /**
     * @summary Replace the store content with one adapter snapshot's rows — wholesale, never a
     * per-row merge: rows are immutable timestamped facts, so a new snapshot IS the new truth.
     * Thread-collapse display state initializes fresh on each replace (thread heads collapsed) —
     * seeded EXPLICITLY because the collection updates same-key records in place, where a model
     * default would let the previous snapshot's display state leak through.
     * @param {Object[]} rows Frozen mirror rows from `readFleetMailboxMirror`.
     */
    applySnapshotRows(rows) {
        this.data = (Array.isArray(rows) ? rows : []).map(row => ({...row, threadCollapsed: true}))
    }
}

export default Neo.setupClass(AgentMailbox);
