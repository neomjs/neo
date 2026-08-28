import Base                  from '../../../core/Base.mjs';
import CrossWindowDragTarget from './DragTarget.mjs';
import DockZoneModel         from '../../DockZoneModel.mjs';

/**
 * @class Neo.dashboard.dock.window.Participation
 * @extends Neo.core.Base
 *
 * @summary The adapter-tier composition that makes ONE dock workspace a cross-window drag
 * participant — the integration half of the docking design record's §2.3 (see
 * `learn/agentos/decisions/0029-docking-design.md`) over exclusively LANDED machinery.
 *
 * It owns the target registration lifecycle (create on workspace mount, destroy on unmount) and
 * binds the owner seams of {@link Neo.dashboard.dock.window.DragTarget} to the workspace's landed
 * pipeline, adding exactly ONE new decision: foreign-vs-local drop discrimination at commit time.
 *
 * - **Local drop** (the payload's source workspace IS this one — two windows may project the
 *   same document): the converted operation rides the owner's landed single-document commit
 *   seam — the identical pipeline in-window drags use. No parallel drag system (§2.3 inherited
 *   guardrail).
 * - **Foreign drop** (the item belongs to a sibling window's workspace on the same App-Worker
 *   heap): the converted `addTab`/`splitNode` descriptor becomes the nested `target` of ONE
 *   semantic `transferItem` operation, executed through the landed atomic two-document executor
 *   ({@link Neo.dashboard.DockZoneModel#transferItem}) — commit-or-neither, item record verbatim,
 *   live component instances move and are never re-instantiated (§2.6). The adapter publishes
 *   those finite documents unchanged. Durable placement intent belongs to the separate topology
 *   hint layer; once that layer exists, its workspace-set owner must join it to the document-pair
 *   transaction instead of extending a `dockZone.v1` item record.
 *
 * Layer discipline (the target's established layer note, unchanged): `src/dashboard/` imports no app module —
 * every seam below arrives from the app-side workspace composition, which keeps authoring the
 * preview visuals. The {@link Neo.manager.DragCoordinator} stays dock-blind: all dock semantics
 * live here and in the seams, never in the coordinator (§2.3 binding invariant).
 *
 * The cross-window drag payload contract (stamped by {@link Neo.dashboard.dock.interaction.TabSortZone} at
 * drag start): `draggedItem.dockItemId` names the dock catalog item, and
 * `draggedItem.dockSourceWorkspaceId` names the workspace document it departs. A whole-stack
 * source additionally stamps `draggedItem.dockGroupNodeId`; only the source document's
 * model-resolved stack root is eligible for the `transferNode` path. The local/foreign
 * discriminator keys on the LATTER's identity with this workspace — item-id presence in the
 * target catalog is never ownership evidence (a foreign item with a colliding id must reach the
 * executor's fail-closed collision rejection, not commit the local record) — and a payload
 * missing either stamp fails closed (no signal-free guessing).
 */
class Participation extends Base {
    static config = {
        /**
         * @member {String} className='Neo.dashboard.dock.window.Participation'
         * @protected
         */
        className: 'Neo.dashboard.dock.window.Participation',
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
         * where both documents are the executor's unchanged, finite committed results. Returns a
         * truthy acknowledgement only after the pair was synchronously accepted; a refusal keeps
         * the coordinator's source-retirement path closed.
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
         * Optional product-owned native-popup resolver forwarded through the SAME stable target
         * registration. It never creates a second coordinator entry.
         * @member {Function|null} resolveNativeWindowDrag=null
         */
        resolveNativeWindowDrag: null,
        /**
         * Optional product-owned native-popup restore seam forwarded to the stable participation.
         * @member {Function|null} resumeNativeWindowDrag=null
         */
        resumeNativeWindowDrag: null,
        /**
         * Optional product-owned native-popup retirement seam forwarded to the stable participation.
         * @member {Function|null} retireNativeWindowDrag=null
         */
        retireNativeWindowDrag: null,
        /**
         * Owner seam forwarded to the target: promotes the target-local live drag embodiment
         * after a successful semantic commit.
         * @member {Function|null} promoteDragEmbodiment=null
         */
        promoteDragEmbodiment: null,
        /**
         * Owner seam forwarded to the target: restores the target-local live drag embodiment on
         * leave or any non-commit terminal.
         * @member {Function|null} restoreDragEmbodiment=null
         */
        restoreDragEmbodiment: null,
        /**
         * §2.3 registry identity, forwarded to the target: only targets sharing the drag source's
         * `sortGroup` are arbitration candidates.
         * @member {String|null} sortGroup=null
         */
        sortGroup: null,
        /**
         * Owner seam forwarded to the target: stages/updates an explicitly licensed target-local
         * live drag embodiment.
         * @member {Function|null} stageDragEmbodiment=null
         */
        stageDragEmbodiment: null,
        /**
         * Owner seam forwarded to the target: settles the exact staged target renderer before a
         * native-titlebar handoff begins its retained readability interval.
         * @member {Function|null} awaitDragEmbodiment=null
         */
        awaitDragEmbodiment: null,
        /**
         * Optional product-owned native-popup park/relegation seam forwarded to the stable
         * participation.
         * @member {Function|null} suspendNativeWindowDrag=null
         */
        suspendNativeWindowDrag: null,
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
     * The registered {@link Neo.dashboard.dock.window.DragTarget} this participation owns.
     * Created in {@link #construct}, destroyed with this instance.
     * @member {Neo.dashboard.dock.window.DragTarget|null} target=null
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
            clearPreview           : me.clearPreview,
            commitOperation        : me.commitDrop.bind(me),
            dragCoordinator        : me.dragCoordinator,
            hitTest                : me.hitTest,
            previewFor             : me.previewFor,
            previewToOperation     : me.previewToOperation,
            promoteDragEmbodiment  : me.promoteDragEmbodiment,
            resolveNativeWindowDrag: me.resolveNativeWindowDrag,
            restoreDragEmbodiment  : me.restoreDragEmbodiment,
            resumeNativeWindowDrag : me.resumeNativeWindowDrag,
            retireNativeWindowDrag : me.retireNativeWindowDrag,
            sortGroup              : me.sortGroup,
            stageDragEmbodiment    : me.stageDragEmbodiment,
            awaitDragEmbodiment    : me.awaitDragEmbodiment,
            suspendNativeWindowDrag: me.suspendNativeWindowDrag,
            // the workspace id IS the §2.8.1 stable claim identity: it survives re-registration
            // and never encodes windowId or registration order
            stableTargetId: me.workspaceId,
            windowId      : me.windowId
        })
    }

    /**
     * @summary The discriminated commit — the one decision this class adds. A payload whose
     * `dockSourceWorkspaceId` IS this workspace commits through the landed single-document seam;
     * any other source workspace composes ONE `transferItem` descriptor (the converted operation
     * nested as its `target`) and publishes the landed atomic two-document transfer verbatim. A
     * payload carrying `dockGroupNodeId` instead admits only an exact `transferNode` descriptor for
     * the source document's resolved stack root; a mismatch fails closed before the executor.
     * Discrimination is workspace IDENTITY, never item-id presence in the target catalog — an id
     * collision across workspaces rides the executor's fail-closed rejection. Every unprovable
     * input — missing payload identity, unresolvable source document, executor errors — fails
     * closed: nothing commits, `null` returns, both documents stay untouched (the executor's
     * commit-or-neither contract).
     * @param {Object} operation The converted `addTab`/`splitNode` descriptor from the target's
     *     preview→operation pipeline.
     * @param {Object} draggedItem The coordinator's drag payload — carries `dockItemId` +
     *     `dockSourceWorkspaceId` and optional `dockGroupNodeId` per the class-summary payload contract.
     * @returns {Object|null} the owner commit result, or null when nothing committed.
     */
    commitDrop(operation, draggedItem) {
        let me                = this,
            groupNodeId       = draggedItem?.dockGroupNodeId,
            itemId            = draggedItem?.dockItemId,
            sourceWorkspaceId = draggedItem?.dockSourceWorkspaceId,
            document          = me.getDocument?.();

        if (!operation || !itemId || !document) {
            return null
        }

        if (groupNodeId) {
            // A whole-stack handle is a cross-workspace gesture only. Within one document the
            // model's `moveNode` verb owns grouped moves; silently routing a `transferNode` through
            // the local item seam would turn one semantic operation into another by accident.
            if (sourceWorkspaceId == null || sourceWorkspaceId === me.workspaceId) {
                return null
            }

            const sourceDocument = me.getForeignDocument?.(sourceWorkspaceId);

            if (!sourceDocument || !me.commitTransfer ||
                operation.operation !== 'transferNode' || operation.nodeId !== groupNodeId ||
                DockZoneModel.resolveStackRoot(sourceDocument) !== groupNodeId) {
                return null
            }

            const descriptor = {
                ...operation,
                sourceWorkspaceId,
                targetWorkspaceId: me.workspaceId
            };

            const result = DockZoneModel.transferNode(sourceDocument, document, descriptor);

            if (result.errors.length) {
                return null
            }

            const published = me.commitTransfer({
                descriptor,
                sourceDocument   : result.sourceDocument,
                sourceWorkspaceId,
                targetDocument   : result.targetDocument,
                targetWorkspaceId: me.workspaceId
            });

            return published ? result : null
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

        const published = me.commitTransfer({
            descriptor,
            sourceDocument   : result.sourceDocument,
            sourceWorkspaceId,
            targetDocument   : result.targetDocument,
            targetWorkspaceId: me.workspaceId
        });

        return published ? result : null
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

export default Neo.setupClass(Participation);
