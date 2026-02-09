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
        let me        = this,
            {view}    = me,
            {dataField, record} = data,
            logicalId;

        if (record && dataField) {
            logicalId = view.getLogicalCellId(record, dataField);

            if (me.hasAnnotations(record)) {
                me.updateAnnotations(record)
            } else {
                me[me.isSelected(logicalId) ? 'deselectRow' : 'selectRow'](view.store.getKey(record), true)
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
            recordId     = me.selectedRows[0] || store.getKey(store.getAt(0)),
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
            recordId = store.getKey(record);

            if (recordId) {
                me.selectRow(recordId, true) // silent
            }
        }

        super.onNavKeyRow(step)
    }
}

export default Neo.setupClass(CellRowModel);
