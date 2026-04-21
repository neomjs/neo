import {setup} from '../../../../setup.mjs';

const appName = 'MemorySessionIngestorTest';

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
import fs             from 'fs';
import path           from 'path';

test.describe('Neo.ai.daemons.services.MemorySessionIngestor', () => {
    // Serial within this describe — `beforeAll` performs a cold import cascade of the Neo
    // core + GraphService + SystemLifecycleService module graph. Under fullyParallel, Playwright
    // spins one worker per test (6 here) and each worker races the same cold import chain;
    // intermittent ESM partial-evaluation errors (`ClassSystem.mjs does not provide default`,
    // etc.) result. Serial runs the imports once, then reuses the warm module cache across tests.
    test.describe.configure({mode: 'serial'});

    let GraphService;
    let MemorySessionIngestor;
    let logger;
    let SystemLifecycleService;

    const testDbName = `memory-core-memory-session-ingestor-test-${process.pid}-${Date.now()}.sqlite`;
    let testDbPath;

    let originalWarn;
    let warnMessages = [];

    /**
     * Builds a stub Chroma memory collection fulfilling the contract
     * `collection.get({where: {sessionId}, include: ['metadatas']}) → {ids, metadatas}`.
     * Filters the given seed rows by sessionId so the ingestor sees only the session's
     * memories, matching production Chroma filter semantics.
     */
    function stubMemoryCollection(seedRows) {
        return {
            get: async ({where}) => {
                const matching = seedRows.filter(r => r.metadata.sessionId === where.sessionId);
                return {
                    ids      : matching.map(r => r.id),
                    metadatas: matching.map(r => r.metadata)
                };
            }
        };
    }

    test.beforeAll(async () => {
        const aiConfig = (await import('../../../../../../ai/mcp/server/memory-core/config.mjs')).default;

        const tmpDir = path.resolve(process.cwd(), 'tmp');
        if (!fs.existsSync(tmpDir)) {
            fs.mkdirSync(tmpDir, {recursive: true});
        }
        testDbPath = path.join(tmpDir, testDbName);

        aiConfig.storagePaths.graph   = testDbPath;
        aiConfig.autoIngestFileSystem = false;
        aiConfig.handoffFilePath      = path.join(tmpDir, 'mock_sandman_handoff_memory_session_ingestor.md');

        GraphService           = (await import('../../../../../../ai/mcp/server/memory-core/services/GraphService.mjs')).default;
        MemorySessionIngestor  = (await import('../../../../../../ai/daemons/services/MemorySessionIngestor.mjs')).default;
        logger                 = (await import('../../../../../../ai/mcp/server/memory-core/logger.mjs')).default;
        SystemLifecycleService = (await import('../../../../../../ai/mcp/server/memory-core/services/lifecycle/SystemLifecycleService.mjs')).default;

        if (fs.existsSync(testDbPath)) {
            try {
                fs.unlinkSync(testDbPath);
                if (fs.existsSync(`${testDbPath}-wal`)) fs.unlinkSync(`${testDbPath}-wal`);
                if (fs.existsSync(`${testDbPath}-shm`)) fs.unlinkSync(`${testDbPath}-shm`);
            } catch (e) {}
        }

        if (!SystemLifecycleService._initPromise) {
            await SystemLifecycleService.initAsync();
        } else {
            await SystemLifecycleService.ready();
        }
    });

    test.beforeEach(() => {
        if (GraphService.db) {
            GraphService.db.nodes.clear();
            GraphService.db.edges.clear();
            GraphService.db.vicinityLoadedNodes.clear();

            if (GraphService.db.storage?.db) {
                GraphService.db.storage.clear();
                GraphService.db.storage.db.exec('DELETE FROM GraphLog');
                GraphService.db.lastSyncId = 0;
            }
        }

        warnMessages = [];
        originalWarn = logger.warn;
        logger.warn  = (...args) => {
            warnMessages.push(args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' '));
        };
    });

    test.afterEach(() => {
        if (originalWarn) logger.warn = originalWarn;

        // Symmetric cleanup — GraphService is a cross-spec singleton. Under `fullyParallel: true`
        // Playwright interleaves tests from multiple spec files in the same worker; leaving graph
        // state from our last test leaks into sibling specs that assert fresh-module state.
        if (GraphService.db) {
            GraphService.db.nodes.clear();
            GraphService.db.edges.clear();
            GraphService.db.vicinityLoadedNodes.clear();
            if (GraphService.db.storage?.db) {
                GraphService.db.storage.clear();
                GraphService.db.storage.db.exec('DELETE FROM GraphLog');
                GraphService.db.lastSyncId = 0;
            }
        }
    });

    test.afterAll(() => {
        if (GraphService?.db) {
            if (GraphService.db.storage?.db) {
                try { GraphService.db.storage.db.close(); } catch (e) {}
            }
            GraphService.db           = null;
            GraphService._initPromise = null;
        }

        if (SystemLifecycleService) {
            SystemLifecycleService._initPromise = null;
        }

        if (fs.existsSync(testDbPath)) {
            try { fs.unlinkSync(testDbPath); } catch (e) {}
            if (fs.existsSync(`${testDbPath}-wal`)) try { fs.unlinkSync(`${testDbPath}-wal`); } catch (e) {}
            if (fs.existsSync(`${testDbPath}-shm`)) try { fs.unlinkSync(`${testDbPath}-shm`); } catch (e) {}
        }
    });

    test('should return stats object with the documented shape', async () => {
        const session = {
            id  : 'chroma-summary-1',
            meta: {
                sessionId: 'agent-session-1',
                title    : 'First session',
                createdAt: '2026-04-21T09:00:00Z',
                userId   : 'tobiu'
            }
        };
        const memoryCollection = stubMemoryCollection([
            {id: 'mem-1', metadata: {sessionId: 'agent-session-1', createdAt: '2026-04-21T09:01:00Z', userId: 'tobiu'}}
        ]);

        const stats = await MemorySessionIngestor.syncSessionToGraph(session, {memoryCollection});

        expect(stats).toHaveProperty('memoriesProcessed');
        expect(stats).toHaveProperty('memoriesUpserted');
        expect(stats).toHaveProperty('memoriesSkipped');
        expect(stats).toHaveProperty('sessionUpserted');
        expect(stats).toHaveProperty('errors');

        expect(typeof stats.memoriesProcessed).toBe('number');
        expect(typeof stats.memoriesUpserted).toBe('number');
        expect(typeof stats.memoriesSkipped).toBe('number');
        expect(typeof stats.sessionUpserted).toBe('boolean');
        expect(Array.isArray(stats.errors)).toBe(true);
    });

    test('should upsert one SESSION node plus N MEMORY nodes plus N ORIGINATES_IN edges', async () => {
        const session = {
            id  : 'chroma-summary-2',
            meta: {
                sessionId: 'agent-session-2',
                title    : 'Session with three memories',
                createdAt: '2026-04-21T10:00:00Z',
                userId   : 'tobiu'
            }
        };
        const memoryCollection = stubMemoryCollection([
            {id: 'mem-a', metadata: {sessionId: 'agent-session-2', createdAt: '2026-04-21T10:01:00Z', userId: 'tobiu'}},
            {id: 'mem-b', metadata: {sessionId: 'agent-session-2', createdAt: '2026-04-21T10:02:00Z', userId: 'tobiu'}},
            {id: 'mem-c', metadata: {sessionId: 'agent-session-2', createdAt: '2026-04-21T10:03:00Z', userId: 'tobiu'}},
            // Memory for a different session — must NOT appear in the graph
            {id: 'mem-x', metadata: {sessionId: 'agent-session-other', createdAt: '2026-04-21T11:00:00Z', userId: 'tobiu'}}
        ]);

        const stats = await MemorySessionIngestor.syncSessionToGraph(session, {memoryCollection});

        expect(stats.memoriesProcessed).toBe(3);
        expect(stats.memoriesUpserted).toBe(3);
        expect(stats.memoriesSkipped).toBe(0);
        expect(stats.sessionUpserted).toBe(true);
        expect(stats.errors).toEqual([]);

        const sessionNode = GraphService.db.nodes.get('session:agent-session-2');
        expect(sessionNode).toBeDefined();
        expect(sessionNode.label).toBe('SESSION');
        expect(sessionNode.properties.chromaId).toBe('chroma-summary-2');
        expect(sessionNode.properties.sessionId).toBe('agent-session-2');
        expect(sessionNode.properties.userId).toBe('tobiu');

        for (const memId of ['mem-a', 'mem-b', 'mem-c']) {
            const node = GraphService.db.nodes.get(`memory:${memId}`);
            expect(node).toBeDefined();
            expect(node.label).toBe('MEMORY');
            expect(node.properties.chromaId).toBe(memId);
            expect(node.properties.sessionId).toBe('agent-session-2');
        }

        // Cross-session bleed guard: the memory belonging to a different session must not land.
        // `GraphService.db.nodes.get` returns `null` on miss (not `undefined` — custom collection
        // contract), so `toBeFalsy` covers both null and undefined rather than asserting a
        // specific absent-shape that depends on internal Collection implementation details.
        expect(GraphService.db.nodes.get('memory:mem-x')).toBeFalsy();

        const originatesIn = GraphService.db.edges.items.filter(e => e.type === 'ORIGINATES_IN');
        expect(originatesIn.length).toBe(3);
        for (const edge of originatesIn) {
            expect(edge.target).toBe('session:agent-session-2');
            expect(['memory:mem-a', 'memory:mem-b', 'memory:mem-c']).toContain(edge.source);
        }
    });

    test('should produce identical graph state across two consecutive sync calls (idempotency)', async () => {
        const session = {
            id  : 'chroma-summary-3',
            meta: {
                sessionId: 'agent-session-3',
                title    : 'Idempotent session',
                createdAt: '2026-04-21T12:00:00Z',
                userId   : 'tobiu'
            }
        };
        const memoryCollection = stubMemoryCollection([
            {id: 'mem-1', metadata: {sessionId: 'agent-session-3', createdAt: '2026-04-21T12:01:00Z', userId: 'tobiu'}},
            {id: 'mem-2', metadata: {sessionId: 'agent-session-3', createdAt: '2026-04-21T12:02:00Z', userId: 'tobiu'}}
        ]);

        const first = await MemorySessionIngestor.syncSessionToGraph(session, {memoryCollection});
        const nodesAfterFirst = new Set(GraphService.db.nodes.items.map(n => n.id));
        const edgesAfterFirst = GraphService.db.edges.items
            .map(e => `${e.source}|${e.target}|${e.type}`)
            .sort()
            .join('\n');

        const second = await MemorySessionIngestor.syncSessionToGraph(session, {memoryCollection});
        const nodesAfterSecond = new Set(GraphService.db.nodes.items.map(n => n.id));
        const edgesAfterSecond = GraphService.db.edges.items
            .map(e => `${e.source}|${e.target}|${e.type}`)
            .sort()
            .join('\n');

        // Graph-state equivalence
        expect(nodesAfterSecond.size).toBe(nodesAfterFirst.size);
        for (const id of nodesAfterFirst) {
            expect(nodesAfterSecond.has(id)).toBe(true);
        }
        expect(edgesAfterSecond).toBe(edgesAfterFirst);

        // Skip-path contract: idempotency must hit the hash-match skip path rather than re-upsert.
        // Without this assertion, a broken skip path that still produced identical final state
        // would pass the graph-equivalence checks above — false green.
        expect(first.memoriesUpserted).toBe(2);
        expect(first.sessionUpserted).toBe(true);
        expect(second.memoriesProcessed).toBe(first.memoriesProcessed);
        expect(second.memoriesSkipped).toBe(first.memoriesProcessed);
        expect(second.memoriesUpserted).toBe(0);
        expect(second.sessionUpserted).toBe(false);
    });

    test('should upsert only the SESSION node when the session has no memories', async () => {
        const session = {
            id  : 'chroma-summary-4',
            meta: {
                sessionId: 'agent-session-empty',
                title    : 'Empty session',
                createdAt: '2026-04-21T13:00:00Z',
                userId   : 'tobiu'
            }
        };
        const memoryCollection = stubMemoryCollection([]);

        const stats = await MemorySessionIngestor.syncSessionToGraph(session, {memoryCollection});

        expect(stats.memoriesProcessed).toBe(0);
        expect(stats.memoriesUpserted).toBe(0);
        expect(stats.sessionUpserted).toBe(true);

        const sessionNode = GraphService.db.nodes.get('session:agent-session-empty');
        expect(sessionNode).toBeDefined();
        expect(sessionNode.label).toBe('SESSION');

        const originatesIn = GraphService.db.edges.items.filter(e => e.type === 'ORIGINATES_IN');
        expect(originatesIn.length).toBe(0);
    });

    test('should re-upsert a memory when its metadata changes (payload hash mismatch)', async () => {
        const session = {
            id  : 'chroma-summary-5',
            meta: {
                sessionId: 'agent-session-5',
                title    : 'Mutating session',
                createdAt: '2026-04-21T14:00:00Z',
                userId   : 'tobiu'
            }
        };

        const firstCollection = stubMemoryCollection([
            {id: 'mem-mut', metadata: {sessionId: 'agent-session-5', createdAt: '2026-04-21T14:01:00Z', userId: 'tobiu'}}
        ]);
        const firstStats = await MemorySessionIngestor.syncSessionToGraph(session, {memoryCollection: firstCollection});
        expect(firstStats.memoriesUpserted).toBe(1);

        // Simulate a metadata change — e.g., a userId correction or a createdAt backfill
        const secondCollection = stubMemoryCollection([
            {id: 'mem-mut', metadata: {sessionId: 'agent-session-5', createdAt: '2026-04-21T14:05:00Z', userId: 'tobiu'}}
        ]);
        const secondStats = await MemorySessionIngestor.syncSessionToGraph(session, {memoryCollection: secondCollection});

        expect(secondStats.memoriesProcessed).toBe(1);
        expect(secondStats.memoriesUpserted).toBe(1);
        expect(secondStats.memoriesSkipped).toBe(0);

        const node = GraphService.db.nodes.get('memory:mem-mut');
        expect(node.properties.createdAt).toBe('2026-04-21T14:05:00Z');
    });

    test('should reject input missing session.meta.sessionId and return an error', async () => {
        const session = {id: 'chroma-summary-bad', meta: {/* missing sessionId */}};
        const memoryCollection = stubMemoryCollection([]);

        const stats = await MemorySessionIngestor.syncSessionToGraph(session, {memoryCollection});

        expect(stats.memoriesProcessed).toBe(0);
        expect(stats.sessionUpserted).toBe(false);
        expect(stats.errors.length).toBeGreaterThan(0);
        expect(stats.errors[0]).toContain('sessionId is required');
    });
});
