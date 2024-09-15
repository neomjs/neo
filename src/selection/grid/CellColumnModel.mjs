import CellModel   from './CellModel.mjs';
import ColumnModel from './ColumnModel.mjs';
import VDomUtil    from '../../util/VDom.mjs';

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
        let me = this,
            id = data.data.currentTarget,
            columnNodeIds, index, tbodyNode;

        if (id) {
            index         = ColumnModel.getColumnIndex(id, me.view.items[0].items);
            tbodyNode     = VDomUtil.findVdomChild(me.view.vdom, {cls: 'neo-grid-view'}).vdom;
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
            fields        = view.columns.map(c => c.field),
            newIndex      = (fields.indexOf(currentColumn) + step) % fields.length,
            columnNodeIds, tbodyNode;

        while (newIndex < 0) {
            newIndex += fields.length
        }

        tbodyNode     = VDomUtil.findVdomChild(me.view.vdom, {cls: 'neo-grid-view'}).vdom;
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
