import CellModel from './CellModel.mjs';
import VDomUtil  from '../../util/VDom.mjs';

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
         * @member {String[]|null} selectedColumnCellIds=null
         * @protected
         */
        selectedColumnCellIds: null
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        this.selectedColumnCellIds = []
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
            columnNodeIds = VDomUtil.getColumnNodesIds(view.vdom.cn[0], index);

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

        columnNodeIds = VDomUtil.getColumnNodesIds(view.vdom.cn[0], index);

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
