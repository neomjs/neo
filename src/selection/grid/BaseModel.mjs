import Model    from '../Model.mjs';
import NeoArray from '../../util/Array.mjs';

/**
 * Abstract base class for all grid related selection models
 * @class Neo.selection.grid.BaseModel
 * @extends Neo.selection.Model
 * @abstract
 */
class BaseModel extends Model {
    static config = {
        /**
         * @member {String} className='Neo.selection.grid.BaseModel'
         * @protected
         */
        className: 'Neo.selection.grid.BaseModel',
        /**
         * Storing the column dataFields
         * @member {String[]} selectedColumns=[]
         */
        selectedColumns: [],
        /**
         * Storing the record ids
         * @member {Number[]|String[]} selectedRows=[]
         * @protected
         */
        selectedRows: []
    }

    /**
     * Convenience shortcut
     * @member {String[]} dataFields
     */
    get dataFields() {
        return this.view.parent.columns.items.map(column => column.dataField)
    }

    /**
     * @param {Boolean} [silent=false] true to prevent a vdom update
     */
    deselectAllRows(silent=false) {
        let me     = this,
            items  = [...me.selectedRows],
            {view} = me;

        if (items.length) {
            items.forEach(item => {
                me.deselectRow(item, true)
            });

            if (!silent && items.length > 0) {
                view.update()
            }

            me.fire('selectionChange', {
                selection: me.selectedRows
            })
        } else if (!silent) {
            me.fire('noChange')
        }
    }

    /**
     * @param {Number|String} recordId
     * @param {Boolean}       [silent=false]
     */
    deselectRow(recordId, silent=false) {
        let me      = this,
            {view}  = me,
            {store} = view,
            record  = store.get(recordId),
            rowId   = view.getRowId(store.indexOf(record)),
            node    = view.getVdomChild(rowId);

        if (node) {
            node.cls = NeoArray.remove(node.cls || [], me.selectedCls);
            delete node['aria-selected']
        }

        me.selectedRows = [recordId];

        !silent && view.update()
    }

    /**
     * Get the record for a given event path
     * @param {Object[]} path
     * @returns {Number|String|null}
     */
    getRecord(path) {
        let node, rowIndex;

        for (node of path) {
            if (node.aria.rowindex) {
                rowIndex = parseInt(node.aria.rowindex);

                // aria-rowindex is 1 based & also includes the header
                rowIndex -= 2;

                return this.view.store.getAt(rowIndex)
            }
        }

        return null
    }

    /**
     * @param {Record} record
     * @returns {Boolean}
     */
    hasAnnotations(record) {
        return !!Object.getOwnPropertyDescriptor(record.__proto__, this.view.selectedRecordField)
    }

    /**
     * Checks if an event path contains a grid cell editor
     * @param {Object}   data
     * @param {Object[]} data.path
     * @returns {Boolean}
     */
    hasEditorFocus({path}) {
        for (const node of path) {
            if (node.cls?.includes('neo-grid-editor')) {
                return true
            }
        }

        return false
    }

    /**
     * @param {String} dataField
     * @returns {Boolean} true in case the column is selected
     */
    isSelectedColumn(dataField) {
        return this.selectedColumns.includes(dataField)
    }

    /**
     * @param {Number|String} recordId
     * @returns {Boolean} true in case the row is selected
     */
    isSelectedRow(recordId) {
        return this.selectedRows.includes(recordId)
    }

    /**
     * @param {Number|String} recordId
     * @param {Boolean}       [silent=false]
     */
    selectRow(recordId, silent=false) {
        let me      = this,
            {view}  = me,
            {store} = view,
            record  = store.get(recordId),
            rowId   = view.getRowId(store.indexOf(record)),
            node    = view.getVdomChild(rowId);

        if (me.singleSelect) {
            me.deselectAllRows(true)
        }

        if (node) {
            node.cls = NeoArray.add(node.cls || [], me.selectedCls);
            node['aria-selected'] = true
        }

        me.selectedRows = [recordId];

        !silent && view.update()
    }

    /**
     * @param {Number|String} recordId
     * @param {Boolean}       [silent=false]
     */
    toggleRowSelection(recordId, silent=false) {
        this[this.isSelectedRow(recordId) ? 'deselectRow' : 'selectRow'](recordId, silent)
    }

    /**
     *
     */
    unregister() {
        let me        = this,
            countRows = me.selectedRows.length;

        me.selectedRows = [];

        countRows > 0 && me.view.createViewData();

        super.unregister()
    }
}

export default Neo.setupClass(BaseModel);
