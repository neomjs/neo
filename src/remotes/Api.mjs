import Base from '../core/Base.mjs';

/**
 * @class Neo.remotes.Api
 * @extends Neo.core.Base
 * @singleton
 */
class Api extends Base {
    static config = {
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
    }

    /**
     * @param {String} service
     * @param {String} method
     * @returns {function(*=, *=): Promise<any>}
     */
    generateRemote(service, method) {
        return function(...args) {
            return Neo.currentWorker.promiseMessage('data', {
                action: 'rpc',
                method,
                params: [...args],
                service
            })
        }
    }

    /**
     *
     */
    load() {
        let {config}     = Neo,
            hasJsModules = config.environment === 'development' || config.environment === 'dist/esm',
            path         = config.remotesApiUrl;

        // Relative paths need a special treatment
        if (!path.includes('http')) {
            path = config.appPath.split('/');
            path.pop();
            path = `${path.join('/')}/${config.remotesApiUrl}`;
            path = (hasJsModules ? '../../' : './') + path
        }

        fetch(path)
            .then(response => response.json())
            .then(data => {
                Neo.currentWorker.sendMessage('data', {action: 'registerApi', data});
                this.register(data)
            })
    }

    /**
     * @param {Object} api
     */
    register(api) {
        let ns;

        Object.entries(api.services).forEach(([service, serviceValue]) => {
            ns = Neo.ns(`${api.namespace}.${service}`, true);

            Object.entries(serviceValue.methods).forEach(([method, methodValue]) => {
                ns[method] = this.generateRemote(service, method)
            })
        })
    }
}

export default Neo.setupClass(Api);
