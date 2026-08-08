import fs                              from 'fs/promises';
import path                            from 'path';
import Base                            from '../../../src/core/Base.mjs';
import {REMOTE_MCP_CREDENTIAL_ENV_VAR} from '../../services/fleet/mcpServers.mjs';

/**
 * Default configuration object for the MCP Client.
 * Defines available MCP servers and their connection details.
 */
const defaultConfig = {
    /**
     * A map of MCP server configurations.
     * The key is the logical name of the server (e.g., 'github-workflow').
     * The value is an object with transport-specific connection properties:
     * - `transportType: 'stdio'` uses `command` + `args`.
     * - `transportType: 'sse'` or `'streamable-http'` uses `url` + optional `transportOptions`.
     * - `bearerTokenEnvVar` injects a remote Bearer credential without storing its value here.
     */
    mcpServers: {
        "chrome-devtools": {
            transportType: "stdio",
            command      : "npx",
            args         : ["-y", "chrome-devtools-mcp@latest"]
        },
        "file-system": {
            transportType: "stdio",
            command      : "npm",
            args         : ["run", "ai:mcp-server-file-system"]
        },
        "github-workflow": {
            transportType: "stdio",
            command      : "npm",
            args         : ["run", "ai:mcp-server-github-workflow"],
            requiredEnv  : ["GH_TOKEN"]
        },
        "knowledge-base": {
            transportType    : "streamable-http",
            url              : "http://127.0.0.1:3102/kb/mcp",
            bearerTokenEnvVar: REMOTE_MCP_CREDENTIAL_ENV_VAR,
            requiredEnv      : [REMOTE_MCP_CREDENTIAL_ENV_VAR]
        },
        "memory-core": {
            transportType    : "streamable-http",
            url              : "http://127.0.0.1:3102/mc/mcp",
            bearerTokenEnvVar: REMOTE_MCP_CREDENTIAL_ENV_VAR,
            requiredEnv      : [REMOTE_MCP_CREDENTIAL_ENV_VAR]
        },
        "neural-link": {
            transportType: "stdio",
            command      : "npm",
            args         : ["run", "ai:mcp-server-neural-link"]
        }
    }
};

/**
 * @summary Configuration manager for the MCP Client.
 *
 * Supports loading configuration from a custom file and merging with defaults.
 * This class provides a centralized place to define and manage MCP server connection details.
 *
 * @class Neo.ai.mcp.client.Config
 * @extends Neo.core.Base
 * @singleton
 */
class Config extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.client.Config'
         * @protected
         */
        className: 'Neo.ai.mcp.client.Config',
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
     * Loads configuration from a JSON or MJS file and merges it with defaults.
     * @param {string} filePath - The path to the configuration file.
     * @returns {Promise<void>}
     */
    async load(filePath) {
        if (!filePath) return;

        try {
            const absolutePath = path.resolve(filePath);
            const ext          = path.extname(absolutePath);
            let   customConfig;

            if (ext === '.mjs' || ext === '.js') {
                const module = await import(absolutePath);
                customConfig = module.default;
            } else {
                const content = await fs.readFile(absolutePath, 'utf-8');
                customConfig  = JSON.parse(content);
            }

            // Deep merge custom config into the data object
            Neo.merge(this.data, customConfig);

            console.log(`[MCP Client Config] Loaded custom configuration from ${absolutePath}`);

        } catch (error) {
            console.error(`[MCP Client Config] Failed to load configuration from ${filePath}:`, error.message);
            throw error;
        }
    }
}

const instance = Neo.setupClass(Config);

// Using a Proxy to allow direct access to properties within `this.data`
export default new Proxy(instance, {
    get(target, prop, receiver) {
        // Prefer properties/methods on the instance itself (e.g., load, className)
        if (Reflect.has(target, prop)) {
            return Reflect.get(target, prop, receiver);
        }
        // Fallback to the data object
        return target.data[prop];
    }
});
