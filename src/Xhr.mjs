import XhrConnection from './data/connection/Xhr.mjs';

/**
 * @class Neo.Xhr
 * @extends Neo.data.connection.Xhr
 * @singleton
 */
class Xhr extends XhrConnection {
    static config = {
        /**
         * @member {String} className='Neo.Xhr'
         * @protected
         */
        className: 'Neo.Xhr',
        /**
         * @member {String} ntype='xhr'
         * @protected
         */
        ntype: 'xhr',
        /**
         * @member {Object} remote={app:['promiseRequest','promiseJson']}
         * @protected
         */
        remote: {
            app: [
                'promiseJson',
                'promiseRequest',
                'setDefaultHeaders'
            ]
        },
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }
}

export default Neo.setupClass(Xhr);
