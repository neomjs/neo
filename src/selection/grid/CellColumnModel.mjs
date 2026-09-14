import CellModel from './CellModel.mjs';

/**
 * @class Neo.selection.grid.CellColumnModel
 * @extends Neo.selection.grid.CellModel
 */
class CellColumnModel extends CellModel {
    static config = {
        /**
         * @member {String} className='Neo.selection.grid.CellColumnModel'
         * @protected
         */
        className: 'Neo.selection.grid.CellColumnModel',
        /**
         * @member {String} ntype='selection-grid-cellcolumnmodel'
         * @protected
         */
        ntype: 'selection-grid-cellcolumnmodel',
        /**
         * @member {String} cls='neo-selection-cellcolumnmodel'
         * @protected
         */
        cls: 'neo-selection-cellcolumnmodel',
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

export default Neo.setupClass(CellColumnModel);
