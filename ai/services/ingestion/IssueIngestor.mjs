import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import {fileURLToPath} from 'url';
import crypto from 'crypto';
import Base from '../../../src/core/Base.mjs';
import { Memory_StorageRouter as StorageRouter } from '../../services.mjs';
import { Memory_GraphService as GraphService } from '../../services.mjs';
import logger from '../../mcp/server/memory-core/logger.mjs';
import {IDENTITIES} from '../../graph/identityRoots.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const loadIndexMap = async (neoRootDir, type) => {
    const map = new Map();
    const typeIndex = path.resolve(neoRootDir, `resources/content/${type}/_index.json`);
    const rootIndex = path.resolve(neoRootDir, 'resources/content/_index.json');

    let entries = [];
    if (fs.existsSync(typeIndex)) {
        entries = JSON.parse(await fs.promises.readFile(typeIndex, 'utf-8'));
    } else if (fs.existsSync(rootIndex)) {
        const rootEntries = JSON.parse(await fs.promises.readFile(rootIndex, 'utf-8'));
        entries = rootEntries.filter(e => e.type === type);
    }

    for (const entry of entries) {
        if (entry.path) {
            map.set(path.normalize(entry.path), entry.id);
        }
    }

    return map;
};

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
     * @summary Bare GitHub logins of registered internal authors (human owner + swarm maintainers),
     * derived from the canonical identity registry. The `@` prefix is stripped to match GitHub
     * issue-author logins. An empty set disables the community multiplier (safe degrade) instead of
     * boosting every ticket.
     * @member {Set<String>} internalAuthorLogins
     * @static
     */
    static internalAuthorLogins = new Set(
        IDENTITIES.map(identity => identity.properties?.githubLogin).filter(Boolean).map(login => login.replace(/^@/, ''))
    )

    /**
     * @summary Whether a ticket author qualifies for the community-multiplier boost: true when the
     * author exists, the internal-author registry is non-empty, and the author is not a registered
     * maintainer. The non-empty guard makes an unconfigured deployment degrade safely (multiplier
     * off) rather than treating every ticket as community-authored.
     * @param {String} author Ticket GitHub author login (bare form).
     * @param {Set<String>} [internalAuthorLogins=IssueIngestor.internalAuthorLogins] Injectable internal-author set (test seam).
     * @returns {Boolean}
     * @static
     */
    static isCommunityAuthor(author, internalAuthorLogins = IssueIngestor.internalAuthorLogins) {
        return Boolean(author) && internalAuthorLogins.size > 0 && !internalAuthorLogins.has(author)
    }

    /**
     * @summary Parses the local file system for markdown files and explicitly syncs their state
     * into the Native Graph database. Re-asserts edge weights for OPEN issues, heavily discounting
     * any nodes structurally blocked via BLOCKED_BY relationships to prevent GraphRAG hallucinations.
     * Upserts textual issue embeddings into the localized `neo_graph_nodes` SQLite vector collection.
     * @returns {Promise<Object[]>} Returns only the OPEN issues for synthesis.
     */
    async ingestIssueStates() {
        const targetPaths = [
            path.resolve(__dirname, '../../../resources/content/issues'),
            path.resolve(__dirname, '../../../resources/content/archive/issues')
        ];

        const filesRaw = [];
        for (const targetPath of targetPaths) {
            try {
                if (fs.existsSync(targetPath)) {
                    const files = await fs.promises.readdir(targetPath, { recursive: true });
                    filesRaw.push(...files.filter(f => typeof f === 'string' && f.endsWith('.md')).map(f => path.join(targetPath, f)));
                }
            } catch (e) {
                logger.warn(`[IssueIngestor] Error reading issues from ${targetPath}`, e);
            }
        }

        if (filesRaw.length === 0) {
            return [];
        }

        const files = filesRaw;
        const openIssues = [];
        const parsedIssues = [];

        const neoRootDir = path.resolve(__dirname, '../../..');
        const contentRoot = path.join(neoRootDir, 'resources/content');
        const indexMap = await loadIndexMap(neoRootDir, 'issues');

        let nodesCollection = null;
        if (StorageRouter) {
            nodesCollection = await StorageRouter.getGraphCollection();
        }

        // Pass 1: Upsert all nodes
        for (const filePath of files) {
            const content = await fs.promises.readFile(filePath, 'utf8');
            const match = content.match(/^---\n([\s\S]*?)\n---/);
            if (match) {
                try {
                    const meta = yaml.load(match[1]);
                    if (meta && meta.state) {
                        const relativeToContent = path.relative(contentRoot, filePath);
                        let id = indexMap.get(relativeToContent);
                        if (id === undefined) {
                            id = meta.id || path.basename(filePath).replace(/\.md$/, '').replace(/^issue-/, '');
                        }
                        const issueId = 'issue-' + id;

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

                        parsedIssues.push({ issueId, meta, content, filePath });
                    }
                } catch (e) {
                    logger.warn(`[IssueIngestor] Failed to parse frontmatter for ${filePath}`, e);
                }
            }
        }

        // Pass 2: Link edges and process open issues
        const extractIssueId = (str) => {
            if (!str) return null;
            const m = String(str).match(/(\d+)/);
            return m ? `issue-${m[1]}` : null;
        };

        for (const { issueId, meta, content, filePath } of parsedIssues) {
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
                            // Community Multiplier: boost externally-authored (non-maintainer) tickets that have been triaged.
                            if (IssueIngestor.isCommunityAuthor(meta.author)) {
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
                        sourceType: 'ISSUE',
                        issueId: issueId || meta.id || path.basename(filePath).replace(/\.md$/, ''),
                        createdAt: meta.createdAt,
                        title: meta.title,
                        body
                    });
                }
            } catch (e) {
                logger.warn(`[IssueIngestor] Failed to link edges for ${filePath}`, e);
            }
        }

        return openIssues;
    }

    /**
     * @summary Extracts Ideation Sandbox Discussion content to drive semantic and structural context.
     * Searches both active and archived discussion directories recursively.
     * @returns {Promise<void>}
     */
    async ingestDiscussionStates() {
        const targetPaths = [
            path.resolve(__dirname, '../../../resources/content/discussions'),
            path.resolve(__dirname, '../../../resources/content/archive/discussions')
        ];

        const files = [];
        for (const targetPath of targetPaths) {
            try {
                if (fs.existsSync(targetPath)) {
                    const items = await fs.promises.readdir(targetPath, { recursive: true });
                    files.push(...items.filter(f => typeof f === 'string' && f.endsWith('.md')).map(f => path.join(targetPath, f)));
                }
            } catch (e) {
                logger.warn(`[IssueIngestor] Error reading discussions from ${targetPath}`, e);
            }
        }

        const neoRootDir = path.resolve(__dirname, '../../..');
        const contentRoot = path.join(neoRootDir, 'resources/content');
        const indexMap = await loadIndexMap(neoRootDir, 'discussions');

        let nodesCollection = null;
        try {
            nodesCollection = await StorageRouter.getGraphCollection();
        } catch (e) {
            logger.warn('[IssueIngestor] Could not resolve graph collection via StorageRouter.');
        }

        for (const filePath of files) {
            const content = await fs.promises.readFile(filePath, 'utf8');
            const match = content.match(/^---\n([\s\S]*?)\n---/);
            if (match) {
                try {
                    const meta = yaml.load(match[1]);
                    if (meta) {
                        const relativeToContent = path.relative(contentRoot, filePath);
                        let id = indexMap.get(relativeToContent);
                        if (id === undefined) {
                            id = meta.number || path.basename(filePath).replace(/\.md$/, '').replace(/^discussion-/, '');
                        }
                        const discussionId = `discussion-${id}`;

                        // DiscussionSyncer emits lifecycle metadata; Golden Path OPEN filtering relies on graph state.
                        const
                            closed          = meta.closed === true,
                            discussionState = closed ? 'CLOSED' : 'OPEN',
                            closedAt        = closed ? (meta.closedAt || null) : null,
                            category        = meta.category || 'Ideas';

                        GraphService.upsertNode({
                            id: discussionId,
                            type: 'DISCUSSION',
                            name: meta.title || discussionId,
                            state: discussionState,
                            updatedAt: meta.updatedAt || meta.createdAt,
                            properties: {
                                state: discussionState,
                                closed,
                                closedAt,
                                category
                            }
                        });

                        const body = content.replace(/^---\n[\s\S]*?\n---\n/, '').trim();
                        const titleAndBody = `[DISCUSSION] ${meta.title}\n\n${body}`;

                        if (nodesCollection) {
                            const
                                lifecycleFingerprint = JSON.stringify({closed, closedAt, discussionState}),
                                contentHash = crypto.createHash('md5')
                                    .update(`${titleAndBody}\n${lifecycleFingerprint}`)
                                    .digest('hex');
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
                                    metadatas: [{
                                        hash: contentHash,
                                        title: meta.title,
                                        type: 'DISCUSSION',
                                        state: discussionState,
                                        closed,
                                        closedAt,
                                        category
                                    }]
                                });
                            }
                        }
                    }
                } catch (e) {
                    logger.warn(`[IssueIngestor] Failed to parse frontmatter for ${filePath}`, e);
                }
            }
        }
    }

    /**
     * @summary Performs dual-path semantic mining on active and archived PR review documents to extract heuristic tags.
     * Parses `[KB_GAP]`, `[TOOLING_GAP]`, and `[RETROSPECTIVE]` tags.
     * @returns {Promise<void>}
     */
    async ingestPullRequestFeedback() {
        const targetPaths = [
            path.resolve(__dirname, '../../../resources/content/pulls'),
            path.resolve(__dirname, '../../../resources/content/archive/pulls')
        ];

        const files = [];
        for (const targetPath of targetPaths) {
            try {
                if (fs.existsSync(targetPath)) {
                    const items = fs.readdirSync(targetPath, { recursive: true });
                    files.push(...items.filter(f => typeof f === 'string' && f.endsWith('.md')).map(f => path.join(targetPath, f)));
                }
            } catch (e) {
                logger.warn(`[IssueIngestor] Error reading pull requests from ${targetPath}`, e);
            }
        }

        const neoRootDir = path.resolve(__dirname, '../../..');
        const contentRoot = path.join(neoRootDir, 'resources/content');
        const indexMap = await loadIndexMap(neoRootDir, 'pulls');

        for (const filePath of files) {
            const content = fs.readFileSync(filePath, 'utf8');
            const match = content.match(/^---\n([\s\S]*?)\n---/);
            if (match) {
                try {
                    const meta = yaml.load(match[1]);
                    if (meta) {
                        const relativeToContent = path.relative(contentRoot, filePath);
                        let id = indexMap.get(relativeToContent);
                        if (id === undefined) {
                            id = meta.number || path.basename(filePath).replace(/\.md$/, '').replace(/^pr-/, '');
                        }
                        const prId = `pr-${id}`;

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
                                    name: `${gapType} from PR #${id}`,
                                    description: gapContent,
                                    properties: {
                                        sourcePr: prId,
                                        discoveredAt: meta.updatedAt || meta.createdAt
                                    }
                                });

                                // Create Hebbian edges
                                GraphService.linkNodes(gapNodeId, prId, 'DISCOVERED_IN', 1.0, {
                                    justification: `Extracted from PR #${id} feedback.`
                                });
                                GraphService.linkNodes(prId, gapNodeId, 'EVALUATED_BY', 1.0, {
                                    justification: `Gap evaluated during PR #${id} review.`
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
                                justification: `PR #${id} explicitly resolves Issue #${issueNumber}.`
                            });

                            logger.debug(`[IssueIngestor] Linked PR ${prId} as resolving ${issueNodeId}`);
                        }
                    }
                } catch (e) {
                    logger.warn(`[IssueIngestor] Failed to process pull request feedback for ${filePath}`, e);
                }
            }
        }
    }
}

export default Neo.setupClass(IssueIngestor);
