import fs   from 'fs/promises';
import path from 'path';
import Base  from '../src/core/Base.mjs';
import Env   from '../src/util/Env.mjs';

/**
 * @summary Base configuration manager for Neo MCP servers.
 *
 * Provides shared logic for file-based configuration loading, deep merging,
 * and environment variable application.
 *
 * @class Neo.ai.BaseConfig
 * @extends Neo.core.Base
 */
class BaseConfig extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.BaseConfig'
         * @protected
         */
        className: 'Neo.ai.BaseConfig',
        /**
         * The current configuration object.
         * @member {Object|null} data=null
         */
        data: null,
        /**
         * Server default configuration object.
         * @member {Object} defaultConfig={}
         */
        defaultConfig: {},
        /**
         * Nested env-var binding ledger. Shape mirrors `defaultConfig`.
         * @member {Object} envBindings={}
         */
        envBindings: {}
    }

    /**
     * Initializes the configuration object by deep cloning the defaults.
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);
        this.data = Neo.clone(this.defaultConfig, true);
        this.applyEnv();
    }

    /**
     * Applies environment variables to the current configuration using the envBindings ledger.
     */
    applyEnv() {
        Env.applyEnvBindings(this.data, this.envBindings, process.env, console.warn);
    }

    /**
     * Loads configuration from a JSON or JS module file and merges it with defaults.
     * Re-applies environment variables after merging to enforce precedence.
     * @param {String} filePath The path to the configuration file.
     * @returns {Promise<void>}
     */
    async load(filePath) {
        if (!filePath) {
            return;
        }

        try {
            const absolutePath = path.resolve(filePath);
            const ext          = path.extname(absolutePath);
            let customConfig;

            if (ext === '.mjs' || ext === '.js') {
                const module = await import(absolutePath);
                customConfig = module.default;
            } else {
                const content = await fs.readFile(absolutePath, 'utf-8');
                customConfig  = JSON.parse(content);
            }

            // Deep merge custom config into the data object
            Neo.merge(this.data, customConfig);

            // Re-apply environment variables to ensure they always take precedence over the loaded file
            this.applyEnv();

            console.error(`[Config] Loaded custom configuration from ${absolutePath}`);

        } catch (error) {
            console.error(`[Config] Failed to load configuration from ${filePath}:`, error.message);
            throw error;
        }
    }
}

/**
 * Creates a Proxy to delegate unknown properties to the underlying data object.
 * @param {Neo.ai.BaseConfig} instance
 * @returns {Proxy}
 */
export function createConfigProxy(instance) {
    return new Proxy(instance, {
        get(target, prop, receiver) {
            // 1. Prefer properties/methods on the instance itself (e.g. load, className)
            if (Reflect.has(target, prop)) {
                return Reflect.get(target, prop, receiver);
            }
            // 2. Fallback to the data object
            if (target.data && prop in target.data) {
                return target.data[prop];
            }
            return undefined;
        }
    });
}

export default Neo.setupClass(BaseConfig);
