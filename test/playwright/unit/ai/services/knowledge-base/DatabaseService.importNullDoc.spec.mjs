import {setup} from '../../../../setup.mjs';

const appName = 'KBImportNullDocTest';

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
import fsExtra         from 'fs-extra';
import path            from 'path';
import {Readable}      from 'stream';

// Serial: this spec mutates KB_ChromaManager.getKnowledgeBaseCollection singleton via beforeAll.
test.describe.configure({mode: 'serial'});

test.describe('KB_DatabaseService.importDatabase — null-document handling (#11653)', () => {
    let SDK, KB_DatabaseService, KB_ChromaManager;
    let originalGetCollection, tmpDir;
    let capturedUpsertCalls;

    test.beforeAll(async () => {
        SDK                = await import('../../../../../../ai/services.mjs');
        KB_DatabaseService = SDK.KB_DatabaseService;
        KB_ChromaManager   = SDK.KB_ChromaManager;

        tmpDir = path.resolve(process.cwd(), 'tmp', `kb-import-null-doc-${process.pid}-${Date.now()}`);
        fs.mkdirSync(tmpDir, {recursive: true});

        originalGetCollection = KB_ChromaManager.getKnowledgeBaseCollection.bind(KB_ChromaManager);
    });

    test.beforeEach(() => {
        capturedUpsertCalls = [];

        const mockCollection = {
            upsert: async (args) => { capturedUpsertCalls.push(args); }
        };

        KB_ChromaManager.getKnowledgeBaseCollection = async () => mockCollection;
    });

    test.afterAll(async () => {
        KB_ChromaManager.getKnowledgeBaseCollection = originalGetCollection;

        if (tmpDir && fs.existsSync(tmpDir)) {
            fs.rmSync(tmpDir, {recursive: true, force: true});
        }
    });

    /**
     * Writes a JSONL file in the per-test tmp dir from an array of records.
     * Returns the absolute file path.
     */
    function writeBackupFile(name, records) {
        const filePath = path.join(tmpDir, name);
        fs.writeFileSync(filePath, records.map(r => JSON.stringify(r)).join('\n') + '\n');
        return filePath;
    }


    // Full-dimension vectors: the atomic vector-write invariant gates every imported KB row, so
    // fixtures must satisfy the real contract (the mock collection ignores the values themselves).
    const DIM = 4096;
    function vec(seed = 0.1) {
        return new Array(DIM).fill(seed)
    }

    test('omits documents field when every record in batch has document: null (KB steady-state shape)', async () => {
        const filePath = writeBackupFile('kb-all-null.jsonl', [
            {id: 'id-1', embedding: vec(0.1), metadata: {kind: 'class', content: 'class A {}'}, document: null},
            {id: 'id-2', embedding: vec(0.3), metadata: {kind: 'method', content: 'method foo()'}, document: null},
            {id: 'id-3', embedding: vec(0.5), metadata: {kind: 'module', content: 'export default {}'}, document: null}
        ]);

        const result = await KB_DatabaseService.importDatabase({
            action: 'import',
            file  : filePath,
            mode  : 'merge'
        });

        expect(result.imported).toBe(3);
        expect(capturedUpsertCalls).toHaveLength(1);

        const upsert = capturedUpsertCalls[0];
        expect(upsert.ids).toEqual(['id-1', 'id-2', 'id-3']);
        expect(upsert.embeddings).toHaveLength(3);
        expect(upsert.metadatas).toHaveLength(3);
        // The `documents` field MUST be absent from the upsert payload when every
        // record's document is null. Passing [null,null,null] makes Chroma reject
        // the request with "Expected each document to be a string, but got object".
        expect('documents' in upsert).toBe(false);
    });

    test('includes documents field with strings when every record carries a non-null document (MC-style records)', async () => {
        const filePath = writeBackupFile('kb-all-strings.jsonl', [
            {id: 'id-1', embedding: vec(0.1), metadata: {kind: 'memory'}, document: 'memory body 1'},
            {id: 'id-2', embedding: vec(0.3), metadata: {kind: 'memory'}, document: 'memory body 2'}
        ]);

        const result = await KB_DatabaseService.importDatabase({
            action: 'import',
            file  : filePath,
            mode  : 'merge'
        });

        expect(result.imported).toBe(2);
        const upsert = capturedUpsertCalls[0];
        expect(upsert.documents).toEqual(['memory body 1', 'memory body 2']);
    });

    test('substitutes empty strings for null documents in mixed batch (defensive — preserves field for non-null entries)', async () => {
        const filePath = writeBackupFile('kb-mixed.jsonl', [
            {id: 'id-1', embedding: vec(0.1), metadata: {kind: 'class'},   document: null},
            {id: 'id-2', embedding: vec(0.3), metadata: {kind: 'memory'},  document: 'memory body'},
            {id: 'id-3', embedding: vec(0.5), metadata: {kind: 'class'},   document: null}
        ]);

        const result = await KB_DatabaseService.importDatabase({
            action: 'import',
            file  : filePath,
            mode  : 'merge'
        });

        expect(result.imported).toBe(3);
        const upsert = capturedUpsertCalls[0];
        // Every element must be a string for Chroma; nulls become empty strings.
        expect(upsert.documents).toEqual(['', 'memory body', '']);
    });

    test('handles batch boundary correctly — 501 all-null records (BATCH_SIZE=500) still omits documents on both batches', async () => {
        const records = [];
        for (let i = 0; i < 501; i++) {
            records.push({id: `id-${i}`, embedding: vec(i), metadata: {n: i}, document: null});
        }
        const filePath = writeBackupFile('kb-501-null.jsonl', records);

        const result = await KB_DatabaseService.importDatabase({
            action: 'import',
            file  : filePath,
            mode  : 'merge'
        });

        expect(result.imported).toBe(501);
        expect(capturedUpsertCalls).toHaveLength(2);
        // Both batches must omit `documents` since every record is null.
        for (const upsert of capturedUpsertCalls) {
            expect('documents' in upsert).toBe(false);
        }
        // Verify batching boundary: first batch has 500 ids, second has 1.
        expect(capturedUpsertCalls[0].ids).toHaveLength(500);
        expect(capturedUpsertCalls[1].ids).toHaveLength(1);
    });

    test('flushes the first 500 rows before the JSONL stream reaches EOF', async () => {
        const filePath = path.join(tmpDir, 'kb-gated-stream.jsonl');
        fs.writeFileSync(filePath, 'stream content is supplied by the gated fixture\n');

        const headRecords = Array.from({length: 500}, (_, index) => ({
            id       : `head-${index}`,
            embedding: [index],
            metadata : {index},
            document : null
        }));
        const tailRecord = {id: 'tail-500', embedding: [500], metadata: {index: 500}, document: null};

        let releaseTail;
        const tailGate                 = new Promise(resolve => { releaseTail = resolve; });
        const originalCreateReadStream = fsExtra.createReadStream;

        fsExtra.createReadStream = () => Readable.from((async function * gatedJsonl() {
            for (const record of headRecords) {
                yield `${JSON.stringify(record)}\n`;
            }

            // A whole-file materializer deadlocks here because only the first store
            // write releases EOF. A streaming importer flushes row 500, then proceeds.
            await tailGate;
            yield `${JSON.stringify(tailRecord)}\n`;
        })());

        KB_ChromaManager.getKnowledgeBaseCollection = async () => ({
            upsert: async args => {
                capturedUpsertCalls.push(args);
                if (capturedUpsertCalls.length === 1) releaseTail();
            }
        });

        let timeoutId;
        try {
            const result = await Promise.race([
                KB_DatabaseService.importDatabase({file: filePath, mode: 'merge'}),
                new Promise((_, reject) => {
                    timeoutId = setTimeout(() => reject(new Error('first KB batch was not flushed before EOF')), 5000);
                })
            ]);

            expect(result.imported).toBe(501);
            expect(capturedUpsertCalls.map(call => call.ids.length)).toEqual([500, 1]);
        } finally {
            clearTimeout(timeoutId);
            releaseTail();
            fsExtra.createReadStream = originalCreateReadStream;
        }
    });

    test('reproducer for the 2026-05-19 restore failure: real KB backup shape (24,418 records all-null docs) succeeds', async () => {
        // Synthetic minimal reproducer mirroring the actual `backup-2026-05-19T13-08-14.283Z`
        // shape audit: 100% of records have `document: null`; metadata carries `content`,
        // `source`, `name`, `hash`, `kind`, `className`, `type`, `id`.
        const filePath = writeBackupFile('kb-shape-reproducer.jsonl', [
            {
                id       : 'h-1',
                embedding: vec(0.001),
                metadata : {
                    source    : 'src/canvas/_export.mjs',
                    name      : 'src/canvas/_export.mjs - [Module Context]',
                    line_start: 1,
                    line_end  : 4,
                    extends   : '',
                    hash      : 'h-1',
                    content   : "import Sparkline from './Sparkline.mjs';",
                    className : '',
                    kind      : 'module-context',
                    type      : 'src'
                },
                document: null
            }
        ]);

        const result = await KB_DatabaseService.importDatabase({
            action: 'import',
            file  : filePath,
            mode  : 'merge'
        });

        // The real backup shape imports cleanly because `documents` is omitted;
        // forwarding its null document would surface a DATABASE_IMPORT_ERROR.
        expect(result.imported).toBe(1);
        expect('documents' in capturedUpsertCalls[0]).toBe(false);
    });

    test('replace mode: a corrupt FINAL row proves the full source BEFORE any truncate or write', async () => {
        const filePath = writeBackupFile('kb-corrupt-final.jsonl', [
            {id: 'ok-1', embedding: vec(0.1), metadata: {kind: 'class'}, document: null},
            {id: 'ok-2', embedding: vec(0.2), metadata: {kind: 'class'}, document: null},
            {id: 'corrupt-final', embedding: 'not-a-vector', metadata: {kind: 'class'}, document: null}
        ]);

        let   truncateCalls    = 0;
        const originalTruncate = KB_DatabaseService.truncateDatabase.bind(KB_DatabaseService);
        KB_DatabaseService.truncateDatabase = async (...args) => {
            truncateCalls++;
            return originalTruncate(...args);
        };

        try {
            await expect(KB_DatabaseService.importDatabase({
                action: 'import',
                file  : filePath,
                mode  : 'replace'
            })).rejects.toThrow(/Source validation failed.*missing-embedding|wrong-dimension|not persisted/);

            expect(truncateCalls).toBe(0);
            expect(capturedUpsertCalls).toHaveLength(0);
        } finally {
            KB_DatabaseService.truncateDatabase = originalTruncate;
        }
    });
});
