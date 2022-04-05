import Base from '../core/Base.mjs';

/**
 * @class Neo.remotes.Api
 * @extends Neo.core.Base
 * @singleton
 */
class Api extends Base {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.remotes.Api'
         * @protected
         */
        className: 'Neo.remotes.Api',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }}

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        console.log('Neo.remotes.Api: construct()')
    }
}

Neo.applyClassConfig(Api);

let instance = Neo.create(Api);

Neo.applyToGlobalNs(instance);

export default instance;
