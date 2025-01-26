import CellModel from './CellModel.mjs';
import NeoArray  from '../../util/Array.mjs';

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
         * @member {String[]} selectedRowIds=[]
         * @protected
         */
        selectedRowIds: []
    }

    /**
     * @param {Boolean} [silent] true to prevent a vdom update
     */
    deselectAllRows(silent) {
        let me     = this,
            rowIds = [...me.selectedRowIds],
            {view} = me;

        rowIds.forEach(rowId => {
            me.deselectRow(rowId, true)
        });

        !silent && view.update()
    }

    /**
     * @param {String} rowId
     * @param {Boolean} [silent] true to prevent a vdom update
     */
    deselectRow(rowId, silent) {
        let me     = this,
            {view} = me,
            node   = view.getVdomChild(rowId),
            cls;

        if (node) {
            cls = node.cls || [];
            NeoArray.remove(cls, me.selectedCls);
            node.cls = cls
        }

        NeoArray.remove(me.selectedRowIds, rowId);

        !silent && view.update()
    }

    /**
     * @param {Object} data
     */
    onCellClick(data) {
        let me     = this,
            record = me.view.getRecord(data.data.currentTarget),
            rowId  = me.view.getRowId(record);

        if (rowId) {
            me.deselectAllRows(true);
            me.selectRow(rowId)
        }

        super.onCellClick(data)
    }

    /**
     * @param {Number} step
     */
    onNavKeyRow(step) {
        super.onNavKeyRow(step);

        let me           = this,
            {view}       = me,
            {store}      = view,
            countRecords = store.getCount(),
            rowId        = me.selectedRowIds[0] || view.getRowId(store.getAt(0)),
            record       = view.getRecord(rowId),
            index        = store.indexOf(record),
            newIndex     = (index + step) % countRecords,
            id;

        while (newIndex < 0) {
            newIndex += countRecords
        }

        id = view.getRowId(store.getAt(newIndex));

        if (id) {
            me.deselectAllRows(true);
            me.selectRow(id)
        }
    }

    /**
     * @param {String} id
     * @param {Boolean} [silent]
     */
    selectRow(id, silent) {
        let me       = this,
            {view}   = me,
            vdomNode = id && view.getVdomChild(id),
            cls;

        if (vdomNode) {
            cls = vdomNode.cls || [];
            NeoArray.add(cls, me.selectedCls);
            vdomNode.cls = cls;

            me.selectedRowIds.push(id)
        }

        !silent && view.update()
    }

    /**
     *
     */
    unregister() {
        this.deselectAllRows();
        super.unregister()
    }
}

export default Neo.setupClass(CellRowModel);
