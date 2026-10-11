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
        selectedColumnCellCls: 'selected-column-cell',
        /**
         * @member {Boolean} selectsColumns=true
         * @protected
         */
        selectsColumns: true
    }
}

export default Neo.setupClass(CellColumnModel);
