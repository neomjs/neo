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
         * Retained target-local embodiment interval after native settle and before semantic commit.
         * This guarantees at least one painted handoff frame without inventing a browser mouseup.
         * @member {Number} nativeWindowDropHandoffMs=180
         */
        nativeWindowDropHandoffMs: 180,
        /**
         * Base delay for retrying a strict physical source restore/retirement refusal. The target
         * semantic terminal runs once; only the retained native disposition is retried.
         * @member {Number} nativeWindowDispositionRetryMs=250
         */
        nativeWindowDispositionRetryMs: 250,
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
     * native drag IS one gesture, so each moving popup owns exactly one token (docking
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
     * Bounded ring of the most recent claim-resolution observations — what the resolver saw and
     * decided, per candidate, including the early return that has no candidates at all.
     * @member {Object[]} claimTrace=[]
     * @protected
     */
    claimTrace = []

    /**
     * How many claim resolutions the ring retains. A gesture emits one per pointer move, so this
     * covers the tail of a single drag rather than a session.
     * @member {Number} claimTraceLimit=40
     * @protected
     */
    claimTraceLimit = 40

    /**
     * @summary Clears a pending geometry-only native window-drop candidate.
     *
     * Clears a pending geometry-only native window-drop candidate.
     * @param {String} windowId
     * @param {Object} [options]
     * @param {Boolean} [options.restoreSource=true] False only when the physical source already
     *     disconnected and therefore cannot be restored.
     */
    clearNativeWindowDropCandidate(windowId, {restoreSource=true}={}) {
        let me        = this,
            candidate = me.nativeWindowDropCandidates.get(windowId);

        if (candidate) {
            candidate.cancelled = true;
            candidate.registrationRefreshes?.clear();
            candidate.registrationRefreshes = null;
            clearTimeout(candidate.timeoutId);
            candidate.resolveHandoff?.();

            if (candidate.embodied) {
                candidate.embodied = false;

                if (me.nativeHoverTargets.get(windowId) === candidate.targetSortZone) {
                    candidate.targetSortZone?.onRemoteDragLeave?.();
                    me.nativeHoverTargets.delete(windowId)
                }
            }

            if (candidate.sourceSuspended && restoreSource) {
                candidate.phase = 'settling-rejected';
                me.endNativeGesture(windowId);
                me.settleNativeWindowDisposition(windowId, candidate, false).catch(error => {
                    (Neo.logError || console.error)('Native window restore failed', error)
                });
                return
            }

            candidate.sourceSuspended = false;
            me.nativeWindowDropCandidates.delete(windowId)
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
     * @summary Settles only the physical source half of an already-decided native terminal.
     *
     * Workstation's embodied titlebar route is strict: `true` alone admits close or restore.
     * A refusal retains this candidate as exact retry authority and backs off without replaying
     * the target model operation. Legacy sources keep their historical fire-and-forget contract.
     * @param {String} windowId Moving popup identity.
     * @param {Object} candidate Retained native candidate.
     * @param {Boolean} committed Whether the target semantic operation committed.
     * @returns {Promise<Boolean>} Strict physical-settlement outcome.
     */
    async settleNativeWindowDisposition(windowId, candidate, committed) {
        let me = this;

        if (me.nativeWindowDropCandidates.get(windowId) !== candidate) {
            return false
        }

        clearTimeout(candidate.timeoutId);
        candidate.dispositionAttempts = (candidate.dispositionAttempts || 0) + 1;
        candidate.phase = committed ? 'settling-committed' : 'settling-rejected';

        let result,
            threw = false;

        try {
            result = await (committed
                ? candidate.sourceSortZone?.onRemoteDropOut?.(candidate.draggedItem, candidate)
                : candidate.sourceSortZone?.resumeWindowDrag?.(
                    candidate.widgetName,
                    candidate.proxyRect,
                    candidate
                ))
        } catch (error) {
            threw = true;
            (Neo.logError || console.error)(
                committed ? 'Native window retirement failed' : 'Native window restore failed',
                error
            )
        }

        // A successful physical close can synchronously trigger source disconnect cleanup while
        // the effect Promise is settling. That cleanup already consumed this generation.
        if (me.nativeWindowDropCandidates.get(windowId) !== candidate) {
            return result === true
        }

        const admitted = !threw && (candidate.embodyNativeHover === true
            ? result === true
            : true);

        if (admitted) {
            candidate.sourceSuspended = false;
            me.nativeWindowDropCandidates.delete(windowId);
            me.endNativeGesture(windowId);
            return true
        }

        const delay = Math.min(
            5000,
            Math.max(1, me.nativeWindowDispositionRetryMs) *
                2 ** Math.min(candidate.dispositionAttempts - 1, 4)
        );

        candidate.timeoutId = setTimeout(() => {
            me.settleNativeWindowDisposition(windowId, candidate, committed).catch(error => {
                (Neo.logError || console.error)('Native window disposition retry failed', error)
            })
        }, delay);

        return false
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

        let {
            draggedItem,
            embodyNativeHover,
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
            me.clearNativeWindowDropCandidate(windowId);
            me.endNativeGesture(windowId);
            return
        }

        if (!targetSortZone.acceptsRemoteDrag(localX, localY)) {
            me.clearNativeWindowDropCandidate(windowId);
            me.endNativeGesture(windowId);
            return
        }

        candidate.phase = 'parking';

        let suspended;

        try {
            suspended = await sourceSortZone.suspendWindowDrag(widgetName, candidate);

            if (me.nativeWindowDropCandidates.get(windowId) !== candidate || candidate.cancelled) {
                if (suspended !== false) {
                    candidate.sourceSuspended = true;

                    if (!me.nativeWindowDropCandidates.has(windowId)) {
                        me.nativeWindowDropCandidates.set(windowId, candidate)
                    }
                    if (me.nativeWindowDropCandidates.get(windowId) === candidate) {
                        await me.settleNativeWindowDisposition(windowId, candidate, false)
                    }
                }
                return
            }

            if (embodyNativeHover === true && suspended !== true) {
                me.clearNativeWindowDropCandidate(windowId);
                me.endNativeGesture(windowId);
                return
            }

            candidate.sourceSuspended = suspended !== false;

            const preview = await targetSortZone.onRemoteDragMove({
                draggedItem,
                embodyProxy   : true,
                localX,
                localY,
                offsetX,
                offsetY,
                proxyRect,
                sourceSortZone,
                sourceWindowId: candidate.sourceWindowId
            });

            if (embodyNativeHover === true && !preview) {
                me.clearNativeWindowDropCandidate(windowId);
                me.endNativeGesture(windowId);
                return
            }

            candidate.embodied = embodyNativeHover === true;

            if (embodyNativeHover === true) {
                const settled = await targetSortZone.awaitRemoteDragEmbodiment?.(draggedItem);

                if (
                    me.nativeWindowDropCandidates.get(windowId) !== candidate ||
                    candidate.cancelled
                ) {
                    return
                }

                if (settled !== true) {
                    me.clearNativeWindowDropCandidate(windowId);
                    me.endNativeGesture(windowId);
                    return
                }

                candidate.phase = 'embodied';

                await new Promise(resolve => {
                    candidate.resolveHandoff = resolve;
                    candidate.timeoutId       = setTimeout(resolve, me.nativeWindowDropHandoffMs)
                });

                candidate.resolveHandoff = null;

                if (me.nativeWindowDropCandidates.get(windowId) !== candidate || candidate.cancelled) {
                    return
                }
            }

            if (
                sourceSortZone.getNativeWindowDrag?.(windowId)?.draggedItem !== draggedItem ||
                !targetSortZone.acceptsRemoteDrag(localX, localY)
            ) {
                me.clearNativeWindowDropCandidate(windowId);
                me.endNativeGesture(windowId);
                return
            }

            clearTimeout(candidate.timeoutId);
            candidate.phase = 'settling-target';

            // The native-titlebar path answers the same question as the pointer path, so the
            // target's return IS the commit decision. Target settlement (promote or restore)
            // precedes the matching physical source disposition on both branches.
            const operation = await targetSortZone.onRemoteDrop(draggedItem);

            if (
                me.nativeWindowDropCandidates.get(windowId) !== candidate ||
                candidate.cancelled
            ) {
                return
            }

            candidate.embodied = false;

            if (me.nativeHoverTargets.get(windowId) === targetSortZone) {
                me.nativeHoverTargets.delete(windowId)
            }

            // Target semantic settlement is exact-once. The claim/hover generation dies now;
            // strict physical close/restore may remain as separately retained retry authority.
            me.endNativeGesture(windowId);

            if (me.activeTargetZone === targetSortZone) {
                me.activeTargetZone = null
            }

            await me.settleNativeWindowDisposition(windowId, candidate, Boolean(operation))
        } catch (error) {
            if (me.nativeWindowDropCandidates.get(windowId) === candidate) {
                candidate.cancelled = true;

                if (
                    candidate.embodied &&
                    me.nativeHoverTargets.get(windowId) === targetSortZone
                ) {
                    targetSortZone.onRemoteDragLeave?.();
                    me.nativeHoverTargets.delete(windowId)
                }

                candidate.embodied = false;
                me.endNativeGesture(windowId);

                if (candidate.sourceSuspended) {
                    await me.settleNativeWindowDisposition(windowId, candidate, false)
                } else {
                    me.nativeWindowDropCandidates.delete(windowId)
                }
            }

            me.endNativeGesture(windowId);
            throw error
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
            sourceWindowId   = sourceDrag.sourceWindowId ?? sourceSortZone.windowId,
            targetWindowId, targetSortZone, targetWindow, localX, localY, width, height, arbiter, claimed, excludedWindowIds;

        if (!popupRect || !sortGroup) {
            return null
        }

        localX = popupRect.x + popupRect.width  / 2;
        localY = popupRect.y + popupRect.height / 2;

        excludedWindowIds = new Set([data.windowId, sourceWindowId]);
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
            sourceSortZone,
            sourceWindowId
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
     * The claim pass of the §2.8.1 protocol (docking design record): every registered
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
    resolveClaimedTarget({
        arbiter,
        excludedWindowIds = null,
        screenX,
        screenY,
        sortGroup,
        sourceSortZone,
        sourceWindowId=sourceSortZone.windowId
    }) {
        let group = this.sortZones.get(sortGroup);

        if (!group) {
            // The group being ABSENT and the group yielding no claim are different failures with
            // different repairs, and a resolver that returns `null` for both cannot say which.
            this.recordClaimResolution({sortGroup, groupSize: null, outcome: 'group-absent'});
            return null
        }

        const candidates = [];

        for (const [windowId, zone] of group) {
            if (
                windowId === sourceWindowId ||
                excludedWindowIds?.has(windowId)
            ) {
                zone.stableTargetId != null && arbiter.release(zone.stableTargetId);
                candidates.push({windowId, skipped: 'source-or-excluded'});
                continue
            }

            if (zone.stableTargetId == null || typeof zone.acceptsRemoteDrag !== 'function') {
                candidates.push({windowId, skipped: 'no-stable-identity'});
                continue
            }

            let inner = Window.get(windowId)?.innerRect;

            // Each conjunct is observed SEPARATELY because `&&` short-circuits: a nullish `inner`
            // never calls `acceptsRemoteDrag`, so a diagnostic that records only the zone's answer
            // cannot distinguish "the zone refused" from "the zone was never asked".
            const
                intersects = inner ? inner.intersects({bottom: screenY, right: screenX, x: screenX, y: screenY}) : null,
                accepts    = inner && intersects ? zone.acceptsRemoteDrag(screenX - inner.x, screenY - inner.y) : null;

            candidates.push({
                windowId,
                stableTargetId: zone.stableTargetId,
                innerResolved : Boolean(inner),
                intersects,
                accepts
            });

            if (intersects && accepts) {
                arbiter.claim(zone.stableTargetId, zone)
            } else {
                arbiter.release(zone.stableTargetId)
            }
        }

        const claimed = arbiter.resolve();

        this.recordClaimResolution({
            sortGroup,
            groupSize      : group.size,
            outcome        : claimed ? 'claimed' : 'no-claim',
            claimedStableId: claimed?.stableId ?? null,
            candidates
        });

        return claimed
    }

    /**
     * @summary Records one bounded claim-resolution observation on the coordinator's own ring.
     *
     * The coordinator's decisions were previously reconstructed by the WORKSPACE after the fact,
     * which can only report what the answer WOULD have been once readiness has already failed —
     * and a reconstruction cannot see an early return at all. This records what the resolver
     * actually did, when it did it; `toJSON` surfaces it through the existing drag-state route.
     * @param {Object} entry Resolution observation.
     * @protected
     */
    recordClaimResolution(entry) {
        let me = this;

        me.claimTrace.push(entry);

        while (me.claimTrace.length > me.claimTraceLimit) {
            me.claimTrace.shift()
        }
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
            current    = me.nativeWindowDropCandidates.get(windowId),
            sourceDrag, candidate, dwellRemaining, firstSeenAt, delay, now;

        // Parking, embodiment, target settlement, and strict source retry can all publish geometry
        // of their own. Their retained generation owns the terminal; never reinterpret those
        // effects as a fresh titlebar gesture.
        if (
            current?.phase === 'parking' ||
            current?.phase === 'embodied' ||
            current?.phase?.startsWith('settling-')
        ) {
            return
        }

        sourceDrag = me.getNativeWindowDragSource(windowId);

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

        // A committed semantic terminal can outlive one projection generation while strict
        // physical popup retirement retries. Rebind that disposition-only authority to the
        // successor carrying the same stable registration identity; never replay the target drop.
        if (sortZone.stableTargetId != null) {
            const replaces = current =>
                current !== sortZone &&
                current?.stableTargetId === sortZone.stableTargetId &&
                current?.sortGroup === sortGroup &&
                current?.windowId === windowId;

            for (const candidate of me.nativeWindowDropCandidates.values()) {
                const refreshes = candidate.registrationRefreshes;

                if (refreshes) {
                    for (const departedZone of refreshes.keys()) {
                        if (departedZone === sortZone || replaces(departedZone)) {
                            refreshes.delete(departedZone);
                            candidate.sourceSortZone === departedZone && (candidate.sourceSortZone = sortZone);
                            candidate.targetSortZone === departedZone && (candidate.targetSortZone = sortZone)
                        }
                    }

                    refreshes.size === 0 && (candidate.registrationRefreshes = null)
                }

                if (candidate.phase === 'settling-committed') {
                    replaces(candidate.sourceSortZone) && (candidate.sourceSortZone = sortZone);
                    replaces(candidate.targetSortZone) && (candidate.targetSortZone = sortZone)
                }
            }
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

            // Evict only THIS zone's own registration. The key is `[sortGroup, windowId]` and
            // `register` overwrites it, so a window whose zone is REPLACED briefly has two objects
            // contending for one key. That happens on a staged structural re-projection, which
            // builds the successor shell before retiring the predecessor — not on an in-place
            // geometry or retained-topology refresh, which reconciles the existing shell and
            // replaces no zone at all. An unconditional delete lets the retiring zone evict the
            // live successor, and then prune the whole group as empty, leaving
            // `resolveClaimedTarget` to return before its loop runs. Nothing throws and the
            // surviving zone still answers `acceptsRemoteDrag`, so an app-side reconstruction
            // reports a target the coordinator can no longer see.
            if (group.get(windowId) === sortZone) {
                group.delete(windowId);

                if (group.size === 0) {
                    me.sortZones.delete(sortGroup)
                }
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

        // Workstation projection refresh destroys and recreates one stable participation in the
        // same turn. During `onRemoteDrop()` that unregister can land after model mutation but
        // before the coordinator receives the synchronous commit receipt. Give the matching
        // identity one microtask to re-register; a genuine disconnect consumes the pending
        // departure and restores the suspended source before any async target can resolve.
        if (sortZone.stableTargetId != null) {
            for (const [windowId, candidate] of me.nativeWindowDropCandidates.entries()) {
                if (
                    candidate.phase === 'settling-target' &&
                    (candidate.sourceSortZone === sortZone || candidate.targetSortZone === sortZone)
                ) {
                    const
                        refreshes = candidate.registrationRefreshes ??= new Map(),
                        refresh   = {};

                    refreshes.set(sortZone, refresh);

                    queueMicrotask(() => {
                        if (candidate.registrationRefreshes?.get(sortZone) !== refresh) return;

                        candidate.registrationRefreshes.delete(sortZone);
                        candidate.registrationRefreshes.size === 0 &&
                            (candidate.registrationRefreshes = null);

                        if (
                            me.nativeWindowDropCandidates.get(windowId) === candidate &&
                            candidate.phase === 'settling-target'
                        ) {
                            me.clearNativeWindowDropCandidate(windowId);
                            me.endNativeGesture(windowId)
                        }
                    })
                }
            }
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
                const candidate = me.nativeWindowDropCandidates.get(windowId);

                if (candidate?.registrationRefreshes?.has(sortZone)) continue;

                hover.onRemoteDragLeave?.();
                me.nativeHoverTargets.delete(windowId)
            }
        }

        for (const [windowId, candidate] of me.nativeWindowDropCandidates.entries()) {
            if (candidate.sourceSortZone === sortZone || candidate.targetSortZone === sortZone) {
                if (candidate.registrationRefreshes?.has(sortZone)) {
                    continue
                }

                // The model has already committed and target hover is gone. A registration refresh
                // must not reinterpret the retained close-only retry as rejection and resume the
                // popup over committed truth; register() rebinds this authority to the successor.
                if (candidate.phase === 'settling-committed') {
                    continue
                }

                me.clearNativeWindowDropCandidate(windowId);
                me.endNativeGesture(windowId)
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
            // The resolver's OWN record. `pointerGestureToken` proves only that the arbiter was
            // minted one line above the resolver call — it says nothing about the collection loop.
            claimTrace: [...me.claimTrace],
            sortZones                 : Array.from(me.sortZones.entries()).map(([group, map]) => ({
                group,
                windows: Array.from(map.keys())
            }))
        }
    }
}

export default Neo.setupClass(DragCoordinator);
