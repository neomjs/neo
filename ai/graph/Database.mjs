import Base                     from '../../src/core/Base.mjs';
import ClassSystemUtil          from '../../src/util/ClassSystem.mjs';
import Store                    from './Store.mjs';
import EdgeModel                from './EdgeModel.mjs';
import NodeModel                from './NodeModel.mjs';
import RequestScopedVicinitySet from './RequestScopedVicinitySet.mjs';
import StorageBase              from './storage/Base.mjs';

/**
 * The Database class serves as the core coordinator for the Native Edge Graph Database engine.
 * Operating in headless MCP server environments (Sandman, memory-core), it orchestrates local
 * Native Node embeddings tracking alongside Semantic vectors natively inside ChromaDB (GraphRAG).
 * When backed by SQLite storage, persisted edges must reference existing node IDs for both
 * `source` and `target`; the storage schema enforces this with foreign keys on `Edges`.
 *
 * Implements strict Multi-Worker Cache Coherence via SQLite Hardware Triggers & Delta Logs, combined
 * with completely Synchronous Lazy Loading architectures and automated LRU Garbage Collection
 * to guarantee V8 execution limits seamlessly evaluating massive Application ASTs natively.
 *
 * It leverages Neo.data.Store for high-speed local vicinity edge traversals smoothly safely!
 * @class Neo.ai.graph.Database
 * @extends Neo.core.Base
 */
class Database extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.graph.Database'
         * @protected
         */
        className: 'Neo.ai.graph.Database',
        /**
         * @member {Boolean} autoSave=true
         */
        autoSave: true,
        /**
         * System flag ensuring perfect isolated V8 single threading loops dynamically.
         * @member {Boolean} isExecutingTransaction=false
         * @protected
         */
        isExecutingTransaction: false,
        /**
         * Tracking vector isolating PRAGMA local constraints resolving Worker Coherence seamlessly.
         * @member {Number} lastSyncId=0
         * @protected
         */
        lastSyncId: 0,
        /**
         * System cache constraints restricting V8 Memory map thresholds natively ensuring GC loops function effectively cleanly.
         * Set to null to disable garbage collection, which is required for massive global GraphRAG traversals (Public/Private Contexts).
         * @member {Number|null} maxGraphNodes=null
         */
        maxGraphNodes: null,
        /**
         * @member {Object|Neo.data.Store|null} edges_=null
         * @reactive
         */
        edges_: null,
        /**
         * @member {Object|Neo.data.Store|null} nodes_=null
         * @reactive
         */
        nodes_: null,
        /**
         * Database persistence wrapper.
         * @member {Object|Neo.ai.graph.storage.Base|null} storage_=null
         * @reactive
         */
        storage_: null,
        /**
         * Requester-scoped lazy-vicinity marker set.
         * @member {Neo.ai.graph.RequestScopedVicinitySet|null} vicinityLoadedNodes_=null
         * @reactive
         */
        vicinityLoadedNodes_: null
    }

    lastAccessMap = new Map();

    /**
     * @summary Resolves the same canonical requester key used by SQLite's RLS-filtered
     * `loadNodeVicinitySync()` query. Null is a real scope: unbound/system callers share the
     * same public/team/shared projection, while each authenticated tenant gets its own marker.
     * @returns {String|null} Canonical requester scope for lazy-vicinity caching.
     * @protected
     */
    getVicinityCacheScope() {
        const
            storage   = this.storage,
            rcs       = storage?.RequestContextService,
            rawUserId = rcs ? (rcs.getUserId?.() ?? rcs.getAgentIdentityNodeId?.()) : null;

        return rawUserId == null
            ? null
            : (storage.normalizeUserId ? storage.normalizeUserId(rawUserId) : rawUserId)
    }

    /**
     * Destroys the requester-scoped marker before the Database releases its own state.
     */
    destroy() {
        this.vicinityLoadedNodes?.destroy();

        super.destroy()
    }

    /**
     * Executes strict cache synchronization polling Native SQLite triggers for identical cross-worker coherence cleanly natively.
     * Evaluates hardware SQLite `GraphLog` boundaries securely identifying structural mutations dynamically created by concurrent Nodes/AppWorkers.
     * Splices identified cache diffs executing perfectly accurately guaranteeing perfect isolated thread execution topologies.
     *
     * Cache-coherence invariants (ADR 0001; ticket-ref-ok: file-owned decision record):
     * 1. A fresh boot (`lastSyncId === 0`) is a legitimate "catch me up" trigger, not a short-circuit skip.
     * 2. This method INVALIDATES stale cache entries; it does not upsert new ones (lazy-load handles that).
     *
     * @see Neo.ai.graph.storage.SQLite#getDeltaLog
     */
    syncCache() {
        if (!this.storage) {
            return;
        }

        // Fresh boot (`lastSyncId === 0`) is a legitimate "catch me up" signal, not a
        // short-circuit; replay the delta log so cold caches observe prior writes.
        let delta = this.storage.getDeltaLog(this.lastSyncId);
        this.lastSyncId = delta.lastLogId;

        if (delta.invalidNodes.length > 0) {
            let wasTransacting = this.isExecutingTransaction;
            let wasAutoSave    = this.autoSave;
            this.isExecutingTransaction = false;
            this.autoSave               = false;

            this.nodes.remove(delta.invalidNodes);
            delta.invalidNodes.forEach(id => {
                this.vicinityLoadedNodes.delete(id);
                this.lastAccessMap.delete(id);
            });

            this.autoSave               = wasAutoSave;
            this.isExecutingTransaction = wasTransacting;
        }

        if (delta.invalidEdges.length > 0) {
            let wasTransacting = this.isExecutingTransaction;
            let wasAutoSave    = this.autoSave;
            this.isExecutingTransaction = false;
            this.autoSave               = false;

            let edgeIdsToRemove = [],
                indexedEdgeRefs = new Set();
            delta.invalidEdges.forEach(edgeRef => {
                let edgeId = typeof edgeRef === 'string' ? edgeRef : edgeRef.id;
                let edge   = this.edges.get(edgeId);

                let source = edge ? edge.source : (edgeRef.source || null);
                let target = edge ? edge.target : (edgeRef.target || null);

                if (source) this.vicinityLoadedNodes.delete(source);
                if (target) this.vicinityLoadedNodes.delete(target);

                edgeIdsToRemove.push(edgeId);
                if (edge) indexedEdgeRefs.add(edge);

                // The Store map owns only one object per id, but a prior refresh can leave an older
                // same-id object reachable exclusively from an index Set. Collect every indexed copy.
                for (const [property, value] of [['source', source], ['target', target]]) {
                    if (!value) continue;

                    this.edges.getByIndex(property, value)
                        .filter(indexedEdge => indexedEdge.id === edgeId)
                        .forEach(indexedEdge => indexedEdgeRefs.add(indexedEdge))
                }
            });

            this.edges.remove(edgeIdsToRemove);
            // Drop the exact references observed before removal as well. A refreshed Store map can
            // point at a newer object while a secondary index still retains the prior object; without
            // this cleanup the subsequent lazy reload double-counts the same persisted edge.
            this.edges.updateIndexMaps?.(null, [...indexedEdgeRefs]);

            this.autoSave               = wasAutoSave;
            this.isExecutingTransaction = wasTransacting;
        }
    }

    /**
     * Skips executing destructive cache invalidation algorithms for mutations strictly generated natively by this Node.js process safely avoiding destructive loops cleanly.
     */
    acknowledgeLocalMutations() {
        if (this.storage && typeof this.storage.getLatestLogId === 'function') {
            this.lastSyncId = this.storage.getLatestLogId();
        }
    }

    /**
     * Purges Least-Recently-Used vectors protecting V8 Memory Limits synchronously natively gracefully erasing footprint internally.
     * Implements strict structural LRU checks mapping `lastAccessMap` metadata to guarantee total V8 Virtual Memory isolation boundaries smoothly.
     * Bypassed implicitly if `maxGraphNodes` evaluates identically strictly to `null`.
     * @see Neo.ai.graph.Database#lastAccessMap
     */
    runGarbageCollector() {
        let me = this;
        if (me.maxGraphNodes !== null && me.lastAccessMap.size > me.maxGraphNodes) {
            let nodesArray = Array.from(me.lastAccessMap.entries());
            nodesArray.sort((a, b) => a[1] - b[1]); // Oldest timestamps first

            let deleteCount = Math.max(1, Math.floor(me.maxGraphNodes * 0.2)); // Execute 20% chunk truncation cleanly locally guaranteeing at least 1 dropped
            let toDelete    = nodesArray.slice(0, deleteCount).map(entry => entry[0]);

            let wasTransacting = me.isExecutingTransaction;
            let wasAutoSave    = me.autoSave;
            me.isExecutingTransaction = false;
            me.autoSave               = false;

            me.nodes.remove(toDelete);
            toDelete.forEach(id => {
                me.vicinityLoadedNodes.delete(id);
                me.lastAccessMap.delete(id);
            });

            // Note: Cascade deletions for attached unmapped edges isn't strictly required instantly unless Edges Map exceeds threshold natively safely.
            me.autoSave               = wasAutoSave;
            me.isExecutingTransaction = wasTransacting;
        }
    }

    /**
     * Injects a relationship edge into the Native Edge Graph Database topology.
     * @param {Object} edge
     * @throws {SqliteError} When SQLite storage is attached and `edge.source` or `edge.target`
     * is not already present as a node ID. The storage schema enforces
     * `FOREIGN KEY(source|target) REFERENCES Nodes(id)`, so callers must create endpoint
     * nodes before inserting persisted edges.
     */
    addEdge(edge) {
        edge.id ??= globalThis.crypto.randomUUID();
        this.edges.add(edge);
    }

    /**
     * Injects an entity node into the Native Edge Graph Database topology.
     * @param {Object} node
     */
    addNode(node) {
        node.id ??= globalThis.crypto.randomUUID();
        this.nodes.add(node);
    }

    /**
     * Triggered after the storage config gets changed.
     * @param {Neo.ai.graph.storage.Base} value
     * @param {Neo.ai.graph.storage.Base} oldValue
     * @protected
     */
    afterSetStorage(value, oldValue) {
        if (value) {
            value.load();
        }
    }

    /**
     * Triggered before the edges config gets changed.
     * @param {Object|Neo.data.Store} value
     * @param {Object|Neo.data.Store} oldValue
     * @returns {Neo.data.Store}
     * @protected
     */
    beforeSetEdges(value, oldValue) {
        oldValue?.destroy();
        let store = ClassSystemUtil.beforeSetInstance(value, Store, {
            autoInitRecords: false,
            database       : this,
            indices        : [{property: 'source'}, {property: 'target'}],
            model          : EdgeModel
        });

        store?.on('mutate', this.onEdgesMutate, this);

        return store;
    }

    /**
     * Triggered before the nodes config gets changed.
     * @param {Object|Neo.data.Store} value
     * @param {Object|Neo.data.Store} oldValue
     * @returns {Neo.data.Store}
     * @protected
     */
    beforeSetNodes(value, oldValue) {
        oldValue?.destroy();
        let store = ClassSystemUtil.beforeSetInstance(value, Store, {
            autoInitRecords: false,
            database       : this,
            model          : NodeModel
        });

        store?.on('mutate', this.onNodesMutate, this);

        return store;
    }

    /**
     * Creates the requester-scoped vicinity marker through the Neo class lifecycle.
     * @param {Object|Neo.ai.graph.RequestScopedVicinitySet|null} value
     * @param {Neo.ai.graph.RequestScopedVicinitySet|null} oldValue
     * @returns {Neo.ai.graph.RequestScopedVicinitySet}
     * @protected
     */
    beforeSetVicinityLoadedNodes(value, oldValue) {
        oldValue?.destroy();

        return ClassSystemUtil.beforeSetInstance(value, RequestScopedVicinitySet, {
            scopeResolver: () => this.getVicinityCacheScope()
        })
    }

    /**
     * Triggered before the storage config gets changed.
     * @param {Object|Neo.ai.graph.storage.Base} value
     * @param {Object|Neo.ai.graph.storage.Base} oldValue
     * @returns {Neo.ai.graph.storage.Base}
     * @protected
     */
    beforeSetStorage(value, oldValue) {
        if (value) {
            value = ClassSystemUtil.beforeSetInstance(value, StorageBase, {
                database: this
            });

            value.database = this;
        }
        return value;
    }

    /**
     * Extracts adjacent nodes based on semantic relationship topologies for GraphRAG evaluation smoothly dynamically loading Cache Misses synchronously!
     * Ensures strict Multi-Worker Coherence identically verifying Delta bounds, and lazily injecting requested Vicinity networks securely executing isolated.
     * @see Neo.ai.graph.Database#syncCache
     * @see Neo.ai.graph.storage.SQLite#loadNodeVicinitySync
     * @param {String} nodeId
     * @param {String} direction 'outbound' | 'inbound' | 'both'
     * @param {String} [type=null] Filter by edge type
     * @returns {Object[]} Array of adjacent nodes
     */
    getAdjacentNodes(nodeId, direction = 'outbound', type = null) {
        let me    = this,
            edges = [],
            nodes = [],
            i     = 0,
            len, edge, adjacentNode;

        // 1. Maintain Distributed Worker Cache Coherence automatically securely locally
        me.syncCache();

        // 2. Resolve Lazy Loading Vicinity Cache Misses seamlessly blocking via synchronous boundaries efficiently
        if (me.storage && !me.vicinityLoadedNodes.has(nodeId)) {
            let vicinity = me.storage.loadNodeVicinitySync(nodeId);

            let wasTransacting = me.isExecutingTransaction;
            let wasAutoSave    = me.autoSave;
            me.isExecutingTransaction = false;
            me.autoSave               = false;

            if (vicinity.nodes.length > 0) {
                me.nodes.add(vicinity.nodes);
            }
            if (vicinity.edges.length > 0) {
                me.edges.add(vicinity.edges);
            }

            me.autoSave               = wasAutoSave;
            me.isExecutingTransaction = wasTransacting;

            // Empty vicinity must not mark loaded; otherwise future adjacency updates would be
            // cached out silently for this node.
            if (vicinity.nodes.length > 0 || vicinity.edges.length > 0) {
                me.vicinityLoadedNodes.add(nodeId);
            }
        }

        // 3. Increment LRU Matrix bounds tracking footprint usage cleanly natively
        me.lastAccessMap.set(nodeId, Date.now());
        if (me.maxGraphNodes !== null && me.lastAccessMap.size > me.maxGraphNodes) {
            me.runGarbageCollector();
        }

        if (direction === 'outbound' || direction === 'both') {
            edges = me.edges.getByIndex('source', nodeId).slice();
        }

        if (direction === 'inbound' || direction === 'both') {
            let inboundEdges = me.edges.getByIndex('target', nodeId);

            if (direction === 'both') {
                inboundEdges.forEach(e => {
                    if (e.source !== nodeId) {
                        edges.push(e);
                    }
                });
            } else {
                edges = inboundEdges.slice();
            }
        }

        len = edges.length;

        for (; i < len; i++) {
            edge = edges[i];

            if (type && edge.type !== type) {
                continue;
            }

            adjacentNode = me.nodes.get(edge.source === nodeId ? edge.target : edge.source);

            if (adjacentNode) {
                nodes.push(adjacentNode);
            }
        }

        return nodes;
    }

    /**
     * Triggered on edges Store mutations to sync storage
     * @param {Object} mutation
     */
    onEdgesMutate(mutation) {
        if (this.isExecutingTransaction) {
            this.transactionDiff.push({type: 'edges', mutation});
            return;
        }
        if (this.autoSave && this.storage) {
            if (mutation.addedItems?.length > 0) {
                this.storage.addEdges(mutation.addedItems);
            }
            if (mutation.removedItems?.length > 0) {
                this.storage.removeEdges(mutation.removedItems);
            }
            this.acknowledgeLocalMutations();
        }
    }

    /**
     * Triggered on nodes Store mutations to sync storage
     * @param {Object} mutation
     */
    onNodesMutate(mutation) {

        if (this.isExecutingTransaction) {
            this.transactionDiff.push({type: 'nodes', mutation});
            return;
        }
        if (this.autoSave && this.storage) {
            if (mutation.addedItems?.length > 0) {
                this.storage.addNodes(mutation.addedItems);
            }
            if (mutation.removedItems?.length > 0) {
                this.storage.removeNodes(mutation.removedItems);
            }
            this.acknowledgeLocalMutations();
        }
    }

    /**
     * Removes an edge from the Native Edge Graph Database topology.
     * @param {String} edgeId
     */
    removeEdge(edgeId) {
        this.edges.remove(edgeId);
    }

    /**
     * Removes a node and elegantly cascades relationship topological deletions cleanly tracking LRU truncations accurately locally.
     * @param {String} nodeId
     */
    removeNode(nodeId) {
        if (typeof nodeId !== 'string' || nodeId.length === 0) {
            throw new Error(`Graph Database removeNode requires a non-empty string node id. Received: ${String(nodeId)}`);
        }

        let me            = this,
            outbound      = me.edges.getByIndex('source', nodeId),
            inbound       = me.edges.getByIndex('target', nodeId),
            edgesToRemove = outbound.slice();

        me.nodes.remove(nodeId);
        me.vicinityLoadedNodes.delete(nodeId);
        me.lastAccessMap.delete(nodeId);

        // Cascade delete attached edges
        inbound.forEach(e => {
            if (e.source !== nodeId) {
                edgesToRemove.push(e);
            }
        });

        if (edgesToRemove.length > 0) {
            me.edges.remove(edgesToRemove);
        }
    }

    /**
     * Removes a node only when the persistence layer can prove, in the same atomic
     * write statement, that no incident edge exists and an optional source marker
     * still matches. Cache removal follows the successful physical mutation with
     * persistence disabled, preserving one coherent local view without issuing a
     * second DELETE.
     * @param {String} nodeId
     * @param {Object} [options]
     * @param {String|null} [options.requiredPropertyPath=null] Rooted dotted object path with identifier-only segments.
     * @param {String|Number|Boolean|null} [options.requiredPropertyValue]
     * @returns {Boolean} `true` only when the node was removed.
     */
    removeNodeIfUnreferenced(nodeId, options={}) {
        if (typeof nodeId !== 'string' || nodeId.length === 0) {
            throw new Error(`Graph Database removeNodeIfUnreferenced requires a non-empty string node id. Received: ${String(nodeId)}`);
        }
        if (!options || typeof options !== 'object' || Array.isArray(options)) {
            throw new TypeError('Graph Database removeNodeIfUnreferenced options must be an object.');
        }
        if (options.requiredPropertyPath != null
            && (typeof options.requiredPropertyPath !== 'string'
                || !/^\$\.[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/.test(options.requiredPropertyPath))) {
            throw new TypeError('requiredPropertyPath must use rooted dotted identifier syntax, e.g. `$.properties.marker`.');
        }
        if (this.isExecutingTransaction) {
            throw new Error('removeNodeIfUnreferenced cannot run inside a Graph Database logical transaction.');
        }

        const storage = this.storage;

        if (storage) {
            if (typeof storage.removeNodeIfUnreferenced !== 'function'
                || !storage.removeNodeIfUnreferenced(nodeId, options)) {
                return false
            }

            const
                wasAutoSave    = this.autoSave,
                wasTransacting = this.isExecutingTransaction;

            this.autoSave               = false;
            this.isExecutingTransaction = false;

            try {
                this.removeNode(nodeId)
            } finally {
                this.autoSave               = wasAutoSave;
                this.isExecutingTransaction = wasTransacting;
            }

            // Do not max-ack the GraphLog here. A peer can commit between the
            // physical DELETE and cache cleanup; acknowledging the latest global
            // log id would swallow that peer invalidation. Replaying our own node
            // delete on the next sync is harmless and preserves the ordering proof.
            return true
        }

        const
            node                 = this.nodes.get(nodeId),
            requiredPropertyPath = options.requiredPropertyPath,
            requiredValue        = options.requiredPropertyValue,
            actualValue          = requiredPropertyPath == null
                ? requiredValue
                : requiredPropertyPath.slice(2).split('.')
                    .reduce((value, key) => value?.[key], node);

        if (!node
            || (requiredPropertyPath != null && actualValue !== requiredValue)
            || this.edges.getByIndex('source', nodeId).length > 0
            || this.edges.getByIndex('target', nodeId).length > 0) {
            return false
        }

        this.removeNode(nodeId);
        return true
    }

    /**
     * Parses the identical mutation buffer inversely mapping strict `.splice()` limits natively resolving failures.
     * @param {Object[]} diffLog
     * @protected
     */
    rollbackTransaction(diffLog) {
        // Iterate backward guarantees dependencies (e.g. node deletion then edge cascade) reverse perfectly
        for (let i = diffLog.length - 1; i >= 0; i--) {
            let trace    = diffLog[i];
            let store    = trace.type === 'nodes' ? this.nodes : this.edges;
            let mutation = trace.mutation;

            // Suspend mutation monitoring cleanly natively during automated rollback logic bounds!
            let wasTransacting = this.isExecutingTransaction;
            this.isExecutingTransaction = false;
            let wasAutoSave = this.autoSave;
            this.autoSave               = false;

            if (mutation.addedItems?.length > 0) {
                store.remove(mutation.addedItems.map(item => item.id));
            }
            if (mutation.removedItems?.length > 0) {
                store.add(mutation.removedItems);
            }

            this.autoSave               = wasAutoSave;
            this.isExecutingTransaction = wasTransacting;
        }
    }

    /**
     * Executes purely synchronous atomic closures securely mirroring standard database parameters effectively.
     * Utilizes a rollback buffer erasing local V8 mapped instances correctly if backend SQLite queries detonate cleanly.
     *
     * @param {Function} fn Synchronous logical closure interacting via standard `Database.addNode/removeNode`.
     */
    transaction(fn) {
        if (this.isExecutingTransaction) {
            throw new Error('Graph Native Database transactions cannot be structurally nested.');
        }

        this.isExecutingTransaction = true;
        this.transactionDiff        = [];

        try {
            fn(); // Synchronous array splices apply isolating memory mappings instantaneously internally

            if (this.storage && this.transactionDiff.length > 0) {
                this.storage.executeTransaction(this.transactionDiff);
                this.acknowledgeLocalMutations();
            }
        } catch (error) {
            // Intercept internal throw commands seamlessly rendering perfect state erasures instantly
            this.rollbackTransaction(this.transactionDiff);
            throw error;
        } finally {
            this.isExecutingTransaction = false;
            this.transactionDiff        = [];
        }
    }
}

export default Neo.setupClass(Database);
