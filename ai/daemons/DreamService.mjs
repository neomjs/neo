import fs                   from 'fs';
import path                 from 'path';
import yaml                 from 'js-yaml';
import {fileURLToPath}      from 'url';
import crypto               from 'crypto';
import { Memory_Config as aiConfig } from '../services.mjs';
import Base                 from '../../src/core/Base.mjs';
import { Memory_StorageRouter as StorageRouter } from '../services.mjs';
import { Memory_TextEmbeddingService as TextEmbeddingService } from '../services.mjs';
import { Memory_GraphService as GraphService } from '../services.mjs';
import Json                 from '../../src/util/Json.mjs';
import logger               from '../mcp/server/memory-core/logger.mjs';
import OpenAiCompatible     from '../provider/OpenAiCompatible.mjs';
import FileSystemIngestor      from '../mcp/server/memory-core/services/FileSystemIngestor.mjs';
import GapInferenceEngine      from './services/GapInferenceEngine.mjs';
import GoldenPathSynthesizer   from './services/GoldenPathSynthesizer.mjs';
import GraphMaintenanceService from './services/GraphMaintenanceService.mjs';
import IssueIngestor           from './services/IssueIngestor.mjs';
import SemanticGraphExtractor  from './services/SemanticGraphExtractor.mjs';
import TopologyInferenceEngine from './services/TopologyInferenceEngine.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

/**
 * @summary Service for offline GraphRAG extraction ("REM Sleep").
 *
 * Scans recent session summaries from the `neo-agent-sessions` collection that have not
 * yet been formally digested into Graph Nodes and Edges. Uses the configured model provider
 * via configurable model to extract formal graph structures from episodic memories.
 *
 * @class Neo.ai.mcp.server.memory-core.services.DreamService
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
        const LifecycleService = (await import('../services.mjs')).Memory_LifecycleService;
        await LifecycleService.ready();
        
        // Wait for the full lifecycle boot to ensure GraphService.db is mounted
        if (LifecycleService._initPromise) {
            await LifecycleService._initPromise;
        }

        if (aiConfig.data.autoDream) {
            logger.info('[Startup] DreamService: Checking for undigested session memories...');
            this.processUndigestedSessions().catch(e => logger.error('[Startup] DreamService failed:', e));
        }

        if (aiConfig.data.autoGoldenPath) {
            logger.info('[Startup] DreamService: Synthesizing Golden Path into handoff file...');
            this.synthesizeGoldenPath().catch(e => logger.error('[Startup] Golden Path generation failed:', e));
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
     * Pipeline to process undigested sessions.
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
                        if (rawMemories && rawMemories.documents && rawMemories.documents.length > 0) {
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
                
                const startTime = Date.now();
                const success = await SemanticGraphExtractor.executeTriVectorExtraction(session);
                const triVectorTime = ((Date.now() - startTime) / 1000).toFixed(1);
                logger.info(`[DreamService]   -> Tri-Vector Synthesis took: ${triVectorTime}s`);

                const topoStart = Date.now();
                await TopologyInferenceEngine.extractTopology(session.document, session.meta.sessionId);
                const topoTime = ((Date.now() - topoStart) / 1000).toFixed(1);
                logger.info(`[DreamService]   -> Topological Conflicts took: ${topoTime}s`);
                
                const capStart = Date.now();
                await this.executeCapabilityGapInference(session, success);
                const capTime = ((Date.now() - capStart) / 1000).toFixed(1);
                logger.info(`[DreamService]   -> Capability Gap Inference took: ${capTime}s`);

                logger.info(`[DreamService] Total Session Digest Time: ${((Date.now() - startTime) / 1000).toFixed(1)}s`);

                if (success) {
                    await this.sessionsCollection.update({
                        ids: [session.id],
                        metadatas: [{ ...session.meta, graphDigested: true }]
                    });
                    logger.info(`[DreamService] Session ${session.meta.sessionId} marked as graphDigested in Memory Core.`);
                }
                }
            }

            // Universal Fade (Garbage Collection)
            await this.runGarbageCollection();

            // After extraction pipeline and decay are done, synthesize strategic roadmap
            await this.synthesizeGoldenPath();

            logger.info('[DreamService] REM pipeline completed.');
        } catch (error) {
            logger.error('[DreamService] Failed to process undigested sessions:', error);
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * Executes Capability Gap Inference natively via dynamic filesystem evaluation mathematically (bypassing LLM hallucinations).
     * @param {Object} session The wrapped session object
     * @param {Object} payload The parsed Tri-Vector schema
     */
    async executeCapabilityGapInference(session, payload) {
        return GapInferenceEngine.executeCapabilityGapInference(session, payload);
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
     * Synthesizes the Golden Path (strategic priorities) deterministically by analyzing Graph topology
     * combined with Vector Similarity (Hybrid GraphRAG).
     */
    async synthesizeGoldenPath() {
        return GoldenPathSynthesizer.synthesizeGoldenPath();
    }
}

export default Neo.setupClass(DreamService);
