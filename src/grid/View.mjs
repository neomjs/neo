import Base            from '../container/Base.mjs';
import ClassSystemUtil from '../util/ClassSystem.mjs';
import RowModel        from '../selection/grid/RowModel.mjs';

/**
 * Component boundaries between grid.View and a cell component: View → Body → Row. `updateDepth` is
 * 1-based, so this is the depth at which the cells themselves are still the pruned boundary — the reach
 * INTO them is added on top, from what the columns report their cells to be.
 * @type {Number}
 */
const ROW_DISTANCE = 3;

/**
 * @class Neo.grid.View
 * @extends Neo.container.Base
 */
class View extends Base {
    static config = {
        /**
         * @member {String} className='Neo.grid.View'
         * @protected
         */
        className: 'Neo.grid.View',
        /**
         * @member {String} ntype='grid-view'
         * @protected
         */
        ntype: 'grid-view',
        /**
         * @member {String[]} baseCls=['neo-grid-view', 'neo-hide-scrollbar']
         * @protected
         */
        baseCls: ['neo-grid-view', 'neo-hide-scrollbar'],
        /**
         * grid.View is the single logical focus anchor for the multi-body grid: its outer element is
         * programmatically focusable (`tabIndex: '-1'`, not tab-reachable), so a row activation in ANY
         * body resolves to ONE View-owned focus state instead of an accidental per-body user-agent ring.
         * @member {Object} _vdom={tabIndex:'-1',cn:[]}
         */
        _vdom:
            {tabIndex: '-1', cn: []},
        /**
         * Back-reference to the owning grid.Container (the macro layer). grid.View orchestrates the
         * 1-3 bodies (`bodyStart`, `body`, `bodyEnd`) but reaches up to the container for macro state
         * it does not own — column distribution and the ScrollManager (horizontal scroll position plus
         * main-thread scroll/hover/pinning addon coordination).
         * @member {Neo.grid.Container|null} gridContainer=null
         */
        gridContainer: null,
        /**
         * Empty keys container so the single View-owned SelectionModel registers its Up/Down handlers
         * HERE (`view.keys._keys`) — grid.View is the single key registry, the keyboard half of the
         * multi-body focus/selection centralization (the earlier split left keyboard migration for
         * follow-up). Now that a row activation focuses the View, ArrowUp/Down reach these handlers directly.
         * @member {Object} keys={}
         */
        keys: {},
        /**
         * @member {Object} layout={ntype: 'hbox', align: 'stretch'}
         * @protected
         */
        layout: {ntype: 'hbox', align: 'stretch'},
        /**
         * The current scroll top position of the grid view
         * @member {Number} scrollTop_=0
         */
        scrollTop_: 0,
        /**
         * The grid's one selection model, owned here: the View orchestrates the bodies, the bodies
         * render and forward events and carry no model of their own. Three states — the `RowModel`
         * class (the default, instantiated once, here), a model config or instance (the explicit
         * model), and `null`: no selection at all, nothing instantiated, no row ever marked, no
         * selection handler installed. Selection state is keyed by recordId and spans all bodies.
         * Consumers set it through `grid.Container#viewConfig` and write `grid.view.selectionModel`.
         * @member {Neo.selection.grid.BaseModel|null} selectionModel_=RowModel
         * @reactive
         */
        selectionModel_: RowModel,
        /**
         * The record field a row selection mirrors: a {@link Neo.selection.grid.RowModel} writes it
         * when a row is selected, and the View adopts records that carry it — once, on the store's
         * load and on a record change — so a flagged record becomes a selected row through the one
         * owner, never inside a body's render.
         * @member {String} selectedRecordField='annotations.selected'
         */
        selectedRecordField: 'annotations.selected'
    }

    /**
     * The active bodies in visual order (`bodyStart`, `body`, `bodyEnd`) — the render/event delegates
     * the single View-owned SelectionModel spans for cross-body selection state.
     * @returns {Neo.grid.Body[]}
     */
    get bodies() {
        let container = this.gridContainer;
        return container ? [container.bodyStart, container.body, container.bodyEnd].filter(Boolean) : []
    }

    /**
     * How far a scroll update has to reach past a row to repaint the cell CONTENTS: the deepest chain of
     * nested components any column's cells have reached, counting the cell itself as 1.
     *
     * Read from the columns rather than measured here, because `grid.column.Component` measures a cell
     * once when it creates it, while this is read on every scroll frame. Defaults to 1, which is the
     * flat cell every built-in module is today.
     * @returns {Number}
     */
    get maxCellDepth() {
        let max = 1;

        for (const column of this.gridContainer?.columns?.items || []) {
            if (column.cellDepth > max) {
                max = column.cellDepth
            }
        }

        return max
    }

    /**
     * The one model when it selects rows — `RowModel` and the combined cell-row models — else `null`.
     * The paint and the store-following adopt {@link #selectedRecordField} through it and only through
     * it: a cell or column model leaves a record's flag alone.
     * @returns {Neo.selection.grid.BaseModel|null}
     */
    get rowSelectionModel() {
        let {selectionModel} = this;
        return selectionModel?.ntype?.includes('row') ? selectionModel : null
    }

    /**
     * The cell ids the View's model holds selected — `[]` under a row or column model, and under none.
     * @returns {String[]}
     */
    get selectedCells() {
        let {selectionModel} = this;
        return selectionModel?.ntype?.includes('cell') ? selectionModel.items : []
    }

    /**
     * The record ids the View's model holds selected — `[]` under a cell or column model, and under none.
     * @returns {Number[]|String[]}
     */
    get selectedRows() {
        return this.rowSelectionModel?.selectedRows ?? []
    }

    /**
     * The Store is owned by the macro layer (gridContainer); the View-owned SelectionModel reads it
     * here rather than through an individual body.
     * @returns {Neo.data.Store|Neo.data.TreeStore|null}
     */
    get store() {
        return this.gridContainer?.store || null
    }

    /**
     * Triggered after the isLoading config got changed
     *
     * {@link Neo.grid.Body#createViewData} refuses to project while the view is loading, and a store
     * that commits inside that window fires its `load` into the refusal — so the rows keep showing
     * the pre-load projection after the mask clears, with nothing left to re-run them. Clearing the
     * flag is therefore a projection trigger and not only a mask removal, which is what any consumer
     * wrapping a bulk store mutation in `isLoading` depends on.
     *
     * Every body is asked, not just `body`: `bodyStart` and `bodyEnd` project the same store through
     * the same guard, so a locked-column grid would otherwise clear its mask over two stale flanks.
     * @param {Boolean|String} value
     * @param {Boolean|String} oldValue
     * @protected
     */
    afterSetIsLoading(value, oldValue) {
        let me = this;

        super.afterSetIsLoading(value, oldValue);

        if (oldValue !== undefined && !value) {
            // Deferred one tick, and not for tidiness: the mask removal this call just published is
            // still in flight, so a synchronous re-projection meets `createViewData`'s guard block
            // while the body still measures as masked. That block returns BEFORE the `isVdomUpdating`
            // branch that would re-register the work, so an early call is not merely early — it is
            // dropped, and nothing schedules another.
            //
            // `createViewData` clears the CONTAINER's flag on its way out, which arrives back here as
            // a no-op through the config's own equality gate, so this cannot re-enter.
            // The deferral is detached, so it owns its terminal outcome. `core.Base#destroy` rejects
            // every pending timeout with `Neo.isDestroyed`, and a view destroyed inside this one tick
            // is an expected end to a re-projection into somewhere that no longer exists — not a
            // failure to report. The `isDestroyed` guard below cannot cover it: that guard only runs
            // when the timeout RESOLVES, and destroy makes it reject. Anything else IS a live failure
            // and this chain has no caller to propagate to, so the console is the honest surface.
            me.timeout(0)
                .then(() => {
                    me.isDestroyed || me.items?.forEach(body => body.createViewData?.(false, true))
                })
                .catch(reason => {
                    reason !== Neo.isDestroyed &&
                        console.error('grid.View: deferred re-projection failed', {id: me.id, reason})
                })
        }
    }

    /**
     * Triggered after the selectionModel config got changed. Registers grid.View (not a body) as the
     * model's `view`, so a single model owns selection state across all bodies.
     * @param {Neo.selection.Model} value
     * @param {Neo.selection.Model} oldValue
     * @protected
     */
    afterSetSelectionModel(value, oldValue) {
        // A model set after construction registers at once (component-level events only, safe
        // pre-vnode). The one created from the View's own configs waits for onConstructed(): its
        // keyboard keys need `keys` to be the finished KeyNavigation, and its row/record contract
        // (store, bodies, getRow…) needs the bodies in place.
        this.isConstructed && value?.register(this)
    }

    /**
     * Registers the model the View's own configs created, once every config — `keys` and the
     * bodies included — is in place, and starts following the store for the selection field.
     */
    onConstructed() {
        super.onConstructed();
        this.selectionModel?.register(this);
        this.bindStore(this.store, null)
    }

    /**
     * Listens to the store for the one selection concern the View owns — a record's
     * {@link #selectedRecordField} — once per grid, however many bodies render the record.
     * `grid.Container` calls it again when its store changes.
     * @param {Neo.data.Store|null} value
     * @param {Neo.data.Store|null} oldValue
     */
    bindStore(value, oldValue) {
        let me        = this,
            listeners = {load: me.onStoreLoad, recordChange: me.onStoreRecordChange, scope: me};

        // on() and un() consume keys like `scope` from the passed object, so each call gets its own copy
        oldValue?.un({...listeners});
        value   ?.on({...listeners});

        // a store that already holds its records fires no load for them
        value?.count && me.onStoreLoad()
    }

    /**
     * Retires the model the View owns and stops following the store; a body's destruction never
     * touches the model.
     * @param {...*} args
     */
    destroy(...args) {
        let me = this;

        me.bindStore(null, me.store);
        me.selectionModel?.destroy?.();
        super.destroy(...args)
    }

    /**
     * A loaded store's flagged records are the selected rows — adopted here, once, through the one
     * row-selecting model; a paint follows through the model's own row update, never a mutation in
     * a render.
     */
    onStoreLoad() {
        let me                         = this,
            {rowSelectionModel, store} = me,
            field                      = me.selectedRecordField;

        if (rowSelectionModel && store && field) {
            store.items.forEach(record => {
                record[field] && rowSelectionModel.selectRow(me.getRecordId(record))
            })
        }
    }

    /**
     * A record's selection flag changed: the one row-selecting model follows it, once.
     * @param {Object}   data
     * @param {Object[]} data.fields
     * @param {Object}   data.record
     */
    onStoreRecordChange({fields, record}) {
        let me                  = this,
            {rowSelectionModel} = me,
            field               = fields.find(item => item.name === me.selectedRecordField);

        if (field && rowSelectionModel) {
            rowSelectionModel[field.value ? 'selectRow' : 'deselectRow'](me.getRecordId(record))
        }
    }

    /**
     * Triggered before the selectionModel config gets changed. Instantiates a class or config into
     * the one instance and keeps every falsy value as `null` — the honest state of a grid that
     * selects nothing. The previous instance is destroyed here: the View owns the lifecycle.
     * @param {Neo.selection.Model|Function|Object|null} value
     * @param {Neo.selection.Model|null} oldValue
     * @returns {Neo.selection.Model|null}
     * @protected
     */
    beforeSetSelectionModel(value, oldValue) {
        oldValue?.destroy();
        return value ? ClassSystemUtil.beforeSetInstance(value, RowModel) : null
    }

    /**
     * Resolves the dataField for a logical cell id (`recordId__dataField`). Body-agnostic — delegates
     * to the center body.
     * @param {String} cellId
     * @returns {String}
     */
    getDataField(cellId) {
        return this.gridContainer?.body?.getDataField(cellId)
    }

    /**
     * Resolves the logical cell id (`recordId__dataField`) for a record + field. Body-agnostic —
     * delegates to the center body.
     * @param {Object} record
     * @param {String} dataField
     * @returns {String}
     */
    getLogicalCellId(record, dataField) {
        return this.gridContainer?.body?.getLogicalCellId(record, dataField)
    }

    /**
     * Resolves the data record for a logical cell id. Body-agnostic — delegates to the center body.
     * @param {String} logicalId
     * @returns {Object|null}
     */
    getRecordFromLogicalId(logicalId) {
        return this.gridContainer?.body?.getRecordFromLogicalId(logicalId) ?? null
    }

    /**
     * Resolves the stable record id for a record. Body-agnostic — delegates to the center body.
     * @param {Object} record
     * @returns {Number|String}
     */
    getRecordId(record) {
        return this.gridContainer?.body?.getRecordId(record)
    }

    /**
     * @returns {Object}
     */
    getVdomUpdateMeta() {
        return {
            scrollTop: this.scrollTop
        }
    }

    /**
     * Scrolls the grid by a number of rows. Delegates to the center body (the scroll authority).
     * @param {Number} index
     * @param {Number} step
     */
    scrollByRows(index, step) {
        return this.gridContainer?.body?.scrollByRows(index, step)
    }

    /**
     * Pushes synchronized scrolling coordinates (startIndex / scrollTop) into all active bodies
     * (`bodyStart`, `body`, `bodyEnd`). Owned here because grid.View is the body orchestrator; the
     * horizontal scroll position is read from the gridContainer macro layer, which retains the
     * ScrollManager.
     *
     * Preserves the row/cell pooling invariant: each body recomputes view data for a fixed node pool
     * via the silent `createViewData(true)` path — never inserting, removing, or moving DOM nodes
     * while scrolling.
     * @param {Number} scrollTop
     */
    syncBodies(scrollTop) {
        let me                                        = this,
            container                                 = me.gridContainer,
            {body, bodyEnd, bodyStart, scrollManager} = container,
            {bufferRowRange, rowHeight}               = body,
            newStartIndex                             = Math.floor(scrollTop / rowHeight);

        let updateBody = _body => {
            let isCenter = _body === body;
            _body.skipCreateViewData = true;

            _body.set({
                scrollLeft: isCenter ? scrollManager.scrollLeft : 0, // Horizontal sync applies from scrollManager state ONLY for center
                scrollTop : scrollTop
            });

            if (Math.abs(_body.startIndex - newStartIndex) >= bufferRowRange) {
                _body.startIndex = newStartIndex
            } else {
                _body.visibleRows[0] = newStartIndex;
                _body.visibleRows[1] = newStartIndex + _body.availableRows
            }

            _body.skipCreateViewData = false;
            _body.createViewData(true) // silent = true
        };

        updateBody(body);
        bodyStart && updateBody(bodyStart);
        bodyEnd   && updateBody(bodyEnd);

        me.scrollTop = scrollTop;

        // The scroll repaints a row's subtree as one silent transaction, so the depth has to reach the
        // cell CONTENTS, not the cell. `updateDepth` is 1-based and `TreeBuilder` decrements it only when
        // it crosses a component boundary, so View → Body → Row costs 3 and everything past the boundary
        // is emitted as `{componentId, neoIgnore: true}` — a reference the worker leaves untouched.
        //
        // At 3 that boundary lands on the cell components themselves: rows repaint while every
        // `grid.column.Component` cell keeps what it first rendered. The reach past it is not a constant,
        // because a cell may be a container whose children hold the record-derived content — so the
        // columns report what their cells actually are and the depth is derived from that. A literal
        // would be a snapshot of today's cell modules, and would leave a nested cell stale.
        //
        // -1 is NOT the shortcut it appears to be: `hasUpdateCollision` treats it as colliding with every
        // distance, which pulls unrelated pending child updates into the scroll cycle and destabilises
        // the TreeGrid. The bound has to stay finite.
        me.updateDepth = ROW_DISTANCE + me.maxCellDepth;
        me.update()
    }
}

export default Neo.setupClass(View);
