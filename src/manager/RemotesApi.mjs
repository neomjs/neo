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
}

Neo.applyClassConfig(RemotesApi);

let instance = Neo.create(RemotesApi);

Neo.applyToGlobalNs(instance);

export default instance;
