import {setup} from '../../../../setup.mjs';

const appName = 'LazyEdgeDrainerTest';

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
import {TestLifecycleHelper} from '../../services/memory-core/util.mjs';

test.describe('Neo.ai.daemons.services.LazyEdgeDrainer', () => {
    // Serial matches the sibling MemorySessionIngestor.spec — cold import chain of the Neo core
    // + GraphService module graph benefits from warm module cache across tests.
    test.describe.configure({mode: 'serial'});

    let LazyEdgeDrainer;
    let GraphService;
    let SystemLifecycleService;
    let logger;
    let originalLinkNodesAsync;

    const testDbName  = `memory-core-lazy-edge-drainer-test-${process.pid}-${Date.now()}.sqlite`;
    const queueName   = `test-lazy-edges-${process.pid}-${Date.now()}.jsonl`;
    let testDbPath;
    let queuePath;

    test.beforeAll(async () => {
        const aiConfig = (await import('../../../../../../ai/mcp/server/memory-core/config.mjs')).default;

        const tmpDir = path.resolve(process.cwd(), 'tmp');
        if (!fs.existsSync(tmpDir)) {
            fs.mkdirSync(tmpDir, {recursive: true});
        }
        testDbPath = path.join(tmpDir, testDbName);
        queuePath  = path.join(tmpDir, queueName);

        aiConfig.storagePaths.graph   = testDbPath;
        aiConfig.autoIngestFileSystem = false;

        LazyEdgeDrainer        = (await import('../../../../../../ai/services/graph/LazyEdgeDrainer.mjs')).default;
        GraphService           = (await import('../../../../../../ai/services/memory-core/GraphService.mjs')).default;
        SystemLifecycleService = (await import('../../../../../../ai/services/memory-core/lifecycle/SystemLifecycleService.mjs')).default;
        logger                 = (await import('../../../../../../ai/mcp/server/memory-core/logger.mjs')).default;

        if (fs.existsSync(testDbPath)) {
            try { fs.unlinkSync(testDbPath); } catch (e) {}
            if (fs.existsSync(`${testDbPath}-wal`)) try { fs.unlinkSync(`${testDbPath}-wal`); } catch (e) {}
            if (fs.existsSync(`${testDbPath}-shm`)) try { fs.unlinkSync(`${testDbPath}-shm`); } catch (e) {}
        }

        if (!SystemLifecycleService._initPromise) {
            await SystemLifecycleService.initAsync();
        } else {
            await SystemLifecycleService.ready();
        }
    });

    test.beforeEach(() => {
        // Cross-test file isolation — each test owns its queue file state.
        if (fs.existsSync(queuePath)) fs.unlinkSync(queuePath);
        const drainingPath = queuePath + '.draining';
        if (fs.existsSync(drainingPath)) fs.unlinkSync(drainingPath);

        // Capture the real linkNodesAsync so tests can mock it without cross-test leak.
        originalLinkNodesAsync = GraphService.linkNodesAsync.bind(GraphService);
    });

    test.afterEach(() => {
        GraphService.linkNodesAsync = originalLinkNodesAsync;

        if (fs.existsSync(queuePath)) fs.unlinkSync(queuePath);
        const drainingPath = queuePath + '.draining';
        if (fs.existsSync(drainingPath)) fs.unlinkSync(drainingPath);
    });

    test.afterAll(async () => {
        await TestLifecycleHelper.cleanupGraphService(GraphService, SystemLifecycleService, testDbPath, fs, 'clear');
    });

    test('drainQueue on non-existent queue file is a no-op', async () => {
        const stats = await LazyEdgeDrainer.drainQueue({filePath: queuePath});

        expect(stats.totalLines).toBe(0);
        expect(stats.processed).toBe(0);
        expect(stats.succeeded).toBe(0);
        expect(stats.queueRotated).toBe(false);
    });

    test('drainQueue processes all valid edges and deletes the queue file', async () => {
        const edges = [
            {source: 'CONCEPT:a', target: 'memory:m1', relationship: 'MENTIONED_IN', weight: 1.0},
            {source: 'CONCEPT:b', target: 'session:s1', relationship: 'DISCUSSED_IN', weight: 1.0}
        ];
        fs.writeFileSync(queuePath, edges.map(e => JSON.stringify(e)).join('\n') + '\n');

        // Mock linkNodesAsync to always succeed.
        GraphService.linkNodesAsync = async () => true;

        const stats = await LazyEdgeDrainer.drainQueue({filePath: queuePath});

        expect(stats.totalLines).toBe(2);
        expect(stats.processed).toBe(2);
        expect(stats.succeeded).toBe(2);
        expect(stats.failed).toBe(0);
        expect(stats.queueRotated).toBe(true);
        // Queue file should be removed on full drain (no failures to retain).
        expect(fs.existsSync(queuePath)).toBe(false);
        // .draining file should be cleaned up too.
        expect(fs.existsSync(queuePath + '.draining')).toBe(false);
    });

    test('drainQueue retains failures in the queue for future retry', async () => {
        const edges = [
            {source: 'CONCEPT:a', target: 'memory:resolvable', relationship: 'MENTIONED_IN'},
            {source: 'CONCEPT:b', target: 'memory:unresolvable', relationship: 'MENTIONED_IN'}
        ];
        fs.writeFileSync(queuePath, edges.map(e => JSON.stringify(e)).join('\n') + '\n');

        // Mock linkNodesAsync to succeed for 'resolvable', fail for 'unresolvable'.
        GraphService.linkNodesAsync = async (source, target) => target === 'memory:resolvable';

        const stats = await LazyEdgeDrainer.drainQueue({filePath: queuePath});

        expect(stats.succeeded).toBe(1);
        expect(stats.failed).toBe(1);
        // Queue file should exist with the single failure line retained.
        expect(fs.existsSync(queuePath)).toBe(true);
        const retained = fs.readFileSync(queuePath, 'utf8');
        expect(retained).toContain('memory:unresolvable');
        expect(retained).not.toContain('memory:resolvable');
    });

    test('drainQueue skips malformed JSON lines without retaining them', async () => {
        fs.writeFileSync(queuePath, [
            JSON.stringify({source: 'a', target: 'memory:b', relationship: 'RELATES_TO'}),
            '{this is not valid json',
            JSON.stringify({source: 'c', target: 'session:d', relationship: 'DISCUSSED_IN'})
        ].join('\n') + '\n');

        GraphService.linkNodesAsync = async () => true;

        const stats = await LazyEdgeDrainer.drainQueue({filePath: queuePath});

        expect(stats.totalLines).toBe(3);
        expect(stats.succeeded).toBe(2);
        expect(stats.skippedMalformed).toBe(1);
        expect(stats.failed).toBe(0);
        // Malformed lines are discarded (never succeed on retry); no residual file.
        expect(fs.existsSync(queuePath)).toBe(false);
    });

    test('drainQueue skips lines missing required fields as malformed', async () => {
        fs.writeFileSync(queuePath, [
            JSON.stringify({source: 'a', target: 'memory:b'}),            // missing relationship
            JSON.stringify({source: 'a', relationship: 'MENTIONED_IN'}),  // missing target
            JSON.stringify({target: 'memory:b', relationship: 'MENTIONED_IN'})  // missing source
        ].join('\n') + '\n');

        GraphService.linkNodesAsync = async () => true;

        const stats = await LazyEdgeDrainer.drainQueue({filePath: queuePath});

        expect(stats.totalLines).toBe(3);
        expect(stats.skippedMalformed).toBe(3);
        expect(stats.succeeded).toBe(0);
    });

    test('drainQueue dry-run reports stats without mutating the queue or the graph', async () => {
        const edges = [
            {source: 'CONCEPT:a', target: 'memory:dryrun-m', relationship: 'MENTIONED_IN'}
        ];
        fs.writeFileSync(queuePath, JSON.stringify(edges[0]) + '\n');

        let linkCalled = false;
        GraphService.linkNodesAsync = async () => { linkCalled = true; return true; };

        const stats = await LazyEdgeDrainer.drainQueue({filePath: queuePath, dryRun: true});

        expect(stats.totalLines).toBe(1);
        expect(stats.succeeded).toBe(1);
        expect(linkCalled).toBe(false);
        // Queue file unchanged by dry-run.
        expect(fs.existsSync(queuePath)).toBe(true);
        const remaining = fs.readFileSync(queuePath, 'utf8');
        expect(remaining).toContain('memory:dryrun-m');
    });

    test('Sub 9 hypothesis 13: drainQueue recovers orphaned .draining file from a prior-run SIGKILL (#12617)', async () => {
        // Simulate a prior drain that was SIGKILL'd between rename and completion: the
        // `.draining` file exists with queued edges but the live queue may or may not have
        // fresh appends from a concurrent producer.
        const drainingPath = queuePath + '.draining';
        const orphanedEdge = {source: 'CONCEPT:orphan', target: 'memory:orphan', relationship: 'MENTIONED_IN'};
        const freshEdge    = {source: 'CONCEPT:fresh',  target: 'memory:fresh',  relationship: 'DISCUSSED_IN'};

        fs.writeFileSync(drainingPath, JSON.stringify(orphanedEdge) + '\n');
        fs.writeFileSync(queuePath,    JSON.stringify(freshEdge)   + '\n');

        const processedTargets = [];
        GraphService.linkNodesAsync = async (source, target) => {
            processedTargets.push(target);
            return true;
        };

        const stats = await LazyEdgeDrainer.drainQueue({filePath: queuePath});

        expect(stats.orphanRecovered).toBe(true);
        // Both the orphaned and the fresh edge should have been drained in this single run.
        expect(stats.succeeded).toBe(2);
        expect(processedTargets).toContain('memory:orphan');
        expect(processedTargets).toContain('memory:fresh');
        // Orphan file removed after successful recovery.
        expect(fs.existsSync(drainingPath)).toBe(false);
        // Live queue fully drained (no failures to retain).
        expect(fs.existsSync(queuePath)).toBe(false);
    });

    test('Sub 9 hypothesis 13: drainQueue retains link failures for retry (#12617)', async () => {
        fs.writeFileSync(queuePath, JSON.stringify({source: 'a', target: 'memory:throw', relationship: 'RELATES_TO'}) + '\n');

        const originalWarn = logger.warn;
        logger.warn = () => {};

        try {
            GraphService.linkNodesAsync = async () => { throw new Error('Synthetic DB error'); };

            const stats = await LazyEdgeDrainer.drainQueue({filePath: queuePath});

            expect(stats.processed).toBe(1);
            expect(stats.failed).toBe(1);
            expect(stats.succeeded).toBe(0);
            // Failed edge retained for retry.
            expect(fs.existsSync(queuePath)).toBe(true);
        } finally {
            logger.warn = originalWarn;
        }
    });
});
