import Neo   from '../Neo.mjs';
import Base  from './Base.mjs';
import Fetch from '../Fetch.mjs';
import Xhr   from '../Xhr.mjs';

/**
 * The Data worker is responsible to handle all the communication to the backend (e.g. Ajax-calls).
 * See the tutorials for further infos.
 * @class Neo.worker.Data
 * @extends Neo.worker.Base
 * @singleton
 */
class Data extends Base {
    static config = {
        /**
         * @member {String} className='Neo.worker.Data'
         * @protected
         */
        className: 'Neo.worker.Data',
        /**
         * Remote method access for other workers
         * @member {Object} remote
         * @protected
         */
        remote: {
            app: [
                'createInstance',
                'loadModule'
            ]
        },
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * @member {Boolean} rpcApiManagerLoaded=false
     * @protected
     */
    rpcApiManagerLoaded = false
    /**
     * @member {Boolean} rpcMessageManagerLoaded=false
     * @protected
     */
    rpcMessageManagerLoaded = false
    /**
     * @member {String} workerId='data'
     * @protected
     */
    workerId = 'data'

    /**
     *
     */
    afterConnect() {
        let me             = this,
            channel        = new MessageChannel(),
            {port1, port2} = channel;

        port1.onmessage = me.onMessage.bind(me);

        me.sendMessage('app', {action: 'registerPort', transfer: port2}, [port2]);

        me.channelPorts.app = port1
    }

    /**
     * @summary Remotely loads an ES module and creates an instance of it inside the Data Worker.
     * This is crucial for avoiding the loading of heavy data-shaping logic (like Parsers/Normalizers)
     * inside the App Worker.
     *
     * @param {Object} msg
     * @param {Object} msg.config The configuration object to pass to the new instance.
     * @param {String} msg.path The path to the module to load.
     * @returns {Promise<Object>} {success: true, id} or {success: false, error}
     */
    async createInstance({config, path}) {
        try {
            let module = await import(
                /* webpackExclude: /(?:\/|\\)(dist|node_modules)\/(?!neo.mjs)/ */
                /* webpackMode: "lazy" */
                `../../${path}`
            );

            // module.default is the Neo class
            let instance = Neo.create(module.default, config);

            // Keep a reference to prevent garbage collection and allow future interactions
            this.instances ??= {};
            this.instances[instance.id] = instance;

            return {success: true, id: instance.id}
        } catch (e) {
            console.error(`Data Worker: Failed to create instance for ${path}`, e);
            return {success: false, path, error: e.message}
        }
    }

    /**
     * @summary Remotely loads an ES module into the Data Worker.
     * This method uses a scoped dynamic import to ensure Webpack only bundles
     * relevant modules.
     *
     * @param {Object} data
     * @param {String} data.path The path to the module to load.
     * @returns {Promise<Object>} {success: true, path} or {success: false, path, error}
     */
    async loadModule({path}) {
        try {
            await import(
                /* webpackExclude: /(?:\/|\\)(dist|node_modules)\/(?!neo.mjs)/ */
                /* webpackMode: "lazy" */
                `../../${path}`
            );
            return {success: true, path}
        } catch (e) {
            console.error(`Data Worker: Failed to load module ${path}`, e);
            return {success: false, path, error: e.message}
        }
    }

    /**
     *
     */
    onLoad() {
        console.log('worker.Data onLoad');
    }

    /**
     * @param {Object} msg
     */
    async onPipelineExecute(msg) {
        let me       = this,
            instance = me.instances?.[msg.id],
            response;

        if (!instance) {
            console.error('Data Worker: Pipeline instance not found', msg.id);
            me.reject(msg)
        } else {
            response = await instance[msg.operation](msg.params);
            me.resolve(msg, response)
        }
    }

    /**
     * @param {Object} msg
     * @param {Object} msg.data the API content
     */
    onRegisterApi(msg) {
        import('../manager/rpc/Api.mjs').then(module => {
            module.default.registerApi(msg.data);
            this.rpcApiManagerLoaded = true
        })
    }

    /**
     * @param {Object} msg
     */
    onRegisterNeoConfig(msg) {
        super.onRegisterNeoConfig(msg);

        Neo.config.remotesApiUrl && import('../manager/rpc/Message.mjs').then(module => {
            this.rpcMessageManagerLoaded = true
        })
    }

    /**
     * @param {Object} msg
     */
    async onRpc(msg) {
        let me = this,
            response;

        if (!me.rpcMessageManagerLoaded) {
            // todo: we could store calls which arrive too early and pass them to the manager once it is ready
            console.warn('manager.RemotesApi not loaded yet', msg);

            me.reject(msg)
        } else {
            response = await Neo.manager.rpc.Message.onMessage(msg);

            me.resolve(msg, response)
        }
    }
}

export default Neo.setupClass(Data);
