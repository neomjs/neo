import FetchConnection from './data/connection/Fetch.mjs';

/**
 * @class Neo.Fetch
 * @extends Neo.data.connection.Fetch
 * @singleton
 */
class Fetch extends FetchConnection {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.Fetch'
         * @protected
         */
        className: 'Neo.Fetch',
        /**
         * @member {Object} remote
         * @protected
         */
        remote: {
            app: [
                'delete',
                'get',
                'post',
                'put'
            ]
        },
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }}
}

Neo.applyClassConfig(Fetch);

let instance = Neo.create(Fetch);

Neo.applyToGlobalNs(instance);

export default instance;
