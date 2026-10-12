import Base            from '../container/Base.mjs';
import ClassSystemUtil from '../util/ClassSystem.mjs';
import RowGeometry     from './RowGeometry.mjs';
import RowModel        from '../selection/grid/RowModel.mjs';
import VNodeUtil       from '../util/VNode.mjs';

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
         * Content-sized mode: rows take individual heights, and every row-position consumer reads them from
         * the View-owned {@link #rowGeometry} instead of multiplying by `rowHeight`. `grid.Container` sets it
         * from its own `contentSizedRows` config.
         * @member {Boolean} contentSizedRows_=false
         * @reactive
         */
        contentSizedRows_: false,
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
         * True while the user drags the vertical scrollbar's thumb. The `GridRowScrollPinning` main-thread addon
         * sets it. Content-sized rows hold height changes during the drag, so the extent under the thumb holds
         * still, and apply them at its end.
         * @member {Boolean} isThumbDragging_=false
         * @reactive
         */
        isThumbDragging_: false,
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
     * The row geometry of this view while {@link #contentSizedRows} is on, else `null`. One instance per view
     * keeps its start, center and end bodies on the same row heights.
     * @member {Neo.grid.RowGeometry|null} rowGeometry=null
     */
    rowGeometry = null

    /**
     * Content-sized rows: the padding and borders of a cell in px, as the last read found them
     * @member {Number} #chrome=0
     */
    #chrome = 0
    /**
     * Content-sized rows: heights that arrived during a thumb drag, applied at its end
     * @member {Map|null} #heldHeights=null
     */
    #heldHeights = null
    /**
     * Content-sized rows: the cell vdom nodes whose wrapped text was measured, with the width they had then. New
     * content renders a new node; a recycled node can change its width, which the stored one tells.
     * @member {WeakMap<Object, String>} #measuredCells
     */
    #measuredCells = new WeakMap()
    /**
     * The scheduled {@link #measureRowHeights} pass, while it is pending
     * @member {Promise|null} #rowMeasure=null
     */
    #rowMeasure = null
    /**
     * Content-sized rows: the distance in px height changes moved the anchor row since the last update. The next
     * update hands it to the main thread, which moves the scroll offset by it.
     * @member {Number} #scrollCorrection=0
     */
    #scrollCorrection = 0
    /**
     * Counts the anchor corrections. An acknowledgement that carries an older count describes the geometry before
     * the last correction, and the main thread ignores it.
     * @member {Number} #scrollEpoch=0
     */
    #scrollEpoch = 0
    /**
     * Content-sized rows: the measured text height in px of each wrapText column, per record id. A row takes the
     * tallest, so a column that scrolled out horizontally keeps its share, and a column that left the grid drops it.
     * @member {Map<Number|String, Object>} #textHeights
     */
    #textHeights = new Map()
    /**
     * Content-sized rows: the data fields of the wrapText columns, as the last measurement pass found them
     * @member {Set<String>|null} #wrapFields=null
     */
    #wrapFields = null

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
        return selectionModel?.selectsRows ? selectionModel : null
    }

    /**
     * The cell ids the View's model holds selected — `[]` under a row or column model, and under none.
     * @returns {String[]}
     */
    get selectedCells() {
        let {selectionModel} = this;
        return selectionModel?.selectsCells ? selectionModel.items : []
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
     * Triggered after an update of this view landed in the DOM. Content-sized rows measure what it rendered.
     * @protected
     */
    afterExecuteVdomUpdate() {
        this.rowGeometry && this.scheduleRowMeasure()
    }

    /**
     * Triggered after the contentSizedRows config got changed. Creates or retires the {@link #rowGeometry}.
     * The initial value is applied in {@link #onConstructed}, once the store and the bodies exist.
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetContentSizedRows(value, oldValue) {
        this.isConstructed && this.updateRowGeometry()
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
     * Triggered after the isThumbDragging config got changed. The end of a drag applies the heights held during it.
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetIsThumbDragging(value, oldValue) {
        let me      = this,
            heights = me.#heldHeights;

        if (!value && heights) {
            me.#heldHeights = null;
            me.setRowHeights(heights)
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
        this.bindStore(this.store, null);
        this.contentSizedRows && this.updateRowGeometry()
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

        if (me.rowGeometry) {
            me.rowGeometry.store = value;

            // Like the geometry's heights, the measured texts belong to the old store's records
            if (oldValue) {
                me.#measuredCells = new WeakMap();
                me.#textHeights.clear()
            }
        }

        // Heights held during a thumb drag are keyed by the records of the old store
        oldValue && (me.#heldHeights = null);

        // a store that already holds its records fires no load for them
        value?.count && me.onStoreLoad()
    }

    /**
     * Content-sized rows: changes row heights so the visible rows hold still. The row at the scroll offset is the
     * anchor: a change above it moves it, and the scroll offset moves along by the same distance, which the next
     * update hands to the main thread as `scrollCorrection`. A change below it moves nothing on screen. A mounted
     * view then re-derives its layout.
     * @param {Function} change Changes the heights of the {@link #rowGeometry}, returns true if any changed
     * @param {Boolean} [force=false] Re-renders every row
     * @returns {Boolean} True if a height changed
     * @private
     */
    #changeRowHeights(change, force = false) {
        let me                       = this,
            {rowGeometry, scrollTop} = me,
            anchor                   = rowGeometry.indexAt(scrollTop),
            offset                   = rowGeometry.offsetAt(anchor),
            totalHeight              = rowGeometry.totalHeight,
            correction;

        if (!change()) {
            return false
        }

        correction = rowGeometry.offsetAt(anchor) - offset;

        if (correction !== 0) {
            me.#scrollCorrection += correction;
            me.#scrollEpoch++;
            me.scrollTop = scrollTop + correction
        }

        me.mounted && me.refreshRowGeometry(force, rowGeometry.totalHeight < totalHeight);
        return true
    }

    /**
     * Content-sized rows: true if the row's last landed update rendered the cell as its vdom describes it, the same
     * text at the same width. A pass can recycle a row while the view's update waits for other rows', and no flag
     * shows that wait: a read would measure the text the row showed before.
     * @param {Neo.grid.Row} row
     * @param {Object} cell The cell's vdom
     * @returns {Boolean}
     * @private
     */
    #isShown(row, cell) {
        let text      = cell.cn[0],
            cellVnode = VNodeUtil.getById(row.vnode, cell.id),
            textVnode = cellVnode?.childNodes[0];

        return textVnode?.id === text.id && cellVnode.style.width === cell.style.width &&
            (textVnode.textContent ?? textVnode.innerHTML) === (text.text ?? text.html)
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
        me.rowGeometry?.destroy();
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
     * The scroll origin this update renders, for `GridRowScrollPinning`. In content-sized mode it also carries the
     * scroll correction of moved anchor rows: once, with the update that renders the moved rows, so the main
     * thread moves the scroll offset in the same task as the row transforms. When an ancestor's update absorbs
     * this one, `Neo.mixin.VdomLifecycle` sends the meta along with that batch.
     * @returns {Object}
     */
    getVdomUpdateMeta() {
        let me   = this,
            meta = {scrollEpoch: me.#scrollEpoch, scrollTop: me.scrollTop};

        if (me.#scrollCorrection !== 0) {
            meta.scrollCorrection = me.#scrollCorrection;
            me.#scrollCorrection  = 0
        }

        return meta
    }

    /**
     * Content-sized rows: the height of a measured row, its tallest wrapText column plus the cell's padding and
     * borders, and never less than `rowHeight`
     * @param {Object} fields The row's text heights in px, by data field
     * @returns {Number}
     * @protected
     */
    measuredHeight(fields) {
        return Math.max(this.gridContainer.rowHeight, Math.max(0, ...Object.values(fields)) + this.#chrome)
    }

    /**
     * Content-sized rows: measures the wrapped text of the mounted wrapText cells that are new since the last
     * pass, in one batched read for all bodies, and feeds the row heights to the {@link #rowGeometry}. A row
     * takes its tallest wrapText column plus the cell's padding and borders, and never less than `rowHeight`.
     * A hidden cell waits until it shows. When a wrapText column joins or leaves the grid, the measured rows take
     * their heights from the new set of columns.
     *
     * Only a cell the DOM shows as its vdom describes it is read, see {@link #isShown}. The read crosses to the main
     * thread while rows go on rendering. A cell whose row rendered it again before the reply (another record, new
     * content or a new width) is skipped: the node that was read is gone. So is a cell whose box has no width: it was
     * hidden when read.
     * @returns {Promise<void>}
     */
    async measureRowHeights() {
        let me              = this,
            {gridContainer} = me,
            measured        = me.#measuredCells,
            textHeights     = me.#textHeights,
            heights         = new Map(),
            targets         = [],
            chrome, rects, wrapFields;

        // A render in flight may land before or after the read: the next landed update measures its rows
        if (!me.rowGeometry || !me.mounted || me.isVdomUpdating || me.bodies.some(body => body.isVdomUpdating)) {
            return
        }

        wrapFields = new Set(gridContainer.columns.items.filter(column => column.wrapText).map(column => column.dataField));

        if (me.#wrapFields?.size !== wrapFields.size || [...wrapFields].some(field => !me.#wrapFields.has(field))) {
            me.#wrapFields?.forEach(field => !wrapFields.has(field) && textHeights.forEach(fields => delete fields[field]));
            me.#wrapFields = wrapFields;
            me.refreshMeasuredHeights()
        }

        wrapFields.size > 0 && me.bodies.forEach(body => body.items.forEach(row => {
            row.record && !row.isVdomUpdating && row.vdom.cn.forEach(cell => {
                let text = cell.cn?.[0];

                if (
                    wrapFields.has(cell.data?.field) && cell.style.display !== 'none' &&
                    text?.cls?.includes('neo-grid-cell-text') && measured.get(cell) !== cell.style.width &&
                    me.#isShown(row, cell)
                ) {
                    targets.push({cell, record: row.record, row, textId: text.id, width: cell.style.width})
                }
            })
        }));

        if (targets.length < 1) {
            return
        }

        [rects, chrome] = await Promise.all([
            Neo.main.DomAccess.getLayoutRect({id: targets.map(target => target.textId), windowId: me.windowId}),
            Neo.main.DomAccess.getComputedStyle({
                id      : targets[0].cell.id,
                style   : ['border-bottom-width', 'border-top-width', 'padding-bottom', 'padding-top'],
                windowId: me.windowId
            })
        ]);

        if (me.isDestroyed || !me.rowGeometry) {
            return
        }

        me.#chrome = Object.values(chrome).reduce((sum, value) => sum + (parseFloat(value) || 0), 0);

        targets.forEach(({cell, record, row, width}, index) => {
            let rect = rects[index],
                fields, recordId;

            if (!rect?.width || row.record !== record || !row.vdom.cn.includes(cell) || cell.style.width !== width) {
                return
            }

            recordId = me.getRecordId(record);
            fields   = textHeights.get(recordId) || {};

            fields[cell.data.field] = rect.height;
            textHeights.set(recordId, fields);
            measured.set(cell, width);
            heights.set(recordId, me.measuredHeight(fields))
        });

        heights.size > 0 && me.setRowHeights(heights)
    }

    /**
     * Content-sized rows: derives the height of every measured row again from its stored text heights. The text
     * did not change, but its derivation did: the set of wrapText columns, or `rowHeight`.
     * @returns {Boolean} True if a height changed
     */
    refreshMeasuredHeights() {
        let me      = this,
            heights = new Map();

        me.#textHeights.forEach((fields, recordId) => heights.set(recordId, me.measuredHeight(fields)));

        return heights.size > 0 && me.setRowHeights(heights)
    }

    /**
     * Re-derives everything that depends on row heights after the {@link #rowGeometry} changed: each body's row
     * pool, both scroll extents, and the rows' positions. A row whose record and index did not change finds
     * its moved geometry itself ({@link Neo.grid.Row#hasStaleGeometry}) and keeps its cells.
     *
     * The rows move in this view's update, whose meta carries the scroll correction, not in a body update of their
     * own. The vertical scrollbar mirrors the scroll offset, and a smaller extent clamps it: it grows before that
     * update and shrinks after it. A busy view defers its update, so the scrollbar waits for it to land.
     * @param {Boolean} [force=false] Re-renders every row. A mode switch needs it: without a geometry, a row
     * cannot tell that its content-sized height is stale.
     * @param {Boolean} [shrinks=false] The extent shrinks
     */
    refreshRowGeometry(force = false, shrinks = false) {
        let me        = this,
            busy      = me.isVdomUpdating,
            scrollbar = me.gridContainer?.verticalScrollbar;

        me.bodies.forEach(body => {
            body.skipCreateViewData = true;
            body.updateAvailableRows();
            body.skipCreateViewData = false;
            body.updateScrollHeight(true)
        });

        if (!shrinks) {
            scrollbar?.updateScrollHeight();
            me.syncBodies(me.scrollTop, force)
        } else {
            me.syncBodies(me.scrollTop, force);
            busy ? me.promiseUpdate().then(() => scrollbar?.updateScrollHeight()) : scrollbar?.updateScrollHeight()
        }
    }

    /**
     * Content-sized rows: forgets every measured height and renders the bodies again, which measures the mounted
     * rows anew. A change to which columns wrap their text needs it. The row at the scroll offset holds still on
     * screen, as for {@link #setRowHeights}.
     */
    resetRowHeights() {
        let me            = this,
            {rowGeometry} = me;

        if (rowGeometry) {
            me.#heldHeights   = null;
            me.#measuredCells = new WeakMap();
            me.#textHeights.clear();

            // The cells render again even if no height was known: their text containers come or go
            me.#changeRowHeights(() => {rowGeometry.clearHeights(); return true}, true)
        }
    }

    /**
     * Content-sized rows: runs {@link #measureRowHeights} after the current task, once for any number of landed
     * updates.
     * @protected
     */
    scheduleRowMeasure() {
        let me = this;

        me.#rowMeasure ??= me.timeout(0)
            .then(() => {
                me.#rowMeasure = null;
                return me.measureRowHeights()
            })
            .catch(reason => {
                me.#rowMeasure = null;

                reason !== Neo.isDestroyed && !Neo.currentWorker?.isDeparture?.(reason, me.windowId) &&
                    console.error('grid.View: measuring row heights failed', {reason, windowId: me.windowId})
            })
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
     * Applies known row heights in content-sized mode. A mounted view re-derives its layout if any height
     * changed; an unmounted one renders them on its first layout. The row at the scroll offset holds still on
     * screen: a change above it moves the scroll offset along. During a thumb drag the heights wait for the drag's
     * end, so the extent under the thumb holds still.
     * @param {Map<Number|String, Number>} heights Heights in px, keyed by record id
     * @returns {Boolean} True if at least one height changed now
     */
    setRowHeights(heights) {
        let me            = this,
            {rowGeometry} = me;

        if (!rowGeometry) {
            return false
        }

        if (me.isThumbDragging) {
            me.#heldHeights ??= new Map();
            heights.forEach((height, recordId) => me.#heldHeights.set(recordId, height));
            return false
        }

        return me.#changeRowHeights(() => rowGeometry.setHeights(heights))
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
     * In content-sized mode the start row and the last visible row come from the {@link #rowGeometry} instead of
     * dividing by `rowHeight`.
     * @param {Number} scrollTop
     * @param {Boolean} [force=false] Re-projects every row, also one whose record and index did not change
     */
    syncBodies(scrollTop, force = false) {
        let me                                        = this,
            container                                 = me.gridContainer,
            {body, bodyEnd, bodyStart, scrollManager} = container,
            {bufferRowRange, rowHeight}               = body,
            {rowGeometry}                             = me,
            newStartIndex                             = rowGeometry ? rowGeometry.indexAt(scrollTop) : Math.floor(scrollTop / rowHeight);

        let updateBody = _body => {
            let isCenter = _body === body;
            _body.skipCreateViewData = true;

            _body.set({
                scrollLeft: isCenter ? scrollManager.scrollLeft : 0, // Horizontal sync applies from scrollManager state ONLY for center
                scrollTop : scrollTop
            });

            // Content-sized rows: a row-count threshold cannot tell whether rows of other heights still cover the
            // viewport, so every new start row re-renders
            if (rowGeometry ? _body.startIndex !== newStartIndex : Math.abs(_body.startIndex - newStartIndex) >= bufferRowRange) {
                _body.startIndex = newStartIndex
            } else {
                _body.visibleRows[0] = newStartIndex;
                _body.visibleRows[1] = rowGeometry ?
                    Math.min(rowGeometry.count, rowGeometry.indexAt(scrollTop + _body.availableHeight)) :
                    newStartIndex + _body.availableRows
            }

            _body.skipCreateViewData = false;
            _body.createViewData(true, force) // silent = true
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

        // The rows changed silently, so a body update merging into this cycle must not make it sparse
        me.denseUpdate = true;
        me.update()
    }

    /**
     * Creates the {@link #rowGeometry} when {@link #contentSizedRows} is on, or retires it when it is off, and
     * hands it to the vertical scrollbar, the one extent consumer outside the bodies. Each body fires
     * `rowGeometryChange` before a switch after the first layout re-renders every row through
     * {@link #refreshRowGeometry}, so a body plugin adapts first.
     * @protected
     */
    updateRowGeometry() {
        let me              = this,
            {gridContainer} = me,
            scrollbar       = gridContainer.verticalScrollbar;

        if (me.contentSizedRows && !me.rowGeometry) {
            // A new geometry knows no heights: every mounted row is measured again
            me.#measuredCells = new WeakMap();
            me.#textHeights.clear();

            me.rowGeometry = Neo.create({
                module     : RowGeometry,
                estimate   : gridContainer.rowHeight,
                getRecordId: record => me.getRecordId(record),
                store      : me.store
            })
        } else if (!me.contentSizedRows && me.rowGeometry) {
            me.rowGeometry.destroy();
            me.rowGeometry = null
        }

        if (scrollbar) {
            scrollbar.rowGeometry = me.rowGeometry
        }

        me.bodies.forEach(body => body.fire('rowGeometryChange', {rowGeometry: me.rowGeometry}));

        me.mounted && me.refreshRowGeometry(true)
    }
}

export default Neo.setupClass(View);
