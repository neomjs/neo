import BaseCellEditing from '../../table/plugin/CellEditing.mjs';

/**
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
        editorCls: ['neo-grid-editor'],
        /**
         * @member {Boolean} focusCells=true
         */
        focusCells: true
    }

    /**
     * `grid.Body#getCellId()` takes a row INDEX, not a record — grid cell ids are pool-slot based.
     * @param {Object} record
     * @param {String} dataField
     * @returns {String}
     * @protected
     */
    getEditorCellId(record, dataField) {
        let {body} = this.owner;

        return body.getCellId(body.store?.indexOf(record), dataField)
    }

    /**
     * `grid.View` owns the key registry every grid selection model registers into.
     * @returns {Neo.component.Base}
     * @protected
     */
    getKeyRegistryOwner() {
        return this.owner.view
    }

    /**
     * Opens an editor over the selected cell. The base reads the keydown target, which on a grid is
     * always the View; `neo-selected` is on the cell, so the cell comes from the selection model.
     *
     * Gated on a cell id rather than `hasSelection()`: only the `Cell*` models put cell ids in
     * `items`. `ColumnModel` answers `hasSelection()` from `selectedColumns` and leaves `items`
     * empty, so the pair disagree and a selection check would reach `getRecord(undefined)`.
     * @param {Object} data
     * @returns {Promise<void>}
     */
    async onTableKeyDown(data) {
        let me             = this,
            {view}         = me.owner,
            selectionModel = view?.selectionModel,
            cellId         = selectionModel?.items?.[0],
            dataField, record;

        if (me.mountedEditor || !cellId) {
            return
        }

        record    = selectionModel.getRecord?.(cellId);
        dataField = view.getDataField(cellId);

        record && dataField && await me.mountEditor(record, dataField)
    }
}

export default Neo.setupClass(CellEditing);
