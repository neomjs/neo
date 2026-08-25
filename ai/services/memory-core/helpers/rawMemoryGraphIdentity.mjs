import {normalizeUserId} from '../../../mcp/server/shared/services/RequestContextService.mjs';

/**
 * @module ai/services/memory-core/helpers/rawMemoryGraphIdentity
 * @summary Owns the one Native Edge Graph identity for a raw Memory Core turn.
 *
 * Raw turns already have a durable identity before they reach the graph: the UUID shared by the
 * write-ahead log and Chroma. MemoryService projects that UUID directly as an `AGENT_MEMORY` node.
 * REM historically minted a second `memory:<uuid>` / `MEMORY` projection for the same row. The
 * prefix remains accepted as an input grammar for lazy extractor edges, but verified Chroma-backed
 * rows resolve to the durable bare UUID.
 *
 * Pure and storage-free so write-time projection, REM ingestion, lazy back-fill, migrations, and
 * unit fixtures consume one contract without importing a connect-on-init service.
 */

export const RAW_MEMORY_NODE_LABEL        = 'AGENT_MEMORY';
export const LEGACY_RAW_MEMORY_NODE_LABEL = 'MEMORY';

const CHROMA_PROJECTION_FIELDS      = Object.freeze(['createdAt', 'sessionId', 'userId']);
const CANONICAL_PRESENTATION_FIELDS = new Set([
    'description',
    'name',
    'semanticVectorId',
    'state',
    'updatedAt'
]);

/**
 * @param {*} value
 * @param {String} surface
 * @returns {String}
 */
function requireRawMemoryId(value, surface) {
    if (typeof value !== 'string' || value.length === 0) {
        throw new TypeError(`${surface} requires a non-empty raw-memory UUID`)
    }

    return value
}

/**
 * @summary Resolves the canonical graph node id for one raw memory.
 * @param {String} chromaId Durable WAL/Chroma UUID.
 * @returns {String} The bare durable UUID.
 */
export function canonicalRawMemoryGraphId(chromaId) {
    return requireRawMemoryId(chromaId, 'canonicalRawMemoryGraphId')
}

/**
 * @summary Resolves the legacy REM projection id for one raw memory.
 * @param {String} chromaId Durable WAL/Chroma UUID.
 * @returns {String} The historical prefixed id.
 */
export function legacyRawMemoryGraphId(chromaId) {
    return `memory:${requireRawMemoryId(chromaId, 'legacyRawMemoryGraphId')}`
}

/**
 * @summary Parses an extractor/lazy-edge memory id without declaring the prefixed form canonical.
 * @param {String} graphNodeId Requested graph id.
 * @returns {{chromaId: String, canonicalGraphId: String, legacyGraphId: String}|null}
 */
export function parseRawMemoryGraphId(graphNodeId) {
    if (typeof graphNodeId !== 'string' || !graphNodeId.toLowerCase().startsWith('memory:')) {
        return null
    }

    const chromaId = graphNodeId.slice(7);

    if (!chromaId) {
        return null
    }

    return {
        chromaId,
        canonicalGraphId: canonicalRawMemoryGraphId(chromaId),
        legacyGraphId   : legacyRawMemoryGraphId(chromaId)
    }
}

/**
 * @param {*} left
 * @param {*} right
 * @returns {Boolean}
 */
function valuesEqual(left, right) {
    if (Object.is(left, right)) {
        return true
    }

    if (left && right && typeof left === 'object' && typeof right === 'object') {
        return JSON.stringify(left) === JSON.stringify(right)
    }

    return false
}

/**
 * @summary Merges compatible raw-memory projection properties and names every conflicting field.
 *
 * Canonical and legacy graph rows may carry disjoint consumer evidence; both sets survive. A field
 * present on both rows with different values is not resolved by precedence — the migration leaves
 * both rows intact and reports the conflict. Only the three Chroma metadata fields the old ingestor
 * already projected are admitted from storage, so reconciliation cannot accidentally copy prompt or
 * thought content into the graph.
 *
 * @param {Object} options
 * @param {String} options.chromaId
 * @param {Object} [options.canonicalProperties]
 * @param {Object} [options.legacyProperties]
 * @param {Object} [options.metadata]
 * @returns {{properties: Object|null, conflicts: String[]}}
 */
export function mergeRawMemoryProjectionProperties({
    chromaId,
    canonicalProperties = {},
    legacyProperties    = {},
    metadata            = {}
}) {
    canonicalRawMemoryGraphId(chromaId);

    const
        merged    = {},
        conflicts = [];

    const add = (source, label, fields = Object.keys(source || {}), overwrite = new Set()) => {
        for (const key of fields) {
            const rawValue = source?.[key];
            const value    = key === 'userId' ? normalizeUserId(rawValue) : rawValue;

            if (value === undefined) {
                continue
            }

            if (Object.hasOwn(merged, key) && !valuesEqual(merged[key], value)) {
                if (overwrite.has(key)) {
                    merged[key] = value;
                    continue
                }

                conflicts.push(`${key}:${label}`);
                continue
            }

            merged[key] = value
        }
    };

    add(legacyProperties, 'legacy');
    // Presentation differs by projection by construction: legacy REM used the UUID prefix, while
    // write-time AGENT_MEMORY names the turn timestamp and owns semanticVectorId. Canonical wins
    // only for those representational fields; identity/provenance disagreements still fail closed.
    add(canonicalProperties, 'canonical', Object.keys(canonicalProperties || {}), CANONICAL_PRESENTATION_FIELDS);
    add(metadata, 'chroma', CHROMA_PROJECTION_FIELDS);

    if (Object.hasOwn(merged, 'chromaId') && merged.chromaId !== chromaId) {
        conflicts.push('chromaId:canonical')
    } else {
        merged.chromaId = chromaId
    }

    return {
        conflicts : [...new Set(conflicts)].sort(),
        properties: conflicts.length === 0 ? merged : null
    }
}
