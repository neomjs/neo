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
        },
        /**
         * True for a model that selects cells: the View hands it the cell ids to paint.
         * @member {Boolean} selectsCells=false
         * @protected
         */
        selectsCells: false,
        /**
         * True for a model that selects columns. A cell model that does toggles the clicked cell's column with
         * the cell, and steps it with arrow navigation.
         * @member {Boolean} selectsColumns=false
         * @protected
         */
        selectsColumns: false,
        /**
         * True for a model that selects rows: the View paints its rows and follows `selectedRecordField` through it.
         * @member {Boolean} selectsRows=false
         * @protected
         */
        selectsRows: false
    }

    /**
     * The classes {@link #applyCellSelection} put on each cell vdom node, so a repaint withdraws exactly those.
     * @member {WeakMap<Object, String[]>} #cellCls
     * @private
     */
    #cellCls = new WeakMap()
    /**
     * `items` as a Set, with the array and length it was built from: the lookup behind {@link #isSelected}.
     * @member {Object|null} #itemLookup=null
     * @private
     */
    #itemLookup = null
    /**
     * The view instance: the `view` config resolves it by id on every read, and a row asks once per cell.
     * @member {Neo.grid.View|null} #view=null
     * @private
     */
    #view = null

    /**
     * Convenience shortcut
     * @member {String[]} dataFields
     */
    get dataFields() {
        return this.view.gridContainer.columns.items.map(column => column.dataField)
    }

    /**
     * Triggered after the view config got changed
     * @param {String|null} value The view id
     * @param {String|null} oldValue
     * @protected
     */
    afterSetView(value, oldValue) {
        this.#view = value ? Neo.getComponent(value) : null
    }

    /**
     * @summary Writes this model's answer for one cell onto its vdom node: the selected class, `aria-selected`
     * and the classes of {@link #getCellCls}. `grid.Row` calls it for every cell it renders and the granular
     * repaints for the cells they revisit, so both paint alike. It withdraws only what it put on the node. A
     * model overrides the two answers it reads, not this.
     * @param {Object} cell The cell's vdom node
     * @param {Object} record
     * @param {String} dataField
     * @returns {Boolean} true if the node changed
     */
    applyCellSelection(cell, record, dataField) {
        let me      = this,
            applied = me.#cellCls.get(cell),
            cls     = me.isSelectedCell(record, dataField) ? [me.selectedCls, ...me.getCellCls(record, dataField)] : null;

        if (applied ? Neo.isEqual(applied, cls) : !cls) {
            return false
        }

        cell.cls ??= [];

        applied && NeoArray.remove(cell.cls, applied);

        if (cls) {
            NeoArray.add(cell.cls, cls);
            cell['aria-selected'] = true;
            me.#cellCls.set(cell, cls)
        } else {
            delete cell['aria-selected'];
            me.#cellCls.delete(cell)
        }

        return true
    }

    /**
     * @summary Admits arrow navigation after the grid's edit terminal: inputs keep their own arrows, and an open
     * edit on the View must commit or return to its invalid editor before selection can move.
     * @param {Object} data
     * @returns {Boolean}
     * @protected
     */
    canNavigate(data) {
        return !this.hasEditorFocus(data) &&
            this.view.gridContainer?.getPlugin('grid-cell-editing')?.onNavigationKey(data) !== false
    }

    /**
     * Updates the visual state (selection class) of specific rows without triggering a full Body update.
     *
     * This method implements the **Granular Update** strategy:
     * 1.  It iterates over the provided record IDs.
     * 2.  It resolves the corresponding `Neo.grid.Row` component.
     * 3.  It inspects the **current VDOM state** of the row.
     * 4.  It ONLY mutates the VDOM and triggers `row.update()` if the selection state has actually changed.
     *
     * This ensures O(1) performance for selection operations, regardless of grid size, and eliminates redundant VDOM traffic.
     * Each caller knows whether it holds record IDs or logical cell IDs, so cells take {@link #updateCells} and no ID is
     * parsed for its kind: a record key containing `__` is still a row.
     *
     * @param {Number|String|Number[]|String[]} recordIds
     * @param {Boolean} [silent=false] - If true, mutates the VDOM but suppresses the `row.update()` call.
     */
    updateRows(recordIds, silent=false) {
        if (!recordIds || recordIds.length === 0) return;

        if (!Array.isArray(recordIds)) {
            recordIds = [recordIds]
        }

        // The single View-owned model spans bodyStart/body/bodyEnd directly: each record is
        // toggled in every body that renders it.
        this.view.bodies.forEach(body => this.updateBodyRows(body, recordIds, silent))
    }

    /**
     * Granular per-body row selection-state update — the body-scoped half of {@link #updateRows}.
     *
     * Resolves each Record ID to its `Neo.grid.Row` within the given body and toggles the selection class
     * only when the state actually changed (O(1) VDOM traffic). The single View-owned model invokes this
     * for each body, replacing the former per-body model fan-out.
     *
     * @param {Neo.grid.Body} body
     * @param {Number[]|String[]} recordIds
     * @param {Boolean} [silent=false] - If true, mutates the VDOM but suppresses the `row.update()` call.
     */
    updateBodyRows(body, recordIds, silent=false) {
        let me        = this,
            {store}   = body,
            processed = new Set();

        recordIds.forEach(recordId => {
            let hasChanged = false,
                record, row;

            if (!processed.has(recordId)) {
                processed.add(recordId);
                record = store.get(recordId);

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
        })
    }

    /**
     * The cell half of {@link #updateRows}: the same granular update for logical cell IDs (`recordId__dataField`).
     * @param {String|String[]} logicalIds
     * @param {Boolean} [silent=false] - If true, mutates the VDOM but suppresses the `row.update()` call.
     */
    updateCells(logicalIds, silent=false) {
        if (!logicalIds || logicalIds.length === 0) return;

        if (!Array.isArray(logicalIds)) {
            logicalIds = [logicalIds]
        }

        this.view.bodies.forEach(body => this.updateBodyCells(body, logicalIds, silent))
    }

    /**
     * The body-scoped half of {@link #updateCells}: resolves each logical cell ID to its row within the given
     * body, and toggles the cell's selection class only when the state actually changed.
     * @param {Neo.grid.Body} body
     * @param {String[]} logicalIds
     * @param {Boolean} [silent=false] - If true, mutates the VDOM but suppresses the `row.update()` call.
     */
    updateBodyCells(body, logicalIds, silent=false) {
        let me        = this,
            processed = new Set();

        logicalIds.forEach(logicalId => {
            let record = body.getRecordFromLogicalId(logicalId),
                row    = record && body.getRow(record);

            if (row && !processed.has(logicalId)) {
                processed.add(logicalId); // Process each logical cell only once per batch

                // Find the cell node in the row's VDOM
                let dataField = body.getDataField(logicalId),
                    cellNode  = row.vdom.cn.find(n => n.data?.field === dataField);

                // We must trigger the update on the row to flush the VDOM change
                if (cellNode && me.applyCellSelection(cellNode, record, dataField) && !silent) {
                    row.update()
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

        me.#itemLookup = null;
        me.silently(() => super.deselect(item, silent, itemCollection, selectedCls));

        if (!silent) {
            me.updateCells(item)
        }
    }

    /**
     * @param {Boolean} [silent] true to prevent a vdom update
     * @param {Object[]|String[]} itemCollection=this.items
     */
    deselectAll(silent, itemCollection) {
        let me    = this,
            items = [...itemCollection || me.items]; // Capture items before they are removed

        me.#itemLookup = null;
        me.silently(() => super.deselectAll(silent, itemCollection));

        me.updateCells(items)
    }

    /**
     * @param {Object|Object[]|String[]} items
     * @param {Object[]|String[]} itemCollection=this.items
     * @param {String} [selectedCls]
     */
    select(items, itemCollection, selectedCls) {
        let me = this;

        me.#itemLookup = null;
        me.silently(() => super.select(items, itemCollection, selectedCls));

        me.updateCells(items)
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

            me.fireRowSelectionChange()
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
     * Reports the rows this model holds selected as `selectionChange`, the event {@link Neo.selection.Model#select}
     * fires for its items: a row selection is a selection change too, and a listener hears it whichever model makes it.
     * @protected
     */
    fireRowSelectionChange() {
        let me = this;

        me.fire('selectionChange', {
            records  : me.selectedRows.map(id => me.view.store.get(id)),
            selection: me.selectedRows
        })
    }

    /**
     * @returns {Set} `items` as a Set, rebuilt when the array or its length differs from the last build
     * @private
     */
    #getItemLookup() {
        let me      = this,
            {items} = me,
            lookup  = me.#itemLookup;

        if (lookup?.items !== items || lookup.length !== items.length) {
            lookup = me.#itemLookup = {items, length: items.length, set: new Set(items)}
        }

        return lookup.set
    }

    /**
     * @summary The classes a selected cell carries beside `selectedCls`; none by default. Override it in a model
     * that draws its selection, such as the outline of a rectangle. It is asked for selected cells only, and a
     * class it stops returning leaves the cell on the next repaint.
     * @param {Object} record
     * @param {String} dataField
     * @returns {String[]}
     */
    getCellCls(record, dataField) {
        return []
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
     * @summary Whether `items` holds an id, in constant time. The lookup is rebuilt on the first question after
     * this model changed `items`, after `items` was assigned, or after its length changed. Code that replaces
     * an entry of the array itself assigns `items` afterwards.
     * @param {String} id
     * @returns {Boolean}
     */
    isSelected(id) {
        return this.#getItemLookup().has(id)
    }

    /**
     * @summary Whether this model holds a cell selected: `grid.Row` asks it for every cell it renders. The
     * default answers from `items`, the logical cell ids. Override it in a model that selects by a rule, such as
     * the rectangle between two cells: keep `items` empty and call {@link #updateRenderedCells} when the rule
     * changes.
     * @param {Object} record
     * @param {String} dataField
     * @returns {Boolean}
     */
    isSelectedCell(record, dataField) {
        let lookup = this.#getItemLookup();

        return lookup.size > 0 && lookup.has(this.#view.getLogicalCellId(record, dataField))
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
        super.register(component);

        // A model swapped at runtime lands on a grid whose ARIA root already exists. The View's own model
        // registers while the grid container still constructs its ariaWrapper, so this first call can be a
        // no-op; the container asks again once the wrapper exists (Neo.grid.Container#construct).
        this.syncAriaMultiselectable()
    }

    /**
     * Runs a base selection change with `view.silentSelect` set: the grid repaints selected cells and rows itself, so
     * the base model must not update the whole View. The previous value is restored rather than reset, because the
     * changes nest — a single-select `select()` runs `deselectAll()` first — and a reset inside would re-enable the
     * View update for the rest of the outer change.
     * @param {Function} fn
     * @protected
     */
    silently(fn) {
        let {view}         = this,
            {silentSelect} = view;

        view.silentSelect = true;

        try {
            fn()
        } finally {
            view.silentSelect = silentSelect
        }
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
     * @summary States on the grid's ARIA root whether several rows or cells can be selected: the WAI-ARIA
     * grid pattern asks a multi-selectable grid to say so, and silence announces a grid in which one item
     * can be selected.
     *
     * `singleSelect` is the model's config, so the model is the only owner of the answer; the root belongs
     * to {@link Neo.grid.Container#getAriaRoot}, which the model reaches through its View. Registration and
     * unregistration call it, and `grid.Container` calls it once its `ariaWrapper` exists — the View's own
     * model registers before that wrapper is created. The update is skipped when the root already states
     * the answer, so a single-select model leaves the initial render alone.
     * @param {Boolean} [multiselectable=!this.singleSelect] the state to write; `false` withdraws the attribute
     * @protected
     */
    syncAriaMultiselectable(multiselectable=!this.singleSelect) {
        let me        = this,
            {view}    = me,
            container = view?.gridContainer,
            root;

        if (!container?.ariaWrapper) {
            return
        }

        root = container.getAriaRoot();

        if (multiselectable) {
            if (root['aria-multiselectable'] === true) {
                return
            }

            root['aria-multiselectable'] = true
        } else {
            if (!('aria-multiselectable' in root)) {
                return
            }

            delete root['aria-multiselectable']
        }

        container.ariaWrapper.update()
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
            rows.length    > 0 && me.updateRows(rows);
            me.syncAriaMultiselectable(false)
        }

        super.unregister()
    }

    /**
     * Writes the record's `selectedRecordField` flag, and the View selects the row from it. On the base, so the
     * cell-row models inherit it along with {@link #hasAnnotations}. Without `selected` it toggles, as a row click
     * does; a cell-row model passes the state its cell click intends, so moving within a selected row keeps it.
     * @param {Record} record
     * @param {Boolean} [selected] the state to write, instead of toggling
     */
    updateAnnotations(record, selected) {
        let me               = this,
            {view}           = me,
            {store}          = view,
            recordId         = view.getRecordId(record),
            annotationsField = view.selectedRecordField;

        if (me.singleSelect) {
            if (!(selected ?? !me.isSelectedRow(recordId))) {
                record[annotationsField] = false
            } else {
                me.selectedRows.forEach(id => {
                    // We can use setSilent(), since the last change will trigger a view update
                    id !== recordId && store.get(id).setSilent({[annotationsField]: false})
                });

                record[annotationsField] = true
            }
        } else {
            record[annotationsField] = selected ?? !record[annotationsField]
        }
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

    /**
     * @summary Granular cell repaint without an id list, the cell half of {@link #updateColumns}: asks the model
     * again for every rendered cell of every body and updates only the rows that changed. A model that selects
     * by a rule calls it when the rule changes; the cost follows the rendered cells, not the selection's size.
     * @param {Boolean} [silent=false] true to mutate the VDOM without updating the rows
     */
    updateRenderedCells(silent=false) {
        let me = this;

        me.view.bodies.forEach(body => {
            body.items?.forEach(row => {
                let {record}   = row,
                    hasChanged = false;

                record && row.vdom.cn?.forEach(cell => {
                    const field = cell.data?.field;

                    if (field && me.applyCellSelection(cell, record, field)) {
                        hasChanged = true
                    }
                });

                hasChanged && !silent && row.update()
            })
        })
    }
}

export default Neo.setupClass(BaseModel);
