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
 * -   **Edit Projection:** Embeds the editor of `Neo.grid.plugin.CellEditing`'s active session into the cell rendering that
 *     session's record and column, on every render — the Row, not the plugin, decides where an edit is visible.
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
     * Triggered after an update of this row landed in the DOM, e.g. for a changed record. Content-sized rows
     * measure what it rendered.
     * @protected
     */
    afterExecuteVdomUpdate() {
        let gridBody = this.parent;

        gridBody?.rowGeometry && gridBody.gridContainer.view.scheduleRowMeasure()
    }

    /**
     * Triggered after the mounted config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetMounted(value, oldValue) {
        super.afterSetMounted(value, oldValue);
        this.forwardToCells('mounted', value)
    }

    /**
     * Triggered after the theme config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetTheme(value, oldValue) {
        super.afterSetTheme(value, oldValue);
        this.forwardToCells('theme', value)
    }

    /**
     * Triggered after the windowId config got changed. A pooled cell that was created in one
     * window must follow the row into the next one: a canvas cell re-transfers its node to the
     * main thread of the window it believes it is in, and only the current id reaches a node.
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetWindowId(value, oldValue) {
        super.afterSetWindowId(value, oldValue);
        value && this.forwardToCells('windowId', value)
    }

    /**
     * Relays one lifecycle config to every cell component this row owns. A row is a component,
     * not a container, so the cascade `container.Base` performs for its items is done here by hand
     * for the configs a pooled cell depends on: `mounted`, `theme` and `windowId`.
     * @param {String} key
     * @param {*} value
     * @protected
     */
    forwardToCells(key, value) {
        const {components} = this;

        if (components) {
            for (const cellKey in components) {
                components[cellKey][key] = value
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
    applyRendererOutput({cache, cellId, column, columnIndex, isLastColumn, record, rowIndex, silent}) {
        let {colspanField, editsCells, gridBody, gridContainer, highlightModifiedCells, selectedCells, selectionModel, store} = cache;

        // Premeasurement projects declared text only, without constructing component cells or an edit surface.
        if (cache.measureOnly && column.component) return null;

        let me            = this,
            cellCls       = ['neo-grid-cell'],
            colspan       = record[colspanField],
            {dataField}   = column,
            recordId      = gridBody.getRecordId(record),
            logicalCellId = gridBody.getLogicalCellId(record, dataField),
            fieldValue    = record.get(dataField),
            cellConfig, rendererOutput;

        if (fieldValue === null || fieldValue === undefined) {
            fieldValue = ''
        }

        let valueBandsMap = store.valueBandsMap;

        if (column.useValueBanding && valueBandsMap) {
            let bands = valueBandsMap.get(store.getKey(record));

            if (bands && bands[dataField] !== undefined) {
                cellCls.push(bands[dataField] ? 'neo-value-band-1' : 'neo-value-band-2')
            }
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
            row      : me,
            rowIndex,
            silent,
            store,
            value    : fieldValue
        };

        rendererOutput = column.renderer.call(column.rendererScope || gridContainer, rendererConfig);

        if (cache.measureOnly && !(typeof rendererOutput === 'string' || typeof rendererOutput === 'number' ||
            rendererOutput instanceof Date || rendererOutput == null ||
            (Neo.typeOf(rendererOutput) === 'Object' && ('html' in rendererOutput || 'text' in rendererOutput)))) {
            return null
        }

        if (column.cellCls) {
            let extraCls = column.cellCls;

            if (Neo.typeOf(extraCls) === 'Function') {
                extraCls = extraCls.call(column.rendererScope || gridContainer, rendererConfig)
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

        if (column.cellAlign && column.cellAlign !== 'left') {
            cellCls.push('neo-' + column.cellAlign)
        }

        if (highlightModifiedCells) {
            if (record.isModifiedField(dataField)) {
                cellCls.push('neo-is-modified')
            }
        }

        if (!cellId) {
            cellId = me.getCellId(column.dataField)
        }

        if (selectionModel?.selectedColumns?.includes(dataField)) {
            NeoArray.add(cellCls, selectionModel.selectedColumnCellCls || 'neo-selected')
        }

        if (isLastColumn) {
            if (column.locked !== 'start') {
                cellCls.push('neo-last-column')
            }
        }

        if (column.locked === 'start') {
            cellCls.push('neo-locked-start')
        } else if (column.locked === 'end') {
            cellCls.push('neo-locked-end');

            if (columnIndex === 0) {
                cellCls.push('neo-locked-end-first-column')
            }
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

        // Only a grid that edits has cells to tell apart: while its editing is on, the others are read-only
        if (editsCells && !column.editable) {
            cellConfig['aria-readonly'] = true
        }

        if (column.width) {
            cellConfig.style.width = `${column.width}px`
        }

        if (colspan && Object.keys(colspan).includes(dataField)) {
            cellConfig.colspan = colspan[dataField]
        }

        if (Neo.typeOf(rendererOutput) === 'Object') {
            let content = Object.hasOwn(rendererOutput, 'html') ? {html: rendererOutput.html || ''} : {text: rendererOutput.text || ''};

            // Content-sized rows: the text of a wrapText column wraps in a block container, which the view measures
            if (column.wrapText && gridBody.rowGeometry) {
                cellConfig.cn = [{cls: ['neo-grid-cell-text'], id: `${cellId}__text`, ...content}]
            } else {
                Object.assign(cellConfig, content)
            }
        } else {
            cellConfig.cn = rendererOutput
        }

        // The cell of the active edit embeds its editor instead of the value, unless a lock change holds it. The
        // editor's parent follows the Row rendering it, so a pool rebinding that drops the cell unmounts the editor,
        // and the next render embeds it again.
        if (
            cache.editSession?.dataField === dataField &&
            cache.editSession.recordId === recordId &&
            !cache.editSession.held
        ) {
            let {editor} = cache.editSession;

            editor.parentId !== me.id && (editor.parentId = me.id);

            delete cellConfig.html;
            delete cellConfig.text;
            cellConfig.cn = [editor.createVdomReference()]
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
        let me            = this,
            record        = me.record,
            rowIndex      = me.rowIndex,
            gridBody      = me.parent, // The Row is an item of Body
            gridContainer = gridBody.gridContainer,
            vdom          = me.vdom,
            {columns}     = gridContainer,
            cellConfig, column, columnPosition, i, isMounted, lastColumnIndex, oldCn, poolIndex, poolSize, pooledCells;

        if (!record) {
            // Only the record claim goes, never the `data` object: `rowId` identifies the pool
            // SLOT, which the row still is once its record is gone, and pooled updates need it.
            // Staged either way — under `silent`, nothing below reaches the browser from here.
            delete vdom.data?.recordId;

            vdom.style = {display: 'none'};
            !silent && me.update();
            return
        }

        let {
                cellPoolSize, columnPositions, colspanField, highlightModifiedCells,
                mountedColumns, rowHeight, store
            }              = gridBody,
            // selection is the View's: a row paints its projection and never holds or mutates it
            view           = gridContainer?.view,
            selectedCells  = view?.selectedCells ?? [],
            selectionModel = view?.selectionModel ?? null,
            {rowGeometry}  = gridBody,
            recordId       = gridBody.getRecordId(record),
            countColumns   = columns.getCount(),
            cellEditing    = gridContainer.getPlugin('grid-cell-editing'),
            editSession    = cellEditing?.session ?? null,
            editsCells     = !!cellEditing && !cellEditing.disabled,
            cache          = {colspanField, columnPositions, editSession, editsCells, gridBody, gridContainer, highlightModifiedCells, selectedCells, selectionModel, store};

        Object.assign(vdom, {
            'aria-rowindex': rowIndex + 2, // header row => 1, first body row => 2
            data           : {recordId, rowId: rowIndex,
                ...(rowGeometry ? {heightSource: rowGeometry.hasHeight(recordId) ? 'measured' : 'estimated'} : {})},
            role           : 'row',
            // Content-sized rows take height and offset from the view's geometry, fixed rows multiply
            style          : {
                display  : null, // Reset display in case it was hidden
                height   : (rowGeometry ? rowGeometry.heightAt(rowIndex) : rowHeight) + 'px',
                transform: me.getRowTransform(rowGeometry ? rowGeometry.offsetAt(rowIndex) : rowIndex * rowHeight)
            }
        });

        if (gridContainer.isTreeGrid) {
            if (!record.isLeaf) {
                vdom['aria-expanded'] = record.expanded || false;
            } else {
                delete vdom['aria-expanded'];
            }

            vdom['aria-level']    = (record.depth || 0) + 1;
            vdom['aria-posinset'] = record.siblingIndex || 1;
            vdom['aria-setsize']  = record.siblingCount || 1;
        }

        // Capture previous children for recycling check
        oldCn   = vdom.cn;
        vdom.cn = [];

        let oldCellMap = null;

        if (recycle && oldCn) {
            oldCellMap = new Map();
            // Map existing cells by dataField for robust retrieval regardless of pool index changes
            for (let i = 0, len = oldCn.length; i < len; i++) {
                let node = oldCn[i];
                if (node?.data?.field) {
                    oldCellMap.set(node.data.field, node)
                }
            }
        }

        let rowCls = gridBody.getRowClass(record, rowIndex);

        if (gridBody.stripedRows && rowIndex % 2 !== 0) {
            rowCls.push('neo-even')
        }

        let selectedRows = gridContainer?.view?.selectedRows;

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

        lastColumnIndex = columnPositions.getCount() - 1;
        poolSize        = cellPoolSize;
        pooledCells     = new Array(poolSize);

        // Pass 1: Render Pooled Cells (hideMode === 'removeDom' && !locked)
        // We render the FULL pool to ensure stable VDOM structure (0 inserts/moves).
        for (i=mountedColumns[0]; i <= mountedColumns[1]; i++) {
            columnPosition = columnPositions.getAt(i);
            if (!columnPosition) continue;

            column = columns.get(columnPosition.dataField);

            // Sanity check for bounds (e.g. if column count changed)
            if (!column) continue;

            if (column.hideMode === 'removeDom' && !column.locked) {
                poolIndex = i % poolSize;

                // Cell Recycling: Reuse existing VDOM if record and column match
                if (recycle && oldCellMap) {
                    let oldNode = oldCellMap.get(column.dataField);

                    if (oldNode && oldNode.data?.recordId === recordId) {
                        // We must update the ID and colindex to match the new physical slot
                        Row.setCellId(oldNode, `${me.id}__cell-${poolIndex}`);
                        oldNode['aria-colindex'] = i + 1;

                        // Update position
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
                    cache,
                    cellId      : `${me.id}__cell-${poolIndex}`,
                    column,
                    columnIndex : i,
                    isLastColumn: i === lastColumnIndex,
                    record,
                    rowIndex,
                    silent
                });

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

        // Pass 2: Render Permanent Cells (hideMode !== 'removeDom' || locked)
        // We MUST render these even if they are off-screen to preserve their DOM state (e.g. Canvas context).
        // This loop is O(TotalColumns), but typically few columns use this mode.
        for (i=0; i < countColumns; i++) {
            columnPosition = columnPositions.getAt(i);
            if (!columnPosition) continue;

            column = columns.get(columnPosition.dataField);

            // Sanity check
            if (!column) continue;

            if (column.hideMode !== 'removeDom' || column.locked) {
                isMounted = i >= mountedColumns[0] && i <= mountedColumns[1];

                // Cell Recycling for Permanent Cells
                if (recycle && oldCellMap) {
                    let oldNode = oldCellMap.get(column.dataField);

                    if (oldNode && oldNode.data?.recordId === recordId) {
                        // Identity-migration symmetry with the Pass 1 recycle: this node may have
                        // been rendered POOLED (id `…__cell-N`) before the column flipped into
                        // permanent territory (e.g. `locked` changed on a mounted row via a
                        // cross-region drag re-home). Pass 1's placeholder loop has already
                        // re-issued that pool id — keeping it here puts two nodes with one id
                        // into a single row, and id-based diffing collapses (id-less insert
                        // storms, the DOM accumulating both generations).
                        Row.setCellId(oldNode, `${me.id}__${column.dataField}`);
                        oldNode['aria-colindex'] = i + 1;

                        if (columnPosition) {
                            oldNode.style.left  = columnPosition.x + 'px';
                            oldNode.style.width = columnPosition.width + 'px';

                            if (isMounted || column.locked) {
                                if (columnPosition.hidden) {
                                    oldNode.style.visibility = 'hidden'
                                } else {
                                    oldNode.style.visibility = null;
                                    oldNode.style.display = null;
                                }
                            } else {
                                if (column.hideMode === 'visibility') {
                                    oldNode.style.visibility = 'hidden'
                                } else if (column.hideMode === 'display') {
                                    oldNode.style.display = 'none'
                                }
                            }
                        }
                        vdom.cn.push(oldNode);
                        continue;
                    }
                }

                cellConfig = me.applyRendererOutput({
                    cache,
                    cellId      : `${me.id}__${column.dataField}`,
                    column,
                    columnIndex : i,
                    isLastColumn: i === lastColumnIndex,
                    record,
                    rowIndex,
                    silent
                });

                if (!columnPosition) {
                    continue
                }

                cellConfig.style = {
                    ...cellConfig.style,
                    left : columnPosition.x     + 'px',
                    width: columnPosition.width + 'px'
                };

                // Visibility Logic
                if (isMounted || column.locked) {
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
     * @param {Boolean} [updateParentVdom=false]
     * @param {Boolean} [silent=false]
     */
    destroy(updateParentVdom=false, silent=false) {
        let me = this;

        if (me.components) {
            for (const key in me.components) {
                me.components[key].destroy()
            }
        }

        super.destroy(updateParentVdom, silent)
    }

    /**
     * @param {String} dataField
     * @returns {String}
     */
    getCellId(dataField) {
        return `${this.id}__${dataField}`
    }

    /**
     * The transform that places this row at an offset in px. `--grid-row-pin-offset` is the scroll pinning
     * delta of the `GridRowScrollPinning` main-thread addon.
     * @param {Number} offset
     * @returns {String}
     */
    getRowTransform(offset) {
        return `translate3d(0px, calc(${offset}px + var(--grid-row-pin-offset, 0px)), 0px)`
    }

    /**
     * Content-sized rows move when a row above them changes its height, while their record and index stay the
     * same. True if the height or offset this row rendered no longer matches the view's row geometry.
     * @returns {Boolean}
     * @protected
     */
    hasStaleGeometry() {
        let me            = this,
            {rowGeometry} = me.parent,
            {rowIndex}    = me,
            {style}       = me.vdom;

        return !!(rowGeometry && me.record) && (
            style.height    !== rowGeometry.heightAt(rowIndex) + 'px' ||
            style.transform !== me.getRowTransform(rowGeometry.offsetAt(rowIndex)) ||
            me.vdom.data.heightSource !== (rowGeometry.hasHeight(me.parent.getRecordId(me.record)) ? 'measured' : 'estimated')
        )
    }

    /**
     * Gives a recycled cell the id of its new slot. A content-sized text container inside it takes the matching
     * id, so no two elements of a row share one.
     * @param {Object} cell The cell's vdom
     * @param {String} id
     */
    static setCellId(cell, id) {
        let text = cell.cn?.[0];

        cell.id = id;

        if (text?.cls?.includes('neo-grid-cell-text')) {
            text.id = `${id}__text`
        }
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
     * @summary Updates this pooled row to display a record, refreshing cells when the record instance changes.
     *
     * This is the core method of the Row Pooling architecture. It is called by `Neo.grid.Body`
     * during scrolling or rendering. It updates the internal state (`record`, `rowIndex`)
     * and triggers a VDOM update to reflect the new data.
     *
     * @param {Object} data
     * @param {Boolean} [data.force=false] True to force a VDOM update even if record and rowIndex are unchanged.
     * @param {Object} data.record The new record to display.
     * @param {Boolean} [data.recycle=true] True to reuse cell VDOMs only while retaining the same record instance.
     * @param {Number} data.rowIndex The new row index.
     * @param {Boolean} [data.silent=false] True to prevent an immediate VDOM update (useful for batching).
     */
    updateContent({force=false, record, recycle=true, rowIndex, silent=false}) {
        let me = this;

        // Optimization: Skip VDOM generation if the state hasn't changed.
        // This prevents thousands of redundant updates during simple scrolling.
        if (!force && me.record === record && me.rowIndex === rowIndex && !me.hasStaleGeometry()) {
            return
        }

        recycle     = recycle && me.record === record;
        me.record   = record;
        me.rowIndex = rowIndex;

        me.createVdom(silent, recycle)
    }
}

export default Neo.setupClass(Row);
