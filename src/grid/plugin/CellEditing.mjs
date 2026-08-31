import BaseCellEditing from '../../table/plugin/CellEditing.mjs';

/**
 * @summary The grid flavor of inline cell editing: the shared plugin over pooled row components.
 *
 * Grid bodies differ from table bodies in exactly two contracts the base plugin seams out:
 * `getCellId` takes a row INDEX (pooled row ids are `…__row-<index % poolSize>`, so a record
 * argument turns into `row-NaN` and the editor silently never mounts), and rows are pooled
 * components rather than vdom children of the body root (so the table's `cn[rowIndex]` row
 * rebuild indexes a wrong or missing node once the grid scrolls). Both overrides mirror what
 * `grid.Body#onStoreRecordChange` does for record-driven redraws.
 * @class Neo.grid.plugin.CellEditing
 * @extends Neo.table.plugin.CellEditing
 */
class CellEditing extends BaseCellEditing {
    static config = {
        /**
         * @member {String} className='Neo.grid.plugin.CellEditing'
         * @protected
         */
        className: 'Neo.grid.plugin.CellEditing',
        /**
         * @member {String} ntype='plugin-grid-cell-editing'
         * @protected
         */
        ntype: 'plugin-grid-cell-editing',
        /**
         * @member {String} cellCls='neo-grid-cell'
         */
        cellCls: 'neo-grid-cell',
        /**
         * @member {String[]} editorCls=['neo-grid-editor']
         */
        editorCls: ['neo-grid-editor']
    }

    /**
     * Grid cell node ids derive from the row index — the store's index, which is the same
     * mapping `createViewData` assigns pooled rows by, and it follows a filtered store because
     * `indexOf` walks the filtered items.
     * @param {Object} record
     * @param {String} dataField
     * @returns {String}
     */
    getCellNodeId(record, dataField) {
        let {body} = this.owner;

        return body.getCellId(body.store.indexOf(record), dataField)
    }

    /**
     * Pooled-row redraw, mirroring `grid.Body#onStoreRecordChange`: resolve the row COMPONENT
     * through the window (`storeIndex % poolSize`) and rebuild its vdom without recycling, so
     * the editor's vdom reference cannot survive the redraw. Off-window rows have no mounted
     * node to clean.
     * @param {Object} record
     * @returns {Promise<void>}
     */
    async redrawRow(record) {
        let {body}        = this.owner,
            {mountedRows} = body,
            rowIndex      = body.store.indexOf(record),
            row;

        if (rowIndex >= mountedRows[0] && rowIndex <= mountedRows[1]) {
            row = body.items[rowIndex % body.items.length];

            if (row) {
                row.createVdom(false, false);
                await body.promiseUpdate()
            }
        }
    }
}

export default Neo.setupClass(CellEditing);
