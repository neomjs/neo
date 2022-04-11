import Base from './Base.mjs';

/**
 * @class Neo.manager.RemotesApi
 * @extends Neo.manager.Base
 * @singleton
 */
class RemotesApi extends Base {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.manager.RemotesApi'
         * @protected
         */
        className: 'Neo.manager.RemotesApi',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }}

    /**
     *
     * @param msg
     * @returns {Promise<any>}
     */
    async onMessage(msg) {
        let response = await Neo.Fetch.get(msg);

        return response;
    }
}

Neo.applyClassConfig(RemotesApi);

let instance = Neo.create(RemotesApi);

Neo.applyToGlobalNs(instance);

export default instance;
