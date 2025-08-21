import NeoArray from '../../util/Array.mjs';
import SortZone from '../container/SortZone.mjs';

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
        ntype: 'dashboard-sortzone'
    }

    /**
     * We must provide a moveTo method because the base class calls owner.moveTo()
     * which does not exist. This method correctly moves the panel within the
     * owner's (viewport's) items array.
     * @param {Number} fromIndex
     * @param {Number} toIndex
     */
    moveTo(fromIndex, toIndex) {
        const itemToMove      = this.sortableItems[fromIndex];
        const ownerFromIndex  = this.owner.items.indexOf(itemToMove);
        const landingItem     = this.sortableItems[toIndex];
        const ownerToIndex    = this.owner.items.indexOf(landingItem);

        NeoArray.move(this.owner.items, ownerFromIndex, ownerToIndex);
    }

    /**
     * We must override onDragEnd because the base class resets styles on all
     * owner.items, which would break our non-sortable toolbar.
     * @param {Object} data
     */
    async onDragEnd(data) {
        let me = this;

        await me.timeout(10);

        if (me.owner.sortable) {
            me.owner.style = { ...me.owner.style, ...me.ownerStyle };

            me.sortableItems.forEach((item, index) => {
                item.wrapperStyle = {
                    ...item.wrapperStyle,
                    height    : me.itemStyles[index].height || null,
                    left      : null,
                    margin    : null,
                    position  : null,
                    top       : null,
                    width     : me.itemStyles[index].width || null,
                    visibility: null
                };
            });

            if (me.startIndex !== me.currentIndex) {
                me.moveTo(me.startIndex, me.currentIndex);
            }

            Object.assign(me, { currentIndex: -1, itemRects: null, itemStyles: null, ownerRect: null, slotRects: null, startIndex: -1 });

            await me.timeout(30);
            me.dragEnd(data);
        }
    }

    /**
     * We must override onDragStart completely because the base class assumes:
     * 1. The clicked element is the item to drag (we click a header to drag a panel).
     * 2. All owner.items are sortable (we have a non-sortable toolbar).
     * This version correctly identifies the panel to drag and measures the geometry
     * of only the sortable panel items *before* the drag operation starts.
     * @param {Object} data
     */
    async onDragStart(data) {
        let me           = this,
            draggedPanel = Neo.getComponent(data.path[1].id),
            {owner}      = me,
            itemStyles   = me.itemStyles = [],
            {layout}     = owner,
            ownerStyle   = owner.style || {};

        me.sortableItems = owner.items.filter(item => item.isPanel);

        if (owner.sortable && draggedPanel && me.sortableItems.includes(draggedPanel)) {
            const index = me.sortableItems.indexOf(draggedPanel);

            const allRects = await owner.getDomRect([owner.id].concat(me.sortableItems.map(e => e.id)));

            me.ownerRect  = allRects.shift();
            let itemRects = allRects;

            Object.assign(me, {
                currentIndex           : index,
                dragElement            : draggedPanel.vdom,
                dragProxyConfig        : { ...me.dragProxyConfig, cls: owner.cls.filter(c => c !== 'colors-viewport') },
                itemRects              : itemRects,
                ownerStyle             : { height: ownerStyle.height, minWidth: ownerStyle.minWidth, width: ownerStyle.width },
                reversedLayoutDirection: layout.direction === 'column-reverse' || layout.direction === 'row-reverse',
                sortDirection          : 'vertical',
                startIndex             : index
            });

            me.slotRects = Neo.clone(itemRects, true);

            if (itemRects.length > 1) {
                me.itemMargin = itemRects[1].top - itemRects[0].bottom;
            } else {
                me.itemMargin = 0;
            }

            me.sortableItems.forEach(item => {
                itemStyles.push({
                    height: item.height ? `${item.height}px` : item.style?.height,
                    width : item.width ? `${item.width}px` : item.style?.width
                });
            });

            await me.dragStart(data);

            owner.style = { ...ownerStyle, height: `${me.ownerRect.height}px`, minWidth: `${me.ownerRect.width}px`, width: `${me.ownerRect.width}px` };

            me.sortableItems.forEach((item, i) => {
                const rect = itemRects[i];
                item.wrapperStyle = {
                    ...item.wrapperStyle,
                    height  : `${rect.height}px`,
                    left    : `${rect.left}px`,
                    margin  : 0,
                    position: 'absolute',
                    top     : `${rect.top}px`,
                    width   : `${rect.width}px`
                };
            });

            me.timeout(5).then(() => {
                draggedPanel.wrapperStyle = { ...draggedPanel.wrapperStyle, visibility: 'hidden' };
            });
        }
    }

    /**
     * We must override switchItems because the base class logic is not compatible.
     * This version uses the clean `slotRects` created in onDragStart to guarantee
     * that items move to the correct, original positions, preserving gaps.
     * @param {Number} fromIndex
     * @param {Number} toIndex
     */
    switchItems(fromIndex, toIndex) {
        console.log('switchItems', fromIndex, toIndex);
        let me = this;

        NeoArray.move(me.sortableItems, fromIndex, toIndex);
        NeoArray.move(me.itemRects,    fromIndex, toIndex);

        me.sortableItems.forEach((item, index) => {
            me.updateItem(item, me.slotRects[index]);
        });
    }

    /**
     * We must override updateItem because the base class assumes a simple
     * index map into owner.items. This version updates the passed-in item directly.
     * @param {Neo.component.Base} item
     * @param {Object} rect
     */
    updateItem(item, rect) {
        item.wrapperStyle = {
            ...item.wrapperStyle,
            left: `${rect.left}px`,
            top : `${rect.top}px`
        };
    }
}

export default Neo.setupClass(DashboardSortZone);
