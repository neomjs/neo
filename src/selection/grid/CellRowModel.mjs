import CellModel from './CellModel.mjs';

/**
 * @class Neo.selection.grid.CellRowModel
 * @extends Neo.selection.grid.CellModel
 */
class CellRowModel extends CellModel {
    static config = {
        /**
         * @member {String} className='Neo.selection.grid.CellRowModel'
         * @protected
         */
        className: 'Neo.selection.grid.CellRowModel',
        /**
         * @member {String} ntype='selection-grid-cellrowmodel'
         * @protected
         */
        ntype: 'selection-grid-cellrowmodel',
        /**
         * @member {String} cls='neo-selection-cellrowmodel'
         * @protected
         */
        cls: 'neo-selection-cellrowmodel',
        /**
         * Storing the node ids
         * @member {String[]} selectedRows=[]
         * @protected
         */
        selectedRows: []
    }

    /**
     * @param {Object} data
     */
    onCellClick(data) {
        let me     = this,
            {view} = me,
            record = view.getRecord(data.data.currentTarget),
            rowId  = view.getRowId(record);

        if (rowId) {
            me.selectedRows = [rowId];
            view.createViewData(true)
        }

        super.onCellClick(data)
    }

    /**
     * @param {Number} step
     */
    onNavKeyRow(step) {
        let me           = this,
            {view}       = me,
            {store}      = view,
            countRecords = store.getCount(),
            rowId        = me.selectedRows[0] || view.getRowId(store.getAt(0)),
            record       = view.getRecord(rowId),
            index        = store.indexOf(record),
            newIndex     = (index + step) % countRecords,
            id;

        while (newIndex < 0) {
            newIndex += countRecords
        }

        id = view.getRowId(store.getAt(newIndex));

        if (id) {
            me.selectedRows = [id];
            view.createViewData(true)
        }

        super.onNavKeyRow(step)
    }

    /**
     *
     */
    unregister() {
        this.selectedRows = [];
        this.view.createViewData();

        super.unregister()
    }
}

export default Neo.setupClass(CellRowModel);
