import Base            from '../../../core/Base.mjs';
import DragCoordinator from '../../../manager/DragCoordinator.mjs';

/**
 * @class Neo.dashboard.dock.window.DragTarget
 * @extends Neo.core.Base
 *
 * @summary The receiving-window contract implementation for cross-window dock drags — §2.3 of
 * the docking design record (`learn/agentos/decisions/0029-docking-design.md`,
 * the amend-first authority for this contract).
 *
 * `Neo.manager.DragCoordinator` arbitrates WHICH window's target receives a drag that originated
 * in a sibling window on the same App-Worker heap; this class is what a dock workspace registers
 * to participate. It fulfils the §2.3 target-side contract — registry identity (`sortGroup`,
 * `windowId`), the declared commit authority (`ownershipId`) the coordinator admits candidates by,
 * plus the four mandatory hooks (`acceptsRemoteDrag`, `onRemoteDragMove`, `onRemoteDragLeave`,
 * `onRemoteDrop`). A product owner may additionally bind the optional native
 * popup source seams, letting the SAME stable registration describe a physical popup gesture
 * without competing for the coordinator's one target slot:
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
class DragTarget extends Base {
    static config = {
        /**
         * @member {String} className='Neo.dashboard.dock.window.DragTarget'
         * @protected
         */
        className: 'Neo.dashboard.dock.window.DragTarget',
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
         * Optional owner seam: resolves a physical native popup window into its exact live drag
         * record. The returned record remains product-owned; this carrier adds no dock semantics.
         * @member {Function|null} resolveNativeWindowDrag=null
         */
        resolveNativeWindowDrag: null,
        /**
         * Optional owner seam: resumes the exact source popup after a native target handoff is
         * refused or cancelled.
         * @member {Function|null} resumeNativeWindowDrag=null
         */
        resumeNativeWindowDrag: null,
        /**
         * Optional owner seam: retires the exact source popup after the target semantic commit.
         * @member {Function|null} retireNativeWindowDrag=null
         */
        retireNativeWindowDrag: null,
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
         * Optional owner seam: promotes a staged target-local drag embodiment after the semantic
         * commit succeeds. Receives the exact hover payload captured before the commit.
         * @member {Function|null} promoteDragEmbodiment=null
         */
        promoteDragEmbodiment: null,
        /**
         * Owner seam: the commit authority this surface belongs to — the topology Group of the workspace
         * it renders for (`Neo.manager.Transaction`), returned as its id, or `null` while unresolved.
         * Read through {@link #ownershipId} at claim time, so a host that learns its Group after this
         * target registered is covered. Every dock surface declares: a target without the seam reads
         * `null`, never `undefined`, so it is never a candidate for a source outside the Group world.
         * Docking design record §2.3.
         * @member {Function|null} resolveOwnershipId=null
         */
        resolveOwnershipId: null,
        /**
         * Optional owner seam: restores a staged target-local drag embodiment on leave, refusal,
         * cancellation, or a throwing commit. Receives the exact hover payload that staged it.
         * @member {Function|null} restoreDragEmbodiment=null
         */
        restoreDragEmbodiment: null,
        /**
         * §2.3 registry identity: only targets sharing the drag source's `sortGroup` are
         * arbitration candidates. No `sortGroup` → this target never registers.
         * @member {String|null} sortGroup=null
         */
        sortGroup: null,
        /**
         * §2.8.1 claim identity: the STABLE workspace/zone identity this target claims gestures
         * under — never `windowId`, never registration order. A target that declares one rides
         * the coordinator's deterministic claim protocol; without it the target stays on the
         * legacy first-intersecting resolution. Dock workspaces pass their workspace id.
         * @member {String|null} stableTargetId=null
         */
        stableTargetId: null,
        /**
         * Optional owner seam: stages/updates the SAME live dragged component in a target-local
         * proxy. Invoked only when the coordinator explicitly licenses `embodyProxy:true`; strict
         * `true` is required before this target can publish its semantic preview.
         * @member {Function|null} stageDragEmbodiment=null
         */
        stageDragEmbodiment: null,
        /**
         * Optional owner seam: resolves only after the exact staged proxy generation has settled
         * in its target renderer. Native-titlebar commitment requires strict `true` before its
         * retained readability interval can begin.
         * @member {Function|null} awaitDragEmbodiment=null
         */
        awaitDragEmbodiment: null,
        /**
         * Optional owner seam: parks/relegates the physical source popup before target-local
         * embodiment. Strict `true` admits the native handoff.
         * @member {Function|null} suspendNativeWindowDrag=null
         */
        suspendNativeWindowDrag: null,
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
     * The exact hover payload paired with {@link #currentPreview}. Retained so every terminal can
     * restore or promote the correct target-local embodiment even when the owner clears visuals.
     * @member {Object|null} currentDragPayload=null
     */
    currentDragPayload = null

    /**
     * The declared ownership the coordinator admits candidates by (docking design record §2.3): the seam's answer,
     * `null` while unresolved, never `undefined` — see {@link #resolveOwnershipId}.
     * @member {String|null} ownershipId
     */
    get ownershipId() {
        return this.resolveOwnershipId?.() ?? null
    }

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
     * @summary Resolves an optional native-popup source through the registered participation.
     * @param {String|Number} windowId The physical moving popup.
     * @returns {Object|null}
     */
    getNativeWindowDrag(windowId) {
        return this.resolveNativeWindowDrag?.(windowId) ?? null
    }

    /**
     * @summary Retires a native popup only after the target reports a semantic commit.
     * @param {Object} draggedItem
     * @param {Object} [context]
     * @returns {*}
     */
    onRemoteDropOut(draggedItem, context) {
        return this.retireNativeWindowDrag?.(draggedItem, context)
    }

    /**
     * §2.3 mandatory hook: hover feedback for a remote drag over this target. Delegates the
     * compute+render to the owner's preview machinery and keeps the latest payload for the
     * drop path.
     * @param {Object} payload `{draggedItem, localX, localY, offsetX, offsetY, proxyRect,
     *     embodyProxy, sourceSortZone}`
     * @returns {Object|null} the owner-computed `dockPreview` (null outside affordances)
     */
    onRemoteDragMove(payload) {
        let me = this;

        if (payload?.embodyProxy === true) {
            let staged = false;

            try {
                staged = me.stageDragEmbodiment?.(payload) === true
            } catch {/* fail closed below */}

            if (!staged) {
                me.restoreDragEmbodiment?.(payload);
                me.currentDragPayload = null;
                me.currentPreview     = null;
                me.clearPreview?.();
                return null
            }
        }

        me.currentDragPayload = payload;

        try {
            return me.currentPreview = me.previewFor?.(payload) ?? null
        } catch (error) {
            payload?.embodyProxy === true && me.restoreDragEmbodiment?.(payload);
            me.currentDragPayload = null;
            me.currentPreview     = null;
            me.clearPreview?.();
            throw error
        }
    }

    /**
     * @summary Awaits renderer settlement for the exact active target-local embodiment.
     *
     * The dragged item must still own this target's current licensed payload. This generation
     * fence keeps a late renderer acknowledgement from authorizing a restored successor.
     * @param {Object} draggedItem The coordinator's exact dragged component.
     * @returns {Boolean|Promise<Boolean>}
     */
    async awaitRemoteDragEmbodiment(draggedItem) {
        const
            payload = this.currentDragPayload,
            current = payload?.embodyProxy === true && payload.draggedItem === draggedItem;

        if (!current) return false;

        const settled = await (this.awaitDragEmbodiment?.(payload) ?? false);

        return settled === true &&
            !this.isDestroyed &&
            this.currentDragPayload === payload
    }

    /**
     * §2.3 mandatory hook: clear hover feedback when the drag exits this target or the
     * coordinator switches targets.
     */
    onRemoteDragLeave() {
        let me      = this,
            payload = me.currentDragPayload;

        payload?.embodyProxy === true && me.restoreDragEmbodiment?.(payload);
        me.currentDragPayload = null;
        me.currentPreview     = null;
        me.clearPreview?.()
    }

    /**
     * @summary Restores the physical native source after target-local state has been released.
     * @param {String} widgetName
     * @param {Object} proxyRect
     * @param {Object} [context]
     * @returns {*}
     */
    resumeWindowDrag(widgetName, proxyRect, context) {
        return this.resumeNativeWindowDrag?.(widgetName, proxyRect, context)
    }

    /**
     * @summary Parks/relegates the physical native source before a target-local embodiment.
     * @param {String} widgetName
     * @param {Object} [context]
     * @returns {*}
     */
    suspendWindowDrag(widgetName, context) {
        return this.suspendNativeWindowDrag?.(widgetName, context)
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
        let me      = this,
            payload = me.currentDragPayload,
            preview = me.currentPreview,
            result  = null;

        try {
            const operation = preview ? me.previewToOperation?.(preview) : null;

            if (operation) {
                result = me.commitOperation?.(operation, draggedItem) ?? null
            }
        } catch (error) {
            me.currentDragPayload === payload &&
                !me.isDestroyed &&
                payload?.embodyProxy === true &&
                me.restoreDragEmbodiment?.(payload);
            me.clearRemoteState(payload);
            throw error
        }

        const settle = committed => {
            const current = me.currentDragPayload === payload && !me.isDestroyed;

            // A target can unregister while an async owner commit is pending. Its leave path has
            // already restored this exact embodiment; a late completion must neither promote that
            // stale generation nor advertise a commit to the coordinator/source disposer.
            if (current && payload?.embodyProxy === true) {
                me[committed ? 'promoteDragEmbodiment' : 'restoreDragEmbodiment']?.(payload)
            }

            me.clearRemoteState(payload);

            return current ? committed : null
        };

        return typeof result?.then === 'function'
            ? result.then(settle, error => {
                me.currentDragPayload === payload &&
                    !me.isDestroyed &&
                    payload?.embodyProxy === true &&
                    me.restoreDragEmbodiment?.(payload);
                me.clearRemoteState(payload);
                throw error
            })
            : settle(result)
    }

    /**
     * @summary Clears one exact hover generation without settling its embodiment a second time.
     * @param {Object|null} payload
     * @protected
     */
    clearRemoteState(payload) {
        let me = this;

        if (me.currentDragPayload === payload) {
            me.currentDragPayload = null;
            me.currentPreview     = null;
            me.clearPreview?.()
        }
    }

    /**
     * Unregisters from the coordinator before instance teardown.
     */
    destroy() {
        let me = this;

        if (me.sortGroup && me.windowId != null) {
            me.dragCoordinator?.unregister(me)
        }

        (me.currentDragPayload || me.currentPreview) && me.onRemoteDragLeave();

        super.destroy()
    }
}

export default Neo.setupClass(DragTarget);
