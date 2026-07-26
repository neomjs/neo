import {createHash} from 'crypto';

import {IDENTITIES} from './identityRoots.mjs';

/**
 * @module ai/graph/bootSeedManifest
 * @summary Canonical, enumerable v1 manifest for every deterministic Native Edge
 * Graph record created by ordinary Memory Core boot.
 *
 * Boot and fresh-target recovery both consume this module. Adding a boot seed
 * anywhere else makes the recovery predicate fail closed because the persisted
 * graph can no longer equal this complete manifest.
 */

/**
 * @member {Number}
 */
export const GRAPH_BOOT_SEED_VERSION = 1;

const FIXED_NODE_SPECS = Object.freeze([
    Object.freeze({
        id         : 'frontier',
        type       : 'SYSTEM_ANCHOR',
        name       : 'Active Context Frontier',
        description: 'The shifting focal point of the active Neo OS agent session.'
    }),
    Object.freeze({
        id         : 'Neo-Master-Architecture',
        type       : 'System',
        name       : 'Global System Primer',
        description: 'Core framework tenets: 1. All Playwright tests must be run using "npm run test-unit -- [file]". No npx. 2. UI debugging and application state inspection must use the Neural Link MCP tools. 3. Look at .agents/skills for reusable agent workflows.'
    })
]);

const FIXED_EDGE_SPECS = Object.freeze([
    Object.freeze({
        source    : 'frontier',
        target    : 'Neo-Master-Architecture',
        type      : 'SYSTEM_TENET',
        weight    : 1,
        properties: Object.freeze({userId: null})
    })
]);

/**
 * @summary Returns a detached manifest whose node specs are suitable for
 * `GraphService.upsertGlobalNode()` and whose edge specs are suitable for
 * `GraphService.linkGlobalNodes()`.
 *
 * @param {Object} [options]
 * @param {Object[]} [options.identities=IDENTITIES] Canonical identity roots.
 * @returns {{version: Number, nodes: Object[], edges: Object[], fingerprint: String}}
 */
export function createGraphBootSeedManifest({identities = IDENTITIES} = {}) {
    if (!Array.isArray(identities)) {
        throw new TypeError('createGraphBootSeedManifest: identities must be an array')
    }

    const
        nodes       = [...FIXED_NODE_SPECS, ...identities].map(cloneJsonValue),
        edges       = FIXED_EDGE_SPECS.map(cloneJsonValue),
        fingerprint = fingerprintGraphBootSeedRecords({nodes, edges});

    return {
        version: GRAPH_BOOT_SEED_VERSION,
        nodes,
        edges,
        fingerprint
    }
}

/**
 * @summary Returns a detached clone of one fixed boot-seed node spec by id.
 *
 * Exists so a runtime consumer that must guarantee a boot-seed node is present can
 * reuse THIS module's declaration instead of hand-writing a second copy. A hand-written
 * copy is not merely duplication: it drifts (description text, `semanticVectorId`), and
 * because the module header makes this manifest the completeness predicate for
 * fresh-target recovery, a divergent copy makes that predicate fail closed.
 *
 * Fixed specs only — identity roots are not addressable here, because they are supplied
 * per-call to {@link createGraphBootSeedManifest} and are not a fixed part of the manifest.
 *
 * @param {String} id Fixed boot-seed node id, e.g. `'frontier'`.
 * @returns {Object} Detached spec clone, suitable for `GraphService.upsertGlobalNode()`.
 * @throws {Error} When `id` names no fixed boot-seed node — an unknown id is a contract
 * breach by the caller, never a silent miss that would reintroduce a hand-written spec.
 */
export function getGraphBootSeedNodeSpec(id) {
    const spec = FIXED_NODE_SPECS.find(candidate => candidate.id === id);

    if (!spec) {
        throw new Error(
            `getGraphBootSeedNodeSpec: "${id}" is not a fixed boot-seed node. ` +
            `Known ids: ${FIXED_NODE_SPECS.map(candidate => candidate.id).join(', ')}.`
        )
    }

    return cloneJsonValue(spec)
}

/**
 * @summary Projects one boot node input spec into its exact persisted graph
 * record shape.
 *
 * `GraphService.upsertGlobalNode()` folds `name` and `description` into
 * `properties`, maps `type` to `label`, and forces `userId: null`.
 *
 * @param {Object} spec Boot node spec.
 * @returns {{id: String, label: String, properties: Object}}
 */
export function createGraphBootSeedNodeRecord(spec = {}) {
    if (typeof spec.id !== 'string' || spec.id.length === 0) {
        throw new TypeError('createGraphBootSeedNodeRecord: spec.id is required')
    }

    return pruneUndefined({
        id        : spec.id,
        label     : spec.type || spec.label || 'NODE',
        properties: {
            name            : spec.name || spec.id,
            description     : spec.description || '',
            semanticVectorId: spec.semanticVectorId,
            state           : spec.state,
            updatedAt       : spec.updatedAt,
            ...(spec.properties || {}),
            userId: null
        }
    })
}

/**
 * @summary Projects one boot edge input spec into the canonical persisted
 * comparison shape. The storage-minted random edge id is deliberately excluded;
 * source, target, type, and the complete properties record are normative.
 *
 * @param {Object} spec Boot edge spec or persisted edge record.
 * @returns {{source: String, target: String, type: String, properties: Object}}
 */
export function createGraphBootSeedEdgeRecord(spec = {}) {
    for (const key of ['source', 'target', 'type']) {
        if (typeof spec[key] !== 'string' || spec[key].length === 0) {
            throw new TypeError(`createGraphBootSeedEdgeRecord: spec.${key} is required`)
        }
    }

    return pruneUndefined({
        source    : spec.source,
        target    : spec.target,
        type      : spec.type,
        properties: {
            weight: spec.weight ?? spec.properties?.weight ?? 1,
            ...(spec.properties || {}),
            userId: null
        }
    })
}

/**
 * @summary Evaluates whether the complete persisted graph record set is exactly
 * the canonical boot seed—no extra, missing, or altered node/edge.
 *
 * Rows may be raw parsed records, SQLite `{data}` rows, or JSON strings. Schema
 * tables never enter this record-level API and therefore cannot affect the
 * predicate.
 *
 * @param {Object} options
 * @param {Object[]|String[]} options.nodes Persisted node records.
 * @param {Object[]|String[]} options.edges Persisted edge records.
 * @param {Object} [options.manifest=createGraphBootSeedManifest()] Expected manifest.
 * @returns {{fresh: Boolean, reason: String|null, expectedFingerprint: String, observedFingerprint: String, nodeCount: Number, edgeCount: Number}}
 */
export function evaluateGraphBootSeedFreshness({
    nodes,
    edges,
    manifest = createGraphBootSeedManifest()
} = {}) {
    if (!Array.isArray(nodes) || !Array.isArray(edges)) {
        throw new TypeError('evaluateGraphBootSeedFreshness: nodes and edges arrays are required')
    }

    const
        expectedNodes       = manifest.nodes.map(createGraphBootSeedNodeRecord),
        expectedEdges       = manifest.edges.map(createGraphBootSeedEdgeRecord),
        observedNodes       = nodes.map(parseGraphRecord).map(normalizePersistedNodeRecord),
        observedEdges       = edges.map(parseGraphRecord).map(createGraphBootSeedEdgeRecord),
        expectedFingerprint = fingerprintNormalizedGraphRecords({nodes: expectedNodes, edges: expectedEdges}),
        observedFingerprint = fingerprintNormalizedGraphRecords({nodes: observedNodes, edges: observedEdges}),
        fresh               = expectedFingerprint === observedFingerprint;

    return {
        fresh,
        reason: fresh
            ? null
            : `persisted graph differs from boot seed v${GRAPH_BOOT_SEED_VERSION} ` +
              `(nodes ${observedNodes.length}/${expectedNodes.length}, edges ${observedEdges.length}/${expectedEdges.length})`,
        expectedFingerprint,
        observedFingerprint,
        nodeCount: observedNodes.length,
        edgeCount: observedEdges.length
    }
}

/**
 * @summary Computes the canonical boot-seed fingerprint from input specs.
 *
 * @param {Object} options
 * @param {Object[]} options.nodes Boot node specs.
 * @param {Object[]} options.edges Boot edge specs.
 * @returns {String} `sha256:<hex>`.
 */
export function fingerprintGraphBootSeedRecords({nodes = [], edges = []} = {}) {
    return fingerprintNormalizedGraphRecords({
        nodes: nodes.map(createGraphBootSeedNodeRecord),
        edges: edges.map(createGraphBootSeedEdgeRecord)
    })
}

function fingerprintNormalizedGraphRecords({nodes, edges}) {
    const value = {
        version: GRAPH_BOOT_SEED_VERSION,
        nodes  : [...nodes].sort(compareCanonical),
        edges  : [...edges].sort(compareCanonical)
    };

    return `sha256:${createHash('sha256').update(canonicalJson(value)).digest('hex')}`
}

function normalizePersistedNodeRecord(record) {
    if (!record || typeof record !== 'object') {
        throw new TypeError('normalizePersistedNodeRecord: graph node record must be an object')
    }

    const id = record.id;
    if (typeof id !== 'string' || id.length === 0) {
        throw new TypeError('normalizePersistedNodeRecord: record.id is required')
    }

    return pruneUndefined({
        id,
        label     : record.label || record.type || 'NODE',
        properties: cloneJsonValue(record.properties || {})
    })
}

function parseGraphRecord(value) {
    if (typeof value === 'string') {
        return JSON.parse(value)
    }
    if (value && typeof value.data === 'string') {
        return JSON.parse(value.data)
    }
    return value
}

function compareCanonical(a, b) {
    return canonicalJson(a).localeCompare(canonicalJson(b))
}

function canonicalJson(value) {
    if (Array.isArray(value)) {
        return `[${value.map(canonicalJson).join(',')}]`
    }
    if (value && typeof value === 'object') {
        return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`
    }
    return JSON.stringify(value)
}

function pruneUndefined(value) {
    return JSON.parse(JSON.stringify(value))
}

function cloneJsonValue(value) {
    return JSON.parse(JSON.stringify(value))
}
