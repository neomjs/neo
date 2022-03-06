import Neo         from '../src/Neo.mjs';
import * as core   from '../src/core/_export.mjs';
import ServiceBase from '../src/worker/ServiceBase.mjs';

/**
 * @class Neo.apps.ServiceWorker
 * @extends Neo.worker.ServiceBase
 * @singleton
 */
class ServiceWorker extends ServiceBase {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.apps.ServiceWorker'
         * @protected
         */
        className: 'Neo.apps.ServiceWorker',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true,
        /**
         * @member {String} workerId='service'
         * @protected
         */
        workerId: 'service'
    }}
}

Neo.applyClassConfig(ServiceWorker);

let instance = Neo.create(ServiceWorker);

Neo.applyToGlobalNs(instance);

export default instance;
