import ClassSystemUtil from '../util/ClassSystem.mjs';
import Collection      from '../collection/Base.mjs';
import Component       from '../component/Base.mjs';
import NeoArray        from '../util/Array.mjs';
import RowModel        from '../selection/grid/RowModel.mjs';
import VDomUtil        from '../util/VDom.mjs';

/**
 * @class Neo.grid.View
 * @extends Neo.component.Base
 */
class GridView extends Component {
    static config = {
        /**
         * @member {String} className='Neo.grid.View'
         * @protected
         */
        className: 'Neo.grid.View',
        /**
         * @member {String} ntype='grid-view'
         * @protected
         */
        ntype: 'grid-view',
        /**
         * @member {Boolean} animatedRowSorting_=false
         */
        animatedRowSorting_: false,
        /**
         * Internal flag. Gets calculated when mounting the grid.Container
         * @member {Number} availableHeight_=0
         */
        availableHeight_: 0,
        /**
         * Internal flag. Gets calculated when changing the availableHeight config
         * @member {Number} availableRows_=0
         */
        availableRows_: 0,
        /**
         * Internal flag. Gets calculated after mounting grid.View rows
         * @member {Number} availableWidth_=0
         */
        availableWidth_: 0,
        /**
         * @member {String[]} baseCls=['neo-grid-view']
         * @protected
         */
        baseCls: ['neo-grid-view'],
        /**
         * The amount of columns (cells) to paint before the first & after the last visible column,
         * to enhance the scrolling performance
         * @member {Number} bufferColumnRange_=0
         */
        bufferColumnRange_: 0,
        /**
         * The amount of rows to paint before the first & after the last visible row,
         * to enhance the scrolling performance
         * @member {Number} bufferRowRange_=3
         */
        bufferRowRange_: 3,
        /**
         * Define which model field contains the value of colspan definitions
         * @member {String} colspanField='colspan'
         */
        colspanField: 'colspan',
        /**
         * Internal flag. Gets calculated after mounting grid.View rows
         * @member {Number} containerWidth_=0
         */
        containerWidth_: 0,
        /**
         * @member {Neo.collection.Base|null} columnPositions_=null
         * @protected
         */
        columnPositions_: null,
        /**
         * @member {Boolean} highlightModifiedCells_=false
         */
        highlightModifiedCells_: false,
        /**
         * @member {Boolean} isScrolling_=false
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
         */
        role: 'rowgroup',
        /**
         * Number in px
         * @member {Number} rowHeight_=0
         */
        rowHeight_: 0,
        /**
         * @member {Number} scrollLeft_=0
         * @protected
         */
        scrollLeft_: 0,
        /**
         * @member {Number} scrollTop_=0
         * @protected
         */
        scrollTop_: 0,
        /**
         * @member {Neo.selection.Model} selectionModel_=null
         */
        selectionModel_: null,
        /**
         * @member {String} selectedRecordField='annotations.selected'
         */
        selectedRecordField: 'annotations.selected',
        /**
         * @member {Number} startIndex_=0
         */
        startIndex_: 0,
        /**
         * @member {Neo.data.Store|null} store_=null
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
         * @member {String[]} wrapperCls=[]
         */
        wrapperCls: ['neo-grid-view-wrapper'],
        /**
         * @member {Object} _vdom
         */
        _vdom:
        {tabIndex: '-1', cn: [
            {cn: []}
        ]}
    }

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

        if (selectionModel.ntype === 'selection-grid-rowmodel') {
            return selectionModel.items
        }

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
     * Triggered after the id config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetId(value, oldValue) {
        this.vdom.id = value + '__wrapper';

        // silent vdom update, the super call will trigger the engine
        super.afterSetId(value, oldValue);
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
        this.rendered && value.register(this)
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
     * @param {Object} data
     * @param {String} [data.cellId]
     * @param {Object} data.column
     * @param {Number} data.columnIndex
     * @param {Object} data.record
     * @param {Number} data.rowIndex
     * @returns {Object}
     */
    applyRendererOutput(data) {
        let {cellId, column, columnIndex, record, rowIndex} = data,
            me                     = this,
            gridContainer          = me.parent,
            {selectedCells, store} = me,
            cellCls                = ['neo-grid-cell'],
            colspan                = record[me.colspanField],
            {dataField}            = column,
            {model}                = store,
            fieldValue             = record[dataField],
            cellConfig, rendererOutput;

        if (!model.getField(dataField)) {
            let nsArray   = dataField.split('.'),
                fieldName = nsArray.pop();

            fieldValue = Neo.ns(nsArray, false, record[Symbol.for('data')])?.[fieldName]
        }

        if (fieldValue === null || fieldValue === undefined) {
            fieldValue = ''
        }

        if (column.rendererScope === 'me' || column.rendererScope === 'this') {
            column.rendererScope = column;
        }

        rendererOutput = column.renderer.call(column.rendererScope || me, {
            column,
            columnIndex,
            dataField,
            gridContainer,
            record,
            rowIndex,
            store,
            value: fieldValue
        });

        switch (Neo.typeOf(rendererOutput)) {
            case 'Object': {
                if (rendererOutput.html) {
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

        if (me.highlightModifiedCells) {
            if (record.isModifiedField(dataField)) {
                cellCls.push('neo-is-modified')
            }
        }

        if (!cellId) {
            cellId = me.getCellId(record, column.dataField)
        }

        if (selectedCells.includes(cellId)) {
            cellCls.push('neo-selected')
        }

        if (me.selectionModel?.selectedColumns?.includes(dataField)) {
            NeoArray.add(cellCls, me.selectionModel.selectedColumnCellCls || 'neo-selected')
        }

        cellConfig = {
            'aria-colindex': columnIndex + 1, // 1 based
            id             : cellId,
            cls            : cellCls,
            role           : 'gridcell',
            style          : rendererOutput.style || {}
        };

        if (column.width) {
            cellConfig.style.minWidth = `${column.width}px`
        }

        if (colspan && Object.keys(colspan).includes(dataField)) {
            cellConfig.colspan = colspan[dataField]
        }

        if (Neo.typeOf(rendererOutput) === 'Object') {
            cellConfig.innerHTML = rendererOutput.html  || ''
        } else {
            cellConfig.cn = rendererOutput
        }

        return cellConfig
    }

    /**
     * Triggered when accessing the columnPositions config
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
     * @param {Object} opts
     * @param {Object} opts.record
     * @param {Number} [opts.rowIndex]
     * @returns {Object}
     */
    createRow({record, rowIndex}) {
        if (!Neo.isNumber(rowIndex)) {
            rowIndex = this.store.indexOf(record)
        }

        let me            = this,
            {mountedColumns, selectedRows} = me,
            gridContainer = me.parent,
            {columns}     = gridContainer,
            id            = me.getRowId(record, rowIndex),
            rowCls        = me.getRowClass(record, rowIndex),
            config, column, columnPosition,  gridRow, i;

        if (rowIndex % 2 !== 0) {
            rowCls.push('neo-even')
        }

        if (selectedRows && record[me.selectedRecordField]) {
            NeoArray.add(selectedRows, id)
        }

        if (selectedRows?.includes(id)) {
            rowCls.push('neo-selected');
            gridContainer.fire('select', {record})
        }

        gridRow = {
            id,
            'aria-rowindex': rowIndex + 2, // header row => 1, first body row => 2
            cls            : rowCls,
            cn             : [],
            role           : 'row',

            style: {
                height   : me.rowHeight + 'px',
                transform: `translate(0px, ${rowIndex * me.rowHeight}px)`
            }
        };

        for (i=mountedColumns[0]; i <= mountedColumns[1]; i++) {
            column = columns.getAt(i);
            config = me.applyRendererOutput({column, columnIndex: i, record, rowIndex});

            if (column.dock) {
                config.cls = ['neo-locked', ...config.cls || []]
            }

            columnPosition = me.columnPositions.get(column.dataField);

            config.style = {
                ...config.style,
                left : columnPosition.x     + 'px',
                width: columnPosition.width + 'px'
            }

            // Happens during a column header drag OP, when leaving the painted range
            if (columnPosition.hidden) {
                config.style.visibility = 'hidden'
            }

            gridRow.cn.push(config)
        }

        return gridRow
    }

    /**
     * @param {Boolean} silent=false
     */
    createViewData(silent=false) {
        let me                   = this,
            {mountedRows, store} = me,
            rows                 = [],
            i;

        if (
            store.isLoading                   ||
            me.availableRows              < 1 ||
            me._containerWidth            < 1 || // we are not checking me.containerWidth, since we want to ignore the config symbol
            me.columnPositions.getCount() < 1 ||
            me.mountedColumns[1]          < 1
        ) {
            return
        }

        // Creates the new start & end indexes
        me.updateMountedAndVisibleRows();

        for (i=mountedRows[0]; i < mountedRows[1]; i++) {
            rows.push(me.createRow({record: store.items[i], rowIndex: i}))
        }

        me.getVdomRoot().cn = rows;

        me.parent.isLoading = false;

        me.updateScrollHeight(true); // silent
        !silent && me.update()
    }

    /**
     * @param args
     */
    destroy(...args) {
        this.store = null; // remove the listeners

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

        me.parent.fire(eventName, {data, dataField, record, view: me})
    }

    /**
     * @param {Object} data
     * @param {String} eventName
     */
    fireRowEvent(data, eventName) {
        let me     = this,
            id     = data.currentTarget,
            record = me.getRecord(id);

        me.parent.fire(eventName, {data, record, view: me})
    }

    /**
     * @param {String} cellId
     * @returns {String}
     */
    getCellDataField(cellId) {
        return cellId.split('__')[2]
    }

    /**
     * @param {Object} record
     * @param {String} dataField
     * @returns {String}
     */
    getCellId(record, dataField) {
        return this.id + '__' + record[this.store.getKeyProperty()] + '__' + dataField
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
     * @param {String} cellId
     * @returns {Record}
     */
    getRecordByCellId(cellId) {
        let recordId = cellId.split('__')[1],
            {store}  = this,
            keyType  = store.getKeyType();

        if (keyType === 'int' || keyType === 'integer') {
            recordId = parseInt(recordId)
        }

        return store.get(recordId)
    }

    /**
     * @param {String} rowId
     * @returns {Record}
     */
    getRecordByRowId(rowId) {
        let recordId = rowId.split('__')[2],
            {store}  = this,
            keyType  = store.getKeyType();

        if (keyType === 'int' || keyType === 'integer') {
            recordId = parseInt(recordId)
        }

        return store.get(recordId)
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
     * @param {Object} record
     * @returns {String}
     */
    getRowId(record) {
        return `${this.id}__tr__${record[this.store.getKeyProperty()]}`
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
     *
     */
    onStoreFilter() {
        this.onStoreLoad()
    }

    /**
     * @param {Object[]} data
     * @protected
     */
    onStoreLoad(data) {
        let me = this;

        me.createViewData();

        if (me.mounted) {
            me.timeout(50).then(() => {
                Neo.main.DomAccess.scrollTo({
                    direction: 'top',
                    id       : me.vdom.id,
                    value    : 0
                })
            })
        }
    }

    /**
     * @param {Object}         data
     * @param {Object[]}       data.fields Each field object contains the keys: name, oldValue, value
     * @param {Neo.data.Model} data.model The model instance of the changed record
     * @param {Object}         data.record
     */
    onStoreRecordChange({fields, record}) {
        let me               = this,
            fieldNames       = fields.map(field => field.name),
            needsUpdate      = false,
            rowIndex         = me.store.indexOf(record),
            {selectionModel} = me,
            column, needsCellUpdate;

        if (fieldNames.includes(me.colspanField)) {
            me.vdom.cn[rowIndex] = me.createRow({record, rowIndex});
            me.update()
        } else {
            for (column of me.parent.columns.items) {
                if (
                    column instanceof Neo.grid.column.Component &&
                    Neo.typeOf(column.component === 'Function') &&
                    !fieldNames.includes(column.dataField)
                ) {
                    needsCellUpdate = me.updateCellNode(record, column.dataField);
                    needsUpdate     = needsUpdate || needsCellUpdate
                }
            }

            fields.forEach(field => {
                if (field.name === me.selectedRecordField) {
                    if (selectionModel.ntype === 'selection-grid-rowmodel') {
                        selectionModel[field.value ? 'select' : 'deselect'](me.getRowId(record))
                    }
                } else {
                    needsCellUpdate = me.updateCellNode(record, field.name);
                    needsUpdate     = needsUpdate || needsCellUpdate
                }
            })
        }

        needsUpdate && me.update()
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
     * Update the cell vdom silently
     * @param {Record} record
     * @param {String} dataField
     * @returns {Boolean} true in case the view needs an update
     */
    updateCellNode(record, dataField) {
        let me          = this,
            cellId      = me.getCellId(record, dataField),
            cellNode    = VDomUtil.find(me.vdom, cellId),
            needsUpdate = false,
            rowIndex    = me.store.indexOf(record),
            cellStyle, cellVdom, column, columnIndex;

        // The vdom might not exist yet => nothing to do in this case
        if (cellNode?.vdom) {
            cellStyle   = cellNode.vdom.style;
            column      = me.getColumn(dataField);
            columnIndex = cellNode.index;
            cellVdom    = me.applyRendererOutput({cellId, column, columnIndex, record, rowIndex});
            needsUpdate = true;

            // The cell-positioning logic happens outside applyRendererOutput()
            // We need to preserve these styles
            Object.assign(cellVdom.style, {
                left : cellStyle.left,
                width: cellStyle.width
            });

            cellNode.parentNode.cn[columnIndex] = cellVdom
        }

        return needsUpdate
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
        let me           = this,
            {bufferRowRange, startIndex, store} = me,
            countRecords = store.getCount(),
            endIndex     = Math.min(countRecords, startIndex + me.availableRows);

        me.visibleRows[0] = startIndex; // update the array inline
        me.visibleRows[1] = endIndex;

        startIndex = Math.max(0, startIndex - bufferRowRange);
        endIndex   = Math.min(countRecords, endIndex + bufferRowRange);

        me.mountedRows[0] = startIndex; // update the array inline
        me.mountedRows[1] = endIndex
    }

    /**
     * @param {Boolean} silent=false
     */
    updateScrollHeight(silent=false) {
        let me           = this,
            countRecords = me.store.getCount(),
            {rowHeight}  = me;

        if (countRecords > 0 && rowHeight > 0) {
            me.vdom.cn[0].height = `${(countRecords + 1) * rowHeight}px`;
            !silent && me.update()
        }
    }
}

export default Neo.setupClass(GridView);
