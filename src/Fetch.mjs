import FetchConnection from './data/connection/Fetch.mjs';

/**
 * @class Neo.Fetch
 * @extends Neo.data.connection.Fetch
 * @singleton
 */
class Fetch extends FetchConnection {
    static config = {
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
                'head',
                'options',
                'patch',
                'post',
                'put'
            ]
        },
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }
}

let instance = Neo.setupClass(Fetch);

export default instance;
