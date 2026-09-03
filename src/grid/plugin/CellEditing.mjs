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
     * `grid.View` is the grid's key registry, as `selection.grid.CellModel` and `ColumnModel` use.
     * @returns {Neo.component.Base}
     * @protected
     */
    getKeyRegistryOwner() {
        return this.owner.view
    }

    /**
     * Opens an editor over the selected cell. The base reads the keydown target, which on a grid is
     * always the View; `neo-selected` is on the cell, so selection is asked of the selection model.
     * @param {Object} data
     * @returns {Promise<void>}
     */
    async onTableKeyDown(data) {
        let me             = this,
            {view}         = me.owner,
            selectionModel = view?.selectionModel,
            cellId, dataField, record;

        if (me.mountedEditor || !selectionModel?.hasSelection?.()) {
            return
        }

        cellId    = selectionModel.items[0];
        record    = selectionModel.getRecord?.(cellId);
        dataField = view.getDataField(cellId);

        record && dataField && await me.mountEditor(record, dataField)
    }
}

export default Neo.setupClass(CellEditing);
