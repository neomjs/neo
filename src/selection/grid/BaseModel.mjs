import {isDescriptor} from '../../core/ConfigSymbols.mjs';
import Model          from '../Model.mjs';
import NeoArray       from '../../util/Array.mjs';

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
         * The column dataFields this model holds selected. A descriptor, like `Neo.selection.Model#items_`
         * and `grid.Body`'s windows: a static array default is ONE object per class — every model of that
         * class shared it, and two grids selected together — so `clone` makes it per instance, and
         * `cloneOnGet: 'none'` lets the in-place `NeoArray` writes land instead of hitting a read copy.
         * @member {String[]} selectedColumns_=[]
         * @reactive
         */
        selectedColumns_: {
            [isDescriptor]: true,
            clone         : 'shallow',
            cloneOnGet    : 'none',
            value         : []
        },
        /**
         * The record ids this model holds selected; the descriptor for the reason above.
         * @member {Number[]|String[]} selectedRows_=[]
         * @protected
         * @reactive
         */
        selectedRows_: {
            [isDescriptor]: true,
            clone         : 'shallow',
            cloneOnGet    : 'none',
            value         : []
        }
    }

    /**
     * Convenience shortcut
     * @member {String[]} dataFields
     */
    get dataFields() {
        return this.view.gridContainer.columns.items.map(column => column.dataField)
    }

    /**
     * Updates the visual state (selection class) of specific rows or cells without triggering a full Body update.
     *
     * This method implements the **Granular Update** strategy:
     * 1.  It iterates over the provided items (logical cell IDs or record IDs).
     * 2.  It resolves the corresponding `Neo.grid.Row` component.
     * 3.  It inspects the **current VDOM state** of the target node (row or cell).
     * 4.  It ONLY mutates the VDOM and triggers `row.update()` if the selection state has actually changed.
     *
     * This ensures O(1) performance for selection operations, regardless of grid size, and eliminates redundant VDOM traffic.
     *
     * @param {Object[]|String[]} items - Array of Record IDs (for RowModel) or Logical Cell IDs (for CellModel).
     * @param {Boolean} [silent=false] - If true, mutates the VDOM but suppresses the `row.update()` call.
     */
    updateRows(items, silent=false) {
        if (!items || items.length === 0) return;

        if (!Array.isArray(items)) {
            items = [items]
        }

        // The single View-owned model spans bodyStart/body/bodyEnd directly: each record/cell is
        // toggled in every body that renders it.
        this.view.bodies.forEach(body => this.updateBodyRows(body, items, silent))
    }

    /**
     * Granular per-body selection-state update — the body-scoped half of {@link #updateRows}.
     *
     * Resolves each Record ID / Logical Cell ID to its `Neo.grid.Row` within the given body and
     * toggles the selection class only when the state actually changed (O(1) VDOM traffic). The single
     * View-owned model invokes this for each body, replacing the former per-body model fan-out.
     *
     * @param {Neo.grid.Body} body
     * @param {Object[]|String[]} items - Array of Record IDs (RowModel) or Logical Cell IDs (CellModel).
     * @param {Boolean} [silent=false] - If true, mutates the VDOM but suppresses the `row.update()` call.
     */
    updateBodyRows(body, items, silent=false) {
        let me        = this,
            {store}   = body,
            processed = new Set();

        items.forEach(item => {
            let hasChanged = false,
                isCell     = item.toString().includes('__'),
                recordId, row;

            if (isCell) {
                // item is a logical ID: recordId__dataField
                // We resolve the record to find the row.
                let record = body.getRecordFromLogicalId(item);
                if (record) {
                    row = body.getRow(record);

                    if (row && !processed.has(item)) {
                        processed.add(item); // Process each logical cell only once per batch

                        // Find the cell node in the row's VDOM
                        let dataField     = body.getDataField(item),
                            cellNode      = row.vdom.cn.find(n => n.data?.field === dataField),
                            shouldSelect  = me.isSelected(item),
                            alreadySelect = cellNode?.cls?.includes(me.selectedCls);

                        if (cellNode && shouldSelect !== alreadySelect) {
                            // Mutate VDOM directly: Toggle selection class
                            NeoArray[shouldSelect ? 'add' : 'remove'](cellNode.cls, me.selectedCls);

                            if (shouldSelect) {
                                cellNode['aria-selected'] = true
                            } else {
                                delete cellNode['aria-selected']
                            }

                            hasChanged = true
                        }

                        // We must trigger the update on the row to flush the VDOM change
                        if (hasChanged && !silent) {
                            row.update()
                        }
                    }
                }
            } else {
                // item is a recordId (RowModel)
                recordId = item;

                if (!processed.has(recordId)) {
                    processed.add(recordId);
                    let record = store.get(recordId);

                    if (record) {
                        row = body.getRow(record);

                        if (row) {
                            let isSelected    = me.isSelectedRow(recordId),
                                alreadySelect = row.vdom.cls?.includes(me.selectedCls);

                            if (isSelected !== alreadySelect) {
                                // Mutate VDOM directly: Toggle selection class on the row
                                NeoArray[isSelected ? 'add' : 'remove'](row.vdom.cls, me.selectedCls);

                                if (isSelected) {
                                    row.vdom['aria-selected'] = true
                                } else {
                                    delete row.vdom['aria-selected']
                                }

                                hasChanged = true
                            }

                            if (hasChanged && !silent) {
                                row.update()
                            }
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

        me.updateRows(items)
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

        me.updateRows(recordId, silent)
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
     * Resolves a record from an ID (PK or internalId).
     * @param {String|Number} id
     * @returns {Neo.data.Record|null}
     */
    getRowRecord(id) {
        if (!id) return null;

        let me    = this,
            {view} = me,
            {store}= view,
            record = store.get(id);

        if (record) return record;

        // Fast path: check visible rows across all bodies
        for (let body of view.bodies) {
            let row = body.items.find(r => r.record && body.getRecordId(r.record) === id);
            if (row) return row.record
        }

        return null
    }

    /**
     * @param {Number|String} recordId
     * @returns {Neo.grid.Row|null}
     */
    getRowComponent(recordId) {
        let me = this;

        for (let body of me.view.bodies) {
            let found = body.items.find(r => r.record && me.view.store.getKey(r.record) === recordId);
            if (found) return found
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
     * @param {Neo.component.Base} component
     */
    register(component) {
        // grid.View registers as the single model's `view`; with one View-owned model there are no
        // sibling per-body models to adopt state from (the former multi-body Peer State Adoption).
        super.register(component)
    }

    /**
     * @param {Number|String} recordId
     * @param {Boolean}       [silent=false]
     */
    selectRow(recordId, silent=false) {
        let me = this;

        if (me.singleSelect) {
            [...me.selectedRows].forEach(id => me.deselectRow(id))
        }

        NeoArray.add(me.selectedRows, recordId);

        me.updateRows(recordId, silent)
    }

    /**
     * Replaces the column selection and repaints only the cells whose column changed state.
     *
     * A row paints the column class when its content is created, and `grid.Body#createViewData` skips
     * every row whose record and index are unchanged — so assigning `selectedColumns` and re-projecting
     * never reached a cell, and clearing it left the class painted.
     * @param {String[]} dataFields
     * @param {Boolean} [silent=false] true to mutate the VDOM without updating the rows
     * @returns {Boolean} true if the selection changed
     */
    setSelectedColumns(dataFields, silent=false) {
        let me       = this,
            previous = [...me.selectedColumns];

        if (Neo.isEqual(previous, dataFields)) {
            return false
        }

        me.selectedColumns = dataFields;
        me.updateColumns(NeoArray.union(previous, dataFields), silent);

        return true
    }

    /**
     * Moves the column selection `step` columns along, wrapping at either end. With no column selected
     * it starts from the first one.
     * @param {Number} step
     * @returns {Number} The index of the column the selection moved from
     */
    stepSelectedColumn(step) {
        let me           = this,
            {dataFields} = me,
            count        = dataFields.length,
            fromIndex    = dataFields.indexOf(me.selectedColumns[0] ?? dataFields[0]);

        me.setSelectedColumns([dataFields[((fromIndex + step) % count + count) % count]]);

        return fromIndex
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
            selectedColumnCellCls: this.selectedColumnCellCls,
            selectedColumns      : this.selectedColumns,
            selectedRows         : this.selectedRows
        }
    }

    /**
     *
     */
    unregister() {
        let me      = this,
            columns = [...me.selectedColumns],
            rows    = [...me.selectedRows];

        me.selectedColumns = [];
        me.selectedRows    = [];

        // Repaint what was cleared, granularly: re-projecting the bodies skips every row whose record is
        // unchanged. A view that is being destroyed has nothing left to repaint.
        if (!me.view.isDestroying) {
            columns.length > 0 && me.updateColumns(columns);
            rows.length    > 0 && me.updateRows(rows)
        }

        super.unregister()
    }

    /**
     * Granular column repaint, the column half of {@link #updateRows}: toggles the column class on the
     * given columns' cells in every rendered row of every body, and updates only the rows that changed.
     * @param {String[]} dataFields
     * @param {Boolean} [silent=false] true to mutate the VDOM without updating the rows
     */
    updateColumns(dataFields, silent=false) {
        let me  = this,
            cls = me.selectedColumnCellCls || 'neo-selected';

        me.view.bodies.forEach(body => {
            body.items?.forEach(row => {
                let hasChanged = false;

                row.vdom.cn?.forEach(cell => {
                    const
                        field       = cell.data?.field,
                        shouldPaint = me.isSelectedColumn(field);

                    if (dataFields.includes(field) && shouldPaint !== Boolean(cell.cls?.includes(cls))) {
                        cell.cls ??= [];
                        NeoArray.toggle(cell.cls, cls, shouldPaint);
                        hasChanged = true
                    }
                });

                hasChanged && !silent && row.update()
            })
        })
    }
}

export default Neo.setupClass(BaseModel);
