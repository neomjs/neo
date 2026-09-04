import Base                                    from '../../../core/Base.mjs';
import DragAffordances                         from '../interaction/DragAffordances.mjs';
import DragTarget                              from './DragTarget.mjs';
import WorkspaceDocument                       from '../model/WorkspaceDocument.mjs';
import Operations                              from '../model/Operations.mjs';
import Preview                                 from '../interaction/Preview.mjs';
import {previewToOperation as toDockOperation} from '../model/PreviewContract.mjs';

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
 *   ({@link Neo.dashboard.dock.model.WorkspaceDocument#transferItem}) — commit-or-neither, item record verbatim,
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
         * The dock workspace this participation speaks for. Supplying it is what lets the seams
         * above stay unset: every default below answers from state this workspace already holds
         * (`dockModel`, the reducer pair, the projection options, the tear-out registries), so a
         * host that composes a workspace gets cross-window drag without re-deriving it.
         *
         * A host seam always wins — the defaults resolve only where one is `null`.
         * @member {Neo.dashboard.dock.Workspace|null} workspace=null
         */
        workspace: null,
        /**
         * The worker-owned workspace set ({@link Neo.dashboard.dock.window.WorkspaceSet}) this
         * workspace is registered in. It is the only source that can resolve a SIBLING workspace's
         * document, so without it foreign drops decline exactly as they do today — a single-workspace
         * host loses nothing it had.
         * @member {Object|null} workspaceSet=null
         */
        workspaceSet: null,
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
     * The gesture controller composed by {@link #resolveAffordances}, or null while a host seam
     * answers the preview tier. Owned here, destroyed here.
     * @member {Neo.dashboard.dock.interaction.DragAffordances|null} ownedAffordances=null
     * @protected
     */
    ownedAffordances = null

    /**
     * The preview overlay composed by {@link #resolveAffordances}. Owned here, destroyed here.
     * @member {Neo.dashboard.dock.interaction.Preview|null} ownedPreview=null
     * @protected
     */
    ownedPreview = null

    /**
     * Creates + registers the workspace's cross-window target with the five owner seams bound.
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        me.target = Neo.create(DragTarget, {
            clearPreview           : me.clearPreview            ?? me.defaultClearPreview.bind(me),
            commitOperation        : me.commitDrop.bind(me),
            dragCoordinator        : me.dragCoordinator,
            hitTest                : me.hitTest                 ?? me.defaultHitTest.bind(me),
            previewFor             : me.previewFor              ?? me.defaultPreviewFor.bind(me),
            previewToOperation     : me.previewToOperation      ?? toDockOperation,
            promoteDragEmbodiment  : me.promoteDragEmbodiment,
            resolveNativeWindowDrag: me.resolveNativeWindowDrag ?? me.defaultResolveNativeWindowDrag.bind(me),
            restoreDragEmbodiment  : me.restoreDragEmbodiment,
            resumeNativeWindowDrag : me.resumeNativeWindowDrag,
            retireNativeWindowDrag : me.retireNativeWindowDrag,
            sortGroup              : me.sortGroup ?? me.defaultSortGroup(),
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
     * @summary Composes the engine's own affordance tier on first use.
     *
     * {@link Neo.dashboard.dock.interaction.Preview} and
     * {@link Neo.dashboard.dock.interaction.DragAffordances} both document themselves as the
     * app-neutral pieces every docking workspace composes, and no engine workspace composes either —
     * so a host that supplies no preview seam has nothing to paint into, resolves no preview for a
     * remote hover, and can never convert a drop into an operation. Composing them here keeps that
     * assembly out of the workspace class while making the seam answerable.
     * @returns {Neo.dashboard.dock.interaction.DragAffordances|null}
     * @protected
     */
    resolveAffordances() {
        let me        = this,
            workspace = me.workspace,
            host      = workspace?.getDockHost?.();

        if (me.ownedAffordances || !workspace || !host || workspace.isDestroyed) {
            return me.ownedAffordances
        }

        me.ownedPreview = workspace.add({module: Preview});

        me.ownedAffordances = Neo.create(DragAffordances, {
            host,
            owner  : workspace,
            preview: me.ownedPreview
        });

        return me.ownedAffordances
    }

    /**
     * Engine default for {@link #clearPreview}: drops the overlay this participation owns.
     * @protected
     */
    defaultClearPreview() {
        this.ownedAffordances?.clear()
    }

    /**
     * Engine default for {@link #commitLocal}: the workspace's own reducer pair — the identical
     * path an in-window drop rides, so a cross-window local drop never becomes a parallel commit.
     * @param {Object} operation
     * @returns {Object|null}
     * @protected
     */
    defaultCommitLocal(operation) {
        let workspace = this.workspace,
            result    = workspace?.applyDockZoneOperation?.(operation);

        if (!result || result.errors?.length || !result.document) {
            return null
        }

        workspace.onDockZoneDocumentChange(result.document, operation, workspace);

        return result
    }

    /**
     * Engine default for {@link #commitTransfer}: the workspace set's atomic pair adoption. It
     * returns a strict boolean because a truthy-but-unacknowledged publish would open the
     * coordinator's source-retirement path over a transfer that never landed.
     * @param {Object} data
     * @returns {Boolean}
     * @protected
     */
    defaultCommitTransfer(data) {
        return this.workspaceSet?.adoptTransfer?.(data) === true
    }

    /**
     * The effective transfer publisher: a host seam, else the workspace set's adoption, else `null`.
     * `null` is the capability answer rather than a missing function — a workspace with no set has
     * no sibling to transfer with, and every foreign drop must fail closed there exactly as before.
     * @returns {Function|null}
     * @protected
     */
    resolveCommitTransfer() {
        return this.commitTransfer ?? (this.workspaceSet ? this.defaultCommitTransfer.bind(this) : null)
    }

    /**
     * Engine default for {@link #getDocument}: this workspace's committed document.
     * @returns {Object|null}
     * @protected
     */
    defaultGetDocument() {
        return this.workspace?.dockModel ?? null
    }

    /**
     * Engine default for {@link #getForeignDocument}: a sibling's committed document, which only
     * the workspace set can resolve. Without a set this stays `null` and foreign drops fail closed.
     * @param {String} workspaceId
     * @returns {Object|null}
     * @protected
     */
    defaultGetForeignDocument(workspaceId) {
        return this.workspaceSet?.getDocument?.(workspaceId) ?? null
    }

    /**
     * Engine default for {@link #hitTest}: window-local bounds, side-effect free and synchronous as
     * the seam requires — a measurement here would stall the ~60hz remote hover stream.
     * @param {Number} localX
     * @param {Number} localY
     * @returns {Boolean}
     * @protected
     */
    defaultHitTest(localX, localY) {
        let inner = this.windowId != null ? Neo.manager?.Window?.get(this.windowId)?.innerRect : null;

        return Boolean(
            inner && Number.isFinite(localX) && Number.isFinite(localY) &&
            localX >= 0 && localY >= 0 && localX <= inner.width && localY <= inner.height
        )
    }

    /**
     * Engine default for {@link #previewFor}: resolves the remote hover frame against the gesture
     * controller's synchronous geometry mirror. The warm-up is deliberately not awaited — the seam
     * must answer on the frame it arrives, and the first frames of a gesture resolving to `null`
     * while geometry settles is the documented behaviour of that mirror.
     * @param {Object} payload
     * @returns {Object|null}
     * @protected
     */
    defaultPreviewFor(payload) {
        let affordances = this.resolveAffordances(),
            draggedItem = payload?.draggedItem;

        if (!affordances || !draggedItem?.dockItemId) {
            return null
        }

        affordances.ensureGeometry();

        return affordances.resolvePreview({
            groupNodeId : draggedItem.dockGroupNodeId ?? null,
            itemId      : draggedItem.dockItemId,
            pointer     : {x: payload.localX, y: payload.localY},
            sourceNodeId: draggedItem.dockSourceNodeId ?? payload.sourceNodeId ?? null
        }) ?? null
    }

    /**
     * Engine default for {@link #resolveNativeWindowDrag}: maps a moving popup back to the pane the
     * workspace admitted into it, through the tear-out registry the engine already maintains and the
     * `resolvePane` hook every consumer implements.
     * @param {String|Number} movingWindowId
     * @returns {Object|null}
     * @protected
     */
    defaultResolveNativeWindowDrag(movingWindowId) {
        let me        = this,
            workspace = me.workspace,
            panes     = workspace?.tearOutPanes;

        if (!panes || movingWindowId == null) {
            return null
        }

        let itemId = Object.keys(panes).find(id => panes[id]?.windowId === movingWindowId),
            item   = itemId ? workspace.dockModel?.items?.[itemId] : null,
            pane   = item ? workspace.resolvePane?.(itemId, item) : null;

        if (!pane || pane.isDestroyed) {
            return null
        }

        pane.dockItemId            = itemId;
        pane.dockSourceWorkspaceId = me.workspaceId;

        return {
            draggedItem      : pane,
            embodyNativeHover: true,
            sourceWindowId   : movingWindowId,
            widgetName       : itemId
        }
    }

    /**
     * Engine default for {@link #sortGroup}: the value the workspace already publishes to its own
     * projection, read back through the documented options hook. Absent, the target never registers
     * and the workspace stays fully in-window — the unchanged opt-in default.
     * @returns {String|null}
     * @protected
     */
    defaultSortGroup() {
        return this.workspace?.getDockProjectionOptions?.()?.crossWindowSortGroup ?? null
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
            publishTransfer   = me.resolveCommitTransfer(),
            document          = (me.getDocument ?? me.defaultGetDocument).call(me);

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

            const sourceDocument = (me.getForeignDocument ?? me.defaultGetForeignDocument).call(me, sourceWorkspaceId);

            if (!sourceDocument || !publishTransfer ||
                operation.operation !== 'transferNode' || operation.nodeId !== groupNodeId ||
                WorkspaceDocument.resolveStackRoot(sourceDocument) !== groupNodeId) {
                return null
            }

            const descriptor = {
                ...operation,
                sourceWorkspaceId,
                targetWorkspaceId: me.workspaceId
            };

            const result = Operations.transferNode(sourceDocument, document, descriptor);

            if (result.errors.length) {
                return null
            }

            const published = publishTransfer({
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
            return (me.commitLocal ?? me.defaultCommitLocal).call(me, operation, draggedItem) ?? null
        }

        const sourceDocument = sourceWorkspaceId != null
            ? (me.getForeignDocument ?? me.defaultGetForeignDocument).call(me, sourceWorkspaceId)
            : null;

        if (!sourceDocument || !publishTransfer) {
            return null
        }

        const descriptor = {
            operation        : 'transferItem',
            itemId,
            sourceWorkspaceId,
            targetWorkspaceId: me.workspaceId,
            target           : operation
        };

        const result = Operations.transferItem(sourceDocument, document, descriptor);

        if (result.errors.length) {
            return null
        }

        const published = publishTransfer({
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
        let me = this;

        me.target?.destroy();
        me.target = null;

        // Only what this instance composed: a host-supplied preview seam owns its own overlay, and
        // destroying that would tear down a renderer the host still paints in-window drags with.
        me.ownedAffordances?.destroy();
        me.ownedAffordances = null;

        me.ownedPreview?.destroy();
        me.ownedPreview = null;

        super.destroy()
    }
}

export default Neo.setupClass(Participation);
