import ClassSystemUtil from '../util/ClassSystem.mjs';
import Component       from '../component/Base.mjs';
import Collection      from '../collection/Base.mjs';
import Row             from './Row.mjs';
import RowModel        from '../selection/grid/RowModel.mjs';
import VDomUtil        from '../util/VDom.mjs';

/**
 * @summary Manages the scrollable viewport and row rendering for the Grid.
 *
 * `Neo.grid.Body` is the engine behind the Grid's virtual scrolling. It extends {@link Neo.component.Base} rather than
 * `Neo.container.Base` to enforce a strict **Row Pooling** architecture.
 *
 * **Why Component and not Container?**
 * Since the Grid uses a **Fixed-DOM-Order** strategy, the standard Container APIs (`add`, `remove`, `move`) are
 * fundamentally incompatible with the row pooling logic. By extending `Component`, we hide these unsafe methods
 * while manually implementing the necessary config propagation (theme, appName, windowId) to the managed Row instances.
 *
 * **Row Pooling:**
 * Instead of creating a component for every record in the store, it uses a pool:
 *
 * 1.  It creates a fixed pool of {@link Neo.grid.Row} components based on the visible height + a buffer.
 * 2.  As the user scrolls, these Row instances are recycled. Their `record` and `rowIndex` configs are updated via
 *     {@link Neo.grid.Row#updateContent}, triggering a lightweight VDOM update.
 * 3.  It calculates the `mountedRows` (rendered DOM nodes) and `visibleRows` (viewport intersection) to optimize rendering.
 *
 * This architecture ensures O(1) performance for record updates and constant memory usage regardless of dataset size.
 *
 * **Fixed-DOM-Order Strategy:**
 * To maximize scrolling performance, `Body` uses a "recycling in place" strategy. The Row components in the `items`
 * array and the corresponding DOM nodes in `vdom.cn` **never change their order**.
 *
 * - When a row scrolls off the top, it remains the "first" child in the DOM but is visually repositioned
 *   to the bottom via CSS transform (`translate3d`) and updated with new record content.
 * - This approach eliminates `moveNode`, `insertNode`, and `removeNode` operations, resulting in
 *   zero layout thrashing during scrolling.
 *
 * @class Neo.grid.Body
 * @extends Neo.component.Base
 * @see Neo.grid.Row
 * @see Neo.grid.Container
 */
class GridBody extends Component {
    static config = {
        /**
         * @member {String} className='Neo.grid.Body'
         * @protected
         */
        className: 'Neo.grid.Body',
        /**
         * @member {String} ntype='grid-body'
         * @protected
         */
        ntype: 'grid-body',
        /**
         * @member {Boolean} animatedRowSorting_=false
         * @reactive
         */
        animatedRowSorting_: false,
        /**
         * Internal flag. Gets calculated when mounting the grid.Container
         * @member {Number} availableHeight_=0
         * @reactive
         */
        availableHeight_: 0,
        /**
         * Internal flag. Gets calculated when changing the availableHeight config
         * @member {Number} availableRows_=0
         * @reactive
         */
        availableRows_: 0,
        /**
         * Internal flag. Gets calculated after mounting grid.Body rows
         * @member {Number} availableWidth_=0
         * @reactive
         */
        availableWidth_: 0,
        /**
         * @member {String[]} baseCls=['neo-grid-body']
         * @protected
         */
        baseCls: ['neo-grid-body'],
        /**
         * The number of columns (cells) to paint before the first and after the last visible column,
         * to enhance the scrolling performance
         * @member {Number} bufferColumnRange_=0
         * @reactive
         */
        bufferColumnRange_: 0,
        /**
         * The number of rows to paint before the first and after the last visible row,
         * to enhance the scrolling performance
         * @member {Number} bufferRowRange_=3
         * @reactive
         */
        bufferRowRange_: 3,
        /**
         * The pool size for recyclable cells.
         * Auto-calculated based on mounted columns range.
         * @member {Number} cellPoolSize_=20
         * @protected
         * @reactive
         */
        cellPoolSize_: 20,
        /**
         * Define which model field contains the value of colspan definitions
         * @member {String} colspanField='colspan'
         */
        colspanField: 'colspan',
        /**
         * Internal flag. Gets calculated after mounting grid.Body rows
         * @member {Number} containerWidth_=0
         * @reactive
         */
        containerWidth_: 0,
        /**
         * @member {Neo.collection.Base|null} columnPositions_=null
         * @protected
         * @reactive
         */
        columnPositions_: null,
        /**
         * @member {Boolean} highlightModifiedCells_=false
         * @reactive
         */
        highlightModifiedCells_: false,
        /**
         * @member {Boolean} isScrolling_=false
         * @reactive
         */
        isScrolling_: false,
        /**
         * Additional used keys for the selection model
         * @member {Object} keys
         */
        keys: {},
        /**
         * Stores the indexes of the first & last mounted columns, including bufferColumnRange
         * @member {Number[]} mountedColumns_=[0,0]
         * @protected
         * @reactive
         */
        mountedColumns_: [0, 0],
        /**
         * Stores the indexes of the first & last mounted rows, including bufferRowRange
         * @member {Number[]} mountedRows=[0,0]
         * @protected
         */
        mountedRows: [0, 0],
        /**
         * Optional config values for Neo.grid.plugin.AnimateRows
         * @member {Object} pluginAnimateRowsConfig=null
         */
        pluginAnimateRowsConfig: null,
        /**
         * @member {String} role='rowgroup'
         * @reactive
         */
        role: 'rowgroup',
        /**
         * Number in px
         * @member {Number} rowHeight_=0
         * @reactive
         */
        rowHeight_: 0,
        /**
         * @member {Number} scrollLeft_=0
         * @protected
         * @reactive
         */
        scrollLeft_: 0,
        /**
         * @member {Number} scrollTop_=0
         * @protected
         * @reactive
         */
        scrollTop_: 0,
        /**
         * @member {Neo.selection.Model} selectionModel_=null
         * @reactive
         */
        selectionModel_: null,
        /**
         * @member {String} selectedRecordField='annotations.selected'
         */
        selectedRecordField: 'annotations.selected',
        /**
         * @member {Number} startIndex_=0
         * @reactive
         */
        startIndex_: 0,
        /**
         * @member {Neo.data.Store|null} store_=null
         * @reactive
         */
        store_: null,
        /**
         * Stores the indexes of the first & last painted columns
         * @member {Number[]} visibleColumns=[0,0]
         * @protected
         */
        visibleColumns: [0, 0],
        /**
         * Stores the indexes of the first & last visible rows, excluding bufferRowRange
         * @member {Number[]} visibleRows=[0,0]
         * @protected
         */
        visibleRows: [0, 0],
        /**
         * @member {String[]} wrapperCls=['neo-grid-body-wrapper']
         * @reactive
         */
        wrapperCls: ['neo-grid-body-wrapper'],
        /**
         * @member {Boolean} useRowRecordIds=true
         */
        useRowRecordIds: true,
        /**
         * @member {Boolean} useInternalId=true
         */
        useInternalId: true,
        /**
         * @member {Object} _vdom
         */
        _vdom:
        {tabIndex: '-1', cn: [
            {cn: []}
        ]}
    }

    /**
     * Internal flag to adopt to store.add() passing an initial chunk.
     * @member {Number} #initialChunkSize=0
     */
    #initialChunkSize = 0
    /**
     * Internal flag to adopt to store.add() passing an initial chunk.
     * @member {Number} #initialChunkSize=0
     */
    #initialTotalSize = 0
    /**
     * Internal cache for the last mountedColumns state.
     * Used to detect horizontal scrolling/resizing to force row updates.
     * @member {Number[]|null} #lastMountedColumns=null
     */
    #lastMountedColumns = null
    /**
     * @member {Object[]} items=[]
     */
    items = []

    /**
     * @member {String[]} selectedCells
     */
    get selectedCells() {
        let {selectionModel} = this;

        if (selectionModel.ntype?.includes('cell')) {
            return selectionModel.items
        }

        return []
    }

    /**
     * @member {String[]} selectedRows
     */
    get selectedRows() {
        let {selectionModel} = this;

        if (selectionModel.ntype?.includes('row')) {
            return selectionModel.selectedRows
        }

        return []
    }

    /**
     * @param config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        me.addDomListeners([{
            click   : me.onCellClick,
            dblclick: me.onCellDoubleClick,
            delegate: '.neo-grid-cell',
            scope   : me
        }, {
            click   : me.onRowClick,
            dblclick: me.onRowDoubleClick,
            delegate: '.neo-grid-row',
            scope   : me
        }])
    }

    /**
     * Triggered after the animatedRowSorting config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetAnimatedRowSorting(value, oldValue) {
        if (value && !this.getPlugin('grid-animate-rows')) {
            import('./plugin/AnimateRows.mjs').then(module => {
                let me      = this,
                    plugins = me.plugins || [];

                plugins.push({
                    module: module.default,
                    ...me.pluginAnimateRowsConfig
                });

                me.plugins = plugins
            })
        }
    }

    /**
     * Triggered after the appName config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetAppName(value, oldValue) {
        let me = this;

        super.afterSetAppName(value, oldValue);

        if (value) {
            for (let i = 0, len = me.items.length; i < len; i++) {
                me.items[i].appName = value
            }
        }
    }

    /**
     * Triggered after the availableHeight config got changed
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetAvailableHeight(value, oldValue) {
        if (value > 0) {
            this.availableRows = Math.ceil(value / this.rowHeight) - 1
        }
    }

    /**
     * Triggered after the availableRows config got changed
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetAvailableRows(value, oldValue) {
        value > 0 && this.createViewData()
    }

    /**
     * Triggered after the availableWidth config got changed
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetAvailableWidth(value, oldValue) {
        if (value > 0) {
            let me = this;

            me.vdom.width = value + 'px';
            me.vdom.cn[0].width = value + 'px';
            me.update()
        }
    }

    /**
     * Triggered after the bufferColumnRange config got changed
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetBufferColumnRange(value, oldValue) {
        if (oldValue !== undefined) {
            this.skipCreateViewData = true;
            this.updateMountedAndVisibleColumns(true);
            this.skipCreateViewData = false;
            this.createViewData()
        }
    }

    /**
     * Triggered after the bufferRowRange config got changed
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetBufferRowRange(value, oldValue) {
        if (oldValue !== undefined) {
            let current = Math.floor(this.scrollTop / this.rowHeight);

            if (Math.abs(this.startIndex - current) >= value) {
                this.skipCreateViewData = true;
                this.startIndex = current;
                this.skipCreateViewData = false;
            }

            this.createViewData(false, true)
        }
    }

    /**
     * Triggered after the containerWidth config got changed
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetContainerWidth(value, oldValue) {
        value > 0 && this.updateMountedAndVisibleColumns()
    }

    /**
     * Triggered after the isScrolling config got changed
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetIsScrolling(value, oldValue) {
        this.toggleCls('neo-is-scrolling', value);
        this.fire('isScrollingChange', {value})
    }

    /**
     * Triggered after the mounted config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetMounted(value, oldValue) {
        super.afterSetMounted(value, oldValue);

        if (oldValue !== undefined) {
            let i = 0, len = this.items.length, item;
            for (; i < len; i++) {
                item = this.items[i];
                if (!item.vdom.removeDom) {
                    item.mounted = value
                }
            }
        }
    }

    /**
     * Triggered after the mountedColumns config got changed
     * @param {Number[]} value
     * @param {Number[]} oldValue
     * @protected
     */
    afterSetMountedColumns(value, oldValue) {
        oldValue && this.createViewData()
    }

    /**
     * Triggered after the rowHeight config got changed
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetRowHeight(value, oldValue) {
        value > 0 && this.updateScrollHeight()
    }

    /**
     * Triggered after the scrollLeft config got changed
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetScrollLeft(value, oldValue) {
        this.updateMountedAndVisibleColumns()
    }

    /**
     * Triggered after the scrollTop config got changed
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetScrollTop(value, oldValue) {
        let me               = this,
            {bufferRowRange} = me,
            newStartIndex    = Math.floor(value / me.rowHeight);

        if (Math.abs(me.startIndex - newStartIndex) >= bufferRowRange) {
            me.startIndex = newStartIndex
        } else {
            me.visibleRows[0] = newStartIndex;
            me.visibleRows[1] = newStartIndex + me.availableRows
        }
    }

    /**
     * Triggered after the selectionModel config got changed
     * @param {Neo.selection.Model} value
     * @param {Neo.selection.Model} oldValue
     * @protected
     */
    afterSetSelectionModel(value, oldValue) {
        this.vnodeInitialized && value.register(this)
    }

    /**
     * Triggered after the startIndex config got changed
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetStartIndex(value, oldValue) {
        oldValue !== undefined && this.createViewData()
    }

    /**
     * Triggered after the store config got changed
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetStore(value, oldValue) {
        let me        = this,
            listeners = {
                filter      : me.onStoreFilter,
                load        : me.onStoreLoad,
                recordChange: me.onStoreRecordChange,
                scope       : me
            };

        oldValue?.un(listeners);
        value   ?.on(listeners);
    }

    /**
     * Triggered after the theme config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetTheme(value, oldValue) {
        let me = this;

        super.afterSetTheme(value, oldValue);

        if (value) {
            for (let i = 0, len = me.items.length; i < len; i++) {
                me.items[i].theme = value
            }
        }
    }

    /**
     * Triggered after the windowId config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetWindowId(value, oldValue) {
        let me = this;

        super.afterSetWindowId(value, oldValue);

        if (value) {
            for (let i = 0, len = me.items.length; i < len; i++) {
                me.items[i].windowId = value
            }
        }
    }

    /**
     * Triggered after the columnPositions config got changed
     * @param {Object} value
     * @protected
     */
    beforeGetColumnPositions(value) {
        if (!value) {
            this._columnPositions = value = Neo.create({
                module     : Collection,
                keyProperty: 'dataField'
            })
        }

        return value
    }

    /**
     * Triggered before the selectionModel config gets changed.
     * @param {Neo.selection.Model} value
     * @param {Neo.selection.Model} oldValue
     * @protected
     */
    beforeSetSelectionModel(value, oldValue) {
        oldValue?.destroy();

        return ClassSystemUtil.beforeSetInstance(value, RowModel)
    }

    /**
     * Initializes or expands the pool of `Neo.grid.Row` instances.
     *
     * This method calculates the number of rows needed to cover the viewport plus the buffer range.
     * If the current number of child items (Rows) is less than required, it creates new instances
     * and adds them to the container. This ensures we have enough "physical" rows to recycle during scrolling.
     *
     * @protected
     */
    createRowPool() {
        let me      = this,
            needed  = me.availableRows + 2 * me.bufferRowRange,
            current = me.items.length,
            delta   = needed - current,
            newRows = [],
            config, i;

        if (delta > 0) {
            for (i = 0; i < delta; i++) {
                config = {
                    module       : Row,
                    appName      : me.appName,
                    gridContainer: me.parent,
                    id           : me.getRowId(current + i),
                    parentId     : me.id,
                    record       : null,
                    rowIndex     : -1,
                    theme        : me.theme,
                    windowId     : me.windowId
                };

                newRows.push(Neo.create(config))
            }
            me.items.push(...newRows)
        } else if (delta < 0) {
            // Self-Healing: Destroy excess rows to free memory and VDOM overhead.
            // This restores performance if the buffer is reduced after being large.
            for (i = current - 1; i >= needed; i--) {
                me.items[i].destroy();
                me.items.pop()
            }
        }

        // Fixed-DOM-Order Strategy:
        // We ensure the VDOM children (cn) matches the full pool of items exactly.
        // We never remove or reorder these nodes. We only update their content and transform.
        me.getVdomRoot().cn = me.items.map(item => item.createVdomReference())
    }

    /**
     * The main rendering loop for the Grid Body.
     *
     * This method:
     * 1.  Calculates the range of records to render based on scroll position.
     * 2.  Calls `createRowPool` to ensure enough Row components exist.
     * 3.  Iterates through the visible record range.
     * 4.  **Recycles** existing Row components by calling {@link Neo.grid.Row#updateContent} with the new record data.
     * 5.  Updates the scroll spacer height.
     *
     * **Optimization Strategies:**
     * - **Row Skipping:** If `force` is false and the record/rowIndex match, `Row.updateContent` skips VDOM generation.
     * - **Cell Recycling:** If horizontal scrolling is detected (implicit force), `recycle=true` is passed to Rows, allowing them to reuse existing cell VDOM nodes.
     * - **Forced Updates:** Explicit `force=true` (e.g. from column resize) disables recycling to ensure full re-render.
     *
     * @param {Boolean} [silent=false] True to suppress the final VDOM update (used when batching).
     * @param {Boolean} [force=false] True to force row updates even if records haven't changed (e.g. column resize).
     */
    createViewData(silent=false, force=false) {
        let me = this;

        if (me.skipCreateViewData) {
            return
        }

        let {mountedRows, store} = me,
            endIndex, i, item, itemIndex, poolSize, range, recycle = true;

        if (
            store.isLoading                   ||
            me.availableRows              < 1 ||
            me._containerWidth            < 1 || // we are not checking me.containerWidth, since we want to ignore the config symbol
            me.columnPositions.getCount() < 1 ||
            me.mountedColumns[1]          < 1
        ) {
            return
        }

        if (me.isVdomUpdating) {
            Neo.manager.VDomUpdate.registerPreUpdate(me.id, () => {
                me.createViewData(silent, force)
            });
            return
        }

        // Auto-detect if columns changed (horizontal scroll or resize)
        if (!force && !Neo.isEqual(me.mountedColumns, me.#lastMountedColumns)) {
            force = true
        }
        // If force was explicitly passed (e.g. column dataField change), we must disable recycling
        // to ensure new dataField values are picked up.
        // If force was implicit (scroll), recycling is safe and desired.
        else if (force) {
            recycle = false
        }

        me.#lastMountedColumns = [...me.mountedColumns];

        if (me.#initialChunkSize > 0) {
            endIndex = me.#initialChunkSize;
            range    = endIndex;
        } else {
            // Creates the new start & end indexes
            me.updateMountedAndVisibleRows();
            endIndex = mountedRows[1]
        }

        me.createRowPool();

        poolSize = me.items.length;

        // Fixed-DOM-Order Strategy:
        // We do NOT clear vdomRoot.cn. The Row components remain in the VDOM array.
        // We iterate the logical range, mapping records to the fixed pool items via modulo.

        let usedMap = new Array(poolSize).fill(false);

        for (i=mountedRows[0]; i < endIndex; i++) {
            itemIndex = i % poolSize;
            item      = me.items[itemIndex];

            usedMap[itemIndex] = true;

            item.updateContent({
                force,
                record  : store.getAt(i),
                recycle,
                rowIndex: i,
                silent  : true
            });
        }

        // Hide unused pool items (e.g. when filtering or at the end of the store)
        for (i = 0; i < poolSize; i++) {
            if (!usedMap[i]) {
                item = me.items[i];
                // Only update if it currently has a record (was visible)
                if (item.record) {
                    item.updateContent({
                        record  : null,
                        rowIndex: -1,
                        silent  : true
                    })
                }
            }
        }

        me.parent.isLoading = false;

        me.updateScrollHeight(true, range); // silent

        if (!silent) {
            me.updateDepth = -1;
            me.update()
        }
    }

    /**
     * @param args
     */
    destroy(...args) {
        let me = this;

        for (let i = 0, len = me.items.length; i < len; i++) {
            me.items[i].destroy()
        }

        me.store = null; // remove the listeners

        super.destroy(...args)
    }

    /**
     * @param {Object} data
     * @param {String} eventName
     */
    fireCellEvent(data, eventName) {
        let me        = this,
            id        = data.currentTarget,
            dataField, record, recordId, target;

        for (target of data.path) {
            if (target.data?.field) {
                dataField = target.data.field;
                recordId  = target.data.recordId;
                record    = me.getRecord(recordId);
                break
            }
        }

        if (!dataField) {
            dataField = me.getCellDataField(id);
            record    = me.getRecord(id)
        }

        me.parent.fire(eventName, {body: me, data, dataField, record})
    }

    /**
     * @param {Object} data
     * @param {String} eventName
     */
    fireRowEvent(data, eventName) {
        let me     = this,
            id     = data.currentTarget,
            record, recordId, target;

        for (target of data.path) {
            if (target.cls?.includes('neo-grid-row') && target.data?.recordId) {
                recordId = target.data.recordId;
                record   = me.getRecord(recordId);
                break
            }
        }

        if (!record) {
            record = me.getRecord(id)
        }

        me.parent.fire(eventName, {body: me, data, record})
    }

    /**
     * @param {String} cellId
     * @returns {String}
     */
    getCellDataField(cellId) {
        return this.getDataField(cellId)
    }

    /**
     * @param {Number} rowIndex
     * @param {String} dataField
     * @returns {String}
     */
    getCellId(rowIndex, dataField) {
        let me          = this,
            column      = me.getColumn(dataField),
            columnIndex = me.getColumn(dataField, true),
            rowId       = me.getRowId(rowIndex);

        if (column.hideMode === 'removeDom') {
            return `${rowId}__cell-${columnIndex % me.cellPoolSize}`
        }

        return `${rowId}__${dataField}`
    }

    /**
     * @param {Object} record
     * @param {String} dataField
     * @returns {String}
     */
    getLogicalCellId(record, dataField) {
        return `${this.getRecordId(record)}__${dataField}`
    }

    /**
     * Get a grid column or column index by a given field name
     * @param {String} field
     * @param {Boolean} returnIndex=false
     * @returns {Object|Number|null}
     */
    getColumn(field, returnIndex=false) {
        let {columns} = this.parent,
            column    = columns.get(field);

        if (column) {
            return returnIndex ? columns.indexOf(column) : column
        }

        return null
    }

    /**
     * Get all painted column cells (visible + buffer range)
     * @param {String} dataField
     * @returns {Object[]}
     */
    getColumnCells(dataField) {
        let me          = this,
            cells       = [],
            columnIndex = -1,
            firstRow    = me.items[0].vdom,
            i           = 0,
            len         = firstRow.cn.length,
            cell;

        // Columns might get moved via drag&drop, so let's check for the current match
        for (; i < len; i++) {
            if (dataField === me.getDataField(firstRow.cn[i].id)) {
                columnIndex = i;
                break;
            }
        }

        if (columnIndex > -1) {
            for (i = 0, len = me.items.length; i < len; i++) {
                cell = me.items[i].vdom.cn[columnIndex];
                cell && cells.push(cell)
            }
        }

        return cells
    }

    /**
     * @param {String} cellId
     * @returns {String}
     */
    getDataField(cellId) {
        if (cellId.includes('__cell-')) {
            let me            = this,
                poolIndex     = parseInt(cellId.split('__cell-')[1]),
                columns       = me.parent.columns,
                {cellPoolSize, mountedColumns} = me,
                i             = mountedColumns[0],
                len           = mountedColumns[1],
                column;

            for (; i <= len; i++) {
                if (i % cellPoolSize === poolIndex) {
                    column = columns.getAt(i);
                    // Sanity check: ensure this column is actually pooled
                    if (column && column.hideMode === 'removeDom') {
                        return column.dataField
                    }
                }
            }
        }

        return cellId.split('__').pop()
    }

    /**
     * Get the matching record by passing a row id, a cell id or an id inside a grid cell.
     * Limited to mounted rows (must be inside the vdom).
     * @param {String} nodeId
     * @returns {Object|null}
     */
    getRecord(nodeId) {
        let me     = this,
            record = me.getRecordByRowId(nodeId),
            node, parentNodes;

        if (record) {
            return record;
        }

        // Check if nodeId is a recordId (internalId or PK)
        record = me.store.get(nodeId);
        if (record) return record;

        parentNodes = VDomUtil.getParentNodes(me.vdom, nodeId);

        for (node of parentNodes || []) {
            record = me.getRecordByRowId(node.componentId || node.id);

            if (record) {
                return record
            }
        }

        return null
    }

    /**
     * @param {Object} record
     * @returns {String|Number}
     */
    getRecordId(record) {
        return this.useInternalId ? this.store.getInternalId(record) : this.store.getKey(record)
    }

    /**
     * @param {String} logicalId
     * @returns {Neo.data.Model|null}
     */
    getRecordFromLogicalId(logicalId) {
        let me        = this,
            dataField = me.getDataField(logicalId),
            recordId  = logicalId.substring(0, logicalId.length - dataField.length - 2),
            record    = me.getRecord(recordId); // Uses the new robust getRecord()

        if (!record) {
            record = me.store.get(parseInt(recordId))
        }

        return record
    }

    /**
     * @param {String} rowId
     * @returns {Record|null}
     */
    getRecordByRowId(rowId) {
        let me       = this,
            node     = Neo.getComponent(rowId)?.vdom,
            rowIndex = node?.['aria-rowindex'];

        if (Neo.isNumber(rowIndex)) {
            // aria-rowindex is 1 based & also includes the header
            rowIndex -= 2;

            return me.store.getAt(rowIndex)
        }

        return null
    }

    /**
     * @param {Object} record
     * @returns {Neo.grid.Row|null}
     */
    getRow(record) {
        let me       = this,
            rowIndex = me.store.indexOf(record),
            itemIndex;

        if (rowIndex > -1 && rowIndex >= me.mountedRows[0] && rowIndex <= me.mountedRows[1]) {
            itemIndex = rowIndex % me.items.length;
            return me.items[itemIndex]
        }

        return null
    }

    /**
     * Override this method to apply custom CSS rules to grid rows
     * @param {Object} record
     * @param {Number} rowIndex
     * @returns {String[]}
     */
    getRowClass(record, rowIndex) {
        return ['neo-grid-row']
    }

    /**
     * @param {Number} rowIndex
     * @returns {String}
     */
    getRowId(rowIndex) {
        let me = this;

        if (me.#initialChunkSize > 0) {
            return `${me.id}__row-${rowIndex}`
        } else {
            return `${me.id}__row-${rowIndex % (me.availableRows + 2 * me.bufferRowRange)}`
        }
    }

    /**
     * @override
     * @returns {*}
     */
    getVdomRoot() {
        return this.vdom.cn[0]
    }

    /**
     * @returns {Object[]} The new vdom items root
     */
    getVdomItemsRoot() {
        return this.vdom.cn[0]
    }

    /**
     * @override
     * @returns {Neo.vdom.VNode}
     */
    getVnodeRoot() {
        return this.vnode.childNodes[0]
    }

    /**
     * @param {Object} data
     */
    onCellClick(data) {
        this.fireCellEvent(data, 'cellClick')
    }

    /**
     * @param {Object} data
     */
    onCellDoubleClick(data) {
        this.fireCellEvent(data, 'cellDoubleClick')
    }

    /**
     *
     */
    onConstructed() {
        super.onConstructed();
        this.selectionModel?.register(this)
    }

    /**
     * @param {Object} data
     */
    onRowClick(data) {
        this.focus(this.vdom.id, false, true);
        this.fireRowEvent(data, 'rowClick')
    }

    /**
     * @param {Object} data
     */
    onRowDoubleClick(data) {
        this.fireRowEvent(data, 'rowDoubleClick')
    }

    /**
     * @param {Object} data
     */
    onScrollCapture(data) {
        super.onScrollCapture(data);
        this.parent.scrollManager.onBodyScroll(data)
    }

    /**
     * @param {Object} data
     */
    onStoreFilter() {
        this.onStoreLoad({items: this.store.items})
    }

    /**
     * @param {Object}   data
     * @param {Object[]} data.items
     * @param {Boolean}  [data.postChunkLoad]
     * @param {Number}   [data.total]
     * @protected
     */
    onStoreLoad({items, postChunkLoad, total}) {
        let me         = this,
            {windowId} = me;

        // If it's the first chunked load (data.total exists and data.items is a subset of total)
        // Render the entire chunk for immediate scrollability
        if (total && items.length < total) {
            me.#initialChunkSize = items.length;
            me.#initialTotalSize = total;
            me.createViewData();
            me.#initialChunkSize = 0
            me.#initialTotalSize = 0
        } else {
            me.createViewData()
        }

        if (me.mounted && !postChunkLoad) {
            me.timeout(50).then(() => {
                Neo.main.DomAccess.scrollTo({
                    direction: 'top',
                    id       : me.vdom.id,
                    value    : 0,
                    windowId
                })
            })
        }
    }

    /**
     * @param {Object}         data
     * @param {Object[]}       data.fields Each field object contains the keys: name, oldValue, value
     * @param {Neo.data.Model} data.model  The model instance of the changed record
     * @param {Object}         data.record
     */
    onStoreRecordChange({fields, record}) {
        let me                            = this,
            fieldNames                    = fields.map(field => field.name),
            rowIndex                      = me.store.indexOf(record),
            {mountedRows, selectionModel} = me,
            poolSize                      = me.items.length,
            itemIndex, recordId, row;

        if (fieldNames.includes(me.colspanField)) {
            me.createViewData()
        } else {
            if (rowIndex >= mountedRows[0] && rowIndex <= mountedRows[1]) {
                itemIndex = rowIndex % poolSize;
                row       = me.items[itemIndex];

                if (row) {
                    row.createVdom()
                }

                for (let i = 0, len = fields.length; i < len; i++) {
                    let field = fields[i];
                    if (field.name === me.selectedRecordField) {
                        if (selectionModel.ntype === 'selection-grid-rowmodel') {
                            recordId = me.getRecordId(record);

                            selectionModel[field.value ? 'selectRow' : 'deselectRow'](recordId)
                        }
                    }
                }
            }
        }
    }

    /**
     * Used for keyboard navigation (selection models)
     * @param {Number} index
     * @param {Number} step
     */
    scrollByRows(index, step) {
        let me                         = this,
            {mountedRows, visibleRows} = me,
            countRecords               = me.store.getCount(),
            newIndex                   = index + step,
            lastRowGap, mounted, scrollTop, visible;

        if (newIndex >= countRecords) {
            newIndex %= countRecords;
            step     = newIndex - index
        }

        while (newIndex < 0) {
            newIndex += countRecords;
            step     += countRecords
        }

        mounted = newIndex >= mountedRows[0] && newIndex <= mountedRows[1];

        // Not using >= or <=, since the first / last row might not be fully visible
        visible = newIndex > visibleRows[0] && newIndex < visibleRows[1];

        if (!visible) {
            // Leaving the mounted area will re-calculate the visibleRows for us
            if (mounted) {
                visibleRows[0] += step;
                visibleRows[1] += step
            }

            if (step < 0) {
                scrollTop = newIndex * me.rowHeight
            } else {
                lastRowGap = me.rowHeight - (me.availableHeight % me.rowHeight);
                scrollTop  = (newIndex - me.availableRows) * me.rowHeight + lastRowGap
            }

            Neo.main.DomAccess.scrollTo({
                id      : me.vdom.id,
                value   : scrollTop,
                windowId: me.windowId
            })
        }
    }

    /**
     * @param {Boolean} [force=false]
     */
    updateMountedAndVisibleColumns(force=false) {
        let me       = this,
            {bufferColumnRange, cellPoolSize, columnPositions, mountedColumns, visibleColumns} = me,
            i            = 0,
            countColumns = columnPositions.getCount(),
            endIndex     = countColumns - 1,
            x            = me.scrollLeft,
            column, newPoolSize, startIndex = 0;

        if (countColumns < 1) {
            return
        }

        for (; i < countColumns; i++) {
            column = columnPositions.getAt(i);

            if (x >= column.x && x <= column.x + column.width) {
                startIndex = i
            }

            if (me.containerWidth + x < column.x) {
                endIndex = i - 1;
                break
            }
        }

        visibleColumns[0] = startIndex; // update the array inline
        visibleColumns[1] = endIndex;

        if (force || visibleColumns[0] <= mountedColumns[0] || visibleColumns[1] >= mountedColumns[1]) {
            startIndex = Math.max(0, visibleColumns[0] - bufferColumnRange);
            endIndex   = Math.min(countColumns - 1, visibleColumns[1] + bufferColumnRange);

            if (endIndex - startIndex >= cellPoolSize) {
                newPoolSize = endIndex - startIndex + 5;
            }

            me.set({
                cellPoolSize  : newPoolSize || cellPoolSize,
                mountedColumns: [startIndex, endIndex]
            })
        }
    }

    /**
     *
     */
    updateMountedAndVisibleRows() {
        let me             = this,
            {bufferRowRange, availableRows, startIndex, store} = me,
            countRecords   = store.getCount(),
            windowSize     = availableRows + 2 * bufferRowRange,
            endIndex       = Math.min(countRecords, startIndex + availableRows),
            mountedStart   = startIndex - bufferRowRange,
            mountedEnd     = endIndex   + bufferRowRange;

        me.visibleRows[0] = startIndex; // update the array inline
        me.visibleRows[1] = endIndex;

        // We want to maintain a constant window size (Modulus) to ensure row recycling works
        // via moveNode operations instead of removeNode + insertNode.
        // If we are at the top, extend the end to fill the window.
        if (mountedStart < 0) {
            mountedEnd  += Math.abs(mountedStart);
            mountedStart = 0
        }

        // Clamp to record count
        mountedEnd = Math.min(countRecords, mountedEnd);

        // If we are at the bottom (hit the ceiling), pull the start back to fill the window.
        // This ensures we keep the DOM nodes alive for as long as possible.
        if (mountedEnd - mountedStart < windowSize) {
            let needed   = windowSize - (mountedEnd - mountedStart);
            mountedStart = Math.max(0, mountedStart - needed)
        }

        me.mountedRows[0] = mountedStart; // update the array inline
        me.mountedRows[1] = mountedEnd
    }

    /**
     * @param {Boolean} silent=false
     */
    updateScrollHeight(silent=false) {
        let me           = this,
            countRecords = me.#initialTotalSize || me.store?.count || 0,
            {rowHeight}  = me;

        if (countRecords > 0 && rowHeight > 0) {
            me.vdom.cn[0].height = `${(countRecords + 1) * rowHeight}px`;
            !silent && me.update()
        }
    }

    /**
     * @returns {Object}
     */
    toJSON() {
        let me = this;

        return {
            ...super.toJSON(),
            animatedRowSorting    : me.animatedRowSorting,
            bufferColumnRange     : me.bufferColumnRange,
            bufferRowRange        : me.bufferRowRange,
            colspanField          : me.colspanField,
            highlightModifiedCells: me.highlightModifiedCells,
            rowHeight             : me.rowHeight,
            selectedRecordField   : me.selectedRecordField,
            selectionModel        : me.selectionModel?.toJSON()
        }
    }
}

export default Neo.setupClass(GridBody);
