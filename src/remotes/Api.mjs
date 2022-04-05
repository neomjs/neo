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
     * @param {String} service
     * @param {String} method
     * @returns {function(*=, *=): Promise<any>}
     */
    generateRemote(service, method) {
        return function(...args) {
            let opts = {
                action: 'rpc',
                method,
                params: [...args],
                service
            };

            if (this.isSharedWorker) {
                opts.appName = opts.appName || data?.appName;
                opts.port    = opts.port    || data?.port;
            }

            return Neo.currentWorker.promiseMessage('data', opts);
        }
    }

    /**
     *
     */
    load() {
        let config = Neo.config,
            path   = config.remotesApiUrl;

        if (!path.includes('http')) {
            path = config.appPath.split('/');
            path.pop();
            path = `../../${path.join('/')}/${config.remotesApiUrl}`;
        }

        fetch(path)
            .then(response => response.json())
            .then(data => {this.register(data)})
    }

    /**
     * @param {Object} data
     */
    register(data) {
        let method, ns, service;

        for (service of data.services) {
            for (method of service.methods) {
                ns = Neo.ns(`${data.namespace}.${service.name}`, true);
                ns[method.name] = this.generateRemote(service.name, method.name);
            }
        }
    }
}

Neo.applyClassConfig(Api);

let instance = Neo.create(Api);

Neo.applyToGlobalNs(instance);

export default instance;
