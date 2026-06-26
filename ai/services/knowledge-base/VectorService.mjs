import aiConfig             from '../../mcp/server/knowledge-base/config.mjs';
import TextEmbeddingService from '../memory-core/TextEmbeddingService.mjs';
import mcConfig             from '../../mcp/server/memory-core/config.mjs';
import Base                 from '../../../src/core/Base.mjs';
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

const TENANT_GUARDED_FIELDS = ['tenantId', 'repoSlug', 'visibility', 'originAgentIdentity', 'tenantConfigVersion', 'ingestedAt'];
const STALE_STRATEGIES      = Object.freeze(new Set(['delete-upfront', 'shadow-swap']));
const STALE_STRATEGY_SKIP   = 'skip';

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
     * Resolves the local embedding-model guardrail used before provider invocation.
     *
     * @returns {{enabled: Boolean, contextLimitTokens: Number, safeProcessingLimitTokens: Number, model: String}}
     */
    resolveEmbeddingGuardrail() {
        const localEmbeddingProviders   = new Set(['openAiCompatible', 'ollama']);
        const embeddingProvider         = mcConfig.embeddingProvider;
        const contextLimitTokens        = Number(aiConfig.localModels.embedding.contextLimitTokens);
        const safeProcessingLimitTokens = Number(aiConfig.localModels.embedding.safeProcessingLimitTokens);
        const model                     = embeddingProvider === 'ollama'
            ? aiConfig.ollama.embeddingModel
            : embeddingProvider === 'openAiCompatible'
                ? aiConfig.openAiCompatible.embeddingModel
                : embeddingProvider;

        return {
            enabled                  : localEmbeddingProviders.has(embeddingProvider),
            contextLimitTokens,
            safeProcessingLimitTokens,
            model
        };
    }

    /**
     * Builds the provider input string used by the embedding guardrail and provider call.
     *
     * @param {Object} chunk Parsed knowledge chunk.
     * @returns {String} Provider input text.
     */
    buildEmbeddingInputText(chunk) {
        return `${chunk.type}: ${chunk.name} in ${chunk.className || ''}\n${chunk.description || chunk.content || ''}`;
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

        if (!guardrail.enabled) {
            return chunks;
        }

        const expanded = [];

        for (const chunk of chunks) {
            const inputText  = this.buildEmbeddingInputText(chunk),
                  evaluation = this.measureEmbeddingInput({text: inputText, guardrail});

            if (!evaluation.skip) {
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

        const maxInputBytes = Math.max(1, guardrail.safeProcessingLimitTokens * 3),
              prefixBytes     = Buffer.byteLength(`${chunk.type}: ${chunk.name} in ${chunk.className || ''}\n`, 'utf8'),
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
     *
     * @param {String} text Source text.
     * @param {Number} maxBytes Maximum byte size per returned part.
     * @returns {String[]} Split text parts.
     */
    splitTextByByteBudget(text, maxBytes) {
        if (Buffer.byteLength(text, 'utf8') <= maxBytes) {
            return [text];
        }

        const parts   = [];
        let   current = '';

        for (const line of text.match(/[^\n]*\n?|[^\n]+$/g).filter(Boolean)) {
            if (Buffer.byteLength(line, 'utf8') > maxBytes) {
                if (current) {
                    parts.push(current);
                    current = '';
                }
                parts.push(...this.splitLongStringByByteBudget(line, maxBytes));
                continue;
            }

            if (current && Buffer.byteLength(current + line, 'utf8') > maxBytes) {
                parts.push(current);
                current = line;
            } else {
                current += line;
            }
        }

        if (current) {
            parts.push(current);
        }

        return parts.filter(part => part.length > 0);
    }

    /**
     * Splits one oversized line without breaking JavaScript surrogate pairs.
     *
     * @param {String} value Source string.
     * @param {Number} maxBytes Maximum byte size per part.
     * @returns {String[]} Split text parts.
     */
    splitLongStringByByteBudget(value, maxBytes) {
        const parts   = [];
        let   current = '';

        for (const char of value) {
            if (current && Buffer.byteLength(current + char, 'utf8') > maxBytes) {
                parts.push(current);
                current = char;
            } else {
                current += char;
            }
        }

        if (current) {
            parts.push(current);
        }

        return parts;
    }

    /**
     * Measures provider input size without recording a final refusal diagnostic.
     *
     * @param {Object} options
     * @param {String} options.text Provider input text.
     * @param {Object} options.guardrail Resolved embedding guardrail.
     * @returns {{skip: Boolean, inputBytes: Number, inputTokensEstimate: Number}}
     */
    measureEmbeddingInput({text, guardrail}) {
        if (!guardrail.enabled) {
            return {skip: false, inputBytes: 0, inputTokensEstimate: 0};
        }

        const inputBytes          = Buffer.byteLength(text || '', 'utf8');
        const inputTokensEstimate = bytesToTokens(inputBytes);

        return {
            skip: inputTokensEstimate > guardrail.safeProcessingLimitTokens,
            inputBytes,
            inputTokensEstimate
        };
    }

    /**
     * Emits a bounded, non-secret friction record for an over-budget embedding input.
     *
     * @param {Object} options
     * @param {Object} options.chunk Tenant-stamped chunk.
     * @param {String} options.text Provider input text.
     * @param {Object} options.guardrail Resolved embedding guardrail.
     * @returns {{skip: Boolean, inputBytes: Number, inputTokensEstimate: Number}}
     */
    evaluateEmbeddingInput({chunk, text, guardrail}) {
        const {skip, inputBytes, inputTokensEstimate} = this.measureEmbeddingInput({text, guardrail});

        if (!skip) {
            return {skip: false, inputBytes, inputTokensEstimate};
        }

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
            serviceDomain            : 'other',
            note                     : 'KB embedding input exceeds safe processing band; split or reduce the source chunk before embedding.'
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

        return {skip: true, inputBytes, inputTokensEstimate};
    }

    /**
     * Embeds a set of chunks into the provided Chroma collection.
     *
     * @param {Object}   options
     * @param {Object}   options.collection      Chroma collection target.
     * @param {Object[]} options.chunksToProcess Tenant-stamped chunks to embed.
     * @returns {Promise<{embedded: Number, skipped: Number}>}
     */
    async embedChunks({collection, chunksToProcess}) {
        if (chunksToProcess.length === 0) {
            return {embedded: 0, skipped: 0};
        }

        logger.log(`Using TextEmbeddingService with provider: ${mcConfig.embeddingProvider}.`);
        logger.log('Embedding chunks...');

        const {batchSize, batchDelay, maxRetries} = aiConfig;
        const guardrail                           = this.resolveEmbeddingGuardrail();
        let   embeddedCount                       = 0;
        let   skippedCount                        = 0;

        for (let i = 0; i < chunksToProcess.length; i += batchSize) {
            if (i > 0 && batchDelay) {
                await this.timeout(batchDelay);
            }

            const batch       = chunksToProcess.slice(i, i + batchSize);
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
                logger.warn(`[VectorService] Skipped embedding batch ${i / batchSize + 1}; all ${batch.length} chunk(s) exceeded the embedding safe-processing band.`);
                continue;
            }

            const batchToEmbed = embeddable.map(input => input.chunk);
            const textsToEmbed = embeddable.map(input => input.text);

            let retries = 0;
            let success = false;

            while (retries < maxRetries && !success) {
                try {
                    const embeddings = await TextEmbeddingService.embedTexts(textsToEmbed, mcConfig.embeddingProvider);

                    const metadatas = batchToEmbed.map(chunk => {
                        const metadata = {};
                        for (const [key, value] of Object.entries(chunk)) {
                            metadata[key] = (value === null) ? 'null' : (typeof value === 'object') ? JSON.stringify(value) : value;
                        }
                        return metadata;
                    });

                    await collection.upsert({
                        ids: batchToEmbed.map(chunk => chunk.id),
                        embeddings,
                        metadatas
                    });

                    embeddedCount += batchToEmbed.length;
                    logger.log(`Processed and embedded batch ${i / batchSize + 1} of ${Math.ceil(chunksToProcess.length / batchSize)} (${batchToEmbed.length} embedded, ${batch.length - batchToEmbed.length} skipped).`);
                    success = true;
                } catch (err) {
                    retries++;
                    console.error(`An error occurred during embedding batch ${i / batchSize + 1}. Retrying (${retries}/${maxRetries})...`, err.message);
                    if (retries < maxRetries) {
                        await new Promise(res => setTimeout(res, 2 ** retries * 1000)); // Exponential backoff
                    } else {
                        throw new Error(`Failed to process batch ${i / batchSize + 1} after ${maxRetries} retries. Aborting.`);
                    }
                }
            }
        }

        return {embedded: embeddedCount, skipped: skippedCount};
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
     * Rebuilds the full corpus into a shadow collection, then promotes it to the
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
     * @returns {Promise<Object>} Embedding result.
     */
    async embedViaShadowSwap({liveCollection, knowledgeBase, idsToDeleteCount}) {
        const stateDir    = this.getResumeStateDir();
        const fingerprint = computeCorpusFingerprint(knowledgeBase);
        const resumeState = await readResumeState({dir: stateDir});
        const decision    = decideResume({resumeState, currentFingerprint: fingerprint});

        let shadowCollection = null;
        let shadowName       = null;
        let chunksToEmbed    = knowledgeBase;
        let attempts         = 1;
        let alreadyEmbedded  = 0;

        // Resume into the preserved shadow (it holds the completed batches), skipping already-embedded chunks.
        if (decision.resume) {
            try {
                shadowName       = resumeState.shadowName;
                attempts         = decision.attempts;
                shadowCollection = await ChromaManager.client.getCollection({name: shadowName, embeddingFunction: aiConfig.dummyEmbeddingFunction});

                const selection = selectResumableChunks({chunks: knowledgeBase, existingIds: await this.readCollectionIds(shadowCollection)});

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
            logger.log(`Building shadow knowledge-base collection '${shadowName}' (${decision.reason}).`);
            shadowCollection = await ChromaManager.client.createCollection({name: shadowName, embeddingFunction: aiConfig.dummyEmbeddingFunction});
        }

        const parkingName = this.createSwapCollectionName('parking');

        let liveParked     = false;
        let shadowPromoted = false;

        try {
            const embedResult = await this.embedChunks({collection: shadowCollection, chunksToProcess: chunksToEmbed});

            if (embedResult.skipped > 0) {
                throw new Error(`KB_EMBEDDING_INPUT_SIZE_EXCEEDED: shadow-swap refused to promote an incomplete corpus after skipping ${embedResult.skipped} over-budget embedding chunk(s).`);
            }

            logger.log(`Promoting shadow collection '${shadowName}' to '${aiConfig.collectionName}'.`);
            await liveCollection.modify({name: parkingName});
            liveParked = true;
            await shadowCollection.modify({name: aiConfig.collectionName});
            shadowPromoted = true;

            ChromaManager.invalidateKnowledgeBaseCollectionCache();
            await clearResumeState({dir: stateDir}); // promoted → nothing to resume

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
                // so park the shadow as a dead artifact (the prior behavior). A TRANSIENT embed failure (a
                // provider blip) instead PRESERVES the shadow + records resume-state, so the next run resumes
                // from here rather than re-embedding the whole corpus.
                if (error?.message?.includes('KB_EMBEDDING_INPUT_SIZE_EXCEEDED')) {
                    await this.parkFailedShadowCollection({shadowCollection, shadowName});
                    await clearResumeState({dir: stateDir});
                } else {
                    try {
                        await writeResumeState({dir: stateDir, fingerprint, shadowName, attempts});
                        logger.warn(`[VectorService] Preserved shadow '${shadowName}' for resume (attempt ${attempts}) after a transient embedding failure: ${error.message}`);
                    } catch (preserveError) {
                        logger.error(`[VectorService] Failed to record resume-state for '${shadowName}': ${preserveError.message}`);
                    }
                }
            }
            throw error;
        }
    }

    /**
     * @summary Resolves the gitignored directory holding the KB embedding resume-state marker.
     * @returns {String}
     */
    getResumeStateDir() {
        return this.resumeStateDir ?? path.resolve(aiConfig.neoRootDir, '.neo-ai-data', 'kb-sync');
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
     * Reads a JSONL file, enriches data, generates embeddings, and updates ChromaDB.
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
     * @returns {Promise<object>} A promise that resolves to a success message, OR a
     *     `{error, code: 'KB_SYNC_VOLUME_EXCEEDED', ...}` shape when the MCP gate fires.
     */
    async embed(knowledgeBasePath, {viaMcp = false, tenantContext = {}, deleteStale = true, staleStrategy} = {}) {
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

        logger.log('Fetching existing documents from ChromaDB...');
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
                offset : offset
            });

            batch.ids.forEach(id => existingIds.add(id));
            offset += limit;
            logger.log(`Fetched ${existingIds.size} IDs so far...`);
        } while (batch.ids.length === limit);

        logger.log(`Found ${existingIds.size} existing documents.`);

        const chunksToProcess = [];
        const allIds          = new Set();
        const processedIds    = new Set();

        expandedKnowledgeBase.forEach(chunk => {
            const chunkId = chunk.id;
            allIds.add(chunkId);

            if (!existingIds.has(chunkId) && !processedIds.has(chunkId)) {
                chunksToProcess.push(chunk);
                processedIds.add(chunkId);
            }
        });

        // Convert existingIds Set to Array for filtering, as existingDocs object is no longer available
        const existingIdsArray = Array.from(existingIds);
        const idsToDelete      = resolvedStaleStrategy === STALE_STRATEGY_SKIP ? [] : existingIdsArray.filter(id => !allIds.has(id));
        const shouldShadowSwap = resolvedStaleStrategy === 'shadow-swap' && (chunksToProcess.length > 0 || idsToDelete.length > 0);
        const workVolume       = shouldShadowSwap ? expandedKnowledgeBase.length : chunksToProcess.length;

        logger.log(`${workVolume} chunks to add or update.`);
        logger.log(`${idsToDelete.length} chunks to delete.`);

        if (!shouldShadowSwap && chunksToProcess.length === 0) {
            if (idsToDelete.length > 0) {
                await collection.delete({ ids: idsToDelete });
                logger.log(`Deleted ${idsToDelete.length} stale chunks.`);
            }

            const message = 'No changes detected. Knowledge base is up to date.';
            logger.log(message);
            return {message, embedded: 0, deleted: idsToDelete.length};
        }

        // Work-volume gate: refuse synchronous embedding via MCP when the
        // post-delta queue exceeds the configured threshold. The threshold default
        // matches `batchSize` (one batch is the floor for "small enough to run
        // synchronously"); real latency is provider/tier/retry-state-dependent so
        // the threshold is empirically tunable rather than timing-derived.
        // CLI invocations pass viaMcp: false and bypass.
        const mcpThreshold = aiConfig.mcpSyncMaxChunks;
        if (viaMcp && workVolume > mcpThreshold) {
            // `logPath` is a Provider-owned leaf; read it directly so malformed config
            // shape fails loud instead of silently re-deriving a local default.
            const logDir       = aiConfig.logPath;
            const errorPayload = {
                error  : `KB sync work volume exceeds MCP-callable threshold`,
                message: `${workVolume} chunks need re-embedding (threshold: ${mcpThreshold}). ` +
                         `Synchronous embedding at this volume risks agent freeze. ` +
                         `Run via CLI: \`npm run ai:sync-kb\`. ` +
                         `Tail progress: \`tail -f ${logDir}/kb-server-$(date +%Y-%m-%d).log\`.`,
                code           : 'KB_SYNC_VOLUME_EXCEEDED',
                chunksToProcess: workVolume,
                threshold      : mcpThreshold
            };
            logger.warn(`[VectorService] ${errorPayload.error}: ${errorPayload.message}`);
            return errorPayload;
        }

        if (shouldShadowSwap) {
            return await this.embedViaShadowSwap({
                liveCollection  : collection,
                knowledgeBase   : expandedKnowledgeBase,
                idsToDeleteCount: idsToDelete.length
            });
        }

        if (idsToDelete.length > 0) {
            await collection.delete({ ids: idsToDelete });
            logger.log(`Deleted ${idsToDelete.length} stale chunks.`);
        }

        const embedResult = await this.embedChunks({collection, chunksToProcess});

        const count = await collection.count();
        const message = `Embedding complete. Collection now contains ${count} items.`;
        logger.log(message);
        return {message, embedded: embedResult.embedded, deleted: idsToDelete.length};
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
