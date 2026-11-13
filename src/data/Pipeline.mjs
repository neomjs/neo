import Base             from '../core/Base.mjs';
import ClassSystemUtil  from '../util/ClassSystem.mjs';
import InterceptorChain from './interceptor/Chain.mjs';
import {generateUUID}  from '../util/UUID.mjs';

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

    /** @member {Neo.data.interceptor.Chain|null} globalInterceptorChain @static @protected */
    static globalInterceptorChain = null

    /** @member {Promise|null} globalInterceptorChange @static @protected */
    static globalInterceptorChange = null

    /**
     * @summary Atomically replaces this executing realm's global handlers; an empty list clears them.
     * Existing operations retain their admitted chain. Await replacement before starting work that
     * requires it. App and Data realms each own their own copy of this class-level policy.
     * @param {Array} descriptors Neo classes or class/config descriptors.
     * @returns {Promise<Number>} The admitted handler count.
     * @static
     */
    static setGlobalInterceptors(descriptors) {
        const definitions = InterceptorChain.validateDescriptors(descriptors),
              change      = (Pipeline.globalInterceptorChange || Promise.resolve()).catch(() => {}).then(async () => {
                  if (Neo.workerId === 'data') await Pipeline.preloadInterceptors(definitions, Neo.currentWorker);
                  const chain = definitions.length ? Neo.create(InterceptorChain, {descriptors: definitions}) : null;

                  try {
                      const lease = await chain?.acquire(), previous = Pipeline.globalInterceptorChain;
                      Pipeline.globalInterceptorChain = chain;
                      lease?.release();
                      previous?.retire();
                      return definitions.length
                  } catch (error) {
                      chain?.retire();
                      throw error
                  }
              });

        // Keep a failed registration visible to its caller without poisoning the next replacement.
        Pipeline.globalInterceptorChange = change.catch(() => {});
        return change
    }

    /**
     * @summary Preloads declared handler modules through the Data worker's production loader.
     * @param {Array} descriptors Serialized class/config descriptors.
     * @param {Object} [worker=Neo.worker.Data] Data worker or its remote facade.
     * @returns {Promise<Array>} Validated descriptors, with no live instances.
     * @static
     */
    static async preloadInterceptors(descriptors, worker=Neo.worker.Data) {
        const definitions = InterceptorChain.validateDescriptors(descriptors);

        for (const definition of definitions) {
            if (definition.modulePath) {
                const result = await worker.loadModule({path: definition.modulePath, className: definition.className});
                if (!result.success) throw new Error(result.error)
            }
        }
        return definitions
    }

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
         * Ordered local Neo interceptor descriptors. Globals run first. Supply modulePath for a
         * custom Data-worker class; only data options cross IPC. Use {@link #setInterceptors} for
         * awaited replacement after construction, rather than assigning this config directly.
         * @member {Array|null} interceptors=null
         */
        interceptors: null,
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
            data: ['clearCache', 'create', 'execute', 'profile', 'read', 'setInterceptors', 'update']
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

    /** @member {Neo.data.interceptor.Chain|null} interceptorChain @protected */
    interceptorChain = null
    /** @member {Promise|null} interceptorChange @protected */
    interceptorChange = null
    /** @member {Boolean} interceptorConfigured @protected */
    interceptorConfigured = true
    /** @member {Array|null} readCacheChains @protected */
    readCacheChains = null
    /** @member {Promise|null} pushTail @protected */
    pushTail = null
    /** @member {Promise<void>|null} remoteConnectionPromise @protected */
    remoteConnectionPromise = null
    /** @member {Error|null} remoteInitializationError @protected */
    remoteInitializationError = null

    /**
     * @summary Validates the cache lifetime before construction and retains the existing counterpart setup.
     * @param {Object} [config={}]
     */
    construct(config = {}) {
        const ttl = config.cacheTTL === undefined ? this.cacheTTL : config.cacheTTL;
        if (!Number.isFinite(ttl) || ttl < 0) throw new RangeError('Pipeline cacheTTL must be finite and nonnegative');
        const interceptors = config.interceptors === undefined ? this.interceptors : config.interceptors;
        if (interceptors != null) InterceptorChain.validateDescriptors(interceptors);

        super.construct(config);

        if (this.workerExecution === 'data') {
            this.initRemoteExecution()
        } else if (this.interceptors) {
            this.interceptorConfigured = false;
            this.setInterceptors(this.interceptors).catch(() => {})
        }
    }

    /**
     * @summary Replaces local handlers after readiness, preserving the old chain on loading/readiness failure.
     * Data proxies preload and update their counterpart; no handler instance is created in the proxy.
     * @param {Array} descriptors Neo classes or class/config descriptors; empty clears the chain.
     * @returns {Promise<Number>}
     */
    setInterceptors(descriptors) {
        const me     = this, definitions = InterceptorChain.validateDescriptors(descriptors),
              change = (me.interceptorChange || Promise.resolve()).catch(() => {}).then(async () => {
                  if (me.isDestroyed) throw new Error('Cannot configure a destroyed Pipeline');

                  if (me.workerExecution === 'data') {
                      if (!me.remoteId) await me.initRemoteExecution();
                      if (me.isDestroyed) throw new Error('Pipeline destroyed during interceptor loading');
                      if (!me.remoteId) throw new Error('Data-worker Pipeline could not be created');
                      const wire  = await Pipeline.preloadInterceptors(me.serializeConfig(definitions));
                      const count = await me.remote.data.setInterceptors([wire]);
                      if (!me.isDestroyed) me.interceptors = definitions.length ? definitions : null;
                      return count
                  }

                  const chain = definitions.length ? Neo.create(InterceptorChain, {descriptors: definitions}) : null;
                  try {
                      const lease = await chain?.acquire();
                      if (me.isDestroyed) {
                          lease?.release();
                          throw new Error('Pipeline destroyed during interceptor readiness')
                      }
                      const previous = me.interceptorChain;
                      me.interceptorChain = chain;
                      me.interceptorConfigured = true;
                      me.interceptors = definitions.length ? definitions : null;
                      me.invalidateReadCache();
                      lease?.release();
                      previous?.retire();
                      return definitions.length
                  } catch (error) {
                      chain?.retire();
                      throw error
                  }
              });

        me.interceptorChange = change;
        change.catch(() => {});
        return change
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
     * @summary Processes unsolicited connection data through the Pipeline's push stages.
     * Configured interception serializes arrivals. A failed push emits an `error` receipt and does
     * not poison the next arrival; destruction suppresses late data and error publication.
     * @param {Object} data
     * @returns {Promise<void>}
     * @protected
     */
    onConnectionPush(data) {
        const me = this, consume = async () => {
            if (me.isDestroyed) return;
            let observation;
            const shapedData = me.telemetry
                ? (observation = await me.profile({operation: 'push', params: data})).result
                : await me.runLocal('push', data);

            if (me.isDestroyed) return;
            if (me.appPipelineId) {
                Neo.currentWorker.sendMessage('app', {action: 'pipelinePush', data: shapedData, id: me.appPipelineId})
            } else me.fire('push', shapedData);
            observation && me.publishTelemetry(observation.telemetry)
        };

        if (!me.interceptors && !me.interceptorChain && !Pipeline.globalInterceptorChain) return consume();
        const pending = (me.pushTail || Promise.resolve()).catch(() => {}).then(consume);
        me.pushTail = pending;
        pending.catch(error => {
            if (!me.isDestroyed) me.publishPipelineEvent('error', {operation: 'push', message: error?.message || String(error)})
        });
        return pending
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
        if (!this.isDestroyed) {
            this.invalidateReadCache();
            this.publishPipelineEvent('data', data)
        }
    }

    /**
     * @summary Forwards streaming progress without publishing after owner destruction.
     * @param {Object} data
     * @protected
     */
    onParserProgress(data) {
        if (!this.isDestroyed) this.publishPipelineEvent('progress', data)
    }

    /**
     * @summary Delivers progressive rows, progress and push failures to the owning App Pipeline.
     * @param {String} event 'data', 'progress' or 'error'.
     * @param {*} data
     * @protected
     */
    publishPipelineEvent(event, data) {
        if (this.appPipelineId) {
            Neo.currentWorker.sendMessage('app', {
                action: 'pipelineEvent', event, data, id: this.appPipelineId
            })
        } else this.fire(event, data)
    }

    /**
     * @summary Releases the remote counterpart through the worker transport and disposes owned stages.
     */
    destroy() {
        let me = this;

        me.invalidateReadCache();
        me.interceptorChain?.retire();

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
    initRemoteExecution() {
        const me = this;
        if (me.isDestroyed) return Promise.resolve();
        if (me.remoteConnectionPromise) return me.remoteConnectionPromise;
        const pending = me.createRemoteExecution(), clear = () => {
            if (!me.isDestroyed && me.remoteConnectionPromise === pending) me.remoteConnectionPromise = null
        };
        me.remoteConnectionPromise = pending;
        pending.then(clear, clear);
        return pending
    }

    /**
     * @summary Performs one shared counterpart attempt, retaining failures for configured callers.
     * @returns {Promise<void>}
     * @protected
     */
    async createRemoteExecution() {
        const me = this;
        me.isRemoteConnecting = true;
        me.remoteInitializationError = null;

        try {
            const remoteConfig = {
                appPipelineId: me.id,
                cache        : me.cache, cacheTTL: me.cacheTTL, className: me.className,
                connection   : me.serializeConfig(me._connection),
                interceptors : me.interceptors
                    ? me.serializeConfig(InterceptorChain.validateDescriptors(me.interceptors)) : null,
                normalizer: me.serializeConfig(me._normalizer), parser: me.serializeConfig(me._parser),
                telemetry : me.telemetry, workerExecution: 'app'
            };
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
            if (remoteConfig.interceptors) {
                modulesToLoad.push(Pipeline.preloadInterceptors(remoteConfig.interceptors))
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
                if (!me.isDestroyed) me.remoteInitializationError = new Error(data.error);
                console.error('Pipeline: Failed to create remote instance', data.error)
            }
        } catch (e) {
            if (!me.isDestroyed) me.remoteInitializationError = e;
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
            if (me.interceptorChange) await me.interceptorChange.catch(() => {});
            if (!me.remoteId && !me.isDestroyed) {
                await me.initRemoteExecution();
            }

            if (me.isDestroyed) return null;
            if (me.interceptors != null && !me.remoteId && me.remoteInitializationError) {
                throw me.remoteInitializationError
            }

            const retryable = operation === 'read' || operation === 'execute';
            const retry     = () => operation === 'read' ? me.read(params, attempt + 1) : me.execute(method, params, attempt + 1);
            try {
                const response = profiled
                    ? await me.remote.data.profile({operation, params, method})
                    : await me.remote.data[operation](operation === 'execute' ? [method, params] : params);
                if (me.isDestroyed) return null;
                const result = profiled && response !== null ? response.result : response;
                if (profiled && response !== null) me.publishTelemetry(response.telemetry);
                if (retryable && result === null && attempt <= maxRemoteRetries) {
                    console.warn(`Pipeline: Remote ${operation} returned null, retrying (attempt ${attempt}/${maxRemoteRetries})...`);
                    me.remoteId = null;
                    return retry()
                }
                return result
            } catch (error) {
                if (me.isDestroyed) return null;
                // An admitted policy's rejection is a business outcome, not a lost counterpart.
                if (error?.code === 'NEO_PIPELINE_INTERCEPTION_REJECTED') throw error.reason;
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
     * @summary Snapshots ready interceptor chains and executes one local operation through them.
     * Remote rejection preserves cloneable values, with a message-only Error fallback for other values.
     * @param {String} operation
     * @param {*} params
     * @param {String} [method=operation]
     * @param {Object|null} [telemetry=null]
     * @returns {Promise<*>}
     * @protected
     */
    async runLocal(operation, params, method = operation, telemetry = null) {
        const me = this, appPipelineId = me.appPipelineId;
        if (me.interceptorChange) {
            try { await me.interceptorChange } catch (error) {
                if (!me.interceptorConfigured) throw error
            }
        }
        if (Pipeline.globalInterceptorChange) await Pipeline.globalInterceptorChange;

        const globalChain = Pipeline.globalInterceptorChain, localChain = me.interceptorChain,
              chains      = [globalChain, localChain].filter(Boolean);
        if (!chains.length) return me.runPrepared(operation, params, method, telemetry);

        const acquired = await Promise.allSettled(chains.map(chain => chain.acquire())),
              leases   = acquired.filter(item => item.status === 'fulfilled').map(item => item.value);
        try {
            const failure = acquired.find(item => item.status === 'rejected');
            if (failure) throw failure.reason;
            const context = {
                pipeline: me, operation, method, params,
                handlers: leases.flatMap(lease => lease.handlers),
                globalChain, localChain,
                isCurrent: () => !me.isDestroyed && Pipeline.globalInterceptorChain === globalChain
                    && me.interceptorChain === localChain
            };
            if (operation !== 'push') {
                params = context.params = await me.intercept('request', params, context)
            }
            return await me.runPrepared(operation, params, method, telemetry, context)
        } catch (error) {
            if (appPipelineId && leases.some(lease => lease.handlers.length)) {
                let reason;
                try { reason = structuredClone(error) } catch {
                    let message = 'Pipeline interception failed';
                    try {
                        const property = Object.getOwnPropertyDescriptor(error, 'message');
                        if (typeof property?.value === 'string') message = property.value
                    } catch {}
                    reason = new Error(message)
                }
                throw {code: 'NEO_PIPELINE_INTERCEPTION_REJECTED', reason}
            }
            throw error
        } finally {
            leases.forEach(lease => lease.release())
        }
    }

    /**
     * @summary Applies one awaited value-transform stage using the invocation's admitted handlers.
     * @param {String} stage
     * @param {*} value
     * @param {Object} context
     * @returns {Promise<*>}
     * @protected
     */
    async intercept(stage, value, context) {
        for (const handler of context.handlers) {
            if (this.isDestroyed) throw new Error('Pipeline destroyed during interception');
            const next = await handler[stage](value, {
                pipeline: this, operation: context.operation, method: context.method,
                params  : stage === 'request' ? value : context.params
            });
            if (this.isDestroyed) throw new Error('Pipeline destroyed during interception');
            if (next !== undefined) value = next
        }
        return value
    }

    /**
     * @summary Runs the ordered response/rejection chain without inventing a transport retry.
     * @param {*} value Response or rejection.
     * @param {Boolean} rejected
     * @param {Object} context
     * @returns {Promise<*>}
     * @protected
     */
    async interceptResponse(value, rejected, context) {
        for (const handler of context.handlers) {
            if (this.isDestroyed) throw new Error('Pipeline destroyed during interception');
            try {
                const next = await handler[rejected ? 'responseError' : 'response'](value, {
                    pipeline: this, operation: context.operation, method: context.method, params: context.params
                });
                if (next !== undefined) {
                    value = next;
                    rejected = false
                }
            } catch (error) {
                value = error;
                rejected = true
            }
        }
        if (this.isDestroyed) throw new Error('Pipeline destroyed during interception');
        if (rejected) throw value;
        return value
    }

    /**
     * @summary Applies cache policy after request preparation; superseded chains bypass the cache.
     * @param {String} operation
     * @param {*} params
     * @param {String} method
     * @param {Object|null} telemetry
     * @param {Object|null} [context=null]
     * @returns {Promise<*>}
     * @protected
     */
    async runPrepared(operation, params, method, telemetry, context=null) {
        const me = this, Stream = Neo.ns('Neo.data.parser.Stream', false);

        if (operation === 'read' && me.cache && !(Stream && me.parser instanceof Stream)) {
            if (context) {
                if (!context.isCurrent()) return me.runStages(operation, params, method, telemetry, context);
                if (me.readCacheChains?.[0] !== context.globalChain || me.readCacheChains?.[1] !== context.localChain) {
                    me.invalidateReadCache();
                    me.readCacheChains = [context.globalChain, context.localChain]
                }
            }
            return me.readCached(params, method, telemetry, context)
        }

        if (operation !== 'read') me.invalidateReadCache();
        try {
            return await me.runStages(operation, params, method, telemetry, context)
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
     * @param {Object|null} [context=null] Admitted interceptor snapshot.
     * @returns {Promise<*>}
     * @protected
     */
    async runStages(operation, params, method = operation, telemetry = null, context=null) {
        const me = this, {connection} = me;
        let invoke, rawData = operation === 'push' ? params : undefined;
        if (operation !== 'push' && connection) {
            if (operation === 'execute') {
                if (connection.execute) invoke = () => connection.execute(method, params);
                else if (typeof connection[method] === 'function') invoke = () => connection[method](params)
            } else if (operation === 'read' || connection[operation]) invoke = () => connection[operation](params)
        }
        if (invoke) {
            if (context) {
                let rejected = false;
                try { rawData = await me.measureStage(telemetry, 'connection', invoke) } catch (error) {
                    rawData = error;
                    rejected = true
                }
                rawData = await me.interceptResponse(rawData, rejected, context)
            } else rawData = await me.measureStage(telemetry, 'connection', invoke)
        }
        if (telemetry) telemetry.rawSize = me.getTelemetrySize(rawData);
        if (!rawData && (invoke || operation === 'execute')) return null;

        let   shapedData = rawData;
        const {parser}   = me, Stream = Neo.ns('Neo.data.parser.Stream', false),
              streaming    = !!(Stream && parser instanceof Stream);
        const parserMethod = operation === 'execute' && typeof parser?.[method] === 'function' ? method
            : ['read', 'execute', 'push'].includes(operation) ? 'read' : operation;
        if (parser && (operation === 'read' || parser[parserMethod])) {
            shapedData = await me.measureStage(telemetry, 'parser', () => parser[parserMethod](shapedData,
                context && streaming ? {transformChunk: chunk => me.intercept('postParse', chunk, context)} : undefined))
        }
        if (context && !streaming) shapedData = await me.intercept('postParse', shapedData, context);
        if (telemetry) telemetry.parsedSize = me.getTelemetrySize(shapedData);
        const {normalizer}     = me;
        const normalizerMethod = operation === 'execute' && typeof normalizer?.[method] === 'function' ? method
            : ['read', 'execute', 'push'].includes(operation) ? 'normalize' : operation;
        if (normalizer && (operation === 'read' || normalizer[normalizerMethod])) {
            shapedData = await me.measureStage(telemetry, 'normalizer', () => normalizer[normalizerMethod](shapedData))
        }
        if (context && me.isDestroyed) throw new Error('Pipeline destroyed during interception');
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
     * @param {Object|null} [context=null] Admitted interceptor snapshot and cache fence.
     * @returns {Promise<*>}
     * @protected
     */
    async readCached(params, method, telemetry, context=null) {
        const me       = this, connection = me.connection,
              identity = context ? [connection?.resolveUrl?.(connection.url) ?? connection?.url,
                  method, connection?.defaultHeaders ?? null, params] : [connection?.url, params],
              key = me.getReadCacheKey(identity), entries = me.readCacheEntries, now = Date.now();
        if (key === null || (context && !context.isCurrent())) return me.runStages('read', params, method, telemetry, context);
        for (const [entryKey, value] of entries) if (value.ready && value.expiresAt <= now) entries.delete(entryKey);
        const previous = entries.get(key);
        if (previous?.ready) return me.cloneReadCacheValue(previous.value);

        const entry = {};
        entries.set(key, entry);
        try {
            const result = await me.runStages('read', params, method, telemetry, context);
            if (!me.isDestroyed && me.cache && (!context || context.isCurrent()) && entries.get(key) === entry && result != null) {
                try {
                    if (Object.getOwnPropertyDescriptor(Object(result), 'success')?.value === false) {
                        entries.delete(key)
                    } else {
                        const snapshot = me.cloneReadCacheValue(result);
                        if (!me.isDestroyed && me.cache && (!context || context.isCurrent()) && entries.get(key) === entry) {
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
            id: generateUUID(), pipelineId: this.appPipelineId || this.id,
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
