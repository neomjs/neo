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
        let me             = this,
            {draggedItem, offsetX, offsetY, proxyRect, screenX, screenY, sourceSortZone} = data,
            {sortGroup}    = sourceSortZone,
            targetWindowId = Window.getWindowAt(screenX, screenY),
            targetSortZone;

        if (targetWindowId && targetWindowId !== sourceSortZone.windowId) {
            targetSortZone = me.sortZones.get(sortGroup)?.get(targetWindowId);

            if (targetSortZone) {
                let targetWindow = Window.get(targetWindowId),
                    localX       = screenX - targetWindow.innerRect.x,
                    localY       = screenY - targetWindow.innerRect.y,
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
