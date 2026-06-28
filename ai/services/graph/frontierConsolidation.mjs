import {Memory_GraphService as GraphService} from '../../services.mjs';

/**
 * @module ai/services/graph/frontierConsolidation
 * @summary Frontier-edge maintenance + consolidation-liveness rendering, extracted from
 * `GoldenPathSynthesizer` as part of the SRP decomposition.
 *
 * Owner contract: prune stale `frontier -> GUIDES` steering edges, read the N most-recent session
 * summaries by recency (Chroma `.get` has no ORDER BY), and render the visibility-only Consolidation
 * Gaps section (undigested sessions made visible; failure must never read as a false all-clear).
 * `GoldenPathSynthesizer` keeps thin delegating shims so its public API stays stable.
 */

/**
 * @summary Removes stale Computed Golden Path guide edges from the frontier.
 *
 * `frontier -> GUIDES` edges are a machine-consumed steering surface. Each
 * synthesis pass must remove recommendations that are no longer present in
 * the current computed result; otherwise a zero-node render can leave old
 * guidance active in the graph after the handoff stops rendering it.
 *
 * @param {Object} [options]
 * @param {Object} [options.graphService=GraphService] Graph service instance.
 * @param {Set<String>} [options.currentTargetIds=new Set()] Current computed target ids.
 * @returns {Number} Count of stale guide edges removed.
 */
export function pruneStaleFrontierGuideEdges({
    graphService = GraphService,
    currentTargetIds = new Set()
} = {}) {
    graphService?.db?.getAdjacentNodes?.('frontier', 'out');

    const staleEdges = (graphService?.db?.edges?.getByIndex?.('source', 'frontier') || [])
        .filter(edge => edge.type === 'GUIDES' && !currentTargetIds.has(edge.target));

    if (staleEdges.length > 0) {
        graphService.db.edges.remove(staleEdges.map(edge => edge.id));
        // Drop the exact index references returned above in case the Store map points at refreshed edge objects.
        graphService.db.edges.updateIndexMaps?.(null, staleEdges);
    }

    return staleEdges.length
}

/**
 * @summary Reads the N most-recent session summaries by timestamp metadata (newest-first).
 *
 * ChromaDB `.get` has no `ORDER BY`, so `.get({limit})` returns storage-order — which anchored the
 * Frontier Baseline Vector to arbitrary (often oldest) summaries, starving the Computed Golden Path
 * of current work. This reads summary metadatas, sorts by the summary timestamp, and reads back only
 * the most-recent N documents. The frontier must reflect CURRENT work because the semantic pillar is
 * the designed pathway for surfacing new (correctly low-structural-weight) issues.
 *
 * @param {Object} collection Summary Chroma collection (exposes async `.get`).
 * @param {Number} n Number of most-recent summaries to return.
 * @returns {Promise<{documents: String[]}>} The N most-recent summary documents, newest-first.
 */
export async function getRecentSummaryDocuments(collection, n) {
    const meta      = await collection.get({include: ['metadatas']});
    const resolveTs = m => {
        const raw = m?.timestamp ?? m?.lastActivity ?? m?.updatedAt ?? m?.createdAt;
        return Number.isFinite(Number(raw)) ? Number(raw) : (Date.parse(raw) || 0);
    };

    const recentIds = (meta?.ids || [])
        .map((id, idx) => ({id, ts: resolveTs(meta.metadatas?.[idx])}))
        .sort((a, b) => b.ts - a.ts)
        .slice(0, Math.max(0, n))
        .map(entry => entry.id);

    if (recentIds.length === 0) {
        return {documents: []};
    }

    const recent = await collection.get({ids: recentIds, include: ['documents']});
    // Chroma `.get({ids})` does not preserve request order — re-key to the recency ranking.
    const byId = new Map((recent?.ids || []).map((id, idx) => [id, recent.documents?.[idx]]));

    return {documents: recentIds.map(id => byId.get(id)).filter(doc => doc !== undefined && doc !== null)};
}

/**
 * @summary Renders the Consolidation Gaps section — undigested sessions made visible.
 *
 * Consolidation-liveness: the dream must **visibly record** sessions it has NOT digested,
 * never silently. A fresh handoff over an undigested backlog reads healthy
 * ("health-green-but-map-lying") unless the gap is surfaced — a lost walk must be *visibly*
 * lost. Queries the summary collection for `graphDigested !== true` and renders the count +
 * a bounded sample. Visibility-only: no routing change.
 *
 * **Failure must not read as healthy.** A thrown query OR a malformed (non-array) response
 * renders an explicit `Status UNKNOWN` state — never blank and never a `0 undigested`
 * all-clear (which would be the exact false-green this section exists to prevent). A valid
 * empty response IS a real all-clear, but reports the checked-count so "0 checked" is
 * distinguishable from "0 undigested of N".
 *
 * @param {Object} summaryColl Summary Chroma collection (exposes async `.get`).
 * @param {Object} [options]
 * @param {Number} [options.limit=5] Max undigested sessions to sample.
 * @returns {Promise<String>} The rendered section (always non-empty — gap, all-clear, or unknown).
 */
export async function renderConsolidationGapsSection(summaryColl, {limit = 5} = {}) {
    const header = `\n## Consolidation Gaps\n\n*Consolidation-liveness: sessions the dream has NOT yet laid as trails. A lost walk is visibly lost, never silently absent — a fresh handoff must not read healthy over an undigested backlog.*\n\n`;

    let raw;
    try {
        raw = await summaryColl.get({include: ['metadatas']});
    } catch (e) {
        // A failed query must NOT read as healthy — surface an explicit unknown state.
        return `${header}❓ **Status UNKNOWN** — the summary collection query failed (\`${e.message}\`); consolidation health could not be determined. This is NOT an all-clear.\n`;
    }

    // A malformed response (no metadata array) is unknown, NOT zero-undigested.
    if (!raw || !Array.isArray(raw.metadatas)) {
        return `${header}❓ **Status UNKNOWN** — the summary collection returned a malformed response (no metadata array); consolidation health could not be determined. This is NOT an all-clear.\n`;
    }

    const metas      = raw.metadatas,
          ids        = Array.isArray(raw.ids) ? raw.ids : [],
          undigested = [];

    for (let i = 0; i < metas.length; i++) {
        const meta = metas[i];
        // graphDigested is set true only after BOTH deterministic ingestion AND the
        // semantic extractor complete (DreamService); anything else is an un-laid trail.
        if (meta && meta.graphDigested !== true && meta.graphDigested !== 'true') {
            undigested.push({id: ids[i], title: meta.title || meta.sessionId || ids[i]});
        }
    }

    if (undigested.length === 0) {
        return `${header}✅ 0 sessions undigested — consolidation is current (${metas.length} session(s) checked).\n`;
    }

    let section = `${header}⚠️ **${undigested.length} session(s) undigested** (\`graphDigested !== true\`)`;
    section += undigested.length > limit ? `, showing ${limit}:\n` : `:\n`;

    for (const item of undigested.slice(0, limit)) {
        section += `- \`${item.id}\` — ${item.title}\n`;
    }

    return section
}
