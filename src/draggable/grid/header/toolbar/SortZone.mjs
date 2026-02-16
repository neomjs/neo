import BaseSortZone from '../../../container/SortZone.mjs';
import VdomUtil     from  '../../../../util/VDom.mjs';

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
    async createDragProxy(data, createComponent=true) {
        if (!this.moveColumnContent) {
            return await super.createDragProxy(data, createComponent)
        }

        let me            = this,
            grid          = me.owner.parent,
            {body}        = grid,
            bodyWrapperId = Neo.getId('grid-body-wrapper'),
            columnIndex   = me.dragElement['aria-colindex'] - 1,
            {dataField}   = body.columnPositions.getAt(columnIndex),
            cells         = body.getColumnCells(dataField),
            rows          = [],
            config        = await super.createDragProxy(data, false),
            rect          = await grid.getDomRect(),
            row, rowComponent;

        config.cls = ['neo-grid-wrapper', me.owner.getTheme()];

        config.style.height = `${rect.height - 2}px`; // minus border-bottom & border-top

        let moveDeltas = [],
            proxyCell, proxyCellId;

        me.movedComponents = [];

        cells.forEach((cell, index) => {
            rowComponent = body.items[index];

            row = VdomUtil.clone({ // clone to remove ids
                cls  : rowComponent.vdom.cls,
                style: rowComponent.vdom.style
            });

            proxyCell = VdomUtil.clone(cell);
            delete proxyCell.id;
            delete proxyCell.style.left;

            proxyCellId  = Neo.getId('proxy-cell');
            proxyCell.id = proxyCellId;

            if (cell.cn && cell.cn.length > 0) {
                let content   = cell.cn[0],
                    contentId = content.id || content.componentId;

                if (contentId) {
                    proxyCell.cn = [];

                    moveDeltas.push({
                        action  : 'moveNode',
                        id      : contentId,
                        index   : 0,
                        parentId: proxyCellId
                    });

                    me.movedComponents.push({
                        id              : contentId,
                        originalParentId: cell.id
                    })
                }
            }

            row.cn = [proxyCell];
            rows.push(row)
        });

        config.vdom =
        {cn: [
            {cls: ['neo-grid-container', ...grid.cls], cn: [
                {...config.vdom, cls: ['neo-grid-header-toolbar', 'neo-toolbar']},
                {cls: ['neo-grid-body-wrapper'], id: bodyWrapperId, cn: [
                    {cls: ['neo-grid-body'], cn: rows},
                    {cls: ['neo-grid-scrollbar'], style: {height: body.vdom.cn[0].height}}
                ]}
            ]}
        ]};

        config.listeners = {
            mounted() {
                Neo.main.DomAccess.scrollTo({
                    id      : bodyWrapperId,
                    value   : body.scrollTop,
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
        this.owner.parent.columns.move(fromIndex, toIndex)
    }

    /**
     * @param {Object} data
     */
    async onDragEnd(data) {
        // Restore moved nodes BEFORE destroying the proxy to ensure they return to the Grid.
        if (this.movedComponents?.length > 0) {
            let restoreDeltas = this.movedComponents.map(item => ({
                action  : 'moveNode',
                id      : item.id,
                index   : 0,
                parentId: item.originalParentId
            }));

            await Neo.applyDeltas(this.windowId, restoreDeltas);
            this.movedComponents = null
        }

        await super.onDragEnd(data);

        let {owner} = this;

        owner.items.forEach((item, index) => {
            item.vdom['aria-colindex'] = index + 1; // 1 based
        });

        owner.updateDepth = 2;
        owner.update();

        await owner.passSizeToBody();

        await this.timeout(20);

        owner.parent.body.createViewData(false, true)
    }

    /**
     * @param {Object} data
     */
    async onDragStart(data) {
        await super.onDragStart(data);

        if (this.moveColumnContent) {
            let me             = this,
                {body}         = me.owner.parent,
                columnIndex    = me.dragElement['aria-colindex'] - 1,
                columnPosition = body.columnPositions.getAt(columnIndex),
                {dataField}    = columnPosition,
                cells          = body.getColumnCells(dataField);

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
            let me                = this,
                {itemRects}       = me,
                {body}            = me.owner.parent,
                {columnPositions} = body,
                column1Position   = columnPositions.getAt(index1),
                column2Position   = columnPositions.getAt(index2),
                column1Cells      = body.getColumnCells(column1Position.dataField),
                column2Cells      = body.getColumnCells(column2Position.dataField);

            Object.assign(column1Position, {
                width: itemRects[index2].width,
                x    : itemRects[index2].x + 1
            });

            Object.assign(column2Position, {
                width: itemRects[index1].width,
                x    : itemRects[index1].x + 1
            });

            columnPositions.move(index1, index2);

            column1Cells.forEach(node => {
                node.style.left  = column1Position.x     + 'px';
                node.style.width = column1Position.width + 'px'
            });

            column2Cells.forEach(node => {
                node.style.left  = column2Position.x     + 'px';
                node.style.width = column2Position.width + 'px'
            });

            // Force a deep update to propagate Row component VDOM changes (position) to the worker.
            body.updateDepth = -1;
            body.update()
        }
    }
}

export default Neo.setupClass(SortZone);
