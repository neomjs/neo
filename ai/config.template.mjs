import fs              from 'fs/promises';
import path            from 'path';
import {fileURLToPath} from 'url';
import Base            from '../src/core/Base.mjs';
import {resolveMcpHttpPort, resolvePublicUrl} from './mcp/server/shared/helpers/DeploymentConfig.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const neoRootDir = path.resolve(__dirname, '../');
// Fallback to neoRootDir if cwd is root (e.g., container/daemon edge cases)
const projectRoot = process.cwd() === '/' ? neoRootDir : process.cwd();

/**
 * Top-level configuration object (Tier 1).
 * Defines the core immutable plain-data structures applied universally across all AI/MCP infrastructure.
 */
const defaultConfig = {
    neoRootDir,
    projectRoot,
    /**
     * Global debug flag for all AI processes.
     * @type {boolean}
     */
    debug: false,
    /**
     * Transport protocol ('stdio' or 'sse').
     * @type {string}
     */
    transport: process.env.TRANSPORT || 'stdio',
    /**
     * Optional public canonical URL.
     * @type {string|null}
     */
    publicUrl: resolvePublicUrl(),
    /**
     * Port the MCP server's HTTP/SSE transport listens on.
     * Sub-servers will typically override this with their own defaultPort.
     * @type {number}
     */
    mcpHttpPort: resolveMcpHttpPort({defaultPort: 3000}),
    /**
     * Optional Express middleware function for authentication.
     * @type {Function|null}
     */
    authMiddleware: null,
    /**
     * Base authentication configuration.
     * @type {Object}
     */
    auth: {
        host              : process.env.AUTH_HOST || null,
        port              : Number(process.env.AUTH_PORT) || 8080,
        realm             : process.env.AUTH_REALM || 'master',
        issuerUrl         : process.env.AUTH_ISSUER_URL || null,
        clientId          : process.env.OAUTH_CLIENT_ID || null,
        clientSecret      : process.env.OAUTH_CLIENT_SECRET || '',
        trustProxyIdentity: process.env.AUTH_TRUST_PROXY_IDENTITY === 'true'
    },
    /**
     * A dummy embedding function to satisfy ChromaDB when embeddings are provided manually.
     * @returns {Object}
     */
    dummyEmbeddingFunction: {
        generate   : () => null,
        name       : 'dummy_embedding_function',
        getConfig  : () => ({}),
        constructor: {
            buildFromConfig: () => ({
                generate : () => null,
                name     : 'dummy_embedding_function',
                getConfig: () => ({})
            })
        }
    }
};

/**
 * @class Neo.ai.Config
 * @extends Neo.core.Base
 * @singleton
 */
class Config extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.Config'
         * @protected
         */
        className: 'Neo.ai.Config',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * The configuration data object.
     * @member {Object} data
     */
    data = null;

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);
        this.data = Neo.clone(defaultConfig, true);
    }

    /**
     * Loads a JSON or MJS configuration file and merges it into the current data.
     * @param {String} filePath 
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
        if (Reflect.has(target, prop)) {
            return Reflect.get(target, prop, receiver);
        }
        return target.data[prop];
    }
});
