import Component from '../component/Base.mjs';
import NeoArray  from '../util/Array.mjs';
import VDomUtil  from '../util/VDom.mjs';

/**
 * @class Neo.grid.View
 * @extends Neo.component.Base
 */
class View extends Component {
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
         * @member {String[]} baseCls=['neo-grid-view']
         */
        baseCls: ['neo-grid-view'],
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
         * @member {Object} recordVnodeMap={}
         */
        recordVnodeMap: {},
        /**
         * @member {String} selectedRecordField='annotations.selected'
         */
        selectedRecordField: 'annotations.selected',
        /**
         * @member {Neo.data.Store|null} store=null
         */
        store: null,
        /**
         * @member {Boolean} useRowRecordIds=true
         */
        useRowRecordIds: true
    }

    /**
     * @member {String[]} selectedRows
     */
    get selectedRows() {
        let gridContainer = this.parent;

        if (gridContainer.selectionModel.ntype === 'selection-grid-rowmodel') {
            return gridContainer.selectionModel.items
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
     * @param {Object} data
     * @param {String} [data.cellId]
     * @param {Object} data.column
     * @param {Neo.grid.Container} data.gridContainer
     * @param {Number} data.index
     * @param {Object} data.record
     * @returns {Object}
     */
    applyRendererOutput(data) {
        let {cellId, column, gridContainer, index, record} = data,
            me          = this,
            cellCls     = ['neo-grid-cell'],
            colspan     = record[me.colspanField],
            {dataField} = column,
            fieldValue  = Neo.ns(dataField, false, record),
            cellConfig, rendererOutput;

        if (fieldValue === null || fieldValue === undefined) {
            fieldValue = ''
        }

        rendererOutput = column.renderer.call(column.rendererScope || gridContainer, {
            column,
            dataField,
            gridContainer,
            index,
            record,
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

        if (!cellId) {
            cellId = me.getCellId(record, column.dataField)
        }

        cellConfig = {
            id      : cellId,
            cls     : cellCls,
            style   : rendererOutput.style || {},
            tabIndex: '-1'
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
            gridContainer   = me.parent,
            colspan         = record[me.colspanField],
            colspanKeys     = colspan && Object.keys(colspan),
            columns         = gridContainer.items[0].items,
            colCount        = columns.length,
            dockLeftMargin  = 0,
            dockRightMargin = 0,
            id              = me.getRowId(record, rowIndex),
            {selectedRows}  = me,
            trCls           = me.getTrClass(record, rowIndex),
            config, column, columnIndex, gridRow, i;

        me.recordVnodeMap[id] = rowIndex;

        if (selectedRows && Neo.ns(me.selectedRecordField, false, record)) {
            NeoArray.add(selectedRows, id)
        }

        if (selectedRows?.includes(id)) {
            trCls.push('neo-selected');

            me.parent.fire('select', {
                record
            })
        }

        gridRow = {
            id,
            cls     : trCls,
            cn      : [],
            tabIndex: '-1'
        };

        for (i=0; i < colCount; i++) {
            column = columns[i];
            config = me.applyRendererOutput({column, gridContainer, index: rowIndex, record});

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

            gridRow.cn.push(config);

            if (colspanKeys?.includes(column.dataField)) {
                i += (colspan[column.dataField] - 1)
            }
        }

        for (i=0; i < colCount; i++) {
            columnIndex = colCount - i -1;
            column      = columns[columnIndex];

            if (column.dock === 'right') {
                gridRow.cn[columnIndex].style.right = dockRightMargin + 'px';
                dockRightMargin += (column.width + 1) // todo: borders fix
            }

            if (colspanKeys?.includes(column.dataField)) {
                i += (colspan[column.dataField] - 1)
            }
        }

        // the dock margins are the same for each row
        rowIndex === 0 && Object.assign(gridContainer, {dockLeftMargin, dockRightMargin});

        return gridRow
    }

    /**
     * @param {Object[]} inputData
     */
    createViewData(inputData) {
        let me             = this,
            amountRows     = inputData.length,
            i              = 0,
            rows           = [],
            {selectedRows} = me;

        for (; i < amountRows; i++) {
            rows.push(me.createRow({record: inputData[i], rowIndex: i}))
        }

        me.vdom.cn = rows;

        me.promiseUpdate().then(() => {
            if (selectedRows?.length > 0) {
                // this logic only works for selection.grid.RowModel
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
     * Get a grid column or column index by a given field name
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
     * Get the matching record by passing a row id, a cell id or an id inside a grid cell.
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
     * Override this method to apply custom CSS rules to grid rows
     * @param {Object} record
     * @param {Number} rowIndex
     * @returns {String[]}
     */
    getTrClass(record, rowIndex) {
        return ['neo-grid-row']
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
     * Gets triggered after changing the value of a record field.
     * E.g. myRecord.foo = 'bar';
     * @param {Object} opts
     * @param {Object[]} opts.fields Each field object contains the keys: name, oldValue, value
     * @param {Neo.data.Model} opts.model The model instance of the changed record
     * @param {Object} opts.record
     */
    onStoreRecordChange({fields, model, record}) {
        let me               = this,
            fieldNames       = fields.map(field => field.name),
            needsUpdate      = false,
            gridContainer    = me.parent,
            {selectionModel} = gridContainer,
            {vdom}           = me,
            cellId, cellNode, column, index, scope;

        if (fieldNames.includes(me.colspanField)) {
            index = me.store.indexOf(record);
            me.vdom.cn[index] = me.createRow({record, rowIndex: index});
            me.update()
        } else {
            fields.forEach(field => {
                if (field.name === me.selectedRecordField) {
                    if (selectionModel.ntype === 'selection-grid-rowmodel') {
                        selectionModel[field.value ? 'select' : 'deselect'](me.getRowId(record))
                    }
                } else {
                    cellId   = me.getCellId(record, field.name);
                    cellNode = VDomUtil.find(vdom, cellId);

                    // the vdom might not exist yet => nothing to do in this case
                    if (cellNode?.vdom) {
                        column      = me.getColumn(field.name);
                        index       = cellNode.index;
                        needsUpdate = true;
                        scope       = column.rendererScope || gridContainer;

                        cellNode.parentNode.cn[index] = me.applyRendererOutput({cellId, column, gridContainer, index, record})
                    }
                }
            })
        }

        needsUpdate && me.update()
    }
}

export default Neo.setupClass(View);
