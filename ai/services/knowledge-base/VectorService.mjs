import aiConfig                  from '../../mcp/server/knowledge-base/config.mjs';
import TextEmbeddingService      from '../memory-core/TextEmbeddingService.mjs';
import mcConfig                  from '../../mcp/server/memory-core/config.mjs';
import Base                      from '../../../src/core/Base.mjs';
import ChromaManager             from './ChromaManager.mjs';
import crypto                    from 'crypto';
import fs                        from 'fs-extra';
import logger                    from '../../mcp/server/knowledge-base/logger.mjs';
import path                      from 'path';
import readline                  from 'readline';
import DestructiveOperationGuard from '../../mcp/server/shared/services/DestructiveOperationGuard.mjs';

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
        const stamp = {
            tenantId           : tenantContext.tenantId ?? config.defaultTenantId ?? 'neo-shared',
            repoSlug           : tenantContext.repoSlug ?? config.defaultRepoSlug ?? 'neo',
            visibility         : tenantContext.visibility ?? config.defaultVisibility ?? 'team',
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
                serverValue: serverValue ?? null,
                tenantId: stamp.tenantId,
                repoSlug: stamp.repoSlug,
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
     * Embeds a set of chunks into the provided Chroma collection.
     *
     * @param {Object}   options
     * @param {Object}   options.collection      Chroma collection target.
     * @param {Object[]} options.chunksToProcess Tenant-stamped chunks to embed.
     * @returns {Promise<void>}
     */
    async embedChunks({collection, chunksToProcess}) {
        if (chunksToProcess.length === 0) {
            return;
        }

        logger.log(`Using TextEmbeddingService with provider: ${mcConfig.embeddingProvider}.`);
        logger.log('Embedding chunks...');

        const {batchSize, batchDelay, maxRetries} = aiConfig;

        for (let i = 0; i < chunksToProcess.length; i += batchSize) {
            if (i > 0 && batchDelay) {
                await this.timeout(batchDelay);
            }

            const batch = chunksToProcess.slice(i, i + batchSize);
            const textsToEmbed = batch.map(chunk => `${chunk.type}: ${chunk.name} in ${chunk.className || ''}\n${chunk.description || chunk.content || ''}`);

            let retries = 0;
            let success = false;

            while (retries < maxRetries && !success) {
                try {
                    const embeddings = await TextEmbeddingService.embedTexts(textsToEmbed, mcConfig.embeddingProvider);

                    const metadatas = batch.map(chunk => {
                        const metadata = {};
                        for (const [key, value] of Object.entries(chunk)) {
                            metadata[key] = (value === null) ? 'null' : (typeof value === 'object') ? JSON.stringify(value) : value;
                        }
                        return metadata;
                    });

                    await collection.upsert({
                        ids: batch.map(chunk => chunk.id),
                        embeddings,
                        metadatas
                    });

                    logger.log(`Processed and embedded batch ${i / batchSize + 1} of ${Math.ceil(chunksToProcess.length / batchSize)}`);
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
        const shadowName  = this.createSwapCollectionName('shadow');
        const parkingName = this.createSwapCollectionName('parking');

        logger.log(`Building shadow knowledge-base collection '${shadowName}'.`);

        const shadowCollection = await ChromaManager.client.createCollection({
            name             : shadowName,
            embeddingFunction: aiConfig.dummyEmbeddingFunction
        });

        let liveParked     = false;
        let shadowPromoted = false;

        try {
            await this.embedChunks({collection: shadowCollection, chunksToProcess: knowledgeBase});

            logger.log(`Promoting shadow collection '${shadowName}' to '${aiConfig.collectionName}'.`);
            await liveCollection.modify({name: parkingName});
            liveParked = true;
            await shadowCollection.modify({name: aiConfig.collectionName});
            shadowPromoted = true;

            ChromaManager.invalidateKnowledgeBaseCollectionCache();

            const collection = await ChromaManager.getKnowledgeBaseCollection();
            const count      = await collection.count();
            const message    = `Embedding complete via shadow-swap. Collection now contains ${count} items. Previous collection parked as '${parkingName}'.`;
            logger.log(message);

            return {
                message,
                embedded           : knowledgeBase.length,
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
                await this.parkFailedShadowCollection({shadowCollection, shadowName});
            }
            throw error;
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

        const tenantStamp = this.resolveTenantStamp(tenantContext);

        for (let i = 0; i < knowledgeBase.length; i++) {
            knowledgeBase[i] = this.applyTenantStamp(knowledgeBase[i], tenantStamp);
        }

        // Enrich with inheritance chains
        const classNameToDataMap = {};
        knowledgeBase.forEach(chunk => {
            if (chunk.kind === 'module-context' && chunk.className) {
                classNameToDataMap[chunk.className] = {
                    source : chunk.source,
                    parent : chunk.extends || null
                };
            }
        });

        knowledgeBase.forEach(chunk => {
            let currentClass = chunk.className; // Metadata is now on every chunk
            const inheritanceChain = [];
            const visited = new Set();

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
        let offset = 0;
        const limit = 2000;
        let batch;

        // ChromaDB has a default limit (usually 10) if not specified.
        // Even with a larger limit, it's safer to paginate for large collections.
        do {
            batch = await collection.get({
                include: [],
                limit,
                offset: offset
            });

            batch.ids.forEach(id => existingIds.add(id));
            offset += limit;
            logger.log(`Fetched ${existingIds.size} IDs so far...`);
        } while (batch.ids.length === limit);

        logger.log(`Found ${existingIds.size} existing documents.`);

        const chunksToProcess = [];
        const allIds          = new Set();
        const processedIds    = new Set();

        knowledgeBase.forEach(chunk => {
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
        const workVolume       = shouldShadowSwap ? knowledgeBase.length : chunksToProcess.length;

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
            const logDir = aiConfig.logPath;
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
                liveCollection: collection,
                knowledgeBase,
                idsToDeleteCount: idsToDelete.length
            });
        }

        if (idsToDelete.length > 0) {
            await collection.delete({ ids: idsToDelete });
            logger.log(`Deleted ${idsToDelete.length} stale chunks.`);
        }

        await this.embedChunks({collection, chunksToProcess});

        const count   = await collection.count();
        const message = `Embedding complete. Collection now contains ${count} items.`;
        logger.log(message);
        return {message, embedded: chunksToProcess.length, deleted: idsToDelete.length};
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
