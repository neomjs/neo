import Base from '../../plugin/Base.mjs';

/**
 * @summary Animates the rows of a grid body to their new positions after a sort or a filter.
 *
 * The body's rows are a fixed pool: a sort or a filter re-binds pooled rows to records, and nothing may reorder,
 * append or remove a row (`learn/guides/datahandling/PooledGridAnimation.md`). So this plugin follows records,
 * never rows. Before the body re-binds, it notes where each displayed record sits. After the silent re-bind, every
 * row shows its new record at that record's previous offset, and a row whose record was not displayed is
 * transparent. One update later, the rows move to their new offsets and fade in under `neo-animate-rows-moving`,
 * the only class under which a row transitions. Scrolling (`neo-is-scrolling`) and the next store change end
 * the transition, so pooled rows never animate while they recycle.
 *
 * A record whose own change re-sorts the store (`reapplyOnRecordChange`) moves the same way: the store sorts
 * before it reports the change, so the body repaints that record's row for its new values after the first step,
 * and the plugin holds the row at its previous offset again.
 *
 * The positions are fixed-height ones (`rowIndex × rowHeight`). With `contentSizedRows` the plugin stands aside:
 * the body handles the store events itself and renders its rows at their geometry offsets, without transitions.
 * The plugin follows the mode through the body's `rowGeometryChange` event, which fires before the rows re-render.
 * @class Neo.grid.plugin.AnimateRows
 * @extends Neo.plugin.Base
 */
class AnimateRows extends Base {
    /**
     * Valid values for transitionEasing
     * @member {String[]} transitionEasings=['ease','ease-in','ease-out','ease-in-out','linear']
     * @protected
     * @static
     */
    static transitionEasings = ['ease', 'ease-in', 'ease-out', 'ease-in-out', 'linear']

    static config = {
        /**
         * @member {String} className='Neo.grid.plugin.AnimateRows'
         * @protected
         */
        className: 'Neo.grid.plugin.AnimateRows',
        /**
         * @member {String} ntype='plugin-grid-animate-rows'
         * @protected
         */
        ntype: 'plugin-grid-animate-rows',
        /**
         * Time in ms for the background-color, opacity & transform transitions
         * @member {Number} transitionDuration_=500
         * @reactive
         */
        transitionDuration_: 500,
        /**
         * The easing used for fadeIn, fadeOut and position changes.
         * Valid values: 'ease','ease-in','ease-out','ease-in-out','linear'
         * @member {String} transitionEasing_='ease-out'
         * @reactive
         */
        transitionEasing_: 'ease-out'
    }

    /**
     * The id of the setTimeout() call which ends the current transition.
     * @member {Number|null} transitionTimeoutId=null
     * @protected
     */
    transitionTimeoutId = null

    /**
     * The body's own store handlers, which this plugin replaces. Content-sized rows hand the events back to them.
     * @member {Object|null} #bodyHandlers=null
     */
    #bodyHandlers = null
    /**
     * Counts store changes and settles, so a step scheduled for an older change leaves the rows alone.
     * @member {Number} #change=0
     */
    #change = 0
    /**
     * The rows the first step placed at their records' previous offsets, each mapped to the record it showed then
     * and that record's previous row index (`from`, `undefined` for a record that was not displayed).
     * Cleared once the second step moves them, or once `settle()` puts them back.
     * @member {Map|null} #pending=null
     */
    #pending = null
    /**
     * @member {Boolean} #warned=false
     */
    #warned = false

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me      = this,
            {owner} = me,
            {store} = owner;

        // Remove the previous view listeners
        owner.store = null;

        me.#bodyHandlers = {
            filter      : owner.onStoreFilter,
            load        : owner.onStoreLoad,
            recordChange: owner.onStoreRecordChange,
            rowsChange  : owner.onStoreRowsChange
        };

        owner.onStoreFilter       = me.onStoreFilter      .bind(me);
        owner.onStoreLoad         = me.onStoreLoad        .bind(me);
        owner.onStoreRecordChange = me.onStoreRecordChange.bind(me);
        owner.onStoreRowsChange   = me.onStoreRowsChange  .bind(me);

        // Add the re-bound listeners
        owner.store = store;

        owner.on({
            isScrollingChange: me.onIsScrollingChange,
            rowGeometryChange: me.onRowGeometryChange,
            scope            : me
        });

        me.standAside()
    }

    /**
     * Triggered after the transitionDuration config got changed.
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetTransitionDuration(value, oldValue) {
        this.owner.addStyle({'--neo-grid-animate-rows-transition-duration': value + 'ms'})
    }

    /**
     * Triggered after the transitionEasing config got changed.
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetTransitionEasing(value, oldValue) {
        this.owner.addStyle({'--neo-grid-animate-rows-transition-timing-function': value})
    }

    /**
     * Triggered before the transitionEasing config gets changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    beforeSetTransitionEasing(value, oldValue) {
        return this.beforeSetEnumValue(value, oldValue, 'transitionEasing')
    }

    /**
     * @param {Object} args
     */
    destroy(...args) {
        let me      = this,
            {owner} = me,
            {store} = owner;

        me.settle();

        if (me.#bodyHandlers) {
            store && (owner.store = null);
            owner.onStoreFilter       = me.#bodyHandlers.filter;
            owner.onStoreLoad         = me.#bodyHandlers.load;
            owner.onStoreRecordChange = me.#bodyHandlers.recordChange;
            owner.onStoreRowsChange   = me.#bodyHandlers.rowsChange;
            store && (owner.store = store);
            me.#bodyHandlers    = null
        }

        owner.removeCls('neo-animate-rows');

        owner.un({
            isScrollingChange: me.onIsScrollingChange,
            rowGeometryChange: me.onRowGeometryChange,
            scope            : me
        });

        owner.addStyle({
            '--neo-grid-animate-rows-transition-duration'       : null,
            '--neo-grid-animate-rows-transition-timing-function': null
        });

        super.destroy(...args)
    }

    /**
     * @summary Shows a row where the first step needs it: at its record's previous offset, or transparent at its new
     * offset when the record was not displayed.
     * @param {Neo.grid.Row} row
     * @param {Number|undefined} from The record's previous row index
     * @protected
     */
    hold(row, from) {
        let {owner} = this,
            {style} = row.vdom;

        if (from === undefined) {
            style.opacity = 0
        } else {
            style.transform = row.getRowTransform(from * owner.rowHeight - owner.pageOffset)
        }
    }

    /**
     * @summary Holds every row of a move that has not started yet at its first-step offset, after the body
     * repainted some of them for new values.
     * @protected
     */
    holdPending() {
        let me = this;

        me.#pending?.forEach(({from, record}, row) => {
            !row.isDestroyed && row.record === record && me.hold(row, from)
        })
    }

    /**
     * Scrolling recycles the pooled rows through their transforms, which must not animate
     * @param {Object} data
     * @param {Boolean} data.value
     * @protected
     */
    onIsScrollingChange({value}) {
        value && this.settle()
    }

    /**
     * A switch to or from content-sized rows re-renders every row at the body's own offsets
     * @protected
     */
    onRowGeometryChange() {
        this.settle();
        this.standAside()
    }

    /**
     * @param {Object} data
     * @param {Boolean} data.isFiltered
     * @param {Object[]} data.items
     * @param {Object[]} data.oldItems
     * @param {Neo.data.Store} data.scope
     */
    onStoreFilter(data) {
        let me = this;

        me.settle();
        me.standAside() ? me.#bodyHandlers.filter.call(me.owner, data) : me.updateView()
    }

    /**
     * A sort moves the displayed records. Any other load replaces them, and the body renders it as usual.
     * Either way, a move still in progress settles first.
     * @param {Object} data
     * @param {Boolean} [data.isSort]
     * @protected
     */
    onStoreLoad(data) {
        let me = this;

        me.settle();
        me.standAside() || !data.isSort ? me.#bodyHandlers.load.call(me.owner, data) : me.updateView()
    }

    /**
     * @summary A change that re-sorted the store has already started its move, so the body's repaint of the changed
     * row keeps the row where the move starts.
     * @param {Object} data
     * @protected
     */
    onStoreRecordChange(data) {
        this.#bodyHandlers.recordChange.call(this.owner, data);
        this.holdPending()
    }

    /**
     * @summary A batch that re-sorted the store has already started its move, so the body's repaint of the batch's
     * rows keeps them where the move starts.
     * @param {Object} data
     * @protected
     */
    onStoreRowsChange(data) {
        this.#bodyHandlers.rowsChange.call(this.owner, data);
        this.holdPending()
    }

    /**
     * @summary Gives a row the opacity and offset that `Row#createVdom` gives it, in either row mode.
     * @param {Neo.grid.Row} row
     * @protected
     */
    place(row) {
        let {rowIndex, vdom} = row;

        vdom.style.opacity   = null;
        vdom.style.transform = row.getRowTransform(this.owner.getRowOffset(rowIndex))
    }

    /**
     * @summary Ends any transition and puts every row the first step displaced back at its own offset.
     *
     * Also invalidates the second step of a pending change, so a late update neither moves a row that has been
     * recycled for another record nor brings the transition back. A row that shows another record by now was
     * re-rendered by the body and sits where it belongs.
     * @protected
     */
    settle() {
        let me      = this,
            {owner} = me,
            pending = me.#pending;

        me.#change++;
        me.#pending = null;

        clearTimeout(me.transitionTimeoutId);
        me.transitionTimeoutId = null;

        if (owner.isDestroyed) {
            return
        }

        if (pending) {
            pending.forEach(({record}, row) => {
                !row.isDestroyed && row.record === record && me.place(row)
            });

            owner.updateDepth = -1
        }

        if (owner.cls.includes('neo-animate-rows-moving')) {
            // Its update carries the placed rows, too
            owner.removeCls('neo-animate-rows-moving')
        } else if (pending) {
            owner.update()
        }
    }

    /**
     * Content-sized rows have no fixed-height positions to animate to, and this plugin does not read the row
     * geometry. In that mode it takes `neo-animate-rows` off the body and warns, once, that `animatedRowSorting`
     * is ignored; a store event goes to the body's own handler. Back in fixed-height mode, the class returns.
     * Runs on every store event, and on `rowGeometryChange`, before the rows re-render for a new mode.
     * @returns {Boolean} True if the plugin stands aside
     * @protected
     */
    standAside() {
        let me           = this,
            {owner}      = me,
            contentSized = !!owner.rowGeometry;

        owner[contentSized ? 'removeCls' : 'addCls']('neo-animate-rows');

        if (contentSized && !me.#warned) {
            me.#warned = true;
            console.warn('grid.plugin.AnimateRows: animatedRowSorting is ignored with contentSizedRows', owner.id)
        }

        return contentSized
    }

    /**
     * @summary Re-binds the pooled rows to the store's new order, then moves each displayed record from its
     * previous offset to its new one.
     *
     * The first update shows every row with its new record at that record's previous offset, so the screen does
     * not change yet; a record that was not displayed starts transparent at its new offset. The second update
     * adds `neo-animate-rows-moving` and the new offsets, and the browser transitions between the two. A record
     * that left the display has no row anymore; its slot shows another record.
     *
     * A scroll, the next store event, a switch of row mode, a destroy, or a failed first update between the two
     * steps settles the rows instead (`settle()`). The store handlers settle any earlier move before calling this.
     * @protected
     */
    updateView() {
        let me       = this,
            {owner}  = me,
            change   = me.#change,
            moved    = new Map(),
            previous = new Map();

        // The body defers a re-bind while its own update is in flight: this change renders without a transition
        if (owner.isVdomUpdating) {
            owner.createViewData();
            return
        }

        owner.items.forEach(row => {
            row.record && previous.set(owner.getRecordId(row.record), row.rowIndex)
        });

        // A body that cannot render yet binds nothing here, so every row keeps its index and none moves
        owner.createViewData(true);

        owner.items.forEach(row => {
            if (row.record) {
                let from = previous.get(owner.getRecordId(row.record));

                if (from !== row.rowIndex) {
                    me.hold(row, from);
                    moved.set(row, {from, record: row.record})
                }
            }
        });

        owner.updateDepth = -1;

        if (moved.size < 1) {
            owner.update();
            return
        }

        me.#pending = moved;

        owner.promiseUpdate().then(() => {
            // settle() has put the rows back, or a newer change owns them
            if (me.isDestroyed || owner.isDestroyed || change !== me.#change) {
                return
            }

            me.#pending = null;

            moved.forEach(({record}, row) => {
                row.record === record && me.place(row)
            });

            // The class and the new offsets reach the DOM in one update, so the browser transitions to them
            owner.updateDepth = -1;
            owner.addCls('neo-animate-rows-moving');

            me.transitionTimeoutId = setTimeout(() => {
                change === me.#change && me.settle()
            }, me.transitionDuration)
        }, reason => {
            // Only this change's rows are put back: a newer change owns the rows by now
            change === me.#change && !me.isDestroyed && me.settle();
            reason !== Neo.isDestroyed && console.error('grid.plugin.AnimateRows: the first step failed', reason)
        })
    }
}

export default Neo.setupClass(AnimateRows);
