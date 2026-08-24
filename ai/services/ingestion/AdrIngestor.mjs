import crypto                                                                       from 'crypto';
import fs                                                                           from 'fs';
import path                                                                         from 'path';
import Base                                                                         from '../../../src/core/Base.mjs';
import {Memory_GraphService as GraphService, Memory_StorageRouter as StorageRouter} from '../../services.mjs';
import logger                                                                       from '../../mcp/server/memory-core/logger.mjs';
import {canonicalizeConceptId}                                                      from '../graph/conceptSpineCanonicalization.mjs';

const
    ADR_EDGE_TYPES = Object.freeze({
        CITES_AUTHORITY    : 'CITES_AUTHORITY',
        CODIFIES_CONCEPT   : 'CODIFIES_CONCEPT',
        GOVERNS            : 'GOVERNS',
        GRADUATED_FROM     : 'GRADUATED_FROM',
        IMPLEMENTS_DECISION: 'IMPLEMENTS_DECISION'
    }),
    ADR_FILE_REGEX     = /^(\d{4})-.*\.md$/,
    ISSUE_REF_REGEX    = /\b(?:Epic|Issue|Ticket)\s+#(\d+)\b/gi,
    PR_REF_REGEX       = /\bPR\s+#(\d+)\b/gi,
    CONCEPT_REF_REGEX  = /\bCONCEPT:([A-Za-z0-9_.:-]+)\b/g,
    SESSION_REF_REGEX  = /\bOrigin Session ID:\s*`?([A-Za-z0-9_.:-]+)`?/gi,
    STATUS_ROW_REGEX   = /^\|\s*\*\*Status\*\*\s*\|\s*([^|]+?)\s*\|/mi,
    STATUS_BOLD_REGEX  = /^\s*\*\*Status\*\*:\s*(.+)$/mi,
    // Third spelling, colon inside the bold. Without it the composition record's status matched
    // nothing and the `|| 'Draft'` fallback below turned a parse failure into a status claim — a
    // record the graph then reported as pending for weeks on the strength of a regex that missed it.
    STATUS_INNER_REGEX = /^\s*\*\*Status:\*\*\s*(.+)$/mi,
    SUPERSEDES_ROW_REGEX = /^\|\s*\*\*Supersedes\*\*\s*\|\s*([^|]+?)\s*\|/mi;

/**
 * Stable deep-stringify for ADR payload hashing. Sorts object keys recursively so
 * logically-identical metadata emits the same hash regardless of parser order.
 * @param {*} value
 * @returns {String}
 * @private
 */
function stableStringify(value) {
    if (value === null || typeof value !== 'object') {
        return JSON.stringify(value);
    }

    if (Array.isArray(value)) {
        return '[' + value.map(stableStringify).join(',') + ']';
    }

    const keys = Object.keys(value).sort();

    return '{' + keys.map(k => JSON.stringify(k) + ':' + stableStringify(value[k])).join(',') + '}';
}

/**
 * @summary Deterministically ingests Architecture Decision Records into the Native Edge Graph as
 * first-class `ADR` nodes with consumer-backed relationship edges.
 *
 * The ADR-node contract makes decision records graph-queryable without widening the REM LLM
 * extractor's `VALID_TYPES` enum. This service mirrors the `ConceptIngestor` pattern: scan the
 * version-controlled ADR corpus, parse stable metadata, upsert `ADR` nodes, and replace only
 * ADR-owned edge taxonomy rows. It is intentionally deterministic and filesystem-backed; no LLM
 * inference is involved, and no speculative edges are emitted.
 *
 * Non-Accepted ADR status values in the current corpus normalize to `Draft` for the pinned
 * ADR-node contract while preserving the source value as `rawStatus`.
 *
 * @class Neo.ai.daemons.services.AdrIngestor
 * @extends Neo.core.Base
 * @see learn/agentos/decisions/0006-adrs-as-graph-queryable-entities.md
 * @see Neo.ai.daemons.services.ConceptIngestor
 * @singleton
 */
class AdrIngestor extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.daemons.services.AdrIngestor'
         * @protected
         */
        className: 'Neo.ai.daemons.services.AdrIngestor',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * Computes the differential-sync hash stored under `properties.payloadHash`.
     * @param {Object} adr Parsed ADR metadata.
     * @returns {String}
     * @protected
     */
    computePayloadHash(adr) {
        const payload = {
            adrNumber : adr.adrNumber,
            rawStatus : adr.rawStatus,
            source    : adr.source,
            status    : adr.status,
            supersedes: adr.supersedes,
            title     : adr.title
        };

        return crypto.createHash('sha256').update(stableStringify(payload)).digest('hex');
    }

    /**
     * @summary Parses a markdown ADR file into graph-node metadata and deterministic edge rows.
     * @param {String} fileName ADR markdown file name.
     * @param {String} content ADR markdown body.
     * @param {String} source Repo-relative source path.
     * @returns {Object}
     * @protected
     */
    parseAdr(fileName, content, source) {
        const fileMatch = fileName.match(ADR_FILE_REGEX);
        if (!fileMatch) {
            throw new Error(`Invalid ADR file name: ${fileName}`);
        }

        const
            adrNumber    = fileMatch[1],
            id           = `adr-${adrNumber}`,
            headingMatch = content.match(/^#\s+ADR\s+\d{4}:?\s*(.+)$/mi),
            title        = headingMatch?.[1]?.trim() || path.basename(fileName, '.md'),
            statusMatch  = content.match(STATUS_ROW_REGEX) || content.match(STATUS_BOLD_REGEX) || content.match(STATUS_INNER_REGEX),
            rawStatus    = (statusMatch?.[1] || 'Draft').replace(/\s+/g, ' ').trim(),
            status       = /^Accepted\b/i.test(rawStatus) ? 'Accepted' : 'Draft',
            supersedes   = this.parseSupersedes(content);

        return {
            adrNumber,
            id,
            rawStatus,
            source,
            status,
            supersedes,
            title,
            edges: this.parseEdges(id, content)
        };
    }

    /**
     * Parses the ADR table's Supersedes cell into a reviewable array without attempting to
     * interpret the prose into richer graph nodes.
     * @param {String} content ADR markdown body.
     * @returns {String[]}
     * @protected
     */
    parseSupersedes(content) {
        const match = content.match(SUPERSEDES_ROW_REGEX);
        if (!match) {
            return [];
        }

        return match[1]
            .split(/;|\n/)
            .map(item => item.replace(/^\s*(?:[-*]\s+|\([a-z0-9]+\)\s+|[a-z0-9]+\.\s+)/i, '').trim())
            .filter(Boolean);
    }

    /**
     * Extracts only the consumer-backed ADR edge taxonomy from deterministic textual anchors.
     * @param {String} adrId Stable ADR node id (`adr-NNNN`).
     * @param {String} content ADR markdown body.
     * @returns {Object[]}
     * @protected
     */
    parseEdges(adrId, content) {
        const edges = new Map();

        const addEdge = (source, target, type, properties = {}) => {
            edges.set(`${source}|${target}|${type}`, {source, target, type, properties});
        };

        for (const match of content.matchAll(ISSUE_REF_REGEX)) {
            const issueId = `issue-${match[1]}`;
            addEdge(adrId, issueId, ADR_EDGE_TYPES.GOVERNS);
            addEdge(issueId, adrId, ADR_EDGE_TYPES.CITES_AUTHORITY);
        }

        for (const match of content.matchAll(PR_REF_REGEX)) {
            addEdge(`pr-${match[1]}`, adrId, ADR_EDGE_TYPES.IMPLEMENTS_DECISION);
        }

        for (const match of content.matchAll(SESSION_REF_REGEX)) {
            addEdge(adrId, `session:${match[1]}`, ADR_EDGE_TYPES.GRADUATED_FROM);
        }

        for (const match of content.matchAll(CONCEPT_REF_REGEX)) {
            // Route through the concept-spine SSOT so ADR CODIFIES_CONCEPT edges target the same canonical
            // node the session/mailbox mints do (`GoldenPath` → `golden-path`); keep the raw ref if the
            // canonicalization comes back empty — never drop the edge (Contract Ledger fallback).
            addEdge(adrId, canonicalizeConceptId(match[1]) || match[1], ADR_EDGE_TYPES.CODIFIES_CONCEPT);
        }

        return Array.from(edges.values());
    }

    /**
     * Ensures edge endpoints exist before insertion. The graph storage layer enforces foreign
     * keys for both endpoint columns, so deterministic ADR edges seed only minimal stubs when
     * the richer issue/PR/session/concept ingestors have not materialized a node yet.
     * @param {Object[]} edges ADR edge rows to insert.
     * @protected
     */
    ensureEdgeEndpointsExist(edges) {
        for (const edge of edges) {
            this.ensureNodeExists(edge.source);
            this.ensureNodeExists(edge.target);
        }
    }

    /**
     * Creates a minimal node stub for an edge endpoint if no richer node is already present.
     * @param {String} id Graph node id.
     * @protected
     */
    ensureNodeExists(id) {
        GraphService.db.getAdjacentNodes(id, 'both');

        if (GraphService.db.nodes.get(id)) {
            return;
        }

        let type = 'CONCEPT';
        if (id.startsWith('adr-')) {
            type = 'ADR';
        } else if (id.startsWith('issue-')) {
            type = 'ISSUE';
        } else if (id.startsWith('pr-')) {
            type = 'PULL_REQUEST';
        } else if (id.startsWith('discussion-')) {
            type = 'DISCUSSION';
        } else if (id.startsWith('session:')) {
            type = 'SESSION';
        }

        GraphService.upsertNode({
            id,
            type,
            name      : id,
            properties: {isAdrEdgeStub: true}
        });
    }

    /**
     * Removes and replaces all ADR-taxonomy edges incident to one ADR node.
     * @param {String} adrId Stable ADR node id.
     * @param {Object[]} edges Replacement edge rows.
     * @protected
     */
    replaceAdrEdges(adrId, edges) {
        const
            db            = GraphService.db,
            adrEdgeTypes  = new Set(Object.values(ADR_EDGE_TYPES)),
            existingEdges = db.edges.items.slice(),
            edgesToRemove = existingEdges.filter(edge =>
                adrEdgeTypes.has(edge.type) && (edge.source === adrId || edge.target === adrId)
            );

        if (edgesToRemove.length > 0) {
            db.edges.remove(edgesToRemove);
        }

        this.ensureEdgeEndpointsExist(edges);

        for (const edge of edges) {
            db.addEdge(edge);
        }
    }

    /**
     * Main entry point. Scans local ADR markdown files, upserts `ADR` nodes, and refreshes the
     * deterministic ADR edge taxonomy.
     * @param {Object} [options]
     * @param {String} [options.decisionsDir] Absolute or repo-relative ADR directory override.
     * @param {String} [options.sourceRoot=process.cwd()] Source-root used for repo-relative paths.
     * @returns {Promise<Object>} `{adrsProcessed, adrsUpserted, adrsSkipped, edgesReplaced, errors}`
     */
    async syncAdrsToGraph({decisionsDir = 'learn/agentos/decisions', sourceRoot = process.cwd()} = {}) {
        const stats = {
            adrsProcessed: 0,
            adrsUpserted : 0,
            adrsSkipped  : 0,
            edgesReplaced: 0,
            errors       : []
        };

        try {
            const
                rootDir = path.resolve(sourceRoot),
                adrDir  = path.resolve(rootDir, decisionsDir);

            if (!fs.existsSync(adrDir)) {
                stats.errors.push(`[input] ADR directory not found: ${adrDir}`);
                return stats;
            }

            const files = (await fs.promises.readdir(adrDir)).filter(file => ADR_FILE_REGEX.test(file)).sort();

            // ADR nodes embed into the graph collection so they surface in the candidate-pool
            // semantic search (the graph collection's vector query — e.g. GoldenPathSynthesizer's
            // hybrid traversal). Without this the node is inserted but inert to vector retrieval.
            // (NB: `search_nodes` is SQLite fuzzy text + `query_hybrid_graph` is topology-by-node-id;
            // neither is the vector path — the collection query is.) Mirrors IssueIngestor.
            const nodesCollection = StorageRouter ? await StorageRouter.getGraphCollection() : null;

            for (const file of files) {
                stats.adrsProcessed++;

                try {
                    const
                        filePath     = path.join(adrDir, file),
                        source       = path.relative(rootDir, filePath),
                        content      = await fs.promises.readFile(filePath, 'utf8'),
                        adr          = this.parseAdr(file, content, source),
                        payloadHash  = this.computePayloadHash(adr),
                        existingNode = GraphService.db.nodes.get(adr.id);

                    // The vector tracks the FULL document (title + body); `payloadHash` deliberately
                    // excludes the body, so a body-only edit must still re-embed. Compute embed
                    // freshness first (an md5 over the document) so the skip below cannot strand a
                    // stale vector behind an unchanged-metadata skip.
                    let docText = null, contentHash = null, embedCurrent = false;
                    if (nodesCollection) {
                        docText     = `${adr.title}\n\n${content}`;
                        contentHash = crypto.createHash('md5').update(docText).digest('hex');
                        try {
                            const existing = await nodesCollection.get({ids: [adr.id], include: ['metadatas']});
                            embedCurrent = existing?.ids?.length > 0 && (existing.metadatas[0] || {}).hash === contentHash;
                        } catch (e) {
                            logger.warn(`[AdrIngestor] graph-collection GET failed for ${adr.id}: ${e.message}`);
                        }
                    }

                    // Skip only when BOTH the node metadata AND the embedded document are current.
                    if (existingNode?.properties?.payloadHash === payloadHash && (embedCurrent || !nodesCollection)) {
                        stats.adrsSkipped++;
                        continue;
                    }

                    GraphService.upsertNode({
                        id        : adr.id,
                        type      : 'ADR',
                        name      : adr.title,
                        properties: {
                            adrNumber     : adr.adrNumber,
                            adrNumberValue: Number(adr.adrNumber),
                            payloadHash,
                            rawStatus     : adr.rawStatus,
                            // The node points at its own document vector (keyed by the ADR id in the
                            // graph collection) so a consumer reading the SQLite node knows it is embedded.
                            semanticVectorId: adr.id,
                            source          : adr.source,
                            status          : adr.status,
                            supersedes      : adr.supersedes,
                            title           : adr.title
                        }
                    });

                    // Re-embed the document whenever its content changed (the collection auto-embeds
                    // the `documents` text; upsert-by-id keeps it idempotent).
                    if (nodesCollection && !embedCurrent) {
                        await nodesCollection.upsert({
                            ids      : [adr.id],
                            documents: [docText],
                            metadatas: [{hash: contentHash, title: adr.title, type: 'ADR'}]
                        });
                    }

                    stats.adrsUpserted++;
                    this.replaceAdrEdges(adr.id, adr.edges);
                    stats.edgesReplaced += adr.edges.length;
                } catch (e) {
                    stats.errors.push(`[${file}] ${e.message}`);
                    logger.warn(`[AdrIngestor] Failed to ingest ADR '${file}': ${e.message}`);
                }
            }

            logger.info(`[AdrIngestor] Sync complete: ${stats.adrsUpserted} upserted, ${stats.adrsSkipped} unchanged, ${stats.edgesReplaced} edges${stats.errors.length > 0 ? `, ${stats.errors.length} errors` : ''}.`);
        } catch (e) {
            logger.error('[AdrIngestor] Fatal sync error:', e);
            stats.errors.push(`[fatal] ${e.message}`);
        }

        return stats;
    }
}

export default Neo.setupClass(AdrIngestor);
