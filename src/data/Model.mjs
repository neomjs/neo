import Base from '../core/Base.mjs';

/**
 * @class Neo.data.Model
 * @extends Neo.core.Base
 */
class Model extends Base {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.data.Model'
         * @private
         */
        className: 'Neo.data.Model',
        /**
         * @member {String} ntype='model'
         * @private
         */
        ntype: 'model',
        /**
         * @member {Array} fields_=[]
         * @private
         */
        fields_: [],
        /**
         * @member {String} keyProperty_='id'
         * @private
         */
        keyProperty_: 'id',
        /**
         * @member {String|null} storeId=null
         * @private
         */
        storeId: null,
        /**
         * Set this config to true in case you want to track modified fields.
         * Be aware that this will double the amount of data inside each record,
         * since each field will get an original value flag.
         * @member {Boolean} trackModifiedFields=false
         */
        trackModifiedFields: false
    }}

    /**
     *
     * @param {Array} value
     * @param {Array} oldValue
     */
    afterSetFields(value, oldValue) {
        console.log('afterSetFields', value, oldValue);
    }

    /**
     * Finds a field config by a given field name
     * @param {String} key
     * @return {Object|null} The field config object or null if no match was found
     */
    getField(key) {
        let me  = this,
            i   = 0,
            len = me.fields.length;

        for (; i < len; i++) {
            if (me.fields[i].name === key) {
                return me.fields[i];
            }
        }

        return null;
    }
}

Neo.applyClassConfig(Model);

export {Model as default};