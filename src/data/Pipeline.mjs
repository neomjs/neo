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
         * Reuse completed shaped reads in this executing Pipeline. Configure at construction for Data-worker
         * execution; the proxy forwards this option, while its counterpart owns the cached snapshots.
         * Streaming reads and unsupported data values remain uncached. An explicit Store refresh uses
         * `await store.pipeline.clearCache()` before `store.load()`; repeated load() otherwise reuses the read.
         * @member {Boolean} cache=false
         */
        cache: false,
        /**
         * Absolute lifetime in milliseconds from successful read completion. Zero retains entries until
         * invalidation or destruction. Configure at construction for Data-worker execution.
         * @member {Number} cacheTTL=0
         */
        cacheTTL: 0,
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
         * Log completed telemetry through Logger in the App realm. Requires {@link #telemetry};
         * the output contains metrics, never connection parameters, data or error messages.
         * @member {Boolean} logTelemetry=false
         */
        logTelemetry: false,
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
            data: ['clearCache', 'create', 'execute', 'profile', 'read', 'update']
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
         * Emit one `telemetry` event per executed attempt, preserving all data results and events.
         * Stage timestamps use the executing realm's performance clock. Bytes are measured only
         * for strings and binary values; arrays expose record counts, other sizes remain null.
         * Configure this at construction for Data-worker pushes. Request calls capture their choice
         * before awaiting remote setup, so a later flag change cannot change the result carrier.
         * @member {Boolean} telemetry=false
         */
        telemetry: false,
        /**
         * Determines where the actual Connection, Parser, and Normalizer are instantiated and executed.
         * Valid values: 'app', 'data'
         * @member {String} workerExecution='app'
         */
        workerExecution: 'app'
    }

    /**
     * Private completed snapshots and pending-read identities.
     * @member {Map} readCacheEntries
     * @protected
     */
    readCacheEntries = new Map()

    /**
     * @summary Validates the cache lifetime before construction and retains the existing counterpart setup.
     * @param {Object} [config={}]
     */
    construct(config = {}) {
        const ttl = config.cacheTTL === undefined ? this.cacheTTL : config.cacheTTL;
        if (!Number.isFinite(ttl) || ttl < 0) throw new RangeError('Pipeline cacheTTL must be finite and nonnegative');

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
        return this.executeRemoteOrLocal('execute', params, attempt, method)
    }

    /**
     * @summary Replaces the owned connection and invalidates reads shaped by the previous stage.
     * Triggered before the connection config gets changed.
     * Instantiates the connection only if executing locally.
     * @param {Object|Neo.data.connection.Base|null} value
     * @param {Object|Neo.data.connection.Base|null} oldValue
     * @protected
     * @returns {Object|Neo.data.connection.Base|null}
     */
    beforeSetConnection(value, oldValue) {
        let me = this;

        me.invalidateReadCache();

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
        let   me         = this, observation;
        const shapedData = me.telemetry
            ? (observation = await me.profile({operation: 'push', params: data})).result
            : await me.runLocal('push', data);

        if (me.appPipelineId) {
            Neo.currentWorker.sendMessage('app', {
                action: 'pipelinePush',
                data  : shapedData,
                id    : me.appPipelineId
            });
        } else {
            me.fire('push', shapedData);
        }
        observation && me.publishTelemetry(observation.telemetry)
    }

    /**
     * @summary Replaces the owned normalizer and invalidates its completed read snapshots.
     * Triggered before the normalizer config gets changed.
     * Instantiates the normalizer only if executing locally.
     * @param {Object|Neo.data.normalizer.Base|null} value
     * @param {Object|Neo.data.normalizer.Base|null} oldValue
     * @protected
     * @returns {Object|Neo.data.normalizer.Base|null}
     */
    beforeSetNormalizer(value, oldValue) {
        this.invalidateReadCache();
        oldValue?.destroy();

        if (value && this.workerExecution === 'app') {
            return ClassSystemUtil.beforeSetInstance(value, null, {
                pipeline: this
            })
        }

        return value
    }

    /**
     * @summary Replaces the owned parser, invalidating its snapshots and event subscriptions.
     * Triggered before the parser config gets changed.
     * Instantiates the parser only if executing locally.
     * @param {Object|Neo.data.parser.Base|null} value
     * @param {Object|Neo.data.parser.Base|null} oldValue
     * @protected
     * @returns {Object|Neo.data.parser.Base|null}
     */
    beforeSetParser(value, oldValue) {
        let me = this;

        me.invalidateReadCache();

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
     * @summary Preserves progressive data delivery instead of caching its summary terminal.
     * @param {Object} data
     * @protected
     */
    onParserData(data) {
        this.invalidateReadCache();
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
     * @summary Releases the remote counterpart through the worker transport and disposes owned stages.
     */
    destroy() {
        let me = this;

        me.invalidateReadCache();

        if (me.workerExecution === 'data' && me.remoteId) {
            Neo.currentWorker.sendMessage('data', {
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
     * @summary Instantiates the counterpart Pipeline in the Data Worker if workerExecution is 'data'.
     * Destruction during preload prevents creation; a late creation reply disposes its counterpart
     * without publishing state back onto the destroyed App instance.
     * @protected
     * @returns {Promise<void>}
     */
    async initRemoteExecution() {
        let me = this;

        if (me.isDestroyed) return;

        if (me.isRemoteConnecting) {
            return new Promise(resolve => me.on('remoteConnected', resolve, me, {once: true}))
        }

        me.isRemoteConnecting = true;

        // We only send the configs, not instances
        let remoteConfig = {
            appPipelineId  : me.id,
            cache          : me.cache,
            cacheTTL       : me.cacheTTL,
            className      : me.className,
            connection     : me.serializeConfig(me._connection),
            normalizer     : me.serializeConfig(me._normalizer),
            parser         : me.serializeConfig(me._parser),
            telemetry      : me.telemetry,
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

            if (me.isDestroyed) return;

            const data = await Neo.worker.Data.createInstance({
                config: remoteConfig,
                path  : 'src/data/Pipeline.mjs'
            });

            if (data.success) {
                if (me.isDestroyed) {
                    Neo.currentWorker.sendMessage('data', {action: 'destroyInstance', id: data.id});
                    return
                }

                me.remoteId = data.id;
                me.fire('remoteConnected', data.id)
            } else {
                console.error('Pipeline: Failed to create remote instance', data.error)
            }
        } catch (e) {
            console.error('Pipeline: IPC error during remote instantiation', e)
        } finally {
            if (!me.isDestroyed) me.isRemoteConnecting = false
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
        return this.executeRemoteOrLocal('read', params, attempt)
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
     * @summary Routes an operation with its existing retry policy and an invocation-selected carrier.
     * @param {String} operation 'create', 'execute', 'read' or 'update'
     * @param {Object} params
     * @param {Number} [attempt=1]
     * @param {String} [method=operation] Business method for generic execution.
     * @returns {Promise<Object|Array|null>}
     * @protected
     */
    async executeRemoteOrLocal(operation, params = {}, attempt = 1, method = operation) {
        const me = this, profiled = me.telemetry, {maxRemoteRetries} = me;

        if (me.workerExecution === 'data') {
            if (!me.remoteId && !me.isDestroyed) {
                await me.initRemoteExecution();
            }

            if (me.isDestroyed) return null;

            const retryable = operation === 'read' || operation === 'execute';
            const retry     = () => operation === 'read' ? me.read(params, attempt + 1) : me.execute(method, params, attempt + 1);
            try {
                const response = profiled
                    ? await me.remote.data.profile({operation, params, method})
                    : await me.remote.data[operation](operation === 'execute' ? [method, params] : params);
                const result = profiled && response !== null ? response.result : response;
                if (profiled && response !== null) me.publishTelemetry(response.telemetry);
                if (retryable && result === null && attempt <= maxRemoteRetries) {
                    console.warn(`Pipeline: Remote ${operation} returned null, retrying (attempt ${attempt}/${maxRemoteRetries})...`);
                    me.remoteId = null;
                    return retry()
                }
                return result
            } catch (error) {
                if (!retryable) throw error;
                if (attempt <= maxRemoteRetries) {
                    console.warn(`Pipeline: Remote ${operation} failed, retrying (attempt ${attempt}/${maxRemoteRetries})...`, error);
                    me.remoteId = null;
                    return retry()
                }
                console.error(`Pipeline: Remote ${operation} failed after maximum retries`, error);
                return null
            }
        }

        if (!profiled) return me.runLocal(operation, params, method);
        const response = await me.profile({operation, params, method});
        me.publishTelemetry(response.telemetry);
        return response.result
    }

    /**
     * @summary Applies local read-cache policy around the existing stage policies and data carrier.
     * @param {String} operation
     * @param {*} params
     * @param {String} [method=operation]
     * @param {Object|null} [telemetry=null]
     * @returns {Promise<*>}
     * @protected
     */
    async runLocal(operation, params, method = operation, telemetry = null) {
        const me = this, Stream = Neo.ns('Neo.data.parser.Stream', false);

        if (operation === 'read' && me.cache && !(Stream && me.parser instanceof Stream)) {
            return me.readCached(params, method, telemetry)
        }

        if (operation !== 'read') me.invalidateReadCache();
        try {
            return await me.runStages(operation, params, method, telemetry)
        } finally {
            if (operation !== 'read' && !me.isDestroyed) me.invalidateReadCache()
        }
    }

    /**
     * @summary Runs the existing connection, parser and normalizer policies without a cache wrapper.
     * @param {String} operation
     * @param {*} params
     * @param {String} [method=operation]
     * @param {Object|null} [telemetry=null]
     * @returns {Promise<*>}
     * @protected
     */
    async runStages(operation, params, method = operation, telemetry = null) {
        const me = this, {connection} = me;
        let invoke, rawData = operation === 'push' ? params : undefined;
        if (operation !== 'push' && connection) {
            if (operation === 'execute') {
                if (connection.execute) invoke = () => connection.execute(method, params);
                else if (typeof connection[method] === 'function') invoke = () => connection[method](params)
            } else if (operation === 'read' || connection[operation]) invoke = () => connection[operation](params)
        }
        if (invoke) rawData = await me.measureStage(telemetry, 'connection', invoke);
        if (telemetry) telemetry.rawSize = me.getTelemetrySize(rawData);
        if (!rawData && (invoke || operation === 'execute')) return null;

        let   shapedData   = rawData;
        const {parser}     = me;
        const parserMethod = operation === 'execute' && typeof parser?.[method] === 'function' ? method
            : ['read', 'execute', 'push'].includes(operation) ? 'read' : operation;
        if (parser && (operation === 'read' || parser[parserMethod])) {
            shapedData = await me.measureStage(telemetry, 'parser', () => parser[parserMethod](shapedData))
        }
        if (telemetry) telemetry.parsedSize = me.getTelemetrySize(shapedData);
        const {normalizer}     = me;
        const normalizerMethod = operation === 'execute' && typeof normalizer?.[method] === 'function' ? method
            : ['read', 'execute', 'push'].includes(operation) ? 'normalize' : operation;
        if (normalizer && (operation === 'read' || normalizer[normalizerMethod])) {
            shapedData = await me.measureStage(telemetry, 'normalizer', () => normalizer[normalizerMethod](shapedData))
        }
        return shapedData
    }

    /**
     * @summary Invalidates local reads and the existing Data counterpart without creating a cold counterpart.
     * Pending reads cannot publish after their entry is invalidated.
     * @returns {Promise<Number>} The number of entries removed in the executing Pipeline.
     */
    async clearCache() {
        const count = this.invalidateReadCache();
        return this.workerExecution === 'data' && this.remoteId && !this.isDestroyed
            ? this.remote.data.clearCache() : count
    }

    /**
     * @summary Drops completed and pending read identities at an owning lifecycle boundary.
     * @returns {Number}
     * @protected
     */
    invalidateReadCache() {
        const entries = this.readCacheEntries, count = entries.size;
        entries.clear();
        return count
    }

    /**
     * @summary Keys plain request data without invoking accessors or user toJSON methods; unsupported values miss.
     * @param {*} value
     * @returns {String|null}
     * @protected
     */
    getReadCacheKey(value) {
        const path   = new Set();
        const encode = item => {
            if (item === null) return ['null'];
            const type = typeof item;
            if (type === 'undefined') return ['undefined'];
            if (type === 'string' || type === 'boolean' || type === 'bigint') return [type, String(item)];
            if (type === 'number' && Number.isFinite(item)) return ['number', Object.is(item, -0) ? '-0' : String(item)];
            if (type !== 'object' || path.has(item)) throw new Error('unsupported cache key');
            if (Object.getPrototypeOf(item) === Date.prototype) {
                if (Reflect.ownKeys(item).length) throw new Error('decorated date');
                const time = Date.prototype.getTime.call(item);
                if (!Number.isFinite(time)) throw new Error('invalid date');
                return ['date', time]
            }
            const array = Array.isArray(item), prototype = Object.getPrototypeOf(item);
            if (array && prototype !== Array.prototype) throw new Error('behavioral array');
            if (!array && prototype !== Object.prototype && prototype !== null) throw new Error('unsupported cache key');
            path.add(item);
            const descriptors = Object.getOwnPropertyDescriptors(item), keys = Reflect.ownKeys(descriptors);
            if (keys.some(key => typeof key === 'symbol')) throw new Error('unsupported cache key');
            const values = keys.filter(key => !(array && key === 'length')).sort().map(key => {
                const descriptor = descriptors[key];
                if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) throw new Error('unsupported cache property');
                return [key, encode(descriptor.value)]
            });
            path.delete(item);
            return [array ? 'array' : prototype === null ? 'null-object' : 'object', array ? item.length : null, values]
        };
        try {return JSON.stringify(encode(value))} catch {return null}
    }

    /**
     * @summary Copies plain shaped data, preserving supported intrinsic values and refusing behavioral instances.
     * @param {*} value
     * @returns {*}
     * @protected
     */
    cloneReadCacheValue(value) {
        const seen     = new Set();
        const validate = item => {
            if (item === null || !['object', 'function', 'symbol'].includes(typeof item)) return;
            if (typeof item !== 'object') throw new Error('behavioral cache value');
            if (seen.has(item)) return;
            const prototype = Object.getPrototypeOf(item), array = Array.isArray(item);
            if (prototype === Date.prototype || prototype === ArrayBuffer.prototype) {
                if (Reflect.ownKeys(item).length) throw new Error('decorated intrinsic');
                if (prototype === Date.prototype) Date.prototype.getTime.call(item);
                else Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength').get.call(item);
                return
            }
            if (array && prototype !== Array.prototype) throw new Error('behavioral array');
            if (!array && prototype !== Object.prototype) throw new Error('unsupported cache value');
            seen.add(item);
            for (const key of Reflect.ownKeys(item)) {
                if (array && key === 'length') continue;
                const descriptor = Object.getOwnPropertyDescriptor(item, key);
                if (typeof key === 'symbol' || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
                    throw new Error('behavioral cache value')
                }
                validate(descriptor.value)
            }
        };
        validate(value);
        return structuredClone(value)
    }

    /**
     * @summary Reuses completed reads; entry identity fences clears, replacement stages and out-of-order completions.
     * @param {Object} params
     * @param {String} method
     * @param {Object|null} telemetry
     * @returns {Promise<*>}
     * @protected
     */
    async readCached(params, method, telemetry) {
        const me = this, key = me.getReadCacheKey([me.connection?.url, params]), entries = me.readCacheEntries, now = Date.now();
        if (key === null) return me.runStages('read', params, method, telemetry);
        for (const [entryKey, value] of entries) if (value.ready && value.expiresAt <= now) entries.delete(entryKey);
        const previous = entries.get(key);
        if (previous?.ready) return me.cloneReadCacheValue(previous.value);

        const entry = {};
        entries.set(key, entry);
        try {
            const result = await me.runStages('read', params, method, telemetry);
            if (!me.isDestroyed && me.cache && entries.get(key) === entry && result != null) {
                try {
                    if (Object.getOwnPropertyDescriptor(Object(result), 'success')?.value === false) {
                        entries.delete(key)
                    } else {
                        const snapshot = me.cloneReadCacheValue(result);
                        if (!me.isDestroyed && me.cache && entries.get(key) === entry) {
                            entry.value = snapshot;
                            entry.expiresAt = me.cacheTTL ? Date.now() + me.cacheTTL : Infinity;
                            entry.ready = true
                        }
                    }
                } catch {if (entries.get(key) === entry) entries.delete(key)}
            } else if (entries.get(key) === entry) entries.delete(key);
            return result
        } catch (error) {
            if (entries.get(key) === entry) entries.delete(key);
            throw error
        }
    }

    /**
     * @summary Returns a known profiling carrier for one local attempt, including remote null results.
     * Failed attempts publish their metrics separately and rethrow the original rejection.
     * @param {Object} request
     * @param {String} request.operation
     * @param {*} request.params
     * @param {String} [request.method=request.operation]
     * @returns {Promise<Object>}
     * @protected
     */
    async profile({operation, params, method = operation}) {
        if (!['create', 'execute', 'read', 'update', 'push'].includes(operation)) throw new Error('Invalid Pipeline operation');
        const telemetry = {
            id: crypto.randomUUID(), pipelineId: this.appPipelineId || this.id,
            operation, status: 'fulfilled',
            connectionStart: null, connectionEnd: null, parserStart: null, parserEnd: null,
            normalizerStart: null, normalizerEnd: null,
            rawSize        : {bytes: null, records: null}, parsedSize: {bytes: null, records: null}
        };
        try {
            return {result: await this.runLocal(operation, params, method, telemetry), telemetry}
        } catch (error) {
            telemetry.status = 'rejected';
            this.publishTelemetry(telemetry);
            throw error
        }
    }

    /** @summary Observes one asynchronous stage, keeping skipped stages and unavailable clocks null. */
    measureStage(telemetry, stage, invoke) {
        if (!telemetry) return invoke();
        const now = () => {try {return performance.now()} catch {return null}};
        telemetry[stage + 'Start'] = now();
        return (async () => {
            try {return await invoke()}
            finally {telemetry[stage + 'End'] = now()}
        })()
    }

    /**
     * @summary Measures only directly observable bytes or record counts; never serializes or reads a stream.
     * @param {*} value
     * @returns {Object} Unknown dimensions remain null, including failed observations.
     * @protected
     */
    getTelemetrySize(value) {
        try {
            if (typeof value === 'string') return {bytes: new TextEncoder().encode(value).byteLength, records: null};
            if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return {bytes: value.byteLength, records: null};
            if (Array.isArray(value)) return {bytes: null, records: value.length};
            const data = value && Object.getOwnPropertyDescriptor(value, 'data');
            if (data && Array.isArray(data.value)) return {bytes: null, records: data.value.length}
        } catch {}
        return {bytes: null, records: null}
    }

    /**
     * @summary Emits metric-only observations without letting an observer or Logger change a business terminal.
     * Data-side failures and pushes use the existing App-worker notification boundary.
     * @param {Object} telemetry
     * @protected
     */
    publishTelemetry(telemetry) {
        try {
            const sample = Object.freeze({...telemetry,
                rawSize: Object.freeze({...telemetry.rawSize}), parsedSize: Object.freeze({...telemetry.parsedSize})});
            if (this.appPipelineId) {
                Neo.currentWorker.sendMessage('app', {action: 'pipelineTelemetry', id: this.appPipelineId, data: sample})
            } else {
                // Observable adds its source field; keep that event carrier separate from logging.
                try {this.fire('telemetry', {...sample})} catch {}
                if (this.logTelemetry) {
                    import('../util/Logger.mjs').then(({default: Logger}) => {
                        Logger.log({msg: 'Pipeline telemetry', data: sample})
                    }).catch(() => {})
                }
            }
        } catch {}
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
