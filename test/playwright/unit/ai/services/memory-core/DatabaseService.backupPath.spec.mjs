import {setup} from '../../../../setup.mjs';

const appName = 'MCBackupPathTest';

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

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';
import InstanceManager from '../../../../../../src/manager/Instance.mjs';
import fs             from 'fs';
import path           from 'path';

// Serial mode: see DatabaseService.backup.spec.mjs for rationale (singleton mutation
// across beforeAll/afterAll; local-DX safeguard — CI already uses workers:1).
test.describe.configure({mode: 'serial'});

test.describe('Memory_DatabaseService — backupPath routing (#10129 Phase 2 prerequisite)', () => {
    let SDK, Memory_DatabaseService, Memory_StorageRouter;
    let originalGetMemory, originalGetSummary, tmpDir;

    test.beforeAll(async () => {
        const aiConfig = (await import('../../../../../../ai/mcp/server/memory-core/config.mjs')).default;
        if (!aiConfig.collections) aiConfig.collections = {};
        aiConfig.collections.memory = `test-memory-${process.pid}-${Date.now()}`;
        aiConfig.collections.session = `test-session-${process.pid}-${Date.now()}`;

        SDK                    = await import('../../../../../../ai/services.mjs');
        Memory_DatabaseService = SDK.Memory_DatabaseService;
        Memory_StorageRouter   = SDK.Memory_StorageRouter;

        tmpDir = path.resolve(process.cwd(), 'tmp', `mc-backuppath-test-${process.pid}-${Date.now()}`);
        fs.mkdirSync(tmpDir, {recursive: true});

        originalGetMemory  = Memory_StorageRouter.getMemoryCollection.bind(Memory_StorageRouter);
        originalGetSummary = Memory_StorageRouter.getSummaryCollection.bind(Memory_StorageRouter);
    });

    test.afterAll(async () => {
        const { cleanupChromaManager } = await import('./util.mjs');
        await cleanupChromaManager();

        Memory_StorageRouter.getMemoryCollection  = originalGetMemory;
        Memory_StorageRouter.getSummaryCollection = originalGetSummary;

        if (tmpDir && fs.existsSync(tmpDir)) {
            fs.rmSync(tmpDir, {recursive: true, force: true});
        }
    });

    test('writes memory-backup and summaries-backup JSONL artifacts into the supplied backupPath', async () => {
        const memoryRows = [
            {id: 'mem-1', embedding: [0.1], metadata: {t: 'prompt'},  document: 'doc-1'}
        ];
        const summaryRows = [
            {id: 'sum-1', embedding: [0.2], metadata: {cat: 'feat'}, document: 'sum-doc'}
        ];

        const fakeCollection = (rows, name) => ({
            name,
            count: async () => rows.length,
            get  : async ({include = [], limit, offset = 0} = {}) => {
                if (include.length === 0) return {ids: rows.map(r => r.id)};
                const sliced = rows.slice(offset, offset + (limit ?? rows.length));
                return {
                    ids       : sliced.map(r => r.id),
                    documents : sliced.map(r => r.document),
                    metadatas : sliced.map(r => r.metadata),
                    embeddings: sliced.map(r => r.embedding)
                };
            }
        });

        Memory_StorageRouter.getMemoryCollection  = async () => fakeCollection(memoryRows,  'fake-memories');
        Memory_StorageRouter.getSummaryCollection = async () => fakeCollection(summaryRows, 'fake-summaries');

        const result = await Memory_DatabaseService.manageDatabaseBackup({
            action    : 'export',
            include   : ['memories', 'summaries'],
            backupPath: tmpDir
        });

        expect(result.message).toMatch(/Exported 1 memories, 1 summaries/);

        const produced = fs.readdirSync(tmpDir).filter(f => f.endsWith('.jsonl')).sort();
        expect(produced.length).toBe(2);
        expect(produced.some(f => f.startsWith('memory-backup-'))).toBe(true);
        expect(produced.some(f => f.startsWith('summaries-backup-'))).toBe(true);
    });
});
