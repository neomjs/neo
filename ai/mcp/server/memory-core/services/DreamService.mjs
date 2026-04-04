import fs              from 'fs';
import path            from 'path';
import yaml            from 'js-yaml';
import {fileURLToPath} from 'url';
import aiConfig        from '../config.mjs';
import Base            from '../../../../../src/core/Base.mjs';
import StorageRouter   from '../managers/StorageRouter.mjs';
import GraphService    from './GraphService.mjs';
import Json            from '../../../../../src/util/Json.mjs';
import logger          from '../logger.mjs';
import Ollama          from '../../../../provider/Ollama.mjs';

/**
 * @summary Service for offline GraphRAG extraction ("REM Sleep").
 *
 * Scans recent session summaries from the `neo-agent-sessions` collection that have not
 * yet been formally digested into Graph Nodes and Edges. Uses the local Ollama provider
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
        sessionsCollection_: null
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
            this.processUndigestedSessions();
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

            return undigested;
        } catch (error) {
            logger.error('[DreamService] Error querying undigested sessions:', error);
            return [];
        }
    }

    /**
     * Pipeline to process undigested sessions.
     */
    async processUndigestedSessions() {
        try {
            const sessions = await this.findUndigestedSessions();
            if (sessions.length === 0) {
                logger.info('[DreamService] No undigested session memories found.');
                return;
            }

            logger.info(`[DreamService] Found ${sessions.length} undigested session(s). Beginning REM pipeline...`);

            for (const session of sessions) {
                logger.info(`[DreamService] Preparing session ${session.meta.sessionId} ("${session.meta.title}") for REM extraction.`);
                const success = await this.executeTriVectorExtraction(session);

                await this.extractTopology(session.document, session.meta.sessionId);

                if (success) {
                    await this.sessionsCollection.update({
                        ids: [session.id],
                        metadatas: [{ ...session.meta, graphDigested: true }]
                    });
                    logger.info(`[DreamService] Session ${session.meta.sessionId} marked as graphDigested in ChromaDB.`);
                }
            }

            // Universal Fade (Garbage Collection)
            this.runGarbageCollection();

            // After extraction pipeline and decay are done, synthesize strategic roadmap
            await this.synthesizeGoldenPath();

            logger.info('[DreamService] REM pipeline completed.');
        } catch (error) {
            logger.error('[DreamService] Failed to process undigested sessions:', error);
        }
    }

    /**
     * Executes the Tri-Vector Synthesis (Semantic Graph, Open Deltas, Roadmap Strategy)
     * from the session memory log via Ollama JSON schema extraction.
     * @param {Object} session Wrapped session object containing id, document, and meta
     * @returns {Promise<Object|null>} The extracted payload, or null on failure
     */
    async executeTriVectorExtraction(session) {
        logger.debug(`[DreamService] Extracting Tri-Vector Synthesis for session ID: ${session.meta.sessionId}`);

        const prompt = `
You are the Neo.mjs REM (Rapid Eye Movement) Sleep digestion agent.
Your task is to analyze the following episodic development session history and extract three vital vectors of intelligence into a strict JSON object:

1. **Semantic Graph:** Core concepts, framework components, and their relationships.
2. **Roadmap Strategy:** Major architectural pivots, roadblocks, or discoveries that impact long-term Epic planning. If none, pass null.

Enforce this STRICT JSON schema:
{
  "summary": "String (1 sentence high-level summary of the session)",
  "roadmap_impact": "String (Proposal for a long-term strategy pivot) or Null",
  "graph": {
    "nodes": [
      {
        "id": "Type:Name",
        "type": "String (MUST BE EXACTLY ONE OF: SESSION, MEMORY, ARTIFACT_PLAN, ARTIFACT_TASK, ISSUE, STRATEGY, SYSTEM_ANCHOR, CONCEPT, CLASS, METHOD, FILE, GUIDE, BLOG, TEST)",
        "name": "String",
        "description": "String"
      }
    ],
    "edges": [
      {
        "source": "String (must match a node id, or 'frontier')",
        "target": "String (must match a node id, or 'frontier')",
        "relationship": "String (e.g. IMPLEMENTS, USES, FIXES, DEPRECATES, GUIDES)",
        "weight": 1.0
      }
    ]
  }
}

DO NOT output markdown, \`\`\`json blocks, or any other explanations. Provide purely the JSON object.

--- Session Episodic Memory ---
${session.document}
`;

        try {
            const provider = Neo.create(Ollama, {
                modelName: aiConfig.ollama.model
            });

            // Call standard generation method with explicit format enforcement
            const result = await provider.generate(prompt, {
                response_format: { type: 'json_object' }
            });

            // Extract using robust Json parser to catch malformed boundaries
            const payload = Json.extract(result.content);

            // Validation check
            if (!payload || !payload.graph || !payload.graph.nodes || !payload.graph.edges) {
                logger.warn(`[DreamService] Failed to validate extracted Tri-Vector payload for session: ${session.meta.sessionId}`);
                return null;
            }

            logger.info(`[DreamService] Successfully extracted Tri-Vector schema for session ${session.meta.sessionId}.`);

            // --- VECTOR 1: SEMANTIC GRAPH ---
            // Check if frontier exists, if not, stub it so we can link to it
            GraphService.upsertNode({
                id: 'frontier',
                type: 'System',
                name: 'Strategic Frontier',
                description: 'The actively tracked development front for the current project scope.',
                semanticVectorId: null
            });

            // Bridge to GraphService (SQLite)
            for (const node of payload.graph.nodes) {
                if (node.id === 'frontier') continue;

                GraphService.upsertNode({
                    id: node.id,
                    type: node.type || 'Unknown',
                    name: node.name || 'Unknown',
                    description: node.description || '',
                    semanticVectorId: session.id
                });
            }

            for (const edge of payload.graph.edges) {
                GraphService.linkNodes(
                    edge.source,
                    edge.target,
                    edge.relationship || 'RELATED_TO',
                    edge.weight !== undefined ? parseFloat(edge.weight) : 1.0
                );
            }

            logger.info(`[DreamService] Graph entities committed to Neocortex for session ${session.meta.sessionId}.`);

            // --- VECTOR 2: STRATEGIC ROADMAP PIVOTS ---
            if (payload.roadmap_impact && typeof payload.roadmap_impact === 'string' && payload.roadmap_impact.toLowerCase() !== 'null') {
                const auditLog = path.join('/tmp', 'roadmap_audits.log');
                const strategyEntry = `[${new Date().toISOString()}] Session ${session.meta.sessionId}:\n${payload.roadmap_impact}\n\n`;
                fs.appendFileSync(auditLog, strategyEntry, 'utf8');
                logger.info(`[DreamService] Extracted Strategy impact to roadmap_audits.log`);
            }

            return payload;

        } catch (error) {
            logger.error('[DreamService] Error during graph extraction run:', error);
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
            const provider = Neo.create(Ollama, {
                modelName: aiConfig.ollama.model
            });

            const result = await provider.generate(prompt, {
                response_format: { type: 'json_object' }
            });

            const payload = Json.extract(result.content);
            if (!payload || !Array.isArray(payload.conflicts) || payload.conflicts.length === 0) {
                return;
            }

            // Write to sandman_handoff.md
            const __filename = fileURLToPath(import.meta.url);
            const __dirname  = path.dirname(__filename);
            const handoffFile = path.resolve(__dirname, '../../../../../resources/content/sandman_handoff.md');

            let handoffContent = '';
            if (fs.existsSync(handoffFile)) {
                handoffContent = fs.readFileSync(handoffFile, 'utf8');
            } else {
                handoffContent = '# Sandman Handoff Alerts\n\nThis file tracks topological conflict alerts generated during overnight REM sleep cycles. Agents MUST reconcile these conflicts structurally upon startup.\n\n## Active Conflicts\n\n';
            }

            let newAlerts = false;
            for (const conflict of payload.conflicts) {
                const entry = `- **[${conflict.type}]** \`${conflict.issueId}\`: ${conflict.description} (Source Session: ${sessionId})\n`;
                if (!handoffContent.includes(entry)) {
                    handoffContent += entry;
                    newAlerts = true;
                }
            }

            if (newAlerts) {
                fs.writeFileSync(handoffFile, handoffContent, 'utf8');
                logger.info(`[DreamService] Registered new topological conflicts to sandman_handoff.md for session ${sessionId}.`);
            }

        } catch (error) {
            logger.error('[DreamService] Error during topology extraction:', error);
        }
    }

    /**
     * Parses the local file system for markdown files and explicitly syncs their state
     * into the Native Graph database. Re-asserts edge weights for OPEN issues.
     * @returns {Promise<Object[]>} Returns only the OPEN issues for synthesis.
     */
    async ingestIssueStates() {
        const __filename = fileURLToPath(import.meta.url);
        const __dirname  = path.dirname(__filename);
        const issuesDir  = path.resolve(__dirname, '../../../../../resources/content/issues');

        if (!fs.existsSync(issuesDir)) {
            logger.warn(`[DreamService] Issues directory not found at ${issuesDir}`);
            return [];
        }

        const files = fs.readdirSync(issuesDir).filter(f => f.endsWith('.md'));
        const openIssues = [];
        const parsedIssues = [];

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
                } catch(e) {
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
                    openIssues.push({
                        title: meta.title,
                        issueId: meta.id || file.replace(/\.md$/, ''),
                        body
                    });
                }
            } catch(e) {
                logger.warn(`[DreamService] Failed to link edges for ${file}`, e);
            }
        }

        return openIssues;
    }

    /**
     * Executes the global "Fade" algorithm across all Native Graph edges.
     * Unused edges undergo a geometric decay and are permanently severed if they fall beneath the threshold.
     */
    runGarbageCollection() {
        logger.info('[DreamService] Initiating Graph Garbage Collection (The Fade)...');

        const edges = GraphService.db.edges.items.slice();
        let cullCount = 0;
        const edgesToUpdate = [];

        edges.forEach(e => {
            let currentWeight = e.properties?.weight || 1.0;
            // Apply geometric decay
            let newWeight = currentWeight * 0.9;

            if (newWeight < 0.1) {
                GraphService.db.removeEdge(e.id);
                cullCount++;
            } else {
                e.properties.weight = newWeight;
                edgesToUpdate.push(e);
            }
        });

        if (edgesToUpdate.length > 0 && GraphService.db.autoSave && GraphService.db.storage) {
            GraphService.db.storage.addEdges(edgesToUpdate);
        }

        logger.info(`[DreamService] Garbage Collection complete. Severed ${cullCount} unanchored edges.`);
    }

    /**
     * Synthesizes the Golden Path (strategic priorities) deterministically by analyzing Graph topology.
     */
    async synthesizeGoldenPath() {
        logger.info('[DreamService] Initializing Mathematical Strategic Traversal...');

        // This will sync Graph Node states and re-assert edge weights structurally!
        await this.ingestIssueStates();

        const openIssues = GraphService.db.nodes.items.filter(n => n.label === 'ISSUE' && n.properties?.state === 'OPEN');
        const scoredNodes = [];

        for (const issue of openIssues) {
            // Find blockers
            const blockers = GraphService.db.edges.getByIndex('target', issue.id).filter(e => e.type === 'BLOCKS');
            let isBlocked = false;

            for (const bEdge of blockers) {
                const blockerNode = GraphService.db.nodes.get(bEdge.source);
                if (blockerNode && blockerNode.properties?.state === 'OPEN') {
                    isBlocked = true;
                    break;
                }
            }

            if (isBlocked) continue; // Skip blocked issues

            // Score based on all inbound, non-blocking edges (Hebbian + Structural)
            let score = 1.0; // Base score
            const inboundEdges = GraphService.db.edges.getByIndex('target', issue.id);

            inboundEdges.forEach(e => {
                if (e.type !== 'BLOCKS') {
                    score += parseFloat(e.properties?.weight || 1.0);
                }
            });

            scoredNodes.push({
                node: issue,
                score: score
            });
        }

        // Sort descending
        scoredNodes.sort((a, b) => b.score - a.score);

        const topNodes = scoredNodes.slice(0, 3);

        if (topNodes.length === 0) {
            logger.info('[DreamService] No actionable unblocked issues found. Golden path empty.');
            return;
        }

        topNodes.forEach(item => {
            // Explicitly anchor this to the frontier context so the Agent NEVER loses sight of it
            GraphService.linkNodes('frontier', item.node.id, 'GUIDES', item.score);
        });

        logger.info(`[DreamService] Mathematical Golden Path established. Anchored ${topNodes.length} strategic nodes to frontier.`);
    }
}

export default Neo.setupClass(DreamService);
