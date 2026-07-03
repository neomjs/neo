import {setup} from '../../../../setup.mjs';

setup({
    appConfig: {
        name: 'AiPurgeNoContentGraphMemoriesTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';
import Database       from 'better-sqlite3';

import {
    APPLY_CONFIRMATION_TOKEN,
    buildCleanupPlan,
    collectExistingMemoryIds,
    listArchivedNoContentMemoryRows,
    runNoContentGraphMemoryCleanup
} from '../../../../../../ai/scripts/maintenance/purgeNoContentGraphMemories.mjs';

/**
 * @summary Regression coverage for the archived no-content graph cleanup.
 */
test.describe('purgeNoContentGraphMemories.mjs', () => {
    let db;

    test.beforeEach(() => {
        db = new Database(':memory:');
        db.pragma('foreign_keys = ON');
        db.exec(`
            CREATE TABLE Nodes (
                id TEXT PRIMARY KEY,
                data TEXT NOT NULL
            );
            CREATE TABLE Edges (
                id TEXT PRIMARY KEY,
                source TEXT NOT NULL,
                target TEXT NOT NULL,
                type TEXT NOT NULL,
                data TEXT NOT NULL,
                FOREIGN KEY (source) REFERENCES Nodes(id) ON DELETE CASCADE,
                FOREIGN KEY (target) REFERENCES Nodes(id) ON DELETE CASCADE
            );
        `);
    });

    test.afterEach(() => {
        db?.close();
        db = null;
    });

    function insertNode(id, label, properties = {}) {
        db.prepare('INSERT INTO Nodes(id, data) VALUES (?, ?)').run(id, JSON.stringify({
            id,
            label,
            properties
        }));
    }

    function insertMemory(id, properties = {}) {
        insertNode(id, 'AGENT_MEMORY', {
            sessionId     : 'session-1',
            agentIdentity : '@neo-gpt',
            timestamp     : '2026-06-20T22:00:00.000Z',
            archivedAt    : '2026-06-20T22:01:00.000Z',
            archivedReason: 'no-content',
            ...properties
        });
    }

    function fakeCollection(existingIds = []) {
        const existing = new Set(existingIds);

        return {
            get: async ({ids}) => ({
                ids: ids.filter(id => existing.has(id))
            })
        };
    }

    test('selects only archived AGENT_MEMORY rows with archivedReason no-content', () => {
        insertMemory('memory-delete');
        insertMemory('memory-blank-reason', {archivedReason: ''});
        insertMemory('memory-live', {archivedAt: null, archivedReason: null});
        insertNode('summary_session-1', 'SESSION_SUMMARY', {sessionId: 'session-1'});

        const rows = listArchivedNoContentMemoryRows({db});

        expect(rows.map(row => row.id)).toEqual(['memory-delete']);
    });

    test('protects archived no-content rows when Chroma content still exists', async () => {
        insertMemory('memory-delete');
        insertMemory('memory-protect', {sessionId: 'session-2'});
        db.prepare('INSERT INTO Edges(id, source, target, type, data) VALUES (?, ?, ?, ?, ?)').run(
            'edge-1', 'memory-delete', 'memory-protect', 'RELATED_TO', '{}'
        );

        const plan = await buildCleanupPlan({
            db,
            collection: fakeCollection(['memory-protect'])
        });

        expect(plan.scannedArchivedNoContent).toBe(2);
        expect(plan.protectedWithChromaContent).toBe(1);
        expect(plan.deletableNodes).toBe(1);
        expect(plan.nodeIds).toEqual(['memory-delete']);
        expect(plan.incidentEdges).toBe(1);
    });

    test('collectExistingMemoryIds chunks collection probes', async () => {
        const calls = [];
        const collection = {
            get: async ({ids}) => {
                calls.push(ids);
                return {ids: ids.filter(id => id.endsWith('2'))};
            }
        };

        const existing = await collectExistingMemoryIds({
            collection,
            ids      : ['memory-1', 'memory-2', 'memory-3', 'memory-4'],
            chunkSize: 2
        });

        expect(calls).toEqual([
            ['memory-1', 'memory-2'],
            ['memory-3', 'memory-4']
        ]);
        expect([...existing]).toEqual(['memory-2']);
    });

    test('dry-run reports deletable rows without removing graph nodes', async () => {
        insertMemory('memory-delete');

        const removed = [];
        const result = await runNoContentGraphMemoryCleanup({
            lifecycle   : {ready: async () => {}},
            graphService: {
                initAsync  : async () => {},
                db         : {storage: {db}},
                removeNodes: ids => removed.push(...ids)
            },
            collection: fakeCollection(),
            logger    : {log: () => {}}
        });

        expect(result.dryRun).toBe(true);
        expect(result.deletableNodes).toBe(1);
        expect(result.deletedNodes).toBe(0);
        expect(removed).toEqual([]);
        expect(db.prepare('SELECT COUNT(*) AS count FROM Nodes').get().count).toBe(1);
    });

    test('apply requires the explicit operator confirmation token', async () => {
        await expect(runNoContentGraphMemoryCleanup({
            apply       : true,
            confirmation: 'wrong-token',
            lifecycle   : {ready: async () => {}},
            graphService: {db: {storage: {db}}},
            collection  : fakeCollection(),
            logger      : {log: () => {}}
        })).rejects.toThrow(APPLY_CONFIRMATION_TOKEN);
    });

    test('apply deletes through graphService.removeNodes and cascades incident edges', async () => {
        insertMemory('memory-delete');
        insertNode('memory-other', 'AGENT_MEMORY', {sessionId: 'session-2'});
        db.prepare('INSERT INTO Edges(id, source, target, type, data) VALUES (?, ?, ?, ?, ?)').run(
            'edge-1', 'memory-delete', 'memory-other', 'RELATED_TO', '{}'
        );

        const removed = [];
        const result = await runNoContentGraphMemoryCleanup({
            apply       : true,
            confirmation: APPLY_CONFIRMATION_TOKEN,
            lifecycle   : {ready: async () => {}},
            graphService: {
                initAsync  : async () => {},
                db         : {storage: {db}},
                removeNodes: ids => {
                    removed.push(...ids);
                    for (const id of ids) {
                        db.prepare('DELETE FROM Nodes WHERE id = ?').run(id);
                    }
                }
            },
            collection: fakeCollection(),
            logger    : {log: () => {}}
        });

        expect(result.deletedNodes).toBe(1);
        expect(removed).toEqual(['memory-delete']);
        expect(db.prepare('SELECT id FROM Nodes ORDER BY id ASC').all().map(row => row.id)).toEqual(['memory-other']);
        expect(db.prepare('SELECT COUNT(*) AS count FROM Edges').get().count).toBe(0);
    });
});
