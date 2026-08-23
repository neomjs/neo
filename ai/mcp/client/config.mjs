import fs                              from 'fs/promises';
import {readFileSync}                  from 'node:fs';
import path                            from 'path';
import {fileURLToPath}                 from 'node:url';
import Base                            from '../../../src/core/Base.mjs';
import {REMOTE_MCP_CREDENTIAL_ENV_VAR} from '../../services/fleet/mcpServers.mjs';

const NEURAL_LINK_MCP_SCRIPT = 'ai:mcp-server-neural-link';

/**
 * @summary Resolves the package root owned by this built-in client configuration.
 *
 * The module location is stable while the caller's working directory is not: GUI launchers and
 * absolute config-file invocations may start at `/` or any unrelated directory. Requiring the
 * package manifest to declare the exact npm script turns the derived path into validated spawn
 * authority rather than a plausible-looking ancestor.
 *
 * @returns {String}
 * @throws {Error} When this module no longer lives under the package that owns the Neural Link MCP
 * server script.
 * @private
 */
function resolveClientPackageRoot() {
    const candidate = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
    let   manifest;

    try {
        manifest = JSON.parse(readFileSync(path.join(candidate, 'package.json'), 'utf8'));
    } catch {
        throw new Error('MCP Client config: module-derived package root has no readable package.json');
    }

    if (typeof manifest.scripts?.[NEURAL_LINK_MCP_SCRIPT] !== 'string') {
        throw new Error(`MCP Client config: module-derived package root does not declare '${NEURAL_LINK_MCP_SCRIPT}'`);
    }

    return candidate
}

const clientPackageRoot = resolveClientPackageRoot();

/**
 * Default configuration object for the MCP Client.
 * Defines available MCP servers and their connection details.
 */
const defaultConfig = {
    /**
     * A map of MCP server configurations.
     * The key is the logical name of the server (e.g., 'github-workflow').
     * The value is an object with transport-specific connection properties:
     * - `transportType: 'stdio'` uses `command` + `args` and may pin the child with `cwd`.
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
            // One module-derived authority drives BOTH process layers. The SDK needs `cwd` to find
            // this package's npm script; Neural Link needs the explicit flag before it may spawn or
            // connect its Bridge. Ambient `process.cwd()` is intentionally absent from both paths.
            cwd : clientPackageRoot,
            args: ["run", NEURAL_LINK_MCP_SCRIPT, "--", "--cwd", clientPackageRoot]
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
