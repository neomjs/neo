import CellModel from './CellModel.mjs';
import VDomUtil  from '../../util/VDom.mjs';

/**
 * @class Neo.selection.table.CellColumnModel
 * @extends Neo.selection.table.CellModel
 */
class CellColumnModel extends CellModel {
    static config = {
        /**
         * @member {String} className='Neo.selection.table.CellColumnModel'
         * @protected
         */
        className: 'Neo.selection.table.CellColumnModel',
        /**
         * @member {String} ntype='selection-table-cellcolumnmodel'
         * @protected
         */
        ntype: 'selection-table-cellcolumnmodel',
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
         * @member {String[]} selectedColumnCellIds=[]
         * @protected
         */
        selectedColumnCellIds: []
    }

    /**
     * @param {Boolean} [silent] true to prevent a vdom update
     */
    deselectAllCells(silent) {
        let me      = this,
            cellIds = [...me.selectedColumnCellIds],
            {view}  = me

        cellIds.forEach(cellId => {
            me.deselect(cellId, true, me.selectedColumnCellIds, me.selectedColumnCellCls)
        });

        !silent && view.update()
    }

    /**
     * @param {Object} data
     */
    onCellClick(data) {
        let me     = this,
            {view} = me,
            cellId = data.data.currentTarget,
            columnNodeIds, dataField, index;

        if (cellId) {
            dataField     = view.getDataField(cellId);
            index         = view.getColumn(dataField, true);
            columnNodeIds = VDomUtil.getColumnNodesIds(view.vdom, index);

            me.deselectAllCells(true);
            me.select(columnNodeIds, me.selectedColumnCellIds, me.selectedColumnCellCls)
        }

        super.onCellClick(data)
    }

    /**
     * @param {Number} step
     */
    onNavKeyColumn(step) {
        let me                 = this,
            {dataFields, view} = me,
            columnNodeIds, currentColumn, index;

        if (me.hasSelection()) {
            currentColumn = view.getDataField(me.items[0])
        } else {
            currentColumn = dataFields[0]
        }

        index = (dataFields.indexOf(currentColumn) + step) % dataFields.length;

        while (index < 0) {
            index += dataFields.length
        }

        columnNodeIds = VDomUtil.getColumnNodesIds(view.vdom, index);

        me.deselectAllCells(true);
        me.select(columnNodeIds, me.selectedColumnCellIds, me.selectedColumnCellCls);

        super.onNavKeyColumn(step)
    }

    /**
     *
     */
    unregister() {
        this.deselectAllCells();
        super.unregister()
    }
}

export default Neo.setupClass(CellColumnModel);
