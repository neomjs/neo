import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';
import { Memory_Config as aiConfig } from '../../services.mjs';
import Base from '../../../src/core/Base.mjs';
import { Memory_StorageRouter as StorageRouter } from '../../services.mjs';
import { Memory_TextEmbeddingService as TextEmbeddingService } from '../../services.mjs';
import { Memory_GraphService as GraphService } from '../../services.mjs';
import Json from '../../../src/util/Json.mjs';
import logger from '../../mcp/server/memory-core/logger.mjs';
import OpenAiCompatible from '../../provider/OpenAiCompatible.mjs';
import IssueIngestor from './IssueIngestor.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

/**
 * @class Neo.ai.daemons.services.GoldenPathSynthesizer
 * @extends Neo.core.Base
 * @singleton
 */
class GoldenPathSynthesizer extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.daemons.services.GoldenPathSynthesizer'
         * @protected
         */
        className: 'Neo.ai.daemons.services.GoldenPathSynthesizer',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * Synthesizes the Golden Path (strategic priorities) deterministically by analyzing Graph topology
     * combined with Vector Similarity (Hybrid GraphRAG).
     */
    async synthesizeGoldenPath() {
        logger.info('[GoldenPathSynthesizer] Initializing Hybrid GraphRAG Strategic Traversal...');

        // This will sync Graph Node states and embed issue vectors!
        await IssueIngestor.ingestIssueStates();
        await IssueIngestor.ingestDiscussionStates();
        await IssueIngestor.ingestPullRequestFeedback();

        let graphColl = null;
        let summaryColl = null;
        try {
            graphColl = await StorageRouter.getGraphCollection();
            summaryColl = await StorageRouter.getSummaryCollection();
        } catch (e) {
            logger.warn('[GoldenPathSynthesizer] StorageRouter unavailable. Skipping Golden Path extraction.');
            return;
        }

        if (!graphColl || !summaryColl) {
            logger.warn('[GoldenPathSynthesizer] Collections missing. Skipping Golden Path extraction.');
            return;
        }

        // Generate the Frontier Baseline Vector using the most recent session memory
        let frontierEmbedding = null;
        try {
            const recent = await summaryColl.get({ limit: 2, include: ['documents'] });

            let frontierText = "Neo.mjs Active Strategic Context: ";
            if (recent && recent.documents && recent.documents.length > 0) {
                frontierText += recent.documents.join("\n\n");
            } else {
                frontierText += "Initialization and Stabilization.";
            }

            logger.debug('[GoldenPathSynthesizer] Computing Frontier Baseline Vector...');
            frontierEmbedding = await TextEmbeddingService.embedText(frontierText, aiConfig.neoEmbeddingProvider);
        } catch (e) {
            logger.warn('[GoldenPathSynthesizer] Failed to generate Frontier Baseline Vector. Aborting Hybrid route.', e);
            return;
        }

        // Pillar 1: Semantic Distance from ChromaDB
        let semanticIds = [];
        let semanticDistances = [];
        try {
            const semanticResults = await graphColl.query({
                queryEmbeddings: [frontierEmbedding],
                nResults: 20
            });
            if (semanticResults && semanticResults.ids && semanticResults.ids.length > 0) {
                semanticIds = semanticResults.ids[0];
                semanticDistances = semanticResults.distances ? semanticResults.distances[0] : new Array(semanticIds.length).fill(0.1);
            }
        } catch (e) {
            logger.warn('[GoldenPathSynthesizer] Failed to query semantic vectors from ChromaDB.', e);
            return;
        }

        if (semanticIds.length === 0) {
            logger.info('[GoldenPathSynthesizer] No semantic nodes found. Golden path empty.');
            return;
        }

        // Pillar 2: Structural Weight from SQLite Graph
        const scoredNodes = [];
        const SEMANTIC_WEIGHT = 2.0;
        const STRUCTURAL_WEIGHT = 1.0;

        try {
            const placeholders = semanticIds.map(() => '?').join(',');
            const stmt = GraphService.db.storage.db.prepare(`
                SELECT 
                    n.id,
                    n.data,
                    COALESCE((
                        SELECT SUM(json_extract(e.data, '$.properties.weight')) 
                        FROM Edges e 
                        WHERE e.target = n.id AND e.type != 'BLOCKS'
                    ), 0.0) as struct_score
                FROM Nodes n
                WHERE (json_extract(n.data, '$.properties.state') = 'OPEN' OR json_extract(n.data, '$.state') = 'OPEN')
                  AND n.id IN (${placeholders})
            `);

            const results = stmt.all(...semanticIds);

            for (const row of results) {
                const issueId = row.id;

                // Guarantee graph topology is completely loaded into RAM BEFORE executing cold-cache resistant queries natively!
                GraphService.db.getAdjacentNodes(issueId, 'both');

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

                const idx = semanticIds.indexOf(issueId);
                const semantic_distance = parseFloat(semanticDistances[idx]) || 0.1;
                const struct_score = parseFloat(row.struct_score) || 0;

                // Lower distance = Higher significance. (Add 0.1 to avoid div by 0 and curb massive asymptotes)
                const semanticScore = 1.0 / (semantic_distance + 0.1);

                let nodeData = null;
                try { nodeData = JSON.parse(row.data); } catch (e) { }

                let priority = (semanticScore * SEMANTIC_WEIGHT) + (struct_score * STRUCTURAL_WEIGHT);

                // Apply Negative ROI Protocol for automatically rejected Swarm tickets (#9971)
                const labels = nodeData?.properties?.labels || [];
                if (labels.includes('needs-re-triage')) {
                    priority -= 10000;
                    logger.debug(`[GoldenPathSynthesizer] Applied massive negative weight penalty to rejected node: ${issueId}`);
                }

                scoredNodes.push({
                    node: nodeData || { id: issueId },
                    score: priority,
                    semantic: semanticScore,
                    structural: struct_score
                });
            }
        } catch (e) {
            logger.warn('[GoldenPathSynthesizer] Error executing hybrid mapping across local Graph Store.', e);
        }

        // Sort descending by calculated priority
        scoredNodes.sort((a, b) => b.score - a.score);

        // Remove mathematically rejected targets (Negative ROI), then slice
        const topNodes = scoredNodes.filter(n => n.score > -5000).slice(0, 5);

        let markdownAppend = '';

        if (topNodes.length > 0) {
            logger.info(`[GoldenPathSynthesizer] Top Issue 1 (${topNodes[0].node.id}): Priority ${topNodes[0].score.toFixed(2)} [Sem: ${topNodes[0].semantic.toFixed(2)} / Struc: ${topNodes[0].structural.toFixed(2)}]`);

            // Explicitly anchor this to the frontier context so the Agent NEVER loses sight of it
            markdownAppend = `\n## Computed Golden Path (Strategic Recommendation)\n\n`;
            markdownAppend += `Based on the latest Tri-Vector Synthesis and Topological Priorities, the following tasks are mathematically recommended as the next immediate focus:\n\n`;

            topNodes.forEach((item, index) => {
                if (item.node && item.node.id) {
                    GraphService.linkNodes('frontier', item.node.id, 'GUIDES', item.score);
                    const title = item.node.properties?.title || item.node.properties?.name || item.node.name || 'Unknown Title';
                    markdownAppend += `${index + 1}. **${item.node.id}**: Score ${item.score.toFixed(2)} (Semantic: ${item.semantic.toFixed(2)}, Structural: ${item.structural.toFixed(2)})\n   - *${title}*\n`;
                }
            });

            try {
                logger.info('[GoldenPathSynthesizer] Instantiating API provider to interpret Mathematical Golden Path...');
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
                    logger.info('[GoldenPathSynthesizer] Successfully appended semantic strategic brief to Golden Path.');
                }
            } catch (e) {
                logger.warn('[GoldenPathSynthesizer] Failed to generate semantic interpretation for Golden Path (LLM Offline). Proceeding with pure mathematical output.', e);
            }
        } else {
            logger.info('[GoldenPathSynthesizer] No actionable unblocked issues found. Golden path empty.');
        }

        // Centralize full generation of sandman_handoff.md here, enforcing completely idempotent behavior.
        // Issue #9806: TTL Pruning and Issue #9805: Centralized overwrite
        let handoffContent = `# Autonomous Handoff (Dream Pipeline & Golden Path)\n\n`;
        handoffContent += `The Native Edge Graph has audited the codebase structurally. The following architectural coverage gaps currently exist natively within the SQLite matrix.\n\n`;

        const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days TTL (Time-to-Live)
        const now = Date.now();
        let gapElementsCount = 0;
        let prunedGaps = 0;

        let testGaps        = [];
        let guideGaps       = [];
        let exampleGaps     = [];
        let orphanConcepts  = [];

        GraphService.db.nodes.items.forEach(node => {
            if (node.properties?.capabilityGap) {
                const age = now - (node.properties.lastGapCheck || now);
                if (age > TTL_MS) {
                    // Stale, prune it!
                    delete node.properties.capabilityGap;
                    GraphService.upsertNode(node);
                    prunedGaps++;
                } else {
                    try {
                        // Parse JSON encoded array if possible, otherwise fallback to traditional string
                        let gaps = [];
                        if (node.properties.capabilityGap.startsWith('[')) {
                            gaps = JSON.parse(node.properties.capabilityGap);
                        } else {
                            gaps = node.properties.capabilityGap.split(/\\n|\n/);
                        }
                        gaps = [...new Set(gaps)];
                        gaps.forEach(gapMessage => {
                            let msg = gapMessage.trim();
                            if (msg.length > 0) {
                                gapElementsCount++;
                                if (msg.includes('[TEST_GAP]')) {
                                    testGaps.push({ id: node.id, msg: msg.replace('[TEST_GAP]', '').trim() });
                                } else if (msg.includes('[GUIDE_GAP]')) {
                                    guideGaps.push({ id: node.id, msg: msg.replace('[GUIDE_GAP]', '').trim() });
                                } else if (msg.includes('[EXAMPLE_GAP]')) {
                                    exampleGaps.push({ id: node.id, msg: msg.replace('[EXAMPLE_GAP]', '').trim() });
                                } else if (msg.includes('[ORPHAN_CONCEPT]')) {
                                    orphanConcepts.push({ id: node.id, msg: msg.replace('[ORPHAN_CONCEPT]', '').trim() });
                                } else {
                                    // Fallback for unlabeled
                                    testGaps.push({ id: node.id, msg });
                                }
                            }
                        });
                    } catch (e) {
                         const sanitizedMessage = node.properties.capabilityGap.replace(/\\n/g, ' ').replace(/\\n/g, ' ');
                         testGaps.push({ id: node.id, msg: sanitizedMessage });
                         gapElementsCount++;
                    }
                }
            }
        });

        if (gapElementsCount === 0) {
            handoffContent += `*No architectural gaps detected at this time. Codebase is aligned with structural jsdocx graph expectations.*\n`;
        } else {
            const limit = 5;
            if (testGaps.length > 0) {
                handoffContent += `### 🧪 Critical Test Constraints (\`${Math.min(testGaps.length, limit)}\` of \`${testGaps.length}\` items)\n`;
                testGaps.slice(0, limit).forEach(g => handoffContent += `- **\`${g.id}\`**: ${g.msg}\n`);
                handoffContent += `\n`;
            }
            if (guideGaps.length > 0) {
                handoffContent += `### 🗺️ Guide Disconnects (\`${Math.min(guideGaps.length, limit)}\` of \`${guideGaps.length}\` items)\n`;
                guideGaps.slice(0, limit).forEach(g => handoffContent += `- **\`${g.id}\`**: ${g.msg}\n`);
                handoffContent += `\n`;
            }
            if (exampleGaps.length > 0) {
                handoffContent += `### 💡 Example Disconnects (\`${Math.min(exampleGaps.length, limit)}\` of \`${exampleGaps.length}\` items)\n`;
                exampleGaps.slice(0, limit).forEach(g => handoffContent += `- **\`${g.id}\`**: ${g.msg}\n`);
                handoffContent += `\n`;
            }
            if (orphanConcepts.length > 0) {
                handoffContent += `### ⚠️ Orphaned Concepts (\`${Math.min(orphanConcepts.length, limit)}\` of \`${orphanConcepts.length}\` items)\n`;
                orphanConcepts.slice(0, limit).forEach(g => handoffContent += `- **\`${g.id}\`**: ${g.msg}\n`);
                handoffContent += `\n`;
            }
        }

        if (prunedGaps > 0) {
            logger.info(`[GoldenPathSynthesizer] TTL Pruning eradicated ${prunedGaps} stale Gaps from the Native Graph.`);
        }

        // --- Executive Priority Backlog ---
        const goldenIds = new Set(topNodes.map(item => item.node.id));
        let backlogAppend = '';
        try {
            const rawIssuesDir = path.resolve(__dirname, '../../../resources/content/issues');
            const filesRaw = fs.readdirSync(rawIssuesDir);
            const mdFiles = filesRaw.filter(f => f.endsWith('.md'));
            
            const openIssuesData = [];
            for (const file of mdFiles) {
                const issueId = file.replace(/\\.md$/, '');
                if (goldenIds.has(issueId)) continue; // Skip if already in Golden Path

                // Query SQLite GraphService natively instead of reading the filesystem content again
                const dbNode = GraphService.db.nodes.get(issueId);
                if (dbNode && (dbNode.state === 'OPEN' || dbNode.properties?.state === 'OPEN')) {
                    if (!dbNode.properties?.labels?.includes('needs-re-triage')) {
                        const numericId = parseInt(issueId.replace('issue-', ''), 10) || 0;
                        openIssuesData.push({ id: issueId, numericId, node: dbNode });
                    }
                }
            }

            openIssuesData.sort((a, b) => b.numericId - a.numericId);
            const latest5 = openIssuesData.slice(0, 5);

            if (latest5.length > 0) {
                backlogAppend += `\n## 📋 Latest Priority Backlog\n\nThe following open tickets represent the most recently created structural objectives.\n\n`;
                latest5.forEach((item, idx) => {
                   const title = item.node.properties?.title || item.node.properties?.name || item.node.name || 'Unknown Title';
                   const labels = item.node.properties?.labels || [];
                   const labelTags = labels.length > 0 ? ' [\\`' + labels.join('\\`, \\`') + '\\`]' : '';
                   backlogAppend += `${idx + 1}. **${item.id}**${labelTags}\n   - *${title}*\n`;
                });
            }
        } catch (e) {
            logger.warn('[GoldenPathSynthesizer] Failed to generate Latest Priority Backlog', e);
        }

        handoffContent += `${backlogAppend}${markdownAppend}`;

        const handoffFile = aiConfig.handoffFilePath;
        fs.writeFileSync(handoffFile, handoffContent.trim() + '\n', 'utf-8');
        logger.info(`[GoldenPathSynthesizer] sandman_handoff.md freshly generated via Centralized Pipeline. Golden Path integrated.`);

        logger.info(`[GoldenPathSynthesizer] Mathematical Golden Path established. Anchored ${topNodes.length} strategic nodes to frontier.`);
    }
}

export default Neo.setupClass(GoldenPathSynthesizer);
