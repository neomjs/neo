import ClassSystemUtil from '../util/ClassSystem.mjs';
import Component       from '../component/Base.mjs';
import NeoArray        from '../util/Array.mjs';
import RowModel        from '../selection/table/RowModel.mjs';
import VDomUtil        from '../util/VDom.mjs';

/**
 * @class Neo.table.View
 * @extends Neo.component.Base
 */
class View extends Component {
    static config = {
        /**
         * @member {String} className='Neo.table.View'
         * @protected
         */
        className: 'Neo.table.View',
        /**
         * @member {String} ntype='table-view'
         * @protected
         */
        ntype: 'table-view',
        /**
         * @member {String[]} baseCls=['neo-table-view']
         */
        baseCls: ['neo-table-view'],
        /**
         * Define which model field contains the value of colspan definitions
         * @member {String} colspanField='colspan'
         */
        colspanField: 'colspan',
        /**
         * @member {String|null} containerId=null
         * @protected
         */
        containerId: null,
        /**
         * @member {Boolean} highlightModifiedCells_=false
         */
        highlightModifiedCells_: false,
        /**
         * Additional used keys for the selection model
         * @member {Object} keys
         */
        keys: {},
        /**
         * @member {Object} recordVnodeMap={}
         */
        recordVnodeMap: {},
        /**
         * @member {Neo.selection.Model} selectionModel_=null
         */
        selectionModel_: null,
        /**
         * @member {String} selectedRecordField='annotations.selected'
         */
        selectedRecordField: 'annotations.selected',
        /**
         * @member {Neo.data.Store|null} store_=null
         */
        store_: null,
        /**
         * @member {Boolean} useRowRecordIds=true
         */
        useRowRecordIds: true,
        /**
         * @member {Object} _vdom={tag: 'tbody', cn : []}
         */
        _vdom:
        {tag: 'tbody', tabIndex: -1, cn: []}
    }

    /**
     * @member {String[]} selectedRows
     */
    get selectedRows() {
        if (this.selectionModel.ntype === 'selection-table-rowmodel') {
            return this.selectionModel.items
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
            delegate: '.neo-table-cell',
            scope   : me
        }, {
            click   : me.onRowClick,
            dblclick: me.onRowDoubleClick,
            delegate: '.neo-table-row',
            scope   : me
        }])
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
     * @param {Neo.table.Container} data.tableContainer
     * @returns {Object}
     */
    applyRendererOutput(data) {
        let {cellId, column, columnIndex, record, rowIndex, tableContainer} = data,
            me          = this,
            cellCls     = ['neo-table-cell'],
            colspan     = record[me.colspanField],
            {dataField} = column,
            {model}     = me.store,
            fieldValue  = record[dataField],
            hasStore    = !!model, // todo: remove as soon as all tables use stores (examples table)
            {vdom}      = me,
            cellConfig, rendererOutput;

        if (!model?.getField(dataField)) {
            let nsArray   = dataField.split('.'),
                fieldName = nsArray.pop();

            fieldValue = Neo.ns(nsArray, false, record[Symbol.for('data')])?.[fieldName]
        }

        if (fieldValue === null || fieldValue === undefined) {
            fieldValue = ''
        }

        me.bindCallback(column.renderer, 'renderer', column.rendererScope || tableContainer, column);

        rendererOutput = column.renderer.call(column.rendererScope || tableContainer, {
            column,
            columnIndex,
            dataField,
            record,
            rowIndex,
            tableContainer,
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
            // todo: remove the else part as soon as all tables use stores (examples table)
            if (hasStore) {
                cellId = me.getCellId(record, column.dataField)
            } else {
                cellId = vdom.cn[rowIndex]?.cn[me.getColumn(column.dataField, true)]?.id || Neo.getId('td')
            }
        }

        cellConfig = {
            tag  : 'td',
            id   : cellId,
            cls  : cellCls,
            style: rendererOutput.style || {}
        };

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

        let me              = this,
            tableContainer  = me.parent,
            colspan         = record[me.colspanField],
            colspanKeys     = colspan && Object.keys(colspan),
            columns         = tableContainer.items[0].items,
            colCount        = columns.length,
            dockLeftMargin  = 0,
            dockRightMargin = 0,
            id              = me.getRowId(record, rowIndex),
            {selectedRows}  = me,
            trCls           = me.getTrClass(record, rowIndex),
            config, column, columnIndex, i, tableRow;

        me.recordVnodeMap[id] = rowIndex;

        if (selectedRows && record[me.selectedRecordField]) {
            NeoArray.add(selectedRows, id)
        }

        if (selectedRows?.includes(id)) {
            trCls.push('neo-selected');

            me.parent.fire('select', {
                record
            })
        }

        tableRow = {
            tag: 'tr',
            id,
            cls: trCls,
            cn : []
        };

        for (i=0; i < colCount; i++) {
            column = columns[i];
            config = me.applyRendererOutput({column, columnIndex: i, record, rowIndex, tableContainer});

            if (column.dock) {
                config.cls = ['neo-locked', ...config.cls || []];

                if (column.dock === 'left') {
                    config.style.left = dockLeftMargin + 'px';
                    dockLeftMargin += (column.width + 1) // todo: borders fix
                }
            }

            if (column.flex) {
                config.style.width = '100%'
            }

            tableRow.cn.push(config);

            if (colspanKeys?.includes(column.dataField)) {
                i += (colspan[column.dataField] - 1)
            }
        }

        for (i=0; i < colCount; i++) {
            columnIndex = colCount - i -1;
            column      = columns[columnIndex];

            if (column.dock === 'right') {
                tableRow.cn[columnIndex].style.right = dockRightMargin + 'px';
                dockRightMargin += (column.width + 1) // todo: borders fix
            }

            if (colspanKeys?.includes(column.dataField)) {
                i += (colspan[column.dataField] - 1)
            }
        }

        // the dock margins are the same for each row
        rowIndex === 0 && Object.assign(tableContainer, {dockLeftMargin, dockRightMargin});

        return tableRow
    }

    /**
     *
     */
    createViewData() {
        let me                    = this,
            {selectedRows, store} = me,
            countRecords          = store.getCount(),
            i                     = 0,
            rows                  = [];

        for (; i < countRecords; i++) {
            rows.push(me.createRow({record: store.items[i], rowIndex: i}))
        }

        me.vdom.cn = rows;

        me.promiseUpdate().then(() => {
            if (selectedRows?.length > 0) {
                // this logic only works for selection.table.RowModel
                Neo.main.DomAccess.scrollToTableRow({appName: me.appName, id: selectedRows[0]})
            }
        })
    }

    /**
     * @param args
     */
    destroy(...args) {
        this.store = null;
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
        return this.id + '__' + record[this.store.keyProperty] + '__' + dataField
    }

    /**
     * Get a table column or column index by a given field name
     * @param {String} field
     * @param {Boolean} returnIndex=false
     * @returns {Object|Number|null}
     */
    getColumn(field, returnIndex=false) {
        let container = this.parent,
            columns   = container.headerToolbar.items,
            i         = 0,
            len       = columns.length,
            column;

        for (; i < len; i++) {
            column = columns[i];

            if (column.dataField === field) {
                return returnIndex ? i : column
            }
        }

        return null
    }

    /**
     * @param {String} cellId
     * @returns {String}
     */
    getDataField(cellId) {
        return cellId.split('__')[2]
    }

    /**
     * Get the matching record by passing a row id, a cell id or an id inside a table cell.
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

        for (node of parentNodes) {
            record = me.getRecordByRowId(node.id);

            if (record) {
                return record
            }
        }

        return null
    }

    /**
     * @param {String} rowId
     * @returns {Object}
     */
    getRecordByRowId(rowId) {
        return this.store.getAt(this.recordVnodeMap[rowId])
    }

    /**
     * @param {Object} record
     * @param {Number} [index]
     * @returns {String}
     */
    getRowId(record, index) {
        let me      = this,
            {store} = me;

        if (me.useRowRecordIds) {
            return `${me.id}__tr__${record[store.keyProperty]}`
        } else {
            index = Neo.isNumber(index) ? index : store.indexOf(record);
            return me.vdom.cn[index]?.id || Neo.getId('tr')
        }
    }

    /**
     * Override this method to apply custom CSS rules to table rows
     * @param {Object} record
     * @param {Number} rowIndex
     * @returns {String[]}
     */
    getTrClass(record, rowIndex) {
        return ['neo-table-row']
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
     * Gets triggered after changing the value of a record field.
     * E.g. myRecord.foo = 'bar';
     * @param {Object} opts
     * @param {Object[]} opts.fields Each field object contains the keys: name, oldValue, value
     * @param {Neo.data.Model} opts.model The model instance of the changed record
     * @param {Object} opts.record
     */
    onStoreRecordChange({fields, record}) {
        let me                     = this,
            fieldNames             = fields.map(field => field.name),
            needsUpdate            = false,
            tableContainer         = me.parent,
            rowIndex               = me.store.indexOf(record),
            {selectionModel, vdom} = me,
            cellId, cellNode, cellVdom, column, columnIndex, scope;

        if (fieldNames.includes(me.colspanField)) {
            me.vdom.cn[rowIndex] = me.createRow({record, rowIndex});
            me.update()
        } else {
            fields.forEach(field => {
                if (field.name === me.selectedRecordField) {
                    if (selectionModel.ntype === 'selection-table-rowmodel') {
                        selectionModel[field.value ? 'select' : 'deselect'](me.getRowId(record))
                    }
                } else {
                    cellId   = me.getCellId(record, field.name);
                    cellNode = VDomUtil.find(vdom, cellId);

                    // the vdom might not exist yet => nothing to do in this case
                    if (cellNode?.vdom) {
                        column      = me.getColumn(field.name);
                        columnIndex = cellNode.index;
                        needsUpdate = true;
                        scope       = column.rendererScope || tableContainer;
                        cellVdom    = me.applyRendererOutput({cellId, column, columnIndex, record, rowIndex, tableContainer});

                        cellNode.parentNode.cn[columnIndex] = cellVdom
                    }
                }
            })
        }

        needsUpdate && me.update()
    }
}

export default Neo.setupClass(View);
