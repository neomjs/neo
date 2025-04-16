import Base          from '../core/Base.mjs';
import RecordFactory from './RecordFactory.mjs';

/**
 * @class Neo.data.Model
 * @extends Neo.core.Base
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
         * @member {Object[]|null} fields_=null
         */
        fields_: null,
        /**
         * @member {String} keyProperty_='id'
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
            me.hasNestedFields = false
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
            }
        })
    }
}

export default Neo.setupClass(Model);
