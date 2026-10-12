import Base from '../core/Base.mjs';

/**
 * @summary The row geometry of one grid view in content-sized mode: each row's height, the offset where each
 * row starts, and the lookup from a scroll offset back to a row.
 *
 * A fixed-height grid never creates this class. It positions row `i` at `i × rowHeight`. In content-sized mode
 * rows differ in height, so {@link Neo.grid.View} owns one instance and every row-position consumer reads it:
 * the row transforms, the visible and mounted row ranges, both scroll extents (the body and the vertical
 * scrollbar) and keyboard scrolling. One owner per view is what keeps the start, center and end bodies of a
 * view on the same row heights.
 *
 * Heights are keyed by record id, so they survive a sort or a filter of their store, and a new store starts without
 * any. A row whose height is not known yet uses the {@link #estimate}. The geometry catches up lazily, on the next
 * read, in one of two passes:
 *
 * - **The full pass** follows a sort, filter, load or mutation of the store, or a new estimate: any height can
 *   now belong to any row. It resolves the record id of every row once, about 10 ms for 100k rows, and skips
 *   that while no height is known. It reads `store.items`, never `getAt()`, because `getAt()` hydrates each
 *   record of a lazy store it reads.
 * - **The offset pass** follows {@link #setHeights}: the order is unchanged, so only the changed rows take their
 *   new height, and the offsets are summed again from the first of them. That is a plain loop over a
 *   `Float64Array`, about 0.1 ms for 100k rows, so measured heights can arrive while the grid scrolls.
 * @class Neo.grid.RowGeometry
 * @extends Neo.core.Base
 */
class RowGeometry extends Base {
    static config = {
        /**
         * @member {String} className='Neo.grid.RowGeometry'
         * @protected
         */
        className: 'Neo.grid.RowGeometry',
        /**
         * The height in px of every row whose height is not known yet. The owning view keeps it in sync with
         * the grid's `rowHeight`.
         * @member {Number} estimate_=32
         * @reactive
         */
        estimate_: 32,
        /**
         * Resolves a record to the key its height is stored under. The owning view passes its body's resolver,
         * so the keys match the record ids the rows render.
         * @member {Function|null} getRecordId=null
         */
        getRecordId: null,
        /**
         * The store whose current order the rows follow.
         * @member {Neo.data.Store|null} store_=null
         * @reactive
         */
        store_: null
    }

    /**
     * Known row heights in px, keyed by record id. They outlive every order change of their store, not the store.
     * @member {Map} #heights
     */
    #heights = new Map()
    /**
     * True if the last full pass resolved the record ids into {@link #indexes}. It skips them while no height
     * is known.
     * @member {Boolean} #indexed=false
     */
    #indexed = false
    /**
     * The row index of each record id in the current order, written by the full pass
     * @member {Map} #indexes
     */
    #indexes = new Map()
    /**
     * The smallest row height in px, known or estimated. Between two full passes it is a lower bound: a height
     * batch can only lower it.
     * @member {Number} #minHeight=0
     */
    #minHeight = 0
    /**
     * `#offsets[i]` is the offset in px where row `i` starts. The array holds `count + 1` entries, so the last
     * one is the total height of all rows.
     * @member {Float64Array} #offsets
     */
    #offsets = new Float64Array(1)
    /**
     * True while the order, the content or the estimate changed since the last full pass
     * @member {Boolean} #orderStale=true
     */
    #orderStale = true
    /**
     * `#rowHeights[i]` is the height in px of row `i` in the current order.
     * @member {Float64Array} #rowHeights
     */
    #rowHeights = new Float64Array(0)
    /**
     * The first row whose height changed since the offsets were last summed, `Infinity` if none did
     * @member {Number} #sumFrom=Infinity
     */
    #sumFrom = Infinity

    /**
     * The number of rows, which is the store's current count.
     * @member {Number} count
     */
    get count() {
        return this.store?.count || 0
    }

    /**
     * The smallest row height in px, known or estimated. Row pools are sized by it, so a viewport filled with
     * the shortest rows still has a row for every slot.
     * @member {Number} minHeight
     */
    get minHeight() {
        this.refresh();
        return this.#minHeight
    }

    /**
     * The summed height in px of all rows.
     * @member {Number} totalHeight
     */
    get totalHeight() {
        this.refresh();
        return this.#offsets[this.#offsets.length - 1]
    }

    /**
     * Triggered after the estimate config got changed
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetEstimate(value, oldValue) {
        this.#orderStale = true
    }

    /**
     * Triggered after the store config got changed
     * @param {Neo.data.Store|null} value
     * @param {Neo.data.Store|null} oldValue
     * @protected
     */
    afterSetStore(value, oldValue) {
        let me        = this,
            listeners = {filter: me.onStoreChange, load: me.onStoreChange, mutate: me.onStoreChange, sort: me.onStoreChange, scope: me};

        oldValue?.un(listeners);
        // Ahead of the bodies' own store listeners: a body re-rendering on the same event must read fresh offsets
        value?.on({...listeners, order: 'before'});

        // The ids of another store name other records, which start from the estimate
        oldValue && me.#heights.clear();

        me.#orderStale = true
    }

    /**
     * Stops following the store.
     * @param {...*} args
     */
    destroy(...args) {
        this.store = null;
        super.destroy(...args)
    }

    /**
     * The height in px of the row at the given index.
     * @param {Number} index
     * @returns {Number}
     */
    heightAt(index) {
        this.refresh();

        let rowHeights = this.#rowHeights;

        return index < 0 || index >= rowHeights.length ? this.estimate : rowHeights[index]
    }

    /**
     * The index of the row that covers the given offset. Offsets above the first row resolve to `0`, offsets
     * past the last row to the last index.
     * @param {Number} offset Offset in px from the top of the first row
     * @returns {Number}
     */
    indexAt(offset) {
        this.refresh();

        let offsets = this.#offsets,
            high    = offsets.length - 2,
            low     = 0,
            mid;

        if (high < 0 || offset <= 0) {
            return 0
        }

        // The last row whose start offset is not past the requested offset
        while (low < high) {
            mid = (low + high + 1) >> 1;

            if (offsets[mid] <= offset) {
                low = mid
            } else {
                high = mid - 1
            }
        }

        return low
    }

    /**
     * The offset in px where the row at the given index starts. An index past the last row resolves to the
     * total height.
     * @param {Number} index
     * @returns {Number}
     */
    offsetAt(index) {
        this.refresh();

        let offsets = this.#offsets;

        return offsets[Math.max(0, Math.min(index, offsets.length - 1))]
    }

    /**
     * Marks the order stale after the store changed its order or content.
     * @protected
     */
    onStoreChange() {
        this.#orderStale = true
    }

    /**
     * The full pass: takes the known height or the estimate for each row in the store order, then sums the
     * offsets.
     * @protected
     */
    rebuild() {
        let me                      = this,
            {estimate, getRecordId} = me,
            heights                 = me.#heights,
            indexes                 = me.#indexes,
            indexed                 = heights.size > 0,
            items                   = me.store?.items || [],
            count                   = items.length,
            min                     = estimate,
            height, i, recordId, rowHeights;

        if (me.#rowHeights.length !== count) {
            me.#offsets    = new Float64Array(count + 1);
            me.#rowHeights = new Float64Array(count)
        }

        rowHeights = me.#rowHeights;
        indexes.clear();

        if (indexed) {
            for (i = 0; i < count; i++) {
                recordId = getRecordId(items[i]);
                height   = heights.get(recordId) ?? estimate;

                indexes.set(recordId, i);
                rowHeights[i] = height;

                if (height < min) {
                    min = height
                }
            }
        } else {
            // No height is known: no record id needs resolving
            rowHeights.fill(estimate)
        }

        me.#indexed    = indexed;
        me.#minHeight  = min;
        me.#orderStale = false;

        me.sumOffsets(0)
    }

    /**
     * Brings the geometry up to date before a read: the full pass after an order change, else the offset pass
     * from the first changed height on.
     * @protected
     */
    refresh() {
        let me = this;

        if (me.#orderStale) {
            me.rebuild()
        } else if (me.#sumFrom !== Infinity) {
            me.sumOffsets(me.#sumFrom)
        }
    }

    /**
     * Applies known row heights. A row of the current order takes its new height at once, and the offsets are
     * summed on the next read. Before the first full pass that resolved the record ids, the next read runs one.
     * @param {Map<Number|String, Number>} heights Heights in px, keyed by record id. A Map, since the keys of a
     * plain object turn numeric record ids into strings.
     * @returns {Boolean} True if at least one height changed
     */
    setHeights(heights) {
        let me         = this,
            known      = me.#heights,
            indexed    = me.#indexed && !me.#orderStale,
            indexes    = me.#indexes,
            rowHeights = me.#rowHeights,
            changed    = false,
            height, index, recordId;

        for ([recordId, height] of heights) {
            if (known.get(recordId) !== height) {
                known.set(recordId, height);
                changed = true;

                // A record outside the current order (e.g. filtered out) keeps its height for a later full pass
                if (indexed && (index = indexes.get(recordId)) !== undefined) {
                    rowHeights[index] = height;

                    if (index < me.#sumFrom) {
                        me.#sumFrom = index
                    }

                    if (height < me.#minHeight) {
                        me.#minHeight = height
                    }
                }
            }
        }

        if (changed && !indexed) {
            me.#orderStale = true
        }

        return changed
    }

    /**
     * The offset pass: sums the row heights into the offsets, from the given row to the last one.
     * @param {Number} from
     * @protected
     */
    sumOffsets(from) {
        let offsets    = this.#offsets,
            rowHeights = this.#rowHeights,
            count      = rowHeights.length,
            i          = from;

        for (; i < count; i++) {
            offsets[i + 1] = offsets[i] + rowHeights[i]
        }

        this.#sumFrom = Infinity
    }
}

export default Neo.setupClass(RowGeometry);
