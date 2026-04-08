import fs                   from 'fs';
import path                 from 'path';
import yaml                 from 'js-yaml';
import {fileURLToPath}      from 'url';
import crypto               from 'crypto';
import aiConfig             from '../config.mjs';
import Base                 from '../../../../../src/core/Base.mjs';
import StorageRouter        from '../managers/StorageRouter.mjs';
import SQLiteVectorManager  from '../managers/SQLiteVectorManager.mjs';
import TextEmbeddingService from './TextEmbeddingService.mjs';
import GraphService         from './GraphService.mjs';
import Json                 from '../../../../../src/util/Json.mjs';
import logger               from '../logger.mjs';
import OpenAiCompatible     from '../../../../provider/OpenAiCompatible.mjs';
import FileSystemIngestor   from './FileSystemIngestor.mjs';

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
         * @member {String} className='Neo.ai.mcp.server.memory-core.services.DreamService'
         * @protected
         */
        className: 'Neo.ai.mcp.server.memory-core.services.DreamService',
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
                logger.info('[DreamService] No undigested session memories found.');
                return;
            }

            logger.info(`[DreamService] Found ${sessions.length} undigested session(s). Beginning REM pipeline...`);

            // Phase 1: Ingest Live Workspace Files for Gap Analysis context mapping
            await FileSystemIngestor.syncWorkspaceToGraph();

            for (const session of sessions) {
                logger.info(`[DreamService] Preparing session ${session.meta.sessionId} ("${session.meta.title}") for REM extraction.`);
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
                    logger.info(`[DreamService] Session ${session.meta.sessionId} marked as graphDigested in ChromaDB.`);
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
        logger.debug(`[DreamService] Extracting Tri-Vector Synthesis for session ID: ${session.meta.sessionId}`);

        const prompt = `
You are the Neo.mjs REM (Rapid Eye Movement) Sleep digestion agent.
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

DO NOT output markdown, \`\`\`json blocks, or any other explanations. Provide purely the JSON object.

--- Session Episodic Memory ---
${session.document}
`;

        try {
            const provider = Neo.create(OpenAiCompatible, {
                modelName: aiConfig.openAiCompatible.model,
                host: aiConfig.openAiCompatible.host
            });

            // MLX manages KV cache paging internally. No dynamic context sizing required here.

            // Call standard generation method explicitly without format enforcement
            const result = await provider.generate(prompt);

            // Extract using robust Json parser to catch malformed boundaries
            const payload = Json.extract(result.content);

            // Validation check
            if (!payload || !payload.session_artifact || !payload.session_artifact.graph || !payload.session_artifact.graph.nodes || !payload.session_artifact.graph.edges) {
                logger.warn(`[DreamService] Failed to validate extracted Tri-Vector A2A payload for session: ${session.meta.sessionId}`);
                return null;
            }

            logger.info(`[DreamService] Successfully extracted Tri-Vector A2A schema for session ${session.meta.sessionId}.`);

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
                fs.appendFileSync(auditLog, strategyEntry, 'utf8');
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
        logger.debug(`[DreamService] Extracting Topological Conflicts for session ID: ${sessionId}`);

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

            let handoffContent = '';
            if (fs.existsSync(handoffFile)) {
                handoffContent = fs.readFileSync(handoffFile, 'utf8');
            } else {
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
                fs.writeFileSync(handoffFile, handoffContent, 'utf8');
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
     * ReAct loop for detecting Codebase Gaps natively via dynamic filesystem evaluation.
     * @param {Object} session The wrapped session object
     * @param {Object} extractedPayload The parsed Tri-Vector schema
     */
    async executeCapabilityGapInference(session, payload) {
        if (!payload || !payload.session_artifact || !payload.session_artifact.graph || !payload.session_artifact.graph.nodes) return;

        const structuralNodes = payload.session_artifact.graph.nodes.filter(n =>
            (n.type === 'CONCEPT' || n.type === 'CLASS' || n.type === 'METHOD' || n.type === 'STRATEGY' || n.type === 'ISSUE') &&
            (typeof n.confidence === 'number' ? n.confidence : 1.0) >= 0.6
        );

        if (structuralNodes.length === 0) return;

        logger.debug(`[DreamService] Launching Capability Gap Inference passes for ${structuralNodes.length} nodes...`);

        // Resolve absolute root directory
        const neoRootDir = path.resolve(__dirname, '../../../../../');
        const handoffFile = aiConfig.handoffFilePath;
        const allFilePaths = GraphService.db.nodes.items.filter(n =>
            n.label === 'FILE' || n.label === 'DIRECTORY'
        ).map(n => n.properties?.path || '').filter(p =>
            p && (p.startsWith('docs/') || p.startsWith('learn/') || p.startsWith('test/') || p.startsWith('src/'))
        );



        const provider = Neo.create(OpenAiCompatible, {
            modelName: aiConfig.openAiCompatible.model,
            host: aiConfig.openAiCompatible.host
        });

        for (const node of structuralNodes) {
            // Context Thinning: Extract semantic tokens from Node name to filter directory tree
            const nameTerms = node.name.replace(/([A-Z])/g, ' $1').toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length > 2);
            if (nameTerms.length === 0) nameTerms.push(node.name.toLowerCase());

            const relevantPaths = allFilePaths.filter(p => {
                const lowerP = p.toLowerCase();
                return nameTerms.some(term => lowerP.includes(term));
            }).slice(0, 100).join('\n'); // High relevance, capped at 100 files

            let nodeEdges = (payload.session_artifact.graph.edges || []).filter(e => e.source === node.id || e.target === node.id);
            let edgeSummary = nodeEdges.length ? nodeEdges.map(e => `[${e.relationship}] ${e.source} -> ${e.target} (Justification: ${e.justification || 'N/A'})`).join('\n') : '(No structural edges generated)';

            const gravity = GraphService.getNodeGravity(node._resolvedId || node.id);

            let messages = [
                {
                    role: 'system',
                    content: `You are the Neo.mjs Capability Gap Analyzer (REM).
The underlying Agent just worked on a new feature/concept. You must detect topological conflicts, missing documentation, coverage gaps, or STRATEGIC ALIGNMENT DRIFT based on the node's metadata, relational edges, and structural gravity.
We will provide you the Node Metadata, inferred Topological Edges (e.g. CAUSES_ISSUE, BLOCKS), Structural Gravity, and a FILTERED DIRECTORY TREE of relevant paths in 'docs/', 'learn/', 'test/', and 'src/'.
Analyze if the architectural edges flag a conflict, if stability implies missing test coverage, or if there is a "Strategic Vacuum" (ALIGNMENT_DRIFT) where the technical cluster lacks a topological pathway to a strategic anchor or has anomalous gravitational weight.
If you need to read a file to verify its contents, output JSON: {"action": "read_file", "path": "path/to/file.md"}.
If you detect a true gap, topological blocker, or drift, output JSON: {"action": "alert", "message": "[CONFLICT|DOC_GAP|TEST_GAP|ALIGNMENT_DRIFT] Detailed reason..."}.
If no issues are detected, output JSON: {"action": "pass"}.
NEVER output raw markdown or conversational text. YOU MUST output EXACTLY ONE JSON OBJECT per turn.`
                },
                {
                    role: 'user',
                    content: `Node Type: ${node.type}\nNode Name: ${node.name}\nNode Description: ${node.description}\nLogical Layer: ${node.logical_layer || 'Unknown'}\nStability: ${node.stability || 'UNKNOWN'}\nGravity Well: ${node.gravity_well === true ? 'YES' : 'NO'}\nStrategic Weight: ${typeof node.strategic_weight === 'number' ? node.strategic_weight : 0.1}\nStructural Gravity: Inbound ${gravity.in_degree}, Outbound ${gravity.out_degree}\nTags: ${(node.tags || []).join(', ')}\n\n--- INFERRED TOPOLOGICAL EDGES ---\n${edgeSummary}\n\n--- FILTERED DIRECTORY TREE ---\n${relevantPaths || '(No relevant paths found based on heuristic)'}\n--- END DIRECTORY TREE ---`
                }
            ];

            let passCounter = 0;
            // Limit ReAct loop
            while (passCounter < 4) {
                passCounter++;
                try {
                    const result = await provider.generate(messages);

                    const payload = Json.extract(result.content);
                    if (!payload || !payload.action) break;

                    if (payload.action === 'read_file' && payload.path) {
                        try {
                            const targetPath = path.resolve(neoRootDir, payload.path);
                            const relativePath = path.relative(neoRootDir, targetPath);

                            if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
                                messages.push({ role: 'assistant', content: result.content });
                                messages.push({ role: 'user', content: `Security Error: Target path ${payload.path} attempts to traverse outside the repository root. This is forbidden.` });
                                continue;
                            }

                            const raw = fs.readFileSync(targetPath, 'utf8');
                            messages.push({ role: 'assistant', content: result.content });
                            messages.push({ role: 'user', content: `File contents of ${payload.path}:\n\n${raw}` });
                        } catch (e) {
                            messages.push({ role: 'assistant', content: result.content });
                            messages.push({ role: 'user', content: `Target path ${payload.path} does not physically exist. Cannot read.` });
                        }
                    } else if (payload.action === 'alert' && payload.message) {
                        // We found a legitimate gap! Append to sandman_handoff.md!
                        let handoffContent = fs.existsSync(handoffFile) ? fs.readFileSync(handoffFile, 'utf8') : '';
                        const entry = `- **[Codebase Gap]** Node \`${node.name}\`: ${payload.message} (Source Session: ${session.meta.sessionId})\n`;

                        // Check if a gap for this specific node already exists!
                        const nodeIdentifier = `- **[Codebase Gap]** Node \`${node.name}\`:`;
                        if (!handoffContent.includes(nodeIdentifier)) {
                            let insertIndex = handoffContent.indexOf('## Computed Golden Path');
                            if (insertIndex !== -1) {
                                handoffContent = handoffContent.substring(0, insertIndex) + entry + '\n\n' + handoffContent.substring(insertIndex);
                            } else {
                                handoffContent += entry;
                            }
                            fs.writeFileSync(handoffFile, handoffContent, 'utf8');
                            logger.info(`[DreamService] Gap Alert logged for ${node.name}.`);
                        } else {
                            logger.debug(`[DreamService] Gap Alert already exists for ${node.name}. Skipping duplication.`);
                        }
                        break;
                    } else {
                        logger.debug(`[DreamService] Gap Analyzer passed on ${node.name}.`);
                        break; // action === 'pass' or fallback
                    }
                } catch (e) {
                    if (e.message && e.message.includes('fetch failed')) {
                        logger.debug('[DreamService] Skipping Gap Analysis (API provider offline).');
                    } else {
                        logger.warn('[DreamService] Gap Inference loop failed.', e);
                    }
                    break;
                }
            }
        }
    }

    /**
     * Parses the local file system for markdown files and explicitly syncs their state
     * into the Native Graph database. Re-asserts edge weights for OPEN issues.
     * Upserts textual issue embeddings into the localized `neo_graph_nodes` SQLite vector collection.
     * @returns {Promise<Object[]>} Returns only the OPEN issues for synthesis.
     */
    async ingestIssueStates() {
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);
        const issuesDir = path.resolve(__dirname, '../../../../../resources/content/issues');

        if (!fs.existsSync(issuesDir)) {
            logger.warn(`[DreamService] Issues directory not found at ${issuesDir}`);
            return [];
        }

        const files = fs.readdirSync(issuesDir).filter(f => f.endsWith('.md'));
        const openIssues = [];
        const parsedIssues = [];

        let nodesCollection = null;
        if (SQLiteVectorManager.db) {
            nodesCollection = await SQLiteVectorManager.getOrCreateCollection({ name: 'neo_graph_nodes' });
        }

        // Pass 1: Upsert all nodes
        for (const file of files) {
            const content = fs.readFileSync(path.join(issuesDir, file), 'utf8');
            const match = content.match(/^---\n([\s\S]*?)\n---/);
            if (match) {
                try {
                    const meta = yaml.load(match[1]);
                    if (meta && meta.state) {
                        const issueId = 'issue-' + (meta.id || file.replace(/\.md$/, ''));

                        GraphService.upsertNode({
                            id: issueId,
                            type: 'ISSUE',
                            name: meta.title || issueId,
                            state: meta.state,
                            updatedAt: meta.updatedAt || meta.createdAt
                        });

                        parsedIssues.push({ issueId, meta, content, file });
                    }
                } catch (e) {
                    logger.warn(`[DreamService] Failed to parse frontmatter for ${file}`, e);
                }
            }
        }

        // Pass 2: Link edges and process open issues
        const extractIssueId = (str) => {
            if (!str) return null;
            const m = String(str).match(/(\d+)/);
            return m ? `issue-${m[1]}` : null;
        };

        for (const { issueId, meta, content, file } of parsedIssues) {
            try {
                if (meta.parentIssue) {
                    const parentId = extractIssueId(meta.parentIssue);
                    if (parentId && GraphService.db.nodes.get(parentId)) GraphService.linkNodes(parentId, issueId, 'PARENT_OF', 1.0);
                }

                if (Array.isArray(meta.subIssues)) {
                    meta.subIssues.forEach(sub => {
                        const subId = extractIssueId(sub);
                        if (subId && GraphService.db.nodes.get(subId)) GraphService.linkNodes(issueId, subId, 'PARENT_OF', 1.0);
                    });
                }

                if (Array.isArray(meta.blockedBy)) {
                    meta.blockedBy.forEach(blocker => {
                        const blockerId = extractIssueId(blocker);
                        if (blockerId && GraphService.db.nodes.get(blockerId)) GraphService.linkNodes(blockerId, issueId, 'BLOCKS', 1.0);
                    });
                }

                if (Array.isArray(meta.blocking)) {
                    meta.blocking.forEach(blocked => {
                        const blockedId = extractIssueId(blocked);
                        if (blockedId && GraphService.db.nodes.get(blockedId)) GraphService.linkNodes(issueId, blockedId, 'BLOCKS', 1.0);
                    });
                }

                if (meta.state === 'OPEN') {
                    // The Ancestral Anchor: Re-assert edge weights for active roadmap items
                    const edges = GraphService.db.edges.items.filter(e => e.source === issueId || e.target === issueId);
                    if (edges.length > 0) {
                        edges.forEach(e => {
                            e.properties.weight = 1.0;
                        });
                        if (GraphService.db.autoSave && GraphService.db.storage) {
                            GraphService.db.storage.addEdges(edges);
                        }
                    }

                    const body = content.replace(/^---\n[\s\S]*?\n---\n/, '').trim();
                    const titleAndBody = `${meta.title}\n\n${body}`;

                    // Markdown-Aware Vector Chunking using hash bypass
                    if (nodesCollection) {
                        const contentHash = crypto.createHash('md5').update(titleAndBody).digest('hex');
                        let needsEmbedding = true;

                        try {
                            const existing = await nodesCollection.get({ ids: [issueId], include: ['metadatas'] });
                            if (existing && existing.ids.length > 0) {
                                const exMeta = existing.metadatas[0] || {};
                                if (exMeta.hash === contentHash) {
                                    needsEmbedding = false;
                                }
                            }
                        } catch (e) {
                            // Suppress get errors locally
                        }

                        if (needsEmbedding) {
                            logger.info(`[DreamService] Dynamically embedding OPEN issue: ${issueId}`);
                            await nodesCollection.upsert({
                                ids: [issueId],
                                documents: [titleAndBody],
                                metadatas: [{ hash: contentHash, title: meta.title, type: 'ISSUE' }]
                            });
                        }
                    }

                    openIssues.push({
                        title: meta.title,
                        issueId: meta.id || file.replace(/\.md$/, ''),
                        body
                    });
                }
            } catch (e) {
                logger.warn(`[DreamService] Failed to link edges for ${file}`, e);
            }
        }

        return openIssues;
    }

    /**
     * Executes the global "Fade" algorithm across all Native Graph edges,
     * then executes Vector Apoptosis to clean up resulting orphaned nodes from the hybrid semantic space.
     */
    async runGarbageCollection() {
        logger.info('[DreamService] Initiating Graph Garbage Collection (Apoptosis)...');

        const edges = GraphService.db.edges.items.slice();
        let cullCount = 0;

        edges.forEach(e => {
            if (e.type === 'SYSTEM_TENET') return; // Protect structural system edges from fading

            // Enforce SQLite Foreign Key constraints dynamically to avoid crashes
            if (!GraphService.db.nodes.get(e.source) || !GraphService.db.nodes.get(e.target)) {
                GraphService.db.removeEdge(e.id);
                cullCount++;
            }
        });

        logger.info(`[DreamService] Garbage Collection complete. Severed ${cullCount} unanchored edges.`);

        // Vector Apoptosis: Identify orphans and purge from Hybrid Store
        logger.info('[DreamService] Initializing Vector Apoptosis (Orphaned Node Cleanup)...');
        const orphaned = GraphService.getOrphanedNodes();

        if (orphaned.length > 0) {
            logger.info(`[DreamService] Apoptosis detected ${orphaned.length} orphaned nodes. Commencing eradication...`);
            GraphService.removeNodes(orphaned);

            if (SQLiteVectorManager.db) {
                // Cross-layer purge from semantic embeddings
                logger.info(`[DreamService] Purging semantic vectors for ${orphaned.length} deleted nodes.`);

                ['neo_graph_nodes', 'neo_agent_sessions_summary'].forEach(async collectionName => {
                    try {
                        const collection = await SQLiteVectorManager.getOrCreateCollection({ name: collectionName });
                        if (collection) {
                            await collection.delete({ ids: orphaned });
                        }
                    } catch (e) {
                        logger.warn(`[DreamService] Apoptosis soft-failure on collection ${collectionName}: ${e.message}`);
                    }
                });
            }
        }
    }

    /**
     * Synthesizes the Golden Path (strategic priorities) deterministically by analyzing Graph topology
     * combined with Vector Similarity (Hybrid GraphRAG).
     */
    async synthesizeGoldenPath() {
        logger.info('[DreamService] Initializing Hybrid GraphRAG Strategic Traversal...');

        // This will sync Graph Node states and embed issue vectors!
        await this.ingestIssueStates();

        if (!SQLiteVectorManager.db) {
            logger.warn('[DreamService] SQLiteVectorManager not mounted. Skipping Golden Path extraction.');
            return;
        }

        // Generate the Frontier Baseline Vector using the most recent session memory
        let frontierEmbedding = null;
        try {
            const sessionsVec = await SQLiteVectorManager.getSummaryCollection();
            const recent = await sessionsVec.get({ limit: 2, include: ['documents'] });

            let frontierText = "Neo.mjs Active Strategic Context: ";
            if (recent && recent.documents.length > 0) {
                frontierText += recent.documents.join("\n\n");
            } else {
                frontierText += "Initialization and Stabilization.";
            }

            logger.debug('[DreamService] Computing Frontier Baseline Vector...');
            frontierEmbedding = await TextEmbeddingService.embedText(frontierText, aiConfig.neoEmbeddingProvider);
        } catch (e) {
            logger.warn('[DreamService] Failed to generate Frontier Baseline Vector. Aborting Hybrid route.', e);
            return;
        }

        const f32 = new Float32Array(frontierEmbedding);

        // Execute the unified Hybrid SQL Query directly mapping native structural weights against active vectors!
        const stmt = SQLiteVectorManager.db.prepare(`
            SELECT 
                n.id,
                n.data,
                COALESCE((
                    SELECT SUM(json_extract(e.data, '$.properties.weight')) 
                    FROM Edges e 
                    WHERE e.target = n.id AND e.type != 'BLOCKS'
                ), 0.0) as struct_score,
                v.distance as semantic_distance
            FROM Nodes n
            JOIN neo_graph_nodes_data d ON d.chroma_id = n.id
            JOIN neo_graph_nodes_vec v ON v.rowid = d.rowid
            WHERE json_extract(n.data, '$.properties.state') = 'OPEN'
              AND v.embedding MATCH ? AND k = 20
        `);

        // Check node validity and calculate priority mathematically internally securely
        const results = stmt.all(f32);
        const scoredNodes = [];

        const SEMANTIC_WEIGHT = 2.0;
        const STRUCTURAL_WEIGHT = 1.0;

        for (const row of results) {
            const issueId = row.id;

            // Re-verify blocker topology natively using GraphService API
            const blockers = GraphService.db.edges.getByIndex('target', issueId).filter(e => e.type === 'BLOCKS');
            let isBlocked = false;

            for (const bEdge of blockers) {
                const blockerNode = GraphService.db.nodes.get(bEdge.source);
                if (blockerNode && blockerNode.properties?.state === 'OPEN') {
                    isBlocked = true;
                    break;
                }
            }

            if (isBlocked) continue; // Architecturally blocked issues cannot be Golden

            const semantic_distance = parseFloat(row.semantic_distance) || 0.1;
            const struct_score = parseFloat(row.struct_score) || 0;

            // Lower distance = Higher significance. (Add 0.1 to avoid div by 0 and curb massive asymptotes)
            const semanticScore = 1.0 / (semantic_distance + 0.1);

            const priority = (semanticScore * SEMANTIC_WEIGHT) + (struct_score * STRUCTURAL_WEIGHT);

            // Re-inflate node JSON locally
            let nodeData = null;
            try { nodeData = JSON.parse(row.data); } catch (e) { }

            scoredNodes.push({
                node: nodeData || { id: issueId },
                score: priority,
                semantic: semanticScore,
                structural: struct_score
            });
        }

        // Sort descending by calculated priority
        scoredNodes.sort((a, b) => b.score - a.score);

        const topNodes = scoredNodes.slice(0, 3);

        if (topNodes.length === 0) {
            logger.info('[DreamService] No actionable unblocked issues found. Golden path empty.');
            return;
        }

        logger.info(`[DreamService] Top Issue 1 (${topNodes[0].node.id}): Priority ${topNodes[0].score.toFixed(2)} [Sem: ${topNodes[0].semantic.toFixed(2)} / Struc: ${topNodes[0].structural.toFixed(2)}]`);

        // Explicitly anchor this to the frontier context so the Agent NEVER loses sight of it
        let markdownAppend = `\n## Computed Golden Path (Strategic Recommendation)\n\n`;
        markdownAppend += `Based on the latest Tri-Vector Synthesis and Topological Priorities, the following tasks are mathematically recommended as the next immediate focus:\n\n`;

        topNodes.forEach((item, index) => {
            if (item.node && item.node.id) {
                GraphService.linkNodes('frontier', item.node.id, 'GUIDES', item.score);
                const title = item.node.properties?.title || item.node.properties?.name || item.node.name || 'Unknown Title';
                markdownAppend += `${index + 1}. **${item.node.id}**: Score ${item.score.toFixed(2)} (Semantic: ${item.semantic.toFixed(2)}, Structural: ${item.structural.toFixed(2)})\n   - *${title}*\n`;
            }
        });

        try {
            logger.info('[DreamService] Instantiating API provider to interpret Mathematical Golden Path...');
            const provider = Neo.create(OpenAiCompatible, {
                modelName: aiConfig.openAiCompatible.model,
                host: aiConfig.openAiCompatible.host
            });

            // Get adjacent frontier topology for context
            const frontierTopology = GraphService.getContextFrontier({ depth: 1 });

            const interpretPrompt = `
You are the Neo.mjs Strategic Steering Engine.
The mathematical engine has evaluated the codebase and determined the following top priority features based on semantic and structural weight:

${markdownAppend}

Active Topological Context Frontier:
${JSON.stringify(frontierTopology, null, 2)}

Synthesize a concise, 2-to-3 sentence Strategic Brief for the development agent explaining exactly *why* these tasks are the current structural priority given the active frontier, and how the agent should pivot.

Mandatory Schema:
{ "strategic_brief": "String (2-3 sentences)" }
DO NOT output markdown, \`\`\`json blocks, or any other explanations. Provide purely the JSON object.
`;

            const result = await provider.generate(interpretPrompt);

            const payload = Json.extract(result.content);
            if (payload && payload.strategic_brief) {
                markdownAppend += `\n> **Strategic Interpretation:**\n> ${payload.strategic_brief}\n\n`;
                logger.info('[DreamService] Successfully appended semantic strategic brief to Golden Path.');
            }
        } catch (e) {
            logger.warn('[DreamService] Failed to generate semantic interpretation for Golden Path (LLM Offline). Proceeding with pure mathematical output.', e);
        }

        const handoffFile = aiConfig.handoffFilePath;
        if (fs.existsSync(handoffFile)) {
            let currentContent = fs.readFileSync(handoffFile, 'utf-8');
            const headerIndex = currentContent.indexOf('## Computed Golden Path');

            let markdownAppendForFile = markdownAppend.trimStart();

            if (headerIndex !== -1) {
                // Strip trailing whitespace to prevent newline accumulation, then apply 2 newlines before the header
                currentContent = currentContent.substring(0, headerIndex).trimEnd() + '\n\n' + markdownAppendForFile;
            } else {
                // Header not found, append safely
                currentContent = currentContent.trimEnd() + '\n\n' + markdownAppendForFile;
            }

            fs.writeFileSync(handoffFile, currentContent, 'utf-8');
            logger.info(`[DreamService] Golden Path recommendations exported to sandman_handoff.md`);
        }

        logger.info(`[DreamService] Mathematical Golden Path established. Anchored ${topNodes.length} strategic nodes to frontier.`);
    }
}

export default Neo.setupClass(DreamService);
