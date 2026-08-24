import fs                                                      from 'fs';
import path                                                    from 'path';
import * as yaml                                               from 'js-yaml';
import { fileURLToPath }                                       from 'url';
import crypto                                                  from 'crypto';
import { Memory_Config as aiConfig }                           from '../../../services.mjs';
import Base                                                    from '../../../../src/core/Base.mjs';
import { Memory_StorageRouter as StorageRouter }               from '../../../services.mjs';
import { Memory_TextEmbeddingService as TextEmbeddingService } from '../../../services.mjs';
import { Memory_GraphService as GraphService }                 from '../../../services.mjs';
import Json                                                    from '../../../../src/util/Json.mjs';
import logger                                                  from '../../../mcp/server/memory-core/logger.mjs';
import AdrIngestor                                             from '../../../services/ingestion/AdrIngestor.mjs';
import ConceptDiscoveryService                                 from '../../../services/ingestion/ConceptDiscoveryService.mjs';
import ConceptIngestor                                         from '../../../services/ingestion/ConceptIngestor.mjs';
import FileSystemIngestor                                      from '../../../services/memory-core/FileSystemIngestor.mjs';
import GapInferenceEngine                                      from '../../../services/graph/GapInferenceEngine.mjs';
import GraphMaintenanceService                                 from '../../../services/graph/GraphMaintenanceService.mjs';
import MemorySessionIngestor                                   from '../../../services/ingestion/MemorySessionIngestor.mjs';
import SemanticGraphExtractor                                  from '../../../services/graph/SemanticGraphExtractor.mjs';
import TopologyInferenceEngine                                 from '../../../services/graph/TopologyInferenceEngine.mjs';
import GoldenPathSynthesizer                                   from '../../../services/graph/GoldenPathSynthesizer.mjs';
import AiConfig                                                from '../../../config.mjs';
import {
    assertProviderReadinessConfig,
    buildOllamaReadinessConfig,
    createProviderFailureDiagnostic,
    ensureOllamaModelsReady,
    fetchOpenAiCompatibleModelIds,
    getGraphProviderReadinessTarget,
    waitForProvider,
    warnProviderParallelModelCapacity
} from '../../../services/graph/providerReadinessHelper.mjs';
import {
    appendRemRunState,
    createRemPhaseState,
    createRemRunStateEntry
} from '../../../services/memory-core/helpers/remRunStateStore.mjs';
import {bytesToTokens} from '../../../services/memory-core/helpers/consumerFrictionHelper.mjs';
import {
    canonicalizeSessionTurnInput,
    computeSessionTurnInputRevision,
    resolveTurnDocumentForRead
} from '../../../services/memory-core/helpers/turnDocumentText.mjs';
import {
    CORPUS_PROJECTION_CONSUMER,
    evaluateCorpusProjectionAdmission
} from '../../../services/graph/corpusProjectionContract.mjs';
import {readCorpusProjectionReceipt} from '../../../services/graph/corpusProjectionReceiptStore.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

function estimatePayloadTokens(payload) {
    const text = payload === undefined || payload === null ? '' : String(payload);
    return bytesToTokens(Buffer.byteLength(text, 'utf8'));
}

function isTriVectorFailureDescriptor(value) {
    return value?.ok === false;
}

function getTriVectorFailureAttempts(failure) {
    return Number.isFinite(failure?.evidence?.attempts) ? failure.evidence.attempts : 1;
}

function getTriVectorFailureKind(failure) {
    return failure?.deferReason || failure?.frictionSymptom || 'typed-failure';
}

function getTriVectorFailureMessage(failure) {
    return failure?.evidence?.note ||
           failure?.evidence?.errorMessage ||
           `tri-vector extraction failed (${getTriVectorFailureKind(failure)})`;
}

/**
 * @summary Identifies parser-size failures that must leave the steady REM cadence immediately.
 *
 * Schema failures can still use the historical max-attempts gate; a provider-size
 * failure has already proven that re-serving the same payload just re-pays the
 * model lock cost next cycle.
 *
 * @param {Object|null} failure Typed Tri-Vector failure descriptor.
 * @returns {Boolean}
 */
function isImmediateCadenceTerminalFailure(failure) {
    return failure?.terminalForCadence === true &&
        ['size-precheck-skip', 'context-overflow'].includes(failure?.frictionSymptom);
}

/**
 * @summary Returns true for digest states excluded from the steady REM cadence.
 * @param {String} state
 * @returns {Boolean}
 */
function isSteadyCadenceExcludedDigestState(state) {
    return state === 'deferred' || state === 'undigestible';
}

/**
 * @summary Decides whether a summary row still has Dream work for its current raw-input revision.
 *
 * Revision-aware rows ignore preserved legacy booleans: completion is current only when
 * `dreamCompletedRevision` equals the synthesis-owned `dreamInputRevision`. Terminal cadence
 * states are likewise scoped by `dreamStateRevision`, so an old `undigestible` result cannot hide
 * a newly synthesized input frontier. Rows predating the revision contract retain the bounded
 * legacy boolean/state behavior.
 *
 * Retire the legacy branch after a migration audit reports zero retained summary rows without
 * `dreamInputRevision` for one complete summary-retention window.
 *
 * @param {Object} meta Session-summary metadata.
 * @returns {Boolean}
 */
function isDreamDigestPending(meta) {
    const currentRevision = typeof meta?.dreamInputRevision === 'string' && meta.dreamInputRevision
        ? meta.dreamInputRevision
        : null;

    if (currentRevision) {
        if (meta.dreamCompletedRevision === currentRevision) {
            return false;
        }

        return !(
            meta.dreamStateRevision === currentRevision &&
            isSteadyCadenceExcludedDigestState(meta.digestState)
        );
    }

    return meta?.graphDigested !== true &&
        meta?.graphDigested !== 'true' &&
        !isSteadyCadenceExcludedDigestState(meta?.digestState);
}

/**
 * @summary Reads one complete, de-duplicated raw-turn snapshot for Dream processing.
 *
 * The paging contract mirrors SessionService synthesis so both sides observe the same unbounded
 * input frontier instead of independently accepting Chroma's default result cap. Returned
 * documents are canonicalized before revision verification and are passed unchanged through the
 * remaining Dream phases.
 *
 * @param {Object} collection Memory Chroma collection.
 * @param {String} sessionId Session id to fetch.
 * @returns {Promise<{ids:String[],documents:String[],metadatas:Object[]}>}
 */
async function readSessionTurnInputSnapshot(collection, sessionId) {
    const configuredLimit = aiConfig.summarizationBatchLimit;
    if (!Number.isFinite(configuredLimit)) {
        throw new Error('[DreamService] Required AiConfig leaf "summarizationBatchLimit" is missing or invalid. Update ai/mcp/server/memory-core/config.mjs from config.template.mjs.');
    }

    const
        limit    = Math.max(1, Math.floor(configuredLimit)),
        snapshot = {ids: [], documents: [], metadatas: []},
        seenIds  = new Set();
    let offset = 0;

    while (true) {
        const page = await collection.get({
            where  : {sessionId},
            include: ['documents', 'metadatas'],
            limit,
            offset
        });
        const pageCount = page.ids?.length || 0;

        if (pageCount === 0) break;

        let addedThisPage = 0;

        for (let index = 0; index < pageCount; index++) {
            const id = page.ids[index];
            if (seenIds.has(id)) continue;

            const metadata = page.metadatas?.[index] || {};

            seenIds.add(id);
            snapshot.ids.push(id);
            snapshot.documents.push(resolveTurnDocumentForRead({
                documents: [page.documents?.[index]],
                metadata
            }));
            snapshot.metadatas.push(metadata);
            addedThisPage++;
        }

        if (addedThisPage === 0) break;

        offset += pageCount;
    }

    return canonicalizeSessionTurnInput(snapshot);
}

function toErrorMessage(error) {
    return error && error.message !== undefined ? String(error.message) : String(error);
}

function nonEmptyValue(value, fallback) {
    return value === undefined || value === null || value === '' ? fallback : value;
}

function getLastFailedPhase(perPhaseStates) {
    for (let i = perPhaseStates.length - 1; i >= 0; i--) {
        if (perPhaseStates[i].status === 'failed') {
            return perPhaseStates[i].phase;
        }
    }
    return 'processUndigestedSessions';
}

function finishPhase(phase, startedAt, status, details = {}) {
    return createRemPhaseState({
        phase,
        startedAt,
        completedAt: Date.now(),
        status,
        details
    });
}

function resolveSessionTimestamp(meta = {}) {
    const value = meta.timestamp ?? meta.lastActivity ?? meta.updatedAt ?? meta.createdAt;

    if (Number.isFinite(value)) {
        return value;
    }

    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
        return numeric;
    }

    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function compareSessionRows(direction) {
    return (a, b) => {
        const diff = resolveSessionTimestamp(a.meta) - resolveSessionTimestamp(b.meta);

        if (diff !== 0) {
            return direction === 'ASC' ? diff : -diff;
        }

        return String(a.id).localeCompare(String(b.id));
    }
}

function addUndigestedRowsFromBatch(batch, byId) {
    if (!batch?.ids?.length) {
        return;
    }

    for (let i = 0; i < batch.ids.length; i++) {
        const meta = batch.metadatas?.[i];

        // Revision-aware rows are eligible on current/completed mismatch even when a preserved
        // legacy `graphDigested:true` or terminal state belongs to an older input frontier.
        if (meta && isDreamDigestPending(meta)) {
            byId.set(batch.ids[i], {
                id      : batch.ids[i],
                document: batch.documents?.[i],
                meta
            });
        }
    }
}

function splitFreshAndAgedUndigested(rows, maxToProcess) {
    if (maxToProcess <= 0 || rows.length === 0) {
        return [];
    }

    const undigestedSessionFreshReserve = aiConfig.undigestedSessionFreshReserve;

    if (!Number.isFinite(undigestedSessionFreshReserve)) {
        throw new Error('[DreamService] Required AiConfig leaf "undigestedSessionFreshReserve" is missing or invalid. Update ai/mcp/server/memory-core/config.mjs from config.template.mjs.');
    }

    const reserve  = maxToProcess > 1 ? Math.min(undigestedSessionFreshReserve, maxToProcess - 1) : maxToProcess;
    const fresh    = [...rows].sort(compareSessionRows('DESC')).slice(0, reserve);
    const freshIds = new Set(fresh.map(row => row.id));
    const aged     = [...rows]
        .filter(row => !freshIds.has(row.id))
        .sort(compareSessionRows('ASC'))
        .slice(0, maxToProcess - fresh.length);

    return [...fresh, ...aged];
}

/**
 * @summary Service for offline GraphRAG extraction ("REM Sleep").
 *
 * Scans recent session summaries from the `neo-agent-sessions` collection that have not
 * yet been formally digested into Graph Nodes and Edges. Uses the configured model provider
 * via configurable model to extract formal graph structures from episodic memories.
 *
 * @class Neo.ai.daemons.DreamService
 * @extends Neo.core.Base
 * @singleton
 */
class DreamService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.daemons.DreamService'
         * @protected
         */
        className: 'Neo.ai.daemons.DreamService',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true,
        /**
         * @member {Object|null} sessionsCollection_=null
         * @protected
         * @reactive
         */
        sessionsCollection_: null,
        /**
         * @member {Boolean} isProcessing_=false
         * @protected
         * @reactive
         */
        isProcessing_: false
    }

    /**
     * @returns {Promise<void>}
     */
    async initAsync() {
        await super.initAsync();

        // Wait for ChromaManager to be ready (connected)
        await StorageRouter.ready();
        this.sessionsCollection = await StorageRouter.getSummaryCollection();

        // Inter-service dependency lock: ready() reflects the full lifecycle boot (GraphService.db
        // mounted included) — the former `_initPromise` reach-in below it was dead code, since
        // SystemLifecycleService never assigned that field.
        const LifecycleService = (await import('../../../services.mjs')).Memory_LifecycleService;
        await LifecycleService.ready();
    }

    /**
     * Identifies session summaries whose current raw-input revision lacks a matching Dream
     * completion. Revision-aware rows use `dreamInputRevision === dreamCompletedRevision`; the
     * legacy `graphDigested`/terminal-state gate remains only for rows predating that contract.
     *
     * The scan samples both the fresh head and aged tail of the Chroma summary collection, then splits
     * the returned REM batch across newest and oldest undigested summaries. This mirrors the
     * miniSummary backfill pattern: keep a small fresh reserve for recent work, while the aged drain
     * steadily reaches long-lived projection lag instead of re-serving the same head window forever.
     *
     * @returns {Promise<Object[]>} List of metadata objects for undigested sessions
     */
    async findUndigestedSessions() {
        // Since ChromaDB filtering on missing attributes can be tricky depending on version,
        // filter in memory after sampling the collection head and tail. Chroma does not expose
        // SQL-style ORDER BY, so metadata timestamps define the fresh/aged split.
        const summarizationBatchLimit = aiConfig.summarizationBatchLimit,
              remSleepBatchLimit      = aiConfig.remSleepBatchLimit;

        if (!Number.isFinite(summarizationBatchLimit)) {
            throw new Error('[DreamService] Required AiConfig leaf "summarizationBatchLimit" is missing or invalid. Update ai/mcp/server/memory-core/config.mjs from config.template.mjs.');
        }
        if (!Number.isFinite(remSleepBatchLimit)) {
            throw new Error('[DreamService] Required AiConfig leaf "remSleepBatchLimit" is missing or invalid. Update ai/mcp/server/memory-core/config.mjs from config.template.mjs.');
        }

        const limit        = Math.max(1, Math.floor(summarizationBatchLimit));
        const maxToProcess = Math.max(0, Math.floor(remSleepBatchLimit));

        if (maxToProcess === 0) {
            return [];
        }

        try {
            const byId      = new Map();
            const readBatch = offset => this.sessionsCollection.get({
                include: ['metadatas', 'documents'],
                limit,
                offset
            });

            addUndigestedRowsFromBatch(await readBatch(0), byId);

            let collectionCount = null;
            if (typeof this.sessionsCollection.count === 'function') {
                try {
                    collectionCount = await this.sessionsCollection.count();
                } catch (error) {
                    logger.warn(`[DreamService] count() failed while preparing aged undigested-session scan; using head window only: ${error.message}`);
                }
            }

            const tailOffset = Number.isFinite(collectionCount) ? Math.max(0, collectionCount - limit) : 0;
            if (tailOffset > 0) {
                addUndigestedRowsFromBatch(await readBatch(tailOffset), byId);
            }

            if (byId.size === 0) {
                return [];
            }

            return splitFreshAndAgedUndigested([...byId.values()], maxToProcess);
        } catch (error) {
            logger.error('[DreamService] Error querying undigested sessions:', error);
            return [];
        }
    }

    /**
     * @summary Resolves the D2 issues-facet admission at the REM graph-commit boundary.
     * A failed admission excludes only ISSUE nodes/edges; the session's independent deterministic
     * and semantic phases continue so projection lag cannot freeze the REM pipeline.
     * @param {Object} [options]
     * @param {Object} [options.config=AiConfig.orchestrator.corpusProjection]
     * @param {Function} [options.readReceipt=readCorpusProjectionReceipt]
     * @returns {Promise<Object>}
     */
    async getCorpusProjectionAdmission({
        config = AiConfig.orchestrator.corpusProjection,
        readReceipt = readCorpusProjectionReceipt
    } = {}) {
        if (!config.enabled) {
            return {
                admitted      : true,
                fallback      : 'current',
                reasonCode    : 'projection-gate-disabled',
                requiredFacets: ['issues'],
                staleFacets   : []
            }
        }

        let receipt = null;

        try {
            receipt = await readReceipt(config.receiptPath)
        } catch (error) {
            logger.warn(`[DreamService] Corpus projection receipt unavailable at REM commit: ${error.message}`)
        }

        return evaluateCorpusProjectionAdmission({
            consumer                : CORPUS_PROJECTION_CONSUMER.dreamRem,
            receipt,
            expectedSourceRepository: config.sourceRepository,
            expectedSourceRef       : config.sourceRef
        })
    }

    /**
     * @summary Runs the REM digest pipeline for sessions that are not yet marked graph-digested.
     *
     * The DreamService REM pipeline hydrates raw episodic memories, syncs deterministic
     * MEMORY/SESSION graph nodes via `MemorySessionIngestor`, then runs Tri-Vector semantic
     * extraction and ambient graph ingestion. Revision-aware rows first verify that the complete
     * raw-turn snapshot still matches the synthesis-published `dreamInputRevision`, then pass that
     * same immutable snapshot to deterministic ingestion. Completion records the exact processed
     * revision through a Dream-owned partial metadata update, so a late completion for A cannot
     * overwrite or hide a concurrently published B. The legacy `graphDigested` marker remains a
     * compatibility overlay and is only written after every required phase completes without
     * reported errors.
     * @param {Object} [options]
     * @param {Function} [options.fetchProviderModelIds=fetchOpenAiCompatibleModelIds] Provider-model discovery seam.
     * @param {Number} [options.cycleBudgetMs] Wall-clock budget for the session-digest loop; sessions past it
     * are deferred to the next cycle so the caller-held heavy lease releases at the task boundary. At least one
     * session is always digested per cycle. Defaults to the `dreamCycleBudgetMs` leaf; `0` disables.
     * @param {Function} [options.nowFn=Date.now] Clock seam for the budget arithmetic; fixtures inject a
     * stepping clock while production defaults to `Date.now`.
     */
    async processUndigestedSessions({
        fetchProviderModelIds = fetchOpenAiCompatibleModelIds,
        cycleBudgetMs         = AiConfig.orchestrator.intervals.dreamCycleBudgetMs,
        nowFn                 = Date.now
    } = {}) {
        if (this.isProcessing) {
            logger.debug('[DreamService] REM pipeline is already running. Skipping trigger.');
            return {
                perPhaseStates   : [finishPhase('concurrentGuard', Date.now(), 'skipped', {reasonCode: 'already-processing'})],
                perSessionStates : [],
                sessionsProcessed: 0,
                sessionsDeferred : 0
            };
        }

        this.isProcessing = true;
        const cycleStartedAt    = nowFn();
        const perPhaseStates    = [];
        const perSessionStates  = [];
        let   sessionsProcessed = 0,
              sessionsDeferred  = 0;

        if (aiConfig.graphProvider === 'openAiCompatible') {
            const providerStart = Date.now();
            try {
                await fetchProviderModelIds({
                    host      : aiConfig.openAiCompatible.host,
                    timeoutMs : AiConfig.orchestrator.providerReadiness.timeoutMs,
                    freshness : 'routine',
                    cacheTtlMs: AiConfig.orchestrator.providerReadiness.routineCacheTtlMs
                });
                perPhaseStates.push(finishPhase('legacyProviderProbe', providerStart, 'completed', {
                    provider: aiConfig.graphProvider
                }));
            } catch (e) {
                logger.error('[DreamService] API provider service is unreachable. Aborting REM pipeline to prevent queue failures.');
                this.isProcessing = false;
                perPhaseStates.push(finishPhase('legacyProviderProbe', providerStart, 'failed', {
                    provider: aiConfig.graphProvider,
                    error   : toErrorMessage(e)
                }));
                return {perPhaseStates, perSessionStates, sessionsProcessed: 0, sessionsDeferred: 0};
            }
        }

        try {
            const sessionQueryStart = Date.now();
            const sessions          = await this.findUndigestedSessions();
            perPhaseStates.push(finishPhase('sessionQuery', sessionQueryStart, 'completed', {
                sessionsFound: sessions.length
            }));

            if (sessions.length === 0) {
                logger.info('[DreamService] No undigested session memories found. Proceeding to ambient task execution.');
            } else {
                logger.info(`[DreamService] Found ${sessions.length} undigested session(s). Beginning REM pipeline...`);

                // Phase 0a: Ingest local ADRs as deterministic graph nodes before any LLM
                // extraction while keeping ADRs out of the Tri-Vector VALID_TYPES enum.
                const adrIngestStart = Date.now();
                try {
                    await AdrIngestor.syncAdrsToGraph();
                    perPhaseStates.push(finishPhase('adrIngest', adrIngestStart, 'completed'));
                } catch (e) {
                    perPhaseStates.push(finishPhase('adrIngest', adrIngestStart, 'failed', {
                        error: toErrorMessage(e)
                    }));
                    throw e;
                }

                // Phase 0b: Ingest the version-controlled Concept Ontology (.neo-ai-data/concepts/*.jsonl)
                // into the Native Edge Graph as first-class CONCEPT nodes + typed edges. Runs BEFORE
                // FileSystemIngestor so downstream gap inference can traverse concept-graph relationships
                // deterministically instead of regex-matching token lists against file paths.
                const conceptIngestStart = Date.now();
                try {
                    await ConceptIngestor.syncConceptsToGraph();
                    perPhaseStates.push(finishPhase('conceptIngest', conceptIngestStart, 'completed'));
                } catch (e) {
                    perPhaseStates.push(finishPhase('conceptIngest', conceptIngestStart, 'failed', {
                        error: toErrorMessage(e)
                    }));
                    throw e;
                }

                // Phase 1: Ingest Live Workspace Files for Gap Analysis context mapping
                const workspaceIngestStart = Date.now();
                try {
                    await FileSystemIngestor.syncWorkspaceToGraph();
                    perPhaseStates.push(finishPhase('workspaceIngest', workspaceIngestStart, 'completed'));
                } catch (e) {
                    perPhaseStates.push(finishPhase('workspaceIngest', workspaceIngestStart, 'failed', {
                        error: toErrorMessage(e)
                    }));
                    throw e;
                }

                for (const session of sessions) {
                    // Cycle budget: a cooperative clip at the session boundary. The lease belongs to the
                    // caller and releases when this method returns, so exceeding the budget defers the
                    // remaining sessions to the next cycle instead of holding the lane for hours — the
                    // saturated outcome re-queues it through the existing backlog catch-up. The check sits
                    // AFTER the first session so a tight budget throttles without stalling forward progress.
                    if (cycleBudgetMs > 0 && sessionsProcessed > 0 && nowFn() - cycleStartedAt >= cycleBudgetMs) {
                        sessionsDeferred = sessions.length - sessionsProcessed;
                        perPhaseStates.push(finishPhase('cycleBudget', nowFn(), 'completed', {
                            reasonCode: 'budget-exhausted',
                            budgetMs  : cycleBudgetMs,
                            elapsedMs : nowFn() - cycleStartedAt,
                            sessionsDeferred
                        }));
                        logger.info(`[DreamService] REM cycle budget ${cycleBudgetMs}ms exhausted after ${sessionsProcessed} session(s); deferring ${sessionsDeferred} to the next cycle.`);
                        break;
                    }

                    sessionsProcessed++;
                    logger.info(`[DreamService] Preparing session ${session.meta.sessionId} ("${session.meta.title}") for REM extraction.`);

                    const selectedDreamInputRevision = typeof session.meta.dreamInputRevision === 'string'
                        ? session.meta.dreamInputRevision
                        : null;
                    const inputRevisionStartedAt = Date.now();
                    let   rawEpisodicMemory      = session.document,
                        turnDocuments            = [session.document],
                        rawMemories              = null,
                        processedInputRevision   = null,
                        inputRevisionError       = null;
                    try {
                        const memoryCollection = await StorageRouter.getMemoryCollection();
                        if (memoryCollection) {
                            rawMemories = await readSessionTurnInputSnapshot(
                                memoryCollection,
                                session.meta.sessionId
                            );
                            if (rawMemories?.documents?.length > 0) {
                                // Send the full raw memory to the LLM. Lossless context tracking is required.
                                // If local APIs crash, it is a configuration issue with n_ctx, not a client logic error.
                                turnDocuments     = rawMemories.documents;
                                rawEpisodicMemory = turnDocuments.join('\n\n---\n\n');
                            }
                        }

                        if (selectedDreamInputRevision) {
                            if (!rawMemories?.ids?.length) {
                                throw new Error('published Dream input revision has no raw-turn snapshot');
                            }

                            processedInputRevision = computeSessionTurnInputRevision(rawMemories);
                            if (processedInputRevision !== selectedDreamInputRevision) {
                                throw new Error(
                                    `Dream input revision moved before processing ` +
                                    `(${selectedDreamInputRevision} -> ${processedInputRevision})`
                                );
                            }
                        }
                    } catch (e) {
                        logger.warn(`[DreamService] Could not fetch raw memories for ${session.meta.sessionId}`, e);
                        if (selectedDreamInputRevision) {
                            inputRevisionError = e;
                        }
                    }

                    session.document      = rawEpisodicMemory;
                    session.turnDocuments = turnDocuments;
                    logger.info(`[DreamService]   -> Payload size (chars): ${session.document.length}`);

                    const sessionState = {
                        sessionId                : session.meta.sessionId,
                        payloadSizeTokens        : estimatePayloadTokens(session.document),
                        memorySessionIngest      : {status: 'skipped', errorReasons: []},
                        triVector                : {status: 'skipped', attempts: 0},
                        topology                 : {status: 'skipped', conflictCount: 0},
                        gapSession               : {status: 'skipped'},
                        corpusProjectionAdmission: null,
                        graphDigestedFlag        : false,
                        dreamInputRevision       : selectedDreamInputRevision,
                        processedInputRevision,
                        failureReasons           : []
                    };
                    perSessionStates.push(sessionState);

                    if (inputRevisionError) {
                        const error = toErrorMessage(inputRevisionError);

                        sessionState.failureReasons.push(error);
                        perPhaseStates.push(finishPhase('inputRevision', inputRevisionStartedAt, 'failed', {
                            sessionId: session.meta.sessionId,
                            error
                        }));
                        logger.warn(`[DreamService] Session ${session.meta.sessionId} input revision is stale or unavailable; leaving it pending.`, inputRevisionError);
                        continue;
                    }

                    // Phase 2a: Memory/Session graph ingestion — runs BEFORE SemanticGraphExtractor
                    // so future provenance edges from extracted entities attach to real
                    // MEMORY/SESSION nodes rather than dangling at `sessionId` scalars. Deterministic
                    // Chroma-ID → graph-node mapping; no LLM cost, idempotent via payloadHash.
                    const ingestStart = Date.now();
                    let ingestStats;
                    try {
                        ingestStats = await MemorySessionIngestor.syncSessionToGraph(
                            session,
                            rawMemories?.ids?.length ? {rawMemories} : undefined
                        );
                    } catch (e) {
                        sessionState.memorySessionIngest = {
                            status      : 'failed',
                            errorReasons: [toErrorMessage(e)]
                        };
                        sessionState.failureReasons.push(toErrorMessage(e));
                        perPhaseStates.push(finishPhase('memorySessionIngest', ingestStart, 'failed', {
                            sessionId: session.meta.sessionId,
                            error    : toErrorMessage(e)
                        }));
                        logger.warn(`[DreamService] Session ${session.meta.sessionId} failed during memory/session graph ingestion; continuing REM batch.`, e);
                        continue;
                    }
                    const rawIngestErrors = Array.isArray(ingestStats.errors) ? ingestStats.errors : [];
                    const ingestErrors    = rawIngestErrors.length;
                    const ingestTime      = ((Date.now() - ingestStart) / 1000).toFixed(1);
                    logger.info(`[DreamService]   -> Memory/Session graph ingestion took: ${ingestTime}s (${ingestStats.memoriesUpserted} upserted, ${ingestStats.memoriesSkipped} skipped, ${ingestErrors} errors)`);

                    const ingestErrorReasons = rawIngestErrors.map(item => toErrorMessage(item));

                    sessionState.memorySessionIngest = {
                        status      : ingestErrors > 0 ? 'failed' : 'completed',
                        errorReasons: ingestErrorReasons
                    };
                    if (ingestErrors > 0) {
                        sessionState.failureReasons.push(...ingestErrorReasons);
                    }
                    perPhaseStates.push(finishPhase('memorySessionIngest', ingestStart, ingestErrors > 0 ? 'failed' : 'completed', {
                        sessionId       : session.meta.sessionId,
                        memoriesUpserted: ingestStats.memoriesUpserted,
                        memoriesSkipped : ingestStats.memoriesSkipped,
                        errors          : ingestErrors
                    }));

                    if (ingestErrors > 0) {
                        logger.warn(`[DreamService] Session ${session.meta.sessionId} had ${ingestErrors} memory-ingestion error(s); graphDigested will NOT be set this cycle.`);
                    }

                    const startTime = Date.now();
                    let extractionResult;
                    try {
                        extractionResult = await SemanticGraphExtractor.executeTriVectorExtraction(session, {
                            beforeCommit: async () => {
                                const admissionStartedAt = Date.now();
                                const admission          = await this.getCorpusProjectionAdmission();

                                sessionState.corpusProjectionAdmission = admission;
                                perPhaseStates.push(finishPhase(
                                    'corpusProjectionAdmission',
                                    admissionStartedAt,
                                    admission.admitted ? 'completed' : 'skipped',
                                    {
                                        sessionId  : session.meta.sessionId,
                                        reasonCode : admission.reasonCode,
                                        staleFacets: admission.staleFacets
                                    }
                                ));

                                if (!admission.admitted) {
                                    logger.warn(
                                        `[DreamService] REM continuing without ISSUE projection for ` +
                                        `${session.meta.sessionId}: ${admission.reasonCode}`
                                    )
                                }

                                return {excludedNodeTypes: admission.admitted ? [] : ['ISSUE']}
                            }
                        });
                    } catch (e) {
                        sessionState.triVector = {
                            status   : 'failed',
                            attempts : 1,
                            errorKind: toErrorMessage(e)
                        };
                        sessionState.failureReasons.push(toErrorMessage(e));
                        perPhaseStates.push(finishPhase('triVector', startTime, 'failed', {
                            sessionId: session.meta.sessionId,
                            error    : toErrorMessage(e)
                        }));
                        logger.warn(`[DreamService] Session ${session.meta.sessionId} failed during Tri-Vector extraction; continuing REM batch.`, e);
                        continue;
                    }
                    const triVectorTime = ((Date.now() - startTime) / 1000).toFixed(1);
                    logger.info(`[DreamService]   -> Tri-Vector Synthesis took: ${triVectorTime}s`);
                    const extractionFailure = isTriVectorFailureDescriptor(extractionResult) ? extractionResult : null;
                    const success           = extractionResult && !extractionFailure;
                    sessionState.triVector = {
                        status   : success ? 'completed' : 'failed',
                        attempts : extractionFailure ? getTriVectorFailureAttempts(extractionFailure) : 1,
                        errorKind: success ? undefined : (extractionFailure ? getTriVectorFailureKind(extractionFailure) : 'null-result')
                    };
                    if (extractionFailure) {
                        sessionState.triVector.deferReason        = extractionFailure.deferReason;
                        sessionState.triVector.frictionSymptom    = extractionFailure.frictionSymptom;
                        sessionState.triVector.terminalForCadence = extractionFailure.terminalForCadence === true;
                        sessionState.triVector.evidence           = extractionFailure.evidence;
                    }
                    if (!success) {
                        sessionState.failureReasons.push(extractionFailure ? getTriVectorFailureMessage(extractionFailure) : 'tri-vector extraction returned null');
                    }
                    perPhaseStates.push(finishPhase('triVector', startTime, success ? 'completed' : 'failed', {
                        sessionId  : session.meta.sessionId,
                        deferReason: extractionFailure?.deferReason
                    }));

                    const topoStart     = Date.now();
                    let   conflictCount = 0,
                          topologyDetails = {};
                    try {
                        const topologyResult = await TopologyInferenceEngine.extractTopology(session.document, session.meta.sessionId, {
                            turnDocuments: session.turnDocuments
                        });
                        conflictCount = await TopologyInferenceEngine.getTopologyConflictCount();
                        if (topologyResult?.chunks) {
                            topologyDetails = {
                                chunks : topologyResult.chunks,
                                chunked: topologyResult.chunked
                            };
                        }
                    } catch (e) {
                        sessionState.topology = {
                            status       : 'failed',
                            conflictCount: 0
                        };
                        sessionState.failureReasons.push(toErrorMessage(e));
                        perPhaseStates.push(finishPhase('topology', topoStart, 'failed', {
                            sessionId: session.meta.sessionId,
                            error    : toErrorMessage(e)
                        }));
                        logger.warn(`[DreamService] Session ${session.meta.sessionId} failed during topology inference; continuing REM batch.`, e);
                        continue;
                    }
                    const topoTime = ((Date.now() - topoStart) / 1000).toFixed(1);
                    logger.info(`[DreamService]   -> Topological Conflicts took: ${topoTime}s`);
                    sessionState.topology = {
                        status: 'completed',
                        conflictCount,
                        ...topologyDetails
                    };
                    perPhaseStates.push(finishPhase('topology', topoStart, 'completed', {
                        sessionId: session.meta.sessionId,
                        conflictCount,
                        ...topologyDetails
                    }));

                    const capStart = Date.now();
                    try {
                        await this.inferTestGapsFromSession(success ? extractionResult : null);
                    } catch (e) {
                        sessionState.gapSession = {
                            status      : 'failed',
                            errorReasons: [toErrorMessage(e)]
                        };
                        sessionState.failureReasons.push(toErrorMessage(e));
                        perPhaseStates.push(finishPhase('gapSession', capStart, 'failed', {
                            sessionId: session.meta.sessionId,
                            error    : toErrorMessage(e)
                        }));
                        logger.warn(`[DreamService] Session ${session.meta.sessionId} failed during TEST_GAP inference; continuing REM batch.`, e);
                        continue;
                    }
                    const capTime = ((Date.now() - capStart) / 1000).toFixed(1);
                    logger.info(`[DreamService]   -> Session TEST_GAP Inference took: ${capTime}s`);
                    sessionState.gapSession = {status: 'completed'};
                    perPhaseStates.push(finishPhase('gapSession', capStart, 'completed', {
                        sessionId: session.meta.sessionId
                    }));

                    logger.info(`[DreamService] Total Session Digest Time: ${((Date.now() - startTime) / 1000).toFixed(1)}s`);

                    if (success && ingestErrors === 0) {
                        const revisionMetadata = processedInputRevision
                            ? {
                                dreamCompletedRevision: processedInputRevision,
                                dreamStateRevision    : processedInputRevision
                            }
                            : {};

                        await this.sessionsCollection.update({
                            ids      : [session.id],
                            metadatas: [{
                                graphDigested: true,
                                digestState  : 'digested',
                                ...revisionMetadata
                            }]
                        });
                        sessionState.graphDigestedFlag = true;
                        logger.info(`[DreamService] Session ${session.meta.sessionId} marked as graphDigested in Memory Core${processedInputRevision ? ` at ${processedInputRevision}` : ''}.`);
                    } else {
                        // Digest failed (typed extractor failure OR memory-ingestion errors). Bound the
                        // re-serve immediately for provider-size failures; ingestion errors and legacy
                        // bare-null returns stay retryable so a storage/transient failure never removes
                        // a digestible session from the steady cadence.
                        const priorDigestAttempts = selectedDreamInputRevision &&
                            session.meta.dreamStateRevision !== selectedDreamInputRevision
                            ? 0
                            : Number(session.meta.digestAttempts) || 0;
                        const digestAttempts    = priorDigestAttempts + 1;
                        const maxDigestAttempts = aiConfig.maxDigestAttempts;
                        if (!Number.isFinite(maxDigestAttempts)) {
                            throw new Error('[DreamService] Required AiConfig leaf "maxDigestAttempts" is missing or invalid. Update ai/mcp/server/memory-core/config.mjs from config.template.mjs.');
                        }
                        const terminalForCadence       = ingestErrors === 0 && extractionFailure?.terminalForCadence === true;
                        const immediateTerminalCadence = ingestErrors === 0 && isImmediateCadenceTerminalFailure(extractionFailure);
                        const deferReason              = ingestErrors > 0
                            ? 'ingestion-failure'
                            : (extractionFailure?.deferReason || 'schema-failure');
                        const digestState = immediateTerminalCadence || (terminalForCadence && digestAttempts >= maxDigestAttempts)
                            ? 'undigestible'
                            : 'undigested';

                        await this.sessionsCollection.update({
                            ids      : [session.id],
                            metadatas: [{
                                digestState,
                                digestAttempts,
                                deferReason,
                                ...(processedInputRevision
                                    ? {dreamStateRevision: processedInputRevision}
                                    : {})
                            }]
                        });
                        sessionState.digestState        = digestState;
                        sessionState.deferReason        = deferReason;
                        sessionState.digestAttempts     = digestAttempts;
                        sessionState.terminalForCadence = terminalForCadence;

                        if (digestState === 'undigestible') {
                            logger.warn(`[DreamService] Session ${session.meta.sessionId} marked 'undigestible' after ${digestAttempts} failed digest attempt(s) (reason: ${deferReason}); excluded from the steady REM cadence to stop the re-serve bleed.`);
                        } else {
                            logger.info(`[DreamService] Session ${session.meta.sessionId} digest failed (reason: ${deferReason}); attempt ${digestAttempts}/${maxDigestAttempts}, will retry next cycle.`);
                        }
                    }
                }

                // Neural Link action digest is cycle-scoped: it reads the shared forward audit
                // ledger once per REM cycle and adds weak runtime-interaction evidence without
                // erasing TEST_GAPs or synthesizing permanent Playwright coverage.
                const nlActionDigestStart = Date.now();
                try {
                    const nlActionDigest = await this.executeNLActionDigest();
                    logger.info(`[DreamService] Cycle-scope NL_ACTION Digest took: ${((Date.now() - nlActionDigestStart) / 1000).toFixed(1)}s`);
                    perPhaseStates.push(finishPhase(
                        'nlActionDigest',
                        nlActionDigestStart,
                        nlActionDigest?.status === 'skipped' ? 'skipped' : 'completed',
                        nlActionDigest
                    ));
                } catch (e) {
                    perPhaseStates.push(finishPhase('nlActionDigest', nlActionDigestStart, 'failed', {
                        error: toErrorMessage(e)
                    }));
                    throw e;
                }

                // Concept-graph gap inference is ontology-scoped: the output is identical
                // for every invocation within a single REM cycle, so running it once after
                // the session loop replaces redundant traversals.
                const conceptGapStart = Date.now();
                try {
                    await this.inferConceptGraphGaps();
                    logger.info(`[DreamService] Cycle-scope GUIDE_GAP / EXAMPLE_GAP Inference took: ${((Date.now() - conceptGapStart) / 1000).toFixed(1)}s`);
                    perPhaseStates.push(finishPhase('conceptGap', conceptGapStart, 'completed'));
                } catch (e) {
                    perPhaseStates.push(finishPhase('conceptGap', conceptGapStart, 'failed', {
                        error: toErrorMessage(e)
                    }));
                    throw e;
                }
            }

            // Universal Fade (Garbage Collection)
            const garbageCollectionStart = Date.now();
            try {
                await this.runGarbageCollection();
                perPhaseStates.push(finishPhase('garbageCollection', garbageCollectionStart, 'completed'));
            } catch (e) {
                perPhaseStates.push(finishPhase('garbageCollection', garbageCollectionStart, 'failed', {
                    error: toErrorMessage(e)
                }));
                throw e;
            }

            logger.info('[DreamService] REM pipeline completed.');
            return {perPhaseStates, perSessionStates, sessionsProcessed, sessionsDeferred};
        } catch (error) {
            logger.error('[DreamService] Failed to process undigested sessions:', error);
            error.remState = {perPhaseStates, perSessionStates};
            throw error;
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * @summary Unified canonical REM (Sandman) cycle entrypoint returning a typed cycle outcome envelope.
     *
     * The orchestrator periodic dream path previously mapped every non-throwing return
     * from `processUndigestedSessions()` to `completed`, hiding zero-session no-ops,
     * concurrent-invocation guards, and provider-unreachable early returns. This method
     * returns one of `completed | skipped | failed` so consumers route each path to
     * the correct task-state / health-telemetry surface.
     *
     * **Outcome status semantics:**
     * - `completed` — provider was ready, undigested sessions existed, processing finished
     *   without throw. `sessionsProcessed` carries the pre-call count.
     * - `skipped`   — ran successfully but did no work (concurrent-invocation guard,
     *   zero undigested sessions, dry-run). `skipReason` carries the diagnostic string.
     * - `failed`    — provider readiness gate rejected OR an in-pipeline throw was caught.
     *   Either `diagnostic` (for provider failure) or `error` (for throws) is populated.
     *
     * **Lease ownership stays with the caller.** The orchestrator periodic dream path
     * runs inside `MaintenanceBackpressureService`'s lease; the standalone Sandman CLI
     * runner acquires its own lease via `withHeavyMaintenanceLease`. Re-acquiring inside
     * this method would double-lease and deadlock, so this method is intentionally
     * lease-agnostic.
     *
     * @param {Object}  [options]
     * @param {String}  [options.reason]            Coordination string for logging + state model (e.g. `periodic-dream:3600000`).
     * @param {String}  [options.mode='periodic']   `'periodic' | 'manual' | 'cli'`.
     * @param {Boolean} [options.includeDecay=true] When true, runs `GraphService.decayGlobalTopology()` as the cycle-finalization step (24-hour Algorithmic Lock self-skips when not due).
     * @param {Boolean} [options.dryRun=false]      Probe-only mode; short-circuits to `skipped` after the readiness gate passes.
     * @param {Number}  [options.cycleBudgetMs]     Session-digest wall-clock budget, forwarded to `processUndigestedSessions`; a clipped cycle returns saturated so the backlog catch-up re-queues it. Defaults there to the `dreamCycleBudgetMs` leaf.
     * @param {Function} [options.nowFn]            Clock seam for the budget arithmetic, forwarded to `processUndigestedSessions`.
     * @returns {Promise<Object>} typed outcome envelope (see status semantics above).
     */
    async executeRemCycle({
        reason,
        mode         = 'periodic',
        includeDecay = true,
        dryRun       = false,
        cycleBudgetMs,
        nowFn
    } = {}) {
        const startedAtMs      = Date.now();
        const startedAt        = new Date(startedAtMs);
        const runId            = `rem-${crypto.randomUUID()}`;
        const perPhaseStates   = [];
        let   perSessionStates = [];

        const baseOutcome = {
            runId,
            reason,
            mode,
            startedAt        : startedAt.toISOString(),
            completedAt      : null,
            durationMs       : null,
            sessionsProcessed: null,
            sessionsDeferred : null,
            remBatchLimit    : null,
            remBatchSaturated: false,
            diagnostic       : null,
            skipReason       : null,
            error            : null
        };

        const finalize = async (status, extras = {}) => {
            const completedAtMs = Date.now();
            const completedAt   = new Date(completedAtMs).toISOString();
            const durationMs    = completedAtMs - startedAtMs;
            const outcome       = {
                ...baseOutcome,
                ...extras,
                status,
                completedAt,
                durationMs
            };

            try {
                const stateEntry = createRemRunStateEntry({
                    runId,
                    reason,
                    startedAt          : startedAtMs,
                    completedAt        : completedAtMs,
                    configuredCadenceMs: AiConfig.orchestrator.intervals.dreamMs,
                    overflowThreshold  : AiConfig.orchestrator.intervals.dreamOverflowThreshold,
                    outcome            : status,
                    reasonCode         : nonEmptyValue(extras.reasonCode, status),
                    failurePhase       : nonEmptyValue(extras.failurePhase, null),
                    failureReason      : nonEmptyValue(extras.failureReason, nonEmptyValue(extras.error?.message, nonEmptyValue(extras.diagnostic?.reason, null))),
                    perPhaseStates,
                    perSessionStates
                });

                if (stateEntry.cycleOverflowSignal) {
                    logger.warn(`[Orchestrator] REM cycle wall-clock ${stateEntry.wallClockMs}ms exceeded ${Math.round(AiConfig.orchestrator.intervals.dreamOverflowThreshold * 100)}% of configured cadence ${stateEntry.configuredCadenceMs}ms; back-to-back overlap risk`);
                }

                await appendRemRunState(stateEntry, {dir: aiConfig.remRunStateDir, retentionLimit: aiConfig.remRunRetentionLimit});
            } catch (e) {
                logger.error('[DreamService] Failed to write REM run state:', e);
                outcome.stateWriteError = toErrorMessage(e);
            }

            return outcome;
        };

        // Provider gate: abort with rich diagnostic when the configured graph provider
        // is unsupported or unreachable. Downstream pipeline calls would silently no-op
        // on missing provider; the typed `failed` envelope surfaces the root cause to
        // operator-facing health telemetry instead.
        let gate;
        const providerStart = Date.now();
        try {
            gate = await this.checkProviderReadiness();
            perPhaseStates.push(finishPhase('providerReady', providerStart, gate.ready ? 'completed' : 'failed', {
                diagnostic: nonEmptyValue(gate.diagnostic, null)
            }));
        } catch (e) {
            perPhaseStates.push(finishPhase('providerReady', providerStart, 'failed', {
                error: toErrorMessage(e)
            }));
            const message = toErrorMessage(e);
            return await finalize('failed', {
                reasonCode  : 'provider-readiness-threw',
                failurePhase: 'providerReady',
                error       : {message: `checkProviderReadiness threw: ${message}`, stack: e?.stack}
            });
        }
        if (!gate.ready) {
            return await finalize('failed', {
                reasonCode   : 'provider-unreachable',
                failurePhase : 'providerReady',
                failureReason: gate.diagnostic?.reason,
                diagnostic   : gate.diagnostic
            });
        }

        // Dry-run short-circuit: used by callers that want to verify readiness without
        // running the pipeline (e.g. operator probes, smoke tests).
        if (dryRun) {
            perPhaseStates.push(finishPhase('dryRun', Date.now(), 'skipped', {reasonCode: 'dry-run'}));
            return await finalize('skipped', {reasonCode: 'dry-run', skipReason: 'dry-run requested'});
        }

        // Concurrent-invocation guard: exposes the in-flight state as a stage outcome
        // rather than the prior debug-only log line that hid double-fires from operator
        // health telemetry.
        if (this.isProcessing) {
            perPhaseStates.push(finishPhase('concurrentGuard', Date.now(), 'skipped', {reasonCode: 'already-processing'}));
            return await finalize('skipped', {
                reasonCode: 'already-processing',
                skipReason: 'dreamService.isProcessing already true (concurrent invocation)'
            });
        }

        // Pre-count query: distinguishes the no-work `skipped` path from the
        // work-completed `completed` path without requiring a return-value refactor on
        // processUndigestedSessions. A pre-call query is cheaper than the alternative
        // of inspecting graph state after the fact.
        let sessionCount  = 0,
            remBatchLimit = null;
        const sessionQueryStart = Date.now();
        try {
            const undigested         = await this.findUndigestedSessions();
            const remSleepBatchLimit = aiConfig.remSleepBatchLimit;
            if (!Number.isFinite(remSleepBatchLimit)) {
                throw new Error('[DreamService] Required AiConfig leaf "remSleepBatchLimit" is missing or invalid. Update ai/mcp/server/memory-core/config.mjs from config.template.mjs.');
            }
            sessionCount = Array.isArray(undigested) ? undigested.length : 0;
            remBatchLimit = Math.max(0, Math.floor(remSleepBatchLimit));
            perPhaseStates.push(finishPhase('sessionQuery', sessionQueryStart, 'completed', {sessionsFound: sessionCount}));
        } catch (e) {
            const message = toErrorMessage(e);
            perPhaseStates.push(finishPhase('sessionQuery', sessionQueryStart, 'failed', {error: message}));
            return await finalize('failed', {
                reasonCode  : 'session-query-failed',
                failurePhase: 'sessionQuery',
                error       : {message: `findUndigestedSessions threw: ${message}`, stack: e?.stack}
            });
        }

        // No-work path: still run decay (it self-skips when the 24-hour Algorithmic
        // Lock isn't due) so decay cadence is not coupled to session-arrival cadence.
        if (sessionCount === 0) {
            if (includeDecay) {
                const decayStart = Date.now();
                try {
                    await GraphService.decayGlobalTopology();
                    perPhaseStates.push(finishPhase('decay', decayStart, 'completed', {sessionsProcessed: 0}));
                } catch (e) {
                    const message = toErrorMessage(e);
                    perPhaseStates.push(finishPhase('decay', decayStart, 'failed', {error: message}));
                    return await finalize('failed', {
                        reasonCode       : 'decay-failed',
                        failurePhase     : 'decay',
                        error            : {message: `decayGlobalTopology threw on zero-session path: ${message}`, stack: e?.stack},
                        sessionsProcessed: 0
                    });
                }
            }
            return await finalize('skipped', {
                reasonCode       : 'no-undigested-sessions',
                sessionsProcessed: 0,
                remBatchLimit,
                remBatchSaturated: false,
                skipReason       : 'no undigested sessions'
            });
        }

        // Work path: process sessions, then run decay as the cycle-finalization step
        // under the same lease window the caller already holds.
        try {
            const processStart  = Date.now();
            const processResult = await this.processUndigestedSessions({cycleBudgetMs, nowFn});
            if (Array.isArray(processResult?.perPhaseStates)) {
                perPhaseStates.push(...processResult.perPhaseStates);
            }
            const actualSessionsProcessed  = processResult?.sessionsProcessed ?? sessionCount;
            const sessionsDeferredByBudget = processResult?.sessionsDeferred ?? 0;
            perPhaseStates.push(finishPhase('processUndigestedSessions', processStart, 'completed', {
                sessionsProcessed: actualSessionsProcessed
            }));
            perSessionStates = Array.isArray(processResult?.perSessionStates) ? processResult.perSessionStates : [];

            if (includeDecay) {
                const decayStart = Date.now();
                try {
                    await GraphService.decayGlobalTopology();
                    perPhaseStates.push(finishPhase('decay', decayStart, 'completed', {sessionsProcessed: sessionCount}));
                } catch (e) {
                    perPhaseStates.push(finishPhase('decay', decayStart, 'failed', {
                        error: toErrorMessage(e)
                    }));
                    throw e;
                }
            }

            // A budget-clipped cycle reports saturated exactly like a count-clipped one: proven-remaining
            // backlog routes through the same catch-up cooldown, and the distinct reasonCode keeps the two
            // clip causes separable in run-state telemetry.
            return await finalize('completed', {
                reasonCode       : sessionsDeferredByBudget > 0 ? 'budget-clipped' : 'ok',
                sessionsProcessed: actualSessionsProcessed,
                sessionsDeferred : sessionsDeferredByBudget,
                remBatchLimit,
                remBatchSaturated: (remBatchLimit > 0 && sessionCount >= remBatchLimit) || sessionsDeferredByBudget > 0
            });
        } catch (e) {
            if (e.remState) {
                if (Array.isArray(e.remState.perPhaseStates)) {
                    perPhaseStates.push(...e.remState.perPhaseStates);
                }
                perSessionStates = Array.isArray(e.remState.perSessionStates) ? e.remState.perSessionStates : [];
            }

            const failedPhase = getLastFailedPhase(perPhaseStates);

            return await finalize('failed', {
                reasonCode       : 'extraction-failed',
                failurePhase     : failedPhase,
                sessionsProcessed: sessionCount,
                error            : {message: toErrorMessage(e), stack: e?.stack}
            });
        }
    }

    /**
     * @summary Probes the configured graph provider before invoking a graph-heavy REM cycle.
     *
     * Returns `{ready: true}` when the configured provider answers the HTTP probe,
     * `{ready: false, diagnostic}` when the provider is unsupported or the readiness
     * loop exhausts its retry budget. The diagnostic envelope carries the full
     * provider-failure context (provider name, host, model, attempts, elapsedMs,
     * nextAction prose) so callers can surface it through observability telemetry
     * without the operator tailing logs.
     *
     * Probe parameters flow from `aiConfig.orchestrator.providerReadiness` verbatim
     * (no module-level fallbacks per the config-as-SSOT contract). Daemon-context
     * invocations suppress the dot-progress writer used by the CLI runner.
     *
     * @returns {Promise<{ready: true} | {ready: false, diagnostic: Object}>}
     */
    async checkProviderReadiness() {
        const readinessConfig = assertProviderReadinessConfig(AiConfig.orchestrator.providerReadiness);
        const target          = getGraphProviderReadinessTarget();

        if (!target.supported) {
            return {
                ready     : false,
                diagnostic: createProviderFailureDiagnostic({
                    reason: 'UNSUPPORTED_GRAPH_PROVIDER'
                })
            };
        }

        const waitResult = await waitForProvider({
            attempts                : readinessConfig.attempts,
            delayMs                 : readinessConfig.delayMs,
            timeoutMs               : readinessConfig.timeoutMs,
            modelDiscoveryFreshness : 'routine',
            modelDiscoveryCacheTtlMs: readinessConfig.routineCacheTtlMs,
            output                  : {write: () => {}}
        });

        if (!waitResult.running) {
            return {
                ready     : false,
                diagnostic: createProviderFailureDiagnostic({waitResult})
            };
        }

        const ollamaReadinessConfig = buildOllamaReadinessConfig(AiConfig);
        const capacity              = ollamaReadinessConfig.roles.length > 0
            ? await ensureOllamaModelsReady({
                ...ollamaReadinessConfig,
                attempts    : readinessConfig.attempts,
                delayMs     : readinessConfig.delayMs,
                timeoutMs   : readinessConfig.timeoutMs,
                allowPartial: true
            })
            : await warnProviderParallelModelCapacity({
                config                  : AiConfig,
                timeoutMs               : readinessConfig.timeoutMs,
                modelDiscoveryFreshness : 'routine',
                modelDiscoveryCacheTtlMs: readinessConfig.routineCacheTtlMs
            });

        if (capacity?.degraded) {
            return {
                ready     : false,
                capacity,
                diagnostic: createProviderFailureDiagnostic({
                    reason: 'PROVIDER_MODEL_RESIDENCY_DEGRADED',
                    capacity
                })
            };
        }

        return {ready: true, capacity};
    }

    /**
     * Cycle-scoped GUIDE_GAP / EXAMPLE_GAP inference entry point. Delegates to
     * `GapInferenceEngine` for deterministic concept-graph edge traversal (`EXPLAINED_BY` /
     * `EXEMPLIFIED_BY`). Output depends only on ontology state, not on any individual session —
     * invoked once per REM cycle after the per-session loop, before `runGarbageCollection`.
     * Paired with `inferTestGapsFromSession` (session-scoped) to keep ontology-wide
     * and session-specific gap checks separated.
     */
    async inferConceptGraphGaps() {
        return GapInferenceEngine.inferConceptGraphGaps();
    }

    /**
     * Cycle-scoped Neural Link action digest entry point. Delegates to `GapInferenceEngine`
     * for deterministic `nl_action_log` inspection and weak `NL_ACTION_SEQUENCE -> VALIDATES`
     * evidence edges. Invoked once per REM cycle after the per-session TEST_GAP pass and before
     * concept-graph gap inference; it never removes TEST_GAPs because live agent interaction is
     * weaker than durable Playwright coverage.
     */
    async executeNLActionDigest() {
        return GapInferenceEngine.inferNlActionDigest();
    }

    /**
     * Session-scoped TEST_GAP inference entry point. Delegates to `GapInferenceEngine` for
     * structural-node (CLASS / METHOD / COMPONENT) test-file coverage checks keyed to the
     * current session's artifact. Invoked inside the REM loop once per session.
     * Paired with `inferConceptGraphGaps` (cycle-scoped) to keep ontology-wide
     * and session-specific gap checks separated.
     * @param {Object} payload The parsed Tri-Vector schema from `SemanticGraphExtractor`
     */
    async inferTestGapsFromSession(payload) {
        return GapInferenceEngine.inferTestGapsFromSession(payload);
    }

    /**
     * Concept discovery entry point. Delegates to `ConceptDiscoveryService` to mine
     * recurring architectural vocabulary from Memory Core session summaries and local GitHub
     * issue markdown. New candidates land in `.neo-ai-data/concepts/nodes.jsonl` with
     * `validated: false`, tier 3, low weight — silenced in `sandman_handoff.md` until a
     * curator promotes them via JSONL edit (git diff is the review surface).
     *
     * Safe to call standalone (CLI / one-off) or from a REM-cycle orchestrator. Does not
     * mutate the Native Edge Graph directly — `ConceptIngestor.syncConceptsToGraph` picks up
     * the new rows on its next run.
     * @returns {Promise<Object>} `{candidatesAdded, candidates}`
     */
    async runConceptDiscovery() {
        return ConceptDiscoveryService.runDiscoveryCycle();
    }

    /**
     * Scheduled process/MX concept discovery entry point. Delegates to
     * `ConceptDiscoveryService` so A2A-message vocabulary is drained outside the mailbox
     * hot path: cheap frequency pre-filter first, then one bounded Teaching-Test prompt for
     * top recurring terms, then `conceptHarvested` markers on processed MESSAGE nodes.
     * @returns {Promise<Object>} Message-harvest stats.
     */
    async runMessageConceptHarvest() {
        return ConceptDiscoveryService.runMessageConceptHarvest();
    }

    /**
     * Executes the global "Fade" algorithm across all Native Graph edges,
     * then executes Vector Apoptosis to clean up resulting orphaned nodes from the hybrid semantic space.
     */
    async runGarbageCollection() {
        return GraphMaintenanceService.runGarbageCollection();
    }

    /**
     * @deprecated Use GoldenPathSynthesizer.synthesizeGoldenPath() directly. Kept for backward compatibility and test stability.
     */
    async synthesizeGoldenPath() {
        return GoldenPathSynthesizer.synthesizeGoldenPath();
    }
}

export default Neo.setupClass(DreamService);
