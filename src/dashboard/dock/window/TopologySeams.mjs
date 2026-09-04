import Base from '../../../core/Base.mjs';

/**
 * @class Neo.dashboard.dock.window.TopologySeams
 * @extends Neo.core.Base
 *
 * @summary The holder seam pair a multi-window perspective restore reaches an app through.
 *
 * `Neo.ai.client.DockService` routes a topology-scope record through
 * {@link Neo.dashboard.dock.model.TopologyReconciler} and then commits every resulting document
 * through the holder — but only when the holder answers BOTH `getDockTopologyDocuments()` and
 * `commitDockTopologyDocuments()`. It resolves that holder as the component carrying the dock
 * document, so the seams have to be instance methods on the workspace itself; the service refuses
 * a topology record outright when either is absent, which is why an unimplemented pair reports
 * nothing and simply never restores.
 *
 * They live in a mixin rather than in `dashboard/dock/Workspace.mjs` because that file is under a
 * standing directive to stop growing, and this is a whole responsibility rather than a method.
 *
 * **Slot order is registration order.** A host registers its primary workspace into the set first
 * (`register(MAIN, {getDocument: () => me.dockModel, …})`) and vessel workspaces as they commit, so
 * `ids()` yields primary-first — the order `Persistence.captureTopologyPerspective()` captured and
 * the reconciler restores by index. Nothing here re-derives an order; re-deriving one is how slots
 * drift apart between capture and restore.
 *
 * **A workspace with no set is not a failure case.** It answers a single-slot topology, which
 * `Persistence` documents as structurally identical to a window-scope record. What it must never do
 * is accept a multi-slot record and silently drop the slots it cannot hold.
 */
class TopologySeams extends Base {
    static config = {
        /**
         * @member {String} className='Neo.dashboard.dock.window.TopologySeams'
         * @protected
         */
        className: 'Neo.dashboard.dock.window.TopologySeams'
    }

    /**
     * @summary The ordered live committed documents, primary first — the read seam that topology
     * CAPTURE and topology RESTORE share.
     * @returns {Object[]}
     */
    getDockTopologyDocuments() {
        let me  = this,
            set = me.workspaceSet,
            ids = typeof set?.ids === 'function' ? set.ids() : [];

        if (!ids.length) {
            return me.dockModel ? [me.dockModel] : []
        }

        return ids.map(workspaceId => set.getDocument(workspaceId))
    }

    /**
     * @summary The atomic multi-document write: every slot adopts, or none does.
     *
     * A refusal returns its reason rather than throwing, because the service treats an empty or
     * missing `errors` as success — a thrown commit would read as one.
     * @param {Object[]} documents Slot-ordered committed documents, primary first.
     * @returns {Object} `{errors}` — empty when every slot committed.
     */
    commitDockTopologyDocuments(documents) {
        let me  = this,
            set = me.workspaceSet;

        if (!Array.isArray(documents) || !documents.length || documents.some(document => !document)) {
            return {errors: ['a topology commit needs one committed document per registered workspace']}
        }

        if (typeof set?.adoptAll !== 'function') {
            if (documents.length !== 1) {
                return {errors: [
                    `this workspace holds a single document and the record carries ${documents.length} — ` +
                    'a topology restore commits every slot or none'
                ]}
            }

            me.onDockZoneDocumentChange(documents[0], null, me);

            return {errors: []}
        }

        try {
            if (!set.adoptAll(documents)) {
                return {errors: [
                    'the workspace set refused the topology: the slot count does not match the registered ' +
                    'workspaces, a slot carried no document, or a workspace is read-only'
                ]}
            }
        } catch (error) {
            return {errors: [`topology commit rolled back: ${error.message}`]}
        }

        // The set writes each slot through its registered `setDocument`, which for the primary
        // assigns `dockModel` directly — the view would keep projecting the pre-restore document
        // without this. Sibling workspaces re-project through their own registered writer.
        me.onDockZoneDocumentChange(me.dockModel, null, me);

        return {errors: []}
    }
}

export default Neo.setupClass(TopologySeams);
