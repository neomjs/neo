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
     * Selects the clicked cell's column, or clears it when that cell is the one already selected.
     * @param {Object} data
     */
    onCellClick(data) {
        let me                  = this,
            {dataField, record} = data;

        if (dataField && record) {
            me.setSelectedColumns(me.isSelected(me.view.getLogicalCellId(record, dataField)) ? [] : [dataField])
        }

        super.onCellClick(data)
    }

    /**
     * @param {Number} step
     */
    onNavKeyColumn(step) {
        this.stepSelectedColumn(step);
        super.onNavKeyColumn(step)
    }
}

export default Neo.setupClass(CellColumnRowModel);
