import Manager from './Base.mjs';
import Window  from './Window.mjs';

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
     * @param {Object} data
     * @param {Neo.component.Base} data.draggedItem
     * @param {Number} data.screenX
     * @param {Number} data.screenY
     * @param {Neo.draggable.container.SortZone} data.sourceSortZone
     */
    onDragMove(data) {
        let me             = this,
            {draggedItem, proxyRect, screenX, screenY, sourceSortZone} = data,
            {sortGroup}    = sourceSortZone,
            targetWindowId = Window.getWindowAt(screenX, screenY),
            targetSortZone;

        // console.log('DragCoordinator.onDragMove', {screenX, screenY, targetWindowId, sortGroup});

        if (targetWindowId && targetWindowId !== sourceSortZone.windowId) {
            targetSortZone = me.sortZones.get(sortGroup)?.get(targetWindowId);

            if (targetSortZone) {
                let targetWindow = Window.get(targetWindowId),
                    localX       = screenX - targetWindow.rect.x,
                    localY       = screenY - targetWindow.rect.y;

                console.log('DragCoordinator target found', {targetWindowId, localX, localY});

                // Entering a new target zone
                if (me.activeTargetZone !== targetSortZone) {
                    // Leaving previous target (if any)
                    if (me.activeTargetZone) {
                        me.activeTargetZone.onRemoteDragLeave()
                    }

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
                    proxyRect
                })
            } else {
                // Window exists but no matching SortZone
                me.handleVoid(sourceSortZone, draggedItem, proxyRect)
            }
        } else {
            // In void or back in source window
            me.handleVoid(sourceSortZone, draggedItem, proxyRect)
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
     * @param {Neo.draggable.container.SortZone} data.sourceSortZone
     */
    onDragEnd(data) {
        let me = this;

        if (me.activeTargetZone) {
            // Drop on target
            me.activeTargetZone.onRemoteDrop(data.draggedItem);

            // Notify source to finalize cleanup
            data.sourceSortZone.onRemoteDropOut(data.draggedItem);

            me.activeTargetZone = null
        } else {
            // Drag ended in void or source window (handled locally by source)
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
    }
}

export default Neo.setupClass(DragCoordinator);
