import {normalizeConceptKey} from './conceptSpineCanonicalization.mjs';

/**
 * @module ai/services/graph/conceptNeighborhoodProbe
 * @summary Read-only concept-neighborhood reachability probe with provenance/tier output (#14474; ticket-ref-ok: owning-leaf anchor).
 *
 * Owner contract: supply the Golden Path v2 measurement floor (epic #14472; ticket-ref-ok: parent-epic anchor) with the read-side
 * evidence that decides OQ5 (wrap-vs-replace) and feeds the OQ1 anchoring disposition — by reading
 * RAW edge rows, never the `getNeighbors` projection. The projection drops every edge property
 * except `weight` (and applies RLS), so axis presence is unmeasurable through it; this probe parses
 * the stored `data` JSON per edge and distinguishes `absent-in-storage` from `absent-in-projection`.
 *
 * Privacy contract (binding on every rendered artifact): neighbors whose node label names private
 * or person-scoped substrate (`MEMORY`, `SESSION`, `MESSAGE`) are rendered AGGREGATE-ONLY —
 * type + count + axis-presence tallies, never individual ids and never content. Structural node
 * labels (`CONCEPT`, `FILE`, `CLASS`, `ISSUE`, `PR`, `DISCUSSION`, `ADR`) render by id. The probe
 * performs ZERO graph writes; the spec asserts it.
 *
 * Churn discipline: every raw read carries its own `readAt` ISO timestamp — two probes minutes
 * apart have disagreed on live edge state before (#14422 OQ4; ticket-ref-ok: graduation-record authority); unstamped rows are unciteable.
 */

const PRIVATE_NODE_LABELS = Object.freeze(['MEMORY', 'SESSION', 'MESSAGE', 'SUMMARY']);

/**
 * The four-axis annotation contract from the #14422 OQ6 graduation (ticket-ref-ok: graduation-record authority), expressed as the edge/node
 * property keys each axis may materialize under today. Presence detection only — the probe never
 * interprets values, and an empty candidate hit-set is itself the finding (`absent-in-storage`).
 */
export const CONTRACT_AXES = Object.freeze({
    authority           : Object.freeze(['trustTier', 'authorTrust', 'userId']),
    fidelity            : Object.freeze(['sourceTier', 'degraded', 'usedTier']),
    extractionProvenance: Object.freeze(['provenance', 'curated', 'extractor']),
    lifecycle           : Object.freeze(['lifecycle', 'verifiedAt', 'state', 'supersededBy'])
});

/**
 * @summary Normalizes a concept id to its alias-cluster key (strip prefix, case-fold, kebab-ize).
 * @param {String} id Concept node id in any minted convention.
 * @returns {String} Cluster key, e.g. `CONCEPT:Golden Path Synthesis` → `golden-path-synthesis`.
 */
export function conceptClusterKey(id) {
    return normalizeConceptKey(id)
}

/**
 * @summary Reads the RAW edge rows incident to a node — full stored property set, no projection, no RLS.
 *
 * Diagnostic-substrate seam: reaches the SQLite handle the same way the route-ledger sibling does.
 * Callers own the privacy contract on anything they render from the result.
 *
 * @param {Object} options
 * @param {Object} options.graphService Bound GraphService instance.
 * @param {String} options.nodeId Node id whose incident edges to read.
 * @returns {Object[]} Rows `{id, source, target, type, weight, propertyKeys, properties, readAt}`.
 */
export function readRawNodeEdges({graphService, nodeId}) {
    const sqliteDb = graphService?.db?.storage?.db;

    if (!sqliteDb) return [];

    const
        readAt = new Date().toISOString(),
        stmt   = sqliteDb.prepare('SELECT id, source, target, type, data FROM Edges WHERE source = ? OR target = ?'),
        rows   = stmt.all(nodeId, nodeId);

    return rows.map(row => {
        let properties = {};

        try {
            properties = JSON.parse(row.data || '{}')?.properties || {};
        } catch {
            properties = {};
        }

        return {
            id          : row.id,
            source      : row.source,
            target      : row.target,
            type        : row.type,
            weight      : properties.weight ?? null,
            propertyKeys: Object.keys(properties).sort(),
            properties,
            readAt
        }
    })
}

/**
 * @summary Detects which contract axes are present on a raw edge-property set.
 * @param {Object} properties Parsed edge properties.
 * @returns {Object} Per-axis `{present: Boolean, keys: String[]}` — empty keys = absent-in-storage.
 */
export function detectAxisPresence(properties = {}) {
    const result = {};

    for (const [axis, candidates] of Object.entries(CONTRACT_AXES)) {
        const keys = candidates.filter(key => properties[key] !== undefined);

        result[axis] = {present: keys.length > 0, keys}
    }

    return result
}

/**
 * @summary Walks a concept neighborhood over RAW edges, breadth-first, bounded.
 * @param {Object} options
 * @param {Object} options.graphService Bound GraphService instance.
 * @param {String} options.conceptId Root concept node id.
 * @param {Number} [options.maxHops=2] Hop bound.
 * @param {Number} [options.hopBudget=80] Max edges consumed across the whole walk.
 * @param {Function|null} [options.rlsPredicate=null] Opt-in per-intermediate visibility gate
 *     `(neighborId, neighborLabel) => Boolean`. When supplied, the walk expands THROUGH a neighbor only
 *     if it returns true — so a private / other-tenant intermediate is never traversed to reach a deeper
 *     node (the caller supplies the tenant/RLS check, e.g. isRlsVisible; terminal-candidate authorization
 *     does NOT authorize the PATH crossed to reach it). Default null = no gate (probe full-reachability
 *     mode; the reachability-probe measurement path is untouched).
 * @param {String[]|null} [options.traversableEdgeTypes=null] Opt-in retrieval-bearing edge-type allow-list.
 *     When supplied, the walk expands THROUGH a neighbor only when the connecting `edge.type` is in the list
 *     — so only concept↔concept relations (PARENT_CONCEPT, RELATES_TO, ANALOGOUS_TO, REQUIRES) carry the walk
 *     onward, while arbitrary/structural edges (DISCUSSED_IN, AUTHORED_BY, PARENT_OF, RESOLVES, SENT_TO) do
 *     not. Concept→artifact edges (IMPLEMENTED_BY, TAGGED_CONCEPT, MENTIONED_IN) reach TERMINALS — they are
 *     NOT expansion edges (candidate admission is a separate, consumer-side gate). The neighbor is still
 *     recorded as a hop (provenance) regardless of this filter.
 *     Default null = no edge-type gate (probe full-reachability mode; the measurement path is untouched).
 * @param {Function|null} [options.edgeRlsPredicate=null] Opt-in per-EDGE visibility gate `(edge) => Boolean`.
 *     A foreign / other-tenant edge between two visible nodes is a DISTINCT leak surface — when this returns
 *     false the edge is skipped ENTIRELY (never a hop / parent / path, never expands or hydrates), because
 *     node-RLS on the endpoints does not authorize the connecting relation. Default null = no edge gate
 *     (probe full-graph reachability). Distinct from `rlsPredicate` (which gates NODE traversal).
 * @returns {Object} `{root, hops: [{fromId, edge, neighborId, neighborLabel, axisPresence}], truncated}`
 */
export function walkConceptNeighborhood({graphService, conceptId, maxHops = 2, hopBudget = 80, traversableLabels = null, traversableEdgeTypes = null, edgeRlsPredicate = null, rlsPredicate = null}) {
    const
        visited = new Set([conceptId]),
        hops    = [];

    let frontier  = [conceptId],
        truncated = false;

    for (let depth = 1; depth <= maxHops && frontier.length > 0; depth++) {
        const next = [];

        for (const fromId of frontier) {
            const edges = readRawNodeEdges({graphService, nodeId: fromId});

            for (const edge of edges) {
                // edge-RLS (retrieval path): a foreign / other-tenant edge between two visible nodes is a
                // DISTINCT leak surface (relation + provenance). Skip it BEFORE it becomes a hop / parent /
                // path or consumes budget / expands / hydrates — node-RLS on the endpoints does NOT authorize
                // the relation that connects them (source-owned edgeRlsPredicate, e.g. isEdgeVisibleToRequester;
                // mirrors getNeighbors' node-AND-edge gate). Default null = probe full-graph reachability.
                if (edgeRlsPredicate && !edgeRlsPredicate(edge)) continue;

                const
                    neighborId = edge.source === fromId ? edge.target : edge.source,
                    node       = graphService?.db?.nodes?.get?.(neighborId),
                    label      = node?.label || 'UNKNOWN';

                // node-RLS (retrieval path): a node-RLS-INVISIBLE neighbor must NEVER become a hop / candidate
                // / path or consume budget — a VISIBLE edge to a private node (the exact leak Euclid reproduced:
                // an allowed IMPLEMENTED_BY edge whose FILE target is node-RLS-invisible, then hydrated by a
                // successful collection hydrator) does NOT authorize the node. Skip it entirely BEFORE
                // hops.push / budget / path. Measurement mode (rlsPredicate=null) short-circuits → recorded,
                // privacy applied at render via applyPrivacyContract.
                if (rlsPredicate && !rlsPredicate(neighborId, label)) continue;

                if (hops.length >= hopBudget) {
                    truncated = true;
                    break
                }

                hops.push({
                    depth,
                    fromId,
                    edgeId       : edge.id,
                    edgeType     : edge.type,
                    weight       : edge.weight,
                    propertyKeys : edge.propertyKeys,
                    axisPresence : detectAxisPresence(edge.properties),
                    readAt       : edge.readAt,
                    neighborId,
                    neighborLabel: label
                });

                if (!visited.has(neighborId)) {
                    visited.add(neighborId);
                    // RLS Depth-Floor (retrieval path): expand THROUGH a neighbor only when it clears BOTH
                    // (a) the public-structural label allow-list (traversableLabels) and (b) the
                    // retrieval-bearing edge-type allow-list (traversableEdgeTypes — an arbitrary/structural
                    // edge like DISCUSSED_IN does not carry the walk onward). Node-RLS is already applied
                    // ABOVE (pre-push), so a private / other-tenant neighbor never reaches here — its edges are
                    // never walked to a deeper node. All null = probe measurement mode (full reachability;
                    // privacy applied at render).
                    if (
                        (!traversableLabels    || traversableLabels.includes(label)) &&
                        (!traversableEdgeTypes || traversableEdgeTypes.includes(edge.type))
                    ) next.push(neighborId)
                }
            }

            if (truncated) break
        }

        frontier = next;
        if (truncated) break
    }

    return {root: conceptId, hops, truncated}
}

/**
 * @summary Applies the privacy contract to walk hops: private-labeled neighbors aggregate, never enumerate.
 * @param {Object[]} hops Walk hops.
 * @returns {Object} `{structural: [...hops], privateAggregates: {LABEL: {count, axisPresent: {axis: n}}}}`
 */
export function applyPrivacyContract(hops = []) {
    const
        structural        = [],
        privateAggregates = {};

    for (const hop of hops) {
        if (PRIVATE_NODE_LABELS.includes(hop.neighborLabel)) {
            const bucket = privateAggregates[hop.neighborLabel] ??= {count: 0, axisPresent: {}};

            bucket.count++;

            for (const [axis, info] of Object.entries(hop.axisPresence)) {
                if (info.present) {
                    bucket.axisPresent[axis] = (bucket.axisPresent[axis] || 0) + 1
                }
            }
        } else {
            structural.push(hop)
        }
    }

    return {structural, privateAggregates}
}

/**
 * @summary Finds alias-cluster members for a concept id via normalized-key comparison over CONCEPT-type nodes.
 * @param {Object} options
 * @param {Object} options.graphService Bound GraphService instance.
 * @param {String} options.conceptId Any member id of the suspected cluster.
 * @param {Number} [options.scanLimit=5000] CONCEPT rows scanned (full-spine scans belong to #14502; ticket-ref-ok: sibling-leaf boundary).
 * @returns {Object} `{clusterKey, members: String[], readAt}`
 */
export function findAliasCluster({graphService, conceptId, scanLimit = 5000}) {
    const
        clusterKey = conceptClusterKey(conceptId),
        readAt     = new Date().toISOString(),
        members    = [];

    for (const type of ['CONCEPT', 'CLASS']) {
        let records = [];

        try {
            records = graphService.listNodeRecordsByType({type, limit: scanLimit})?.records || [];
        } catch {
            records = []
        }

        for (const record of records) {
            const id = record?.id || record?.nodeId;

            if (id && conceptClusterKey(id) === clusterKey) {
                members.push(id)
            }
        }
    }

    return {clusterKey, members: [...new Set(members)].sort(), readAt}
}

/**
 * @summary Builds the full probe report over a concept sample.
 * @param {Object} options
 * @param {Object} options.graphService Bound GraphService instance.
 * @param {String[]} options.sample Concept ids to probe (alias-cluster expansion applied per id).
 * @param {Number} [options.maxHops=2] Walk bound per member.
 * @returns {Object} Report consumed by `renderConceptProbeMarkdown`.
 */
export function buildConceptProbeReport({graphService, sample, maxHops = 2}) {
    const report = {
        generatedAt: new Date().toISOString(),
        maxHops,
        concepts   : []
    };

    for (const conceptId of sample) {
        const
            cluster = findAliasCluster({graphService, conceptId}),
            // The queried id is ALWAYS probed — a label-atypical root must not vanish from its
            // own cluster (live finding: bare `delta-updates` carries edges yet failed the scan).
            memberIds = [...new Set([conceptId, ...cluster.members])].sort(),
            perMember = [];

        for (const memberId of memberIds) {
            const
                walk                            = walkConceptNeighborhood({graphService, conceptId: memberId, maxHops}),
                {structural, privateAggregates} = applyPrivacyContract(walk.hops),
                edgeTypes                       = {};

            let axisCoverage = {authority: 0, fidelity: 0, extractionProvenance: 0, lifecycle: 0};

            for (const hop of walk.hops) {
                edgeTypes[hop.edgeType] = (edgeTypes[hop.edgeType] || 0) + 1;

                for (const [axis, info] of Object.entries(hop.axisPresence)) {
                    if (info.present) axisCoverage[axis]++
                }
            }

            perMember.push({
                memberId,
                edgeCount       : walk.hops.length,
                truncated       : walk.truncated,
                edgeTypes,
                axisCoverage,
                zeroExplanation : !walk.hops.some(h => ['EXPLAINED_BY', 'EXEMPLIFIED_BY'].includes(h.edgeType)),
                zeroMemoryAttach: !Object.keys(privateAggregates).length,
                structural,
                privateAggregates
            })
        }

        report.concepts.push({conceptId, cluster, perMember})
    }

    return report
}

/**
 * @summary Escapes markdown table cells.
 * @param {*} value Cell value.
 * @returns {String}
 */
function escapeCell(value) {
    return String(value ?? '-')
        .replace(/\\/g, '\\\\')
        .replace(/\|/g, '\\|')
        .replace(/\n/g, ' ')
}

/**
 * @summary Renders the committed measurements artifact from a probe report.
 * @param {Object} report Output of `buildConceptProbeReport`.
 * @returns {String} Markdown document body.
 */
export function renderConceptProbeMarkdown(report) {
    const lines = [
        '# Concept-Neighborhood Read Probe',
        '',
        `Issue: #14474 · Epic: #14472 · Generated: ${report.generatedAt} · maxHops: ${report.maxHops}`,
        '',
        'Read-only raw-edge probe. Privacy contract: MEMORY/SESSION/MESSAGE/SUMMARY neighbors render',
        'aggregate-only (count + axis tallies), never ids, never content. Every row carries its own',
        'read timestamp — live edges churn (#14422 OQ4); unstamped rows are unciteable.',
        '',
        '## Reachability matrix',
        '',
        '| Concept | Cluster size | Member | Edges | Edge types | Zero-explanation | Zero-memory-attach | Truncated |',
        '|---|---:|---|---:|---|---|---|---|'
    ];

    for (const c of report.concepts) {
        for (const m of c.perMember) {
            const types = Object.entries(m.edgeTypes).map(([t, n]) => `${t}:${n}`).join(', ') || '-';

            lines.push(`| ${escapeCell(c.conceptId)} | ${c.cluster.members.length || 1} | ${escapeCell(m.memberId)} | ${m.edgeCount} | ${escapeCell(types)} | ${m.zeroExplanation ? 'YES' : 'no'} | ${m.zeroMemoryAttach ? 'YES' : 'no'} | ${m.truncated ? 'yes' : 'no'} |`)
        }
    }

    lines.push('', '## Four-axis presence (storage-level, per member)', '',
        '| Member | authority | fidelity | extractionProvenance | lifecycle | Interpretation |',
        '|---|---:|---:|---:|---:|---|');

    for (const c of report.concepts) {
        for (const m of c.perMember) {
            const a    = m.axisCoverage;
            const none = a.authority + a.fidelity + a.extractionProvenance + a.lifecycle === 0;

            lines.push(`| ${escapeCell(m.memberId)} | ${a.authority} | ${a.fidelity} | ${a.extractionProvenance} | ${a.lifecycle} | ${none ? 'absent-in-storage (not merely projection)' : 'partially materialized'} |`)
        }
    }

    lines.push('', '## Fragmentation (alias clusters in-sample)', '',
        '| Cluster key | Members | Neighborhoods disjoint? |', '|---|---|---|');

    for (const c of report.concepts) {
        if (c.cluster.members.length > 1) {
            const counts = c.perMember.map(m => `${m.memberId}→${m.edgeCount}e`).join(' · ');

            lines.push(`| ${escapeCell(c.cluster.clusterKey)} | ${c.cluster.members.length} | ${escapeCell(counts)} |`)
        }
    }

    lines.push('', '## OQ5 decision inputs (data only — the epic decides)', '');

    const
        all       = report.concepts.flatMap(c => c.perMember),
        zeroExp   = all.filter(m => m.zeroExplanation).length,
        zeroMem   = all.filter(m => m.zeroMemoryAttach).length,
        axisTotal = all.reduce((n, m) => n + m.axisCoverage.authority + m.axisCoverage.fidelity + m.axisCoverage.extractionProvenance + m.axisCoverage.lifecycle, 0);

    lines.push(
        `- Members probed: ${all.length}`,
        `- Zero-explanation members: ${zeroExp}/${all.length}`,
        `- Zero-memory-attachment members: ${zeroMem}/${all.length}`,
        `- Four-axis property hits across all raw edges: ${axisTotal}`,
        `- Projection note: \`getNeighbors\` exposes ONLY \`weight\` from edge properties — every axis field above is invisible through the MCP projection by construction.`,
        ''
    );

    return lines.join('\n') + '\n'
}
