import Component from '../component/Base.mjs';
import NeoArray  from '../util/Array.mjs';

/**
 * @summary Represents a single visible row in the Grid.
 *
 * `Neo.grid.Row` is a specialized component designed for the **Row Pooling** architecture.
 * It is NOT destroyed when a record scrolls off-screen. Instead, it is **recycled**:
 * its `record` and `rowIndex` configs are updated to display new data.
 *
 * **Full Pool Rendering Strategy:**
 * To ensure O(1) scrolling performance and eliminate Garbage Collection (GC) pauses, this class
 * implements a "Full Pool Rendering" strategy for cell content. It renders a stable, fixed-size
 * array of cell nodes matching `gridBody.cellPoolSize`.
 *
 * - **Active Cells:** Cells corresponding to visible columns are rendered with content.
 * - **Inactive Cells:** Slots in the pool not currently needed by a column are rendered as
 *   lightweight placeholders (`display: none`).
 *
 * This guarantees that the VDOM structure (the number and order of child nodes) *never changes*
 * during horizontal scrolling. The browser only processes efficient attribute updates (style, content),
 * with **zero** DOM node insertions, removals, or reordering operations.
 *
 * **Split Dataset Strategy:**
 * To support the Fixed-DOM-Order strategy and robust event delegation, this class renders split data attributes
 * instead of composite IDs:
 *
 * - `data-record-id`: The stable ID of the record currently bound to this row.
 * - `data-field`: The data field name of the column (for cells).
 *
 * This avoids the need for fragile string parsing (e.g. `split('__')`) in event handlers.
 *
 * Key Responsibilities:
 * -   **Cell Rendering:** Generates the VDOM for all cells in the row based on the columns config.
 * -   **Granular Updates:** When a bound record changes, only this specific Row instance updates its VDOM, avoiding a full Grid re-render.
 * -   **Component Management:** Manages the lifecycle of cell components (e.g., Sparklines, Widgets) defined in `Neo.grid.column.Component`.
 *
 * @class Neo.grid.Row
 * @extends Neo.component.Base
 * @see Neo.grid.Body
 */
class Row extends Component {
    static config = {
        /**
         * @member {String} className='Neo.grid.Row'
         * @protected
         */
        className: 'Neo.grid.Row',
        /**
         * @member {String} ntype='grid-row'
         * @protected
         */
        ntype: 'grid-row',
        /**
         * @member {String[]} baseCls=['neo-grid-row']
         * @protected
         */
        baseCls: ['neo-grid-row'],
        /**
         * @member {Object|null} record=null
         */
        record: null,
        /**
         * @member {Number|null} rowIndex=null
         */
        rowIndex: null,
        /**
         * @member {Number} updateDepth=-1
         */
        updateDepth: -1,
        /**
         * @member {Object} _vdom={cn: []}
         */
        _vdom:
        {cn: []}
    }

    /**
     * Triggered after the mounted config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetMounted(value, oldValue) {
        super.afterSetMounted(value, oldValue);

        if (this.components) {
            for (const key in this.components) {
                this.components[key].mounted = value
            }
        }
    }

    /**
     * Triggered after the theme config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetTheme(value, oldValue) {
        super.afterSetTheme(value, oldValue);

        if (this.components) {
            for (const key in this.components) {
                this.components[key].theme = value
            }
        }
    }

    /**
     * Generates the VDOM configuration for a single cell.
     *
     * @param {Object} data
     * @param {String} [data.cellId]
     * @param {Object} data.column
     * @param {Number} data.columnIndex
     * @param {Boolean} [data.isLastColumn] True if this is the visually last column (for border styling).
     * @param {Object} data.record
     * @param {Number} data.rowIndex
     * @param {Boolean} [data.silent]
     * @returns {Object} VDOM object for the cell
     */
    applyRendererOutput({cellId, column, columnIndex, isLastColumn, record, rowIndex, silent}) {
        let me                     = this,
            gridContainer          = me.parent.parent, // Row -> Body -> GridContainer
            gridBody               = me.parent,
            {selectedCells, store} = gridBody,
            cellCls                = ['neo-grid-cell'],
            colspan                = record[gridBody.colspanField],
            {dataField}            = column,
            recordId               = gridBody.getRecordId(record),
            logicalCellId          = gridBody.getLogicalCellId(record, dataField),
            fieldValue             = record.get(dataField),
            cellConfig, rendererOutput;

        if (fieldValue === null || fieldValue === undefined) {
            fieldValue = ''
        }

        if (column.rendererScope === 'me' || column.rendererScope === 'this') {
            column.rendererScope = column;
        }

        let rendererConfig = {
            column,
            columnIndex,
            component: me.components?.[column.dataField],
            dataField,
            gridContainer,
            record,
            row: me,
            rowIndex,
            silent,
            store,
            value: fieldValue
        };

        rendererOutput = column.renderer.call(column.rendererScope || column, rendererConfig);

        if (column.cellCls) {
            let extraCls = column.cellCls;

            if (Neo.typeOf(extraCls) === 'Function') {
                extraCls = extraCls.call(column.rendererScope || column, rendererConfig)
            }

            if (extraCls) {
                NeoArray.add(cellCls, extraCls)
            }
        }

        if (rendererOutput instanceof Neo.component.Base) {
            me.components ??= {};

            if (!me.components[column.dataField]) {
                me.components[column.dataField] = rendererOutput
            }

            rendererOutput = rendererOutput.createVdomReference()
        }

        switch (Neo.typeOf(rendererOutput)) {
            case 'Object': {
                if (rendererOutput.html || rendererOutput.text) {
                    rendererOutput.cls && cellCls.push(...rendererOutput.cls);
                } else {
                    rendererOutput = [rendererOutput];
                }
                break
            }
            case 'Date':
            case 'Number':
            case 'String': {
                rendererOutput = {
                    cls : cellCls,
                    html: rendererOutput?.toString()
                };
                break
            }
        }

        if (rendererOutput === null || rendererOutput === undefined) {
            rendererOutput = ''
        }

        if (column.cellAlign !== 'left') {
            cellCls.push('neo-' + column.cellAlign)
        }

        if (gridBody.highlightModifiedCells) {
            if (record.isModifiedField(dataField)) {
                cellCls.push('neo-is-modified')
            }
        }

        if (!cellId) {
            cellId = me.getCellId(column.dataField)
        }

        if (gridBody.selectionModel?.selectedColumns?.includes(dataField)) {
            NeoArray.add(cellCls, gridBody.selectionModel.selectedColumnCellCls || 'neo-selected')
        }

        if (isLastColumn) {
            cellCls.push('neo-last-column')
        }

        cellConfig = {
            'aria-colindex': columnIndex + 1, // 1 based
            data           : {field: dataField, recordId},
            id             : cellId,
            cls            : cellCls,
            role           : 'gridcell',
            style          : rendererOutput.style || {}
        };

        if (selectedCells.includes(logicalCellId)) {
            cellCls.push('neo-selected');
            cellConfig['aria-selected'] = true
        }

        if (column.width) {
            cellConfig.style.minWidth = `${column.width}px`
        }

        if (colspan && Object.keys(colspan).includes(dataField)) {
            cellConfig.colspan = colspan[dataField]
        }

        if (Neo.typeOf(rendererOutput) === 'Object') {
            if (Object.hasOwn(rendererOutput, 'html')) {
                cellConfig.html = rendererOutput.html  || ''
            } else {
                cellConfig.text = rendererOutput.text  || ''
            }
        } else {
            cellConfig.cn = rendererOutput
        }

        return cellConfig
    }

    /**
     * Generates the VDOM for the row.
     *
     * This method implements the **Full Pool Rendering** strategy.
     * It iterates through two passes:
     *
     * 1.  **Pooled Cells (O(1) Stability):**
     *     - Iterates through the currently `mountedColumns`.
     *     - Maps each column to a fixed slot in the `pooledCells` array based on `poolIndex = columnIndex % cellPoolSize`.
     *     - Fills any unused slots in the `pooledCells` array with hidden placeholders.
     *     - Appends the *entire* dense `pooledCells` array to the VDOM.
     *     - This ensures the VDOM children list length and IDs remain constant during horizontal scrolling,
     *       resulting in zero structural deltas (no `moveNode`, `insertNode`, or `removeNode`).
     *
     *     **Cell Recycling (Horizontal Scroll Optimization):**
     *     If `recycle=true`, the method attempts to reuse existing VDOM nodes for cells that are still visible
     *     but have moved to a new pool index (due to horizontal scroll).
     *     - It captures the previous VDOM children (`oldCn`) into a Map keyed by `dataField`.
     *     - If a match is found for the current column and record, the old node is reused directly.
     *     - This skips the expensive `applyRendererOutput` and `updateCellComponents` calls, ensuring O(1) performance for horizontal scrolling.
     *
     * 2.  **Permanent Cells:**
     *     - Appends cells that opt-out of pooling (e.g., complex components like Charts/Canvas).
     *     - These are always rendered to preserve their internal state (e.g. Canvas context).
     *
     * @param {Boolean} [silent=false]
     * @param {Boolean} [recycle=true] True to attempt reusing existing cell VDOMs.
     */
    createVdom(silent=false, recycle=true) {
        let me               = this,
            record           = me.record,
            rowIndex         = me.rowIndex,
            gridBody         = me.parent, // The Row is an item of Body
            gridContainer    = gridBody.parent,
            vdom             = me.vdom,
            {columns}        = gridContainer,
            cellConfig, column, columnPosition, i, isMounted, lastColumnIndex, oldCn, poolIndex, poolSize, pooledCells;

        if (!record) {
            vdom.style = {display: 'none'};
            !silent && me.update();
            return
        }

        let {mountedColumns} = gridBody,
            {selectedRows}   = gridBody,
            recordId         = gridBody.getRecordId(record),
            countColumns     = columns.getCount();

        Object.assign(vdom, {
            'aria-rowindex': rowIndex + 2, // header row => 1, first body row => 2
            data           : {recordId, rowId: rowIndex},
            role           : 'row',
            style          : {
                display  : null, // Reset display in case it was hidden
                height   : gridBody.rowHeight + 'px',
                transform: `translate3d(0px, ${rowIndex * gridBody.rowHeight}px, 0px)`
            }
        });

        // Capture previous children for recycling check
        oldCn   = vdom.cn;
        vdom.cn = [];

        let oldCellMap = null;

        if (recycle && oldCn) {
            oldCellMap = new Map();
            // Map existing cells by dataField for robust retrieval regardless of pool index changes
            for (let i = 0, len = oldCn.length; i < len; i++) {
                let node = oldCn[i];
                if (node.data?.field) {
                    oldCellMap.set(node.data.field, node)
                }
            }
        }

        let rowCls = gridBody.getRowClass(record, rowIndex);

        if (rowIndex % 2 !== 0) {
            rowCls.push('neo-even')
        }

        if (selectedRows && record[gridBody.selectedRecordField]) {
            NeoArray.add(selectedRows, recordId)
        }

        if (selectedRows?.includes(recordId)) {
            rowCls.push('neo-selected');
            vdom['aria-selected'] = true;
            // Note: fire('select') should ideally be handled by the SelectionModel observing the store/records,
            // or we keep it here but suppress events during rendering if needed.
            // gridContainer.fire('select', {record})
        } else {
            delete vdom['aria-selected']
        }

        vdom.cls = rowCls;

        lastColumnIndex = gridBody.columnPositions.getCount() - 1;
        poolSize        = gridBody.cellPoolSize;
        pooledCells     = new Array(poolSize);

        // Pass 1: Render Pooled Cells (hideMode === 'removeDom')
        // We render the FULL pool to ensure stable VDOM structure (0 inserts/moves).
        for (i=mountedColumns[0]; i <= mountedColumns[1]; i++) {
            column = columns.getAt(i);

            // Sanity check for bounds (e.g. if column count changed)
            if (!column) continue;

            if (column.hideMode === 'removeDom') {
                poolIndex = i % poolSize;

                // Cell Recycling: Reuse existing VDOM if record and column match
                if (recycle && oldCellMap) {
                    let oldNode = oldCellMap.get(column.dataField);

                    if (oldNode && oldNode.data?.recordId === recordId) {
                        // We must update the ID and colindex to match the new physical slot
                        oldNode.id = `${me.id}__cell-${poolIndex}`;
                        oldNode['aria-colindex'] = i + 1;

                        // Update position
                        columnPosition = gridBody.columnPositions.get(column.dataField);
                        if (columnPosition) {
                            oldNode.style.left  = columnPosition.x + 'px';
                            oldNode.style.width = columnPosition.width + 'px';
                            // Reset visibility in case it was hidden by drag
                            if (!columnPosition.hidden) {
                                oldNode.style.visibility = null
                            }
                        }

                        pooledCells[poolIndex] = oldNode;
                        continue
                    }
                }

                cellConfig = me.applyRendererOutput({
                    cellId      : `${me.id}__cell-${poolIndex}`,
                    column,
                    columnIndex : i,
                    isLastColumn: i === lastColumnIndex,
                    record,
                    rowIndex,
                    silent
                });

                if (column.dock) {
                    cellConfig.cls = ['neo-locked', ...cellConfig.cls || []]
                }

                columnPosition = gridBody.columnPositions.get(column.dataField);

                if (!columnPosition) {
                    continue
                }

                cellConfig.style = {
                    ...cellConfig.style,
                    left : columnPosition.x     + 'px',
                    width: columnPosition.width + 'px'
                };

                // Happens during a column header drag OP, when leaving the painted range
                if (columnPosition.hidden) {
                    cellConfig.style.visibility = 'hidden'
                }

                pooledCells[poolIndex] = cellConfig
            }
        }

        // Fill gaps with placeholders to maintain O(1) stability
        for (i = 0; i < poolSize; i++) {
            if (!pooledCells[i]) {
                pooledCells[i] = {
                    id   : `${me.id}__cell-${i}`,
                    style: {display: 'none'}
                }
            }
        }

        vdom.cn.push(...pooledCells);

        // Pass 2: Render Permanent Cells (hideMode !== 'removeDom')
        // We MUST render these even if they are off-screen to preserve their DOM state (e.g. Canvas context).
        // This loop is O(TotalColumns), but typically few columns use this mode.
        for (i=0; i < countColumns; i++) {
            column = columns.getAt(i);

            if (column.hideMode !== 'removeDom') {
                isMounted = i >= mountedColumns[0] && i <= mountedColumns[1];

                cellConfig = me.applyRendererOutput({
                    cellId      : `${me.id}__${column.dataField}`,
                    column,
                    columnIndex : i,
                    isLastColumn: i === lastColumnIndex,
                    record,
                    rowIndex,
                    silent
                });

                if (column.dock) {
                    cellConfig.cls = ['neo-locked', ...cellConfig.cls || []]
                }

                columnPosition = gridBody.columnPositions.get(column.dataField);

                if (!columnPosition) {
                    continue
                }

                cellConfig.style = {
                    ...cellConfig.style,
                    left : columnPosition.x     + 'px',
                    width: columnPosition.width + 'px'
                };

                // Visibility Logic
                if (isMounted) {
                    if (columnPosition.hidden) {
                        cellConfig.style.visibility = 'hidden'
                    }
                } else {
                    if (column.hideMode === 'visibility') {
                        cellConfig.style.visibility = 'hidden'
                    } else if (column.hideMode === 'display') {
                        cellConfig.style.display = 'none'
                    }
                }

                vdom.cn.push(cellConfig)
            }
        }

        !silent && me.update()
    }

    /**
     *
     */
    destroy() {
        let me = this;

        if (me.components) {
            for (const key in me.components) {
                me.components[key].destroy()
            }
        }

        super.destroy()
    }

    /**
     * @param {String} dataField
     * @returns {String}
     */
    getCellId(dataField) {
        return `${this.id}__${dataField}`
    }

    /**
     * Updates components inside the row matching a specific identifier (ntype, className or Class)
     * @param {String|Neo.core.Base} identifier
     * @param {Object} config
     */
    updateCellComponents(identifier, config) {
        let me = this,
            isString, proto;

        if (me.components) {
            isString = Neo.isString(identifier);

            if (!isString) {
                proto      = identifier.prototype;
                identifier = proto.ntype || proto.className
            }

            for (const key in me.components) {
                let component = me.components[key];
                if (isString ? (component.ntype === identifier || component.className === identifier) : (component instanceof identifier)) {
                    component.set(config)
                }
            }
        }
    }

    /**
     * Updates the content of this Row instance to display a new record.
     *
     * This is the core method of the Row Pooling architecture. It is called by `Neo.grid.Body`
     * during scrolling or rendering. It updates the internal state (`record`, `rowIndex`)
     * and triggers a VDOM update to reflect the new data.
     *
     * @param {Object} data
     * @param {Boolean} [data.force=false] True to force a VDOM update even if record and rowIndex are unchanged.
     * @param {Object} data.record The new record to display.
     * @param {Boolean} [data.recycle=true] True to attempt reusing existing cell VDOMs (performance optimization).
     * @param {Number} data.rowIndex The new row index.
     * @param {Boolean} [data.silent=false] True to prevent an immediate VDOM update (useful for batching).
     */
    updateContent({force=false, record, recycle=true, rowIndex, silent=false}) {
        let me = this;

        // Optimization: Skip VDOM generation if the state hasn't changed.
        // This prevents thousands of redundant updates during simple scrolling.
        if (!force && me.record === record && me.rowIndex === rowIndex) {
            return
        }

        me.record   = record;
        me.rowIndex = rowIndex;

        me.createVdom(silent, recycle)
    }
}

export default Neo.setupClass(Row);
