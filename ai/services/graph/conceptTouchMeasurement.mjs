import {IDENTITIES, TRUST_TIER_ORDER, TRUST_TIERS} from '../../graph/identityRoots.mjs';

/**
 * @module ai/services/graph/conceptTouchMeasurement
 * @summary Read-only concept-touch profiles and history-slice re-derivation candidates.
 *
 * Owner contract: turn existing `TAGGED_CONCEPT` history into substrate diagnostics, never
 * capability rankings. The helper consumes graph records/edges or a raw SQLite read projection
 * and returns confidence-bearing measurements: per-agent concept-touch profiles and slice-1
 * re-derivation candidates. It performs zero graph writes and does not mint new node/edge
 * classes; the retrieval-event producer owns the later precision upgrade.
 *
 * Privacy / provenance contract: there is no live `privacyTier` field. The ticket's privacy
 * obligation is enforced against current substrate fields: RLS visibility (`userId`,
 * `sharedEntity`, `visibility`) plus most-restrictive provenance trust tiers. Elements with no
 * resolvable visibility boundary are excluded from aggregate profiles rather than defaulted up.
 */

export const VISIBILITY_TIERS = Object.freeze({
    PUBLIC : 'public',
    TEAM   : 'team',
    PRIVATE: 'private'
});

export const VISIBILITY_TIER_ORDER = Object.freeze([
    VISIBILITY_TIERS.PUBLIC,
    VISIBILITY_TIERS.TEAM,
    VISIBILITY_TIERS.PRIVATE
]);

const VISIBILITY_RANK = new Map(VISIBILITY_TIER_ORDER.map((tier, index) => [tier, index]));
const TRUST_RANK      = new Map(TRUST_TIER_ORDER.map((tier, index) => [tier, index]));
const IDENTITY_TRUST  = new Map(IDENTITIES.flatMap(identity => {
    const trustTier = identity.properties?.trustTier || TRUST_TIERS.UNCLASSIFIED,
          login     = identity.properties?.githubLogin;

    return [
        [identity.id, trustTier],
        [String(identity.id || '').replace(/^@/, ''), trustTier],
        [login, trustTier],
        [String(login || '').replace(/^@/, ''), trustTier]
    ].filter(([key]) => key)
}));

/**
 * @summary Normalizes graph node/edge records into the small shape this measurement consumes.
 * @param {Object} record Graph node/edge record.
 * @returns {{id: String, type: String, properties: Object}}
 */
export function normalizeGraphRecord(record = {}) {
    return {
        id        : String(record.id || ''),
        type      : String(record.type || record.label || '').toUpperCase(),
        properties: record.properties || {}
    }
}

/**
 * @summary Parses the JSON `data` column used by the SQLite graph store.
 * @param {String|Object|null} data Raw SQLite JSON payload or already-parsed payload.
 * @returns {{label: String, properties: Object}}
 */
export function parseGraphData(data) {
    if (!data) return {label: '', properties: {}};
    if (typeof data === 'object') {
        return {
            label     : data.label || data.type || '',
            properties: data.properties || {}
        }
    }

    try {
        const parsed = JSON.parse(data);

        return {
            label     : parsed.label || parsed.type || '',
            properties: parsed.properties || {}
        }
    } catch {
        return {label: '', properties: {}}
    }
}

/**
 * @summary Reads raw `TAGGED_CONCEPT` edges plus endpoint nodes from GraphService's SQLite handle.
 *
 * The reader uses `SELECT` only. It is a convenience seam for diagnostics and scripts; the core
 * measurement functions are pure and unit-tested against plain records.
 *
 * @param {Object} options
 * @param {Object} options.graphService Bound GraphService instance.
 * @param {Number} [options.limit=5000] Maximum tagged edges to read.
 * @returns {{nodes: Object[], edges: Object[], readAt: String}}
 */
export function readTaggedConceptGraph({graphService, limit = 5000} = {}) {
    const sqliteDb = graphService?.db?.storage?.db,
          readAt   = new Date().toISOString();

    if (!sqliteDb) {
        return {nodes: [], edges: [], readAt}
    }

    const
        max      = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 5000,
        edgeRows = sqliteDb
            .prepare('SELECT id, source, target, type, data, user_id FROM Edges WHERE type = ? ORDER BY id LIMIT ?')
            .all('TAGGED_CONCEPT', max),
        nodeIds  = [...new Set(edgeRows.flatMap(row => [row.source, row.target]).filter(Boolean))],
        nodeStmt = sqliteDb.prepare('SELECT id, data, user_id FROM Nodes WHERE id = ?'),
        nodes    = [],
        edges    = edgeRows.map(row => {
            const parsed = parseGraphData(row.data);

            return {
                id        : row.id,
                source    : row.source,
                target    : row.target,
                type      : row.type,
                properties: {
                    ...(parsed.properties || {}),
                    userId: parsed.properties?.userId ?? row.user_id ?? null
                }
            }
        });

    for (const id of nodeIds) {
        const row = nodeStmt.get(id);
        if (!row) continue;

        const parsed = parseGraphData(row.data);
        nodes.push({
            id,
            type      : parsed.label,
            properties: {
                ...(parsed.properties || {}),
                userId: parsed.properties?.userId ?? row.user_id ?? null
            }
        })
    }

    return {nodes, edges, readAt}
}

/**
 * @summary Resolves a graph element's current visibility boundary from live RLS fields.
 * @param {Object} record Graph node or edge record.
 * @returns {String|null} `private`, `team`, `public`, or null when no boundary is encoded.
 */
export function resolveVisibilityTier(record = {}) {
    const properties = normalizeGraphRecord(record).properties;
    const visibility = String(properties.visibility || '').toLowerCase();

    if (VISIBILITY_RANK.has(visibility)) return visibility;
    if (properties.sharedEntity === true || properties.sharedEntity === 1) return VISIBILITY_TIERS.TEAM;
    if (typeof properties.userId === 'string' && properties.userId.length > 0) return VISIBILITY_TIERS.PRIVATE;
    if (properties.userId === null) return VISIBILITY_TIERS.PUBLIC;

    return null
}

/**
 * @summary Applies most-restrictive visibility propagation across a source/edge/concept tuple.
 * @param {Object[]} records Components of a candidate aggregate element.
 * @returns {{visibilityTier: String|null, missing: String[]}}
 */
export function resolveAggregateVisibility(records = []) {
    let   visibilityTier = null;
    const missing        = [];

    for (const record of records) {
        const normalized = normalizeGraphRecord(record),
              tier       = resolveVisibilityTier(normalized);

        if (!tier) {
            missing.push(normalized.id || '(anonymous)');
            continue
        }

        if (!visibilityTier || VISIBILITY_RANK.get(tier) > VISIBILITY_RANK.get(visibilityTier)) {
            visibilityTier = tier;
        }
    }

    return {
        visibilityTier: missing.length > 0 ? null : visibilityTier,
        missing
    }
}

function resolveRecordTrustTier(record = {}) {
    const
        normalized = normalizeGraphRecord(record),
        properties = normalized.properties,
        candidate  = properties.trustTier ||
            properties.sourceTrustTier ||
            properties.authorTrust ||
            properties.sourceTier;

    if (TRUST_RANK.has(candidate)) return candidate;

    const identity = properties.agentIdentity || properties.from || properties.userId;

    if (IDENTITY_TRUST.has(identity)) return IDENTITY_TRUST.get(identity);
    if (IDENTITY_TRUST.has(String(identity || '').replace(/^@/, ''))) {
        return IDENTITY_TRUST.get(String(identity).replace(/^@/, ''))
    }

    // Edges often carry only visibility / timestamp. With no explicit provenance, they are
    // neutral connectors; node/source provenance drives the aggregate.
    if (normalized.type && normalized.type !== 'TAGGED_CONCEPT') return TRUST_TIERS.UNCLASSIFIED;

    return null
}

/**
 * @summary Resolves the most-restrictive provenance trust tier across graph components.
 * @param {Object[]} records Source records.
 * @returns {String} Trust tier, falling to `unclassified` only when no component carries provenance.
 */
export function resolveAggregateTrustTier(records = []) {
    let trustTier = null;

    for (const record of records) {
        const tier = resolveRecordTrustTier(record);

        if (!tier) continue;

        if (!trustTier || TRUST_RANK.get(tier) > TRUST_RANK.get(trustTier)) {
            trustTier = tier;
        }
    }

    return trustTier || TRUST_TIERS.UNCLASSIFIED
}

function normalizeTimestamp(value) {
    const date = value ? new Date(value) : null;

    return date && !Number.isNaN(date.getTime()) ? date.toISOString() : null
}

function resolveEventTimestamp(edge, source) {
    const edgeProps   = normalizeGraphRecord(edge).properties,
          sourceProps = normalizeGraphRecord(source).properties;

    return normalizeTimestamp(
        edgeProps.timestamp ||
        edgeProps.createdAt ||
        sourceProps.sentAt ||
        sourceProps.timestamp ||
        sourceProps.createdAt
    )
}

function resolveAgentId(source, edge) {
    const
        sourceProps = normalizeGraphRecord(source).properties,
        edgeProps   = normalizeGraphRecord(edge).properties;

    return sourceProps.agentIdentity ||
        sourceProps.from ||
        sourceProps.userId ||
        edgeProps.agentIdentity ||
        edgeProps.userId ||
        'unattributed'
}

function resolveSessionId(source, edge) {
    const
        sourceProps = normalizeGraphRecord(source).properties,
        edgeProps   = normalizeGraphRecord(edge).properties;

    return sourceProps.sessionId ||
        sourceProps.originSessionId ||
        sourceProps.partOfThread ||
        edgeProps.sessionId ||
        edgeProps.originSessionId ||
        null
}

function isConceptRecord(record) {
    const type = normalizeGraphRecord(record).type;

    return type === 'CONCEPT' || type === 'CLASS'
}

function incrementCounter(bucket, key) {
    bucket[key] = (bucket[key] || 0) + 1;
}

/**
 * @summary Maps reinforced graph weights to honest snapshot buckets.
 * @param {Number|null} weight
 * @returns {String}
 */
function resolveWeightBucket(weight) {
    return Number(weight) === 1 ? 'weight-1.0' : 'weight-other';
}

/**
 * @summary Extracts profile-eligible concept-touch events from `TAGGED_CONCEPT` edges.
 * @param {Object} options
 * @param {Object[]} [options.nodes=[]] Graph node records.
 * @param {Object[]} [options.edges=[]] Graph edge records.
 * @returns {{events: Object[], excluded: Object[]}}
 */
export function extractConceptTouchEvents({nodes = [], edges = []} = {}) {
    const
        nodeMap  = new Map(nodes.map(record => {
            const normalized = normalizeGraphRecord(record);
            return [normalized.id, normalized]
        })),
        events   = [],
        excluded = [];

    for (const rawEdge of edges) {
        const edge = normalizeGraphRecord(rawEdge);

        if (edge.type !== 'TAGGED_CONCEPT') continue;

        const
            source       = nodeMap.get(rawEdge.source),
            target       = nodeMap.get(rawEdge.target),
            concept      = isConceptRecord(target) ? target : isConceptRecord(source) ? source : null,
            sourceRecord = concept?.id === source?.id ? target : source,
            timestamp    = resolveEventTimestamp(rawEdge, sourceRecord),
            aggregate    = resolveAggregateVisibility([sourceRecord, rawEdge, concept].filter(Boolean)),
            trustTier    = resolveAggregateTrustTier([sourceRecord, rawEdge, concept].filter(Boolean));

        if (!concept || !sourceRecord) {
            excluded.push({edgeId: edge.id, reason: 'missing-endpoint'});
            continue
        }

        if (!timestamp) {
            excluded.push({edgeId: edge.id, conceptId: concept.id, reason: 'missing-timestamp'});
            continue
        }

        if (!aggregate.visibilityTier) {
            excluded.push({
                edgeId   : edge.id,
                conceptId: concept.id,
                reason   : 'missing-visibility-tier',
                missing  : aggregate.missing
            });
            continue
        }

        events.push({
            edgeId        : edge.id,
            sourceId      : sourceRecord.id,
            sourceType    : sourceRecord.type,
            conceptId     : concept.id,
            agentId       : resolveAgentId(sourceRecord, rawEdge),
            sessionId     : resolveSessionId(sourceRecord, rawEdge),
            touchedAt     : timestamp,
            depth         : 1,
            weight        : edge.properties.weight ?? rawEdge.weight ?? null,
            weightBucket  : resolveWeightBucket(edge.properties.weight ?? rawEdge.weight),
            visibilityTier: aggregate.visibilityTier,
            trustTier
        })
    }

    events.sort((a, b) => a.touchedAt.localeCompare(b.touchedAt) || a.edgeId.localeCompare(b.edgeId));

    return {events, excluded}
}

function computeRevisitIntervals(events) {
    const byConcept = new Map();
    const intervals = [];

    for (const event of events) {
        const list = byConcept.get(event.conceptId) || [];
        list.push(event);
        byConcept.set(event.conceptId, list)
    }

    for (const list of byConcept.values()) {
        list.sort((a, b) => a.touchedAt.localeCompare(b.touchedAt));

        for (let i = 1; i < list.length; i++) {
            intervals.push({
                conceptId: list[i].conceptId,
                from     : list[i - 1].touchedAt,
                to       : list[i].touchedAt,
                ms       : new Date(list[i].touchedAt).getTime() - new Date(list[i - 1].touchedAt).getTime()
            })
        }
    }

    return intervals
}

/**
 * @summary Builds per-agent concept-touch profiles from eligible touch events.
 * @param {Object[]} events Concept-touch events.
 * @returns {Object[]} Agent profiles sorted by agent id.
 */
export function buildConceptTouchProfiles(events = []) {
    const byAgent = new Map();

    for (const event of events) {
        const profile = byAgent.get(event.agentId) || {
            agentId      : event.agentId,
            touchCount   : 0,
            concepts     : new Set(),
            visibilityMix: {},
            trustTierMix : {},
            weightBucketMix: {},
            depths       : [],
            events       : []
        };

        profile.touchCount++;
        profile.concepts.add(event.conceptId);
        profile.depths.push(event.depth);
        profile.events.push(event);
        incrementCounter(profile.visibilityMix, event.visibilityTier);
        incrementCounter(profile.trustTierMix, event.trustTier);
        incrementCounter(profile.weightBucketMix, event.weightBucket);
        byAgent.set(event.agentId, profile)
    }

    return [...byAgent.values()]
        .map(profile => {
            const intervals    = computeRevisitIntervals(profile.events);
            const revisitCount = intervals.length;
            const avgDepth     = profile.depths.length
                ? profile.depths.reduce((sum, value) => sum + value, 0) / profile.depths.length
                : 0;

            return {
                agentId              : profile.agentId,
                touchCount           : profile.touchCount,
                conceptsTouched      : profile.concepts.size,
                touchDepth           : Number(avgDepth.toFixed(2)),
                visibilityMix        : profile.visibilityMix,
                trustTierMix         : profile.trustTierMix,
                weightBucketMix      : profile.weightBucketMix,
                revisitIntervals     : intervals,
                revisitCount,
                normalizedRevisitRate: Number((revisitCount / Math.max(1, profile.touchCount)).toFixed(4))
            }
        })
        .sort((a, b) => a.agentId.localeCompare(b.agentId))
}

function retrievalConcepts(retrieval = {}) {
    return new Set([
        ...(retrieval.resolvedConcepts || []),
        ...(retrieval.conceptIds || []),
        ...(retrieval.taggedConcepts || [])
    ])
}

/**
 * @summary Detects history-slice re-derivation candidates; never emits verdicts.
 * @param {Object} options
 * @param {Object[]} [options.events=[]] Concept-touch events.
 * @param {Object[]} [options.retrievalEvents=[]] Optional retrieval events.
 * @returns {Object[]} Candidate events with confidence and reason.
 */
export function detectRederivationCandidates({events = [], retrievalEvents = []} = {}) {
    const byAgentConcept = new Map();

    for (const event of events) {
        const key  = `${event.agentId}\n${event.conceptId}`;
        const list = byAgentConcept.get(key) || [];
        list.push(event);
        byAgentConcept.set(key, list)
    }

    const candidates = [];

    for (const list of byAgentConcept.values()) {
        list.sort((a, b) => a.touchedAt.localeCompare(b.touchedAt));

        for (let i = 1; i < list.length; i++) {
            const previous = list[i - 1],
                  current  = list[i];

            if (previous.sessionId && current.sessionId && previous.sessionId === current.sessionId) {
                continue
            }

            const retrieved = retrievalEvents.some(retrieval => {
                if (retrieval.agentId && retrieval.agentId !== current.agentId) return false;
                if (retrieval.sessionId && current.sessionId && retrieval.sessionId !== current.sessionId) return false;
                if (retrieval.occurredAt && new Date(retrieval.occurredAt) > new Date(current.touchedAt)) return false;

                return retrievalConcepts(retrieval).has(current.conceptId)
            });

            if (retrieved) continue;

            const missingSessionBoundary = !previous.sessionId || !current.sessionId;

            candidates.push({
                agentId          : current.agentId,
                conceptId        : current.conceptId,
                previousSessionId: previous.sessionId,
                currentSessionId : current.sessionId,
                previousTouchAt  : previous.touchedAt,
                currentTouchAt   : current.touchedAt,
                confidence       : missingSessionBoundary ? 0.35 : retrievalEvents.length > 0 ? 0.65 : 0.5,
                reason           : missingSessionBoundary
                    ? 'history-only-missing-session-boundary'
                    : retrievalEvents.length > 0
                    ? 'no-retrieval-event-for-concept-before-touch'
                    : 'history-only-no-retrieval-log-yet'
            })
        }
    }

    return candidates
}

/**
 * @summary Builds the complete measurement report from graph records.
 * @param {Object} options
 * @param {Object[]} [options.nodes=[]] Graph nodes.
 * @param {Object[]} [options.edges=[]] Graph edges.
 * @param {Object[]} [options.retrievalEvents=[]] Optional retrieval events.
 * @param {String|Date} [options.generatedAt=new Date()] Report timestamp.
 * @returns {Object} Measurement report.
 */
export function buildConceptTouchMeasurement({
    nodes = [],
    edges = [],
    retrievalEvents = [],
    generatedAt = new Date()
} = {}) {
    const {events, excluded} = extractConceptTouchEvents({nodes, edges});

    return {
        issue             : '#14506',
        generatedAt       : normalizeTimestamp(generatedAt) || new Date().toISOString(),
        coverageBound     : '~2 of 5 substrate-effect pressure classes mechanically catchable in slice 1',
        normalization     : 'per-agent own-history denominator; no cross-agent ranking',
        profiles          : buildConceptTouchProfiles(events),
        rederivationEvents: detectRederivationCandidates({events, retrievalEvents}),
        counts            : {
            taggedConceptEdges : edges.filter(edge => normalizeGraphRecord(edge).type === 'TAGGED_CONCEPT').length,
            eligibleEvents     : events.length,
            eventsWithSessionId: events.filter(event => event.sessionId).length,
            excludedEvents     : excluded.length,
            retrievalEvents    : retrievalEvents.length
        },
        excluded
    }
}

function formatMix(mix = {}) {
    const entries = Object.entries(mix);

    return entries.length ? entries.map(([key, count]) => `${key}:${count}`).join(', ') : '-'
}

/**
 * @summary Renders the measurement report to the committed artifact shape.
 * @param {Object} report Output from `buildConceptTouchMeasurement`.
 * @param {Object} [options]
 * @param {Number} [options.maxCandidateRows=25] Maximum candidate rows to render before summarizing the remainder.
 * @returns {String} Markdown artifact.
 */
export function renderConceptTouchMeasurementMarkdown(report, {maxCandidateRows = 25} = {}) {
    const
        candidates     = report.rederivationEvents || [],
        candidateLimit = Number.isFinite(maxCandidateRows) && maxCandidateRows > 0
            ? Math.floor(maxCandidateRows)
            : candidates.length;

    const lines = [
        '# Concept-Touch Measurement: Re-Derivation Slice 1',
        '',
        `Issue: ${report.issue || '#14506'} · Epic: #14472 · Generated: ${report.generatedAt}`,
        '',
        'Diagnostics-only measurement. This is not a capability ranking, not a leaderboard, and not',
        'a merge gate. Metrics normalize by each agent\'s own eligible concept-touch history.',
        '',
        `Coverage bound: ${report.coverageBound}`,
        '',
        'Privacy/provenance note: current substrate has no `privacyTier` field. Aggregation uses',
        'RLS visibility (`userId`, `sharedEntity`, `visibility`) plus most-restrictive trust-tier',
        'provenance. Elements with no resolvable visibility boundary are excluded, never defaulted',
        'into a public/team aggregate.',
        '',
        'Weight bucket note: `weight-1.0` / `weight-other` are current edge-weight buckets, not',
        'extractor provenance. TAGGED_CONCEPT reinforcement can change weights after extraction.',
        '',
        '## Measurement Counts',
        '',
        '| Field | Count |',
        '|---|---:|',
        `| TAGGED_CONCEPT edges scanned | ${report.counts?.taggedConceptEdges || 0} |`,
        `| Eligible concept-touch events | ${report.counts?.eligibleEvents || 0} |`,
        `| Eligible events with session id | ${report.counts?.eventsWithSessionId || 0} |`,
        `| Excluded events (missing endpoint/timestamp/tier) | ${report.counts?.excludedEvents || 0} |`,
        `| Retrieval events applied (slice-2 input) | ${report.counts?.retrievalEvents || 0} |`,
        '',
        '## Per-Agent Concept-Touch Profiles',
        '',
        '| Agent | Touches | Concepts | Avg depth | Revisit count | Normalized revisit rate | Visibility mix | Trust mix | Weight bucket mix |',
        '|---|---:|---:|---:|---:|---:|---|---|---|'
    ];

    for (const profile of report.profiles || []) {
        lines.push(`| ${profile.agentId} | ${profile.touchCount} | ${profile.conceptsTouched} | ${profile.touchDepth} | ${profile.revisitCount} | ${profile.normalizedRevisitRate} | ${formatMix(profile.visibilityMix)} | ${formatMix(profile.trustTierMix)} | ${formatMix(profile.weightBucketMix)} |`)
    }

    if ((report.profiles || []).length === 0) {
        lines.push('| none | 0 | 0 | 0 | 0 | 0 | - | - | - |')
    }

    lines.push(
        '',
        '## Candidate Re-Derivation Events',
        '',
        `Total candidates: ${candidates.length}. Showing first ${Math.min(candidateLimit, candidates.length)} by touch chronology.`,
        '',
        '| Agent | Concept | Previous session | Current session | Confidence | Reason |',
        '|---|---|---|---|---:|---|'
    );

    for (const event of candidates.slice(0, candidateLimit)) {
        lines.push(`| ${event.agentId} | ${event.conceptId} | ${event.previousSessionId || '-'} | ${event.currentSessionId || '-'} | ${event.confidence} | ${event.reason} |`)
    }

    if (candidates.length > candidateLimit) {
        lines.push(`| omitted | ${candidates.length - candidateLimit} additional candidates | - | - | - | see helper output for full list |`)
    }

    if (candidates.length === 0) {
        lines.push('| none | - | - | - | 0 | no candidate in this slice |')
    }

    lines.push(
        '',
        '## Study Codebook Mapping',
        '',
        '| Pressure class | Slice-1 computability | Note |',
        '|---|---|---|',
        '| repeated-concept re-entry | catchable | Same agent revisits a concept after prior memory exists. |',
        '| retrieval miss before re-entry | partially catchable | Inferred until #14504 retrieval events supply the precision leg. |',
        '| stale-state contradiction | not catchable | Belief-revision leaf #14507 owns claim-class conflict surfacing. |',
        '| routing/cold-start bias | not catchable | Ranking-reach leaf #14503 / #14508 own routing disposition. |',
        '| prose/frame drift | not catchable | Requires review/content evidence, not TAGGED_CONCEPT history. |',
        '',
        '## Slice-2 Upgrade Path',
        '',
        '#14504 retrieval events add `{query, resolvedConcepts, walkContributed}`. Once present,',
        '`detectRederivationCandidates()` suppresses candidates when a matching retrieval event',
        'surfaced the concept before the later touch; confidence rises only for no-retrieval matches.',
        ''
    );

    return `${lines.join('\n')}\n`
}
