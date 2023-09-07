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
     * @param {String} cellId
     * @param {Object} column
     * @param {Object} record
     * @param {Number} index
     * @param {Neo.table.Container} tableContainer
     * @returns {Object}
     */
    applyRendererOutput(cellId, column, record, index, tableContainer) {
        let me         = this,
            cellCls    = ['neo-table-cell'],
            dataField  = column.dataField,
            fieldValue = record[dataField],
            hasStore   = tableContainer.store?.model, // todo: remove as soon as all tables use stores (examples table)
            vdom       = me.vdom,
            cellConfig, rendererOutput;

        if (fieldValue === null || fieldValue === undefined) {
            fieldValue = ''
        }

        rendererOutput = column.renderer.call(column.rendererScope || tableContainer, {
            dataField,
            index,
            record,
            tableContainer,
            value: fieldValue
        });

        switch (Neo.typeOf(rendererOutput)) {
            case 'Object': {
                if (rendererOutput.cls && rendererOutput.html) {
                    cellCls.push(...rendererOutput.cls);
                } else {
                    rendererOutput = [rendererOutput];
                }
                break;
            }
            case 'Number':
            case 'String': {
                rendererOutput = {
                    cls : cellCls,
                    html: rendererOutput?.toString()
                };
                break;
            }
        }

        if (rendererOutput === null || rendererOutput === undefined) {
            rendererOutput = ''
        }

        if (column.align !== 'left') {
            cellCls.push('neo-' + column.align)
        }

        if (!cellId) {
            // todo: remove the else part as soon as all tables use stores (examples table)
            if (hasStore) {
                cellId = me.getCellId(record, column.dataField)
            } else {
                cellId = vdom.cn[i]?.cn[j]?.id || Neo.getId('td')
            }
        }

        cellConfig = {
            tag     : 'td',
            id      : cellId,
            cls     : cellCls,
            style   : rendererOutput.style || {},
            tabIndex: '-1'
        };

        if (Neo.typeOf(rendererOutput) === 'Object') {
            cellConfig.innerHTML = rendererOutput.html  || ''
        } else {
            cellConfig.cn = rendererOutput
        }

        return cellConfig
    }

    /**
     * @param {Array} inputData
     */
    createViewData(inputData) {
        let me         = this,
            amountRows = inputData.length,
            container  = Neo.getComponent(me.parentId),
            columns    = container.items[0].items,
            colCount   = columns.length,
            data       = [],
            i          = 0,
            vdom       = me.vdom,
            config, column, dockLeftMargin, dockRightMargin, id, index, j,
            record, selectedRows, trCls;

        me.recordVnodeMap = {}; // remove old data

        if (container.selectionModel.ntype === 'selection-table-rowmodel') {
            selectedRows = container.selectionModel.items || [];
        }

        for (; i < amountRows; i++) {
            record = inputData[i];
            id     = me.getRowId(record, i);

            me.recordVnodeMap[id] = i;

            trCls = me.getTrClass(record, i);

            if (selectedRows?.includes(id)) {
                trCls.push('neo-selected');

                Neo.getComponent(me.containerId).fire('select', {
                    record
                });
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

            j = 0;

            for (; j < colCount; j++) {
                column = columns[j];
                config = me.applyRendererOutput(null, column, record, i, container);

                if (column.dock) {
                    config.cls = ['neo-locked', ...config.cls || []];

                    if (column.dock === 'left') {
                        config.style.left = dockLeftMargin + 'px';
                        dockLeftMargin += (column.width + 1); // todo: borders fix
                    }
                }

                if (column.flex) {
                    config.style.width = '100%';
                }

                data[i].cn.push(config);
            }

            j = 0;

            for (; j < colCount; j++) {
                index  = colCount - j -1;
                column = columns[index];

                if (column.dock === 'right') {
                    data[i].cn[index].style.right = dockRightMargin + 'px';
                    dockRightMargin += (column.width + 1); // todo: borders fix
                }
            }
        }

        vdom.cn = data;

        container.dockLeftMargin  = dockLeftMargin;
        container.dockRightMargin = dockRightMargin;

        me.promiseUpdate().then(() => {
            if (selectedRows?.length > 0) {
                // this logic only works for selection.table.RowModel
                Neo.main.DomAccess.scrollToTableRow({id: selectedRows[0]});
            }
        })
    }

    /**
     * @param {Boolean} updateParentVdom
     * @param {Boolean} silent
     */
    destroy(updateParentVdom, silent) {
        this.store = null;
        super.destroy(updateParentVdom, silent);
    }

    /**
     * @param {Object} record
     * @param {String} dataField
     * @returns {String}
     */
    getCellId(record, dataField) {
        return this.id + '__' + record[this.store.keyProperty] + '__' + dataField;
    }

    /**
     * Get a table column by a given field name
     * @param {String} field
     * @returns {Object|null}
     */
    getColumn(field) {
        let container = Neo.getComponent(this.parentId),
            columns   = container.columns,
            i         = 0,
            len       = columns.length,
            column;

        for (; i < len; i++) {
            column = columns[i];

            if (column.dataField === field) {
                return column
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
                return record;
            }
        }

        return null;
    }

    /**
     * @param {String} rowId
     * @returns {Object}
     */
    getRecordByRowId(rowId) {
        return this.store.getAt(this.recordVnodeMap[rowId]);
    }

    /**
     * @param {Object} record
     * @param {Number} [index]
     * @returns {String}
     */
    getRowId(record, index) {
        let me    = this,
            store = me.store;

        if (me.useRowRecordIds) {
            return `${me.id}__tr__${record[store.keyProperty]}`;
        } else {
            index = Neo.isNumber(index) ? index : store.indexOf(record);
            return me.vdom.cn[index]?.id || Neo.getId('tr');
        }
    }

    /**
     * Override this method to apply custom CSS rules to table rows
     * @param {Object} record
     * @param {Number} rowIndex
     * @returns {String[]}
     */
    getTrClass(record, rowIndex) {
        return ['neo-table-row'];
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
        let me          = this,
            container   = Neo.getComponent(me.parentId),
            needsUpdate = false,
            vdom        = me.vdom,
            cellId, cellNode, column, index, scope;

        opts.fields.forEach(field => {
            cellId   = me.getCellId(opts.record, field.name);
            cellNode = VDomUtil.findVdomChild(vdom, cellId);

            // the vdom might not exist yet => nothing to do in this case
            if (cellNode?.vdom) {
                column      = me.getColumn(field.name);
                index       = cellNode.index;
                needsUpdate = true;
                scope       = column.rendererScope || container;

                cellNode.parentNode.cn[index] = me.applyRendererOutput(cellId, column, opts.record, index, container)
            }
        });

        needsUpdate && me.update()
    }
}

Neo.applyClassConfig(View);

export default View;
