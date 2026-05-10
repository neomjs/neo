import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import {fileURLToPath} from 'url';
import crypto from 'crypto';
import Base from '../../../src/core/Base.mjs';
import { Memory_StorageRouter as StorageRouter } from '../../services.mjs';
import { Memory_GraphService as GraphService } from '../../services.mjs';
import logger from '../../mcp/server/memory-core/logger.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

/**
 * @class Neo.ai.daemons.services.IssueIngestor
 * @extends Neo.core.Base
 * @singleton
 */
class IssueIngestor extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.daemons.services.IssueIngestor'
         * @protected
         */
        className: 'Neo.ai.daemons.services.IssueIngestor',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * @summary Parses the local file system for markdown files and explicitly syncs their state
     * into the Native Graph database. Re-asserts edge weights for OPEN issues, heavily discounting
     * any nodes structurally blocked via BLOCKED_BY relationships to prevent GraphRAG hallucinations.
     * Upserts textual issue embeddings into the localized `neo_graph_nodes` SQLite vector collection.
     * @returns {Promise<Object[]>} Returns only the OPEN issues for synthesis.
     */
    async ingestIssueStates() {
        const issuesDir = path.resolve(__dirname, '../../../resources/content/issues');

        try {
            await fs.promises.access(issuesDir);
        } catch (e) {
            logger.warn(`[IssueIngestor] Issues directory not found at ${issuesDir}`);
            return [];
        }

        const filesRaw = await fs.promises.readdir(issuesDir, { recursive: true });
        const files = filesRaw.filter(f => typeof f === 'string' && f.endsWith('.md'));
        const openIssues = [];
        const parsedIssues = [];

        let nodesCollection = null;
        if (StorageRouter) {
            nodesCollection = await StorageRouter.getGraphCollection();
        }

        // Pass 1: Upsert all nodes
        for (const file of files) {
            const content = await fs.promises.readFile(path.join(issuesDir, file), 'utf8');
            const match = content.match(/^---\n([\s\S]*?)\n---/);
            if (match) {
                try {
                    const meta = yaml.load(match[1]);
                    if (meta && meta.state) {
                        const issueId = 'issue-' + (meta.id || path.basename(file).replace(/\.md$/, ''));

                        GraphService.upsertNode({
                            id: issueId,
                            type: 'ISSUE',
                            name: meta.title || issueId,
                            state: meta.state,
                            properties: {
                                state: meta.state,
                                labels: Array.isArray(meta.labels) ? meta.labels : []
                            },
                            updatedAt: meta.updatedAt || meta.createdAt
                        });

                        parsedIssues.push({ issueId, meta, content, file });
                    }
                } catch (e) {
                    logger.warn(`[IssueIngestor] Failed to parse frontmatter for ${file}`, e);
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
                    // Ensure local edge topology is completely lazily loaded into RAM BEFORE re-asserting native weights
                    GraphService.db.getAdjacentNodes(issueId, 'both');

                    // The Ancestral Anchor: Re-assert edge weights for active roadmap items
                    const edges = GraphService.db.edges.items.filter(e => e.source === issueId || e.target === issueId);
                    if (edges.length > 0) {
                        let baseWeight = 1.0;

                        // Check if this issue is mathematically blocked by any currently OPEN issues
                        let isBlocked = false;
                        if (Array.isArray(meta.blockedBy)) {
                            for (const blocker of meta.blockedBy) {
                                const blockerId = extractIssueId(blocker);
                                const blockerData = parsedIssues.find(p => p.issueId === blockerId);
                                if (blockerData && blockerData.meta.state === 'OPEN') {
                                    isBlocked = true;
                                    break;
                                }
                            }
                        }

                        if (isBlocked) {
                            baseWeight = 0.05;
                            logger.debug(`[IssueIngestor] Discounting topological weight for ${issueId} because it is BLOCKED_BY an OPEN issue.`);
                        } else {
                            // Community Multiplier: Boost if ticket is external and has been triaged
                            if (meta.author && meta.author !== 'tobiu') {
                                if (Array.isArray(meta.labels) && meta.labels.length > 0) {
                                    baseWeight += 0.5;
                                }
                            }

                            // Bug Multiplier: Forcing Context Priming towards regressions
                            if (Array.isArray(meta.labels) && meta.labels.includes('bug')) {
                                baseWeight += 1.0;
                            }
                        }

                        edges.forEach(e => {
                            e.properties.weight = baseWeight;
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
                            console.error("IssueIngestor GET error:", e);
                        }

                        if (needsEmbedding) {
                            logger.debug(`[IssueIngestor] Dynamically embedding OPEN issue: ${issueId}`);
                            await nodesCollection.upsert({
                                ids: [issueId],
                                documents: [titleAndBody],
                                metadatas: [{ hash: contentHash, title: meta.title, type: 'ISSUE' }]
                            });
                        }
                    }

                    openIssues.push({
                        title: meta.title,
                        issueId: meta.id || path.basename(file).replace(/\.md$/, ''),
                        body
                    });
                }
            } catch (e) {
                logger.warn(`[IssueIngestor] Failed to link edges for ${file}`, e);
            }
        }

        return openIssues;
    }

    /**
     * Parses the local file system for markdown discussions and syncs their state
     * into the Native Graph database as OPEN items so they can surface mathematically.
     */
    async ingestDiscussionStates() {
        const discussionsDir = path.resolve(__dirname, '../../../resources/content/discussions');

        try {
            await fs.promises.access(discussionsDir);
        } catch (e) {
            logger.warn(`[IssueIngestor] Discussions directory not found at ${discussionsDir}`);
            return;
        }

        const filesRaw = await fs.promises.readdir(discussionsDir);
        const files = filesRaw.filter(f => f.endsWith('.md'));
        
        let nodesCollection = null;
        try {
            nodesCollection = await StorageRouter.getGraphCollection();
        } catch (e) {
            logger.warn('[IssueIngestor] Could not resolve graph collection via StorageRouter.');
        }

        for (const file of files) {
            const content = await fs.promises.readFile(path.join(discussionsDir, file), 'utf8');
            const match = content.match(/^---\n([\s\S]*?)\n---/);
            if (match) {
                try {
                    const meta = yaml.load(match[1]);
                    if (meta && meta.number) {
                        const discussionId = `discussion-${meta.number}`;

                        GraphService.upsertNode({
                            id: discussionId,
                            type: 'DISCUSSION',
                            name: meta.title || discussionId,
                            state: 'OPEN', // Discussions are treated as perpetually open for semantic traversal
                            updatedAt: meta.updatedAt || meta.createdAt,
                            category: meta.category || 'Ideas'
                        });

                        const body = content.replace(/^---\n[\s\S]*?\n---\n/, '').trim();
                        const titleAndBody = `[DISCUSSION] ${meta.title}\n\n${body}`;

                        if (nodesCollection) {
                            const contentHash = crypto.createHash('md5').update(titleAndBody).digest('hex');
                            let needsEmbedding = true;

                            try {
                                const existing = await nodesCollection.get({ ids: [discussionId], include: ['metadatas'] });
                                if (existing && existing.ids.length > 0) {
                                    const exMeta = existing.metadatas[0] || {};
                                    if (exMeta.hash === contentHash) {
                                        needsEmbedding = false;
                                    }
                                }
                            } catch (e) {}

                            if (needsEmbedding) {
                                logger.debug(`[IssueIngestor] Dynamically embedding DISCUSSION: ${discussionId}`);
                                await nodesCollection.upsert({
                                    ids: [discussionId],
                                    documents: [titleAndBody],
                                    metadatas: [{ hash: contentHash, title: meta.title, type: 'DISCUSSION' }]
                                });
                            }
                        }
                    }
                } catch (e) {
                    logger.warn(`[IssueIngestor] Failed to parse frontmatter for ${file}`, e);
                }
            }
        }
    }

    /**
     * Parses the local file system for pull request reviews and syncs their embedded
     * gap signals ([KB_GAP], [TOOLING_GAP], [RETROSPECTIVE]) into the Native Graph database.
     */
    async ingestPullRequestFeedback() {
        const pullsDir = path.resolve(__dirname, '../../../resources/content/pulls');

        if (!fs.existsSync(pullsDir)) {
            logger.warn(`[IssueIngestor] Pull requests directory not found at ${pullsDir}`);
            return;
        }

        const files = fs.readdirSync(pullsDir).filter(f => f.endsWith('.md'));

        for (const file of files) {
            const content = fs.readFileSync(path.join(pullsDir, file), 'utf8');
            const match = content.match(/^---\n([\s\S]*?)\n---/);
            if (match) {
                try {
                    const meta = yaml.load(match[1]);
                    if (meta && meta.number) {
                        const prId = `pr-${meta.number}`;

                        // Upsert the PR node structurally
                        GraphService.upsertNode({
                            id: prId,
                            type: 'PULL_REQUEST',
                            name: meta.title || prId,
                            state: meta.state,
                            updatedAt: meta.updatedAt || meta.createdAt
                        });

                        // Lexical scanning for tags
                        const lines = content.split('\n');
                        for (const line of lines) {
                            const gapMatch = line.match(/\[(KB_GAP|TOOLING_GAP|RETROSPECTIVE)\](.*?)$/);
                            if (gapMatch) {
                                const gapType = gapMatch[1]; // KB_GAP, TOOLING_GAP, RETROSPECTIVE
                                const gapContent = gapMatch[2].replace(/^[\`\*:\s]+/, '').trim();
                                
                                if (!gapContent) continue;

                                // Generate deterministic ID based on PR and Gap Content
                                const gapHash = crypto.createHash('md5').update(`${prId}-${gapType}-${gapContent}`).digest('hex');
                                const gapNodeId = `GAP:${gapType}-${gapHash.substring(0, 8)}`;

                                // Upsert Gap Node
                                GraphService.upsertNode({
                                    id: gapNodeId,
                                    type: gapType,
                                    name: `${gapType} from PR #${meta.number}`,
                                    description: gapContent,
                                    properties: {
                                        sourcePr: prId,
                                        discoveredAt: meta.updatedAt || meta.createdAt
                                    }
                                });

                                // Create Hebbian edges
                                GraphService.linkNodes(gapNodeId, prId, 'DISCOVERED_IN', 1.0, {
                                    justification: `Extracted from PR #${meta.number} feedback.`
                                });
                                GraphService.linkNodes(prId, gapNodeId, 'EVALUATED_BY', 1.0, {
                                    justification: `Gap evaluated during PR #${meta.number} review.`
                                });
                                
                                logger.debug(`[IssueIngestor] Ingested ${gapType} from ${prId}: ${gapNodeId}`);
                            }
                        }

                        // Lexical scanning for Resolves/Closes/Fixes issue linkages
                        const issueMatches = [...content.matchAll(/(?:(?:Resolves|Closes|Fixes)\s+#)(\d+)/gi)];
                        for (const issueMatch of issueMatches) {
                            const issueNumber = issueMatch[1];
                            const issueNodeId = `issue-${issueNumber}`;

                            // Create Hebbian edge for PR resolving Issue
                            GraphService.linkNodes(prId, issueNodeId, 'RESOLVES', 1.0, {
                                justification: `PR #${meta.number} explicitly resolves Issue #${issueNumber}.`
                            });

                            logger.debug(`[IssueIngestor] Linked PR ${prId} as resolving ${issueNodeId}`);
                        }
                    }
                } catch (e) {
                    logger.warn(`[IssueIngestor] Failed to process pull request feedback for ${file}`, e);
                }
            }
        }
    }
}

export default Neo.setupClass(IssueIngestor);
