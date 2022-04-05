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
     *
     */
    load() {
        let config = Neo.config,
            path   = config.appPath.split('/');

        path.pop();

        fetch(`../../${path.join('/')}/${config.remotesApiUrl}`)
            .then(response => response.json())
            .then(data => {this.register(data)})
    }

    onRemoteMethod(...args) {
        console.log('onRemoteMethod', ...args);
    }

    /**
     * @param {Object} data
     */
    register(data) {
        let method, ns, service;

        for (service of data.services) {
            for (method of service.methods) {
                ns = Neo.ns(`${data.namespace}.${service.name}`, true);
                ns[method.name] = this.onRemoteMethod;
            }
        }
    }
}

Neo.applyClassConfig(Api);

let instance = Neo.create(Api);

Neo.applyToGlobalNs(instance);

export default instance;
