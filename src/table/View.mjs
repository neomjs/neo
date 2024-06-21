import Component from '../component/Base.mjs';
import VDomUtil  from '../util/VDom.mjs';

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
         * @member {Object} recordVnodeMap={}
         */
        recordVnodeMap: {},
        /**
         * @member {Neo.data.Store|null} store=null
         */
        store: null,
        /**
         * @member {Boolean} useRowRecordIds=true
         */
        useRowRecordIds: true,
        /**
         * @member {Object} _vdom={tag: 'tbody', cn : []}
         */
        _vdom:
        {tag: 'tbody', cn: []}
    }

    /**
     * @param {Object} data
     * @param {String} [data.cellId]
     * @param {Object} data.column
     * @param {Object} data.record
     * @param {Number} data.index
     * @param {Neo.table.Container} data.tableContainer
     * @returns {Object}
     */
    applyRendererOutput(data) {
        let {cellId, column, record, index, tableContainer} = data,
            me          = this,
            cellCls     = ['neo-table-cell'],
            colspan     = record[me.colspanField],
            {dataField} = column,
            fieldValue  = record[dataField],
            hasStore    = tableContainer.store?.model, // todo: remove as soon as all tables use stores (examples table)
            {vdom}      = me,
            cellConfig, rendererOutput;

        if (fieldValue === null || fieldValue === undefined) {
            fieldValue = ''
        }

        rendererOutput = column.renderer.call(column.rendererScope || tableContainer, {
            column,
            dataField,
            index,
            record,
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
            // todo: remove the else part as soon as all tables use stores (examples table)
            if (hasStore) {
                cellId = me.getCellId(record, column.dataField)
            } else {
                cellId = vdom.cn[index]?.cn[me.getColumn(column.dataField, true)]?.id || Neo.getId('td')
            }
        }

        cellConfig = {
            tag     : 'td',
            id      : cellId,
            cls     : cellCls,
            style   : rendererOutput.style || {},
            tabIndex: '-1'
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
     * @param {Object[]} inputData
     */
    createViewData(inputData) {
        let me             = this,
            amountRows     = inputData.length,
            tableContainer = me.parent,
            columns        = tableContainer.items[0].items,
            colCount       = columns.length,
            data           = [],
            i              = 0,
            {vdom}         = me,
            config, colspan, colspanKeys, column, dockLeftMargin, dockRightMargin, id, index, j, record, selectedRows, trCls;

        if (tableContainer.selectionModel.ntype === 'selection-table-rowmodel') {
            selectedRows = tableContainer.selectionModel.items || [];
        }

        for (; i < amountRows; i++) {
            record      = inputData[i];
            colspan     = record[me.colspanField];
            colspanKeys = colspan && Object.keys(colspan);
            id          = me.getRowId(record, i);

            me.recordVnodeMap[id] = i;

            trCls = me.getTrClass(record, i);

            if (selectedRows?.includes(id)) {
                trCls.push('neo-selected');

                Neo.getComponent(me.containerId).fire('select', {
                    record
                })
            }

            data.push({
                tag     : 'tr',
                id,
                cls     : trCls,
                cn      : [],
                tabIndex: '-1'
            });

            dockLeftMargin  = 0;
            dockRightMargin = 0;

            for (j=0; j < colCount; j++) {
                column = columns[j];
                config = me.applyRendererOutput({column, record, index: i, tableContainer});

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

                data[i].cn.push(config);

                if (colspanKeys?.includes(column.dataField)) {
                    j += (colspan[column.dataField] - 1)
                }
            }

            for (j=0; j < colCount; j++) {
                index  = colCount - j -1;
                column = columns[index];

                if (column.dock === 'right') {
                    data[i].cn[index].style.right = dockRightMargin + 'px';
                    dockRightMargin += (column.width + 1) // todo: borders fix
                }

                if (colspanKeys?.includes(column.dataField)) {
                    j += (colspan[column.dataField] - 1)
                }
            }
        }

        vdom.cn = data;

        Object.assign(tableContainer, {dockLeftMargin, dockRightMargin});

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
            columns   = container.items[0].items, // todo: we need a shortcut for accessing the header toolbar
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
     * Gets triggered after changing the value of a record field.
     * E.g. myRecord.foo = 'bar';
     * @param {Object} opts
     * @param {Object[]} opts.fields Each field object contains the keys: name, oldValue, value
     * @param {Neo.data.Model} opts.model The model instance of the changed record
     * @param {Object} opts.record
     */
    onStoreRecordChange(opts) {
        let me             = this,
            fieldNames     = opts.fields.map(field => field.name),
            needsUpdate    = false,
            tableContainer = me.parent,
            {vdom}         = me,
            cellId, cellNode, column, index, scope;

        if (fieldNames.includes(me.colspanField)) {
            // we should narrow it down to only update the current row
            me.createViewData(me.store.items)
        } else {
            opts.fields.forEach(field => {
                cellId   = me.getCellId(opts.record, field.name);
                cellNode = VDomUtil.findVdomChild(vdom, cellId);

                // the vdom might not exist yet => nothing to do in this case
                if (cellNode?.vdom) {
                    column      = me.getColumn(field.name);
                    index       = cellNode.index;
                    needsUpdate = true;
                    scope       = column.rendererScope || tableContainer;

                    cellNode.parentNode.cn[index] = me.applyRendererOutput({cellId, column, record: opts.record, index, tableContainer})
                }
            })
        }

        needsUpdate && me.update()
    }
}

Neo.setupClass(View);

export default View;
