import Component          from '../../component/Base.mjs';
import DragCoordinator    from '../../manager/DragCoordinator.mjs';
import DragProxyContainer from '../DragProxyContainer.mjs';
import NeoArray           from '../../util/Array.mjs';
import Rectangle          from '../../util/Rectangle.mjs';
import SortZone           from '../container/SortZone.mjs';
import VDomUtil           from '../../util/VDom.mjs';

/**
 * A single `flex` token that is a length or a percentage rather than a bare number. In the CSS
 * shorthand such a token is the **basis**, and the grow factor defaults to 1 — so `flex: 100px`
 * grows by 1, never by 100. Kept explicit rather than inferred from "digits followed by letters",
 * which would read `1oops` as a length.
 * @type {RegExp}
 */
const CSS_FLEX_BASIS = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:%|px|em|rem|ex|ch|cap|ic|lh|rlh|vw|vh|vi|vb|vmin|vmax|cm|mm|q|in|pt|pc)$/;

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
     *     it among flex items proportional to their flex values. Membership of that set is decided by
     *     {@link Neo.draggable.dashboard.SortZone#resolveFlexWeight resolveFlexWeight} rather than by a truthiness test,
     *     because `flex` here is app-supplied and `'none'` is a legal truthy value — see that method for why the
     *     distinction is load-bearing.
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

            let rect = me.itemRects[i],
                flex = me.resolveFlexWeight(item.flex);

            items.push({item, rect, flex});

            if (flex) {
                totalFlex += flex
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

        items.forEach(({item, rect, flex}, index) => {
            let itemSize, style = {};

            if (flex) {
                itemSize = (flex / totalFlex) * availableSpace
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
     * @summary Resolves an item's `flex` config into the numeric weight the expanded layout divides by.
     *
     * **`flex` is app-supplied on this path.** The sole caller reaching
     * {@link Neo.draggable.dashboard.SortZone#calculateExpandedLayout} is `Neo.dashboard.Container`'s widget
     * sorting, so the value is whatever an application put on its widgets — every CSS-legal spelling can
     * arrive, and **`'none'` is a legal one that is also truthy**. A truthiness test therefore does not
     * identify a flex item: `'none'` passes it, `totalFlex += 'none'` concatenates into `'0none'`, and the
     * division yields `NaN` — written straight into `style.width` as `'NaNpx'`. Nothing throws, so the
     * geometry is simply wrong.
     *
     * **It reads the shorthand's grow factor rather than scanning for the first number**, because
     * CSS-equivalent spellings must not disagree. `flex: auto` and `flex: 1 1 auto` are the same
     * declaration, and a leading-number scan resolves them to different weights. The same scan reads
     * `100px` — a *basis*, whose grow defaults to 1 — as weight 100, and invents weight 1 out of
     * `1oops`. This codebase writes shorthands routinely (`'0 1 auto'`, `'1 1 600px'`, `'1 1 100%'`),
     * so the grammar is load-bearing rather than defensive.
     *
     * The grammar, all of it:
     *
     * - a finite positive number is the weight;
     * - `none` is `0 0 auto` and `initial` is `0 1 auto`, so both are **not flexible**;
     * - `auto` is `1 1 auto`, so it is weight **1**;
     * - otherwise the first of up to three tokens carries grow: a bare number is that grow, and a
     *   lone length or percentage is a basis whose grow is 1;
     * - anything else — a fourth token, a non-numeric leading token, a non-string non-number — is
     *   not flexible.
     *
     * A zero or negative grow is likewise not flexible: it grows nothing, which preserves the
     * behaviour a falsy `0` already had. **Unparseable never invents a weight**; the item keeps its
     * measured rect, which is the safe wrong answer.
     *
     * @param {Number|String|null|undefined} flex The item's `flex` config, unvalidated — `undefined`
     * is the routine case, since most items declare no `flex` at all.
     * @returns {Number|null} A positive finite weight, or `null` when the item does not participate in the
     * flex distribution.
     */
    resolveFlexWeight(flex) {
        if (typeof flex === 'number') {
            return Number.isFinite(flex) && flex > 0 ? flex : null
        }

        if (typeof flex !== 'string') {
            return null
        }

        const value = flex.trim().toLowerCase();

        if (value === 'none' || value === 'initial') return null;
        if (value === 'auto')                        return 1;

        const tokens = value.split(/\s+/).filter(Boolean);

        if (tokens.length === 0 || tokens.length > 3) {
            return null
        }

        const grow = Number(tokens[0]);

        if (!Number.isFinite(grow)) {
            return tokens.length === 1 && CSS_FLEX_BASIS.test(tokens[0]) ? 1 : null
        }

        return grow > 0 ? grow : null
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
     * @summary Returns a terminal detached popup item for geometry-only reintegration.
     *
     * Returns the detached terminal popup item represented by a native OS window.
     * This is the source side of geometry-only titlebar drag reintegration.
     * @param {String} windowId
     * @returns {Object|null}
     */
    getNativeWindowDrag(windowId) {
        let me = this;

        if (!me.owner.detachedItems) {
            return null
        }

        for (const [widgetName, detachedItem] of me.owner.detachedItems.entries()) {
            if (detachedItem.windowId === windowId && detachedItem.terminalDrop && detachedItem.widget) {
                return {
                    draggedItem: detachedItem.widget,
                    widgetName
                }
            }
        }

        return null
    }

    /**
     * Completes dashboard drag cleanup under the base drag-end latch.
     * @param {Object} data The drag end event data.
     */
    async processDragEnd(data) {
        let me = this;

        if (!me.isRemoteDragging) {
            DragCoordinator[data.cancelled ? 'onDragCancel' : 'onDragEnd']({
                draggedItem   : me.dragComponent,
                sourceSortZone: me
            })
        }

        await super.processDragEnd(data)
    }

    /**
     * Finalizes a window drag released outside every registered dashboard target.
     * @param {Neo.component.Base} draggedItem
     */
    onTerminalWindowDrop(draggedItem) {
        this.owner.onWindowDragTerminalDrop?.({
            draggedItem,
            sortZone: this
        })
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
            // A target-zone visitor leaving is cleanup, not a local drop. Keep remote state active and
            // suppress the shared onDragEnd() moveNode path so the remote component is not inserted here.
            me.isWindowDragging = true;
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
     * @summary Takes the item into this zone, and REPORTS whether it did.
     *
     * The return value is the commit decision the coordinator gates source retirement on: the
     * committed operation, or `null` when this zone did not take the item. Both paths previously
     * returned `undefined`, so committing and declining were indistinguishable to the caller — and a
     * caller cannot honour an outcome the target refuses to state.
     *
     * @param {Neo.component.Base} draggedItem
     * @returns {Promise<Object|null>} The committed operation, or `null` when nothing was taken.
     */
    async onRemoteDrop(draggedItem) {
        let me    = this,
            index = me.currentIndex;

        // Not in remote drag mode: this zone takes nothing, and says so. Silence here is what let the
        // coordinator retire a source into a target that never accepted the item.
        if (!me.isRemoteDragging) {
            return null
        }

        // Cleanup placeholder but keep layout ready
        await me.onDragEnd({});

        // Remove from old parent (if not already detached)
        const parentId = draggedItem.parentId;
        if (parentId && parentId !== 'document.body') {
            Neo.getComponent(parentId)?.remove(draggedItem, false)
        }

        // Insert into new owner
        me.owner.insert(index, draggedItem);

        me.isRemoteDragging = false;

        return {index, ownerId: me.owner.id, type: 'insertItem'}
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

        me.ownerRect = itemRects.shift();
        me.boundaryContainerRect = me.ownerRect;

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

        // Break the parent chain to prevent circular config lookups during handover
        draggedItem.parentId        = null;
        draggedItem.parentComponent = null;

        // Since the component was mounted in a different window, we need to reset the state
        draggedItem.mounted          = false;
        draggedItem.vnode            = null;
        draggedItem.vnodeInitialized = false;

        // 1. Get Owner Rect (needed for proxy positioning)
        let rects = await owner.getDomRect([owner.id]);
        me.ownerRect = rects[0];

        // Assign the drag offsets to the instance, so that the DragZone onDragMove logic works
        me.offsetX = data.offsetX;
        me.offsetY = data.offsetY;

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

        me.dragProxy = Neo.create(config);

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
        let me                                    = this,
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
