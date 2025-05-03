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
        cls: 'neo-selection-cellrowmodel'
    }

    /**
     * @param {Object} data
     */
    onCellClick(data) {
        let me     = this,
            {view} = me,
            cellId = data.data.currentTarget,
            record = me.getRecord(data.data.path);

        if (record) {
            if (me.hasAnnotations(record)) {
                me.updateAnnotations(record)
            } else {
                me[me.isSelected(cellId) ? 'deselectRow' : 'selectRow'](record[view.store.getKeyProperty()], true)
            }
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
            keyProperty  = store.getKeyProperty(),
            recordId     = me.selectedRows[0] || store.getAt(0)[keyProperty],
            record       = store.get(recordId),
            index        = store.indexOf(record),
            newIndex     = (index + step) % countRecords;

        while (newIndex < 0) {
            newIndex += countRecords
        }

        record = store.getAt(newIndex);

        if (me.hasAnnotations(record)) {
            me.updateAnnotations(record)
        } else {
            recordId = record[keyProperty];

            if (recordId) {
                me.selectRow(recordId, true) // silent
            }
        }

        super.onNavKeyRow(step)
    }
}

export default Neo.setupClass(CellRowModel);
