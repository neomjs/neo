import {setup} from '../../../../setup.mjs';

const appName = 'MCGraphReplaceReadAtTest';

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

// `markRead` writes `readAt` to graph storage (the WAL carries send-time null by design). A destructive
// `graph.import.replace` from a LAGGED snapshot restores that null and silently reverts committed read receipts.
// This proves the fix in `DatabaseService.importDatabase`: committed graph-owned `DELIVERED_TO` state is captured
// before the replace-mode truncate and re-applied after the restore, so a lagged snapshot cannot clobber an acked `mark_read`.
test.describe('Memory_DatabaseService — graph.import.replace preserves committed DELIVERED_TO readAt (#15448)', () => {
    test('a committed readAt survives a replace-import from a snapshot captured before the mark', async () => {
        const tmpDir    = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-readat-reseed-'));
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

            const messageId   = 'MESSAGE:readat-reseed-proof';
            const recipientId = '@readat-proof-recipient';

            // Seed a delivery whose read receipt has NOT yet been written — this is the state the lagged snapshot captures.
            GraphService.upsertNode({id: messageId,   type: 'MESSAGE'});
            GraphService.upsertNode({id: recipientId, type: 'AgentIdentity'});
            GraphService.linkNodes(messageId, recipientId, 'DELIVERED_TO', 1, {});

            const db          = GraphService.db.storage.db;
            const selectEdge  = () => db.prepare("SELECT id, data FROM Edges WHERE type='DELIVERED_TO' AND source=?").get(messageId);
            const readAtOf    = row => row && (JSON.parse(row.data).properties || {}).readAt;

            // Export NOW: the snapshot carries the DELIVERED_TO edge with readAt null (send-time truth, pre-mark).
            await MemoryDatabaseService.manageDatabaseBackup({action: 'export', include: ['graph'], backupPath: ${JSON.stringify(tmpDir)}});
            const graphBackupFile = (await import('node:fs')).readdirSync(${JSON.stringify(tmpDir)}).find(file => file.startsWith('graph-backup-') && file.endsWith('.jsonl'));
            const graphBackupPath = (await import('node:path')).join(${JSON.stringify(tmpDir)}, graphBackupFile);

            // Simulate markRead committing a read AFTER the snapshot was captured (storage write; the WAL stays null).
            const committedReadAt = '2026-07-18T17:00:00.000Z';
            const edgeBefore      = selectEdge();
            db.prepare("UPDATE Edges SET data = json_set(data, '$.properties.readAt', ?) WHERE id = ?").run(committedReadAt, edgeBefore.id);
            const beforeReadAt = readAtOf(selectEdge());

            // OPERATIONAL re-seed: the caller opts in, so the lagged snapshot's null must not revert the mark.
            const importResult = await MemoryDatabaseService.manageDatabaseBackup({action: 'import', file: graphBackupPath, mode: 'replace', preserveDeliveryReadState: true, confirmation: {sqlitePath: graphPathToken}});
            const edgeAfter = selectEdge();

            // DISASTER-RECOVERY restore: same snapshot, no opt-in. "The backup IS the new state" must hold —
            // preservation is a caller's operational choice, never an implicit rewrite of restore semantics.
            const reMarkEdge = selectEdge();
            db.prepare("UPDATE Edges SET data = json_set(data, '$.properties.readAt', ?) WHERE id = ?").run(committedReadAt, reMarkEdge.id);
            const beforeExactRestore = readAtOf(selectEdge());
            await MemoryDatabaseService.manageDatabaseBackup({action: 'import', file: graphBackupPath, mode: 'replace', confirmation: {sqlitePath: graphPathToken}});
            const exactRestoreReadAt = readAtOf(selectEdge());

            console.log('READAT_RESEED_RESULT:' + JSON.stringify({
                beforeReadAt,
                committedReadAt,
                afterReadAt        : readAtOf(edgeAfter),
                edgePresent        : !!edgeAfter,
                beforeExactRestore,
                exactRestoreReadAt : exactRestoreReadAt ?? null,
                imported           : importResult.imported
            }));
        `.replace(/graphPathToken/g, JSON.stringify(graphPath));

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

            const output = result.stdout.match(/^READAT_RESEED_RESULT:(.+)$/m);

            expect(output, result.stdout).toBeTruthy();

            const proof = JSON.parse(output[1]);

            // Preconditions: the mark committed, and the edge survived the re-seed (it exists in the snapshot).
            expect(proof.beforeReadAt).toBe(proof.committedReadAt);
            expect(proof.edgePresent).toBe(true);

            // The discriminating assertion — RED without the fix (readAt reverts to the snapshot's null),
            // GREEN with it (the committed receipt is re-applied across the truncate).
            expect(proof.afterReadAt).toBe(proof.committedReadAt);

            // The other half of the contract: WITHOUT the opt-in, `replace` still means "the backup IS the
            // new state". Preservation is an operational-re-seed choice the caller makes, never an implicit
            // rewrite of disaster-recovery semantics — a restore that silently kept live state would be a
            // worse defect than the revert this fix exists to prevent.
            expect(proof.beforeExactRestore).toBe(proof.committedReadAt);
            expect(proof.exactRestoreReadAt).toBeNull();
        } finally {
            fs.rmSync(tmpDir, {recursive: true, force: true});
        }
    });
});
