import Base from '../core/Base.mjs';

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
     * @member {Map} fieldsMap=new Map()
     */
    fieldsMap = new Map()

    /**
     Triggered after the fields config got changed
     * @param {Object[]|null} value
     * @param {Object[]|null} oldValue
     * @protected
     */
    afterSetFields(value, oldValue) {
        if (value) {
            this.updateFieldsMap(value)
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
     * @param {Object[]} fields
     * @param {Boolean} isRoot=true
     */
    updateFieldsMap(fields, isRoot=true) {
        let {fieldsMap} = this;

        isRoot && fieldsMap.clear();

        fields.forEach(field => {
            fieldsMap.set(field.name, field);

            // Assuming that nested fields contain the full path as the name, we do not need a prefix.
            field.fields && this.updateFieldsMap(field.fields, false)
        })
    }
}

export default Neo.setupClass(Model);
