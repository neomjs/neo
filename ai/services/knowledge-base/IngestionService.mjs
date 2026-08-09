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
import SourceRegistry       from './source/_export.mjs';
import {normalizeTenantRepoConfig}
                            from './helpers/tenantRepoAccessContract.mjs';
import {createTenantRepoMaterializationDigest}
                            from './helpers/tenantRepoIngestEnvelopeBuilder.mjs';
import {isChromaConnectionError}
                            from '../shared/vector/chromaClientPrimitives.mjs';
import {classifyEmbedFailureCode}
                            from './helpers/embedFailureClassification.mjs';
import VectorService   from './VectorService.mjs';
import aiConfig        from '../../mcp/server/knowledge-base/config.mjs';
import crypto          from 'crypto';
import fs              from 'fs-extra';
import logger          from '../../mcp/server/knowledge-base/logger.mjs';
import mcConfig        from '../../mcp/server/memory-core/config.mjs';
import os              from 'os';
import path            from 'path';
import * as yaml       from 'js-yaml';
import {fileURLToPath} from 'url';

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

const LOCAL_EMBEDDING_PROVIDERS           = new Set(['openAiCompatible', 'ollama']);
const MATERIALIZATION_ATTEMPT_ID_PATTERN  = /^[a-f0-9]{32}$/u;
const MATERIALIZATION_DIGEST_PATTERN      = /^[a-f0-9]{64}$/u;
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
            this.updateIngestionProgress({
                embeddableChunks: embeddableChunks.length,
                errorCount      : summary.errors.length,
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
                    chunks: embeddableChunks,
                    tenantContext,
                    summary,
                    viaMcp: payload.viaMcp !== false
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
                        // Classified rather than defaulted. A provider code is truthy, so the old
                        // `|| 'KB_VECTOR_EMBED_FAILED'` never fired for one — it recorded the
                        // provider's own vocabulary, which the durable `^KB_` filter then dropped to
                        // null. See `embedFailureClassification` for why the fix is a translation.
                        code   : classifyEmbedFailureCode(result.code),
                        message: result.message || result.error,
                        details: result
                    }));
                    this.updateIngestionProgress({
                        embeddedChunks: summary.embeddingsGenerated,
                        errorCount    : summary.errors.length
                    });
                    continue;
                }

                summary.embeddingsGenerated += result?.embedded ?? group.length;
                this.updateIngestionProgress({
                    embeddedChunks: summary.embeddingsGenerated,
                    errorCount    : summary.errors.length
                });
            } catch (error) {
                summary.errors.push(this.createError({
                    // The throw path carries the provider's code most often — a consumer-deadline
                    // timeout or an upstream abort — so this is the site where the inversion bit
                    // hardest: the better-classified the failure, the emptier the receipt.
                    code   : classifyEmbedFailureCode(error.code),
                    message: error.message,
                    details: {repoSlug}
                }));
                this.updateIngestionProgress({
                    embeddedChunks: summary.embeddingsGenerated,
                    errorCount    : summary.errors.length
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
            deleted            : 0,
            embeddingsGenerated: 0,
            skippedOversized   : 0,
            errors             : [],
            tenantId           : aiConfig.defaultTenantId,
            durationMs         : Date.now() - startedAt
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
            skippedChunks : summary.skippedOversized,
            deletedRows   : summary.deleted,
            errorCount    : summary.errors.length
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
        const remaining        = Math.max(0, targetChunks - embeddedChunks);
        const stalled          = active && staleAfterMs > 0 && now - progress.lastProgressAt > staleAfterMs;
        const chunksPerSecond  = durationMs > 0 ? embeddedChunks / (durationMs / 1000) : 0;
        const etaMs            = active && chunksPerSecond > 0 ? Math.ceil((remaining / chunksPerSecond) * 1000) : null;

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
                hasEffect      = summary.errors.length === 0
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
                summary.errors.length === 0
                && existing.materializationReceipt?.ingestContractVersion === attempt.ingestContractVersion
                && existing.materializationReceipt.envelopeDigest === envelopeDigest
            ) {
                // Preserve a prior positive receipt so a crash or checkpoint-write
                // failure after KB mutation can settle idempotently on the retry.
                receipt = existing.materializationReceipt;
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
              inputTokensEstimate = bytesToTokens(inputBytes);

        return {
            skip: inputTokensEstimate > guardrail.safeProcessingLimitTokens,
            inputBytes,
            inputTokensEstimate
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
