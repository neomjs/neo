import {formatGoldenPathCapturedAt as formatGoldenPathTimestamp} from './goldenPathTimestamp.mjs';

/**
 * @module ai/services/graph/goldenPathRouteLedger
 * @summary Same-run Computed Golden Path attribution ledger helpers.
 *
 * Owner contract: record the semantic -> state/type -> blocker -> actionability -> structural
 * component -> GUIDES-write path in the same synthesis pass that renders the handoff. This is
 * diagnostic substrate only: it writes no graph nodes, creates no new edge classes, and stays
 * bounded to the current semantic candidate pool.
 */

/**
 * @summary Formats finite numbers with stable precision for handoff diagnostics.
 * @param {*} value Candidate numeric value.
 * @param {Number} [digits=2] Decimal places.
 * @returns {String}
 */
function formatNumber(value, digits = 2) {
    if (value === null || value === undefined || value === '') {
        return '-'
    }

    const number = Number(value);

    return Number.isFinite(number) ? number.toFixed(digits) : '-'
}

/**
 * @summary Escapes markdown table separators in diagnostic cell content.
 * @param {*} value Cell value.
 * @returns {String}
 */
function escapeCell(value) {
    return String(value ?? '-').replace(/\|/g, '\\|').replace(/\n/g, ' ')
}

/**
 * @summary Normalizes graph node payloads to the type value used by the routing ledger.
 * @param {Object|null|undefined} nodeData Parsed graph node payload.
 * @returns {String}
 */
function getNodeType(nodeData) {
    return String(nodeData?.type || nodeData?.label || nodeData?.properties?.type || '').toUpperCase() || '-'
}

/**
 * @summary Reads edge properties from either a Neo data Record or a plain graph edge object.
 * @param {Object} edge Graph edge record.
 * @returns {Object}
 */
function getEdgeProperties(edge) {
    return (edge?.isRecord ? edge.get('properties') : edge?.properties) || {}
}

/**
 * @summary Converts inbound graph edges into edge-type structural score components.
 *
 * The Computed Golden Path SQL aggregate sums inbound non-BLOCKS weights. The diagnostic ledger
 * mirrors that invariant by reading the already warmed in-memory edge index and grouping the same
 * inbound non-BLOCKS weights by edge type.
 *
 * @param {Object} options
 * @param {String} options.nodeId Candidate node id.
 * @param {Object} options.graphService GraphService-compatible object.
 * @returns {Object<String,Number>} Edge-type to summed structural score.
 */
export function getInboundStructuralComponents({nodeId, graphService}) {
    graphService?.db?.getAdjacentNodes?.(nodeId, 'both');

    const components = {};
    const inbound    = graphService?.db?.edges?.getByIndex?.('target', nodeId) || [];

    inbound.forEach(edge => {
        if (!edge || edge.type === 'BLOCKS') {
            return;
        }

        const properties = getEdgeProperties(edge);
        const type       = edge.type || 'UNKNOWN';
        const weight     = Number(properties.weight);

        components[type] = (components[type] || 0) + (Number.isFinite(weight) ? weight : 0);
    });

    return components
}

/**
 * @summary Creates the initial semantic-candidate ledger rows for one Golden Path pass.
 * @param {Object} options
 * @param {String[]} [options.semanticIds=[]] Candidate ids returned by vector search.
 * @param {Number[]} [options.semanticDistances=[]] Matching vector distances.
 * @returns {Map<String,Object>} Mutable same-run ledger keyed by candidate node id.
 */
export function createGoldenPathRouteLedger({
    semanticIds = [],
    semanticDistances = []
} = {}) {
    const ledger = new Map();

    semanticIds.forEach((nodeId, index) => {
        const distance      = Number(semanticDistances[index]);
        const safeDistance  = Number.isFinite(distance) ? distance : 0.1;
        const semanticScore = 1.0 / (safeDistance + 0.1);

        ledger.set(nodeId, {
            actionabilityGate   : 'not-evaluated',
            blockerGate         : 'not-evaluated',
            blockerIds          : [],
            finalScore          : null,
            guideWriteScore     : null,
            nodeId,
            nodeType            : '-',
            renderedFinalScore  : null,
            renderedSemantic    : null,
            renderedStructural  : null,
            routeStatus         : 'semantic-only',
            semanticDistance    : safeDistance,
            semanticPresent     : true,
            semanticRank        : index + 1,
            semanticScore,
            stateGate           : 'not-open-match',
            structuralComponents: {},
            structuralScore     : 0,
            typeGate            : 'query-filtered'
        });
    });

    return ledger
}

/**
 * @summary Records the SQL OPEN/state match and structural components for one candidate.
 * @param {Map<String,Object>} ledger Same-run route ledger.
 * @param {Object} options
 * @param {String} options.nodeId Candidate node id.
 * @param {Object} options.nodeData Parsed graph node payload.
 * @param {Object<String,Number>} [options.structuralComponents={}] Inbound structural score by edge type.
 * @param {Number} [options.structuralScore=0] Existing SQL aggregate structural score.
 * @returns {Object} The updated ledger row.
 */
export function recordGoldenPathOpenMatch(ledger, {
    nodeId,
    nodeData,
    structuralComponents = {},
    structuralScore = 0
}) {
    const row = ledger.get(nodeId) || {nodeId, semanticPresent: false};

    row.nodeType             = getNodeType(nodeData);
    row.stateGate            = 'OPEN';
    row.structuralComponents = structuralComponents;
    row.structuralScore      = Number.isFinite(Number(structuralScore)) ? Number(structuralScore) : 0;
    row.typeGate             = row.nodeType === 'ISSUE' || row.nodeType === 'DISCUSSION'
        ? `passed (${row.nodeType})`
        : `unexpected (${row.nodeType})`;

    ledger.set(nodeId, row);

    return row
}

/**
 * @summary Records the blocker-gate outcome for one candidate row.
 * @param {Map<String,Object>} ledger Same-run route ledger.
 * @param {Object} options
 * @param {String} options.nodeId Candidate node id.
 * @param {String[]} [options.blockerIds=[]] Open blocker ids that stopped routing.
 */
export function recordGoldenPathBlockerGate(ledger, {
    nodeId,
    blockerIds = []
}) {
    const row = ledger.get(nodeId);
    if (!row) return;

    row.blockerIds  = blockerIds;
    row.blockerGate = blockerIds.length > 0 ? `blocked (${blockerIds.join(', ')})` : 'passed';
    if (blockerIds.length > 0) {
        row.routeStatus = 'blocked';
    }
}

/**
 * @summary Records the label/actionability gate for one candidate row.
 * @param {Map<String,Object>} ledger Same-run route ledger.
 * @param {Object} options
 * @param {String} options.nodeId Candidate node id.
 * @param {String[]} [options.exclusionLabels=[]] Labels that made the candidate visibility-only.
 */
export function recordGoldenPathActionabilityGate(ledger, {
    nodeId,
    exclusionLabels = []
}) {
    const row = ledger.get(nodeId);
    if (!row) return;

    row.exclusionLabels   = exclusionLabels;
    row.actionabilityGate = exclusionLabels.length > 0
        ? `rejected (${exclusionLabels.join(', ')})`
        : 'passed';
    if (exclusionLabels.length > 0) {
        row.routeStatus = 'non-actionable';
    }
}

/**
 * @summary Records the final hybrid score for an actionable candidate.
 * @param {Map<String,Object>} ledger Same-run route ledger.
 * @param {Object} options
 * @param {String} options.nodeId Candidate node id.
 * @param {Number} options.finalScore Final weighted route score.
 */
export function recordGoldenPathFinalScore(ledger, {
    nodeId,
    finalScore
}) {
    const row = ledger.get(nodeId);
    if (!row) return;

    row.finalScore  = Number(finalScore);
    row.routeStatus = 'scored';
}

/**
 * @summary Records post-ranking selection and current-focus filtering for all ledger rows.
 * @param {Map<String,Object>} ledger Same-run route ledger.
 * @param {Object} options
 * @param {Array<Object>} [options.topNodes=[]] Top ranked nodes before current-focus filtering.
 * @param {Array<Object>} [options.routedTopNodes=[]] Rendered routed nodes.
 * @param {Object|null} [options.focusContradiction=null] Current-focus contradiction result.
 */
export function recordGoldenPathSelection(ledger, {
    topNodes = [],
    routedTopNodes = [],
    focusContradiction = null
} = {}) {
    const topIds         = new Set(topNodes.map(item => item?.node?.id).filter(Boolean));
    const routedIds      = new Set(routedTopNodes.map(item => item?.node?.id).filter(Boolean));
    const blockedByFocus = focusContradiction?.blockedIds || new Set();

    for (const row of ledger.values()) {
        if (blockedByFocus.has(row.nodeId)) {
            row.routeStatus = 'filtered-current-focus';
        } else if (routedIds.has(row.nodeId)) {
            row.routeStatus = 'rendered';
        } else if (topIds.has(row.nodeId) && row.routeStatus === 'scored') {
            row.routeStatus = 'selected-before-focus';
        } else if (row.routeStatus === 'scored') {
            row.routeStatus = 'not-selected';
        }
    }
}

/**
 * @summary Records frontier GUIDES writes and rendered score values for routed nodes.
 * @param {Map<String,Object>} ledger Same-run route ledger.
 * @param {Object} options
 * @param {String} options.nodeId Candidate node id.
 * @param {Number} options.score Final score written to `frontier -GUIDES-> node`.
 * @param {Number} options.semantic Rendered semantic score.
 * @param {Number} options.structural Rendered structural score.
 */
export function recordGoldenPathGuideWrite(ledger, {
    nodeId,
    score,
    semantic,
    structural
}) {
    const row = ledger.get(nodeId);
    if (!row) return;

    row.guideWriteScore    = Number(score);
    row.renderedFinalScore = Number(score);
    row.renderedSemantic   = Number(semantic);
    row.renderedStructural = Number(structural);
}

/**
 * @summary Renders the same-run route attribution ledger as a bounded markdown section.
 * @param {Object} options
 * @param {Map<String,Object>} options.ledger Same-run route ledger.
 * @param {Object} [options.stats={}] Existing Golden Path scoring stats.
 * @param {Date|String} [options.capturedAt=new Date()] Capture timestamp.
 * @returns {String}
 */
export function renderGoldenPathRouteLedgerSection({
    ledger,
    stats      = {},
    capturedAt = new Date()
} = {}) {
    const rows = Array.from((ledger || new Map()).values())
        .sort((a, b) => (a.semanticRank || 0) - (b.semanticRank || 0));
    const count                = value => Number.isFinite(Number(value)) ? Number(value) : 0;
    const actionabilityBuckets = new Map();

    rows.forEach(row => {
        (row.exclusionLabels || []).forEach(label => {
            actionabilityBuckets.set(label, (actionabilityBuckets.get(label) || 0) + 1);
        });
    });

    const bucketText = actionabilityBuckets.size === 0
        ? 'none'
        : Array.from(actionabilityBuckets.entries())
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([label, total]) => `\`${label}\`: ${total}`)
            .join(', ');

    let section = [
        '',
        '## Golden Path Route Attribution Ledger',
        '',
        `Captured at: ${formatGoldenPathTimestamp(capturedAt)}`,
        '',
        'Same-run diagnostic for the Computed Golden Path route chain. Scope: current semantic candidate pool only; no graph nodes or edge classes are minted by this ledger.',
        '',
        `- Semantic candidates: ${count(stats.semanticCandidates)}`,
        '- Type gate: vector query constrained to `ISSUE` / `DISCUSSION`',
        `- SQLite OPEN matches: ${count(stats.sqliteOpenMatches)}`,
        `- Blocked candidates filtered: ${count(stats.blockedCandidates)}`,
        `- Label/actionability buckets: ${bucketText}`,
        `- Scored actionable candidates: ${count(stats.scoredCandidates)}`,
        `- Selected routed nodes: ${count(stats.selectedTopNodes)}`,
        `- Stale frontier GUIDES pruned: ${count(stats.prunedGuideEdges)}`,
        '',
        '| Candidate | Semantic | State | Type | Actionability | Blocker | Structural total | Structural components | Final | Route | GUIDES write | Rendered |',
        '|---|---:|---|---|---|---|---:|---|---:|---|---:|---|'
    ].join('\n');

    if (rows.length === 0) {
        return `${section}\n| none | - | - | - | - | - | - | - | - | no semantic candidates | - | - |\n`
    }

    rows.forEach(row => {
        const structuralComponents = Object.entries(row.structuralComponents || {})
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([type, value]) => `${type}: ${formatNumber(value)}`)
            .join(', ') || '-';
        const rendered = row.renderedFinalScore == null
            ? '-'
            : `Score ${formatNumber(row.renderedFinalScore)} / Semantic ${formatNumber(row.renderedSemantic)} / Structural ${formatNumber(row.renderedStructural)}`;

        section += `\n| ${escapeCell(row.nodeId)} | ${formatNumber(row.semanticScore)} | ${escapeCell(row.stateGate)} | ${escapeCell(row.typeGate)} | ${escapeCell(row.actionabilityGate)} | ${escapeCell(row.blockerGate)} | ${formatNumber(row.structuralScore)} | ${escapeCell(structuralComponents)} | ${formatNumber(row.finalScore)} | ${escapeCell(row.routeStatus)} | ${formatNumber(row.guideWriteScore)} | ${escapeCell(rendered)} |`;
    });

    return `${section}\n`
}
