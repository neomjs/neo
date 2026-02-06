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
     * @param {Object[]|String[]} items
     */
    updateRows(items) {
        if (!items || items.length === 0) return;

        console.log('updateRows', items);

        if (!Array.isArray(items)) {
            items = [items]
        }

        let me        = this,
            {view}    = me,
            {store}   = view,
            isCell    = me.ntype.includes('cell'),
            keyProp   = store.getKeyProperty(),
            processed = new Set();

        items.forEach(item => {
            let recordId, row;

            if (isCell) {
                // item is a logical ID: recordId__dataField
                // We resolve the record to find the row.
                let record = view.getRecordFromLogicalId(item);
                if (record) {
                    recordId = record[keyProp];
                    row      = view.getRow(record);

                    console.log('Cell Update:', item, 'Record:', !!record, 'Row:', !!row);

                    if (row && !processed.has(item)) {
                        processed.add(item); // Process each logical cell only once per batch

                        // Find the cell node in the row's VDOM
                        let cellNode = row.vdom.cn.find(n => n.data?.cellId === item);

                        console.log('Cell Node found:', !!cellNode, item);

                        if (cellNode) {
                            // Mutate VDOM directly: Toggle selection class
                            NeoArray.toggle(cellNode.cls, me.selectedCls, me.isSelected(item))
                        }
                        
                        // We must trigger the update on the row to flush the VDOM change
                        row.update()
                    }
                } else {
                    console.warn('Record not found for logical ID:', item);
                }
            } else {
                // item is a recordId (RowModel)
                recordId = item;
                
                if (!processed.has(recordId)) {
                    processed.add(recordId);
                    let record = store.get(recordId);
                    
                    if (record) {
                        row = view.getRow(record);
                        if (row) {
                            // Mutate VDOM directly: Toggle selection class on the row
                            NeoArray.toggle(row.vdom.cls, me.selectedCls, me.isSelected(recordId));
                            
                            if (me.isSelected(recordId)) {
                                row.vdom['aria-selected'] = true
                            } else {
                                delete row.vdom['aria-selected']
                            }
                            
                            row.update()
                        }
                    }
                }
            }
        })
    }

    /**
     * @param {Object} item
     * @param {Boolean} [silent] true to prevent a vdom update
     * @param {Object[]|String[]} itemCollection=this.items
     * @param {String} [selectedCls]
     */
    deselect(item, silent, itemCollection, selectedCls) {
        let me = this;

        me.view.silentSelect = true;
        super.deselect(item, silent, itemCollection, selectedCls);
        me.view.silentSelect = false;

        if (!silent) {
            me.updateRows(item)
        }
    }

    /**
     * @param {Boolean} [silent] true to prevent a vdom update
     * @param {Object[]|String[]} itemCollection=this.items
     */
    deselectAll(silent, itemCollection) {
        let me    = this,
            items = [...itemCollection || me.items]; // Capture items before they are removed

        me.view.silentSelect = true;
        super.deselectAll(silent, itemCollection);
        me.view.silentSelect = false;

        if (!silent) {
            me.updateRows(items)
        }
    }

    /**
     * @param {Object|Object[]|String[]} items
     * @param {Object[]|String[]} itemCollection=this.items
     * @param {String} [selectedCls]
     */
    select(items, itemCollection, selectedCls) {
        let me = this;

        me.view.silentSelect = true;
        super.select(items, itemCollection, selectedCls);
        me.view.silentSelect = false;

        me.updateRows(items)
    }

    /**
     * @param {Boolean} [silent=false] true to prevent a vdom update
     */
    deselectAllRows(silent=false) {
        let me    = this,
            items = [...me.selectedRows];

        if (items.length) {
            items.forEach(item => {
                me.deselectRow(item, true)
            });

            if (!silent) {
                me.updateRows(items)
            }

            me.fire('selectionChange', {
                records  : me.selectedRows.map(id => me.view.store.get(id)),
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
        let me = this;

        NeoArray.remove(me.selectedRows, recordId);

        if (!silent) {
            me.updateRows(recordId)
        }
    }

    /**
     * @param {Object} path
     * @returns {Number|String|null}
     */
    getRecord(path) {
        let node, rowIndex;

        for (node of path) {
            if (node.aria?.rowindex) {
                rowIndex = parseInt(node.aria.rowindex);

                // aria-rowindex is 1 based & also includes the header
                rowIndex -= 2;

                return this.view.store.getAt(rowIndex)
            }
        }

        return null
    }

    /**
     * @param {Number|String} recordId
     * @returns {Neo.grid.Row|null}
     */
    getRowComponent(recordId) {
        return this.view.items.find(row => row.record && row.record[this.view.store.getKeyProperty()] === recordId) || null
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
     * @param {Object|Object[]|String[]} items
     * @param {Object[]|String[]} itemCollection=this.items
     * @param {String} [selectedCls]
     */
    select(items, itemCollection, selectedCls) {
        this.view.updateDepth = 2;
        super.select(items, itemCollection, selectedCls)
    }

    /**
     * @param {Number|String} recordId
     * @param {Boolean}       [silent=false]
     */
    selectRow(recordId, silent=false) {
        let me = this,
            row;

        if (me.singleSelect) {
            [...me.selectedRows].forEach(id => me.deselectRow(id, true))
        }

        NeoArray.add(me.selectedRows, recordId);

        row = me.getRowComponent(recordId);

        if (row) {
            NeoArray.add(row.vdom.cls, me.selectedCls);
            row.vdom['aria-selected'] = true
        }

        if (!silent) {
            me.view.updateDepth = 2;
            me.view.update()
        }
    }

    /**
     * @param {Number|String} recordId
     * @param {Boolean}       [silent=false]
     */
    toggleRowSelection(recordId, silent=false) {
        this[this.isSelectedRow(recordId) ? 'deselectRow' : 'selectRow'](recordId, silent)
    }

    /**
     * @returns {Object}
     */
    toJSON() {
        return {
            ...super.toJSON(),
            selectedColumns: this.selectedColumns,
            selectedRows   : this.selectedRows
        }
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
