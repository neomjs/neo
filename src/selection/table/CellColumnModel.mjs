import CellModel   from './CellModel.mjs';
import ColumnModel from './ColumnModel.mjs';
import VDomUtil    from '../../util/VDom.mjs';

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
            tbodyNode     = VDomUtil.find(me.view.vdom, {tag: 'tbody'}).vdom;
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

        tbodyNode     = VDomUtil.find(me.view.vdom, {tag: 'tbody'}).vdom;
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

export default Neo.setupClass(CellColumnModel);
