import Base from './Base.mjs';

/**
 * todo: except for createRandomData a legacy class, since stores live directly inside the app worker
 * @class Neo.manager.Store
 * @extends Neo.manager.Base
 * @singleton
 */
class Store extends Base {
    static config = {
        /**
         * @member {String} className='Neo.manager.Store'
         * @protected
         */
        className: 'Neo.manager.Store',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true,
        /**
         * @member {Object} listeners={}
         * @protected
         */
        listeners: {},
        /**
         * @member {Object} remote={app: ['createRandomData', 'filter', 'load', 'sort']}
         * @protected
         */
        remote: {
            app: ['createRandomData', 'filter', 'load', 'sort']
        }
    }

    /**
     * Dummy method until we have a data package in place
     * @param {Number} amountColumns
     * @param {Number} amountRows
     */
    createRandomData(amountColumns, amountRows) {
        let data = [],
            i    = 0,
            j;

        for (; i < amountRows; i++) {
            data.push({});

            for (j=0; j < amountColumns; j++) {
                data[i]['column' + j] = 'Column' + (j + 1) + ' - ' + Math.round(Math.random() / 1.5);
                data[i]['column' + j + 'style'] = Math.round(Math.random() / 1.7) > 0 ? 'brown' : i%2 ? '#3c3f41' : '#323232'
            }
        }

        return data
    }

    /**
     * @param storeId
     * @param fieldName
     * @param value
     */
    filter(storeId, fieldName, value) {

    }

    /**
     * @param storeId
     * @param params
     */
    load(storeId, params) {

    }

    /**
     * @param storeId
     * @param fieldName
     * @param value
     */
    sort(storeId, fieldName, value) {

    }
}

let instance = Neo.setupClass(Store);

export default instance;
