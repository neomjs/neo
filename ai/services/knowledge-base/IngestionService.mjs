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
import SourceRegistry     from './source/_export.mjs';
import {loadTenantParser} from './source/tenantParserLoader.mjs';
import {normalizeTenantRepoConfig}
                            from './helpers/tenantRepoAccessContract.mjs';
import {normalizeSettlementCounts}
                            from './helpers/corpusOutstanding.mjs';
import {createTenantRepoMaterializationDigest}
                            from './helpers/tenantRepoIngestEnvelopeBuilder.mjs';
import {isChromaConnectionError}
                            from '../shared/vector/chromaClientPrimitives.mjs';
import {resolveEmbeddingAdmissionBand}
                            from '../../embeddingSafeBand.mjs';
import {
    KB_VECTOR_EMBED_UNCLASSIFIED,
    KB_VECTOR_EMBED_UNDELIVERABLE_AT_GEOMETRY,
    TENANT_AWARE_CHUNK_ID_PATTERN,
    classifyEmbedFailureCode,
    classifyEmbedFailureError,
    classifyEmbedResidencyDisposition,
    isDurableFenceRow,
    isEmbedFailureCode
}
                            from './helpers/embedFailureClassification.mjs';
import VectorService   from './VectorService.mjs';
import {buildEmbeddingInputText}
                       from './helpers/embeddingInputFormat.mjs';
import aiConfig        from '../../mcp/server/knowledge-base/config.mjs';
import crypto          from 'crypto';
import fs              from 'fs-extra';
import logger          from '../../mcp/server/knowledge-base/logger.mjs';
import mcConfig        from '../../mcp/server/memory-core/config.mjs';
import os              from 'os';
import path            from 'path';
import * as yaml       from 'js-yaml';
import {fileURLToPath} from 'url';
import {IMPLEMENTED_EMBEDDING_PROVIDERS, resolveEmbeddingProviderModel}
                       from '../../embeddingProviders.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

/**
 * Scope disclosure carried on EVERY `getIngestionProgress` response state. The progress ledgers are
 * in-memory instance state, so this surface can only ever answer for the process serving the call.
 * @type {String}
 */
export const INGESTION_PROGRESS_OBSERVED_SCOPE = 'this-process-only';

/**
 * The companion pointer to where cross-process ingestion state actually lives. Stating the scope
 * without naming the alternative leaves a caller correctly informed and still stuck.
 * @type {String}
 */
export const INGESTION_PROGRESS_CROSS_PROCESS_HINT = 'Pull-mode tenant-repo ingestion runs in the '
    + 'orchestrator process and is NOT reflected here; read the deployment-state snapshot for that lane.';

/**
 * Resolves the top-level idle-path status from the last run's outcome.
 *
 * Separated out because the three outcomes are genuinely different operator situations and the
 * previous single `idle` answered for all of them. `failed` is surfaced at the top level rather than
 * left nested in `lastRunSummary`, where a caller reading the obvious field never saw it.
 *
 * @param {Object|null} lastRunSummary Normalized last-run snapshot, or null when this process has
 * never ingested.
 * @returns {String} `never-attempted` | `failed` | `idle`
 */
export function resolveIdleProgressStatus(lastRunSummary) {
    if (!lastRunSummary)                    return 'never-attempted';
    if (lastRunSummary.status === 'failed') return 'failed';
    return 'idle';
}

const MATERIALIZATION_ATTEMPT_ID_PATTERN = /^[a-f0-9]{32}$/u;
const MATERIALIZATION_DIGEST_PATTERN     = /^[a-f0-9]{64}$/u;

/**
 * @summary Re-validates a graduation receipt carried on an embed failure into exactly four bounded fields.
 *
 * The receipt is minted by `VectorService` at the graduation site, but it arrives here on a
 * provider-adjacent error object, so it is FIELD-PICKED and type-gated rather than trusted: a hash
 * and three finite non-negative numbers, or nothing. Any malformed branch degrades the whole receipt
 * by omission — a partial receipt would read as a measured one.
 *
 * @param {*} candidate Candidate `error.undeliverableGraduation` value.
 * @returns {{chunkId: String, tokenEstimate: Number, attempts: Number, effectiveCeilingMs: Number}|null}
 */
function normalizeUndeliverableGraduation(candidate) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
        return null;
    }

    const {chunkId, tokenEstimate, attempts, effectiveCeilingMs} = candidate;

    if (typeof chunkId !== 'string' || !TENANT_AWARE_CHUNK_ID_PATTERN.test(chunkId)) return null;
    if (!Number.isFinite(tokenEstimate)      || tokenEstimate < 0)                   return null;
    if (!Number.isInteger(attempts)          || attempts <= 0)                       return null;
    if (!Number.isFinite(effectiveCeilingMs) || effectiveCeilingMs <= 0)             return null;

    return {chunkId, tokenEstimate, attempts, effectiveCeilingMs};
}
const PARSED_CHUNK_SCHEMA_PATH            = path.join(__dirname, 'parser/parsed-chunk-v1.schema.json');
const KB_CONFIG_BOOTSTRAP_FAILURE_DETAILS = Object.freeze({
    'read-failed': {
        errorCode   : 'KB_CONFIG_BOOTSTRAP_READ_FAILED',
        messageClass: 'filesystem-read'
    },
    'parse-failed': {
        errorCode   : 'KB_CONFIG_BOOTSTRAP_PARSE_FAILED',
        messageClass: 'yaml-parse'
    },
    'invalid-shape': {
        errorCode   : 'KB_CONFIG_BOOTSTRAP_INVALID_SHAPE',
        messageClass: 'document-shape'
    }
});

/**
 * @summary Orchestrates tenant-aware Knowledge Base ingestion pushes.
 *
 * `IngestionService` is the service-layer substrate consumed by the
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
 * @see https://github.com/neomjs/neo/issues/16045
 * @class Neo.ai.services.knowledge-base.IngestionService
 * @extends Neo.core.Base
 * @singleton
 */
class IngestionService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.services.knowledge-base.IngestionService'
         * @protected
         */
        className: 'Neo.ai.services.knowledge-base.IngestionService',
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
     * Tenant-declared parser classes, keyed on the full DECLARATION —
     * `<tenantId>::<parserId>::<parserModule>::<exportName>`.
     *
     * Deliberately NOT the shared `SourceRegistry`: that singleton keys on `parserId` alone and
     * overwrites on re-registration, so two tenants declaring the same id would collide. Keying by
     * tenant makes that isolation structural rather than guarded.
     *
     * **The module specifier is part of the key, and that is not decoration.** The graph tier is
     * writable at runtime with no restart, so a `<tenantId>::<parserId>` key would pin the first
     * class ever loaded for that id to the process lifetime. Re-pointing a tenant at a new parser
     * module then invalidates the materialization digest, correctly re-materializes the whole
     * repo — and runs it through the OLD parser, reporting complete success. Including the
     * declaration makes a re-declaration an ordinary cache miss.
     *
     * The pinned root is deliberately absent from the key: it is a deployment leaf resolved once at
     * boot, so it cannot vary between two reads within a process.
     * @member {Map<String,Object>} #tenantParserCache
     * @private
     */
    #tenantParserCache = new Map();

    /**
     * @member {Function|null} parsedChunkValidator=null
     * @protected
     */
    parsedChunkValidator = null

    /**
     * @member {Object|null} activeIngestionProgress=null
     * @summary In-memory progress ledger for the currently executing ingestion request.
     */
    activeIngestionProgress = null

    /**
     * @member {Object|null} lastIngestionProgress=null
     * @summary Last completed ingestion snapshot surfaced while the service is idle.
     */
    lastIngestionProgress = null

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
     * @param {Object} [payload.materializationAttempt] Opaque pull-attempt id plus checkpoint-contract version.
     * @param {Boolean} [payload.viaMcp=true] Caller-selected work-volume-gate mode. Omitted
     *                                        or truthy values keep `VectorService.embed`
     *                                        MCP-safe. Explicit `false` (the `ai:ingest-tenant`
     *                                        bulk CLI path) bypasses the gate as an opt-in to
     *                                        long-running bulk work.
     * @param {Object} [controls={}] Internal non-MCP execution controls.
     * @param {AbortSignal} [controls.signal] Shared tenant-sweep provider circuit signal.
     * @param {Function} [controls.onProviderTimeout] Synchronous native-provider timeout hook.
     * @returns {Promise<{ingested: Number, settled: Number|null, remaining: Number|null, deleted: Number, embeddingsGenerated: Number, errors: Array, tenantId: String, durationMs: Number}>}
     */
    async ingestSourceFiles(payload = {}, controls = {}) {
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

            const files = Array.isArray(payload.files) ? payload.files : [];

            this.startIngestionProgress({
                startedAt,
                tenantContext,
                totalSources: files.length
            });

            const chunks = await this.collectParsedChunks({files, tenantContext, summary});
            this.updateIngestionProgress({
                errorCount : summary.errors.length,
                phase      : 'filtering',
                totalChunks: chunks.length
            });

            const embeddableChunks = this.filterEmbeddingInputBudget({chunks, tenantContext, summary});

            // The accepted corpus is known before provider work starts. Remaining begins as the
            // whole accepted set, then each observed group replaces its accepted contribution with
            // the producer's authoritative remainder. A missing/malformed group nulls BOTH counts.
            summary.remaining = embeddableChunks.length;
            this.updateIngestionProgress({
                embeddableChunks: embeddableChunks.length,
                errorCount      : summary.errors.length,
                remainingChunks : summary.remaining,
                settledChunks   : summary.settled,
                skippedChunks   : summary.skippedOversized
            });

            this.updateIngestionProgress({phase: 'deleting'});
            summary.deleted = await this.applyDeletionSignals({
                deleted         : payload.deleted,
                manifestSnapshot: payload.manifestSnapshot,
                baseRevision    : payload.baseRevision,
                headRevision    : payload.headRevision,
                tenantContext,
                summary
            });
            this.updateIngestionProgress({deletedRows: summary.deleted});

            if (embeddableChunks.length > 0) {
                this.updateIngestionProgress({phase: 'embedding'});
                await this.embedChunkGroups({
                    chunks               : embeddableChunks,
                    onProviderTimeout    : controls.onProviderTimeout,
                    replayEmbeddingPoison: controls.replayEmbeddingPoison === true,
                    // Fourth member of the control envelope, alongside signal / onProviderTimeout /
                    // poison replay. Optional by construction: an absent predicate leaves
                    // `embedChunks` on its `() => false` default, so a caller that supplies no
                    // budget behaves exactly as it does today.
                    shouldYield: controls.shouldYield,
                    signal     : controls.signal,
                    tenantContext,
                    summary,
                    viaMcp     : payload.viaMcp !== false
                });
            }

            summary.ingested   = embeddableChunks.length;
            summary.durationMs = Date.now() - startedAt;

            this.updateIngestionProgress({phase: 'manifest'});
            await this.persistManifestSnapshot({
                manifestSnapshot      : payload.manifestSnapshot,
                files                 : payload.files,
                headRevision          : payload.headRevision,
                materializationAttempt: payload.materializationAttempt,
                tenantContext,
                summary
            });

            this.recordMetric(summary, tenantContext);
            this.finishIngestionProgress({
                summary,
                status: summary.errors.length > 0 ? 'completed_with_errors' : 'completed'
            });
            return summary;
        } catch (error) {
            summary.errors.push(this.createError({
                code   : this.classifyIngestionFailureCode(error),
                message: error.message
            }));
            summary.durationMs = Date.now() - startedAt;
            this.recordMetric(summary, {
                tenantId: summary.tenantId || aiConfig.defaultTenantId,
                repoSlug: aiConfig.defaultRepoSlug
            });
            this.finishIngestionProgress({summary, status: 'failed'});
            return summary;
        }
    }

    /**
     * @summary Internal tenant-sync entry that preserves execution controls outside the OpenAPI wrapper.
     *
     * The canonical SDK proxy intentionally forwards one validated OpenAPI argument to
     * `ingestSourceFiles`. Tenant sync needs a second, process-local control envelope, so it calls
     * this unwrapped method rather than smuggling non-contract fields into the public payload.
     *
     * @param {Object} payload Canonical ingestion payload.
     * @param {Object} controls Internal provider-circuit controls.
     * @returns {Promise<Object>} The canonical ingestion summary.
     */
    async ingestSourceFilesForTenantSync(payload = {}, controls = {}) {
        return this.ingestSourceFiles(payload, controls)
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
     * @param {AbortSignal} [options.signal] Shared tenant-sweep provider circuit signal.
     * @param {Function} [options.onProviderTimeout] Synchronous native-provider timeout hook.
     * @param {Boolean} [options.replayEmbeddingPoison=false] Process-local operator replay control.
     * @param {Boolean} [options.viaMcp=true] Forwarded to `VectorService.embed`; `true` keeps
     *                                        the MCP work-volume gate, `false` (bulk CLI)
     *                                        bypasses it.
     * @returns {Promise<void>}
     * @protected
     */
    async embedChunkGroups({
        chunks,
        tenantContext,
        summary,
        viaMcp = true,
        signal,
        onProviderTimeout,
        replayEmbeddingPoison = false,
        shouldYield
    }) {
        const groups               = new Map();
        let   settlementObservable = true;

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
                    onProviderTimeout,
                    replayEmbeddingPoison,
                    shouldYield,
                    signal,
                    tenantContext: {...tenantContext, repoSlug},
                    viaMcp
                });

                const
                    hasSettled   = Object.hasOwn(result || {}, 'settled'),
                    hasRemaining = Object.hasOwn(result || {}, 'remaining');

                if (!hasSettled && !hasRemaining) {
                    // Legacy producer: absence is unobserved, not a reassuring zero and not an
                    // error. Sticky across the remaining groups because a partial aggregate has no
                    // honest corpus meaning.
                    settlementObservable = false;
                    summary.settled       = null;
                    summary.remaining     = null
                } else {
                    const counts = normalizeSettlementCounts({
                        accepted : group.length,
                        settled  : result?.settled,
                        remaining: result?.remaining
                    });

                    if (!counts) {
                        settlementObservable = false;
                        summary.settled       = null;
                        summary.remaining     = null;
                        summary.errors.push(this.createError({
                            code   : 'KB_VECTOR_EMBED_SETTLEMENT_INVALID',
                            message: 'VectorService returned a malformed or inconsistent settlement tuple.',
                            details: {
                                repoSlug,
                                accepted : group.length,
                                settled  : Number.isFinite(result?.settled) ? result.settled : null,
                                remaining: Number.isFinite(result?.remaining) ? result.remaining : null
                            }
                        }))
                    } else if (settlementObservable) {
                        summary.settled   += counts.settled;
                        summary.remaining += counts.remaining - group.length
                    }
                }

                if (result?.error) {
                    summary.errors.push(this.createError({
                        // Classified rather than defaulted. A provider code is truthy, so the old
                        // `|| 'KB_VECTOR_EMBED_FAILED'` never fired for one — it recorded the
                        // provider's own vocabulary, which the durable `^KB_` filter then dropped to
                        // null. See `embedFailureClassification` for why the fix is a translation.
                        code   : classifyEmbedFailureCode(result.code),
                        message: result.message || result.error,
                        details: result
                    }));
                    this.updateIngestionProgress({
                        embeddedChunks : summary.embeddingsGenerated,
                        errorCount     : summary.errors.length,
                        remainingChunks: summary.remaining,
                        settledChunks  : summary.settled
                    });
                    continue;
                }

                // A partially-successful embed is NOT a clean run. `VectorService.embedChunks` now skips a batch
                // that exhausts its retries while other batches succeed — the alternative, aborting, stranded
                // every later batch on every future sweep. Skipping keeps the corpus advancing, but the skipped
                // chunks did not land, so the run must say so: without this, a sync over a corpus with a hole in
                // it reports as complete and nothing ever revisits the gap.
                for (const failure of result?.failedBatches || []) {
                    summary.errors.push(this.createError({
                        code   : 'KB_EMBED_BATCH_SKIPPED',
                        message: `Embedding batch ${failure.batchIndex} was skipped after exhausting its retries: ${failure.reason}`,
                        details: {repoSlug, batchIndex: failure.batchIndex, chunkIds: failure.chunkIds}
                    }));
                }

                for (const poison of result?.poisonedChunks || []) {
                    const reasonCode = isEmbedFailureCode(poison.reasonCode)
                        ? poison.reasonCode
                        : KB_VECTOR_EMBED_UNCLASSIFIED;
                    // Two fence families share the store but assert DIFFERENT things: a content
                    // poison is proven bad content, an undeliverable-at-geometry chunk is healthy
                    // content the current geometry cannot deliver. Labeling the second as the first
                    // tells an operator to fix a file whose only fault is the plane's ceiling.
                    const undeliverable = reasonCode === KB_VECTOR_EMBED_UNDELIVERABLE_AT_GEOMETRY;

                    summary.errors.push(this.createError({
                        code   : reasonCode,
                        message: undeliverable
                            ? 'A chunk remains fenced as undeliverable at the current embedding geometry, pending a ceiling/geometry change, changed content, or explicit replay.'
                            : 'A proven embedding poison remains fenced pending changed content, generation, or explicit replay.',
                        details: {
                            chunkId    : poison.chunkId,
                            reasonCode,
                            observedAt : poison.observedAt,
                            disposition: undeliverable ? 'undeliverable-at-geometry' : 'proven-content-poison'
                        }
                    }));
                }

                // `result.embedded` or nothing — never `group.length`. The old fallback credited the
                // ENTIRE group as landed whenever the field was absent, which is the one direction
                // this per-call counter must never round: over-crediting makes telemetry claim work
                // landed when it did not. Cumulative completion now comes from the independently
                // validated settlement tuple above, so `embeddingsGenerated` remains exactly what
                // its name promises. Under-counting is recoverable; over-counting is not.
                summary.embeddingsGenerated += Number.isSafeInteger(result?.embedded) && result.embedded >= 0
                    ? result.embedded
                    : 0;

                // A slice that stopped early is not a corpus that finished. Sticky across groups:
                // one yielded group means the run as a whole did not exhaust its work, and a later
                // complete group must not clear that.
                if (result?.yielded === true) {
                    summary.yielded = true;
                }

                this.updateIngestionProgress({
                    embeddedChunks : summary.embeddingsGenerated,
                    errorCount     : summary.errors.length,
                    remainingChunks: summary.remaining,
                    settledChunks  : summary.settled
                });
            } catch (error) {
                settlementObservable = false;
                summary.settled       = null;
                summary.remaining     = null;
                const residencyDisposition = classifyEmbedResidencyDisposition(error);
                // The graduation receipt travels ON the original timeout rather than replacing it:
                // the code below still names the timeout, and this bounded evidence — a hash and
                // three numbers, re-validated here rather than trusted — says what that timeout just
                // proved. Field-picked, never spread: the error is provider-adjacent, and copying an
                // object it carries wholesale would let provider-shaped text ride into the summary.
                const graduation = normalizeUndeliverableGraduation(error?.undeliverableGraduation);

                summary.errors.push(this.createError({
                    // The throw path carries the provider's code most often — a consumer-deadline
                    // timeout or an upstream abort — so this is the site where the inversion bit
                    // hardest: the better-classified the failure, the emptier the receipt.
                    code   : classifyEmbedFailureError(error),
                    message: error.message,
                    // `residencyDisposition` is the difference between "re-check the model identifier"
                    // and "something took the model's slot" — opposite remediations behind one code.
                    // This receipt is where an operator actually reads the failure, so a discriminator
                    // that stops short of it is not an instrument, only an intention. Spread
                    // conditionally: unobserved must stay absent rather than arrive as a null field
                    // that reads like a measured one.
                    details: {
                        repoSlug,
                        ...(residencyDisposition && {residencyDisposition}),
                        ...(graduation && {undeliverableGraduation: graduation})
                    }
                }));
                this.updateIngestionProgress({
                    embeddedChunks : summary.embeddingsGenerated,
                    errorCount     : summary.errors.length,
                    remainingChunks: null,
                    settledChunks  : null
                });
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

            this.updateIngestionProgress({
                errorCount : summary.errors.length,
                seenSources: fileIndex + 1,
                totalChunks: chunks.length
            });
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
     * @summary Names a thrown ingestion failure with a bounded code instead of flattening it.
     *
     * `KB_INGEST_FAILED` was applied to every error that arrived without its own `code`, which
     * made the most common real failure **unnameable**: the cause existed only in `error.message`,
     * and downstream consumers deliberately refuse to copy messages because a clone URL or a
     * provider response can carry a credential. So an operator saw `KB_INGEST_FAILED` and had no
     * way to reach what it meant — observed live on the canonical plane, where the tenant
     * lane reported exactly that while the store was restarting underneath it.
     *
     * Classification happens HERE, inside the service, where the message is legitimately visible.
     * Only the resulting bounded code leaves — messages still never propagate, so this widens
     * diagnosis without touching the credential boundary.
     *
     * Deliberately narrow: it preserves a code the error already carries, names the connection
     * case via the shared predicate (`isChromaConnectionError` — the same one `ChromaManager` uses,
     * not a second copy), and otherwise falls back unchanged. Growing this into a taxonomy of
     * guessed causes would trade one unnameable code for several wrong ones.
     *
     * @param {Error} error Thrown ingestion failure.
     * @returns {String} A bounded `KB_*` code.
     * @protected
     */
    classifyIngestionFailureCode(error) {
        if (typeof error?.code === 'string' && error.code.startsWith('KB_')) {
            return error.code;
        }

        if (isChromaConnectionError(error)) {
            return 'KB_INGEST_STORE_UNREACHABLE';
        }

        return 'KB_INGEST_FAILED';
    }

    /**
     * @summary Bounds a thrown resolver's `code` to a CLOSED vocabulary before it enters a summary.
     *
     * **`error.code` is upstream-controlled, so it is matched — never copied.** A resolver reaching
     * a remote can throw whatever the remote hands it, and `createError` puts `details` verbatim
     * into the consumer-visible summary. A thrown `{code: 'https://user:token@host/repo.git'}`
     * would therefore serialize a credential into a durable record, which is precisely the boundary
     * the surrounding code claims to hold. Documenting a field as bounded does not bound it.
     *
     * Two admitted families, both closed: this service's own `KB_*` codes, and the fixed set of
     * transport codes worth keeping (a refusal and a timeout are different operator problems).
     * Everything else collapses to one literal rather than being preserved "just in case".
     *
     * Mirrors {@link classifyIngestionFailureCode}, which already answers this question for thrown
     * ingest failures by preserving owned codes and emitting a local one otherwise.
     *
     * @param {Error} [error] The thrown resolver error.
     * @returns {String} An admitted code, or `'unclassified'`.
     * @protected
     */
    boundResolverFailureReason(error) {
        // MEMBERSHIP, not a pattern. An earlier version of this admitted anything matching
        // `/^KB_[A-Z0-9_]{1,120}$/` and called that a closed vocabulary; it is not, because the
        // producer chooses the string. `KB_SECRET_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789` satisfies
        // that pattern and travelled verbatim into a durable record — the exact boundary this
        // method exists to hold, defeated by the shape of the check rather than by its intent.
        //
        // A resolver is an injected dependency reaching a remote; it has no business emitting this
        // service's own `KB_*` codes, so no `KB_*` arm survives. The admitted set is exactly the
        // transport conditions worth telling an operator apart — a refusal and a timeout are
        // different problems — and every other value, however well-formed, collapses to one literal.
        const
            admittedCodes = ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EHOSTUNREACH', 'EAI_AGAIN'],
            code          = error?.code;

        return typeof code === 'string' && admittedCodes.includes(code) ? code : 'unclassified';
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
            settled            : 0,
            remaining          : 0,
            deleted            : 0,
            embeddingsGenerated: 0,
            skippedOversized   : 0,
            // False until an embed run reports it stopped on a budget rather than on exhaustion.
            // Initialised here rather than left undefined so consumers can distinguish "this run did
            // not yield" from "this summary predates the field" — an absent boolean reads as false
            // and would let a stale producer look like a complete run.
            yielded   : false,
            errors    : [],
            tenantId  : aiConfig.defaultTenantId,
            durationMs: Date.now() - startedAt
        };
    }

    /**
     * @summary Returns the current ingestion progress snapshot.
     *
     * This is a diagnostics surface, deliberately separate from `healthcheck`: liveness stays
     * compact while operators can still inspect whether a long ingestion is healthy, idle, or stale.
     *
     * @param {Object} [options]
     * @param {Number} [options.staleAfterMs=60000] Age after which the active run is marked stalled.
     * @returns {Object} Read-only ingestion progress snapshot.
     */
    getIngestionProgress({staleAfterMs = 60000} = {}) {
        const now = Date.now();

        if (this.activeIngestionProgress) {
            return {
                ...this.createIngestionProgressSnapshot({
                    progress: this.activeIngestionProgress,
                    active  : true,
                    now,
                    staleAfterMs
                }),
                // Carried on the ACTIVE state too, not only the idle one. Scope is a property of this
                // surface itself, so disclosing it on one branch would mean a caller that happens to
                // poll during a run cannot tell what the number covers — and a partial disclosure is
                // read as a complete one.
                observedScope   : INGESTION_PROGRESS_OBSERVED_SCOPE,
                crossProcessHint: INGESTION_PROGRESS_CROSS_PROCESS_HINT
            };
        }

        const lastRunSummary = this.lastIngestionProgress
            ? this.createIngestionProgressSnapshot({
                progress: this.lastIngestionProgress,
                active  : false,
                now,
                staleAfterMs
            })
            : null;

        return {
            // Three distinct facts an operator must be able to tell apart, previously all reported as
            // `idle`: nothing in flight after a CLEAN run, nothing in flight after a FAILED run, and
            // THIS PROCESS has never ingested at all.
            //
            // The failed case is the sharp one. A run that dies before `startIngestionProgress()` — a
            // tenant-context resolution throw, say — still records a synthetic failed ledger, so the
            // outcome was reachable all along; it just was not reported at this level. The top level
            // said `status: "idle", errorCount: 0` while the nested `lastRunSummary` said `failed` with
            // a non-zero count, and a caller reading the top level saw health. Observed on a live
            // deployment where four tenant repos had failed four times each.
            status: resolveIdleProgressStatus(lastRunSummary),
            active: false,
            phase : 'idle',
            // The scope disclosure is the load-bearing half, and it is why a better status alone would
            // not be enough. `activeIngestionProgress` / `lastIngestionProgress` are IN-MEMORY instance
            // state, so this answers only for the process serving the call. The pull-mode tenant-repo
            // lane ingests inside the ORCHESTRATOR, so a Knowledge Base server reporting
            // `never-attempted` is not evidence that the deployment has never ingested — it cannot see
            // that lane at all. Cross-process ingestion state lives in the deployment-state bridge
            // snapshot (`tenantRepoSync`), which is where a wedged pull lane is actually visible.
            observedScope   : INGESTION_PROGRESS_OBSERVED_SCOPE,
            crossProcessHint: INGESTION_PROGRESS_CROSS_PROCESS_HINT,
            startedAt       : null,
            updatedAt       : lastRunSummary?.updatedAt ?? null,
            lastProgressAt  : null,
            completedAt     : lastRunSummary?.completedAt ?? null,
            durationMs      : 0,
            staleAfterMs,
            stalled         : false,
            totalSources    : 0,
            seenSources     : 0,
            totalChunks     : 0,
            embeddedChunks  : 0,
            skippedChunks   : 0,
            remaining       : 0,
            deletedRows     : 0,
            // Carried from the last run rather than pinned to 0. A zero count beside a failed run is
            // the same false reassurance as the status was.
            errorCount    : lastRunSummary?.errorCount ?? 0,
            lastRunSummary
        };
    }

    /**
     * @summary Starts the active ingestion progress ledger.
     * @param {Object} options
     * @returns {void}
     * @protected
     */
    startIngestionProgress({startedAt, tenantContext, totalSources}) {
        this.activeIngestionProgress = {
            status          : 'running',
            phase           : 'collecting',
            startedAt,
            updatedAt       : startedAt,
            lastProgressAt  : startedAt,
            completedAt     : null,
            tenantId        : tenantContext.tenantId,
            repoSlug        : tenantContext.repoSlug,
            totalSources,
            seenSources     : 0,
            totalChunks     : 0,
            embeddableChunks: 0,
            embeddedChunks  : 0,
            settledChunks   : null,
            remainingChunks : null,
            skippedChunks   : 0,
            deletedRows     : 0,
            errorCount      : 0
        };
    }

    /**
     * @summary Mutates the active progress ledger with a fresh progress timestamp.
     * @param {Object} updates
     * @returns {void}
     * @protected
     */
    updateIngestionProgress(updates = {}) {
        if (!this.activeIngestionProgress) return;

        const now = Date.now();
        Object.assign(this.activeIngestionProgress, updates, {
            updatedAt     : now,
            lastProgressAt: now
        });
    }

    /**
     * @summary Completes the active progress ledger and stores the idle last-run summary.
     * @param {Object} options
     * @returns {void}
     * @protected
     */
    finishIngestionProgress({summary, status}) {
        const active = this.activeIngestionProgress;
        const now    = Date.now();

        this.lastIngestionProgress = {
            ...(active || {
                startedAt       : now - (summary.durationMs || 0),
                tenantId        : summary.tenantId,
                repoSlug        : aiConfig.defaultRepoSlug,
                totalSources    : 0,
                seenSources     : 0,
                totalChunks     : summary.ingested + summary.skippedOversized,
                embeddableChunks: summary.ingested,
                skippedChunks   : summary.skippedOversized
            }),
            status,
            phase         : 'completed',
            updatedAt     : now,
            lastProgressAt: now,
            completedAt   : now,
            embeddedChunks: summary.embeddingsGenerated,
            ...(Object.hasOwn(summary, 'settled') && Object.hasOwn(summary, 'remaining') ? {
                settledChunks  : summary.settled,
                remainingChunks: summary.remaining
            } : {}),
            skippedChunks: summary.skippedOversized,
            deletedRows  : summary.deleted,
            errorCount   : summary.errors.length
        };

        this.activeIngestionProgress = null;
    }

    /**
     * @summary Normalizes a progress ledger into the public diagnostics shape.
     * @param {Object} options
     * @returns {Object}
     * @protected
     */
    createIngestionProgressSnapshot({progress, active, now, staleAfterMs}) {
        const startedAt        = progress.startedAt;
        const completedAt      = progress.completedAt;
        const durationMs       = completedAt ? Math.max(0, completedAt - startedAt) : Math.max(0, now - startedAt);
        const totalChunks      = progress.totalChunks || 0;
        const embeddableChunks = progress.embeddableChunks || 0;
        const embeddedChunks   = progress.embeddedChunks || 0;
        const skippedChunks    = progress.skippedChunks || 0;
        const targetChunks     = embeddableChunks > 0 || skippedChunks > 0 ? embeddableChunks : totalChunks;
        const remaining        = Object.hasOwn(progress, 'remainingChunks')
            ? progress.remainingChunks
            : Math.max(0, targetChunks - embeddedChunks);
        const stalled         = active && staleAfterMs > 0 && now - progress.lastProgressAt > staleAfterMs;
        const chunksPerSecond = durationMs > 0 ? embeddedChunks / (durationMs / 1000) : 0;
        const etaMs           = active && Number.isSafeInteger(remaining) && chunksPerSecond > 0
            ? Math.ceil((remaining / chunksPerSecond) * 1000)
            : null;

        return {
            status        : progress.status,
            active,
            phase         : active ? progress.phase : 'idle',
            startedAt     : this.formatProgressTimestamp(startedAt),
            updatedAt     : this.formatProgressTimestamp(progress.updatedAt),
            lastProgressAt: active ? this.formatProgressTimestamp(progress.lastProgressAt) : null,
            completedAt   : this.formatProgressTimestamp(completedAt),
            durationMs,
            staleAfterMs,
            stalled,
            tenantId      : progress.tenantId,
            repoSlug      : progress.repoSlug,
            totalSources  : progress.totalSources || 0,
            seenSources   : progress.seenSources || 0,
            totalChunks,
            embeddedChunks,
            skippedChunks,
            remaining,
            deletedRows   : progress.deletedRows || 0,
            errorCount    : progress.errorCount || 0,
            rate          : {
                chunksPerSecond
            },
            etaMs
        };
    }

    /**
     * @summary Formats an epoch millisecond timestamp for the public progress snapshot.
     * @param {Number|null|undefined} timestamp
     * @returns {String|null}
     * @protected
     */
    formatProgressTimestamp(timestamp) {
        return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
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
     * @returns {Promise<Object<String, {repoSlug: String, pathsAfterPush: Array<String>, updatedAt: Number, materializationReceipt: Object|null}>>}
     */
    async getTenantManifests({tenantId} = {}) {
        const {tenantId: resolvedTenant} = this.resolveTenantContext({tenantId});

        await this.graphService.ready();

        const record = this.graphService.getNodeRecord({id: `kb-manifest:${resolvedTenant}`}),
              source = record?.properties?.manifests;

        if (!source || typeof source !== 'object' || Array.isArray(source)) {
            return {};
        }

        return Object.fromEntries(Object.entries(source)
            .map(([repoSlug, manifest]) => {
                const
                    paths                  = this.normalizeManifestPaths(manifest?.pathsAfterPush),
                    materializationReceipt = this.normalizeMaterializationReceipt(manifest?.materializationReceipt);

                return paths ? [repoSlug, {
                    repoSlug,
                    pathsAfterPush: paths,
                    updatedAt     : manifest.updatedAt || 0,
                    materializationReceipt
                }] : null;
            })
            .filter(Boolean));
    }

    /**
     * @summary Reads one persisted tenant/repo claimed-state manifest.
     * @param {Object} data
     * @param {String} data.tenantId Tenant id.
     * @param {String} data.repoSlug Repo slug.
     * @returns {Promise<{tenantId: String, repoSlug: String, source: String, pathsAfterPush: Array<String>, updatedAt: Number, materializationReceipt: Object|null}>}
     */
    async getTenantManifest({tenantId, repoSlug} = {}) {
        const {tenantId: resolvedTenant, repoSlug: resolvedRepo} = this.resolveTenantContext({tenantId, repoSlug});
        const manifests                                          = await this.getTenantManifests({tenantId: resolvedTenant});
        const manifest                                           = manifests[resolvedRepo];

        return {
            tenantId              : resolvedTenant,
            repoSlug              : resolvedRepo,
            source                : manifest ? 'graph' : 'empty',
            pathsAfterPush        : manifest?.pathsAfterPush || [],
            updatedAt             : manifest?.updatedAt || 0,
            materializationReceipt: manifest?.materializationReceipt || null
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
     * @param {Object} [data.materializationReceipt] Optional pull-attempt proof. Omission clears stale proof.
     * @returns {Promise<{tenantId: String, repoSlug: String, pathsAfterPush: Array<String>, updatedAt: Number, materializationReceipt: Object|null}|{error: String, code: String, message: String}>}
     */
    async setTenantManifest({tenantId, repoSlug, pathsAfterPush, materializationReceipt} = {}) {
        try {
            const
                tenantContext = this.resolveTenantContext({tenantId, repoSlug}),
                paths         = this.normalizeManifestPaths(pathsAfterPush),
                receipt       = this.normalizeMaterializationReceipt(materializationReceipt);

            if (!paths || (materializationReceipt != null && !receipt)) {
                return {
                    error  : 'Tenant manifest write failed',
                    code   : 'KB_TENANT_MANIFEST_INVALID',
                    message: !paths
                        ? '`pathsAfterPush` must be an array.'
                        : '`materializationReceipt` has an invalid shape.'
                };
            }

            await this.graphService.ready();

            const nodeId    = `kb-manifest:${tenantContext.tenantId}`,
                  existing  = this.graphService.getNodeRecord({id: nodeId}),
                  manifests = {...(existing?.properties?.manifests || {})},
                  updatedAt = Date.now();

            manifests[tenantContext.repoSlug] = {
                repoSlug      : tenantContext.repoSlug,
                pathsAfterPush: paths,
                updatedAt,
                ...(receipt ? {materializationReceipt: receipt} : {})
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

            return {
                tenantId              : tenantContext.tenantId,
                repoSlug              : tenantContext.repoSlug,
                pathsAfterPush        : paths,
                updatedAt,
                materializationReceipt: receipt
            };
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
    async persistManifestSnapshot({
        manifestSnapshot,
        files,
        headRevision,
        materializationAttempt,
        tenantContext,
        summary
    }) {
        const normalized = this.normalizeManifestSnapshot({manifestSnapshot, tenantContext});

        if (!normalized) {
            return;
        }

        const attempt = this.normalizeMaterializationAttempt(materializationAttempt);

        if (materializationAttempt != null && !attempt) {
            summary.errors.push(this.createError({
                code   : 'KB_TENANT_MATERIALIZATION_ATTEMPT_INVALID',
                message: '`materializationAttempt` has an invalid shape.'
            }));
            return;
        }

        let receipt = null;
        // Hoisted out of the `attempt` block purely so the no-receipt diagnostic below can state
        // whether a prior receipt existed to fall back on — the branch that distinguishes
        // "first materialization" from "retry whose prior proof did not match".
        let priorReceiptPresent = false;
        // Method-scoped because the no-receipt diagnostic below must report the same decision that
        // gated mint/reuse. Computing it once before the attempt block keeps every no-receipt path
        // attributable before `setTenantManifest` clears stale proof.
        const
            durableFenceOnly      = summary.errors.length > 0
                && summary.errors.every(isDurableFenceRow),
            receiptErrorsComplete = summary.errors.length === 0 || durableFenceOnly,
            // Preserve the pre-existing clean-summary retry behavior, including its yielded shape.
            // The new fence-only extension is narrower: a yielded fence summary is still incomplete
            // and must not borrow prior full-materialization proof.
            receiptReuseCompatible = summary.errors.length === 0
                || (durableFenceOnly && summary.yielded !== true);

        if (attempt) {
            const
                envelopeDigest = createTenantRepoMaterializationDigest({
                    repoSlug        : normalized.repoSlug,
                    headRevision,
                    manifestSnapshot: normalized,
                    files
                }),
                existing       = await this.getTenantManifest({
                    tenantId: tenantContext.tenantId,
                    repoSlug: normalized.repoSlug
                }),
                // `yielded` is a hard veto on minting, and it belongs HERE rather than only at the
                // caller. A materialization receipt is a claim that the corpus is WHOLE: the next
                // sweep matches it against the envelope digest and, on a hit, skips ingestion
                // entirely. A bounded slice has positive effect — chunks really landed — so an
                // effect-only test mints proof of completeness for a corpus with a remainder, and
                // the checkpoint then settles over work that never landed. The slice is real
                // progress and none of it is lost; what it is not is finished.
                //
                // This does NOT weaken crash-after-complete recovery: a run that exhausted its
                // corpus reports `yielded: false` and mints exactly as before.
                hasEffect      = receiptErrorsComplete
                    && summary.yielded !== true
                    && [summary.ingested, summary.deleted]
                        .some(value => Number.isSafeInteger(value) && value > 0);

            priorReceiptPresent = Boolean(existing?.materializationReceipt);

            if (hasEffect) {
                receipt = {
                    attemptId            : attempt.attemptId,
                    ingestContractVersion: attempt.ingestContractVersion,
                    envelopeDigest,
                    recordedAt           : Date.now()
                };
            } else if (
                receiptReuseCompatible
                && existing.materializationReceipt?.ingestContractVersion === attempt.ingestContractVersion
                && existing.materializationReceipt.envelopeDigest === envelopeDigest
            ) {
                // Preserve a prior positive receipt so a crash or checkpoint-write
                // failure after KB mutation can settle idempotently on the retry.
                receipt = existing.materializationReceipt;
            } else if (
                summary.errors.length === 0
                && normalized.pathsAfterPush.length === 0
            ) {
                // A source-observed empty manifest is a completed materialization, not an
                // effect-shaped one. It still needs the ordinary digest-bound proof so the
                // orchestrator can commit a complete checkpoint instead of reporting success
                // while leaving revalidation armed. Prior positive receipts deliberately win
                // above: replacing one here would break settle-once recovery after a checkpoint
                // write failure.
                receipt = {
                    attemptId            : attempt.attemptId,
                    ingestContractVersion: attempt.ingestContractVersion,
                    envelopeDigest,
                    recordedAt           : Date.now()
                };
            }
        }

        // A manifest that persists WITHOUT a receipt is the shape that rejects an otherwise
        // successful ingest downstream: `assertFullMaterializationEffect` sees a real effect and no
        // proof of it, and raises EMPTY_MATERIALIZATION — a message that reads as the opposite of
        // what happened. Observed live with `ingested=50, embeddings=50, errors=0` and no receipt
        // on either configured repo.
        //
        // Every branch above that skips receipt creation does so silently, so the absence was not
        // attributable from any log: no attempt supplied, an attempt rejected as malformed, or a
        // materialization with no positive effect all leave `receipt` null and look identical
        // afterwards. This names which one happened.
        //
        // `attemptPresentAfterValidation` deliberately does NOT say the caller omitted the attempt.
        // It is read after the OpenAPI/Zod gate in `ai/services.mjs`, which strips payload keys the
        // contract does not declare — so `false` means "absent by the time the method ran", whether
        // the caller omitted it or validation deleted it. Reading it as caller-omission is exactly
        // how the first diagnosis on this lane was misrouted to a caller that was passing it
        // correctly. Distinguishing the two arms requires comparing against the declared schema,
        // which a mechanical contract-parity check owns rather than this log line.
        //
        // Counts and booleans only — no paths, filenames, or repo content, matching the credential
        // discipline applied to ingestion error messages.
        if (!receipt) {
            logger.warn('[IngestionService] Manifest persisted without a materialization receipt.', {
                repoSlug                     : normalized.repoSlug,
                attemptPresentAfterValidation: materializationAttempt != null,
                attemptAccepted              : Boolean(attempt),
                ingested                     : summary.ingested,
                deleted                      : summary.deleted,
                errorCount                   : summary.errors.length,
                durableFenceOnly,
                priorReceiptPresent
            });
        }

        const result = await this.setTenantManifest({
            tenantId              : tenantContext.tenantId,
            repoSlug              : normalized.repoSlug,
            pathsAfterPush        : normalized.pathsAfterPush,
            materializationReceipt: receipt
        });

        if (result?.error) {
            summary.errors.push(this.createError({
                code   : result.code,
                message: result.message
            }));
        } else if (result.materializationReceipt) {
            summary.materializationReceipt = result.materializationReceipt;
        }
    }

    /**
     * @summary Normalizes the opaque identity assigned by the pull orchestrator to one full attempt.
     * @param {*} attempt Candidate attempt.
     * @returns {{attemptId: String, ingestContractVersion: Number}|null}
     * @protected
     */
    normalizeMaterializationAttempt(attempt) {
        if (
            !attempt
            || typeof attempt !== 'object'
            || Array.isArray(attempt)
            || !MATERIALIZATION_ATTEMPT_ID_PATTERN.test(attempt.attemptId)
            || !Number.isSafeInteger(attempt.ingestContractVersion)
            || attempt.ingestContractVersion <= 0
        ) {
            return null;
        }

        return {
            attemptId            : attempt.attemptId,
            ingestContractVersion: attempt.ingestContractVersion
        };
    }

    /**
     * @summary Normalizes one durable positive-effect receipt from the tenant manifest graph.
     * @param {*} receipt Candidate receipt.
     * @returns {{attemptId: String, ingestContractVersion: Number, envelopeDigest: String, recordedAt: Number}|null}
     * @protected
     */
    normalizeMaterializationReceipt(receipt) {
        if (
            !receipt
            || typeof receipt !== 'object'
            || Array.isArray(receipt)
            || !MATERIALIZATION_ATTEMPT_ID_PATTERN.test(receipt.attemptId)
            || !Number.isSafeInteger(receipt.ingestContractVersion)
            || receipt.ingestContractVersion <= 0
            || !MATERIALIZATION_DIGEST_PATTERN.test(receipt.envelopeDigest)
            || !Number.isSafeInteger(receipt.recordedAt)
            || receipt.recordedAt <= 0
        ) {
            return null;
        }

        return {
            attemptId            : receipt.attemptId,
            ingestContractVersion: receipt.ingestContractVersion,
            envelopeDigest       : receipt.envelopeDigest,
            recordedAt           : receipt.recordedAt
        };
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
     * @summary Resolves the embedding input-budget guardrail for ingestion diagnostics.
     *
     * The band is provider-independent, so the guard measures EVERY provider — `recognized`
     * is a diagnostic flag for skip receipts, never a licence to skip the measurement.
     * @returns {{recognized: Boolean, embeddingProvider: String, contextLimitTokens: Number, safeProcessingLimitTokens: Number, model: String}}
     * @protected
     */
    resolveEmbeddingInputGuardrail() {
        const embeddingProvider         = mcConfig.embeddingProvider;
        const contextLimitTokens        = Number(aiConfig.localModels.embedding.contextLimitTokens);
        const safeProcessingLimitTokens = Number(aiConfig.localModels.embedding.safeProcessingLimitTokens);

        return {
            recognized: IMPLEMENTED_EMBEDDING_PROVIDERS.includes(embeddingProvider),
            embeddingProvider,
            contextLimitTokens,
            safeProcessingLimitTokens,
            model     : resolveEmbeddingProviderModel({embeddingProvider, aiConfig})
        };
    }

    /**
     * @summary Builds the provider input string this service's guardrail measures.
     *
     * Reads the shared `helpers/embeddingInputFormat` authority — the same definition the vector
     * service and the byte-budget planner read — so the string measured here is by construction the
     * string the provider receives. It is deliberately NOT taken from the `vectorService` member: that
     * member is the configurable seam for downstream embedding and upsert I/O, and the provider input
     * format is one contract rather than a per-deployment choice.
     *
     * @param {Object} chunk Normalized parsed chunk.
     * @returns {String}
     * @protected
     */
    buildEmbeddingInputText(chunk) {
        return buildEmbeddingInputText(chunk);
    }

    /**
     * @summary Drops oversized chunks before writing the VectorService temp JSONL — for EVERY
     * provider, recognized or not.
     *
     * `VectorService` remains the final safety net, but doing the same bounded check here
     * gives ingestion callers and daemon diagnostics a durable skip signal even when no
     * graph row can be written for the offending source file. The band is provider-independent;
     * an unrecognized provider is exactly the case where the limit is least known, so the
     * measurement never gates on recognition.
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

        const embeddable = [];

        for (const chunk of chunks) {
            const budget = this.evaluateEmbeddingInputBudget(chunk, guardrail);

            if (!budget.skip) {
                embeddable.push(chunk);
                continue;
            }

            // An unresolvable band is not an oversized chunk — it is a configuration defect, and a
            // split planned against it would be planned against nothing. Record the skip and leave
            // the chunk whole, mirroring `VectorService.expandOversizedEmbeddingChunks`; the send
            // boundary refuses it with the same unmeasurable flag rather than silently shipping
            // parts cut to a band nobody validated.
            if (budget.estimateBandTokens === null) {
                this.recordOversizedEmbeddingSkip({chunk, guardrail, summary, tenantContext, ...budget});
                continue;
            }

            const splitChunks = this.vectorService.splitOversizedEmbeddingChunk({
                chunk,
                guardrail,
                createHash: splitChunk => this.createChunkHash(splitChunk, tenantContext)
            });

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
              inputTokensEstimate = bytesToTokens(inputBytes),
              // Same resolver as `VectorService.measureEmbeddingInput` and the splitter. This site
              // used to compare against `safeProcessingLimitTokens` directly, so a deployment whose
              // engine slot is narrower than the safe band admitted inputs here that the provider
              // then refused — and admitting at one band while cutting at another is how the three
              // copies of this rule drifted apart in the first place.
              {resolved, admissionCeilingTokens, estimateBandTokens} = resolveEmbeddingAdmissionBand(guardrail);

        return {
            skip                  : !resolved || inputTokensEstimate > estimateBandTokens,
            inputBytes,
            inputTokensEstimate,
            estimateBandTokens    : resolved ? estimateBandTokens     : null,
            admissionCeilingTokens: resolved ? admissionCeilingTokens : null
        };
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
            consumer                 : 'IngestionService.ingestSourceFiles',
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

        logger.warn('[IngestionService] Skipping oversized ingestion chunk before embedding.', details);
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

        // Tenant-declared parsers resolve FIRST and never enter the shared registry.
        //
        // `SourceRegistry` is a singleton keyed by `parserId` whose own JSDoc advertises
        // "re-registering the same name overwrites the prior class — idempotent for hot-reload".
        // That reads as a feature, and it is one for hot-reload; for multi-tenant registration it is
        // last-tenant-wins. Registering tenant parsers into it would let tenant A's declaration
        // silently reshape tenant B's ingestion under a shared id. Resolving per tenant at dispatch
        // instead makes that class of leak impossible rather than guarded against, and leaves the
        // import-time global registration path byte-identical for a zero-config deployment.
        const parser = await this.resolveTenantParser({parserId, tenantContext}) ?? this.resolveParser(parserId);

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
     * @summary Resolves a parser a TENANT declared, loading it from the deployment-pinned root.
     *
     * The gap this closes: `getTenantConfig` resolves a tenant's `customParsers` through its
     * three-tier chain, and nothing consumed the result. `applyConfigToRegistry` — the only writer
     * into `SourceRegistry` — is called exactly once, at import time, with the GLOBAL config. So a
     * parser declared in a tenant's `kb-config.yaml` tier was resolved into an object no one
     * registered. Dispatch was never the problem; registration was.
     *
     * **Two entry shapes, because the tiers differ in kind.** `{ParserClass}` is the JS-config form
     * and still works. `{parserModule}` is the form a DATA tier can hold — the graph node stores JSON
     * and the yaml bootstrap stores scalars, neither of which can carry a class reference. The module
     * name resolves below `aiConfig.tenantParserRoot`; containment lives in `tenantParserLoader`,
     * which takes the root as an argument and reads no config of its own.
     *
     * **Failures propagate.** A declared-but-unloadable parser throws its coded reason rather than
     * returning null, because null falls through to `raw-text` — which INGESTS SUCCESSFULLY as one
     * whole-file chunk per file. Nothing errors, nothing is missing, retrieval is simply worse. That
     * is the same defect shape as a census reporting `0` instead of `unknown`, minus even a
     * suspicious number to notice.
     *
     * @param {Object} options
     * @param {String} options.parserId
     * @param {Object} [options.tenantContext]
     * @returns {Promise<Object|null>} The tenant's parser class, or null when it declared none.
     * @protected
     */
    async resolveTenantParser({parserId, tenantContext} = {}) {
        const tenantId = tenantContext?.tenantId;

        if (!tenantId || !parserId) {
            return null
        }

        // The declaration is read BEFORE the cache is consulted, because the declaration is what the
        // cache key is made of. `getTenantConfig` is an in-memory `getNodeRecord` lookup behind an
        // already-resolved `ready()`, so this is not the cost the cache exists to avoid — that cost
        // is the containment syscalls and the module resolution below.
        const declared = (await this.getTenantConfig({tenantId}))?.customParsers;

        if (!Array.isArray(declared)) {
            return null
        }

        const entry = declared.find(candidate => (candidate?.parserId || null) === parserId);

        if (!entry) {
            return null
        }

        // A live class reference still wins — the JS-config tier is unchanged by this path, and
        // caching an object the caller already handed us would buy nothing.
        if (entry.ParserClass) {
            return entry.ParserClass
        }

        if (!entry.parserModule) {
            return null
        }

        const cacheKey = `${tenantId}::${parserId}::${entry.parserModule}::${entry.exportName ?? ''}`;

        if (this.#tenantParserCache.has(cacheKey)) {
            return this.#tenantParserCache.get(cacheKey)
        }

        const ParserClass = await loadTenantParser({
            specifier : entry.parserModule,
            root      : aiConfig.tenantParserRoot,
            exportName: entry.exportName
        });

        this.#tenantParserCache.set(cacheKey, ParserClass);

        return ParserClass
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
     *
     * **Requesting derivation stays fail-closed, and that is deliberate.** `revisionResolver`
     * has no production implementation: the config default is `null`, the only `resolveDeletedPaths`
     * in the tree are test doubles, and nothing under `ai/` assigns it. A caller that asks this
     * service to derive a deletion set therefore cannot be given one — and completing the run
     * anyway would let deletions silently stop propagating, which is strictly worse than failing.
     *
     * The fix for the tenant-sync lane was NOT to weaken this: that lane already proved its own
     * delta via `gitMirror.diffRevisions()` and then redundantly asked for it to be re-derived, so
     * it stopped sending `baseRevision`. See `tenantRepoIngestEnvelopeBuilder`. Demoting this branch
     * globally would have bought that one caller a fix at the price of every other caller's
     * guarantee.
     *
     * **Absent and failed remain different conditions.** Once a real resolver exists, a genuine
     * failure — network, auth, corrupt revision — must be distinguishable from "never wired", or
     * deletion detection ships unable to report its own breakage:
     *
     * - **unwired** ⇒ `KB_REVISION_BOUNDARY_UNAVAILABLE`.
     * - **present and throwing** ⇒ `KB_REVISION_BOUNDARY_RESOLVER_FAILED`.
     *
     * The message deliberately names no tracking item. The one it used to cite had already closed,
     * so it told operators to wait for a phase that had shipped, for a capability nobody had built —
     * a stale pointer that reads as a roadmap promise is worse than no pointer.
     *
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
                message: 'Revision-boundary deletion detection is not wired on this deployment, so a caller-requested deletion set cannot be derived. Supply explicit tombstones instead.'
            }));
            return [];
        }

        try {
            const resolved = await this.revisionResolver.resolveDeletedPaths({
                baseRevision,
                headRevision,
                tenantContext
            });

            return Array.isArray(resolved) ? resolved : [];
        } catch (error) {
            // Neither the message nor the raw code is copied: both are upstream-controlled and this
            // record travels verbatim into consumer-visible summaries. See boundResolverFailureReason.
            summary.errors.push(this.createError({
                code   : 'KB_REVISION_BOUNDARY_RESOLVER_FAILED',
                message: 'The revision-boundary resolver failed to resolve deleted paths.',
                details: {reason: this.boundResolverFailureReason(error)}
            }));
            return [];
        }
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

        await this.graphService.ready();

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
     * @summary Reads the optional `kb-config.yaml` bootstrap with bounded diagnostic provenance.
     *
     * Runtime resolution remains fail-soft: every non-loaded state carries `document:null`, allowing
     * callers to continue to the AiConfig fallback. Diagnostics distinguish absence, an empty YAML
     * document, filesystem failure, parse failure, and a top-level contract failure without retaining
     * the host path, source text, raw error message, stack, tenant identities, or repository config.
     *
     * @param {Object} [options]
     * @param {Object} [options.fileSystem=fs] File reader test seam.
     * @returns {{status: ('missing'|'empty'|'loaded'|'read-failed'|'parse-failed'|'invalid-shape'), document: Object|null, tenantCount: Number|null, errorCode: String|null, messageClass: String|null}}
     * @protected
     */
    readKbConfigBootstrapResult({fileSystem = fs} = {}) {
        let source;

        try {
            const bootstrapPath = path.join(aiConfig.neoRootDir, 'kb-config.yaml');

            source = fileSystem.readFileSync(bootstrapPath, 'utf8');
        } catch (error) {
            if (error && error.code === 'ENOENT') {
                return {
                    status      : 'missing',
                    document    : null,
                    tenantCount : 0,
                    errorCode   : null,
                    messageClass: null
                };
            }

            return {
                status     : 'read-failed',
                document   : null,
                tenantCount: null,
                ...KB_CONFIG_BOOTSTRAP_FAILURE_DETAILS['read-failed']
            };
        }

        if (source.split(/\r?\n/u).every(line => /^\s*(?:#.*)?$/u.test(line))) {
            return {
                status      : 'empty',
                document    : null,
                tenantCount : 0,
                errorCode   : null,
                messageClass: null
            };
        }

        let document;

        try {
            document = yaml.load(source);
        } catch {
            return {
                status     : 'parse-failed',
                document   : null,
                tenantCount: null,
                ...KB_CONFIG_BOOTSTRAP_FAILURE_DETAILS['parse-failed']
            };
        }

        if (document === null || document === undefined) {
            return {
                status      : 'empty',
                document    : null,
                tenantCount : 0,
                errorCode   : null,
                messageClass: null
            };
        }

        if (
            typeof document !== 'object' ||
            Array.isArray(document) ||
            !Object.hasOwn(document, 'tenants') ||
            !document.tenants ||
            typeof document.tenants !== 'object' ||
            Array.isArray(document.tenants)
        ) {
            return {
                status     : 'invalid-shape',
                document   : null,
                tenantCount: null,
                ...KB_CONFIG_BOOTSTRAP_FAILURE_DETAILS['invalid-shape']
            };
        }

        return {
            status      : 'loaded',
            document,
            tenantCount : Object.keys(document.tenants).length,
            errorCode   : null,
            messageClass: null
        };
    }

    /**
     * @summary Reads the optional `kb-config.yaml` deployment bootstrap, fail-soft.
     *
     * This compatibility path intentionally returns only the valid parsed document. Missing, empty,
     * unreadable, malformed, and invalid-shape inputs resolve to `null`, preserving graph → YAML →
     * AiConfig precedence for existing tenant-config consumers.
     *
     * @returns {Object|null} The valid parsed bootstrap document, or `null`.
     * @protected
     */
    readKbConfigBootstrap() {
        return this.readKbConfigBootstrapResult().document;
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
     * The tenant set is derived from graph-tier `KnowledgeBaseTenantConfig` records, `kb-config.yaml`
     * `tenants.*` keys, plus the distinct `tenantId`s in `aiConfig.tenantRepos[]`. Graph-tier
     * enumeration stays inside `GraphService.listNodeRecordsByType()` so the resolver does not issue
     * raw graph scans or bypass the graph service's RLS/visibility boundary.
     * @returns {Promise<{tenantRepos: Array<Object>, configDiagnostics: {bootstrap: Object}}>} Contract-normalized repos plus bounded bootstrap provenance; throws on a malformed entry.
     */
    async listConfiguredTenantRepos() {
        await this.graphService.ready();

        const bootstrapResult = this.readKbConfigBootstrapResult(),
              bootstrap       = bootstrapResult.document,
              yamlTenants     = (bootstrap && bootstrap.tenants) || {},
              defaultRepos    = Array.isArray(aiConfig.tenantRepos) ? aiConfig.tenantRepos : [],
              graphRecords    = this.listTenantConfigRecords(),
              graphByTenantId = new Map(),
              tenantIds       = new Set();

        graphRecords.forEach(record => {
            const rawTenantId = record?.properties?.tenantId || record?.id?.slice('kb-config:'.length),
                  tenantId    = rawTenantId ? (normalizeUserId(rawTenantId) || rawTenantId) : null;

            if (tenantId) {
                tenantIds.add(tenantId);
                graphByTenantId.set(tenantId, record);
            }
        });

        Object.keys(yamlTenants).forEach(key => tenantIds.add(key));
        defaultRepos.forEach(entry => {
            const id = entry && entry.tenantId;
            if (id) tenantIds.add(normalizeUserId(id) || id);
        });

        const effective = [];

        for (const tenantId of tenantIds) {
            const graphRecord = graphByTenantId.get(tenantId) || this.graphService.getNodeRecord({id: `kb-config:${tenantId}`}),
                  yamlEntry   = yamlTenants[tenantId];

            // Tier winner is chosen by tier PRESENCE (matching getTenantConfig), NOT by a
            // non-empty array: a graph record / yaml entry that declares `tenantRepos: []`
            // intentionally means "no repos for this tenant" and MUST suppress lower tiers
            // wholesale — selecting on `length > 0` would leak lower-tier repos through.
            let repos,
                configTier;

            if (graphRecord?.properties) {
                repos       = graphRecord.properties.tenantRepos || [];
                configTier  = 'graph';
            } else if (yamlEntry) {
                repos       = yamlEntry.tenantRepos || [];
                configTier  = 'yaml';
            } else {
                repos       = defaultRepos.filter(entry => (normalizeUserId(entry.tenantId) || entry.tenantId) === tenantId);
                configTier  = 'aiConfig';
            }

            repos.forEach(repo => effective.push({
                ...repo,
                tenantId: repo.tenantId || tenantId,
                configTier
            }));
        }

        return normalizeTenantRepoConfig({
            tenantRepos      : effective,
            configDiagnostics: {
                bootstrap: {
                    status      : bootstrapResult.status,
                    tenantCount : bootstrapResult.tenantCount,
                    errorCode   : bootstrapResult.errorCode,
                    messageClass: bootstrapResult.messageClass
                }
            }
        });
    }

    /**
     * @summary Lists visible graph-tier tenant config records for pull-mode tenant-repo discovery.
     *
     * Pull-mode sync needs to discover tenants that exist only in the graph tier. The graph service
     * owns the RLS-aware type enumeration; this method deliberately fails loud when that sanctioned
     * surface is unavailable instead of silently degrading to "no configured repos".
     * @returns {Object[]} Visible `KnowledgeBaseTenantConfig` records.
     */
    listTenantConfigRecords() {
        if (typeof this.graphService.listNodeRecordsByType !== 'function') {
            throw new Error('GraphService.listNodeRecordsByType is required for tenant config discovery.');
        }

        const result = this.graphService.listNodeRecordsByType({
            type    : 'KnowledgeBaseTenantConfig',
            idPrefix: 'kb-config:'
        });

        return Array.isArray(result?.records) ? result.records : [];
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

            await this.graphService.ready();

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
        const dir  = path.join(os.tmpdir(), 'neo-kb-ingestion');
        const file = path.join(dir, `ingest-${process.pid}-${Date.now()}-${crypto.randomUUID()}.jsonl`);

        await fs.ensureDir(dir);
        await fs.writeFile(file, chunks.map(chunk => JSON.stringify(chunk)).join('\n'), 'utf8');

        return file;
    }
}

export default Neo.setupClass(IngestionService);
