#!/usr/bin/env node
/**
 * @module ai/scripts/migrations/reconcileRawMemoryGraphIdentities
 * @summary Converges Chroma-backed legacy `memory:<uuid>` / `MEMORY` graph projections onto the
 * existing bare-UUID `AGENT_MEMORY` identity. Dry-run by default; `--apply` is atomic in SQLite.
 *
 * The migration never infers duplicates from a label alone. A prefixed MEMORY row qualifies only
 * when `properties.chromaId` names a row present in the Memory Core Chroma collection. MEMORY rows
 * without `chromaId` are semantic/curated ontology and remain untouched. AGENT_MEMORY rows absent
 * from Chroma remain untouched too; archived rows are durable tombstones by contract.
 *
 * Conflicting identity properties or duplicate-edge properties fail closed. No winner is chosen and
 * no row is deleted while the plan carries a conflict. Re-running after a successful apply is a
 * no-op, so interruption before commit and process restart after commit are both bounded.
 *
 * Usage:
 *   node ai/scripts/migrations/reconcileRawMemoryGraphIdentities.mjs
 *   node ai/scripts/migrations/reconcileRawMemoryGraphIdentities.mjs --apply --offline
 *   node ai/scripts/migrations/reconcileRawMemoryGraphIdentities.mjs --db <path>
 *   node ai/scripts/migrations/reconcileRawMemoryGraphIdentities.mjs --help
 *
 * Apply is an offline graph migration. Stop every Memory Core process that can write/cache this
 * SQLite file, run with `--apply --offline`, then restart them. The explicit flag is acknowledgement,
 * not a guessed process probe; a process census from another namespace cannot prove quiescence.
 */

import path            from 'node:path';
import {fileURLToPath} from 'node:url';
import {
    canonicalRawMemoryGraphId,
    LEGACY_RAW_MEMORY_NODE_LABEL,
    legacyRawMemoryGraphId,
    mergeRawMemoryProjectionProperties,
    normalizeRawMemoryUserId,
    RAW_MEMORY_NODE_LABEL
} from '../../services/memory-core/helpers/rawMemoryGraphIdentity.mjs';

const
    PAGE_SIZE            = 2000,
    SQLITE_ID_BATCH_SIZE = 800;

/**
 * @param {String[]} argv
 * @returns {{apply: Boolean, db: String|null, help: Boolean, offline: Boolean}}
 */
export function parseArgs(argv) {
    const options = {apply: false, db: null, help: false, offline: false};

    for (let index = 0; index < argv.length; index++) {
        const arg = argv[index];

        if (arg === '--apply') {
            options.apply = true
        } else if (arg === '--offline') {
            options.offline = true
        } else if (arg === '--db') {
            const value = argv[++index];

            if (typeof value !== 'string' || value.trim() === '') {
                throw new Error('--db expects a non-empty path')
            }

            options.db = path.resolve(value)
        } else if (arg === '--help' || arg === '-h') {
            options.help = true
        } else {
            throw new Error(`unknown argument: ${arg}`)
        }
    }

    return options
}

/**
 * @summary Refuses an online apply; the caller must explicitly acknowledge an offline graph.
 * @param {{apply: Boolean, offline: Boolean}} options
 * @returns {void}
 */
export function assertApplyPosture(options) {
    if (options.apply && !options.offline) {
        throw new Error('--apply requires --offline after every Memory Core graph writer is stopped')
    }
}

/**
 * @summary Reads both raw-memory populations, exact bare-id collision occupants, and every
 * incident edge from SQLite.
 * @param {Object} db better-sqlite3 connection.
 * @param {Object} [options]
 * @param {String[]} [options.chromaIds] Exact bare ids whose non-AGENT occupants must be visible
 *     to the planner as identity conflicts.
 * @returns {{nodes: Object[], edges: Object[]}}
 */
export function readGraphSnapshot(db, {chromaIds = []} = {}) {
    const rawNodes = db.prepare(`
        SELECT id, user_id, data
        FROM Nodes
        WHERE json_extract(data, '$.label') IN (?, ?)
        ORDER BY id
    `).all(RAW_MEMORY_NODE_LABEL, LEGACY_RAW_MEMORY_NODE_LABEL).map(row => {
        const data = JSON.parse(row.data);

        return {...data, userId: row.user_id}
    });
    const nodesById = new Map(rawNodes.map(node => [node.id, node]));

    for (let offset = 0; offset < chromaIds.length; offset += SQLITE_ID_BATCH_SIZE) {
        const ids          = chromaIds.slice(offset, offset + SQLITE_ID_BATCH_SIZE);
        const placeholders = ids.map(() => '?').join(', ');
        const rows         = db.prepare(`
            SELECT id, user_id, data
            FROM Nodes
            WHERE id IN (${placeholders})
        `).all(...ids);

        for (const row of rows) {
            const data = JSON.parse(row.data);

            nodesById.set(row.id, {...data, userId: row.user_id})
        }
    }

    const edges = db.prepare(`
        WITH raw_nodes AS (
            SELECT id
            FROM Nodes
            WHERE json_extract(data, '$.label') IN (?, ?)
        )
        SELECT id, user_id, source, target, type, data
        FROM Edges
        WHERE source IN raw_nodes OR target IN raw_nodes
        ORDER BY id
    `)
        .all(RAW_MEMORY_NODE_LABEL, LEGACY_RAW_MEMORY_NODE_LABEL)
        .map(row => ({...JSON.parse(row.data), userId: row.user_id}));

    return {nodes: [...nodesById.values()].sort((a, b) => a.id.localeCompare(b.id)), edges}
}

/**
 * @summary Scans every Chroma raw-memory row; absence cannot be expressed by a where filter.
 * @param {Object} collection Chroma collection.
 * @returns {Promise<Object[]>} Array of `{id, metadata}`.
 */
export async function scanChromaRows(collection) {
    const rows   = [];
    let   offset = 0;

    for (;;) {
        const page = await collection.get({
            limit  : PAGE_SIZE,
            offset,
            include: ['metadatas']
        });
        const ids = page?.ids || [];

        if (ids.length === 0) {
            break
        }

        rows.push(...ids.map((id, index) => ({id, metadata: page.metadatas?.[index] || {}})));
        offset += ids.length
    }

    return rows
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

    return left && right && typeof left === 'object' && typeof right === 'object'
        ? JSON.stringify(left) === JSON.stringify(right)
        : false
}

/**
 * @summary Resolves independently stored RLS identity observations without treating missing
 * evidence as agreement. Explicit `null` remains the global tenant; `undefined` means absent.
 * @param {Array<*>} values
 * @returns {{conflict: Boolean, userId: String|null}}
 */
function resolveUserIdEvidence(values) {
    const normalized = values
        .map(value => value === null ? null : normalizeRawMemoryUserId(value))
        .filter(value => value !== undefined);
    const distinct = [...new Set(normalized)];

    return {
        conflict: distinct.length > 1,
        userId  : distinct[0] ?? null
    }
}

/**
 * @param {Object|null|undefined} value
 * @param {String} key
 * @param {Array<*>} target
 * @returns {void}
 */
function appendOwnValue(value, key, target) {
    if (value && Object.hasOwn(value, key)) {
        target.push(value[key])
    }
}

/**
 * @summary Merges duplicate-edge evidence without double-counting one relation.
 *
 * Weight is the one intentionally convergent field: duplicate projections may have independently
 * reinforced the same fact, so the stronger observed weight survives. Any other differing property
 * is an unresolved conflict and blocks the whole migration.
 *
 * @param {Object[]} edges
 * @param {Array<String|null>} expectedUserIds Tenant evidence from every raw-memory endpoint moved.
 * @returns {{properties: Object|null, conflicts: String[], userId: String|null}}
 */
function mergeEdgeEvidence(edges, expectedUserIds = []) {
    const
        properties = {},
        conflicts  = [],
        userIds    = [...expectedUserIds];

    for (const edge of edges) {
        appendOwnValue(edge, 'userId', userIds);
        appendOwnValue(edge.properties, 'userId', userIds);

        for (const [key, value] of Object.entries(edge.properties || {})) {
            if (key === 'userId') {
                continue
            } else if (key === 'weight') {
                const numericWeight = Number(value);

                if (!Number.isFinite(numericWeight)) {
                    conflicts.push('edge.weight')
                } else {
                    properties.weight = properties.weight === undefined
                        ? numericWeight
                        : Math.max(properties.weight, numericWeight)
                }
            } else if (Object.hasOwn(properties, key) && !valuesEqual(properties[key], value)) {
                conflicts.push(`edge.${key}`)
            } else {
                properties[key] = value
            }
        }
    }

    const identity = resolveUserIdEvidence(userIds);

    if (identity.conflict) {
        conflicts.push('edge.userId')
    } else if (identity.userId != null) {
        properties.userId = identity.userId
    }

    return {
        conflicts : [...new Set(conflicts)].sort(),
        properties: conflicts.length === 0 ? properties : null,
        userId    : identity.userId
    }
}

/**
 * @summary Builds the complete coverage census and one atomic reconciliation plan.
 * @param {Object} options
 * @param {Object[]} options.chromaRows
 * @param {Object[]} options.graphNodes
 * @param {Object[]} options.graphEdges
 * @returns {Object}
 */
export function planRawMemoryIdentityReconciliation({chromaRows, graphNodes, graphEdges}) {
    const
        chromaById = new Map((chromaRows || []).map(row => [row.id, row.metadata || {}])),
        nodeById   = new Map((graphNodes || []).map(node => [node.id, node])),
        coverage   = {
            agentOnly         : [],
            legacyOnly        : [],
            dual              : [],
            neither           : [],
            tombstone         : [],
            agentOrphan       : [],
            legacyOrphan      : [],
            legacyMalformed   : [],
            canonicalCollision: [],
            semanticOnly      : []
        },
        mappings       = new Map(),
        mappingUserIds = new Map(),
        nodeActions    = [],
        conflicts      = [];

    for (const chromaId of [...chromaById.keys()].sort()) {
        const
            canonicalId        = canonicalRawMemoryGraphId(chromaId),
            legacyId           = legacyRawMemoryGraphId(chromaId),
            canonicalCandidate = nodeById.get(canonicalId),
            canonical          = canonicalCandidate?.label === RAW_MEMORY_NODE_LABEL ? canonicalCandidate : null,
            candidate          = nodeById.get(legacyId),
            legacy             = candidate?.label === LEGACY_RAW_MEMORY_NODE_LABEL &&
                candidate.properties?.chromaId === chromaId
                ? candidate
                : null;

        if (canonicalCandidate && !canonical) {
            coverage.canonicalCollision.push(chromaId);
            conflicts.push({
                kind      : 'canonical-identity-conflict',
                nodeId    : canonicalId,
                foundLabel: canonicalCandidate.label
            })
        }

        if (canonical && legacy) {
            coverage.dual.push(chromaId)
        } else if (canonical) {
            coverage.agentOnly.push(chromaId)
        } else if (legacy) {
            coverage.legacyOnly.push(chromaId)
        } else {
            coverage.neither.push(chromaId)
        }

        if (!legacy || (canonicalCandidate && !canonical)) {
            continue
        }

        const merged = mergeRawMemoryProjectionProperties({
            chromaId,
            canonicalProperties: canonical?.properties,
            legacyProperties   : legacy.properties,
            metadata           : chromaById.get(chromaId)
        });
        const userIds = [];

        appendOwnValue(canonical, 'userId', userIds);
        appendOwnValue(canonical?.properties, 'userId', userIds);
        appendOwnValue(legacy, 'userId', userIds);
        appendOwnValue(legacy.properties, 'userId', userIds);
        appendOwnValue(chromaById.get(chromaId), 'userId', userIds);

        const identity = resolveUserIdEvidence(userIds);

        if (identity.conflict) {
            merged.conflicts.push('user_id')
        }

        if (merged.conflicts.length > 0) {
            conflicts.push({chromaId, kind: 'node-property-conflict', fields: [...new Set(merged.conflicts)].sort()});
            continue
        }

        const canonicalProperties = {
            ...merged.properties,
            semanticVectorId: canonical?.properties?.semanticVectorId || chromaId
        };
        const effectiveUserId = identity.userId;

        if (effectiveUserId != null) {
            canonicalProperties.userId = effectiveUserId
        }

        nodeActions.push({
            canonicalId,
            legacyId,
            userId: effectiveUserId,
            data  : {
                id        : canonicalId,
                label     : RAW_MEMORY_NODE_LABEL,
                properties: canonicalProperties
            }
        });
        mappings.set(legacyId, canonicalId);
        mappingUserIds.set(legacyId, effectiveUserId)
    }

    for (const node of graphNodes || []) {
        if (node.label === LEGACY_RAW_MEMORY_NODE_LABEL) {
            const chromaId = node.properties?.chromaId;

            if (!chromaId) {
                coverage.semanticOnly.push(node.id)
            } else if (!chromaById.has(chromaId)) {
                coverage.legacyOrphan.push(node.id)
            } else if (node.id !== legacyRawMemoryGraphId(chromaId)) {
                coverage.legacyMalformed.push(node.id);

                conflicts.push({
                    kind      : 'legacy-identity-conflict',
                    nodeId    : node.id,
                    chromaId,
                    expectedId: legacyRawMemoryGraphId(chromaId)
                })
            }
        } else if (node.label === RAW_MEMORY_NODE_LABEL && !chromaById.has(node.id)) {
            if (node.properties?.archivedAt) {
                coverage.tombstone.push(node.id)
            } else {
                coverage.agentOrphan.push(node.id)
            }
        }
    }

    const edgeGroups = new Map();

    for (const edge of graphEdges || []) {
        const
            source = mappings.get(edge.source) || edge.source,
            target = mappings.get(edge.target) || edge.target,
            key    = `${source}\u0000${target}\u0000${edge.type}`;

        if (!edgeGroups.has(key)) {
            edgeGroups.set(key, {source, target, type: edge.type, edges: []})
        }
        edgeGroups.get(key).edges.push(edge)
    }

    const edgeActions = [];

    for (const group of edgeGroups.values()) {
        if (!group.edges.some(edge => mappings.has(edge.source) || mappings.has(edge.target))) {
            continue
        }

        const expectedUserIds = [];

        for (const edge of group.edges) {
            if (mappingUserIds.has(edge.source)) {
                expectedUserIds.push(mappingUserIds.get(edge.source))
            }
            if (mappingUserIds.has(edge.target)) {
                expectedUserIds.push(mappingUserIds.get(edge.target))
            }
        }

        const merged = mergeEdgeEvidence(group.edges, expectedUserIds);

        if (merged.conflicts.length > 0) {
            conflicts.push({
                kind  : 'edge-property-conflict',
                source: group.source,
                target: group.target,
                type  : group.type,
                fields: merged.conflicts
            });
            continue
        }

        const [keep, ...drop] = group.edges;

        edgeActions.push({
            keepId : keep.id,
            dropIds: drop.map(edge => edge.id),
            userId : merged.userId,
            data   : {
                id        : keep.id,
                source    : group.source,
                target    : group.target,
                type      : group.type,
                properties: merged.properties
            }
        })
    }

    Object.values(coverage).forEach(values => values.sort());

    return {coverage, nodeActions, edgeActions, conflicts}
}

/**
 * @summary Applies one conflict-free plan in a single SQLite transaction.
 * @param {Object} db better-sqlite3 connection.
 * @param {Object} plan Result from {@link planRawMemoryIdentityReconciliation}.
 * @returns {{nodesMerged: Number, edgesRewritten: Number, edgesDropped: Number}}
 */
export function applyRawMemoryIdentityReconciliation(db, plan) {
    if (plan.conflicts.length > 0) {
        throw new Error(`raw-memory reconciliation refused: ${plan.conflicts.length} unresolved conflict(s)`)
    }

    const
        upsertNode = db.prepare(`
            INSERT INTO Nodes (id, user_id, data)
            VALUES (?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET user_id=excluded.user_id, data=excluded.data
        `),
        updateEdge = db.prepare(`
            UPDATE Edges
            SET user_id = ?, source = ?, target = ?, type = ?, data = ?
            WHERE id = ?
        `),
        deleteEdge = db.prepare('DELETE FROM Edges WHERE id = ?'),
        deleteNode = db.prepare('DELETE FROM Nodes WHERE id = ?');

    const apply = db.transaction(() => {
        for (const action of plan.nodeActions) {
            upsertNode.run(action.canonicalId, action.userId, JSON.stringify(action.data))
        }

        for (const action of plan.edgeActions) {
            updateEdge.run(
                action.userId,
                action.data.source,
                action.data.target,
                action.data.type,
                JSON.stringify(action.data),
                action.keepId
            );
            action.dropIds.forEach(id => deleteEdge.run(id))
        }

        plan.nodeActions.forEach(action => deleteNode.run(action.legacyId))
    });

    apply();

    return {
        nodesMerged   : plan.nodeActions.length,
        edgesRewritten: plan.edgeActions.length,
        edgesDropped  : plan.edgeActions.reduce((count, action) => count + action.dropIds.length, 0)
    }
}

/**
 * @param {Object} coverage
 * @returns {Object}
 */
function coverageCounts(coverage) {
    return Object.fromEntries(Object.entries(coverage).map(([key, values]) => [key, values.length]))
}

/**
 * @returns {Promise<void>}
 */
async function main() {
    const options = parseArgs(process.argv.slice(2));

    if (options.help) {
        console.log('node ai/scripts/migrations/reconcileRawMemoryGraphIdentities.mjs [--db <path>] [--apply --offline]');
        return
    }

    assertApplyPosture(options);

    await import('../../../src/Neo.mjs');
    await import('../../../src/core/_export.mjs');

    const
        {default: aiConfig} = await import('../../mcp/server/memory-core/config.mjs'),
        {ChromaClient}      = await import('chromadb'),
        {
            createDynamicTextEmbeddingFunction,
            registerNeoChromaEmbeddingFunctions
        }                   = await import('../../services/shared/vector/chromaClientPrimitives.mjs'),
        Database            = (await import('better-sqlite3')).default,
        dbPath              = options.db || aiConfig.storagePaths.graph;

    registerNeoChromaEmbeddingFunctions();

    const chroma = aiConfig.engines.chroma;
    const client = new ChromaClient({
        host    : chroma.host,
        port    : chroma.port,
        ssl     : false,
        database: chroma.useTestDatabase ? chroma.databaseTest : chroma.database
    });
    const collection = await client.getCollection({
        name             : aiConfig.collections.memory,
        embeddingFunction: createDynamicTextEmbeddingFunction({
            providerResolver: () => aiConfig.embeddingProvider,
            service         : 'memory-core'
        })
    });
    const chromaRows = await scanChromaRows(collection);
    const db         = new Database(dbPath, {
        fileMustExist: true,
        readonly     : !options.apply
    });

    db.pragma('foreign_keys = ON');

    try {
        const
            snapshot = readGraphSnapshot(db, {chromaIds: chromaRows.map(row => row.id)}),
            plan     = planRawMemoryIdentityReconciliation({
                chromaRows,
                graphNodes: snapshot.nodes,
                graphEdges: snapshot.edges
            });

        console.log(JSON.stringify({
            mode    : options.apply ? 'APPLY' : 'DRY-RUN',
            dbPath,
            coverage: coverageCounts(plan.coverage),
            planned : {
                nodes: plan.nodeActions.length,
                edges: plan.edgeActions.length
            },
            conflicts: plan.conflicts
        }, null, 2));

        if (plan.conflicts.length > 0) {
            process.exitCode = 1;
            return
        }

        if (!options.apply) {
            console.log('DRY-RUN complete. No graph rows changed.');
            return
        }

        console.log(JSON.stringify(applyRawMemoryIdentityReconciliation(db, plan), null, 2));
        console.log('APPLY complete. Restart Memory Core processes to refresh in-memory graph caches.')
    } finally {
        db.close()
    }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
    main().catch(error => {
        console.error(`reconcileRawMemoryGraphIdentities failed: ${error.message}`);
        process.exitCode = 1
    })
}
