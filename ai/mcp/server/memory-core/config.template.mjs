import path            from 'path';
import BaseConfig, { createConfigProxy } from '../shared/BaseConfig.mjs';
import {fileURLToPath} from 'url';
import {
    parseBool,
    parseNumber,
    parsePort,
    parseUrl
} from '../shared/helpers/EnvConfig.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const neoRootDir = path.resolve(__dirname, '../../../../');
const cwd        = neoRootDir;

/**
 * Default configuration object.
 * Defines the structure and default values for the server configuration.
 */
const defaultConfig = {
    /**
     * Repo root, computed from this module's path. Exported for symmetry with the
     * KB and Neural Link configs (#10584) so consumers (loggers, services, future)
     * can read `aiConfig.neoRootDir` rather than recomputing the 4-level traversal
     * locally. Module path is stable; the resolution is deterministic at boot.
     * @type {string}
     */
    neoRootDir,
    /**
     * Automatically trigger session summarization on startup.
     * @type {boolean}
     */
    autoSummarize: false,
    /**
     * Automatically start the local database process (Chroma/SQLite) on startup.
     * @type {boolean}
     */
    autoStartDatabase: false,
    /**
     * Automatically start the local inference server on startup.
     * @type {boolean}
     */
    autoStartInference: false,
    /**
     * Automatically trigger GraphRAG extraction on startup.
     * @type {boolean}
     */
    autoDream: false,
    /**
     * Automatically trigger Golden Path Synthesis into the handoff file on startup.
     * Crucial for headless swarm nodes (Mac 2) to physically generate sandman_handoff.md.
     * @type {boolean}
     */
    autoGoldenPath: false,
    /**
     * Immediately parse each incoming memory turn (add_memory) for Graph Injection.
     * @type {boolean}
     */
    realTimeMemoryParsing: false,
    /**
     * Automatically trigger FileSystem ingestion (Differential Graph Sync) on MCP server startup.
     * @type {boolean}
     */
    autoIngestFileSystem: false,
    /**
     * Global debug flag for all MCP servers.
     * @type {boolean}
     */
    debug: false,
    /**
     * Transport protocol for the MCP server ('stdio' or 'sse').
     * @type {string}
     */
    transport: 'stdio',
    /**
     * Port the MCP server's HTTP/SSE transport listens on (only used when `transport === 'sse'`).
     *
     * Operator env var: `MCP_HTTP_PORT`. The legacy `SSE_PORT` env var remains readable for one
     * deprecation window per #10808; resolver emits a warning if both are set with different values.
     * @type {number}
     */
    mcpHttpPort: 3001,
    /**
     * Optional public canonical URL for this MCP server.
     * When configured, this URL is explicitly used as the resource indicator
     * for OAuth 2.1 / OIDC audience claims and SSE callback advertising.
     * Required when deploying behind reverse proxies (Nginx/Caddy) where
     * the internal host:port bindings do not match the public-facing URL.
     * Example: 'https://mcp.neo.mjs.com/memory-core'
     * @type {string|null}
     */
    publicUrl: null,
    /**
     * Optional Express middleware function for authentication (only used if transport is 'sse').
     * @type {Function|null}
     */
    authMiddleware: null,
    /**
     * Authentication configuration for the server (OAuth 2.1 / OIDC).
     * Only used when transport is 'sse'.
     * @type {Object}
     */
    auth: {
        host              : null,
        port              : 8080,
        realm             : 'master',
        issuerUrl         : null,
        clientId          : null,
        clientSecret      : '',
        trustProxyIdentity: false
    },
    /**
     * Explicit override provider for the core LLM Engine (e.g. summarization).
     * Supported values: 'gemini', 'ollama', 'openAiCompatible'
     * @type {String}
     */
    modelProvider: 'gemini',
    /**
     * Canonical embedding provider for Memory Core and Knowledge Base embedding callsites.
     * Supported values: 'gemini', 'ollama', 'openAiCompatible'
     *
     * `NEO_CHROMA_EMBEDDING_PROVIDER` remains readable for one deprecation window but emits
     * a warning and feeds this unified selector.
     * @type {String}
     */
    embeddingProvider: 'gemini',
    /**
     * Settings for the Ollama integration
     */
    ollama: {
        host          : 'http://127.0.0.1:11434',
        model         : 'gemma4:31b',
        embeddingModel: 'qwen3-embedding'
    },
    /**
     * Settings for the OpenAI-Compatible API integration (e.g., mlx-lm or mlx-openai-server)
     * WARNING: Never hardcode API keys here. Always export them via .env or globally.
     */
    openAiCompatible: {
        host          : 'http://127.0.0.1:11434',
        model         : 'gemma-4-31b-it',
        embeddingModel: 'text-embedding-qwen3-embedding-8b',
        apiKey        : ''
    },
    /**
     * The enforced vector dimension across all SQLite collections.
     * Hard-configured here to prevent catastrophic schema wipes due to dynamic model changes.
     * @type {number}
     */
    vectorDimension: 4096,
    /**
     * The name of the Google Generative AI model for content generation.
     * @type {string}
     */
    modelName: 'gemini-2.5-flash',
    /**
     * The name of the Google Generative AI model for text embeddings.
     * @type {string}
     */
    embeddingModel: 'gemini-embedding-001',
    /**
     * Pagination limit for fetching records during session summarization scans.
     * Controls the batch size for memory and summary retrieval.
     * @type {number}
     */
    summarizationBatchLimit: 2000,
    /**
     * Maximum number of concurrent session summarization requests.
     * Prevents hitting LLM/Embedding API rate limits during bulk operations.
     * @type {number}
     */
    summarizationConcurrency: 5,
    /**
     * Dynamic topology flag for the Cloud-Native Memory Core deployment (Epic #9999, sub-epic #10015).
     * When `true`, Memory Core connects to the shared Knowledge Base ChromaDB instance at
     * `kbChroma.{host, port}` instead of addressing its own instance at `engines.chroma.{host, port}`.
     * This enables **unified-topology** single-container deployments where KB and MC share one ChromaDB
     * process — the pattern for centrally hosted multi-tenant Memory Core deployments. `false` preserves
     * the **federated** two-instance default.
     *
     * Pairs with `autoStartDatabase`: in unified mode the operator should leave that `false` so MC does
     * not spawn a duplicate ChromaDB — the KB server owns the process. The federation choice is orthogonal
     * to per-tenant write tagging (#10000) and read-side isolation (#10010), which apply regardless of
     * topology.
     * @type {boolean}
     */
    chromaUnified: false,
    /**
     * The target Storage Architecture to use.
     * Note: Chroma is the only supported Vector DB.
     * Options: 'hybrid' (Chroma vectors + SQLite graph), 'chroma' (Chroma vectors only).
     * The default is explicitly 'hybrid' per Epic #9922 Two-Pillar RAG architecture.
     */
    engine: 'hybrid',
    /**
     * Database Engine Definitions
     * This defines WHERE data is stored physically (for engines MC owns) and WHERE MC reaches
     * into other services' engines (under `engines.<serviceName>.<engineType>`). The flat
     * `engines.chroma` path is MC's own ChromaDB; the nested `engines.kb.chroma` path is the
     * Knowledge Base's ChromaDB, consulted only when `chromaUnified` is `true`.
     */
    engines: {
        chroma: {
            dataDir: path.resolve(cwd, '.neo-ai-data/chroma/memory-core'),
            host   : 'localhost',
            port   : 8001
        },
        /**
         * Connection coordinates for the shared Knowledge Base ChromaDB instance, consulted by
         * `ChromaManager` when `chromaUnified` is `true`. In unified mode the Memory Core's
         * ChromaClient targets `engines.kb.chroma.{host, port}` instead of `engines.chroma.{host, port}`.
         * Defaults match the Knowledge Base server's default (`localhost:8000`); override per-deployment
         * via `NEO_KB_CHROMA_HOST` / `NEO_KB_CHROMA_PORT` for containerized topologies. The
         * `engines.<serviceName>.<engineType>` namespace is the extension point for any future
         * cross-service engine-reference groups.
         * @type {Object}
         */
        kb: {
            chroma: {
                // #10808: prefer operator-facing `NEO_CHROMA_HOST/PORT` (cookbook Section 5);
                // `NEO_KB_CHROMA_HOST/PORT` remains readable for backwards-compat during deprecation window.
                host: 'localhost',
                port: 8000
            }
        }
    },
    /**
     * Physical file paths for embedded/local datasets.
     */
    storagePaths: {
        graph: process.env.UNIT_TEST_MODE === 'true' ? ':memory:' : path.resolve(cwd, '.neo-ai-data/sqlite/memory-core-graph.sqlite')
    },
    /**
     * Data Schema/Table Names
     * This defines WHAT the tables/collections are called logically.
     */
    collections: {
        memory : process.env.UNIT_TEST_MODE === 'true' ? `test-memory-${Date.now()}-${Math.random().toString(36).substring(7)}` : 'neo-agent-memory',
        session: process.env.UNIT_TEST_MODE === 'true' ? `test-session-${Date.now()}-${Math.random().toString(36).substring(7)}` : 'neo-agent-sessions',
        graph  : 'neo-native-graph'
    },
    /**
     * Datasets Schema/Paths
     * This defines WHERE autonomous curation exports data.
     */
    datasets: {
        rlaif: {
            trajectories: path.resolve(cwd, '.neo-ai-data/datasets/rlaif/trajectories.jsonl')
        }
    },
    /**
     * Target markdown file used for autonomous agent-to-user reporting (offline jobs).
     * @type {string}
     */
    handoffFilePath: path.resolve(cwd, 'resources/content/sandman_handoff.md'),
    /**
     * The Hebbian decay factor applied every 24 hours to the edge graph (e.g., 0.98 for ~79 day half-life).
     * @type {number}
     */
    decayFactor: 0.98,
    /**
     * Minimum weight threshold for emitting `[GUIDE_GAP]`, `[EXAMPLE_GAP]`, and `[ORPHAN_CONCEPT]`
     * signals on CONCEPT nodes during `GapInferenceEngine.inferConceptGraphGaps`.
     *
     * **Derivation:** `ConceptService.calculateWeight` returns `tier_score + uniqueness + coverage_deficit`
     * where tier-1 gets `0.8`, tier-2 `0.5`, tier-3 `0.3`; uniqueness adds `0.2`; coverage deficit (no
     * EXPLAINED_BY) adds `0.3`. The minimum a tier-1 concept can score is `0.8` (covered, non-unique).
     * Setting threshold = `0.8` means *"at least tier-1 baseline priority"* — every tier-1 concept
     * without a guide qualifies; tier-2/3 concepts qualify only if uniqueness + deficit push them above.
     *
     * Tune up to silence tier-2/3 noise as ontology grows (#10036 / #10037 / #10050); tune down to
     * surface lower-priority concepts in the handoff.
     * @type {number}
     */
    guideGapWeightThreshold: 0.8,
    /**
     * Operator-tuning knobs for `ConceptDiscoveryService` (#10036). Both values are read live
     * at method-call time (not captured at module load) so tests + runtime overrides are honored.
     *
     * - `prScanLimit`: how many pull-request markdown files to process per discovery cycle.
     *   PRs are sorted descending by PR number so the most-recent (freshest architectural
     *   discourse) process first. Capping bounds per-cycle LLM cost against the ~300+ PR corpus.
     * - `minSourceLength`: minimum source text length (chars) to trigger an LLM extraction call.
     *   Short bodies aren't worth the provider round-trip; 200 ≈ 30 words of coherent prose.
     *
     * Expected to migrate to SDK-layer config per #10103 once the daemon/service config split
     * lands — these are daemon concerns, not memory-core concerns.
     * @type {Object}
     */
    conceptDiscovery: {
        prScanLimit    : 20,
        minSourceLength: 200
    },
    /**
     * Universal JSONL backup/export directory for all databases.
     * @type {string}
     */
    backupPath: path.resolve(cwd, '.neo-ai-data/backups'),
    /**
     * Directory for the always-on Memory Core diagnostic log files (#10582). The MC
     * server's `logger.mjs` writes daily-rotated entries here regardless of `debug`,
     * so long-running operations (summarization, ingestion sweeps, ChromaDB
     * lifecycle) leave a tail-able diagnostic trail observable from the host shell.
     * Default: `<neoRootDir>/.neo-ai-data/logs/` — shared with the KB and Neural
     * Link servers (each uses a distinct filename prefix: `mc-server-`, `kb-server-`,
     * `nl-server-`). Per-server file isolation, single tailable directory.
     * @type {string}
     */
    logPath: path.resolve(cwd, '.neo-ai-data/logs'),
    /**
     * Mailbox substrate behavior configuration (#10252).
     *
     * Deployment-tier selectors for the A2A mailbox service. The A2A primitives
     * themselves (Message nodes, SENT_BY / SENT_TO edges, CAN_REPLY_TO permission
     * edges, PermissionService.grantPermission / revokePermission / listPermissions)
     * remain unconditionally live regardless of these selectors — this block only
     * tunes default enforcement policy to match deployment reality.
     *
     * @type {Object}
     */
    mailbox: {
        /**
         * Default reply policy for non-broadcast DMs. Controls whether `addMessage`
         * to a specific AgentIdentity target requires a prior `CAN_REPLY_TO` grant
         * or reachable-counterparty trust-lift (#10146 strict-isolation default),
         * or accepts any authenticated sender as a peer.
         *
         * - `'blocked'` — strict-isolation default policy from #10146. Suited for
         *   multi-user / multi-tenant Memory Core deployments and mixed-trust-tier
         *   installations where cross-tenant boundaries must be enforced at the
         *   substrate. Cross-tenant reach requires explicit `CAN_REPLY_TO` grants.
         *   Reachable-counterparty trust-lift (#10179) relaxes the bootstrap once
         *   any broadcast or direct message has flowed between the pair.
         *
         * - `'open'` — peer-trust mode. Suited for homogeneous trusted-frontier
         *   swarms where every authenticated identity is a peer owned by the same
         *   operator (e.g. local development with Claude + Gemini + future frontier
         *   models). Eliminates the first-message bootstrap tax. `CAN_REPLY_TO`
         *   edges still queryable via `grant_permission` / `list_permissions`;
         *   enforcement simply skips the check.
         *
         * Does NOT weaken read-path scoping — `CAN_READ_INBOX_OF`,
         * `CAN_READ_MEMORIES_OF`, `CAN_READ_SESSIONS_OF` remain strict regardless
         * of this setting. Reading someone's inbox is categorically different
         * from sending them a message; asymmetric treatment is intentional.
         *
         * Library default is `'open'`; multi-user / multi-tenant deployments
         * override to `'blocked'` in their `config.mjs` as part of installation,
         * or via the `NEO_MAILBOX_DEFAULT_REPLY_POLICY` environment variable.
         *
         * @type {'blocked'|'open'}
         */
        defaultReplyPolicy: 'open'
    },
    /**
     * Target file path for the lazy backfill queue of unresolved provenance edges.
     * @type {string}
     */
    lazyEdgesQueuePath: path.resolve(cwd, 'ai/data/memory-core/lazy-edges.jsonl')
};

/**
 * Single source of truth for environment variable overrides.
 * Maps dot-notation paths in the configuration object to environment variables and parser functions.
 */
const envBindings = {
    'autoSummarize': { var: 'NEO_AUTO_SUMMARIZE', parse: parseBool },
    'autoStartDatabase': { var: 'NEO_MEM_AUTO_START_DATABASE', parse: parseBool },
    'autoStartInference': { var: 'NEO_MEM_AUTO_START_INFERENCE', parse: parseBool },
    'autoDream': { var: 'NEO_AUTO_DREAM', parse: parseBool },
    'autoGoldenPath': { var: 'NEO_AUTO_GOLDEN_PATH', parse: parseBool },
    'realTimeMemoryParsing': { var: 'NEO_REAL_TIME_MEMORY_PARSING', parse: parseBool },
    'autoIngestFileSystem': { var: 'NEO_AUTO_INGEST_FS', parse: parseBool },
    'debug': { var: 'NEO_DEBUG', parse: parseBool },
    'transport': 'NEO_TRANSPORT',
    'mcpHttpPort': { var: 'MCP_HTTP_PORT', parse: parsePort },
    'publicUrl': { var: 'NEO_PUBLIC_URL', parse: parseUrl },
    
    'auth.host': 'NEO_AUTH_HOST',
    'auth.port': { var: 'NEO_AUTH_PORT', parse: parsePort },
    'auth.realm': 'NEO_AUTH_REALM',
    'auth.issuerUrl': 'NEO_AUTH_ISSUER_URL',
    'auth.clientId': 'NEO_OAUTH_CLIENT_ID',
    'auth.clientSecret': 'NEO_OAUTH_CLIENT_SECRET',
    'auth.trustProxyIdentity': { var: 'NEO_AUTH_TRUST_PROXY_IDENTITY', parse: parseBool },
    
    'modelProvider': 'NEO_MODEL_PROVIDER',
    'embeddingProvider': 'NEO_EMBEDDING_PROVIDER',
    
    'ollama.host': 'NEO_OLLAMA_HOST',
    'ollama.model': 'NEO_OLLAMA_MODEL',
    'ollama.embeddingModel': 'NEO_OLLAMA_EMBEDDING_MODEL',
    
    'openAiCompatible.host': 'NEO_OPENAI_COMPATIBLE_HOST',
    'openAiCompatible.model': 'NEO_OPENAI_COMPATIBLE_MODEL',
    'openAiCompatible.embeddingModel': 'NEO_OPENAI_COMPATIBLE_EMBEDDING_MODEL',
    'openAiCompatible.apiKey': 'NEO_OPENAI_COMPATIBLE_API_KEY',
    
    'vectorDimension': { var: 'NEO_VECTOR_DIMENSION', parse: parseNumber },
    'chromaUnified': { var: 'NEO_CHROMA_UNIFIED', parse: parseBool },
    
    'engines.kb.chroma.host': 'NEO_CHROMA_HOST',
    'engines.kb.chroma.port': { var: 'NEO_CHROMA_PORT', parse: parsePort },
    
    'collections.memory': 'NEO_MEMORY_COLLECTION_NAME',
    'collections.session': 'NEO_SESSION_COLLECTION_NAME',
    'collections.graph': 'NEO_GRAPH_COLLECTION_NAME',
    
    'storagePaths.graph': 'NEO_MEMORY_DB_PATH',
    
    'datasets.rlaif.trajectories': 'NEO_RLAIF_PATH',
    'decayFactor': { var: 'NEO_GRAPH_DECAY_FACTOR', parse: parseNumber },
    'guideGapWeightThreshold': { var: 'NEO_GUIDE_GAP_WEIGHT_THRESHOLD', parse: parseNumber },
    
    'conceptDiscovery.prScanLimit': { var: 'NEO_CONCEPT_DISCOVERY_PR_SCAN_LIMIT', parse: parseNumber },
    'conceptDiscovery.minSourceLength': { var: 'NEO_CONCEPT_DISCOVERY_MIN_SOURCE_LENGTH', parse: parseNumber },
    
    'mailbox.defaultReplyPolicy': 'NEO_MAILBOX_DEFAULT_REPLY_POLICY',
    'lazyEdgesQueuePath': 'NEO_LAZY_EDGES_QUEUE_PATH'
};

/**
 * @summary Configuration manager for the Memory Core MCP server.
 *
 * Supports loading configuration from a custom file and merging with defaults.
 *
 * @class Neo.ai.mcp.server.memory-core.Config
 * @extends Neo.core.Base
 * @singleton
 */
class Config extends BaseConfig {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.memory-core.Config'
         * @protected
         */
        className: 'Neo.ai.mcp.server.memory-core.Config',
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
        // Handle legacy deprecation fallbacks explicitly
        if (process.env.SSE_PORT && !process.env.MCP_HTTP_PORT) {
            console.warn('[Config] Deprecation warning: SSE_PORT is deprecated. Please use MCP_HTTP_PORT.');
            const legacyPort = parsePort(process.env.SSE_PORT, 'SSE_PORT', console.warn);
            if (legacyPort !== undefined) {
                this.data.mcpHttpPort = legacyPort;
            }
        }
        
        if (process.env.NEO_CHROMA_EMBEDDING_PROVIDER && !process.env.NEO_EMBEDDING_PROVIDER) {
            console.warn('[Config] Deprecation warning: NEO_CHROMA_EMBEDDING_PROVIDER is deprecated. Please use NEO_EMBEDDING_PROVIDER.');
            this.data.embeddingProvider = process.env.NEO_CHROMA_EMBEDDING_PROVIDER;
        }
        
        if (process.env.NEO_KB_CHROMA_HOST && !process.env.NEO_CHROMA_HOST) {
            console.warn('[Config] Deprecation warning: NEO_KB_CHROMA_HOST is deprecated. Please use NEO_CHROMA_HOST.');
            this.data.engines.kb.chroma.host = process.env.NEO_KB_CHROMA_HOST;
        }
        
        if (process.env.NEO_KB_CHROMA_PORT && !process.env.NEO_CHROMA_PORT) {
            console.warn('[Config] Deprecation warning: NEO_KB_CHROMA_PORT is deprecated. Please use NEO_CHROMA_PORT.');
            const legacyPort = parsePort(process.env.NEO_KB_CHROMA_PORT, 'NEO_KB_CHROMA_PORT', console.warn);
            if (legacyPort !== undefined) {
                this.data.engines.kb.chroma.port = legacyPort;
            }
        }
    }
}
const instance = Neo.setupClass(Config);

export default createConfigProxy(instance);
