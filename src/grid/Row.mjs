import Component from '../component/Base.mjs';
import NeoArray  from '../util/Array.mjs';

/**
 * @class Neo.grid.Row
 * @extends Neo.component.Base
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
     * @param {Object} data
     * @param {String} [data.cellId]
     * @param {Object} data.column
     * @param {Number} data.columnIndex
     * @param {Object} data.record
     * @param {Number} data.rowIndex
     * @returns {Object}
     */
    applyRendererOutput({cellId, column, columnIndex, record, rowIndex}) {
        let me                     = this,
            gridContainer          = me.parent.parent, // Row -> Body -> GridContainer
            gridBody               = me.parent,
            {selectedCells, store} = gridBody,
            cellCls                = ['neo-grid-cell'],
            colspan                = record[gridBody.colspanField],
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

        rendererOutput = column.renderer.call(column.rendererScope || column, {
            column,
            columnIndex,
            component: me.components?.[column.dataField],
            dataField,
            gridContainer,
            record,
            row: me,
            rowIndex,
            store,
            value: fieldValue
        });

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
            cellId = gridBody.getCellId(rowIndex, column.dataField)
        }

        if (selectedCells.includes(cellId)) {
            cellCls.push('neo-selected')
        }

        if (gridBody.selectionModel?.selectedColumns?.includes(dataField)) {
            NeoArray.add(cellCls, gridBody.selectionModel.selectedColumnCellCls || 'neo-selected')
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
     * @param {Object} config
     */
    createVdom(config) {
        let me            = this,
            record        = me.record,
            rowIndex      = me.rowIndex,
            gridBody      = me.parent, // The Row is an item of Body
            gridContainer = gridBody.parent,
            {columns}     = gridContainer,
            {selectedRows} = gridBody,
            recordId      = record[gridBody.store.getKeyProperty()],
            countColumns  = columns.getCount(),
            {mountedColumns} = gridBody,
            cellConfig, column, columnPosition, i, isMounted;

        let vdom = {
            'aria-rowindex': rowIndex + 2, // header row => 1, first body row => 2
            cn             : [],
            data           : {recordId},
            role           : 'row',
            style          : {
                height   : gridBody.rowHeight + 'px',
                transform: `translate3d(0px, ${rowIndex * gridBody.rowHeight}px, 0px)`
            }
        };

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
        }

        vdom.cls = rowCls;

        for (i=0; i < countColumns; i++) {
            isMounted = i >= mountedColumns[0] && i <= mountedColumns[1];
            column    = columns.getAt(i);

            if (!isMounted && column.hideMode === 'removeDom') {
                continue
            }

            cellConfig = me.applyRendererOutput({column, columnIndex: i, record, rowIndex});

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

        me._vdom = vdom;
        me.update()
    }

    /**
     *
     */
    destroy() {
        let me = this;

        if (me.components) {
            Object.values(me.components).forEach(component => component.destroy())
        }

        super.destroy()
    }

    /**
     * @param {Object} data
     * @param {Object} data.record
     * @param {Number} data.rowIndex
     */
    updateContent({record, rowIndex}) {
        let me = this;

        me.record   = record;
        me.rowIndex = rowIndex;

        me.createVdom()
    }
}

export default Neo.setupClass(Row);
