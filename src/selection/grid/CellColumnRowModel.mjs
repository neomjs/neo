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
         * @member {Boolean} selectsColumns=true
         * @protected
         */
        selectsColumns: true
    }

    /**
     * `CellRowModel` writes the row selection silently and only the clicked cell's body updates, so the row is
     * flushed in every body.
     * @param {Object} data
     */
    onCellClick(data) {
        let {record} = data;

        super.onCellClick(data);

        record && this.view.bodies.forEach(body => body.getRow(record)?.update())
    }
}

export default Neo.setupClass(CellColumnRowModel);
