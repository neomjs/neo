import Base       from '../core/Base.mjs';
import Observable from '../core/Observable.mjs';

/**
 * @summary Defines a sorting rule for data collections, determining the order of items based on a property or custom function.
 *
 * `Neo.collection.Sorter` encapsulates a single sort criteria (e.g., `property: 'name', direction: 'ASC'`).
 * Collections (like `Neo.data.Store`) use arrays of these Sorter instances to perform multi-level sorting.
 *
 * **Key Features:**
 * - **Reactivity:** Changes to `property` or `direction` configs automatically fire a `change` event, prompting the parent collection to re-sort.
 * - **Value Transformation:** The `useTransformValue` config allows values to be normalized before comparison (e.g., lowercasing strings for case-insensitive sorting).
 * - **Custom Sorting:** The `sortBy` config allows providing a fully custom comparison function, overriding the default property-based logic.
 * - **Null Handling:** `null` and `undefined` values are always pushed to the bottom of the sorted results, regardless of the sort direction (`ASC` or `DESC`), ensuring stable transitivity and predictable UI rendering.
 * - **Mixed Types:** a number sorts before a string that does not coerce to one, and unlike the null rule this rank follows the sort direction. Without it `5` and `'abc'` report a tie while `5` and `1` do not, which is intransitive and lets `Array.prototype.sort` emit an order that depends on the element count. {@link #compareValues} holds both rules, so this path and `Neo.collection.Base#doSort` cannot drift apart.
 *
 * @class Neo.collection.Sorter
 * @extends Neo.core.Base
 * @mixes Neo.core.Observable
 * @see Neo.collection.Base
 * @see Neo.data.Store
 */
class Sorter extends Base {
    /**
     * True automatically applies the core.Observable mixin
     * @member {Boolean} observable=true
     * @static
     */
    static observable = true

    static config = {
        /**
         * @member {String} className='Neo.collection.Sorter'
         * @protected
         */
        className: 'Neo.collection.Sorter',
        /**
         * @member {String} ntype='sorter'
         * @protected
         */
        ntype: 'sorter',
        /**
         * Internal config which maps the direction ASC to 1, -1 otherwise
         * @member {Number} directionMultiplier=1
         * @protected
         */
        directionMultiplier: 1,
        /**
         * The sort direction when using a property.
         * @member {String} direction_='ASC'
         * @reactive
         */
        direction_: 'ASC',
        /**
         * The owner util.Collection needs to apply an onChange listener once
         * @member {boolean} listenerApplied=false
         * @protected
         */
        listenerApplied: false,
        /**
         * The property to sort by.
         * @member {String} property_='id'
         * @reactive
         */
        property_: 'id',
        /**
         * Provide a custom sorting function, has a higher priority than property & direction
         * @member {Function|null} sortBy=null
         * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Collator
         */
        sortBy: null,
        /**
         * True to use the transformValue method for each item (the method can get overridden)
         * @member {Boolean} useTransformValue=true
         * @protected
         */
        useTransformValue: true
    }

    /**
     * @param {String} value
     * @param {String} oldValue
     */
    afterSetDirection(value, oldValue) {
        let me = this;

        me.directionMultiplier = value === 'ASC' ? 1 : -1;

        if (oldValue) {
            me.fire('change', {
                direction: me.direction,
                property : me.property
            });
        }
    }

    /**
     * @param {String} value
     * @param {String} oldValue
     */
    afterSetProperty(value, oldValue) {
        let me = this;

        if (oldValue) {
            me.fire('change', {
                direction: me.direction,
                property : me.property
            });
        }
    }

    /**
     * Default sorter function which gets used by collections in case at least one sorter has a real sortBy method
     * @param a
     * @param b
     */
    defaultSortBy(a, b) {
        let me = this;

        a = a[me.property];
        b = b[me.property];

        if (me.useTransformValue) {
            a = me.transformValue(a);
            b = me.transformValue(b);
        }

        return Sorter.compareValues(a, b, me.directionMultiplier)
    }

    /**
     * @summary The one ordering rule every collection sort uses, for a single already-transformed value pair.
     *
     * `Neo.collection.Base#doSort` reads it for its mapped-value path and {@link #defaultSortBy} for the
     * `sortBy`-free path. They share it rather than each spelling it out, because the two paths disagreeing
     * is the defect class this method exists to make impossible: an earlier nullish repair reached one of
     * them and not the other.
     *
     * **Absence first.** `null` and `undefined` sink on ASC *and* DESC, ignoring `directionMultiplier`.
     * "No value" is not a position in the ordering, so it does not flip with the ordering.
     *
     * **Then one partition, and it is the whole design.** A present value either converts to a number or it
     * does not, and the two groups are ordered separately: everything numeric — numbers *and* the strings that
     * convert — comes first, ordered by numeric value; everything else follows, ordered as text. That rank does
     * obey `directionMultiplier`, because both operands are present values and so pose an ordering question
     * rather than a presence one.
     *
     * **Why partition by convertibility rather than by `typeof`.** The relational operators give a numeric
     * string two incompatible orderings at once: numeric against a number, lexical against another string. Any
     * rule that keeps both is intransitive, and not only for the obvious pair — `5 > 'abc'` and `5 < 'abc'` are
     * both `false`, but so is every cycle built from that split, e.g. `20 < '!' < '10' < 20`. A comparator with
     * a cycle is one `Array.prototype.sort` is not specified for, and its output then depends on the element
     * count and the engine rather than on the data. One ordering per value is the only way out; this keeps the
     * numeric one, because a numeric string is a number that arrived as text — which is exactly how mixed types
     * reach a sort here, through `data.Store` soft hydration.
     *
     * So `'10'` against `5` still compares as ten, and `'10'` against `'9'` now does too, where the relational
     * operators alone would have read them as `'1'` before `'9'`.
     *
     * **Ties are reserved for equality.** Equal numeric value is not equality — a number precedes an equal-valued
     * string, and two distinct such strings fall back to text order, so `'05'` precedes `'5'`. `0` is returned
     * only for operands a caller would call the same, because a tie between distinct values is the defect this
     * method exists to remove, not a smaller version of it.
     *
     * @param {*} a First already-transformed value.
     * @param {*} b Second already-transformed value.
     * @param {Number} directionMultiplier `1` for ASC, `-1` for DESC.
     * @returns {Number} `-1`, `0` or `1`; `0` only for genuinely equal values.
     */
    static compareValues(a, b, directionMultiplier) {
        // Absence is settled in full before the partition below opens, because `Number(null)` is 0 while
        // `Number(undefined)` is NaN — so a partition by convertibility would order the two against each
        // other, and "missing" has no internal ordering to express.
        if (a == null || b == null) {
            if (a == null && b == null) return 0;

            return a == null ? 1 : -1
        }

        const
            numericA  = Number(a),
            numericB  = Number(b),
            convertsA = !Number.isNaN(numericA),
            convertsB = !Number.isNaN(numericB);

        if (convertsA !== convertsB) {
            return (convertsA ? -1 : 1) * directionMultiplier
        }

        if (convertsA) {
            if (numericA > numericB) return  1 * directionMultiplier;
            if (numericA < numericB) return -1 * directionMultiplier;

            const aIsNumber = typeof a === 'number';

            // Equal numeric value, so the remaining question is which representation leads. A number
            // precedes an equal-valued string; two strings fall through to text order below.
            if (aIsNumber !== (typeof b === 'number')) {
                return (aIsNumber ? -1 : 1) * directionMultiplier
            }

            if (aIsNumber) return 0
        }

        if (a > b) {
            return 1 * directionMultiplier
        }

        if (a < b) {
            return -1 * directionMultiplier
        }

        return 0
    }

    /**
     * Needed for remote sorting
     * @returns {Object|null}
     */
    export() {
        let me                    = this,
            {direction, property} = me;

        if (!me.sortBy && direction && property) {
            return {direction, property}
        }

        return null
    }

    /**
     * Serializes the instance into a JSON-compatible object for the Neural Link.
     * @returns {Object}
     */
    toJSON() {
        return {
            ...super.toJSON(),
            direction: this.direction,
            property : this.property
        }
    }

    /**
     * @param {*} value
     * @returns {*} value
     */
    transformValue(value) {
        if (typeof value === 'string') {
            value = value.toLowerCase()
        }

        return value
    }
}

export default Neo.setupClass(Sorter);
