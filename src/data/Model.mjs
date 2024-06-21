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
         * @member {Array|null} fields=null
         */
        fields: null,
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
     * A property set in all data records so that they are easily identifiable.
     * @property {Boolean} isRecord=true
     * @readonly
     */
    isRecord = true

    /**
     * Finds a field config by a given field name
     * @param {String} name
     * @returns {Object|null} The field config object or null if no match was found
     */
    getField(name) {
        let me  = this,
            i   = 0,
            len = me.fields?.length || 0;

        for (; i < len; i++) {
            if (me.fields[i].name === name) {
                return me.fields[i]
            }
        }

        return null
    }
}

Neo.setupClass(Model);

export default Model;
