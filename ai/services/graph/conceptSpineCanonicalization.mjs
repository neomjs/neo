const SEMANTIC_ID_PREFIXES = /^(CONCEPT|CLASS|PROCESS):/i;

export const SEMANTIC_SPINE_NODE_TYPES = Object.freeze(['CONCEPT', 'CLASS', 'PROCESS']);
export const SEMANTIC_SPINE_NODE_TYPE_SET = new Set(SEMANTIC_SPINE_NODE_TYPES);

/**
 * @summary Canonical concept-spine id policy: semantic concept ids are bare lower-kebab keys.
 *
 * The policy intentionally strips legacy semantic prefixes (`CONCEPT:`, `CLASS:`, `PROCESS:`)
 * and normalizes case/punctuation before any new concept-spine edge is minted. Historical alias
 * nodes remain addressable through tombstone metadata; new writes converge on one id.
 *
 * @param {String} value Raw concept name, alias, or id.
 * @returns {String} Bare lower-kebab canonical concept id.
 */
export function normalizeConceptKey(value) {
    if (typeof value !== 'string') return '';

    return value
        .trim()
        .replace(SEMANTIC_ID_PREFIXES, '')
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/&/g, ' and ')
        .replace(/[^A-Za-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase();
}

/**
 * @summary Tests whether a node type participates in the concept spine.
 * @param {String} type Graph node label/type.
 * @returns {Boolean}
 */
export function isSemanticSpineNodeType(type) {
    return SEMANTIC_SPINE_NODE_TYPE_SET.has(String(type || '').toUpperCase());
}

/**
 * @summary Tests whether a graph id uses a legacy semantic concept prefix.
 * @param {String} id Graph node id.
 * @returns {Boolean}
 */
export function hasSemanticSpinePrefix(id) {
    return typeof id === 'string' && SEMANTIC_ID_PREFIXES.test(id);
}

/**
 * @summary Canonicalizes one semantic concept id to the bare lower-kebab convention.
 * @param {String} value Raw concept id, name, or alias.
 * @returns {String}
 */
export function canonicalizeConceptId(value) {
    return normalizeConceptKey(value);
}

/**
 * @summary Canonicalizes a graph node id when the node belongs to the semantic spine.
 * @param {Object} node Graph node-ish record.
 * @param {String} node.id Raw node id.
 * @param {String} [node.type] Raw node type/label.
 * @param {String} [node.name] Raw node name.
 * @returns {String}
 */
export function canonicalizeSemanticGraphNodeId({id, type, name} = {}) {
    if (!isSemanticSpineNodeType(type) && !hasSemanticSpinePrefix(id)) {
        return id;
    }

    return canonicalizeConceptId(id || name) || id;
}

/**
 * @summary Canonicalizes message/search tagged concepts while preserving caller order.
 * @param {String[]} values Raw concept tags.
 * @returns {String[]} Unique canonical concept ids.
 */
export function canonicalizeTaggedConceptIds(values = []) {
    const seen   = new Set();
    const result = [];

    for (const value of Array.isArray(values) ? values : []) {
        const canonical = canonicalizeConceptId(value);
        if (!canonical || seen.has(canonical)) continue;

        seen.add(canonical);
        result.push(canonical);
    }

    return result;
}

/**
 * @summary Returns all deterministic alias keys for one concept-spine node.
 * @param {Object} node Graph node-ish record.
 * @returns {String[]}
 */
export function getConceptAliasKeys(node = {}) {
    const properties = node.properties || {};
    const values     = [
        node.id,
        node.name || properties.name,
        ...(Array.isArray(node.aliases) ? node.aliases : []),
        ...(Array.isArray(properties.aliases) ? properties.aliases : [])
    ];

    return [...new Set(values.map(normalizeConceptKey).filter(Boolean))];
}

/**
 * @summary Selects the canonical id for an alias cluster.
 * @param {String[]} nodeIds Cluster node ids.
 * @param {Set<String>} [keySet] Alias keys found in the cluster.
 * @returns {String}
 */
export function chooseCanonicalConceptId(nodeIds = [], keySet = new Set()) {
    const bareExact = nodeIds.find(id => !String(id).includes(':') && keySet.has(id) && normalizeConceptKey(id) === id);
    if (bareExact) return bareExact;

    const sorted = [...nodeIds].sort((a, b) => {
        const aPrefix = String(a).includes(':') ? 1 : 0,
              bPrefix = String(b).includes(':') ? 1 : 0;

        return aPrefix - bPrefix || String(a).length - String(b).length || String(a).localeCompare(String(b));
    });

    return normalizeConceptKey(sorted[0] || '');
}

/**
 * @summary Builds a deterministic merge plan for concept-spine alias clusters.
 * @param {Object} options
 * @param {Object[]} options.nodes Graph node records.
 * @param {Object[]} options.edges Graph edge records.
 * @param {String} [options.generatedAt] ISO timestamp for tombstone metadata.
 * @returns {Object}
 */
export function buildConceptSpineMergePlan({nodes = [], edges = [], generatedAt = new Date().toISOString()} = {}) {
    const
        semanticNodes = nodes.filter(isSemanticSpineNode),
        uf            = new UnionFind(),
        nodeKeys      = new Map(),
        keyNodes      = new Map();

    for (const node of semanticNodes) {
        const keys = getConceptAliasKeys(node);
        if (keys.length === 0) continue;

        nodeKeys.set(node.id, keys);
        for (const key of keys) {
            uf.add(key);
            if (!keyNodes.has(key)) keyNodes.set(key, new Set());
            keyNodes.get(key).add(node.id);
        }
        for (const key of keys.slice(1)) {
            uf.union(keys[0], key);
        }
    }

    const groups = new Map();
    for (const [key, nodeIds] of keyNodes) {
        const root = uf.find(key);
        if (!groups.has(root)) {
            groups.set(root, {keys: new Set(), nodeIds: new Set()});
        }
        const group = groups.get(root);
        group.keys.add(key);
        for (const nodeId of nodeIds) {
            group.nodeIds.add(nodeId);
        }
    }

    const clusters = [...groups.values()]
        .map(group => buildMergeCluster(group, nodeKeys, edges, generatedAt))
        .filter(cluster => cluster.aliases.length > 0)
        .sort((a, b) => b.nodeIds.length - a.nodeIds.length || a.canonicalId.localeCompare(b.canonicalId));

    return {
        generatedAt,
        policy  : 'bare lower-kebab canonical id; aliases tombstoned with aliasOf pointer; edge collisions keep MAX weight',
        clusters
    };
}

/**
 * @summary Applies a merge plan to plain graph records for hermetic verification and script seams.
 * @param {Object} options
 * @param {Object[]} options.nodes Graph node records.
 * @param {Object[]} options.edges Graph edge records.
 * @param {Object} options.plan Plan from `buildConceptSpineMergePlan`.
 * @returns {{nodes: Object[], edges: Object[], applied: Object}}
 */
export function applyConceptSpineMergePlan({nodes = [], edges = [], plan} = {}) {
    const
        nodeMap = new Map(nodes.map(node => [node.id, cloneRecord(node)])),
        edgeMap = new Map(edges.map(edge => [edge.id, cloneRecord(edge)])),
        applied = {clusters: 0, tombstonedAliases: 0, rewiredEdges: 0, removedDuplicateEdges: 0};

    for (const cluster of plan?.clusters || []) {
        applied.clusters++;

        const canonicalNode = nodeMap.get(cluster.canonicalId) || cloneRecord(nodeMap.get(cluster.nodeIds[0]) || {
            id        : cluster.canonicalId,
            type      : 'CONCEPT',
            properties: {}
        });

        canonicalNode.id         = cluster.canonicalId;
        canonicalNode.properties = {
            ...(canonicalNode.properties || {}),
            canonicalConceptId: cluster.canonicalId,
            conceptAliases    : cluster.aliases
        };
        nodeMap.set(cluster.canonicalId, canonicalNode);

        for (const alias of cluster.aliases) {
            const aliasNode = nodeMap.get(alias);
            if (!aliasNode) continue;

            aliasNode.properties = {
                ...(aliasNode.properties || {}),
                aliasOf                 : cluster.canonicalId,
                canonicalConceptId      : cluster.canonicalId,
                conceptSpineTombstonedAt: cluster.generatedAt,
                conceptSpineTombstoneBy : 'concept-spine-alias-merge'
            };
            applied.tombstonedAliases++;
        }

        for (const rewrite of cluster.edgeRewrites) {
            const primary = edgeMap.get(rewrite.primaryEdgeId);
            if (!primary) continue;

            primary.source     = rewrite.source;
            primary.target     = rewrite.target;
            primary.type       = rewrite.type;
            primary.properties = {
                ...(primary.properties || {}),
                weight                    : rewrite.weight,
                conceptSpineMergedEdgeIds : rewrite.edgeIds.filter(id => id !== rewrite.primaryEdgeId),
                conceptSpineMergedAt      : cluster.generatedAt,
                conceptSpineMergeCollision: rewrite.edgeIds.length > 1
            };
            applied.rewiredEdges++;

            for (const duplicateId of rewrite.edgeIds.filter(id => id !== rewrite.primaryEdgeId)) {
                if (edgeMap.delete(duplicateId)) {
                    applied.removedDuplicateEdges++;
                }
            }
        }
    }

    return {
        nodes: [...nodeMap.values()],
        edges: [...edgeMap.values()],
        applied
    };
}

/**
 * @summary Executes a concept-spine merge plan against a mounted GraphService instance.
 *
 * This executor intentionally updates selected primary edges directly instead of routing
 * through `GraphService.linkNodes()`: the normal link path reinforces existing edge scent,
 * while alias collision repair must preserve edge-decay semantics by keeping MAX weight.
 *
 * @param {Object} options
 * @param {Object} options.graphService Mounted GraphService-like instance.
 * @param {Object} options.plan Plan from `buildConceptSpineMergePlan`.
 * @returns {Object} Applied mutation counts.
 */
export function executeConceptSpineMergePlan({graphService, plan} = {}) {
    const db = graphService?.db;
    if (!db) {
        throw new Error('executeConceptSpineMergePlan requires graphService.db');
    }

    const applied = {clusters: 0, tombstonedAliases: 0, rewiredEdges: 0, removedDuplicateEdges: 0};

    runGraphTransaction(db, () => {
        for (const cluster of plan?.clusters || []) {
            applied.clusters++;

            upsertCanonicalConceptNode({graphService, db, cluster});

            for (const alias of cluster.aliases) {
                if (tombstoneAliasNode({graphService, db, cluster, alias})) {
                    applied.tombstonedAliases++;
                }
            }

            for (const rewrite of cluster.edgeRewrites) {
                const primary = getEdgeRecord(db, rewrite.primaryEdgeId);
                if (!primary) continue;

                setRecordField(primary, 'source', rewrite.source);
                setRecordField(primary, 'target', rewrite.target);
                setRecordField(primary, 'type', rewrite.type);
                setRecordProperties(primary, {
                    ...getRecordProperties(primary),
                    weight                    : rewrite.weight,
                    conceptSpineMergedEdgeIds : rewrite.edgeIds.filter(id => id !== rewrite.primaryEdgeId),
                    conceptSpineMergedAt      : cluster.generatedAt,
                    conceptSpineMergeCollision: rewrite.edgeIds.length > 1
                });
                persistEdges(db, [primary]);
                applied.rewiredEdges++;

                for (const duplicateId of rewrite.edgeIds.filter(id => id !== rewrite.primaryEdgeId)) {
                    if (removeEdgeRecord(db, duplicateId)) {
                        applied.removedDuplicateEdges++;
                    }
                }
            }
        }
    });

    acknowledgeGraphMutations(db);
    return applied;
}

function isSemanticSpineNode(node) {
    return isSemanticSpineNodeType(node.type || node.label) || hasSemanticSpinePrefix(node.id);
}

function buildMergeCluster(group, nodeKeys, edges, generatedAt) {
    const
        nodeIds      = [...group.nodeIds].sort(),
        keys         = [...group.keys].sort(),
        keySet       = new Set(keys),
        canonicalId  = chooseCanonicalConceptId(nodeIds, keySet),
        aliases      = nodeIds.filter(id => id !== canonicalId),
        edgeRewrites = buildEdgeRewrites({nodeIds, canonicalId, edges});

    return {
        canonicalId,
        generatedAt,
        nodeIds,
        aliases,
        keys,
        nodeKeys: Object.fromEntries(nodeIds.map(id => [id, nodeKeys.get(id) || []])),
        edgeRewrites
    };
}

function buildEdgeRewrites({nodeIds, canonicalId, edges}) {
    const
        clusterIds = new Set(nodeIds),
        grouped    = new Map();

    for (const edge of edges) {
        const sourceIn = clusterIds.has(edge.source),
              targetIn = clusterIds.has(edge.target);

        if (!sourceIn && !targetIn) continue;

        const
            source = sourceIn ? canonicalId : edge.source,
            target = targetIn ? canonicalId : edge.target;

        if (source === target) continue;

        const signature = `${source}\u0000${target}\u0000${edge.type}`;
        if (!grouped.has(signature)) {
            grouped.set(signature, {
                source,
                target,
                type         : edge.type,
                weight       : 0,
                edgeIds      : [],
                primaryEdgeId: null
            });
        }

        const group = grouped.get(signature);
        group.weight = Math.max(group.weight, getEdgeWeight(edge));
        group.edgeIds.push(edge.id);
        if (!group.primaryEdgeId || (edge.source === source && edge.target === target)) {
            group.primaryEdgeId = edge.id;
        }
    }

    return [...grouped.values()].sort((a, b) => a.primaryEdgeId.localeCompare(b.primaryEdgeId));
}

function getEdgeWeight(edge) {
    const weight = Number(edge?.properties?.weight ?? edge?.weight ?? 1);
    return Number.isFinite(weight) ? weight : 1;
}

function cloneRecord(record = {}) {
    return {
        ...record,
        properties: {...(record.properties || {})}
    };
}

function upsertCanonicalConceptNode({graphService, db, cluster}) {
    const sourceNode     = getNodeRecord(db, cluster.canonicalId) || getNodeRecord(db, cluster.nodeIds[0]),
          sourceProps    = getRecordProperties(sourceNode),
          canonicalProps = {
              ...sourceProps,
              canonicalConceptId: cluster.canonicalId,
              conceptAliases    : cluster.aliases
          };

    graphService.upsertNode({
        id         : cluster.canonicalId,
        type       : getRecordField(sourceNode, 'label') || getRecordField(sourceNode, 'type') || 'CONCEPT',
        name       : sourceProps.name || cluster.canonicalId,
        description: sourceProps.description,
        properties : canonicalProps
    });
}

function tombstoneAliasNode({graphService, db, cluster, alias}) {
    const aliasNode = getNodeRecord(db, alias);
    if (!aliasNode) return false;

    const aliasProps = getRecordProperties(aliasNode);
    graphService.upsertNode({
        id         : alias,
        type       : getRecordField(aliasNode, 'label') || getRecordField(aliasNode, 'type') || 'CONCEPT',
        name       : aliasProps.name || alias,
        description: aliasProps.description,
        properties : {
            ...aliasProps,
            aliasOf                 : cluster.canonicalId,
            canonicalConceptId      : cluster.canonicalId,
            conceptSpineTombstonedAt: cluster.generatedAt,
            conceptSpineTombstoneBy : 'concept-spine-alias-merge'
        }
    });

    return true;
}

function runGraphTransaction(db, fn) {
    if (db.isExecutingTransaction || typeof db.transaction !== 'function') {
        return fn();
    }

    return db.transaction(fn);
}

function getNodeRecord(db, id) {
    return db?.nodes?.get?.(id) || null;
}

function getEdgeRecord(db, id) {
    return db?.edges?.get?.(id) || db?.edges?.items?.find(edge => edge.id === id) || null;
}

function removeEdgeRecord(db, id) {
    const existing = getEdgeRecord(db, id);
    if (!existing) return false;

    db.removeEdge(id);
    return true;
}

function persistEdges(db, edges) {
    if (db?.autoSave !== false && db?.storage?.addEdges) {
        db.storage.addEdges(edges);
    }
}

function acknowledgeGraphMutations(db) {
    if (typeof db?.acknowledgeLocalMutations === 'function') {
        db.acknowledgeLocalMutations();
    }
}

function getRecordField(record, field) {
    if (!record) return undefined;
    return record.isRecord ? record.get(field) : record[field];
}

function setRecordField(record, field, value) {
    if (record.isRecord) {
        record.set(field, value);
    } else {
        record[field] = value;
    }
}

function getRecordProperties(record) {
    return {...(getRecordField(record, 'properties') || {})};
}

function setRecordProperties(record, properties) {
    setRecordField(record, 'properties', properties);
}

class UnionFind {
    parent = new Map()

    add(value) {
        if (!this.parent.has(value)) {
            this.parent.set(value, value);
        }
    }

    find(value) {
        this.add(value);

        const parent = this.parent.get(value);
        if (parent === value) return value;

        const root = this.find(parent);
        this.parent.set(value, root);
        return root;
    }

    union(a, b) {
        const rootA = this.find(a),
              rootB = this.find(b);

        if (rootA !== rootB) {
            this.parent.set(rootB, rootA);
        }
    }
}
