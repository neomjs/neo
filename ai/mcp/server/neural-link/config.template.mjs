import os              from 'os';
import path            from 'path';
import {fileURLToPath} from 'url';
import BaseConfig, { createConfigProxy, leaf } from '../../../BaseConfig.mjs';
import {resolveAiDataRoot}                     from '../shared/helpers/DeploymentConfig.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const neoRootDir = path.resolve(__dirname, '../../../../');
const cwd        = process.cwd();
const aiDataRoot = resolveAiDataRoot({neoRootDir});



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
         * @member {Object} data
         */
        data: {
            /**
             * Repo root, computed from this module's path. Exported for symmetry with the
             * KB and Memory Core configs so consumers (loggers, services, future) can read
             * `aiConfig.neoRootDir` rather than recomputing the 4-level traversal locally.
             * Module path is stable; the resolution is deterministic at boot.
             * @type {string}
             */
            neoRootDir: leaf(neoRootDir),
            /**
             * Canonical Agent OS runtime data root shared with Memory Core, Knowledge Base,
             * and local daemon logs.
             * @type {string}
             */
            aiDataRoot: leaf(aiDataRoot, 'NEO_AI_DATA_ROOT', 'string'),
            /**
             * Automatically connect to the bridge on startup.
             * @type {boolean}
             */
            autoConnect: leaf(true, 'NEO_NL_AUTO_CONNECT', 'boolean'),
            /**
             * Global debug flag.
             * @type {boolean}
             */
            debug: leaf(false, 'NEO_DEBUG', 'boolean'),
            /**
             * The port the WebSocket server is listening on.
             * @type {number}
             */
            port: leaf(8081, 'NEO_NL_PORT', 'port'),
            /**
             * Timeout for RPC calls in milliseconds.
             * @type {number}
             */
            rpcTimeout: leaf(10000, 'NEO_NL_RPC_TIMEOUT', 'number'),
            /**
             * Path to the memory core SQLite database for action logging.
             * @type {string}
             */
            memoryCoreDbPath: leaf(path.join(os.homedir(), '.neo-ai-data', 'memory-core.sqlite'), 'NEO_MEMORY_DB_PATH', 'string'),
            /**
             * Directory for the always-on Neural Link diagnostic log files. The NL server's
             * `logger.mjs` writes daily-rotated entries here regardless of `debug`, so
             * long-running inspection chains and DOM/VDOM introspection sweeps leave a
             * tail-able diagnostic trail observable from the host shell. Default:
             * `<aiDataRoot>/logs/` — shared with the KB and Memory Core servers
             * (each uses a distinct filename prefix: `nl-server-`, `kb-server-`, `mc-server-`).
             * Per-server file isolation, single tailable directory.
             * @type {string}
             */
            logPath: leaf(path.join(aiDataRoot, 'logs')),
            /**
             * @summary Shared MCP logger policy for Neural Link.
             *
             * Always-on file sink plus tier-gated stderr: info/warn/error write without
             * debug, while debug stays gated by `debug: true`.
             * @type {Object}
             */
            logger: leaf({
                filePrefix    : 'nl-server',
                fileSink      : true,
                stderrMode    : 'tiered',
                timestampStyle: 'bracketed'
            }),
            /**
             * Number of days to retain Action logs in the Neural Link Database.
             * @type {number}
             */
            pruneLogsAfterDays: leaf(14, 'NEO_NL_PRUNE_LOGS_AFTER_DAYS', 'number')
        }
    }
}
const instance = Neo.setupClass(Config);

export default createConfigProxy(instance);
