import Base            from '../container/Base.mjs';
import ClassSystemUtil from '../util/ClassSystem.mjs';
import RowModel        from '../selection/grid/RowModel.mjs';

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
         * Back-reference to the owning grid.Container (the macro layer). grid.View orchestrates the
         * 1-3 bodies (`bodyStart`, `body`, `bodyEnd`) but reaches up to the container for macro state
         * it does not own — column distribution and the ScrollManager (horizontal scroll position plus
         * main-thread scroll/hover/pinning addon coordination).
         * @member {Neo.grid.Container|null} gridContainer=null
         */
        gridContainer: null,
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
         * The single SelectionModel owned by grid.View (the body orchestrator) — NOT by an individual
         * grid.Body. `bodyStart`/`body`/`bodyEnd` are pure render/event delegates; selection state is
         * keyed by recordId and spans all bodies, replacing the per-body cloned models plus the
         * `getActivePeers()` fan-out (the multi-body SelectionModel design-lock).
         * @member {Neo.selection.grid.BaseModel|null} selectionModel_=null
         */
        selectionModel_: null
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
     * The selected-record annotation field. Body-agnostic — delegates to the center body.
     * @returns {String}
     */
    get selectedRecordField() {
        return this.gridContainer?.body?.selectedRecordField
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
     * Triggered after the selectionModel config got changed. Registers grid.View (not a body) as the
     * model's `view`, so a single model owns selection state across all bodies.
     * @param {Neo.selection.Model} value
     * @param {Neo.selection.Model} oldValue
     * @protected
     */
    afterSetSelectionModel(value, oldValue) {
        // Not gated on vnodeInitialized: Container.applyViewSelectionModel() hoists the model during
        // construction, and the single model needs its `view` set immediately so its row/record contract
        // (store, bodies, getRow…) resolves. register() only binds component-level events, safe pre-vnode.
        value?.register(this)
    }

    /**
     * Triggered before the selectionModel config gets changed. Defaults to a RowModel — the same
     * default the per-body path used, now instantiated once at the grid.View (orchestrator) level.
     * @param {Neo.selection.Model} value
     * @param {Neo.selection.Model} oldValue
     * @returns {Neo.selection.Model}
     * @protected
     */
    beforeSetSelectionModel(value, oldValue) {
        oldValue?.destroy();
        return value ? ClassSystemUtil.beforeSetInstance(value, RowModel) : value
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
        let me        = this,
            container = me.gridContainer,
            {body, bodyEnd, bodyStart, scrollManager} = container,
            {bufferRowRange, rowHeight} = body,
            newStartIndex = Math.floor(scrollTop / rowHeight);

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

        me.scrollTop   = scrollTop;
        me.updateDepth = 3;
        me.update()
    }
}

export default Neo.setupClass(View);
