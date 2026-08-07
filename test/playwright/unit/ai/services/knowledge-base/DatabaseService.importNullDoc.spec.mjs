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

        // `count` and `get` model the real Chroma surface, which a merge import reads BEFORE its
        // first write to scan for natural-key divergence. An empty count is the honest answer for
        // this double — these fixtures assert document-shape handling against a fresh collection —
        // and it also exercises the skip-the-scan path, which is correct precisely because an empty
        // target cannot diverge. Omitting them would make the double weaker than production and the
        // service would fail on a method it is entitled to assume.
        const mockCollection = {
            count : async () => 0,
            get   : async () => ({ids: [], metadatas: []}),
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
            embedding: vec(index),
            metadata : {index},
            document : null
        }));
        const tailRecord = {id: 'tail-500', embedding: vec(500), metadata: {index: 500}, document: null};

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

        // An EMPTY target, which is what keeps this test measuring streaming. A merge into a
        // non-empty collection deliberately completes a divergence scan before its first write, so
        // pointing this gated fixture at a populated target would deadlock by design rather than by
        // regression — see the companion assertion below.
        KB_ChromaManager.getKnowledgeBaseCollection = async () => ({
            count : async () => 0,
            get   : async () => ({ids: [], metadatas: []}),
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

    test('merge into a NON-EMPTY target completes the divergence scan before the first write', async () => {
        // The companion to the streaming test above, and the reason that one had to be pinned to an
        // empty target. These two properties genuinely trade against each other: "flush the first
        // batch before EOF" and "refuse before any write" cannot both hold when the decision to
        // refuse depends on rows that have not been read yet. The trade is resolved by target state
        // — empty targets cannot diverge, so they keep streaming — and asserting it here means the
        // choice is visible in the suite rather than discovered by whoever next reads the docblock.
        const liveMetadata = {tenantId: 'neo-shared', repoSlug: 'neo', source: 'src/a.mjs', name: 'src/a.mjs - x()', type: 'method', content: 'x'};

        KB_ChromaManager.getKnowledgeBaseCollection = async () => ({
            count : async () => 1,
            get   : async () => ({ids: ['live-digest'], metadatas: [liveMetadata]}),
            upsert: async args => { capturedUpsertCalls.push(args); }
        });

        // Same natural key, different id — a derivation divergence, which is what a content-digest
        // id produces when a hashed field resolves on one side only.
        const filePath = writeBackupFile('kb-divergent.jsonl', [
            {id: 'bundle-digest', embedding: vec(0.2), metadata: {...liveMetadata}, document: null},
            {id: 'fresh-row',     embedding: vec(0.4), metadata: {...liveMetadata, name: 'src/a.mjs - y()'}, document: null}
        ]);

        let thrown;

        try {
            await KB_DatabaseService.importDatabase({file: filePath, mode: 'merge'});
        } catch (error) {
            thrown = error;
        }

        expect(thrown, 'divergence must refuse').toBeTruthy();
        expect(thrown.message).toMatch(/share a natural key with a live row/);

        // The CODE must survive the method's own catch. `importDatabase` re-wraps failures as
        // `DATABASE_IMPORT_ERROR`, and the divergence refusal was added without being added to the
        // preserved-code set — so it reached every caller as a generic import failure. A fail-loud
        // guard whose entire value is being distinguishable, wrapped into indistinguishability one
        // frame above the throw. Asserting the message alone would not have caught it, because the
        // wrapper interpolates the original message.
        expect(thrown.code, 'the refusal must not be collapsed into DATABASE_IMPORT_ERROR').toBe('KB_MERGE_NATURAL_KEY_DIVERGENCE');

        // `fresh-row` is a legitimate insert sitting in the same batch as the divergent row, so a
        // per-batch guard would have written it before refusing — and a partial merge is worse than a
        // refused one, because it leaves the corpus in a state no receipt describes.
        expect(capturedUpsertCalls, 'refusal must precede every write, not just the divergent one').toHaveLength(0);
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
