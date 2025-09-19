import DragZone  from './DragZone.mjs';
import NeoArray  from '../../util/Array.mjs';
import Rectangle from '../../util/Rectangle.mjs';
import VDomUtil  from '../../util/VDom.mjs';

/**
 * @class Neo.draggable.container.SortZone
 * @extends Neo.draggable.container.DragZone
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
         * @member {String|null} itemMargin=null
         * @protected
         */
        itemMargin: null,
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
     * @param {Object} data
     */
    async onDragEnd(data) {
        let me                  = this,
            {itemStyles, owner} = me,
            ownerStyle          = owner.style || {},
            itemStyle;

        await me.timeout(10);

        if (owner.sortable) {
            ownerStyle.height   = me.ownerStyle.height    || null;
            ownerStyle.minWidth = me.ownerStyle.minWidth  || null;
            ownerStyle.width    = me.ownerStyle.width     || null;

            owner.style = ownerStyle;

            me.sortableItems.forEach((item, index) => {
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

            if (me.startIndex !== me.currentIndex) {
                me.moveTo(
                    me.owner.items.indexOf(me.sortableItems[me.startIndex]),
                    me.owner.items.indexOf(me.sortableItems[me.currentIndex])
                );
            }

            Object.assign(me, {
                currentIndex : -1,
                indexMap     : null,
                itemRects    : null,
                itemStyles   : null,
                ownerRect    : null,
                startIndex   : -1,
                sortableItems: null
            });

            await me.timeout(30);

            me.dragEnd(data) // we do not want to trigger the super class call here
        }
    }

    /**
     * @param {Object} data
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
                            draggedItem: Neo.getComponent(me.dragElement.id),
                            proxyRect,
                            sortZone   : me
                        });
                        return // Stop further processing in onDragMove
                    }
                } else if (me.isWindowDragging) {
                    if (proxyArea > 0 && (intersectionArea / proxyArea) > 0.51) {
                        me.fire('dragBoundaryEntry', {
                            draggedItem: Neo.getComponent(me.dragElement.id),
                            proxyRect,
                            sortZone   : me
                        });
                    }
                    return;
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
     * @param {Object} data
     */
    async onDragStart(data) {
        let me                   = this,
            {adjustItemRectsToParent, dragHandleSelector, owner} = me,
            itemStyles           = me.itemStyles = [],
            {layout}             = owner,
            ownerStyle           = owner.style || {},
            draggedItem, index, indexMap, itemStyle, rect, sortableItems;

        if (owner.sortable) {
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

            await me.dragStart(data);

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

            sortableItems.forEach((item, i) => {
                itemStyle = item.wrapperStyle || {};
                rect      = me.itemRects[i];

                me.adjustProxyRectToParent?.(rect, me.ownerRect);

                item.wrapperStyle = Object.assign(itemStyle, {
                    height  : `${rect.height}px`,
                    left    : `${rect.left}px`,
                    margin  : me.itemMargin,
                    position: 'absolute',
                    top     : `${rect.top}px`,
                    width   : `${rect.width}px`
                });
            });

            await me.timeout(5);

            itemStyle = draggedItem.wrapperStyle || {};
            itemStyle.visibility = 'hidden';
            draggedItem.wrapperStyle = itemStyle;
        }
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
     * @param {Object} data
     */
    startWindowDrag(data) {
        let me            = this,
            {popupHeight, popupWidth, windowName} = data;

        // Hide the drag proxy since the window is now the visual indicator
        me.dragProxy.hidden = true;

        Neo.main.addon.DragDrop.startWindowDrag({
            popupHeight,
            popupName: windowName,
            popupWidth
        });
    }

    /**
     * @param {Number} index1
     * @param {Number} index2
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
            rect1.width = rect2Copy.width;
            rect2.x     = rect1Copy.x + rect2Copy.width;
            rect2.width = rect1Copy.width
        } else {
            rect1.height = rect2Copy.height;
            rect2.height = rect1Copy.height;
            rect2.y      = rect1Copy.y + rect2Copy.height;
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
        let me             = this,
            item           = me.owner.items[me.indexMap[index]],
            {wrapperStyle} = item;

        wrapperStyle.left = `${rect.left}px`;
        wrapperStyle.top  = `${rect.top}px`;

        item.wrapperStyle = wrapperStyle
    }
}

export default Neo.setupClass(SortZone);
