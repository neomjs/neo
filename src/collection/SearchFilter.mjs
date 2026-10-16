import Filter         from './Filter.mjs';
import {isDescriptor} from '../core/ConfigSymbols.mjs';

/**
 * @summary A record search: every whitespace-separated term of `value` must occur in at least one of `fields`.
 *
 * Its settings are reactive configs, so a change re-filters without swapping a callback. An empty query or an empty
 * `fields` list is inert and not `effective`. Strings, Numbers and Booleans match as text; other values only through a `fieldText` hook.
 * Local only: `export()` returns null. Writers check `Store#getSearchRefusal()` first.
 *
 * @example
 *     store.filters = [...store.filters, {
 *         module   : SearchFilter,
 *         ownerRole: 'grid-search',
 *         fields   : ['firstname', 'lastname'],
 *         value    : 'ann smith'
 *     }]
 *
 * @class Neo.collection.SearchFilter
 * @extends Neo.collection.Filter
 */
class SearchFilter extends Filter {
    static config = {
        /**
         * @member {String} className='Neo.collection.SearchFilter'
         * @protected
         */
        className: 'Neo.collection.SearchFilter',
        /**
         * @member {String} ntype='search-filter'
         * @protected
         */
        ntype: 'search-filter',
        /**
         * True matches terms with their case; false (the default) ignores case on both sides.
         * @member {Boolean} caseSensitive_=false
         * @reactive
         */
        caseSensitive_: false,
        /**
         * Per-field text hooks, `{field: (value, item) => String}`, for values that are not plain text.
         * A field without a hook matches only String, Number and Boolean values.
         * @member {Object|null} fieldText_=null
         * @reactive
         */
        fieldText_: {[isDescriptor]: true, clone: 'none', value: null},
        /**
         * The search spans `fields`, so it has no single property. `null` marks the columnless contribution slot.
         * @member {String|null} property=null
         */
        property: null
    }

    /**
     * @member {String[]|null} #terms=null The current query's terms, compiled lazily.
     * @private
     */
    #terms = null

    /**
     * @summary True while the search narrows anything: enabled, with at least one term and one field.
     * @member {Boolean} effective
     */
    get effective() {
        return !this.disabled && this.getTerms().length > 0 && this._fields?.length > 0
    }

    afterSetCaseSensitive(value, oldValue) {
        this.#terms = null;
        this.fireChangeEvent(value, oldValue)
    }

    afterSetFieldText(value, oldValue) {
        this.fireChangeEvent(value, oldValue)
    }

    afterSetValue(value, oldValue) {
        this.#terms = null;
        super.afterSetValue(value, oldValue)
    }

    /**
     * A local search has no remote descriptor.
     * @returns {null}
     */
    export() {
        return null
    }

    /**
     * @summary Returns the query's terms, split on whitespace, lower-cased unless the search is case-sensitive.
     * @returns {String[]}
     */
    getTerms() {
        const me = this;

        if (!me.#terms) {
            const text = me._value === null || me._value === undefined ? '' : String(me._value);
            me.#terms = text.split(/\s+/).filter(Boolean).map(term => me._caseSensitive ? term : term.toLowerCase())
        }

        return me.#terms
    }

    /**
     * @summary Returns true when the item is filtered out: some term occurs in none of the searched fields.
     * @param {Object} item The current collection item
     * @returns {Boolean}
     */
    isFiltered(item) {
        const me = this;

        if (me._disabled) {
            return false
        }

        if (!item) {
            return true
        }

        const fields = me._fields,
              terms  = me.getTerms();

        // An empty query or an empty scope searches nothing, so it keeps every record.
        if (!terms.length || !fields?.length) {
            return false
        }

        const fieldText = me._fieldText,
              texts     = [];

        for (const field of fields) {
            const value = item[field],
                  hook  = fieldText?.[field];

            let text = hook ? hook(value, item) : SearchFilter.getDefaultText(value);

            if (text !== null && text !== undefined) {
                text = String(text);
                texts.push(me._caseSensitive ? text : text.toLowerCase())
            }
        }

        return !terms.every(term => texts.some(text => text.includes(term)))
    }

    /**
     * Serializes the instance into a JSON-compatible object for the Neural Link. Hooks are listed by field.
     * @returns {Object}
     */
    toJSON() {
        let me = this;

        return {
            ...super.toJSON(),
            caseSensitive: me.caseSensitive,
            fieldText    : me.fieldText ? Object.keys(me.fieldText) : null
        }
    }

    /**
     * @summary The text a field contributes without a hook: Strings, Numbers and Booleans as `String(value)`, else null.
     * @param {*} value
     * @returns {String|null}
     * @static
     */
    static getDefaultText(value) {
        const type = typeof value;
        return type === 'string' || type === 'number' || type === 'boolean' ? String(value) : null
    }
}

export default Neo.setupClass(SearchFilter);
