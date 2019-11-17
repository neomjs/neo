import Neo                       from '../Neo.mjs';
import {default as StoreManager} from '../manager/Store.mjs';
import Util                      from '../core/Util.mjs';
import Worker                    from './Worker.mjs';
import Xhr                       from '../Xhr.mjs';

/**
 * The Data worker is responsible to handle all of the communication to the backend (e.g. Ajax-calls).
 * See the tutorials for further infos.
 * @class Neo.worker.Data
 * @extends Neo.worker.Worker
 * @singleton
 */
class Data extends Worker {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.worker.Data'
         * @private
         */
        className: 'Neo.worker.Data',
        /**
         * @member {String} ntype='data-worker'
         * @private
         */
        ntype: 'data-worker',
        /**
         * @member {Boolean} singleton=true
         * @private
         */
        singleton: true,
        /**
         * @member {String} workerId='data'
         * @private
         */
        workerId: 'data'
    }}

    /**
     *
     */
    onLoad() {
        console.log('worker.Data onLoad');
    }
}

Neo.applyClassConfig(Data);

let instance = Neo.create(Data);

Neo.applyToGlobalNs(instance);

export default instance;