import { setup } from '../../../../setup.mjs';

const appName = 'GraphServiceTenantIsolationTest';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';

/**
 * Graph RLS read-side return boundary.
 *
 * `getNode` / `getNeighbors` / `queryNodeTopology` / `getContextFrontier` return graph nodes
 * AND edges read from `GraphService.db` — process-wide in-memory Stores. The SQL RLS clause in
 * `searchNodes` / `SQLite.loadNodeVicinitySync` filters only the lazy-load path (and applies to
 * BOTH the Nodes and Edges tables); a node or edge warmed into the Store by one requester's
 * load is otherwise readable by any other requester straight from the cache. These specs stub
 * `GraphService.db` with a pre-warmed fake Store (the cache-warmed case) and assert the
 * `isRlsVisible` return-boundary predicate filters cross-tenant nodes and edges.
 *
 * RLS-visible to requester R iff: owner is null  OR  owner === R  OR  sharedEntity  OR
 * visibility === 'team' — mirroring the SQL clause.
 */

// Mutable holder so one fake db can switch the "active requester" between calls.
const requester = {value: null};

function node(id, properties = {}) {
    return {id, label: properties.type || 'TestNode', properties};
}

function edge(id, source, target, weight = 1.0, props = {}) {
    return {id, source, target, type: 'REL', properties: {weight, ...props}};
}

/**
 * Builds a fake `GraphService.db`: a pre-warmed in-memory node/edge Store plus a stubbed
 * `storage.RequestContextService` whose `getAgentIdentityNodeId()` returns `requester.value`.
 * `getAdjacentNodes` is a no-op — every node under test is pre-warmed, simulating the
 * process-wide cache already holding a cross-tenant node.
 */
function makeFakeDb(nodes, edges = []) {
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    return {
        getAdjacentNodes() {},
        nodes: nodeMap,
        edges: {
            getByIndex(field, id) {
                return edges.filter(e => e[field] === id);
            }
        },
        storage: {
            RequestContextService: {
                getAgentIdentityNodeId: () => requester.value
            }
        }
    };
}

test.describe('GraphService — RLS read-side return boundary (#10011)', () => {
    let GraphService, originalDb;

    test.beforeAll(async () => {
        GraphService = (await import('../../../../../../ai/services/memory-core/GraphService.mjs')).default;
    });

    test.beforeEach(() => {
        originalDb      = GraphService.db;
        requester.value = null;
    });

    test.afterEach(() => {
        GraphService.db = originalDb;
        requester.value = null;
    });

    test('getNode hides a cache-warmed node owned by a different tenant', () => {
        GraphService.db = makeFakeDb([
            node('n-private-a', {userId: '@tenant-a', name: 'A private'}),
            node('n-own-b',     {userId: '@tenant-b', name: 'B own'}),
            node('n-team',      {visibility: 'team',  name: 'Team node'}),
            node('n-shared',    {sharedEntity: 1,     name: 'Shared node'}),
            node('n-system')  // no userId — null-owned, broadly visible
        ]);

        requester.value = '@tenant-b';

        // The leak case: A's private node is warmed in the Store; B must not receive it.
        expect(GraphService.getNode({id: 'n-private-a'})).toBeNull();

        // RLS must NOT over-deny: B's own + team + shared + null-owned all resolve.
        expect(GraphService.getNode({id: 'n-own-b'})?.id).toBe('n-own-b');
        expect(GraphService.getNode({id: 'n-team'})?.id).toBe('n-team');
        expect(GraphService.getNode({id: 'n-shared'})?.id).toBe('n-shared');
        expect(GraphService.getNode({id: 'n-system'})?.id).toBe('n-system');
    });

    test('getNode returns the owner\'s own private node to the owner', () => {
        GraphService.db = makeFakeDb([
            node('n-private-a', {userId: '@tenant-a', name: 'A private'})
        ]);
        requester.value = '@tenant-a';

        expect(GraphService.getNode({id: 'n-private-a'})?.id).toBe('n-private-a');
    });

    test('getNeighbors filters cross-tenant neighbor nodes', () => {
        GraphService.db = makeFakeDb([
            node('root-b',      {userId: '@tenant-b'}),
            node('n-private-a', {userId: '@tenant-a', name: 'A private'}),
            node('n-team',      {visibility: 'team',  name: 'Team node'})
        ], [
            edge('e1', 'root-b', 'n-private-a'),
            edge('e2', 'root-b', 'n-team')
        ]);

        requester.value = '@tenant-b';

        const ids = GraphService.getNeighbors({id: 'root-b'}).neighbors.map(n => n.id);

        expect(ids).toContain('n-team');
        expect(ids).not.toContain('n-private-a');
    });

    test('getNeighbors returns no neighbors when the root node is not visible', () => {
        GraphService.db = makeFakeDb([
            node('root-a', {userId: '@tenant-a'}),
            node('n-team', {visibility: 'team'})
        ], [
            edge('e1', 'root-a', 'n-team')
        ]);

        requester.value = '@tenant-b';

        // B cannot see root-a, so it must not receive root-a's vicinity at all.
        expect(GraphService.getNeighbors({id: 'root-a'}).neighbors).toEqual([]);
    });

    test('queryNodeTopology rejects an invisible root and prunes invisible far nodes', () => {
        GraphService.db = makeFakeDb([
            node('root-b',      {userId: '@tenant-b'}),
            node('n-private-a', {userId: '@tenant-a'}),
            node('n-team',      {visibility: 'team'})
        ], [
            edge('e1', 'root-b', 'n-private-a'),
            edge('e2', 'root-b', 'n-team')
        ]);

        requester.value = '@tenant-b';

        const topology = GraphService.queryNodeTopology({nodeId: 'root-b', maxDepth: 2}),
              ids      = topology.nodes.map(n => n.id);

        expect(ids).toContain('root-b');
        expect(ids).toContain('n-team');
        expect(ids).not.toContain('n-private-a');
        // The edge to the pruned node is dropped — every surfaced edge connects visible nodes.
        expect(topology.edges.some(e => e.source === 'n-private-a' || e.target === 'n-private-a')).toBe(false);

        // Invisible root → null; no topology is leaked.
        expect(GraphService.queryNodeTopology({nodeId: 'n-private-a', maxDepth: 2})).toBeNull();
    });

    test('getContextFrontier filters cross-tenant strategic neighbors', () => {
        GraphService.db = makeFakeDb([
            node('frontier'),  // SYSTEM_ANCHOR — null-owned, visible to all
            node('n-private-a', {userId: '@tenant-a'}),
            node('n-team',      {visibility: 'team'})
        ], [
            edge('e1', 'frontier', 'n-private-a', 1.0),
            edge('e2', 'frontier', 'n-team',      1.0)
        ]);

        requester.value = '@tenant-b';

        const ids = GraphService.getContextFrontier({depth: 2}).strategicNeighbors.map(n => n.id);

        expect(ids).toContain('n-team');
        expect(ids).not.toContain('n-private-a');
    });

    test('a null requester sees only null-owned / shared / team nodes', () => {
        GraphService.db = makeFakeDb([
            node('n-private-a', {userId: '@tenant-a'}),
            node('n-team',      {visibility: 'team'}),
            node('n-system')
        ]);

        requester.value = null;  // no authenticated request context

        expect(GraphService.getNode({id: 'n-private-a'})).toBeNull();
        expect(GraphService.getNode({id: 'n-team'})?.id).toBe('n-team');
        expect(GraphService.getNode({id: 'n-system'})?.id).toBe('n-system');
    });

    test('getNeighbors hides a neighbor reached only by a cross-tenant private edge', () => {
        GraphService.db = makeFakeDb([
            node('root-b', {userId: '@tenant-b'}),
            node('n-team', {visibility: 'team'})
        ], [
            // n-team is team-visible, but the only edge to it is tenant A's private edge.
            edge('e-private', 'root-b', 'n-team', 1.0, {userId: '@tenant-a'})
        ]);

        requester.value = '@tenant-b';

        expect(GraphService.getNeighbors({id: 'root-b'}).neighbors).toEqual([]);
    });

    test('queryNodeTopology omits a cross-tenant private edge between visible nodes', () => {
        GraphService.db = makeFakeDb([
            node('root-b', {userId: '@tenant-b'}),
            node('n-team', {visibility: 'team'})
        ], [
            edge('e-private', 'root-b', 'n-team', 1.0, {userId: '@tenant-a'})
        ]);

        requester.value = '@tenant-b';

        const topology = GraphService.queryNodeTopology({nodeId: 'root-b', maxDepth: 2});

        // The private edge is not surfaced, and n-team is not reached through it.
        expect(topology.edges).toEqual([]);
        expect(topology.nodes.map(n => n.id)).not.toContain('n-team');
    });

    test('getContextFrontier hides a strategic neighbor reached by a private edge', () => {
        GraphService.db = makeFakeDb([
            node('frontier'),
            node('n-team', {visibility: 'team'})
        ], [
            edge('e-private', 'frontier', 'n-team', 1.0, {userId: '@tenant-a'})
        ]);

        requester.value = '@tenant-b';

        expect(GraphService.getContextFrontier({depth: 2}).strategicNeighbors).toEqual([]);
    });
});

/**
 * Write-side complement to the read-side RLS boundary above.
 *
 * The read side correctly treats a null-owned node as visible to every tenant. The bug was
 * purely on the write side: `GraphService` provisions shared sentinels (`frontier`, the
 * `Neo-Master-Architecture` primer, `_SYSTEM_STATE`, identity roots) via plain `upsertNode`,
 * which stamps `properties.userId` with the *first boot harness's* bound identity. Under strict
 * RLS that isolates these operational nodes to a single tenant — they vanish from the graph for
 * everyone else. `upsertGlobalNode` forces `userId: null` so they stay globally reachable.
 */
function makeWritableDb() {
    const nodeMap = new Map();
    return {
        getAdjacentNodes() {},
        nodes: nodeMap,
        edges  : {getByIndex() { return []; }},
        addNode(spec) { nodeMap.set(spec.id, {id: spec.id, label: spec.label, properties: spec.properties}); },
        autoSave: false,
        storage : {RequestContextService: {getAgentIdentityNodeId: () => requester.value}}
    };
}

/**
 * Writable fake `GraphService.db` that ALSO supports the edge-write path (`linkNodes` →
 * `storage.db.prepare` FK-verify + existing-edge check + `addEdge`) and the topology read
 * (`edges.getByIndex` consumed by `getContextFrontier`). Lets a spec provision + link global
 * sentinels end-to-end, then read them back as a different tenant — the path the global-edge gap lived in.
 */
function makeTopologyDb() {
    const nodeMap = new Map(),
          edges   = [];
    const sqliteDb = {
        prepare(sql) {
            return {
                get(...args) {
                    // linkNodes FK pre-check: both endpoints must exist in Nodes.
                    if (sql.includes('FROM Nodes')) {
                        const [a, b] = args;
                        return {count: (nodeMap.has(a) ? 1 : 0) + (a === b ? 0 : (nodeMap.has(b) ? 1 : 0))};
                    }
                    // linkNodes existing-edge lookup: none → a fresh edge is written.
                    return undefined;
                }
            };
        }
    };
    return {
        getAdjacentNodes() {},
        nodes: nodeMap,
        edges: {getByIndex(field, id) { return edges.filter(e => e[field] === id); }},
        addNode(spec) { nodeMap.set(spec.id, {id: spec.id, label: spec.label, properties: spec.properties}); },
        addEdge(spec) { edges.push({id: spec.id, source: spec.source, target: spec.target, type: spec.type, properties: spec.properties}); },
        transaction(fn) { return fn(); },  // linkNodes wraps executeLink in a transaction when not already in one
        autoSave: false,
        storage : {db: sqliteDb, dbPath: '/tmp/neo-graph.db', RequestContextService: {getAgentIdentityNodeId: () => requester.value}}
    };
}

test.describe('GraphService — global system-node provisioning (write-side null-owner) (#10271)', () => {
    let GraphService, originalDb;

    test.beforeAll(async () => {
        GraphService = (await import('../../../../../../ai/services/memory-core/GraphService.mjs')).default;
    });

    test.beforeEach(() => {
        originalDb      = GraphService.db;
        requester.value = null;
    });

    test.afterEach(() => {
        GraphService.db = originalDb;
        requester.value = null;
    });

    test('upsertGlobalNode forces userId:null even under an active request context', () => {
        GraphService.db = makeWritableDb();
        requester.value = '@tenant-a';

        GraphService.upsertGlobalNode({id: 'sys-x', type: 'System', name: 'Sys X'});

        // Null-owned, NOT stamped with the booting tenant — so RLS keeps it visible to all.
        expect(GraphService.db.nodes.get('sys-x').properties.userId).toBeNull();
    });

    test('a global node provisioned under tenant-A stays visible to tenant-B', () => {
        GraphService.db = makeWritableDb();

        requester.value = '@tenant-a';  // the first boot harness
        GraphService.upsertGlobalNode({id: 'Neo-Master-Architecture', type: 'System', name: 'Primer'});

        requester.value = '@tenant-b';  // a different tenant must still see the global primer
        expect(GraphService.getNode({id: 'Neo-Master-Architecture'})?.id).toBe('Neo-Master-Architecture');
    });

    test('plain upsertNode stamps the active tenant — the isolation the helper prevents', () => {
        GraphService.db = makeWritableDb();

        requester.value = '@tenant-a';
        GraphService.upsertNode({id: 'leaky', type: 'System', name: 'Leaky'});

        // Baseline: without the helper the node is bound to @tenant-a and hidden from @tenant-b.
        expect(GraphService.db.nodes.get('leaky').properties.userId).toBe('@tenant-a');

        requester.value = '@tenant-b';
        expect(GraphService.getNode({id: 'leaky'})).toBeNull();
    });

    // Edge ownership: a global node reached only through a tenant-stamped edge still vanishes from
    // topology traversal (getContextFrontier RLS-filters edges AND nodes). linkGlobalNodes closes that.
    test('a global sentinel linked under tenant-A is reachable via getContextFrontier for tenant-B', () => {
        GraphService.db = makeTopologyDb();

        requester.value = '@tenant-a';  // the booting harness
        GraphService.upsertGlobalNode({id: 'frontier', type: 'SYSTEM_ANCHOR', name: 'Frontier'});
        GraphService.upsertGlobalNode({id: 'Neo-Master-Architecture', type: 'System', name: 'Primer'});
        GraphService.linkGlobalNodes('frontier', 'Neo-Master-Architecture', 'SYSTEM_TENET', 1.0);

        // The SYSTEM_TENET edge must itself be null-owned, not just the node.
        expect(GraphService.db.edges.getByIndex('source', 'frontier')[0].properties.userId).toBeNull();

        // A non-booting tenant reaches the primer through topology, not only a direct getNode.
        requester.value = '@tenant-b';
        const ids = GraphService.getContextFrontier({depth: 2}).strategicNeighbors.map(n => n.id);
        expect(ids).toContain('Neo-Master-Architecture');
    });

    test('plain linkNodes tenant-stamps the edge — the topology gap the global-edge helper closes', () => {
        GraphService.db = makeTopologyDb();

        requester.value = '@tenant-a';
        GraphService.upsertGlobalNode({id: 'frontier', type: 'SYSTEM_ANCHOR', name: 'Frontier'});
        GraphService.upsertGlobalNode({id: 'Neo-Master-Architecture', type: 'System', name: 'Primer'});
        GraphService.linkNodes('frontier', 'Neo-Master-Architecture', 'SYSTEM_TENET', 1.0);  // plain → edge stamped @tenant-a

        // Baseline: the node is global, but the tenant-stamped edge hides the primer from topology.
        expect(GraphService.db.edges.getByIndex('source', 'frontier')[0].properties.userId).toBe('@tenant-a');

        requester.value = '@tenant-b';
        const ids = GraphService.getContextFrontier({depth: 2}).strategicNeighbors.map(n => n.id);
        expect(ids).not.toContain('Neo-Master-Architecture');
    });
});
