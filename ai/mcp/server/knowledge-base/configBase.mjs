import os                                        from 'os';
import path                                      from 'path';
import ConfigProvider, {createConfigProxy, leaf} from '../../../ConfigProvider.mjs';
import {fileURLToPath}                           from 'url';
import {resolvePlaneDataRoot}                    from '../../../planeConfig.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
// The thin template/operator overlay imports and registers the winning Tier-1 provider before this
// base evaluates. Re-wrap that raw registry instance instead of importing one concrete Tier-1 entry
// here: a runtime operator overlay and the tracked template must never both compete for `Neo.ai.Config`.
const AiConfig   = createConfigProxy(Neo.ai.Config);
const neoRootDir = path.resolve(__dirname, '../../../../');
// The single plane-member anchor (env-free twin resolution — the leaf machinery owns env binding).
const planeDataRoot = resolvePlaneDataRoot({rootDir: neoRootDir});

// Per-worker-unique Chroma test database, generated at config-load. Each Playwright worker is a
// separate process that re-evaluates this module, so `fullyParallel` workers never share one.
// Generated here rather than inside a leaf default so the leaves stay declarative — the same
// rationale Memory Core's config records for its per-worker test collection names.
const kbChromaTestDatabase = `neo-kb-unit-test-${process.pid}`;

/**
 * @summary Extendable defaults and formulas for the Knowledge Base MCP server.
 *
 * Configuration manager for the Knowledge Base MCP server.
 * Supports loading configuration from a custom file and merging with defaults.
 *
 * @class Neo.ai.mcp.server.knowledge-base.ConfigBase
 * @extends Neo.ai.ConfigProvider
 */
class ConfigBase extends ConfigProvider {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.knowledge-base.ConfigBase'
         * @protected
         */
        className: 'Neo.ai.mcp.server.knowledge-base.ConfigBase',
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
             * Server transport protocol. Supported values are exactly `stdio` and `streamable-http`.
             * @type {string}
             */
            transport: leaf('stdio', 'NEO_TRANSPORT', 'string'),
            /**
             * Absolute path to this server's OpenAPI tool-contract file. The env binding is the
             * test-isolation seam: a parallel test run points its server instance at a scratch
             * copy so tool-contract mutations never corrupt the canonical file — extensible per
             * server via the `NEO_AI_MCP_<SERVER>_OPENAPI_PATH` naming convention. Owning the
             * default AND the env binding here (instead of a module-level `process.env` read at
             * the consumer) keeps the config-is-SSOT contract: no consumer re-derives from env,
             * no consumer holds a hidden default.
             * @type {string}
             */
            openApiPath: leaf(path.join(__dirname, 'openapi.yaml'), 'NEO_AI_MCP_KB_OPENAPI_PATH', 'string'),
            /**
             * Port the MCP server's Streamable HTTP transport listens on (only used when
             * `transport === 'streamable-http'`).
             *
             * Operator env var: `MCP_HTTP_PORT`.
             * @type {number}
             */
            mcpHttpPort: leaf(3000, 'MCP_HTTP_PORT', 'port'),
            /**
             * Optional public canonical URL for this MCP server.
             * When configured, this URL is explicitly used as the resource indicator
             * for OAuth 2.1 / OIDC audience claims and protected-resource advertising.
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
             * Optional Express middleware function for authentication (only used when
             * `transport === 'streamable-http'`).
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
            // Plane-anchored, sharing Memory Core's relative path: same env, SAME artifact. `KBRecorderService` /
            // `RecorderService` write telemetry tables into it, while the readers (`GapInferenceEngine`,
            // `DreamService`) resolve MC's `storagePaths.graph`. The previous homedir default therefore split
            // writers from readers on any seat with the env unset — the recorders wrote to a file the
            // consumers never open, and gap inference silently produced no edges. Converging the default is
            // the repair.
            memoryCoreDbPathProd: leaf(path.resolve(planeDataRoot, 'sqlite/memory-core-graph.sqlite'), 'NEO_MEMORY_DB_PATH', 'string',
                {planeMember: false, planeMemberReason: 'consumer of the Memory Core graph SQLite, not its owner: MC declares `storagePaths.graphProd` and asserts it at its own boot. Mirrors the Chroma persist-dir precedent in this file — a shared artifact is claimed by its owner and not re-claimed by consumers, so one boot failure names one cause instead of three.'}),
            /**
             * @summary Per-process test destination for shared KB/NL telemetry.
             * @type {string}
             */
            memoryCoreDbPathTest: leaf(
                path.join(os.tmpdir(), `neo-memory-core-test-${process.pid}.sqlite`),
                'NEO_TELEMETRY_DB_PATH_TEST',
                'string'
            ),
            /**
             * @summary Selects the disposable telemetry database under Playwright.
             * @type {boolean}
             */
            memoryCoreDbUseTestDatabase: leaf(false, 'UNIT_TEST_MODE', 'boolean'),
            /**
             * @summary Selects disposable telemetry storage in every Playwright mode, including
             * integration/E2E modes which deliberately do not claim UNIT_TEST_MODE semantics.
             * @type {boolean}
             */
            memoryCoreDbUseTestHarness: leaf(false, 'NEO_TEST_CONFIG_TEMPLATES', 'boolean'),
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
             * @summary Dedicated per-task model config for `ask_knowledge_base` answer synthesis.
             *
             * `SearchService.ask` resolves THIS block — not the global `modelProvider` — so the
             * interactive RAG path can use a fast remote model (Gemini Flash, ~5-10s) while bulk chat
             * (miniSummary / sessionSummary / graph extraction) stays on the local provider. The prior
             * global-provider coupling forced `ask` onto the slow local gemma (~287s measured), at or past
             * the MCP request-timeout ceiling.
             *
             * Cost-safety, and why the DEFAULT is now local. The controls below are all bounds on a
             * metered call: (1) `maxCallsPerMinute` runaway breaker — a real incident hammered a
             * shared key at ~1,200 calls/min; (2) `apiKey` is a DEDICATED env-only key so the cloud
             * budget can be hard-capped on just this path. Both assume the call happens and try to
             * limit the damage. They did not prevent ~EUR 70/month of steady-state spend, and they
             * cannot do anything at all about a key a peer has already exposed.
             *
             * So the default is the local model instead. Cost-bounding machinery beats an unbounded
             * remote default, but no remote default beats both — an `ask` that never leaves the box
             * has no meter to run and no key to leak. Remote synthesis is preserved and unchanged:
             * `provider: 'gemini'` + `NEO_KB_ASK_API_KEY`, one deliberate env var, for anyone who
             * wants cloud latency and is choosing to pay for it.
             * @type {Object}
             */
            askSynthesis: {
                // Provider for the ask path: 'openAiCompatible' (local, DEFAULT) | 'ollama' (local) |
                // 'gemini' (remote — opt-in, metered, and it must stay opt-in).
                //
                // The default moved remote -> LOCAL. A cloud default is a standing charge on every
                // `ask`, and it billed ~EUR 70/month while a peer additionally EXPOSED the dedicated
                // ask key. The cost-safety machinery below (runaway breaker, dedicated env-only key,
                // budget cap) all presupposes a metered remote call; making the default local removes
                // the meter instead of bounding it. Remote synthesis stays one env var away for
                // anyone who wants it, and now costs a deliberate act rather than silence.
                provider: leaf('openAiCompatible', 'NEO_KB_ASK_PROVIDER', 'string'),
                // The deployment's agreed chat model, matching `openAiCompatible.model` in
                // `ai/configBase.mjs`. 26b was chosen over 31b on measured performance grounds; ask
                // does not get to pick a different one, or LM Studio JIT-loads a SECOND resident
                // chat model beside the one already serving traffic.
                model: leaf('google/gemma-4-26b-a4b', 'NEO_KB_ASK_MODEL', 'string'),
                /**
                 * @summary SECURITY - the ask-synthesis API key. Read ONLY from `NEO_KB_ASK_API_KEY`.
                 *
                 * NEVER inline a key here or in the generated `config.mjs`: this `config.template.mjs` is
                 * git-TRACKED, so a literal would ship to the repo; and a secret on disk (even the gitignored
                 * `config.mjs`) risks accidental `git add -f`, backups, and leaks. The environment is the
                 * only secure channel - the `leaf` default stays `null` and the env-binding resolves the key
                 * at config-construct time (read the resolved leaf at the use site, never inline). A DEDICATED
                 * key (separate from any shared `GEMINI_API_KEY`) lets the operator hard-cap the cloud budget
                 * on just the ask path, containing the blast radius of a runaway.
                 * @type {string|null}
                 */
                apiKey: leaf(null, 'NEO_KB_ASK_API_KEY', 'string'),
                // Local-endpoint override for 'ollama' / 'openAiCompatible' - set when the ask model runs on
                // its OWN endpoint (3-local-model setup: embed + summary + ask each on its own port). null ->
                // the provider's configured default host. Unused for 'gemini'.
                baseUrl: leaf(null, 'NEO_KB_ASK_BASE_URL', 'string'),
                /**
                 * @summary Timeout budget (ms) for LOCAL-class ask-synthesis `generateContent` calls
                 * (`ollama` + `openAiCompatible`).
                 *
                 * Bounds the single chat-model call so the query fails fast and returns its
                 * already-retrieved ranked references (the degraded envelope,
                 * `#createDegradedSynthesisResponse`) instead of hanging. Passed to the provider as
                 * `options.timeoutMs`. 300s is a NEAR-EMPIRICAL ceiling, not a guess: a 31B-class
                 * local model has been benchmarked needing ~287s for a single ask synthesis —
                 * lowering this default breaks every local deployment's synthesis outright.
                 * `openAiCompatible` deliberately uses this local-class budget even when pointed at
                 * a remote endpoint (false-long merely waits; false-short breaks working setups).
                 * The always-remote provider class uses `timeoutMsRemote` below instead.
                 * @type {number}
                 */
                timeoutMs: leaf(300000, 'NEO_KB_ASK_SYNTHESIS_TIMEOUT_MS', 'number'),
                /**
                 * @summary Timeout budget (ms) for REMOTE-class ask-synthesis calls (`gemini`).
                 *
                 * The remote default answers in ~5-10s, so a call still pending at 60s is a hung
                 * provider, not a slow one: degrade to references in about a minute instead of
                 * pinning an interactive caller for the local-class 5-minute ceiling. Selected at
                 * the use site by provider class; the two budgets are independent knobs because no
                 * single value can serve both a 10-second remote and a 5-minute local synthesis.
                 * @type {number}
                 */
                timeoutMsRemote: leaf(60000, 'NEO_KB_ASK_SYNTHESIS_TIMEOUT_MS_REMOTE', 'number'),
                /**
                 * @summary Runaway breaker - max ask-synthesis calls per rolling 60s window.
                 *
                 * Interactive agent use sits far below this; a scripted runaway (the incident class,
                 * ~1,200/min) trips it and `ask` returns a degraded `rate_limited` response (references kept)
                 * instead of issuing the call. Defense-in-depth alongside the dedicated spend-capped key.
                 * @type {number}
                 */
                maxCallsPerMinute: leaf(20, 'NEO_KB_ASK_MAX_RPM', 'number'),
                /**
                 * @summary Reasoning-effort for the ask-synthesis call — passed straight through as the
                 * OpenAI / LM-Studio `reasoning_effort` request param.
                 *
                 * Default `'none'` disables a reasoning model's hidden "thinking" pass. Measured on a
                 * 26B-class local model with a ~7,900-token grounded prompt: `'none'` answered in 33.3s,
                 * while sending no control took 86.7s and returned an EMPTY answer — 297 of 299
                 * completion tokens were spent reasoning, leaving nothing for the response. The empty
                 * answer is the defect the latency merely accompanies: a longer prompt exhausts the
                 * budget sooner, so a wall-clock-only check would miss it.
                 *
                 * This leaf belongs to `askSynthesis` rather than beside `localModels.chat`'s
                 * `summaryReasoningEffort` / `graphReasoningEffort`, because ask builds its model from
                 * THIS block (`SearchService.ask`: "the dedicated askSynthesis block, NOT the global")
                 * and may point at an entirely different provider, model, and endpoint. A leaf on the
                 * chat model would tune a model the ask path does not use.
                 *
                 * Deliberately NOT in `askSynthesisGuard`'s required-leaf set: an overlay predating this
                 * leaf must keep answering with today's behaviour, not refuse. Refusing to answer is a
                 * worse failure than answering slowly, and this leaf exists to improve answers.
                 * @type {string}
                 */
                reasoningEffort: leaf('none', 'NEO_KB_ASK_REASONING_EFFORT', 'string'),
                /**
                 * @summary Total character budget for the assembled ask-synthesis context.
                 *
                 * `limit` bounds the NUMBER of retrieved documents; nothing bounded their SIZE. The
                 * context was every hit's whole file joined together, so request cost was decided by
                 * whatever ranked top-`limit`: one guide in the corpus is ~18,800 tokens by itself, and
                 * the five largest total ~73,900. Two large documents therefore exceed a deadline that
                 * five small ones fit inside — which is why lowering `limit` relocates the cliff instead
                 * of removing it, and why this bound is on characters rather than on document count.
                 *
                 * Characters, not tokens: a character budget is exact and provider-independent, while a
                 * token budget needs the selected model's tokenizer and would silently mis-bound the
                 * moment the ask model changes — and the ask model is expected to change.
                 *
                 * `0` disables the bound, and that is the ONLY way it is disabled — an operator setting
                 * it deliberately. An overlay predating this leaf still resolves the declared default:
                 * the generated `config.mjs` is a thin singleton extending this base and declaring no
                 * data of its own, so a leaf added here reaches every overlay. Measured rather than
                 * assumed — a three-week-old overlay containing zero occurrences of `askSynthesis`
                 * answers ask requests today.
                 *
                 * That is why the use site reads this leaf with NO fallback: a `|| 0` there could never
                 * fire for the stale-overlay case it was written for, and could only disable the bound
                 * if something else went wrong. Deliberately NOT in `askSynthesisGuard`'s required-leaf
                 * set: a genuinely missing `askSynthesis` block is caught loudly upstream in
                 * `SearchService.construct`, which degrades to references with the migration remedy
                 * named, so a second gate here would add nothing but a worse message.
                 * @type {number}
                 */
                contextBudgetChars: leaf(48000, 'NEO_KB_ASK_CONTEXT_BUDGET_CHARS', 'number'),
                /**
                 * @summary Per-document character cap within {@link #contextBudgetChars}.
                 *
                 * A total-only budget lets ONE oversized document consume all of it, so the synthesis
                 * sees a single truncated file and none of the other hits — a ranked-second document
                 * that would have answered the question never reaches the prompt. Capping each
                 * document's contribution keeps the context representative of the retrieval, which is
                 * the property a citation-bearing answer depends on.
                 *
                 * `0` disables the per-document cap while leaving the total budget in force, and — as
                 * with the leaf above — that is an operator's deliberate act rather than something a
                 * stale overlay can cause.
                 * @type {number}
                 */
                contextMaxCharsPerDocument: leaf(12000, 'NEO_KB_ASK_CONTEXT_MAX_CHARS_PER_DOC', 'number'),
                /**
                 * @summary How many ask syntheses may be in flight at once.
                 *
                 * Ask dispatches through a serializing admission queue, so two asks arriving seconds
                 * apart are served one after the other REGARDLESS of how much idle capacity the
                 * serving endpoint has — the bound is admission, not the endpoint. Provisioning more
                 * serving capacity without raising this leaves idle replicas behind a queued second
                 * ask, and the symptom reads as "the model is slow" rather than "the queue admitted
                 * one".
                 *
                 * `1` is the default and reproduces today's behaviour exactly. Raise it ONLY when ask
                 * has its own serving endpoint (`baseUrl` above): against a SHARED endpoint, extra
                 * parallelism moves contention downstream into the model server instead of removing
                 * it, and it competes with the full-power summarisation lane this separation exists to
                 * protect.
                 *
                 * Size it to the host's real headroom and the number of dev agents, not to an
                 * aspiration — each in-flight synthesis holds its own context. Absent in an overlay
                 * predating this leaf resolves to `1`, so an unmigrated clone keeps serializing rather
                 * than silently acquiring concurrency the host may not survive.
                 * @type {number}
                 */
                maxParallel: leaf(1, 'NEO_KB_ASK_MAX_PARALLEL', 'number')
            },
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
             * @summary Durable resume-state directory for Knowledge Base shadow-swap embeddings.
             *
             * This is a declared plane member: production defaults derive from the single KB plane
             * anchor, while relocated profiles place it explicitly through the env binding.
             * `VectorService.resumeStateDir` remains an explicit test seam, never a second default.
             * @type {string}
             */
            embeddingResumeStateDir: leaf(
                path.resolve(planeDataRoot, 'kb-sync'),
                'NEO_KB_EMBEDDING_RESUME_STATE_DIR',
                'string',
                {planeMember: true}
            ),
            /**
             * Directory for the always-on KB server diagnostic log files. The KB server's
             * `logger.mjs` writes daily-rotated entries here regardless of `debug`, so long-running
             * operations (sync, embedding loops, ChromaDB lifecycle) leave a tail-able diagnostic
             * trail observable from the host shell. Default: `<neoRootDir>/.neo-ai-data/logs/`.
             * @type {string}
             */
            logPath: leaf(path.resolve(planeDataRoot, 'logs'), 'NEO_KB_LOG_PATH', 'string', {planeMember: true}),
            /**
             * @summary Retention policy for Knowledge Base MCP diagnostic log files.
             *
             * The shared logger applies this policy only to files matching the `kb-server`
             * prefix in `logPath`. `maxFiles` and `maxTotalBytes` count historical files;
             * the active current-day file is always preserved. Set `enabled=false` to
             * delegate retention entirely to deployment infrastructure.
             * @type {Object}
             */
            loggerRetention: {
                enabled      : leaf(true, 'NEO_KB_LOG_RETENTION_ENABLED', 'boolean'),
                maxAgeDays   : leaf(14, 'NEO_KB_LOG_RETENTION_MAX_AGE_DAYS', 'number'),
                maxFiles     : leaf(30, 'NEO_KB_LOG_RETENTION_MAX_FILES', 'number'),
                maxTotalBytes: leaf(100 * 1024 * 1024, 'NEO_KB_LOG_RETENTION_MAX_TOTAL_BYTES', 'number')
            },
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
             * @summary Chroma database name in production. Memory Core already isolates its Chroma
             * writes this way; the Knowledge Base did not, so a `unit/` spec could reach the live
             * canonical collection because its client passed no `database` at all.
             * @type {String}
             */
            chromaDatabaseProd: leaf('default_database', 'NEO_KB_CHROMA_DATABASE', 'string'),
            /**
             * @summary Chroma database under Playwright — droppable, and per-worker so `fullyParallel`
             * workers never share one.
             * @type {String}
             */
            chromaDatabaseTest: leaf(kbChromaTestDatabase, 'NEO_KB_CHROMA_DATABASE_TEST', 'string'),
            /**
             * @summary Selects the disposable Chroma database. Same shape as the telemetry toggle
             * above, deliberately: one mechanism for test isolation, not a second beside it.
             * @type {Boolean}
             */
            chromaUseTestDatabase: leaf(false, 'UNIT_TEST_MODE', 'boolean'),
            /**
             * @summary Bounded retry policy for resolving the canonical Chroma KB collection.
             *
             * Long-running syncs can overlap a local Chroma restart or recycle. `ChromaManager`
             * consumes these leaves only for transient `ChromaConnectionError` failures while
             * resolving the canonical collection name; not-found and shadow-swap promotion paths
             * keep their existing handling. `maxAttempts` includes the initial call.
             * @type {Object}
             */
            collectionResolveRetry: {
                maxAttempts    : leaf(5,    'NEO_KB_COLLECTION_RESOLVE_RETRY_MAX_ATTEMPTS', 'number'),
                initialDelayMs : leaf(500,  'NEO_KB_COLLECTION_RESOLVE_RETRY_INITIAL_DELAY_MS', 'number'),
                maxDelayMs     : leaf(2000, 'NEO_KB_COLLECTION_RESOLVE_RETRY_MAX_DELAY_MS', 'number'),
                maxTotalDelayMs: leaf(5000, 'NEO_KB_COLLECTION_RESOLVE_RETRY_MAX_TOTAL_DELAY_MS', 'number')
            },
            /**
             * @summary The Knowledge Base embedding-probe policy. Deployment-tunable, because the
             * hardware it runs on is not.
             *
             * These five values previously lived as a frozen literal in `HealthService.mjs` and were
             * byte-identical to Memory Core's leaf defaults — the same policy, one side configurable
             * and one side not. On CPU-only hardware the 30-second deadline sits below the observed
             * completion time of a single embed, so the probe fails permanently while the embedder is
             * working, and no deployment could reach the number.
             *
             * `timeoutMs` is a CONSUMER deadline, not a provider bound. Exceeding it does not stop the
             * provider — it stops this process waiting — so a value below typical completion converts a
             * slow embedder into a service that reports itself broken.
             *
             * Mirrors `memory-core`'s `healthcheck.embeddingWriteCanary*` set; the vocabulary differs
             * (KB probes, MC runs a write canary) but the policy is the same shape and the defaults are
             * deliberately unchanged, so this introduces configurability and no behaviour change.
             * @type {Object}
             */
            healthcheck: {
                /**
                 * Consumer-side deadline for one embedding probe attempt. Sized against the SLOWEST
                 * embed the deployment expects, not the typical one — a probe that clips its own
                 * provider reports a false negative and cannot distinguish that from a real outage.
                 * @type {number}
                 */
                embeddingProbeTimeoutMs: leaf(30000, 'NEO_KB_HEALTHCHECK_EMBEDDING_PROBE_TIMEOUT_MS', 'number'),
                /**
                 * The probe producer's attempt period. A liveness check NEVER triggers a probe run —
                 * `healthcheck` is a cheap read of the gate's current truth — so a container probe
                 * interval is free to differ from this cadence. `<= 0` disables the producer.
                 * @type {number}
                 */
                embeddingProbeCadenceMs: leaf(60000, 'NEO_KB_HEALTHCHECK_EMBEDDING_PROBE_CADENCE_MS', 'number'),
                /**
                 * Staleness floor for the last healthy result: how long a success stays authoritative
                 * before the gate re-probes.
                 * @type {number}
                 */
                embeddingProbeHealthyTtlMs: leaf(60000, 'NEO_KB_HEALTHCHECK_EMBEDDING_PROBE_HEALTHY_TTL_MS', 'number'),
                /**
                 * First backoff step after a failed probe. Failures are NOT cached like successes —
                 * a failing probe re-runs on its backoff schedule rather than serving a stale failure.
                 * @type {number}
                 */
                embeddingProbeFailureTtlMs: leaf(30000, 'NEO_KB_HEALTHCHECK_EMBEDDING_PROBE_FAILURE_TTL_MS', 'number'),
                /**
                 * Backoff ceiling. Binds at first gate creation, so raising it does not shorten a
                 * backoff already in flight.
                 * @type {number}
                 */
                embeddingProbeFailureTtlMaxMs: leaf(600000, 'NEO_KB_HEALTHCHECK_EMBEDDING_PROBE_FAILURE_TTL_MAX_MS', 'number')
            },
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
             * @type {Array<{SourceClass: Object, sourceName: string}>}
             */
            customSources: leaf([]),
            /**
             * Declarative tenant-supplied Parser registration.
             * Each entry: `{ParserClass, parserId?}`.
             * @type {Array<{ParserClass: Object, parserId: string}>}
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
                ProtoSource       : 'proto',
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
            modelName: leaf('gemini-3.5-flash'),
            /**
             * The number of chunks to process in a single batch when embedding.
             *
             * This is the **durable unit on the failure arm**: `VectorService.embedChunks` embeds a
             * whole slice in one `TextEmbeddingService.embedTexts` call and upserts only after it
             * returns, so a provider failure loses the entire slice. On a starved provider that makes
             * it the size of the smallest bet the pipeline can win — which is why it carries an env
             * override: an operator whose corpus will not start needs to shrink the bet until one
             * batch lands, and a single landed batch is permanent.
             *
             * **Not universally atomic** — a cooperative heavy-maintenance yield persists the prefix it
             * already paid for and records a resume marker. Failure loses the slice; a yield does not.
             * @type {number}
             */
            batchSize: leaf(50, 'NEO_KB_EMBEDDING_BATCH_SIZE', 'positiveInt'),
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
             *
             * Overridable because it is coupled to `batchSize`: shrinking the durable unit multiplies
             * how many times this delay is paid, so an operator recovering a stalled corpus needs both
             * dials or the smaller batch turns a repair into an overnight run.
             * @type {number}
             */
            batchDelay: leaf(10000, 'NEO_KB_EMBEDDING_BATCH_DELAY_MS', 'nonNegativeInt'),
            /**
             * The TOTAL number of attempts allowed for one embedding batch — not the number of
             * retries on top of a first try.
             *
             * The name is legacy and the loop is the authority: `while (retries < maxRetries)` with
             * `retries` starting at zero, so `5` buys five provider calls in total, not six. Stated
             * explicitly because the JSDoc previously said "the maximum number of times to retry",
             * which reads as one initial attempt plus N — an off-by-one an operator would only
             * discover from a bill.
             *
             * That also fixes the domain: `1` is the meaningful floor (one attempt, no retry) and
             * `0` is not a smaller setting but a broken one, since it skips the loop entirely and
             * returns a clean zero-embedded result with no provider call at all.
             *
             * Overridable so an operator can bound what a doomed batch costs: against a provider that
             * never answers, every attempt is paid at the full embedding timeout before the batch is
             * given up on.
             * @type {number}
             */
            maxRetries: leaf(5, 'NEO_KB_EMBEDDING_MAX_RETRIES', 'positiveInt'),
            /**
             * The number of results to fetch from ChromaDB for a query.
             * @type {number}
             */
            nResults: leaf(100),
            /**
             * Candidate budgets for broad `type='all'` queries.
             *
             * These pools run before hybrid scoring so current source/documentation chunks
             * cannot be starved out by high-volume historical corpora such as pull-request
             * conversations. Shares are applied to `nResults` in declaration order.
             * @type {Array}
             */
            queryCandidatePools: leaf([
                {
                    name : 'primary',
                    share: 0.65,
                    types: ['src', 'ai-infrastructure', 'guide', 'concept', 'skill', 'adr']
                },
                {
                    name : 'secondary',
                    share: 0.2,
                    types: ['app', 'example', 'test', 'raw']
                },
                {
                    name : 'historical',
                    share: 0.1,
                    types: ['ticket', 'pull', 'discussion', 'release', 'blog']
                },
                {
                    name : 'custom',
                    share: 0.05
                }
            ]),
            /**
             * Weights used in the query scoring algorithm.
             * @type {Object}
             */
            queryScoreWeights: leaf({
                baseIncrement     : 1,
                sourcePathMatch   : 40,
                fileNameMatch     : 30,
                classNameMatch    : 20,
                guideMatch        : 50,
                conceptMatch      : 15,
                blogMatch         : 5,
                namePartMatch     : 30,
                lexicalRescueMatch: 3200,
                ticketPenalty     : -70,
                pullPenalty       : -250,
                releasePenalty    : -50,
                baseFileBonus     : 20,
                releaseExactMatch : 1000,
                inheritanceBoost  : 80,
                inheritanceDecay  : 0.6
            })
        },
        formulas: {
            'memoryCoreDbPath': data => data.memoryCoreDbUseTestDatabase || data.memoryCoreDbUseTestHarness ?
                data.memoryCoreDbPathTest : data.memoryCoreDbPathProd,
            // Resolved in the config so the manager reads ONE value and carries no inline env ternary.
            // Mirrors `memoryCoreDbPath` above rather than inventing a second selection shape.
            'chromaDatabase': data => data.chromaUseTestDatabase || data.memoryCoreDbUseTestHarness ?
                data.chromaDatabaseTest : data.chromaDatabaseProd
        }
    }
}

/**
 * @summary The plane-member paths this server claims — the enumerable input for the
 * F-invariant's member-coherence clause (`assertPlaneMemberCoherence`), asserted at boot
 * by `Server.getPlaneMembers()`. The Chroma persist dir is Tier-1-owned (`engines.chroma`)
 * and asserted by the Tier-1 member list, not re-claimed here.
 */
export const PLANE_MEMBER_PATHS = Object.freeze([
    'embeddingResumeStateDir',
    'logPath'
]);

export default Neo.setupClass(ConfigBase);
