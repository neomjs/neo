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
     * @summary The id of the DOM cell an editor must cover, translated into the grid's contract.
     *
     * `grid.Body#getCellId()` takes a **row index**, not a record: a grid's cell ids are pool-slot
     * based (`…__row-{index % poolSize}`), because rows are recycled as the viewport moves. The
     * inherited call passed the table's record straight through, so the modulo produced `NaN`, the
     * id matched no node, and no editor could mount by ANY gesture.
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
     * @summary The View, which is where a grid's keys belong.
     *
     * `grid.View` is the single focus anchor — the only element in a grid that declares `tabindex` —
     * and its own docs name it "the single key registry, the keyboard half of" that contract.
     * `selection.grid.CellModel` and `ColumnModel` already register there. The inherited body
     * registration could never fire: `Neo.manager.DomEvent` walks the event path UPWARD, and the
     * bodies are the View's descendants, so a keydown targeted at the View never reaches them.
     * @returns {Neo.component.Base}
     * @protected
     */
    getKeyRegistryOwner() {
        return this.owner.view
    }

    /**
     * @summary Opens an editor over the SELECTED cell, resolved from the selection model.
     *
     * The inherited implementation guards on `data.target.cls?.includes('neo-selected')` — the
     * keydown's target, i.e. whatever holds focus. On a grid that is always the View, and
     * `neo-selected` is on the CELL, so the guard could never hold. Selection is the question being
     * asked, so it is asked of the selection model: the same `hasSelection()` / `items[0]` /
     * `getRecord()` / `getDataField()` accessors `CellModel#onNavKeyColumn` navigates with.
     *
     * The base's own `onSelectionChange` carries a `todo` anticipating this — "Once we separate
     * cell selections & focus, we can use this event to mount editors" — and that separation is
     * what made `grid.View` the single focus anchor in the first place.
     * @param {Object} data
     * @returns {Promise<void>}
     */
    async onTableKeyDown(data) {
        let me             = this,
            {view}         = me.owner,
            selectionModel = view?.selectionModel,
            cellId, dataField, record;

        // A row/column model marks no cell, so there is nothing for an editor to cover. Declining is
        // correct; it is the SILENT decline that was the defect.
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
