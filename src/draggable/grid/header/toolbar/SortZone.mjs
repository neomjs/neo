import BaseSortZone from '../../../container/SortZone.mjs';
import VdomUtil from '../../../../util/VDom.mjs';

/**
 * @summary Manages drag-and-drop column reordering for Grids.
 *
 * This class handles the complexity of visualizing column moves in a highly optimized, multi-threaded environment.
 *
 * **Key Architectural Patterns:**
 *
 * 1.  **Surgical DOM Move (High-Fidelity Proxy):**
 *     For component-based columns (e.g., Sparklines using OffscreenCanvas), creating clones for the drag proxy
 *     is expensive and breaks context. Instead, this class uses `Neo.applyDeltas` to temporarily *move* the
 *     live DOM content (the first child of the cell) from the Grid into the Proxy. This preserves the
 *     component's state and canvas context without overhead. The content is restored to the Grid on drop.
 *
 * 2.  **Disjoint Updates (Deep Refresh):**
 *     The Grid uses disjoint `Neo.grid.Row` components which update silently. To ensure the Grid body
 *     reflects drag operations (like hiding the original column or shuffling cells), this class forces
 *     a deep update (`updateDepth: -1`) on the `Grid.Body`. This flushes the state of all Row components
 *     to the VDOM worker in a single batch.
 *
 * @class Neo.draggable.grid.header.toolbar.SortZone
 * @extends Neo.draggable.container.SortZone
 */
class SortZone extends BaseSortZone {
    static config = {
        /**
         * @member {String} className='Neo.draggable.grid.header.toolbar.SortZone'
         * @protected
         */
        className: 'Neo.draggable.grid.header.toolbar.SortZone',
        /**
         * @member {String} ntype='grid-header-toolbar-sortzone'
         * @protected
         */
        ntype: 'grid-header-toolbar-sortzone',
        /**
         * @member {String|null} itemMargin='1px'
         * @protected
         */
        itemMargin: '1px',
        /**
         * @member {Boolean} moveColumnContent=true
         */
        moveColumnContent: true,
        /**
         * @member {Boolean} moveVertical=false
         */
        moveVertical: false
    }

    /**
     * Resolves the `grid.Body` paired with this SortZone's owner header toolbar, keyed by the
     * toolbar's `layoutLock` region. The prior single `grid.body` lookup only saw the center body,
     * so locked-column cells — which live in the start / end bodies — were missed once the grid
     * split into separate locked-start / center / locked-end bodies. Mirrors the body resolution
     * in `grid.header.Toolbar`.
     * @returns {Neo.grid.Body}
     */
    get gridBody() {
        let {gridContainer, layoutLock} = this.owner;

        if (layoutLock === 'start') return gridContainer.bodyStart;
        if (layoutLock === 'end')   return gridContainer.bodyEnd;
        return gridContainer.body
    }

    /**
     * @summary Resolves the target lock-region for a column drop by mapping the release x-coordinate
     * against the locked-start / locked-end body x-ranges.
     *
     * The neighbor-based inference in {@link #onDragEnd} keys within-region resorting off the dragged
     * column's siblings, but a cross-toolbar drag (e.g. center → locked-start) is keyed by *where* the
     * pointer is released, not by neighbors. This maps the release x-coordinate to the region whose body
     * it falls within; anything outside the locked bodies resolves to the center (unlocked) region.
     *
     * @param {Number}      dropX             Pointer x-coordinate at release (client space).
     * @param {Object}      regionRects       Per-region client rects; either side may be null when absent.
     * @param {Object|null} regionRects.start Locked-start body rect (`{left, right}`) or null.
     * @param {Object|null} regionRects.end   Locked-end body rect (`{left, right}`) or null.
     * @returns {'start'|'end'|null}          Target lock region, or null for the center (unlocked) region.
     */
    getDropRegion(dropX, regionRects) {
        let {start, end} = regionRects;

        if (start && dropX >= start.left && dropX <= start.right) return 'start';
        if (end   && dropX >= end.left   && dropX <= end.right)   return 'end';

        return null
    }

    /**
     * @param {Neo.util.Rectangle} rect
     * @param {Neo.util.Rectangle} parentRect
     */
    adjustProxyRectToParent(rect, parentRect) {
        rect.x = rect.x - parentRect.x - 1;
        rect.y = rect.y - parentRect.y - 1
    }

    /**
     * Creates the drag proxy.
     *
     * **Surgical DOM Move Implementation:**
     * Detects if a cell contains component content (checking `cell.cn`). If found, it creates an empty
     * container in the proxy's VDOM and schedules a `moveNode` delta to transfer the live content
     * from the Grid to the Proxy after mounting. This bypasses VDOM cloning for heavy components.
     *
     * @param {Object}  data
     * @param {Boolean} createComponent=true
     * @returns {Object|Neo.draggable.DragProxyComponent}
     */
    async createDragProxy(data, createComponent = true) {
        if (!this.moveColumnContent) {
            return await super.createDragProxy(data, createComponent)
        }

        let me = this,
            grid = me.owner.gridContainer,
            body = me.gridBody,
            viewId = Neo.getId('grid-view'),
            columnIndex = me.dragElement['aria-colindex'] - 1,
            { dataField } = body.columnPositions.getAt(columnIndex),
            cells = body.getColumnCells(dataField),
            rows = [],
            config = await super.createDragProxy(data, false),
            rect = await grid.getDomRect(),
            row, rowComponent;

        config.cls = ['neo-grid-container', me.owner.getTheme()];

        config.style.height = `${rect.height - 2}px`; // minus border-bottom & border-top

        let moveDeltas = [],
            proxyCell, proxyCellId;

        me.movedComponents = [];

        cells.forEach((cell, index) => {
            rowComponent = body.items[index];

            row = VdomUtil.clone({ // clone to remove ids
                cls: rowComponent.vdom.cls,
                style: rowComponent.vdom.style
            });

            proxyCell = VdomUtil.clone(cell);
            delete proxyCell.id;
            delete proxyCell.style.left;

            proxyCellId = Neo.getId('proxy-cell');
            proxyCell.id = proxyCellId;

            if (cell.cn && cell.cn.length > 0) {
                let content = cell.cn[0],
                    contentId = content.id || content.componentId;

                if (contentId) {
                    proxyCell.cn = [];

                    moveDeltas.push({
                        action: 'moveNode',
                        id: contentId,
                        index: 0,
                        parentId: proxyCellId
                    });

                    me.movedComponents.push({
                        id: contentId,
                        originalParentId: cell.id
                    })
                }
            }

            row.cn = [proxyCell];
            rows.push(row)
        });

        config.vdom =
        {
            cn: [
                {
                    cls: ['neo-grid-container', ...grid.cls], cn: [
                        { ...config.vdom, cls: ['neo-grid-header-toolbar', 'neo-toolbar'] },
                        {
                            cls: ['neo-grid-view'], id: viewId, cn: [
                                { cls: ['neo-grid-body'], cn: rows },
                                { cls: ['neo-grid-scrollbar'], style: { height: body.vdom.height } }
                            ]
                        }
                    ]
                }
            ]
        };

        config.listeners = {
            mounted() {
                Neo.main.DomAccess.scrollTo({
                    id: viewId,
                    value: body.scrollTop,
                    windowId: me.windowId
                });

                if (moveDeltas.length > 0) {
                    Neo.applyDeltas(me.windowId, moveDeltas)
                }
            }
        };

        if (createComponent) {
            return me.dragProxy = Neo.create(config)
        }

        return config
    }

    /**
     * @param {Number} fromIndex
     * @param {Number} toIndex
     */
    moveTo(fromIndex, toIndex) {
        super.moveTo(fromIndex, toIndex);
        this.owner.gridContainer.columns.move(fromIndex, toIndex)
    }

    /**
     * @param {Object} data
     */
    async onDragEnd(data) {
        let me = this;

        // Avoid conflicts with grid.header.plugin.Resizable
        if (!me.owner.dragResortable) return;

        // Restore moved nodes BEFORE destroying the proxy to ensure they return to the Grid.
        if (me.movedComponents?.length > 0) {
            let restoreDeltas = me.movedComponents.map(item => ({
                action: 'moveNode',
                id: item.id,
                index: 0,
                parentId: item.originalParentId
            }));

            await Neo.applyDeltas(me.windowId, restoreDeltas);
            me.movedComponents = null
        }

        await super.onDragEnd(data);

        if (!me.dragElement) {
            return
        }

        let { owner } = me,
            grid = owner.gridContainer,
            { columns } = grid,
            toIndex = me.dragElement['aria-colindex'] - 1,
            column = columns.getAt(toIndex),
            prevCol = toIndex > 0 ? columns.getAt(toIndex - 1) : null,
            nextCol = toIndex < columns.count - 1 ? columns.getAt(toIndex + 1) : null,
            newLocked = null;

        // Inference logic: Default to unlocked unless completely surrounded by a locked zone
        // or placed at the absolute outer edge of a locked zone.
        if (prevCol?.locked === 'start' && nextCol?.locked === 'start') {
            newLocked = 'start'
        } else if (prevCol?.locked === 'end' && nextCol?.locked === 'end') {
            newLocked = 'end'
        } else if (toIndex === 0 && nextCol?.locked === 'start') {
            newLocked = 'start'
        } else if (toIndex === columns.count - 1 && prevCol?.locked === 'end') {
            newLocked = 'end'
        }

        // Cross-toolbar: a release over a different region's body is the direct lock-region
        // signal and supersedes the neighbor inference for cross-region moves. Within-region drops
        // resolve to the column's existing region, so the neighbor-based path above is preserved.
        if (Neo.isNumber(me.lastDragClientX) && (grid.bodyStart || grid.bodyEnd)) {
            let bodyStartRect = grid.bodyStart ? await grid.bodyStart.getDomRect() : null,
                bodyEndRect   = grid.bodyEnd   ? await grid.bodyEnd.getDomRect()   : null,
                positionRegion = me.getDropRegion(me.lastDragClientX, {start: bodyStartRect, end: bodyEndRect});

            if (positionRegion !== column.locked) {
                newLocked = positionRegion
            }
        }

        me.lastDragClientX = null;

        if (column.locked !== newLocked) {
            // This implicitly triggers grid.Container#onColumnLockChange,
            // which handles sorting, DOM syncing, and layout calculations.
            column.locked = newLocked
        } else {
            owner.items.forEach((item, index) => {
                item.vdom['aria-colindex'] = index + 1 // 1 based
            });

            owner.updateDepth = 2;
            owner.update();

            await owner.passSizeToBody();

            await this.timeout(20);

            me.gridBody.createViewData(false, true)
        }
    }

    /**
     * @param {Object} data
     */
    async onDragMove(data) {
        let me = this;

        // Avoid conflicts with grid.header.plugin.Resizable
        if (!me.owner.dragResortable) return;

        // Track the release x-coordinate so onDragEnd can resolve the cross-toolbar drop region.
        me.lastDragClientX = data.clientX;

        await super.onDragMove(data)
    }

    /**
     * @param {Object} data
     */
    async onDragStart(data) {
        let me = this;

        // Avoid conflicts with grid.header.plugin.Resizable
        if (!me.owner.dragResortable) return;

        await super.onDragStart(data);

        if (me.dragComponent && me.moveColumnContent) {
            let body = me.gridBody,
                columnIndex = me.dragElement['aria-colindex'] - 1,
                columnPosition = body.columnPositions.getAt(columnIndex),
                { dataField } = columnPosition,
                cells = body.getColumnCells(dataField);

            columnPosition.hidden = true;

            cells.forEach(cell => {
                cell.style.visibility = 'hidden'
            });

            // Force a deep update to propagate Row component VDOM changes (visibility) to the worker.
            body.updateDepth = -1;
            body.update()
        }
    }

    /**
     * @param {Number} index1
     * @param {Number} index2
     */
    switchItems(index1, index2) {
        super.switchItems(index1, index2);

        if (this.moveColumnContent) {
            let me = this,
                { itemRects } = me,
                body = me.gridBody,
                { columnPositions } = body,
                column1Position = columnPositions.getAt(index1),
                column2Position = columnPositions.getAt(index2),
                column1Cells = body.getColumnCells(column1Position.dataField),
                column2Cells = body.getColumnCells(column2Position.dataField);

            Object.assign(column1Position, {
                width: itemRects[index2].width,
                x: itemRects[index2].x + 1
            });

            Object.assign(column2Position, {
                width: itemRects[index1].width,
                x: itemRects[index1].x + 1
            });

            columnPositions.move(index1, index2);

            column1Cells.forEach(node => {
                node.style.left = column1Position.x + 'px';
                node.style.width = column1Position.width + 'px'
            });

            column2Cells.forEach(node => {
                node.style.left = column2Position.x + 'px';
                node.style.width = column2Position.width + 'px'
            });

            // Force a deep update to propagate Row component VDOM changes (position) to the worker.
            body.updateDepth = -1;
            body.update()
        }
    }
}

export default Neo.setupClass(SortZone);
