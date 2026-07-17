import Manager   from './Base.mjs';
import Rectangle from '../util/Rectangle.mjs';
import Window    from './Window.mjs';

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
     * @member {Map<String,Object>} nativeWindowDropCandidates=new Map()
     * @protected
     */
    nativeWindowDropCandidates = new Map()

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
            localX,
            localY,
            offsetX,
            offsetY,
            proxyRect
        });

        // The native-titlebar path answers the same question as the pointer path, so it obeys the same
        // rule: the target's return IS the commit decision, and a null means it declined. Retiring the
        // source anyway arms `remoteDropCommitted` and suppresses the source's own restore, leaving the
        // item with no owner — identical to the pointer defect, reached through a different door.
        const operation = await targetSortZone.onRemoteDrop(draggedItem);

        if (operation) {
            sourceSortZone.onRemoteDropOut(draggedItem)
        }

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
            targetWindowId, targetSortZone, targetWindow, localX, localY, width, height;

        if (!popupRect || !sortGroup) {
            return null
        }

        localX = popupRect.x + popupRect.width  / 2;
        localY = popupRect.y + popupRect.height / 2;

        targetWindowId = me.getWindowAtExcept(localX, localY, new Set([data.windowId, sourceSortZone.windowId]));

        if (!targetWindowId) {
            return null
        }

        targetSortZone = me.sortZones.get(sortGroup)?.get(targetWindowId);
        targetWindow   = Window.get(targetWindowId);

        if (!targetSortZone || !targetWindow?.innerRect) {
            return null
        }

        localX = localX - targetWindow.innerRect.x;
        localY = localY - targetWindow.innerRect.y;

        if (!targetSortZone.acceptsRemoteDrag(localX, localY)) {
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
        let me = this;

        if (me.activeTargetZone) {
            me.activeTargetZone.onRemoteDragLeave();
            me.activeTargetZone = null;

            // Resume source drag (re-open popup)
            sourceSortZone.resumeWindowDrag(draggedItem.reference || draggedItem.id, proxyRect)
        }
    }

    /**
     * @param {Object} data
     * @param {Neo.component.Base} data.draggedItem
     * @param {Number} data.offsetX
     * @param {Number} data.offsetY
     * @param {Number} data.screenX
     * @param {Number} data.screenY
     * @param {Neo.draggable.container.SortZone} data.sourceSortZone
     */
    onDragMove(data) {
        let me                                                                           = this,
            {draggedItem, offsetX, offsetY, proxyRect, screenX, screenY, sourceSortZone} = data,
            {sortGroup}                                                                  = sourceSortZone,
            targetWindowId                                                               = Window.getWindowAt(screenX, screenY),
            targetSortZone;

        if (targetWindowId && targetWindowId !== sourceSortZone.windowId) {
            targetSortZone = me.sortZones.get(sortGroup)?.get(targetWindowId);

            if (targetSortZone) {
                let targetWindow    = Window.get(targetWindowId),
                    localX          = screenX - targetWindow.innerRect.x,
                    localY          = screenY - targetWindow.innerRect.y,
                    targetProxyRect = new Rectangle(
                        localX - offsetX,
                        localY - offsetY,
                        proxyRect.width,
                        proxyRect.height
                    );

                if (targetSortZone.acceptsRemoteDrag(localX, localY)) {
                    // console.log('DragCoordinator target found', {targetWindowId, localX, localY});

                    // Entering a new target zone
                    if (me.activeTargetZone !== targetSortZone) {
                        // Leaving previous target (if any)
                        me.activeTargetZone?.onRemoteDragLeave();

                        // Suspend source drag (close popup, etc)
                        // We only do this once when leaving the void/source context
                        if (!me.activeTargetZone) {
                            sourceSortZone.suspendWindowDrag(draggedItem.reference || draggedItem.id)
                        }

                        me.activeTargetZone = targetSortZone
                    }

                    targetSortZone.onRemoteDragMove({
                        draggedItem,
                        localX,
                        localY,
                        offsetX,
                        offsetY,
                        proxyRect: targetProxyRect
                    });

                    return
                }
            }
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

        if (me.activeTargetZone) {
            me.activeTargetZone.onRemoteDragLeave();
            me.activeTargetZone = null
        }

        for (const [windowId, candidate] of me.nativeWindowDropCandidates.entries()) {
            if (candidate.sourceSortZone === sourceSortZone || candidate.targetSortZone === sourceSortZone) {
                me.clearNativeWindowDropCandidate(windowId)
            }
        }
    }

    /**
     * @summary Handles geometry updates for native OS-titlebar popup reintegration.
     *
     * Consumes high-frequency window geometry updates for native OS-titlebar popup drags,
     * where the browser does not emit pointer move/up events. A terminal detached popup
     * reintegrates only after it remains over a remote dashboard target long enough to
     * satisfy the settle/dwell intent contract.
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
            return
        }

        candidate = me.getNativeWindowDropCandidate(data, sourceDrag);

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

        if (me.activeTargetZone) {
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
            me.activeTargetZone.onRemoteDragLeave?.();
            me.activeTargetZone = null
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
            sortZones: Array.from(me.sortZones.entries()).map(([group, map]) => ({
                group,
                windows: Array.from(map.keys())
            }))
        }
    }
}

export default Neo.setupClass(DragCoordinator);
