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
     * Two rules sit ahead of `>` / `<`, and they answer different questions:
     *
     * - **Absence** — `null` and `undefined` sink on ASC *and* DESC, ignoring `directionMultiplier`. "No value"
     *   is not a position in the ordering, so it does not flip with the ordering.
     * - **Type rank** — a number sorts before a string that does not coerce to a number, and this rank DOES
     *   obey `directionMultiplier`, so DESC puts such strings first. Both operands are present values, so this
     *   is an ordering question, not a presence one; inheriting the nullish behaviour here would quietly assert
     *   that a string is a kind of absence.
     *
     * The type rank exists because `5 > 'abc'` and `5 < 'abc'` are both `false`, so the relational operators
     * report a tie for the pair while still ordering `5` against `1` — an intransitive relation, which
     * `Array.prototype.sort` is not specified for. The emitted order then depends on the element count and the
     * engine's algorithm rather than on the data. A documented tie would not fix that; only removing it does.
     *
     * Strings that DO coerce are untouched: `'10'` against `5` still compares as ten, because only a pair whose
     * string side yields `NaN` reaches the rank.
     *
     * @param {*} a First already-transformed value.
     * @param {*} b Second already-transformed value.
     * @param {Number} directionMultiplier `1` for ASC, `-1` for DESC.
     * @returns {Number} `-1`, `0` or `1`; `0` only for genuinely equal values.
     */
    static compareValues(a, b, directionMultiplier) {
        if (a == null && b != null) return  1;
        if (a != null && b == null) return -1;

        const
            aIsNumber = typeof a === 'number',
            bIsNumber = typeof b === 'number';

        if (aIsNumber !== bIsNumber) {
            const other = aIsNumber ? b : a;

            if (typeof other === 'string' && Number.isNaN(Number(other))) {
                return (aIsNumber ? -1 : 1) * directionMultiplier
            }
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
