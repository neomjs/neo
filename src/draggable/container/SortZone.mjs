import DragZone  from './DragZone.mjs';
import NeoArray  from '../../util/Array.mjs';
import Rectangle from '../../util/Rectangle.mjs';
import VDomUtil  from '../../util/VDom.mjs';

/**
 * @summary Manages the drag-and-drop reordering of items within a container, with support for window detachment.
 *
 * This class extends `Neo.draggable.container.DragZone` to provide sorting capabilities for `Neo.container.Base` instances.
 * It handles the complex logic of tracking item positions, swapping them during the drag operation, and updating
 * the container's layout upon drop.
 *
 * A key feature of this class is its support for **Window Detachment** (tearing tabs or items out of the main window).
 * When an item is dragged outside the browser window boundaries:
 * 1. The `startWindowDrag` method is triggered.
 * 2. The drag placeholder is hidden.
 * 3. The `calculateExpandedLayout` method dynamically computes a new layout for the remaining items, expanding them
 *    to fill the empty space (animating `width`, `height`, `top`, and `left`).
 * 4. If the drag re-enters the window (`onDragBoundaryEntry`), the original layout snapshot is restored, and the
 *    placeholder reappears, allowing for a seamless return to sorting mode.
 *
 * This class interacts closely with:
 * - `Neo.draggable.DragProxy`: For the visual representation of the dragged item.
 * - `Neo.main.addon.DragDrop`: For communicating drag state across the browser/OS environment.
 *
 * @class Neo.draggable.container.SortZone
 * @extends Neo.draggable.container.DragZone
 * @see Neo.draggable.container.DragZone
 * @see Neo.main.addon.DragDrop
 */
class SortZone extends DragZone {
    static config = {
        /**
         * @member {String} className='Neo.draggable.container.SortZone'
         * @protected
         */
        className: 'Neo.draggable.container.SortZone',
        /**
         * @member {String} ntype='container-sortzone'
         * @protected
         */
        ntype: 'container-sortzone',
        /**
         * Depending on the parent structure using position absolute and relative, it can be needed to subtract
         * the x & y parent rect values from the item rects.
         * @member {Boolean} adjustItemRectsToParent=false
         */
        adjustItemRectsToParent: false,
        /**
         * @member {Boolean} alwaysFireDragMove=true
         */
        alwaysFireDragMove: true,
        /**
         * @member {Number} currentIndex=-1
         * @protected
         */
        currentIndex: -1,
        /**
         * A CSS selector to identify the drag handle within a component.
         * If specified, the drag is initiated on this element, but the owning component is dragged.
         * @member {String|null} dragHandleSelector=null
         */
        dragHandleSelector: null,
        /**
         * @member {Boolean} enableProxyToPopup=false
         */
        enableProxyToPopup: false,
        /**
         * @member {Object} indexMap=null
         * @protected
         */
        indexMap: null,
        /**
         * @member {Array|null} itemRects=null
         * @protected
         */
        itemRects: null,
        /**
         * @member {Array|null} itemStyles=null
         * @protected
         */
        itemStyles: null,
        /**
         * @member {Object} ownerRect=null
         * @protected
         */
        ownerRect: null,
        /**
         * @member {Object} ownerStyle=null
         * @protected
         */
        ownerStyle: null,
        /**
         * @member {Boolean} alwaysFireDragMove=false
         * @protected
         */
        reversedLayoutDirection: false,
        /**
         * @member {Number} scrollLeft=0
         */
        scrollLeft: 0,
        /**
         * @member {Number} scrollTop=0
         */
        scrollTop: 0,
        /**
         * Internal flag: onDragStart() will set the value to horizontal or vertical, depending on the current layout.
         * @member {String} sortDirection='horizontal'
         * @protected
         */
        sortDirection: 'horizontal',
        /**
         * @member {Number} startIndex=-1
         * @protected
         */
        startIndex: -1
    }

    /**
     * @member {Boolean} isOverDragging=false
     * @protected
     */
    isOverDragging = false
    /**
     * @member {Boolean} isWindowDragging=false
     * @protected
     */
    isWindowDragging = false

    /**
     * Toggles the neo-draggable cls on items inside our owner.
     * @param {Boolean} draggable
     */
    adjustItemCls(draggable) {
        let me = this;

        if (me.dragHandleSelector) {
            const handleCls     = me.dragHandleSelector.startsWith('.') ? me.dragHandleSelector.substring(1) : me.dragHandleSelector;
            const sortableItems = me.owner.items.filter(item =>
                typeof item !== 'string' && VDomUtil.find(item.vdom, {cls: handleCls})
            );

            sortableItems.forEach(item => {
                const wrapperCls = item.wrapperCls || [];
                NeoArray.toggle(wrapperCls, 'neo-draggable', draggable);
                item.wrapperCls = wrapperCls
            });
        } else {
            super.adjustItemCls(draggable)
        }
    }

    /**
     * Helper method, override as needed
     * @returns {Object}
     */
    getDragProxyConfig() {
        return {...this.dragProxyConfig, cls: [...this.owner.cls]}
    }

    /**
     * Override this method for class extensions (e.g. tab.header.Toolbar)
     * @param {Number} fromIndex
     * @param {Number} toIndex
     */
    moveTo(fromIndex, toIndex) {
        this.owner.moveTo(fromIndex, toIndex);
    }

    /**
     * Handles the completion of the drag operation.
     *
     * This method is responsible for:
     * 1.  **Finalizing the Drop:** If valid, it moves the DOM nodes to their final positions (via `Neo.applyDeltas`).
     * 2.  **Cleanup:** Removes the drag placeholder and resets internal state flags (`isWindowDragging`, `currentIndex`, etc.).
     * 3.  **Layout Restoration:** Resets the styles of all items (clearing the absolute positioning used during the drag)
     *     so they return to the container's natural layout flow.
     * 4.  **State Synchronization:** Calls `owner.moveTo()` to update the container's `items` array to reflect the new order.
     *
     * @param {Object} data - The drag end event data.
     */
    async onDragEnd(data) {
        let me                  = this,
            {itemStyles, owner} = me,
            ownerStyle          = owner.style || {},
            itemStyle;

        await me.timeout(10);

        if (owner.dragResortable) {
            if (me.dragPlaceholder) {
                const
                    component = me.dragComponent,
                    deltas    = [],
                    index     = me.sortableItems.indexOf(me.dragPlaceholder);

                if (component && index > -1) {
                    if (!me.isWindowDragging) {
                        deltas.push({
                            action  : 'moveNode',
                            id      : component.id,
                            index,    // Visually correct index (where placeholder is)
                            parentId: owner.getVdomItemsRoot().id
                        });
                    }

                    deltas.push({
                        action: 'removeNode',
                        id    : me.dragPlaceholder.id
                    });

                    // Manual DOM restoration
                    await Neo.applyDeltas(me.windowId, deltas)
                }
            }

            ownerStyle.height   = me.ownerStyle.height    || null;
            ownerStyle.minWidth = me.ownerStyle.minWidth  || null;
            ownerStyle.width    = me.ownerStyle.width     || null;

            owner.style = ownerStyle;

            me.sortableItems?.forEach((item, index) => {
                if (me.isWindowDragging && item === me.dragComponent) {
                    return
                }

                itemStyle = item.wrapperStyle || {};

                Object.assign(itemStyle, {
                    height  : itemStyles[index].height || null,
                    left    : null,
                    margin  : null,
                    position: null,
                    top     : null,
                    width   : itemStyles[index].width || null
                });

                if (index === me.startIndex) {
                    itemStyle.visibility = null
                }

                item.wrapperStyle = itemStyle
            });

            if (!me.isWindowDragging && me.startIndex !== me.currentIndex) {
                let fromIndex, toIndex;

                if (me.dragPlaceholder) {
                    const component = me.dragComponent;
                    fromIndex = me.owner.items.indexOf(component);
                    toIndex   = me.owner.items.indexOf(me.sortableItems[me.currentIndex]);
                } else {
                    fromIndex = me.owner.items.indexOf(me.sortableItems[me.startIndex]);
                    toIndex   = me.owner.items.indexOf(me.sortableItems[me.currentIndex]);
                }

                me.moveTo(fromIndex, toIndex);
            }

            Object.assign(me, {
                currentIndex    : -1,
                indexMap        : null,
                isWindowDragging: false,
                itemRects       : null,
                itemStyles      : null,
                ownerRect       : null,
                startIndex      : -1,
                sortableItems   : null
            });

            await me.timeout(30);

            me.dragEnd(data) // we do not want to trigger the super class call here
        }
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
    async onDragMove(data) {
        let me = this;

        // The method can trigger before we got the client rects from the main thread
        if (!me.itemRects || me.isScrolling) {
            return
        }

        if (me.dragProxy && me.enableProxyToPopup) {
            const {proxyRect} = data;

            if (proxyRect && me.boundaryContainerRect) {
                const
                    boundaryRect     = me.boundaryContainerRect,
                    intersection     = Rectangle.getIntersection(proxyRect, boundaryRect),
                    proxyArea        = proxyRect.width * proxyRect.height,
                    intersectionArea = intersection ? intersection.width * intersection.height : 0;

                if (!me.isWindowDragging) {
                    if (proxyArea > 0 && (intersectionArea / proxyArea) < 0.5) {
                        me.isWindowDragging = true; // Set flag to prevent re-entry

                        me.fire('dragBoundaryExit', {
                            draggedItem: me.dragComponent,
                            proxyRect,
                            sortZone   : me
                        });
                        return // Stop further processing in onDragMove
                    }
                } else if (me.isWindowDragging) {
                    if (proxyArea > 0 && (intersectionArea / proxyArea) > 0.51) {
                        // Restore layout
                        me.dragPlaceholder.wrapperStyle = {
                            ...me.dragPlaceholder.wrapperStyle,
                            visibility: 'visible'
                        };

                        // Re-applying the current state:
                        me.itemRects.forEach((rect, index) => {
                            let mappedIndex = me.indexMap[index];
                            if (mappedIndex !== -1) {
                                let item = me.owner.items[mappedIndex];

                                if (item !== me.dragPlaceholder && item !== me.dragComponent) {
                                    item.wrapperStyle = {
                                        ...item.wrapperStyle,
                                        height: `${rect.height}px`,
                                        left  : `${rect.left}px`,
                                        top   : `${rect.top}px`,
                                        width : `${rect.width}px`
                                    };
                                }
                            }
                        });

                        me.fire('dragBoundaryEntry', {
                            draggedItem: me.dragComponent,
                            proxyRect,
                            sortZone   : me
                        })
                    }
                    return
                }
            }
        }

        let {clientX, clientY} = data,
            index              = me.currentIndex,
            {itemRects}        = me,
            maxItems           = itemRects.length - 1,
            ownerX             = me.adjustItemRectsToParent ? me.ownerRect.x : 0,
            ownerY             = me.adjustItemRectsToParent ? me.ownerRect.y : 0,
            reversed           = me.reversedLayoutDirection,
            delta, isOverDragging, isOverDraggingEnd, isOverDraggingStart, itemHeightOrWidth, moveFactor;

        if (me.sortDirection === 'horizontal') {
            delta               = clientX - ownerX + me.scrollLeft - me.offsetX - itemRects[index].left;
            isOverDraggingEnd   = clientX > me.boundaryContainerRect.right;
            isOverDraggingStart = clientX < me.boundaryContainerRect.left;
            itemHeightOrWidth   = 'width'
        } else {
            delta               = clientY - ownerY + me.scrollTop - me.offsetY - itemRects[index].top;
            isOverDraggingEnd   = clientY > me.boundaryContainerRect.bottom;
            isOverDraggingStart = clientY < me.boundaryContainerRect.top;
            itemHeightOrWidth   = 'height'
        }

        isOverDragging = isOverDraggingEnd || isOverDraggingStart;
        moveFactor     = isOverDragging ? 0.02 : 0.55; // We can not use 0.5, since items would jump back & forth

        if (isOverDraggingStart) {
            if (index > 0) {
                me.currentIndex--;
                await me.scrollToIndex();
                me.switchItems(index, me.currentIndex)
            }
        }

        else if (isOverDraggingEnd) {
            if (index < maxItems) {
                me.currentIndex++;
                await me.scrollToIndex();
                me.switchItems(index, me.currentIndex)
            }
        }

        else if (index > 0 && (!reversed && delta < 0 || reversed && delta > 0)) {
            if (Math.abs(delta) > itemRects[index - 1][itemHeightOrWidth] * moveFactor) {
                me.currentIndex--;
                me.switchItems(index, me.currentIndex)
            }
        }

        else if (index < maxItems && (!reversed && delta > 0 || reversed && delta < 0)) {
            if (Math.abs(delta) > itemRects[index + 1][itemHeightOrWidth] * moveFactor) {
                me.currentIndex++;
                me.switchItems(index, me.currentIndex)
            }
        }

        me.isOverDragging = isOverDragging && me.currentIndex !== 0 && me.currentIndex !== maxItems;

        if (me.isOverDragging) {
            await me.timeout(30); // wait for 1 frame

            if (me.isOverDragging) {
                await me.onDragMove(data)
            }
        }
    }

    /**
     * Initializes the drag operation.
     *
     * Key actions:
     * 1.  **Identify Drag Target:** Determines which item is being dragged (handling `dragHandleSelector` if present).
     * 2.  **Snapshot Layout:** Captures the current DOM rectangles (`itemRects`) of all sortable items. This snapshot
     *     is critical for:
     *     - Calculating drag deltas for sorting.
     *     - Restoring the layout after a window drag re-entry.
     *     - Inferring gaps and offsets for `calculateExpandedLayout`.
     * 3.  **Setup Proxy & Placeholder:** Configures the visual drag proxy and inserts the placeholder into the `sortableItems` list.
     * 4.  **Apply Absolute Positioning:** Temporarily switches all items to `position: absolute` based on their captured
     *     coordinates to enable smooth, GPU-accelerated movement during the drag.
     *
     * @param {Object} data - The drag start event data.
     */
    async onDragStart(data) {
        let me                   = this,
            {adjustItemRectsToParent, dragHandleSelector, owner} = me,
            itemStyles           = me.itemStyles = [],
            {layout}             = owner,
            ownerStyle           = owner.style || {},
            draggedItem, index, indexMap, itemStyle, rect, sortableItems;

        if (owner.dragResortable) {
            if (dragHandleSelector) {
                const handleClassName = dragHandleSelector.substring(1);
                const handleNode      = data.path.find(node => node.cls.includes(handleClassName));

                if (!handleNode) {
                    return;
                }

                const handleIndex = data.path.indexOf(handleNode);

                for (let i = handleIndex; i < data.path.length; i++) {
                    const potentialItemNode = data.path[i];
                    const component = Neo.getComponent(potentialItemNode.id);

                    if (component && owner.items.includes(component)) {
                        draggedItem = component;
                        break;
                    }
                }

                if (!draggedItem) {
                    return;
                }

                sortableItems = owner.items.filter(item => VDomUtil.find(item.vdom, {
                    cls: dragHandleSelector.startsWith('.') ? dragHandleSelector.substring(1) : dragHandleSelector
                }));
                index         = sortableItems.indexOf(draggedItem);

                if (index < 0) {
                    return;
                }
            } else {
                draggedItem   = Neo.getComponent(data.path[0].id);
                sortableItems = owner.items;
                index         = owner.indexOf(draggedItem.id);
            }

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
                });
            });

            const itemRects = await owner.getDomRect([owner.id].concat(sortableItems.map(e => e.id)));

            me.ownerRect = itemRects.shift();

            owner.style = {
                ...ownerStyle,
                height  : `${me.ownerRect.height}px`,
                minWidth: `${me.ownerRect.width}px`,
                width   : `${me.ownerRect.width}px`
            };

            adjustItemRectsToParent && itemRects.forEach(rect => {
                rect.x -= me.ownerRect.x;
                rect.y -= me.ownerRect.y
            });

            me.itemRects = itemRects;

            await me.dragStart(data);

            if (me.dragPlaceholder) {
                const placeholderIndex = sortableItems.indexOf(draggedItem);
                if (placeholderIndex > -1) {
                    sortableItems[placeholderIndex] = me.dragPlaceholder;
                }
                me.dragElement = me.dragPlaceholder.vdom;
            }

            sortableItems.forEach((item, i) => {
                itemStyle = item.wrapperStyle || {};
                rect      = me.itemRects[i];

                me.adjustProxyRectToParent?.(rect, me.ownerRect);

                item.wrapperStyle = Object.assign(itemStyle, {
                    height  : `${rect.height}px`,
                    left    : `${rect.left}px`,
                    margin  : '0px',
                    position: 'absolute',
                    top     : `${rect.top}px`,
                    width   : `${rect.width}px`
                });
            });

            await me.timeout(5);

            // If we have a placeholder, the original item is already hidden/moved.
            // But we might want to ensure the placeholder (which is now in sortableItems) matches expectations?
            // The logic below originally hid the draggedItem.
            // If we use placeholder, draggedItem is in proxy (visible). Placeholder is hidden.
            // me.dragPlaceholder logic in DragZone already set it to visibility: hidden.
            if (!me.dragPlaceholder) {
                itemStyle = draggedItem.wrapperStyle || {};
                itemStyle.visibility = 'hidden';
                draggedItem.wrapperStyle = itemStyle;
            }
        }
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
                 continue;
            }

            let item = me.owner.items[mappedIndex];

            if (item === me.dragPlaceholder || item === me.dragComponent) {
                continue;
            }

            let rect = me.itemRects[i];

            items.push({item, rect});

            if (item.flex) {
                totalFlex += item.flex;
            } else {
                let size = isHorizontal ? rect.width : rect.height;
                usedSize += size;
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
                itemSize = (item.flex / totalFlex) * availableSpace;
            } else {
                itemSize = isHorizontal ? rect.width : rect.height;
            }

            if (isHorizontal) {
                style = {
                    left  : `${startX + currentPos}px`,
                    top   : `${startY + topOffset}px`,
                    height: `${ownerRect.height - topOffset - bottomOffset}px`,
                    width : `${itemSize}px`
                };
            } else {
                style = {
                    left  : `${startX + leftOffset}px`,
                    top   : `${startY + currentPos}px`,
                    height: `${itemSize}px`,
                    width : `${ownerRect.width - leftOffset - rightOffset}px`
                };
            }

            rects.push({item, style});
            currentPos += itemSize + gap;
        });

        return rects;
    }

    /**
     * @returns {Promise<void>}
     */
    async scrollToIndex() {
        let me = this;

        me.isScrolling = true;
        await me.owner.scrollToIndex?.(me.currentIndex, me.itemRects[me.currentIndex]);
        me.isScrolling = false
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
            };
        }

        // Apply expanded layout
        let expandedLayout = me.calculateExpandedLayout();
        expandedLayout.forEach(({item, style}) => {
            item.wrapperStyle = {...item.wrapperStyle, ...style};
        });

        Neo.main.addon.DragDrop.startWindowDrag({
            popupHeight,
            popupName: windowName,
            popupWidth,
            windowId : me.windowId
        });
    }

    /**
     * Swaps two items in the sort list, updating their layout coordinates and the internal index map.
     *
     * This method handles the physical reordering of items during a drag operation. It performs the following:
     * 1.  **Normalization:** Ensures indices are ordered correctly based on layout direction.
     * 2.  **Geometry Calculation:** Swaps the dimensions (width/height) of the two items and recalculates
     *     their positions (x/y), preserving the original gap between them. This ensures that items of different
     *     sizes swap correctly without breaking the layout structure.
     * 3.  **State Update:** Updates the `indexMap` to reflect the new logical order of items.
     * 4.  **Visual Update:** Calls `updateItem` to apply the new coordinates to the DOM.
     *
     * @param {Number} index1 - The index of the first item to swap.
     * @param {Number} index2 - The index of the second item to swap.
     */
    switchItems(index1, index2) {
        let me       = this,
            reversed = me.reversedLayoutDirection,
            tmp;

        if ((!reversed && index2 < index1) || (reversed && index1 < index2)) {
            tmp    = index1;
            index1 = index2;
            index2 = tmp;
        }

        let itemRects = me.itemRects,
            map       = me.indexMap,
            rect1     = itemRects[index1],
            rect2     = itemRects[index2],
            rect1Copy = rect1.clone(),
            rect2Copy = rect2.clone();

        if (me.sortDirection === 'horizontal') {
            const gap = rect2Copy.x - (rect1Copy.x + rect1Copy.width);

            rect1.width = rect2Copy.width;
            rect2.x     = rect1Copy.x + rect2Copy.width + gap;
            rect2.width = rect1Copy.width
        } else {
            const gap = rect2Copy.y - (rect1Copy.y + rect1Copy.height);

            rect1.height = rect2Copy.height;
            rect2.height = rect1Copy.height;
            rect2.y      = rect1Copy.y + rect2Copy.height + gap;
        }

        tmp         = map[index1];
        map[index1] = map[index2];
        map[index2] = tmp;

        me.updateItem(index1, rect1);
        me.updateItem(index2, rect2)
    }

    /**
     * @param {Number} index
     * @param {Object} rect
     */
    updateItem(index, rect) {
        let me          = this,
            mappedIndex = me.indexMap[index],
            item;

        if (mappedIndex === -1) {
            if (me.dragPlaceholder) {
                item = me.dragPlaceholder;
            } else {
                return
            }
        } else {
            item = me.owner.items[mappedIndex];

            if (me.dragPlaceholder && item === me.dragComponent) {
                item = me.dragPlaceholder
            }
        }

        let {wrapperStyle} = item;

        wrapperStyle.left = `${rect.left}px`;
        wrapperStyle.top  = `${rect.top}px`;

        item.wrapperStyle = wrapperStyle
    }
}

export default Neo.setupClass(SortZone);
