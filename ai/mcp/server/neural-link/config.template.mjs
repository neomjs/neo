import os              from 'os';
import path            from 'path';
import {fileURLToPath} from 'url';
import BaseConfig, { createConfigProxy } from '../../../BaseConfig.mjs';
import Env from '../../../../src/util/Env.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const neoRootDir = path.resolve(__dirname, '../../../../');
const cwd        = process.cwd();



/**
 * @summary Configuration manager for the Neural Link MCP server.
 *
 * Supports loading configuration from a custom file and merging with defaults.
 *
 * @class Neo.ai.mcp.server.neural-link.Config
 * @extends Neo.ai.BaseConfig
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
        singleton: true,
        /**
         * @member {Object} metaTree
         */
        metaTree: {
            /**
             * Repo root, computed from this module's path. Exported for symmetry with the
             * KB and Memory Core configs (#10584) so consumers (loggers, services, future)
             * can read `aiConfig.neoRootDir` rather than recomputing the 4-level traversal
             * locally. Module path is stable; the resolution is deterministic at boot.
             * @type {string}
             */
            neoRootDir: {default: neoRootDir},
            /**
             * Automatically connect to the bridge on startup.
             * @type {boolean}
             */
            autoConnect: {env: 'NEO_NL_AUTO_CONNECT', default: true, parse: Env.parseBool},
            /**
             * Global debug flag.
             * @type {boolean}
             */
            debug: {env: 'NEO_DEBUG', default: false, parse: Env.parseBool},
            /**
             * The port the WebSocket server is listening on.
             * @type {number}
             */
            port: {env: 'NEO_NL_PORT', default: 8081, parse: Env.parsePort},
            /**
             * Timeout for RPC calls in milliseconds.
             * @type {number}
             */
            rpcTimeout: {env: 'NEO_NL_RPC_TIMEOUT', default: 10000, parse: Env.parseNumber},
            /**
             * Path to the memory core SQLite database for action logging.
             * @type {string}
             */
            memoryCoreDbPath: {env: 'NEO_MEMORY_DB_PATH', default: path.join(os.homedir(), '.neo-ai-data', 'memory-core.sqlite'), parse: Env.parseString},
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
            logPath: {default: path.resolve(neoRootDir, '.neo-ai-data/logs')},
            /**
             * @summary Shared MCP logger policy for Neural Link.
             *
             * Always-on file sink plus tier-gated stderr: info/warn/error write without
             * debug, while debug stays gated by `debug: true`.
             * @type {Object}
             */
            logger: {default: {
                filePrefix    : 'nl-server',
                fileSink      : true,
                stderrMode    : 'tiered',
                timestampStyle: 'bracketed'
            }},
            /**
             * Number of days to retain Action logs in the Neural Link Database.
             * @type {number}
             */
            pruneLogsAfterDays: {env: 'NEO_NL_PRUNE_LOGS_AFTER_DAYS', default: 14, parse: Env.parseNumber}
        }
    }
}
const instance = Neo.setupClass(Config);

export default createConfigProxy(instance);
