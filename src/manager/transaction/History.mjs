import Base       from '../../core/Base.mjs';
import Collection from '../../collection/Base.mjs';

/**
 * Whether a value is plain data: JSON-shaped primitives, arrays and prototype-less or `Object` objects,
 * nested to any depth, without a cycle. Functions, symbols, bigints, class instances, `Date`, `Map` and
 * friends are not — a history row is data that serializes, never code or live state.
 * @param {*} value
 * @param {Set} path The objects on the way down, to refuse a cycle
 * @returns {Boolean}
 */
function isPlainData(value, path=new Set()) {
    if (value === null || value === undefined) {
        return true
    }

    const type = typeof value;

    if (type === 'string' || type === 'number' || type === 'boolean') {
        return true
    }

    if (type !== 'object' || path.has(value)) {
        return false
    }

    const proto = Object.getPrototypeOf(value);

    if (!Array.isArray(value) && proto !== Object.prototype && proto !== null) {
        return false
    }

    path.add(value);

    const plain = Object.values(value).every(item => isPlainData(item, path));

    path.delete(value);

    return plain
}

/**
 * Freezes a plain-data graph in place.
 * @param {*} value
 * @returns {*} The same value
 */
function deepFreeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
        Object.freeze(value);
        Object.values(value).forEach(deepFreeze)
    }

    return value
}

/**
 * @summary One Group's bounded, append-only transaction history and its cursor — frozen plain rows in an
 * owned Collection.
 * @description The rows are the authority for what a Group has done: each one is a plain-data descriptor
 * the writer handed to {@link #append}, copied, stamped with `id`, `sequence` and `recordedAt`, and frozen
 * to every depth before it becomes a member. A retained row cannot change — not a nested field, not a
 * whole-field replacement — so the bytes it serializes to are the bytes it was admitted with. The
 * Collection that holds them is owned and private, so the only writes that reach the rows are
 * {@link #append}, {@link #undo} and {@link #redo}; anything a consumer wants mutable (a grid, a Neural
 * Link projection) is a clone fed from {@link #rows}, never this authority.
 *
 * The cursor names the row the Group's current state reflects: `-1` before the first row, or after every
 * retained row was undone. {@link #undo} and {@link #redo} only move the cursor and return the row —
 * applying it is the caller's, and {@link #peek} shows the row a move would return without moving, so a
 * caller can apply first and move the cursor only once the application held. An append after an undo
 * drops the redo tail; past {@link #depth} the oldest row is evicted, and the cursor follows. Eviction
 * never reuses a `sequence`.
 *
 * `Neo.manager.Transaction` loads this module on demand at the first write of a Group whose history depth
 * is above zero — the admission barrier — so a Group at depth zero never imports it and a single-window
 * or history-disabled app never pays for it.
 * @class Neo.manager.transaction.History
 * @extends Neo.core.Base
 */
class History extends Base {
    static config = {
        /**
         * @member {String} className='Neo.manager.transaction.History'
         * @protected
         */
        className: 'Neo.manager.transaction.History',
        /**
         * How many rows are retained; the oldest is evicted past it. At least one — a Group that keeps
         * no history never loads this module.
         * @member {Number} depth=50
         */
        depth: 50
    }

    /**
     * The owned Collection of frozen rows, keyed by `id`, in admission order.
     * @member {Neo.collection.Base} #rows
     * @private
     */
    #rows = null
    /**
     * The index of the row the Group's current state reflects; `-1` before the first row or after undoing
     * every retained row.
     * @member {Number} cursor=-1
     */
    cursor = -1
    /**
     * Stamped on every admitted row as `sequence`, counting up across evictions.
     * @member {Number} sequence=0
     * @protected
     */
    sequence = 0

    /**
     * @member {Boolean} canRedo
     */
    get canRedo() {
        return this.cursor < this.count - 1
    }

    /**
     * @member {Boolean} canUndo
     */
    get canUndo() {
        return this.cursor > -1
    }

    /**
     * @member {Number} count The retained rows
     */
    get count() {
        return this.#rows?.count ?? 0
    }

    /**
     * The row at the cursor, or `null`.
     * @member {Object|null} current
     */
    get current() {
        return this.cursor > -1 ? this.getAt(this.cursor) : null
    }

    /**
     * The retained rows in admission order — a fresh array of the frozen rows, so a consumer can project
     * them without a path back into the authority.
     * @member {Object[]} rows
     */
    get rows() {
        return this.#rows ? this.#rows.getRange(0, this.#rows.count) : []
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        this.#rows = Neo.create(Collection, {autoSort: false})
    }

    /**
     * Admits one transaction after the cursor: the redo tail is dropped, the descriptor is copied, stamped
     * and frozen, the cursor moves onto it, and rows past {@link #depth} are evicted from the front.
     * A descriptor {@link #assertRow} refuses changes nothing.
     * @param {Object} descriptor Plain data; an own `id` is kept, otherwise one is minted
     * @returns {Object} The frozen retained row
     */
    append(descriptor) {
        let me   = this,
            rows = me.#rows;

        me.assertRow(descriptor);

        if (me.canRedo) {
            rows.splice(me.cursor + 1, rows.count - me.cursor - 1)
        }

        const row = deepFreeze(structuredClone({
            ...descriptor,
            id        : descriptor.id ?? crypto.randomUUID(),
            recordedAt: Date.now(),
            sequence  : ++me.sequence
        }));

        // The key is present, so the collection writes nothing onto the frozen row.
        rows.add(row);
        me.cursor = rows.count - 1;

        while (rows.count > me.depth) {
            rows.removeAt(0);
            me.cursor--
        }

        return row
    }

    /**
     * Refuses what could not become a row: a history without a bound, a descriptor that is not a
     * plain-data object, or an `id` already retained. A writer calls it before it mutates anything, so a
     * refused row costs no participant change.
     * @param {Object} descriptor
     */
    assertRow(descriptor) {
        let me = this;

        if (me.depth < 1) {
            throw new RangeError(`${me.className}: depth must be at least 1, got ${me.depth}`)
        }

        if (!descriptor || typeof descriptor !== 'object' || Array.isArray(descriptor) || !isPlainData(descriptor)) {
            throw new TypeError(`${me.className}: a row must be a plain-data object without cycles`)
        }

        if (descriptor.id != null && me.has(descriptor.id)) {
            throw new Error(`${me.className}: row ${descriptor.id} is already retained`)
        }
    }

    /**
     * Releases the owned Collection with the rows.
     */
    destroy() {
        this.#rows?.destroy();
        this.#rows = null;

        super.destroy()
    }

    /**
     * The retained row with this id, or `null`.
     * @param {String} id
     * @returns {Object|null}
     */
    get(id) {
        return this.#rows?.get(id) ?? null
    }

    /**
     * The retained row at this index, or `undefined`.
     * @param {Number} index
     * @returns {Object|undefined}
     */
    getAt(index) {
        return this.#rows?.getAt(index)
    }

    /**
     * @param {String} id
     * @returns {Boolean}
     */
    has(id) {
        return this.#rows?.has(id) ?? false
    }

    /**
     * The row {@link #undo} or {@link #redo} would return, without moving the cursor — `null` when there
     * is nothing in that direction.
     * @param {String} direction `undo` or `redo`
     * @returns {Object|null}
     */
    peek(direction) {
        let me = this;

        if (direction === 'undo') {
            return me.current
        }

        if (direction === 'redo') {
            return me.canRedo ? me.getAt(me.cursor + 1) : null
        }

        throw new RangeError(`${me.className}#peek: direction must be undo or redo, got ${direction}`)
    }

    /**
     * Moves the cursor forward onto the next retained row and returns it, or `null` when there is nothing
     * to redo. Applying the row is the caller's.
     * @returns {Object|null}
     */
    redo() {
        let me = this;

        if (!me.canRedo) {
            return null
        }

        me.cursor++;

        return me.getAt(me.cursor)
    }

    /**
     * Serializes the history for the Neural Link: the frozen rows in order, the cursor and the bound.
     * @returns {Object}
     */
    toJSON() {
        let me = this;

        return {
            ...super.toJSON(),
            count   : me.count,
            cursor  : me.cursor,
            depth   : me.depth,
            rows    : me.rows,
            sequence: me.sequence
        }
    }

    /**
     * Returns the row at the cursor and moves the cursor back, or `null` when there is nothing to undo.
     * Applying the row's reverse is the caller's.
     * @returns {Object|null}
     */
    undo() {
        let me = this;

        if (!me.canUndo) {
            return null
        }

        const row = me.getAt(me.cursor);

        me.cursor--;

        return row
    }
}

export default Neo.setupClass(History);
