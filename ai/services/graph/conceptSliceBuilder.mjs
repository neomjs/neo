/**
 * @module ai/services/graph/conceptSliceBuilder
 * @summary Read-only Sandman-v2 concept-slice builder and handoff renderer.
 *
 * Owner contract: render the current Native Edge Graph concept slice as boot structure before
 * prose. The exported `buildConceptSlice()` contract is the shared consumable for downstream
 * renderers: input is a bounded concept neighborhood plus four-axis annotations, output is a
 * render tree. This helper performs zero graph writes and mints no node or edge classes.
 */

import {CONTRACT_AXES} from './conceptNeighborhoodProbe.mjs';

const GAP_LABELS = Object.freeze([
    'TEST_GAP',
    'GUIDE_GAP',
    'EXAMPLE_GAP',
    'ORPHAN_CONCEPT',
    'CONCEPT_REVERIFY_DUE',
    'KB_DEMAND_GAP'
]);

/**
 * @summary Returns the first non-empty timestamp-like value from a payload.
 * @param {Object} properties Edge or node properties.
 * @returns {String|null}
 */
function getTimestamp(properties = {}) {
    return properties.updatedAt ||
        properties.reinforcedAt ||
        properties.createdAt ||
        properties.lastSeenAt ||
        properties.lastGapCheck ||
        null
}

/**
 * @summary Tests whether a payload timestamp sits inside the requested handoff window.
 * @param {Object} properties Edge or node properties.
 * @param {Object} sessionWindow Optional `{since, until}` ISO bounds.
 * @returns {Boolean}
 */
function isInsideWindow(properties = {}, sessionWindow = {}) {
    const timestamp = getTimestamp(properties);
    if (!timestamp || (!sessionWindow.since && !sessionWindow.until)) return true;

    const time = new Date(timestamp).getTime();
    if (Number.isNaN(time)) return true;

    if (sessionWindow.since && time < new Date(sessionWindow.since).getTime()) return false;
    if (sessionWindow.until && time > new Date(sessionWindow.until).getTime()) return false;

    return true
}

/**
 * @summary Normalizes graph node records into the small render-consumable shape.
 * @param {Object} node Graph node record.
 * @returns {{id: String, type: String, properties: Object}}
 */
export function normalizeConceptSliceNode(node = {}) {
    return {
        id        : String(node.id || ''),
        type      : String(node.type || node.label || node.properties?.type || '').toUpperCase(),
        properties: node.properties || {}
    }
}

/**
 * @summary Normalizes graph edge records into the small render-consumable shape.
 * @param {Object} edge Graph edge record.
 * @returns {{id: String, source: String, target: String, type: String, properties: Object}}
 */
export function normalizeConceptSliceEdge(edge = {}) {
    return {
        id        : String(edge.id || ''),
        source    : String(edge.source || ''),
        target    : String(edge.target || ''),
        type      : String(edge.type || ''),
        properties: edge.properties || {}
    }
}

/**
 * @summary Detects which of the four Golden Path v2 annotation axes are present.
 * @param {Object} properties Edge or node properties.
 * @returns {Object<String,{present: Boolean, keys: String[]}>}
 */
export function detectConceptSliceAxes(properties = {}) {
    return Object.fromEntries(Object.entries(CONTRACT_AXES).map(([axis, keys]) => {
        const present = keys.filter(key => properties[key] !== undefined && properties[key] !== null && properties[key] !== '');

        return [axis, {
            keys   : present,
            present: present.length > 0
        }]
    }))
}

/**
 * @summary Formats axis-presence metadata for compact markdown tables.
 * @param {Object} axes Output from `detectConceptSliceAxes`.
 * @returns {String}
 */
export function formatConceptSliceAxes(axes = {}) {
    const present = Object.entries(axes)
        .filter(([, value]) => value?.present)
        .map(([axis, value]) => `${axis}:${value.keys.join('+')}`);

    return present.length ? present.join(', ') : 'absent'
}

/**
 * @summary Parses the capability-gap payload shape used by `GapInferenceEngine`.
 * @param {*} value Node `properties.capabilityGap` value.
 * @returns {String[]}
 */
export function parseConceptSliceGaps(value) {
    if (!value) return [];

    if (Array.isArray(value)) {
        return value.map(item => String(item).trim()).filter(Boolean)
    }

    const raw = String(value);

    try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
            return parsed.map(item => String(item).trim()).filter(Boolean)
        }
    } catch {}

    return raw.split(/\\n|\n/).map(item => item.trim()).filter(Boolean)
}

/**
 * @summary Returns a concept id when either endpoint of an edge is a CONCEPT node.
 * @param {Object} edge Normalized edge.
 * @param {Map<String,Object>} nodeById Normalized node map.
 * @returns {String|null}
 */
function getConceptEndpoint(edge, nodeById) {
    const source = nodeById.get(edge.source);
    if (source?.type === 'CONCEPT') return edge.source;

    const target = nodeById.get(edge.target);
    if (target?.type === 'CONCEPT') return edge.target;

    if (String(edge.source).startsWith('CONCEPT:')) return edge.source;
    if (String(edge.target).startsWith('CONCEPT:')) return edge.target;

    return null
}

/**
 * @summary Returns stable node display text without making the renderer depend on one schema.
 * @param {Object} node Normalized node.
 * @returns {String}
 */
function getNodeTitle(node = {}) {
    return String(node.properties?.title || node.properties?.name || node.id || '-')
}

/**
 * @summary Builds the shared Sandman-v2 concept-slice render tree.
 *
 * The builder reads the in-memory graph projection only. Missing sections render as empty-state
 * rows so handoff generation never depends on graph completeness.
 *
 * @param {Object} options
 * @param {Object} options.graphService GraphService-compatible object.
 * @param {Object} [options.sessionWindow={}] Optional `{since, until}` edge/node timestamp window.
 * @param {Number} [options.conceptLimit=10] Maximum concepts rendered.
 * @param {Number} [options.edgeDeltaLimit=10] Maximum edge deltas rendered.
 * @param {Number} [options.gapLimit=10] Maximum concept gaps rendered.
 * @param {Date|String} [options.capturedAt=new Date()] Capture timestamp.
 * @returns {Object} Render tree with `conceptsTouched`, `edgeDeltas`, and `perConceptGaps`.
 */
export function buildConceptSlice({
    graphService,
    sessionWindow = {},
    conceptLimit = 10,
    edgeDeltaLimit = 10,
    gapLimit = 10,
    capturedAt = new Date()
} = {}) {
    const
        nodeItems = Array.isArray(graphService?.db?.nodes?.items) ? graphService.db.nodes.items : [],
        edgeItems = Array.isArray(graphService?.db?.edges?.items) ? graphService.db.edges.items : [],
        nodes     = nodeItems.map(normalizeConceptSliceNode),
        edges     = edgeItems.map(normalizeConceptSliceEdge),
        nodeById  = new Map(nodes.map(node => [node.id, node])),
        touched   = new Map();

    edges
        .filter(edge => edge.type === 'TAGGED_CONCEPT' && isInsideWindow(edge.properties, sessionWindow))
        .forEach(edge => {
            const conceptId = getConceptEndpoint(edge, nodeById);
            if (!conceptId) return;

            const row = touched.get(conceptId) || {
                axes      : detectConceptSliceAxes({}),
                conceptId,
                sources   : new Set(),
                title     : getNodeTitle(nodeById.get(conceptId)) || conceptId,
                touchCount: 0
            };

            row.touchCount++;
            row.sources.add(edge.source === conceptId ? edge.target : edge.source);
            row.axes = detectConceptSliceAxes({
                ...(nodeById.get(conceptId)?.properties || {}),
                ...(edge.properties || {})
            });

            touched.set(conceptId, row);
        });

    const conceptsTouched = [...touched.values()]
        .sort((a, b) => b.touchCount - a.touchCount || a.conceptId.localeCompare(b.conceptId))
        .slice(0, conceptLimit)
        .map(row => ({
            ...row,
            sources: [...row.sources].slice(0, 3)
        }));

    const edgeDeltas = edges
        .filter(edge => getConceptEndpoint(edge, nodeById) && isInsideWindow(edge.properties, sessionWindow))
        .map(edge => ({
            axes     : detectConceptSliceAxes(edge.properties),
            delta    : edge.properties.delta || ((edge.properties.lifecycle || edge.properties.updatedAt) ? 'updated' : 'observed'),
            edgeId   : edge.id,
            source   : edge.source,
            target   : edge.target,
            timestamp: getTimestamp(edge.properties) || null,
            type     : edge.type,
            weight   : edge.properties.weight
        }))
        .sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')) || a.edgeId.localeCompare(b.edgeId))
        .slice(0, edgeDeltaLimit);

    const perConceptGaps = nodes
        .filter(node => node.type === 'CONCEPT')
        .flatMap(node => parseConceptSliceGaps(node.properties.capabilityGap).map(gap => ({
            axes     : detectConceptSliceAxes(node.properties),
            conceptId: node.id,
            gap,
            gapClass : GAP_LABELS.find(label => gap.includes(`[${label}]`)) || 'UNCLASSIFIED',
            title    : getNodeTitle(node)
        })))
        .slice(0, gapLimit);

    return {
        capturedAt: new Date(capturedAt).toISOString(),
        conceptsTouched,
        edgeDeltas,
        perConceptGaps,
        schema    : {
            input     : 'bounded concept neighborhood + four-axis tier/provenance annotations',
            output    : 'render tree',
            renderOnly: true,
            axes      : Object.keys(CONTRACT_AXES)
        }
    }
}

/**
 * @summary Escapes markdown table cell content.
 * @param {*} value Candidate table value.
 * @returns {String}
 */
function escapeCell(value) {
    return String(value ?? '-')
        .replace(/\\/g, '\\\\')
        .replace(/\|/g, '\\|')
        .replace(/\n/g, ' ')
}

/**
 * @summary Renders the shared concept-slice tree as the structure-first handoff section.
 * @param {Object} slice Output from `buildConceptSlice`.
 * @returns {String}
 */
export function renderConceptSliceSection(slice = {}) {
    let section = `\n## Concept Slice\n\n`;
    section += `*Captured at: ${slice.capturedAt || new Date().toISOString()} (Source: Native Edge Graph; render-only shared slice contract)*\n\n`;
    section += `Contract: input = bounded concept neighborhood + four-axis annotations; output = render tree. No graph writes, no HANDOFF node type.\n\n`;

    section += `### Concepts Touched\n\n`;
    if (slice.conceptsTouched?.length) {
        section += `| Concept | Touches | Source sample | Axes |\n`;
        section += `|---|---:|---|---|\n`;
        slice.conceptsTouched.forEach(row => {
            section += `| \`${escapeCell(row.conceptId)}\` | ${row.touchCount} | ${escapeCell(row.sources.join(', ') || '-')} | ${escapeCell(formatConceptSliceAxes(row.axes))} |\n`;
        });
    } else {
        section += `No concept touches detected in this handoff window.\n`;
    }

    section += `\n### Edge Deltas\n\n`;
    if (slice.edgeDeltas?.length) {
        section += `| Edge | Type | Source -> Target | Delta | Axes |\n`;
        section += `|---|---|---|---|---|\n`;
        slice.edgeDeltas.forEach(row => {
            section += `| \`${escapeCell(row.edgeId)}\` | \`${escapeCell(row.type)}\` | \`${escapeCell(row.source)}\` -> \`${escapeCell(row.target)}\` | ${escapeCell(row.delta)} | ${escapeCell(formatConceptSliceAxes(row.axes))} |\n`;
        });
    } else {
        section += `No concept edge deltas detected in this handoff window.\n`;
    }

    section += `\n### Open Gaps per Concept\n\n`;
    if (slice.perConceptGaps?.length) {
        section += `| Concept | Gap class | Gap | Axes |\n`;
        section += `|---|---|---|---|\n`;
        slice.perConceptGaps.forEach(row => {
            section += `| \`${escapeCell(row.conceptId)}\` | \`${escapeCell(row.gapClass)}\` | ${escapeCell(row.gap.replace(/^\[[^\]]+\]\s*/, ''))} | ${escapeCell(formatConceptSliceAxes(row.axes))} |\n`;
        });
    } else {
        section += `No concept-keyed open gaps detected.\n`;
    }

    section += `\n`;

    return section
}

/**
 * @summary Builds and renders the concept slice, degrading to no section on failure.
 * @param {Object} options Build options plus optional logger.
 * @returns {String}
 */
export function renderConceptSliceHandoffSection({
    logger,
    ...options
} = {}) {
    try {
        return renderConceptSliceSection(buildConceptSlice(options))
    } catch (error) {
        logger?.warn?.(`[GoldenPathSynthesizer] Concept Slice section render failed: ${error.message}`);
        return ''
    }
}
