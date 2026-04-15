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
                const success = await this.executeTriVectorExtraction(session);
                const triVectorTime = ((Date.now() - startTime) / 1000).toFixed(1);
                logger.info(`[DreamService]   -> Tri-Vector Synthesis took: ${triVectorTime}s`);

                const topoStart = Date.now();
                await this.extractTopology(session.document, session.meta.sessionId);
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
     * Executes the Tri-Vector Synthesis (Semantic Graph, Open Deltas, Roadmap Strategy)
     * from the session memory log via JSON schema extraction.
     * @param {Object} session Wrapped session object containing id, document, and meta
     * @returns {Promise<Object|null>} The extracted payload, or null on failure
     */
    async executeTriVectorExtraction(session) {
        logger.info(`[DreamService] Extracting Tri-Vector Synthesis for session ID: ${session.meta.sessionId}`);

        const systemInstruction = `You are the Neo.mjs REM (Rapid Eye Movement) Sleep digestion agent.
Your task is to analyze the following episodic development session history and extract three vital vectors of intelligence into a strict A2A 2026 JSON object:

1. **Semantic Graph:** Core concepts, framework components, and their relationships.
2. **Feature Namespace:** What primary class or namespace were we working on?
3. **Human Readable Summary:** A single sentence summary of the turn/session.

Enforce this STRICT JSON schema:
{
  "a2a_version": "1.0",
  "agent_id": "Antigravity_Primary",
  "session_artifact": {
    "feature_namespace": "String (e.g. Neo.dashboard.Main, or null)",
    "human_readable_summary": "String (1 sentence high-level summary of the session or turn)",
    "roadmap_impact": "String (Proposal for a long-term strategy pivot) or null",
    "graph": {
      "nodes": [
        {
          "id": "Type:Name",
          "type": "String (MUST BE EXACTLY ONE OF: SESSION, MEMORY, ARTIFACT_PLAN, ARTIFACT_TASK, ISSUE, STRATEGY, SYSTEM_ANCHOR, CONCEPT, CLASS, METHOD, FILE, GUIDE, BLOG, TEST)",
          "name": "String",
          "description": "String",
          "logical_layer": "String (e.g. UI, State, Network, Build, Docs, Core, Unknown)",
          "stability": "String (EXPERIMENTAL, STABLE, DEPRECATED, UNKNOWN)",
          "gravity_well": "Boolean (Is this a long-term strategic anchor from roadmap/boardroom?)",
          "strategic_weight": 0.9,
          "confidence": 0.9,
          "tags": ["Array", "of", "Strings"]
        }
      ],
      "edges": [
        {
          "source": "String (must match a node id, or 'frontier')",
          "target": "String (must match a node id, or 'frontier')",
          "relationship": "String (MUST BE EXACTLY ONE OF: IMPLEMENTS, EXTENDS, DEPENDS_ON, BLOCKS, BLOCKED_BY, RELATES_TO, RESOLVES, CAUSES_ISSUE)",
          "weight": 1.0,
          "justification": "String (Brief reason for this edge's algorithmic relevance)"
        }
      ]
    }
  }
}

DO NOT output markdown, \`\`\`json blocks, or any other explanations. Provide purely the JSON object.`;

        try {
            const provider = Neo.create(OpenAiCompatible, {
                modelName: aiConfig.openAiCompatible.model,
                host: aiConfig.openAiCompatible.host
            });

            // Format boundaries securely
            const messages = [
                { role: 'system', content: systemInstruction },
                { role: 'user', content: `--- Session Episodic Memory ---\n${session.document}` }
            ];

            let maxRetries = 3;
            let attempt = 0;
            let payload = null;
            let result = null;

            while (attempt < maxRetries && !payload) {
                attempt++;
                
                // Call standard generation method explicitly without format enforcement
                result = await provider.generate(messages);

                // Extract using robust Json parser to catch malformed boundaries
                payload = Json.extract(result.content);

                // Validation check
                if (!payload || !payload.session_artifact || !payload.session_artifact.graph || !payload.session_artifact.graph.nodes || !payload.session_artifact.graph.edges) {
                    logger.warn(`[DreamService] Attempt ${attempt}: Failed to validate extracted Tri-Vector A2A payload for session: ${session.meta.sessionId}`);
                    
                    if (attempt < maxRetries) {
                        logger.warn(`[DreamService] Attempt ${attempt}: Injecting autonomous JSON repair feedback loop.`);
                        messages.push({ role: 'assistant', content: result.content });
                        messages.push({ 
                            role: 'user', 
                            content: `Your previous response failed internal schema validation. You are either missing required keys (e.g., session_artifact, graph.nodes, graph.edges) or you provided malformed JSON. Please correct your output and provide ONLY the exact JSON shape requested in the instructions.`
                        });
                        payload = null; // Ensure loop continues
                    } else {
                        logger.warn(`[DreamService] --- FINAL EXHAUSTED RAW LLM DUMP ---\n${result.content}\n-----------------------------`);
                    }
                }
            }
            
            if (!payload) {
                return null;
            }

            logger.debug(`[DreamService] Successfully extracted Tri-Vector A2A schema for session ${session.meta.sessionId} after ${attempt} attempts.`);

            const artifact = payload.session_artifact;

            // --- VECTOR 1: SEMANTIC GRAPH ---
            // Ensure frontier exists, if not, stub it so we can link to it
            if (!GraphService.db.nodes.has('frontier')) {
                GraphService.upsertNode({
                    id: 'frontier',
                    type: 'SYSTEM_ANCHOR',
                    name: 'Active Context Frontier',
                    description: 'The actively tracked development front for the current project scope.',
                    semanticVectorId: null
                });
            }

            const VALID_TYPES = ['SESSION', 'MEMORY', 'ARTIFACT_PLAN', 'ARTIFACT_TASK', 'ISSUE', 'STRATEGY', 'SYSTEM_ANCHOR', 'CONCEPT', 'CLASS', 'METHOD', 'FILE', 'GUIDE', 'BLOG', 'TEST'];

            // Bridge to GraphService (SQLite)
            for (const node of artifact.graph.nodes) {
                if (node.id === 'frontier') continue;
                
                let nodeType = node.type && VALID_TYPES.includes(node.type.toUpperCase()) ? node.type.toUpperCase() : 'CONCEPT';
                let nodeId = node.id;
                
                // Enforce Neo native Graph ID specification (Type:Name) if hallucinated
                if (!nodeId.includes(':')) {
                    const cleanName = (node.name || nodeId).replace(/[^a-zA-Z0-9_\-\.]/g, '_');
                    nodeId = `${nodeType}:${cleanName}`;
                }

                GraphService.upsertNode({
                    id: nodeId,
                    type: nodeType,
                    name: node.name || 'Unknown',
                    description: node.description || '',
                    semanticVectorId: session.id,
                    properties: {
                        logical_layer: node.logical_layer || 'Unknown',
                        stability: node.stability || 'UNKNOWN',
                        gravity_well: node.gravity_well === true,
                        strategic_weight: typeof node.strategic_weight === 'number' ? node.strategic_weight : (node.gravity_well ? 1.0 : 0.1),
                        confidence: typeof node.confidence === 'number' ? node.confidence : 0.5,
                        tags: Array.isArray(node.tags) ? node.tags : [],
                        context_source: session.meta.sessionId
                    }
                });
                
                // Update the payload graph node id so edges bind correctly
                node._resolvedId = nodeId; 
            }

            const validNodeRefs = new Set([...artifact.graph.nodes.map(n => n.id), ...artifact.graph.nodes.map(n => n._resolvedId), 'frontier']);

            for (const edge of artifact.graph.edges) {
                // Map the original edge source/target to the resolved Node IDs
                let resolvedSource = edge.source;
                let resolvedTarget = edge.target;
                
                const sourceNode = artifact.graph.nodes.find(n => n.id === edge.source);
                if (sourceNode && sourceNode._resolvedId) resolvedSource = sourceNode._resolvedId;
                
                const targetNode = artifact.graph.nodes.find(n => n.id === edge.target);
                if (targetNode && targetNode._resolvedId) resolvedTarget = targetNode._resolvedId;

                if (!validNodeRefs.has(resolvedSource) || !validNodeRefs.has(resolvedTarget)) {
                    logger.warn(`[DreamService] Culling hallucinated edge from ${resolvedSource} to ${resolvedTarget}`);
                    continue; // Skip trying to link non-existent graph nodes
                }

                GraphService.linkNodes(
                    resolvedSource,
                    resolvedTarget,
                    edge.relationship || 'RELATES_TO',
                    edge.weight !== undefined ? parseFloat(edge.weight) : 1.0,
                    {
                        justification: edge.justification || '',
                        context_source: session.meta.sessionId
                    }
                );
            }

            logger.info(`[DreamService] Graph entities committed to Neocortex for session ${session.meta.sessionId}.`);

            // --- VECTOR 2: STRATEGIC ROADMAP PIVOTS ---
            if (artifact.roadmap_impact && typeof artifact.roadmap_impact === 'string' && artifact.roadmap_impact.toLowerCase() !== 'null') {
                const auditLog = path.join('/tmp', 'roadmap_audits.log');
                const strategyEntry = `[${new Date().toISOString()}] Session ${session.meta.sessionId}:\n${artifact.roadmap_impact}\n\n`;
                await fs.promises.appendFile(auditLog, strategyEntry, 'utf8');
                logger.info(`[DreamService] Extracted Strategy impact to roadmap_audits.log`);
            }

            return payload;

        } catch (error) {
            if (error.message && error.message.includes('fetch failed')) {
                logger.debug(`[DreamService] Skipping extraction (API provider offline).`);
            } else {
                logger.error('[DreamService] Error during graph extraction run:', error);
            }
            return null;
        }
    }

    /**
     * Dedicated inference pass to scan episodic memory explicitly for topological conflicts
     * (e.g. tracking when an OPEN issue is superseded or rendered obsolete by recent session decisions).
     * @param {String} contextText The raw session episodic document.
     * @param {String} sessionId The ID of the session being processed.
     */
    async extractTopology(contextText, sessionId) {
        logger.info(`[DreamService] Extracting Topological Conflicts for session ID: ${sessionId}`);

        const prompt = `
You are the Neo.mjs REM Sandman. Analyze the following session history for strict topological conflicts.
A topological conflict occurs primarily when the user and agent realize an OPEN GitHub ticket/issue has been rendered obsolete, superseded, or is a duplicate.

Enforce this STRICT JSON schema:
{
  "conflicts": [
    {
      "issueId": "String (e.g. issue-1234)",
      "type": "String (SUPERSEDES, OBSOLETES, DUPLICATE)",
      "description": "String (Why is there a conflict?)"
    }
  ]
}

DO NOT output markdown, \`\`\`json blocks, or any other explanations. Provide purely the JSON object. If there are no conflicts, output {"conflicts": []}.

--- Session Episodic Memory ---
${contextText}
`;
        try {
            const provider = Neo.create(OpenAiCompatible, {
                modelName: aiConfig.openAiCompatible.model,
                host: aiConfig.openAiCompatible.host
            });

            const result = await provider.generate(prompt);

            const payload = Json.extract(result.content);
            if (!payload || !Array.isArray(payload.conflicts) || payload.conflicts.length === 0) {
                return;
            }

            // Write to sandman_handoff.md
            const handoffFile = aiConfig.handoffFilePath;
            const tmpFile = `${handoffFile}.tmp`;

            let handoffContent = '';
            try {
                handoffContent = await fs.promises.readFile(handoffFile, 'utf8');
            } catch (e) {
                handoffContent = '# Sandman Handoff Alerts\n\nThis file tracks topological conflict alerts generated during overnight REM sleep cycles. Agents MUST reconcile these conflicts structurally upon startup.\n\n## Active Conflicts\n\n';
            }

            let newAlerts = false;
            for (const conflict of payload.conflicts) {
                const entry = `- **[${conflict.type}]** \`${conflict.issueId}\`: ${conflict.description} (Source Session: ${sessionId})\n`;
                const anyConflictIdentifier = `\`${conflict.issueId}\`:`;
                if (!handoffContent.includes(anyConflictIdentifier)) {
                    let insertIndex = handoffContent.indexOf('## Computed Golden Path');
                    if (insertIndex !== -1) {
                        handoffContent = handoffContent.substring(0, insertIndex) + entry + '\n\n' + handoffContent.substring(insertIndex);
                    } else {
                        handoffContent += entry;
                    }
                    newAlerts = true;
                }
            }

            if (newAlerts) {
                await fs.promises.writeFile(tmpFile, handoffContent, 'utf8');
                await fs.promises.rename(tmpFile, handoffFile);
                logger.info(`[DreamService] Registered new topological conflicts to sandman_handoff.md for session ${sessionId}.`);
            }

        } catch (error) {
            if (error.message && error.message.includes('fetch failed')) {
                logger.debug('[DreamService] Skipping topology extraction (API provider offline).');
            } else {
                logger.error('[DreamService] Error during topology extraction:', error);
            }
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
