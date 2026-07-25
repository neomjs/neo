import {setup} from '../../../../setup.mjs';

const appName = 'MCImportMergeChromaTest';

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

// Serial mode: rewires singleton StorageRouter collection accessors across tests.
test.describe.configure({mode: 'serial'});

test.describe('Memory_DatabaseService — Chroma preserve-live parity for #importMemories (#11144)', () => {
    let SDK, Memory_DatabaseService, Memory_StorageRouter;
    let originalGetMemory, originalGetSummary, tmpDir;
    let validEmbedding;

    /**
     * Builds a recording fake Chroma collection used by the spec to assert that:
     *   - merge mode preflights via `get({ids})` and only `add()`s missing-IDs
     *   - replace mode calls `upsert()` for the full record set
     *   - live records (in `liveIds`) survive a colliding merge import
     */
    function buildFakeCollection({name, liveIds = []}) {
        const live        = new Set(liveIds);
        const addCalls    = [];
        const calls       = [];
        const upsertCalls = [];

        return {
            name,
            _live: live,
            addCalls,
            calls,
            upsertCalls,
            get  : async ({ids = [], include}) => {
                calls.push({type: 'get', ids: [...ids]});
                // Existence-check shape: `get({ids, include: []})` — return live overlap.
                const overlap = ids.filter(id => live.has(id));
                return {ids: overlap};
            },
            add: async (payload) => {
                addCalls.push(payload);
                calls.push({type: 'add', ids: [...payload.ids]});
                // Merge mode contract: `add()` rejects on duplicate ID (Chroma's
                // insert-only primitive). Assert that here so a regression in the
                // preflight filter would surface as a test failure.
                for (const id of payload.ids) {
                    if (live.has(id)) {
                        throw new Error(`add() called with already-live id ${id} — preflight filter regression`);
                    }
                    live.add(id);
                }
            },
            upsert: async (payload) => {
                upsertCalls.push(payload);
                calls.push({type: 'upsert', ids: [...payload.ids]});
                for (const id of payload.ids) {
                    live.add(id);
                }
            }
        };
    }

    function writeJsonl(filePath, records) {
        const stream = fs.createWriteStream(filePath);
        for (const r of records) {
            stream.write(JSON.stringify(r) + '\n');
        }
        return new Promise(resolve => stream.end(resolve));
    }

    test.beforeAll(async () => {
        const aiConfig = (await import('../../../../../../ai/mcp/server/memory-core/config.template.mjs')).default;
        // Isolation is by construction: `collections.*` already resolve to per-process randomized
        // `test-*` names under `UNIT_TEST_MODE`, and Chroma isolates one level higher still, at the
        // database (`databaseTest`). Repointing the shared singleton duplicated that with a coarser
        // generator and left the names pointing here for the rest of the worker's life.

        // The atomic vector-write invariant validates each imported row's embedding length against the
        // resolved aiConfig.vectorDimension. Build fixtures AT that dimension (READ it, never mutate — the
        // reactive Provider SSOT must not be written from a test) so they pass the gate authentically.
        validEmbedding = new Array(aiConfig.vectorDimension).fill(0);

        SDK                    = await import('../../../../../../ai/services.mjs');
        Memory_DatabaseService = SDK.Memory_DatabaseService;
        Memory_StorageRouter   = SDK.Memory_StorageRouter;

        tmpDir = path.resolve(process.cwd(), 'tmp', `mc-import-merge-${process.pid}-${Date.now()}`);
        fs.mkdirSync(tmpDir, {recursive: true});

        originalGetMemory  = Memory_StorageRouter.getMemoryCollection.bind(Memory_StorageRouter);
        originalGetSummary = Memory_StorageRouter.getSummaryCollection.bind(Memory_StorageRouter);
    });

    test.afterAll(async () => {
        const {cleanupChromaManager} = await import('./util.mjs');
        await cleanupChromaManager();

        Memory_StorageRouter.getMemoryCollection  = originalGetMemory;
        Memory_StorageRouter.getSummaryCollection = originalGetSummary;

        if (tmpDir && fs.existsSync(tmpDir)) {
            fs.rmSync(tmpDir, {recursive: true, force: true});
        }
    });

    test('merge mode: ID collision preserves live record + only missing IDs get add()', async () => {
        // Live state: mem-1 + mem-2 already exist; backup brings mem-1 (collision)
        // + mem-3 + mem-4 (new). Expect 1 skipped, 2 inserted, 0 failed; the add()
        // call must contain only [mem-3, mem-4] — never the colliding mem-1.
        const memoryCollection = buildFakeCollection({name: 'fake-memories', liveIds: ['mem-1', 'mem-2']});
        Memory_StorageRouter.getMemoryCollection  = async () => memoryCollection;
        Memory_StorageRouter.getSummaryCollection = async () => buildFakeCollection({name: 'fake-summaries'});

        const backupFile = path.join(tmpDir, `memory-backup-merge-collision-${Date.now()}.jsonl`);
        await writeJsonl(backupFile, [
            {id: 'mem-1', embedding: validEmbedding, metadata: {tag: 'BACKUP'}, document: 'backup-doc-for-mem-1'},
            {id: 'mem-3', embedding: validEmbedding, metadata: {tag: 'NEW'},    document: 'new-doc-mem-3'},
            {id: 'mem-4', embedding: validEmbedding, metadata: {tag: 'NEW'},    document: 'new-doc-mem-4'}
        ]);

        const result = await Memory_DatabaseService.manageDatabaseBackup({
            action: 'import',
            file  : backupFile,
            mode  : 'merge'
        });

        expect(result.mode).toBe('merge');
        expect(result.imported).toBe(2);
        expect(result.counts.memories.inserted).toBe(2);
        expect(result.counts.memories.skippedExisting).toBe(1);
        expect(result.counts.memories.failed).toBe(0);
        expect(result.counts.memoriesInserted).toBe(2);

        // add() called exactly once with only the missing IDs
        expect(memoryCollection.addCalls.length).toBe(1);
        expect(memoryCollection.addCalls[0].ids.sort()).toEqual(['mem-3', 'mem-4']);

        // upsert() never invoked in merge mode
        expect(memoryCollection.upsertCalls.length).toBe(0);
    });

    test('merge mode: full collision = zero inserted, all skipped, add() never invoked', async () => {
        const memoryCollection = buildFakeCollection({name: 'fake-memories', liveIds: ['mem-1', 'mem-2']});
        Memory_StorageRouter.getMemoryCollection  = async () => memoryCollection;
        Memory_StorageRouter.getSummaryCollection = async () => buildFakeCollection({name: 'fake-summaries'});

        const backupFile = path.join(tmpDir, `memory-backup-merge-full-collide-${Date.now()}.jsonl`);
        await writeJsonl(backupFile, [
            {id: 'mem-1', embedding: validEmbedding, metadata: {tag: 'B'}, document: 'b1'},
            {id: 'mem-2', embedding: validEmbedding, metadata: {tag: 'B'}, document: 'b2'}
        ]);

        const result = await Memory_DatabaseService.manageDatabaseBackup({
            action: 'import',
            file  : backupFile,
            mode  : 'merge'
        });

        expect(result.counts.memories.inserted).toBe(0);
        expect(result.counts.memories.skippedExisting).toBe(2);
        expect(memoryCollection.addCalls.length).toBe(0);
    });

    test('merge mode: no collision = all inserted via add(), zero skipped', async () => {
        const memoryCollection = buildFakeCollection({name: 'fake-memories', liveIds: []});
        Memory_StorageRouter.getMemoryCollection  = async () => memoryCollection;
        Memory_StorageRouter.getSummaryCollection = async () => buildFakeCollection({name: 'fake-summaries'});

        const backupFile = path.join(tmpDir, `memory-backup-merge-no-collide-${Date.now()}.jsonl`);
        await writeJsonl(backupFile, [
            {id: 'fresh-1', embedding: validEmbedding, metadata: {tag: 'N'}, document: 'f1'},
            {id: 'fresh-2', embedding: validEmbedding, metadata: {tag: 'N'}, document: 'f2'}
        ]);

        const result = await Memory_DatabaseService.manageDatabaseBackup({
            action: 'import',
            file  : backupFile,
            mode  : 'merge'
        });

        expect(result.counts.memories.inserted).toBe(2);
        expect(result.counts.memories.skippedExisting).toBe(0);
        expect(memoryCollection.addCalls[0].ids.sort()).toEqual(['fresh-1', 'fresh-2']);
        expect(memoryCollection.upsertCalls.length).toBe(0);
    });

    test('merge mode: each 250-row existence check is followed by its write before the next batch', async () => {
        const memoryCollection = buildFakeCollection({name: 'fake-memories', liveIds: []});
        Memory_StorageRouter.getMemoryCollection  = async () => memoryCollection;
        Memory_StorageRouter.getSummaryCollection = async () => buildFakeCollection({name: 'fake-summaries'});

        const backupFile = path.join(tmpDir, `memory-backup-bounded-merge-${Date.now()}.jsonl`);
        const records    = Array.from({length: 501}, (_, index) => ({
            id       : `bounded-${index}`,
            embedding: validEmbedding,
            metadata : {index},
            document : `document-${index}`
        }));
        await writeJsonl(backupFile, records);

        const result = await Memory_DatabaseService.manageDatabaseBackup({
            action: 'import',
            file  : backupFile,
            mode  : 'merge'
        });

        expect(result.imported).toBe(501);
        expect(memoryCollection.calls.map(call => call.type)).toEqual([
            'get', 'add',
            'get', 'add',
            'get', 'add'
        ]);
        expect(memoryCollection.calls.map(call => call.ids.length)).toEqual([250, 250, 250, 250, 1, 1]);
        expect(Math.max(...memoryCollection.calls.map(call => call.ids.length))).toBe(250);
    });

    test('merge mode: atomic vector-write invariant rejects rows lacking a valid same-dimension vector', async () => {
        // The gate (non-reEmbed) must reject missing / empty / wrong-dimension embeddings fail-loud, so a
        // metadata-only row is never half-persisted (the corruption shape the invariant exists to prevent).
        // expectedDimension is the resolved aiConfig.vectorDimension; only a same-dimension finite vector is valid.
        const memoryCollection = buildFakeCollection({name: 'fake-memories', liveIds: []});
        Memory_StorageRouter.getMemoryCollection  = async () => memoryCollection;
        Memory_StorageRouter.getSummaryCollection = async () => buildFakeCollection({name: 'fake-summaries'});

        const backupFile = path.join(tmpDir, `memory-backup-vector-invariant-${Date.now()}.jsonl`);
        await writeJsonl(backupFile, [
            {id: 'gate-valid',    embedding: validEmbedding,      metadata: {tag: 'OK'},  document: 'valid'},
            {id: 'gate-wrongdim', embedding: [0.1, 0.2], metadata: {tag: 'BAD'}, document: 'wrong-dim'},
            {id: 'gate-empty',    embedding: [],         metadata: {tag: 'BAD'}, document: 'empty'},
            {id: 'gate-missing',  metadata: {tag: 'BAD'}, document: 'no-embedding'}
        ]);

        const result = await Memory_DatabaseService.manageDatabaseBackup({
            action: 'import',
            file  : backupFile,
            mode  : 'merge'
        });

        // Only the valid row persists; the 3 invalid rows are rejected fail-loud (counted failed, never added).
        expect(result.counts.memories.inserted).toBe(1);
        expect(result.counts.memories.failed).toBe(3);
        expect(memoryCollection.addCalls.length).toBe(1);
        expect(memoryCollection.addCalls[0].ids).toEqual(['gate-valid']);
    });

    test('replace mode: any invalid vector fails the whole import before truncate — replace is all-or-nothing', async () => {
        // The pre-truncate full-source gate makes replace-mode semantics all-or-nothing: a partial
        // replace is a corrupted restore, so one invalid row rejects the entire source BEFORE the
        // truncate, instead of partitioning valid rows through after the wipe.
        const memoryCollection = buildFakeCollection({name: 'fake-memories', liveIds: []});
        Memory_StorageRouter.getMemoryCollection  = async () => memoryCollection;
        Memory_StorageRouter.getSummaryCollection = async () => buildFakeCollection({name: 'fake-summaries'});

        let   truncateCalls    = 0;
        const originalTruncate = Memory_DatabaseService.truncateDatabase.bind(Memory_DatabaseService);
        Memory_DatabaseService.truncateDatabase = async (...args) => {
            truncateCalls++;
            return {message: 'stubbed — must never be reached'};
        };

        try {
            const backupFile = path.join(tmpDir, `memory-backup-replace-gate-${Date.now()}.jsonl`);
            await writeJsonl(backupFile, [
                {id: 'r-valid',    embedding: validEmbedding,      metadata: {tag: 'OK'},  document: 'valid'},
                {id: 'r-wrongdim', embedding: [0.1, 0.2], metadata: {tag: 'BAD'}, document: 'wrong-dim'},
                {id: 'r-missing',  metadata: {tag: 'BAD'}, document: 'no-embedding'}
            ]);

            await expect(Memory_DatabaseService.manageDatabaseBackup({
                action: 'import',
                file  : backupFile,
                mode  : 'replace'
            })).rejects.toThrow(/Source validation failed.*wrong-dimension/);

            expect(truncateCalls).toBe(0);
            expect(memoryCollection.upsertCalls.length).toBe(0);
            expect(memoryCollection.addCalls.length).toBe(0);
        } finally {
            Memory_DatabaseService.truncateDatabase = originalTruncate;
        }
    });

    test('replace mode: a corrupt FINAL row proves the full source BEFORE any truncate or write', async () => {
        const memoryCollection = buildFakeCollection({name: 'fake-memories', liveIds: []});
        Memory_StorageRouter.getMemoryCollection  = async () => memoryCollection;
        Memory_StorageRouter.getSummaryCollection = async () => buildFakeCollection({name: 'fake-summaries'});

        let   truncateCalls    = 0;
        const originalTruncate = Memory_DatabaseService.truncateDatabase.bind(Memory_DatabaseService);
        Memory_DatabaseService.truncateDatabase = async (...args) => {
            truncateCalls++;
            return {message: 'stubbed — must never be reached'};
        };

        try {
            const backupFile = path.join(tmpDir, `memory-backup-corrupt-final-${Date.now()}.jsonl`);
            await writeJsonl(backupFile, [
                {id: 'ok-1', embedding: validEmbedding, metadata: {tag: 'OK'}, document: 'valid'},
                {id: 'ok-2', embedding: validEmbedding, metadata: {tag: 'OK'}, document: 'valid'},
                {id: 'corrupt-final', embedding: [0.1, 0.2], metadata: {tag: 'BAD'}, document: 'wrong-dim'}
            ]);

            await expect(Memory_DatabaseService.manageDatabaseBackup({
                action: 'import',
                file  : backupFile,
                mode  : 'replace'
            })).rejects.toThrow(/Source validation failed.*wrong-dimension/);

            expect(truncateCalls).toBe(0);
            expect(memoryCollection.upsertCalls.length).toBe(0);
            expect(memoryCollection.addCalls.length).toBe(0);
        } finally {
            Memory_DatabaseService.truncateDatabase = originalTruncate;
        }
    });

    test('replace mode: upsert() called for full record set; merge-mode counters stay 0', async () => {
        const memoryCollection = buildFakeCollection({name: 'fake-memories', liveIds: ['mem-1']});
        Memory_StorageRouter.getMemoryCollection  = async () => memoryCollection;
        Memory_StorageRouter.getSummaryCollection = async () => buildFakeCollection({name: 'fake-summaries'});

        // truncateDatabase routes through CollectionProxy.drop() against the real
        // production path's destructive-operation guard. The guard is
        // covered by restore-hardening.spec.mjs and is not what this test verifies;
        // stub it to a no-op so we exercise the post-truncate upsert branch in
        // isolation. Restored at end of test.
        const originalTruncate = Memory_DatabaseService.truncateDatabase.bind(Memory_DatabaseService);
        Memory_DatabaseService.truncateDatabase = async () => ({message: 'stubbed for replace-mode upsert test'});

        try {
            const backupFile = path.join(tmpDir, `memory-backup-replace-${Date.now()}.jsonl`);
            await writeJsonl(backupFile, [
                {id: 'mem-1', embedding: validEmbedding, metadata: {tag: 'R'}, document: 'r1'},
                {id: 'mem-2', embedding: validEmbedding, metadata: {tag: 'R'}, document: 'r2'}
            ]);

            const result = await Memory_DatabaseService.manageDatabaseBackup({
                action: 'import',
                file  : backupFile,
                mode  : 'replace'
            });

            expect(result.mode).toBe('replace');
            expect(memoryCollection.upsertCalls.length).toBe(1);
            expect(memoryCollection.upsertCalls[0].ids.sort()).toEqual(['mem-1', 'mem-2']);
            // skippedExisting stays 0 in replace mode (no preflight)
            expect(result.counts.memories.skippedExisting).toBe(0);
            expect(result.counts.memories.inserted).toBe(2);
            // add() is the merge-mode primitive; never called in replace mode
            expect(memoryCollection.addCalls.length).toBe(0);
        } finally {
            Memory_DatabaseService.truncateDatabase = originalTruncate;
        }
    });

    test('replace mode: streams 501 records through bounded 250-row upserts', async () => {
        const memoryCollection = buildFakeCollection({name: 'fake-memories', liveIds: []});
        Memory_StorageRouter.getMemoryCollection  = async () => memoryCollection;
        Memory_StorageRouter.getSummaryCollection = async () => buildFakeCollection({name: 'fake-summaries'});

        const originalTruncate = Memory_DatabaseService.truncateDatabase.bind(Memory_DatabaseService);
        Memory_DatabaseService.truncateDatabase = async () => ({message: 'stubbed for bounded replace test'});

        try {
            const backupFile = path.join(tmpDir, `memory-backup-bounded-replace-${Date.now()}.jsonl`);
            const records    = Array.from({length: 501}, (_, index) => ({
                id       : `replace-${index}`,
                embedding: validEmbedding,
                metadata : {index},
                document : `document-${index}`
            }));
            await writeJsonl(backupFile, records);

            const result = await Memory_DatabaseService.manageDatabaseBackup({
                action: 'import',
                file  : backupFile,
                mode  : 'replace'
            });

            expect(result.imported).toBe(501);
            expect(memoryCollection.calls.map(call => call.type)).toEqual(['upsert', 'upsert', 'upsert']);
            expect(memoryCollection.upsertCalls.map(call => call.ids.length)).toEqual([250, 250, 1]);
        } finally {
            Memory_DatabaseService.truncateDatabase = originalTruncate;
        }
    });

    test('merge mode: summaries follow the same preserve-live pattern', async () => {
        const summariesCollection = buildFakeCollection({name: 'fake-summaries', liveIds: ['sum-1', 'sum-2']});
        Memory_StorageRouter.getMemoryCollection  = async () => buildFakeCollection({name: 'fake-memories'});
        Memory_StorageRouter.getSummaryCollection = async () => summariesCollection;

        const backupFile = path.join(tmpDir, `summaries-backup-merge-${Date.now()}.jsonl`);
        await writeJsonl(backupFile, [
            {id: 'sum-1', embedding: validEmbedding, metadata: {tag: 'B'}, document: 'b1'}, // collides
            {id: 'sum-3', embedding: validEmbedding, metadata: {tag: 'N'}, document: 'n3'}, // new
            {id: 'sum-4', embedding: validEmbedding, metadata: {tag: 'N'}, document: 'n4'}  // new
        ]);

        const result = await Memory_DatabaseService.manageDatabaseBackup({
            action: 'import',
            file  : backupFile,
            mode  : 'merge'
        });

        expect(result.counts.summaries.inserted).toBe(2);
        expect(result.counts.summaries.skippedExisting).toBe(1);
        expect(result.counts.summaries.failed).toBe(0);
        // memories bucket stays untouched when only summaries-backup was imported
        expect(result.counts.memories.inserted).toBe(0);
        expect(result.counts.memories.skippedExisting).toBe(0);

        expect(summariesCollection.addCalls.length).toBe(1);
        expect(summariesCollection.addCalls[0].ids.sort()).toEqual(['sum-3', 'sum-4']);
    });

    test('return shape exposes structured counts for memories + summaries + backward-compat memoriesInserted', async () => {
        const memoryCollection    = buildFakeCollection({name: 'fake-memories'});
        const summariesCollection = buildFakeCollection({name: 'fake-summaries'});
        Memory_StorageRouter.getMemoryCollection  = async () => memoryCollection;
        Memory_StorageRouter.getSummaryCollection = async () => summariesCollection;

        const memoryFile = path.join(tmpDir, `memory-backup-shape-${Date.now()}.jsonl`);
        await writeJsonl(memoryFile, [
            {id: 'shape-mem-1', embedding: validEmbedding, metadata: {}, document: 'd1'}
        ]);

        const result = await Memory_DatabaseService.manageDatabaseBackup({
            action: 'import',
            file  : memoryFile,
            mode  : 'merge'
        });

        // Structured per-substrate breakdown
        expect(result.counts).toBeDefined();
        expect(result.counts.graph).toBeNull(); // no graph file in this batch
        expect(result.counts.memories).toEqual({inserted: 1, skippedExisting: 0, failed: 0});
        expect(result.counts.summaries).toEqual({inserted: 0, skippedExisting: 0, failed: 0});

        // Backward-compat aggregate: memoriesInserted = memories.inserted + summaries.inserted
        expect(result.counts.memoriesInserted).toBe(1);

        // Top-level `imported` and `mode` remain part of the public import-result contract.
        expect(result.imported).toBe(1);
        expect(result.mode).toBe('merge');
    });
});
