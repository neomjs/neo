import Neo         from '../src/Neo.mjs';
import * as core   from '../src/core/_export.mjs';
import ServiceBase from '../src/worker/ServiceBase.mjs';

/**
 * @class Neo.ServiceWorker
 * @extends Neo.worker.ServiceBase
 * @singleton
 */
class ServiceWorker extends ServiceBase {
    /**
     * @member {String} workerId='service'
     * @protected
     */
    workerId = 'service'

    static getConfig() {return {
        /**
         * @member {String} className='Neo.ServiceWorker'
         * @protected
         */
        className: 'Neo.ServiceWorker',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true,
        /**
         * @member {String} version_='1.0.0'
         */
        version_: '1.0.0'
    }}
}

Neo.applyClassConfig(ServiceWorker);

let instance = Neo.create(ServiceWorker);

Neo.applyToGlobalNs(instance);

export default instance;
