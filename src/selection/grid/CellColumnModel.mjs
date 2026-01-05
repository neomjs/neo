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
     * @param {Object} data
     */
    onCellClick(data) {
        let me        = this,
            {view}    = me,
            cellId    = data.data.currentTarget,
            dataField = cellId && view.getDataField(cellId);

        if (dataField) {
            me.selectedColumns = me.isSelected(cellId) ? [] : [dataField];
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
        this.view.createViewData();

        super.unregister()
    }
}

export default Neo.setupClass(CellColumnModel);
