import os              from 'os';
import path            from 'path';
import BaseConfig, { createConfigProxy } from '../shared/BaseConfig.mjs';
import {fileURLToPath} from 'url';
import {parsePort, parseUrl, parseBool, parseNumber} from '../shared/helpers/EnvConfig.mjs';

const __filename = fileURLToPath(import.meta.url);

const __dirname  = path.dirname(__filename);
const neoRootDir = path.resolve(__dirname, '../../../../');

/**
 * Default configuration object.
 * Defines the structure and default values for the server configuration.
 */

const envBindings = {
    'autoSync': { var: 'NEO_AUTO_SYNC', parse: parseBool },
    'autoStartDatabase': { var: 'NEO_KB_AUTO_START_DATABASE', parse: parseBool },
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

    'host': 'NEO_CHROMA_HOST',
    'port': { var: 'NEO_CHROMA_PORT', parse: parsePort },

    'memoryCoreDbPath': 'NEO_MEMORY_DB_PATH',
    'kbFaqMinCount': { var: 'NEO_KB_FAQ_MIN_COUNT', parse: parseNumber },
    'kbFaqSimilarityThreshold': { var: 'NEO_KB_FAQ_SIMILARITY_THRESHOLD', parse: parseNumber },
    'kbFaqConceptLimit': { var: 'NEO_KB_FAQ_CONCEPT_LIMIT', parse: parseNumber },
    'defaultTenantId': 'NEO_KB_DEFAULT_TENANT_ID',
    'defaultRepoSlug': 'NEO_KB_DEFAULT_REPO_SLUG',
    'defaultVisibility': 'NEO_KB_DEFAULT_VISIBILITY',
    'spoofRejectionMode': 'NEO_KB_SPOOF_REJECTION_MODE'
};

const defaultConfig = {
    neoRootDir,
    /**
     * Automatically synchronize the knowledge base on startup.
     * @type {boolean}
     */
    autoSync: false,
    /**
     * Automatically start the local Chroma database process on startup.
     * @type {boolean}
     */
    autoStartDatabase: false,
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
    mcpHttpPort: 3000,
    /**
     * Optional public canonical URL for this MCP server.
     * When configured, this URL is explicitly used as the resource indicator
     * for OAuth 2.1 / OIDC audience claims and SSE callback advertising.
     * Required when deploying behind reverse proxies (Nginx/Caddy) where
     * the internal host:port bindings do not match the public-facing URL.
     * Example: 'https://mcp.neo.mjs.com/knowledge-base'
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
     * A dummy embedding function to satisfy the ChromaDB API when embeddings are provided manually.
     *
     * NOTE: This verbose structure is strictly required to prevent the ChromaDB client from
     * flagging this as a "legacy" function, which triggers a persistent console warning:
     * "No embedding function configuration found for collection..."
     *
     * The `chromadb` library checks for the presence of `name`, `getConfig`, and `buildFromConfig`.
     * If any are missing, it defaults to legacy mode.
     * @returns {Object} The dummy embedding function satisfying IEmbeddingFunction
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
    },
    /**
     * The hostname of the ChromaDB server for the knowledge base.
     *
     * Operator env var: `NEO_CHROMA_HOST` (#10808). For shared cloud deployments where KB hosts the
     * unified Chroma instance for both KB + MC, this points at the shared cloud-hosted Chroma.
     * @type {string}
     */
    host: 'localhost',
    /**
     * The port the ChromaDB server for the knowledge base is listening on.
     *
     * Operator env var: `NEO_CHROMA_PORT` (#10808). Invalid values (non-integer / out-of-range)
     * fall back to the default with a console warning per the resolver validity contract.
     * @type {number}
     */
    port: 8000,
    /**
     * The local persistence path for the agent knowledge-base server.
     * @type {string}
     */
    path: path.resolve(neoRootDir, '.neo-ai-data/chroma/knowledge-base'),
    /**
     * @summary Shared SQLite destination for Knowledge Base query telemetry.
     *
     * Path to the shared Memory Core SQLite database used for Knowledge Base query telemetry.
     * Mirrors the Neural Link recorder default so `kb_query_log` and `kb_query_faqs`
     * land beside `nl_action_log` without coupling either MCP server's schema.
     * @type {string}
     */
    memoryCoreDbPath: path.join(os.homedir(), '.neo-ai-data', 'memory-core.sqlite'),
    /**
     * @summary Repetition threshold for promoting KB queries into Agent FAQ clusters.
     *
     * Minimum repeated Knowledge Base queries required before an Agent FAQ becomes
     * eligible for `[KB_DEMAND_GAP]` inference and `list_agent_faqs` reporting.
     * @type {number}
     */
    kbFaqMinCount: 3,
    /**
     * @summary Calibration threshold for future embedding-backed Agent FAQ clustering.
     *
     * Calibration marker for FAQ clustering. The first implementation uses exact
     * normalized-query grouping as the conservative 1.0 baseline; operators can
     * lower this once embedding-backed similarity is measured against real traffic.
     * @type {number}
     */
    kbFaqSimilarityThreshold: 1.0,
    /**
     * @summary Bound for Concept Ontology IDs attached to each Agent FAQ cluster.
     *
     * Maximum number of Concept Ontology IDs attached to each Agent FAQ.
     * @type {number}
     */
    kbFaqConceptLimit: 5,
    /**
     * The path to the generated knowledge base JSONL file.
     * @type {string}
     */
    dataPath: path.resolve(neoRootDir, 'dist/ai-knowledge-base.jsonl'),
    /**
     * The path to the generated class hierarchy JSON file.
     * @type {string}
     */
    hierarchyPath: path.resolve(neoRootDir, 'docs/output/class-hierarchy.json'),
    /**
     * Directory for the always-on KB server diagnostic log files (#10576). The KB server's
     * `logger.mjs` writes daily-rotated entries here regardless of `debug`, so long-running
     * operations (sync, embedding loops, ChromaDB lifecycle) leave a tail-able diagnostic
     * trail observable from the host shell. Default: `<neoRootDir>/.neo-ai-data/logs/`.
     * @type {string}
     */
    logPath: path.resolve(neoRootDir, '.neo-ai-data/logs'),
    /**
     * The name of the ChromaDB collection for the knowledge base.
     * @type {string}
     */
    collectionName: 'neo-knowledge-base',
    /**
     * Phase 0/1B (#11658): when `true` (default), the SourceRegistry auto-registers Neo's
     * 10 curated default Source classes. Cloud deployments that ingest only tenant content
     * can set `false` to skip Neo's curated sources entirely.
     * @type {boolean}
     */
    useDefaultSources: true,
    /**
     * Phase 0/1B (#11658): when `true` (default), the SourceRegistry auto-registers Neo's
     * built-in Parser classes (none ship in Phase 0/1B; populated in Phase 2 / Phase 3).
     * @type {boolean}
     */
    useDefaultParsers: true,
    /**
     * Phase 0/1B (#11658): declarative tenant-supplied Source registration.
     * Each entry: `{SourceClass, sourceName?}`.
     * @type {Array<{SourceClass: Object, sourceName?: string}>}
     */
    customSources: [],
    /**
     * Phase 0/1B (#11658): declarative tenant-supplied Parser registration.
     * Each entry: `{ParserClass, parserId?}`.
     * @type {Array<{ParserClass: Object, parserId?: string}>}
     */
    customParsers: [],
    /**
     * Phase 0/1B-β (#11660): per-source path overrides keyed by Source-class registry name.
     * Empty entries or missing keys fall through to each Source class's hardcoded fallback
     * (preserves byte-equivalence with pre-#11660 behavior). Shape varies per Source class —
     * each interprets its own entry shape (string / string-array / path→type object).
     * @type {Object<string,string|string[]|Object<string,string>>}
     */
    sourcePaths: {
        AdrSource         : 'learn/agentos/decisions',
        ConceptSource     : 'resources/content/concepts',
        ReleaseNotesSource: '.github/RELEASE_NOTES',
        SkillSource       : '.agents/skills',
        TestSource        : 'test/playwright',
        LearningSource    : 'learn/tree.json',
        DiscussionSource  : ['resources/content/discussions',
                             'resources/content/archive/discussions'],
        PullRequestSource : ['resources/content/pulls',
                             'resources/content/archive/pulls'],
        TicketSource      : ['resources/content/issues',
                             'resources/content/archive/issues'],
        ApiSource         : {
            'src'     : 'src',
            'apps'    : 'app',
            'examples': 'example',
            'docs/app': 'app',
            'ai'      : 'ai-infrastructure'
        }
    },
    /**
     * @summary Default tenant identity for Neo's curated Knowledge Base corpus — the team
     * namespace visible across every tenant.
     *
     * Write side: `VectorService.embed()` stamps this when no authenticated ingestion context
     * is supplied. Read side (#11632): `QueryService.queryDocuments` and `DocumentService`
     * include it in the `where: {tenantId: {$in: [<requester>, <this>]}}` filter so every tenant
     * additionally retrieves the curated corpus. Cloud ingestion paths override the write-side
     * value with server-derived tenant context; client-supplied chunk metadata is never authoritative.
     * @type {string}
     */
    defaultTenantId: 'neo-shared',
    /**
     * @summary Default repository slug for Neo's curated Knowledge Base corpus.
     *
     * Included in content hashing and Chroma IDs so byte-identical chunks from different
     * tenant repositories cannot collide.
     * @type {string}
     */
    defaultRepoSlug: 'neo',
    /**
     * @summary Default read visibility for embedded Knowledge Base chunks.
     *
     * Phase 0/1C writes the authoritative value; Phase 2/3 read paths consume it for
     * tenant-aware filtering.
     * @type {string}
     */
    defaultVisibility: 'team',
    /**
     * @summary Policy for conflicting client-supplied tenant metadata.
     *
     * `'overwrite'` logs and replaces conflicting `{tenantId, repoSlug, visibility,
     * originAgentIdentity}` fields with server-derived values. `'reject'` fails the
     * embedding call with `KB_TENANT_SPOOF_REJECTED`.
     * @type {'overwrite'|'reject'}
     */
    spoofRejectionMode: 'overwrite',
    /**
     * The name of the Google Generative AI model for content generation.
     * @type {string}
     */
    modelName: 'gemini-2.5-flash',
    /**
     * The number of chunks to process in a single batch when embedding.
     * @type {number}
     */
    batchSize: 50,
    /**
     * Work-volume gate for MCP-callable `manage_knowledge_base sync` (#10572): when
     * the post-delta `chunksToProcess.length` exceeds this value AND the call originates
     * via MCP tool dispatch, `VectorService.embed` refuses synchronous execution and
     * returns a `KB_SYNC_VOLUME_EXCEEDED` error pointing the operator at the CLI path
     * (`npm run ai:sync-kb`). CLI invocations bypass the gate.
     *
     * Default `50` aligns with `batchSize` — one batch is the floor for "small enough
     * to run synchronously". Real latency depends on provider/tier/retry-state; the
     * threshold is empirically tunable per deployment.
     * @type {number}
     */
    mcpSyncMaxChunks: 50,
    /**
     * Delay in milliseconds between batches to avoid rate limits.
     * @type {number}
     */
    batchDelay: 10000,
    /**
     * The maximum number of times to retry a failed embedding batch.
     * @type {number}
     */
    maxRetries: 5,
    /**
     * The number of results to fetch from ChromaDB for a query.
     * @type {number}
     */
    nResults: 100,
    /**
     * Weights used in the query scoring algorithm.
     * @type {Object}
     */
    queryScoreWeights: {
        baseIncrement    : 1,
        sourcePathMatch  : 40,
        fileNameMatch    : 30,
        classNameMatch   : 20,
        guideMatch       : 50,
        conceptMatch     : 15,
        blogMatch        : 5,
        namePartMatch    : 30,
        ticketPenalty    : -70,
        releasePenalty   : -50,
        baseFileBonus    : 20,
        releaseExactMatch: 1000,
        inheritanceBoost : 80,
        inheritanceDecay : 0.6
    }
};

/**
 * @summary Configuration manager for the Knowledge Base MCP server.
 *
 * Configuration manager for the Knowledge Base MCP server.
 * Supports loading configuration from a custom file and merging with defaults.
 *
 * @class Neo.ai.mcp.server.knowledge-base.Config
 * @extends Neo.core.Base
 * @singleton
 */
class Config extends BaseConfig {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.knowledge-base.Config'
         * @protected
         */
        className: 'Neo.ai.mcp.server.knowledge-base.Config',
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

        // NEO_MEMORY_CORE_DB_PATH fallback for memoryCoreDbPath
        if (process.env.NEO_MEMORY_CORE_DB_PATH && !process.env.NEO_MEMORY_DB_PATH) {
            this.data.memoryCoreDbPath = process.env.NEO_MEMORY_CORE_DB_PATH;
        }
    }

}
const instance = Neo.setupClass(Config);

export default createConfigProxy(instance);
