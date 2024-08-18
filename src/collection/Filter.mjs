import Base       from '../core/Base.mjs';
import Observable from '../core/Observable.mjs';

/**
 * @class Neo.collection.Filter
 * @extends Neo.core.Base
 */
class Filter extends Base {
    /**
     * True automatically applies the core.Observable mixin
     * @member {Boolean} observable=true
     * @static
     */
    static observable = true
    /**
     * Valid values for the operator config:<br>
     * ['==','===','!=','!==','<','<=','>','>=','endsWith','excluded','included','isDefined','isUndefined','like','startsWith']
     * @member {String[]} operators
     * @protected
     * @static
     */
    static operators = [
        '==', '===', '!=', '!==', '<', '<=', '>', '>=', 'endsWith', 'excluded', 'included',
        'isDefined', 'isUndefined', 'like', 'startsWith'
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
         */
        disabled_: false,
        /**
         * Provide a custom filtering function which has a higher priority than property, operator & value
         * @member {Function|null} filterBy_=null
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
         * Valid values:
         *
         * == (not recommended)
         * ===
         * != (not recommended)
         * !==
         * <
         * >=
         * >
         * >=
         * like (collectionValue.toLowerCase().indexOf(filterValue.toLowerCase()) > -1)
         * included (expects value to be an array)
         * excluded (expects value to be an array)
         * @member {String} operator='==='
         */
        operator_: '===',
        /**
         * The property to filter by (use the combination of property, operator & value)
         * @member {String} property_='id'
         */
        property_: 'id',
        /**
         * The scope to use for the filterBy method, in case it is provided. Defaults to this instance.
         * @member {Object|null} scope=null
         */
        scope: null,
        /**
         * The value to filter by (use the combination of property, operator & value)
         * @member {String} value_=null
         */
        value_: null
    }

    afterSetDisabled(...args) {
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
     * Triggered before the operator config gets changed.
     * @param {String|null} value
     * @param {String} oldValue
     * @returns {String}
     * @protected
     */
    beforeSetOperator(value, oldValue) {
        return this.beforeSetEnumValue(value, oldValue, 'operator')
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
     * @returns {Boolean}
     */
    isFiltered(item, filteredItems, allItems) {
        let me = this,
            filterValue, recordValue;

        if (me._disabled) {
            return false
        }

        if (me._filterBy) {
            return me.filterBy.call(me.scope || me, {
                allItems,
                filteredItems,
                item,
                value: me._value
            })
        }

        if (me.includeEmptyValues && (me._value === null || Neo.isEmpty(me._value))) {
            return false
        }

        filterValue = me._value;
        recordValue = item[me._property];

        if (filterValue instanceof Date && recordValue instanceof Date) {
            filterValue = filterValue.valueOf();
            recordValue = recordValue.valueOf()
        }

        return !Filter[me._operator](recordValue, filterValue)
    }

    static ['=='] (a, b) {return a == b}
    static ['==='](a, b) {return a === b}
    static ['!='] (a, b) {return a != b}
    static ['!=='](a, b) {return a !== b}
    static ['<']  (a, b) {return a < b}
    static ['<='] (a, b) {return a <= b}
    static ['>']  (a, b) {return a > b}
    static ['>='] (a, b) {return a >= b}

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
