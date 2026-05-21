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
    transport: process.env.NEO_TRANSPORT || 'stdio',
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
        host              : process.env.NEO_AUTH_HOST || null,
        port              : Number(process.env.NEO_AUTH_PORT) || 8080,
        realm             : process.env.NEO_AUTH_REALM || 'master',
        issuerUrl         : process.env.NEO_AUTH_ISSUER_URL || null,
        clientId          : process.env.NEO_OAUTH_CLIENT_ID || null,
        clientSecret      : process.env.NEO_OAUTH_CLIENT_SECRET || '',
        trustProxyIdentity: process.env.NEO_AUTH_TRUST_PROXY_IDENTITY === 'true'
    },
    /**
     * Agent OS maintenance orchestrator configuration.
     * @type {Object}
     */
    orchestrator: {
        /**
         * Optional local Neo repo roots for the primary-dev-sync lane.
         * Keep the template machine-neutral; set real absolute paths in gitignored
         * `ai/config.mjs` or via `NEO_ORCHESTRATOR_DEV_SYNC_ROOTS`.
         * @type {String[]}
         */
        devSyncRoots: [],
        /**
         * MLX model artifact used to launch the orchestrator-owned inference server.
         * This is a Hugging Face repo id or local path for `mlx_lm.server --model`, not
         * the OpenAI-compatible API payload model label. Set this in gitignored
         * `ai/config.mjs` or via `NEO_ORCHESTRATOR_MLX_MODEL`. Disabled by default
         * because LM Studio / other OpenAI-compatible providers already own the normal
         * inference endpoint; enable only when this orchestrator should supervise MLX
         * by setting `enabled: true` or `NEO_ORCHESTRATOR_MLX_ENABLED=true`.
         * @type {Object}
         */
        mlx: {
            enabled: false,
            model: null
        }
    },
    /**
     * Knowledge Base operations configuration (Cloud-Native KB Ingestion, Epic #11624).
     * @type {Object}
     */
    knowledgeBase: {
        /**
         * Phase 4D (#11642) — operator alert rules. Each entry is
         * `{metric, threshold, severity, channels, deliveryMode?}`; see the #11642
         * Contract Ledger. Empty by default — the alerting daemon no-ops with no rules.
         * @type {Object[]}
         */
        alertRules: [],
        /**
         * Phase 4D (#11642) — master opt-in for the KB operator-alerting daemon.
         * Disabled by default; the daemon exits early when false.
         * @type {Boolean}
         */
        alertingEnabled: false,
        /**
         * Phase 4D (#11642) — alerting daemon poll interval in ms (default 15 min).
         * @type {Number}
         */
        alertingIntervalMs: 15 * 60 * 1000,
        /**
         * Phase 4D (#11642) — per-`(tenant, metric, severity, channel)` hysteresis
         * cooldown window in ms (default 1 h).
         * @type {Number}
         */
        alertingCooldownMs: 60 * 60 * 1000,
        /**
         * Phase 4D (#11642) — rolling look-back window in ms for the per-tenant
         * telemetry rollup the rule engine evaluates (default 1 h).
         * @type {Number}
         */
        alertWindowMs: 60 * 60 * 1000
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
