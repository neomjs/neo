import Component from '../component/Base.mjs';
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
        baseCls: ['neo-grid-view']
    }

    /**
     * @param {Array} inputData
     */
    createViewData(inputData) {
        let me         = this,
            amountRows = inputData.length,
            container  = me.parent,
            columns    = container.items[0].items,
            colCount   = columns.length,
            data       = [],
            i          = 0,
            vdom       = me.vdom,
            cellCls, cellStyle, config, column, dockLeftMargin, dockRightMargin, id, index, j, rendererOutput,
            record, rendererValue, selectedRows, trCls;

        me.recordVnodeMap = {}; // remove old data

        // console.log('createViewData', me.id, inputData);

        if (container.selectionModel?.ntype === 'selection-grid-rowmodel') {
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
                id,
                cls     : trCls,
                cn      : [],
                tabIndex: '-1'
            });

            dockLeftMargin  = 0;
            dockRightMargin = 0;

            j = 0;

            for (; j < colCount; j++) {
                column         = columns[j];
                rendererValue  = record[column.field];

                if (rendererValue === undefined) {
                    rendererValue = '';
                }

                rendererOutput = column.renderer.call(column.rendererScope || container, {
                    column,
                    field: column.field,
                    index: i,
                    record,
                    value: rendererValue
                });

                cellCls = rendererOutput?.cls || ['neo-grid-cell'];

                if (column.align !== 'left') {
                    cellCls.push('neo-' + column.align);
                }

                if (!Neo.isObject(rendererOutput)) {
                    rendererOutput = {
                        cls : cellCls,
                        html: rendererOutput?.toString()
                    };
                }

                cellStyle = rendererOutput.style || {};

                if (column.width) {
                    cellStyle.minWidth = `${column.width}px`;
                }

                config = {
                    id       : me.getCellId(record, column.field),
                    cls      : cellCls,
                    innerHTML: rendererOutput.html  || '',
                    style    : cellStyle,
                    tabIndex : '-1'
                };

                if (column.dock) {
                    config.cls = ['neo-locked', ...config.cls || []];

                    if (column.dock === 'left') {
                        config.style.left = dockLeftMargin + 'px';
                        dockLeftMargin += column.width;
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
                Neo.main.DomAccess.scrollToTableRow({
                    appName: me.appName,
                    id     : selectedRows[0]
                })
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
     * @param {String} field
     * @returns {String}
     */
    getCellId(record, field) {
        return this.id + '__' + record[this.store.keyProperty] + '__' + field;
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
        return `${this.id}__tr__${record[this.store.keyProperty]}`;
    }

    /**
     * Override this method to apply custom CSS rules to grid rows
     * @param {Object} record
     * @param {Number} rowIndex
     * @returns {String[]}
     */
    getTrClass(record, rowIndex) {
        return ['neo-grid-row'];
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
        let me     = this,
            deltas = [],
            cellId, cellNode;

        opts.fields.forEach(field => {
            cellId   = me.getCellId(opts.record, field.name);
            cellNode = me.getVdomChild(cellId);

            cellNode.innerHTML = field.value; // keep the vdom in sync

            deltas.push({
                id       : cellId,
                innerHTML: field.value
            })
        });

        deltas.length > 0 && Neo.applyDeltas(me.appName, deltas);
    }
}

Neo.applyClassConfig(View);

export default View;
