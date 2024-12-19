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
        editorCls: ['neo-grid-editor']
    }
}

export default Neo.setupClass(CellEditing);
