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
 * - **Mixed Types:** values that convert to a number sort before those that do not, and unlike the null rule this rank follows the sort direction. See {@link #compareValues}, which owns both rules.
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
     * @summary The one ordering rule every collection sort uses, shared by {@link #defaultSortBy} and
     * {@link Neo.collection.Base#doSort} so the two paths cannot drift apart.
     *
     * `null` / `undefined` sink on ASC *and* DESC — absence has no position in an ordering, so it does not
     * flip with one. Every present value then falls on one side of a single partition: values that convert
     * to a number — numbers **and** numeric strings — lead and order by that value; the rest order as text.
     * That rank does follow `directionMultiplier`.
     *
     * Partitioned by convertibility rather than by `typeof` because a numeric string otherwise carries two
     * orderings at once, numeric against a number and textual against a string, and no rule keeping both is
     * transitive. So `'10'` beats `5`, and now beats `'9'` too.
     *
     * Supported domain is number and string, `NaN` included — it converts to nothing, so it orders as text.
     * Objects, arrays, `Date` and `Symbol` are **unsupported**; they get an order rather than a false tie,
     * which is the safer failure, but nothing is promised about it.
     *
     * @param {*} a First already-transformed value.
     * @param {*} b Second already-transformed value.
     * @param {Number} directionMultiplier `1` for ASC, `-1` for DESC.
     * @returns {Number} `-1`, `0` or `1`; `0` only where the operands share a basis for being equal.
     */
    static compareValues(a, b, directionMultiplier) {
        // Settled in full before the partition, which would otherwise split them: Number(null) is 0,
        // Number(undefined) is NaN.
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

            // Equal value is equal, whatever it was written as: `5`, `'5'` and `'05'` are one value,
            // and a stable sort keeps their input order rather than inventing one.
            return 0
        }

        // Text, not the raw operands: identical for two strings, and the difference between an order
        // and a false tie for NaN, which is false against every string in both directions.
        const
            textA = String(a),
            textB = String(b);

        if (textA > textB) {
            return 1 * directionMultiplier
        }

        if (textA < textB) {
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
