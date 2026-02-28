import CellRowModel from './CellRowModel.mjs';

/**
 * @class Neo.selection.grid.CellColumnRowModel
 * @extends Neo.selection.grid.CellRowModel
 */
class CellColumnRowModel extends CellRowModel {
    static config = {
        /**
         * @member {String} className='Neo.selection.grid.CellColumnRowModel'
         * @protected
         */
        className: 'Neo.selection.grid.CellColumnRowModel',
        /**
         * @member {String} ntype='selection-grid-cellcolumnrowmodel'
         * @protected
         */
        ntype: 'selection-grid-cellcolumnrowmodel',
        /**
         * @member {String} cls='neo-selection-cellcolumnrowmodel'
         * @protected
         */
        cls: 'neo-selection-cellcolumnrowmodel',
        /**
         * @member {String} selectedColumnCellCls='selected-column-cell'
         * @protected
         */
        selectedColumnCellCls: 'selected-column-cell'
    }

    /**
     * @param {Object} data
     */
    onCellClick(data) {
        let me        = this,
            {view}    = me,
            {dataField, record} = data,
            logicalId, newSelection;

        if (dataField && record) {
            logicalId    = view.getLogicalCellId(record, dataField);
            newSelection = me.isSelected(logicalId) ? [] : [dataField];

            if (!Neo.isEqual(me.selectedColumns, newSelection)) {
                me.selectedColumns = newSelection;
                view.createViewData() // Flush
            } else {
                view.createViewData(true) // Silent
            }
        }

        super.onCellClick(data)
    }

    /**
     * @param {Number} step
     */
    onNavKeyColumn(step) {
        let me                 = this,
            {dataFields, view} = me,
            currentColumn, index;

        if (me.hasSelection()) {
            currentColumn = me.selectedColumns[0]
        } else {
            currentColumn = dataFields[0]
        }

        index = (dataFields.indexOf(currentColumn) + step) % dataFields.length;

        while (index < 0) {
            index += dataFields.length
        }

        me.selectedColumns = [dataFields[index]];

        view.createViewData();

        super.onNavKeyColumn(step)
    }

    /**
     * @returns {Object}
     */
    toJSON() {
        return {
            ...super.toJSON(),
            selectedColumnCellCls: this.selectedColumnCellCls
        }
    }

    /**
     *
     */
    unregister() {
        this.selectedColumns = [];
        super.unregister()
    }
}

export default Neo.setupClass(CellColumnRowModel);
