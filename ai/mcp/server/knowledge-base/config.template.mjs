import os              from 'os';
import path            from 'path';
import AiConfig        from '../../../config.template.mjs';
import BaseConfig, { createConfigProxy } from '../../../BaseConfig.mjs';
import {fileURLToPath} from 'url';
import Env from '../../../../src/util/Env.mjs';

const __filename = fileURLToPath(import.meta.url);

const __dirname  = path.dirname(__filename);
const neoRootDir = path.resolve(__dirname, '../../../../');



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
         * @member {Object} metaTree
         */
        metaTree: {
            neoRootDir: {default: neoRootDir},
            /**
             * Universal JSONL backup/export directory inherited from Tier-1 config.
             * @type {string}
             */
            backupPath: {env: 'NEO_BACKUP_PATH', default: AiConfig.backupPath, parse: Env.parseString},
            /**
             * Automatically synchronize the knowledge base on startup.
             * @type {boolean}
             */
            autoSync: {env: 'NEO_AUTO_SYNC', default: false, parse: Env.parseBool},
            /**
             * Automatically start the local Chroma database process on startup.
             * @type {boolean}
             */
            autoStartDatabase: {env: 'NEO_KB_AUTO_START_DATABASE', default: false, parse: Env.parseBool},
            /**
             * Global debug flag for all MCP servers.
             * @type {boolean}
             */
            debug: {default: false},
            /**
             * Transport protocol for the MCP server ('stdio' or 'sse').
             * @type {string}
             */
            transport: {env: 'NEO_TRANSPORT', default: 'stdio', parse: Env.parseString},
            /**
             * Port the MCP server's HTTP/SSE transport listens on (only used when `transport === 'sse'`).
             *
             * Operator env var: `MCP_HTTP_PORT`.
             * @type {number}
             */
            mcpHttpPort: {env: 'MCP_HTTP_PORT', default: 3000, parse: Env.parsePort},
            /**
             * Optional public canonical URL for this MCP server.
             * When configured, this URL is explicitly used as the resource indicator
             * for OAuth 2.1 / OIDC audience claims and SSE callback advertising.
             * Required when deploying behind reverse proxies (Nginx/Caddy) where
             * the internal host:port bindings do not match the public-facing URL.
             * Example: 'https://mcp.neo.mjs.com/knowledge-base'
             * @type {string|null}
             */
            publicUrl: {env: 'NEO_PUBLIC_URL', default: null, parse: Env.parseUrl},
            /**
             * Optional Express middleware function for authentication (only used if transport is 'sse').
             * @type {Function|null}
             */
            authMiddleware: {default: null},
            /**
             * Authentication configuration for the server (OAuth 2.1 / OIDC).
             * Only used when transport is 'sse'.
             * @type {Object}
             */
            auth: {
                host              : {env: 'NEO_AUTH_HOST', default: AiConfig.auth.host, parse: Env.parseString},
                port              : {env: 'NEO_AUTH_PORT', default: AiConfig.auth.port, parse: Env.parsePort},
                realm             : {env: 'NEO_AUTH_REALM', default: AiConfig.auth.realm, parse: Env.parseString},
                issuerUrl         : {env: 'NEO_AUTH_ISSUER_URL', default: AiConfig.auth.issuerUrl, parse: Env.parseString},
                clientId          : {env: 'NEO_OAUTH_CLIENT_ID', default: AiConfig.auth.clientId, parse: Env.parseString},
                clientSecret      : {env: 'NEO_OAUTH_CLIENT_SECRET', default: AiConfig.auth.clientSecret, parse: Env.parseString},
                trustProxyIdentity: {env: 'NEO_AUTH_TRUST_PROXY_IDENTITY', default: AiConfig.auth.trustProxyIdentity, parse: Env.parseBool}
            },
            /**
             * Dummy embedding function — inherited from the Tier-1 single source of truth
             * `AiConfig.dummyEmbeddingFunction` (#12165). Satisfies the ChromaDB API when embeddings
             * are provided manually; the verbose anti-legacy structure (name / getConfig /
             * buildFromConfig) lives once at Tier-1.
             * @returns {Object} The dummy embedding function satisfying IEmbeddingFunction
             */
            dummyEmbeddingFunction: {default: AiConfig.dummyEmbeddingFunction},
            /**
             * The hostname of the ChromaDB server for the knowledge base.
             *
             * Operator env var: `NEO_CHROMA_HOST`. For shared cloud deployments where KB hosts the
             * unified Chroma instance for both KB + MC, this points at the shared cloud-hosted Chroma.
             * @type {string}
             */
            host: {env: 'NEO_CHROMA_HOST', default: AiConfig.engines.chroma.host, parse: Env.parseString},
            /**
             * The port the ChromaDB server for the knowledge base is listening on.
             *
             * Operator env var: `NEO_CHROMA_PORT`. Invalid values (non-integer / out-of-range)
             * fall back to the default with a console warning per the resolver validity contract.
             * @type {number}
             */
            port: {env: 'NEO_CHROMA_PORT', default: AiConfig.engines.chroma.port, parse: Env.parsePort},
            /**
             * The unified Chroma persist directory, read from the single source of truth
             * `AiConfig.engines.chroma.dataDir`. MUST equal the orchestrator daemon's
             * `--path` (kept literal there for daemon-launch resilience against a stale config.mjs).
             * @type {string}
             */
            path: {default: AiConfig.engines.chroma.dataDir},
            /**
             * @summary Shared SQLite destination for Knowledge Base query telemetry.
             *
             * Path to the shared Memory Core SQLite database used for Knowledge Base query telemetry.
             * Mirrors the Neural Link recorder default so `kb_query_log` and `kb_query_faqs`
             * land beside `nl_action_log` without coupling either MCP server's schema.
             * @type {string}
             */
            memoryCoreDbPath: {env: 'NEO_MEMORY_DB_PATH', default: path.join(os.homedir(), '.neo-ai-data', 'memory-core.sqlite'), parse: Env.parseString},
            /**
             * @summary Repetition threshold for promoting KB queries into Agent FAQ clusters.
             *
             * Minimum repeated Knowledge Base queries required before an Agent FAQ becomes
             * eligible for `[KB_DEMAND_GAP]` inference and `list_agent_faqs` reporting.
             * @type {number}
             */
            kbFaqMinCount: {env: 'NEO_KB_FAQ_MIN_COUNT', default: 3, parse: Env.parseNumber},
            /**
             * @summary Calibration threshold for future embedding-backed Agent FAQ clustering.
             *
             * Calibration marker for FAQ clustering. The first implementation uses exact
             * normalized-query grouping as the conservative 1.0 baseline; operators can
             * lower this once embedding-backed similarity is measured against real traffic.
             * @type {number}
             */
            kbFaqSimilarityThreshold: {env: 'NEO_KB_FAQ_SIMILARITY_THRESHOLD', default: 1.0, parse: Env.parseNumber},
            /**
             * @summary Bound for Concept Ontology IDs attached to each Agent FAQ cluster.
             *
             * Maximum number of Concept Ontology IDs attached to each Agent FAQ.
             * @type {number}
             */
            kbFaqConceptLimit: {env: 'NEO_KB_FAQ_CONCEPT_LIMIT', default: 5, parse: Env.parseNumber},
            /**
             * The path to the generated knowledge base JSONL file.
             * @type {string}
             */
            dataPath: {default: path.resolve(neoRootDir, 'dist/ai-knowledge-base.jsonl')},
            /**
             * The path to the generated class hierarchy JSON file.
             * @type {string}
             */
            hierarchyPath: {default: path.resolve(neoRootDir, 'docs/output/class-hierarchy.json')},
            /**
             * Directory for the always-on KB server diagnostic log files. The KB server's
             * `logger.mjs` writes daily-rotated entries here regardless of `debug`, so long-running
             * operations (sync, embedding loops, ChromaDB lifecycle) leave a tail-able diagnostic
             * trail observable from the host shell. Default: `<neoRootDir>/.neo-ai-data/logs/`.
             * @type {string}
             */
            logPath: {default: path.resolve(neoRootDir, '.neo-ai-data/logs')},
            /**
             * @summary Shared MCP logger policy for Knowledge Base.
             *
             * Always-on file sink plus debug-gated stderr. The shared logger reads this
             * per-server policy lazily, so tests and local config overrides can update
             * `logPath` / `debug` before the next write without re-importing the module.
             * @type {Object}
             */
            logger: {default: {
                filePrefix    : 'kb-server',
                fileSink      : true,
                stderrMode    : 'debug',
                timestampStyle: 'plain'
            }},
            /**
             * The name of the ChromaDB collection for the knowledge base.
             * @type {string}
             */
            collectionName: {default: 'neo-knowledge-base'},
            /**
             * When `true` (default), the SourceRegistry auto-registers Neo's
             * 10 curated default Source classes. Cloud deployments that ingest only tenant content
             * can set `false` to skip Neo's curated sources entirely.
             * @type {boolean}
             */
            useDefaultSources: {default: true},
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
            rawRepoSource: {env: 'NEO_KB_RAW_REPO_SOURCE', default: false, parse: Env.parseBool},
            /**
             * When `true` (default), the SourceRegistry auto-registers Neo's
             * built-in Parser classes. The default registry may be empty until parser modules are added.
             * @type {boolean}
             */
            useDefaultParsers: {default: true},
            /**
             * Declarative tenant-supplied Source registration.
             * Each entry: `{SourceClass, sourceName?}`.
             * @type {Array<{SourceClass: Object, sourceName?: string}>}
             */
            customSources: {default: []},
            /**
             * Declarative tenant-supplied Parser registration.
             * Each entry: `{ParserClass, parserId?}`.
             * @type {Array<{ParserClass: Object, parserId?: string}>}
             */
            customParsers: {default: []},
            /**
             * Per-source path overrides keyed by Source-class registry name.
             * Empty entries or missing keys fall through to each Source class's hardcoded fallback
             * (preserves byte-equivalence with existing deployment behavior). Shape varies per Source class —
             * each interprets its own entry shape (string / string-array / path→type object).
             * @type {Object<string,string|string[]|Object<string,string>>}
             */
            sourcePaths: {default: {
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
            }},
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
            defaultTenantId: {env: 'NEO_KB_DEFAULT_TENANT_ID', default: 'neo-shared', parse: Env.parseString},
            /**
             * @summary Default repository slug for Neo's curated Knowledge Base corpus.
             *
             * Included in content hashing and Chroma IDs so byte-identical chunks from different
             * tenant repositories cannot collide.
             * @type {string}
             */
            defaultRepoSlug: {env: 'NEO_KB_DEFAULT_REPO_SLUG', default: 'neo', parse: Env.parseString},
            /**
             * @summary Default read visibility for embedded Knowledge Base chunks.
             *
             * Write paths stamp the authoritative value; tenant-aware read paths consume it for
             * filtering.
             * @type {string}
             */
            defaultVisibility: {env: 'NEO_KB_DEFAULT_VISIBILITY', default: 'team', parse: Env.parseString},
            /**
             * @summary Policy for conflicting client-supplied tenant metadata.
             *
             * `'overwrite'` logs and replaces conflicting `{tenantId, repoSlug, visibility,
             * originAgentIdentity}` fields with server-derived values. `'reject'` fails the
             * embedding call with `KB_TENANT_SPOOF_REJECTED`.
             * @type {'overwrite'|'reject'}
             */
            spoofRejectionMode: {env: 'NEO_KB_SPOOF_REJECTION_MODE', default: 'overwrite', parse: Env.parseString},
            /**
             * The name of the Google Generative AI model for content generation.
             * @type {string}
             */
            modelName: {default: 'gemini-2.5-flash'},
            /**
             * The number of chunks to process in a single batch when embedding.
             * @type {number}
             */
            batchSize: {default: 50},
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
            mcpSyncMaxChunks: {default: 50},
            /**
             * Delay in milliseconds between batches to avoid rate limits.
             * @type {number}
             */
            batchDelay: {default: 10000},
            /**
             * The maximum number of times to retry a failed embedding batch.
             * @type {number}
             */
            maxRetries: {default: 5},
            /**
             * The number of results to fetch from ChromaDB for a query.
             * @type {number}
             */
            nResults: {default: 100},
            /**
             * Weights used in the query scoring algorithm.
             * @type {Object}
             */
            queryScoreWeights: {default: {
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
            }}
        }
    }
}
const instance = Neo.setupClass(Config);

export default createConfigProxy(instance);
