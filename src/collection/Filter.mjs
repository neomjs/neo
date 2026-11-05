import Base       from '../core/Base.mjs';
import Observable from '../core/Observable.mjs';
import Sorter     from './Sorter.mjs';

/**
 * @summary Predicate rule for filtering `Neo.collection.Base` and `Neo.data.Store` items by property/operator/value or `filterBy`.
 * @class Neo.collection.Filter
 * @extends Neo.core.Base
 * @mixes Neo.core.Observable
 */
class Filter extends Base {
    /**
     * True automatically applies the core.Observable mixin
     * @member {Boolean} observable=true
     * @static
     */
    static observable = true
    /**
     * Valid values for the operator config
     * @member {String[]} operators=['==','===','!=','!==','<','<=','>','>=','doesNotStartWith','endsWith','excluded','included','isDefined','isUndefined','like','startsWith']
     * @protected
     * @static
     */
    static operators = [
        '==', '===', '!=', '!==', '<', '<=', '>', '>=', 'doesNotStartWith', 'endsWith', 'excluded',
        'included', 'isDefined', 'isUndefined', 'like', 'startsWith', 'typedIncluded'
    ]

    static config = {
        /**
         * @member {String} className='Neo.collection.Filter'
         * @protected
         */
        className: 'Neo.collection.Filter',
        /**
         * @member {String} ntype='filter'
         * @protected
         */
        ntype: 'filter',
        /**
         * Setting disabled to true will exclude this filter from the collection filtering logic
         * @member {Boolean} disabled_=false
         * @reactive
         */
        disabled_: false,
        /**
         * The fields this predicate reads when they are not just `property` (a callback or a multi-field subclass)
         * @member {String[]|null} fields_=null
         * @reactive
         */
        fields_: null,
        /**
         * Provide a custom filtering function which has a higher priority than property, operator & value
         * @member {Function|null} filterBy_=null
         * @reactive
         */
        filterBy_: null,
        /**
         * True means not filtering out items in case the value is '', null, [] or {}
         * @member {Boolean} includeEmptyValues=true
         */
        includeEmptyValues: true,
        /**
         * Set this flag to true before starting bulk updates (e.g. changing property & value)
         * to prevent multiple change events
         * @member {Boolean} isUpdating_=false
         * @reactive
         */
        isUpdating_: false,
        /**
         * The owner util.Collection needs to apply an onChange listener once
         * @member {Boolean} listenerApplied=false
         * @protected
         */
        listenerApplied: false,
        /**
         * The operator to filter by (use the combination of property, operator & value)
         * Valid values: '==', '===', '!=', '!==', '<', '<=', '>', '>=', 'doesNotStartWith', 'endsWith', 'excluded', 'included', 'isDefined', 'isUndefined', 'like', 'startsWith', 'typedIncluded'
         * @member {String} operator='==='
         * @reactive
         */
        operator_: '===',
        /**
         * Optional collection-local contribution identity, paired with property. Null is unowned.
         * @member {String|null} ownerRole=null
         */
        ownerRole: null,
        /**
         * The property to filter by (use the combination of property, operator & value)
         * @member {String} property_='id'
         * @reactive
         */
        property_: 'id',
        /**
         * Opts a local Store into reapplying its full filter conjunction after ordinary record edits.
         * The Store owns this lifetime; silent raw edits still need explicit filtering.
         * @member {Boolean} reapplyOnRecordChange=false
         */
        reapplyOnRecordChange: false,
        /**
         * The scope to use for the filterBy method, in case it is provided. Defaults to this instance.
         * @member {Object|null} scope=null
         */
        scope: null,
        /**
         * The value to filter by (use the combination of property, operator & value)
         * @member {String} value_=null
         * @reactive
         */
        value_: null
    }

    /**
     * @summary True while this filter narrows the collection: enabled, with a callback or a non-empty value.
     * @member {Boolean} effective
     */
    get effective() {
        const me = this;
        return !me.disabled && (!!me.filterBy || !(me.includeEmptyValues && (me.value === null || Neo.isEmpty(me.value))))
    }

    afterSetDisabled(...args) {
        this.fireChangeEvent(...args)
    }

    afterSetFields(...args) {
        this.fireChangeEvent(...args)
    }

    afterSetFilterBy(value, oldValue) {
        // todo
    }

    afterSetIsUpdating(value, oldValue) {
        value === false && this.fireChangeEvent(value, oldValue)
    }

    afterSetOperator(...args) {
        this.fireChangeEvent(...args)
    }

    afterSetProperty(...args) {
        this.fireChangeEvent(...args)
    }

    afterSetValue(...args) {
        this.fireChangeEvent(...args)
    }

    beforeSetFilterBy(value, oldValue) {
        if (value && typeof value !== 'function') {
            Neo.logError('filterBy has to be a function', this);
            return oldValue
        }

        return value
    }

    /**
     * @summary Validates the operator and current typed include value before admitting a change.
     * @param {String|null} value
     * @param {String} oldValue
     * @returns {String}
     * @protected
     */
    beforeSetOperator(value, oldValue) {
        value = this.beforeSetEnumValue(value, oldValue, 'operator');
        try {
            if (value === 'typedIncluded' && this._value != null) {
                if (!Array.isArray(this._value)) throw new TypeError('typedIncluded requires an array of scalar values');
                this._value.forEach(Filter.getValueKey)
            }
        } catch (error) {
            this._operator = oldValue;
            throw error
        }
        return value
    }

    /**
     * @summary Validates a typed include set before changing its authoritative value.
     * @param {*} value
     * @param {*} oldValue
     * @returns {*}
     * @protected
     */
    beforeSetValue(value, oldValue) {
        try {
            if (this.operator === 'typedIncluded' && value !== null) {
                if (!Array.isArray(value)) throw new TypeError('typedIncluded requires an array of scalar values');
                value.forEach(Filter.getValueKey)
            }
        } catch (error) {
            this._value = oldValue;
            throw error
        }

        return value
    }

    /**
     * @summary Builds a scan-local evaluator: the configs `isFiltered()` decides by, and a typed selection's keys,
     * are read once per scan without mutating the Filter.
     *
     * Every reactive config read registers an effect dependency, so calling `isFiltered()` per item reads each
     * config once per item. A subclass that overrides `isFiltered()` gets an evaluator that calls its override.
     * @returns {Function} `(item, filteredItems, allItems)`, true when the item is filtered out
     * @protected
     */
    createEvaluator() {
        const me    = this,
              state = me.#readState(true);

        if (me.isFiltered !== Filter.prototype.isFiltered) {
            return (item, filteredItems, allItems) => me.isFiltered(item, filteredItems, allItems, state.typedKeys)
        }

        return (item, filteredItems, allItems) => me.#decide(state, item, filteredItems, allItems)
    }

    /**
     * @summary Decides one item from configs read once, resolving dotted paths via {@link Neo.collection.Sorter.getValue}.
     * @param {Object} state
     * @param {Object} item
     * @param {Array} filteredItems
     * @param {Array} allItems
     * @returns {Boolean} true when the item is filtered out
     * @private
     */
    #decide({disabled, empty, filterBy, operator, property, scope, typedKeys, value}, item, filteredItems, allItems) {
        if (disabled) {
            return false
        }

        if (!item) {
            return true
        }

        if (filterBy) {
            return filterBy.call(scope, {allItems, filteredItems, item, value})
        }

        if (empty) {
            return false
        }

        let filterValue = value,
            recordValue = Sorter.getValue(item, property);

        if (operator === 'typedIncluded') {
            return typedKeys ? !typedKeys.has(Filter.getValueKey(recordValue)) : !Filter.typedIncluded(recordValue, filterValue)
        }

        if (filterValue instanceof Date && recordValue instanceof Date) {
            filterValue = filterValue.valueOf();
            recordValue = recordValue.valueOf()
        }

        return !Filter[operator](recordValue, filterValue)
    }

    /**
     * Needed for remote filtering
     * @returns {Object|null}
     */
    export() {
        let me                          = this,
            {operator, property, value} = me;

        if (!me.filterBy) {
            return {operator, property, value}
        }

        return null
    }

    /**
     * @param value
     * @param oldValue
     */
    fireChangeEvent(value, oldValue) {
        let me = this;

        if (oldValue !== undefined && me.isUpdating !== true) {
            let {operator, property, value} = me;
            me.fire('change', {operator, property, value})
        }
    }

    /**
     * Checks if a collection item matches this filter
     * @param {Object} item The current collection item
     * @param {Array} filteredItems If the collection filterMode is not primitive contains the items which passed
     * the previous filters, otherwise all collection items
     * @param {Array} allItems all collection items
     * @param {Set|null} typedKeys=null Scan-local typed include keys.
     * @returns {Boolean}
     */
    isFiltered(item, filteredItems, allItems, typedKeys=null) {
        return this.#decide(this.#readState(false, typedKeys), item, filteredItems, allItems)
    }

    /**
     * The configs `isFiltered()` decides by, read once.
     * @param {Boolean} scan true to compute a typed selection's keys for a whole scan
     * @param {Set|null} [typedKeys=null] Keys a scan computed already
     * @returns {Object}
     * @private
     */
    #readState(scan, typedKeys=null) {
        const me       = this,
              disabled = me._disabled,
              operator = me._operator,
              value    = me._value;

        return {
            disabled,
            empty    : me.includeEmptyValues && (value === null || Neo.isEmpty(value)),
            filterBy : me._filterBy,
            operator,
            property : me._property,
            scope    : me.scope || me,
            typedKeys: typedKeys ?? (scan && !disabled && operator === 'typedIncluded' && Array.isArray(value) ? new Set(value.map(Filter.getValueKey)) : null),
            value
        }
    }

    /**
     * Serializes the instance into a JSON-compatible object for the Neural Link.
     * @returns {Object}
     */
    toJSON() {
        let me = this;

        return {
            ...super.toJSON(),
            disabled             : me.disabled,
            fields               : me.fields,
            operator             : me.operator,
            ownerRole            : me.ownerRole,
            property             : me.property,
            reapplyOnRecordChange: me.reapplyOnRecordChange,
            value                : me.value
        }
    }

    static ['=='] (a, b) {return a == b}
    static ['==='](a, b) {return a === b}
    static ['!='] (a, b) {return a != b}
    static ['!=='](a, b) {return a !== b}
    static ['<']  (a, b) {return a < b}
    static ['<='] (a, b) {return a <= b}
    static ['>']  (a, b) {return a > b}
    static ['>='] (a, b) {return a >= b}

    static ['doesNotStartWith'](a, b) {
        if (!Neo.isString(a)) {a = String(a)}
        if (!Neo.isString(b)) {b = String(b)}

        return !a?.toLowerCase().startsWith(b?.toLowerCase())
    }

    static ['endsWith'](a, b) {
        if (!Neo.isString(a)) {a = String(a)}
        if (!Neo.isString(b)) {b = String(b)}

        return a?.toLowerCase().endsWith(b?.toLowerCase()) || false
    }

    static ['excluded'](a, b) {
        return b.indexOf(a) < 0
    }

    static ['included'](a, b) {
        return b.indexOf(a) > -1
    }

    /**
     * @summary Encodes scalar identity without merging equal labels or Date/number values.
     * @param {*} value
     * @returns {String}
     * @throws {TypeError} Unsupported scalar or invalid Date.
     * @static
     */
    static getValueKey(value) {
        if (value === null) return 'null';
        if (value instanceof Date) {
            const epoch = value.valueOf();
            if (!Number.isFinite(epoch)) throw new TypeError('Invalid Date in scalar filter values');
            return 'date:' + epoch
        }

        const type = typeof value;
        if (type === 'undefined') return 'undefined';
        if (type === 'string') return 'string:' + value;
        if (type === 'boolean') return 'boolean:' + value;
        if (type === 'number' && !Number.isNaN(value)) return 'number:' + value;
        throw new TypeError('Filter values must be scalar values or valid Dates')
    }

    /**
     * @summary Tests local typed inclusion; equal Date epochs match, numeric timestamps stay distinct.
     * Remote consumers of this operator are not supported.
     * @param {*} value
     * @param {Array} values
     * @returns {Boolean}
     * @static
     */
    static typedIncluded(value, values) {
        const key = Filter.getValueKey(value);
        return values.some(candidate => Filter.getValueKey(candidate) === key)
    }

    static ['isDefined'](a, b) {
        return a !== undefined
    }

    static ['isUndefined'](a, b) {
        return a === undefined
    }

    static ['like'](a, b) {
        if (!Neo.isString(a)) {a = String(a)}
        if (!Neo.isString(b)) {b = String(b)}

        return a?.toLowerCase().includes(b?.toLowerCase()) || false
    }

    static ['startsWith'](a, b) {
        if (!Neo.isString(a)) {a = String(a)}
        if (!Neo.isString(b)) {b = String(b)}

        return a?.toLowerCase().startsWith(b?.toLowerCase()) || false
    }
}

export default Neo.setupClass(Filter);
