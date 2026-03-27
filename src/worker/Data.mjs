import Neo      from '../Neo.mjs';
import Base     from './Base.mjs';
import Fetch    from '../Fetch.mjs';
import Instance from '../manager/Instance.mjs';
import Xhr      from '../Xhr.mjs';

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
                'loadDataModule',
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
        if (path.endsWith('.mjs')) {
            path = path.slice(0, -4)
        }

        try {
            let module = await import(
                /* webpackInclude: /(?:apps|docs\/app|examples|src\/data)\/.*\.mjs$/ */
                /* webpackExclude: /(?:\/|\\)(buildScripts|dist|node_modules(?:\/|\\)(?!neo\.mjs)|ai(?:\/|\\)|server\.mjs|devindex(?:\/|\\)services)/ */
                /* webpackMode: "lazy" */
                `../../${path}.mjs`
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
     * @summary Dynamically loads a data module into the Data Worker using folder-scoped imports.
     * This restricts Webpack's context to specific sub-folders (connection, parser, normalizer),
     * preventing bundle bloat.
     *
     * @param {Object} msg
     * @param {String} msg.className The fully qualified class name (e.g., 'Neo.data.connection.Fetch')
     * @returns {Promise<Object>} {success: true, className} or {success: false, error}
     */
    async loadDataModule({className}) {
        const parts = className.split('.');

        if (parts[0] !== 'Neo' || parts[1] !== 'data') {
            return {success: false, error: 'Not a Neo.data class'};
        }

        const
            type = parts[2],
            name = parts.slice(3).join('/');

        try {
            switch (type) {
                case 'connection':
                    await import(
                        /* webpackInclude: /src\/data\/connection\/.*\.mjs$/ */
                        /* webpackExclude: /(?:\/|\\)(buildScripts|dist|node_modules(?:\/|\\)(?!neo\.mjs)|ai(?:\/|\\)|server\.mjs|devindex(?:\/|\\)services)/ */
                        /* webpackMode: "lazy" */
                        `../data/connection/${name}.mjs`
                    );
                    break;
                case 'parser':
                    await import(
                        /* webpackInclude: /src\/data\/parser\/.*\.mjs$/ */
                        /* webpackExclude: /(?:\/|\\)(buildScripts|dist|node_modules(?:\/|\\)(?!neo\.mjs)|ai(?:\/|\\)|server\.mjs|devindex(?:\/|\\)services)/ */
                        /* webpackMode: "lazy" */
                        `../data/parser/${name}.mjs`
                    );
                    break;
                case 'normalizer':
                    await import(
                        /* webpackInclude: /src\/data\/normalizer\/.*\.mjs$/ */
                        /* webpackExclude: /(?:\/|\\)(buildScripts|dist|node_modules(?:\/|\\)(?!neo\.mjs)|ai(?:\/|\\)|server\.mjs|devindex(?:\/|\\)services)/ */
                        /* webpackMode: "lazy" */
                        `../data/normalizer/${name}.mjs`
                    );
                    break;
                default:
                    return {success: false, error: `Unsupported data module type: ${type}`};
            }
            return {success: true, className};
        } catch (e) {
            console.error(`Data Worker: Failed to load data module ${className}`, e);
            return {success: false, className, error: e.message}
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
        if (path.endsWith('.mjs')) {
            path = path.slice(0, -4)
        }

        try {
            await import(
                /* webpackInclude: /(?:apps|docs\/app|examples|src\/data)\/.*\.mjs$/ */
                /* webpackExclude: /(?:\/|\\)(buildScripts|dist|node_modules(?:\/|\\)(?!neo\.mjs)|ai(?:\/|\\)|server\.mjs|devindex(?:\/|\\)services)/ */
                /* webpackMode: "lazy" */
                `../../${path}.mjs`
            );
            return {success: true, path}
        } catch (e) {
            console.error(`Data Worker: Failed to load module ${path}`, e);
            return {success: false, path, error: e.message}
        }
    }

    /**
     * @param {Object} msg
     */
    onDestroyInstance(msg) {
        let instance = this.instances?.[msg.id];

        if (instance) {
            instance.destroy();
            delete this.instances[msg.id];
        }

        this.resolve(msg);
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
