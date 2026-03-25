import Base from './Base.mjs';

/**
 * @class Neo.data.connection.Rpc
 * @extends Neo.data.connection.Base
 */
class Rpc extends Base {
    static config = {
        /**
         * @member {String} className='Neo.data.connection.Rpc'
         * @protected
         */
        className: 'Neo.data.connection.Rpc',
        /**
         * @member {String} ntype='connection-rpc'
         * @protected
         */
        ntype: 'connection-rpc',
        /**
         * The remote API namespace to connect to (e.g. 'MyApp.backend.ColorService')
         * @member {String|null} api=null
         */
        api: null
    }

    /**
     * @param {Object} [params]
     * @returns {Promise<any>}
     */
    async create(params) {
        return this.execute('create', params);
    }

    /**
     * @param {String} method 
     * @param {Object} [params]
     * @returns {Promise<any>}
     */
    async execute(method, params) {
        let me = this,
            apiArray, service;

        if (!me.api) {
            throw new Error(`${me.className}: execute() requires an api config to be set`);
        }

        apiArray = me.api.split('.');
        service  = apiArray.pop();

        if (!Neo.manager.rpc.Message) {
            await import('../../manager/rpc/Message.mjs');
        }

        return Neo.manager.rpc.Message.onMessage({
            method,
            params: params ? [params] : [],
            service
        });
    }

    /**
     * @param {Object} [params]
     * @returns {Promise<any>}
     */
    async read(params) {
        return this.execute('read', params);
    }

    /**
     * @param {Object} [params]
     * @returns {Promise<any>}
     */
    async update(params) {
        return this.execute('update', params);
    }
}

export default Neo.setupClass(Rpc);
