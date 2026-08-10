import aiConfig                                                                      from '../../mcp/server/knowledge-base/config.mjs';
import Base                                                                          from '../../../src/core/Base.mjs';
import {buildChatModel}                                                              from '../../provider/buildChatModel.mjs';
import {PROVIDER_TIMEOUT_CODE}                                                       from '../../provider/createTimeoutError.mjs';
import ChromaManager                                                                 from './ChromaManager.mjs';
import fs                                                                            from 'fs-extra';
import logger                                                                        from '../../mcp/server/knowledge-base/logger.mjs';
import path                                                                          from 'path';
import QueryService                                                                  from './QueryService.mjs';
import {checkAskRateLimit}                                                           from './helpers/askRateLimit.mjs';
import {isRemoteKnowledgeBaseDeployment}                                             from './helpers/deploymentMode.mjs';
import {getMissingAskSynthesisLeaves}                                                from './helpers/askSynthesisGuard.mjs';
import GraphService                                                                  from '../memory-core/GraphService.mjs';
import {CONCEPT_EXPANSION_EDGE_TYPES, KB_TERMINAL_EDGE_TYPES, enrichWithConceptWalk} from '../graph/conceptAnchoredRetrieval.mjs';
import {buildKbFileResolveCandidate}                                                 from './conceptWalkKbFileGate.mjs';
import KBRecorderService                                                             from './KBRecorderService.mjs';

const LOCAL_EMPTY_COLLECTION_ANSWER  = "The knowledge base collection is empty. Populate it with the release artifact via 'npm run ai:download-kb' (or build locally with 'npm run ai:sync-kb').";
const REMOTE_EMPTY_COLLECTION_ANSWER = "The knowledge base collection is empty. In a cloud or remote tenant-ingestion deployment, inspect ingestion state first: call get_ingestion_progress(), then inspect_deployment or get_deployment_state_snapshot for tenantRepoSync / deployment-state details. For push-mode tenants, run the configured ingest_source_files or bulk tenant-ingest path before retrying the query.";

/**
 * @summary Orchestrates Retrieval-Augmented Generation (RAG) by combining semantic search with LLM synthesis.
 *
 * This service acts as the bridge between the user's natural language question and the project's knowledge base.
 * Instead of simply returning a list of files, it:
 * 1.  **Retrieves**: Uses `QueryService` to find the most relevant files based on semantic similarity and intelligent scoring (boosting guides, architectural docs).
 * 2.  **Reads**: Fetches the full content of these files from the local filesystem to ensure the LLM has complete context (avoiding truncated metadata).
 * 3.  **Synthesizes**: Sends the query and the file contents to the configured synthesis model (Gemini / OpenAI-compatible / Ollama) to generate a precise, grounded answer.
 *
 * This "Read-Eval-Generate" loop allows agents to ask complex questions like "How do I implement a Store?" and get a
 * code-complete answer without manually searching and reading multiple files.
 *
 * @class Neo.ai.services.knowledge-base.SearchService
 * @extends Neo.core.Base
 * @singleton
 * @see Neo.ai.services.knowledge-base.QueryService
 */
class SearchService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.services.knowledge-base.SearchService'
         * @protected
         */
        className: 'Neo.ai.services.knowledge-base.SearchService',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * @member {Object|null} model=null
     * @protected
     */
    model = null
    /**
     * Why the synthesis model is unavailable, when it is — `{code, reason}` set at construct for
     * the stale-overlay case (missing `askSynthesis` block). `ask()`'s null-model branch threads
     * it into the degraded-references envelope so the caller sees the actionable remediation
     * instead of the generic missing-key message. `null` when the model built normally OR for the
     * legacy gemini-without-key case (which keeps its established `no_provider` shape).
     * @member {Object|null} modelUnavailable=null
     * @protected
     */
    modelUnavailable = null
    /**
     * Rolling epoch-ms timestamps of recent ask-synthesis calls, consumed by the per-minute runaway
     * breaker in {@link ask}. Pruned to the active window on each call via {@link checkAskRateLimit}.
     * @member {Number[]} askCallTimestamps=[]
     * @protected
     */
    askCallTimestamps = []

    /**
     * Builds the synthesis model via the configured provider (`gemini` / `openAiCompatible` / `ollama`)
     * through the shared `buildChatModel` selector, so local deployments synthesize without a remote
     * Gemini key. `this.model` stays `null` only for `gemini` with no API key; `ask()` then returns the
     * degraded-reference response rather than attempting a remote call.
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        // Stale-overlay guard: the gitignored config.mjs is a MATERIALIZED template copy, so a
        // clone that pulled an evolved template without `--migrate-config` has no `askSynthesis`
        // block — the naked reads below were an uncaught `undefined.provider` TypeError that broke
        // the whole KB server boot. Retrieval (query/search) needs no chat model, so the server
        // must still boot: remember the reason, leave the model null, and let `ask()` return its
        // degraded-references envelope carrying the remediation. The later `aiConfig.askSynthesis`
        // reads inside `ask()` are unreachable in this state by construction (null-model early
        // return precedes them). No fabricated defaults — the config template owns defaults.
        const missing = getMissingAskSynthesisLeaves(aiConfig.askSynthesis, ['provider', 'model', 'timeoutMs', 'timeoutMsRemote', 'maxCallsPerMinute']);

        if (missing.length > 0) {
            this.modelUnavailable = {
                code  : 'stale_config',
                reason: `askSynthesis config leaves missing: ${missing.join(', ')} — sync the askSynthesis block from config.template.mjs into the local config.mjs (node ai/scripts/setup/initServerConfigs.mjs --migrate-config) and restart knowledge-base.`
            };
            logger.error(`[SearchService] ${this.modelUnavailable.reason} Retrieval stays available; ask() degrades to references-only until migrated.`);
            return;
        }

        // Build the synthesis model from the dedicated `askSynthesis` block (NOT the global
        // `modelProvider`), so the interactive ask path can use a fast remote model while bulk chat
        // stays local. `apiKey` resolves NEO_KB_ASK_API_KEY (env-only) read at the use site — never
        // inlined. For a local provider, `baseUrl` overrides the host (own-endpoint setups); null falls
        // through to the provider's configured host, and `model` selects the per-task model name.
        const ask = aiConfig.askSynthesis;

        // Each provider config is assembled by READING the four leaves `buildChatModel` consumes
        // (`apiKey` / `host` / `model` / `keep_alive`), never by spreading the AiConfig node.
        //
        // `{...aiConfig.openAiCompatible}` here was measurably `{}`. An AiConfig node is a
        // `Neo.state.Provider` proxy whose `get` trap walks the parent chain but whose `ownKeys`
        // trap (`Provider#getTopLevelDataKeys`) enumerates LOCAL `#dataConfigs` only — and these
        // leaves live on the Tier-1 root, so from the Knowledge Base child every named read is
        // correct and every enumeration is empty. The spread silently dropped `host`, leaving the
        // provider to fall back to its class default of `http://127.0.0.1:8000` — Chroma's port,
        // not a chat endpoint. It went unnoticed because the ask path defaulted to `gemini`, which
        // ignores this object entirely; pointing the default at a local provider is exactly what
        // would have surfaced it, as a chat request POSTed at a vector database.
        this.model = buildChatModel({
            modelProvider         : ask.provider,
            openAiCompatibleConfig: {
                // The PROVIDER's own key, never `ask.apiKey`. `NEO_KB_ASK_API_KEY` is the dedicated
                // GEMINI credential (passed below as `geminiApiKey`); forwarding it here would put a
                // cloud key in an `Authorization` header aimed at a local LM Studio that never asked
                // for one — a credential sent somewhere it has no business being, which is a leak
                // whether or not the key is currently valid.
                apiKey    : aiConfig.openAiCompatible.apiKey,
                host      : ask.baseUrl || aiConfig.openAiCompatible.host,
                model     : ask.model,
                keep_alive: aiConfig.openAiCompatible.keep_alive
            },
            ollamaConfig            : {
                host      : ask.baseUrl || aiConfig.ollama.host,
                model     : ask.model,
                keep_alive: aiConfig.ollama.keep_alive
            },
            geminiApiKey            : ask.apiKey,
            geminiModelName         : ask.model,
            providerActivityRecorder: KBRecorderService,
            providerActivityService : 'knowledge-base'
        });
    }

    /**
     * Ensures the service dependencies are ready.
     * @returns {Promise<void>}
     */
    async initAsync() {
        await super.initAsync();
        await ChromaManager.ready();
    }

    /**
     * Returns embedded chunk content when a ranked result carries full source metadata.
     * @param {Object} [metadata] Result metadata from QueryService.
     * @returns {String} The embedded content or an empty string.
     */
    getEmbeddedReferenceContent(metadata = {}) {
        return typeof metadata.content === 'string' && metadata.content.trim()
            ? metadata.content
            : '';
    }

    /**
     * Determines whether a ranked result belongs to a tenant/repo that must not be hydrated
     * from the local neoRootDir filesystem.
     * @param {Object} [metadata] Result metadata from QueryService.
     * @returns {Boolean} True when local filesystem hydration is unsafe for this reference.
     */
    isNonLocalTenantReference(metadata = {}) {
        const defaultTenantId = aiConfig.defaultTenantId;
        const defaultRepoSlug = aiConfig.defaultRepoSlug;

        if (metadata.repoSlug && metadata.repoSlug !== defaultRepoSlug) {
            return true;
        }

        if (!metadata.tenantId) {
            return false;
        }

        return metadata.tenantId !== defaultTenantId;
    }

    /**
     * Returns the operator-facing answer for a healthy but empty KB collection.
     *
     * Local stdio deployments need the curated Neo corpus download/sync hint. Remote Streamable HTTP deployments
     * expose tenant-ingestion tools, so an empty collection is first an ingestion-state diagnostic.
     *
     * @returns {String} The empty-collection remediation message.
     */
    getEmptyCollectionAnswer() {
        return isRemoteKnowledgeBaseDeployment(aiConfig)
            ? REMOTE_EMPTY_COLLECTION_ANSWER
            : LOCAL_EMPTY_COLLECTION_ANSWER;
    }

    /**
     * Resolves the best available source content for RAG synthesis.
     *
     * Local Neo references keep using neoRootDir filesystem hydration so agents see the
     * current checkout. Tenant-ingested references use Chroma metadata content instead,
     * preventing same-relative-path collisions from reading files out of the host repo.
     *
     * @param {Object} ref Query reference.
     * @returns {Promise<String>} Hydrated content or the standard placeholder.
     */
    async hydrateReferenceContent(ref) {
        const metadata        = ref.metadata || {};
        const embeddedContent = this.getEmbeddedReferenceContent(metadata);
        let   content         = '';
        let   absoluteSource  = '';

        if (this.isNonLocalTenantReference(metadata)) {
            if (embeddedContent) {
                return embeddedContent;
            }

            logger.warn(`[SearchService] Missing metadata.content for non-local tenant ref.source="${ref.source}" (tenantId="${metadata.tenantId}", repoSlug="${metadata.repoSlug || ''}") — refusing neoRootDir fallback.`);

            return 'No Content (File missing or empty)';
        }

        absoluteSource = ref.source && path.isAbsolute(ref.source)
            ? ref.source
            : path.resolve(aiConfig.neoRootDir, ref.source || '');

        if (absoluteSource && await fs.pathExists(absoluteSource)) {
            try {
                content = await fs.readFile(absoluteSource, 'utf8');
            } catch (err) {
                logger.warn(`[SearchService] Failed to read file ${absoluteSource}:`, err.message);
            }
        }

        if (!content && embeddedContent) {
            return embeddedContent;
        }

        if (!content) {
            content = 'No Content (File missing or empty)';
            logger.warn(`[SearchService] Empty context for ref.source="${ref.source}" (resolved to "${absoluteSource}") — chunk content will not reach the synthesis LLM.`);
        }

        return content;
    }

    /**
     * @summary Creates the degraded response used when retrieval succeeds but synthesis is unavailable.
     *
     * Returned as a SUCCESS content payload (NO top-level `error` key) so the MCP boundary delivers
     * the references + reason to the caller. `BaseServer.formatToolResult` routes any `'error' in result`
     * object to an error envelope (`Tool Error: … Message: …`) that discards `answer`/`references`/`reason`
     * — so an `error` key here would defeat the whole point of degrading gracefully. Callers detect
     * degradation via `degraded: true`; `degradedCode` disambiguates the cause for diagnostics.
     * @param {Object} params
     * @param {Object[]} params.references Ranked references returned by QueryService.
     * @param {Error|String} params.error The synthesis failure to expose in bounded form.
     * @param {String} [params.code] Explicit degraded cause code; when omitted, derived as
     *     `synthesis_timeout` when the error carries `PROVIDER_TIMEOUT_CODE` (structural — uniform across
     *     local providers per `createTimeoutError`) or the reason reports a timeout (regex fallback),
     *     else `synthesis_failed`.
     * @returns {{answer: String, references: Object[], degraded: Boolean, degradedCode: String, reason: String}}
     * @private
     */
    #createDegradedSynthesisResponse({references, error, code}) {
        const reason       = this.#sanitizeSynthesisError(error);
        const isTimeout    = error?.code === PROVIDER_TIMEOUT_CODE || /timed out/i.test(reason);
        const degradedCode = code || (isTimeout ? 'synthesis_timeout' : 'synthesis_failed');

        return {
            answer  : `Knowledge-base retrieval succeeded, but answer synthesis is currently unavailable (${reason}). Use the references directly while the synthesis provider recovers.`,
            references,
            degraded: true,
            degradedCode,
            reason
        };
    }

    /**
     * @summary Bounds synthesis-provider errors before returning them through MCP callers.
     * @param {Error|String} error The raw provider error.
     * @returns {String} A credential-safe, bounded reason string.
     * @private
     */
    #sanitizeSynthesisError(error) {
        const raw = typeof error === 'string'
            ? error
            : (error?.message || 'Synthesis provider unavailable');

        return raw
            .replace(/AIza[0-9A-Za-z_-]{20,}/g, '[redacted-api-key]')
            .slice(0, 500);
    }

    /**
     * @summary The honest empty-result envelope — an empty COLLECTION names the download one-liner (the
     * common cold-start), otherwise a plain no-match. Shared by the flat-empty short-circuit and the
     * post-walk guard (an empty flat the concept-walk could not rescue).
     * @returns {Promise<{answer: String, references: Object[]}>}
     * @private
     */
    async #emptyFlatResponse() {
        const count = await ChromaManager.getKnowledgeBaseCollection()
            .then(collection => collection.count())
            .catch(() => null);

        return {
            answer: count === 0
                ? this.getEmptyCollectionAnswer()
                : "No relevant documents found in the knowledge base.",
            references: []
        };
    }

    /**
     * Performs a semantic search via QueryService and synthesizes an answer using the LLM.
     *
     * @param {Object} params
     * @param {String} params.query The natural language query.
     * @param {String} [params.type='all'] Optional content type filter (e.g., 'guide', 'src').
     * @param {Number} [params.limit=5] Number of source files to include in the context.
     * @returns {Promise<Object>} The synthesized answer and references.
     */
    async ask({query, type = 'all', limit = 5, conceptWalk = false}) {
        logger.info(`[SearchService] Processing RAG query: "${query}" (Type: ${type})`);

        // 1. Retrieve most relevant files using QueryService's scoring logic
        const queryResult = await QueryService.queryDocuments({query, type, limit, includeMetadata: true});

        const emptyFlat = queryResult.message || !queryResult.results || queryResult.results.length === 0;

        // An empty flat result short-circuits to the honest empty answer — UNLESS the concept-walk is
        // opted in: the walk resolves concepts from the QUERY (not the flat candidates), so it can
        // structurally RESCUE docs the embedding search missed. A flat miss must not skip the graph; if
        // the walk ALSO finds nothing, the post-walk guard below returns the same honest empty answer.
        if (emptyFlat && !conceptWalk) {
            return this.#emptyFlatResponse();
        }

        const references = (queryResult.results || []).map(r => ({
            name  : r.source.split('/').pop(),
            source: r.source,
            score : Number(r.score)
        }));

        // Opt-in concept-anchored wrap (default OFF → `references` above is the byte-identical flat
        // path). The walk augments — never displaces — the embedding references with concept-
        // neighborhood KB docs (a CONCEPT→FILE edge → the doc whose metadata.source matches), each
        // re-authorized through the SAME read-side tenant filter via QueryService.findDocBySource
        // (buildKbFileResolveCandidate fails closed). GraphService is reached directly — the
        // IngestionService precedent for a KB-domain service reading the graph.
        let responseReferences = references,
            walkContextRefs    = references,   // metadata-bearing set, internal to the synthesis context
            conceptWalkEvent   = null;

        if (conceptWalk) {
            // Await the graph's canonical lifecycle gate before the opt-in walk. Pre-init `db===null`
            // makes graph reads return empty WITHOUT throwing (distinct from a hard failure), so without
            // this wait a request racing transient initialization silently contributes nothing though
            // the graph is ready moments later. `ready()` also resolves with `db===null` when init
            // FAILED, so a completed-unavailable graph still degrades to the flat path (byte-identical),
            // never a wait-forever. KB startup does not otherwise await GraphService (concept-walk gate 4).
            await GraphService.ready();

            const enriched = await enrichWithConceptWalk({
                graphService         : GraphService,
                query,
                candidates           : references,
                conceptWalk          : true,
                getCandidateId       : ref => ref.source,
                traversableNodeLabels: ['FILE'],
                traversableLabels    : ['CONCEPT'],   // fork-1: KB expands through CONCEPT only; FILE is terminal (a candidate, never traversed THROUGH past the KB result boundary)
                traversableEdgeTypes : CONCEPT_EXPANSION_EDGE_TYPES, // (i) expansion: walk THROUGH concept↔concept relations only
                terminalEdgeTypes    : KB_TERMINAL_EDGE_TYPES,       // (i) terminal admission: only IMPLEMENTED_BY→FILE hydrates a candidate (an arbitrary SENT_TO→FILE is rejected)
                resolveCandidate     : buildKbFileResolveCandidate({
                    findKbDocBySource: source => QueryService.findDocBySource(source, type)
                }),
                emit: retrievalEvent => logger.info?.('[SearchService] concept-walk retrieval', retrievalEvent)
            });

            // A walk-surfaced doc's hydrated `metadata` is synthesis-internal (it feeds the context
            // documents below) — it must NOT leak into the RESPONSE references the caller receives. Keep
            // the metadata-bearing set for the context build; strip `metadata` from the response set
            // (flat references carry none, so the strip only affects the walk-added docs).
            walkContextRefs    = enriched.candidates;
            responseReferences = enriched.candidates.map(({metadata, ...ref}) => ref);
            conceptWalkEvent   = enriched.event
        }

        // Adds the concept-walk event to any return envelope ONLY when the walk ran — the default
        // path returns the exact legacy shapes.
        const withWalk = result => conceptWalkEvent ? {...result, conceptWalk: conceptWalkEvent} : result;

        // Post-walk empty guard: an empty flat result the walk could not rescue (empty collection, or no
        // concept-neighborhood match) returns the honest empty answer — never synthesize on zero context.
        // The walk event still rides along so the opt-in surface stays observable on a rescue miss.
        if (responseReferences.length === 0) {
            return withWalk(await this.#emptyFlatResponse());
        }

        if (!this.model) {
            // Thread the construct-time stale-config reason when present; the legacy
            // gemini-without-key case keeps its established `no_provider` shape.
            const {reason, code} = this.modelUnavailable || {
                reason: 'GEMINI_API_KEY is required for RAG features.',
                code  : 'no_provider'
            };

            return withWalk(this.#createDegradedSynthesisResponse({references: responseReferences, error: reason, code}));
        }

        // Flat context mapping stays byte-identical (index-aligned to queryResult.results); walk-
        // surfaced docs (identified by the `via` marker, order-independent) append their own metadata
        // so they reach synthesis too.
        const contextReferences = (queryResult.results || []).map((r, index) => ({
            ...references[index],
            metadata: r.metadata || {}
        }));

        if (conceptWalkEvent) {
            walkContextRefs
                .filter(ref => ref.via === 'concept-walk')
                .forEach(ref => contextReferences.push({...ref, metadata: ref.metadata || {}}));
        }

        // 2. Read source contents for context.
        //
        // All source loaders store `metadata.source` as a path relative to `neoRootDir`
        // so the Chroma collection shipped with each neo release remains portable across
        // recipients' filesystems. We resolve against the consumer's own `neoRootDir`
        // at read time. Before the relative-source fix, this branch did a bare `fs.pathExists(ref.source)`
        // which silently succeeded for legacy absolute-path chunks but failed for the
        // relative-path chunks emitted by ApiSource / TestSource — producing phantom
        // `No Content (File missing or empty)` context. The synthesis LLM then saw
        // empty documents and returned placeholder "I don't have enough information"
        // answers for every `type='src'` / `type='ai-infrastructure'` query. The
        // `path.isAbsolute` short-circuit keeps legacy absolute-path chunks working
        // during the grace period when a consumer has not yet re-synced.
        //
        // Tenant content uses metadata-embedded hydration. The measured chunk distribution
        // keeps the V1 storage cost acceptable, while
        // avoiding server-mirror infrastructure. Non-local tenants may use the same
        // relative `source` strings as Neo itself, so those references hydrate from
        // metadata.content and never fall through to the host checkout.
        const contextPromises = contextReferences.map(async (ref, index) => {
            const content = await this.hydrateReferenceContent(ref);

            return `--- DOCUMENT ${index + 1} (${ref.name} from ${ref.source}) ---\n${content}`;
        });

        const contextDocs = (await Promise.all(contextPromises)).join('\n\n');

        const prompt = `
You are an expert Neo.mjs architect.
**CRITICAL INSTRUCTION:** The framework is named "Neo.mjs". Never refer to it as "Neo.js".

Answer the following question using **ONLY** the provided context documents.
If the answer cannot be found in the documents, state that you don't have enough information.

Question: ${query}

Context:
${contextDocs}

Instructions:
1. Synthesize a clear, concise answer.
2. Cite specific classes or files from the context where appropriate.
3. Do not make up code or facts not present in the text.
4. Adhere to the terminology: "Neo.mjs", "App Worker", "VDom Worker", "config system".
`;

        // 3. Cost-safety runaway breaker: gate the synthesis call on a rolling per-minute cap.
        // Interactive use sits far below the cap; a scripted runaway (the incident class) trips it and we
        // return the degraded references instead of issuing the (costly) remote call. State lives on the
        // singleton; the rate check is a pure helper (`checkAskRateLimit`) for isolated, mutation-free testing.
        const nowMs           = Date.now();
        const {limited, kept} = checkAskRateLimit(this.askCallTimestamps, nowMs, aiConfig.askSynthesis.maxCallsPerMinute);
        this.askCallTimestamps = kept;
        if (limited) {
            logger.warn(`[SearchService] ask synthesis rate cap (${aiConfig.askSynthesis.maxCallsPerMinute}/min) hit; returning degraded references without calling the provider.`);
            return withWalk(this.#createDegradedSynthesisResponse({
                references: responseReferences,
                error     : `ask synthesis rate limit (${aiConfig.askSynthesis.maxCallsPerMinute}/min) exceeded`,
                code      : 'rate_limited'
            }));
        }
        this.askCallTimestamps.push(nowMs);

        // 4. Generate Answer
        let result, answer;

        try {
            // Provider-class timeout selection: `gemini` is the only always-remote class (~5-10s
            // typical → 60s flags a hang); `ollama`/`openAiCompatible` get the local-class ceiling —
            // a 31B-class local synthesis empirically approaches 5 minutes, and `openAiCompatible`
            // may point at exactly such a model, so false-long (a hung self-hosted endpoint waits
            // longer) is the safe direction over false-short (a working local model gets cut off).
            const ask = aiConfig.askSynthesis;

            // `reasoning_effort` is omitted when the leaf is empty rather than sent as an empty string:
            // an overlay predating this leaf must keep the provider's own default, and a provider that
            // does not understand the param must not receive a value it has to reject. Same `|| undefined`
            // idiom the summary path uses (`SessionService.summarizeSession`).
            result = await this.model.generateContent(prompt, {
                timeoutMs       : ask.provider === 'gemini' ? ask.timeoutMsRemote : ask.timeoutMs,
                operationLabel  : 'ask_knowledge_base synthesis',
                operationStage  : 'kb-ask-synthesis',
                priority        : 'interactive',
                reasoning_effort: ask.reasoningEffort || undefined
            });
            answer = result.response.text();
        } catch (error) {
            const degraded = this.#createDegradedSynthesisResponse({references: responseReferences, error});

            logger.warn(`[SearchService] Synthesis failed after retrieval; returning degraded references: ${degraded.reason}`);

            return withWalk(degraded);
        }

        return withWalk({
            answer,
            references: responseReferences
        });
    }
}

export default Neo.setupClass(SearchService);
