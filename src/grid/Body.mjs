import Container    from '../container/Base.mjs';
import NeoArray     from '../util/Array.mjs';
import Row          from './Row.mjs';
import RowModel     from '../selection/grid/RowModel.mjs';
import VDomUtil     from '../util/VDom.mjs';

/**
 * @class Neo.grid.Body
 * @extends Neo.container.Base
 */
class GridBody extends Container {
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
         * @member {Object} layout=null
         */
        layout: null,
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
        oldValue !== undefined && this.createViewData()
    }

    /**
     * Triggered after the bufferRowRange config got changed
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetBufferRowRange(value, oldValue) {
        oldValue !== undefined && this.createViewData()
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
        this.toggleCls('neo-is-scrolling', value)
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

        // Clear component instances when the store changes or is replaced
        if (oldValue) {
            me.clearComponentColumnMaps();
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

        return Neo.ClassSystemUtil.beforeSetInstance(value, RowModel)
    }

    /**
     * Destroys all component instances created by component columns.
     * @protected
     */
    clearComponentColumnMaps() {
        let me      = this,
            columns = me.parent.columns.items;

        columns.forEach(column => {
            if (column instanceof Neo.grid.column.Component) {
                column.map.forEach(component => {
                    component.destroy()
                });
                column.map.clear()
            }
        });
    }

    /**
     * Cleans up component instances that are no longer visible or needed.
     * @protected
     */
    cleanupComponentInstances() {
        let me = this;

        me.parent.columns.items.forEach(column => {
            if (column instanceof Neo.grid.column.Component) {
                column.map.forEach((component, id) => {
                    // Extract rowIndex from component ID (e.g., "grid-body-1-component-950")
                    const componentRowIndex = parseInt(id.split('-').pop());

                    if (componentRowIndex < me.mountedRows[0] || componentRowIndex > me.mountedRows[1]) {
                        component.destroy();
                        column.map.delete(id)
                    }
                });
            }
        });
    }

    /**
     * Ensures we have enough Row components in the pool
     * @protected
     */
    createRowPool() {
        let me          = this,
            needed      = me.availableRows + 2 * me.bufferRowRange,
            current     = me.items ? me.items.length : 0,
            delta       = needed - current,
            newRows     = [];

        if (delta > 0) {
            for (let i = 0; i < delta; i++) {
                newRows.push({
                    module       : Row,
                    gridContainer: me.parent,
                    record       : null,
                    rowIndex     : -1
                })
            }
            me.add(newRows)
        } else if (delta < 0) {
            // Optional: Destroy excess rows if we want to reclaim memory strictly
            // For now, we keep them as a buffer
        }
    }

    /**
     * @param {Boolean} silent=false
     */
    createViewData(silent=false) {
        let me                   = this,
            {mountedRows, store} = me,
            endIndex, i, item, itemIndex, poolSize, range;

        if (
            store.isLoading                   ||
            me.availableRows              < 1 ||
            me._containerWidth            < 1 || // we are not checking me.containerWidth, since we want to ignore the config symbol
            me.columnPositions.getCount() < 1 ||
            me.mountedColumns[1]          < 1
        ) {
            return
        }

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

        for (i=mountedRows[0]; i < endIndex; i++) {
            itemIndex = i % poolSize;
            item      = me.items[itemIndex];

            // Only update if changed (Row component will handle VDOM diff)
            if (item.rowIndex !== i) {
                item.set({
                    record  : store.getAt(i),
                    rowIndex: i
                })
            }
        }

        me.parent.isLoading = false;

        me.updateScrollHeight(true, range); // silent
        !silent && me.update()
    }

    /**
     * @param args
     */
    destroy(...args) {
        this.store = null; // remove the listeners
        this.clearComponentColumnMaps(); // Destroy component instances

        super.destroy(...args)
    }

    /**
     * @param {Object} data
     * @param {String} eventName
     */
    fireCellEvent(data, eventName) {
        let me        = this,
            id        = data.currentTarget,
            dataField = me.getCellDataField(id),
            record    = me.getRecord(id);

        me.parent.fire(eventName, {body: me, data, dataField, record})
    }

    /**
     * @param {Object} data
     * @param {String} eventName
     */
    fireRowEvent(data, eventName) {
        let me     = this,
            id     = data.currentTarget,
            record = me.getRecord(id);

        me.parent.fire(eventName, {body: me, data, record})
    }

    /**
     * @param {String} cellId
     * @returns {String}
     */
    getCellDataField(cellId) {
        return cellId.split('__')[2]
    }

    /**
     * @param {Number} rowIndex
     * @param {String} dataField
     * @returns {String}
     */
    getCellId(rowIndex, dataField) {
        return this.getRowId(rowIndex) + '__' + dataField
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
            vdomRoot    = me.getVdomRoot(),
            firstRow    = vdomRoot.cn[0],
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
            vdomRoot.cn.forEach(row => {
                cell = row.cn[columnIndex];
                cell && cells.push(cell)
            })
        }

        return cells
    }

    /**
     * @param {String} cellId
     * @returns {String}
     */
    getDataField(cellId) {
        return cellId.split('__')[2]
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

        parentNodes = VDomUtil.getParentNodes(me.vdom, nodeId);

        for (node of parentNodes || []) {
            record = me.getRecordByRowId(node.id);

            if (record) {
                return record
            }
        }

        return null
    }

    /**
     * @param {String} rowId
     * @returns {Record|null}
     */
    getRecordByRowId(rowId) {
        let me       = this,
            node     = me.getVdomChild(rowId),
            rowIndex = node['aria-rowindex'];

        if (Neo.isNumber(rowIndex)) {
            // aria-rowindex is 1 based & also includes the header
            rowIndex -= 2;

            return me.store.getAt(rowIndex)
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

        /*
         * Fast path to handle clearing all rows (e.g., store.removeAll()).
         * A full vdom diff against all existing rows is a performance bottleneck.
         * This logic bypasses the standard update() cycle by directly clearing the vdom,
         * vnode cache and the real DOM via textContent.
         */
        if (items?.length < 1) {
            const vdomRoot = me.getVdomRoot();

            // No change, opt out
            if (vdomRoot.cn.length < 1) {
                return
            }

            vdomRoot.cn = [];
            me.getVnodeRoot().childNodes = [];

            Neo.applyDeltas(windowId, {
                id         : vdomRoot.id,
                textContent: ''
            });

            return
        }

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

        // Cleanup component instances after chunked load
        if (postChunkLoad) {
            me.cleanupComponentInstances()
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
            column, itemIndex, needsUpdate, recordId, row;

        if (fieldNames.includes(me.colspanField)) {
            // Full row rebuild needed? Row component handles it via createVdom
            needsUpdate = true
        } else {
            if (rowIndex >= mountedRows[0] && rowIndex <= mountedRows[1]) {
                itemIndex = rowIndex % poolSize;
                row       = me.items[itemIndex];

                if (row) {
                    row.record = record; // Triggers update
                }

                // Component columns might need manual triggers?
                // No, Row component should handle this eventually.
                // For now, we assume Row component handles content.

                fields.forEach(field => {
                    if (field.name === me.selectedRecordField) {
                        if (selectionModel.ntype === 'selection-grid-rowmodel') {
                            recordId = record[me.store.getKeyProperty()];

                            selectionModel[field.value ? 'selectRow' : 'deselectRow'](recordId)
                        }
                    }
                })
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
     *
     */
    updateMountedAndVisibleColumns() {
        let me       = this,
            {bufferColumnRange, columnPositions, mountedColumns, visibleColumns} = me,
            i            = 0,
            countColumns = columnPositions.getCount(),
            endIndex     = countColumns - 1,
            x            = me.scrollLeft,
            column, startIndex;

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

        if (visibleColumns[0] <= mountedColumns[0] || visibleColumns[1] >= mountedColumns[1]) {
            startIndex = Math.max(0, visibleColumns[0] - bufferColumnRange);
            endIndex   = Math.min(countColumns - 1, visibleColumns[1] + bufferColumnRange);

            me.mountedColumns = [startIndex, endIndex]
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
