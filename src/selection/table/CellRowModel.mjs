import CellModel from './CellModel.mjs';
import NeoArray  from '../../util/Array.mjs';
import RowModel  from './RowModel.mjs';
import VDomUtil  from '../../util/VDom.mjs';

/**
 * @class Neo.selection.table.CellRowModel
 * @extends Neo.selection.table.CellModel
 */
class CellRowModel extends CellModel {
    static config = {
        /**
         * @member {String} className='Neo.selection.table.CellRowModel'
         * @protected
         */
        className: 'Neo.selection.table.CellRowModel',
        /**
         * @member {String} ntype='selection-table-cellrowmodel'
         * @protected
         */
        ntype: 'selection-table-cellrowmodel',
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

        if (!silent) {
            view.updateDepth = 2;
            view.update()
        }
    }

    /**
     * @param {Object} data
     */
    onCellClick(data) {
        let me   = this,
            node = RowModel.getRowNode(data.data.path), // we could add a separate export for this method
            id   = node?.id;

        if (id) {
            me.deselectAllRows(true);
            me.selectRow(id)
        }

        super.onCellClick(data)
    }

    /**
     * @param {Object} data
     * @param {Number} step
     */
    onNavKeyRow(data, step) {
        super.onNavKeyRow(data, step);

        let me         = this,
            node       = RowModel.getRowNode(data.path),
            {view}     = me,
            {store}    = view,
            vdomNode   = VDomUtil.find(view.vdom, node.id),
            newIndex   = (vdomNode.index + step) % store.getCount(),
            parentNode = vdomNode.parentNode,
            id;

        while (newIndex < 0) {
            newIndex += store.getCount()
        }

        id = parentNode.cn[newIndex].id;

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

        if (!silent) {
            view.updateDepth = 2;
            view.update()
        }
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
