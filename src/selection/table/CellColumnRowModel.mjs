import CellRowModel from './CellRowModel.mjs';
import ColumnModel  from './ColumnModel.mjs';
import VDomUtil     from '../../util/VDom.mjs';

/**
 * @class Neo.selection.table.CellColumnRowModel
 * @extends Neo.selection.table.CellRowModel
 */
class CellColumnRowModel extends CellRowModel {
    static config = {
        /**
         * @member {String} className='Neo.selection.table.CellColumnRowModel'
         * @protected
         */
        className: 'Neo.selection.table.CellColumnRowModel',
        /**
         * @member {String} ntype='selection-table-cellcolumnrowmodel'
         * @protected
         */
        ntype: 'selection-table-cellcolumnrowmodel',
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
         * @member {Array|null} selectedColumnCellIds=null
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
            {view}  = me;

        cellIds.forEach(cellId => {
            me.deselect(cellId, true, me.selectedColumnCellIds, me.selectedColumnCellCls)
        });

        !silent && view.update()
    }

    /**
     * @param {Object} data
     */
    onCellClick(data) {
        let me = this,
            id = data.data.currentTarget,
            columnNodeIds, index, tbodyNode;

        if (id) {
            index         = ColumnModel.getColumnIndex(id, me.view.items[0].items);
            tbodyNode     = VDomUtil.findVdomChild(me.view.vdom, {tag: 'tbody'}).vdom;
            columnNodeIds = VDomUtil.getColumnNodesIds(tbodyNode, index);

            me.deselectAllCells(true);
            me.select(columnNodeIds, me.selectedColumnCellIds, me.selectedColumnCellCls)
        }

        super.onCellClick(data)
    }

    /**
     * @param {Object} data
     * @param {Number} step
     */
    onNavKeyColumn(data, step) {
        let me            = this,
            idArray       = ColumnModel.getCellId(data.path).split('__'),
            currentColumn = idArray[2],
            {view}        = me,
            dataFields    = view.columns.map(c => c.dataField),
            newIndex      = (dataFields.indexOf(currentColumn) + step) % dataFields.length,
            columnNodeIds, tbodyNode;

        while (newIndex < 0) {
            newIndex += dataFields.length
        }

        tbodyNode     = VDomUtil.findVdomChild(me.view.vdom, {tag: 'tbody'}).vdom;
        columnNodeIds = VDomUtil.getColumnNodesIds(tbodyNode, newIndex);

        me.deselectAllCells(true);
        me.select(columnNodeIds, me.selectedColumnCellIds, me.selectedColumnCellCls);

        super.onNavKeyColumn(data, step)
    }

    /**
     *
     */
    unregister() {
        this.deselectAllCells();
        super.unregister()
    }
}

export default Neo.setupClass(CellColumnRowModel);
