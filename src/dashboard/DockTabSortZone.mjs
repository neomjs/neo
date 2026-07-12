import TabHeaderSortZone from '../draggable/tab/header/toolbar/SortZone.mjs';

/**
 * @class Neo.dashboard.DockTabSortZone
 * @extends Neo.draggable.tab.header.toolbar.SortZone
 *
 * @summary Dock-aware tab-header SortZone — routes a cross-zone tab drop to a semantic `moveItem`.
 *
 * The base tab-header SortZone reorders tab buttons WITHIN their own toolbar (the within-container
 * gesture). This subclass adds the *cross-zone* half without a parallel drag system: on every drop it
 * reports the release point + the dragged item's dock id to the owner-provided {@link #onDockCrossZoneDrop}
 * handler. The handler hit-tests which dock zone is under the pointer — the SAME zone is a no-op (the
 * within-toolbar reorder already committed), a DIFFERENT zone commits a `moveItem` through the dock model.
 *
 * It reuses the existing drag lifecycle end-to-end: the base SortZone owns the proxy, the sort math, and
 * the drag data ({@link Neo.draggable.container.SortZone#onDragMove} threads `clientX`/`clientY`); this
 * class only reads the outcome and forwards it. No popup / window-detach path is involved
 * (`enableProxyToPopup` stays at its `false` default).
 *
 * **Cross-WINDOW participation (the harness docking design record, §2.3 source side).** The base tab-header
 * chain carries NO `Neo.manager.DragCoordinator` delegation (that lives only in the dashboard sort
 * zone, which dock surfaces must not inherit per the §2.3 OQ2 constraint: implement the CONTRACT,
 * not the class) — so THIS class feeds the coordinator explicitly from its own lifecycle:
 * {@link #onDragMove} reports every move in screen space and {@link #processDragEnd} closes the
 * gesture through the coordinator BEFORE deciding the local drop. Both feeds are gated on
 * {@link #sortGroup} (the §2.3 registry identity) — a dock composition that never sets one stays
 * fully in-window with zero coordinator traffic. This class also implements the contract's three
 * mandatory source hooks per that same constraint and stamps the cross-window payload
 * identity at drag start: `dragComponent.dockItemId` + `dragComponent.dockSourceWorkspaceId` — what a
 * receiving {@link Neo.dashboard.DockCrossWindowParticipation} needs to discriminate foreign drops
 * and compose `transferItem`. The source NEVER mutates documents on a remote drop: the target side
 * owns the atomic two-document commit (both workspace documents live on the one App-Worker heap);
 * this side only suppresses its own in-window drop event so the transfer cannot double-commit.
 */
class DockTabSortZone extends TabHeaderSortZone {
    static config = {
        /**
         * @member {String} className='Neo.dashboard.DockTabSortZone'
         * @protected
         */
        className: 'Neo.dashboard.DockTabSortZone',
        /**
         * @member {String} ntype='dock-tab-sortzone'
         * @protected
         */
        ntype: 'dock-tab-sortzone',
        /**
         * The dock item ids this toolbar projects, in tab-button order. `startIndex` indexes into this.
         * @member {String[]|null} dockItemIds=null
         */
        dockItemIds: null,
        /**
         * The dock-zone (tabs node) id this toolbar renders — the source of a cross-zone move.
         * @member {String|null} dockSourceNodeId=null
         */
        dockSourceNodeId: null,
        /**
         * The workspace document id this toolbar's items belong to — stamped onto the drag payload
         * as `dockSourceWorkspaceId`, the receiving window's `transferItem` source-resolution key.
         * @member {String|null} dockWorkspaceId=null
         */
        dockWorkspaceId: null,
        /**
         * §2.3 registry identity for the SOURCE side: {@link Neo.manager.DragCoordinator} resolves
         * remote-target candidates from the source zone's `sortGroup` + the pointer's screen-space
         * window, so a `null` group short-circuits both coordinator feeds — the dock stays fully
         * in-window. Threaded by {@link Neo.dashboard.DockLayoutAdapter} (`crossWindowSortGroup`).
         * @member {String|null} sortGroup=null
         */
        sortGroup: null
    }

    /**
     * Set by {@link #onRemoteDropOut} when a remote target committed this drag's item transfer;
     * consumed exactly once by {@link #processDragEnd} to suppress the in-window cross-zone drop
     * event (the item already left this document — firing it would double-commit).
     * @member {Boolean} remoteDropCommitted=false
     */
    remoteDropCommitted = false

    /**
     * Extends the base drag-start: after the base resolves the dragged tab button, stamps the
     * cross-window payload identity onto it — `dockItemId` (the dock catalog id) +
     * `dockSourceWorkspaceId` (this document's workspace-set key). The coordinator hands exactly
     * this component to a remote target's hooks, so the stamp is what lets the receiving
     * workspace discriminate a foreign drop and compose `transferItem` without any dock knowledge
     * entering the coordinator (§2.3 dock-blind invariant).
     * @param {Object} data
     */
    async onDragStart(data) {
        await super.onDragStart(data);

        let me   = this,
            item = me.dragComponent;

        if (item) {
            item.dockItemId              = me.dockItemIds?.[me.startIndex] ?? null;
            item.dockSourceWorkspaceId   = me.dockWorkspaceId
        }
    }

    /**
     * §2.3 mandatory source hook: a remote target committed the drop — release the item on the
     * source side. For a dock source that means embodiment cleanup ONLY: the atomic two-document
     * `transferItem` already removed the item from this document (target-side commit), so this
     * hook just arms the one-shot suppression flag {@link #processDragEnd} consumes. No document
     * writes here — the source must never race the executor's commit-or-neither contract.
     * @param {Neo.component.Base} draggedItem
     */
    onRemoteDropOut(draggedItem) {
        this.remoteDropCommitted = true
    }

    /**
     * §2.3 mandatory source hook: a remote target engaged — the source's drag embodiment yields
     * while the target window hosts the hover. The dock's embodiment is the in-window drag proxy
     * (no popup path, `enableProxyToPopup` false), so suspension is hiding it.
     * @param {String} widgetName
     */
    suspendWindowDrag(widgetName) {
        let proxy = this.dragProxy;

        proxy && (proxy.hidden = true)
    }

    /**
     * §2.3 mandatory source hook: the drag left every remote target back into the void — the
     * source embodiment resumes. The in-window proxy un-hides; its position keeps riding the base
     * drag-move stream (the supplied rect matters only for the popup embodiment class).
     * @param {String} widgetName
     * @param {Object} proxyRect
     */
    resumeWindowDrag(widgetName, proxyRect) {
        let proxy = this.dragProxy;

        proxy && (proxy.hidden = false)
    }

    /**
     * Extends the base drag-end: fires a `dockCrossZoneDrop` event on the owner tab.Container (`owner.up()`)
     * carrying the release point + dragged item id. The adapter wires the listener for it — the same
     * tab.Container node whose `moveTo` listener handles the within-container reorder — and its closure holds
     * the dock reducer (the reliable seam: a closure captured at projection time, not a cloned config nor a
     * component-tree walk). Fires BEFORE `super`: the base drag-end resets `startIndex` and its within-reorder
     * commit can trigger a deferred re-projection that destroys this tab container, so firing after would
     * land on a dead component.
     *
     * A drag a remote window committed ({@link #remoteDropCommitted}) suppresses the event for
     * exactly one drag-end: the item already transferred out of this document, so the in-window
     * cross-zone commit path must not fire a second, now-invalid operation. Base cleanup still runs.
     *
     * Cross-window gestures close through {@link Neo.manager.DragCoordinator#onDragEnd} FIRST: a
     * release over an engaged remote target commits there, and the coordinator arms
     * {@link #remoteDropCommitted} via {@link #onRemoteDropOut} on this same call stack — so the
     * local decision below always sees the truth.
     * @param {Object} data
     */
    async processDragEnd(data) {
        let me     = this,
            itemId = me.dockItemIds?.[me.startIndex],
            // Resolve the tab.Container + fire BEFORE super: the base drag-end tears down the owner linkage
            // AND its within-reorder commit can trigger a deferred re-projection that destroys this tab
            // container — firing after super would land on a dead component. Same node whose `moveTo`
            // listener the adapter wires.
            tabContainer = me.owner?.up?.(),
            {clientX, clientY} = data || {};

        if (me.sortGroup && me.dragComponent) {
            (await me.resolveDragCoordinator()).onDragEnd({
                draggedItem   : me.dragComponent,
                sourceSortZone: me
            })
        }

        if (me.remoteDropCommitted) {
            me.remoteDropCommitted = false
        } else if (itemId && tabContainer && Neo.isNumber(clientX) && Neo.isNumber(clientY)) {
            tabContainer.fire('dockCrossZoneDrop', {clientX, clientY, itemId, sourceNodeId: me.dockSourceNodeId})
        }

        await super.processDragEnd(data)
    }

    /**
     * Extends the base drag-move: after the base updates the proxy + sort state, fires a
     * `dockCrossZoneDragMove` event on the owner tab.Container carrying the live pointer + dragged item
     * id, so the owner can compute + render the transient dock-preview affordance under the pointer each
     * frame. Purely additive + reactive — the base owns the proxy and the sort math; the affordance is a
     * consumer of this hover signal, never a parallel drag system. Mirrors the {@link #processDragEnd} drop seam.
     *
     * Cross-window gestures additionally feed {@link Neo.manager.DragCoordinator#onDragMove} in
     * screen space (the base chain has no coordinator delegation of its own): the coordinator
     * arbitrates registered remote targets from this signal and drives the suspend / resume /
     * remote-hover hooks back into this zone. Gated on {@link #sortGroup}; the `proxyRect` gate
     * matters too — the move payload carries one exactly while a live drag proxy exists.
     * @param {Object} data
     */
    async onDragMove(data) {
        await super.onDragMove(data);

        let me                 = this,
            itemId             = me.dockItemIds?.[me.startIndex],
            tabContainer       = me.owner?.up?.(),
            {clientX, clientY} = data || {};

        if (itemId && tabContainer && Neo.isNumber(clientX) && Neo.isNumber(clientY)) {
            tabContainer.fire('dockCrossZoneDragMove', {clientX, clientY, itemId, sourceNodeId: me.dockSourceNodeId})
        }

        if (me.sortGroup && me.dragComponent && data?.proxyRect && Neo.isNumber(data.screenX)) {
            (await me.resolveDragCoordinator()).onDragMove({
                draggedItem   : me.dragComponent,
                offsetX       : data.offsetX,
                offsetY       : data.offsetY,
                proxyRect     : data.proxyRect,
                screenX       : data.screenX,
                screenY       : data.screenY,
                sourceSortZone: me
            })
        }
    }

    /**
     * Lazily resolves the `Neo.manager.DragCoordinator` singleton at drag time rather than at module
     * scope — so the adapter's static import of this SortZone (for its projected `sortZoneConfig`) does
     * NOT pull the `DragCoordinator → manager.Window` import-time chain (Window's `construct()` touches
     * `Neo.currentWorker.on` at `setupClass`) into environments that never drag, e.g. the unit test
     * loader (which stubs the worker only inside its setup call, after ESM hoists the imports).
     * Cross-window drag only (both callers gate on `sortGroup`); the import promise is cached, so
     * per-frame `onDragMove` calls share one load.
     * @returns {Promise<Neo.manager.DragCoordinator>}
     */
    resolveDragCoordinator() {
        return this._dragCoordinatorPromise ??= import('../manager/DragCoordinator.mjs').then(module => module.default)
    }
}

export default Neo.setupClass(DockTabSortZone);
