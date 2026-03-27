import Base from '../core/Base.mjs';

/**
 * @class Neo.remotes.Api
 * @extends Neo.core.Base
 * @singleton
 */
class Api extends Base {
    static config = {
        /**
         * @member {String} className='Neo.remotes.Api'
         * @protected
         */
        className: 'Neo.remotes.Api',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * @param {String} service
     * @param {String} method
     * @returns {function(*=, *=): Promise<any>}
     */
    generateRemote(service, method) {
        return function(...args) {
            return Neo.currentWorker.promiseMessage('data', {
                action: 'rpc',
                method,
                params: [...args],
                service
            })
        }
    }

    /**
     * Generates a proxy function for persistent WebSocket streams.
     * @param {String} service
     * @param {String} stream
     * @param {Object} [config]
     * @returns {Function}
     */
    generateRemoteStream(service, stream, config = {}) {
        let pipeline;
        
        if (config.parser || config.normalizer || config.pipeline) {
            let pipelineConfig = config.pipeline || {
                parser    : config.parser,
                normalizer: config.normalizer
            };
            
            pipelineConfig.workerExecution = 'app'; 
            import('../data/Pipeline.mjs').then(module => {
                pipeline = Neo.create(module.default, pipelineConfig);
            });
        }

        return function(params, callback) {
            let callbackId = Neo.core.IdGenerator.getId('rpc-stream-');
            
            if (typeof callback !== 'function') {
                throw new Error('rpc stream proxy requires a callback function as the second parameter');
            }

            Neo.worker.App.rpcStreamCallbacks[callbackId] = async (data) => {
                if (pipeline) {
                    if (pipeline.parser && pipeline.parser.read) {
                        data = await pipeline.parser.read(data);
                    }
                    if (pipeline.normalizer && pipeline.normalizer.normalize) {
                        data = await pipeline.normalizer.normalize(data);
                    }
                }
                callback(data);
            };

            Neo.currentWorker.sendMessage('data', {
                action: 'rpcStream',
                callbackId,
                method: stream,
                params: [params],
                service
            });
            
            return () => {
                delete Neo.worker.App.rpcStreamCallbacks[callbackId];
                Neo.currentWorker.sendMessage('data', {
                    action    : 'rpcStreamUnsubscribe',
                    callbackId,
                    method    : stream,
                    service
                })
            }
        }
    }

    /**
     *
     */
    load() {
        let {config}    = Neo,
            useMjsFiles = config.environment === 'development' || config.environment === 'dist/esm',
            path        = config.remotesApiUrl;

        // Relative paths need a special treatment
        if (!path.includes('http')) {
            path = config.appPath.split('/');
            path.pop();
            path = `${path.join('/')}/${config.remotesApiUrl}`;
            path = (useMjsFiles ? '../../' : './') + path
        }

        fetch(path)
            .then(response => response.json())
            .then(data => {
                Neo.currentWorker.sendMessage('data', {action: 'registerApi', data});
                this.register(data)
            })
    }

    /**
     * @param {Object} api
     */
    register(api) {
        let ns;

        Object.entries(api.services).forEach(([service, serviceValue]) => {
            ns = Neo.ns(`${api.namespace}.${service}`, true);

            Object.entries(serviceValue.methods || {}).forEach(([method, methodValue]) => {
                if (methodValue.parser || methodValue.normalizer || methodValue.pipeline) {
                    let pipelineConfig = methodValue.pipeline || {
                        parser    : methodValue.parser,
                        normalizer: methodValue.normalizer
                    };
                    
                    pipelineConfig.workerExecution = 'data';

                    Promise.all([
                        import('../data/Pipeline.mjs'),
                        import('../data/connection/Rpc.mjs')
                    ]).then(([PipelineModule, RpcModule]) => {
                        pipelineConfig.connection = {
                            module: RpcModule.default,
                            api   : `${api.namespace}.${service}`
                        };
                        
                        let pipeline = Neo.create(PipelineModule.default, pipelineConfig);
                        
                        ns[method] = function(...args) {
                            return pipeline.execute(method, args[0]);
                        }
                    });
                } else {
                    ns[method] = this.generateRemote(service, method)
                }
            });

            Object.entries(serviceValue.streams || {}).forEach(([stream, streamValue]) => {
                ns[stream] = this.generateRemoteStream(service, stream, streamValue)
            })
        })
    }
}

export default Neo.setupClass(Api);
