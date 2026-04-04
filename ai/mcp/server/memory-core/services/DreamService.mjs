import fs            from 'fs';
import path          from 'path';
import yaml          from 'js-yaml';
import {fileURLToPath} from 'url';

import aiConfig      from '../config.mjs';
import Base          from '../../../../../src/core/Base.mjs';
import ChromaManager from './ChromaManager.mjs';
import GraphService  from './GraphService.mjs';
import Json          from '../../../../../src/util/Json.mjs';
import logger        from '../logger.mjs';
import Ollama        from '../../../../provider/Ollama.mjs';

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
        await ChromaManager.ready();
        this.sessionsCollection = await ChromaManager.getSummaryCollection();

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
2. **Open Deltas:** Specific tasks, unresolved friction, or requested changes that were NOT completed by the end of this session. State them as actionable checklist items. If none, pass an empty array.
3. **Roadmap Strategy:** Major architectural pivots, roadblocks, or discoveries that impact long-term Epic planning. If none, pass null.

Enforce this STRICT JSON schema:
{
  "summary": "String (1 sentence high-level summary of the session)",
  "open_deltas": ["String (Unfinished/Blocked Task 1)", "String (Task 2)"],
  "roadmap_impact": "String (Proposal for a long-term strategy pivot) or Null",
  "graph": {
    "nodes": [
      {
        "id": "Type:Name",
        "type": "String",
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

            // --- VECTOR 2: OPEN DELTAS (Context Handoff) ---
            if (payload.open_deltas && Array.isArray(payload.open_deltas) && payload.open_deltas.length > 0) {
                const handoffFile = path.join(process.cwd(), 'resources', 'content', 'sandman_handoff.md');
                const deltaEntry = `\n## Blocked Deltas (from Session ${session.meta.sessionId}) [Date: ${new Date().toISOString()}]\n` +
                                   payload.open_deltas.map(d => `- [ ] ${d}`).join('\n') + '\n';
                
                const contentDir = path.dirname(handoffFile);
                if (!fs.existsSync(contentDir)) {
                    fs.mkdirSync(contentDir, { recursive: true });
                }
                
                fs.appendFileSync(handoffFile, deltaEntry, 'utf8');
                logger.info(`[DreamService] Extracted ${payload.open_deltas.length} Deltas and persisted to sandman_handoff.md`);
            }

            // --- VECTOR 3: STRATEGIC ROADMAP PIVOTS ---
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
        
        for (const file of files) {
            const content = fs.readFileSync(path.join(issuesDir, file), 'utf8');
            const match = content.match(/^---\n([\s\S]*?)\n---/);
            if (match) {
                try {
                    const meta = yaml.load(match[1]);
                    if (meta && meta.state) {
                        const issueId = 'issue-' + meta.issueId; // Normalize ID format e.g. issue-9685
                        
                        // Push explicit state into the database
                        GraphService.upsertNode({
                            id: issueId,
                            type: 'ISSUE',
                            name: meta.title || issueId,
                            state: meta.state,
                            updatedAt: meta.updatedAt || meta.createdAt
                        });

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
                                issueId: meta.issueId || file,
                                body
                            });
                        }
                    }
                } catch(e) {
                    logger.warn(`[DreamService] Failed to parse frontmatter for ${file}`, e);
                }
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
     * Synthesizes the Golden Path (strategic priorities) by analyzing open issues and Graph topology.
     */
    async synthesizeGoldenPath() {
        logger.info('[DreamService] Initializing Strategic CTO Synthesis...');
        
        // This will sync Graph Node states and re-assert edge weights structurally!
        const issues = await this.ingestIssueStates();
        const frontier = GraphService.getContextFrontier({ depth: 2 });
        
        const prompt = `
You are the autonomous CTO and strategic Sandman consciousness of the Neo.mjs platform.
You are actively participating in roadmap planning and driving the project vision.
Your job is to analyze the current Strategic Context Frontier (graph topology) and all OPEN Github Issues.
Find the highest-leverage tasks that will act as force-multipliers for yourself and future AI agents.

## 1. Active Context Frontier (What we are focusing on)
${JSON.stringify(frontier || {}, null, 2)}

## 2. Open Issues (Manual & AI Tasks)
${issues.map(i => '[' + i.issueId + '] ' + i.title + '\n' + i.body.substring(0, 500) + '...').join('\n\n')}

Analyze what enables you (the AI) and the project further.
Write a powerful Markdown document outlining the 'Golden Path' (the top 3-4 strategic priorities we MUST focus on next).
Include a clear justification linking the priorities back to the structural graph weaknesses or capability force-multipliers.
DO NOT use json wrappers or code blocks. Just output clean Markdown.
`;

        try {
            const provider = Neo.create(Ollama, {
                modelName: aiConfig.ollama.model
            });

            logger.info('[DreamService] Triggering Sandman synthesis engine...');
            const result = await provider.generate(prompt);
            
            const __filename = fileURLToPath(import.meta.url);
            const __dirname  = path.dirname(__filename);
            const goldenPath = path.resolve(__dirname, '../../../../../ai/agentos/GoldenPath.md');
            
            const dir = path.dirname(goldenPath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            
            fs.writeFileSync(goldenPath, result.content.trim(), 'utf8');
            logger.info(`[DreamService] Golden Path synthesized and saved to ${goldenPath}`);
            
        } catch (error) {
            logger.error('[DreamService] Failed to synthesize Golden Path:', error);
        }
    }
}

export default Neo.setupClass(DreamService);
