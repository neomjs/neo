import os                                                          from 'os';
import path                                                        from 'path';
import {fileURLToPath}                                             from 'url';
import ConfigProvider, {leaf}                                      from './ConfigProvider.mjs';
import {CANONICAL_PLANE_ID, parsePlaneIdEnv, resolvePlaneDataRoot} from './planeConfig.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const neoRootDir = path.resolve(__dirname, '../');
// Fallback to neoRootDir if cwd is root (e.g., container/daemon edge cases)
const projectRoot = process.cwd() === '/' ? neoRootDir : process.cwd();
// The single plane-member anchor: every durable data-plane default below derives from this
// const. `resolvePlaneDataRoot` reads no env of its own — the leaf machinery owns all env
// binding — so no member re-derives its own root and no member resolves against ambient cwd.
const planeDataRootDefault  = resolvePlaneDataRoot({rootDir: neoRootDir});
const chromaUnitTestDataDir = path.join(os.tmpdir(), 'neo-chroma-unit-test');

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS  = 24 * HOUR_MS;

/**
 * @summary The extendable Tier-1 configuration BASE — every default leaf and formula of the Agent OS
 * config plane, carried by a non-singleton class so overlays inherit instead of copying.
 *
 * The overlay-drift root fix: `ai/config.mjs` overlays subclass this base and carry DELTA-ONLY
 * `data`, which `Neo.setupClass`'s descriptor-driven hierarchical merge (the `merge: 'deep'`
 * descriptor on the Provider's `data_`) deep-merges over these defaults — a leaf added here reaches
 * every subclass overlay with zero overlay edits. Snapshot-style overlays (full template copies)
 * keep working unchanged: they never import this module and self-register their own singleton.
 *
 * This module has ZERO instantiation side effects — `Neo.setupClass` registers the class only
 * (non-singleton). The eager `Neo.ai.Config` singleton lives in `ai/config.template.mjs`, whose
 * side-effect import the Tier-2 server templates rely on for `getParent` registry resolution.
 *
 * @class Neo.ai.ConfigBase
 * @extends Neo.ai.ConfigProvider
 */
class ConfigBase extends ConfigProvider {
    static config = {
        /**
         * @member {String} className='Neo.ai.ConfigBase'
         * @protected
         */
        className: 'Neo.ai.ConfigBase',
        /**
         * Top-level meta-leaf configuration tree (Tier 1).
         * Defines the core immutable plain-data structures applied universally across all AI/MCP infrastructure.
         * Each leaf owns a `default` plus optional `env` (variable name) and `type` (selecting the env decoder + validator).
         * @member {Object} data
         */
        data: {
            neoRootDir : leaf(neoRootDir),
            projectRoot: leaf(projectRoot),
            /**
             * The declared plane-identity subtree — the first-class object the data-root
             * placement election decides placement FOR. These leaves declare FROM
             * `ai/planeConfig.mjs`, which must never grow an env read or a resolver of its own:
             * env binding belongs to the leaf, alone. A second resolution path beside the leaf
             * is precisely what the retired shape was — two resolvers for one value, free to
             * disagree — and it was removed, not shrunk: the exported defaults map and env-name
             * map are both gone, and the one surviving constant crosses the boundary only
             * because the boot coherence assertion must compare against the same literal this
             * leaf declares. Growing that surface back re-creates the drift channel.
             * Three concepts, never conflated: `id` is opaque identity (no path/checkout content);
             * `dataRoot` is the resolved evidence every plane-member leaf derives from;
             * `NEO_AI_CANONICAL_ROOT` (provisioning-time, `bootstrapWorktree.mjs`) names a
             * checkout and is deliberately NOT part of this subtree.
             * @member {Object} data.plane
             */
            plane: {
                /**
                 * Stable opaque plane identity. Overlays, cloud deployments, and ephemeral
                 * isolation planes (Option F overlays) override via env; equality of `planeId`
                 * is the ONLY sanctioned "same plane?" predicate — never path comparison.
                 * The env layer routes through `parsePlaneIdEnv`, carried on this leaf's own
                 * `parse` hook, so a path-shaped override fails loud at boot — the opacity
                 * invariant holds on RESOLVED values, not only on the frozen default the load
                 * guard covers.
                 * @type {string}
                 */
                id: leaf(CANONICAL_PLANE_ID, 'NEO_PLANE_ID', 'string', {parse: parsePlaneIdEnv}),
                /**
                 * The durable data root this process resolved for the declared plane — the single
                 * anchor plane-member leaves derive from via `path.join`-style derivations, each
                 * member keeping its own env escape.
                 * @type {string}
                 */
                dataRoot: leaf(planeDataRootDefault, 'NEO_PLANE_DATA_ROOT', 'string', {planeMember: false, planeMemberReason: 'the anchor itself — members derive from it; it is not its own member'})
            },
            /**
             * Turn-end stop-hook policy — two INDEPENDENT axes that were previously welded to one
             * all-or-nothing enforcement flag (`NEO_LANE_STATE_ENFORCE`), so switching off the
             * expensive apparatus also switched off the cheap, effective mirror.
             *
             * The turn-end hooks are thread-entrypoints: they bootstrap `Neo` + `core/_export` and
             * read these leaves at the use site, so these stay plain declarative leaves with no
             * companion defaults module. Measured: bootstrap plus resolve is ~50ms against the hook's
             * 10s budget, so the extra indirection would buy nothing.
             * @member {Object} data.stopHook
             */
            stopHook: {
                /**
                 * Reflect helpful-assistant register slips ("would you like me to…?") back as the
                 * equal-peer reminder. One injected paragraph, no forced continuation behind it —
                 * cheap, and the part that empirically earns its cost.
                 * @type {boolean}
                 */
                deferenceMirror: leaf(true, 'NEO_STOP_HOOK_DEFERENCE_MIRROR', 'boolean'),
                /**
                 * The no-hold forced-continuation apparatus: refusing turn-ends, the lane-state JSON
                 * terminal contract, the drive-ratchet, the clean-terminal / material-artifact
                 * acceptance edges, and the injected lifecycle directive.
                 *
                 * Defaults OFF (operator-directed, 2026-07-25). Measured over a 26h window:
                 * ONE refusal spawns a median-20-message continuation chain (mean 34.4, p90 78,
                 * max 239) costing ~1.79M full-rate-equivalent tokens, because every message re-reads
                 * a context that is deep precisely because the session is late — 30.1% of all billed
                 * volume. This is an L3_No_Hold_State teeth change and therefore Tier-4 authority:
                 * operator/deployment-owned, never self-licensable by an agent mid-turn.
                 * @type {boolean}
                 */
                laneContinuation: leaf(false, 'NEO_STOP_HOOK_LANE_CONTINUATION', 'boolean')
            },
            /**
             * The current in-flight release version whose milestone / epic work counts as "current
             * release focus" for the Golden Path emitter. Set at cut-prep, advanced by
             * `buildScripts/release/publish.mjs` at release — so a shipped release never lingers as
             * current focus (the release-gate-blind class). Consumers read it at the use site; never
             * a hardcoded release literal.
             * @type {string}
             */
            currentReleaseVersion: leaf('v13.2', 'NEO_CURRENT_RELEASE', 'string'),
            /**
             * Universal JSONL backup/export directory for Agent OS databases.
             * @type {string}
             */
            backupPath: leaf(path.resolve(planeDataRootDefault, 'backups'), 'NEO_BACKUP_PATH', 'string', {planeMember: true}),
            /**
             * Path to the wake-daemon liveness sentinel touched on every swarm-heartbeat
             * pulse. Operators / tests can isolate the path via `NEO_HEARTBEAT_ALIVE_PATH`.
             * @type {string}
             */
            wakeDaemonHeartbeatAlivePath: leaf(path.resolve(planeDataRootDefault, 'wake-daemon/heartbeat.alive'), 'NEO_HEARTBEAT_ALIVE_PATH', 'string', {planeMember: true}),
            /**
             * Fleet Manager supervision leaves: where per-agent harness instance homes live and
             * which binary each harness family launches. The lifecycle service reads these at the
             * use site (`FleetLifecycleService.getInstanceRoot` / `getHarnessBinaryPath`) — the
             * SSOT owning default + env binding; the service holds no default shadow.
             */
            fleet: {
                /**
                 * Absolute root under which per-agent isolated harness config/state homes
                 * (`CODEX_HOME` / `CLAUDE_CONFIG_DIR`) are derived — the sibling of the managed
                 * checkouts root.
                 * @type {string}
                 */
                instanceRoot   : leaf(path.resolve(planeDataRootDefault, 'fleet/instances'), 'NEO_FLEET_INSTANCE_ROOT', 'string', {planeMember: true}),
                harnessBinaries: {
                    /**
                     * The antigravity harness binary — the app-bundle MAIN binary (a directly
                     * spawnable, supervisable child), never an `open -n` launcher. macOS default;
                     * other hosts pin this leaf.
                     * @type {string}
                     */
                    antigravity: leaf('/Applications/Antigravity.app/Contents/MacOS/Antigravity', 'NEO_FLEET_ANTIGRAVITY_BIN', 'string'),
                    /**
                     * The claude-code harness binary — PATH-resolved by default.
                     * @type {string}
                     */
                    claudeCode: leaf('claude', 'NEO_FLEET_CLAUDE_CODE_BIN', 'string'),
                    /**
                     * The claude-desktop harness binary — the app-bundle MAIN binary (a directly
                     * spawnable, supervisable child), never an `open -n` launcher. macOS default;
                     * other hosts pin this leaf.
                     * @type {string}
                     */
                    claudeDesktop: leaf('/Applications/Claude.app/Contents/MacOS/Claude', 'NEO_FLEET_CLAUDE_DESKTOP_BIN', 'string'),
                    /**
                     * The codex harness binary. The default is the ChatGPT-app-bundled CLI — an
                     * alpha channel that self-updates with its app; production fleets pin this
                     * leaf, and the lifecycle status's `binaryVersion` surfaces what actually ran.
                     * @type {string}
                     */
                    codex: leaf('/Applications/ChatGPT.app/Contents/Resources/codex', 'NEO_FLEET_CODEX_BIN', 'string'),
                    /**
                     * The Codex Desktop packaged MAIN binary — directly spawnable and supervised.
                     * Its private app-profile/project/updater capabilities are probed from the
                     * installed bundle before every first spawn; this leaf only owns executable
                     * location, never compatibility policy.
                     * @type {string}
                     */
                    codexDesktop: leaf('/Applications/ChatGPT.app/Contents/MacOS/ChatGPT', 'NEO_FLEET_CODEX_DESKTOP_BIN', 'string')
                }
            },
            /**
             * Global debug flag for all AI processes.
             * @type {boolean}
             */
            debug: leaf(false, 'NEO_DEBUG', 'boolean'),
            /**
             * Server transport protocol. Supported values are exactly `stdio` and `streamable-http`.
             * @type {string}
             */
            transport: leaf('stdio', 'NEO_TRANSPORT', 'string'),
            /**
             * Optional public canonical URL.
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
             * Hostname (or full `protocol://host` URL) the Streamable HTTP transport advertises when
             * `publicUrl` is unset. Bare hostnames infer their protocol by convention (http for
             * localhost/127.0.0.1, https otherwise); values containing '://' are parsed verbatim.
             * Bound to the platform-standard `HOST` env var. Consumed by TransportService.setup.
             * @type {string}
             */
            mcpHttpHost: leaf('localhost', 'HOST', 'string'),
            /**
             * @summary Optional actual listener bind for the Streamable HTTP transport.
             *
             * When absent, the
             * existing `app.listen(port)` behavior is preserved. Local-bearer mode requires the
             * literal IPv4 loopback address `127.0.0.1`; advertised-host behavior remains owned by
             * `mcpHttpHost` / `publicUrl`.
             * @type {string|null}
             */
            mcpListenHost: leaf(null, 'NEO_MCP_LISTEN_HOST', 'string'),
            /**
             * Port the MCP server's Streamable HTTP transport listens on.
             * Sub-servers will typically override this with their own defaultPort.
             * @type {number}
             */
            mcpHttpPort: leaf(3000, 'MCP_HTTP_PORT', 'port'),
            /**
             * Optional Express middleware function for authentication.
             * @type {Function|null}
             */
            authMiddleware: leaf(null),
            /**
             * Base authentication configuration for the Streamable HTTP transport.
             *
             * `mode` selects the authorization strategy:
             * - `'oidc'` (default, production): OAuth 2.1 / OIDC bearer tokens validated via
             *   RFC 7662 introspection, with `aud` audience enforcement and Protected-Resource-
             *   Metadata advertisement.
             * - `'gitlab-pat'`: a GitLab Personal Access Token (`read_user` scope) presented as the
             *   bearer token, validated against `{gitlabApiBaseUrl}/api/v4/user`. No `aud` claim and
             *   no PRM advertisement (a naked `401` on failure) — the lighter path for clients that
             *   authenticate with a long-lived PAT from an env var instead of an OAuth dance.
             * - `'github-pat'`: a GitHub Personal Access Token (classic or fine-grained) presented
             *   as the bearer token, validated against `{githubApiBaseUrl}/user`. Same naked-401
             *   contract as `'gitlab-pat'`; the resolved GitHub login becomes the caller identity.
             * - `'local-bearer'`: a generated process-lifetime possession credential for an
             *   explicitly loopback-bound listener. It performs no identity lookup or provisioning.
             * @type {Object}
             */
            auth: {
                host              : leaf(null, 'NEO_AUTH_HOST', 'string'),
                port              : leaf(8080, 'NEO_AUTH_PORT', 'port'),
                realm             : leaf('master', 'NEO_AUTH_REALM', 'string'),
                issuerUrl         : leaf(null, 'NEO_AUTH_ISSUER_URL', 'string'),
                clientId          : leaf(null, 'NEO_OAUTH_CLIENT_ID', 'string'),
                clientSecret      : leaf('', 'NEO_OAUTH_CLIENT_SECRET', 'string'),
                trustProxyIdentity: leaf(false, 'NEO_AUTH_TRUST_PROXY_IDENTITY', 'boolean'),
                // Authorization strategy selector: 'oidc' (default) | 'gitlab-pat' | 'github-pat' | 'local-bearer' | 'seat-token'.
                mode              : leaf('oidc', 'NEO_AUTH_MODE', 'string'),
                /**
                 * @summary Seat-token registry path for 'seat-token' mode — the mint-side artifact
                 * the auth verifier reads (hash-only rows binding tokens to `AgentIdentity`
                 * subjects, plane-scoped, generation-invalidated by regeneration).
                 *
                 * A PLANE MEMBER: the default derives from the plane anchor and the path is
                 * claimed in `PLANE_MEMBER_PATHS`, so a relocated plane without an explicitly
                 * placed registry fails the boot-time member-coherence clause.
                 * @type {String}
                 */
                seatTokenRegistryPath: leaf(path.resolve(planeDataRootDefault, 'seat-tokens/registry.json'), 'NEO_AUTH_SEAT_TOKEN_REGISTRY_PATH', 'string', {planeMember: true,
                    requiredFor: [{
                        entrypoints   : '*',
                        modes         : ['seat-token'],
                        consumerClaims: ['readiness'],
                        reason        : 'Seat-token verification cannot certify readiness without a registry path.'
                    }]
                }),
                /**
                 * @summary Disposable process-lifetime possession credential for local-bearer mode.
                 *
                 * Generate exactly 32 random bytes as canonical unpadded base64url. Never persist
                 * or log this value; process exit is the revocation boundary.
                 * @type {String}
                 */
                localBearerToken  : leaf('', 'NEO_AUTH_LOCAL_BEARER_TOKEN', 'string', {
                    requiredFor: [{
                        entrypoints   : '*',
                        modes         : ['local-bearer'],
                        consumerClaims: ['readiness'],
                        reason        : 'Local-bearer readiness requires a process-lifetime possession credential.'
                    }]
                }),
                // GitLab API base URL used by 'gitlab-pat' mode for token validation (self-managed configurable).
                gitlabApiBaseUrl  : leaf('https://gitlab.com', 'NEO_AUTH_GITLAB_API_BASE_URL', 'string', {
                    requiredFor: [{
                        entrypoints   : '*',
                        modes         : ['gitlab-pat'],
                        consumerClaims: ['readiness'],
                        reason        : 'PAT validation cannot certify readiness without a GitLab API base URL.'
                    }]
                }),
                // GitHub API base URL used by 'github-pat' mode for token validation (GHES configurable).
                githubApiBaseUrl  : leaf('https://api.github.com', 'NEO_AUTH_GITHUB_API_BASE_URL', 'string', {
                    requiredFor: [{
                        entrypoints   : '*',
                        modes         : ['github-pat'],
                        consumerClaims: ['readiness'],
                        reason        : 'PAT validation cannot certify readiness without a GitHub API base URL.'
                    }]
                }),
                // Bounded TTL (seconds) for the per-token PAT validation cache → a revoked PAT clears within this window.
                patCacheTtlSeconds     : leaf(300, 'NEO_AUTH_PAT_CACHE_TTL_SECONDS', 'number'),
                // One wall-clock deadline for each cache-miss PAT validation sequence.
                patValidationTimeoutMs: leaf(5000, 'NEO_AUTH_PAT_VALIDATION_TIMEOUT_MS', 'number'),
                // Optional GitLab OAuth app binding for 'gitlab-pat' mode. Empty means no app gate.
                allowedClientIds  : leaf([], 'NEO_AUTH_ALLOWED_CLIENT_IDS', 'csv'),
                // Optional username allowlist for PAT modes ('gitlab-pat' / 'github-pat'). Empty means any resolved user.
                allowedUsers      : leaf([], 'NEO_AUTH_ALLOWED_USERS', 'csv'),
                /**
                 * @summary Pins a rosterless local GitHub-PAT process to the provider subject
                 * resolved from the configured bootstrap carrier before the HTTP listener opens.
                 *
                 * This is an explicit admission policy, never an alternate meaning for an empty
                 * `allowedUsers`. Generic PAT profiles remain unchanged while this is `false`.
                 * @type {Boolean}
                 */
                pinFirstProviderSubject: leaf(false, 'NEO_AUTH_PIN_FIRST_PROVIDER_SUBJECT', 'boolean'),
                /**
                 * @summary Bootstrap PAT used only when `pinFirstProviderSubject` is enabled.
                 *
                 * AuthService validates the credential against the configured provider before
                 * installing bearer middleware. This direct-value carrier is intended for
                 * non-Compose runtimes and is mutually exclusive with `providerBootstrapPatFile`;
                 * the raw value is never logged.
                 * @type {String}
                 */
                providerBootstrapPat: leaf('', 'NEO_AUTH_PROVIDER_BOOTSTRAP_PAT', 'string'),
                /**
                 * @summary File containing the bootstrap PAT for secret-file-aware runtimes.
                 *
                 * AuthService reads this resolved path once before installing bearer middleware.
                 * Canonical local Compose mounts one environment-backed Docker secret and shares
                 * its file reference with the authenticated health probe, so rendered Compose
                 * configuration never contains the credential.
                 * @type {String}
                 */
                providerBootstrapPatFile: leaf('', 'NEO_AUTH_PROVIDER_BOOTSTRAP_PAT_FILE', 'string'),
                // Auth provenance sources that may create missing AgentIdentity graph nodes at request time.
                // 'github-pat' is deliberately NOT in the default: github.com is a public identity
                // surface, so auto-provisioning must be opt-in for deployments that scope their caller
                // set (allowedUsers, GHES, private network). Auth success without a bound AgentIdentity
                // leaves graph-gated tools fail-closed rather than broken — authentication does not
                // imply Agent OS admission; the exclusion keeps admission explicit instead of ambient.
                autoProvisionIdentitySources: leaf(['gitlab-pat'], 'NEO_AUTH_AUTO_PROVISION_IDENTITY_SOURCES', 'csv')
            },
            /**
             * @summary Deployment-wide chat / generation model provider.
             *
             * Tier-1 source of truth for model-consuming Agent OS lanes. Memory Core maps
             * this into its historical `modelProvider` key until runtime provider routing
             * converges on one canonical key. Supported values today: `gemini`,
             * `openAiCompatible`.
             * @type {String}
             */
            chatProvider: leaf('openAiCompatible', 'NEO_MODEL_PROVIDER', 'string'),
            /**
             * @summary Runtime alias for the active chat provider.
             *
             * Existing Memory Core consumers read `modelProvider`; keep the Tier-1
             * template aligned with `chatProvider` until provider routing converges on
             * one canonical key.
             * @type {String}
             */
            modelProvider: leaf('openAiCompatible', 'NEO_MODEL_PROVIDER', 'string'),
            /**
             * @summary Provider selector for Dream/Sandman graph-generation work.
             *
             * Graph extraction deliberately does not use the generic chat provider axis:
             * chat/summarization may use Gemini, while graph-generation dispatch only
             * supports native Ollama or OpenAI-compatible endpoints. Defaults to the
             * OpenAI-compatible graph route; set `NEO_GRAPH_PROVIDER=ollama` for
             * deployments that run graph extraction against native Ollama.
             * @type {'ollama'|'openAiCompatible'}
             */
            graphProvider: leaf('openAiCompatible', 'NEO_GRAPH_PROVIDER', 'string'),
            /**
             * @summary Deployment-wide embedding provider selector.
             *
             * Shared by Memory Core embedding consumers and Knowledge Base ingestion
             * paths.
             * @type {String}
             */
            embeddingProvider: leaf('openAiCompatible', 'NEO_EMBEDDING_PROVIDER', 'string'),
            /**
             * @summary Deployment-wide Ollama provider defaults.
             *
             * These are configuration defaults only. Native Ollama dispatch is enabled by
             * runtime provider adapters that explicitly select the `ollama` provider.
             * @type {Object}
             */
            ollama: {
                host          : leaf('http://127.0.0.1:11434', 'NEO_OLLAMA_HOST', 'string'),
                model         : leaf('gemma4:26b', 'NEO_OLLAMA_MODEL', 'string'),
                embeddingModel: leaf('qwen3-embedding', 'NEO_OLLAMA_EMBEDDING_MODEL', 'string'),
                keep_alive    : leaf(-1, 'NEO_OLLAMA_KEEP_ALIVE', 'keepAlive'),
                // Upper bound for one native Ollama embedding HTTP request. Keeps explicit
                // `embeddingProvider: 'ollama'` deployments from stalling the WAL drain.
                embeddingTimeoutMs   : leaf(300000, 'NEO_OLLAMA_EMBEDDING_TIMEOUT_MS', 'number'),
                requireParallelModels: leaf(2, 'NEO_OLLAMA_REQUIRE_PARALLEL_MODELS', 'number')
            },
            /**
             * @summary Deployment-wide OpenAI-compatible provider defaults.
             *
             * Covers MLX, LM Studio, Ollama's OpenAI-compatible surface, llama.cpp, and
             * managed OpenAI-compatible endpoints.
             * @type {Object}
             */
            openAiCompatible: {
                host                   : leaf('http://127.0.0.1:11434', 'NEO_OPENAI_COMPATIBLE_HOST', 'string'),
                // gemma-4-26b-a4b MoE (~4B active): ~15× faster cold prefill than the dense gemma-4-31b-it
                // (3s vs ~47s on ~9k tok) at quality parity for summary + tri-vector extraction.
                // Exact LM Studio identifier — keep the 'google/' org prefix. No-think toggle:
                // localModels.chat.{summary,graph}ReasoningEffort. The ollama provider configures its own model.
                model                  : leaf('google/gemma-4-26b-a4b', 'NEO_OPENAI_COMPATIBLE_MODEL', 'string'),
                embeddingModel         : leaf('text-embedding-qwen3-embedding-8b', 'NEO_OPENAI_COMPATIBLE_EMBEDDING_MODEL', 'string'),
                apiKey                 : leaf('', 'NEO_OPENAI_COMPATIBLE_API_KEY', 'string'),
                unloadRetryCount       : leaf(3, 'NEO_OPENAI_COMPATIBLE_UNLOAD_RETRY_COUNT', 'number'),
                unloadRetryDelayMs     : leaf(500, 'NEO_OPENAI_COMPATIBLE_UNLOAD_RETRY_DELAY_MS', 'number'),
                contentionRetryCount   : leaf(2, 'NEO_OPENAI_COMPATIBLE_CONTENTION_RETRY_COUNT', 'number'),
                contentionRetryDelayMs : leaf(1000, 'NEO_OPENAI_COMPATIBLE_CONTENTION_RETRY_DELAY_MS', 'number'),
                contentionTimeoutMs    : leaf(15000, 'NEO_OPENAI_COMPATIBLE_CONTENTION_TIMEOUT_MS', 'number'),
                batchEmbeddingChunkSize: leaf(5, 'NEO_OPENAI_COMPATIBLE_BATCH_EMBEDDING_CHUNK_SIZE', 'number'),
                // Upper bound for one batch embedding HTTP request. Batch chunks can legitimately take
                // longer than interactive single embeddings, but must not hold the provider queue forever.
                batchEmbeddingTimeoutMs: leaf(300000, 'NEO_OPENAI_COMPATIBLE_BATCH_EMBEDDING_TIMEOUT_MS', 'number'),
                batchEmbeddingYieldMs  : leaf(0, 'NEO_OPENAI_COMPATIBLE_BATCH_EMBEDDING_YIELD_MS', 'number'),
                keep_alive             : leaf(-1, 'NEO_OPENAI_COMPATIBLE_KEEP_ALIVE', 'keepAlive'),
                requireParallelModels  : leaf(2, 'NEO_OPENAI_COMPATIBLE_REQUIRE_PARALLEL_MODELS', 'number')
            },
            /**
             * @summary Local-model role-keyed context limits.
             *
             * The context-window axis for local-inference consumers is **model-role**
             * (chat vs embedding), not provider-namespace. Remote providers (Gemini and
             * future API-only endpoints) are API-bound — operators have no control over
             * their context cap, so these knobs do not apply. Local providers
             * (`openAiCompatible`, `ollama`) share these caps regardless of which serves
             * the role, because the practical limit comes from the loaded model, not
             * from the provider transport.
             *
             * Consumers read by model-role:
             * - Chat-path consumers (graph extraction, session summary) → `localModels.chat.*`
             * - Embedding-path consumers (Memory Core embedding, KB ingestion) → `localModels.embedding.*`
             *
             * @type {Object}
             */
            localModels: {
                /**
                 * @summary Chat-model context limits in tokens — a WORKLOAD FLOOR, not a RAM-fit target.
                 *
                 * Default is HALF of `gemma-4-31b-it`'s native 256K context (131072). This is a
                 * deliberate floor, NOT a value auto-shrunk to fit free host RAM: graph extraction
                 * (`SemanticGraphExtractor`, `TopologyInferenceEngine`) and session summaries
                 * (`SessionService`) read this via the AiConfig SSOT and degrade below ~half. The
                 * host is sized to load the model at this window (free co-resident RAM / raise the
                 * env), rather than the config shrinking the window to whatever RAM is spare — total
                 * system RAM does not predict a co-resident model's actual headroom.
                 * `ConsumerFrictionHelper.invokeWithGuardrail` uses these values to fire the upstream
                 * pre-check skip (emits `'context-overflow'` / `'size-precheck-skip'` friction) when
                 * composed input exceeds the safe-processing band.
                 *
                 * `safeProcessingLimitTokens` is the explicit ~76% headroom band (100000) — leaves
                 * ~31K tokens for system-prompt envelope + LLM response generation. Explicit value
                 * avoids implicit `0.75 × cap` derivation drift if the cap moves.
                 *
                 * Per-host tuning is the env override, not a host-RAM heuristic:
                 * `NEO_LOCAL_MODELS_CHAT_CONTEXT_LIMIT_TOKENS`,
                 * `NEO_LOCAL_MODELS_CHAT_SAFE_PROCESSING_LIMIT_TOKENS`.
                 *
                 * @type {Object}
                 */
                chat: {
                    contextLimitTokens       : leaf(131072, 'NEO_LOCAL_MODELS_CHAT_CONTEXT_LIMIT_TOKENS', 'number'),
                    safeProcessingLimitTokens: leaf(100000, 'NEO_LOCAL_MODELS_CHAT_SAFE_PROCESSING_LIMIT_TOKENS', 'number'),
                    // lms `--parallel` request-slot count for the chat model. Each slot holds an
                    // independent KV cache at contextLimitTokens, so the count MULTIPLIES the chat
                    // worker's resident RAM. Default 1: the chat roles (graph extraction / session
                    // summary / miniSummary) are lease-serialized, so concurrent demand is 1 and any
                    // slots beyond the first are idle KV bloat. PER-MODEL knob, distinct from
                    // requireParallelModels (how many DISTINCT models stay co-resident); both the chat
                    // and embedding models stay loaded regardless of this value.
                    parallel                 : leaf(1, 'NEO_LOCAL_MODELS_CHAT_PARALLEL', 'number'),
                    /**
                     * @summary Output-token budget for REM graph structured-output calls.
                     *
                     * Input chunking protects the prompt side; this caps the provider's JSON response
                     * side so an OpenAI-compatible or Ollama graph request cannot monopolize the chat
                     * model while the REM backlog waits for a response.
                     * @type {Number}
                     */
                    graphOutputLimitTokens   : leaf(8192, 'NEO_LOCAL_MODELS_CHAT_GRAPH_OUTPUT_LIMIT_TOKENS', 'number'),
                    /**
                     * @summary Prompt-token target for one REM Tri-Vector graph chunk.
                     *
                     * REM needs enough episodic context to infer useful graph structure, but this is an
                     * input-side bundle size, not the completion cap. `SemanticGraphExtractor` clamps the
                     * effective chunk budget to this leaf, `safeProcessingLimitTokens`, and
                     * `contextLimitTokens - graphOutputLimitTokens` before subtracting the prompt envelope.
                     * @type {Number}
                     */
                    graphChunkLimitTokens    : leaf(50000, 'NEO_LOCAL_MODELS_CHAT_GRAPH_CHUNK_LIMIT_TOKENS', 'number'),
                    /**
                     * @summary Per-task reasoning-effort for the chat model's two structured-output
                     * consumers — passed straight through as the OpenAI / LM-Studio `reasoning_effort`
                     * request param. Default `'none'` disables the gemma MoE's hidden "thinking" pass
                     * (~2× faster, zero measured quality loss for summary OR extraction).
                     * Kept per-task (not a single global) so a future hard-summary test can re-enable
                     * thinking for summaries alone (`'low'|'medium'|'high'`) without touching extraction.
                     * `SessionService.summarizeSession` reads `summaryReasoningEffort`;
                     * `SemanticGraphExtractor.executeTriVectorExtraction` reads `graphReasoningEffort`.
                     * @type {'none'|'low'|'medium'|'high'}
                     */
                    summaryReasoningEffort: leaf('none', 'NEO_LOCAL_MODELS_CHAT_SUMMARY_REASONING_EFFORT', 'string'),
                    graphReasoningEffort  : leaf('none', 'NEO_LOCAL_MODELS_CHAT_GRAPH_REASONING_EFFORT', 'string')
                },
                /**
                 * @summary Embedding-model context limits in tokens.
                 *
                 * Tuned for the default OpenAI-compatible embedding model
                 * `text-embedding-qwen3-embedding-8b`, whose upstream Qwen model card
                 * advertises a 32K context window. Operators serving smaller embedding
                 * models must pin this to the actual loaded-model capacity.
                 *
                 * `safeProcessingLimitTokens` is the explicit 28K operational band —
                 * large enough for file-scale KB / Memory Core ingestion while leaving a
                 * 4K-token margin below the advertised model maximum.
                 *
                 * Env overrides: `NEO_LOCAL_MODELS_EMBEDDING_CONTEXT_LIMIT_TOKENS`,
                 * `NEO_LOCAL_MODELS_EMBEDDING_SAFE_PROCESSING_LIMIT_TOKENS`,
                 * `NEO_LOCAL_MODELS_EMBEDDING_PARALLEL`.
                 *
                 * @type {Object}
                 */
                embedding: {
                    contextLimitTokens       : leaf(32768, 'NEO_LOCAL_MODELS_EMBEDDING_CONTEXT_LIMIT_TOKENS', 'number'),
                    safeProcessingLimitTokens: leaf(28672, 'NEO_LOCAL_MODELS_EMBEDDING_SAFE_PROCESSING_LIMIT_TOKENS', 'number'),
                    // lms `--parallel` request-slot count for the embedding model. Same primitive as
                    // `localModels.chat.parallel`: each slot carries its own KV cache, so slot count
                    // multiplies resident RAM. Default 1 keeps the embedding role resident without
                    // letting the LM Studio default silently spend memory that can force chat/embedding
                    // role-set churn. Distinct from requireParallelModels (distinct model residency).
                    parallel                 : leaf(1, 'NEO_LOCAL_MODELS_EMBEDDING_PARALLEL', 'number')
                }
            },
            /**
             * Memory Core repair strategy controls that participate in durable accepted-loss fingerprints.
             *
             * `strategyVersion` must change whenever repair embeddability behavior changes in a way that can
             * make previously terminal residue recoverable (for example, truncation/chunking/re-embed policy).
             * Keeping it in AiConfig, not a maintenance-script export, preserves the Provider SSOT: consumers read
             * the resolved leaf at the use site, and local overlays/env can make the active fingerprint explicit.
             * @type {Object}
             */
            memoryRepair: {
                /**
                 * Accepted-loss fingerprint strategy version for Memory Core repair embeddability semantics.
                 * @type {string}
                 */
                strategyVersion: leaf('mc-repair-v1', 'NEO_MEMORY_REPAIR_STRATEGY_VERSION', 'string')
            },
            /**
             * @summary Deployment-wide Gemini model defaults.
             *
             * Memory Core still exposes these historical field names for Gemini-backed
             * summary and embedding paths; Tier-1 owns the default tuple.
             * @type {String}
             */
            modelName: leaf('gemini-3.5-flash'),
            /**
             * @summary Deployment-wide Gemini embedding model default.
             * @type {String}
             */
            embeddingModel: leaf('gemini-embedding-001'),
            /**
             * @summary Gemini API key (secret), sourced from the `GEMINI_API_KEY` env var via the leaf
             * (mirrors the OpenAI-compatible `apiKey` leaf). Read at the use site (`aiConfig.geminiApiKey`);
             * consumers must never read `process.env.GEMINI_API_KEY` directly.
             * @type {String}
             */
            geminiApiKey: leaf('', 'GEMINI_API_KEY', 'string'),
            /**
             * @summary Enforced vector dimension across shared vector collections.
             *
             * Hard-configured to prevent schema wipes when operators change embedding
             * providers. Gemini deployments must explicitly pair provider and dimension
             * overrides.
             * @type {Number}
             */
            vectorDimension: leaf(4096, 'NEO_VECTOR_DIMENSION', 'number'),
            /**
             * @summary Deployment-wide storage engine coordinates.
             *
             * `engines.chroma` is the unified production topology: ONE daemon, ONE persist dir,
             * shared by Knowledge Base + Memory Core. The active `host` / `port` / `dataDir` values are
             * formulas (below) that resolve production vs test-harness coordinates from the existing
             * `UNIT_TEST_MODE` toggle or the Playwright-only `NEO_TEST_CONFIG_TEMPLATES` boundary.
             * Tests therefore connect to a separate daemon and persist directory by construction; a
             * database-name swap alone is not isolation.
             * @type {Object}
             */
            engines: {
                chroma: {
                    // Env-bindable like its host/port siblings: a packaged harness ships the organism in a
                    // read-only(ish) resources dir and must move the persist dir to a per-user data root.
                    dataDirProd: leaf(path.resolve(planeDataRootDefault, 'chroma/unified'), 'NEO_CHROMA_DATA_DIR', 'string', {planeMember: true}),
                    dataDirTest: leaf(chromaUnitTestDataDir, 'NEO_CHROMA_DATA_DIR_TEST', 'string'),
                    hostProd   : leaf('localhost', 'NEO_CHROMA_HOST', 'string'),
                    hostTest   : leaf('localhost', 'NEO_CHROMA_HOST_TEST', 'string'),
                    portProd   : leaf(8000, 'NEO_CHROMA_PORT', 'port'),
                    portTest   : leaf(18180, 'NEO_CHROMA_PORT_TEST', 'port'),
                    /**
                     * Chroma database selection — four declarative leaves, all SSOT-inline (config.template
                     * imports no config values):
                     *   - `database`        — the production DB name (literal).
                     *   - `databaseTest`    — the dedicated, droppable unit-test DB name (literal).
                     *   - `useUnitTestDatabase` — the unit-run selector, resolved from `UNIT_TEST_MODE`.
                     *   - `useTestHarness`  — the all-Playwright selector, resolved from the resolver boundary.
                     * `useTestDatabase` is the effective formula composing both selectors.
                     * The consumer (`ChromaManager`) reads the resolved toggle and picks `databaseTest` when
                     * true, else `database`. Both NAMES live in config, so the test path needs no env var the
                     * runner must remember to set — `npx playwright` without `npm run test-unit` still toggles
                     * to the test DB and CANNOT bleed unit collections into production by construction.
                     * `ChromaManager` additionally fails loud if the resolved DB equals `database` while the
                     * effective selector is on (independent defense-in-depth). KB ChromaManager reads only host/port.
                     */
                    database           : leaf('default_database', 'NEO_CHROMA_DATABASE', 'string'),
                    databaseTest       : leaf('neo-unit-test', 'NEO_CHROMA_DATABASE_TEST', 'string'),
                    useUnitTestDatabase: leaf(false, 'UNIT_TEST_MODE', 'boolean'),
                    /**
                     * @summary Extends storage isolation to non-unit Playwright modes without claiming
                     * unit-test application semantics.
                     * @type {boolean}
                     */
                    useTestHarness : leaf(false, 'NEO_TEST_CONFIG_TEMPLATES', 'boolean')
                }
            },
            /**
             * Memory Core service tuning — timeouts, retry, graph-projection cadence, miniSummary.
             * All operator-tunable; consumers read `aiConfig.memoryService.*` at the use site.
             * @type {Object}
             */
            memoryService: {
                miniSummaryTimeoutMs           : leaf(30000, 'NEO_MC_MINI_SUMMARY_TIMEOUT_MS', 'number'),
                miniSummaryBackfillMaxRunMs    : leaf(600000, 'NEO_MC_MINI_SUMMARY_BACKFILL_MAX_RUN_MS', 'number'),
                miniSummaryBackfillFreshReserve: leaf(10, 'NEO_MC_MINI_SUMMARY_BACKFILL_FRESH_RESERVE', 'number'),
                miniSummaryMaxChars            : leaf(280, 'NEO_MC_MINI_SUMMARY_MAX_CHARS', 'number'),
                generateMiniSummaryTimeoutMs   : leaf(20000, 'NEO_MC_GENERATE_MINI_SUMMARY_TIMEOUT_MS', 'number'),
                chromaFetchTimeoutMs           : leaf(10000, 'NEO_MC_CHROMA_FETCH_TIMEOUT_MS', 'number'),
                graphProjectionMaxAttempts     : leaf(5, 'NEO_MC_GRAPH_PROJECTION_MAX_ATTEMPTS', 'number'),
                graphProjectionRetryBaseMs     : leaf(250, 'NEO_MC_GRAPH_PROJECTION_RETRY_BASE_MS', 'number'),
                graphProjectionRetryMaxMs      : leaf(5000, 'NEO_MC_GRAPH_PROJECTION_RETRY_MAX_MS', 'number'),
                graphProjectionDrainIntervalMs : leaf(60000, 'NEO_MC_GRAPH_PROJECTION_DRAIN_INTERVAL_MS', 'number')
            },
            /**
             * Temporal-pyramid durable aggregation lane (L1 session / L2 daily tiers).
             * @type {Object}
             */
            temporalSummary: {
                /**
                 * Master opt-in for the temporal-pyramid aggregation lane (an orchestrator-owned supervised
                 * one-shot child). Disabled by default; the one-shot child exits early when false.
                 * @type {Boolean}
                 */
                aggregationEnabled: leaf(false, 'NEO_MC_TEMPORAL_SUMMARY_ENABLED', 'boolean'),
                /**
                 * Orchestrator dispatch cadence in ms (default 1 h) — the interval the Orchestrator schedules the
                 * one-shot aggregation child at (NOT a self-poll loop). The lane runs under the shared
                 * heavy-maintenance lease, so it yields to REM / defrag siblings.
                 * @type {Number}
                 */
                aggregationIntervalMs: leaf(60 * 60 * 1000, 'NEO_MC_TEMPORAL_SUMMARY_INTERVAL_MS', 'number')
            },
            /**
             * Agent OS maintenance orchestrator configuration.
             * @type {Object}
             */
            orchestrator: {
                /**
                 * Directory owning ALL orchestrator-daemon runtime state: the daemon + child-task
                 * PID files, `orchestrator.log`, `orchestrator-state.json`, and the heavy-maintenance
                 * lease + tenant-repo-sync revision files stored beside them. Derives from the
                 * declared plane anchor (absolute) — the prior relative default resolved against
                 * the daemon's ambient cwd, which is exactly the per-process root ambiguity the
                 * plane subtree removes; cloud deployments keep overriding via env. Owning the
                 * default AND the `NEO_AI_ORCHESTRATOR_DIR` env binding here (instead of a
                 * module-level `process.env` read at the consumer) keeps the config-is-SSOT
                 * contract: no consumer re-derives from env, no consumer holds a hidden default.
                 * @type {String}
                 */
                dataDir: leaf(path.resolve(planeDataRootDefault, 'orchestrator-daemon'), 'NEO_AI_ORCHESTRATOR_DIR', 'string', {planeMember: true}),
                /**
                 * SQLite Memory Core graph database file the orchestrator opens for graph-backed
                 * health checks and maintenance decisions. Derives from the declared plane anchor
                 * (absolute) — the prior relative default resolved against the daemon's ambient
                 * cwd, the per-process root ambiguity the plane subtree removes; deployments keep
                 * overriding via env. Owning the default AND the `NEO_AI_DB_PATH` env binding here
                 * (instead of a module-level `process.env` read at the consumer) keeps the
                 * config-is-SSOT contract: no consumer re-derives from env, no consumer holds a
                 * hidden default.
                 * @type {String}
                 */
                dbPath: leaf(path.resolve(planeDataRootDefault, 'sqlite/memory-core-graph.sqlite'), 'NEO_AI_DB_PATH', 'string', {planeMember: true}),
                /**
                 * Deployment profile for Agent OS maintenance ownership.
                 * `local` preserves maintainer-checkout behavior; `cloud` disables local-only
                 * maintenance lanes unless a narrower localOnly override opts them back in.
                 * @type {'local'|'cloud'}
                 */
                deploymentMode: leaf('local', 'NEO_AI_DEPLOYMENT_MODE', 'string'),
                /**
                 * Filesystem root under which tenant-repo mirrors are stored. The
                 * `deriveTenantRepoMirrorPath` helper appends `tenant-repos/<tenant>/<repo>`,
                 * so this value names the PARENT of that directory — typically
                 * `/app/.neo-ai-data` in containerized cloud deployments. Per-repo
                 * `tenantRepos[].mirrorRoot` overrides this value when present; absent
                 * per-repo overrides fall back through this Tier-1 default. Env override:
                 * `NEO_TENANT_REPO_MIRROR_ROOT`.
                 * Deliberately NOT derived from the local plane anchor: this default names the
                 * CLOUD profile's plane root (the lane is cloud-only), and re-anchoring it
                 * locally would silently break containerized defaults. The per-profile
                 * plane-placement election owns unifying profile-pinned members.
                 * @type {String}
                 */
                tenantRepoMirrorRoot: leaf('/app/.neo-ai-data', 'NEO_TENANT_REPO_MIRROR_ROOT', 'string', {planeMember: false, planeMemberReason: 'cloud-profile-pinned — the per-profile placement election owns profile-pinned members (#15798 OQ10b)'}),
                /**
                 * Provider-readiness probe parameters consumed by the orchestrator dream task
                 * and the standalone Sandman CLI runner. The probe issues an HTTP GET against
                 * the resolved graph provider's `/api/tags` (Ollama) or `/v1/models`
                 * (OpenAI-compatible) endpoint, retrying `attempts` times with `delayMs`
                 * between retries, abandoning each probe after `timeoutMs`.
                 *
                 * Defaults are sized for a developer-laptop cold start (30 × 1s + 3s timeout
                 * per probe ≈ 2 min absolute ceiling). Cloud-deployment operators tune these
                 * via gitignored `ai/config.mjs` or the env vars below. Routine readiness
                 * consumers share a short model-discovery cache to avoid flooding user-facing
                 * provider logs; recovery and force-refresh diagnostics bypass it.
                 * @type {Object}
                 */
                providerReadiness: {
                    attempts         : leaf(30, 'NEO_ORCHESTRATOR_PROVIDER_READY_ATTEMPTS', 'number'),
                    delayMs          : leaf(1000, 'NEO_ORCHESTRATOR_PROVIDER_READY_DELAY_MS', 'number'),
                    timeoutMs        : leaf(3000, 'NEO_ORCHESTRATOR_PROVIDER_READY_TIMEOUT_MS', 'number'),
                    routineCacheTtlMs: leaf(1000, 'NEO_ORCHESTRATOR_PROVIDER_READY_ROUTINE_CACHE_TTL_MS', 'number'),
                    /**
                     * Stuck-runner detection. A resident model can be alive yet stuck —
                     * one pathological request (e.g. a too-large context prefill) grinding at
                     * ~100%×N-cores while serving nothing, because `OLLAMA_NUM_PARALLEL=1` queues
                     * everything behind it (the empirical anchor: a `gemma4` runner pegged 58h with
                     * an idle orchestrator and no users). The supervised `healthProbe` restarts the
                     * runner only after `consecutiveFailures` SUSTAINED inference-canary failures —
                     * the false-positive guard against restarting a legitimately-long request — and
                     * the supervisor restart cooldown bounds the cadence (no thrash).
                     * @type {Object}
                     */
                    stuckRunner: {
                        enabled            : leaf(true,  'NEO_ORCHESTRATOR_STUCK_RUNNER_ENABLED', 'boolean'),
                        consecutiveFailures: leaf(3,     'NEO_ORCHESTRATOR_STUCK_RUNNER_CONSECUTIVE_FAILURES', 'number'),
                        canaryTimeoutMs    : leaf(10000, 'NEO_ORCHESTRATOR_STUCK_RUNNER_CANARY_TIMEOUT_MS', 'number')
                    }
                },
                /**
                 * L0 deployment-runtime access holder used by the self-healing stack.
                 *
                 * The deny-by-default mechanism (the recovery-actuator privilege-boundary design):
                 * docker-socket + deny-by-default wrapper is the MVP, while a privileged sidecar
                 * remains the hardening fallback if the wrapper cannot prove strict service
                 * identity and operation allowlisting. The holder exposes two separate
                 * capability envelopes over the same runtime handle:
                 *
                 * - `readOperations`: logs / stats / inspect for observability.
                 * - `lifecycleOperations`: restart for recovery.
                 *
                 * `allowedServices` names Docker Compose service labels, not arbitrary
                 * container ids. When runtime access is enabled, `composeProject` is mandatory:
                 * `(composeProject, composeService)` is the target identity even on a host that
                 * currently runs only one stack.
                 *
                 * Env overrides:
                 * `NEO_ORCHESTRATOR_RUNTIME_ACCESS_ENABLED`,
                 * `NEO_ORCHESTRATOR_RUNTIME_ACCESS_MECHANISM`,
                 * `NEO_ORCHESTRATOR_RUNTIME_ACCESS_SOCKET_PATH`,
                 * `NEO_ORCHESTRATOR_RUNTIME_ACCESS_COMPOSE_PROJECT`,
                 * `NEO_ORCHESTRATOR_RUNTIME_ACCESS_ALLOWED_SERVICES`,
                 * `NEO_ORCHESTRATOR_RUNTIME_ACCESS_READ_OPERATIONS`,
                 * `NEO_ORCHESTRATOR_RUNTIME_ACCESS_LIFECYCLE_OPERATIONS`,
                 * `NEO_ORCHESTRATOR_RUNTIME_ACCESS_TIMEOUT_MS`,
                 * `NEO_ORCHESTRATOR_RUNTIME_ACCESS_RESPONSE_MAX_BYTES`,
                 * `NEO_ORCHESTRATOR_RUNTIME_ACCESS_LOG_TAIL`,
                 * `NEO_ORCHESTRATOR_RUNTIME_ACCESS_RESTART_TIMEOUT_SECONDS`,
                 * `NEO_ORCHESTRATOR_RUNTIME_ACCESS_AUDIT_MODE`.
                 *
                 * @type {Object}
                 */
                deploymentRuntimeAccess: {
                    enabled                     : leaf(false, 'NEO_ORCHESTRATOR_RUNTIME_ACCESS_ENABLED', 'boolean'),
                    mechanism                   : leaf('docker-socket', 'NEO_ORCHESTRATOR_RUNTIME_ACCESS_MECHANISM', 'string'),
                    socketPath                  : leaf('/var/run/docker.sock', 'NEO_ORCHESTRATOR_RUNTIME_ACCESS_SOCKET_PATH', 'string'),
                    composeProject              : leaf(null, 'NEO_ORCHESTRATOR_RUNTIME_ACCESS_COMPOSE_PROJECT', 'string'),
                    allowedServices             : leaf(['chroma', 'kb-server', 'mc-server', 'local-model'], 'NEO_ORCHESTRATOR_RUNTIME_ACCESS_ALLOWED_SERVICES', 'csv'),
                    readOperations              : leaf(['inspect', 'logs', 'stats'], 'NEO_ORCHESTRATOR_RUNTIME_ACCESS_READ_OPERATIONS', 'csv'),
                    lifecycleOperations         : leaf(['restart'], 'NEO_ORCHESTRATOR_RUNTIME_ACCESS_LIFECYCLE_OPERATIONS', 'csv'),
                    timeoutMs                   : leaf(5000, 'NEO_ORCHESTRATOR_RUNTIME_ACCESS_TIMEOUT_MS', 'number'),
                    responseMaxBytes            : leaf(1024 * 1024, 'NEO_ORCHESTRATOR_RUNTIME_ACCESS_RESPONSE_MAX_BYTES', 'number'),
                    logTail                     : leaf(200, 'NEO_ORCHESTRATOR_RUNTIME_ACCESS_LOG_TAIL', 'number'),
                    defaultRestartTimeoutSeconds: leaf(10, 'NEO_ORCHESTRATOR_RUNTIME_ACCESS_RESTART_TIMEOUT_SECONDS', 'number'),
                    auditMode                   : leaf('metadata', 'NEO_ORCHESTRATOR_RUNTIME_ACCESS_AUDIT_MODE', 'string')
                },
                /**
                 * Graph-independent deployment-state bridge. The orchestrator writes a bounded JSON
                 * snapshot to shared storage; KB/MC read tools consume it without receiving Docker
                 * socket, shell, exec, or actuator authority. Enabled by default: deployment
                 * overlays may explicitly disable the writer, and must mount the same
                 * `snapshotPath` into the public KB/MC containers.
                 *
                 * Env overrides:
                 * `NEO_DEPLOYMENT_STATE_BRIDGE_ENABLED`,
                 * `NEO_DEPLOYMENT_STATE_BRIDGE_SNAPSHOT_PATH`,
                 * `NEO_DEPLOYMENT_STATE_BRIDGE_WRITE_INTERVAL_MS`,
                 * `NEO_DEPLOYMENT_STATE_BRIDGE_STALE_AFTER_MS`,
                 * `NEO_DEPLOYMENT_STATE_BRIDGE_MAX_BYTES`,
                 * `NEO_DEPLOYMENT_STATE_BRIDGE_ALLOWED_SERVICES`,
                 * `NEO_DEPLOYMENT_STATE_BRIDGE_INCLUDE_LOGS`,
                 * `NEO_DEPLOYMENT_STATE_BRIDGE_LOG_TAIL`,
                 * `NEO_DEPLOYMENT_STATE_BRIDGE_LOG_MAX_BYTES`,
                 * `NEO_DEPLOYMENT_STATE_BRIDGE_STATS_SAMPLE_WINDOW`,
                 * `NEO_DEPLOYMENT_STATE_BRIDGE_PROVIDER_RESIDENCY_SERVICE_KEYS`,
                 * `NEO_DEPLOYMENT_STATE_BRIDGE_RECOVERY_RUN_LIMIT`.
                 *
                 * @type {Object}
                 */
                deploymentStateBridge: {
                    enabled                     : leaf(true, 'NEO_DEPLOYMENT_STATE_BRIDGE_ENABLED', 'boolean'),
                    snapshotPath                : leaf(path.resolve(planeDataRootDefault, 'deployment-state/snapshot.json'), 'NEO_DEPLOYMENT_STATE_BRIDGE_SNAPSHOT_PATH', 'string', {planeMember: true}),
                    writeIntervalMs             : leaf(30000, 'NEO_DEPLOYMENT_STATE_BRIDGE_WRITE_INTERVAL_MS', 'number'),
                    staleAfterMs                : leaf(2 * 60 * 1000, 'NEO_DEPLOYMENT_STATE_BRIDGE_STALE_AFTER_MS', 'number'),
                    maxSnapshotBytes            : leaf(256 * 1024, 'NEO_DEPLOYMENT_STATE_BRIDGE_MAX_BYTES', 'number'),
                    allowedServices             : leaf([], 'NEO_DEPLOYMENT_STATE_BRIDGE_ALLOWED_SERVICES', 'csv'),
                    includeLogs                 : leaf(true, 'NEO_DEPLOYMENT_STATE_BRIDGE_INCLUDE_LOGS', 'boolean'),
                    logTail                     : leaf(120, 'NEO_DEPLOYMENT_STATE_BRIDGE_LOG_TAIL', 'number'),
                    logMaxBytes                 : leaf(32 * 1024, 'NEO_DEPLOYMENT_STATE_BRIDGE_LOG_MAX_BYTES', 'number'),
                    statsSampleWindow           : leaf(2, 'NEO_DEPLOYMENT_STATE_BRIDGE_STATS_SAMPLE_WINDOW', 'number'),
                    providerResidencyServiceKeys: leaf(['local-model', 'model'], 'NEO_DEPLOYMENT_STATE_BRIDGE_PROVIDER_RESIDENCY_SERVICE_KEYS', 'csv'),
                    recoveryRunLimit            : leaf(10, 'NEO_DEPLOYMENT_STATE_BRIDGE_RECOVERY_RUN_LIMIT', 'number'),
                    // Self-heal snapshot's recent-event cap — a DIFFERENT surface from recoveryRunLimit (heal-ledger
                    // events vs recovery-run states). collectSelfHealSnapshot validates it finite/non-negative (0 = no
                    // recent-event list) so a negative value can never expand the snapshot to every retained event.
                    selfHealRecentEventLimit    : leaf(10, 'NEO_DEPLOYMENT_STATE_BRIDGE_SELF_HEAL_RECENT_EVENT_LIMIT', 'number')
                },
                /**
                 * Cross-process heavy-maintenance lease (Chroma / SQLite / LLM maintenance mutex).
                 * `staleAfterMs`: a lease older than this is treated as abandoned and reclaimable — it must
                 * exceed the longest legitimate heavy-maintenance run (scales with data size), so it is an
                 * operator-tunable threshold, not a hardcoded ceiling. AiConfig-aware entrypoints pass the
                 * resolved value into Neo/Base-free lease primitives; primitives carry no TTL default/env binding.
                 * @type {Object}
                 */
                heavyMaintenanceLease: {
                    staleAfterMs: leaf(6 * 60 * 60 * 1000, 'NEO_HEAVY_MAINTENANCE_LEASE_TTL_MS', 'number')
                },
                /**
                 * Maintenance-loop intervals consumed by the orchestrator daemon.
                 * Env vars at the daemon boundary retain precedence over these defaults.
                 * @type {Object}
                 */
                intervals: {
                    pollMs                 : leaf(3000, 'NEO_ORCHESTRATOR_POLL_INTERVAL_MS', 'number'),
                    summarySweepMs         : leaf(10 * 60 * 1000, 'NEO_ORCHESTRATOR_SUMMARY_SWEEP_INTERVAL_MS', 'number'),
                    kbSyncMs               : leaf(30 * 60 * 1000, 'NEO_ORCHESTRATOR_KB_SYNC_INTERVAL_MS', 'number'),
                    githubWorkflowSyncMs   : leaf(2 * HOUR_MS, 'NEO_ORCHESTRATOR_GITHUB_WORKFLOW_SYNC_INTERVAL_MS', 'number'),
                    backupMs               : leaf(DAY_MS, 'NEO_ORCHESTRATOR_BACKUP_INTERVAL_MS', 'number'),
                    graphLogCompactionMs   : leaf(DAY_MS, 'NEO_ORCHESTRATOR_GRAPHLOG_COMPACTION_INTERVAL_MS', 'number'),
                    primaryDevSyncMs       : leaf(10 * 60 * 1000, 'NEO_ORCHESTRATOR_PRIMARY_DEV_SYNC_INTERVAL_MS', 'number'),
                    tenantRepoSyncMs       : leaf(30 * 60 * 1000, 'NEO_ORCHESTRATOR_TENANT_REPO_SYNC_INTERVAL_MS', 'number'),
                    dreamMs                : leaf(HOUR_MS, 'NEO_ORCHESTRATOR_DREAM_INTERVAL_MS', 'number'),
                    messageConceptHarvestMs: leaf(6 * HOUR_MS, 'NEO_ORCHESTRATOR_MESSAGE_CONCEPT_HARVEST_INTERVAL_MS', 'number'),
                    /**
                     * Fraction of `dreamMs` runtime that triggers completion-time cooldown for the
                     * next dream cycle. This is intentionally below the cycle-overflow telemetry
                     * signal: it prevents tight reacquire windows before a cycle exceeds the full
                     * cadence.
                     */
                    dreamOverflowThreshold: leaf(0.8, 'NEO_ORCHESTRATOR_DREAM_OVERFLOW_THRESHOLD', 'number'),
                    /**
                     * Cooldown for REM backlog catch-up after a successful cycle saturates the configured
                     * REM batch. This is shorter than `dreamMs`, but only activates for bounded
                     * non-overflow cycles that prove backlog remains.
                     */
                    remBacklogCatchupCooldownMs: leaf(5 * 60 * 1000, 'NEO_ORCHESTRATOR_REM_BACKLOG_CATCHUP_COOLDOWN_MS', 'number'),
                    /**
                     * Staleness threshold past which a genuine REM consolidation STARVATION (stale + an
                     * undigested backlog) forces one cycle regardless of the catch-up cooldown / heavy-slot
                     * contention. Multi-hour by design — well past normal contention-yielding, so only real
                     * starvation trips it; `0` disables. Consumed by the starvation-breaker in `dream.mjs`.
                     */
                    remStarvationBreakerMs: leaf(2 * HOUR_MS, 'NEO_ORCHESTRATOR_REM_STARVATION_BREAKER_MS', 'number'),
                    goldenPathMs          : leaf(HOUR_MS, 'NEO_ORCHESTRATOR_GOLDEN_PATH_INTERVAL_MS', 'number'),
                    /**
                     * Generic swarm-heartbeat / watchdog nudge cadence — the periodic pulse that fires a
                     * wake digest even with no new messages. Set to 20 min so the generic watchdog nudge
                     * sits in the operator's 20-30 min target, cutting wake noise. DIRECT actionable A2A
                     * wakes (review-request / REQUEST_CHANGES / task-state) stay event-driven and are NOT
                     * affected by this cadence — this slot is only the periodic pulse. The pulse cadence is
                     * a layer ABOVE the wake-coalescing window (the 300s digest-batching cap, an orthogonal
                     * mechanism), so widening it does not change coalescing semantics.
                     */
                    swarmHeartbeatMs      : leaf(20 * 60 * 1000, 'NEO_ORCHESTRATOR_SWARM_HEARTBEAT_INTERVAL_MS', 'number'),
                    /**
                     * Cadence of the embed-drain liveness watchdog — the read-only, never-fail health
                     * check that computes the age of the oldest un-embedded WAL record and raises a
                     * one-shot alarm when it exceeds `memoryWal.embedDrainStallThresholdMs`. Hourly is
                     * frequent enough to surface a stalled drain in hours (not the ~8 days of the silent
                     * drain-death incident) while staying far below the threshold so the check itself adds
                     * negligible load. `<= 0` disables the lane.
                     */
                    embedDrainLivenessWatchdogCheckMs: leaf(HOUR_MS, 'NEO_ORCHESTRATOR_EMBED_DRAIN_WATCHDOG_INTERVAL_MS', 'number'),
                    /**
                     * Cadence of the REM consolidation-liveness watchdog — the read-only, never-fail
                     * health check (consolidation-side analog of the embed-drain watchdog) that computes
                     * the age since the last successful REM cycle and raises a one-shot alarm when it
                     * exceeds `memoryWal`-sibling `remConsolidationStallThresholdMs`.
                     * Hourly surfaces a stalled dream in hours. `<= 0` disables the lane.
                     */
                    remConsolidationWatchdogCheckMs  : leaf(HOUR_MS, 'NEO_ORCHESTRATOR_REM_CONSOLIDATION_WATCHDOG_INTERVAL_MS', 'number'),
                    /**
                     * Cadence of the data-integrity sweep — the read-only, never-fail health check that
                     * audits Memory Core metadata-vs-vector coverage and emits a `data-integrity`
                     * diagnosis on drift (the "up but data-gutted reports green" blind spot). The
                     * diagnosis routes to the autonomous data-recovery actuator — the store is HEALED,
                     * not paged: a cloud deployment has no operator to gate. Hourly surfaces a silent
                     * vector-loss in hours, not weeks. `<= 0` disables the lane.
                     */
                    dataIntegritySweepCheckMs        : leaf(HOUR_MS, 'NEO_ORCHESTRATOR_DATA_INTEGRITY_SWEEP_INTERVAL_MS', 'number')
                },
                /**
                 * Chroma daemon recycle policy. The orchestrator kills and respawns the supervised
                 * Chroma daemon once its uptime exceeds `maxRuntimeMs`, then runs a unified-store-safe
                 * defrag against the fresh daemon. `0` disables recycling.
                 * Env override: `NEO_CHROMA_MAX_RUNTIME_MS`. The lane is gated by
                 * `localOnly.chromaDaemonEnabled` — a no-op when Chroma is externally managed.
                 * @type {Object}
                 */
                chroma: {
                    maxRuntimeMs: leaf(DAY_MS, 'NEO_CHROMA_MAX_RUNTIME_MS', 'number')
                },
                /**
                 * Local webpack dev-server supervision policy. `enabled: null` means the
                 * deployment profile decides (local enables, cloud disables); explicit true/false
                 * lets operators opt in/out without changing the manual `server-start --open`
                 * command. The orchestrator-owned task never passes `--open`.
                 * @type {Object}
                 */
                devServer: {
                    enabled               : leaf(null, 'NEO_ORCHESTRATOR_DEV_SERVER_ENABLED', 'boolean'),
                    port                  : leaf(8080, 'NEO_ORCHESTRATOR_DEV_SERVER_PORT', 'port'),
                    livenessProbeTimeoutMs: leaf(1000, 'NEO_ORCHESTRATOR_DEV_SERVER_LIVENESS_TIMEOUT_MS', 'number')
                },
                /**
                 * GraphLog compaction policy. The scheduled lane invokes the existing
                 * `compactGraphLog.mjs --apply` maintenance script; the script owns retention
                 * safety and cursor handling. `vacuum` stays explicit because SQLite VACUUM is
                 * heavier than logical GraphLog compaction and physically rewrites the DB file.
                 * @type {Object}
                 */
                graphLogCompaction: {
                    enabled: leaf(true, 'NEO_ORCHESTRATOR_GRAPHLOG_COMPACTION_ENABLED', 'boolean'),
                    vacuum : leaf(false, 'NEO_ORCHESTRATOR_GRAPHLOG_COMPACTION_VACUUM', 'boolean')
                },
                /**
                 * Heavy-maintenance lease fairness — the bound on continuous lease hold. A long-running
                 * heavy task (e.g. a multi-hour KB re-embed) yields the single heavy-maintenance lease
                 * after `maxActiveHoldMs` of continuous hold — polled via `shouldYieldHeavyMaintenanceLease`
                 * — so a starved heavy peer (e.g. `githubWorkflowSync`, which otherwise stales the sandman
                 * handoff for the whole run) interleaves; the next sweep re-acquires for the remaining work.
                 * A holder must only yield at a resumable checkpoint (a preserved shadow + resume-marker keep
                 * completed work), so the release window is torn-read-free. `0`/falsy ⇒ never yields
                 * (byte-identical back-compat). Default 30min (the fairness decision with
                 * @neo-opus-grace): independent of `staleAfterMs` but kept smaller (a live holder yields before
                 * it would be stale-reclaimed); a SOFT knob — the holder yields at the first between-batch
                 * checkpoint after the bound, never mid-batch — so it is tunable on observed yield-churn.
                 * Env override: `NEO_ORCHESTRATOR_HEAVY_MAINTENANCE_MAX_ACTIVE_HOLD_MS`.
                 * @type {Object}
                 */
                heavyMaintenance: {
                    maxActiveHoldMs: leaf(HOUR_MS / 2, 'NEO_ORCHESTRATOR_HEAVY_MAINTENANCE_MAX_ACTIVE_HOLD_MS', 'number')
                },
                /**
                 * Neural Link Bridge local-supervision policy. The bridge port itself is owned
                 * by `ai/mcp/server/neural-link/config.mjs` (`NEO_NL_PORT`); this block only
                 * controls orchestrator-side probing.
                 * @type {Object}
                 */
                neuralLinkBridge: {
                    livenessProbeTimeoutMs: leaf(1000, 'NEO_ORCHESTRATOR_NL_BRIDGE_LIVENESS_TIMEOUT_MS', 'number')
                },
                /**
                 * Swarm-heartbeat target-resolver config. Controls which identity set
                 * `SwarmHeartbeatService.pulse()` targets per cycle via the resolver
                 * precedence chain. Env override: `NEO_ORCHESTRATOR_SWARM_HEARTBEAT_TARGET_SOURCE`.
                 * Explicit list override (highest precedence):
                 * `NEO_ORCHESTRATOR_SWARM_HEARTBEAT_TARGETS` (comma-separated handles).
                 * @type {Object}
                 */
                swarmHeartbeat: {
                    /**
                     * Resolver source enum. Tracked default is `'active-a2a-participants'`:
                     * the pulse candidate set is auto-discovered from A2A `MESSAGE` activity
                     * within the last 3h (sibling to the per-identity `active` signal). This is
                     * per-MC-instance derived (no team-registry coupling), so external workspaces
                     * only ever see their own MC's activity — tenant-safe.
                     *
                     * Valid values: `'self'`, `'active-local-team'`, `'active-subscribers'`,
                     * `'active-a2a-participants'`, `'disabled'`. `null` falls through to
                     * `'self'` (deployment-portable code-side safety net).
                     *
                     * - `'self'` — pulse only the harness owner (`NEO_AGENT_IDENTITY`)
                     * - `'active-local-team'` — reads `identityRoots.mjs` Neo-team registry
                     * - `'active-subscribers'` — unions self with `WAKE_SUBSCRIPTION` nodes
                     * - `'active-a2a-participants'` — unions self with identities active in
                     *   A2A graph within last 3h (the default)
                     * - `'disabled'` — no pulse targets
                     *
                     * @type {'self'|'active-local-team'|'active-subscribers'|'active-a2a-participants'|'disabled'|null}
                     */
                    targetSource: leaf('active-a2a-participants', 'NEO_ORCHESTRATOR_SWARM_HEARTBEAT_TARGET_SOURCE', 'string'),
                    /**
                     * Explicit comma-separated handle list override (highest resolver precedence).
                     * Raw string; the consumer (`Orchestrator.swarmHeartbeatExplicitTargets`) splits
                     * and trims. `null`/absent → resolver falls through to `targetSource` semantics.
                     * @type {String|null}
                     */
                    targets: leaf(null, 'NEO_ORCHESTRATOR_SWARM_HEARTBEAT_TARGETS', 'string'),
                    /**
                     * Idle-out threshold (ms): a `WAKE_SUBSCRIPTION`-active agent whose latest
                     * `AGENT_MEMORY` is older than this is an `idle_out_candidate` for the bounded
                     * in-place heartbeat nudge. Read at the use site by the lifecycle detectors
                     * (`checkSunsetted.mjs`, `checkAllAgentIdle.mjs`). Bound to the
                     * `NEO_IDLE_THRESHOLD_MS` env name (NEO_ prefix convention).
                     * @type {Number}
                     */
                    idleThresholdMs: leaf(10 * 60 * 1000, 'NEO_IDLE_THRESHOLD_MS', 'number'),
                    /**
                     * Swarm wake cooldown TTL (seconds): minimum gap between swarm-wide
                     * all-agent-idle WAKE dispatches, enforced by `swarmWakeCooldown.mjs` to keep
                     * the heartbeat idempotent. Bound to the `NEO_SWARM_WAKE_COOLDOWN_SECONDS`
                     * env name (NEO_ prefix convention).
                     * @type {Number}
                     */
                    swarmWakeCooldownSeconds: leaf(600, 'NEO_SWARM_WAKE_COOLDOWN_SECONDS', 'number'),
                    /**
                     * Explicit override for the all-agent-idle CHECK set (`checkAllAgentIdle.mjs`) —
                     * the identities whose collective idleness triggers a swarm-wide wake. Distinct
                     * from `targets`/`targetSource` above (those choose pulse RECIPIENTS via the
                     * resolver): idle detection needs the registered active team, not the recently-
                     * A2A-active subset, so `null` resolves via `resolveTargets({targetSource:
                     * 'active-local-team'})` (deployment-portable `identityRoots` active maintainers,
                     * never a hardcoded roster). Bound to the `NEO_SWARM_IDENTITIES` env name.
                     * @type {String[]|null}
                     */
                    allIdleIdentities: leaf(null, 'NEO_SWARM_IDENTITIES', 'csv')
                },
                /**
                 * Event-wake dispatch policy — how the wake daemon batches EVENT wakes (message /
                 * task / permission) into digests. Distinct from `swarmHeartbeat` above (the
                 * idle-watchdog lane): these knobs shape per-event delivery rate, not idle nudges.
                 * @type {Object}
                 */
                wakeDispatch: {
                    /**
                     * Default coalescing window (seconds) for event wakes: after an event queues,
                     * the daemon waits this long for FURTHER events before flushing one digest —
                     * and the window is ROLLING (each new arrival extends the wait; the hard
                     * 300s flush cap in `ai/daemons/wake/coalescePolicy.mjs` bounds total
                     * latency). Sized for the swarm's real INTER-turn cadence — lifecycle
                     * messages land minutes apart, and every wake costs a full harness turn, so
                     * waking per-message is the dominant token waste (the prior 30s fixed
                     * window produced exactly that). Per-subscription override stays
                     * `harnessTargetMetadata.coalesceWindow` (same clamp; `0` = explicit
                     * immediate dispatch). Bound to the `NEO_WAKE_COALESCE_WINDOW_SECONDS`
                     * env name (NEO_ prefix convention).
                     * @type {Number}
                     */
                    coalesceWindowSeconds: leaf(150, 'NEO_WAKE_COALESCE_WINDOW_SECONDS', 'number'),
                    /**
                     * Post-flush refractory (seconds): after a CONFIRMED delivery, the next digest
                     * for the same subscription is held to at least this distance — the
                     * anti-chatter floor that stops wake-per-message at just-outside-window
                     * spacing. A mechanism parameter more than an operator knob: change with
                     * care, the witnesses drive short spans through it. Bound to the
                     * `NEO_WAKE_FLUSH_REFRACTORY_SECONDS` env name.
                     * @type {Number}
                     */
                    flushRefractorySeconds: leaf(120, 'NEO_WAKE_FLUSH_REFRACTORY_SECONDS', 'number'),
                    /**
                     * Hard digest-latency cap (seconds) measured from a queue's FIRST event:
                     * rolling extension and the refractory both yield to it. The long-standing
                     * "max 5 minutes" §6.4.1 design ceiling, now a declared leaf. Bound to the
                     * `NEO_WAKE_FLUSH_HARD_CAP_SECONDS` env name.
                     * @type {Number}
                     */
                    flushHardCapSeconds: leaf(300, 'NEO_WAKE_FLUSH_HARD_CAP_SECONDS', 'number'),
                    /**
                     * Delivery-attempt bound (seconds): one adapter attempt may hold the
                     * per-subscription delivery owner at most this long — a hung transport
                     * times out as a FAILED attempt (retry path), so an unresponsive adapter
                     * can never starve the queue behind the in-flight reservation and defeat
                     * the hard cap. Bound to the `NEO_WAKE_ATTEMPT_TIMEOUT_SECONDS` env name.
                     * @type {Number}
                     */
                    attemptTimeoutSeconds: leaf(30, 'NEO_WAKE_ATTEMPT_TIMEOUT_SECONDS', 'number')
                },
                /**
                 * Local-only maintenance lane switches. Cloud deployments can disable these
                 * without changing remote graph-backed A2A / Memory Core behavior.
                 * `null` means "use the deployment profile default" (`local` enables,
                 * `cloud` disables); set `true` only when explicitly opting a lane back in.
                 * Exception: `bridgeDaemonEnabled` + `swarmHeartbeatEnabled` default `false`
                 * (wake + heartbeat OFF) — the Stop hook makes them redundant flood; see their
                 * inline notes. Both remain env-overridable to re-enable.
                 * @type {Object}
                 */
                localOnly: {
                    primaryDevSyncEnabled    : leaf(null, 'NEO_ORCHESTRATOR_PRIMARY_DEV_SYNC_ENABLED', 'boolean'),
                    kbSyncEnabled            : leaf(null, 'NEO_ORCHESTRATOR_KB_SYNC_ENABLED', 'boolean'),
                    githubWorkflowSyncEnabled: leaf(null, 'NEO_ORCHESTRATOR_GITHUB_WORKFLOW_SYNC_ENABLED', 'boolean'),
                    // Temporal-pyramid aggregation reads checkout-bound sources (resources/content, git log
                    // origin/dev, learn/agentos/decisions) → local-only. Cloud tenants get their corpus via
                    // push-ingest, not this local scan.
                    temporalSummaryEnabled   : leaf(null, 'NEO_ORCHESTRATOR_TEMPORAL_SUMMARY_ENABLED', 'boolean'),
                    // Local profile may supervise a child Chroma process; cloud profile
                    // reaches the compose-owned `chroma` peer container instead.
                    chromaDaemonEnabled    : leaf(null, 'NEO_ORCHESTRATOR_CHROMA_DAEMON_ENABLED', 'boolean'),
                    // Desktop wake-DELIVERY gate. Defaults OFF: the lane-state Stop hook forces turn
                    // continuation, so wake interrupts are redundant duplicate-flood at multi-peer
                    // scale (A2A messages still persist + surface on the next list_messages).
                    // Set `true` (or `NEO_ORCHESTRATOR_BRIDGE_DAEMON_ENABLED=true`) to restore delivery.
                    bridgeDaemonEnabled    : leaf(false, 'NEO_ORCHESTRATOR_BRIDGE_DAEMON_ENABLED', 'boolean'),
                    neuralLinkBridgeEnabled: leaf(null, 'NEO_ORCHESTRATOR_NL_BRIDGE_ENABLED', 'boolean'),
                    // The embed daemon durably drains the add_memory WAL into the content store
                    // (ai/daemons/embed/daemon.mjs). Local profile supervises it as a child
                    // process; cloud deployments own their drain story per-container (mirror of
                    // the chromaDaemonEnabled split).
                    embedDaemonEnabled             : leaf(null, 'NEO_ORCHESTRATOR_EMBED_DAEMON_ENABLED', 'boolean'),
                    // The message daemon observes the accepted A2A-message WAL. Local profile may
                    // supervise it as a child process; cloud deployments use Memory Core's
                    // messageWal.inProcessDrain host mode instead.
                    messageDaemonEnabled           : leaf(null, 'NEO_ORCHESTRATOR_MESSAGE_DAEMON_ENABLED', 'boolean'),
                    goldenPathRepoEnrichmentEnabled: leaf(null, 'NEO_ORCHESTRATOR_GOLDEN_PATH_REPO_ENRICHMENT_ENABLED', 'boolean'),
                    // Swarm-heartbeat lane: emits wake-substrate pulses + heartbeat-driven idle/swarm
                    // wakes (`WakeDecisionService.decideWake` runs INSIDE `SwarmHeartbeatService.pulse()`).
                    // Defaults OFF: the lane-state Stop hook covers turn continuation, so these pulses
                    // are redundant duplicate-flood at multi-peer scale. Substrate maintenance
                    // (GraphLog compaction, integrity sweep, embed/message daemons) runs via its own
                    // separate task toggles and is unaffected. Set `true` (or
                    // `NEO_ORCHESTRATOR_SWARM_HEARTBEAT_ENABLED=true`) to restore.
                    swarmHeartbeatEnabled          : leaf(false, 'NEO_ORCHESTRATOR_SWARM_HEARTBEAT_ENABLED', 'boolean'),
                    // Reserved policy placeholder: no runtime consumer yet.
                    // `bridgeDaemonEnabled` is the active scheduler gate for desktop wake delivery.
                    wakeDispatchEnabled            : leaf(null)
                },
                /**
                 * Cloud-only maintenance lane switches (mirror of `localOnly` with inverted
                 * deployment-default: `null` means "use the deployment-profile default" —
                 * cloud enables, local disables. Set `true` only when explicitly opting a
                 * lane back in for the LOCAL profile (e.g. operator-side smoke testing of
                 * tenant-repo-sync without a cloud-profile container).
                 * @type {Object}
                 */
                cloudOnly: {
                    // Tenant-repo-sync is a cloud-deployable lane: cloud profile defaults enabled
                    // when tenant repos are configured; local Neo-maintainer profile defaults
                    // disabled unless explicitly opted in.
                    tenantRepoSyncEnabled: leaf(null, 'NEO_ORCHESTRATOR_TENANT_REPO_SYNC_ENABLED', 'boolean'),
                    // B1 docker-socket sibling-container recovery (the immune system's privileged tier).
                    // Cloud profile defaults enabled (no operator present to manually restart a wedged
                    // sibling); local profile defaults disabled (the operator IS present + autonomously
                    // recycling a dev container is disruptive). B0 in-process recycle + data-integrity
                    // re-embed + the read-only deployment-state bridge stay active locally regardless.
                    // ORTHOGONAL to `recoveryActuator.blockedComposeServices` (ADR-26): this mode-gate is
                    // "is B1 active in this deployment at all"; the blocklist is the per-service opt-out
                    // WITHIN an active mode. They compose; do not overload the blocklist to express the mode gate.
                    composeServiceRecoveryEnabled: leaf(null, 'NEO_ORCHESTRATOR_COMPOSE_SERVICE_RECOVERY_ENABLED', 'boolean')
                },
                /**
                 * Recovery actuator envelope. Enabled by default so deployed immune-system
                 * lanes can heal without per-deployment recovery target allowlists. Operators
                 * can block specific supervised tasks, compose services, or deploy targets while
                 * the runtime-access holder still gates compose services to known labels.
                 * @type {Object}
                 */
                recoveryActuator: {
                    enabled                    : leaf(true, 'NEO_RECOVERY_ACTUATOR_ENABLED', 'boolean'),
                    blockedSupervisedTasks     : leaf([], 'NEO_RECOVERY_ACTUATOR_BLOCKED_SUPERVISED_TASKS', 'csv'),
                    blockedComposeServices     : leaf([], 'NEO_RECOVERY_ACTUATOR_BLOCKED_COMPOSE_SERVICES', 'csv'),
                    blockedDeployTargets       : leaf([], 'NEO_RECOVERY_ACTUATOR_BLOCKED_DEPLOY_TARGETS', 'csv'),
                    healAttemptsPath           : leaf(path.resolve(planeDataRootDefault, 'orchestrator-daemon/heal-attempts.json'), 'NEO_RECOVERY_ACTUATOR_HEAL_ATTEMPTS_PATH', 'string', {planeMember: true}),
                    recoveryRunStateDir        : leaf(path.resolve(planeDataRootDefault, 'orchestrator-daemon/recovery-runs'), 'NEO_RECOVERY_ACTUATOR_RUN_STATE_DIR', 'string', {planeMember: true}),
                    recoveryRunRetentionLimit  : leaf(100, 'NEO_RECOVERY_ACTUATOR_RUN_RETENTION_LIMIT', 'number'),
                    maxAttemptsPerWindow       : leaf(3, 'NEO_RECOVERY_ACTUATOR_MAX_ATTEMPTS_PER_WINDOW', 'number'),
                    maxAttemptsWindowMs        : leaf(HOUR_MS, 'NEO_RECOVERY_ACTUATOR_MAX_ATTEMPTS_WINDOW_MS', 'number'),
                    baseBackoffMs              : leaf(5 * 60 * 1000, 'NEO_RECOVERY_ACTUATOR_BASE_BACKOFF_MS', 'number'),
                    maxBackoffMs               : leaf(HOUR_MS, 'NEO_RECOVERY_ACTUATOR_MAX_BACKOFF_MS', 'number'),
                    verifyCooldownMs           : leaf(60 * 1000, 'NEO_RECOVERY_ACTUATOR_VERIFY_COOLDOWN_MS', 'number'),
                    healthyObservationThreshold: leaf(1, 'NEO_RECOVERY_ACTUATOR_HEALTHY_OBSERVATION_THRESHOLD', 'number'),
                    // Due-only freeze re-probes own a transport deadline distinct from healthcheck cadence.
                    // The orchestrator reads this leaf at the use site; consumers never re-derive it from env.
                    freezeReprobeTimeoutMs     : leaf(30 * 1000, 'NEO_RECOVERY_ACTUATOR_FREEZE_REPROBE_TIMEOUT_MS', 'number'),
                    /**
                     * Heal-event ledger retention (the observability sink must not become its own disk leak). The
                     * append-time auto-prune keeps the newest `maxEvents` once the file crosses `pruneTriggerBytes`.
                     * Read at the orchestrator/actuator boundary and passed EXPLICITLY into the pure ledger helper
                     * (which owns no production default — this leaf is the source of truth). `maxEvents` sits well above the dispatch
                     * anti-thrash window so a prune can never evict a within-window attempt; the byte-trigger
                     * amortizes the O(N) prune (at ~150 B/entry the 5000-event cap is ~750 KB; a 1 MB trigger leaves headroom).
                     * @type {Object}
                     */
                    healLedger: {
                        maxEvents        : leaf(5000,        'NEO_RECOVERY_ACTUATOR_HEAL_LEDGER_MAX_EVENTS',          'number'),
                        pruneTriggerBytes: leaf(1024 * 1024, 'NEO_RECOVERY_ACTUATOR_HEAL_LEDGER_PRUNE_TRIGGER_BYTES', 'number')
                    },
                    /**
                     * Systemic-fault circuit-breaker bounds — the cross-collection layer above the per-collection
                     * anti-thrash (`maxAttemptsPerWindow`/`maxAttemptsWindowMs`). >= `systemicThreshold` DISTINCT
                     * collections failing with a shared embedder-outage signature inside `windowMs` trips the circuit
                     * OPEN (suppress every heal) for `openDurationMs`, then allows one half-open recovery probe.
                     * Consumed by `decideSystemicCircuit`: read at the actuator use-site and passed as its `bounds`.
                     * @type {Object}
                     */
                    systemicCircuit: {
                        systemicThreshold: leaf(3,              'NEO_RECOVERY_ACTUATOR_SYSTEMIC_CIRCUIT_THRESHOLD',        'number'),
                        windowMs         : leaf(10 * 60 * 1000, 'NEO_RECOVERY_ACTUATOR_SYSTEMIC_CIRCUIT_WINDOW_MS',        'number'),
                        openDurationMs   : leaf(10 * 60 * 1000, 'NEO_RECOVERY_ACTUATOR_SYSTEMIC_CIRCUIT_OPEN_DURATION_MS', 'number')
                    },
                    /**
                     * Chronic `unsafe-input` detector bounds — the immune system's self-observability for a
                     * MIS-WIRE. `dispatchHeal` fails CLOSED to `unsafe-input` on under-specified input (no
                     * collection / non-finite clock / missing recordRun); a single one is routine, but >=
                     * `threshold` for the SAME (action, collection) inside `windowMs` means a caller is
                     * chronically mis-wired and that heal silently never executes. Consumed by
                     * `detectChronicUnsafeInput`: read at the use-site and passed as its bounds.
                     * @type {Object}
                     */
                    chronicUnsafeInput: {
                        threshold: leaf(5,              'NEO_RECOVERY_ACTUATOR_CHRONIC_UNSAFE_INPUT_THRESHOLD', 'number'),
                        windowMs : leaf(60 * 60 * 1000, 'NEO_RECOVERY_ACTUATOR_CHRONIC_UNSAFE_INPUT_WINDOW_MS', 'number')
                    }
                },
                /**
                 * Optional local Neo repo roots for the primary-dev-sync lane.
                 * Keep the template machine-neutral; set real absolute paths in gitignored
                 * `ai/config.mjs` or via `NEO_ORCHESTRATOR_DEV_SYNC_ROOTS`.
                 * @type {String[]}
                 */
                devSyncRoots: leaf([], 'NEO_ORCHESTRATOR_DEV_SYNC_ROOTS', 'string'),
                /**
                 * Tenant-repo-sync per-repo scheduling parameters.
                 *
                 * The cadence floor lives in `intervals.tenantRepoSyncMs` above (30min default).
                 * Per-repo cadence in `tenantRepos[].cadenceMs` (operator-set) overrides global.
                 *
                 * - `jitterRatio` caps the deterministic per-repo jitter offset as a fraction
                 *   of the base cadence. Default `0.20` keeps jitter within the operator-visible
                 *   cadence window.
                 *   Set `0` to disable jitter entirely (deterministic-cadence-only, no anti-
                 *   thundering-herd protection — only safe for low-tenant deployments).
                 * - `sweepCadenceMs` is the frequency at which the orchestrator wakes the
                 *   tenant-repo-sync task. Decoupled from per-repo cadence (`intervals.tenantRepoSyncMs`)
                 *   so deterministic jitter can actually spread per-repo sync attempts across
                 *   the jitter window. A short sweep cadence + a long per-repo cadence means
                 *   each sweep checks all repos against their individual due-times; repos
                 *   become due at different sweeps based on their deterministic jitter offset.
                 * - `leaseStaleAfterMs` bounds the cross-process tenant-repo-sync lease that
                 *   serializes the daemon's periodic sweep against the manual CLI over the
                 *   shared revisions manifest. Crashed owners are reclaimed immediately via
                 *   pid-liveness; this TTL is only the backstop for a live-but-wedged owner
                 *   and MUST comfortably exceed the longest legitimate sweep (clone + ingest
                 *   across every configured repo) — the six-hour default mirrors the
                 *   heavy-maintenance lease authority. Ownership is additionally re-verified
                 *   at every manifest commit point, so an evicted writer aborts instead of
                 *   overlapping the new owner.
                 *
                 * @type {Object}
                 */
                tenantRepoSync: {
                    jitterRatio      : leaf(0.20, 'NEO_ORCHESTRATOR_TENANT_REPO_SYNC_JITTER_RATIO', 'number'),
                    leaseStaleAfterMs: leaf(6 * 60 * 60 * 1000, 'NEO_ORCHESTRATOR_TENANT_REPO_SYNC_LEASE_STALE_AFTER_MS', 'number'),
                    sweepCadenceMs   : leaf(60 * 1000, 'NEO_ORCHESTRATOR_TENANT_REPO_SYNC_SWEEP_CADENCE_MS', 'number')
                },
                /**
                 * Orchestrator-owned MLX inference server config. Operators tune via gitignored
                 * `ai/config.mjs` or env vars (`NEO_ORCHESTRATOR_MLX_ENABLED`,
                 * `NEO_ORCHESTRATOR_MLX_MODEL`, `NEO_ORCHESTRATOR_MLX_PORT`).
                 *
                 * - `enabled`: whether the orchestrator should supervise an `mlx_lm.server` child
                 *   process. Disabled by default because LM Studio / other OpenAI-compatible
                 *   providers already own the normal inference endpoint; enable only when this
                 *   orchestrator should own MLX directly.
                 * - `model`: Hugging Face repo id or local path for `mlx_lm.server --model`.
                 *   Distinct from the OpenAI-compatible API payload model label (`NEO_OPENAI_COMPATIBLE_MODEL`).
                 * - `port`: OpenAI-compatible local-inference port.
                 * @type {Object}
                 */
                mlx: {
                    enabled: leaf(false, 'NEO_ORCHESTRATOR_MLX_ENABLED', 'boolean'),
                    model  : leaf('mlx-community/gemma-4-31b-it-bf16', 'NEO_ORCHESTRATOR_MLX_MODEL', 'string'),
                    port   : leaf('11435', 'NEO_ORCHESTRATOR_MLX_PORT', 'string')
                },
                /**
                 * Orchestrator-owned native Ollama server config. Operators tune via gitignored
                 * `ai/config.mjs` or env var `NEO_ORCHESTRATOR_OLLAMA_ENABLED`.
                 *
                 * - `enabled`: whether the orchestrator may supervise `ollama serve` for local-dev
                 *   roles explicitly routed through the native `ollama` provider. The task is
                 *   still omitted when no configured chat / embedding role targets `ollama`, so
                 *   this default does not start Ollama for the standard OpenAI-compatible setup.
                 *   When active, `OLLAMA_HOST`, `OLLAMA_KEEP_ALIVE`, `OLLAMA_CONTEXT_LENGTH`, and
                 *   `OLLAMA_MAX_LOADED_MODELS` are derived from the canonical provider and
                 *   local-model config leaves.
                 * @type {Object}
                 */
                ollama: {
                    enabled: leaf(true, 'NEO_ORCHESTRATOR_OLLAMA_ENABLED', 'boolean')
                },
                /**
                 * Orchestrator-owned LM Studio CLI (`lms`) inference server config. Operators
                 * tune via gitignored `ai/config.mjs` or env vars (`NEO_ORCHESTRATOR_LMS_ENABLED`,
                 * `NEO_ORCHESTRATOR_LMS_MODEL`, `NEO_ORCHESTRATOR_LMS_PORT`).
                 *
                 * Parallel alternative to `orchestrator.mlx` — both serve OpenAI-compatible HTTP
                 * for local chat + embedding workloads; pick at most one via the respective `enabled` flag.
                 *
                 * - `enabled`: whether the orchestrator should supervise an `lms server start`
                 *   child process. Enabled by default for local Agent OS chat + embedding roles;
                 *   **macOS-only** (LM Studio CLI is not
                 *   shipped for Linux containers, so this lane is local-dev substrate, not
                 *   cloud-deployment substrate).
                 * - `model`: legacy single-model field kept for existing operator overlays. The
                 *   orchestrator-managed `lms server start` lane pre-warms the configured
                 *   OpenAI-compatible models for roles actively routed through the
                 *   `openAiCompatible` provider via `lms load <model>` after server spawn.
                 *   Distinct from the OpenAI-compatible API payload label (`NEO_OPENAI_COMPATIBLE_MODEL`).
                 * - `port`: OpenAI-compatible local-inference port (LM Studio CLI default `1234`).
                 * @type {Object}
                 */
                lms: {
                    enabled: leaf(true, 'NEO_ORCHESTRATOR_LMS_ENABLED', 'boolean'),
                    model  : leaf('qwen3-embedding-8b', 'NEO_ORCHESTRATOR_LMS_MODEL', 'string'),
                    port   : leaf('1234', 'NEO_ORCHESTRATOR_LMS_PORT', 'string')
                }
            },
            /**
             * Business-engine layer configuration (the graph-as-business-operating-system substrate).
             * Read at the use site per the AiConfig SSOT discipline; the metric-ingestion probe is the
             * first consumer. Source descriptors needing endpoints/cadences join this subtree when a
             * source that reads them lands — no speculative leaves.
             * @type {Object}
             */
            business: {
                /**
                 * Master switch for the read-only business-metric ingestion probe. The probe refuses
                 * to run when disabled — fail-closed by construction, so metric writes into the
                 * production graph are always an explicit operator decision.
                 * @type {boolean}
                 */
                metricProbeEnabled: leaf(false, 'NEO_BUSINESS_METRIC_PROBE', 'boolean'),
                /**
                 * Comma-separated allowlist of metric categories (`metricName` values) the probe may
                 * ingest with `publicFlag: true`. Categories are public by design; anything not listed
                 * is refused at the probe boundary — the schema-side redaction gate's config half.
                 * @type {string}
                 */
                publicCategoryAllowlist: leaf('merged-prs,review-latency,stars-total,npm-downloads', 'NEO_BUSINESS_PUBLIC_CATEGORIES', 'string')
            },
            /**
             * Agent OS maintenance policy shared by operator scripts and daemons.
             * @type {Object}
             */
            maintenance: leaf({
                /**
                 * Canonical atomic-bundle backup policy. Bundles remain atomic; per-substrate
                 * retention is intentionally not represented here.
                 * @type {Object}
                 */
                backup: {
                    intervalMs: DAY_MS,
                    retention : {
                        keepMinimum: 3,
                        maxDays    : 30
                    },
                    /**
                     * Off-host durability hook (plain nested keys inside this object leaf — the owning
                     * ticket owns validation; see backup.mjs#validateOffHostSyncConfig). An empty
                     * `command` disables the hook entirely. Secrets never enter this tree: `envAllowlist`
                     * names env vars the sync child may inherit; values live only in the process env.
                     * @type {Object}
                     */
                    offHostSync: {
                        argv        : [],
                        command     : '',
                        envAllowlist: [],
                        killGraceMs : 5000,
                        timeoutMs   : 600000
                    }
                },
                /**
                 * Chroma defrag policy. Cadence here is operator policy only — no daemon
                 * auto-spawns defrag from THIS value. The orchestrator's max-runtime recycle
                 * path can auto-spawn `ai:defrag-kb`, driven by `orchestrator.chroma.maxRuntimeMs`;
                 * that is a distinct config, not this cadence.
                 * @type {Object}
                 */
                defrag: {
                    intervalMs       : 7 * DAY_MS,
                    snapshotRetention: {
                        keepMinimum: 3,
                        maxDays    : 7
                    }
                }
            }),
            /**
             * Knowledge Base operations configuration for cloud-native ingestion, reconciliation,
             * alerting, and garbage-collection policy.
             * @type {Object}
             */
            knowledgeBase: leaf({
                /**
                 * Operator alert rules. Each entry is
                 * `{metric, threshold, severity, channels, deliveryMode?}`. Empty by default —
                 * the alerting daemon no-ops with no rules.
                 * @type {Object[]}
                 */
                alertRules: [],
                /**
                 * Master opt-in for the KB operator-alerting daemon.
                 * Disabled by default; the daemon exits early when false.
                 * @type {Boolean}
                 */
                alertingEnabled: false,
                /**
                 * Alerting daemon poll interval in ms (default 15 min).
                 * @type {Number}
                 */
                alertingIntervalMs: 15 * 60 * 1000,
                /**
                 * Per-`(tenant, metric, severity, channel)` hysteresis
                 * cooldown window in ms (default 1 h).
                 * @type {Number}
                 */
                alertingCooldownMs: 60 * 60 * 1000,
                /**
                 * Rolling look-back window in ms for the per-tenant
                 * telemetry rollup the rule engine evaluates (default 1 h).
                 * @type {Number}
                 */
                alertWindowMs: 60 * 60 * 1000,
                /**
                 * Master opt-in for the KB reconciliation daemon.
                 * Disabled by default; the daemon exits early when false.
                 * @type {Boolean}
                 */
                reconciliationEnabled: false,
                /**
                 * Reconciliation daemon poll interval in ms (default 1 h).
                 * @type {Number}
                 */
                reconciliationIntervalMs: 60 * 60 * 1000,
                /**
                 * Opt-in for the destructive auto-tombstone reconciliation
                 * action. Disabled by default — the daemon then detects config-stale chunks and
                 * emits config-stale telemetry only, issuing no `collection.delete`.
                 * @type {Boolean}
                 */
                reconciliationAutoTombstone: false,
                /**
                 * Config-version-gap threshold above which a config-stale
                 * chunk becomes auto-tombstone-eligible: a chunk is actioned when
                 * `currentConfigVersion - chunk.tenantConfigVersion >= this`. Default `2` gives
                 * one full config epoch of grace. Consulted only when `reconciliationAutoTombstone`.
                 * @type {Number}
                 */
                reconciliationOrphanVersionGap: 2,
                /**
                 * Master opt-in for the KB garbage-collection daemon.
                 * Disabled by default; the daemon exits early when false.
                 * @type {Boolean}
                 */
                gcEnabled: false,
                /**
                 * GC daemon poll interval in ms (default 24 h).
                 * @type {Number}
                 */
                gcIntervalMs: 24 * 60 * 60 * 1000,
                /**
                 * Retention policy: `{maxAgeMs?, maxCount?}`. A chunk is
                 * retention-expired if it is older than `maxAgeMs` (by its `ingestedAt` stamp) OR
                 * ranks beyond the `maxCount` most-recent of its `{tenantId, repoSlug}` bucket.
                 * Empty `{}` (the default) expires nothing — conservative.
                 * @type {Object}
                 */
                gcRetention: {},
                /**
                 * Opt-in for the destructive GC delete. Disabled by default —
                 * the daemon then detects retention-expired chunks and emits telemetry only,
                 * issuing no `collection.delete`.
                 * @type {Boolean}
                 */
                gcAutoDelete: false,
                /**
                 * Cumulative-deletion fraction above which a GC tick emits a
                 * `defrag-recommended` signal (operators should then run `ai:defrag-kb`). `0`
                 * disables the signal. V1 emits the signal only — it does not spawn defrag.
                 * @type {Number}
                 */
                gcDefragThreshold: 0.10
            }),
            /**
             * A dummy embedding function to satisfy ChromaDB when embeddings are provided manually.
             * @returns {Object}
             */
            dummyEmbeddingFunction: leaf({
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
            })
        },
        /**
         * Reactive computed config values (`Neo.state.Provider` formulas).
         */
        formulas: {
            'engines.chroma.useTestDatabase': data => data.engines.chroma.useUnitTestDatabase || data.engines.chroma.useTestHarness,
            'engines.chroma.dataDir'        : data => data.engines.chroma.useTestDatabase ? data.engines.chroma.dataDirTest : data.engines.chroma.dataDirProd,
            'engines.chroma.host'           : data => data.engines.chroma.useTestDatabase ? data.engines.chroma.hostTest    : data.engines.chroma.hostProd,
            'engines.chroma.port'           : data => data.engines.chroma.useTestDatabase ? data.engines.chroma.portTest    : data.engines.chroma.portProd
        }
    }
}

/**
 * @summary The plane-member paths this Tier-1 base claims — the enumerable input for the
 * F-invariant's member-coherence clause (`assertPlaneMemberCoherence`): each entry must
 * resolve beneath the resolved `plane.dataRoot` or be explicitly placed per profile.
 * Deliberately excludes `orchestrator.tenantRepoMirrorRoot` (cloud-profile-pinned; the
 * per-profile placement election owns profile-pinned members).
 */
export const PLANE_MEMBER_PATHS = Object.freeze([
    'auth.seatTokenRegistryPath',
    'backupPath',
    'wakeDaemonHeartbeatAlivePath',
    'fleet.instanceRoot',
    'engines.chroma.dataDirProd',
    'orchestrator.dataDir',
    'orchestrator.dbPath',
    'orchestrator.deploymentStateBridge.snapshotPath',
    'orchestrator.recoveryActuator.healAttemptsPath',
    'orchestrator.recoveryActuator.recoveryRunStateDir'
]);

export default Neo.setupClass(ConfigBase);
