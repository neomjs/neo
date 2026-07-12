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
    walkDurationMs  : 'Number — wall-clock ms spent in the concept-walk phase (resolve + walk + gate), for the latency budget',
    truncated       : 'Boolean — did the request-global edge budget OR the hydration maxCandidates ceiling cut work short (more existed than were returned)'
});

/**
 * Config-declared, request-global traversal budget — the bounded-latency contract. A concept walk
 * must never dominate query latency: `conceptLimit` caps how many resolved clusters are walked,
 * `maxHops` the per-member depth, `hopBudget` the per-member edge ceiling, and `maxCandidates` the
 * total hydrated walk candidates (the **bounded-hydration** ceiling — hydration stops once it is hit,
 * and the retrieval event's `truncated` flag reports honestly that more existed). Explicit + frozen so
 * the bound is a stated contract (measured against by `walkDurationMs`), not an inline literal.
 * Callers may override per-call, but these are the documented defaults.
 */
export const WALK_BUDGET = Object.freeze({conceptLimit: 5, maxHops: 2, hopBudget: 80, maxCandidates: 40});

/**
 * RLS Depth-Floor allow-list: the public-structural node labels the RETRIEVAL walk may traverse THROUGH
 * to reach a deeper candidate. Fail-closed — a neighbor whose label is absent (private or person-scoped
 * substrate: AGENT_MEMORY, MEMORY, SESSION, MESSAGE, SUMMARY variants, presence/subscription state, or any
 * unknown/new label) is recorded as a hop and gated as a candidate, but never expanded through: a terminal
 * candidate's own authorization does NOT authorize the private PATH crossed to reach it (Emmy cycle-2
 * Depth-Floor). Passed to walkConceptNeighborhood as `traversableLabels`; the reachability probe passes
 * nothing (null = full-reachability measurement, privacy applied at render). An allow-list (not a private
 * deny-list) fails closed: a newly-added private label leaks nothing until explicitly allow-listed.
 */
export const PUBLIC_TRAVERSABLE_LABELS = Object.freeze(['CONCEPT', 'FILE']);

/**
 * TWO ORTHOGONAL edge-type policies (the walk records EVERY hop; these two gates decide, separately, what
 * carries the walk onward vs what may become a candidate). Node-RLS + node-label gates stay as defense in depth.
 *
 * 1. EXPANSION — `CONCEPT_EXPANSION_EDGE_TYPES`: retrieval-bearing concept↔concept relations that may carry
 *    the walk THROUGH a CONCEPT to a sibling concept. Same for both consumers. An arbitrary structural/social
 *    edge (DISCUSSED_IN, AUTHORED_BY, PARENT_OF, RESOLVES, SENT_TO) does NOT expand.
 * 2. TERMINAL candidate-admission — `*_TERMINAL_EDGE_TYPES` (per consumer, gated in enrich BEFORE hydration):
 *    which edge TYPE may admit a reached terminal as a retrieval candidate. This is NOT covered by expansion:
 *    a hop is recorded regardless of its edge type, so WITHOUT this gate an arbitrary `SENT_TO → FILE` edge
 *    still hydrates the FILE — node RLS authorizes the NODE, never the relation that selected it (@neo-gpt
 *    Cycle-4 falsifier). KB admits the 3 concept→FILE ontology edges `IMPLEMENTED_BY`/`EXPLAINED_BY`/
 *    `EXEMPLIFIED_BY` (the concept→FILE guide + source retrieval relations); Memory admits
 *    `MENTIONED_IN`/`TAGGED_CONCEPT → AGENT_MEMORY`. A concept-relation edge can EXPAND but
 *    cannot itself hydrate an artifact.
 *
 * Extensible frozen consts; taxonomy V-B-A'd from SemanticGraphExtractor + ConceptService.
 */
export const CONCEPT_EXPANSION_EDGE_TYPES = Object.freeze(['PARENT_CONCEPT', 'RELATES_TO', 'ANALOGOUS_TO', 'REQUIRES']);
export const KB_TERMINAL_EDGE_TYPES        = Object.freeze(['IMPLEMENTED_BY', 'EXPLAINED_BY', 'EXEMPLIFIED_BY']);
export const MEMORY_TERMINAL_EDGE_TYPES    = Object.freeze(['MENTIONED_IN', 'TAGGED_CONCEPT']);

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

            // consume the concept-spine canonical alias map: a node the defrag stamped with
            // `canonicalConceptId` clusters under ITS canonical, unifying true aliasOf synonyms the
            // mechanical normalizer alone would keep separate. Un-stamped nodes fall back to the
            // normalized id — byte-identical to the pre-alias-map behavior.
            const key     = conceptClusterKey(record.properties?.canonicalConceptId || id);
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
 * @param {String[]|null} [options.traversableNodeLabels] Explicit allow-list of neighbor node labels
 *     eligible to become candidates for this surface (e.g. `['AGENT_MEMORY']` for memories, `['FILE']`
 *     for the KB). Null → no type filter. A non-eligible label is skipped before the gate (not `filteredOut`).
 * @param {String[]|null} [options.traversableEdgeTypes] EXPANSION gate: edge types that may carry the walk
 *     THROUGH a node (default null = no gate, probe mode; consumers pass {@link CONCEPT_EXPANSION_EDGE_TYPES}).
 *     Passed to walkConceptNeighborhood. Gates expansion only — a terminal reached via any edge is still
 *     RECORDED, which is why {@link options.terminalEdgeTypes} exists as the separate candidate-admission gate.
 * @param {String[]|null} [options.terminalEdgeTypes] TERMINAL candidate-admission gate: edge types that may
 *     admit a reached terminal as a retrieval candidate (default null = admit any; consumers pass their
 *     per-surface {@link KB_TERMINAL_EDGE_TYPES}/{@link MEMORY_TERMINAL_EDGE_TYPES}). Checked BEFORE hydration:
 *     an arbitrary edge (SENT_TO) to an otherwise-authorized node does NOT make it a candidate — node RLS
 *     authorizes the node, never the relation that selected it (@neo-gpt Cycle-4 falsifier).
 * @param {Number} [options.conceptLimit] Max resolved clusters walked (default {@link WALK_BUDGET}.conceptLimit).
 * @param {Number} [options.maxHops] Per-member walk depth bound (default {@link WALK_BUDGET}.maxHops).
 * @param {Number} [options.hopBudget] Per-member edge budget (default {@link WALK_BUDGET}.hopBudget).
 * @param {Number} [options.maxCandidates] Bounded-hydration ceiling — total hydration ATTEMPTS, not just
 *     successful appends (a rejected hydration still did the gate round-trip, so it counts; default
 *     {@link WALK_BUDGET}.maxCandidates); hydration stops when hit and the event's `truncated` flag reports
 *     honestly that more existed.
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
    now                  = () => Date.now(),
    traversableNodeLabels = null,
    traversableLabels     = PUBLIC_TRAVERSABLE_LABELS,
    traversableEdgeTypes  = null,
    terminalEdgeTypes     = null,
    rlsPredicate          = null,
    edgeRlsPredicate      = null,
    conceptLimit         = WALK_BUDGET.conceptLimit,
    maxHops              = WALK_BUDGET.maxHops,
    hopBudget            = WALK_BUDGET.hopBudget,
    maxCandidates        = WALK_BUDGET.maxCandidates
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
            walkDurationMs  : now() - walkStartedAt,
            truncated       : false
        };

        emit?.(event);
        return {candidates, event}
    }

    const
        seen        = new Set(candidates.map(getCandidateId).filter(Boolean)),
        walkVisited = new Set(),
        added       = [];

    let filteredOut        = 0,
        hydrationAttempts  = 0,
        remainingHopBudget = hopBudget,
        truncated          = false;

    // Security-by-default: with no explicit rlsPredicate, bind the GraphService-owned per-node RLS seam
    // so the walk never traverses THROUGH a node the requester can't see. A graphService without the
    // seam (test fixtures / the reachability probe) → null → no gate (full reachability, privacy at render).
    const effectiveRlsPredicate = rlsPredicate ??
        (typeof graphService?.isNodeVisibleToRequester === 'function'
            ? nodeId => graphService.isNodeVisibleToRequester(nodeId)
            : null);

    // Security-by-default (edge dimension): with no explicit edgeRlsPredicate, bind the GraphService-owned
    // per-EDGE RLS seam so a foreign / other-tenant edge between visible nodes never becomes a hop/path or
    // expands/hydrates a candidate. Absent seam (fixtures / reachability probe) → null → no edge gate.
    const effectiveEdgeRlsPredicate = edgeRlsPredicate ??
        (typeof graphService?.isEdgeVisibleToRequester === 'function'
            ? edge => graphService.isEdgeVisibleToRequester(edge)
            : null);

    for (const cluster of resolved) {
        if (truncated) break;
        // request-global budget spent with clusters still unwalked → honest truncation (more existed)
        if (remainingHopBudget <= 0) { truncated = true; break }

        for (const memberId of cluster.members) {
            if (truncated) break;
            // budget spent with members still unwalked → honest truncation; checked at the loop TOP so it
            // never overfires on an exact fit (the last member consuming the budget with none left to walk)
            if (remainingHopBudget <= 0) { truncated = true; break }

            // A graph-tier read error mid-walk (the SQLite edge query throwing on an unavailable /
            // locked store — readRawNodeEdges guards a MISSING db but not a db that throws on the
            // query) must NEVER break the flat path: the walk is pure augmentation. On a walk error,
            // skip this member (empty hops) — the embedding candidates + any already-added walk
            // candidates stand. augment-never-displace holds even when the graph is down.
            let walk;
            try {
                walk = walkConceptNeighborhood({graphService, conceptId: memberId, maxHops, hopBudget: remainingHopBudget, traversableLabels, traversableEdgeTypes, edgeRlsPredicate: effectiveEdgeRlsPredicate, rlsPredicate: effectiveRlsPredicate})
            } catch {
                walk = {hops: [], truncated: false}
            }

            // Request-global edge budget: `hopBudget` is shared across ALL resolved clusters/members
            // (NOT reset per member), so a wide alias-fan cannot multiply the walk's edge cost. Decrement
            // by this member's consumed hops. A walk that cut hops WITHIN this member (walk.truncated) is
            // honest truncation. Request-global EXHAUSTION is flagged at the loop tops instead, so it only
            // reports truncation when a remaining cluster/member is actually skipped — never on an exact
            // fit (the last member consuming the budget with nothing left to walk).
            remainingHopBudget -= walk.hops.length;
            if (walk.truncated) truncated = true;

            // BFS parent map for full-path reconstruction: keep each neighbor's FIRST (lowest-depth)
            // reaching hop — the shortest-path parent edge buildConceptPath traces back through.
            const parentHop = new Map();

            for (const hop of walk.hops) {
                if (hop.neighborId && !parentHop.has(hop.neighborId)) {
                    parentHop.set(hop.neighborId, hop)
                }
            }

            for (const hop of walk.hops) {
                // bounded-hydration ceiling: bounds total hydration ATTEMPTS, not just successful appends —
                // a rejected hydration still did the expensive gate round-trip, so it counts; otherwise a
                // flood of unauthorized candidates evades the ceiling (up to hopBudget hydrations for a
                // maxCandidates of 40). `truncated` reports honestly that more may exist.
                if (hydrationAttempts >= maxCandidates) { truncated = true; break }

                const nodeId = hop.neighborId;

                // explicit config-declared node-type filter — the caller declares which neighbor labels
                // are eligible candidates for its surface (memories → AGENT_MEMORY, KB → FILE); a
                // non-eligible type is skipped cheaply BEFORE the gate (not an RLS drop → not filteredOut).
                if (traversableNodeLabels && !traversableNodeLabels.includes(hop.neighborLabel)) continue;

                // config-declared TERMINAL candidate-admission edge filter — an arbitrary relation (SENT_TO,
                // DISCUSSED_IN) reaching an otherwise-authorized node does NOT admit it as a candidate: node
                // RLS authorizes the node, never the relation that selected it (@neo-gpt Cycle-4 falsifier).
                // A concept-relation edge can EXPAND (traversableEdgeTypes) but cannot itself hydrate an
                // artifact. Skipped cheaply BEFORE the gate (config ineligibility, not an RLS drop).
                if (terminalEdgeTypes && !terminalEdgeTypes.includes(hop.edgeType)) continue;

                // dedup: already in the embedding set, or already surfaced by an earlier walk hop
                if (!nodeId || seen.has(nodeId) || walkVisited.has(nodeId)) continue;

                walkVisited.add(nodeId);

                // RLS re-entry: the raw-edge walk can reach nodes the caller may not see; the caller's
                // own gate is the authority, and its absence (or a null return) fails closed. The hop's
                // neighborLabel + edgeType ride along so the gate can skip a non-retrievable node type
                // (a FILE/CONCEPT neighbor) without a hydration round-trip. Counts against the ceiling
                // whether it authorizes or rejects — the round-trip is the bounded resource.
                hydrationAttempts++;
                const hydrated = await resolveCandidate?.(nodeId, {neighborLabel: hop.neighborLabel, edgeType: hop.edgeType});

                if (!hydrated) {
                    filteredOut++;
                    continue
                }

                // Post-hydration dedup by the RESOLVED identity, not the raw nodeId: two id-dialects
                // (`file:x` vs `file-x`) are distinct nodes that hydrate to the SAME source, and a walk
                // node can resolve to a candidate already in the embedding (flat) set (`seen` seeds from
                // it). Dedup on the hydrated id so neither a dialect twin nor a flat-set duplicate is
                // appended twice.
                const hydratedId = getCandidateId(hydrated);
                if (hydratedId && seen.has(hydratedId)) continue;
                if (hydratedId) seen.add(hydratedId);

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
        walkDurationMs  : now() - walkStartedAt,
        truncated
    };

    emit?.(event);

    // wrap: embedding candidates first + untouched; walk candidates appended.
    return {candidates: [...candidates, ...added], event}
}
