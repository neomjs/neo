import Base                  from '../core/Base.mjs';
import CrossWindowDragTarget from './CrossWindowDragTarget.mjs';
import DockZoneModel         from './DockZoneModel.mjs';

/**
 * @class Neo.dashboard.DockCrossWindowParticipation
 * @extends Neo.core.Base
 *
 * @summary The adapter-tier composition that makes ONE dock workspace a cross-window drag
 * participant — the integration half of the harness docking design record's §2.3 (see
 * `learn/agentos/decisions/0029-harness-docking-design.md`) over exclusively LANDED machinery.
 *
 * It owns the target registration lifecycle (create on workspace mount, destroy on unmount) and
 * binds the five owner seams of {@link Neo.dashboard.CrossWindowDragTarget} to the workspace's
 * landed pipeline, adding exactly ONE new decision: foreign-vs-local drop discrimination at
 * commit time.
 *
 * - **Local drop** (the payload's source workspace IS this one — two windows may project the
 *   same document): the converted operation rides the owner's landed single-document commit
 *   seam — the identical pipeline in-window drags use. No parallel drag system (§2.3 inherited
 *   guardrail).
 * - **Foreign drop** (the item belongs to a sibling window's workspace on the same App-Worker
 *   heap): the converted `addTab`/`splitNode` descriptor becomes the nested `target` of ONE
 *   semantic `transferItem` operation, executed through the landed atomic two-document executor
 *   ({@link Neo.dashboard.DockZoneModel#transferItem}) — commit-or-neither, item record verbatim,
 *   live component instances move and are never re-instantiated (§2.6). The durable placement
 *   hints (`owningWorkspaceId`, `fallbackTarget`) update on the transferred record **in the same
 *   commit**, per the §2.1 durable-tier table — semantic node references, never geometry.
 *
 * Layer discipline (the target's established layer note, unchanged): `src/dashboard/` imports no app module —
 * every seam below arrives from the app-side workspace composition, which keeps authoring the
 * preview visuals. The {@link Neo.manager.DragCoordinator} stays dock-blind: all dock semantics
 * live here and in the seams, never in the coordinator (§2.3 binding invariant).
 *
 * The cross-window drag payload contract (stamped by {@link Neo.dashboard.DockTabSortZone} at
 * drag start): `draggedItem.dockItemId` names the dock catalog item, and
 * `draggedItem.dockSourceWorkspaceId` names the workspace document it departs. The local/foreign
 * discriminator keys on the LATTER's identity with this workspace — item-id presence in the
 * target catalog is never ownership evidence (a foreign item with a colliding id must reach the
 * executor's fail-closed collision rejection, not commit the local record) — and a payload
 * missing either stamp fails closed (no signal-free guessing).
 */
class DockCrossWindowParticipation extends Base {
    static config = {
        /**
         * @member {String} className='Neo.dashboard.DockCrossWindowParticipation'
         * @protected
         */
        className: 'Neo.dashboard.DockCrossWindowParticipation',
        /**
         * @member {String} ntype='dock-crosswindow-participation'
         * @protected
         */
        ntype: 'dock-crosswindow-participation',
        /**
         * Owner seam, forwarded to the target: clears the workspace's preview overlay when a
         * remote drag leaves. Optional.
         * @member {Function|null} clearPreview=null
         */
        clearPreview: null,
        /**
         * Owner seam: the workspace's landed single-document commit path — receives the converted
         * operation descriptor for a LOCAL drop and returns the executor result
         * (`{document, errors}`-shaped) or a falsy value. The same seam in-window drops ride.
         * @member {Function|null} commitLocal=null
         */
        commitLocal: null,
        /**
         * Owner seam: publishes an atomically-transferred document PAIR through the workspace
         * set's change-notification path. Receives
         * `{sourceWorkspaceId, sourceDocument, targetWorkspaceId, targetDocument, descriptor}`
         * where both documents are the executor's committed results (hints already updated).
         * @member {Function|null} commitTransfer=null
         */
        commitTransfer: null,
        /**
         * Forwarded to the target: the arbitration registry. Defaults to the
         * `Neo.manager.DragCoordinator` singleton inside the target; unit tests inject a stand-in.
         * @member {Neo.manager.DragCoordinator|null} dragCoordinator=null
         * @protected
         */
        dragCoordinator: null,
        /**
         * Owner seam: `(sourceWorkspaceId) => document` — resolves a sibling workspace's committed
         * document from the worker-owned workspace set. Foreign drops fail closed without it.
         * @member {Function|null} getForeignDocument=null
         */
        getForeignDocument: null,
        /**
         * Owner seam: `() => document` — this workspace's committed document (the discrimination
         * + transfer-target input). Required.
         * @member {Function|null} getDocument=null
         */
        getDocument: null,
        /**
         * Owner seam, forwarded to the target: cheap window-local hit-test (§2.3, side-effect
         * free). Without it the workspace never claims a remote drag (fail-closed).
         * @member {Function|null} hitTest=null
         */
        hitTest: null,
        /**
         * Owner seam, forwarded to the target: maps a remote hover payload onto the workspace's
         * landed `dockPreview` compute+render path.
         * @member {Function|null} previewFor=null
         */
        previewFor: null,
        /**
         * Owner seam, forwarded to the target: the workspace's landed `previewToOperation`
         * converter — the single preview→operation pipeline.
         * @member {Function|null} previewToOperation=null
         */
        previewToOperation: null,
        /**
         * §2.3 registry identity, forwarded to the target: only targets sharing the drag source's
         * `sortGroup` are arbitration candidates.
         * @member {String|null} sortGroup=null
         */
        sortGroup: null,
        /**
         * §2.3 registry identity, forwarded to the target: the window this workspace renders in.
         * @member {String|Number|null} windowId=null
         */
        windowId: null,
        /**
         * This workspace's id in the worker-owned workspace set — the `targetWorkspaceId` of every
         * foreign transfer committed here.
         * @member {String|null} workspaceId=null
         */
        workspaceId: null
    }

    /**
     * The registered {@link Neo.dashboard.CrossWindowDragTarget} this participation owns.
     * Created in {@link #construct}, destroyed with this instance.
     * @member {Neo.dashboard.CrossWindowDragTarget|null} target=null
     */
    target = null

    /**
     * Creates + registers the workspace's cross-window target with the five owner seams bound.
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        me.target = Neo.create(CrossWindowDragTarget, {
            clearPreview      : me.clearPreview,
            commitOperation   : me.commitDrop.bind(me),
            dragCoordinator   : me.dragCoordinator,
            hitTest           : me.hitTest,
            previewFor        : me.previewFor,
            previewToOperation: me.previewToOperation,
            sortGroup         : me.sortGroup,
            windowId          : me.windowId
        })
    }

    /**
     * @summary The discriminated commit — the one decision this class adds. A payload whose
     * `dockSourceWorkspaceId` IS this workspace commits through the landed single-document seam;
     * any other source workspace composes ONE `transferItem` descriptor (the converted operation
     * nested as its `target`) and executes the landed atomic two-document transfer, updating the
     * durable placement hints on the transferred record in the same commit. Discrimination is
     * workspace IDENTITY, never item-id presence in the target catalog — an id collision across
     * workspaces rides the executor's fail-closed rejection. Every unprovable input — missing
     * payload identity, unresolvable source document, executor errors — fails closed: nothing
     * commits, `null` returns, both documents stay untouched (the executor's commit-or-neither
     * contract).
     * @param {Object} operation The converted `addTab`/`splitNode` descriptor from the target's
     *     preview→operation pipeline.
     * @param {Object} draggedItem The coordinator's drag payload — carries `dockItemId` +
     *     `dockSourceWorkspaceId` per the class-summary payload contract.
     * @returns {Object|null} the owner commit result, or null when nothing committed.
     */
    commitDrop(operation, draggedItem) {
        let me                = this,
            itemId            = draggedItem?.dockItemId,
            sourceWorkspaceId = draggedItem?.dockSourceWorkspaceId,
            document          = me.getDocument?.();

        if (!operation || !itemId || !document) {
            return null
        }

        // LOCAL means the payload NAMES this workspace as its source (two windows may project the
        // same document) — workspace IDENTITY, never item-id presence in the target catalog: a
        // foreign item whose id collides with a local one must reach the executor's fail-closed
        // collision rejection below, not silently commit the local record. An unstamped payload
        // proves neither side, so it falls through to the foreign guard and fails closed.
        if (sourceWorkspaceId != null && sourceWorkspaceId === me.workspaceId) {
            return me.commitLocal?.(operation, draggedItem) ?? null
        }

        const sourceDocument = sourceWorkspaceId != null ? me.getForeignDocument?.(sourceWorkspaceId) : null;

        if (!sourceDocument || !me.commitTransfer) {
            return null
        }

        const descriptor = {
            operation        : 'transferItem',
            itemId,
            sourceWorkspaceId,
            targetWorkspaceId: me.workspaceId,
            target           : operation
        };

        const result = DockZoneModel.transferItem(sourceDocument, document, descriptor);

        if (result.errors.length) {
            return null
        }

        // Durable placement hints ride the SAME commit (§2.1 / §2.3 mandatory): ownership moves
        // to this workspace, and the fallback is the semantic node the item just entered — the
        // tabs node of an `addTab`, the split target of a `splitNode`. Never geometry. The
        // executor returned fresh committed clones, so stamping here mutates no caller state.
        const record = result.targetDocument.items[itemId];

        record.owningWorkspaceId = me.workspaceId;
        record.fallbackTarget    = {
            nodeId     : operation.operation === 'addTab' ? operation.tabsNodeId : operation.targetNodeId,
            workspaceId: me.workspaceId
        };

        me.commitTransfer({
            descriptor,
            sourceDocument   : result.sourceDocument,
            sourceWorkspaceId,
            targetDocument   : result.targetDocument,
            targetWorkspaceId: me.workspaceId
        });

        return result
    }

    /**
     * Unregisters + destroys the owned target before instance teardown — the unmount half of the
     * registration lifecycle.
     */
    destroy() {
        this.target?.destroy();
        this.target = null;

        super.destroy()
    }
}

export default Neo.setupClass(DockCrossWindowParticipation);
