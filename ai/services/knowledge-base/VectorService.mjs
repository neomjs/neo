import aiConfig             from '../../mcp/server/knowledge-base/config.mjs';
import TextEmbeddingService, {
    getEmbeddingModel,
    isEmbeddingBatchYieldError
}                             from '../memory-core/TextEmbeddingService.mjs';
import mcConfig                from '../../mcp/server/memory-core/config.mjs';
import {isProviderTimeoutCode} from '../../provider/createTimeoutError.mjs';
import Base                    from '../../../src/core/Base.mjs';
import {IMPLEMENTED_EMBEDDING_PROVIDERS, resolveEmbeddingProviderModel}
                              from '../../embeddingProviders.mjs';
import {resolveEmbeddingAdmissionBand}
                              from '../../embeddingSafeBand.mjs';
import {
    EMBEDDING_INPUT_FORMAT_ID,
    EMBEDDING_INPUT_FORMAT_METADATA_KEY,
    buildEmbeddingInputHeader,
    buildEmbeddingInputText
}                             from './helpers/embeddingInputFormat.mjs';
import {
    bytesToTokens,
    emitConsumerFriction
}                             from '../memory-core/helpers/consumerFrictionHelper.mjs';
import ChromaManager                                                   from './ChromaManager.mjs';
import crypto                                                          from 'crypto';
import fs                                                              from 'fs-extra';
import logger                                                          from '../../mcp/server/knowledge-base/logger.mjs';
import path                                                            from 'path';
import readline                                                        from 'readline';
import DestructiveOperationGuard                                       from '../../mcp/server/shared/services/DestructiveOperationGuard.mjs';
import {computeCorpusFingerprint, decideResume, selectResumableChunks} from './helpers/resumableEmbedding.mjs';
import {clearResumeState, readResumeState, writeResumeState}           from './helpers/kbEmbeddingResumeStore.mjs';
import {
    assertCapturedPromoteView,
    captureVectorPromoteView,
    recordPromoteCompletion,
    resolveVectorGenerationElectionDir
}                                                                      from '../shared/vector/generationElectionStore.mjs';
import KBRecorderService                                               from './KBRecorderService.mjs';
import {
    clearEmbeddingPoisonState,
    createEmbeddingGenerationId,
    createEmbeddingPoisonScopeId,
    readEmbeddingPoisonState,
    upsertEmbeddingPoisonEntries
}                                                                     from './helpers/kbEmbeddingPoisonStore.mjs';
import {
    KB_VECTOR_EMBED_PROVIDER_CIRCUIT_OPEN,
    KB_VECTOR_EMBED_UNDELIVERABLE_AT_GEOMETRY,
    classifyEmbedFailureError,
    classifyEmbedResidencyDisposition,
    isAcceptedThenDiedError,
    isProviderDeathError
}                                                                     from './helpers/embedFailureClassification.mjs';

/**
 * Transient undeliverable-at-geometry evidence: consecutive single-input call-ceiling expiries per
 * chunk, plus the isolation-suspect set a multi-input request timeout leaves behind.
 *
 * Process-local ON PURPOSE: a strike is cheap, transient evidence — the durable artifact is the
 * graduated poison-store disposition, which carries its own generation-keyed invalidation. A daemon
 * restart therefore re-offers a striking chunk and it pays its strikes again: bounded extra cost,
 * never a correctness loss, and no second persistence mechanism to keep coherent with the store.
 *
 * The whole object is scoped to ONE embedding generation and replaced when the generation changes:
 * strikes proven under a 30-minute ceiling are not evidence under a 60-minute one, in either
 * direction, so a generation change resets every count and every suspicion. Within the generation:
 *
 * - `strikes` counts CONSECUTIVE timeout outcomes for requests that held EXACTLY that one chunk —
 *   the only attribution that is exact. Any dispatched non-timeout provider outcome for the chunk
 *   (success, non-timeout failure, or success followed by a storage failure — the provider half
 *   still succeeded) deletes its entry.
 * - `suspects` holds the member set of a timed-out MULTI-input request. Suspicion never graduates
 *   anything; it only forces the isolation dispatch below, where each suspect earns exact
 *   single-input evidence — an innocent neighbour embeds and clears, a monster strikes honestly.
 * - `seq`/`lastStrikeSeq` is the overlap guard: a strike increments only when its request was
 *   DISPATCHED after the previous strike was recorded, so two overlapping attempts observing one
 *   wall-clock failure window cannot combine into a "consecutive" threshold.
 *
 * @type {{generationId: String|null, strikes: Map<String, {count: Number, lastStrikeSeq: Number}>, suspects: Set<String>, seq: Number}}
 */
const undeliverableEvidence = {
    generationId: null,
    strikes     : new Map(),
    suspects    : new Set(),
    seq         : 0,
    // Death-class evidence, kept in its own map rather than folded into `strikes` because the two
    // automata differ in WHEN a strike is earned. A call-ceiling expiry is self-proving: the deadline
    // fired, and repetition is the whole evidence. A death has to establish two things first — that the
    // provider was alive, and that THIS input killed it — and where that proof comes from splits the
    // automaton in two:
    //
    // - **Accepted-then-died** (`isAcceptedThenDiedError`: reset / EPIPE / socket-end). The failure code
    //   is itself the liveness proof, since those require an established connection, so the pair is
    //   complete at failure time: the strike is earned IMMEDIATELY and graduates in the same step. No
    //   later success is waited for — once the suspect is the only chunk left, no later dispatch happens,
    //   so a success-gated rule would be unreachable exactly when it is needed.
    // - **Refused** (the provider was already down). That says nothing about this input, so it is
    //   recorded PENDING and becomes a strike only once a later dispatch succeeds. One pending
    //   observation at a time: a second refusal while the first is unconfirmed is the same unproven
    //   fact, not a second strike.
    //
    // Sharing one map with `strikes` would have made the threshold read a mixture of proven and
    // unproven observations. Entry shape: `{strikes, pendingSeq, tokenEstimate, recoveredTokenEstimate,
    // failureCode}`, where a null `pendingSeq` means "nothing awaiting confirmation".
    deaths      : new Map()
};

/**
 * @summary Returns the transient evidence state for one embedding generation, resetting on change.
 * @param {String} generationId Hashed embedding-generation coordinates.
 * @returns {Object} The module-level `undeliverableEvidence` state, scoped to `generationId`.
 */
function resolveUndeliverableEvidence(generationId) {
    if (undeliverableEvidence.generationId !== generationId) {
        undeliverableEvidence.generationId = generationId;
        undeliverableEvidence.strikes.clear();
        undeliverableEvidence.suspects.clear();
        // Deaths reset with the rest. A pending death is evidence about ONE geometry — this input
        // killed the provider at THIS context width and batch shape — so carrying it across a
        // generation change would let a strike earned under repaired coordinates fence a chunk the
        // repair may have made deliverable. Every other map here clears for that reason; omitting
        // this one made the death automaton the single piece of state that outlived its own
        // authority coordinate.
        undeliverableEvidence.deaths.clear();
        undeliverableEvidence.seq = 0;
    }

    return undeliverableEvidence
}

/**
 * @summary Resolves which dispatched chunks were inside the provider request that failed.
 *
 * A logical KB chunk and a provider request are DIFFERENT attribution units whenever the transport
 * batches more than one text per request: a request failure names the request, never a member. Two
 * sources of exactness exist, in precedence order:
 *
 * 1. A single-chunk dispatch (`batchToEmbed.length === 1`) — the request can only have held that
 *    input, whatever the transport (this is also the only exactness the native-ollama batch, which
 *    posts one opaque multi-input request, can ever offer).
 * 2. The producer span (`failedTextOffset`/`failedTextCount`) the OpenAI-compatible transport stamps
 *    on every request failure — attempt-scoped indices into what was sent, translated here into the
 *    post-carry-shrink coordinates of `batchToEmbed`.
 *
 * An empty result means the member set is UNKNOWN, and the caller must treat the whole dispatch as
 * the unit — suspicion at worst, never a strike.
 *
 * @param {Object} options
 * @param {*} options.error The provider failure, possibly producer-decorated.
 * @param {Object[]} options.batchToEmbed The dispatched chunks, after any carry shrink.
 * @param {Number} [options.persistedCount=0] How many leading chunks the carry shrink removed.
 * @returns {Object[]} The failed request's member chunks, or `[]` when unknown.
 */
function resolveFailedRequestChunks({error, batchToEmbed, persistedCount = 0}) {
    if (batchToEmbed.length === 1) {
        return [batchToEmbed[0]]
    }

    if (Number.isInteger(error?.failedTextOffset) && Number.isInteger(error?.failedTextCount) && error.failedTextCount > 0) {
        const start = error.failedTextOffset - persistedCount;

        if (start >= 0 && start + error.failedTextCount <= batchToEmbed.length) {
            return batchToEmbed.slice(start, start + error.failedTextCount)
        }
    }

    return []
}

/**
 * @summary Flattens one chunk into Chroma-storable scalar metadata.
 *
 * The single producer for both the full-batch upsert and the partial upsert a cooperative lease yield
 * performs. Two sites deriving this independently could drift, and drift here means a stored vector
 * whose metadata disagrees with the vector beside it.
 * @param {Object} chunk Tenant-stamped chunk.
 * @returns {Object}
 */
function buildChunkMetadata(chunk) {
    const metadata = {};

    for (const [key, value] of Object.entries(chunk)) {
        metadata[key] = (value === null) ? 'null' : (typeof value === 'object') ? JSON.stringify(value) : value;
    }

    // Stamped here rather than onto the chunk, because three upsert sites call this function and a
    // chunk-side stamp is three places to forget. This is already the single authority for row
    // metadata — the same reason its own summary gives for existing.
    //
    // AFTER the copy loop, and that order is load-bearing: a chunk carrying a field of this name
    // must not be able to declare which format its vector was built from. The row's claim comes from
    // the module that owns the format, never from parsed content.
    metadata[EMBEDDING_INPUT_FORMAT_METADATA_KEY] = EMBEDDING_INPUT_FORMAT_ID;

    return metadata
}

const TENANT_GUARDED_FIELDS             = ['tenantId', 'repoSlug', 'visibility', 'originAgentIdentity', 'tenantConfigVersion', 'ingestedAt'];
const STALE_STRATEGIES                  = Object.freeze(new Set(['delete-upfront', 'shadow-swap']));
const STALE_STRATEGY_SKIP               = 'skip';
/**
 * Family prefix for the embedding input-strategy coordinate.
 *
 * Deliberately still a literal, and deliberately no longer the whole value. It bumps when the input
 * strategy changes *shape* — a different splitting algorithm, a different estimate space — which no
 * measurement can infer. What it must NOT carry is the band, because the band moves without anyone
 * editing this file, and that is the case the generation exists to notice.
 * @type {String}
 * @protected
 */
const EMBEDDING_POISON_STRATEGY_FAMILY = 'kb-embedding-input-v1';

/**
 * Derives the input-strategy coordinate from the resolved admission band.
 *
 * **This value used to be `EMBEDDING_POISON_STRATEGY_FAMILY` alone, and that was the defect.**
 * `resolveEmbeddingPoisonGeneration`'s contract is that "a provider, model, vector-schema, or
 * input-strategy change invalidates prior poison evidence", and `createVectorGenerationIdentity`
 * guarantees any coordinate change yields a new generation id. The plumbing was complete and this one
 * coordinate was frozen — so the commonest repair, moving the admission band, changed nothing the
 * fence could see. A chunk fenced as undeliverable at a 28,672-token band stayed fenced after the
 * band was corrected to the engine's actual slot, because nothing told the fence the band had moved.
 *
 * Both numbers are carried, and neither is redundant: `admissionCeilingTokens` moves when a ceiling
 * leaf changes, `estimateBandTokens` additionally moves when
 * {@link EMBEDDING_TOKEN_ESTIMATE_DRIFT_FACTOR} does. A drift-factor change leaves the ceiling
 * identical and is exactly as capable of making a fenced chunk deliverable.
 *
 * **An unresolvable band is a stable coordinate, not a churning one.** A configuration with no usable
 * ceiling cannot characterise its own input strategy, so it gets one marker rather than a new
 * generation per call — and the transition *out* of that state is a real repair, which invalidates
 * evidence exactly as it should.
 *
 * @summary Input-strategy coordinate: the strategy family plus the band it is currently applying.
 * @param {Object} guardrail From {@link VectorService#resolveEmbeddingGuardrail}.
 * @returns {String}
 * @protected
 */
function resolveEmbeddingInputStrategyVersion(guardrail) {
    const {resolved, admissionCeilingTokens, estimateBandTokens} = resolveEmbeddingAdmissionBand(guardrail);

    return resolved
        ? `${EMBEDDING_POISON_STRATEGY_FAMILY}:band-${admissionCeilingTokens}-est-${estimateBandTokens}`
        : `${EMBEDDING_POISON_STRATEGY_FAMILY}:band-unresolved`
}

/**
 * @summary Manages vector database operations including embedding generation and storage.
 *
 * This service encapsulates all interactions with the vector database (ChromaDB) and the
 * embedding provider (Google Generative AI). It is responsible for the "Load" phase of the
 * ETL pipeline, taking structured knowledge chunks and ensuring they are correctly
 * vectorized and stored.
 *
 * **Helper Role:**
 * This service is primarily a helper for `DatabaseService` and is not intended to be
 * directly exposed as MCP tools. Its methods are invoked by `DatabaseService` as part
 * of higher-level orchestration workflows.
 *
 * ### Key Responsibilities:
 * 1.  **Embedding Generation:** Interacts with the Google Generative AI API to generate
 *     text embeddings for knowledge chunks.
 * 2.  **Vector Storage:** Manages the ChromaDB collection, including upserting new/changed
 *     documents and removing stale ones.
 * 3.  **Data Enrichment:** Pre-calculates class inheritance chains to improve query context.
 * 4.  **Diffing:** Optimizes API usage by only processing chunks that have changed since
 *     the last run.
 *
 * @class Neo.ai.services.knowledge-base.VectorService
 * @extends Neo.core.Base
 * @singleton
 */
class VectorService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.services.knowledge-base.VectorService'
         * @protected
         */
        className: 'Neo.ai.services.knowledge-base.VectorService',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * Permanently deletes the knowledge base collection.
     * @param {Object}       [options]
     * @param {String|Object} [options.confirmation] Explicit production confirmation token.
     * @returns {Promise<object>} A promise that resolves to a success message.
     */
    async deleteCollection({confirmation} = {}) {
        const collectionName = aiConfig.collectionName;
        try {
            await DestructiveOperationGuard.assertDestructiveTargetAllowed({
                operation: 'knowledge-base.chroma.delete',
                subsystem: 'knowledge-base',
                mode     : 'delete',
                target   : {
                    collectionName,
                    chroma: {
                        host: aiConfig.host,
                        port: aiConfig.port,
                        path: aiConfig.path
                    },
                    path    : aiConfig.path,
                    repoRoot: aiConfig.neoRootDir
                },
                confirmation
            });

            // Route through ChromaManager.deleteCollection so the canonical-name guard applies.
            // Forward the operator confirmation so the canonical-name guard accepts it.
            await ChromaManager.deleteCollection({name: collectionName, confirmation});
            ChromaManager.invalidateKnowledgeBaseCollectionCache();
            const message = `Knowledge base collection '${collectionName}' deleted successfully.`;
            logger.log(message);
            return {message};
        } catch (error) {
            if (error.message.includes(`Collection ${collectionName} does not exist.`)) {
                const message = `Knowledge base collection '${collectionName}' did not exist. No action taken.`;
                logger.log(message);
                return {message};
            }
            throw error;
        }
    }

    /**
     * Returns the tenant-isolation config surface.
     *
     * The Knowledge Base server config can expose tenant fields directly or through the
     * portable `aiConfig.knowledgeBase.*` shape used by shared AI config surfaces.
     * Supporting both keeps this write boundary stable across ingestion API variants.
     *
     * @returns {Object} Tenant-isolation configuration object.
     */
    getTenantIsolationConfig() {
        const nested = aiConfig.knowledgeBase;
        // The portable nested tenant-shape carries tenant fields. Tier-1's
        // `knowledgeBase` leaf (KB OPS config: alerting / reconciliation / GC) is inherited here via
        // the realm chain and is NOT a tenant-shape — so a naked `?? aiConfig` would wrongly select
        // it (security regression: tenant fields read as undefined). Prefer the nested object only
        // when it actually exposes a tenant field; otherwise fall through to the flat top-level config.
        const hasTenantShape = nested != null && (
            nested.defaultTenantId    !== undefined ||
            nested.defaultRepoSlug    !== undefined ||
            nested.defaultVisibility  !== undefined ||
            nested.spoofRejectionMode !== undefined
        );
        return hasTenantShape ? nested : aiConfig;
    }

    /**
     * Resolves the authoritative tenant tuple used for KB write-side stamping.
     *
     * The tuple is server-derived: external ingestion callers pass already-authenticated
     * context here, while Neo's default local sync falls back to the shared curated corpus.
     *
     * @param {Object} [tenantContext] Server-derived tenant context.
     * @param {String} [tenantContext.tenantId] Tenant identifier.
     * @param {String} [tenantContext.repoSlug] Repository slug within the tenant.
     * @param {String} [tenantContext.visibility] Visibility scope for read-side filtering.
     * @param {String} [tenantContext.originAgentIdentity] Authenticated agent identity.
     * @param {Number} [tenantContext.configVersion] Active `KnowledgeBaseTenantConfig` version;
     *                                               stamped onto chunk metadata as `tenantConfigVersion`.
     * `ingestedAt` (epoch ms, server-stamped via `Date.now()`) is added unconditionally —
     * the retention / GC / reconciliation timestamp. It marks when the chunk row is
     * **actually embedded / upserted**: `embed()`'s zero-change fast path skips an unchanged
     * same-content re-push, so that chunk keeps its prior `ingestedAt` (a content change
     * yields a *new* chunk row — new content-hash ID — with its own fresh `ingestedAt`).
     * It is purely server-derived (never client-authored), so it is also a
     * `TENANT_GUARDED_FIELDS` member. Consumers MUST treat a missing `ingestedAt` as
     * unknown-age and fail-safe — never expire or action a chunk with no timestamp.
     * @returns {{tenantId: String, repoSlug: String, visibility: String, tenantConfigVersion: Number, ingestedAt: Number, originAgentIdentity: String|undefined}}
     */
    resolveTenantStamp(tenantContext = {}) {
        const config = this.getTenantIsolationConfig();
        const stamp  = {
            tenantId           : tenantContext.tenantId ?? config.defaultTenantId,
            repoSlug           : tenantContext.repoSlug ?? config.defaultRepoSlug,
            visibility         : tenantContext.visibility ?? config.defaultVisibility,
            tenantConfigVersion: tenantContext.configVersion ?? 0,
            ingestedAt         : Date.now()
        };

        if (tenantContext.originAgentIdentity) {
            stamp.originAgentIdentity = tenantContext.originAgentIdentity;
        }

        return stamp;
    }

    /**
     * Creates the tenant-aware storage ID for a parsed chunk.
     *
     * `chunk.hash` remains the content fingerprint, while the Chroma ID binds that
     * fingerprint to the authoritative `{tenantId, repoSlug}` tuple so two tenants can
     * ingest byte-identical files without colliding.
     *
     * @param {Object} chunk Parsed knowledge chunk.
     * @param {Object} stamp Authoritative tenant stamp.
     * @returns {String} SHA-256 tenant-aware chunk ID.
     */
    createTenantAwareChunkId(chunk, stamp) {
        const identityString = JSON.stringify({
            tenantId: stamp.tenantId,
            repoSlug: stamp.repoSlug,
            hash    : chunk.hash,
            type    : chunk.type,
            name    : chunk.name,
            source  : chunk.source
        });

        return crypto.createHash('sha256').update(identityString).digest('hex');
    }

    /**
     * @summary Builds the metadata filter naming the corpus one embed call owns.
     *
     * Every chunk a single `embed()` call writes carries the same `{tenantId, repoSlug}`
     * stamp, so this tuple is the exact boundary of that call's authority. Stale-id
     * gathering filters on it: without the filter, a lane embedding one corpus treats
     * every other tenant's and repo's rows as stale and deletes them.
     *
     * The `$and` form is required, not stylistic. Chroma rejects a multi-key `where`
     * with "Expected 'where' to have exactly one operator, but got 2", so the intuitive
     * `{tenantId, repoSlug}` shape throws at query time rather than filtering.
     *
     * @param {Object} stamp Resolved tenant stamp.
     * @param {String} stamp.tenantId Authoritative tenant id.
     * @param {String} stamp.repoSlug Authoritative repo slug.
     * @returns {Object} Chroma `where` filter selecting only this corpus.
     */
    buildOwnedScopeFilter({tenantId, repoSlug} = {}) {
        return {
            $and: [
                {tenantId: {$eq: tenantId}},
                {repoSlug: {$eq: repoSlug}}
            ]
        };
    }

    /**
     * Rejects or logs client-supplied identity fields that conflict with server context.
     *
     * @param {Object} chunk Parsed knowledge chunk.
     * @param {Object} stamp Authoritative tenant stamp.
     * @param {String} chunkId Tenant-aware chunk ID for diagnostics.
     * @returns {void}
     */
    validateTenantStamp(chunk, stamp, chunkId) {
        const config = this.getTenantIsolationConfig();
        const mode   = config.spoofRejectionMode ?? 'overwrite';

        for (const field of TENANT_GUARDED_FIELDS) {
            const hasClientValue = Object.prototype.hasOwnProperty.call(chunk, field);
            const serverValue    = stamp[field];
            const clientValue    = chunk[field];

            if (!hasClientValue || clientValue === serverValue) {
                continue;
            }

            const warning = {
                field,
                chunkId,
                clientValue,
                serverValue        : serverValue ?? null,
                tenantId           : stamp.tenantId,
                repoSlug           : stamp.repoSlug,
                originAgentIdentity: stamp.originAgentIdentity ?? null
            };

            if (mode === 'reject') {
                const error = new Error(`KB_TENANT_SPOOF_REJECTED: client-supplied ${field} does not match the server-derived value.`);
                error.code  = 'KB_TENANT_SPOOF_REJECTED';
                error.details = warning;
                throw error;
            }

            logger.warn('[VectorService] Overwriting client-supplied tenant metadata field.', warning);
        }
    }

    /**
     * Applies authoritative tenant metadata before diffing or upserting.
     *
     * @param {Object} chunk Parsed knowledge chunk.
     * @param {Object} stamp Authoritative tenant stamp.
     * @returns {Object} Stamped chunk with tenant-aware `id` and `hash`.
     */
    applyTenantStamp(chunk, stamp) {
        const chunkId = this.createTenantAwareChunkId(chunk, stamp);

        this.validateTenantStamp(chunk, stamp, chunkId);

        const stampedChunk = {
            ...chunk,
            ...stamp,
            hash: chunkId,
            id  : chunkId
        };

        if (!stamp.originAgentIdentity) {
            delete stampedChunk.originAgentIdentity;
        }

        return stampedChunk;
    }

    /**
     * Resolves the stale-data handling strategy while preserving the legacy
     * `deleteStale: false` incremental-ingestion contract.
     *
     * @param {Object}  options
     * @param {String} [options.staleStrategy] Explicit stale strategy.
     * @param {Boolean} [options.deleteStale]  Legacy boolean stale-deletion flag.
     * @returns {String} Resolved strategy: `delete-upfront`, `shadow-swap`, or internal `skip`.
     * @throws {Error} When the explicit stale strategy is unsupported.
     */
    resolveStaleStrategy({staleStrategy, deleteStale = true} = {}) {
        if (staleStrategy) {
            if (!STALE_STRATEGIES.has(staleStrategy)) {
                throw new Error(`Unsupported staleStrategy '${staleStrategy}'. Expected one of: ${Array.from(STALE_STRATEGIES).join(', ')}.`);
            }
            return staleStrategy;
        }

        return deleteStale ? 'delete-upfront' : STALE_STRATEGY_SKIP;
    }

    /**
     * Resolves the embedding-model guardrail consulted before provider invocation.
     *
     * The band is provider-independent, so the guard measures EVERY provider — `recognized`
     * is a diagnostic flag for skip receipts, never a licence to skip the measurement.
     *
     * @returns {{recognized: Boolean, contextLimitTokens: Number, safeProcessingLimitTokens: Number, model: String}}
     */
    resolveEmbeddingGuardrail() {
        const embeddingProvider         = mcConfig.embeddingProvider;
        const contextLimitTokens        = Number(aiConfig.localModels.embedding.contextLimitTokens);
        const safeProcessingLimitTokens = Number(aiConfig.localModels.embedding.safeProcessingLimitTokens);

        return {
            recognized: IMPLEMENTED_EMBEDDING_PROVIDERS.includes(embeddingProvider),
            contextLimitTokens,
            safeProcessingLimitTokens,
            model     : resolveEmbeddingProviderModel({embeddingProvider, aiConfig})
        };
    }

    /**
     * @summary Resolves the exact embedding-generation coordinate used by the poison retry fence.
     *
     * Provider selection remains owned by `TextEmbeddingService`; this method reads the same resolved
     * AiConfig leaves at the disposition boundary so a provider, model, vector-schema, or input-strategy
     * change invalidates prior poison evidence instead of silently suppressing work under a new route.
     *
     * @returns {{provider: String, model: String, vectorDimension: Number, strategyVersion: String}}
     */
    resolveEmbeddingPoisonGeneration() {
        const provider = mcConfig.embeddingProvider;

        return {
            provider,
            model          : getEmbeddingModel(provider),
            vectorDimension: Number(aiConfig.vectorDimension),
            // The effective per-call ceiling is part of the evidence conditions: an
            // undeliverable-at-geometry disposition proven under a 30-minute ceiling is void under a
            // 60-minute one. Folding it into the generation invalidates ALL suppression evidence on a
            // ceiling change — including content-poison, which then costs one isolation re-proof
            // cycle. Correctness over thrift: stale suppression silently withholds documents.
            embedCallCeilingMs: provider === 'ollama'
                ? Number(mcConfig.ollama.embeddingTimeoutMs)
                : Number(mcConfig.openAiCompatible.batchEmbeddingTimeoutMs),
            // Derived from the resolved admission band rather than a literal, so the commonest repair
            // — moving the band — is a change this generation can see. See
            // {@link resolveEmbeddingInputStrategyVersion} for why a frozen value silently outlived
            // every band correction that would have released the chunks it was fencing.
            strategyVersion: resolveEmbeddingInputStrategyVersion(this.resolveEmbeddingGuardrail())
        }
    }

    /**
     * @summary Resolves one tenant/repository poison scope and active generation hash.
     * @param {Object} tenantStamp Server-derived tenant/repository stamp.
     * @returns {{scopeId: String, generationId: String}}
     */
    resolveEmbeddingPoisonCoordinates(tenantStamp) {
        return {
            scopeId: createEmbeddingPoisonScopeId({
                tenantId: tenantStamp.tenantId,
                repoSlug: tenantStamp.repoSlug
            }),
            generationId: createEmbeddingGenerationId(this.resolveEmbeddingPoisonGeneration())
        }
    }

    /**
     * @summary Service-facing view of the provider-input header contract.
     *
     * The format itself is owned by `helpers/embeddingInputFormat.mjs`, which is the single authority
     * every consumer reads — this service, the ingestion guardrail, and the byte-budget planner below.
     * The method is retained as a call site rather than a definition so callers and specs keep one
     * entry point while the contract has one home.
     *
     * @param {Object} chunk Parsed knowledge chunk.
     * @returns {String} The header, including its trailing newline.
     */
    buildEmbeddingInputHeader(chunk) {
        return buildEmbeddingInputHeader(chunk);
    }

    /**
     * Builds the provider input string used by the embedding guardrail and provider call.
     *
     * @param {Object} chunk Parsed knowledge chunk.
     * @returns {String} Provider input text.
     */
    buildEmbeddingInputText(chunk) {
        return buildEmbeddingInputText(chunk);
    }

    /**
     * Expands recoverable over-budget text chunks before tenant stamping and diffing.
     *
     * The final `embedChunks()` guardrail still refuses any chunk that remains too large;
     * this pass only prevents the full-corpus sync route from losing split-safe source
     * files before they ever become Chroma rows.
     *
     * @param {Object[]} chunks Raw parsed knowledge chunks read from JSONL.
     * @returns {Object[]} Original chunks plus deterministic split children.
     */
    expandOversizedEmbeddingChunks(chunks) {
        const guardrail = this.resolveEmbeddingGuardrail();

        const expanded = [];

        for (const chunk of chunks) {
            const inputText  = this.buildEmbeddingInputText(chunk),
                  evaluation = this.measureEmbeddingInput({text: inputText, guardrail});

            if (!evaluation.skip) {
                expanded.push(chunk);
                continue;
            }

            if (evaluation.measured === false) {
                // An unmeasurable input cannot be split-planned against an unresolvable band;
                // keep it whole — the pre-invocation boundary refuses it with the same flag.
                expanded.push(chunk);
                continue;
            }

            const splitChunks = this.splitOversizedEmbeddingChunk({chunk, guardrail});

            expanded.push(...splitChunks);
        }

        return expanded;
    }

    /**
     * Creates a deterministic pre-tenant split hash for a full-sync child chunk.
     *
     * @param {Object} options
     * @param {Object} options.chunk     Source chunk before splitting.
     * @param {String} options.content   Split content slice.
     * @param {Number} options.index     Zero-based split index.
     * @param {Number} options.total     Total split count.
     * @param {Number} options.charStart Character offset where the split starts.
     * @param {Number} options.charEnd   Character offset where the split ends.
     * @returns {String} Stable SHA-256 hash.
     */
    createSplitChunkHash({chunk, content, index, total, charStart, charEnd}) {
        const identityString = JSON.stringify({
            parentHash             : chunk.hash,
            type                   : chunk.type,
            kind                   : chunk.kind,
            name                   : chunk.name,
            source                 : chunk.source,
            content,
            oversizedSplitIndex    : index,
            oversizedSplitTotal    : total,
            oversizedSplitCharStart: charStart,
            oversizedSplitCharEnd  : charEnd
        });

        return crypto.createHash('sha256').update(identityString).digest('hex');
    }

    /**
     * Splits a recoverable over-budget text chunk into deterministic sub-chunks.
     *
     * @param {Object} options
     * @param {Object} options.chunk     Source chunk before tenant stamping.
     * @param {Object} options.guardrail Resolved embedding guardrail.
     * @param {Function} [options.createHash] Optional caller-specific split hash function.
     * @returns {Object[]} Either split children or the original chunk.
     */
    splitOversizedEmbeddingChunk({chunk, guardrail, createHash}) {
        const content = chunk.content || chunk.description;

        if (typeof content !== 'string' || content.length === 0) {
            return [chunk];
        }

        // The SAME band the detection uses. Cutting to a different one than `measureEmbeddingInput`
        // measured against would either leave parts still over the ceiling (silent re-refusal) or
        // shred them finer than needed; one resolver keeps the two halves from drifting apart again.
        const {resolved, estimateBandTokens} = resolveEmbeddingAdmissionBand(guardrail);

        // An unresolvable band cannot plan a split, and falling back to a declared-but-invalid
        // configuration's sibling ceiling would cut against the very band this path exists to stop
        // trusting. Whole is the only honest output: the callers' unmeasurable branches, and the
        // pre-invocation boundary behind them, refuse it with a reason attached.
        if (!resolved) {
            return [chunk];
        }

        const maxInputBytes   = Math.max(1, estimateBandTokens * 3),
              // MEASURED from the header the provider will receive, never a restatement of its format.
              // A planner that carries its own copy budgets against a string that may not be the one
              // sent, and the two cannot be kept in step by review.
              prefixBytes     = Buffer.byteLength(buildEmbeddingInputHeader(chunk), 'utf8'),
              maxContentBytes = Math.max(1, maxInputBytes - prefixBytes - 128),
              parts           = this.splitTextByByteBudget(content, maxContentBytes);

        if (parts.length <= 1) {
            return [chunk];
        }

        let charStart = 0;

        return parts.map((part, index) => {
            const charEnd = charStart + part.length,
                  child   = {
                      ...chunk,
                      content    : part,
                      description: part,
                      name       : `${chunk.name} [part ${index + 1}/${parts.length}]`,
                      hashInputs : Array.from(new Set([
                          ...(chunk.hashInputs || []),
                          'oversizedSplitIndex',
                          'oversizedSplitTotal',
                          'oversizedSplitCharStart',
                          'oversizedSplitCharEnd'
                      ])),
                      oversizedSplit         : true,
                      oversizedSplitIndex    : index,
                      oversizedSplitTotal    : parts.length,
                      oversizedSplitCharStart: charStart,
                      oversizedSplitCharEnd  : charEnd
                  };

            const hash = createHash
                ? createHash(child)
                : this.createSplitChunkHash({
                    chunk,
                    content: part,
                    index,
                    total  : parts.length,
                    charStart,
                    charEnd
                });

            child.hash = hash;
            child.id   = hash;
            charStart = charEnd;
            return child;
        });
    }

    /**
     * Splits text on stable line boundaries, falling back to character slices for huge lines.
     * Tracks each line's byte size once: re-measuring the growing output prefix makes a large
     * minified/generated source file quadratic and can starve every writer on the shared
     * orchestrator event loop.
     *
     * @param {String} text Source text.
     * @param {Number} maxBytes Maximum byte size per returned part.
     * @returns {String[]} Split text parts.
     */
    splitTextByByteBudget(text, maxBytes) {
        if (Buffer.byteLength(text, 'utf8') <= maxBytes) {
            return [text];
        }

        const parts        = [];
        let   currentLines = [],
              currentBytes = 0;

        const flushCurrent = () => {
            if (currentLines.length === 0) return;

            parts.push(currentLines.join(''));
            currentLines = [];
            currentBytes = 0
        };

        for (const line of text.match(/[^\n]*\n?|[^\n]+$/g).filter(Boolean)) {
            const lineBytes = Buffer.byteLength(line, 'utf8');

            if (lineBytes > maxBytes) {
                flushCurrent();
                parts.push(...this.splitLongStringByByteBudget(line, maxBytes));
                continue;
            }

            if (currentLines.length > 0 && currentBytes + lineBytes > maxBytes) {
                flushCurrent()
            }

            currentLines.push(line);
            currentBytes += lineBytes
        }

        flushCurrent();

        return parts.filter(part => part.length > 0);
    }

    /**
     * Splits one oversized line without breaking JavaScript surrogate pairs.
     * The byte accumulator is linear in code points; each character is measured exactly once.
     *
     * @param {String} value Source string.
     * @param {Number} maxBytes Maximum byte size per part.
     * @returns {String[]} Split text parts.
     */
    splitLongStringByByteBudget(value, maxBytes) {
        const parts        = [];
        let   currentChars = [],
              currentBytes = 0;

        const flushCurrent = () => {
            if (currentChars.length === 0) return;

            parts.push(currentChars.join(''));
            currentChars = [];
            currentBytes = 0
        };

        for (const char of value) {
            const charBytes = Buffer.byteLength(char, 'utf8');

            if (currentChars.length > 0 && currentBytes + charBytes > maxBytes) {
                flushCurrent()
            }

            currentChars.push(char);
            currentBytes += charBytes
        }

        flushCurrent();

        return parts;
    }

    /**
     * Measures provider input size without recording a final refusal diagnostic.
     *
     * Measurement is unconditional: no provider recognition check may wave an input through
     * unmeasured. The one unmeasurable case — a band that does not resolve to a positive
     * finite number — refuses (`skip: true`) and says so (`measured: false`), because
     * "cannot check" must never read as "checked, tiny".
     *
     * The band is {@link resolveEmbeddingAdmissionBand}'s, not the safe-processing leaf directly:
     * admission is governed by the SMALLER of the engine's per-slot ceiling and the safe band, and
     * compared in estimate space. Reading `safeProcessingLimitTokens` here alone let a deployment
     * running a narrower slot admit inputs its own engine refused.
     *
     * @param {Object} options
     * @param {String} options.text Provider input text.
     * @param {Object} options.guardrail Resolved embedding guardrail.
     * @returns {{skip: Boolean, measured: Boolean, inputBytes: Number, inputTokensEstimate: Number, estimateBandTokens: Number|null, admissionCeilingTokens: Number|null}}
     */
    measureEmbeddingInput({text, guardrail}) {
        const inputBytes          = Buffer.byteLength(text || '', 'utf8'),
              inputTokensEstimate = bytesToTokens(inputBytes),
              {resolved, admissionCeilingTokens, estimateBandTokens} = resolveEmbeddingAdmissionBand(guardrail);

        if (!resolved) {
            return {
                skip                  : true,
                measured              : false,
                inputBytes,
                inputTokensEstimate,
                estimateBandTokens    : null,
                admissionCeilingTokens: null
            };
        }

        return {
            skip    : inputTokensEstimate > estimateBandTokens,
            measured: true,
            inputBytes,
            inputTokensEstimate,
            estimateBandTokens,
            admissionCeilingTokens
        };
    }

    /**
     * Emits a bounded, non-secret friction record for an over-budget embedding input.
     *
     * @param {Object} options
     * @param {Object} options.chunk Tenant-stamped chunk.
     * @param {String} options.text Provider input text.
     * @param {Object} options.guardrail Resolved embedding guardrail.
     * @returns {{skip: Boolean, measured: Boolean, inputBytes: Number, inputTokensEstimate: Number}}
     */
    evaluateEmbeddingInput({chunk, text, guardrail}) {
        const evaluation = this.measureEmbeddingInput({text, guardrail});

        if (!evaluation.skip) {
            return evaluation;
        }

        const {inputBytes, inputTokensEstimate, estimateBandTokens, admissionCeilingTokens} = evaluation,
              unmeasurable                                                                  = evaluation.measured === false;

        emitConsumerFriction({
            assetRef                 : chunk.id || chunk.source || chunk.name || 'kb-chunk',
            consumer                 : 'VectorService.embedChunks',
            model                    : guardrail.model,
            symptom                  : 'size-precheck-skip',
            emissionPoint            : 'pre-invocation',
            suggestionKind           : 'split-document',
            inputBytes,
            inputTokensEstimate,
            contextLimitTokens       : guardrail.contextLimitTokens,
            safeProcessingLimitTokens: guardrail.safeProcessingLimitTokens,
            // The figures the decision actually used, beside the two leaves it derived them from.
            // Without these a reader sees an input under both declared ceilings and a refusal, and
            // has to re-derive the drift factor to understand why.
            admissionCeilingTokens,
            estimateBandTokens,
            serviceDomain            : 'other',
            note                     : unmeasurable
                ? 'Embedding safe-processing band is unresolvable; refusing to send an unmeasured input.'
                : 'KB embedding input exceeds safe processing band; split or reduce the source chunk before embedding.'
        });

        logger.warn('[VectorService] Skipping over-budget embedding chunk before provider invocation.', {
            chunkId                  : chunk.id,
            tenantId                 : chunk.tenantId,
            repoSlug                 : chunk.repoSlug,
            source                   : chunk.source,
            inputBytes,
            inputTokensEstimate,
            safeProcessingLimitTokens: guardrail.safeProcessingLimitTokens,
            contextLimitTokens       : guardrail.contextLimitTokens
        });

        return {...evaluation, skip: true};
    }

    /**
     * @summary Whether an embedding failure forbids poison isolation.
     *
     * These terminals say nothing about content. A timeout may leave provider work running, an
     * abort/circuit refusal deliberately ended admission, a cooperative yield transfers the lane,
     * and a dead provider answered nothing at all. None may trigger exploratory provider calls.
     *
     * **Why provider death is here even though the isolation walk already pairs its evidence.**
     * The fresh control at the decision boundary below proves the provider was alive
     * *immediately before* the suspect was dispatched — which is exactly the trace a chunk that
     * KILLS the provider leaves behind. So the strongest exculpatory check available convicts the
     * one input it should exonerate, and the surrounding contract's abort-rather-than-quarantine
     * promise covers the remainder while the trigger is quarantined anyway. Without this term a
     * poison entry is written whose own `reasonCode` names a socket failure. Death is evidence
     * about deliverability at the current geometry, which is `undeliverableEvidence`'s domain,
     * never a content verdict.
     *
     * @param {*} error Provider failure.
     * @param {AbortSignal} [signal] Active run signal.
     * @returns {Boolean}
     */
    isPoisonIsolationForbidden(error, signal) {
        if (signal?.aborted === true) return true;

        // Outside the walk below, deliberately: `isProviderDeathError` runs its own bounded
        // cause-chain classification, so calling it per depth would re-walk the same chain from
        // every link. The terms inside the loop are surface reads of one error object and need
        // the walk; this one owns it.
        if (isProviderDeathError(error)) return true;

        const visited = new Set();
        let   current = error;

        for (let depth = 0; depth < 4 && current && typeof current === 'object' && !visited.has(current); depth++) {
            visited.add(current);

            // Composed, never collapsed: the timeout half is the shared predicate, while abort and
            // circuit-open stay explicit terms here. They are caller-owned facts with different
            // outcomes, so folding them into the timeout predicate would make a cancelled request
            // read as a provider timeout at every consumer of that predicate at once.
            if (isEmbeddingBatchYieldError(current) || current.name === 'AbortError' ||
                current.code === 'ABORT_ERR' || current.code === KB_VECTOR_EMBED_PROVIDER_CIRCUIT_OPEN ||
                isProviderTimeoutCode(current.code)) {
                return true
            }

            current = current.cause
        }

        return false
    }

    /**
     * @summary Issues one isolation-scoped provider request without changing routing semantics.
     * @param {Object[]} inputs Array of `{chunk, text}` inputs.
     * @param {Function} shouldYield Cooperative yield predicate.
     * @param {AbortSignal} [signal] Shared provider-circuit signal.
     * @param {Function} [onProviderTimeout] Provider-timeout callback.
     * @returns {Promise<Array<Array<Number>>>}
     */
    generateIsolationEmbeddings({inputs, shouldYield, signal, onProviderTimeout}) {
        return TextEmbeddingService.embedTexts(
            inputs.map(input => input.text),
            mcConfig.embeddingProvider,
            {
                operationLabel          : 'knowledge base tenant ingestion poison isolation',
                operationStage          : 'kb-tenant-ingestion-embedding',
                providerActivityRecorder: KBRecorderService,
                service                 : 'knowledge-base',
                shouldYield,
                signal,
                onProviderTimeout
            }
        )
    }

    /**
     * @summary Persists already-produced isolation embeddings against their exact input ids.
     * @param {Object} collection Chroma collection.
     * @param {Object[]} inputs Array of `{chunk, text}` inputs.
     * @param {Array<Array<Number>>} embeddings Provider output.
     * @returns {Promise<void>}
     */
    async persistIsolationEmbeddings({collection, inputs, embeddings}) {
        if (!Array.isArray(embeddings) || embeddings.length !== inputs.length) {
            throw new Error(`Poison isolation received ${embeddings?.length ?? 0} embedding(s) for ${inputs.length} input(s).`)
        }

        await collection.upsert({
            ids      : inputs.map(input => input.chunk.id),
            embeddings,
            metadatas: inputs.map(input => buildChunkMetadata(input.chunk))
        })
    }

    /**
     * @summary Finds one bounded control outside the failed/poison set from the full current corpus.
     * @param {Object} options
     * @returns {Object|null} An embeddable `{chunk, text}` control, or null when no later evidence exists.
     */
    findPoisonIsolationControl({controlCandidates, startIndex, guardrail, excludedIds}) {
        for (let index = startIndex; index < controlCandidates.length; index++) {
            const candidate = controlCandidates[index];
            const chunk     = candidate.chunk;

            if (excludedIds.has(chunk.id)) continue;

            const text       = this.buildEmbeddingInputText(chunk),
                  evaluation = this.evaluateEmbeddingInput({chunk, text, guardrail});

            if (!evaluation.skip) return {chunk, text, alreadyLanded: candidate.alreadyLanded === true}
        }

        return null
    }

    /**
     * @summary Isolates content-dependent failures in the first batch under a dead-provider ceiling.
     *
     * The independent control is offered first. If it fails, the provider-wide control costs exactly one
     * extra request and the corpus is not walked. Once it succeeds, the failed batch is bisected.
     * Every failing singleton is paired with a fresh success from that same control before it is
     * called poison; a provider that dies during isolation therefore aborts instead of quarantining
     * the remainder. Successful subsets are persisted immediately and the later control id is marked
     * so the ordinary loop does not buy it again.
     *
     * @param {Object} options
     * @returns {Promise<{embedded: Number, poisonEntries: Object[], unproved: Boolean}>}
     */
    async isolateFirstFailedBatch({
        collection,
        failedInputs,
        controlCandidates,
        controlStartIndex,
        guardrail,
        excludedIds,
        preEmbeddedIds,
        shouldYield,
        signal,
        onProviderTimeout,
        reasonCode,
        now = Date.now
    }) {
        const control = this.findPoisonIsolationControl({
            controlCandidates,
            startIndex: controlStartIndex,
            guardrail,
            excludedIds
        });

        if (!control) return {embedded: 0, poisonEntries: [], unproved: true}

        const controlEmbeddings = await this.generateIsolationEmbeddings({
            inputs: [control], shouldYield, signal, onProviderTimeout
        });
        const controlAlreadyLanded = control.alreadyLanded === true;

        let   embedded      = 0;
        const poisonEntries = [];

        const createPoisonEntry = (chunkId, error) => ({
            chunkId,
            reasonCode: error === undefined ? reasonCode : classifyEmbedFailureError(error),
            observedAt: new Date(now()).toISOString()
        });

        const isolate = async inputs => {
            let embeddings;

            try {
                embeddings = await this.generateIsolationEmbeddings({
                    inputs, shouldYield, signal, onProviderTimeout
                });
            } catch (error) {
                if (this.isPoisonIsolationForbidden(error, signal)) throw error;

                if (inputs.length > 1) {
                    const middle = Math.ceil(inputs.length / 2);
                    await isolate(inputs.slice(0, middle));
                    await isolate(inputs.slice(middle));
                    return
                }

                // Paired evidence at the decision boundary. The earlier control success is not enough:
                // a provider can die during the split walk, and quarantining everything after that point
                // would turn a transient outage into durable content loss.
                await this.generateIsolationEmbeddings({
                    inputs: [control], shouldYield, signal, onProviderTimeout
                });

                let candidateRetry;

                try {
                    candidateRetry = await this.generateIsolationEmbeddings({
                        inputs, shouldYield, signal, onProviderTimeout
                    });
                } catch (candidateRetryError) {
                    if (this.isPoisonIsolationForbidden(candidateRetryError, signal)) throw candidateRetryError;
                    poisonEntries.push(createPoisonEntry(inputs[0].chunk.id, candidateRetryError));
                    return
                }

                await this.persistIsolationEmbeddings({collection, inputs, embeddings: candidateRetry});
                preEmbeddedIds.add(inputs[0].chunk.id);
                embedded++;
                return
            }

            // Persistence is intentionally outside the provider-failure catch. A Chroma write error
            // proves nothing about content and must never be bisected into a poison disposition.
            await this.persistIsolationEmbeddings({collection, inputs, embeddings});
            inputs.forEach(input => preEmbeddedIds.add(input.chunk.id));
            embedded += inputs.length;
        };

        if (failedInputs.length === 1) {
            let candidateRetry;

            try {
                candidateRetry = await this.generateIsolationEmbeddings({
                    inputs: failedInputs, shouldYield, signal, onProviderTimeout
                });
            } catch (candidateRetryError) {
                if (this.isPoisonIsolationForbidden(candidateRetryError, signal)) throw candidateRetryError;
                poisonEntries.push(createPoisonEntry(failedInputs[0].chunk.id, candidateRetryError));
            }

            if (candidateRetry) {
                await this.persistIsolationEmbeddings({collection, inputs: failedInputs, embeddings: candidateRetry});
                preEmbeddedIds.add(failedInputs[0].chunk.id);
                embedded++;
            }
        } else {
            const middle = Math.ceil(failedInputs.length / 2);
            await isolate(failedInputs.slice(0, middle));
            await isolate(failedInputs.slice(middle));
        }

        if (!controlAlreadyLanded) {
            await this.persistIsolationEmbeddings({collection, inputs: [control], embeddings: controlEmbeddings});
            preEmbeddedIds.add(control.chunk.id);
            embedded++;
        }

        return {embedded, poisonEntries, unproved: false}
    }

    /**
     * @summary Wraps a zero-progress batch failure without losing its bounded cause/disposition.
     * @param {Object} options
     * @returns {Error}
     */
    createFirstBatchAbort({batchIndex, maxRetries, lastError}) {
        const abort = new Error(`Failed to process batch ${batchIndex} after ${maxRetries} retries. Aborting.`);

        abort.cause = lastError;

        const residencyDisposition = classifyEmbedResidencyDisposition(lastError);

        if (residencyDisposition) {
            abort.residencyDisposition = residencyDisposition;
        }

        return abort
    }

    /**
     * @summary Embeds a set of chunks into the provided Chroma collection.
     *
     * @param {Object}   options
     * @param {Object}   options.collection      Chroma collection target.
     * @param {Object[]} options.chunksToProcess Tenant-stamped chunks to embed.
     * @param {Function} [options.shouldYield]   Cooperative heavy-maintenance-lease yield predicate,
     *     consulted BETWEEN batches here AND between provider chunks inside `TextEmbeddingService.embedTexts`.
     *     Returns truthy once the lease holder has exceeded the fairness bound
     *     (`HeavyMaintenanceLeaseService.shouldYield`); the loop then stops so a starved heavy task can
     *     interleave. Defaults to never-yield, so callers that do not hold the lease are unaffected.
     *
     *     The inner consultation is what makes the bound reachable: this loop alone checks at most once per
     *     `maxRetries * ceil(batchSize / batchEmbeddingChunkSize) * (1 + unloadRetryCount) *
     *     batchEmbeddingTimeoutMs`, which is 16h40m at stock leaves against a 30-minute `maxActiveHoldMs`.
     *     Per-chunk consultation caps the interval at one chunk's worst case.
     * @param {AbortSignal} [options.signal] Shared tenant-sweep provider circuit signal.
     * @param {Function} [options.onProviderTimeout] Synchronous native-provider timeout hook.
     * @param {Object[]} [options.knownPoisonEntries] Validated current-generation poison rows.
     * @param {Object[]} [options.controlCandidates] Full current corpus with landed-state evidence.
     * @param {Function} [options.onPoisonEntries] Durable writer for newly proven poison rows.
     * @param {String} [options.poisonGenerationId] Hashed embedding-generation coordinates for the
     *     transient undeliverable automaton. Callers that resolved the poison coordinates pass it
     *     through so one sweep's strikes, suspicions, and durable dispositions share one generation;
     *     absent, it is resolved once at entry from the same leaves.
     * @param {Function} [options.now] Clock seam for bounded poison receipts.
     * @returns {Promise<{embedded: Number, skipped: Number, yielded: Boolean, failedBatches: Object[], poisonedChunks: Object[], deathGraduations: Object[], deathStrikeProgress: Object[]}>}
     *     `poisonedChunks` reports what was already fenced when the sweep started; `deathGraduations`
     *     reports what THIS sweep fenced on death-class evidence and why; `deathStrikeProgress` reports
     *     unfinished death evidence, with `pending` separating a recorded-but-unproven observation from
     *     a confirmed strike so the two are never summed.
     *     `failedBatches` carries `{batchIndex, chunkIds, reason}` for every batch that exhausted its retries
     *     while other batches were succeeding. Such a batch is skipped rather than aborting the sweep, because
     *     aborting strands every later batch permanently — see the rationale at the exhaustion branch. A sweep
     *     with no earlier provider progress enters bounded paired isolation for non-terminal failures; an
     *     unavailable control or provider-wide control failure still throws rather than laundering outage as poison.
     * @throws {Error} The original provider error when a provider-phase attempt returns a timeout-class code.
     *     The whole sweep ends after that one offer so the outer scheduler owns the later attempt; already-landed
     *     chunks remain the durable resume boundary.
     */
    async embedChunks({
        collection,
        chunksToProcess,
        shouldYield = () => false,
        signal,
        onProviderTimeout,
        knownPoisonEntries = [],
        controlCandidates = chunksToProcess.map(chunk => ({chunk, alreadyLanded: false})),
        onPoisonEntries,
        poisonGenerationId,
        now = Date.now
    }) {
        if (chunksToProcess.length === 0) {
            if (knownPoisonEntries.length === 0) {
                return {embedded: 0, skipped: 0, yielded: false}
            }

            return {
                embedded      : 0,
                skipped       : 0,
                yielded       : false,
                failedBatches : [],
                poisonedChunks: knownPoisonEntries.map(entry => ({...entry}))
            };
        }

        logger.log(`Using TextEmbeddingService with provider: ${mcConfig.embeddingProvider}.`);
        logger.log('Embedding chunks...');

        const {backoffBaseMs, batchSize, batchDelay, maxRetries, undeliverableTimeoutStrikes} = aiConfig;
        const guardrail                                                                       = this.resolveEmbeddingGuardrail();
        const failedBatches                                                                   = [];
        // Death-class graduation receipts for this sweep. Separate from
        // `poisonedChunks`, which reports what was ALREADY fenced when the sweep started: this reports
        // what this sweep fenced and on what evidence, so convergence is visible in the summary instead
        // of only as a repo-level failure count climbing with no stated reason.
        const deathGraduations = [];
        const poisonedChunks                                                                  = knownPoisonEntries.map(entry => ({...entry}));
        const poisonIds                                                                       = new Set(poisonedChunks.map(entry => entry.chunkId));
        const preEmbeddedIds                                                                  = new Set();
        let   embeddedCount                                                                   = 0;
        let   skippedCount                                                                    = 0;
        let   yielded                                                                         = false;

        // The undeliverable automaton's coordinates, resolved ONCE per sweep. Transient strike and
        // suspicion evidence must live under the same generation as the durable disposition it can
        // mint — a strike gathered under one ceiling is not "consecutive" with one gathered under
        // another. Callers that already resolved the poison coordinates pass the generation through
        // so one sweep cannot straddle two resolutions.
        const generation           = this.resolveEmbeddingPoisonGeneration();
        const evidenceGenerationId = poisonGenerationId ?? createEmbeddingGenerationId(generation);
        const evidence             = resolveUndeliverableEvidence(evidenceGenerationId);

        // A cursor rather than a fixed stride: the isolation dispatch below may consume a single
        // chunk from the front of a stride, and the remainder must be re-offered THIS sweep instead
        // of silently skipping to the next stride boundary.
        let cursor = 0;

        /**
         * Mints one death-class geometry disposition, and it is a closure rather than inline code
         * because it now fires from BOTH provider outcomes. The success path converts a pending
         * observation once the provider answers again; the failure path graduates directly when the
         * failure itself proved liveness (`isAcceptedThenDiedError`). Inlining it twice would let the
         * two sites drift on the receipt shape, which is the artifact an operator reads.
         *
         * Fail-open on a persistence error, matching the timeout path: a disposition that cannot
         * persist must never suppress provider work.
         *
         * @param {String} suspectId
         * @param {Object} deathEntry
         * @param {Number} recoveredTokenEstimate Tokens the provider demonstrably served — the
         *     suspect's own size on the failure path, since accepting the request IS the evidence.
         * @returns {Promise<Boolean>} Whether a disposition was minted.
         */
        const graduateDeathSuspect = async (suspectId, deathEntry, recoveredTokenEstimate) => {
            if (deathEntry.strikes < undeliverableTimeoutStrikes || typeof onPoisonEntries !== 'function') {
                return false
            }

            const deathReceipt = {
                chunkId      : suspectId,
                tokenEstimate: deathEntry.tokenEstimate,
                attempts     : deathEntry.strikes,
                recoveredTokenEstimate,
                failureCode  : deathEntry.failureCode
            };

            try {
                await onPoisonEntries([{chunkId: suspectId, reasonCode: KB_VECTOR_EMBED_UNDELIVERABLE_AT_GEOMETRY}]);
                evidence.deaths.delete(suspectId);
                evidence.suspects.delete(suspectId);
                deathGraduations.push(deathReceipt);
                logger.warn(`[VectorService] Chunk ${suspectId} graduated to undeliverable-at-geometry after ${deathReceipt.attempts} single-input dispatches that killed the provider (${deathReceipt.failureCode}, ~${deathReceipt.tokenEstimate} tokens); it stops being offered until the embedding generation changes. The provider accepted each request before dying, which is what attributes the death to this input rather than to an outage — it does not prove the lane can serve an input this size.`);
                return true
            } catch (persistError) {
                logger.warn(`[VectorService] Could not persist the undeliverable disposition for chunk ${suspectId} (${persistError.message}); the chunk remains offered.`);
                return false
            }
        };

        while (cursor < chunksToProcess.length) {
            // Cooperative heavy-maintenance-lease yield-point: BETWEEN batches (never before the
            // first — so at least one batch lands per lease acquisition: a forward-progress guarantee, never a
            // livelock), if the lease holder has exceeded the fairness bound, stop embedding so a starved heavy
            // task (e.g. githubWorkflowSync) can interleave. The completed batches are already durably upserted
            // into the shadow and indexed by the write-ahead resume marker, so the next sweep resumes here
            // (decideResume -> selectResumableChunks). The caller releases the lease on the `yielded` signal.
            if (cursor > 0 && shouldYield()) {
                yielded = true;
                logger.log(`Yielding the heavy-maintenance lease after ${cursor} chunk(s) (${embeddedCount} embedded); ${chunksToProcess.length - cursor} remaining will resume on the next sweep.`);
                break;
            }

            if (cursor > 0 && batchDelay) {
                await this.timeout(batchDelay);
            }

            const stride        = chunksToProcess.slice(cursor, cursor + batchSize);
            const batchNumber   = Math.floor(cursor / batchSize) + 1;
            let   cursorAdvance = stride.length;
            const batch         = stride
                .filter(chunk => !poisonIds.has(chunk.id) && !preEmbeddedIds.has(chunk.id));

            if (batch.length === 0) {
                cursor += cursorAdvance;
                continue;
            }

            const batchInputs = batch.map(chunk => ({
                chunk,
                text: this.buildEmbeddingInputText(chunk)
            }));
            const embeddable = [];

            for (const input of batchInputs) {
                const result = this.evaluateEmbeddingInput({
                    chunk: input.chunk,
                    text : input.text,
                    guardrail
                });

                if (result.skip) {
                    skippedCount++;
                } else {
                    embeddable.push(input);
                }
            }

            if (embeddable.length === 0) {
                logger.warn(`[VectorService] Skipped embedding batch ${batchNumber}; all ${batch.length} chunk(s) exceeded the embedding safe-processing band.`);
                cursor += cursorAdvance;
                continue;
            }

            // `let`, not `const`: the failure-carry arm below persists a completed prefix and shrinks
            // both arrays to the un-persisted remainder, so a retry cannot re-purchase carried vectors.
            let batchToEmbed = embeddable.map(input => input.chunk);
            let textsToEmbed = embeddable.map(input => input.text);

            // Captured from the guardrail evaluation, before the isolation truncation and any
            // failure-carry shrink: after either, deriving this from `batchToEmbed.length` would
            // report un-dispatched or persisted work as "skipped" in the success log.
            const guardrailSkipped = batch.length - embeddable.length;

            // Isolation dispatch: a chunk suspected from a timed-out MULTI-input request is offered
            // ALONE, because a single-input request is the only shape whose timeout names its cause
            // exactly. An innocent neighbour embeds here and clears its suspicion; a monster earns an
            // exact strike. The cursor advances only past the isolated chunk, so the rest of the
            // stride is re-offered in this same sweep rather than skipped to the next one.
            if (batchToEmbed.length > 1 && evidence.suspects.has(batchToEmbed[0].id)) {
                cursorAdvance = stride.indexOf(batchToEmbed[0]) + 1;
                batchToEmbed  = batchToEmbed.slice(0, 1);
                textsToEmbed  = textsToEmbed.slice(0, 1);

                logger.log(`[VectorService] Isolation dispatch for suspect chunk ${batchToEmbed[0].id}: offering it as a single-input request to attribute the earlier multi-input timeout exactly.`);
            }

            let retries   = 0;
            let success   = false;
            let lastError = null;

            // Held ACROSS retries, and that is the point: the provider call and the upsert share one
            // `try`, so a PERSISTENCE failure used to send the retry back through the provider and buy
            // the identical vectors again. Same texts, same model, same result — the second purchase
            // cannot differ, it can only be charged.
            //
            // The yield arm below already refuses to discard paid work ("Persist what the yield already
            // paid for"). This is the same principle on the ordinary failure path, which never had it:
            // a batch that embeds fine but cannot write kept re-embedding on every attempt, and on
            // every later sweep, producing continuous provider load against a collection that never
            // grows — indistinguishable from progress from the outside.
            let embeddings = null;

            // One persistence contract for EVERY carried prefix — the yield arm and the failure arm
            // alike: validate positional binding against the count the PRODUCER states (a short
            // payload sliced positionally shifts every later vector onto its neighbour's id with no
            // length mismatch to catch it), then write under the batch's shared retry budget — the
            // write retries with the vectors in hand, never re-entering the provider. Budget
            // exhaustion rethrows the storage error so a carry is never silently dropped; an
            // un-persisted prefix is re-selected by a later sweep.
            const persistCarriedPrefix = async (carried, expected, arm) => {
                if (carried.length !== expected) {
                    throw new Error(`${arm} batch ${batchNumber} carried ${carried.length} embedding(s) for ${expected} completed input(s); refusing to bind vectors to chunk ids by position.`);
                }

                if (carried.length === 0) return 0;

                const partialChunks = batchToEmbed.slice(0, carried.length);

                for (;;) {
                    try {
                        await collection.upsert({
                            ids       : partialChunks.map(chunk => chunk.id),
                            embeddings: carried,
                            metadatas : partialChunks.map(chunk => buildChunkMetadata(chunk))
                        });
                        break;
                    } catch (writeError) {
                        lastError = writeError;
                        retries++;
                        if (retries >= maxRetries) throw writeError;
                        console.error(`Persisting the carried prefix of ${arm.toLowerCase()} batch ${batchNumber} failed. Retrying the write (${retries}/${maxRetries})...`, writeError.message);
                        // Same leaf as the embed retry below: a spec exercising this arm asserts the
                        // retry depth, not the delay, so a test context pins the base rather than
                        // paying the production wait. See kb.backoffBaseMs.
                        await new Promise(res => setTimeout(res, backoffBaseMs * 2 ** retries));
                    }
                }

                embeddedCount += partialChunks.length;

                return partialChunks.length
            };

            while (retries < maxRetries && !success) {
                // The overlap guard's dispatch stamp. A strike recorded AFTER this attempt was
                // dispatched (by an overlapping attempt on the same chunk) is not sequential evidence
                // relative to this one — both observed the same wall-clock failure window — so the
                // strike site below refuses to increment past it.
                const dispatchSeq = evidence.seq;

                try {
                    embeddings ??= await TextEmbeddingService.embedTexts(textsToEmbed, mcConfig.embeddingProvider, {
                        operationLabel          : 'knowledge base tenant ingestion embedding',
                        operationStage          : 'kb-tenant-ingestion-embedding',
                        providerActivityRecorder: KBRecorderService,
                        service                 : 'knowledge-base',
                        shouldYield,
                        signal,
                        onProviderTimeout
                    });

                    // A dispatched non-timeout provider outcome resets the automaton for every input
                    // it covered — BEFORE the upsert, deliberately: a provider success followed by a
                    // storage failure is still a non-timeout outcome for the chunk, so the
                    // consecutive-timeout chain breaks here regardless of what the write does next.
                    batchToEmbed.forEach(chunk => {
                        evidence.strikes.delete(chunk.id);
                        evidence.suspects.delete(chunk.id);
                        // A chunk that embeds is not a killer. Its own success clears death evidence
                        // against it — pending or already proven — for the same reason a non-timeout
                        // outcome clears its timeout strikes.
                        evidence.deaths.delete(chunk.id);
                    });

                    // The RECOVERY half of the death-class automaton, and the half that makes
                    // the evidence attributable at all. This dispatch succeeded, so the provider is
                    // answering again — which is what turns a pending death from "the provider was
                    // down" into "that input took it down". A death whose provider never comes back
                    // stays pending forever and never fences anything, which is today's behaviour.
                    //
                    // Only observations pending from BEFORE this dispatch convert: `pendingSeq <=
                    // dispatchSeq` is the same overlap guard the timeout path uses, and it matters more
                    // here, because a death recorded by a request that overlapped this success would be
                    // "confirmed" by a success that was already in flight when the provider died.
                    //
                    // The recovering input's token estimate is recorded beside the suspect's rather
                    // than asserted away: this success may be a much smaller chunk, so it proves the
                    // provider is LIVE, not that it can serve an input the suspect's size. That is
                    // sufficient for a disposition that says *geometry* — and only because the poison
                    // generation derives from the resolved admission band, so repairing the geometry
                    // moves the band, changes the generation, and re-offers everything fenced under the
                    // old one. Without that reversibility this graduation would be a one-way door.
                    const recoveredTokenEstimate = bytesToTokens(
                        textsToEmbed.reduce((total, text) => total + Buffer.byteLength(text || '', 'utf8'), 0)
                    );

                    for (const [suspectId, deathEntry] of evidence.deaths) {
                        if (deathEntry.pendingSeq === null || deathEntry.pendingSeq > dispatchSeq) {
                            continue
                        }

                        deathEntry.strikes                 += 1;
                        deathEntry.pendingSeq               = null;
                        deathEntry.recoveredTokenEstimate   = recoveredTokenEstimate;

                        await graduateDeathSuspect(suspectId, deathEntry, recoveredTokenEstimate);
                    }

                    const metadatas = batchToEmbed.map(buildChunkMetadata);

                    await collection.upsert({
                        ids: batchToEmbed.map(chunk => chunk.id),
                        embeddings,
                        metadatas
                    });

                    embeddedCount += batchToEmbed.length;
                    logger.log(`Processed and embedded batch ${batchNumber} of ${Math.ceil(chunksToProcess.length / batchSize)} (${batchToEmbed.length} embedded, ${guardrailSkipped} skipped).`);
                    success = true;
                } catch (err) {
                    // A cooperative yield is a DECISION, not a failure. Falling through to the retry arm would
                    // spend every `maxRetries` attempt re-issuing work the lease holder deliberately stopped —
                    // turning the fairness fix into a maxRetries-fold amplifier of the hold it exists to bound.
                    if (isEmbeddingBatchYieldError(err)) {
                        yielded = true;

                        // Persist what the yield already paid for. Without this the acquisition completes
                        // provider chunks, stores zero ids, and the next sweep re-selects the identical
                        // prefix — so a holder that yields at the same chunk every time never advances.
                        // A reached checkpoint is not a durable one — and durable includes surviving a
                        // TRANSIENT write failure, which is why the shared carry contract (positional
                        // guard + budgeted write retry) applies here exactly as on the failure arm.
                        const carried = err.embeddings || [];

                        // The carried prefix is a dispatched provider SUCCESS for those inputs, so
                        // their automaton entries reset here on the same provider-outcome rule as the
                        // ordinary success path — INCLUDING a pending death, which an input that just
                        // embedded has disproven about itself.
                        //
                        // Deliberately narrower than the ordinary success path in one respect: that
                        // path also GRADUATES every other pending death, because a success proves the
                        // provider was alive. A carried prefix proves the same thing, but graduating
                        // here would convert deaths to strikes on a path that is mid-abort, so this arm
                        // only clears what it disproves and leaves graduation to the next ordinary
                        // success. Evidence is deferred, never dropped.
                        batchToEmbed.slice(0, err.completedTextCount || 0).forEach(chunk => {
                            evidence.strikes.delete(chunk.id);
                            evidence.suspects.delete(chunk.id);
                            evidence.deaths.delete(chunk.id);
                        });

                        await persistCarriedPrefix(carried, err.completedTextCount, 'Yielded');

                        logger.log(`Yielding the heavy-maintenance lease inside batch ${batchNumber} after ${err.completedChunkCount}/${err.totalChunkCount} provider chunk(s); ${carried.length} partial embedding(s) persisted (${embeddedCount} embedded total). This batch is not retried; the next sweep resumes after the persisted prefix.`);
                        break;
                    }

                    // Work conservation on the failure path: a mid-batch provider failure may
                    // carry the completed prefix under the same contract the yield error declares —
                    // positional binding validated by the producer, count derived from what was SENT.
                    // Persist it BEFORE the timeout classification ends the sweep and BEFORE the retry
                    // arm re-runs the batch: a carried prefix the sweep discards is re-purchased on every
                    // later attempt, which on a slow lane is the difference between a corpus that grows
                    // and one that burns full compute forever at a constant count. The batch then shrinks
                    // to the un-persisted remainder so a retry buys only what is actually missing. Same
                    // refuse-loudly guard as the yield arm: a payload disagreeing with its stated count
                    // would bind vectors to wrong ids if sliced positionally.
                    let carryShrunkCount = 0;

                    if (embeddings === null && Number.isInteger(err?.completedTextCount) && err.completedTextCount > 0) {
                        // Same provider-outcome reset as the yield arm, deaths included: the completed
                        // prefix is a dispatched provider success for those inputs, whatever the write
                        // does next, and an input that embedded has disproven its own pending death.
                        // Graduation of OTHER pending deaths is likewise left to the next ordinary
                        // success, for the reason stated on the yield arm.
                        batchToEmbed.slice(0, err.completedTextCount).forEach(chunk => {
                            evidence.strikes.delete(chunk.id);
                            evidence.suspects.delete(chunk.id);
                            evidence.deaths.delete(chunk.id);
                        });

                        const persistedCount = await persistCarriedPrefix(err.embeddings || [], err.completedTextCount, 'Failed');

                        if (persistedCount > 0) {
                            batchToEmbed     = batchToEmbed.slice(persistedCount);
                            textsToEmbed     = textsToEmbed.slice(persistedCount);
                            carryShrunkCount = persistedCount;

                            logger.log(`Persisted ${persistedCount} carried embedding(s) from failed batch ${batchNumber} (${err.completedChunkCount}/${err.totalChunkCount} provider chunk(s) completed before the failure); ${batchToEmbed.length} chunk(s) remain for the retry or a later sweep.`);
                        }
                    }

                    // A provider timeout is evidence that OUR wait ended, not that the provider work did.
                    // The affected plane returned one abandoned request after 66 minutes against a 30-minute
                    // client budget. Re-offering batch 7 — or merely continuing with batch 8 — can therefore
                    // queue new work behind a still-running predecessor. End the whole sweep after the first
                    // provider-phase timeout; the outer tenant-sync scheduler owns the later retry and the
                    // already-persisted prefix remains the next sweep's resume boundary.
                    //
                    // The phase guard is load-bearing. This catch also covers `collection.upsert()`: a write
                    // error carrying a foreign timeout-shaped code must retry the write with the cached vectors,
                    // never be misclassified as provider work that might still be running.
                    const
                        providerCircuitOpen = embeddings === null && err?.code === KB_VECTOR_EMBED_PROVIDER_CIRCUIT_OPEN,
                        providerTimedOut    = embeddings === null && isProviderTimeoutCode(err?.code),
                        // Death is classified through the cause chain, not `err.code`, because a
                        // transport death routinely arrives wrapped by a stage-naming error. The
                        // `embeddings === null` guard carries the same phase meaning as its siblings:
                        // a write error with a death-shaped code is storage work, not provider work.
                        providerDied        = embeddings === null && isProviderDeathError(err);

                    if (providerCircuitOpen || providerTimedOut) {
                        // Deterministic-undeliverable classification, on EXACT attribution only. One
                        // timeout is lane evidence; the SAME chunk expiring its call ceiling on
                        // consecutive single-input attempts is an intrinsic cost above the ceiling —
                        // every further offer buys a full ceiling of head-of-line blocking for each
                        // chunk and repository queued behind it. On the strike limit the chunk
                        // graduates to a durable poison-store disposition (generation-keyed, so a
                        // raised ceiling or changed geometry re-offers it automatically) and is never
                        // dispatched again.
                        //
                        // A timeout from a MULTI-input request names the request, not a member: the
                        // provider abandoned the POST as a unit, and blaming its first member would
                        // let an innocent neighbour inherit a monster's strikes and be durably fenced.
                        // Multi-input evidence therefore only marks the request's members as
                        // isolation SUSPECTS — the dispatch site above offers a suspect alone, where
                        // the next timeout is exact. A circuit-open never dispatched, so it neither
                        // strikes nor resets.
                        //
                        // The graduating sweep STILL ends below: the provider is grinding the
                        // just-abandoned attempt headless, and dispatching the remainder now would
                        // queue fresh work behind it — the exact hazard the end-sweep rule exists to
                        // prevent. The NEXT sweep proceeds past the excised chunk on an idle engine.
                        if (providerTimedOut && batchToEmbed.length > 0) {
                            const failedRequestChunks = resolveFailedRequestChunks({
                                error         : err,
                                batchToEmbed,
                                persistedCount: carryShrunkCount
                            });

                            if (failedRequestChunks.length === 1) {
                                const suspect = failedRequestChunks[0];
                                const entry   = evidence.strikes.get(suspect.id) ?? {count: 0, lastStrikeSeq: 0};

                                // A single-input timeout CONFIRMS suspicion rather than consuming it:
                                // the chunk keeps being dispatched alone until a non-timeout outcome
                                // clears it or graduation fences it — releasing it here would let a
                                // striking monster rejoin multi-input requests between strikes.
                                evidence.suspects.add(suspect.id);

                                // The overlap guard: an entry whose last strike landed AFTER this
                                // attempt dispatched observed the same failure window — counting both
                                // would let two overlapping attempts fabricate a "consecutive" pair.
                                if (entry.lastStrikeSeq <= dispatchSeq) {
                                    entry.count        += 1;
                                    entry.lastStrikeSeq = ++evidence.seq;
                                    evidence.strikes.set(suspect.id, entry);
                                }

                                if (entry.count >= undeliverableTimeoutStrikes && typeof onPoisonEntries === 'function') {
                                    // The AC-1 receipt: bounded numbers and a hash, surfaced beside
                                    // the disposition without replacing the original timeout — the
                                    // sweep below still throws `err`, decorated, so the ingest
                                    // summary carries both the cause and the graduation evidence.
                                    const receipt = {
                                        chunkId           : suspect.id,
                                        tokenEstimate     : bytesToTokens(Buffer.byteLength(textsToEmbed[batchToEmbed.indexOf(suspect)] || '', 'utf8')),
                                        attempts          : entry.count,
                                        effectiveCeilingMs: generation.embedCallCeilingMs
                                    };

                                    try {
                                        await onPoisonEntries([{chunkId: suspect.id, reasonCode: KB_VECTOR_EMBED_UNDELIVERABLE_AT_GEOMETRY}]);
                                        evidence.strikes.delete(suspect.id);
                                        evidence.suspects.delete(suspect.id);
                                        err.undeliverableGraduation = receipt;
                                        logger.warn(`[VectorService] Chunk ${suspect.id} graduated to undeliverable-at-geometry after ${receipt.attempts} consecutive single-input call-ceiling expiries (~${receipt.tokenEstimate} tokens against a ${receipt.effectiveCeilingMs}ms ceiling); it stops being offered until the embedding generation (provider, model, dimension, call ceiling) changes.`);
                                    } catch (persistError) {
                                        // Fail-open: a disposition that cannot persist must not suppress
                                        // provider work — the chunk stays offered and the strikes stay
                                        // counted.
                                        logger.warn(`[VectorService] Could not persist the undeliverable disposition for chunk ${suspect.id} (${persistError.message}); the chunk remains offered.`);
                                    }
                                }
                            } else {
                                // Multi-input or unattributable request: suspicion only. An empty
                                // resolution (no producer span — e.g. the native-ollama batch, which
                                // posts one opaque multi-input request) conservatively suspects every
                                // dispatched member; suspicion costs one isolation offer, never a fence.
                                const members = failedRequestChunks.length > 0 ? failedRequestChunks : batchToEmbed;

                                members.forEach(chunk => evidence.suspects.add(chunk.id));
                            }
                        }

                        const disposition = providerCircuitOpen
                            ? 'the run-scoped provider circuit opened before this repository dispatched'
                            : 'one timeout-class provider attempt ended';

                        console.error(`An error occurred during embedding batch ${batchNumber}. Ending this embedding sweep because ${disposition}; pending chunks remain for a later scheduler cycle.`, err.message);
                        throw err
                    }

                    // A dispatched non-timeout provider failure breaks the consecutive-timeout chain
                    // for the inputs it covered: reset their automaton entries (never their durable
                    // dispositions). Storage failures skip this — `embeddings !== null` means the
                    // provider half succeeded and the success path already reset.
                    if (embeddings === null) {
                        const failedRequestChunks = resolveFailedRequestChunks({
                            error         : err,
                            batchToEmbed,
                            persistedCount: carryShrunkCount
                        });

                        // Death-class RECORDING, and this is the only path a death reaches: the
                        // end-sweep branch above fires on circuit-open and timeout, so a death falls
                        // through to here.
                        //
                        // The timeout path graduates on its own evidence, because a fired deadline
                        // proves itself. A death splits in two, and the failure code is what tells
                        // them apart. An ACCEPTED-then-died failure carries its own liveness proof and
                        // graduates below. A REFUSED connection proves only that nothing was listening,
                        // so it records a PENDING observation and fences nothing — the isolation
                        // contract is explicit that a dead provider "proves nothing about content and
                        // must never be bisected into a poison disposition", and a refusal cannot
                        // distinguish a killer input from an unrelated outage.
                        //
                        // Single-input only, for the same reason the timeout path is: a death on a
                        // multi-input request cannot name which member caused it.
                        const deathSuspect = providerDied && failedRequestChunks.length === 1
                            ? failedRequestChunks[0]
                            : null;

                        // Suspicion for the MULTI-input death, and without it the whole automaton is
                        // unreachable — found by instrumenting a fixture rather than by reading the
                        // code. A death only becomes attributable once the suspect is dispatched ALONE,
                        // and the thing that isolates it is suspicion; the timeout path adds it in its
                        // own `else` branch, but that branch lives inside the end-sweep block a death
                        // never enters. Without this the sweep re-dispatched the same three-input batch
                        // three times and aborted, so no single-input death could ever be recorded.
                        //
                        // Same semantics the timeout path documents: suspicion costs one isolation
                        // offer and never a fence, so suspecting every member of an unattributable
                        // death is the conservative move rather than a widening.
                        const deathMembers = providerDied
                            ? (failedRequestChunks.length > 0 ? failedRequestChunks : batchToEmbed)
                            : [];
                        const deathMemberIds = new Set(deathMembers.map(chunk => chunk.id));

                        if (deathSuspect) {
                            const entry = evidence.deaths.get(deathSuspect.id) ?? {
                                strikes               : 0,
                                pendingSeq            : null,
                                tokenEstimate         : 0,
                                recoveredTokenEstimate: null,
                                failureCode           : null
                            };

                            const suspectTokens = bytesToTokens(
                                Buffer.byteLength(textsToEmbed[batchToEmbed.indexOf(deathSuspect)] || '', 'utf8')
                            );

                            // The liveness half of attribution comes from the FAILURE CODE, not from a
                            // recovery probe — see `isAcceptedThenDiedError`. A reset / EPIPE / socket-end
                            // needs an established connection, so the provider was answering when this
                            // input left and this input is the one that was in flight. That is the whole
                            // "provider was alive AND this killed it" pair, at zero extra provider cost.
                            //
                            if (isAcceptedThenDiedError(err)) {
                                entry.strikes                += 1;
                                entry.pendingSeq              = null;
                                entry.tokenEstimate           = suspectTokens;
                                entry.recoveredTokenEstimate  = suspectTokens;
                                entry.failureCode             = classifyEmbedFailureError(err);
                                evidence.deaths.set(deathSuspect.id, entry);

                                // Graduating here and not only on the success path: once the suspect is
                                // the only chunk left, no later dispatch succeeds, so a success-gated
                                // graduation is unreachable exactly when it is needed.
                                await graduateDeathSuspect(deathSuspect.id, entry, suspectTokens);
                            }
                            // A REFUSED connection proves the provider was already dead, so it says nothing
                            // about this input. It stays a pending observation exactly as before: one at a
                            // time, because a second refusal while the first is unconfirmed is the same
                            // unproven fact rather than a second strike.
                            else if (entry.pendingSeq === null) {
                                entry.pendingSeq    = ++evidence.seq;
                                entry.tokenEstimate = suspectTokens;
                                entry.failureCode   = classifyEmbedFailureError(err);
                                evidence.deaths.set(deathSuspect.id, entry);
                            }
                        }

                        (failedRequestChunks.length > 0 ? failedRequestChunks : batchToEmbed).forEach(chunk => {
                            evidence.strikes.delete(chunk.id);

                            // Death members keep their suspicion, and that exemption is the point:
                            // suspicion is what dispatches a candidate ALONE next time, which is the
                            // only way its next death is attributable to it rather than to its
                            // neighbours. Clearing it here — as the timeout automaton's reset does for
                            // everyone else — would re-batch the suspect and make the observation
                            // unconfirmable, which is precisely the state the fixture caught.
                            if (!deathMemberIds.has(chunk.id)) {
                                evidence.suspects.delete(chunk.id)
                            }
                        });

                        deathMembers.forEach(chunk => evidence.suspects.add(chunk.id));
                    }

                    lastError = err;
                    retries++;
                    console.error(`An error occurred during embedding batch ${batchNumber}. Retrying (${retries}/${maxRetries})...`, err.message);
                    if (retries < maxRetries) {
                        // Exponential backoff. The base is a leaf so a test context can pin it to
                        // 1ms: the retry DEPTH is what these specs assert, and paying the production
                        // delay to assert it only buys wall-clock. See kb.backoffBaseMs.
                        await new Promise(res => setTimeout(res, backoffBaseMs * 2 ** retries));
                    }
                }
            }

            // Retry exhaustion, and the whole reason this branch is not a bare `throw`.
            //
            // Aborting the sweep here strands every LATER batch permanently, not temporarily: `embed()`
            // rebuilds `chunksToProcess` by walking the corpus IN ORDER and keeping what the collection does
            // not already hold, so succeeded batches drop out while the failed one stays first in line. A
            // batch that fails deterministically — one rejected chunk, one payload past the guardrail — is
            // therefore re-attempted, re-charged its full retry cost, and re-aborted at the identical index on
            // every future sweep. Nothing after it is ever attempted again.
            //
            // The yield arm one block up was hardened against exactly this shape ("a holder that yields at the
            // same chunk every time never advances"); this arm had no equivalent. Same loop, same hazard, one
            // guarantee.
            //
            // Prior success remains the continuation signal for later batches. Batch 1 is different: it has
            // no earlier success by construction, so the only safe route is a bounded paired control. The
            // control is offered before any split; if it fails, the provider-wide case stops at a fixed ceiling.
            if (!success && !yielded) {
                if (embeddedCount === 0) {
                    const abort = this.createFirstBatchAbort({
                        batchIndex: batchNumber,
                        maxRetries,
                        lastError
                    });

                    // A non-null embedding payload means the provider succeeded and persistence
                    // exhausted its retries. Storage failure is never content evidence.
                    if (embeddings !== null) throw abort;

                    if (this.isPoisonIsolationForbidden(lastError, signal)) throw abort;

                    // A lease handoff is never evidence about content. It is checked before the first
                    // isolation dispatch so the cooperative-yield path retains its dispatch ceiling.
                    if (shouldYield()) {
                        yielded = true;
                        break
                    }

                    const excludedIds = new Set([
                        ...poisonIds,
                        ...preEmbeddedIds,
                        ...batchToEmbed.map(chunk => chunk.id)
                    ]);
                    let isolation;

                    try {
                        isolation = await this.isolateFirstFailedBatch({
                            collection,
                            failedInputs     : embeddable,
                            controlCandidates,
                            controlStartIndex: 0,
                            guardrail,
                            excludedIds,
                            preEmbeddedIds,
                            shouldYield,
                            signal,
                            onProviderTimeout,
                            reasonCode       : classifyEmbedFailureError(lastError),
                            now
                        });
                    } catch (isolationError) {
                        throw this.createFirstBatchAbort({
                            batchIndex: batchNumber,
                            maxRetries,
                            lastError : isolationError
                        })
                    }

                    if (isolation.unproved) throw abort;

                    if (isolation.poisonEntries.length > 0) {
                        if (typeof onPoisonEntries !== 'function') {
                            throw new Error('VectorService.embedChunks: a durable poison-state writer is required before poison evidence can be returned.')
                        }

                        // The marker is the retry fence. If its durable write fails, fail the run even though
                        // some isolation vectors may already have landed: reporting a partial success without
                        // the fence would re-buy the same poison indefinitely on later sweeps.
                        await onPoisonEntries(isolation.poisonEntries.map(entry => ({...entry})));

                        for (const entry of isolation.poisonEntries) {
                            poisonIds.add(entry.chunkId);
                            poisonedChunks.push({...entry});
                        }
                    }

                    embeddedCount += isolation.embedded;
                    logger.warn(`[VectorService] First embedding batch was isolated with bounded paired evidence: ${isolation.embedded} recoverable chunk(s) landed and ${isolation.poisonEntries.length} proven poison chunk(s) were fenced.`);
                    cursor += cursorAdvance;
                    continue
                }

                failedBatches.push({
                    batchIndex: batchNumber,
                    chunkIds  : batchToEmbed.map(chunk => chunk.id),
                    reason    : lastError?.message || 'unknown embedding failure'
                });

                // At least one batch has landed, so continuing is worth attempting. This is a CONTINUATION
                // POLICY, not a diagnosis: an earlier success does not prove the batch is at fault — a
                // provider can die after embedding fine for an hour, and this branch cannot tell that from
                // one poisoned payload. It only decides that the remaining work is worth trying rather than
                // abandoning, and records what failed so the caller can decide what the hole means. Skip it and keep going;
                // the remainder is recoverable work and the failure travels back in `failedBatches`.
                logger.warn(`[VectorService] Batch ${batchNumber} failed after ${maxRetries} retries; skipping it and continuing (${embeddedCount} embedded so far). Reason: ${lastError?.message}`);
            }

            // The retry loop exits on success, on exhaustion (handled directly above), or on a yield — only the
            // last one leaves the outer sweep to stop, so it is named explicitly rather than relying on the next
            // between-batch checkpoint observing a predicate that may already have flipped back.
            if (yielded) break;

            cursor += cursorAdvance;
        }

        // Death-class strike PROGRESS, not just its terminal receipts. The ticket's complaint was that
        // an operator watched `consecutiveFailures` climb with no explanation; a chunk that has struck
        // once and is waiting on a recovery to confirm a second is exactly the state that was invisible.
        // `pending` distinguishes "recorded, unproven" from "proven" so the two are never summed.
        const deathStrikeProgress = [...evidence.deaths].map(([chunkId, entry]) => ({
            chunkId,
            strikes: entry.strikes,
            pending: entry.pendingSeq !== null
        }));

        return {embedded: embeddedCount, skipped: skippedCount, yielded, failedBatches, poisonedChunks, deathGraduations, deathStrikeProgress};
    }

    /**
     * Creates a process-unique temporary collection name for a shadow-swap phase.
     *
     * @param {String} phase Name suffix identifying the phase.
     * @returns {String} Temporary Chroma collection name.
     */
    createSwapCollectionName(phase) {
        return `${aiConfig.collectionName}-${phase}-${Date.now()}-${crypto.randomUUID()}`;
    }

    /**
     * @summary Rebuilds the full corpus into a shadow collection, then promotes it to the
     * canonical name without ever gutting the live collection in-place.
     *
     * ChromaDB has no single atomic exchange primitive, so the promote step is a
     * bounded two-rename transaction: live -> parking, shadow -> canonical. The old
     * collection remains parked as a rollback artifact because destructive collection
     * deletion is operator-gated outside unit tests.
     *
     * @param {Object}   options
     * @param {Object}   options.liveCollection Existing canonical collection handle.
     * @param {Object[]} options.knowledgeBase   Full tenant-stamped corpus.
     * @param {Number}   options.idsToDeleteCount Logical stale-id count removed from the canonical view.
     * @param {Function} [options.shouldYield]   Cooperative heavy-maintenance-lease yield predicate,
     *     threaded to `embedChunks`. On a between-batch yield the shadow is preserved-not-promoted (the
     *     write-ahead resume marker already indexes it) and a `{yielded: true}` envelope is returned so the
     *     lease holder releases; the next sweep resumes from the preserved shadow.
     * @param {AbortSignal} [options.signal] Shared tenant-sweep provider circuit signal.
     * @param {Function} [options.onProviderTimeout] Synchronous native-provider timeout hook.
     * @returns {Promise<Object>} Embedding result (carries `yielded: true` when the lease was cooperatively released).
     */
    async embedViaShadowSwap({
        liveCollection,
        knowledgeBase,
        idsToDeleteCount,
        shouldYield = () => false,
        signal,
        onProviderTimeout,
        knownPoisonEntries = [],
        onPoisonEntries,
        poisonGenerationId
    }) {
        const stateDir    = this.getResumeStateDir();
        const fingerprint = computeCorpusFingerprint(knowledgeBase);
        const resumeState = await readResumeState({dir: stateDir});
        const decision    = decideResume({resumeState, currentFingerprint: fingerprint});
        // Captured BEFORE any shadow work: the election fence compares this view at the promote
        // moment, so a generation commit or rollback landing mid-build fences this writer out
        // instead of letting a corpus built under the old view advertise into the new generation.
        const electionDir = resolveVectorGenerationElectionDir({planeDataRoot: aiConfig.plane.dataRoot});
        const promoteView = await captureVectorPromoteView({dir: electionDir});

        let shadowCollection  = null;
        let shadowName        = null;
        let chunksToEmbed     = knowledgeBase;
        let attempts          = 1;
        let alreadyEmbedded   = 0;
        let shadowExistingIds = new Set();

        // Resume into the preserved shadow (it holds the completed batches), skipping already-embedded chunks.
        if (decision.resume) {
            try {
                shadowName       = resumeState.shadowName;
                attempts         = decision.attempts;
                shadowCollection = await ChromaManager.client.getCollection({name: shadowName, embeddingFunction: aiConfig.dummyEmbeddingFunction});

                shadowExistingIds = await this.readCollectionIds(shadowCollection);
                const selection = selectResumableChunks({chunks: knowledgeBase, existingIds: shadowExistingIds});

                chunksToEmbed   = selection.remaining;
                alreadyEmbedded = selection.alreadyEmbedded;
                logger.log(`Resuming KB embedding into '${shadowName}' — ${alreadyEmbedded} already embedded, ${chunksToEmbed.length} remaining (attempt ${attempts}).`);
            } catch (resumeError) {
                logger.warn(`[VectorService] Could not resume into preserved shadow '${shadowName}' (${resumeError.message}); rebuilding fresh.`);
                shadowCollection = null;
            }
        }

        // Fresh build: discard any stale preserved shadow (corpus-drift / attempt-cap / vanished), then rebuild.
        if (!shadowCollection) {
            if (resumeState?.shadowName) {
                await this.discardResumeShadow(resumeState.shadowName);
            }
            await clearResumeState({dir: stateDir});

            shadowName      = this.createSwapCollectionName('shadow');
            attempts        = 1;
            chunksToEmbed   = knowledgeBase;
            alreadyEmbedded = 0;
            shadowExistingIds = new Set();
            logger.log(`Building shadow knowledge-base collection '${shadowName}' (${decision.reason}).`);

            // Write-ahead resume marker: record the shadow BEFORE creating + embedding it, so a non-promoted
            // shadow is ALWAYS indexed by a marker. Otherwise a transient embed failure whose catch-path
            // marker-write ALSO fails strands the shadow with no marker — the next fresh-build's
            // discardResumeShadow(resumeState?.shadowName) then no-ops and the shadow orphans permanently. A
            // failure here throws before createCollection, so no shadow is ever created without its marker.
            await writeResumeState({dir: stateDir, fingerprint, shadowName, attempts});
            shadowCollection = await ChromaManager.client.createCollection({name: shadowName, embeddingFunction: aiConfig.dummyEmbeddingFunction});
        }

        const parkingName = this.createSwapCollectionName('parking');

        let liveParked     = false;
        let shadowPromoted = false;

        try {
            // The outer read filters markers against the live collection. A resumed shadow has its own
            // durable target-local truth: if a formerly poisoned id is already present there, the hole is
            // repaired for this transaction and must not keep blocking promotion.
            const unresolvedPoisonEntries = knownPoisonEntries
                .filter(entry => !shadowExistingIds.has(entry.chunkId));
            const embedResult = await this.embedChunks({
                collection        : shadowCollection,
                chunksToProcess   : chunksToEmbed,
                shouldYield,
                signal,
                onProviderTimeout,
                knownPoisonEntries: unresolvedPoisonEntries,
                controlCandidates : knowledgeBase.map(chunk => ({
                    chunk,
                    alreadyLanded: shadowExistingIds.has(chunk.id)
                })),
                onPoisonEntries,
                poisonGenerationId
            });

            if (embedResult.yielded) {
                // Cooperative lease-yield: the shadow holds the completed batches and the write-ahead
                // resume marker already indexes it, so DO NOT promote and DO NOT clear the marker — the next
                // sweep resumes (decideResume -> selectResumableChunks). The live collection is untouched
                // (preserved-not-promoted), so githubWorkflowSync can write resources/content/ freely while we
                // are yielded; the resumed run re-reads the updated corpus. Torn-read-free by the same shadow
                // isolation that protects a normal run.
                logger.log(`Yielded the heavy-maintenance lease mid shadow-swap; preserving shadow '${shadowName}' for resume (${embedResult.embedded + alreadyEmbedded} embedded so far).`);
                return {
                    message         : `KB embedding yielded the heavy-maintenance lease after ${embedResult.embedded + alreadyEmbedded} chunk(s); the next sweep resumes from the preserved shadow.`,
                    embedded        : embedResult.embedded + alreadyEmbedded,
                    deleted         : idsToDeleteCount,
                    staleStrategy   : 'shadow-swap',
                    yielded         : true,
                    shadowCollection: shadowName,
                    poisonedChunks  : embedResult.poisonedChunks || []
                };
            }

            if (embedResult.skipped > 0) {
                throw new Error(`KB_EMBEDDING_INPUT_SIZE_EXCEEDED: shadow-swap refused to promote an incomplete corpus after skipping ${embedResult.skipped} over-budget embedding chunk(s).`);
            }

            // `embedChunks` is shared by BOTH stale strategies, and a hole means opposite things to
            // them. On the incremental path a skipped batch is recoverable — the canonical collection
            // keeps everything that did land and the next sweep re-selects the rest. Here the shadow is
            // about to REPLACE a complete live corpus, so the same hole is permanent data loss with a
            // success-shaped receipt: the live collection would be parked and an incomplete shadow
            // promoted over it.
            //
            // Refusing here rather than teaching `embedChunks` about strategies is deliberate: the
            // batch loop reports what happened, and the transaction boundary decides what that means
            // for its own commit semantics. Complete-or-preserve stays the shadow's invariant, in the
            // same shape the over-budget guard above already uses, and the throw precedes both renames
            // so the live corpus is untouched.
            if (embedResult.failedBatches?.length > 0) {
                throw new Error(`KB_EMBEDDING_BATCH_FAILED: shadow-swap refused to promote an incomplete corpus after ${embedResult.failedBatches.length} batch(es) exhausted their retries.`);
            }

            if (embedResult.poisonedChunks?.length > 0) {
                const message = `Shadow-swap preserved without promotion; ${embedResult.poisonedChunks.length} proven poison chunk(s) remain fenced for explicit replay or changed content.`;

                logger.warn(`[VectorService] ${message}`);
                return {
                    message,
                    embedded        : embedResult.embedded + alreadyEmbedded,
                    deleted         : idsToDeleteCount,
                    staleStrategy   : 'shadow-swap',
                    shadowCollection: shadowName,
                    poisonedChunks  : embedResult.poisonedChunks.map(entry => ({...entry}))
                }
            }

            // The stale-writer fence, immediately before the renames: refuses unless the view this
            // corpus was built under is still the elected generation at the current epoch.
            const promoteAdmission = await assertCapturedPromoteView({
                dir          : electionDir,
                collectionKey: 'kb.unified',
                view         : promoteView
            });

            logger.log(`Promoting shadow collection '${shadowName}' to '${aiConfig.collectionName}'.`);
            await liveCollection.modify({name: parkingName});
            liveParked = true;
            await shadowCollection.modify({name: aiConfig.collectionName});
            shadowPromoted = true;

            ChromaManager.invalidateKnowledgeBaseCollectionCache();
            await clearResumeState({dir: stateDir}); // promoted → nothing to resume

            if (promoteAdmission.mode === 'elected' && promoteAdmission.electionStatus === 'committed') {
                try {
                    await recordPromoteCompletion({dir: electionDir, collectionKey: 'kb.unified', expectedEpoch: promoteAdmission.epoch})
                } catch (completionError) {
                    // The renames landed; a lost completion mark only keeps acceptance blocked
                    // (rollback authority retained) — never unwind a successful promote for bookkeeping.
                    logger.error('[VectorService] Promote landed but the election completion mark failed; acceptance stays blocked until repaired:', completionError.message);
                }
            }

            const collection = await ChromaManager.getKnowledgeBaseCollection();
            const count      = await collection.count();
            const message    = `Embedding complete via shadow-swap. Collection now contains ${count} items. Previous collection parked as '${parkingName}'.`;
            logger.log(message);

            return {
                message,
                embedded           : embedResult.embedded + alreadyEmbedded,
                deleted            : idsToDeleteCount,
                staleStrategy      : 'shadow-swap',
                shadowCollection   : shadowName,
                parkedCollection   : parkingName,
                canonicalCollection: aiConfig.collectionName
            };
        } catch (error) {
            ChromaManager.invalidateKnowledgeBaseCollectionCache();

            if (liveParked && !shadowPromoted) {
                try {
                    await liveCollection.modify({name: aiConfig.collectionName});
                    ChromaManager.invalidateKnowledgeBaseCollectionCache();
                } catch (rollbackError) {
                    logger.error('[VectorService] Failed to roll back parked live collection after shadow-swap failure:', rollbackError.message);
                }
            }

            if (!shadowPromoted) {
                // A too-big chunk (KB_EMBEDDING_INPUT_SIZE_EXCEEDED) will NEVER embed — resuming it is futile,
                // so park the shadow as a dead artifact (the prior behavior) and clear its marker. A TRANSIENT
                // embed failure (a provider blip) instead PRESERVES the shadow so the next run resumes from
                // here. This re-write advances the attempt counter; fresh builds already wrote the marker
                // ahead of embedding and resumes carry a prior marker, so the shadow is already indexed.
                if (error?.message?.includes('KB_EMBEDDING_INPUT_SIZE_EXCEEDED')) {
                    await this.parkFailedShadowCollection({shadowCollection, shadowName});
                    await clearResumeState({dir: stateDir});
                } else {
                    try {
                        await writeResumeState({dir: stateDir, fingerprint, shadowName, attempts});
                        logger.warn(`[VectorService] Preserved shadow '${shadowName}' for resume (attempt ${attempts}) after a transient embedding failure: ${error.message}`);
                    } catch (preserveError) {
                        // The write-ahead (fresh build) or prior (resume) marker still indexes the shadow, so
                        // it is not orphaned — only the attempt-counter refresh was lost.
                        logger.error(`[VectorService] Could not refresh resume-state for '${shadowName}' (${preserveError.message}); the write-ahead marker still protects the shadow.`);
                    }
                }
            }
            throw error;
        }
    }

    /**
     * @summary Resolves the configured directory holding the KB embedding resume-state marker.
     *
     * An explicit instance seam supports isolated tests. Production consumes the resolved KB
     * config leaf; it never reconstructs the canonical data root from the checkout location.
     * @returns {String}
     */
    getResumeStateDir() {
        const resumeStateDir = this.resumeStateDir ?? aiConfig.embeddingResumeStateDir;

        if (typeof resumeStateDir !== 'string' || resumeStateDir.trim() === '') {
            throw new Error(
                'VectorService.getResumeStateDir: aiConfig.embeddingResumeStateDir is required.'
            )
        }

        return resumeStateDir
    }

    /**
     * @summary Reads every document id present in a Chroma collection (paginated id-only fetch).
     * Used to compute which chunks a preserved resume-shadow already holds.
     * @param {Object} collection Chroma collection handle.
     * @returns {Promise<Set<String>>}
     */
    async readCollectionIds(collection) {
        const ids    = [];
        const limit  = 1000;
        let   offset = 0;

        while (true) {
            const batch    = await collection.get({include: [], limit, offset});
            const batchIds = batch?.ids ?? [];

            ids.push(...batchIds);
            if (batchIds.length < limit) break;
            offset += limit;
        }

        return new Set(ids);
    }

    /**
     * @summary Parks a stale preserved resume-shadow (corpus drifted / attempt cap reached) so the fresh
     * rebuild starts clean. Best-effort: a vanished/unreadable shadow is simply nothing to discard.
     * @param {String} shadowName The preserved resume-shadow collection name.
     * @returns {Promise<void>}
     */
    async discardResumeShadow(shadowName) {
        try {
            const shadowCollection = await ChromaManager.client.getCollection({name: shadowName, embeddingFunction: aiConfig.dummyEmbeddingFunction});
            await this.parkFailedShadowCollection({shadowCollection, shadowName});
        } catch (error) {
            logger.warn(`[VectorService] Could not discard stale resume-shadow '${shadowName}': ${error.message}`);
        }
    }

    /**
     * @summary Renames an incomplete shadow collection so future canonical resolves do not treat it as an active promote.
     *
     * The collection-name delete guard intentionally blocks unconfirmed production
     * deletes, including non-canonical names. A failed pre-promote shadow therefore
     * gets moved to a non-active recovery name instead of being dropped silently.
     *
     * @param {Object} options
     * @param {Object} options.shadowCollection Shadow collection handle to park.
     * @param {String} options.shadowName       Original active shadow collection name.
     * @returns {Promise<String|null>} Parked name, or `null` if parking failed.
     */
    async parkFailedShadowCollection({shadowCollection, shadowName}) {
        const failedShadowName = this.createSwapCollectionName('failed-shadow');

        try {
            await shadowCollection.modify({name: failedShadowName});
            logger.warn(`[VectorService] Parked failed shadow collection '${shadowName}' as '${failedShadowName}'.`);
            return failedShadowName;
        } catch (error) {
            logger.error(`[VectorService] Failed to park shadow collection '${shadowName}' after shadow-swap failure:`, error.message);
            return null;
        }
    }

    /**
     * @summary Reads a JSONL file, enriches data, generates embeddings, and updates ChromaDB.
     *
     * **Work-volume gate:** when invoked via MCP (`viaMcp: true`), refuses
     * synchronous execution if `chunksToProcess.length` exceeds `aiConfig.mcpSyncMaxChunks`
     * (default 50, aligned with `batchSize`). Returns a structured `{error, code, ...}`
     * payload that the MCP server's `Server.mjs` converts to `isError: true` per its
     * existing `'error' in result` contract. CLI invocations (via `npm run ai:sync-kb`)
     * pass `viaMcp: false` and bypass the gate — explicit opt-in to long-running work.
     *
     * @param {String}  knowledgeBasePath          The path to the JSONL source file.
     * @param {Object}  [opts]                     Optional invocation context.
     * @param {Boolean} [opts.viaMcp=false]        True when called via MCP tool dispatch;
     *                                             enables the work-volume gate.
     * @param {Object}  [opts.tenantContext]       Server-derived tenant stamp context.
     * @param {Boolean} [opts.deleteStale=true]    True applies full-corpus stale-id deletion.
     *                                             Incremental ingestion pushes pass `false` and
     *                                             use explicit deletion signaling instead.
     * @param {String}  [opts.staleStrategy]       Stale handling strategy. `delete-upfront`
     *                                             preserves the historical behavior;
     *                                             `shadow-swap` rebuilds into a fresh collection
     *                                             before promoting it to the canonical name.
     * @param {Function} [opts.shouldYield]        Cooperative heavy-maintenance-lease yield predicate
     *                                             threaded to the shadow-swap embed loop so a long
     *                                             re-embed releases the lease at a batch boundary for a starved
     *                                             heavy task, then resumes from the preserved shadow. Default
     *                                             never yields, so non-lease-held callers are unaffected.
     * @param {AbortSignal} [opts.signal]          Shared tenant-sweep provider circuit signal.
     * @param {Function} [opts.onProviderTimeout]  Synchronous native-provider timeout hook.
     * @param {Boolean} [opts.replayEmbeddingPoison=false] Explicit operator replay clears the
     *                                             tenant/repository poison fence before diffing.
     * @returns {Promise<object>} A promise that resolves to a success message, OR a
     *     `{error, code: 'KB_SYNC_VOLUME_EXCEEDED', ...}` shape when the MCP gate fires.
     */
    async embed(knowledgeBasePath, {
        viaMcp = false,
        tenantContext = {},
        deleteStale = true,
        staleStrategy,
        shouldYield = () => false,
        signal,
        onProviderTimeout,
        replayEmbeddingPoison = false
    } = {}) {
        logger.log('Starting knowledge base embedding...');
        const resolvedStaleStrategy = this.resolveStaleStrategy({staleStrategy, deleteStale});

        if (!await fs.pathExists(knowledgeBasePath)) {
            throw new Error(`Knowledge base file not found at ${knowledgeBasePath}.`);
        }

        const knowledgeBase = [];
        const fileStream    = fs.createReadStream(knowledgeBasePath);
        const rl            = readline.createInterface({input: fileStream, crlfDelay: Infinity});

        for await (const line of rl) {
            knowledgeBase.push(JSON.parse(line));
        }
        logger.log(`Loaded ${knowledgeBase.length} knowledge chunks from file.`);

        const tenantStamp           = this.resolveTenantStamp(tenantContext);
        const expandedKnowledgeBase = this.expandOversizedEmbeddingChunks(knowledgeBase);
        const poisonStateDir        = this.getResumeStateDir();
        const poisonCoordinates     = this.resolveEmbeddingPoisonCoordinates(tenantStamp);

        if (replayEmbeddingPoison) {
            await clearEmbeddingPoisonState({dir: poisonStateDir, scopeId: poisonCoordinates.scopeId});
        }

        const poisonState = await readEmbeddingPoisonState({
            dir         : poisonStateDir,
            scopeId     : poisonCoordinates.scopeId,
            generationId: poisonCoordinates.generationId
        });

        for (let i = 0; i < expandedKnowledgeBase.length; i++) {
            expandedKnowledgeBase[i] = this.applyTenantStamp(expandedKnowledgeBase[i], tenantStamp);
        }

        // Enrich with inheritance chains
        const classNameToDataMap = {};
        expandedKnowledgeBase.forEach(chunk => {
            if (chunk.kind === 'module-context' && chunk.className) {
                classNameToDataMap[chunk.className] = {
                    source: chunk.source,
                    parent: chunk.extends || null
                };
            }
        });

        expandedKnowledgeBase.forEach(chunk => {
            let   currentClass     = chunk.className; // Metadata is now on every chunk
            const inheritanceChain = [];
            const visited          = new Set();

            // If no className metadata (e.g. non-class files), skip
            if (!currentClass) return;

            while (currentClass && classNameToDataMap[currentClass]?.parent && !visited.has(currentClass)) {
                visited.add(currentClass);
                const parentClassName = classNameToDataMap[currentClass].parent;
                const parentData      = classNameToDataMap[parentClassName];
                if (parentData) {
                    inheritanceChain.push({ className: parentClassName, source: parentData.source });
                }
                currentClass = parentClassName;
            }
            chunk.inheritanceChain = inheritanceChain;
        });

        const collection = await ChromaManager.getKnowledgeBaseCollection();
        logger.log(`Using collection: ${collection.name}`);

        // Scoped to the corpus THIS call owns. Unscoped, `existingIds` held every row in the
        // collection, so `idsToDelete` below treated every other tenant's and repo's rows as
        // stale and deleted them. Observed live: a sync pass over the `neo` corpus removed a
        // tenant repo's 50 rows, and would have repeated on every sweep interval — the two
        // could never coexist.
        //
        // The narrowing is exact rather than heuristic. `createTenantAwareChunkId` hashes
        // `{tenantId, repoSlug, ...}` into the id, so an id written under one stamp cannot
        // occur under another. The add-side delta (`chunksToProcess`) is therefore unchanged
        // by scoping — only deletion is confined, to this corpus's own orphans. It also makes
        // pagination cheaper on a shared collection.
        const ownedScope = this.buildOwnedScopeFilter(tenantStamp);

        logger.log(`Fetching existing documents for ${tenantStamp.tenantId}/${tenantStamp.repoSlug}...`);
        const existingIds = new Set();
        let   offset      = 0;
        const limit       = 2000;
        let batch;

        // ChromaDB has a default limit (usually 10) if not specified.
        // Even with a larger limit, it's safer to paginate for large collections.
        do {
            batch = await collection.get({
                include: [],
                limit,
                offset,
                where  : ownedScope
            });

            batch.ids.forEach(id => existingIds.add(id));
            offset += limit;
            logger.log(`Fetched ${existingIds.size} IDs so far...`);
        } while (batch.ids.length === limit);

        logger.log(`Found ${existingIds.size} existing documents in this corpus.`);

        const allIds             = new Set(expandedKnowledgeBase.map(chunk => chunk.id));
        const knownPoisonEntries = poisonState.status === 'available'
            ? poisonState.entries.filter(entry => allIds.has(entry.chunkId) && !existingIds.has(entry.chunkId))
            : [];
        const poisonIds       = new Set(knownPoisonEntries.map(entry => entry.chunkId));
        const chunksToProcess = [];
        const processedIds    = new Set();

        expandedKnowledgeBase.forEach(chunk => {
            const chunkId = chunk.id;

            if (!existingIds.has(chunkId) && !poisonIds.has(chunkId) && !processedIds.has(chunkId)) {
                chunksToProcess.push(chunk);
                processedIds.add(chunkId);
            }
        });

        const controlCandidates = expandedKnowledgeBase.map(chunk => ({
            chunk,
            alreadyLanded: existingIds.has(chunk.id)
        }));
        const persistPoisonEntries = entries => upsertEmbeddingPoisonEntries({
            dir         : poisonStateDir,
            scopeId     : poisonCoordinates.scopeId,
            generationId: poisonCoordinates.generationId,
            entries
        });

        // Convert existingIds Set to Array for filtering, as existingDocs object is no longer available
        const existingIdsArray = Array.from(existingIds);
        const idsToDelete      = resolvedStaleStrategy === STALE_STRATEGY_SKIP ? [] : existingIdsArray.filter(id => !allIds.has(id));
        const shouldShadowSwap = resolvedStaleStrategy === 'shadow-swap' && (chunksToProcess.length > 0 || idsToDelete.length > 0);
        const workVolume       = shouldShadowSwap ? expandedKnowledgeBase.length : chunksToProcess.length;

        logger.log(`${workVolume} chunks to add or update.`);
        logger.log(`${idsToDelete.length} chunks to delete.`);

        // Work-volume gate: refuse synchronous embedding via MCP when the
        // post-delta queue exceeds the configured threshold. The threshold default
        // matches `batchSize` (one batch is the floor for "small enough to run
        // synchronously"); real latency is provider/tier/retry-state-dependent so
        // the threshold is empirically tunable rather than timing-derived.
        // CLI invocations pass viaMcp: false and bypass.
        //
        // Ordered ABOVE the no-adds branch below, and metered on deletions as well as adds.
        // Both were required: `workVolume` counted only adds, so a call adding 3 rows and
        // deleting 60,000 presented to the gate as "3"; and the no-adds branch deleted and
        // returned before the gate was ever evaluated, which made the largest possible
        // deletion the one case no guard saw. A mass delete is work.
        const mcpThreshold = aiConfig.mcpSyncMaxChunks;
        if (viaMcp && Math.max(workVolume, idsToDelete.length) > mcpThreshold) {
            // `logPath` is a Provider-owned leaf; read it directly so malformed config
            // shape fails loud instead of silently re-deriving a local default.
            const logDir       = aiConfig.logPath;
            const errorPayload = {
                error  : `KB sync work volume exceeds MCP-callable threshold`,
                message: `${workVolume} chunks need re-embedding and ${idsToDelete.length} need deleting ` +
                         `(threshold: ${mcpThreshold}). ` +
                         `Synchronous work at this volume risks agent freeze. ` +
                         `Run via CLI: \`npm run ai:sync-kb\`. ` +
                         `Tail progress: \`tail -f ${logDir}/kb-server-$(date +%Y-%m-%d).log\`.`,
                code           : 'KB_SYNC_VOLUME_EXCEEDED',
                chunksToProcess: workVolume,
                idsToDelete    : idsToDelete.length,
                threshold      : mcpThreshold
            };
            logger.warn(`[VectorService] ${errorPayload.error}: ${errorPayload.message}`);
            return errorPayload;
        }

        // Genuine no-op: nothing to add AND nothing to delete. Reported as such because it is
        // such. This branch previously fired whenever there was nothing to ADD, regardless of how
        // many rows were about to be deleted — so a mass deletion returned
        // "No changes detected. Knowledge base is up to date." beside a large `deleted` count, a
        // success-shaped report for the opposite of no change. A delete-bearing pass now falls
        // through to the path below, which deletes and then states the resulting collection size.
        if (!shouldShadowSwap && chunksToProcess.length === 0 && idsToDelete.length === 0) {
            const message = knownPoisonEntries.length > 0
                ? `No recoverable changes detected; ${knownPoisonEntries.length} proven poison chunk(s) remain fenced for explicit replay or changed content.`
                : 'No changes detected. Knowledge base is up to date.';
            logger.log(message);
            return {
                message,
                embedded      : 0,
                deleted       : 0,
                poisonedChunks: knownPoisonEntries.map(entry => ({...entry}))
            };
        }

        if (shouldShadowSwap) {
            return await this.embedViaShadowSwap({
                liveCollection    : collection,
                knowledgeBase     : expandedKnowledgeBase,
                idsToDeleteCount  : idsToDelete.length,
                shouldYield,
                signal,
                onProviderTimeout,
                knownPoisonEntries,
                onPoisonEntries   : persistPoisonEntries,
                poisonGenerationId: poisonCoordinates.generationId
            });
        }

        if (idsToDelete.length > 0) {
            await collection.delete({ ids: idsToDelete });
            logger.log(`Deleted ${idsToDelete.length} stale chunks.`);
        }

        const embedResult = await this.embedChunks({
            collection,
            chunksToProcess,
            // The shadow-swap branch has forwarded this since it was introduced; the incremental
            // branch did not, so the whole cooperative-yield contract was live on one path and
            // absent on the other — and the tenant lane runs incrementally. Without it a caller
            // supplying a budget gets no yielding at all, silently, because a missing predicate is
            // indistinguishable from one that never votes to stop.
            shouldYield,
            signal,
            onProviderTimeout,
            knownPoisonEntries,
            controlCandidates,
            onPoisonEntries   : persistPoisonEntries,
            poisonGenerationId: poisonCoordinates.generationId
        });

        const count          = await collection.count();
        const failedBatches  = embedResult.failedBatches || [];
        const poisonedChunks = embedResult.poisonedChunks || [];
        const message        = failedBatches.length > 0
            ? `Embedding complete with ${failedBatches.length} skipped batch(es). Collection now contains ${count} items.`
            : poisonedChunks.length > 0
                ? `Embedding complete with ${poisonedChunks.length} proven poison chunk(s) fenced. Collection now contains ${count} items.`
            : `Embedding complete. Collection now contains ${count} items.`;
        logger.log(message);

        // Surfaced rather than swallowed: a skipped batch is recoverable work that did NOT land, and a caller
        // that cannot see it reports a clean sync over a corpus with a hole in it.
        return {
            message,
            embedded: embedResult.embedded,
            deleted : idsToDelete.length,
            failedBatches,
            poisonedChunks,
            // The discriminator between "this corpus is done" and "this slice stopped early". Dropping
            // it made the two indistinguishable to every caller, so a bounded slice reported the same
            // shape as a complete run — the caller then persists a checkpoint over work that never
            // landed. Absent predicate ⇒ `embedChunks` never yields ⇒ `false`, so this is additive and
            // every existing caller keeps today's semantics.
            yielded : embedResult.yielded === true,
            // Death-class evidence forwarded rather than assumed to travel. This census picks
            // fields explicitly, so anything `embedChunks` returns and this does not name is silently
            // dropped — which is exactly what happened on the first attempt: the fields existed on the
            // inner return, arrived `undefined` at the caller, and the AC that asks for them in the
            // ingestion summary read as satisfied from the producer's side alone.
            //
            // `deathGraduations` is what THIS sweep fenced and on what evidence; `deathStrikeProgress`
            // is the unfinished half, with `pending` separating a recorded-but-unproven observation
            // from a confirmed strike so a reader never sums the two. Defaulted to `[]` in the same
            // shape as `failedBatches` and `poisonedChunks` above, so a caller cannot tell a sweep with
            // no death evidence from an older producer that never reported any.
            deathGraduations   : embedResult.deathGraduations    || [],
            deathStrikeProgress: embedResult.deathStrikeProgress || []
        };
    }

    /**
     * Orchestrates the startup logic.
     * Ensures dependent services are ready before this service is considered ready.
     * @protected
     */
    async initAsync() {
        await super.initAsync();
        await ChromaManager.ready();
    }
}

export default Neo.setupClass(VectorService);
