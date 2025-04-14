import DragZone from './DragZone.mjs';
import VDomUtil from '../../util/VDom.mjs';

/**
 * @class Neo.draggable.toolbar.SortZone
 * @extends Neo.draggable.toolbar.DragZone
 */
class SortZone extends DragZone {
    static config = {
        /**
         * @member {String} className='Neo.draggable.toolbar.SortZone'
         * @protected
         */
        className: 'Neo.draggable.toolbar.SortZone',
        /**
         * @member {String} ntype='toolbar-sortzone'
         * @protected
         */
        ntype: 'toolbar-sortzone',
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

            owner.items.forEach((item, index) => {
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
                me.moveTo(me.startIndex, me.currentIndex)
            }

            Object.assign(me, {
                currentIndex: -1,
                indexMap    : null,
                itemRects   : null,
                itemStyles  : null,
                ownerRect   : null,
                startIndex  : -1
            });

            await me.timeout(30);

            me.dragEnd(data) // we do not want to trigger the super class call here
        }
    }

    /**
     * @param {Object} data
     */
    async onDragMove(data) {
        // The method can trigger before we got the client rects from the main thread
        if (!this.itemRects || this.isScrolling) {
            return
        }

        let me                 = this,
            {clientX, clientY} = data,
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
        let me         = this,
            button     = Neo.getComponent(data.path[0].id),
            {owner}    = me,
            itemStyles = me.itemStyles = [],
            {layout}   = owner,
            ownerStyle = owner.style || {},
            index, indexMap, itemStyle, rect;

        if (owner.sortable) {
            index    = owner.indexOf(button.id);
            indexMap = {};

            Object.assign(me, {
                currentIndex           : index,
                dragElement            : VDomUtil.find(owner.vdom, button.id).vdom,
                dragProxyConfig        : {...me.dragProxyConfig, cls: [...owner.cls]},
                indexMap               : indexMap,
                ownerStyle             : {height: ownerStyle.height, minWidth: ownerStyle.minWidth, width: ownerStyle.width},
                reversedLayoutDirection: layout.direction === 'column-reverse' || layout.direction === 'row-reverse',
                sortDirection          : layout.direction?.includes('column') ? 'vertical' : 'horizontal',
                startIndex             : index
            });

            await me.dragStart(data); // We do not want to trigger the super class call here

            owner.items.forEach((item, index) => {
                indexMap[index] = index;

                itemStyles.push({
                    height: item.height ? `${item.height}px` :  item.style?.height,
                    width : item.width  ? `${item.width}px`  :  item.style?.width
                })
            });

            owner.getDomRect([owner.id].concat(owner.items.map(e => e.id))).then(itemRects => {
                me.ownerRect = itemRects[0];

                // The only reason we are adjusting the toolbar style is that there might be no min-height or min-width present.
                // => Removing items from the layout could trigger a change in size otherwise
                owner.style = {
                    ...ownerStyle,
                    height  : `${itemRects[0].height}px`,
                    minWidth: `${itemRects[0].width}px`,
                    width   : `${itemRects[0].width}px`
                };

                itemRects.shift();

                me.adjustItemRectsToParent && itemRects.forEach(rect => {
                    rect.x -= me.ownerRect.x;
                    rect.y -= me.ownerRect.y
                });

                me.itemRects = itemRects;

                owner.items.forEach((item, index) => {
                    itemStyle = item.wrapperStyle || {};
                    rect      = itemRects[index];

                    me.adjustProxyRectToParent?.(rect, me.ownerRect);

                    item.wrapperStyle = Object.assign(itemStyle, {
                        height  : `${rect.height}px`,
                        left    : `${rect.left}px`,
                        margin  : me.itemMargin,
                        position: 'absolute',
                        top     : `${rect.top}px`,
                        width   : `${rect.width}px`
                    })
                });

                // we need to add a short (1 frame) delay to ensure the item has switched to an absolute position
                me.timeout(5).then(() => {
                    itemStyle = button.wrapperStyle || {};
                    itemStyle.visibility = 'hidden';
                    button.wrapperStyle = itemStyle
                })
            })
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
            rect2.y      = rect1Copy.y + rect2Copy.height
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
