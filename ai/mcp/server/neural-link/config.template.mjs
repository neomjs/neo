import fs              from 'fs/promises';
import os              from 'os';
import path            from 'path';
import {fileURLToPath} from 'url';
import Base            from '../../../../src/core/Base.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const neoRootDir = path.resolve(__dirname, '../../../../');
const cwd        = process.cwd();

/**
 * Default configuration object.
 */
const defaultConfig = {
    /**
     * Repo root, computed from this module's path. Exported for symmetry with the
     * KB and Memory Core configs (#10584) so consumers (loggers, services, future)
     * can read `aiConfig.neoRootDir` rather than recomputing the 4-level traversal
     * locally. Module path is stable; the resolution is deterministic at boot.
     * @type {string}
     */
    neoRootDir,
    /**
     * Automatically connect to the bridge on startup.
     * @type {boolean}
     */
    autoConnect: true,
    /**
     * Global debug flag.
     * @type {boolean}
     */
    debug: false,
    /**
     * The port the WebSocket server is listening on.
     * @type {number}
     */
    port: 8081,
    /**
     * Timeout for RPC calls in milliseconds.
     * @type {number}
     */
    rpcTimeout: 10000,
    /**
     * Path to the memory core SQLite database for action logging.
     * @type {string}
     */
    memoryCoreDbPath: path.join(os.homedir(), '.neo-ai-data', 'memory-core.sqlite'),
    /**
     * Directory for the always-on Neural Link diagnostic log files (#10582). The NL
     * server's `logger.mjs` writes daily-rotated entries here regardless of `debug`,
     * so long-running inspection chains and DOM/VDOM introspection sweeps leave a
     * tail-able diagnostic trail observable from the host shell. Default:
     * `<neoRootDir>/.neo-ai-data/logs/` — shared with the KB and Memory Core servers
     * (each uses a distinct filename prefix: `nl-server-`, `kb-server-`, `mc-server-`).
     * Per-server file isolation, single tailable directory.
     * @type {string}
     */
    logPath: path.resolve(neoRootDir, '.neo-ai-data/logs'),
    /**
     * Number of days to retain Action logs in the Neural Link Database.
     * @type {number}
     */
    pruneLogsAfterDays: 14
};

/**
 * @summary Configuration manager for the Neural Link MCP server.
 *
 * Supports loading configuration from a custom file and merging with defaults.
 *
 * @class Neo.ai.mcp.server.neural-link.Config
 * @extends Neo.core.Base
 * @singleton
 */
class Config extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.neural-link.Config'
         * @protected
         */
        className: 'Neo.ai.mcp.server.neural-link.Config',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * The current configuration object.
     * Starts with defaults and can be updated via load().
     * @member {Object} data
     */
    data = null;

    /**
     * Initializes the configuration object by deep cloning the defaults.
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);
        this.data = Neo.clone(defaultConfig, true);
    }

    /**
     * Loads configuration from a JSON file and merges it with defaults.
     * @param {String} filePath The path to the configuration file.
     * @returns {Promise<void>}
     */
    async load(filePath) {
        if (!filePath) return;

        try {
            const absolutePath = path.resolve(filePath);
            const ext = path.extname(absolutePath);
            let customConfig;

            if (ext === '.mjs' || ext === '.js') {
                const module = await import(absolutePath);
                customConfig = module.default;
            } else {
                const content = await fs.readFile(absolutePath, 'utf-8');
                customConfig = JSON.parse(content);
            }

            // Deep merge custom config into the data object
            Neo.merge(this.data, customConfig);

            console.error(`[Config] Loaded custom configuration from ${absolutePath}`);

        } catch (error) {
            console.error(`[Config] Failed to load configuration from ${filePath}:`, error.message);
            throw error;
        }
    }
}

const instance = Neo.setupClass(Config);

export default new Proxy(instance, {
    get(target, prop, receiver) {
        // 1. Prefer properties/methods on the instance itself (e.g. load, className)
        if (Reflect.has(target, prop)) {
            return Reflect.get(target, prop, receiver);
        }
        // 2. Fallback to the data object (e.g. port)
        return target.data[prop];
    }
});
