/**
 * @module Neo.ai.graph.queries.Traversal
 * 
 * @anchor Functional Traversal Queries
 * @description
 * Graph traversals in the Native Edge database are architected as pure functions rather than Neo classes.
 * This directly prevents RAM locking and constructor overhead for queries that might execute thousands 
 * of times concurrently. 
 * 
 * @echo 
 * By maintaining strict stateless logic and passing the `database` reference per invocation,
 * V8 can heavily optimize and inline these loops natively.
 */

/**
 * Executes a deep-first or breadth-first walk spanning topological bounds resolving nodes based on dynamic rules.
 * 
 * @param {Neo.ai.graph.Database} database The graph database instance to query against.
 * @param {String} startNodeId The root injection point algorithm starts expanding from.
 * @param {Object} config
 * @param {Number} [config.maxDepth=3] Physical boundary stop limit evaluating how deep to recurse securely.
 * @param {String} [config.direction='outbound'] Propagation mapping matrix ('outbound', 'inbound', 'both').
 * @param {Function} [config.matchPredicate] (node, depth) => boolean. Identifies payload targets.
 * @param {Function} [config.stopPredicate] (node, depth) => boolean. Aborts specific sub-trees structurally skipping processing internally.
 * @returns {Object[]} Sequential array of matched layout topological targets securely extracted.
 */
export const getPaths = (database, startNodeId, config = {}) => {
    let maxDepth  = config.maxDepth  || 3,
        direction = config.direction || 'outbound',
        matches   = [],
        visited   = new Set(),
        queue     = [{ id: startNodeId, depth: 0 }];

    if (!database) {
        throw new Error('Traversal query engine requires a valid Database reference.');
    }

    while (queue.length > 0) {
        let { id, depth } = queue.shift();

        if (visited.has(id)) {
            continue;
        }

        visited.add(id);

        let node = database.nodes.get(id);
        if (!node) continue;

        if (config.matchPredicate && config.matchPredicate(node, depth)) {
            matches.push(node);
        } else if (!config.matchPredicate) {
            matches.push(node);
        }

        if (depth >= maxDepth) {
            continue;
        }

        if (config.stopPredicate && config.stopPredicate(node, depth)) {
            continue;
        }

        let adjacentEdges = [];
        if (direction === 'outbound' || direction === 'both') {
            adjacentEdges = adjacentEdges.concat(database.edges.getByIndex('source', id));
        }
        if (direction === 'inbound' || direction === 'both') {
            let inboundEdges = database.edges.getByIndex('target', id);
            if (direction === 'both') {
                inboundEdges.forEach(e => {
                    if (e.source !== id) adjacentEdges.push(e);
                });
            } else {
                adjacentEdges = adjacentEdges.concat(inboundEdges);
            }
        }

        for (let i = 0, len = adjacentEdges.length; i < len; i++) {
            let edge = adjacentEdges[i];
            let nextNodeId = (edge.source === id) ? edge.target : edge.source;
            queue.push({ id: nextNodeId, depth: depth + 1 });
        }
    }

    return matches;
};

/**
 * Utilizes Dijkstra's algorithm to resolve the absolute shortest structural span.
 * Evaluates custom edge weights natively avoiding exhaustive N-hop checks manually.
 * 
 * @param {Neo.ai.graph.Database} database The graph database instance holding structural bounds.
 * @param {String} startNodeId Origin execution block.
 * @param {String} targetNodeId Destination block we are hunting.
 * @param {Object} config
 * @param {Function} [config.weightFunction] (edge) => Number. Extracts dynamic weights ensuring flexible topological costs.
 * @returns {Object[]} The chronological array of nodes comprising the shortest pathway, or empty if disconnected.
 */
export const findShortestPath = (database, startNodeId, targetNodeId, config = {}) => {
    if (!database) {
        throw new Error('findShortestPath requires a valid Database reference.');
    }

    let weightFn  = config.weightFunction || (() => 1),
        direction = config.direction || 'outbound',
        distances = new Map(),
        previous  = new Map(),
        unvisited = new Set(),
        nodesMap  = database.nodes;

    // Initialize bounds
    for (let node of nodesMap.items) {
        distances.set(node.id, Infinity);
        unvisited.add(node.id);
    }
    
    if (!distances.has(startNodeId)) return [];
    
    distances.set(startNodeId, 0);

    while (unvisited.size > 0) {
        // Find minimum distance node dynamically
        let currentId = null;
        let minDistance = Infinity;

        // V8 Optimized mapping loop isolating closest topological node natively without heavy array allocations
        for (let id of unvisited) {
            let dist = distances.get(id);
            if (dist < minDistance) {
                minDistance = dist;
                currentId = id;
            }
        }

        if (currentId === null || currentId === targetNodeId) {
            break; // Absolute termination vector reached or unreachable matrix found
        }

        unvisited.delete(currentId);

        let adjacentEdges = [];
        if (direction === 'outbound' || direction === 'both') {
            adjacentEdges = adjacentEdges.concat(database.edges.getByIndex('source', currentId));
        }
        if (direction === 'inbound' || direction === 'both') {
            let inboundEdges = database.edges.getByIndex('target', currentId);
            if (direction === 'both') {
                inboundEdges.forEach(e => {
                    if (e.source !== currentId) adjacentEdges.push(e);
                });
            } else {
                adjacentEdges = adjacentEdges.concat(inboundEdges);
            }
        }

        for (let i = 0, len = adjacentEdges.length; i < len; i++) {
            let edge = adjacentEdges[i];
            let neighborId = (edge.source === currentId) ? edge.target : edge.source;

            if (!unvisited.has(neighborId)) continue;
            
            let weight = weightFn(edge);
            let totalDist = distances.get(currentId) + weight;

            if (totalDist < distances.get(neighborId)) {
                distances.set(neighborId, totalDist);
                previous.set(neighborId, currentId);
            }
        }
    }

    // Resolve chronological structural path recursively backwards
    let path = [];
    let currentTraceId = targetNodeId;

    if (previous.has(currentTraceId) || currentTraceId === startNodeId) {
        while (currentTraceId !== undefined) {
            path.unshift(nodesMap.get(currentTraceId));
            currentTraceId = previous.get(currentTraceId);
        }
    }

    return path;
};
