import os              from 'os';
import path            from 'path';
import AiConfig        from '../../../config.template.mjs';
import BaseConfig, { createConfigProxy, leaf } from '../../../BaseConfig.mjs';
import {fileURLToPath} from 'url';

const __filename = fileURLToPath(import.meta.url);

const __dirname  = path.dirname(__filename);
const neoRootDir = path.resolve(__dirname, '../../../../');
const aiDataRoot = path.join(neoRootDir, '.neo-ai-data');



/**
 * @summary Configuration manager for the Knowledge Base MCP server.
 *
 * Configuration manager for the Knowledge Base MCP server.
 * Supports loading configuration from a custom file and merging with defaults.
 *
 * @class Neo.ai.mcp.server.knowledge-base.Config
 * @extends Neo.ai.BaseConfig
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
        singleton: true,
        /**
         * @member {Object} data
         */
        data: {
            neoRootDir: leaf(neoRootDir),
            /**
             * Global debug flag for all MCP servers.
             *
             * Operator env var: `NEO_DEBUG`.
             * @type {boolean}
             */
            debug: leaf(false, 'NEO_DEBUG', 'boolean'),
            /**
             * Transport protocol for the MCP server ('stdio' or 'sse').
             * @type {string}
             */
            transport: leaf('stdio', 'NEO_TRANSPORT', 'string'),
            /**
             * Port the MCP server's HTTP/SSE transport listens on (only used when `transport === 'sse'`).
             *
             * Operator env var: `MCP_HTTP_PORT`.
             * @type {number}
             */
            mcpHttpPort: leaf(3000, 'MCP_HTTP_PORT', 'port'),
            /**
             * Optional public canonical URL for this MCP server.
             * When configured, this URL is explicitly used as the resource indicator
             * for OAuth 2.1 / OIDC audience claims and SSE callback advertising.
             * Required when deploying behind reverse proxies (Nginx/Caddy) where
             * the internal host:port bindings do not match the public-facing URL.
             * Example: 'https://mcp.neo.mjs.com/knowledge-base'
             * @type {string|null}
             */
            publicUrl: leaf(null, 'NEO_PUBLIC_URL', 'url'),
            /**
             * Comma-separated extra hostnames added to the MCP transport's Host-header allowlist
             * (the SDK's DNS-rebinding protection). localhost/127.0.0.1/[::1] and the `publicUrl`
             * hostname are always allowed; set this for multi-hostname deployments or where the
             * client `Host` differs from `publicUrl`. Empty/null → only the implicit localhost +
             * publicUrl hosts. Consumed by TransportService.computeAllowedHosts.
             * @type {string|null}
             */
            allowedHosts: leaf(null, 'NEO_MCP_ALLOWED_HOSTS', 'string'),
            /**
             * Optional Express middleware function for authentication (only used if transport is 'sse').
             * @type {Function|null}
             */
            authMiddleware: leaf(null),
            /**
             * The hostname of the ChromaDB server for the knowledge base.
             *
             * Operator env var: `NEO_CHROMA_HOST`. For shared cloud deployments where KB hosts the
             * unified Chroma instance for both KB + MC, this points at the shared cloud-hosted Chroma.
             * @type {string}
             */
            host: leaf(AiConfig.engines.chroma.host, 'NEO_CHROMA_HOST', 'string'),
            /**
             * The port the ChromaDB server for the knowledge base is listening on.
             *
             * Operator env var: `NEO_CHROMA_PORT`. Invalid values (non-integer / out-of-range)
             * fall back to the default with a console warning per the resolver validity contract.
             * @type {number}
             */
            port: leaf(AiConfig.engines.chroma.port, 'NEO_CHROMA_PORT', 'port'),
            /**
             * The unified Chroma persist directory, read from the single source of truth
             * `AiConfig.engines.chroma.dataDir`. MUST equal the orchestrator daemon's
             * `--path` (kept literal there for daemon-launch resilience against a stale config.mjs).
             * @type {string}
             */
            path: leaf(AiConfig.engines.chroma.dataDir),
            /**
             * @summary Shared SQLite destination for Knowledge Base query telemetry.
             *
             * Path to the shared Memory Core SQLite database used for Knowledge Base query telemetry.
             * Mirrors the Neural Link recorder default so `kb_query_log` and `kb_query_faqs`
             * land beside `nl_action_log` without coupling either MCP server's schema.
             * @type {string}
             */
            memoryCoreDbPath: leaf(path.join(os.homedir(), '.neo-ai-data', 'memory-core.sqlite'), 'NEO_MEMORY_DB_PATH', 'string'),
            /**
             * @summary Repetition threshold for promoting KB queries into Agent FAQ clusters.
             *
             * Minimum repeated Knowledge Base queries required before an Agent FAQ becomes
             * eligible for `[KB_DEMAND_GAP]` inference and `list_agent_faqs` reporting.
             * @type {number}
             */
            kbFaqMinCount: leaf(3, 'NEO_KB_FAQ_MIN_COUNT', 'number'),
            /**
             * @summary Calibration threshold for future embedding-backed Agent FAQ clustering.
             *
             * Calibration marker for FAQ clustering. The first implementation uses exact
             * normalized-query grouping as the conservative 1.0 baseline; operators can
             * lower this once embedding-backed similarity is measured against real traffic.
             * @type {number}
             */
            kbFaqSimilarityThreshold: leaf(1.0, 'NEO_KB_FAQ_SIMILARITY_THRESHOLD', 'number'),
            /**
             * @summary Bound for Concept Ontology IDs attached to each Agent FAQ cluster.
             *
             * Maximum number of Concept Ontology IDs attached to each Agent FAQ.
             * @type {number}
             */
            kbFaqConceptLimit: leaf(5, 'NEO_KB_FAQ_CONCEPT_LIMIT', 'number'),
            /**
             * The path to the generated knowledge base JSONL file.
             * @type {string}
             */
            dataPath: leaf(path.resolve(neoRootDir, 'dist/ai-knowledge-base.jsonl')),
            /**
             * The path to the generated class hierarchy JSON file.
             * @type {string}
             */
            hierarchyPath: leaf(path.resolve(neoRootDir, 'docs/output/class-hierarchy.json')),
            /**
             * Directory for the always-on KB server diagnostic log files. The KB server's
             * `logger.mjs` writes daily-rotated entries here regardless of `debug`, so long-running
             * operations (sync, embedding loops, ChromaDB lifecycle) leave a tail-able diagnostic
             * trail observable from the host shell. Default: `<aiDataRoot>/logs/`.
             * @type {string}
             */
            logPath: leaf(path.join(aiDataRoot, 'logs')),
            /**
             * @summary Shared MCP logger policy for Knowledge Base.
             *
             * Always-on file sink plus debug-gated stderr. The shared logger reads this
             * per-server policy lazily, so tests and local config overrides can update
             * `logPath` / `debug` before the next write without re-importing the module.
             * @type {Object}
             */
            logger: leaf({
                filePrefix    : 'kb-server',
                fileSink      : true,
                stderrMode    : 'debug',
                timestampStyle: 'plain'
            }),
            /**
             * The name of the ChromaDB collection for the knowledge base.
             * @type {string}
             */
            collectionName: leaf('neo-knowledge-base'),
            /**
             * When `true` (default), the SourceRegistry auto-registers Neo's
             * 10 curated default Source classes. Cloud deployments that ingest only tenant content
             * can set `false` to skip Neo's curated sources entirely.
             * @type {boolean}
             */
            useDefaultSources: leaf(true),
            /**
             * @summary Explicit opt-in fallback Source for unknown tenant repository shapes.
             *
             * When `true`, `SourceRegistry` registers `RawRepoSource` in addition to any default or
             * custom Sources. It is intentionally disabled by default so zero-config Neo deployments
             * keep the curated 10-source corpus and never walk the full repository tree implicitly.
             *
             * Operator env var: `NEO_KB_RAW_REPO_SOURCE`.
             * @type {boolean}
             */
            rawRepoSource: leaf(false, 'NEO_KB_RAW_REPO_SOURCE', 'boolean'),
            /**
             * When `true` (default), the SourceRegistry auto-registers Neo's
             * built-in Parser classes. The default registry may be empty until parser modules are added.
             * @type {boolean}
             */
            useDefaultParsers: leaf(true),
            /**
             * Declarative tenant-supplied Source registration.
             * Each entry: `{SourceClass, sourceName?}`.
             * @type {Array<{SourceClass: Object, sourceName?: string}>}
             */
            customSources: leaf([]),
            /**
             * Declarative tenant-supplied Parser registration.
             * Each entry: `{ParserClass, parserId?}`.
             * @type {Array<{ParserClass: Object, parserId?: string}>}
             */
            customParsers: leaf([]),
            /**
             * Per-source path overrides keyed by Source-class registry name.
             * Empty entries or missing keys fall through to each Source class's hardcoded fallback
             * (preserves byte-equivalence with existing deployment behavior). Shape varies per Source class —
             * each interprets its own entry shape (string / string-array / path→type object).
             * @type {Object<string,string|string[]|Object<string,string>>}
             */
            sourcePaths: leaf({
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
                },
                RawRepoSource     : {
                    root             : '.',
                    includeExtensions: [],
                    excludeExtensions: [
                        '.7z', '.avif', '.bin', '.bmp', '.bz2', '.class', '.dmg', '.eot',
                        '.exe', '.gif', '.gz', '.ico', '.jar', '.jpeg', '.jpg', '.lockb',
                        '.mov', '.mp3', '.mp4', '.otf', '.pdf', '.png', '.sqlite', '.tar',
                        '.tgz', '.ttf', '.wasm', '.webm', '.webp', '.woff', '.woff2', '.zip'
                    ],
                    excludePaths: [
                        '.git',
                        '.neo-ai-data',
                        'coverage',
                        'dist',
                        'docs/output',
                        'node_modules',
                        'package-lock.json',
                        'playwright-report',
                        'resources/examples',
                        'resources/fonts',
                        'resources/images',
                        'test-results',
                        'yarn.lock'
                    ]
                }
            }),
            /**
             * @summary Default tenant identity for Neo's curated Knowledge Base corpus — the team
             * namespace visible across every tenant.
             *
             * Write side: `VectorService.embed()` stamps this when no authenticated ingestion context
             * is supplied. Read side: `QueryService.queryDocuments` and `DocumentService`
             * include it in the `where: {tenantId: {$in: [<requester>, <this>]}}` filter so every tenant
             * additionally retrieves the curated corpus. Cloud ingestion paths override the write-side
             * value with server-derived tenant context; client-supplied chunk metadata is never authoritative.
             * @type {string}
             */
            defaultTenantId: leaf('neo-shared', 'NEO_KB_DEFAULT_TENANT_ID', 'string'),
            /**
             * @summary Default repository slug for Neo's curated Knowledge Base corpus.
             *
             * Included in content hashing and Chroma IDs so byte-identical chunks from different
             * tenant repositories cannot collide.
             * @type {string}
             */
            defaultRepoSlug: leaf('neo', 'NEO_KB_DEFAULT_REPO_SLUG', 'string'),
            /**
             * @summary Default read visibility for embedded Knowledge Base chunks.
             *
             * Write paths stamp the authoritative value; tenant-aware read paths consume it for
             * filtering.
             * @type {string}
             */
            defaultVisibility: leaf('team', 'NEO_KB_DEFAULT_VISIBILITY', 'string'),
            /**
             * @summary Policy for conflicting client-supplied tenant metadata.
             *
             * `'overwrite'` logs and replaces conflicting `{tenantId, repoSlug, visibility,
             * originAgentIdentity}` fields with server-derived values. `'reject'` fails the
             * embedding call with `KB_TENANT_SPOOF_REJECTED`.
             * @type {'overwrite'|'reject'}
             */
            spoofRejectionMode: leaf('overwrite', 'NEO_KB_SPOOF_REJECTION_MODE', 'string'),
            /**
             * The name of the Google Generative AI model for content generation.
             * @type {string}
             */
            modelName: leaf('gemini-2.5-flash'),
            /**
             * The number of chunks to process in a single batch when embedding.
             * @type {number}
             */
            batchSize: leaf(50),
            /**
             * Work-volume gate for MCP-callable `manage_knowledge_base sync`: when
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
            mcpSyncMaxChunks: leaf(50),
            /**
             * Delay in milliseconds between batches to avoid rate limits.
             * @type {number}
             */
            batchDelay: leaf(10000),
            /**
             * The maximum number of times to retry a failed embedding batch.
             * @type {number}
             */
            maxRetries: leaf(5),
            /**
             * The number of results to fetch from ChromaDB for a query.
             * @type {number}
             */
            nResults: leaf(100),
            /**
             * Weights used in the query scoring algorithm.
             * @type {Object}
             */
            queryScoreWeights: leaf({
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
            })
        },
        formulas: {
            path: data => data.engines.chroma.dataDir,
            logPath: data => path.join(data.aiDataRoot, 'logs')
        }
    }
}
const instance = Neo.setupClass(Config);

export default createConfigProxy(instance);
