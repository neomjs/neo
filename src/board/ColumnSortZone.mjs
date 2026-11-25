import NeoArray    from '../util/Array.mjs';
import SortZone    from '../draggable/container/SortZone.mjs';
import TreeBuilder from '../util/vdom/TreeBuilder.mjs';

/**
 * @summary Reorders unlocked board columns horizontally by dragging their header (`sortGroup: 'board-columns'`),
 * committing once through `owner.moveColumn(fromIndex, toIndex)`.
 * @description Sorts `owner.items` horizontally in single-row mode (`!owner.laneField`) using
 * `.neo-board-column-header` as the drag handle while ignoring `.neo-board-column-collapse`. Columns with
 * `locked: true` are excluded from {@link #getSortableItems} and stay pinned at their index via {@link #getPinnedItems}
 * while unlocked columns reorder around them; the drag proxy clones the whole dragged column, its header and its
 * rendered cards, via {@link #getDragElement}.
 * @class Neo.board.ColumnSortZone
 * @extends Neo.draggable.container.SortZone
 */
class ColumnSortZone extends SortZone {
    static config = {
        /**
         * @member {String} className='Neo.board.ColumnSortZone'
         * @protected
         */
        className: 'Neo.board.ColumnSortZone',
        /**
         * @member {String} ntype='board-column-sortzone'
         * @protected
         */
        ntype: 'board-column-sortzone',
        /**
         * Column rects are owner-relative while pinned during the drag
         * @member {Boolean} adjustItemRectsToParent=true
         */
        adjustItemRectsToParent: true,
        /**
         * Only the column header initiates a column drag
         * @member {String} dragHandleSelector='.neo-board-column-header'
         */
        dragHandleSelector: '.neo-board-column-header',
        /**
         * @member {Boolean} enableProxyToPopup=false
         */
        enableProxyToPopup: false,
        /**
         * Clicking or dragging the collapse button must never start a column drag
         * @member {String} ignoreDragSelector='.neo-board-column-collapse'
         */
        ignoreDragSelector: '.neo-board-column-collapse',
        /**
         * @member {Boolean} moveVertical=false
         */
        moveVertical: false,
        /**
         * @member {Boolean} positionOwnerRelative=true
         */
        positionOwnerRelative: true,
        /**
         * @member {String} sortDirection='horizontal'
         */
        sortDirection: 'horizontal',
        /**
         * @member {String} sortGroup='board-columns'
         */
        sortGroup: 'board-columns',
        /**
         * Preserves the board's true rect even when the first column is locked
         * @member {Boolean} useItemSortBoundary=true
         */
        useItemSortBoundary: true
    }

    /**
     * @summary Arms or disarms each unlocked column's header as a drag target and syncs main-thread zone registration.
     * @param {Boolean} draggable
     */
    adjustItemCls(draggable) {
        super.adjustItemCls(draggable);

        this.owner?.items?.forEach(column => this.armColumn(column, draggable))
    }

    /**
     * @summary Re-registers armed column headers when the zone's `windowId` changes.
     * @param {Number|null} value
     * @param {Number|null} oldValue
     * @protected
     */
    afterSetWindowId(value, oldValue) {
        super.afterSetWindowId(value, oldValue);

        value && this.adjustItemCls(this.isResortable())
    }

    /**
     * @summary Marks or unmarks one column's header as a native drag target without marking locked columns or the
     * column body. Registers the header root id with `DragDrop` so header drags resolve to this zone while card drags
     * resolve to `Neo.board.SortZone`.
     * @param {Neo.board.Column} column
     * @param {Boolean} [draggable=true]
     */
    armColumn(column, draggable=true) {
        let me       = this,
            {header} = column || {},
            enabled  = Boolean(draggable && me.isResortable() && !me.owner?.laneField && column?.body && !column?.locked),
            cls;

        if (!header || !column?.body) {
            return
        }

        cls = header.cls || [];
        NeoArray.toggle(cls, 'neo-draggable', enabled);
        header.cls = cls;

        if (Neo.main?.addon?.DragDrop) {
            if (enabled) {
                Neo.main.addon.DragDrop.registerZone?.({
                    appName          : me.appName,
                    dragElementRootId: header.id,
                    dragZoneId       : me.id,
                    windowId         : me.windowId
                })
            } else {
                Neo.main.addon.DragDrop.unregisterZone?.({
                    appName          : me.appName,
                    dragElementRootId: header.id,
                    windowId         : me.windowId
                })
            }
        }
    }

    /**
     * @summary Returns the dragged column's whole tree, its header and the cards it renders, so the drag proxy
     * carries the column. A windowed column's tree holds only its rendered cards.
     * @param {Neo.board.Column} draggedItem
     * @returns {Object}
     * @protected
     */
    getDragElement(draggedItem) {
        return TreeBuilder.getVdomTree(draggedItem.vdom)
    }

    /**
     * @summary Keys the main-thread zone registry on the column header, so card drags inside the column keep their
     * own zone. The proxy's pointer offset and its clamp inside the board come from the carried column, not from the
     * pressed header, which sits inside the column's border and is a fraction of its height.
     * @param {Object} data The `drag:start` data
     * @param {Object} rect The dragged column's rect
     * @returns {Object}
     * @protected
     */
    getMainThreadConfigs(data, rect) {
        return {
            ...super.getMainThreadConfigs(data, rect),
            dragElementRootId: this.dragComponent.header.id,
            dragProxyRect    : rect,
            offsetX          : data.clientX - rect.left,
            offsetY          : data.clientY - rect.top
        }
    }

    /**
     * @summary Returns all board columns in `owner.items` order so locked columns stay pinned at their visual slot
     * while unlocked columns reorder around them.
     * @param {Object[]} [ownerItems=this.owner.items]
     * @param {Neo.component.Base[]} [sortableItems=this.sortableItems]
     * @returns {Neo.component.Base[]}
     * @protected
     */
    getPinnedItems(ownerItems=this.owner.items, sortableItems=this.sortableItems) {
        return ownerItems
    }

    /**
     * @summary Includes the span of any locked column sitting between `index` and `neighbour` so the switch threshold
     * matches the distance the dragged column jumps across locked columns.
     * @param {Number} index
     * @param {Number} neighbour
     * @returns {Number}
     */
    getSwitchExtent(index, neighbour) {
        let me = this;

        if (Math.abs(me.indexMap[index] - me.indexMap[neighbour]) <= 1) {
            return super.getSwitchExtent(index, neighbour)
        }

        const
            leftRect  = me.itemRects[Math.min(index, neighbour)],
            rightRect = me.itemRects[Math.max(index, neighbour)],
            gap       = rightRect.x - (leftRect.x + leftRect.width);

        return me.itemRects[neighbour].width + gap
    }

    /**
     * @summary Admits only unlocked columns that carry the column header handle while single-row column resorting is enabled.
     * @param {*} item
     * @returns {Boolean}
     */
    isDraggableItem(item) {
        return Boolean(this.isResortable() && !this.owner.laneField && item?.header && item.body && !item.locked && super.isDraggableItem(item))
    }

    /**
     * @summary Columns drag on the board's `columnsResortable`, independent of `dragResortable`, which drags its cards.
     * @returns {Boolean}
     */
    isResortable() {
        return Boolean(this.owner?.columnsResortable)
    }

    /**
     * @summary Commits the column reorder through `owner.moveColumn(fromIndex, toIndex)`.
     * @param {Number} fromIndex
     * @param {Number} toIndex
     */
    moveTo(fromIndex, toIndex) {
        this.owner.moveColumn(fromIndex, toIndex)
    }

    /**
     * @summary Ignores `drag:end` events from card drags when no column drag is active or starting, and duplicate
     * deliveries while {@link #processDragEnd} is already in flight.
     * @param {Object} data
     */
    async onDragEnd(data) {
        if ((!this.dragComponent && !this.dragStarting) || this.dragEndActive) {
            return
        }

        await super.onDragEnd(data)
    }

    /**
     * @summary Runs the horizontal sort while a column drag is active or queued to start.
     * @param {Object} data
     */
    async onDragMove(data) {
        if ((!this.dragComponent && !this.dragStartPending) || !this.isResortable()) {
            return
        }

        await super.onDragMove(data)
    }

    /**
     * @summary Arms newly inserted columns when `columnsResortable` is enabled.
     * @param {Object} data
     */
    onItemInsert(data) {
        super.onItemInsert(data);

        const items = Array.isArray(data.item) ? data.item : [data.item];
        items.forEach(item => this.armColumn(item, this.isResortable()))
    }
}

export default Neo.setupClass(ColumnSortZone);
