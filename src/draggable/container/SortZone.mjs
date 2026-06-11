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
         * The intersection ratio (0-1) required to detach an item into a new window.
         * Lower values mean the item must be dragged further out.
         * @member {Number} detachThreshold=0.8
         */
        detachThreshold: 0.8,
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
         * While a drag is active, force the owner's width to the full content size of its items
         * (they leave the layout flow via `position: absolute`, so an auto-sized owner would
         * collapse and reflow its surroundings).
         *
         * Subclasses whose owner is a real scroll container (e.g. the grid header toolbar) opt OUT:
         * expanding such an owner destroys its scrollable overflow, turning the next programmatic
         * scroll into a scroll of whatever ancestor can still move — in a locked-columns grid that
         * is the grid container, which drags the frozen regions off-screen. The owner's height is
         * always pinned, independent of this config.
         * @member {Boolean} expandOwnerOnDrag=true
         */
        expandOwnerOnDrag: true,
        /**
         * A CSS selector to ignore drag starts on (e.g. '.neo-resizable').
         * @member {String|null} ignoreDragSelector=null
         */
        ignoreDragSelector: null,
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
         * @member {Number} lastIntersectionRatio=1
         * @protected
         */
        lastIntersectionRatio: 1,
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
         * Applies an inline `position: relative` to the owner for the duration of a drag, making the
         * owner the containing block for the absolutely positioned items. Required whenever the item
         * rects get converted into owner-relative space (adjustItemRectsToParent / adjustProxyRectToParent)
         * but the owner is not otherwise a positioned element — without it, the written left/top values
         * resolve against an arbitrary positioned ancestor and render offset by the owner's own origin.
         * @member {Boolean} positionOwnerRelative=false
         */
        positionOwnerRelative: false,
        /**
         * The intersection ratio (0-1) required to re-attach a window-dragged item back into the container.
         * Higher values mean the item must be dragged further in.
         * @member {Number} reattachThreshold=0.6
         */
        reattachThreshold: 0.6,
        /**
         * @member {Boolean} alwaysFireDragMove=false
         * @protected
         */
        reversedLayoutDirection: false,
        /**
         * The owner's absolute horizontal scroll position, in owner-content pixels.
         *
         * Seeded at drag start from `owner.scrollLeft` (0 for owners without the config) and kept
         * live during the drag by the owner — for grids: `grid.ScrollManager` mirrors every
         * horizontal scroll into `grid.header.Toolbar#scrollLeft`, whose afterSet writes it here;
         * the overdrag path additionally sets it optimistically (`Toolbar#scrollToIndex`).
         *
         * The move-delta math pairs it with `itemRects`, which subclasses snapshot in owner-CONTENT
         * space (see `adjustProxyRectToParent`): `clientX - ownerX + scrollLeft` is the pointer's
         * content-space position, comparable against `itemRects[i].left` at any scroll state.
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
     * Ring buffer of recent drag traces (drag lifecycle observability for the Neural Link
     * `get_drag_trace` tool). Bounded by traceLimit; zero cost beyond plain-object pushes.
     * @member {Object[]} traces=[]
     * @protected
     * @static
     */
    static traces = []
    /**
     * @member {Number} traceLimit=5
     * @protected
     * @static
     */
    static traceLimit = 5
    /**
     * The trace record of the drag currently in flight, or null.
     * @member {Object|null} activeTrace=null
     * @protected
     * @static
     */
    static activeTrace = null

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
     * Appends one event to the active drag trace. Events carry where the drag logic
     * decided to be, not where the DOM is — pair with the `observe_motion` tool for
     * the rendered-geometry side of the same window.
     *
     * Duplicate-delivery events get COUNT-COMPRESSED onto the previous event (`dup: n`)
     * instead of logged individually — per-occurrence dup entries used to consume most
     * of the buffer. At the cap the buffer drops the OLDEST event, not the newest: a
     * drag's tail (overdrag, scroll, drop resolution) is its most diagnostic part.
     * @param {Object} data
     */
    traceEvent(data) {
        const trace = SortZone.activeTrace;

        if (!trace) {
            return
        }

        const {events} = trace;

        if (data.t === 'dup') {
            const last = events[events.length - 1];

            if (last) {
                last.dup = (last.dup || 0) + 1
            }

            return
        }

        if (events.length >= 400) {
            events.shift()
        }

        events.push({...data, ts: Date.now()})
    }

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
     * @param {Object} data
     * @returns {Boolean} true if the method processing should stop
     */
    checkWindowBoundary(data) {
        let me = this,
            {proxyRect} = data;

        if (proxyRect && me.boundaryContainerRect) {
            const
                boundaryRect      = me.boundaryContainerRect,
                intersection      = Rectangle.getIntersection(proxyRect, boundaryRect),
                proxyArea         = proxyRect.width * proxyRect.height,
                intersectionArea  = intersection ? intersection.width * intersection.height : 0,
                intersectionRatio = proxyArea > 0 ? intersectionArea / proxyArea : 0,
                isMovingIn        = intersectionRatio > me.lastIntersectionRatio,
                isMovingOut       = intersectionRatio < me.lastIntersectionRatio;

            me.lastIntersectionRatio = intersectionRatio;

            if (!me.isWindowDragging) {
                if (isMovingOut && intersectionRatio < me.detachThreshold) {
                    me.isWindowDragging = true; // Set flag to prevent re-entry

                    me.fire('dragBoundaryExit', {
                        draggedItem: me.dragComponent,
                        proxyRect,
                        sortZone   : me
                    });
                    return true // Stop further processing in onDragMove
                }
            } else if (me.isWindowDragging) {
                if (isMovingIn && intersectionRatio > me.reattachThreshold) {
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
                                }
                            }
                        }
                    });

                    me.fire('dragBoundaryEntry', {
                        draggedItem: me.dragComponent,
                        proxyRect,
                        sortZone   : me
                    })
                } else {
                    me.onWindowDragContinue(intersectionRatio, data)
                }
                return true
            }
        }

        return false
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
     * Drag:end entry point. The drag listeners fan out across the owner and its child items, so one
     * native release can deliver multiple drag:end events. This entry latches synchronously and routes
     * exactly one delivery into {@link #processDragEnd} — without it, the async drop pipeline runs
     * twice (double traces, double layout refreshes, double lock verdicts in grids).
     * @param {Object} data - The drag end event data.
     */
    async onDragEnd(data) {
        let me = this;

        if (me.dragEndActive) {
            return
        }

        me.dragEndActive = true;

        try {
            await me.processDragEnd(data)
        } finally {
            me.dragEndActive = false
        }
    }

    /**
     * Handles the completion of the drag operation. Invoked exactly once per drag via the
     * {@link #onDragEnd} re-entry latch; subclasses extend this method, not `onDragEnd`.
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
    async processDragEnd(data) {
        let me                  = this,
            {itemStyles, owner} = me,
            ownerStyle          = owner.style || {},
            itemStyle;

        await me.timeout(10);

        if (!me.dragComponent) {
            return
        }

        if (owner.dragResortable) {
            if (me.dragPlaceholder) {
                const
                    component = me.dragComponent,
                    deltas    = [],
                    index     = me.sortableItems.indexOf(me.dragPlaceholder);

                if (component && index > -1) {
                    if (!me.isWindowDragging) {
                        // Only move DOM if not window dragging or if it's a remote drag being finalized locally
                        if (!me.isRemoteDragging || (me.isRemoteDragging && !me.isWindowDragging)) {
                             deltas.push({
                                action  : 'moveNode',
                                id      : component.id,
                                index,    // Visually correct index (where placeholder is)
                                parentId: owner.getVdomItemsRoot().id
                            })
                        }
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
            ownerStyle.position = me.ownerStyle.position  || null;
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

            // Restore visibility of the dragged component (it's not in sortableItems if placeholder is used)
            if (me.dragComponent) {
                let style = me.dragComponent.wrapperStyle || {};
                style.visibility = null;
                me.dragComponent.wrapperStyle = style;
            }

            if (!me.isWindowDragging && !me.isRemoteDragging && me.startIndex !== me.currentIndex) {
                let fromIndex, toIndex;

                if (me.dragPlaceholder) {
                    const component = me.dragComponent;
                    fromIndex = me.owner.items.indexOf(component);
                    toIndex   = me.owner.items.indexOf(me.sortableItems[me.currentIndex]);
                } else {
                    fromIndex = me.owner.items.indexOf(me.sortableItems[me.startIndex]);
                    toIndex   = me.owner.items.indexOf(me.sortableItems[me.currentIndex]);
                }

                me.traceEvent({t: 'end', from: fromIndex, to: toIndex});
                me.moveTo(fromIndex, toIndex);
            } else {
                me.traceEvent({t: 'end', from: me.startIndex, to: me.currentIndex, noop: true});
            }

            // activeTrace stays set until the next onDragStart replaces it: subclasses record
            // post-drop resolution events (e.g. the grid lock verdict) after this method returns.

            Object.assign(me, {
                currentIndex    : -1,
                indexMap        : null,
                isRemoteDragging: false,
                isWindowDragging: false,
                itemRects       : null,
                itemStyles      : null,
                lastInBoundX    : null,
                lastInBoundY    : null,
                ownerRect       : null,
                scrollLeft      : 0,
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
     * @param {Object} data The drag move event data.
     */
    async onDragMove(data) {
        let me = this;

        // The method can trigger before we got the client rects from the main thread
        if (!me.itemRects || me.isScrolling || !me.boundaryContainerRect) {
            return
        }

        // console.log('SortZone onDragMove', me.dragProxy);

        if (!me.isRemoteDragging && me.dragProxy && me.enableProxyToPopup) {
            if (me.checkWindowBoundary(data)) {
                return
            }
        }

        let {clientX, clientY} = data,
            index              = me.currentIndex,
            {itemRects}        = me,
            maxItems           = itemRects.length - 1,
            // itemRects leave viewport space through EITHER conversion mechanism: the
            // adjustItemRectsToParent flag (parent-managed) or a subclass-provided
            // adjustProxyRectToParent (grid / table header toolbars). The delta math must
            // shift clientX/Y into the same owner-relative space in both cases — comparing
            // viewport cursor coordinates against owner-relative rects inflates delta by the
            // owner's viewport origin (~the locked-start region width in a locked grid),
            // making every in-bound move exceed every switch threshold.
            rectsAreOwnerRelative = me.adjustItemRectsToParent || !!me.adjustProxyRectToParent,
            ownerX             = rectsAreOwnerRelative ? me.ownerRect.x : 0,
            ownerY             = rectsAreOwnerRelative ? me.ownerRect.y : 0,
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

        // Duplicate-delivery guard (in-bound only): the same pointer position can reach this
        // zone more than once — stacked delegated drag listeners along the DOM path deliver one
        // move per matching node, and sensor fallbacks re-fire the last position. In-bound switch
        // decisions are position-driven: re-processing an unchanged position re-qualifies the
        // delta against already-mutated itemRects and over-switches. The overdrag branches stay
        // exempt — their auto-scroll loop deliberately re-feeds the same position.
        if (!isOverDragging && clientX === me.lastInBoundX && clientY === me.lastInBoundY) {
            me.traceEvent({t: 'dup', x: clientX, y: clientY});
            return
        }

        me.lastInBoundX = clientX;
        me.lastInBoundY = clientY;

        if (isOverDraggingStart) {
            if (index > 0) {
                me.currentIndex--;
                await me.scrollToIndex();

                // The drag can end while the scroll is awaited; the end-reset nulls itemRects
                if (!me.itemRects) {
                    return
                }

                me.switchItems(index, me.currentIndex)
            }
        }

        else if (isOverDraggingEnd) {
            if (index < maxItems) {
                me.currentIndex++;
                await me.scrollToIndex();

                // See the isOverDraggingStart branch: bail when the drag ended mid-await
                if (!me.itemRects) {
                    return
                }

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

        me.traceEvent({
            t   : 'move',
            x   : clientX,
            y   : clientY,
            i   : me.currentIndex,
            over: isOverDragging,
            d   : Math.round(delta),
            ox  : Math.round(me.offsetX || 0),
            sl  : me.scrollLeft,
            ir  : itemRects[me.currentIndex] ? Math.round(itemRects[me.currentIndex].left) : null
        });

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
        let me         = this,
            {adjustItemRectsToParent, dragHandleSelector, ignoreDragSelector, owner} = me,
            itemStyles = me.itemStyles = [],
            {layout}   = owner,
            ownerStyle = owner.style || {},
            draggedItem, index, indexMap, itemStyle, rect, sortableItems;

        if (owner.dragResortable) {
            if (ignoreDragSelector) {
                const ignoreClassName = ignoreDragSelector.startsWith('.') ? ignoreDragSelector.substring(1) : ignoreDragSelector;
                if (data.path[0].cls.includes(ignoreClassName)) {
                    return
                }
            }

            if (dragHandleSelector) {
                const handleClassName = dragHandleSelector.substring(1);
                const handleNode      = data.path.find(node => node.cls.includes(handleClassName));

                if (!handleNode) {
                    return
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
                    return
                }

                sortableItems = owner.items.filter(item => VDomUtil.find(item.vdom, {
                    cls: dragHandleSelector.startsWith('.') ? dragHandleSelector.substring(1) : dragHandleSelector
                }));
                index         = sortableItems.indexOf(draggedItem);

                if (index < 0) {
                    return
                }
            } else {
                draggedItem   = Neo.getComponent(data.path[0].id);
                sortableItems = owner.items;
                index         = owner.indexOf(draggedItem.id)
            }

            indexMap = {};

            Object.assign(me, {
                currentIndex           : index,
                dragElement            : VDomUtil.find(owner.vdom, draggedItem.id).vdom,
                dragProxyConfig        : me.getDragProxyConfig(),
                indexMap,
                lastIntersectionRatio  : 1,
                ownerStyle             : {height: ownerStyle.height, minWidth: ownerStyle.minWidth, position: ownerStyle.position, width: ownerStyle.width},
                reversedLayoutDirection: layout.direction === 'column-reverse' || layout.direction === 'row-reverse',
                scrollLeft             : owner.scrollLeft || 0, // absolute owner scroll; subclasses snapshot itemRects in owner-content space
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

            const itemRects = await owner.getDomRect([owner.id].concat(sortableItems.map(e => e.id)));

            me.ownerRect = itemRects.shift();

            // Calculate real owner dimensions based on first and last item rects (accounting for padding)
            if (itemRects.length > 0) {
                const firstItemRect = itemRects[0];
                const lastItemRect  = itemRects[itemRects.length - 1];

                if (me.sortDirection === 'horizontal') {
                    if (firstItemRect.x > me.ownerRect.x) {
                        me.ownerRect.x = firstItemRect.x
                    }
                    if (firstItemRect.y > me.ownerRect.y) {
                        me.ownerRect.y = firstItemRect.y
                    }
                    me.ownerRect.width  = (lastItemRect.x + lastItemRect.width)  - me.ownerRect.x;
                    me.ownerRect.height = (lastItemRect.y + lastItemRect.height) - me.ownerRect.y
                } else {
                    if (firstItemRect.x > me.ownerRect.x) {
                        me.ownerRect.x = firstItemRect.x
                    }
                    if (firstItemRect.y > me.ownerRect.y) {
                        me.ownerRect.y = firstItemRect.y
                    }
                    me.ownerRect.width  = (lastItemRect.x + lastItemRect.width)  - me.ownerRect.x;
                    me.ownerRect.height = (lastItemRect.y + lastItemRect.height) - me.ownerRect.y
                }
            }

            owner.style = {
                ...ownerStyle,
                height: `${me.ownerRect.height}px`,
                ...(me.expandOwnerOnDrag      && {minWidth: `${me.ownerRect.width}px`, width: `${me.ownerRect.width}px`}),
                ...(me.positionOwnerRelative  && {position: 'relative'})
            };

            adjustItemRectsToParent && itemRects.forEach(rect => {
                rect.x -= me.ownerRect.x;
                rect.y -= me.ownerRect.y
            });

            me.itemRects = itemRects;

            SortZone.activeTrace = {
                events    : [],
                items     : sortableItems.map(item => item.id),
                ownerId   : owner.id,
                rects     : itemRects.map(rect => ({left: rect.left, width: rect.width})),
                startIndex: index,
                startedAt : Date.now(),
                zoneId    : me.id
            };

            SortZone.traces.push(SortZone.activeTrace);

            if (SortZone.traces.length > SortZone.traceLimit) {
                SortZone.traces.shift()
            }

            await me.dragStart(data);

            if (me.dragPlaceholder) {
                const placeholderIndex = sortableItems.indexOf(draggedItem);
                if (placeholderIndex > -1) {
                    sortableItems[placeholderIndex] = me.dragPlaceholder
                }
                me.dragElement = me.dragPlaceholder.vdom
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
                })
            });

            await me.timeout(5);

            if (!me.dragPlaceholder) {
                itemStyle = draggedItem.wrapperStyle || {};
                itemStyle.visibility = 'hidden';
                draggedItem.wrapperStyle = itemStyle
            }
        }
    }

    /**
     * @param {Number} intersectionRatio
     * @param {Object} data
     */
    onWindowDragContinue(intersectionRatio, data) {}

    /**
     * Scrolls the owner so the current index becomes reachable. The owner performs the actual
     * scroll through its production scroll pipeline (for grids: driving the dedicated horizontal
     * scrollbar element — `grid.header.Toolbar#scrollToIndex`), which also keeps `me.scrollLeft`
     * current: optimistically via the owner's reactive `scrollLeft` config, and authoritatively
     * via the scroll-event echo (`grid.ScrollManager` → `Toolbar#afterSetScrollLeft` → this zone).
     * Move processing is latched off (`isScrolling`) for the duration of the owner call.
     * @returns {Promise<void>}
     */
    async scrollToIndex() {
        let me = this;

        me.traceEvent({t: 'scroll', i: me.currentIndex, sl: me.scrollLeft});

        me.isScrolling = true;
        await me.owner.scrollToIndex?.(me.currentIndex, me.itemRects[me.currentIndex]);
        me.isScrolling = false
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

        me.traceEvent({t: 'switch', i1: index1, i2: index2});

        if ((!reversed && index2 < index1) || (reversed && index1 < index2)) {
            tmp    = index1;
            index1 = index2;
            index2 = tmp
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
            rect2.y      = rect1Copy.y + rect2Copy.height + gap
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
                item = me.dragPlaceholder
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
