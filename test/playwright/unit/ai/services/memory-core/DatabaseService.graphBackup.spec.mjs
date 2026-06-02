import {setup} from '../../../../setup.mjs';

const appName = 'MCGraphBackupTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: false,
        unitTestMode           : true,
        useDomApiRenderer      : false
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect}  from '@playwright/test';
import Neo             from '../../../../../../src/Neo.mjs';
import * as core       from '../../../../../../src/core/_export.mjs';
import InstanceManager from '../../../../../../src/manager/Instance.mjs';
import fs              from 'fs';
import path            from 'path';

// Serial mode: this file rewires singleton graph storage to a temporary SQLite file.
test.describe.configure({mode: 'serial'});

test.describe('Memory_DatabaseService — graph backup import (#10949)', () => {
    let GraphService, Memory_DatabaseService, SystemLifecycleService;
    let graphPath, tmpDir;

    test.beforeAll(async () => {
        const aiConfig = (await import('../../../../../../ai/mcp/server/memory-core/config.mjs')).default;

        tmpDir    = path.resolve(process.cwd(), 'tmp', `mc-graph-backup-${process.pid}-${Date.now()}`);
        graphPath = path.join(tmpDir, 'memory-core-graph.sqlite');

        fs.mkdirSync(tmpDir, {recursive: true});

        if (!aiConfig.storagePaths) aiConfig.storagePaths = {};
        if (!aiConfig.collections) aiConfig.collections = {};
        aiConfig.storagePaths.graph = graphPath;
        aiConfig.collections.memory = `test-memory-${process.pid}-${Date.now()}`;
        aiConfig.collections.session = `test-session-${process.pid}-${Date.now()}`;

        const SDK = await import('../../../../../../ai/services.mjs');
        Memory_DatabaseService = SDK.Memory_DatabaseService;
        GraphService           = (await import('../../../../../../ai/services/memory-core/GraphService.mjs')).default;
        SystemLifecycleService = (await import('../../../../../../ai/services/memory-core/lifecycle/SystemLifecycleService.mjs')).default;

        const {TestLifecycleHelper} = await import('./util.mjs');
        await TestLifecycleHelper.cleanupGraphService(GraphService, SystemLifecycleService, graphPath, fs, 'destroy');

        if (!SystemLifecycleService._initPromise) {
            await SystemLifecycleService.initAsync();
        } else {
            await SystemLifecycleService.ready();
        }
    });

    test.beforeEach(async () => {
        if (GraphService.db?.storage) {
            await GraphService.db.storage.clear();
            GraphService.db.storage.db.exec('DELETE FROM GraphLog');
            GraphService.db.nodes.clear();
            GraphService.db.edges.clear();
            GraphService.db.vicinityLoadedNodes.clear();
        }
    });

    test.afterAll(async () => {
        const {cleanupChromaManager, TestLifecycleHelper} = await import('./util.mjs');
        await cleanupChromaManager();
        await TestLifecycleHelper.cleanupGraphService(GraphService, SystemLifecycleService, graphPath, fs, 'destroy');

        if (tmpDir && fs.existsSync(tmpDir)) {
            fs.rmSync(tmpDir, {recursive: true, force: true});
        }
    });

    test('restores exported edges with their required type column intact', async () => {
        GraphService.upsertNode({id: 'graph-backup-source', type: 'TestNode'});
        GraphService.upsertNode({id: 'graph-backup-target', type: 'TestNode'});
        GraphService.linkNodes('graph-backup-source', 'graph-backup-target', 'TEST_RESTORE_EDGE', 0.7, {
            reason: 'unit backup restore proof'
        });

        const db = GraphService.db.storage.db;
        const expectedRecordCount = db.prepare(`
            SELECT
                (SELECT count(*) FROM Nodes) +
                (SELECT count(*) FROM Edges) AS c
        `).get().c;

        expect(expectedRecordCount).toBeGreaterThanOrEqual(3);

        const exportResult = await Memory_DatabaseService.manageDatabaseBackup({
            action    : 'export',
            include   : ['graph'],
            backupPath: tmpDir
        });

        expect(exportResult.message).toContain('graph elements');

        const graphBackupFile = fs.readdirSync(tmpDir)
            .find(file => file.startsWith('graph-backup-') && file.endsWith('.jsonl'));

        expect(graphBackupFile).toBeTruthy();

        const graphBackupPath    = path.join(tmpDir, graphBackupFile);
        const graphBackupContent = fs.readFileSync(graphBackupPath, 'utf8');
        const graphBackupLines   = graphBackupContent.trimEnd().split('\n');
        const graphBackupRecords = graphBackupLines.map(line => JSON.parse(line));

        expect(graphBackupContent.endsWith('\n')).toBe(true);
        expect(graphBackupLines).toHaveLength(expectedRecordCount);
        expect(graphBackupRecords.filter(record => record.type === 'node')).toHaveLength(2);
        expect(graphBackupRecords.filter(record => record.type === 'edge')).toHaveLength(1);
        expect(graphBackupRecords.some(record => record.type === 'edge' && record.data.type === 'TEST_RESTORE_EDGE')).toBe(true);

        db.exec('DELETE FROM Edges; DELETE FROM Nodes;');

        const importResult = await Memory_DatabaseService.manageDatabaseBackup({
            action: 'import',
            file  : graphBackupPath,
            mode  : 'merge'
        });

        expect(importResult.imported).toBeGreaterThanOrEqual(3);

        const restoredEdge = db.prepare(`
            SELECT id, source, target, type, data
            FROM Edges
            WHERE source = ?
              AND target = ?
              AND type = ?
        `).get('graph-backup-source', 'graph-backup-target', 'TEST_RESTORE_EDGE');

        expect(restoredEdge).toBeTruthy();
        expect(restoredEdge.id).toBeTruthy();
        expect(JSON.parse(restoredEdge.data).type).toBe('TEST_RESTORE_EDGE');
    });
});
