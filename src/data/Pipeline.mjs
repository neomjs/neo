import Base            from '../core/Base.mjs';
import ClassSystemUtil from '../util/ClassSystem.mjs';

/**
 * @summary The central orchestrator for data transformation and remote execution.
 *
 * The Pipeline manages the flow of data from a `Connection`, through a `Parser`,
 * and an optional `Normalizer`. Crucially, it abstracts the execution boundary
 * (App Worker vs. Data Worker). When `workerExecution: 'data'` is used, this App Worker
 * Pipeline acts as a proxy, holding the configs and delegating the actual execution
 * to a counterpart Pipeline inside the Data Worker via IPC.
 *
 * @class Neo.data.Pipeline
 * @extends Neo.core.Base
 */
class Pipeline extends Base {
    /**
     * True automatically applies the core.Observable mixin
     * @member {Boolean} observable=true
     * @static
     */
    static observable = true

    static config = {
        /**
         * @member {String} className='Neo.data.Pipeline'
         * @protected
         */
        className: 'Neo.data.Pipeline',
        /**
         * @member {String} ntype='pipeline'
         * @protected
         */
        ntype: 'pipeline',
        /**
         * The ID of the App Worker Pipeline instance (used when running inside the Data Worker).
         * @member {String|null} appPipelineId=null
         * @protected
         */
        appPipelineId: null,
        /**
         * The connection configuration or instance (e.g., Fetch, WebSocket, Rpc).
         * @member {Object|Neo.data.connection.Base|null} connection_=null
         * @reactive
         */
        connection_: null,
        /**
         * Internal flag to track if the remote instance is currently being created.
         * @member {Boolean} isRemoteConnecting=false
         * @protected
         */
        isRemoteConnecting: false,
        /**
         * The maximum number of attempts to establish/re-establish the remote pipeline instance.
         * @member {Number} maxRemoteRetries=3
         */
        maxRemoteRetries: 3,
        /**
         * The normalizer configuration or instance.
         * @member {Object|Neo.data.normalizer.Base|null} normalizer_=null
         * @reactive
         */
        normalizer_: null,
        /**
         * The parser configuration or instance.
         * @member {Object|Neo.data.parser.Base|null} parser_=null
         * @reactive
         */
        parser_: null,
        /**
         * @member {Object} remote
         * @protected
         */
        remote: {
            data: ['create', 'execute', 'read', 'update']
        },
        /**
         * The ID of the corresponding Pipeline instance in the remote worker.
         * @member {String|null} remoteId=null
         * @protected
         */
        remoteId: null,
        /**
         * The store that owns this pipeline (if any).
         * @member {Neo.data.Store|null} store=null
         */
        store: null,
        /**
         * Determines where the actual Connection, Parser, and Normalizer are instantiated and executed.
         * Valid values: 'app', 'data'
         * @member {String} workerExecution='app'
         */
        workerExecution: 'app'
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        if (this.workerExecution === 'data') {
            this.initRemoteExecution()
        }
    }

    /**
     * Executes a generic method via the connection.
     * @param {String} method
     * @param {Object} params
     * @param {Number} [attempt=1]
     * @returns {Promise<any>}
     */
    async execute(method, params = {}, attempt = 1) {
        let me                 = this,
            {maxRemoteRetries} = me;

        if (me.workerExecution === 'data') {
            if (!me.remoteId && !me.isDestroyed) {
                await me.initRemoteExecution();
            }

            if (me.isDestroyed) return null;

            try {
                const response = await me.remote.data.execute(method, params);

                if (response === null && attempt <= maxRemoteRetries) {
                    console.warn(`Pipeline: Remote execute returned null, retrying (attempt ${attempt}/${maxRemoteRetries})...`);
                    me.remoteId = null;
                    return me.execute(method, params, attempt + 1)
                }

                return response
            } catch (e) {
                if (attempt <= maxRemoteRetries) {
                    console.warn(`Pipeline: Remote execute failed, retrying (attempt ${attempt}/${maxRemoteRetries})...`, e);
                    me.remoteId = null;
                    return me.execute(method, params, attempt + 1)
                }
                console.error('Pipeline: Remote execute failed after maximum retries', e);
                return null
            }
        } else {
            let rawData;

            if (me.connection && me.connection.execute) {
                rawData = await me.connection.execute(method, params);
            } else if (me.connection && typeof me.connection[method] === 'function') {
                rawData = await me.connection[method](params);
            }

            if (!rawData) return null;

            let shapedData = rawData;

            if (me.parser) {
                if (typeof me.parser[method] === 'function') {
                    shapedData = await me.parser[method](shapedData)
                } else if (me.parser.read) {
                    shapedData = await me.parser.read(shapedData)
                }
            }

            if (me.normalizer) {
                if (typeof me.normalizer[method] === 'function') {
                    shapedData = await me.normalizer[method](shapedData)
                } else if (me.normalizer.normalize) {
                    shapedData = await me.normalizer.normalize(shapedData)
                }
            }

            return shapedData
        }
    }

    /**
     * Triggered before the connection config gets changed.
     * Instantiates the connection only if executing locally.
     * @param {Object|Neo.data.connection.Base|null} value
     * @param {Object|Neo.data.connection.Base|null} oldValue
     * @protected
     * @returns {Object|Neo.data.connection.Base|null}
     */
    beforeSetConnection(value, oldValue) {
        let me = this;

        if (oldValue) {
            oldValue.un('push', me.onConnectionPush, me);
            oldValue.destroy();
        }

        if (value && me.workerExecution === 'app') {
            value = ClassSystemUtil.beforeSetInstance(value, null, {
                pipeline: me
            });

            value.on('push', me.onConnectionPush, me);

            return value;
        }

        return value
    }

    /**
     * Triggered when the underlying connection receives unsolicited push data (e.g. WebSocket).
     * @param {Object} data
     * @protected
     */
    async onConnectionPush(data) {
        let me         = this,
            shapedData = data;

        if (me.parser?.read) {
            shapedData = await me.parser.read(shapedData);
        }

        if (me.normalizer?.normalize) {
            shapedData = await me.normalizer.normalize(shapedData);
        }

        if (me.appPipelineId) {
            Neo.currentWorker.sendMessage('app', {
                action: 'pipelinePush',
                data  : shapedData,
                id    : me.appPipelineId
            });
        } else {
            me.fire('push', shapedData);
        }
    }

    /**
     * Triggered before the normalizer config gets changed.
     * Instantiates the normalizer only if executing locally.
     * @param {Object|Neo.data.normalizer.Base|null} value
     * @param {Object|Neo.data.normalizer.Base|null} oldValue
     * @protected
     * @returns {Object|Neo.data.normalizer.Base|null}
     */
    beforeSetNormalizer(value, oldValue) {
        oldValue?.destroy();

        if (value && this.workerExecution === 'app') {
            return ClassSystemUtil.beforeSetInstance(value, null, {
                pipeline: this
            })
        }

        return value
    }

    /**
     * Triggered before the parser config gets changed.
     * Instantiates the parser only if executing locally.
     * @param {Object|Neo.data.parser.Base|null} value
     * @param {Object|Neo.data.parser.Base|null} oldValue
     * @protected
     * @returns {Object|Neo.data.parser.Base|null}
     */
    beforeSetParser(value, oldValue) {
        let me = this;

        if (oldValue) {
            oldValue.un({
                data    : me.onParserData,
                progress: me.onParserProgress,
                scope   : me
            });
            oldValue.destroy();
        }

        if (value && me.workerExecution === 'app') {
            if (typeof value.module === 'function' && !value.module.isClass) {
                return value;
            }

            value = ClassSystemUtil.beforeSetInstance(value, null, {
                pipeline: me
            });

            value.on({
                data    : me.onParserData,
                progress: me.onParserProgress,
                scope   : me
            });

            return value;
        }

        return value
    }

    /**
     * @param {Object} data
     * @protected
     */
    onParserData(data) {
        this.fire('data', data);
    }

    /**
     * @param {Object} data
     * @protected
     */
    onParserProgress(data) {
        this.fire('progress', data);
    }

    /**
     *
     */
    destroy() {
        let me = this;

        if (me.workerExecution === 'data' && me.remoteId) {
            Neo.worker.Data.sendMessage({
                action: 'destroyInstance',
                id    : me.remoteId
            })
        }

        me.connection?.destroy?.();
        me.parser    ?.destroy?.();
        me.normalizer?.destroy?.();

        super.destroy()
    }

    /**
     * Instantiates the counterpart Pipeline in the Data Worker if workerExecution is 'data'.
     * @protected
     * @returns {Promise<void>}
     */
    async initRemoteExecution() {
        let me = this;

        if (me.isRemoteConnecting) {
            return new Promise(resolve => me.on('remoteConnected', resolve, me, {once: true}))
        }

        me.isRemoteConnecting = true;

        // We only send the configs, not instances
        let remoteConfig = {
            appPipelineId  : me.id,
            className      : me.className,
            connection     : me.serializeConfig(me._connection),
            normalizer     : me.serializeConfig(me._normalizer),
            parser         : me.serializeConfig(me._parser),
            workerExecution: 'app' // The remote instance executes locally within its worker
        };

        try {
            // Pre-load required modules in the Data Worker using strictly scoped imports
            const modulesToLoad = [];

            if (remoteConfig.connection?.className) {
                modulesToLoad.push(Neo.worker.Data.loadDataModule({className: remoteConfig.connection.className}))
            }
            if (remoteConfig.normalizer?.className) {
                modulesToLoad.push(Neo.worker.Data.loadDataModule({className: remoteConfig.normalizer.className}))
            }
            if (remoteConfig.parser?.className) {
                modulesToLoad.push(Neo.worker.Data.loadDataModule({className: remoteConfig.parser.className}))
            }

            if (modulesToLoad.length > 0) {
                await Promise.all(modulesToLoad)
            }

            const data = await Neo.worker.Data.createInstance({
                config: remoteConfig,
                path  : 'src/data/Pipeline.mjs'
            });

            if (data.success) {
                me.remoteId = data.id;
                me.fire('remoteConnected', data.id)
            } else {
                console.error('Pipeline: Failed to create remote instance', data.error)
            }
        } catch (e) {
            console.error('Pipeline: IPC error during remote instantiation', e)
        } finally {
            me.isRemoteConnecting = false
        }
    }

    /**
     * Main data create operation.
     * @param {Object} params
     * @returns {Promise<Object|Array|null>}
     */
    async create(params = {}) {
        return this.executeRemoteOrLocal('create', params);
    }

    /**
     * Main data fetch operation.
     * Supports a self-healing retry loop for remote execution.
     * @param {Object} params
     * @param {Number} [attempt=1] Internal retry attempt tracker
     * @returns {Promise<Object|Array|null>}
     */
    async read(params = {}, attempt = 1) {
        let me                 = this,
            {maxRemoteRetries} = me;

        if (me.workerExecution === 'data') {
            if (!me.remoteId && !me.isDestroyed) {
                await me.initRemoteExecution();
            }

            if (me.isDestroyed) return null;

            try {
                const response = await me.remote.data.read(params);

                if (response === null && attempt <= maxRemoteRetries) {
                    // Potential remote instance loss or silent failure
                    console.warn(`Pipeline: Remote read returned null, retrying (attempt ${attempt}/${maxRemoteRetries})...`);
                    me.remoteId = null;
                    return me.read(params, attempt + 1)
                }

                return response
            } catch (e) {
                if (attempt <= maxRemoteRetries) {
                    console.warn(`Pipeline: Remote read failed, retrying (attempt ${attempt}/${maxRemoteRetries})...`, e);
                    me.remoteId = null;
                    return me.read(params, attempt + 1)
                }
                console.error('Pipeline: Remote read failed after maximum retries', e);
                return null
            }
        } else {
            // Local execution flow
            let rawData;

            // 1. Connection (e.g. fetch, WebSocket, Rpc) retrieves raw data/stream
            if (me.connection) {
                rawData = await me.connection.read(params);
                if (!rawData) return null;
            }

            let shapedData = rawData;

            // 2. Parser transforms raw data into JS objects
            if (me.parser) {
                shapedData = await me.parser.read(shapedData)
            }

            // 3. Normalizer flattens/structures the data for the Store
            if (me.normalizer) {
                shapedData = await me.normalizer.normalize(shapedData)
            }

            // Fire data event for the store to pick it up via pipeline.on('data', ...)
            // if it was parsed locally. For parser.Stream, the parser fires 'data' itself,
            // but we can ensure standard responses also trigger it or let the store handle it.
            // Actually, parser.Stream fires 'data', but Pipeline needs to relay it if we are encapsulating it.
            return shapedData
        }
    }

    /**
     * Main data update operation.
     * @param {Object} params
     * @returns {Promise<Object|Array|null>}
     */
    async update(params = {}) {
        return this.executeRemoteOrLocal('update', params);
    }

    /**
     * Helper method to execute generic pipeline operations.
     * @param {String} operation 'create', 'update'
     * @param {Object} params
     * @returns {Promise<Object|Array|null>}
     * @protected
     */
    async executeRemoteOrLocal(operation, params = {}) {
        let me = this;

        if (me.workerExecution === 'data') {
            if (!me.remoteId && !me.isDestroyed) {
                await me.initRemoteExecution();
            }

            if (me.isDestroyed) return null;

            return await me.remote.data[operation](params);
        } else {
            let rawData;

            if (me.connection && me.connection[operation]) {
                rawData = await me.connection[operation](params);
                if (!rawData) return null;
            }

            let shapedData = rawData;

            if (me.parser && me.parser[operation]) {
                shapedData = await me.parser[operation](shapedData)
            }

            if (me.normalizer && me.normalizer[operation]) {
                shapedData = await me.normalizer[operation](shapedData)
            }

            return shapedData
        }
    }
    /**
     * Serializes the instance into a JSON-compatible object for the Neural Link.
     * @returns {Object}
     */
    toJSON() {
        let me = this;

        return {
            ...super.toJSON(),
            connection     : me.connection?.toJSON?.() || me._connection,
            normalizer     : me.normalizer?.toJSON?.() || me._normalizer,
            parser         : me.parser?.toJSON?.()     || me._parser,
            remoteId       : me.remoteId,
            workerExecution: me.workerExecution
        }
    }
}

export default Neo.setupClass(Pipeline);
