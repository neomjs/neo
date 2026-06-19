import {setup} from '../../../../setup.mjs';

const appName = 'MemoryServiceArchiveMemoryNodeTest';

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
 * Coverage for `MemoryService.archiveMemoryNode` — the reversible per-node `archivedAt` archive the
 * miniSummary backfill uses for structurally-un-summarizable rows. Runs against the real
 * in-memory SQLite graph (`unitTestMode` → `storagePaths.graph = ':memory:'`, like the sibling
 * ArchiveByIdentity.PublicRecall spec) so the graph-SQL `json_set` stamp is exercised end-to-end.
 */
test.describe('MemoryService.archiveMemoryNode — reversible per-node archive', () => {
    test.describe.configure({mode: 'serial'});

    let MemoryService, GraphService, LifecycleService;

    test.beforeAll(async () => {
        GraphService     = (await import('../../../../../../ai/services/memory-core/GraphService.mjs')).default;
        MemoryService    = (await import('../../../../../../ai/services/memory-core/MemoryService.mjs')).default;
        LifecycleService = (await import('../../../../../../ai/services/memory-core/lifecycle/SystemLifecycleService.mjs')).default;

        if (!LifecycleService._initPromise) {
            await LifecycleService.initAsync();
        } else {
            await LifecycleService._initPromise;
        }
    });

    const readNode = id => {
        const row = GraphService.db.storage.db.prepare('SELECT data FROM Nodes WHERE id = ?').get(id);
        return row ? JSON.parse(row.data) : null;
    };

    test('archives a live AGENT_MEMORY node (sets archivedAt + archivedReason)', () => {
        const id = 'archive-node-test-live';
        GraphService.db.storage.addNodes([{
            id,
            label     : 'AGENT_MEMORY',
            properties: {agentIdentity: '@x', timestamp: '2026-01-01T00:00:00.000Z'}
        }]);

        expect(readNode(id).properties.archivedAt ?? null).toBeNull();

        expect(MemoryService.archiveMemoryNode({id, reason: 'no-content'})).toBe(true);

        const after = readNode(id).properties;
        expect(after.archivedAt).toBeTruthy();
        expect(after.archivedReason).toBe('no-content');
        // Reversible archive-not-delete: the node + its other properties are retained.
        expect(after.agentIdentity).toBe('@x');
    });

    test('is idempotent — a second archive finds no live row (archivedAt IS NULL guard) → false', () => {
        const id = 'archive-node-test-idem';
        GraphService.db.storage.addNodes([{
            id,
            label     : 'AGENT_MEMORY',
            properties: {agentIdentity: '@y', timestamp: '2026-01-01T00:00:00.000Z'}
        }]);

        expect(MemoryService.archiveMemoryNode({id})).toBe(true);
        expect(MemoryService.archiveMemoryNode({id})).toBe(false);
    });

    test('returns false for a missing id', () => {
        expect(MemoryService.archiveMemoryNode({id: 'archive-node-test-absent'})).toBe(false);
        expect(MemoryService.archiveMemoryNode({})).toBe(false);
    });
});
