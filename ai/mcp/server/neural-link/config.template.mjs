import os              from 'os';
import path            from 'path';
import {fileURLToPath} from 'url';
import BaseConfig, { createConfigProxy } from '../shared/BaseConfig.mjs';
import Env from '../../../../src/util/Env.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const neoRootDir = path.resolve(__dirname, '../../../../');
const cwd        = process.cwd();

/**
 * Default configuration object.
 */

const envBindings = {
    'autoConnect': { var: 'NEO_NL_AUTO_CONNECT', parse: Env.parseBool },
    'debug': { var: 'NEO_DEBUG', parse: Env.parseBool },
    'port': { var: 'NEO_NL_PORT', parse: Env.parsePort },
    'rpcTimeout': { var: 'NEO_NL_RPC_TIMEOUT', parse: Env.parseNumber },
    'memoryCoreDbPath': 'NEO_MEMORY_DB_PATH',
    'pruneLogsAfterDays': { var: 'NEO_NL_PRUNE_LOGS_AFTER_DAYS', parse: Env.parseNumber }
};

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
class Config extends BaseConfig {
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

    defaultConfig = defaultConfig;
    envBindings = envBindings;

    /**
     * Applies legacy environment variable fallbacks
     */
    applyLegacyEnv() {
        // NEO_MEMORY_CORE_DB_PATH fallback for memoryCoreDbPath
        if (process.env.NEO_MEMORY_CORE_DB_PATH && !process.env.NEO_MEMORY_DB_PATH) {
            this.data.memoryCoreDbPath = process.env.NEO_MEMORY_CORE_DB_PATH;
        }
    }


}
const instance = Neo.setupClass(Config);

export default createConfigProxy(instance);
