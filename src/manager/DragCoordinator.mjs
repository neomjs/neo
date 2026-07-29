import {createGestureClaimArbiter} from './GestureClaimArbiter.mjs';
import Manager                     from './Base.mjs';
import Rectangle                   from '../util/Rectangle.mjs';
import Window                      from './Window.mjs';

/**
 * @class Neo.manager.DragCoordinator
 * @extends Neo.manager.Base
 * @singleton
 */
class DragCoordinator extends Manager {
    static config = {
        /**
         * @member {String} className='Neo.manager.DragCoordinator'
         * @protected
         */
        className: 'Neo.manager.DragCoordinator',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true,
        /**
         * Minimum time a native popup must remain over a remote dashboard target before
         * geometry-only reintegration can commit.
         * @member {Number} nativeWindowDropDwellMs=450
         */
        nativeWindowDropDwellMs: 450,
        /**
         * Quiescence delay after the last native window-position update before committing
         * a geometry-only drop. The browser has no mouseup during OS-titlebar drags.
         * @member {Number} nativeWindowDropSettleMs=250
         */
        nativeWindowDropSettleMs: 250,
        /**
         * @member {Map} sortZones=new Map()
         * @protected
         */
        sortZones: new Map()
    }

    /**
     * @member {Neo.draggable.container.SortZone|null} activeTargetZone=null
     * @protected
     */
    activeTargetZone = null

    /**
     * Source whose optional transition resolver owns the active remote hover.
     * @member {Neo.draggable.container.SortZone|null} activeSourceZone=null
     * @protected
     */
    activeSourceZone = null

    /**
     * Whether the current raw pointer frame still licenses a commit into
     * {@link #activeTargetZone}. Visual debounce may retain a hover while this is false.
     * @member {Boolean} activeTargetCommitEligible=false
     * @protected
     */
    activeTargetCommitEligible = false

    /**
     * Whether the source resolver (rather than the coordinator's legacy suspend/resume pair)
     * owns the active hover transition.
     * @member {Boolean} activeTransitionOwned=false
     * @protected
     */
    activeTransitionOwned = false

    /**
     * Per-moving-popup claim arbiters for native-titlebar gestures (windowId → arbiter). One
     * native drag IS one gesture, so each moving popup owns exactly one token (harness docking
     * design record §2.8.1).
     * @member {Map<String,Object>} nativeClaimArbiters=new Map()
     * @protected
     */
    nativeClaimArbiters = new Map()

    /**
     * The target zone currently receiving continuous native-hover preview, per moving popup
     * (windowId → zone). Runtime-only hover bookkeeping; swept on every gesture terminal.
     * @member {Map<String,Object>} nativeHoverTargets=new Map()
     * @protected
     */
    nativeHoverTargets = new Map()

    /**
     * @member {Map<String,Object>} nativeWindowDropCandidates=new Map()
     * @protected
     */
    nativeWindowDropCandidates = new Map()

    /**
     * The active pointer gesture's claim arbiter — minted lazily at the gesture's first move,
     * killed at every terminal (end or cancel), so its token's claims die with the gesture.
     * @member {Object|null} pointerClaimArbiter=null
     * @protected
     */
    pointerClaimArbiter = null

    /**
     * @summary Clears a pending geometry-only native window-drop candidate.
     *
     * Clears a pending geometry-only native window-drop candidate.
     * @param {String} windowId
     */
    clearNativeWindowDropCandidate(windowId) {
        let candidate = this.nativeWindowDropCandidates.get(windowId);

        if (candidate) {
            clearTimeout(candidate.timeoutId);
            this.nativeWindowDropCandidates.delete(windowId)
        }
    }

    /**
     * @summary Ends a native-titlebar gesture's claim/hover bookkeeping exact-once.
     *
     * Kills the moving popup's claim arbiter (its token's claims die with the gesture) and ends
     * any continuous-hover preview it was driving. Safe on every terminal — commit, source
     * retirement, vessel departure — and idempotent: a second invocation finds nothing.
     * @param {String} windowId The MOVING popup's window id (the native gesture key).
     */
    endNativeGesture(windowId) {
        let me      = this,
            arbiter = me.nativeClaimArbiters.get(windowId),
            hover   = me.nativeHoverTargets.get(windowId);

        if (arbiter) {
            arbiter.reset();
            me.nativeClaimArbiters.delete(windowId)
        }

        if (hover) {
            hover.onRemoteDragLeave?.();
            me.nativeHoverTargets.delete(windowId)
        }
    }

    /**
     * @summary Commits an inferred native-titlebar popup drop into the remote dashboard path.
     *
     * Commits a conservative geometry-only native titlebar drop into the existing remote
     * dashboard drop path. The popup is closed only after dwell/settle intent has been inferred.
     * @param {String} windowId
     * @param {Object} candidate
     * @returns {Promise<void>}
     */
    async commitNativeWindowDrop(windowId, candidate) {
        let me      = this,
            current = me.nativeWindowDropCandidates.get(windowId);

        if (!current || current !== candidate) {
            return
        }

        me.nativeWindowDropCandidates.delete(windowId);

        let {
            draggedItem,
            localX,
            localY,
            offsetX,
            offsetY,
            proxyRect,
            sourceSortZone,
            targetSortZone,
            widgetName
        } = candidate;

        if (sourceSortZone.getNativeWindowDrag?.(windowId)?.draggedItem !== draggedItem) {
            return
        }

        if (!targetSortZone.acceptsRemoteDrag(localX, localY)) {
            return
        }

        await sourceSortZone.suspendWindowDrag(widgetName);

        await targetSortZone.onRemoteDragMove({
            draggedItem,
            embodyProxy: true,
            localX,
            localY,
            offsetX,
            offsetY,
            proxyRect,
            sourceSortZone
        });

        // The native-titlebar path answers the same question as the pointer path, so it obeys the same
        // rule: the target's return IS the commit decision, and a null means it declined. Retiring the
        // source anyway arms `remoteDropCommitted` and suppresses the source's own restore, leaving the
        // item with no owner — identical to the pointer defect, reached through a different door.
        const operation = await targetSortZone.onRemoteDrop(draggedItem);

        if (operation) {
            sourceSortZone.onRemoteDropOut(draggedItem)
        }

        // The commit is a gesture terminal: the popup's token and hover bookkeeping die here.
        // Ordered AFTER the drop — the preview is the drop's input and must outlive it.
        me.endNativeGesture(windowId);

        if (me.activeTargetZone === targetSortZone) {
            me.activeTargetZone = null
        }
    }

    /**
     * @summary Finds the terminal detached dashboard item represented by a native popup window.
     *
     * Finds the terminal detached dashboard item represented by a native popup window.
     * @param {String} windowId
     * @returns {Object|null}
     */
    getNativeWindowDragSource(windowId) {
        let me = this;

        for (const group of me.sortZones.values()) {
            for (const sortZone of group.values()) {
                let drag = sortZone.getNativeWindowDrag?.(windowId);

                if (drag) {
                    return {
                        ...drag,
                        sourceSortZone: sortZone
                    }
                }
            }
        }

        return null
    }

    /**
     * @summary Resolves a window at a point while excluding invalid native-titlebar targets.
     *
     * Resolves the first window at a global point while ignoring window ids that
     * cannot be valid native-titlebar drop targets, especially the popup being moved.
     * @param {Number} x
     * @param {Number} y
     * @param {Set<String>} excludedWindowIds
     * @returns {String|null}
     */
    getWindowAtExcept(x, y, excludedWindowIds) {
        let item = Window.items?.find(item => !excludedWindowIds.has(item.id) &&
            item.outerRect?.intersects({bottom: y, right: x, x, y}));

        return item ? item.id : null
    }

    /**
     * @summary Resolves native popup geometry to a remote dashboard drop candidate.
     *
     * Resolves a native popup's current geometry to a remote dashboard drop candidate.
     * @param {Object} data
     * @param {String} data.windowId
     * @param {Object} sourceDrag
     * @returns {Object|null}
     */
    getNativeWindowDropCandidate(data, sourceDrag) {
        let me               = this,
            {sourceSortZone} = sourceDrag,
            popupWindow      = Window.get(data.windowId),
            popupRect        = popupWindow?.innerRect,
            {sortGroup}      = sourceSortZone,
            targetWindowId, targetSortZone, targetWindow, localX, localY, width, height, arbiter, claimed, excludedWindowIds;

        if (!popupRect || !sortGroup) {
            return null
        }

        localX = popupRect.x + popupRect.width  / 2;
        localY = popupRect.y + popupRect.height / 2;

        excludedWindowIds = new Set([data.windowId, sourceSortZone.windowId]);
        arbiter           = me.nativeClaimArbiters.get(data.windowId);

        if (!arbiter) {
            arbiter = createGestureClaimArbiter();
            me.nativeClaimArbiters.set(data.windowId, arbiter)
        }

        claimed = me.resolveClaimedTarget({
            arbiter,
            excludedWindowIds,
            screenX: localX,
            screenY: localY,
            sortGroup,
            sourceSortZone
        });

        if (claimed) {
            targetSortZone = claimed.zone;
            targetWindowId = targetSortZone.windowId
        } else {
            // The pinned legacy path, stable-identity-free zones only (see resolveClaimedTarget).
            targetWindowId = me.getWindowAtExcept(localX, localY, excludedWindowIds);

            if (!targetWindowId) {
                return null
            }

            targetSortZone = me.sortZones.get(sortGroup)?.get(targetWindowId);

            if (targetSortZone?.stableTargetId != null) {
                return null
            }
        }

        targetWindow = Window.get(targetWindowId);

        if (!targetSortZone || !targetWindow?.innerRect) {
            return null
        }

        localX = localX - targetWindow.innerRect.x;
        localY = localY - targetWindow.innerRect.y;

        if (!claimed && !targetSortZone.acceptsRemoteDrag(localX, localY)) {
            return null
        }

        width  = popupRect.width;
        height = popupRect.height;

        return {
            ...sourceDrag,
            localX,
            localY,
            offsetX  : width  / 2,
            offsetY  : height / 2,
            proxyRect: new Rectangle(localX - width / 2, localY - height / 2, width, height),
            targetSortZone,
            targetWindowId
        }
    }

    /**
     * @param {Neo.draggable.container.SortZone} sourceSortZone
     * @param {Neo.component.Base} draggedItem
     * @param {DOMRect} proxyRect
     */
    handleVoid(sourceSortZone, draggedItem, proxyRect) {
        let me              = this,
            transitionOwned = me.activeTransitionOwned;

        if (me.activeTargetZone) {
            me.activeTargetZone.onRemoteDragLeave();
            me.activeTargetZone = null;

            me.activeSourceZone           = null;
            me.activeTargetCommitEligible = false;
            me.activeTransitionOwned      = false;

            // Resume source drag (re-open popup)
            if (!transitionOwned) {
                sourceSortZone.resumeWindowDrag(draggedItem.reference || draggedItem.id, proxyRect)
            }
        }
    }

    /**
     * @summary Resolves the gesture's single claimed target among stable-identity zones.
     *
     * The claim pass of the §2.8.1 protocol (harness docking design record): every registered
     * zone in the gesture's `sortGroup` that declares a `stableTargetId`, renders in a window
     * other than the source's, geometrically contains the point (window `innerRect`) AND accepts
     * the window-local hit-test acquires-or-refreshes a claim; zones that stop matching release
     * theirs. The arbiter then answers deterministically — earliest valid claim, stable-id
     * lexicographic tiebreak — or `null`, and `null` means fail closed: no preview, no commit.
     *
     * Dock-blindness holds: this method consumes registered zone identity and the main-thread
     * window geometry only — never dock semantics. Zones WITHOUT a `stableTargetId` never claim;
     * they stay on the legacy first-intersecting resolution their callers pin.
     * @param {Object} data
     * @param {Object} data.arbiter The gesture's claim arbiter.
     * @param {Set<String>|null} [data.excludedWindowIds=null] Window ids that cannot host a valid
     *     target (e.g. the moving popup itself on the native path).
     * @param {Number} data.screenX Global screen-space x.
     * @param {Number} data.screenY Global screen-space y.
     * @param {String} data.sortGroup
     * @param {Neo.draggable.container.SortZone} data.sourceSortZone
     * @returns {Object|null} `{stableId, zone}` of the winning claim, or null (fail closed)
     */
    resolveClaimedTarget({arbiter, excludedWindowIds = null, screenX, screenY, sortGroup, sourceSortZone}) {
        let group = this.sortZones.get(sortGroup);

        if (!group) {
            return null
        }

        for (const [windowId, zone] of group) {
            if (
                zone === sourceSortZone              ||
                windowId === sourceSortZone.windowId ||
                excludedWindowIds?.has(windowId)
            ) {
                continue
            }

            if (zone.stableTargetId == null || typeof zone.acceptsRemoteDrag !== 'function') {
                continue
            }

            let inner = Window.get(windowId)?.innerRect;

            if (
                inner?.intersects({bottom: screenY, right: screenX, x: screenX, y: screenY}) &&
                zone.acceptsRemoteDrag(screenX - inner.x, screenY - inner.y)
            ) {
                arbiter.claim(zone.stableTargetId, zone)
            } else {
                arbiter.release(zone.stableTargetId)
            }
        }

        return arbiter.resolve()
    }

    /**
     * @summary Pointer-path target resolution: the §2.8.1 claim protocol first, the pinned legacy
     * first-intersecting path for stable-identity-free zones only, fail closed otherwise.
     * @param {Object} data
     * @param {Neo.component.Base} data.draggedItem
     * @param {Number} data.offsetX
     * @param {Number} data.offsetY
     * @param {Object} data.proxyRect Pointer-follow proxy geometry in source-window coordinates.
     * @param {Number} data.screenX
     * @param {Number} data.screenY
     * @param {Neo.draggable.container.SortZone} data.sourceSortZone
     */
    onDragMove(data) {
        let me = this,
            {
                draggedItem,
                offsetX,
                offsetY,
                proxyRect,
                replayAfterTransition=false,
                screenX,
                screenY,
                sourceSortZone
            } = data,
            {sortGroup}                                                                  = sourceSortZone,
            arbiter                                                                      = me.pointerClaimArbiter ??= createGestureClaimArbiter(),
            claimed                                                                      = me.resolveClaimedTarget({arbiter, screenX, screenY, sortGroup, sourceSortZone}),
            targetSortZone                                                               = claimed?.zone,
            targetWindowId;

        if (!targetSortZone) {
            // The pinned legacy path: first-intersecting window by REGISTRATION ORDER. It survives
            // exclusively for zones without a stable identity — a zone that declares one rides the
            // claim protocol above and must never fall back here, otherwise overlap resolution
            // would silently regress to nondeterminism when its claim fails.
            targetWindowId = Window.getWindowAt(screenX, screenY);

            if (targetWindowId && targetWindowId !== sourceSortZone.windowId) {
                let zone = me.sortZones.get(sortGroup)?.get(targetWindowId);

                if (zone && zone.stableTargetId == null) {
                    let targetWindow = Window.get(targetWindowId);

                    if (zone.acceptsRemoteDrag(screenX - targetWindow.innerRect.x, screenY - targetWindow.innerRect.y)) {
                        targetSortZone = zone
                    }
                }
            }
        }


        const
            resolver = typeof sourceSortZone.resolveRemoteDragTransition === 'function'
                ? sourceSortZone.resolveRemoteDragTransition.bind(sourceSortZone)
                : null,
            rawTargetSortZone = targetSortZone,
            transitionTarget  = rawTargetSortZone || me.activeTargetZone,
            transitionWindow  = transitionTarget && Window.get(transitionTarget.windowId),
            // Claim acceptance and conversion geometry share ONE coordinate family. The target's
            // dock-accepting region lives in its viewport, so feeding the outer frame here would
            // let browser chrome inflate the overlap independently of the pointer claim.
            transitionRect    = transitionWindow?.innerRect,
            logicalSourceRect = {
                height: proxyRect.height,
                width : proxyRect.width,
                x     : screenX - offsetX,
                y     : screenY - offsetY
            };

        let
            transitionOwned      = false,
            transitionSourceRect = null;

        if (resolver) {
            let transition;

            try {
                transition = resolver({
                    draggedItem,
                    now            : Date.now(),
                    pointerInTarget: Boolean(claimed?.zone),
                    replayAfterTransition,
                    logicalSourceRect,
                    targetId       : claimed?.stableId ?? me.activeTargetZone?.stableTargetId ?? null,
                    targetRect     : transitionRect && {
                        height: transitionRect.height,
                        width : transitionRect.width,
                        x     : transitionRect.x,
                        y     : transitionRect.y
                    },
                    targetWindowId: transitionTarget?.windowId ?? null
                })
            } catch (error) {
                transition = false
            }

            // Conversion policy is a synchronous, finite decision. A Promise, malformed record,
            // or legacy-only candidate fails closed rather than smuggling a stale target through.
            if (transition == null) {
                // Source is outside its opt-in conversion phase; preserve the generic path.
            } else if (
                typeof transition?.then === 'function' ||
                typeof transition !== 'object'        ||
                typeof transition.commitEligible !== 'boolean' ||
                typeof transition.engage !== 'boolean'          ||
                typeof transition.retain !== 'boolean'
            ) {
                transitionOwned = true;
                targetSortZone = null;
                sourceSortZone.cancelVesselConversion?.()
            } else if (transition.retain === true && !rawTargetSortZone && me.activeTargetZone) {
                transitionOwned = true;
                me.activeTargetCommitEligible = false;
                me.activeTransitionOwned      = true;
                return
            } else {
                transitionOwned = true;

                if (transition.sourceRect != null) {
                    if (
                        !Number.isFinite(transition.sourceRect.width) ||
                        !Number.isFinite(transition.sourceRect.height) ||
                        transition.sourceRect.width <= 0 || transition.sourceRect.height <= 0
                    ) {
                        targetSortZone = null;
                        sourceSortZone.cancelVesselConversion?.()
                    } else {
                        transitionSourceRect = transition.sourceRect
                    }
                }

                if (transition.engage !== true || transition.commitEligible !== true || !claimed?.zone) {
                    targetSortZone = null
                }
            }
        }

        if (targetSortZone) {
            let targetWindow     = Window.get(targetSortZone.windowId),
                localX           = screenX - targetWindow.innerRect.x,
                localY           = screenY - targetWindow.innerRect.y,
                targetProxyWidth = transitionOwned && transitionSourceRect
                    ? transitionSourceRect.width
                    : proxyRect.width,
                targetProxyHeight = transitionOwned && transitionSourceRect
                    ? transitionSourceRect.height
                    : proxyRect.height,
                targetProxyRect   = new Rectangle(
                    localX - offsetX,
                    localY - offsetY,
                    targetProxyWidth,
                    targetProxyHeight
                );

            // Entering a new target zone
            if (me.activeTargetZone !== targetSortZone) {
                // Leaving previous target (if any)
                me.activeTargetZone?.onRemoteDragLeave();

                // Suspend source drag (close popup, etc)
                // We only do this once when leaving the void/source context
                if (!me.activeTargetZone && !transitionOwned) {
                    sourceSortZone.suspendWindowDrag(draggedItem.reference || draggedItem.id)
                }

                me.activeSourceZone = sourceSortZone;
                me.activeTargetZone = targetSortZone
            }

            me.activeTargetCommitEligible = true;
            me.activeTransitionOwned      = transitionOwned;

            targetSortZone.onRemoteDragMove({
                draggedItem,
                embodyProxy: transitionOwned,
                localX,
                localY,
                offsetX,
                offsetY,
                proxyRect  : targetProxyRect,
                sourceSortZone
            });

            return
        }

        // In void or back in source window
        me.handleVoid(sourceSortZone, draggedItem, proxyRect)
    }

    /**
     * Cancels cross-window arbitration without committing either the active remote target or
     * the source's terminal-drop path. Target hover state is released before the source sort
     * zone restores its captured layout.
     * @param {Object} data
     * @param {Neo.component.Base} data.draggedItem
     * @param {Neo.draggable.container.SortZone} data.sourceSortZone
     */
    onDragCancel(data) {
        let me               = this,
            {sourceSortZone} = data;

        // The token's claims die with its gesture — cancel is a terminal like any other.
        me.pointerClaimArbiter?.reset();
        me.pointerClaimArbiter = null;

        if (me.activeTargetZone) {
            me.activeTargetZone.onRemoteDragLeave();
            me.activeTargetZone = null
        }

        sourceSortZone.resetVesselConversion?.();
        me.activeSourceZone           = null;
        me.activeTargetCommitEligible = false;
        me.activeTransitionOwned      = false;

        for (const [windowId, candidate] of me.nativeWindowDropCandidates.entries()) {
            if (candidate.sourceSortZone === sourceSortZone || candidate.targetSortZone === sourceSortZone) {
                me.clearNativeWindowDropCandidate(windowId);
                me.endNativeGesture(windowId)
            }
        }
    }

    /**
     * @summary Drives continuous hover preview for a native-titlebar drag, per geometry event.
     *
     * The hover contract of §2.8.1's remote-preview requirement: the CURRENT candidate target
     * renders its own affordances through `onRemoteDragMove` on EVERY position update — per
     * frame, not only after the dwell timer — while the dwell/settle contract keeps gating the
     * COMMIT. Target switches and hover loss end the previous target's preview exact-once.
     * @param {String} windowId The MOVING popup's window id.
     * @param {Object|null} candidate The current drop candidate, or null when nothing claims.
     */
    updateNativeHover(windowId, candidate) {
        let me       = this,
            previous = me.nativeHoverTargets.get(windowId),
            next     = candidate?.targetSortZone || null;

        if (previous && previous !== next) {
            previous.onRemoteDragLeave?.()
        }

        if (next) {
            me.nativeHoverTargets.set(windowId, next);

            next.onRemoteDragMove({
                draggedItem: candidate.draggedItem,
                // Native titlebar geometry does not ride the pointer conversion resolver. Keep
                // its source popup visible during dwell; only commitNativeWindowDrop may stage
                // an embodiment, after suspendWindowDrag has strictly settled.
                embodyProxy   : false,
                localX        : candidate.localX,
                localY        : candidate.localY,
                offsetX       : candidate.offsetX,
                offsetY       : candidate.offsetY,
                proxyRect     : candidate.proxyRect,
                sourceSortZone: candidate.sourceSortZone
            })
        } else {
            me.nativeHoverTargets.delete(windowId)
        }
    }

    /**
     * @summary Handles geometry updates for native OS-titlebar popup reintegration.
     *
     * Consumes high-frequency window geometry updates for native OS-titlebar popup drags,
     * where the browser does not emit pointer move/up events. The current candidate target
     * renders continuous hover preview per update; a terminal detached popup reintegrates
     * only after it remains over a remote dashboard target long enough to satisfy the
     * settle/dwell intent contract.
     * @param {Object} data
     * @param {String} data.windowId
     */
    onWindowPositionChange(data) {
        let me         = this,
            {windowId} = data,
            sourceDrag = me.getNativeWindowDragSource(windowId),
            candidate, current, dwellRemaining, firstSeenAt, delay, now;

        if (!sourceDrag) {
            me.clearNativeWindowDropCandidate(windowId);
            me.endNativeGesture(windowId);
            return
        }

        candidate = me.getNativeWindowDropCandidate(data, sourceDrag);

        me.updateNativeHover(windowId, candidate);

        if (!candidate) {
            me.clearNativeWindowDropCandidate(windowId);
            return
        }

        now     = Date.now();
        current = me.nativeWindowDropCandidates.get(windowId);

        firstSeenAt = current?.targetSortZone === candidate.targetSortZone &&
            current?.draggedItem === candidate.draggedItem
                ? current.firstSeenAt
                : now;

        me.clearNativeWindowDropCandidate(windowId);

        dwellRemaining = Math.max(0, me.nativeWindowDropDwellMs - (now - firstSeenAt));
        delay          = Math.max(me.nativeWindowDropSettleMs, dwellRemaining);

        candidate.firstSeenAt = firstSeenAt;
        candidate.timeoutId   = setTimeout(() => {
            me.commitNativeWindowDrop(windowId, candidate).catch(error => {
                (Neo.logError || console.error)('Native window drop failed', error)
            })
        }, delay);

        me.nativeWindowDropCandidates.set(windowId, candidate)
    }

    /**
     * Finalizes a dashboard window drag by either dropping into the active target
     * or leaving the source popup as the terminal drop state.
     * @param {Object} data
     * @param {Neo.component.Base} data.draggedItem
     * @param {Neo.draggable.container.SortZone} data.sourceSortZone
     */
    onDragEnd(data) {
        let me = this;

        // The gesture reaches a terminal on every branch below, so its token dies here — the
        // committed target already lives in `activeTargetZone`; claims are hover-time state only.
        me.pointerClaimArbiter?.reset();
        me.pointerClaimArbiter = null;

        try {
            if (me.activeTargetZone && me.activeTransitionOwned && !me.activeTargetCommitEligible) {
                me.activeTargetZone.onRemoteDragLeave?.();
                me.activeTargetZone = null
            } else if (me.activeTargetZone) {
                // The TARGET decides whether the gesture committed: onRemoteDrop() returns the committed
                // operation, or null when there was no preview, no operation, or the commit declined.
                // Engagement is not commitment, so its answer cannot be discarded.
                // `finally`, because a throwing commit is the REJECTED terminal — and a terminal that
                // leaves `activeTargetZone` populated hands the next release a commit destination from a
                // gesture that already failed. The error is not swallowed: cleanup is exact-once on every
                // terminal, including the ones that raise.
                try {
                    let result = me.activeTargetZone.onRemoteDrop(data.draggedItem);

                // Source retirement follows the OUTCOME, not the attempt. Retiring unconditionally
                // armed the source's `remoteDropCommitted`, whose whole meaning is "a remote target
                // committed this transfer" — and which suppresses the source's in-window drop path on
                // that belief. On a null commit the target never took the item while the source had
                // already let go, so the item stranded with no owner. Leaving the flag unarmed lets the
                // source's ordinary in-window path run and restore it: the restore is the pre-existing
                // default, not a new capability — it was simply unreachable behind a false signal.
                //
                // Targets answer synchronously OR asynchronously, and the two cannot share a branch: a
                // Promise is ALWAYS truthy, so testing the returned value directly reads every async
                // target as committed — the identical defect wearing the fix's own shape.
                //
                // The split is not symmetry for its own sake; each side has a different truth deadline.
                // A SYNC target must retire on this call stack, because the source reads
                // `remoteDropCommitted` synchronously in its own drag-end continuation — deferring
                // would arm the flag after the decision it exists to inform. An ASYNC target's outcome
                // is not knowable this tick at all, so retirement waits for the resolution; that is
                // sound only because an async target's source cleanup carries no same-call reader.
                    if (typeof result?.then === 'function') {
                        result.then(operation => {
                            if (operation) {
                                data.sourceSortZone.onRemoteDropOut(data.draggedItem)
                            }
                        })
                    } else if (result) {
                        data.sourceSortZone.onRemoteDropOut(data.draggedItem)
                    }
                } finally {
                    me.activeTargetZone = null
                }
            } else if (data.sourceSortZone.isWindowDragging) {
                data.sourceSortZone.onTerminalWindowDrop?.(data.draggedItem)
            }
        } finally {
            data.sourceSortZone.resetVesselConversion?.();
            me.activeSourceZone           = null;
            me.activeTargetCommitEligible = false;
            me.activeTransitionOwned      = false
        }
    }

    /**
     * @param {Neo.draggable.container.SortZone} sortZone
     */
    register(sortZone) {
        let me                    = this,
            {sortGroup, windowId} = sortZone;

        if (sortGroup) {
            if (!me.sortZones.has(sortGroup)) {
                me.sortZones.set(sortGroup, new Map())
            }

            me.sortZones.get(sortGroup).set(windowId, sortZone)
        }
    }

    /**
     * @param {Neo.draggable.container.SortZone} sortZone
     */
    unregister(sortZone) {
        let me                    = this,
            {sortGroup, windowId} = sortZone;

        if (sortGroup && me.sortZones.has(sortGroup)) {
            let group = me.sortZones.get(sortGroup);
            group.delete(windowId);

            if (group.size === 0) {
                me.sortZones.delete(sortGroup)
            }
        }

        // A departing zone must not stay installed as the live target. Dropping it from the registry
        // while leaving it here kept a zone whose vessel is gone reachable as `activeTargetZone`, so
        // the next release would commit into a departed window — and re-registering the same identity
        // would inherit that residue instead of starting clean.
        //
        // The hover is ended BEFORE the pointer is dropped: nulling alone orphans whatever the target
        // is rendering, because `onRemoteDragLeave` is the only thing that clears its preview and the
        // owner's. Losing the reference first makes that unreachable — the zone keeps painting a hover
        // for a gesture that no longer exists.
        if (me.activeTargetZone === sortZone) {
            me.activeSourceZone?.cancelVesselConversion?.();
            me.activeTargetZone.onRemoteDragLeave?.();
            me.activeTargetZone = null;
            me.activeSourceZone = null;
            me.activeTargetCommitEligible = false;
            me.activeTransitionOwned      = false
        } else if (me.activeSourceZone === sortZone) {
            me.activeTargetZone?.onRemoteDragLeave?.();
            sortZone.resetVesselConversion?.();
            me.activeTargetZone = null;
            me.activeSourceZone = null;
            me.activeTargetCommitEligible = false;
            me.activeTransitionOwned      = false
        }

        // Claim hygiene mirrors the activeTargetZone rule above: a departed zone must not stay
        // reachable as a WINNING CLAIM either — a later resolve would hand the gesture a commit
        // destination whose vessel is gone. Release is identity-scoped across every live arbiter.
        if (sortZone.stableTargetId != null) {
            me.pointerClaimArbiter?.release(sortZone.stableTargetId);

            for (const arbiter of me.nativeClaimArbiters.values()) {
                arbiter.release(sortZone.stableTargetId)
            }
        }

        // ...and a departing zone stops receiving continuous native hover, ending its preview
        // while the reference can still reach it (same reasoning as the activeTargetZone leave).
        for (const [windowId, hover] of me.nativeHoverTargets.entries()) {
            if (hover === sortZone) {
                hover.onRemoteDragLeave?.();
                me.nativeHoverTargets.delete(windowId)
            }
        }

        for (const [windowId, candidate] of me.nativeWindowDropCandidates.entries()) {
            if (candidate.sourceSortZone === sortZone || candidate.targetSortZone === sortZone) {
                me.clearNativeWindowDropCandidate(windowId)
            }
        }
    }

    /**
     * @returns {Object}
     */
    toJSON() {
        let me = this;

        return {
            className       : me.className,
            activeTargetZone: me.activeTargetZone ? {
                id       : me.activeTargetZone.id,
                sortGroup: me.activeTargetZone.sortGroup,
                windowId : me.activeTargetZone.windowId
            } : null,
            activeTargetCommitEligible: me.activeTargetCommitEligible,
            activeTransitionOwned     : me.activeTransitionOwned,
            nativeGestures            : Array.from(me.nativeClaimArbiters.keys()),
            pointerGestureToken       : me.pointerClaimArbiter?.token ?? null,
            sortZones                 : Array.from(me.sortZones.entries()).map(([group, map]) => ({
                group,
                windows: Array.from(map.keys())
            }))
        }
    }
}

export default Neo.setupClass(DragCoordinator);
