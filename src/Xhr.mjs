import {default as XhrConnection} from './data/connection/Xhr.mjs';

/**
 * @class Neo.Xhr
 * @extends Neo.data.connection.Xhr
 * @singleton
 */
class Xhr extends XhrConnection {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.Xhr'
         * @private
         */
        className: 'Neo.Xhr',
        /**
         * @member {String} ntype='xhr'
         * @private
         */
        ntype: 'xhr',
        /**
         * @member {Object} remote={app:['promiseRequest','promiseJson']}
         * @private
         */
        remote: {
            app: ['promiseRequest', 'promiseJson']
        },
        /**
         * @member {boolean} singleton=true
         * @private
         */
        singleton: true
    }}
}

Neo.applyClassConfig(Xhr);

let instance = Neo.create(Xhr);

Neo.applyToGlobalNs(instance);

export default instance;