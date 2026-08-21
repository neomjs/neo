import {createVesselConversionSensor} from './DockVesselConversion.mjs';
import TabHeaderSortZone              from '../draggable/tab/header/toolbar/SortZone.mjs';

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
 * class only reads the outcome and forwards it.
 *
 * **Tear-out (dock semantics over the landed boundary grammar).** With {@link #enableProxyToPopup}
 * enabled by the composition, the INHERITED window-boundary hysteresis (direction-aware
 * intersection-ratio detection in the base container SortZone) fires its boundary events during a
 * tab drag. This class re-fires them as dock gesture events on the owner tab.Container —
 * `dockTearOutExit` / `dockTearOutEntry` — plus the two gesture terminals the dock model cares
 * about: `dockTearOutTerminal` (released while detached — the ONLY signal a host may commit a
 * `detachItem` on) and `dockTearOutCancel` (cancelled while detached — the host closes its vessel
 * with ZERO model mutation). The zone itself never opens windows and never mutates documents: the
 * host owns vessel acquisition + the model commit, and the commit happens at the terminal, never at
 * the boundary — a gesture that re-enters or cancels leaves the committed document untouched.
 *
 * **Cross-WINDOW participation (the docking design record, §2.3 source side).** The base tab-header
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
         * Dock header buttons leave normal flow during a gesture, so their measured viewport rects
         * must be rebased onto the toolbar before becoming absolute `left` / `top` values. Keeping
         * viewport coordinates made the Audit button resolve against an ancestor and paint inside
         * the card body at the flagship 1280x800 capture profile.
         * @member {Boolean} adjustItemRectsToParent=true
         */
        adjustItemRectsToParent: true,
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
         * The model-resolved transferable stack root this toolbar's grip represents. `null` keeps
         * the toolbar item-only. A non-null value is runtime projection state: it stamps the drag
         * payload but never enters the committed dock document.
         * @member {String|null} dockGroupNodeId=null
         */
        dockGroupNodeId: null,
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
         * Dock tab toolbars are parent-sized projection surfaces. Pinning their live width to the
         * draggable button span would SHRINK a wide header during the gesture, causing Overflow to
         * misclassify the dragged tab as space-hidden and create a phantom menu control.
         * @member {Boolean} expandOwnerOnDrag=false
         */
        expandOwnerOnDrag: false,
        /**
         * Establishes the toolbar as the containing block for the owner-relative drag coordinates.
         * This is the rendering half of {@link #adjustItemRectsToParent}; either setting alone
         * leaves the absolute tab headers offset by a positioned ancestor's origin.
         * @member {Boolean} positionOwnerRelative=true
         */
        positionOwnerRelative: true,
        /**
         * Slack in px around the source toolbar's REAL bounds inside which a release still counts
         * as a within-toolbar gesture (the base reorder applies). A release farther out than this
         * on any side is dock-gesture territory: the tracked reorder is voided so the cross-zone
         * drop owns the outcome. Orientation-independent — it pads the measured toolbar rect, not
         * an axis-derived span. Per-app / per-instance tunable like any Neo config.
         * @member {Number} dockReleaseTolerance=32
         */
        dockReleaseTolerance: 32,
        /**
         * §2.3 registry identity for the SOURCE side: {@link Neo.manager.DragCoordinator} resolves
         * remote-target candidates from the source zone's `sortGroup` + the pointer's screen-space
         * window, so a `null` group short-circuits both coordinator feeds — the dock stays fully
         * in-window. Threaded by {@link Neo.dashboard.DockLayoutAdapter} (`crossWindowSortGroup`).
         * @member {String|null} sortGroup=null
         */
        sortGroup: null,
        /**
         * Opts this source into the dual-window conversion decision. The coordinator remains
         * dock-blind: it offers stable-claim frames, while this zone owns the sensor and decides
         * whether a remote preview may engage. Disabled is byte-identical to the pre-conversion
         * coordinator path.
         * @member {Boolean} enableVesselConversion=false
         */
        enableVesselConversion: false,
        /**
         * Provisional min-axis overlap required to enter the existing HOVERING_CLAIM transition.
         * Production opt-in remains off until the physical park/re-show lifecycle is ready and
         * headed calibration replaces this placeholder.
         * @member {Number} vesselConversionConvertThreshold=0.55
         */
        vesselConversionConvertThreshold: 0.55,
        /**
         * Provisional min-axis overlap below which the conversion reverts. See the convert
         * threshold's calibration gate above.
         * @member {Number} vesselConversionRevertThreshold=0.35
         */
        vesselConversionRevertThreshold: 0.35,
        /**
         * Binding-owned raw-claim miss grace. During this interval the visual preview is retained,
         * but commit eligibility drops immediately; a release can never land on a stale claim.
         * @member {Number} vesselConversionPointerExitGraceMs=0
         */
        vesselConversionPointerExitGraceMs: 0
    }

    /**
     * Set by {@link #onRemoteDropOut} when a remote target committed this drag's item transfer;
     * consumed exactly once by {@link #processDragEnd} to suppress the in-window cross-zone drop
     * event (the item already left this document — firing it would double-commit).
     * @member {Boolean} remoteDropCommitted=false
     */
    remoteDropCommitted = false

    /**
     * True only while the projected stack grip owns the active gesture. The flag bypasses the
     * base tab-reorder machinery while retaining its drag proxy + coordinator lifecycle.
     * @member {Boolean} stackDragActive=false
     * @protected
     */
    stackDragActive = false

    /**
     * The source toolbar's PRISTINE viewport rect, measured once per gesture at
     * {@link #onDragStart}. The base keeps its full `ownerRect` for outer drag/tear-out authority
     * and snapshots the draggable tab span separately in `sortBoundaryRect`; this pristine copy
     * remains the release boundary {@link #releaseVoidsReorder} decides against.
     * @member {Object|null} dockSourceToolbarRect=null
     * @protected
     */
    dockSourceToolbarRect = null

    /**
     * The resolved {@link Neo.manager.DragCoordinator} singleton, warmed at {@link #construct} for a
     * cross-window ({@link #sortGroup}) zone so the drag handlers read it SYNCHRONOUSLY — the import
     * never resolves on the drag hot path. `null` until the preload settles; a zone that never drags
     * cross-window never sets it (and the module-scope import stays broken either way).
     * @member {Neo.manager.DragCoordinator|null} dragCoordinator=null
     * @protected
     */
    dragCoordinator = null

    /**
     * One pure conversion sensor per source zone, reset at every gesture terminal.
     * @member {Object|null} vesselConversionSensor=null
     * @protected
     */
    vesselConversionSensor = null

    /**
     * Stable identity of the target whose geometry owns the current sensor state.
     * @member {String|null} vesselConversionTargetId=null
     * @protected
     */
    vesselConversionTargetId = null

    /**
     * Last live target rect for a bounded raw-claim miss. Copied per frame so mutable manager
     * rectangles cannot rewrite an already-made decision.
     * @member {Object|null} vesselConversionTargetRect=null
     * @protected
     */
    vesselConversionTargetRect = null

    /**
     * First raw-claim miss timestamp for the active converted target.
     * @member {Number|null} vesselConversionPointerMissedAt=null
     * @protected
     */
    vesselConversionPointerMissedAt = null

    /**
     * Last exact live dragged-vessel rect resolved by the source owner. This is the geometry the
     * conversion sensor measures; a proxy or requested birth size can never substitute for it.
     * @member {Object|null} vesselConversionSourceRect=null
     * @protected
     */
    vesselConversionSourceRect = null

    /**
     * Last logical pointer-follow rect supplied by the coordinator. This is deliberately distinct
     * from {@link #vesselConversionSourceRect}: conversion measures the exact live vessel, while
     * later re-show choreography needs the pointer-owned logical destination.
     * @member {Object|null} vesselConversionLogicalRect=null
     * @protected
     */
    vesselConversionLogicalRect = null

    /**
     * Exact item identity carried by the coordinator frame for the active conversion epoch.
     * The platform actuator must not reconstruct it from `startIndex`: a live source can enter
     * through a composed/native handoff whose base tab-reorder index is intentionally absent.
     * @member {String|null} vesselConversionItemId=null
     * @protected
     */
    vesselConversionItemId = null

    /**
     * One queued convert-out chained behind a still-provisional park admission.
     * @member {Promise<Boolean>|null} vesselConversionCancelPromise=null
     * @protected
     */
    vesselConversionCancelPromise = null

    /**
     * Zone-owned generation protecting async cancellation continuations across sensor reuse.
     * @member {Number} vesselConversionEpoch=0
     * @protected
     */
    vesselConversionEpoch = 0

    /**
     * Latest raw pointer frame accepted by the cross-window coordinator. A successful async
     * park/re-show settlement re-enters that same coordinator boundary so live claim arbitration,
     * target engagement, and proxy staging settle without requiring another browser event.
     * @member {Object|null} vesselConversionCoordinatorFrame=null
     * @protected
     */
    vesselConversionCoordinatorFrame = null

    /**
     * Latest gesture frame observed while a strict platform transition is settling. Only the
     * newest frame is replayed after settlement, so a slow park/re-show can never commit stale
     * geometry merely because the pointer stopped before another browser event arrived.
     * @member {Object|null} vesselConversionReplayFrame=null
     * @protected
     */
    vesselConversionReplayFrame = null

    /**
     * One generation-scoped replay chained behind the current sensor transition.
     * @member {Promise<Boolean>|null} vesselConversionReplayPromise=null
     * @protected
     */
    vesselConversionReplayPromise = null

    /**
     * Warms the cross-window {@link Neo.manager.DragCoordinator} OFF the drag hot path: a `sortGroup`
     * zone kicks off the cached dynamic import at construction so {@link #onDragMove} /
     * {@link #processDragEnd} read {@link #dragCoordinator} synchronously during a gesture instead of
     * awaiting a module load while `Neo.manager.DomEvent.fire` events are in flight (it does not await
     * the drag handlers, so a drag-time async boundary would let a fast release finalize before the
     * move engages the coordinator). The import stays out of module scope — the adapter's static
     * import of this class never pulls the `manager.Window` chain into a non-dragging environment —
     * and never fires for an in-window-only dock.
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        me.sortGroup && me.resolveDragCoordinator();

        // Tear-out re-fire seam: the inherited boundary hysteresis fires these on the ZONE; the
        // adapter's closure-captured handlers live on the tab.Container listeners block (the
        // clone-safe home its cross-zone events already use), so the zone re-fires there. Wired
        // unconditionally — without `enableProxyToPopup` the base never fires either event, so
        // an in-window dock pays nothing.
        me.on({
            dragBoundaryEntry: me.onDockBoundaryEntry,
            dragBoundaryExit : me.onDockBoundaryExit,
            scope            : me
        })
    }

    /**
     * Re-fires the inherited `dragBoundaryEntry` (the drag re-entered the source window past the
     * reattach threshold — the base already restored the in-window proxy state) as
     * `dockTearOutEntry` on the owner tab.Container. The host's handler closes its vessel and
     * clears transient tear-out state — with ZERO model mutation: re-entry is a resumed in-window
     * gesture, not an outcome.
     * @param {Object} data
     */
    onDockBoundaryEntry(data) {
        let me     = this,
            itemId = me.dockItemIds?.[me.startIndex];

        me.owner?.up?.()?.fire('dockTearOutEntry', {
            ...data, itemId, sortZone: me, sourceNodeId: me.dockSourceNodeId
        })
    }

    /**
     * Re-fires the inherited `dragBoundaryExit` (the drag left the source window past the detach
     * threshold) as `dockTearOutExit` on the owner tab.Container. The host's handler owns what
     * happens next — vessel acquisition per the admission contract (`windowOpen` returns a
     * Boolean; `false` degrades the gesture to its in-window fallback) and, on success, engaging
     * {@link #startWindowDrag}. No model mutation happens here or in the host's exit handler: the
     * detach commits only at {@link #processDragEnd}'s `dockTearOutTerminal`.
     * @param {Object} data
     */
    onDockBoundaryExit(data) {
        let me     = this,
            itemId = me.dockItemIds?.[me.startIndex];

        me.owner?.up?.()?.fire('dockTearOutExit', {
            ...data, itemId, sortZone: me, sourceNodeId: me.dockSourceNodeId
        })
    }

    /**
     * Resumes the in-window embodiment after a detached phase ends without an outcome — the
     * symmetric close of {@link #startWindowDrag}: the proxy becomes visible again and the base
     * reorder un-parks. Two callers, both host-choreographed: a boundary re-entry (the gesture
     * continues in-window) and a FAILED vessel admission (the base arms `isWindowDragging` BEFORE
     * firing the exit event, so a blocked popup must actively restore the in-window gesture or the
     * zone stays parked with a dead detached state). Worker and main movement ownership must close
     * together; otherwise the next pointer frame still routes through the retired native vessel.
     */
    endWindowDrag() {
        let me = this;

        me.dragProxy && (me.dragProxy.style = {opacity: 1});
        me.isWindowDragging = false;

        Neo.main.addon.DragDrop.setConfigs({isWindowDragging: false, windowId: me.windowId})
    }

    /**
     * @summary Prevents popup-scale boundary overlap from impersonating a source-window re-entry
     * after a remote target already won the current pointer frame.
     *
     * The coordinator resolves claims before the base boundary sampler runs. Once a remote claim
     * exists, that frame belongs to the remote window even when the future-vessel-sized proxy
     * geometrically overlaps the source boundary. The next claim-free frame delegates unchanged,
     * preserving ordinary void motion and the real return-to-source transition.
     * @param {Object} data
     * @returns {Boolean}
     * @protected
     */
    checkWindowBoundary(data) {
        let me          = this,
            remoteClaim = me.dragCoordinator?.pointerClaimArbiter?.resolve?.() ?? null;

        if (me.isWindowDragging && remoteClaim) return true;

        return super.checkWindowBoundary(data)
    }

    /**
     * @summary Ends a non-terminal conversion because its target disappeared.
     *
     * Unlike {@link #resetVesselConversion}, this path emits the sensor's convert-out seam before
     * forgetting state, so the physical-lifecycle owner receives exactly one convert-out seam when
     * a target unregisters mid-gesture. Gesture terminals use the silent reset instead: their
     * outcome choreography owns disposition and must not be double-driven by a synthetic reversion.
     * @returns {Boolean} `true` only when no conversion ownership remains
     */
    cancelVesselConversion() {
        let me     = this,
            sensor = me.vesselConversionSensor;

        if (!sensor) return true;

        if (sensor.transitioning) {
            // If the target disappears while park admission is still provisional, never reset
            // the sensor out from under the host effect. Queue one convert-out behind that exact
            // settlement; a refused park has no ownership and can reset immediately.
            if (sensor.targetConverted && !me.vesselConversionCancelPromise) {
                const epoch      = me.vesselConversionEpoch,
                      transition = sensor.transitionPromise;

                me.vesselConversionCancelPromise = Promise.resolve(transition).then(admitted => {
                    if (me.vesselConversionSensor !== sensor || me.vesselConversionEpoch !== epoch) return false;

                    me.vesselConversionCancelPromise = null;

                    if (!admitted || !sensor.converted) {
                        me.resetVesselConversion();
                        return true
                    }

                    const record = sensor.sample({
                        pointerInTarget: false,
                        sourceRect     : me.vesselConversionSourceRect,
                        targetRect     : me.vesselConversionTargetRect
                    });

                    if (!record.transitioning && !record.converted) {
                        me.resetVesselConversion();
                        return true
                    }

                    return false
                }, () => {
                    me.vesselConversionSensor === sensor && me.vesselConversionEpoch === epoch
                        && me.resetVesselConversion();
                    return true
                })
            }

            return false
        }

        if (sensor.converted) {
            const record = sensor.sample({
                pointerInTarget: false,
                sourceRect     : me.vesselConversionSourceRect,
                targetRect     : me.vesselConversionTargetRect
            });

            // Re-show admission owns the slot until strict success. A pending or refused effect
            // must remain retryable; resetting here would strand the physical vessel parked.
            if (record.transitioning || record.converted) return false
        }

        me.resetVesselConversion();

        return true
    }

    /**
     * @summary Returns the source-owned conversion sensor, creating it lazily for an active drag.
     * @returns {Object}
     * @protected
     */
    getVesselConversionSensor() {
        let me = this;

        return me.vesselConversionSensor ??= createVesselConversionSensor({
            convertThreshold: me.vesselConversionConvertThreshold,
            revertThreshold : me.vesselConversionRevertThreshold,
            onConvertIn(record) {
                let itemId = me.vesselConversionItemId ?? me.dragComponent?.dockItemId
                    ?? me.dockItemIds?.[me.startIndex] ?? null;

                const data = {
                    admission   : false,
                    itemId,
                    logicalRect : me.vesselConversionLogicalRect && {...me.vesselConversionLogicalRect},
                    record,
                    sortZone    : me,
                    sourceNodeId: me.dockSourceNodeId,
                    targetId    : me.vesselConversionTargetId
                };

                me.owner?.up?.()?.fire('dockVesselConversionIn', data);

                return data.admission
            },
            onConvertOut(record) {
                let itemId = me.vesselConversionItemId ?? me.dragComponent?.dockItemId
                    ?? me.dockItemIds?.[me.startIndex] ?? null;

                const data = {
                    admission   : false,
                    itemId,
                    logicalRect : me.vesselConversionLogicalRect && {...me.vesselConversionLogicalRect},
                    record,
                    sortZone    : me,
                    sourceNodeId: me.dockSourceNodeId,
                    targetId    : me.vesselConversionTargetId
                };

                me.owner?.up?.()?.fire('dockVesselConversionOut', data);

                return data.admission
            }
        })
    }

    /**
     * @summary Returns clone-safe admitted/provisional conversion truth for diagnostics and Neural Link.
     * @returns {{converted:Boolean, targetConverted:Boolean, targetId:(String|null), transitioning:Boolean}}
     */
    getVesselConversionState() {
        let sensor = this.vesselConversionSensor;

        return {
            converted      : sensor?.converted === true,
            targetConverted: sensor?.targetConverted === true,
            targetId       : this.vesselConversionTargetId ?? null,
            transitioning  : sensor?.transitioning === true
        }
    }

    /**
     * @summary Replays the newest pointer/geometry truth after strict platform admission settles.
     *
     * Pointer frames are intentionally not queued one-by-one: only the latest source-owned truth
     * can decide whether the just-admitted park/re-show still matches user intent. Reset bumps the
     * epoch and invalidates the continuation before it can touch a successor gesture.
     * @param {Object} frame
     * @returns {Promise<Boolean>}
     * @protected
     */
    scheduleVesselConversionReplay(frame) {
        let me     = this,
            sensor = me.vesselConversionSensor;

        me.vesselConversionReplayFrame = {
            ...frame,
            logicalSourceRect: frame.logicalSourceRect && {...frame.logicalSourceRect},
            targetRect       : frame.targetRect && {...frame.targetRect}
        };

        if (me.vesselConversionReplayPromise || !sensor?.transitionPromise) {
            return me.vesselConversionReplayPromise ?? Promise.resolve(false)
        }

        const epoch      = me.vesselConversionEpoch,
              transition = sensor.transitionPromise;

        me.vesselConversionReplayPromise = Promise.resolve(transition).then(admitted => {
            if (me.vesselConversionSensor !== sensor || me.vesselConversionEpoch !== epoch) return false;

            const latest = me.vesselConversionReplayFrame;

            me.vesselConversionReplayFrame   = null;
            me.vesselConversionReplayPromise = null;

            if (admitted !== true || !latest || !me.isWindowDragging) return admitted === true;

            const coordinatorFrame = me.vesselConversionCoordinatorFrame;

            if (coordinatorFrame && me.dragCoordinator) {
                me.dragCoordinator.onDragMove({
                    ...coordinatorFrame,
                    proxyRect: coordinatorFrame.proxyRect && {
                        height: coordinatorFrame.proxyRect.height,
                        width : coordinatorFrame.proxyRect.width,
                        x     : coordinatorFrame.proxyRect.x,
                        y     : coordinatorFrame.proxyRect.y
                    },
                    replayAfterTransition: true
                });

                return true
            }

            me.resolveRemoteDragTransition({...latest, replayAfterTransition: true});

            return true
        }, () => {
            if (me.vesselConversionSensor === sensor && me.vesselConversionEpoch === epoch) {
                me.vesselConversionReplayFrame   = null;
                me.vesselConversionReplayPromise = null
            }

            return false
        });

        return me.vesselConversionReplayPromise
    }

    /**
     * @summary Resolves the exact live tear-out vessel rect through the clone-safe owner seam.
     *
     * A projected SortZone cannot carry a function config through the component clone boundary.
     * The zone therefore fires a synchronous request on its tab.Container; the workspace-owned
     * listener resolves the current item→vessel identity and writes `sourceRect`. Missing,
     * thenable, degenerate, or non-finite answers fail closed. The coordinator's logical proxy rect
     * is context only and can never become the conversion denominator.
     * @param {Object} data
     * @param {Object} data.draggedItem
     * @param {Object|null} data.logicalRect
     * @returns {Object|null}
     * @protected
     */
    resolveVesselConversionSourceGeometry({draggedItem, logicalRect}) {
        let me      = this,
            itemId  = draggedItem?.dockItemId ?? me.dockItemIds?.[me.startIndex] ?? null,
            request = {draggedItem, itemId, logicalRect, sourceRect: null},
            rect;

        me.owner?.up?.()?.fire('dockVesselConversionSourceRectRequest', request);
        rect = request.sourceRect;

        if (
            typeof rect?.then === 'function' ||
            !['x', 'y', 'width', 'height'].every(key => Number.isFinite(rect?.[key])) ||
            rect.width <= 0 || rect.height <= 0
        ) {
            return null
        }

        return {height: rect.height, width: rect.width, x: rect.x, y: rect.y}
    }

    /**
     * @summary Resolves one stable-claim frame into remote-preview and commit eligibility.
     *
     * This is the production binding for {@link Neo.dashboard.DockVesselConversion}. The manager
     * supplies the logical pointer-follow rect plus live target geometry after deterministic claim
     * arbitration; this dock-owned source resolves its exact live vessel rect, samples the pure
     * sensor, and returns a synchronous policy record. Raw pointer loss
     * drops commit eligibility immediately. A bounded grace may retain the already-rendered hover
     * without feeding `pointerInTarget=false` into the deliberately undamped sensor until expiry.
     * Target identity is part of the binding (the sensor itself is intentionally identity-free):
     * switching A→B first reverts A, then B must clear its own geometry threshold.
     * @param {Object} frame
     * @param {Object} frame.draggedItem
     * @param {Number} frame.now
     * @param {Boolean} frame.pointerInTarget
     * @param {Boolean} [frame.replayAfterTransition=false] Internal transition continuation marker
     * @param {Object} frame.logicalSourceRect
     * @param {String|null} frame.targetId
     * @param {Object|null} frame.targetRect
     * @returns {{commitEligible: Boolean, engage: Boolean, retain: Boolean,
     *     sourceRect: (Object|undefined)}|null}
     *     An engaged record carries the exact live source extent for target-proxy embodiment;
     *     `null` keeps the legacy coordinator path when conversion is disabled or the source is not
     *     in a window drag.
     */
    resolveRemoteDragTransition({
        draggedItem,
        logicalSourceRect,
        now=Date.now(),
        pointerInTarget,
        replayAfterTransition=false,
        targetId,
        targetRect
    } = {}) {
        let me = this;

        if (!me.enableVesselConversion || !me.isWindowDragging) {
            return null
        }

        if (!draggedItem) {
            return {commitEligible: false, engage: false, retain: false}
        }

        let sensor = me.getVesselConversionSensor(),
            grace  = Number.isFinite(me.vesselConversionPointerExitGraceMs)
                ? Math.max(0, me.vesselConversionPointerExitGraceMs)
                : 0;

        me.vesselConversionItemId = draggedItem.dockItemId
            ?? me.dragComponent?.dockItemId
            ?? me.dockItemIds?.[me.startIndex]
            ?? null;
        me.vesselConversionLogicalRect = logicalSourceRect ? {...logicalSourceRect} : null;

        let liveSourceRect;

        // Once park is proposed or admitted, the physical rect is host-authored parked output, not
        // user trajectory. Continue with the logical pointer-follow origin and the last exact live
        // extents while strict platform admission settles.
        if (
            (sensor.converted || sensor.targetConverted || replayAfterTransition) &&
            me.vesselConversionSourceRect && logicalSourceRect
        ) {
            liveSourceRect = {
                height: me.vesselConversionSourceRect.height,
                width : me.vesselConversionSourceRect.width,
                x     : logicalSourceRect.x,
                y     : logicalSourceRect.y
            }
        } else {
            liveSourceRect = me.resolveVesselConversionSourceGeometry({draggedItem, logicalRect: logicalSourceRect})
        }

        if (!liveSourceRect) {
            me.cancelVesselConversion();
            return {commitEligible: false, engage: false, retain: false}
        }

        me.vesselConversionSourceRect = liveSourceRect;

        // A platform effect is provisional authority. The coordinator receives a synchronous
        // fail-closed policy while it settles; no Promise escapes this source-owned boundary. The
        // latest frame is replayed automatically after settlement, closing the otherwise-stale
        // "move below threshold, then stop" race in both conversion directions.
        if (sensor.transitioning) {
            sensor.sample({
                pointerInTarget: pointerInTarget === true,
                sourceRect     : me.vesselConversionSourceRect,
                targetRect     : targetRect ?? me.vesselConversionTargetRect
            });
            me.scheduleVesselConversionReplay({
                draggedItem,
                logicalSourceRect,
                now,
                pointerInTarget,
                targetId,
                targetRect
            });

            return {commitEligible: false, engage: false, retain: false}
        }

        if (pointerInTarget === true && targetId != null && targetRect) {
            if (me.vesselConversionTargetId != null && me.vesselConversionTargetId !== targetId) {
                if (sensor.converted) {
                    const record = sensor.sample({
                        pointerInTarget: false,
                        sourceRect     : me.vesselConversionSourceRect,
                        targetRect     : me.vesselConversionTargetRect
                    });

                    // A→B cannot mint B ownership while A's exact vessel is still parked. Wait
                    // behind the synchronous fail-closed hook, then replay this B frame even when
                    // the pointer stops before another browser event arrives.
                    if (record.transitioning || record.converted) {
                        record.transitioning && me.scheduleVesselConversionReplay({
                            draggedItem,
                            logicalSourceRect,
                            now,
                            pointerInTarget,
                            targetId,
                            targetRect
                        });
                        return {commitEligible: false, engage: false, retain: false}
                    }
                }

                sensor.reset()
            }

            me.vesselConversionPointerMissedAt = null;
            me.vesselConversionTargetId        = targetId;
            me.vesselConversionTargetRect      = {...targetRect};

            let record = sensor.sample({
                pointerInTarget: true,
                sourceRect     : me.vesselConversionSourceRect,
                targetRect     : me.vesselConversionTargetRect
            });

            record.transitioning && me.scheduleVesselConversionReplay({
                draggedItem,
                logicalSourceRect,
                now,
                pointerInTarget,
                targetId,
                targetRect
            });

            return {
                commitEligible: record.converted && !record.transitioning,
                engage        : record.converted && !record.transitioning,
                retain        : false,
                sourceRect    : record.converted && !record.transitioning
                    ? {...me.vesselConversionSourceRect}
                    : undefined
            }
        }

        if (!sensor.converted) {
            me.vesselConversionPointerMissedAt = null;
            return {commitEligible: false, engage: false, retain: false}
        }

        me.vesselConversionPointerMissedAt ??= now;

        if (now - me.vesselConversionPointerMissedAt < grace) {
            let record = sensor.sample({
                pointerInTarget: true,
                sourceRect     : me.vesselConversionSourceRect,
                targetRect     : me.vesselConversionTargetRect
            });

            return {
                commitEligible: false,
                engage        : record.converted,
                retain        : record.converted,
                sourceRect    : record.converted ? {...me.vesselConversionSourceRect} : undefined
            }
        }

        const record = sensor.sample({
            pointerInTarget: false,
            sourceRect     : me.vesselConversionSourceRect,
            targetRect     : me.vesselConversionTargetRect
        });

        record.transitioning && me.scheduleVesselConversionReplay({
            draggedItem,
            logicalSourceRect,
            now,
            pointerInTarget,
            targetId,
            targetRect
        });

        return {commitEligible: false, engage: false, retain: false}
    }

    /**
     * @summary Silently clears all conversion binding state at a gesture terminal.
     */
    resetVesselConversion() {
        let me = this;

        me.vesselConversionEpoch++;
        me.vesselConversionSensor?.reset();
        me.vesselConversionCancelPromise   = null;
        me.vesselConversionCoordinatorFrame = null;
        me.vesselConversionItemId          = null;
        me.vesselConversionLogicalRect     = null;
        me.vesselConversionPointerMissedAt = null;
        me.vesselConversionReplayFrame     = null;
        me.vesselConversionReplayPromise   = null;
        me.vesselConversionSourceRect      = null;
        me.vesselConversionTargetId        = null;
        me.vesselConversionTargetRect      = null
    }

    /**
     * @summary Fires one clone-safe vessel lifecycle record for the caller to settle.
     * @param {Neo.tab.Container|null} tabContainer
     * @param {String} eventName
     * @param {Object} data
     * @returns {Object}
     * @protected
     */
    fireDockLifecycleEvent(tabContainer, eventName, data) {
        const record = {settlement: false, sortZone: this, ...data};

        tabContainer?.fire(eventName, record);

        return record
    }

    /**
     * Engages the OS-window pointer-follow embodiment after the host acquired a vessel for a
     * tear-out: the in-window proxy stays alive to capture pointer events but turns invisible,
     * {@link Neo.draggable.container.SortZone#isWindowDragging} arms (which parks the base
     * reorder commit), and the DragDrop main-thread addon takes over moving the popup window with
     * the pointer. The dock-tier mirror of the dashboard SortZone's method — implemented here per
     * the docking design record's contract-not-class constraint (dock surfaces do not inherit the
     * dashboard sort zone). No dashboard layout re-flow: a tab strip's geometry is owned by the
     * committed model projection, which this gesture has not touched.
     * @param {Object} data
     * @param {Number} data.popupHeight
     * @param {Number} data.popupWidth
     * @param {String} data.windowName
     */
    startWindowDrag(data) {
        let me                                    = this,
            {popupHeight, popupWidth, windowName} = data;

        me.dragProxy && (me.dragProxy.style = {opacity: 0});
        me.isWindowDragging = true;

        Neo.main.addon.DragDrop.startWindowDrag({
            popupHeight,
            popupName: windowName,
            popupWidth,
            windowId : me.windowId
        })
    }

    /**
     * Extends the base proxy config (which copies the owner's cls): the dock proxy is a
     * BODY-mounted embodiment (`DragZone#proxyParentId` defaults to `document.body`), so
     * descendant scoping from the dock host cannot reach it — ownership, theme, and the host's
     * active preview language must travel WITH the embodiment instead:
     * - `neo-dock-dragproxy` — the dock-ownership marker. Shared dock skins scope to this,
     *   never to the generic `.neo-dragproxy` every drag system (grid, list, tree) shares.
     * - the NEAREST ancestor theme cls — app theme files project the `--agent-dock-preview-*`
     *   palette aliases onto the theme class, so carrying it makes the aliases resolve ON the
     *   proxy at its body mount. Nearest-first matters: an app can theme-swap an inner root
     *   while `document.body` keeps the boot theme (the Workstation toggle does exactly this),
     *   so `getTheme()` — which resolves the outer boot theme — is only the no-ancestor
     *   fallback. Nearest-ancestor mirrors what the CSS cascade gave the drag source itself.
     * - the host's `neo-preview-lang-*` modifier — the language gate, read off the same
     *   parent chain (the modifier lives on the dock host, an ancestor; the open-selector
     *   contract mirrors `Workstation.view.Workspace#previewLanguage`).
     * @returns {Object}
     */
    getDragProxyConfig() {
        let me       = this,
            config   = super.getDragProxyConfig(),
            cls      = [...config.cls, 'neo-dock-dragproxy'],
            language = null,
            theme    = null,
            parent   = me.owner;

        while (parent && !(language && theme)) {
            const parentCls = parent.cls || [];

            language ??= parentCls.find(item => item.startsWith('neo-preview-lang-'));
            theme    ??= parentCls.find(item => item.startsWith('neo-theme-'));

            parent = parent.parent
        }

        theme ??= me.owner.getTheme();

        language                          && cls.push(language);
        theme && !cls.includes(theme) && cls.push(theme);

        return {...config, cls}
    }

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
        let me = this;

        // A terminal restore/retirement may still be settling after the base has restored layout.
        // Starting a successor in that interval would let the predecessor's exact-window effect
        // mutate the successor generation. Fail shut until the inherited end latch releases.
        if (me.dragEndActive) return;

        me.resetVesselConversion?.();

        if (me.isStackHandleDrag?.(data)) {
            let pathIds     = new Set((data.path || []).map(node => node.id).filter(Boolean)),
                tabButtons  = me.owner.getTabButtons(),
                draggedItem = tabButtons.find(item => pathIds.has(item.id)),
                index       = tabButtons.indexOf(draggedItem);

            if (!draggedItem || index < 0 || !me.dockWorkspaceId) {
                return
            }

            me.dockSourceToolbarRect = await me.owner?.getDomRect() ?? null;
            me.currentIndex          = index;
            me.dragComponent         = draggedItem;
            me.dragElement           = draggedItem.vdom;
            me.stackDragActive       = true;
            me.startIndex            = index;

            draggedItem.dockGroupNodeId       = me.dockGroupNodeId;
            draggedItem.dockItemId            = me.dockItemIds?.[index] ?? me.dockItemIds?.[0] ?? null;
            draggedItem.dockSourceWorkspaceId = me.dockWorkspaceId;

            await me.dragStart(data);

            return
        }

        me.stackDragActive = false;

        // The real toolbar boundary, distinct from the base's tab-only sortBoundaryRect.
        // One pre-gesture measure, off the per-frame hot path.
        me.dockSourceToolbarRect = await me.owner?.getDomRect() ?? null;

        await super.onDragStart(data);

        let item = me.dragComponent;

        if (item) {
            delete item.dockGroupNodeId;
            item.dockItemId              = me.dockItemIds?.[me.startIndex] ?? null;
            item.dockSourceWorkspaceId   = me.dockWorkspaceId
        }
    }

    /**
     * @summary Whether this drag originated on the opt-in whole-stack grip.
     *
     * `main.addon.DragDrop#getEventData` preserves the native mousedown element as `target` and
     * its original composed path as `targetPath`, but replaces `path` with the custom `drag:start`
     * event path. That path begins at the draggable tab button, so a nested grip cannot be inferred
     * from it in the production mouse pipeline. Keep all three scans for direct/native callers
     * while treating the preserved target surfaces as the authoritative origin.
     * @param {Object} data drag-start payload with the main-thread DOM path
     * @returns {Boolean}
     * @protected
     */
    isStackHandleDrag(data) {
        let hasMarker = node =>
            Array.isArray(node?.cls) && node.cls.includes('neo-dock-stack-handle');

        return !!this.dockGroupNodeId && (
            hasMarker(data?.target) ||
            (data?.targetPath || []).some(hasMarker) ||
            (data?.path || []).some(hasMarker)
        )
    }

    /**
     * The release-boundary decision {@link #processDragEnd} consumes: a release farther than
     * {@link #dockReleaseTolerance} beyond the source toolbar's REAL bounds (any side, any
     * orientation) is dock-gesture territory — the within-toolbar reorder the pointer's PATH
     * recorded while crossing sibling buttons is geometrically void there. Left unvoided, the
     * base commit re-adds the item to its source zone and silently reverts the cross-zone commit
     * (last write wins). Near / in-toolbar releases return false — the base reorder applies.
     * Pure over instance state (no measuring, no side effects) so witnesses can drive it with
     * explicit rects.
     * @param {Object} data
     * @param {Number} data.clientX release viewport x
     * @param {Number} data.clientY release viewport y
     * @returns {Boolean} true = void the tracked reorder (cross-zone territory)
     */
    releaseVoidsReorder({clientX, clientY}) {
        let me                     = this,
            rect                   = me.dockSourceToolbarRect,
            {dockReleaseTolerance} = me;

        if (!rect || !Neo.isNumber(clientX) || !Neo.isNumber(clientY)) return false;

        return clientX < rect.x - dockReleaseTolerance || clientX > rect.x + rect.width  + dockReleaseTolerance
            || clientY < rect.y - dockReleaseTolerance || clientY > rect.y + rect.height + dockReleaseTolerance
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
     * while the target window hosts the hover. On the coordinator path the dock's embodiment is
     * the in-window drag proxy, so suspension is hiding it. (The tear-out popup embodiment closes
     * through its own gesture terminals, never through this remote-target hook.)
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
     * @summary Routes a detached dock cancel while its window-drag state is still observable,
     * then delegates to the generic sort-zone cancellation which clears that state and restores
     * the source DOM. The order is load-bearing: the base must reset `isWindowDragging` for its
     * ordinary cancel cleanup, while the host needs the pre-reset fact to retire its live vessel.
     * @param {Object} [data={}]
     * @returns {Promise<void>}
     */
    async onDragCancel(data={}) {
        let me               = this,
            itemId           = me.dockItemIds?.[me.startIndex],
            conversionItemId = me.dragComponent?.dockItemId ?? itemId ?? null,
            conversionActive = Boolean(
                me.vesselConversionSensor?.converted || me.vesselConversionSensor?.transitioning
            ),
            tabContainer = me.owner?.up?.();

        if (me.isWindowDragging && itemId) {
            const retirement = me.fireDockLifecycleEvent(tabContainer, 'dockTearOutCancel', {
                itemId, sortZone: me, sourceNodeId: me.dockSourceNodeId
            });

            if (conversionActive && conversionItemId) {
                me.fireDockLifecycleEvent(tabContainer, 'dockVesselConversionRetired', {
                    itemId: conversionItemId, retirement: retirement.settlement
                })
            }
        }

        await super.onDragCancel(data)
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
     * A drag released while DETACHED ({@link Neo.draggable.container.SortZone#isWindowDragging})
     * fires `dockTearOutTerminal` instead of the in-window drop — the one signal a host may commit
     * a `detachItem` on. A cancel while detached routes `dockTearOutCancel` from
     * {@link #onDragCancel} BEFORE the generic base clears `isWindowDragging`; this method then
     * emits the regular cancel event after that vessel-cleanup signal.
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

        const conversionItemId = me.dragComponent?.dockItemId ?? itemId ?? null,
              conversionActive = Boolean(
                  me.vesselConversionSensor?.converted || me.vesselConversionSensor?.transitioning
              ),
              conversionTargetConverted = me.vesselConversionSensor?.targetConverted === true;

        let postCleanup = null;

        if (me.stackDragActive) {
            let commitError    = null,
                terminalItemId = me.dragComponent?.dockItemId ?? itemId ?? null;

            try {
                if (me.sortGroup && me.dragComponent) {
                    me.dragCoordinator?.[data.cancelled ? 'onDragCancel' : 'onDragEnd']({
                        draggedItem   : me.dragComponent,
                        sourceSortZone: me
                    })
                }
            } catch (error) {
                commitError = error
            }

            const committed = !data.cancelled && !commitError && me.remoteDropCommitted,
                outcome     = committed ? 'committed' : data.cancelled ? 'cancelled' : 'rejected';

            try {
                tabContainer?.fire('dockStackDragTerminal', {
                    cancelled        : data.cancelled === true,
                    committed,
                    errors           : commitError ? [commitError?.message || String(commitError)] : [],
                    groupNodeId      : me.dockGroupNodeId,
                    itemId           : terminalItemId,
                    outcome,
                    sortZone         : me,
                    sourceWorkspaceId: me.dockWorkspaceId
                })
            } finally {
                me.remoteDropCommitted = false;
                me.dragEnd(data);
                me.dragComponent   = null;
                me.dragElement     = null;
                me.stackDragActive = false;
                me.startIndex      = -1;
                me.resetVesselConversion?.()
            }

            if (commitError) {
                throw commitError
            }

            return
        }

        let commitError = null;

        try {
            if (me.sortGroup && me.dragComponent) {
                me.dragCoordinator?.[data.cancelled ? 'onDragCancel' : 'onDragEnd']({
                    draggedItem   : me.dragComponent,
                    sourceSortZone: me
                })
            }
        } catch (error) {
            commitError = error
        }

        if (!data.cancelled && me.releaseVoidsReorder(data || {})) {
            me.currentIndex = me.startIndex
        }

        if (data.cancelled) {
            me.remoteDropCommitted = false;
            itemId && tabContainer?.fire('dockCrossZoneDragCancel', {itemId, sourceNodeId: me.dockSourceNodeId})
        } else if (!commitError && me.remoteDropCommitted) {
            if (conversionActive && conversionItemId) {
                me.fireDockLifecycleEvent(tabContainer, 'dockVesselConversionTerminal', {
                    itemId: conversionItemId, outcome: 'committed'
                })
            }

            me.remoteDropCommitted = false
        } else if (conversionActive && conversionItemId) {
            if (conversionTargetConverted) {
                // The target refused while the G1 vessel was parking/parked. It is still an empty
                // provisional render target and source model truth remains home: retire it with
                // zero mutation, then clear the park generation. Re-showing before close would
                // create competing physical dispositions for the same exact handle.
                const retirement = me.fireDockLifecycleEvent(tabContainer, 'dockTearOutCancel', {
                    itemId: conversionItemId, sourceNodeId: me.dockSourceNodeId
                });

                me.fireDockLifecycleEvent(tabContainer, 'dockVesselConversionRetired', {
                    itemId: conversionItemId, retirement: retirement.settlement
                })
            } else {
                // Release raced an admitted convert-out. Complete terminal re-show first; only a
                // strict restore may proceed to the ordinary detached commit/adoption. Refusal
                // degrades to zero-mutation retirement so no still-parked vessel is adopted.
                const terminal = me.fireDockLifecycleEvent(tabContainer, 'dockVesselConversionTerminal', {
                    itemId: conversionItemId, outcome: 'rejected'
                });

                postCleanup = async () => {
                    let restored = false;

                    try {
                        restored = await terminal.settlement === true
                    } catch {
                        restored = false
                    }

                    if (restored) {
                        tabContainer?.fire('dockTearOutTerminal', {
                            itemId: conversionItemId, sortZone: me, sourceNodeId: me.dockSourceNodeId
                        })
                    } else {
                        const retirement = me.fireDockLifecycleEvent(tabContainer, 'dockTearOutCancel', {
                            itemId: conversionItemId, sourceNodeId: me.dockSourceNodeId
                        });

                        me.fireDockLifecycleEvent(tabContainer, 'dockVesselConversionRetired', {
                            itemId: conversionItemId, retirement: retirement.settlement
                        })
                    }
                }
            }

            me.remoteDropCommitted = false
        } else if (me.isWindowDragging) {
            // Released while detached — THE terminal a dock host may commit a `detachItem` on
            // (model commit precedes any window close per the choreography contract). The zone
            // itself never mutates documents; deterministic outcome order is cancel → remote
            // transfer → tear-out terminal → in-window cross-zone drop.
            itemId && tabContainer?.fire('dockTearOutTerminal', {itemId, sortZone: me, sourceNodeId: me.dockSourceNodeId})
        } else if (itemId && tabContainer && Neo.isNumber(clientX) && Neo.isNumber(clientY)) {
            tabContainer.fire('dockCrossZoneDrop', {clientX, clientY, itemId, sourceNodeId: me.dockSourceNodeId})
        }

        try {
            await super.processDragEnd(data)
        } finally {
            me.resetVesselConversion?.()
        }

        await postCleanup?.();

        if (commitError) {
            throw commitError
        }
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
        let me = this;

        // Engage the cross-window coordinator SYNCHRONOUSLY on entry — BEFORE the base sort's awaits
        // (the edge auto-scroll branch awaits `timeout(30)`) — so a release arriving mid-move still
        // finds the engaged remote target: `Neo.manager.DomEvent.fire` does not await drag handlers,
        // and {@link #processDragEnd}'s coordinator-end is likewise synchronous, so the two stay
        // ordered move-before-end regardless of the base suspension. Screen-space engagement is
        // independent of the base's local sort result. `dragCoordinator` is preloaded at
        // {@link #construct}, so this is a synchronous field read, never a drag-time import.
        if (me.sortGroup && me.dragComponent && data?.proxyRect && Neo.isNumber(data.screenX)) {
            const coordinatorFrame = {
                draggedItem: me.dragComponent,
                offsetX    : data.offsetX,
                offsetY    : data.offsetY,
                proxyRect  : {
                    height: data.proxyRect.height,
                    width : data.proxyRect.width,
                    x     : data.proxyRect.x,
                    y     : data.proxyRect.y
                },
                screenX       : data.screenX,
                screenY       : data.screenY,
                sourceSortZone: me
            };

            me.vesselConversionCoordinatorFrame = coordinatorFrame;
            me.dragCoordinator?.onDragMove(coordinatorFrame)
        }

        if (me.stackDragActive) {
            me.dragMove(data);
            return
        }

        await super.onDragMove(data);

        let itemId             = me.dockItemIds?.[me.startIndex],
            tabContainer       = me.owner?.up?.(),
            {clientX, clientY} = data || {};

        if (itemId && tabContainer && Neo.isNumber(clientX) && Neo.isNumber(clientY)) {
            tabContainer.fire('dockCrossZoneDragMove', {clientX, clientY, itemId, sourceNodeId: me.dockSourceNodeId})
        }
    }

    /**
     * Resolves the `Neo.manager.DragCoordinator` singleton via a cached dynamic import and caches it
     * onto the synchronous {@link #dragCoordinator} handle. Kept OUT of module scope so the adapter's
     * static import of this SortZone (for its projected `sortZoneConfig`) does NOT pull the
     * `DragCoordinator → manager.Window` import-time chain (Window's `construct()` touches
     * `Neo.currentWorker.on` at `setupClass`) into environments that never drag, e.g. the unit test
     * loader (which stubs the worker only inside its setup call, after ESM hoists the imports).
     * {@link #construct} warms it for a cross-window zone so the drag handlers never trigger the load;
     * the promise is cached, so repeat calls share one import.
     * @returns {Promise<Neo.manager.DragCoordinator>}
     */
    resolveDragCoordinator() {
        return this._dragCoordinatorPromise ??= import('../manager/DragCoordinator.mjs').then(module => this.dragCoordinator = module.default)
    }

    /**
     * Resets the pure binding before the ordinary SortZone teardown.
     * @param {...*} args
     */
    destroy(...args) {
        this.resetVesselConversion();
        super.destroy(...args)
    }
}

export default Neo.setupClass(DockTabSortZone);
