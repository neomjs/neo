import Base from '../../../core/Base.mjs';

/**
 * @class Neo.dashboard.dock.window.TopologySeams
 * @extends Neo.core.Base
 *
 * @summary The holder seam pair a multi-window perspective restore reaches an app through.
 *
 * `Neo.ai.client.DockService` routes a topology record through
 * {@link Neo.dashboard.dock.model.TopologyReconciler} and then commits every resulting document
 * through the holder — but only when the holder answers BOTH `getDockTopologyWorkspaces()` and
 * `commitDockTopologyWorkspaces()`. It resolves that holder as the component carrying the dock
 * document, so the seams have to be instance methods on the workspace itself; the service refuses
 * a topology record outright when either is absent, which is why an unimplemented pair reports
 * nothing and simply never restores.
 *
 * They live in a mixin rather than in `dashboard/dock/Workspace.mjs` because that file is under a
 * standing directive to stop growing, and this is a whole responsibility rather than a method.
 *
 * **Workspace keys are identity.** The seam projects the set as `{workspaceKey: document}` and the
 * commit consumes the same shape. Registration order is deliberately unobservable to persistence.
 *
 * **A workspace with no set has no topology key.** It answers an empty record rather than inventing
 * identity from a component id or runtime window id; the topology producer then fails closed.
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
     * @summary The live committed documents keyed by semantic workspace identity.
     * @returns {Object<String,Object>}
     */
    getDockTopologyWorkspaces() {
        let me  = this,
            set = me.workspaceSet,
            ids = typeof set?.ids === 'function' ? set.ids() : [];

        if (!ids.length) {
            return {}
        }

        return Object.fromEntries(ids.map(workspaceKey => [workspaceKey, set.getDocument(workspaceKey)]))
    }

    /**
     * @summary The atomic multi-document write: every keyed workspace adopts, or none does.
     *
     * A refusal returns its reason rather than throwing because the caller reads a structured
     * result: `restoreTopologyPerspective` branches on `commit?.errors?.length` and does not wrap
     * this call, so a throw would escape the refusal shape entirely and surface as an RPC crash
     * instead of a declared refusal — the same distinction `executeDockOperation` draws for the
     * single-document path.
     * @param {Object<String,Object>} workspaces Documents keyed by registered workspace identity.
     * @returns {Object} `{errors}` — empty when every workspace committed.
     */
    commitDockTopologyWorkspaces(workspaces) {
        let me  = this,
            set = me.workspaceSet;

        if (
            !workspaces || typeof workspaces !== 'object' || Array.isArray(workspaces) ||
            !Object.keys(workspaces).length || Object.values(workspaces).some(document => !document)
        ) {
            return {errors: ['a topology commit needs one committed document per registered workspace key']}
        }

        if (typeof set?.adoptAll !== 'function') {
            return {errors: ['this workspace exposes no registered workspace key for topology adoption']}
        }

        try {
            if (!set.adoptAll(workspaces)) {
                return {errors: [
                    'the workspace set refused the topology: its workspace keys do not exactly match the ' +
                    'registered workspace keys, a document is missing, or a workspace is read-only'
                ]}
            }
        } catch (error) {
            return {errors: [`topology commit rolled back: ${error.message}`]}
        }

        // The set writes each workspace through its registered `setDocument`, and every such writer in
        // the codebase is a plain assignment — `me.dockModel = document`, `me.popupDocument =
        // document`, `targetState.document = document`. `dockModel` is not a reactive config, so
        // nothing projects off the write; the document advances only inside
        // `onDockZoneDocumentChange`, which is why the primary needs this call.
        //
        // ONLY the primary converges here. A sibling workspace document is written and never
        // projected: the `register` contract carries no projection seam, and no consumer has a
        // vessel-side projection to hand it — `targetState.document` is written in five places and
        // read only by its own `getDocument`. So this restores N documents and one view. Making the
        // second window visibly converge is a missing layer, not a missing call, and it is owed
        // beyond this seam.
        me.onDockZoneDocumentChange(me.dockModel, null, me);

        return {errors: []}
    }
}

export default Neo.setupClass(TopologySeams);
