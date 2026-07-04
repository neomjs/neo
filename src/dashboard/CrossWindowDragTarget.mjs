import Base            from '../core/Base.mjs';
import DragCoordinator from '../manager/DragCoordinator.mjs';

/**
 * @class Neo.dashboard.CrossWindowDragTarget
 * @extends Neo.core.Base
 *
 * @summary The receiving-window contract implementation for cross-window dock drags — §2.3 of
 * the harness docking design record (`learn/agentos/decisions/0029-harness-docking-design.md`,
 * the amend-first authority for this contract).
 *
 * `Neo.manager.DragCoordinator` arbitrates WHICH window's target receives a drag that originated
 * in a sibling window on the same App-Worker heap; this class is what a dock workspace registers
 * to participate. It fulfils the §2.3 target-side contract — registry identity (`sortGroup`,
 * `windowId`) plus the four mandatory hooks (`acceptsRemoteDrag`, `onRemoteDragMove`,
 * `onRemoteDragLeave`, `onRemoteDrop`) — and deliberately owns NOTHING else:
 *
 * - **No parallel drag system** (the inherited §2.3 guardrail): the hover path produces
 *   `dockPreview` payloads through the owner's landed preview machinery, and the drop path
 *   converts the final preview through the owner's `previewToOperation()` → commit pipeline —
 *   the exact path in-window drags ride.
 * - **The coordinator stays dock-blind** (§2.3 binding invariant): all dock semantics live in
 *   the owner-supplied seams below; this class never leaks them toward the coordinator.
 * - **Layer discipline:** `src/dashboard/` must not import app-layer preview renderers, so the
 *   preview/conversion/commit functions arrive as owner-supplied callbacks. The owning dock
 *   workspace (adapter tier) wires them; the app tier keeps authoring the visuals.
 * - **Transfer boundary (consumed, not owned):** mapping a foreign-item `addTab`/`splitNode`
 *   descriptor into the `transferItem`-class executor operation is the committing adapter's
 *   job (tree line C3); this target hands the descriptor plus the coordinator's `draggedItem`
 *   to `commitOperation` and stays agnostic of the mapping.
 */
class CrossWindowDragTarget extends Base {
    static config = {
        /**
         * @member {String} className='Neo.dashboard.CrossWindowDragTarget'
         * @protected
         */
        className: 'Neo.dashboard.CrossWindowDragTarget',
        /**
         * @member {String} ntype='crosswindow-drag-target'
         * @protected
         */
        ntype: 'crosswindow-drag-target',
        /**
         * Owner seam: clears the owner's preview overlay when a remote drag leaves this target
         * (or the coordinator switches targets). Optional; invoked `?.`-guarded.
         * @member {Function|null} clearPreview=null
         */
        clearPreview: null,
        /**
         * Owner seam: commits a converted operation descriptor. Receives
         * `(operation, draggedItem)` so the committing adapter can map foreign items into the
         * `transferItem`-class executor path (C3 boundary, see class summary).
         * @member {Function|null} commitOperation=null
         */
        commitOperation: null,
        /**
         * The arbitration registry this target registers with. Defaults to the
         * `Neo.manager.DragCoordinator` singleton; unit tests may inject a stand-in BEFORE
         * `construct()` runs (it is read at registration time only).
         * @member {Neo.manager.DragCoordinator|null} dragCoordinator=null
         * @protected
         */
        dragCoordinator: null,
        /**
         * Owner seam: cheap window-local hit-test — MUST be side-effect free (§2.3). Without it
         * this target claims nothing (fail-closed): a surface that cannot answer "is this point
         * mine?" must never win the coordinator's arbitration.
         * @member {Function|null} hitTest=null
         */
        hitTest: null,
        /**
         * Owner seam: maps a remote-drag hover payload
         * (`{draggedItem, localX, localY, offsetX, offsetY, proxyRect}`) to a runtime-only
         * `dockPreview` payload (or null outside affordances) AND renders the owner's hover
         * feedback — the same compute+render path in-window drags use.
         * @member {Function|null} previewFor=null
         */
        previewFor: null,
        /**
         * Owner seam: converts the final accepted `dockPreview` into a semantic operation
         * descriptor (`addTab` / `splitNode` shape) — the owner passes its landed
         * `previewToOperation` here, keeping the single preview→operation pipeline.
         * @member {Function|null} previewToOperation=null
         */
        previewToOperation: null,
        /**
         * §2.3 registry identity: only targets sharing the drag source's `sortGroup` are
         * arbitration candidates. No `sortGroup` → this target never registers.
         * @member {String|null} sortGroup=null
         */
        sortGroup: null,
        /**
         * §2.3 registry identity: the window this surface renders in.
         * @member {String|Number|null} windowId=null
         */
        windowId: null
    }

    /**
     * The most recent owner-computed `dockPreview` for the active remote hover.
     * Runtime-only by contract; never persisted.
     * @member {Object|null} currentPreview=null
     */
    currentPreview = null

    /**
     * Registers with the coordinator once the §2.3 registry identity is complete.
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        me.dragCoordinator ??= DragCoordinator;

        if (me.sortGroup && me.windowId != null) {
            me.dragCoordinator.register(me)
        }
    }

    /**
     * §2.3 mandatory hook: cheap hit-test in window-local coordinates, side-effect free.
     * Fail-closed: no owner `hitTest` seam → never claims the drag.
     * @param {Number} localX
     * @param {Number} localY
     * @returns {Boolean}
     */
    acceptsRemoteDrag(localX, localY) {
        return this.hitTest?.(localX, localY) === true
    }

    /**
     * §2.3 mandatory hook: hover feedback for a remote drag over this target. Delegates the
     * compute+render to the owner's preview machinery and keeps the latest payload for the
     * drop path.
     * @param {Object} payload {draggedItem, localX, localY, offsetX, offsetY, proxyRect}
     * @returns {Object|null} the owner-computed `dockPreview` (null outside affordances)
     */
    onRemoteDragMove(payload) {
        return this.currentPreview = this.previewFor?.(payload) ?? null
    }

    /**
     * §2.3 mandatory hook: clear hover feedback when the drag exits this target or the
     * coordinator switches targets.
     */
    onRemoteDragLeave() {
        this.currentPreview = null;
        this.clearPreview?.()
    }

    /**
     * §2.3 mandatory hook: commit the drop on the target side. Converts the final preview via
     * the owner's `previewToOperation` seam and hands the descriptor plus the coordinator's
     * `draggedItem` to `commitOperation`. No accepted preview, or a preview the converter
     * rejects, commits nothing and returns null — the fail-closed executor discipline extended
     * to the drop path.
     * @param {Object} draggedItem The coordinator's cross-window drag payload item
     * @returns {*} the owner commit result, or null when nothing committed
     */
    onRemoteDrop(draggedItem) {
        let me        = this,
            preview   = me.currentPreview,
            operation = preview ? me.previewToOperation?.(preview) : null,
            result    = null;

        try {
            if (operation) {
                result = me.commitOperation?.(operation, draggedItem) ?? null
            }
        } finally {
            // cleanup is unconditional: a throwing owner commit must not leave hover state
            // behind — the error stays the owner's to observe, the gesture still ends clean
            me.onRemoteDragLeave()
        }

        return result
    }

    /**
     * Unregisters from the coordinator before instance teardown.
     */
    destroy() {
        let me = this;

        if (me.sortGroup && me.windowId != null) {
            me.dragCoordinator?.unregister(me)
        }

        super.destroy()
    }
}

export default Neo.setupClass(CrossWindowDragTarget);
