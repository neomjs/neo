import Neo          from '../Neo.mjs';
import Base         from './Base.mjs';
import Compare      from '../core/Compare.mjs';
import Fetch        from '../Fetch.mjs';
import StoreManager from '../manager/Store.mjs';
import Util         from '../core/Util.mjs';
import Xhr          from '../Xhr.mjs';

/**
 * The Data worker is responsible to handle all of the communication to the backend (e.g. Ajax-calls).
 * See the tutorials for further infos.
 * @class Neo.worker.Data
 * @extends Neo.worker.Base
 * @singleton
 */
class Data extends Base {
    /**
     * @member {Boolean} remotesManagerLoaded=false
     * @protected
     */
    remotesManagerLoaded = false

    static getConfig() {return {
        /**
         * @member {String} className='Neo.worker.Data'
         * @protected
         */
        className: 'Neo.worker.Data',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true,
        /**
         * @member {String} workerId='data'
         * @protected
         */
        workerId: 'data'
    }}

    /**
     *
     */
    afterConnect() {
        let me             = this,
            channel        = new MessageChannel(),
            {port1, port2} = channel;

        port1.onmessage = me.onMessage.bind(me);

        me.sendMessage('app', {action: 'registerPort', transfer: port2}, [port2]);

        me.channelPorts.app = port1;
    }

    /**
     *
     */
    onLoad() {
        console.log('worker.Data onLoad');
    }

    /**
     * @param {Object} msg
     * @param {Object} msg.data the API content
     */
    onRegisterApi(msg) {
        console.log('onRegisterApi', msg.data);
    }

    /**
     * @param {Object} msg
     */
    onRegisterNeoConfig(msg) {
        super.onRegisterNeoConfig(msg);

        Neo.config.remotesApiUrl && import('../manager/RemotesApi.mjs').then(module => {
            this.remotesManagerLoaded = true
        })
    }

    /**
     * @param {Object} msg
     */
    async onRpc(msg) {
        console.log('onRpc', msg);

        let me = this,
            response;

        if (!me.remotesManagerLoaded) {
            // todo: we could store calls which arrive too early and pass them to the manager once it is ready
            console.warn('manager.RemotesApi not loaded yet', msg);

            me.reject(msg);
        } else {
            response = await Neo.manager.RemotesApi.onMessage(msg);

            me.resolve(msg, response);
        }
    }
}

Neo.applyClassConfig(Data);

let instance = Neo.create(Data);

Neo.applyToGlobalNs(instance);

export default instance;
