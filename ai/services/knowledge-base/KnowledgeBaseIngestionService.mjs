import Ajv2020           from 'ajv/dist/2020.js';
import Base              from '../../../src/core/Base.mjs';
import ChromaManager     from './ChromaManager.mjs';
import GraphService      from '../memory-core/GraphService.mjs';
import KBRecorderService from './KBRecorderService.mjs';
import {
    bytesToTokens,
    emitConsumerFriction
}                            from '../memory-core/helpers/consumerFrictionHelper.mjs';
import RequestContextService,
       {normalizeUserId}    from '../../mcp/server/shared/services/RequestContextService.mjs';
import SourceRegistry        from './source/_export.mjs';
import {normalizeTenantRepoConfig}
                             from './helpers/tenantRepoAccessContract.mjs';
import VectorService   from './VectorService.mjs';
import aiConfig        from '../../mcp/server/knowledge-base/config.mjs';
import crypto          from 'crypto';
import fs              from 'fs-extra';
import logger          from '../../mcp/server/knowledge-base/logger.mjs';
import mcConfig        from '../../mcp/server/memory-core/config.mjs';
import os              from 'os';
import path            from 'path';
import yaml            from 'js-yaml';
import {fileURLToPath} from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const LOCAL_EMBEDDING_PROVIDERS = new Set(['openAiCompatible', 'ollama']);
const PARSED_CHUNK_SCHEMA_PATH  = path.join(__dirname, 'parser/parsed-chunk-v1.schema.json');

/**
 * @summary Orchestrates tenant-aware Knowledge Base ingestion pushes.
 *
 * `KnowledgeBaseIngestionService` is the service-layer substrate consumed by the
 * MCP and bulk ingestion facades. It validates the caller tenant boundary, accepts
 * client-side parsed `parsed-chunk-v1` records or server-side raw file payloads,
 * rejects restore-only embedding records, applies deletion signaling, and delegates
 * embedding/upsert work to {@link Neo.ai.services.knowledge-base.VectorService}.
 *
 * The service returns a structured summary for both happy and error paths. Caller
 * errors are accumulated into `errors[]` so one bad file does not discard the
 * successful portion of a push, and fully failed pushes still return the contract
 * summary instead of throwing out of the facade boundary.
 *
 * @class Neo.ai.services.knowledge-base.KnowledgeBaseIngestionService
 * @extends Neo.core.Base
 * @singleton
 */
class KnowledgeBaseIngestionService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.services.knowledge-base.KnowledgeBaseIngestionService'
         * @protected
         */
        className: 'Neo.ai.services.knowledge-base.KnowledgeBaseIngestionService',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true,
        /**
         * @member {Object} chromaManager=ChromaManager
         * @summary Chroma collection manager. Injectable for deletion-signaling tests.
         */
        chromaManager: ChromaManager,
        /**
         * @member {Object} graphService=GraphService
         * @summary Native Edge Graph service backing the `KnowledgeBaseTenantConfig` node. Injectable for tests.
         */
        graphService: GraphService,
        /**
         * @member {Object} recorderService=KBRecorderService
         * @summary Best-effort ingestion telemetry sink.
         */
        recorderService: KBRecorderService,
        /**
         * @member {Object|null} revisionResolver=null
         * @summary Optional revision-boundary resolver used to derive deleted paths.
         */
        revisionResolver: null,
        /**
         * @member {Object} sourceRegistry=SourceRegistry
         * @summary Source/parser registry used by raw-file server-side parsing.
         */
        sourceRegistry: SourceRegistry,
        /**
         * @member {Object} requestContextService=RequestContextService
         * @summary Request-scoped identity source for tenant validation.
         */
        requestContextService: RequestContextService,
        /**
         * @member {Object} vectorService=VectorService
         * @summary Downstream embedding/upsert service.
         */
        vectorService: VectorService
    }

    /**
     * @member {Function|null} parsedChunkValidator=null
     * @protected
     */
    parsedChunkValidator = null

    /**
     * @summary Ingests raw or client-parsed source files into the Knowledge Base.
     *
     * @param {Object}  payload
     * @param {String} [payload.tenantId] Authenticated tenant id. Required when request
     *                                    context is active; offline calls fall back to `neo-shared`.
     * @param {Array}  [payload.files=[]] Raw file payloads or client-side parsed records.
     * @param {Array}  [payload.deleted=[]] Explicit tombstones (`{sourcePath, repoSlug?}`).
     * @param {Object} [payload.manifestSnapshot] Post-push manifest (`{repoSlug, pathsAfterPush}`).
     * @param {String} [payload.baseRevision] Previous revision boundary.
     * @param {String} [payload.headRevision] Current revision boundary.
     * @param {Boolean} [payload.viaMcp=true] Caller-selected work-volume-gate mode. Omitted
     *                                        or truthy values keep `VectorService.embed`
     *                                        MCP-safe. Explicit `false` (the `ai:ingest-tenant`
     *                                        bulk CLI path) bypasses the gate as an opt-in to
     *                                        long-running bulk work.
     * @returns {Promise<{ingested: Number, deleted: Number, embeddingsGenerated: Number, errors: Array, tenantId: String, durationMs: Number}>}
     */
    async ingestSourceFiles(payload = {}) {
        const startedAt = Date.now();
        const summary   = this.createSummary({startedAt});

        try {
            const tenantContext = this.resolveTenantContext(payload);
            summary.tenantId    = tenantContext.tenantId;

            // Resolve the active tenant-config version for chunk-metadata stamping.
            // Fail-soft: a graph read must never break an ingest, so a resolution failure degrades to 0.
            try {
                tenantContext.configVersion = (await this.getTenantConfig({tenantId: tenantContext.tenantId})).version;
            } catch {
                tenantContext.configVersion = 0;
            }

            if (!Array.isArray(payload.files)) {
                summary.errors.push(this.createError({
                    code   : 'KB_INGEST_FILES_INVALID',
                    message: '`files` must be an array.'
                }));
            }

            const files            = Array.isArray(payload.files) ? payload.files : [];
            const chunks           = await this.collectParsedChunks({files, tenantContext, summary});
            const embeddableChunks = this.filterEmbeddingInputBudget({chunks, tenantContext, summary});

            summary.deleted = await this.applyDeletionSignals({
                deleted         : payload.deleted,
                manifestSnapshot: payload.manifestSnapshot,
                baseRevision    : payload.baseRevision,
                headRevision    : payload.headRevision,
                tenantContext,
                summary
            });

            if (embeddableChunks.length > 0) {
                await this.embedChunkGroups({
                    chunks: embeddableChunks,
                    tenantContext,
                    summary,
                    viaMcp: payload.viaMcp !== false
                });
            }

            summary.ingested   = embeddableChunks.length;
            summary.durationMs = Date.now() - startedAt;

            await this.persistManifestSnapshot({
                manifestSnapshot: payload.manifestSnapshot,
                tenantContext,
                summary
            });

            this.recordMetric(summary, tenantContext);
            return summary;
        } catch (error) {
            summary.errors.push(this.createError({code: error.code || 'KB_INGEST_FAILED', message: error.message}));
            summary.durationMs = Date.now() - startedAt;
            this.recordMetric(summary, {
                tenantId: summary.tenantId || aiConfig.defaultTenantId,
                repoSlug: aiConfig.defaultRepoSlug
            });
            return summary;
        }
    }

    /**
     * @summary Applies explicit tombstone, manifest, and revision-boundary delete signals.
     * @param {Object} options
     * @returns {Promise<Number>} Deleted Chroma row count.
     * @protected
     */
    async applyDeletionSignals({deleted = [], manifestSnapshot, baseRevision, headRevision, tenantContext, summary}) {
        const tombstones = [];

        if (Array.isArray(deleted)) {
            tombstones.push(...deleted);
        } else if (deleted != null) {
            summary.errors.push(this.createError({
                code   : 'KB_DELETE_SIGNAL_INVALID',
                message: '`deleted` must be an array when provided.'
            }));
        }

        if (baseRevision || headRevision) {
            tombstones.push(...await this.resolveRevisionTombstones({
                baseRevision,
                headRevision,
                tenantContext,
                summary
            }));
        }

        const collection = await this.chromaManager.getKnowledgeBaseCollection();
        const ids        = new Set();

        if (tombstones.length > 0) {
            const rows = await this.getTenantRows(collection, tenantContext.tenantId);

            for (const tombstone of tombstones) {
                if (!tombstone?.sourcePath) {
                    summary.errors.push(this.createError({
                        code   : 'KB_TOMBSTONE_INVALID',
                        message: 'Tombstone entries require `sourcePath`.',
                        details: {tombstone}
                    }));
                    continue;
                }

                const repoSlug = tombstone.repoSlug || tenantContext.repoSlug;
                rows
                    .filter(row => row.metadata.repoSlug === repoSlug && row.metadata.sourcePath === tombstone.sourcePath)
                    .forEach(row => ids.add(row.id));
            }
        }

        const normalizedManifest = this.normalizeManifestSnapshot({manifestSnapshot, tenantContext, summary});

        if (normalizedManifest) {
            const livePaths = new Set(normalizedManifest.pathsAfterPush);
            const rows      = await this.getTenantRows(collection, tenantContext.tenantId);

            rows
                .filter(row => row.metadata.repoSlug === normalizedManifest.repoSlug && !livePaths.has(row.metadata.sourcePath))
                .forEach(row => ids.add(row.id));
        }

        if (ids.size === 0) return 0;

        await collection.delete({ids: Array.from(ids)});
        return ids.size;
    }

    /**
     * @summary Groups parsed chunks by repoSlug and routes each group to VectorService.embed().
     * @param {Object}  options
     * @param {Boolean} [options.viaMcp=true] Forwarded to `VectorService.embed`; `true` keeps
     *                                        the MCP work-volume gate, `false` (bulk CLI)
     *                                        bypasses it.
     * @returns {Promise<void>}
     * @protected
     */
    async embedChunkGroups({chunks, tenantContext, summary, viaMcp = true}) {
        const groups = new Map();

        for (const chunk of chunks) {
            const repoSlug = chunk.repoSlug || tenantContext.repoSlug;
            if (!groups.has(repoSlug)) {
                groups.set(repoSlug, []);
            }
            groups.get(repoSlug).push(chunk);
        }

        for (const [repoSlug, group] of groups.entries()) {
            const tempFile = await this.writeTempJsonl(group);

            try {
                const result = await this.vectorService.embed(tempFile, {
                    deleteStale  : false,
                    tenantContext: {...tenantContext, repoSlug},
                    viaMcp
                });

                if (result?.error) {
                    summary.errors.push(this.createError({
                        code   : result.code || 'KB_VECTOR_EMBED_FAILED',
                        message: result.message || result.error,
                        details: result
                    }));
                    continue;
                }

                summary.embeddingsGenerated += result?.embedded ?? group.length;
            } catch (error) {
                summary.errors.push(this.createError({
                    code   : error.code || 'KB_VECTOR_EMBED_FAILED',
                    message: error.message,
                    details: {repoSlug}
                }));
            } finally {
                await fs.remove(tempFile);
            }
        }
    }

    /**
     * @summary Collects and validates parsed chunks from the file payload.
     * @param {Object} options
     * @returns {Promise<Array<Object>>}
     * @protected
     */
    async collectParsedChunks({files, tenantContext, summary}) {
        const chunks = [];

        for (let fileIndex = 0; fileIndex < files.length; fileIndex++) {
            const file = files[fileIndex];

            try {
                const parsed = await this.resolveFileChunks({file, fileIndex, tenantContext});

                for (let chunkIndex = 0; chunkIndex < parsed.length; chunkIndex++) {
                    const record     = parsed[chunkIndex];
                    const normalized = await this.validateAndNormalizeParsedChunk({
                        record,
                        fileIndex,
                        chunkIndex,
                        tenantContext,
                        summary
                    });

                    if (normalized) {
                        chunks.push(normalized);
                    }
                }
            } catch (error) {
                summary.errors.push(this.createError({
                    code   : error.code || 'KB_FILE_PARSE_FAILED',
                    message: error.message,
                    details: {fileIndex, sourcePath: file?.sourcePath}
                }));
            }
        }

        return chunks;
    }

    /**
     * @summary Builds a structured error entry for the ingestion summary.
     * @param {Object} options
     * @returns {Object}
     * @protected
     */
    createError({code, message, details}) {
        return {
            code,
            message,
            ...(details === undefined ? {} : {details})
        };
    }

    /**
     * @summary Creates an empty ingestion summary.
     * @param {Object} options
     * @returns {Object}
     * @protected
     */
    createSummary({startedAt}) {
        return {
            ingested           : 0,
            deleted            : 0,
            embeddingsGenerated: 0,
            skippedOversized   : 0,
            errors             : [],
            tenantId           : aiConfig.defaultTenantId,
            durationMs         : Date.now() - startedAt
        };
    }

    /**
     * @summary Creates the deterministic pre-vector content hash for a parsed chunk.
     * @param {Object} record Parsed chunk.
     * @param {Object} tenantContext Authoritative tenant context.
     * @returns {String}
     * @protected
     */
    createChunkHash(record, tenantContext) {
        const values = {
            tenantId: tenantContext.tenantId,
            repoSlug: record.repoSlug || tenantContext.repoSlug
        };

        for (const field of record.hashInputs) {
            values[field] = record[field];
        }

        return crypto.createHash('sha256').update(JSON.stringify(values)).digest('hex');
    }

    /**
     * @summary Retrieves all Knowledge Base rows visible for a tenant from Chroma.
     * @param {Object} collection Chroma collection.
     * @param {String} tenantId Tenant id.
     * @returns {Promise<Array<{id: String, metadata: Object}>>}
     * @protected
     */
    async getTenantRows(collection, tenantId) {
        const rows   = [];
        const limit  = 2000;
        let   offset = 0;
        let batch;

        do {
            batch = await collection.get({
                include: ['metadatas'],
                limit,
                offset,
                where  : {tenantId}
            });

            for (let i = 0; i < (batch.ids?.length || 0); i++) {
                rows.push({
                    id      : batch.ids[i],
                    metadata: batch.metadatas?.[i] || {}
                });
            }

            offset += limit;
        } while ((batch.ids?.length || 0) === limit);

        return rows;
    }

    /**
     * @summary Reads the persisted claimed-state manifests for one tenant.
     *
     * The sibling `kb-manifest:<tenantId>` graph node stores push-manifest state outside
     * `KnowledgeBaseTenantConfig`: config `version` is the staleness signal and must not
     * increment on routine pushes. Missing or RLS-hidden nodes resolve to an empty map so
     * reconciliation never actions rows without a claimed baseline.
     *
     * @param {Object}  data
     * @param {String} [data.tenantId] Tenant id.
     * @returns {Promise<Object<String, {repoSlug: String, pathsAfterPush: Array<String>, updatedAt: Number}>>}
     */
    async getTenantManifests({tenantId} = {}) {
        const {tenantId: resolvedTenant} = this.resolveTenantContext({tenantId});

        await this.graphService.initAsync();

        const record = this.graphService.getNodeRecord({id: `kb-manifest:${resolvedTenant}`}),
              source = record?.properties?.manifests;

        if (!source || typeof source !== 'object' || Array.isArray(source)) {
            return {};
        }

        return Object.fromEntries(Object.entries(source)
            .map(([repoSlug, manifest]) => {
                const paths = this.normalizeManifestPaths(manifest?.pathsAfterPush);
                return paths ? [repoSlug, {repoSlug, pathsAfterPush: paths, updatedAt: manifest.updatedAt || 0}] : null;
            })
            .filter(Boolean));
    }

    /**
     * @summary Reads one persisted tenant/repo claimed-state manifest.
     * @param {Object} data
     * @param {String} data.tenantId Tenant id.
     * @param {String} data.repoSlug Repo slug.
     * @returns {Promise<{tenantId: String, repoSlug: String, source: String, pathsAfterPush: Array<String>, updatedAt: Number}>}
     */
    async getTenantManifest({tenantId, repoSlug} = {}) {
        const {tenantId: resolvedTenant, repoSlug: resolvedRepo} = this.resolveTenantContext({tenantId, repoSlug});
        const manifests                                          = await this.getTenantManifests({tenantId: resolvedTenant});
        const manifest                                           = manifests[resolvedRepo];

        return {
            tenantId      : resolvedTenant,
            repoSlug      : resolvedRepo,
            source        : manifest ? 'graph' : 'empty',
            pathsAfterPush: manifest?.pathsAfterPush || [],
            updatedAt     : manifest?.updatedAt || 0
        };
    }

    /**
     * @summary Persists one repo's post-push claimed-state manifest without bumping config version.
     *
     * RLS: writes still pass through {@link resolveTenantContext}. `GraphService.upsertNode`
     * stamps `properties.userId` when a request-scoped identity is active, while
     * `GraphService.getNodeRecord` exposes ownerless, owned, shared, or `visibility:'team'`
     * nodes. Manifest writes can originate from request-authored ingestion pushes and are later
     * read by the offline reconciliation daemon with no request context, so `visibility:'team'`
     * is the explicit shared-read marker for this sibling node.
     *
     * @param {Object} data
     * @param {String} data.tenantId Tenant id.
     * @param {String} data.repoSlug Repo slug.
     * @param {Array<String>} data.pathsAfterPush Post-push source-path set.
     * @returns {Promise<{tenantId: String, repoSlug: String, pathsAfterPush: Array<String>, updatedAt: Number}|{error: String, code: String, message: String}>}
     */
    async setTenantManifest({tenantId, repoSlug, pathsAfterPush} = {}) {
        try {
            const tenantContext = this.resolveTenantContext({tenantId, repoSlug}),
                  paths         = this.normalizeManifestPaths(pathsAfterPush);

            if (!paths) {
                return {
                    error  : 'Tenant manifest write failed',
                    code   : 'KB_TENANT_MANIFEST_INVALID',
                    message: '`pathsAfterPush` must be an array.'
                };
            }

            await this.graphService.initAsync();

            const nodeId    = `kb-manifest:${tenantContext.tenantId}`,
                  existing  = this.graphService.getNodeRecord({id: nodeId}),
                  manifests = {...(existing?.properties?.manifests || {})},
                  updatedAt = Date.now();

            manifests[tenantContext.repoSlug] = {
                repoSlug      : tenantContext.repoSlug,
                pathsAfterPush: paths,
                updatedAt
            };

            await this.graphService.upsertNode({
                id        : nodeId,
                type      : 'KnowledgeBaseTenantManifest',
                properties: {
                    tenantId  : tenantContext.tenantId,
                    manifests,
                    updatedAt,
                    visibility: 'team'
                }
            });

            return {tenantId: tenantContext.tenantId, repoSlug: tenantContext.repoSlug, pathsAfterPush: paths, updatedAt};
        } catch (error) {
            return {
                error  : 'Tenant manifest write failed',
                code   : error.code || 'KB_TENANT_MANIFEST_WRITE_FAILED',
                message: error.message
            };
        }
    }

    /**
     * @summary Best-effort persistence hook for the push manifest already consumed by deletion signaling.
     * @param {Object} options
     * @returns {Promise<void>}
     * @protected
     */
    async persistManifestSnapshot({manifestSnapshot, tenantContext, summary}) {
        const normalized = this.normalizeManifestSnapshot({manifestSnapshot, tenantContext});

        if (!normalized) {
            return;
        }

        const result = await this.setTenantManifest({
            tenantId      : tenantContext.tenantId,
            repoSlug      : normalized.repoSlug,
            pathsAfterPush: normalized.pathsAfterPush
        });

        if (result?.error) {
            summary.errors.push(this.createError({
                code   : result.code,
                message: result.message
            }));
        }
    }

    /**
     * @summary Normalizes a caller-provided manifest snapshot into deterministic repo/path-set form.
     * @param {Object} options
     * @returns {{repoSlug: String, pathsAfterPush: Array<String>}|null}
     * @protected
     */
    normalizeManifestSnapshot({manifestSnapshot, tenantContext, summary}) {
        if (!manifestSnapshot) {
            return null;
        }

        const pathsAfterPush = this.normalizeManifestPaths(manifestSnapshot.pathsAfterPush);

        if (!pathsAfterPush) {
            summary?.errors.push(this.createError({
                code   : 'KB_MANIFEST_INVALID',
                message: '`manifestSnapshot.pathsAfterPush` must be an array.'
            }));
            return null;
        }

        return {
            repoSlug: manifestSnapshot.repoSlug || tenantContext.repoSlug,
            pathsAfterPush
        };
    }

    /**
     * @summary Converts a manifest path array into a stable unique string set.
     * @param {*} pathsAfterPush Raw manifest path list.
     * @returns {Array<String>|null}
     * @protected
     */
    normalizeManifestPaths(pathsAfterPush) {
        if (!Array.isArray(pathsAfterPush)) {
            return null;
        }

        return [...new Set(pathsAfterPush.filter(path => typeof path === 'string' && path.length > 0))].sort();
    }

    /**
     * @summary Lazily compiles the parsed-chunk-v1 JSON schema validator.
     * @returns {Promise<Function>}
     * @protected
     */
    async getParsedChunkValidator() {
        if (!this.parsedChunkValidator) {
            const schema = await fs.readJson(PARSED_CHUNK_SCHEMA_PATH);
            const ajv    = new Ajv2020({allErrors: true, strict: false});

            this.parsedChunkValidator = ajv.compile(schema);
        }

        return this.parsedChunkValidator;
    }

    /**
     * @summary Records best-effort ingestion telemetry without affecting the caller path.
     * @param {Object} summary Ingestion summary.
     * @param {Object} tenantContext Tenant context.
     * @returns {void}
     * @protected
     */
    recordMetric(summary, tenantContext) {
        this.recorderService.recordIngestionMetric?.({
            tenantId           : tenantContext.tenantId,
            repoSlug           : tenantContext.repoSlug,
            originAgentIdentity: tenantContext.originAgentIdentity,
            eventType          : this.resolveMetricEventType(summary),
            chunksTotal        : summary.ingested + summary.skippedOversized,
            chunksEmbedded     : summary.embeddingsGenerated,
            chunksDeleted      : summary.deleted,
            durationMs         : summary.durationMs,
            errorCode          : summary.errors[0]?.code,
            detail             : summary.errors.length > 0 ? {errors: summary.errors} : undefined
        });
    }

    /**
     * @summary Resolves the local embedding input-budget guardrail for ingestion diagnostics.
     * @returns {{enabled: Boolean, embeddingProvider: String, contextLimitTokens: Number, safeProcessingLimitTokens: Number, model: String}}
     * @protected
     */
    resolveEmbeddingInputGuardrail() {
        const embeddingProvider         = mcConfig.embeddingProvider;
        const contextLimitTokens        = Number(aiConfig.localModels.embedding.contextLimitTokens);
        const safeProcessingLimitTokens = Number(aiConfig.localModels.embedding.safeProcessingLimitTokens);
        const model                     = embeddingProvider === 'ollama'
            ? aiConfig.ollama.embeddingModel
            : embeddingProvider === 'openAiCompatible'
                ? aiConfig.openAiCompatible.embeddingModel
                : embeddingProvider;

        return {
            enabled: LOCAL_EMBEDDING_PROVIDERS.has(embeddingProvider),
            embeddingProvider,
            contextLimitTokens,
            safeProcessingLimitTokens,
            model
        };
    }

    /**
     * @summary Builds the provider input string using the same shape as `VectorService.embedChunks`.
     * @param {Object} chunk Normalized parsed chunk.
     * @returns {String}
     * @protected
     */
    buildEmbeddingInputText(chunk) {
        return `${chunk.type}: ${chunk.name} in ${chunk.className || ''}\n${chunk.description || chunk.content || ''}`;
    }

    /**
     * @summary Drops local-provider oversized chunks before writing the VectorService temp JSONL.
     *
     * `VectorService` remains the final safety net, but doing the same bounded check here
     * gives ingestion callers and daemon diagnostics a durable skip signal even when no
     * graph row can be written for the offending source file.
     *
     * @param {Object} options
     * @param {Array<Object>} options.chunks Normalized parsed chunks.
     * @param {Object} options.tenantContext Server-resolved tenant context.
     * @param {Object} options.summary Mutable ingestion summary.
     * @returns {Array<Object>} Chunks safe to send to VectorService.
     * @protected
     */
    filterEmbeddingInputBudget({chunks, tenantContext, summary}) {
        const guardrail = this.resolveEmbeddingInputGuardrail();

        if (!guardrail.enabled) {
            return chunks;
        }

        const embeddable = [];

        for (const chunk of chunks) {
            const budget = this.evaluateEmbeddingInputBudget(chunk, guardrail);

            if (!budget.skip) {
                embeddable.push(chunk);
                continue;
            }

            const splitChunks = this.splitOversizedEmbeddingChunk({chunk, guardrail, tenantContext});

            if (splitChunks.length <= 1) {
                this.recordOversizedEmbeddingSkip({
                    chunk,
                    guardrail,
                    summary,
                    tenantContext,
                    ...budget
                });
                continue;
            }

            for (const splitChunk of splitChunks) {
                const splitBudget = this.evaluateEmbeddingInputBudget(splitChunk, guardrail);

                if (!splitBudget.skip) {
                    embeddable.push(splitChunk);
                    continue;
                }

                this.recordOversizedEmbeddingSkip({
                    chunk: splitChunk,
                    guardrail,
                    summary,
                    tenantContext,
                    ...splitBudget
                });
            }
        }

        return embeddable;
    }

    /**
     * @summary Evaluates the final embedding input shape against the local provider budget.
     * @param {Object} chunk Normalized parsed chunk.
     * @param {Object} guardrail Local embedding guardrail.
     * @returns {{skip: Boolean, inputBytes: Number, inputTokensEstimate: Number}}
     * @protected
     */
    evaluateEmbeddingInputBudget(chunk, guardrail) {
        const text                = this.buildEmbeddingInputText(chunk),
              inputBytes          = Buffer.byteLength(text, 'utf8'),
              inputTokensEstimate = bytesToTokens(inputBytes);

        return {
            skip: inputTokensEstimate > guardrail.safeProcessingLimitTokens,
            inputBytes,
            inputTokensEstimate
        };
    }

    /**
     * @summary Splits a recoverable oversized text chunk into deterministic embedding-safe sub-chunks.
     * @param {Object} options
     * @returns {Object[]} Either multiple sub-chunks or the original chunk when no safe split is possible.
     * @protected
     */
    splitOversizedEmbeddingChunk({chunk, guardrail, tenantContext}) {
        const content = chunk.content || chunk.description;

        if (typeof content !== 'string' || content.length === 0) {
            return [chunk];
        }

        const maxInputBytes = Math.max(1, guardrail.safeProcessingLimitTokens * 3),
              prefixBytes   = Buffer.byteLength(`${chunk.type}: ${chunk.name} in ${chunk.className || ''}\n`, 'utf8'),
              maxContentBytes = Math.max(1, maxInputBytes - prefixBytes - 128),
              parts = this.splitTextByByteBudget(content, maxContentBytes);

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
                      name         : `${chunk.name} [part ${index + 1}/${parts.length}]`,
                      hashInputs   : Array.from(new Set([
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

            charStart = charEnd;

            const hash = this.createChunkHash(child, tenantContext);

            child.hash = hash;
            child.id   = hash;

            return child;
        });
    }

    /**
     * @summary Splits text on stable line boundaries, falling back to character slices for single huge lines.
     * @param {String} text Source text.
     * @param {Number} maxBytes Maximum byte size per returned part.
     * @returns {String[]}
     * @protected
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
     * @summary Splits one oversized line without breaking JavaScript surrogate pairs.
     * @param {String} value Source string.
     * @param {Number} maxBytes Maximum byte size per part.
     * @returns {String[]}
     * @protected
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
     * @summary Records a bounded oversized-ingestion diagnostic without exposing raw content.
     * @param {Object} options
     * @returns {void}
     * @protected
     */
    recordOversizedEmbeddingSkip({chunk, guardrail, inputBytes, inputTokensEstimate, summary, tenantContext}) {
        const details = {
            tenantId                 : tenantContext.tenantId,
            repoSlug                 : chunk.repoSlug || tenantContext.repoSlug,
            sourcePath               : chunk.sourcePath || chunk.source || chunk.name,
            parserId                 : chunk.parserId,
            parserVersion            : chunk.parserVersion,
            kind                     : chunk.kind || chunk.type,
            inputBytes,
            inputTokensEstimate,
            contextLimitTokens       : guardrail.contextLimitTokens,
            safeProcessingLimitTokens: guardrail.safeProcessingLimitTokens,
            embeddingProvider        : guardrail.embeddingProvider,
            model                    : guardrail.model
        };

        summary.skippedOversized++;
        summary.errors.push(this.createError({
            code   : 'KB_INGEST_INPUT_SIZE_EXCEEDED',
            message: `KB ingestion chunk '${details.sourcePath}' exceeds the local embedding safe-processing band and was skipped before provider invocation.`,
            details
        }));

        emitConsumerFriction({
            assetRef                 : `${details.tenantId}:${details.repoSlug}:${details.sourcePath}`,
            consumer                 : 'KnowledgeBaseIngestionService.ingestSourceFiles',
            model                    : guardrail.model,
            symptom                  : 'size-precheck-skip',
            emissionPoint            : 'pre-invocation',
            suggestionKind           : 'split-document',
            inputBytes,
            inputTokensEstimate,
            contextLimitTokens       : guardrail.contextLimitTokens,
            safeProcessingLimitTokens: guardrail.safeProcessingLimitTokens,
            serviceDomain            : 'other',
            note                     : 'KB ingestion chunk exceeds local embedding safe-processing band; add parser chunking or skip this source file.'
        });

        logger.warn('[KnowledgeBaseIngestionService] Skipping oversized ingestion chunk before embedding.', details);
    }

    /**
     * @summary Resolves raw file payloads into parsed-chunk-v1 records.
     * @param {Object} options
     * @returns {Promise<Array<Object>>}
     * @protected
     */
    async resolveFileChunks({file, fileIndex, tenantContext}) {
        if (file?.schemaVersion === '1.0.0') {
            return [file];
        }

        if (Array.isArray(file?.parsedChunks)) {
            return file.parsedChunks;
        }

        if (Array.isArray(file?.chunks)) {
            return file.chunks;
        }

        if (typeof file?.content !== 'string') {
            const error = new Error('File payload requires `parsedChunks`, `chunks`, a parsed-chunk-v1 record, or string `content`.');
            error.code  = 'KB_FILE_PAYLOAD_INVALID';
            throw error;
        }

        const parserId = file.parserId || 'raw-text';
        const parser   = this.resolveParser(parserId);

        if (file.parserId && !parser) {
            const error = new Error(`Parser '${file.parserId}' is not registered.`);
            error.code  = 'KB_PARSER_NOT_REGISTERED';
            throw error;
        }

        if (parser?.parseIngestionFile) {
            return await parser.parseIngestionFile(file, {tenantContext});
        }

        if (parser?.parse) {
            const legacyChunks = await parser.parse(file.content, file.sourcePath, file.type || 'external-source', file.hierarchy || {});

            return legacyChunks.map(chunk => this.legacyChunkToParsedRecord({
                chunk,
                file,
                parserId,
                tenantContext
            }));
        }

        return [this.rawFileToParsedRecord({file, fileIndex, parserId, tenantContext})];
    }

    /**
     * @summary Resolves a parser instance by parser id from SourceRegistry.
     * @param {String} parserId Parser registry id.
     * @returns {Object|null}
     * @protected
     */
    resolveParser(parserId) {
        const ids     = this.sourceRegistry.getParserIds?.() || [];
        const parsers = this.sourceRegistry.getParsers?.() || [];
        const index   = ids.indexOf(parserId);

        return index === -1 ? null : parsers[index];
    }

    /**
     * @summary Resolves revision-boundary tombstones via an injected resolver.
     * @param {Object} options
     * @returns {Promise<Array<Object>>}
     * @protected
     */
    async resolveRevisionTombstones({baseRevision, headRevision, tenantContext, summary}) {
        if (!baseRevision) {
            return [];
        }

        if (!headRevision) {
            summary.errors.push(this.createError({
                code   : 'KB_REVISION_BOUNDARY_INVALID',
                message: '`headRevision` is required when `baseRevision` is provided.'
            }));
            return [];
        }

        if (!this.revisionResolver?.resolveDeletedPaths) {
            summary.errors.push(this.createError({
                code   : 'KB_REVISION_BOUNDARY_UNAVAILABLE',
                message: 'Revision-boundary deletion requires Phase 2E tenant config storage / resolver (#11637).'
            }));
            return [];
        }

        const resolved = await this.revisionResolver.resolveDeletedPaths({
            baseRevision,
            headRevision,
            tenantContext
        });

        return Array.isArray(resolved) ? resolved : [];
    }

    /**
     * @summary Resolves the authoritative tenant context for the ingest call.
     * @param {Object} payload Ingestion payload.
     * @returns {{tenantId: String, repoSlug: String, visibility: String, originAgentIdentity: String|undefined}}
     * @protected
     */
    resolveTenantContext(payload = {}) {
        const activeTenant    = normalizeUserId(this.requestContextService.getUserId?.());
        const requestedTenant = normalizeUserId(payload.tenantId);

        if (activeTenant && requestedTenant && activeTenant !== requestedTenant) {
            const error = new Error(`Tenant '${requestedTenant}' does not match authenticated tenant '${activeTenant}'.`);
            error.code  = 'KB_INGEST_TENANT_MISMATCH';
            throw error;
        }

        const tenantId = activeTenant || requestedTenant || aiConfig.defaultTenantId;

        return {
            tenantId,
            repoSlug           : payload.repoSlug || this.resolvePayloadRepoSlug(payload) || aiConfig.defaultRepoSlug,
            visibility         : payload.visibility || aiConfig.defaultVisibility,
            originAgentIdentity: this.requestContextService.getAgentIdentityNodeId?.() || payload.originAgentIdentity
        };
    }

    /**
     * @summary Finds a repoSlug in the payload when the caller omitted a top-level value.
     * @param {Object} payload Ingestion payload.
     * @returns {String|undefined}
     * @protected
     */
    resolvePayloadRepoSlug(payload = {}) {
        const files = Array.isArray(payload.files) ? payload.files : [];

        for (const file of files) {
            if (file?.repoSlug) return file.repoSlug;
            const firstChunk = file?.schemaVersion === '1.0.0'
                ? file
                : file?.parsedChunks?.[0] || file?.chunks?.[0];
            if (firstChunk?.repoSlug) return firstChunk.repoSlug;
        }
    }

    /**
     * @summary Resolves a tenant's Knowledge Base ingestion config.
     *
     * Three-tier resolution: the `KnowledgeBaseTenantConfig` graph node (`kb-config:<tenantId>`) →
     * the `kb-config.yaml` deployment bootstrap → the default source/parser registry from `aiConfig`.
     * @param {Object}  data
     * @param {String} [data.tenantId] Tenant id; normalized, defaults to `aiConfig.defaultTenantId`.
     * @returns {Promise<{tenantId: String, source: String, version: Number, useDefaultSources: Boolean, rawRepoSource: Boolean, useDefaultParsers: Boolean, customSources: Array, customParsers: Array, sourcePaths: Object}>}
     */
    async getTenantConfig({tenantId} = {}) {
        const resolvedTenant = normalizeUserId(tenantId) || aiConfig.defaultTenantId;

        await this.graphService.initAsync();

        const record = this.graphService.getNodeRecord({id: `kb-config:${resolvedTenant}`});

        if (record?.properties) {
            const p = record.properties;
            return {
                tenantId         : resolvedTenant,
                source           : 'graph',
                version          : p.version || 0,
                useDefaultSources: p.useDefaultSources !== false,
                rawRepoSource    : p.rawRepoSource === true,
                useDefaultParsers: p.useDefaultParsers !== false,
                customSources    : p.customSources || [],
                customParsers    : p.customParsers || [],
                sourcePaths      : p.sourcePaths    || {},
                tenantRepos      : p.tenantRepos    || []
            };
        }

        // Tier 2 — kb-config.yaml deployment bootstrap (first-deploy convenience; the graph node is canonical).
        const bootstrap = this.readKbConfigBootstrap()?.tenants?.[resolvedTenant];

        if (bootstrap) {
            const normalizedBootstrap = normalizeTenantRepoConfig(bootstrap);

            return {
                tenantId         : resolvedTenant,
                source           : 'yaml',
                version          : 0,
                useDefaultSources: normalizedBootstrap.useDefaultSources !== false,
                rawRepoSource    : normalizedBootstrap.rawRepoSource === true,
                useDefaultParsers: normalizedBootstrap.useDefaultParsers !== false,
                customSources    : normalizedBootstrap.customSources || [],
                customParsers    : normalizedBootstrap.customParsers || [],
                sourcePaths      : normalizedBootstrap.sourcePaths    || {},
                tenantRepos      : normalizedBootstrap.tenantRepos    || []
            };
        }

        // Tier 3 — default source/parser registry.
        const normalizedAiConfig = normalizeTenantRepoConfig(aiConfig);

        return {
            tenantId         : resolvedTenant,
            source           : 'default',
            version          : 0,
            useDefaultSources: normalizedAiConfig.useDefaultSources !== false,
            rawRepoSource    : normalizedAiConfig.rawRepoSource === true,
            useDefaultParsers: normalizedAiConfig.useDefaultParsers !== false,
            customSources    : normalizedAiConfig.customSources || [],
            customParsers    : normalizedAiConfig.customParsers || [],
            sourcePaths      : normalizedAiConfig.sourcePaths    || {},
            tenantRepos      : normalizedAiConfig.tenantRepos    || []
        };
    }

    /**
     * @summary Reads the optional `kb-config.yaml` deployment bootstrap, fail-soft.
     *
     * The bootstrap is a deployment-root first-deploy convenience (`{tenants: {<tenantId>: {...}}}`);
     * the `KnowledgeBaseTenantConfig` graph node remains the canonical store. A missing or malformed
     * file resolves to `null` so `getTenantConfig` falls through to the default registry rather than
     * throwing.
     * @returns {Object|null} The parsed bootstrap document, or `null` when absent / unreadable.
     * @protected
     */
    readKbConfigBootstrap() {
        try {
            const bootstrapPath = path.join(aiConfig.neoRootDir, 'kb-config.yaml');

            if (!fs.existsSync(bootstrapPath)) {
                return null;
            }

            return yaml.load(fs.readFileSync(bootstrapPath, 'utf8')) || null;
        } catch {
            return null;
        }
    }

    /**
     * @summary Enumerates every configured tenant's effective `tenantRepos`, flattened across tenants.
     *
     * The pull-mode sync lane (`TenantRepoSyncService`) needs the union of all tenants' polling
     * configs. Resolution is per-tenant single-winner across the same tiers as `getTenantConfig` —
     * graph node (`kb-config:<tenantId>`) > `kb-config.yaml` bootstrap > `aiConfig.tenantRepos[]`
     * default — then flattened. A tenant's highest present tier wins WHOLESALE; tiers are never
     * merged within a tenant (that would be a deliberate `getTenantConfig` semantics change).
     *
     * RLS: graph-tier reads go through `GraphService.getNodeRecord` — the same RLS-respecting path
     * `getTenantConfig` uses, never a raw node scan. `kb-config:*` nodes carry `visibility:'team'`,
     * so the context-less orchestrator resolves them while per-tenant ownership isolation is preserved.
     *
     * The tenant set is derived from the keyed tiers: `kb-config.yaml` `tenants.*` keys plus the
     * distinct `tenantId`s in `aiConfig.tenantRepos[]`. A tenant configured ONLY via a graph node
     * (no yaml / aiConfig entry) is out of scope until a `setTenantConfig` operator tool exists.
     * @returns {Promise<{tenantRepos: Array<Object>}>} Contract-normalized; throws on a malformed entry.
     */
    async listConfiguredTenantRepos() {
        await this.graphService.initAsync();

        const bootstrap    = this.readKbConfigBootstrap(),
              yamlTenants  = (bootstrap && bootstrap.tenants) || {},
              defaultRepos = Array.isArray(aiConfig.tenantRepos) ? aiConfig.tenantRepos : [],
              tenantIds    = new Set();

        Object.keys(yamlTenants).forEach(key => tenantIds.add(key));
        defaultRepos.forEach(entry => {
            const id = entry && entry.tenantId;
            if (id) tenantIds.add(normalizeUserId(id) || id);
        });

        const effective = [];

        for (const tenantId of tenantIds) {
            const graphRecord = this.graphService.getNodeRecord({id: `kb-config:${tenantId}`}),
                  yamlEntry   = yamlTenants[tenantId];

            // Tier winner is chosen by tier PRESENCE (matching getTenantConfig), NOT by a
            // non-empty array: a graph record / yaml entry that declares `tenantRepos: []`
            // intentionally means "no repos for this tenant" and MUST suppress lower tiers
            // wholesale — selecting on `length > 0` would leak lower-tier repos through.
            let repos;

            if (graphRecord?.properties) {
                repos = graphRecord.properties.tenantRepos || [];
            } else if (yamlEntry) {
                repos = yamlEntry.tenantRepos || [];
            } else {
                repos = defaultRepos.filter(entry => (normalizeUserId(entry.tenantId) || entry.tenantId) === tenantId);
            }

            repos.forEach(repo => effective.push(repo.tenantId ? repo : {...repo, tenantId}));
        }

        return normalizeTenantRepoConfig({tenantRepos: effective});
    }

    /**
     * @summary Persists a tenant's Knowledge Base ingestion config as a versioned graph node.
     *
     * Writes the `KnowledgeBaseTenantConfig` node (`kb-config:<tenantId>`); `version` increments on
     * each mutation. RLS — two distinct layers:
     * - **Write gate:** `resolveTenantContext` rejects a caller mutating another tenant's config
     *   (`KB_INGEST_TENANT_MISMATCH`). The explicit gate is required because `GraphService.upsertNode`
     *   auto-stamps the *caller's* identity onto `properties.userId` — an un-gated cross-tenant write
     *   would silently re-own the node rather than be rejected.
     * - **Read visibility:** the node is marked `visibility:'team'` so the offline KB
     *   reconciliation daemon — which reads `getTenantConfig` with no request context — can
     *   resolve it. `GraphService.getNodeRecord` exposes only ownerless / owner-matched /
     *   shared / `visibility:'team'` nodes; a request-authored (`userId`-stamped) config node
     *   without this marker is invisible to the daemon, silently degrading config-staleness
     *   detection to the default tier. Mirrors the `kb-manifest:<tenantId>` sibling node.
     * @param {Object} data
     * @param {String} data.tenantId Tenant id.
     * @param {Object} [data.config={}] Config payload — `useDefaultSources` / `rawRepoSource` /
     *                                  `useDefaultParsers` / `customSources` / `customParsers` /
     *                                  `sourcePaths`.
     * @returns {Promise<{tenantId: String, version: Number}|{error: String, code: String, message: String}>}
     */
    async setTenantConfig({tenantId, config = {}} = {}) {
        try {
            const {tenantId: resolvedTenant} = this.resolveTenantContext({tenantId}),
                  normalizedConfig           = normalizeTenantRepoConfig(config);

            await this.graphService.initAsync();

            const nodeId   = `kb-config:${resolvedTenant}`,
                  existing = this.graphService.getNodeRecord({id: nodeId}),
                  version  = (existing?.properties?.version || 0) + 1;

            await this.graphService.upsertNode({
                id        : nodeId,
                type      : 'KnowledgeBaseTenantConfig',
                properties: {
                    tenantId         : resolvedTenant,
                    useDefaultSources: normalizedConfig.useDefaultSources !== false,
                    rawRepoSource    : normalizedConfig.rawRepoSource === true,
                    useDefaultParsers: normalizedConfig.useDefaultParsers !== false,
                    customSources    : normalizedConfig.customSources || [],
                    customParsers    : normalizedConfig.customParsers || [],
                    sourcePaths      : normalizedConfig.sourcePaths    || {},
                    tenantRepos      : normalizedConfig.tenantRepos    || [],
                    version,
                    visibility       : 'team'
                }
            });

            return {tenantId: resolvedTenant, version};
        } catch (error) {
            return {
                error  : 'Tenant config write failed',
                code   : error.code || 'KB_TENANT_CONFIG_WRITE_FAILED',
                message: error.message
            };
        }
    }

    /**
     * @summary Maps the ingestion summary to the existing KB telemetry event taxonomy.
     * @param {Object} summary Ingestion summary.
     * @returns {'ingest'|'tombstone'|'reconcile'|'error'}
     * @protected
     */
    resolveMetricEventType(summary) {
        if (summary.errors.length > 0) {
            return 'error';
        }

        if (summary.ingested > 0 && summary.deleted > 0) {
            return 'reconcile';
        }

        return summary.deleted > 0 ? 'tombstone' : 'ingest';
    }

    /**
     * @summary Converts legacy parser output into a parsed-chunk-v1 record.
     * @param {Object} options
     * @returns {Object}
     * @protected
     */
    legacyChunkToParsedRecord({chunk, file, parserId, tenantContext}) {
        const sourcePath = chunk.sourcePath || chunk.source || file.sourcePath;
        const kind       = chunk.kind || chunk.type || 'doc-section';

        return {
            schemaVersion: '1.0.0',
            tenantId     : tenantContext.tenantId,
            repoSlug     : file.repoSlug || tenantContext.repoSlug,
            rootKind     : file.rootKind || 'external-source',
            sourcePath,
            content      : chunk.content || chunk.description || '',
            hashInputs   : ['kind', 'name', 'content', 'sourcePath', 'parserId', 'parserVersion'],
            parserId,
            parserVersion: file.parserVersion || '1.0.0',
            kind,
            name         : chunk.name || sourcePath,
            ...(chunk.line_start ? {line_start: chunk.line_start} : {}),
            ...(chunk.line_end ? {line_end: chunk.line_end} : {}),
            ...(chunk.className ? {className: chunk.className} : {}),
            ...(chunk.extends ? {extends: chunk.extends} : {})
        };
    }

    /**
     * @summary Creates a minimal parsed-chunk-v1 record for raw text payloads.
     * @param {Object} options
     * @returns {Object}
     * @protected
     */
    rawFileToParsedRecord({file, fileIndex, parserId, tenantContext}) {
        const sourcePath = file.sourcePath || `inline-${fileIndex}.txt`;

        return {
            schemaVersion: '1.0.0',
            tenantId     : tenantContext.tenantId,
            repoSlug     : file.repoSlug || tenantContext.repoSlug,
            rootKind     : file.rootKind || 'external-source',
            sourcePath,
            content      : file.content,
            hashInputs   : ['kind', 'name', 'content', 'sourcePath', 'parserId', 'parserVersion'],
            parserId,
            parserVersion: file.parserVersion || '1.0.0',
            kind         : file.kind || 'doc-section',
            name         : file.name || sourcePath,
            ...(file.line_start ? {line_start: file.line_start} : {}),
            ...(file.line_end ? {line_end: file.line_end} : {}),
            ...(file.className ? {className: file.className} : {}),
            ...(file.extends ? {extends: file.extends} : {}),
            ...(file.customMeta ? {customMeta: file.customMeta} : {})
        };
    }

    /**
     * @summary Validates and normalizes one parsed-chunk-v1 record for VectorService.
     * @param {Object} options
     * @returns {Promise<Object|null>}
     * @protected
     */
    async validateAndNormalizeParsedChunk({record, fileIndex, chunkIndex, tenantContext, summary}) {
        if (Object.prototype.hasOwnProperty.call(record || {}, 'embedding')) {
            summary.errors.push(this.createError({
                code   : 'KB_PARSED_CHUNK_EMBEDDING_REJECTED',
                message: 'parsed-chunk-v1 records must not carry `embedding`; use manageDatabaseBackup({action: \'import\'}) for restore payloads.',
                details: {fileIndex, chunkIndex, restorePath: 'manageDatabaseBackup({action: \'import\'})'}
            }));
            return null;
        }

        const validate = await this.getParsedChunkValidator();

        if (!validate(record)) {
            summary.errors.push(this.createError({
                code   : 'KB_PARSED_CHUNK_INVALID',
                message: 'Record does not conform to parsed-chunk-v1.',
                details: {fileIndex, chunkIndex, errors: validate.errors}
            }));
            return null;
        }

        const hash = this.createChunkHash(record, tenantContext);

        return {
            ...record,
            hash,
            id         : hash,
            source     : record.sourcePath,
            type       : record.kind,
            description: record.content
        };
    }

    /**
     * @summary Writes an embedding batch to a temporary JSONL file for VectorService.
     * @param {Array<Object>} chunks Parsed chunks.
     * @returns {Promise<String>} Temporary file path.
     * @protected
     */
    async writeTempJsonl(chunks) {
        const dir = path.join(os.tmpdir(), 'neo-kb-ingestion');
        const file = path.join(dir, `ingest-${process.pid}-${Date.now()}-${crypto.randomUUID()}.jsonl`);

        await fs.ensureDir(dir);
        await fs.writeFile(file, chunks.map(chunk => JSON.stringify(chunk)).join('\n'), 'utf8');

        return file;
    }
}

export default Neo.setupClass(KnowledgeBaseIngestionService);
