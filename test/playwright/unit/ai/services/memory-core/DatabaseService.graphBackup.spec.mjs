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
import {spawnSync}     from 'node:child_process';
import fs              from 'node:fs';
import os              from 'node:os';
import path            from 'node:path';
import Neo             from '../../../../../../src/Neo.mjs';
import * as core       from '../../../../../../src/core/_export.mjs';
import InstanceManager from '../../../../../../src/manager/Instance.mjs';

test.describe('Memory_DatabaseService — graph backup import (#10949)', () => {
    test('restores exported edges with their required type column intact', async () => {
        const tmpDir    = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-graph-backup-'));
        const graphPath = path.join(tmpDir, 'memory-core-graph.sqlite');
        const script    = String.raw`
            await import('./src/Neo.mjs');
            await import('./src/core/_export.mjs');
            await import('./src/manager/Instance.mjs');
            await import('./ai/mcp/server/memory-core/config.template.mjs');

            const GraphService          = (await import('./ai/services/memory-core/GraphService.mjs')).default;
            const MemoryDatabaseService = (await import('./ai/services/memory-core/DatabaseService.mjs')).default;

            await GraphService.ready();
            await MemoryDatabaseService.ready();

            await GraphService.db.storage.clear();
            GraphService.db.storage.db.exec('DELETE FROM GraphLog');
            GraphService.db.nodes.clear();
            GraphService.db.edges.clear();
            GraphService.db.vicinityLoadedNodes.clear();

            GraphService.upsertNode({id: 'graph-backup-source', type: 'TestNode'});
            GraphService.upsertNode({id: 'graph-backup-target', type: 'TestNode'});
            GraphService.linkNodes('graph-backup-source', 'graph-backup-target', 'TEST_RESTORE_EDGE', 0.7, {
                reason: 'unit backup restore proof'
            });

            const db = GraphService.db.storage.db;
            const expectedRecordCount = db.prepare(
                'SELECT (SELECT count(*) FROM Nodes) + (SELECT count(*) FROM Edges) AS c'
            ).get().c;
            const exportResult = await MemoryDatabaseService.manageDatabaseBackup({
                action    : 'export',
                include   : ['graph'],
                backupPath: ${JSON.stringify(tmpDir)}
            });
            const graphBackupFile = (await import('node:fs')).readdirSync(${JSON.stringify(tmpDir)})
                .find(file => file.startsWith('graph-backup-') && file.endsWith('.jsonl'));
            const graphBackupPath    = (await import('node:path')).join(${JSON.stringify(tmpDir)}, graphBackupFile);
            const graphBackupContent = (await import('node:fs')).readFileSync(graphBackupPath, 'utf8');
            const graphBackupLines   = graphBackupContent.trimEnd().split('\n');
            const graphBackupRecords = graphBackupLines.map(line => JSON.parse(line));

            db.exec('DELETE FROM Edges; DELETE FROM Nodes;');

            const importResult = await MemoryDatabaseService.manageDatabaseBackup({
                action: 'import',
                file  : graphBackupPath,
                mode  : 'merge'
            });
            const restoredEdge = db.prepare(
                'SELECT id, source, target, type, data FROM Edges WHERE source = ? AND target = ? AND type = ?'
            ).get('graph-backup-source', 'graph-backup-target', 'TEST_RESTORE_EDGE');

            console.log('GRAPH_BACKUP_RESULT:' + JSON.stringify({
                edgeRecords       : graphBackupRecords.filter(record => record.type === 'edge').length,
                endsWithNewline   : graphBackupContent.endsWith('\n'),
                expectedRecordCount,
                exportedMessage  : exportResult.message,
                graphStats       : exportResult.graph,
                hasTypedEdge     : graphBackupRecords.some(record => record.type === 'edge' && record.data.type === 'TEST_RESTORE_EDGE'),
                imported          : importResult.imported,
                nodeRecords       : graphBackupRecords.filter(record => record.type === 'node').length,
                recordCount       : graphBackupLines.length,
                restoredEdgeData  : restoredEdge && JSON.parse(restoredEdge.data),
                restoredEdgeId    : restoredEdge?.id
            }));
        `;

        try {
            const result = spawnSync(process.execPath, ['--input-type=module', '--eval', script], {
                cwd     : process.cwd(),
                encoding: 'utf8',
                env     : {
                    ...process.env,
                    NEO_MEMORY_DB_PATH_TEST: graphPath,
                    UNIT_TEST_MODE         : 'true'
                },
                timeout: 30_000
            });

            expect(result.error, `${result.stderr}\n${result.stdout}`).toBeUndefined();
            expect(result.status, `${result.stderr}\n${result.stdout}`).toBe(0);

            const output = result.stdout.match(/^GRAPH_BACKUP_RESULT:(.+)$/m);

            expect(output, result.stdout).toBeTruthy();

            const proof = JSON.parse(output[1]);

            expect(proof.expectedRecordCount).toBeGreaterThanOrEqual(3);
            expect(proof.exportedMessage).toContain('graph elements');
            expect(proof.graphStats.expected).toBe(proof.expectedRecordCount);
            expect(proof.graphStats.exported).toBe(proof.expectedRecordCount);
            expect(proof.endsWithNewline).toBe(true);
            expect(proof.recordCount).toBe(proof.expectedRecordCount);
            expect(proof.nodeRecords).toBe(2);
            expect(proof.edgeRecords).toBe(1);
            expect(proof.hasTypedEdge).toBe(true);
            expect(proof.imported).toBeGreaterThanOrEqual(3);
            expect(proof.restoredEdgeId).toBeTruthy();
            expect(proof.restoredEdgeData.type).toBe('TEST_RESTORE_EDGE');
        } finally {
            fs.rmSync(tmpDir, {recursive: true, force: true});
        }
    });

    test('fails loud when graph rows or source counts cannot be read (#16407)', async () => {
        const tmpDir    = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-graph-backup-completeness-'));
        const graphPath = path.join(tmpDir, 'memory-core-graph.sqlite');
        const script    = String.raw`
            await import('./src/Neo.mjs');
            await import('./src/core/_export.mjs');
            await import('./src/manager/Instance.mjs');
            await import('./ai/mcp/server/memory-core/config.template.mjs');

            const GraphService          = (await import('./ai/services/memory-core/GraphService.mjs')).default;
            const MemoryDatabaseService = (await import('./ai/services/memory-core/DatabaseService.mjs')).default;

            await GraphService.ready();
            await MemoryDatabaseService.ready();

            await GraphService.db.storage.clear();
            GraphService.db.storage.db.exec('DELETE FROM GraphLog');
            GraphService.db.nodes.clear();
            GraphService.db.edges.clear();
            GraphService.db.vicinityLoadedNodes.clear();

            const db         = GraphService.db.storage.db;
            const insertNode = db.prepare('INSERT INTO Nodes (id, user_id, data) VALUES (?, ?, ?)');

            insertNode.run('graph-backup-corrupt-source', null, '{invalid-source-json');
            insertNode.run('graph-backup-corrupt-target', null, '{invalid-target-json');
            db.prepare('INSERT INTO Edges (id, user_id, source, target, type, data) VALUES (?, ?, ?, ?, ?, ?)')
                .run(
                    'graph-backup-corrupt-edge',
                    null,
                    'graph-backup-corrupt-source',
                    'graph-backup-corrupt-target',
                    'CORRUPT_BACKUP_EDGE',
                    '{invalid-edge-json'
                );

            let shortfall;
            try {
                const result = await MemoryDatabaseService.exportDatabase({
                    include   : ['graph'],
                    backupPath: ${JSON.stringify(tmpDir)}
                });
                shortfall = {ok: true, result};
            } catch (error) {
                shortfall = {
                    code   : error.code,
                    details: error.details,
                    message: error.message,
                    ok     : false
                }
            }

            db.exec('DELETE FROM Nodes; DROP TABLE Edges;');

            let countRead;
            try {
                const result = await MemoryDatabaseService.exportDatabase({
                    include   : ['graph'],
                    backupPath: ${JSON.stringify(tmpDir)}
                });
                countRead = {ok: true, result};
            } catch (error) {
                countRead = {
                    code   : error.code,
                    details: error.details,
                    message: error.message,
                    ok     : false
                }
            }

            console.log('GRAPH_BACKUP_COMPLETENESS_RESULT:' + JSON.stringify({countRead, shortfall}));
        `;

        try {
            const result = spawnSync(process.execPath, ['--input-type=module', '--eval', script], {
                cwd     : process.cwd(),
                encoding: 'utf8',
                env     : {
                    ...process.env,
                    NEO_MEMORY_DB_PATH_TEST: graphPath,
                    UNIT_TEST_MODE         : 'true'
                },
                timeout: 30_000
            });

            expect(result.error, `${result.stderr}\n${result.stdout}`).toBeUndefined();
            expect(result.status, `${result.stderr}\n${result.stdout}`).toBe(0);

            const output = result.stdout.match(/^GRAPH_BACKUP_COMPLETENESS_RESULT:(.+)$/m);

            expect(output, result.stdout).toBeTruthy();

            const {countRead, shortfall} = JSON.parse(output[1]);

            expect(shortfall.ok).toBe(false);
            expect(shortfall.code).toBe('DATABASE_EXPORT_ERROR');
            expect(shortfall.message).toContain('PARTIAL_COLLECTION_EXPORT: native-graph exported 0/3');
            expect(shortfall.details).toMatchObject({
                collection: 'native-graph',
                expected  : 3,
                exported  : 0,
                skipped   : 3
            });
            expect(shortfall.details.skippedIds).toEqual(expect.arrayContaining([
                'node:graph-backup-corrupt-source',
                'node:graph-backup-corrupt-target',
                'edge:graph-backup-corrupt-edge'
            ]));

            expect(countRead.ok).toBe(false);
            expect(countRead.code).toBe('DATABASE_EXPORT_ERROR');
            expect(countRead.message).toContain('GRAPH_COUNT_QUERY_FAILED');
            expect(countRead.details).toMatchObject({
                collection: 'native-graph',
                stage     : 'count'
            });
        } finally {
            fs.rmSync(tmpDir, {recursive: true, force: true});
        }
    });
});
