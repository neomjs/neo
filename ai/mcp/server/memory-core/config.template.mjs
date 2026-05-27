import path                              from 'path';
import AiConfig                          from '../../../config.template.mjs';
import BaseConfig, {createConfigProxy}   from '../../../BaseConfig.mjs';
import {fileURLToPath}                   from 'url';
import Env                               from '../../../../src/util/Env.mjs';

function parseMemorySharingPolicy(envVarName, {env = process.env} = {}) {
    const rawValue = env[envVarName];
    if (rawValue === undefined || rawValue === null || rawValue === '') return;
    if (['legacy', 'private', 'team'].includes(rawValue)) {
        return rawValue;
    }
    throw new Error(`[Config] Invalid ${envVarName} value: "${rawValue}". Must be one of: legacy, private, team`);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const neoRootDir = path.resolve(__dirname, '../../../../');
const cwd        = neoRootDir;

/**
 * @summary Configuration manager for the Memory Core MCP server.
 *
 * Supports loading configuration from a custom file and merging with defaults.
 *
 * @class Neo.ai.mcp.server.memory-core.Config
 * @extends Neo.ai.BaseConfig
 * @singleton
 */
class Config extends BaseConfig {
    /**
     * Default configuration object.
     * Defines the structure and default values for the server configuration.
     */
    static defaultConfig = {
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
         * @deprecated since PR #11101. Golden Path synthesis is now dynamically event-driven
         * (triggered via MemoryService#mutateFrontier) rather than bound to MCP boot sequence.
         * This boot-time flag remains for temporary backwards-compatibility but will be
         * removed in a future release.
         *
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
         * Operator env var: `MCP_HTTP_PORT`.
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
            host              : AiConfig.auth.host,
            port              : AiConfig.auth.port,
            realm             : AiConfig.auth.realm,
            issuerUrl         : AiConfig.auth.issuerUrl,
            clientId          : AiConfig.auth.clientId,
            clientSecret      : AiConfig.auth.clientSecret,
            trustProxyIdentity: AiConfig.auth.trustProxyIdentity
        },
        /**
         * Explicit override provider for the core LLM Engine (e.g. summarization).
         * Supported values: 'gemini', 'ollama', 'openAiCompatible'
         * @type {String}
         */
        modelProvider: AiConfig.modelProvider,
        /**
         * Explicit provider for Dream/Sandman graph-generation lanes.
         * Supported values: 'ollama', 'openAiCompatible'
         * @type {String}
         */
        graphProvider: AiConfig.graphProvider || 'openAiCompatible',
        /**
         * Canonical embedding provider for Memory Core and Knowledge Base embedding callsites.
         * Supported values: 'gemini', 'ollama', 'openAiCompatible'
         * Defaults to the local OpenAI-compatible Qwen3 route so the source tuple matches the
         * unified 4096-dimension Chroma collection invariant. Gemini remains available as an
         * explicit operator override and must be paired with `vectorDimension: 3072`.
         *
         * @type {String}
         */
        embeddingProvider: AiConfig.embeddingProvider,
        /**
         * Settings for the Ollama integration
         */
        ollama: {
            host          : AiConfig.ollama.host,
            model         : AiConfig.ollama.model,
            embeddingModel: AiConfig.ollama.embeddingModel
        },
        /**
         * Settings for the OpenAI-Compatible API integration (e.g., mlx-lm or mlx-openai-server)
         * WARNING: Never hardcode API keys here. Always export them via .env or globally.
         */
        openAiCompatible: {
            host                    : AiConfig.openAiCompatible.host,
            model                   : AiConfig.openAiCompatible.model,
            embeddingModel          : AiConfig.openAiCompatible.embeddingModel,
            apiKey                  : AiConfig.openAiCompatible.apiKey,
            unloadRetryCount        : AiConfig.openAiCompatible.unloadRetryCount,
            unloadRetryDelayMs      : AiConfig.openAiCompatible.unloadRetryDelayMs,
            /**
             * Configured context-window capacity of `model` measured in **tokens**.
             * Token-based per the Discussion #11444 / #11447 V1 graduation contract.
             * Used by `ConsumerFrictionHelper.invokeWithGuardrail` to fire the upstream
             * pre-check skip ("Angle 2") when an LLM input payload exceeds the consumer's
             * safe processing band. Default is sized for Gemma-3-4B / Qwen3-8B class
             * consumers (~32K-token context). Operators running models with different
             * context windows should tune this to match the deployed model — e.g. 8192
             * for Gemma-4-8B-IT, 131072 for Llama-3.1-70B 128K-context variants.
             * @type {number}
             */
            contextLimitTokens: AiConfig.openAiCompatible.contextLimitTokens,
            /**
             * Optional safer processing threshold (tokens) below `contextLimitTokens` for
             * the upstream pre-check skip. When the estimated input token count exceeds
             * this value, `invokeWithGuardrail` emits a `size-precheck-skip` friction and
             * does NOT invoke the consumer model. Defaults to 75% of `contextLimitTokens`
             * when unset — leaves ~25% headroom for system-prompt envelope, repair-cycle
             * prompt growth, and output-token reservation per Discussion #11444 Round-2
             * consensus.
             * @type {number|undefined}
             */
            safeProcessingLimitTokens: AiConfig.openAiCompatible.safeProcessingLimitTokens
        },
        /**
         * The enforced vector dimension across all SQLite collections.
         * Hard-configured here to prevent catastrophic schema wipes due to dynamic model changes.
         * @type {number}
         */
        vectorDimension: AiConfig.vectorDimension,
        /**
         * The name of the Google Generative AI model for content generation.
         * @type {string}
         */
        modelName: AiConfig.modelName,
        /**
         * The name of the Google Generative AI model for text embeddings.
         * @type {string}
         */
        embeddingModel: AiConfig.embeddingModel,
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
         * The target Storage Architecture to use.
         * Note: Chroma is the only supported Vector DB.
         * Options: 'hybrid' (Chroma vectors + SQLite graph), 'chroma' (Chroma vectors only).
         * The default is explicitly 'hybrid' per Epic #9922 Two-Pillar RAG architecture.
         */
        engine: 'hybrid',
        /**
         * Database Engine Definitions
         * This defines WHERE data is stored physically (for engines MC owns) and WHERE MC reaches
         * into other services' engines. The flat `engines.chroma` path specifies the unified
         * ChromaDB instance shared with the Knowledge Base.
         */
        engines: {
            chroma: {
                dataDir: path.resolve(cwd, '.neo-ai-data/chroma/memory-core'),
                host   : AiConfig.engines.chroma.host,
                port   : AiConfig.engines.chroma.port
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
        backupPath: AiConfig.backupPath,
        /**
         * Phase 4 (#11663): bundle retention policy for `ai/scripts/maintenance/backup.mjs`.
         * Bundles older than `maxDays` are eligible for deletion, but the newest
         * `keepMinimum` bundles are retained unconditionally regardless of age.
         * Defaults match the pre-#11663 hardcoded behavior (`K=3, N_DAYS=30`) so
         * existing deployments are unaffected without operator action.
         * @type {{keepMinimum: number, maxDays: number}}
         */
        backupRetention: {
            keepMinimum: 3,
            maxDays    : 30
        },
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
         * @summary Shared MCP logger policy for Memory Core.
         *
         * Always-on file sink plus debug-gated stderr. `flush: true` preserves the
         * short-lived script contract used by Sandman and other immediate-exit paths.
         * @type {Object}
         */
        logger: {
            filePrefix    : 'mc-server',
            fileSink      : true,
            flush         : true,
            stderrMode    : 'debug',
            timestampStyle: 'plain'
        },
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
         * Memory sharing policy for multi-tenant isolation (#10010).
         *
         * Defines the retrieval scope for query_raw_memories and query_summaries:
         * - 'private': strict tenant isolation. Only caller's owned rows.
         * - 'team': team-wide context sharing for tagged records.
         * - 'legacy': migration-window compatibility for pre-tenant-aware data.
         *
         * Invalid environment variables (NEO_MEMORY_SHARING_DEFAULT_POLICY) will
         * fail loudly on boot rather than silently weakening isolation.
         *
         * @type {Object}
         */
        memorySharing: {
            /**
             * @type {'legacy'|'private'|'team'}
             */
            defaultPolicy: 'legacy'
        },
        /**
         * Target file path for the lazy backfill queue of unresolved provenance edges.
         * @type {string}
         */
        lazyEdgesQueuePath: path.resolve(cwd, 'ai/data/memory-core/lazy-edges.jsonl')
    };

    /**
     * Single source of truth for environment variable overrides.
     * Maps nested configuration paths to environment variables and parser functions.
     */
    static envBindings = {
        autoSummarize        : { var: 'NEO_AUTO_SUMMARIZE', parse: Env.parseBool},
        autoStartDatabase    : { var: 'NEO_MEM_AUTO_START_DATABASE', parse: Env.parseBool},
        autoStartInference   : { var: 'NEO_MEM_AUTO_START_INFERENCE', parse: Env.parseBool},
        autoDream            : { var: 'NEO_AUTO_DREAM', parse: Env.parseBool},
        autoGoldenPath       : { var: 'NEO_AUTO_GOLDEN_PATH', parse: Env.parseBool},
        realTimeMemoryParsing: { var: 'NEO_REAL_TIME_MEMORY_PARSING', parse: Env.parseBool},
        autoIngestFileSystem : { var: 'NEO_AUTO_INGEST_FS', parse: Env.parseBool},
        debug                : { var: 'NEO_DEBUG', parse: Env.parseBool},
        transport            : 'NEO_TRANSPORT',
        mcpHttpPort          : { var: 'MCP_HTTP_PORT', parse: Env.parsePort},
        publicUrl            : { var: 'NEO_PUBLIC_URL', parse: Env.parseUrl},
        auth                 : {
            host              : 'NEO_AUTH_HOST',
            port              : { var: 'NEO_AUTH_PORT', parse: Env.parsePort},
            realm             : 'NEO_AUTH_REALM',
            issuerUrl         : 'NEO_AUTH_ISSUER_URL',
            clientId          : 'NEO_OAUTH_CLIENT_ID',
            clientSecret      : 'NEO_OAUTH_CLIENT_SECRET',
            trustProxyIdentity: { var: 'NEO_AUTH_TRUST_PROXY_IDENTITY', parse: Env.parseBool}
        },
        modelProvider     : 'NEO_MODEL_PROVIDER',
        graphProvider     : 'NEO_GRAPH_PROVIDER',
        embeddingProvider : 'NEO_EMBEDDING_PROVIDER',
        ollama            : {
            host          : 'NEO_OLLAMA_HOST',
            model         : 'NEO_OLLAMA_MODEL',
            embeddingModel: 'NEO_OLLAMA_EMBEDDING_MODEL'
        },
        openAiCompatible: {
            host              : 'NEO_OPENAI_COMPATIBLE_HOST',
            model             : 'NEO_OPENAI_COMPATIBLE_MODEL',
            embeddingModel    : 'NEO_OPENAI_COMPATIBLE_EMBEDDING_MODEL',
            apiKey            : 'NEO_OPENAI_COMPATIBLE_API_KEY',
            unloadRetryCount  : { var: 'NEO_OPENAI_COMPATIBLE_UNLOAD_RETRY_COUNT', parse: Env.parseNumber},
            unloadRetryDelayMs: { var: 'NEO_OPENAI_COMPATIBLE_UNLOAD_RETRY_DELAY_MS', parse: Env.parseNumber}
        },
        vectorDimension: { var: 'NEO_VECTOR_DIMENSION', parse: Env.parseNumber},
        backupPath     : 'NEO_BACKUP_PATH',
        engines        : {
            chroma: {
                host: 'NEO_CHROMA_HOST',
                port: { var: 'NEO_CHROMA_PORT', parse: Env.parsePort}
            }
        },
        collections: {
            memory : 'NEO_MEMORY_COLLECTION_NAME',
            session: 'NEO_SESSION_COLLECTION_NAME',
            graph  : 'NEO_GRAPH_COLLECTION_NAME'
        },
        storagePaths: {
            graph: 'NEO_MEMORY_DB_PATH'
        },
        datasets: {
            rlaif: {
                trajectories: 'NEO_RLAIF_PATH'
            }
        },
        decayFactor            : { var: 'NEO_GRAPH_DECAY_FACTOR', parse: Env.parseNumber},
        guideGapWeightThreshold: { var: 'NEO_GUIDE_GAP_WEIGHT_THRESHOLD', parse: Env.parseNumber},
        conceptDiscovery       : {
            prScanLimit    : { var: 'NEO_CONCEPT_DISCOVERY_PR_SCAN_LIMIT', parse: Env.parseNumber},
            minSourceLength: { var: 'NEO_CONCEPT_DISCOVERY_MIN_SOURCE_LENGTH', parse: Env.parseNumber}
        },
        mailbox: {
            defaultReplyPolicy: 'NEO_MAILBOX_DEFAULT_REPLY_POLICY'
        },
        memorySharing: {
            defaultPolicy: { var: 'NEO_MEMORY_SHARING_DEFAULT_POLICY', parse: parseMemorySharingPolicy }
        },
        lazyEdgesQueuePath: 'NEO_LAZY_EDGES_QUEUE_PATH'
    };
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
        singleton: true,
        /**
         * @member {Object} defaultConfig
         */
        defaultConfig: this.defaultConfig,
        /**
         * @member {Object} envBindings
         */
        envBindings: this.envBindings
    }
}
const instance = Neo.setupClass(Config);

export default createConfigProxy(instance);
