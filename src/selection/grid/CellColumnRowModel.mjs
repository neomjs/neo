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
        selectedColumnCellCls: 'selected-column-cell',
        /**
         * Storing the column dataFields
         * @member {String[]} selectedColumns=[]
         */
        selectedColumns: []
    }

    /**
     * @param {Object} data
     */
    onCellClick(data) {
        let me     = this,
            {view} = me,
            cellId = data.data.currentTarget;

        if (cellId) {
            me.selectedColumns = [view.getDataField(cellId)];
            view.createViewData(true)
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

        view.createViewData(true);

        super.onNavKeyColumn(step)
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
