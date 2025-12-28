import Component          from '../../component/Base.mjs';
import DragCoordinator    from '../../manager/DragCoordinator.mjs';
import DragProxyContainer from '../DragProxyContainer.mjs';
import NeoArray           from '../../util/Array.mjs';
import Rectangle          from '../../util/Rectangle.mjs';
import SortZone           from '../container/SortZone.mjs';
import VDomUtil           from '../../util/VDom.mjs';

/**
 * @class Neo.draggable.dashboard.SortZone
 * @extends Neo.draggable.container.SortZone
 */
class DashboardSortZone extends SortZone {
    static config = {
        /**
         * @member {String} className='Neo.draggable.dashboard.SortZone'
         * @protected
         */
        className: 'Neo.draggable.dashboard.SortZone',
        /**
         * @member {String} ntype='dashboard-sortzone'
         * @protected
         */
        ntype: 'dashboard-sortzone',
        /**
         * The CSS selector for the drag handle.
         * @member {String} dragHandleSelector='.neo-draggable'
         */
        dragHandleSelector: '.neo-draggable',
        /**
         * Add extra CSS selectors to the drag proxy root.
         * @member {String[]} dragProxyExtraCls=[]
         */
        dragProxyExtraCls: [],
        /**
         * @member {String|null} sortGroup=null
         */
        sortGroup: null
    }

    /**
     * @member {Boolean} isRemoteDragging=false
     * @protected
     */
    isRemoteDragging = false

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);
        DragCoordinator.register(this)
    }

    /**
     * Checks if the remote drag coordinates intersect with the sort zone.
     * Triggers an async fetch of ownerRect if not currently cached.
     * @param {Number} x
     * @param {Number} y
     * @returns {Boolean}
     */
    acceptsRemoteDrag(x, y) {
        let me = this;

        if (!me.ownerRect) {
            if (!me.isFetchingRect) {
                me.isFetchingRect = true;
                me.owner.getDomRect([me.owner.id]).then(rects => {
                    me.ownerRect = rects[0];
                    me.isFetchingRect = false
                })
            }
            return false
        }

        return x >= me.ownerRect.x &&
               x <= me.ownerRect.x + me.ownerRect.width &&
               y >= me.ownerRect.y &&
               y <= me.ownerRect.y + me.ownerRect.height
    }

    /**
     *
     */
    applyAbsolutePositioning() {
        let me = this,
            itemStyle;

        me.sortableItems.forEach((item, i) => {
            let rect = me.itemRects[i];

            itemStyle = item.wrapperStyle || {};

            me.adjustProxyRectToParent?.(rect, me.ownerRect);

            console.log('applyAbsolutePositioning', {
                height  : `${rect.height}px`,
                left    : `${rect.left}px`,
                top     : `${rect.top}px`,
                width   : `${rect.width}px`
            });

            item.wrapperStyle = Object.assign(itemStyle, {
                flex    : 'none',
                height  : `${rect.height}px`,
                left    : `${rect.left}px`,
                margin  : '0px',
                position: 'absolute',
                top     : `${rect.top}px`,
                width   : `${rect.width}px`
            })
        })
    }

    /**
     * Calculates a new layout for the remaining items when one item is dragged out of the container (e.g., into a new window).
     *
     * This method ensures the dashboard doesn't leave a "hole" where the dragged item was. Instead, it:
     * 1.  **Infers Gaps & Offsets:** Analyzes the cached `itemRects` to mathematically derive the container's padding
     *     and the gaps between items, ensuring the new layout respects the original design tokens.
     * 2.  **Identifies Remaining Items:** Filters out the dragged component and its placeholder.
     * 3.  **Distributes Space:** Calculates the available space (Total Size - Offsets - Gaps - Fixed Items) and distributes
     *     it among flex items proportional to their flex values.
     * 4.  **Generates Styles:** Returns a list of style objects (`top`, `left`, `width`, `height`) to be applied to the remaining items.
     *
     * @returns {Object[]} Array of objects containing the `item` reference and the calculated `style` object.
     */
    calculateExpandedLayout() {
        let me           = this,
            ownerRect    = me.ownerRect,
            isHorizontal = me.sortDirection === 'horizontal',
            totalSize    = isHorizontal ? ownerRect.width : ownerRect.height,
            items        = [],
            totalFlex    = 0,
            usedSize     = 0,
            rects        = [],
            startOffset  = 0,
            endOffset    = 0,
            gap          = 0,
            topOffset    = 0,
            bottomOffset = 0,
            leftOffset   = 0,
            rightOffset  = 0,
            startX       = me.adjustItemRectsToParent ? 0 : ownerRect.x,
            startY       = me.adjustItemRectsToParent ? 0 : ownerRect.y;

        // 1. Calculate offsets and gaps from the original slots (itemRects)
        if (me.itemRects.length > 0) {
            let r0 = me.itemRects[0],
                rn = me.itemRects[me.itemRects.length - 1];

            if (isHorizontal) {
                startOffset  = me.adjustItemRectsToParent ? r0.x : r0.x - ownerRect.x;
                endOffset    = totalSize - (me.adjustItemRectsToParent ? (rn.x + rn.width) : (rn.x - ownerRect.x + rn.width));
                topOffset    = me.adjustItemRectsToParent ? r0.y : r0.y - ownerRect.y;
                bottomOffset = ownerRect.height - (me.adjustItemRectsToParent ? (r0.y + r0.height) : (r0.y - ownerRect.y + r0.height)); // Approx from first item

                if (me.itemRects.length > 1) {
                    let r1 = me.itemRects[1];
                    gap = r1.x - (r0.x + r0.width);
                }
            } else {
                startOffset = me.adjustItemRectsToParent ? r0.y : r0.y - ownerRect.y;
                endOffset   = totalSize - (me.adjustItemRectsToParent ? (rn.y + rn.height) : (rn.y - ownerRect.y + rn.height));
                leftOffset  = me.adjustItemRectsToParent ? r0.x : r0.x - ownerRect.x;
                rightOffset = ownerRect.width - (me.adjustItemRectsToParent ? (r0.x + r0.width) : (r0.x - ownerRect.x + r0.width));

                if (me.itemRects.length > 1) {
                    let r1 = me.itemRects[1];
                    gap = r1.y - (r0.y + r0.height);
                }
            }
        }
        // 2. Filter valid items
        for (let i = 0; i < me.itemRects.length; i++) {
            let mappedIndex = me.indexMap[i];

            if (mappedIndex === -1) {
                continue
            }

            let item = me.owner.items[mappedIndex];

            if (item === me.dragPlaceholder || item === me.dragComponent) {
                continue
            }

            let rect = me.itemRects[i];

            items.push({item, rect});

            if (item.flex) {
                totalFlex += item.flex
            } else {
                let size = isHorizontal ? rect.width : rect.height;
                usedSize += size
            }
        }

        // 3. Calculate available space
        let totalGaps      = Math.max(0, items.length - 1),
            availableSpace = Math.max(0, totalSize - startOffset - endOffset - (totalGaps * gap) - usedSize);

        // 4. Distribute space
        let currentPos = startOffset;

        items.forEach(({item, rect}, index) => {
            let itemSize, style = {};

            if (item.flex) {
                itemSize = (item.flex / totalFlex) * availableSpace
            } else {
                itemSize = isHorizontal ? rect.width : rect.height
            }

            if (isHorizontal) {
                style = {
                    left  : `${startX + currentPos}px`,
                    top   : `${startY + topOffset}px`,
                    height: `${ownerRect.height - topOffset - bottomOffset}px`,
                    width : `${itemSize}px`
                }
            } else {
                style = {
                    left  : `${startX + leftOffset}px`,
                    top   : `${startY + currentPos}px`,
                    height: `${itemSize}px`,
                    width : `${ownerRect.width - leftOffset - rightOffset}px`
                }
            }

            rects.push({item, style});
            currentPos += itemSize + gap
        });

        return rects
    }

    /**
     *
     */
    destroy() {
        DragCoordinator.unregister(this);
        super.destroy()
    }

    /**
     * @returns {Object}
     */
    getDragProxyConfig() {
        const config = super.getDragProxyConfig();

        config.cls = config.cls.filter(cls => !cls.includes('neo-viewport'));
        NeoArray.add(config.cls, this.dragProxyExtraCls);

        return config
    }

    /**
     * @param {Object} data The drag end event data.
     */
    async onDragEnd(data) {
        let me = this;

        if (!me.isRemoteDragging) {
            // Signal Coordinator about end of drag
            DragCoordinator.onDragEnd({
                draggedItem   : me.dragComponent,
                sourceSortZone: me
            })
        }

        super.onDragEnd(data)
    }

    /**
     * Handles the drag move event. This is the core logic loop for the drag operation.
     *
     * Responsibilities:
     * 1.  **Window Drag Re-entry:** Checks if a window drag has re-entered the original container boundaries.
     *     If so, it restores the original layout snapshot (`itemRects`) and shows the placeholder, effectively
     *     "snapping" the dashboard back to its sortable state.
     * 2.  **Window Drag Exit:** Detects if the drag proxy has left the container boundaries (if `enableProxyToPopup` is true)
     *     and triggers the `dragBoundaryExit` event to potentially start a window drag.
     * 3.  **Standard Sorting:** If not in window-drag mode, it calculates the drag delta and swaps items (`switchItems`)
     *     if the threshold is crossed, updating the `currentIndex`.
     * 4.  **Auto-Scrolling:** Manages auto-scrolling when dragging near the edges of the container.
     *
     * @param {Object} data The drag move event data.
     */
    async onDragMove(data) {
        let me = this;

        // The method can trigger before we got the client rects from the main thread
        if (!me.itemRects || !me.boundaryContainerRect || me.isScrolling) {
            return
        }

        await super.onDragMove(data)
    }

    /**
     * @param {Object} data
     */
    async onRemoteDragLeave(data) {
        let me = this;

        if (me.isRemoteDragging) {
            me.isRemoteDragging = false;
            await me.onDragEnd({})
        }
    }

    /**
     * @param {Object} data
     */
    async onRemoteDragMove(data) {
        let me = this;

        if (!me.isRemoteDragging) {
            await me.startRemoteDrag(data)
        }

        // Delegate to standard onDragMove logic, which updates the proxy
        me.onDragMove({
            clientX  : data.localX,
            clientY  : data.localY,
            proxyRect: data.proxyRect
        });

        me.dragMove({
            clientX: data.localX,
            clientY: data.localY
        }, true)
    }

    /**
     * @param {Neo.component.Base} draggedItem
     */
    async onRemoteDrop(draggedItem) {
        let me    = this,
            index = me.currentIndex;

        // Ensure we are in remote drag mode
        if (me.isRemoteDragging) {
            // Cleanup placeholder but keep layout ready
            await me.onDragEnd({});

            // Remove from old parent (if not already detached)
            const parentId = draggedItem.parentId;
            if (parentId && parentId !== 'document.body') {
                Neo.getComponent(parentId)?.remove(draggedItem, false)
            }

            // Insert into new owner
            me.owner.insert(index, draggedItem);

            me.isRemoteDragging = false
        }
    }

    /**
     * @param {Neo.component.Base} draggedItem
     */
    onRemoteDropOut(draggedItem) {
        // Called on the source sort zone when a drop occurred elsewhere.
        // We need to cleanup any detached state tracking.
        let me = this;

        if (me.owner.detachedItems) {
            for (const [key, value] of me.owner.detachedItems.entries()) {
                if (value.widget === draggedItem) {
                    me.owner.detachedItems.delete(key);
                    // The window is already closed by suspendWindowDrag, so we just clean up the map.
                    break
                }
            }
        }
    }

    /**
     * @param {Number} intersectionRatio
     * @param {Object} data
     */
    onWindowDragContinue(intersectionRatio, data) {
        let me = this;

        // Signal Coordinator
        DragCoordinator.onDragMove({
            draggedItem   : me.dragComponent,
            offsetX       : me.offsetX,
            offsetY       : me.offsetY,
            proxyRect     : data.proxyRect,
            screenX       : data.screenX,
            screenY       : data.screenY,
            sourceSortZone: me
        })
    }

    /**
     * @param {String} widgetName
     * @param {DOMRect} proxyRect
     */
    resumeWindowDrag(widgetName, proxyRect) {
        this.owner.resumeWindowDrag(widgetName, proxyRect)
    }

    /**
     * @param {Neo.component.Base} draggedItem
     */
    async setupDragState(draggedItem) {
        let me                               = this,
            {adjustItemRectsToParent, owner} = me,
            itemStyles                       = me.itemStyles = [],
            {layout}                         = owner,
            ownerStyle                       = owner.style || {},
            index, indexMap, itemRects, sortableItems;

        sortableItems = owner.items.filter(item => !item.isDestroyed);
        index         = sortableItems.indexOf(draggedItem);

        indexMap = {};

        Object.assign(me, {
            currentIndex           : index,
            dragElement            : VDomUtil.find(owner.vdom, draggedItem.id).vdom,
            dragProxyConfig        : me.getDragProxyConfig(),
            indexMap,
            ownerStyle             : {height: ownerStyle.height, minWidth: ownerStyle.minWidth, width: ownerStyle.width},
            reversedLayoutDirection: layout.direction === 'column-reverse' || layout.direction === 'row-reverse',
            sortableItems,
            sortDirection          : layout.direction?.includes('column') ? 'vertical' : 'horizontal',
            startIndex             : index
        });

        me.dragComponent = draggedItem;

        sortableItems.forEach((item, i) => {
            indexMap[i] = owner.items.indexOf(item);

            itemStyles.push({
                height: item.height ? `${item.height}px` :  item.style?.height,
                width : item.width  ? `${item.width}px`  :  item.style?.width
            })
        });

        itemRects = await owner.getDomRect([owner.id].concat(sortableItems.map(e => e.id)));

        itemRects.forEach(rect => {
            console.log('itemRect', {
                height  : `${rect.height}px`,
                left    : `${rect.left}px`,
                top     : `${rect.top}px`,
                width   : `${rect.width}px`
            });
        });

        me.ownerRect = itemRects.shift();
        me.boundaryContainerRect = me.ownerRect;

        owner.style = {
            ...ownerStyle,
            height  : `${me.ownerRect.height}px`,
            minWidth: `${me.ownerRect.width}px`,
            width   : `${me.ownerRect.width}px`
        };

        console.log('adjustItemRectsToParent', adjustItemRectsToParent);

        adjustItemRectsToParent && itemRects.forEach(rect => {
            rect.x -= me.ownerRect.x;
            rect.y -= me.ownerRect.y
        });

        me.itemRects = itemRects
    }

    /**
     * @param {Object} data
     */
    async startRemoteDrag(data) {
        let me          = this,
            {owner}     = me,
            {proxyRect} = data,
            draggedItem = data.draggedItem,
            config;

        me.isRemoteDragging = true;

        // Mock the drag element rect for DragZone logic if needed
        me.dragElementRect = {
            height: proxyRect.height,
            width : proxyRect.width,
            x     : data.localX,
            y     : data.localY,
            left  : data.localX,
            top   : data.localY
        };

        // Update dragged item to target app context
        draggedItem.appName = me.appName;

        console.log('startRemoteDrag', draggedItem.id, draggedItem.windowId, draggedItem.parentId, draggedItem.parentComponent);

        // Break the parent chain to prevent circular config lookups during handover
        draggedItem.parentId        = null;
        draggedItem.parentComponent = null;

        // Since the component was mounted in a different window, we need to reset the state
        draggedItem.mounted          = false;
        draggedItem.vnode            = null;
        draggedItem.vnodeInitialized = false;

        console.log('parent cleared:', draggedItem.parentId, draggedItem.parentComponent);

        // 1. Get Owner Rect (needed for proxy positioning)
        let rects = await owner.getDomRect([owner.id]);
        me.ownerRect = rects[0];

        console.log('ownerRect', me.ownerRect);

        // Assign the drag offsets to the instance, so that the DragZone onDragMove logic works
        me.offsetX = data.offsetX;
        me.offsetY = data.offsetY;

        console.log('startRemoteDrag: ownerRect', me.ownerRect);
        console.log('startRemoteDrag: local coords', data.localX, data.localY);
        console.log('startRemoteDrag: calculated coords', data.localX - me.offsetX, data.localY - me.offsetY);

        // 2. Create a local DragProxy manually (using DragProxyContainer to hold the live widget)
        // We use DragProxyContainer to ensure the widget remains active/connected.
        config = {
            module          : DragProxyContainer,
            appName         : me.appName,
            cls             : ['neo-dragproxy', ...me.owner.cls],
            items           : [draggedItem],
            moveInMainThread: false,
            windowId        : me.windowId,

            style: {
                left: `${data.localX - me.offsetX}px`,
                top : `${data.localY - me.offsetY}px`
            }
        };

        console.log('Creating local drag proxy', config);

        me.dragProxy = Neo.create(config);

        console.log('Created local drag proxy', me.dragProxy);

        // 3. Create Placeholder
        me.dragPlaceholder = Neo.create({
            module: Component,
            flex  : 'none',
            style : {height: `${proxyRect.height}px`, visibility: 'hidden'}
        });

        owner.add(me.dragPlaceholder);

        // 4. Setup Sort State
        await me.timeout(50);
        await me.setupDragState(me.dragPlaceholder);

        // Update proxy size to match the measured placeholder
        let placeholderIndex = me.sortableItems.indexOf(me.dragPlaceholder);

        if (placeholderIndex > -1) {
            let rect = me.itemRects[placeholderIndex];
            me.dragProxy.width  = rect.width;
            me.dragProxy.height = rect.height;
        }

        await me.timeout(50);
        // 5. Apply Absolute Positioning
        me.applyAbsolutePositioning()
    }

    /**
     * Handles the drag move event. This is the core logic loop for the drag operation.
     *
     * Responsibilities:
     * 1.  **Window Drag Re-entry:** Checks if a window drag has re-entered the original container boundaries.
     *     If so, it restores the original layout snapshot (`itemRects`) and shows the placeholder, effectively
     *     "snapping" the dashboard back to its sortable state.
     * 2.  **Window Drag Exit:** Detects if the drag proxy has left the container boundaries (if `enableProxyToPopup` is true)
     *     and triggers the `dragBoundaryExit` event to potentially start a window drag.
     * 3.  **Standard Sorting:** If not in window-drag mode, it calculates the drag delta and swaps items (`switchItems`)
     *     if the threshold is crossed, updating the `currentIndex`.
     * 4.  **Auto-Scrolling:** Manages auto-scrolling when dragging near the edges of the container.
     *
     * @param {Object} data - The drag move event data.
     */
    startWindowDrag(data) {
        let me = this,
            {popupHeight, popupWidth, windowName} = data;

        // Keep the proxy active to capture mouse events, but make it invisible
        me.dragProxy.style = {opacity: 0};
        me.isWindowDragging = true;

        if (me.dragPlaceholder) {
            me.dragPlaceholder.wrapperStyle = {
                ...me.dragPlaceholder.wrapperStyle,
                visibility: 'hidden'
            }
        }

        // Apply expanded layout
        let expandedLayout = me.calculateExpandedLayout();
        expandedLayout.forEach(({item, style}) => {
            item.wrapperStyle = {...item.wrapperStyle, ...style}
        });

        Neo.main.addon.DragDrop.startWindowDrag({
            popupHeight,
            popupName: windowName,
            popupWidth,
            windowId : me.windowId
        })
    }

    /**
     * @param {String} widgetName
     */
    suspendWindowDrag(widgetName) {
        this.owner.suspendWindowDrag(widgetName)
    }
}

export default Neo.setupClass(DashboardSortZone);
