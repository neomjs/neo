import NeoArray from '../../util/Array.mjs';
import SortZone from '../container/SortZone.mjs';

/**
 * @class Neo.draggable.dashboard.SortZone
 * @extends Neo.draggable.container.SortZone
 */
class DashboardSortZone extends SortZone {
    static config = {
        className: 'Neo.draggable.dashboard.SortZone',
        ntype    : 'dashboard-sortzone'
    }

    /**
     * @param {Object} data
     */
    onDragEnd(data) {
        let me         = this,
            {owner}    = me,
            ownerStyle = owner.style || {},
            itemStyle;

        if (owner.sortable) {
            ownerStyle.height   = me.ownerStyle.height   || null;
            ownerStyle.minWidth = me.ownerStyle.minWidth || null;
            ownerStyle.width    = me.ownerStyle.width    || null;

            owner.style = ownerStyle;

            me.sortableItems.forEach((item, index) => {
                itemStyle = item.wrapperStyle || {};

                Object.assign(itemStyle, {
                    height  : me.itemStyles[index].height || null,
                    left    : null,
                    margin  : `${me.itemMargin}px 0 0 0`,
                    position: null,
                    top     : null,
                    width   : me.itemStyles[index].width || null
                });

                if (index === me.startIndex) {
                    itemStyle.visibility = null;
                }

                item.wrapperStyle = itemStyle;
            });

            if (me.startIndex !== me.currentIndex) {
                // The owner.items array includes the HeaderToolbar, so we need to adjust the index
                me.moveTo(me.startIndex + 1, me.currentIndex + 1);
            }

            Object.assign(me, {
                currentIndex: -1,
                itemRects   : null,
                itemStyles  : null,
                ownerRect   : null,
                sortableItems: null,
                startIndex   : -1
            });

            me.dragEnd(data);
        }
    }

    /**
     * @param {Object} data
     */
    async onDragMove(data) {
        // The method can trigger before we got the client rects from the main thread
        if (!this.itemRects || this.isScrolling) {
            return;
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
            itemHeightOrWidth   = 'width';
        } else {
            delta               = clientY - ownerY + me.scrollTop - me.offsetY - itemRects[index].top;
            isOverDraggingEnd   = clientY > me.boundaryContainerRect.bottom;
            isOverDraggingStart = clientY < me.boundaryContainerRect.top;
            itemHeightOrWidth   = 'height';
        }

        isOverDragging = isOverDraggingEnd || isOverDraggingStart;
        moveFactor     = isOverDragging ? 0.02 : 0.55; // We can not use 0.5, since items would jump back & forth

        if (isOverDraggingStart) {
            if (index > 0) {
                me.currentIndex--;
                await me.scrollToIndex();
                me.switchItems(index, me.currentIndex);
            }
        }

        else if (isOverDraggingEnd) {
            if (index < maxItems) {
                me.currentIndex++;
                await me.scrollToIndex();
                me.switchItems(index, me.currentIndex);
            }
        }

        else if (index > 0 && (!reversed && delta < 0 || reversed && delta > 0)) {
            if (Math.abs(delta) > itemRects[index - 1][itemHeightOrWidth] * moveFactor) {
                me.currentIndex--;
                me.switchItems(index, me.currentIndex);
            }
        }

        else if (index < maxItems && (!reversed && delta > 0 || reversed && delta < 0)) {
            if (Math.abs(delta) > itemRects[index + 1][itemHeightOrWidth] * moveFactor) {
                me.currentIndex++;
                me.switchItems(index, me.currentIndex);
            }
        }

        me.isOverDragging = isOverDragging && me.currentIndex !== 0 && me.currentIndex !== maxItems;

        if (me.isOverDragging) {
            await me.timeout(30); // wait for 1 frame

            if (me.isOverDragging) {
                await me.onDragMove(data);
            }
        }
    }

    /**
     * @param {Object} data
     */
    async onDragStart(data) {
        let me           = this,
            draggedPanel = Neo.getComponent(data.path[1].id),
            {owner}      = me,
            itemStyles   = me.itemStyles = [],
            {layout}     = owner,
            ownerStyle   = owner.style || {},
            index, itemStyle, rect;

        me.sortableItems = owner.items.filter(item => item.isPanel);

        if (owner.sortable && draggedPanel) {
            index = me.sortableItems.indexOf(draggedPanel);

            // Get all the rects BEFORE moving anything.
            const allRects = await owner.getDomRect([owner.id].concat(me.sortableItems.map(e => e.id)));

            me.ownerRect = allRects.shift();
            let itemRects = allRects;

            Object.assign(me, {
                currentIndex           : index,
                dragElement            : draggedPanel.vdom,
                dragProxyConfig        : {
                    ...me.dragProxyConfig,
                    cls: owner.cls.filter(c => c !== 'colors-viewport')
                },
                ownerStyle             : {height: ownerStyle.height, minWidth: ownerStyle.minWidth, width: ownerStyle.width},
                reversedLayoutDirection: layout.direction === 'column-reverse' || layout.direction === 'row-reverse',
                sortDirection          : layout.direction?.includes('column') ? 'vertical' : 'horizontal',
                startIndex             : index
            });

            await me.dragStart(data);

            me.sortableItems.forEach((item, i) => {
                itemStyles.push({
                    height: item.height ? `${item.height}px` : item.style?.height,
                    width : item.width ? `${item.width}px` : item.style?.width
                });
            });

            owner.style  = {
                ...ownerStyle,
                height  : `${me.ownerRect.height}px`,
                minWidth: `${me.ownerRect.width}px`,
                width   : `${me.ownerRect.width}px`
            };

            me.itemRects = itemRects;
            me.slotRects = Neo.clone(itemRects, true);

            if (itemRects.length > 1) {
                me.itemMargin = itemRects[1].top - itemRects[0].bottom;
            } else {
                me.itemMargin = 0;
            }

            me.sortableItems.forEach((item, i) => {
                itemStyle         = item.wrapperStyle || {};
                rect              = itemRects[i];
                item.wrapperStyle = Object.assign(itemStyle, {
                    height  : `${rect.height}px`,
                    left    : `${rect.left}px`,
                    margin  : 0,
                    position: 'absolute',
                    top     : `${rect.top}px`,
                    width   : `${rect.width}px`
                });
            });

            me.timeout(5).then(() => {
                itemStyle                 = draggedPanel.wrapperStyle || {};
                itemStyle.visibility      = 'hidden';
                draggedPanel.wrapperStyle = itemStyle;
            });
        }
    }

    /**
     * @param {Number} fromIndex
     * @param {Number} toIndex
     */
    switchItems(fromIndex, toIndex) {
        let me = this;

        NeoArray.move(me.sortableItems, fromIndex, toIndex);
        NeoArray.move(me.itemRects,    fromIndex, toIndex);

        // Reposition all items according to the original slots
        me.sortableItems.forEach((item, index) => {
            let slotRect = me.slotRects[index];
            me.updateItem(item, slotRect);
        });
    }

    /**
     * @param {Neo.component.Base} item
     * @param {Object} rect
     */
    updateItem(item, rect) {
        let {wrapperStyle} = item;

        wrapperStyle.left = `${rect.x}px`; // Use rect.x
        wrapperStyle.top  = `${rect.y}px`;  // Use rect.y

        item.wrapperStyle = wrapperStyle;
    }
}

export default Neo.setupClass(DashboardSortZone);