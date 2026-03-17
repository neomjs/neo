import Base            from '../core/Base.mjs';
import ClassSystemUtil from '../util/ClassSystem.mjs';

/**
 * @class Neo.data.Pipeline
 * @extends Neo.core.Base
 *
 * @summary The central orchestrator for data transformation and remote execution.
 *
 * The Pipeline manages the flow of data from a `Connection`, through a `Parser`,
 * and an optional `Normalizer`. Crucially, it abstracts the execution boundary
 * (App Worker vs. Data Worker). When `workerExecution: 'data'` is used, this App Worker
 * Pipeline acts as a proxy, holding the configs and delegating the actual execution
 * to a counterpart Pipeline inside the Data Worker via IPC.
 */
class Pipeline extends Base {
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
         * The connection configuration or instance (e.g., Fetch, WebSocket, Rpc).
         * @member {Object|Neo.data.connection.Base|null} connection_=null
         * @reactive
         */
        connection_: null,
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

        let me = this;

        if (me.workerExecution === 'data') {
            me.initRemoteExecution();
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
        oldValue?.destroy();

        if (value && this.workerExecution === 'app') {
            return ClassSystemUtil.beforeSetInstance(value, null, {
                pipeline: this
            });
        }

        return value;
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
            });
        }

        return value;
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
        oldValue?.destroy();

        if (value && this.workerExecution === 'app') {
            return ClassSystemUtil.beforeSetInstance(value, null, {
                pipeline: this
            });
        }

        return value;
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
            });
        }

        me.connection?.destroy?.();
        me.parser?.destroy?.();
        me.normalizer?.destroy?.();

        super.destroy();
    }

    /**
     * Instantiates the counterpart Pipeline in the Data Worker if workerExecution is 'data'.
     * @protected
     */
    initRemoteExecution() {
        let me = this;

        if (!Neo.worker.Data) {
            console.error('Data Worker is not available for remote execution', me);
            return;
        }

        // We only send the configs, not instances
        let remoteConfig = {
            className      : me.className,
            connection     : me.serializeConfig(me._connection),
            normalizer     : me.serializeConfig(me._normalizer),
            parser         : me.serializeConfig(me._parser),
            workerExecution: 'app' // The remote instance executes locally within its worker
        };

        Neo.worker.Data.createInstance({
            config: remoteConfig,
            path  : 'src/data/Pipeline.mjs'
        }).then(data => {
            if (data.success) {
                me.remoteId = data.id;
            }
        });
    }

    /**
     * Main data fetch operation.
     * @param {Object} params
     * @returns {Promise<Object|Array|null>}
     */
    async read(params = {}) {
        let me = this;

        if (me.workerExecution === 'data') {
            if (!me.remoteId) {
                // Wait briefly if remote instantiation is still pending
                await me.timeout(50);
                if (!me.remoteId) {
                    console.error('Remote Pipeline ID not established', me);
                    return null;
                }
            }

            return Neo.worker.Data.promiseMessage({
                action   : 'pipeline.execute',
                id       : me.remoteId,
                operation: 'read',
                params
            });
        } else {
            // Local execution flow
            if (!me.connection) {
                console.error('Pipeline requires a connection', me);
                return null;
            }

            // 1. Connection (e.g. fetch, WebSocket, Rpc) retrieves raw data/stream
            let rawData = await me.connection.read(params);

            if (!rawData) return null;

            let shapedData = rawData;

            // 2. Parser transforms raw data into JS objects
            if (me.parser) {
                shapedData = await me.parser.read(shapedData);
            }

            // 3. Normalizer flattens/structures the data for the Store
            if (me.normalizer) {
                shapedData = await me.normalizer.normalize(shapedData);
            }

            return shapedData;
        }
    }
}

export default Neo.setupClass(Pipeline);
