import {conceptClusterKey, walkConceptNeighborhood} from './conceptNeighborhoodProbe.mjs';

/**
 * @module ai/services/graph/conceptAnchoredRetrieval
 * @summary Concept-anchored retrieval enrichment — the GP-v2 consumer-1 wrap (#14504; ticket-ref-ok: owning-leaf anchor).
 *
 * Owner contract: WRAP, never replace — the flat embedding path stays byte-identical when the
 * `conceptWalk` flag is absent; this module only ADDS walk-derived candidates that have re-entered
 * the caller's own RLS/tenant/trust filter chain. Resolver design is LEXICAL-FIRST by measured
 * necessity: only 8.2% of live CONCEPT nodes carry a `semanticVectorId` (probe artifact,
 * 2026-07-02), so cluster-key matching over node ids is the full-coverage first slice; semantic
 * assist over the vectored subset is the recall-extender once the canonical spine lands.
 *
 * Alias tolerance (mechanical scope): resolution groups CONCEPT/CLASS ids that share a NORMALIZED
 * cluster key — the case / separator / format variants of one concept (`CONCEPT:GoldenPath` /
 * `CONCEPT:Golden_Path` / `golden-path`). A form that normalizes to a DIFFERENT key (e.g.
 * `Golden Path Synthesis` → `golden-path-synthesis`) is correctly its own cluster; unifying true
 * `aliasOf` synonyms via the canonical concept-spine map is a follow-up (the ticket's alias RA).
 */

/**
 * The retrieval-event schema consumed by the measurement substrate (#14506 slice 2; ticket-ref-ok: sibling-leaf feed).
 * Transport is logger-emission for now — the durable feed is the measurement leaf's decision (#14506; ticket-ref-ok: sibling-leaf boundary); minting a data file
 * here would repeat the data-home class without its convergence. Schema is the contract.
 */
export const RETRIEVAL_EVENT_SCHEMA = Object.freeze({
    event           : 'concept-walk-retrieval',
    query           : 'String — the caller query, verbatim',
    resolvedConcepts: 'String[] — cluster keys that matched',
    walkContributed : 'Boolean — did any walk candidate survive filtering',
    candidatesAdded : 'Number — walk candidates appended after dedup + filters',
    filteredOut     : 'Number — walk candidates dropped by tenant/tombstone/trust filters',
    walkDurationMs  : 'Number — wall-clock ms spent in the concept-walk phase (resolve + walk + gate), for the latency budget'
});

/**
 * Config-declared, request-global traversal budget — the bounded-latency contract. A concept walk
 * must never dominate query latency: `conceptLimit` caps how many resolved clusters are walked,
 * `maxHops` the per-member depth, `hopBudget` the per-member edge ceiling. Explicit + frozen so the
 * bound is a stated contract (and the retrieval event's `walkDurationMs` is measured against it),
 * not an inline literal. Callers may override per-call, but these are the documented defaults.
 */
export const WALK_BUDGET = Object.freeze({conceptLimit: 5, maxHops: 2, hopBudget: 80});

/**
 * @summary Tokenizes a retrieval query into candidate cluster-key fragments.
 * @param {String} query Caller query.
 * @returns {String[]} Lowercased tokens of length >= 3, order-preserved, deduped.
 */
export function tokenizeQuery(query) {
    const tokens = String(query || '')
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter(t => t.length >= 3);

    return [...new Set(tokens)]
}

/**
 * @summary Resolves a query to concept alias-clusters via lexical cluster-key matching.
 *
 * Match ladder (best per cluster wins): exact full-query key (1.0) > adjacent-token bigram key
 * (0.8) > single-token key containment (0.5). Deterministic, read-only, zero graph writes.
 *
 * @param {Object} options
 * @param {Object} options.graphService Bound GraphService instance (or seam-compatible adapter).
 * @param {String} options.query Caller query.
 * @param {Number} [options.limit=5] Max clusters returned.
 * @param {Number} [options.scanLimit=25000] CONCEPT/CLASS rows scanned per label.
 * @returns {Object[]} `[{clusterKey, members: String[], matchType, score}]` best-first.
 */
export function resolveConcepts({graphService, query, limit = 5, scanLimit = 25000}) {
    const
        tokens   = tokenizeQuery(query),
        fullKey  = conceptClusterKey(String(query || '')),
        bigrams  = tokens.slice(0, -1).map((t, i) => `${t}-${tokens[i + 1]}`),
        clusters = new Map();

    if (!tokens.length) return [];

    for (const type of ['CONCEPT', 'CLASS']) {
        let records = [];

        try {
            records = graphService.listNodeRecordsByType({type, limit: scanLimit})?.records || []
        } catch {
            records = []
        }

        for (const record of records) {
            const id = record?.id;

            if (!id) continue;

            const key     = conceptClusterKey(id);
            const cluster = clusters.get(key) ?? {clusterKey: key, members: new Set(), matchType: null, score: 0};

            cluster.members.add(id);

            let matchType = null,
                score     = 0;

            if (fullKey && key === fullKey) {
                matchType = 'exact-key';
                score     = 1.0
            } else if (bigrams.includes(key)) {
                matchType = 'bigram-key';
                score     = 0.8
            } else if (tokens.some(t => key === t || key.includes(`${t}-`) || key.includes(`-${t}`) || key.startsWith(`${t}`) && key.length <= t.length + 1)) {
                matchType = 'token';
                score     = 0.5
            }

            if (score > cluster.score) {
                cluster.matchType = matchType;
                cluster.score     = score
            }

            clusters.set(key, cluster)
        }
    }

    return [...clusters.values()]
        .filter(c => c.score > 0)
        .sort((a, b) => b.score - a.score || a.clusterKey.localeCompare(b.clusterKey))
        .slice(0, limit)
        .map(c => ({clusterKey: c.clusterKey, members: [...c.members].sort(), matchType: c.matchType, score: c.score}))
}

/**
 * @summary Projects a walk hop's four-axis presence into candidate provenance — degrade-by-omission.
 *
 * The neighborhood read-probe proved most axes are absent-in-storage (only `authority` partially
 * materializes, and only on canonical concepts). The degrade-by-omission honesty contract is
 * therefore load-bearing: an axis present in storage carries the property keys under which it
 * materialized; an axis absent is OMITTED, never a fabricated null/false. A reader of the provenance can
 * tell "we know X about this edge" from "we have no stored signal for X" — the two must not blur.
 * @param {Object} hop A `walkConceptNeighborhood` hop (`{readAt, axisPresence, ...}`).
 * @returns {Object} `{readAt, axes}` — `axes` maps ONLY present axes to their storage keys.
 */
export function describeHopProvenance(hop = {}) {
    const axes = {};

    for (const [axis, info] of Object.entries(hop.axisPresence || {})) {
        if (info?.present) {
            axes[axis] = info.keys
        }
    }

    return {readAt: hop.readAt ?? null, axes}
}

/**
 * @summary Reconstructs the COMPLETE ordered walk path root→candidate, each hop carrying its own
 * degrade-by-omission provenance — the honest lineage, not just the terminal edge.
 *
 * `walkConceptNeighborhood` returns FLAT hops; a BFS parent map (each neighbor's first/lowest-depth
 * reaching hop) lets a depth-N candidate be traced back through its `fromId` chain to the root member.
 * A depth-2 candidate thus carries BOTH the intermediate hop (edge + axes) AND its own terminal hop,
 * rather than dropping hop-1 and its authority annotation.
 * @param {Object} options
 * @param {String} options.rootConcept The resolved cluster key the walk started from.
 * @param {String} options.nodeId The candidate node id whose path to reconstruct.
 * @param {String} options.rootMemberId The walked member id — the path root; the trace stops here.
 * @param {Map} options.parentHop `neighborId → its reaching hop` (the BFS parent edge).
 * @returns {Object} `{rootConcept, depth, hops: [{edgeType, neighborLabel, readAt, axes}, …]}` root-first.
 */
export function buildConceptPath({rootConcept, nodeId, rootMemberId, parentHop}) {
    const hops = [];

    let cursor = nodeId,
        guard  = 0;

    // trace fromId back to the root member; the guard bounds any malformed (cyclic) parent chain
    while (cursor && cursor !== rootMemberId && parentHop?.has(cursor) && guard++ < 32) {
        const hop = parentHop.get(cursor);

        hops.unshift({
            edgeType     : hop.edgeType ?? null,
            neighborLabel: hop.neighborLabel ?? null,
            ...describeHopProvenance(hop)
        });

        cursor = hop.fromId
    }

    return {rootConcept, depth: hops.length, hops}
}

/**
 * @summary The wrap: augments a flat embedding candidate list with concept-neighborhood-walk
 * candidates — never replacing, never displacing, always re-filtered through the caller's own gate.
 *
 * The contract, in order:
 * - **Wrap, never replace.** `conceptWalk` falsy (the default) → the caller's `candidates` are
 *   returned by reference, byte-identical, and NO event is emitted (no walk ran). This is the
 *   spec-pinned invariant: the flat path is untouched unless the caller explicitly opts in.
 * - **Resolve → walk → re-filter.** With the flag on, {@link resolveConcepts} maps the query to
 *   alias-clusters; each member's neighborhood is walked over RAW edges
 *   ({@link module:ai/services/graph/conceptNeighborhoodProbe.walkConceptNeighborhood} — the graph
 *   projection exposes only `weight`, so provenance-bearing retrieval MUST read raw). Every
 *   walk-reached node id is passed back through the caller's injected `resolveCandidate` — the SAME
 *   RLS/tenant/tombstone/trust gate the flat path already cleared. A raw-edge walk can reach a node
 *   the caller is not authorized to see; `resolveCandidate` returning null IS that authorization
 *   boundary, counted as `filteredOut`. Absent gate fails closed (nothing surfaces ungated).
 * - **Dedup, then append.** A walk node already in the embedding set (by id) is skipped — the wrap
 *   augments, it never duplicates or reorders. Survivors are appended AFTER the embedding
 *   candidates, each stamped `{via, conceptPath}` — `conceptPath` carries the complete ordered path
 *   with per-hop degrade-by-omission provenance ({@link buildConceptPath}).
 * - **Emit the event.** One {@link RETRIEVAL_EVENT_SCHEMA}-shaped event per opted-in call feeds the
 *   measurement leaf (transport = the injected `emit` sink; a logger in production).
 *
 * Read-only: the walk substrate asserts zero graph writes; this layer only reads, filters, merges.
 *
 * @param {Object} options
 * @param {Object} options.graphService Bound GraphService (or the resolver/walk seam adapter).
 * @param {String} options.query The caller query, verbatim.
 * @param {Object[]} [options.candidates=[]] The flat embedding top-k — returned untouched AND first.
 * @param {Boolean} [options.conceptWalk=false] The opt-in flag. Falsy → pure pass-through.
 * @param {Function} [options.resolveCandidate] `async (nodeId, {neighborLabel, edgeType}) =>
 *     hydratedAuthorizedCandidate | null` — the caller's hydrate + RLS/tenant/trust gate for a
 *     walk-reached node. The hop's `neighborLabel`/`edgeType` ride along so the gate can reject a
 *     non-retrievable node type (a FILE/CONCEPT neighbor) WITHOUT a hydration round-trip. Absent →
 *     every walk node is `filteredOut` (fail-closed).
 * @param {Function} [options.getCandidateId] `(candidate) => String` dedup-id extractor (default `.id`).
 * @param {Function} [options.emit] `(event) => void` retrieval-event sink (default no-op).
 * @param {Function} [options.now] `() => Number` wall-clock source for `walkDurationMs` (default `Date.now`; injectable for tests).
 * @param {Number} [options.conceptLimit] Max resolved clusters walked (default {@link WALK_BUDGET}.conceptLimit).
 * @param {Number} [options.maxHops] Per-member walk depth bound (default {@link WALK_BUDGET}.maxHops).
 * @param {Number} [options.hopBudget] Per-member edge budget (default {@link WALK_BUDGET}.hopBudget).
 * @returns {Promise<Object>} `{candidates: mergedArray, event: eventObject|null}` — `event` is null
 *     only on pass-through (flag off).
 */
export async function enrichWithConceptWalk({
    graphService,
    query,
    candidates     = [],
    conceptWalk    = false,
    resolveCandidate,
    getCandidateId = candidate => candidate?.id,
    emit,
    now            = () => Date.now(),
    conceptLimit   = WALK_BUDGET.conceptLimit,
    maxHops        = WALK_BUDGET.maxHops,
    hopBudget      = WALK_BUDGET.hopBudget
}) {
    // Wrap, never replace: no opt-in → the flat path returns byte-identical, no walk, no event.
    if (!conceptWalk) {
        return {candidates, event: null}
    }

    const
        walkStartedAt = now(),
        resolved      = resolveConcepts({graphService, query, limit: conceptLimit});

    if (!resolved.length) {
        const event = {
            event           : RETRIEVAL_EVENT_SCHEMA.event,
            query,
            resolvedConcepts: [],
            walkContributed : false,
            candidatesAdded : 0,
            filteredOut     : 0,
            walkDurationMs  : now() - walkStartedAt
        };

        emit?.(event);
        return {candidates, event}
    }

    const
        seen        = new Set(candidates.map(getCandidateId).filter(Boolean)),
        walkVisited = new Set(),
        added       = [];

    let filteredOut = 0;

    for (const cluster of resolved) {
        for (const memberId of cluster.members) {
            const
                walk      = walkConceptNeighborhood({graphService, conceptId: memberId, maxHops, hopBudget}),
                // BFS parent map for full-path reconstruction: keep each neighbor's FIRST (lowest-depth)
                // reaching hop — the shortest-path parent edge {@link buildConceptPath} traces back through.
                parentHop = new Map();

            for (const hop of walk.hops) {
                if (hop.neighborId && !parentHop.has(hop.neighborId)) {
                    parentHop.set(hop.neighborId, hop)
                }
            }

            for (const hop of walk.hops) {
                const nodeId = hop.neighborId;

                // dedup: already in the embedding set, or already surfaced by an earlier walk hop
                if (!nodeId || seen.has(nodeId) || walkVisited.has(nodeId)) continue;

                walkVisited.add(nodeId);

                // RLS re-entry: the raw-edge walk can reach nodes the caller may not see; the caller's
                // own gate is the authority, and its absence (or a null return) fails closed. The hop's
                // neighborLabel + edgeType ride along so the gate can skip a non-retrievable node type
                // (a FILE/CONCEPT neighbor) without a hydration round-trip.
                const hydrated = await resolveCandidate?.(nodeId, {neighborLabel: hop.neighborLabel, edgeType: hop.edgeType});

                if (!hydrated) {
                    filteredOut++;
                    continue
                }

                // the COMPLETE ordered path root→candidate, per-hop provenance — a depth-2 candidate
                // carries hop-1's edge + axes too, never only the terminal hop.
                added.push({
                    ...hydrated,
                    via        : 'concept-walk',
                    conceptPath: buildConceptPath({rootConcept: cluster.clusterKey, nodeId, rootMemberId: memberId, parentHop})
                })
            }
        }
    }

    const event = {
        event           : RETRIEVAL_EVENT_SCHEMA.event,
        query,
        resolvedConcepts: resolved.map(cluster => cluster.clusterKey),
        walkContributed : added.length > 0,
        candidatesAdded : added.length,
        filteredOut,
        walkDurationMs  : now() - walkStartedAt
    };

    emit?.(event);

    // wrap: embedding candidates first + untouched; walk candidates appended.
    return {candidates: [...candidates, ...added], event}
}
