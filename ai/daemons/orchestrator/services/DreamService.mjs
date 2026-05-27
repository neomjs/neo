import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { Memory_Config as aiConfig } from '../../../services.mjs';
import Base from '../../../../src/core/Base.mjs';
import { Memory_StorageRouter as StorageRouter } from '../../../services.mjs';
import { Memory_TextEmbeddingService as TextEmbeddingService } from '../../../services.mjs';
import { Memory_GraphService as GraphService } from '../../../services.mjs';
import Json from '../../../../src/util/Json.mjs';
import logger from '../../../mcp/server/memory-core/logger.mjs';
import ConceptDiscoveryService from '../../../services/ingestion/ConceptDiscoveryService.mjs';
import ConceptIngestor from '../../../services/ingestion/ConceptIngestor.mjs';
import FileSystemIngestor from '../../../services/memory-core/FileSystemIngestor.mjs';
import GapInferenceEngine from '../../../services/graph/GapInferenceEngine.mjs';
import GraphMaintenanceService from '../../../services/graph/GraphMaintenanceService.mjs';
import IssueIngestor from '../../../services/ingestion/IssueIngestor.mjs';
import MemorySessionIngestor from '../../../services/ingestion/MemorySessionIngestor.mjs';
import SemanticGraphExtractor from '../../../services/graph/SemanticGraphExtractor.mjs';
import TopologyInferenceEngine from '../../../services/graph/TopologyInferenceEngine.mjs';
import GoldenPathSynthesizer from '../../../services/graph/GoldenPathSynthesizer.mjs';
import AiConfig from '../../../config.mjs';
import {
    assertProviderReadinessConfig,
    createProviderFailureDiagnostic,
    getGraphProviderReadinessTarget,
    waitForProvider
} from '../../../services/graph/ProviderReadinessHelper.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

        // Inter-service dependency lock: ensure DB is ready BEFORE scheduling background work
        const LifecycleService = (await import('../../../services.mjs')).Memory_LifecycleService;
        await LifecycleService.ready();

        // Wait for the full lifecycle boot to ensure GraphService.db is mounted
        if (LifecycleService._initPromise) {
            await LifecycleService._initPromise;
        }

        if (aiConfig.data.autoDream) {
            logger.info('[Startup] DreamService: Checking for undigested session memories...');
            this.processUndigestedSessions().catch(e => logger.error('[Startup] DreamService failed:', e));
        }
    }

    /**
     * Identifies session summaries that do not have the 'graphDigested' metadata flag set to true.
     * @returns {Promise<Object[]>} List of metadata objects for undigested sessions
     */
    async findUndigestedSessions() {
        // Since ChromaDB filtering on missing attributes can be tricky depending on version,
        // we'll fetch recent sessions and filter in memory if the dataset is reasonable.
        // For production, we will just query specifically.
        const limit = aiConfig.summarizationBatchLimit || 2000;
        const maxToProcess = aiConfig.remSleepBatchLimit || 10;

        try {
            const batch = await this.sessionsCollection.get({
                include: ['metadatas', 'documents'],
                limit
            });

            if (!batch || !batch.ids.length) {
                return [];
            }

            const undigested = [];
            for (let i = 0; i < batch.ids.length; i++) {
                const meta = batch.metadatas[i];
                if (meta && meta.graphDigested !== true && meta.graphDigested !== 'true') {
                    undigested.push({
                        id: batch.ids[i],
                        document: batch.documents[i],
                        meta
                    });
                }
            }

            return undigested.slice(0, maxToProcess);
        } catch (error) {
            logger.error('[DreamService] Error querying undigested sessions:', error);
            return [];
        }
    }

    /**
     * @summary Runs the REM digest pipeline for sessions that are not yet marked graph-digested.
     *
     * The DreamService REM pipeline hydrates raw episodic memories, syncs deterministic
     * MEMORY/SESSION graph nodes via `MemorySessionIngestor`, then runs Tri-Vector semantic
     * extraction and ambient graph ingestion. The `graphDigested` marker is only safe after
     * both the deterministic memory/session ingestion and the semantic extractor complete
     * without reported errors; otherwise the next REM cycle must retry the partial graph work
     * instead of hiding missing nodes behind a completed digest flag.
     */
    async processUndigestedSessions() {
        if (this.isProcessing) {
            logger.debug('[DreamService] REM pipeline is already running. Skipping trigger.');
            return;
        }

        this.isProcessing = true;

        if (aiConfig.modelProvider === 'openAiCompatible') {
            try {
                const url = new URL('/v1/models', aiConfig.openAiCompatible.host || 'http://127.0.0.1:8000');
                const ping = await fetch(url.toString(), { method: 'GET', signal: AbortSignal.timeout(5000) });
                if (!ping.ok) throw new Error('API provider not running');
            } catch (e) {
                logger.error('[DreamService] API provider service is unreachable. Aborting REM pipeline to prevent queue failures.');
                this.isProcessing = false;
                return;
            }
        }

        try {
            const sessions = await this.findUndigestedSessions();
            if (sessions.length === 0) {
                logger.info('[DreamService] No undigested session memories found. Proceeding to ambient task execution.');
            } else {
                logger.info(`[DreamService] Found ${sessions.length} undigested session(s). Beginning REM pipeline...`);

                // Phase 0: Ingest the version-controlled Concept Ontology (.neo-ai-data/concepts/*.jsonl)
                // into the Native Edge Graph as first-class CONCEPT nodes + typed edges. Runs BEFORE
                // FileSystemIngestor so downstream gap inference can traverse concept-graph relationships
                // deterministically instead of regex-matching token lists against file paths.
                await ConceptIngestor.syncConceptsToGraph();

                // Phase 1: Ingest Live Workspace Files for Gap Analysis context mapping
                await FileSystemIngestor.syncWorkspaceToGraph();

                for (const session of sessions) {
                    logger.info(`[DreamService] Preparing session ${session.meta.sessionId} ("${session.meta.title}") for REM extraction.`);

                    let rawEpisodicMemory = session.document;
                    try {
                        const memoryCollection = await StorageRouter.getMemoryCollection();
                        if (memoryCollection) {
                            const rawMemories = await memoryCollection.get({
                                where: { sessionId: session.meta.sessionId },
                                include: ['documents']
                            });
                            if (rawMemories?.documents?.length > 0) {
                                // Send the full raw memory to the LLM. Lossless context tracking is required.
                                // If local APIs crash, it is a configuration issue with n_ctx, not a client logic error.
                                rawEpisodicMemory = rawMemories.documents.join('\n\n---\n\n');
                            }
                        }
                    } catch (e) {
                        logger.warn(`[DreamService] Could not fetch raw memories for ${session.meta.sessionId}`, e);
                    }

                    session.document = rawEpisodicMemory;
                    logger.info(`[DreamService]   -> Payload size (chars): ${session.document.length}`);

                    // Phase 2a: Memory/Session graph ingestion — runs BEFORE SemanticGraphExtractor
                    // so future provenance edges from extracted entities attach to real
                    // MEMORY/SESSION nodes rather than dangling at `sessionId` scalars. Deterministic
                    // Chroma-ID → graph-node mapping; no LLM cost, idempotent via payloadHash.
                    const ingestStart = Date.now();
                    const ingestStats = await MemorySessionIngestor.syncSessionToGraph(session);
                    const ingestErrors = ingestStats.errors?.length ?? 0;
                    const ingestTime = ((Date.now() - ingestStart) / 1000).toFixed(1);
                    logger.info(`[DreamService]   -> Memory/Session graph ingestion took: ${ingestTime}s (${ingestStats.memoriesUpserted} upserted, ${ingestStats.memoriesSkipped} skipped, ${ingestErrors} errors)`);

                    if (ingestErrors > 0) {
                        logger.warn(`[DreamService] Session ${session.meta.sessionId} had ${ingestErrors} memory-ingestion error(s); graphDigested will NOT be set this cycle.`);
                    }

                    const startTime = Date.now();
                    const success = await SemanticGraphExtractor.executeTriVectorExtraction(session);
                    const triVectorTime = ((Date.now() - startTime) / 1000).toFixed(1);
                    logger.info(`[DreamService]   -> Tri-Vector Synthesis took: ${triVectorTime}s`);

                    const topoStart = Date.now();
                    await TopologyInferenceEngine.extractTopology(session.document, session.meta.sessionId);
                    const topoTime = ((Date.now() - topoStart) / 1000).toFixed(1);
                    logger.info(`[DreamService]   -> Topological Conflicts took: ${topoTime}s`);

                    const capStart = Date.now();
                    await this.inferTestGapsFromSession(success);
                    const capTime = ((Date.now() - capStart) / 1000).toFixed(1);
                    logger.info(`[DreamService]   -> Session TEST_GAP Inference took: ${capTime}s`);

                    logger.info(`[DreamService] Total Session Digest Time: ${((Date.now() - startTime) / 1000).toFixed(1)}s`);

                    if (success && ingestErrors === 0) {
                        await this.sessionsCollection.update({
                            ids: [session.id],
                            metadatas: [{ ...session.meta, graphDigested: true }]
                        });
                        logger.info(`[DreamService] Session ${session.meta.sessionId} marked as graphDigested in Memory Core.`);
                    }
                }

                // Concept-graph gap inference is ontology-scoped: the output is identical
                // for every invocation within a single REM cycle, so running it once after
                // the session loop replaces redundant traversals.
                const conceptGapStart = Date.now();
                await this.inferConceptGraphGaps();
                logger.info(`[DreamService] Cycle-scope GUIDE_GAP / EXAMPLE_GAP Inference took: ${((Date.now() - conceptGapStart) / 1000).toFixed(1)}s`);
            }

            // Universal Fade (Garbage Collection)
            await this.runGarbageCollection();

            logger.info('[DreamService] REM pipeline completed.');
        } catch (error) {
            logger.error('[DreamService] Failed to process undigested sessions:', error);
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
     * @returns {Promise<Object>} typed outcome envelope (see status semantics above).
     */
    async executeRemCycle({
        reason,
        mode         = 'periodic',
        includeDecay = true,
        dryRun       = false
    } = {}) {
        const startedAt = new Date();
        const runId     = `rem-${startedAt.toISOString()}-${Math.random().toString(36).slice(2, 8)}`;

        const baseOutcome = {
            runId,
            reason,
            mode,
            startedAt        : startedAt.toISOString(),
            completedAt      : null,
            durationMs       : null,
            sessionsProcessed: null,
            diagnostic       : null,
            skipReason       : null,
            error            : null
        };

        const finalize = (status, extras = {}) => ({
            ...baseOutcome,
            ...extras,
            status,
            completedAt: new Date().toISOString(),
            durationMs : Date.now() - startedAt.getTime()
        });

        // Provider gate — abort with rich diagnostic when the configured graph provider
        // is unsupported or unreachable. Downstream pipeline calls would silently no-op
        // on missing provider; the typed `failed` envelope surfaces the root cause to
        // operator-facing health telemetry instead.
        let gate;
        try {
            gate = await this.checkProviderReadiness();
        } catch (e) {
            return finalize('failed', {
                error: {message: `checkProviderReadiness threw: ${e?.message || e}`, stack: e?.stack}
            });
        }
        if (!gate.ready) {
            return finalize('failed', {diagnostic: gate.diagnostic});
        }

        // Dry-run short-circuit — used by callers that want to verify readiness without
        // running the pipeline (e.g. operator probes, smoke tests).
        if (dryRun) {
            return finalize('skipped', {skipReason: 'dry-run requested'});
        }

        // Concurrent-invocation guard — exposes the in-flight state as a stage outcome
        // rather than the prior debug-only log line that hid double-fires from operator
        // health telemetry.
        if (this.isProcessing) {
            return finalize('skipped', {skipReason: 'dreamService.isProcessing already true (concurrent invocation)'});
        }

        // Pre-count query — distinguishes the no-work `skipped` path from the
        // work-completed `completed` path without requiring a return-value refactor on
        // processUndigestedSessions. A pre-call query is cheaper than the alternative
        // of inspecting graph state after the fact.
        let sessionCount = 0;
        try {
            const undigested = await this.findUndigestedSessions();
            sessionCount = Array.isArray(undigested) ? undigested.length : 0;
        } catch (e) {
            return finalize('failed', {
                error: {message: `findUndigestedSessions threw: ${e?.message || e}`, stack: e?.stack}
            });
        }

        // No-work path — still run decay (it self-skips when the 24-hour Algorithmic
        // Lock isn't due) so decay cadence is not coupled to session-arrival cadence.
        if (sessionCount === 0) {
            if (includeDecay) {
                try {
                    await GraphService.decayGlobalTopology();
                } catch (e) {
                    return finalize('failed', {
                        error            : {message: `decayGlobalTopology threw on zero-session path: ${e?.message || e}`, stack: e?.stack},
                        sessionsProcessed: 0
                    });
                }
            }
            return finalize('skipped', {sessionsProcessed: 0, skipReason: 'no undigested sessions'});
        }

        // Work path — process sessions, then run decay as the cycle-finalization step
        // under the same lease window the caller already holds.
        try {
            await this.processUndigestedSessions();

            if (includeDecay) {
                await GraphService.decayGlobalTopology();
            }

            return finalize('completed', {sessionsProcessed: sessionCount});
        } catch (e) {
            return finalize('failed', {
                sessionsProcessed: sessionCount,
                error            : {message: String(e?.message || e), stack: e?.stack}
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
            attempts : readinessConfig.attempts,
            delayMs  : readinessConfig.delayMs,
            timeoutMs: readinessConfig.timeoutMs,
            output   : {write: () => {}}
        });

        if (!waitResult.running) {
            return {
                ready     : false,
                diagnostic: createProviderFailureDiagnostic({waitResult})
            };
        }

        return {ready: true};
    }

    /**
     * Backward compatibility passthrough to GoldenPathSynthesizer.
     * @deprecated Trigger GoldenPathSynthesizer directly or use MemoryService.mutateFrontier hook.
     */
    async synthesizeGoldenPath() {
        // We dynamically import it here to avoid circular dependency loops during initialization
        const { default: GoldenPathSynthesizer } = await import('./services/GoldenPathSynthesizer.mjs');
        return GoldenPathSynthesizer.synthesizeGoldenPath();
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
     * @summary Parses the local file system for markdown files and explicitly syncs their state
     * into the Native Graph database. Re-asserts edge weights for OPEN issues, heavily discounting
     * any nodes structurally blocked via BLOCKED_BY relationships to prevent GraphRAG hallucinations.
     * Upserts textual issue embeddings into the localized `neo_graph_nodes` SQLite vector collection.
     * @returns {Promise<Object[]>} Returns only the OPEN issues for synthesis.
     */
    async ingestIssueStates() {
        return IssueIngestor.ingestIssueStates();
    }

    /**
     * Parses the local file system for markdown discussions and syncs their state
     * into the Native Graph database as OPEN items so they can surface mathematically.
     */
    async ingestDiscussionStates() {
        return IssueIngestor.ingestDiscussionStates();
    }

    /**
     * Parses the local file system for pull request reviews and syncs their embedded
     * gap signals ([KB_GAP], [TOOLING_GAP], [RETROSPECTIVE]) into the Native Graph database.
     */
    async ingestPullRequestFeedback() {
        return IssueIngestor.ingestPullRequestFeedback();
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
