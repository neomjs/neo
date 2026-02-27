import Base           from '../core/Base.mjs';
import RecordFactory  from './RecordFactory.mjs';
import {isDescriptor} from '../core/ConfigSymbols.mjs';

/**
 * @class Neo.data.Model
 * @extends Neo.core.Base
 *
 * @summary Defines the schema and data processing logic for records in a Store.
 *
 * Models define the `fields` array, which maps raw data keys to canonical field names, handles
 * data conversion, and defines computed values.
 *
 * ### Calculated Fields & Dependencies
 *
 * Fields can dynamically compute their values using a `calculate` function. 
 * If a calculated field relies on other calculated fields, you **MUST** declare them in the `depends` array.
 *
 * This is critical for performance when the Store operates in "Turbo Mode" (`autoInitRecords: false`).
 * In Turbo Mode, the Store performs "Soft Hydration" on raw JSON objects. Declaring `depends` ensures
 * the Store recursively resolves and caches the dependencies before executing your calculate function,
 * preventing massive performance bottlenecks (like redundant array reductions).
 *
 * @example
 * fields: [{
 *     name: 'total',
 *     type: 'Integer',
 *     calculate: data => data.a + data.b
 * }, {
 *     name: 'ratio',
 *     type: 'Float',
 *     depends: ['total'], // Crucial for Turbo Mode performance!
 *     calculate: data => data.total === 0 ? 0 : data.a / data.total
 * }]
 */
class Model extends Base {
    static config = {
        /**
         * @member {String} className='Neo.data.Model'
         * @protected
         */
        className: 'Neo.data.Model',
        /**
         * @member {String} ntype='model'
         * @protected
         */
        ntype: 'model',
        /**
         * @member {Object[]|null} fields_
         * @reactive
         */
        fields_: {
            [isDescriptor]: true,
            merge         : 'deepArrays',
            value         : null
        },
        /**
         * @member {String} keyProperty_='id'
         * @reactive
         */
        keyProperty_: 'id',
        /**
         * @member {String|null} storeId=null
         * @protected
         */
        storeId: null,
        /**
         * Set this config to true in case you want to track modified fields.
         * Be aware that this will double the amount of data inside each record,
         * since each field will get an original value flag.
         * @member {Boolean} trackModifiedFields=false
         */
        trackModifiedFields: false
    }

    /**
     * Internally storing all fields, which have a calculate property
     * @member {Map} calculatedFieldsMap=new Map()
     * @protected
     */
    calculatedFieldsMap = new Map()
    /**
     * Internally storing all fields inside a flat map => nested fields included
     * @member {Map} fieldsMap=new Map()
     * @protected
     */
    fieldsMap = new Map()
    /**
     * @member {Boolean} hasComplexFields=false
     * @protected
     */
    hasComplexFields = false
    /**
     * @member {Boolean} hasNestedFields=false
     * @protected
     */
    hasNestedFields = false

    /**
     Triggered after the fields config got changed
     * @param {Object[]|null} value
     * @param {Object[]|null} oldValue
     * @protected
     */
    afterSetFields(value, oldValue) {
        if (value) {
            let me = this;

            me.updateFieldsMap(value);

            // Fields can get changed multiple times before the model instance is getting constructed.
            // We only need the latest state before construction & honor run-time changes.
            if (me.isConstructed) {
                RecordFactory.createRecordClass(me, true)
            }
        }
    }

    /**
     * Finds a field config by a given field name
     * @param {String} name
     * @returns {Object|null} The field config object or null if no match was found
     */
    getField(name) {
        return this.fieldsMap.get(name) || null
    }

    /**
     * Finds a field type by a given field name
     * @param {String} name
     * @returns {String|null} The lowercase field type or null if no match was found
     */
    getFieldType(name) {
        return this.getField(name)?.type?.toLowerCase() || null
    }

    /**
     * Serializes the instance into a JSON-compatible object for the Neural Link.
     * @returns {Object}
     */
    toJSON() {
        let me = this;

        return {
            ...super.toJSON(),
            fields             : me.serializeConfig(me.fields),
            keyProperty        : me.keyProperty,
            storeId            : me.storeId,
            trackModifiedFields: me.trackModifiedFields
        }
    }

    /**
     * @param {Object[]} fields
     * @param {Boolean} isRoot=true
     * @param {String} path=''
     */
    updateFieldsMap(fields, isRoot=true, path='') {
        let me = this,
            {calculatedFieldsMap, fieldsMap} = me,
            fieldName;

        if (isRoot) {
            calculatedFieldsMap.clear();
            fieldsMap.clear();
            me.hasComplexFields = false; // Reset flag
            me.hasNestedFields  = false
        }

        fields.forEach(field => {
            fieldName = path + field.name

            if (field.fields) {
                me.hasNestedFields = true;
                me.updateFieldsMap(field.fields, false, field.name + '.')
            } else {
                fieldsMap.set(fieldName, field);

                if (field.calculate) {
                    calculatedFieldsMap.set(fieldName, field)
                }

                // Check for complex fields (Soft Hydration Optimization)
                if (field.calculate || field.convert || field.mapping) {
                    me.hasComplexFields = true
                }
            }
        })
    }
}

export default Neo.setupClass(Model);
