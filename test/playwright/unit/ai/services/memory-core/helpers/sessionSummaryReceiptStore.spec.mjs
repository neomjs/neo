import fs   from 'node:fs';
import os   from 'node:os';
import path from 'node:path';
import {gzipSync} from 'node:zlib';

import {knownEmbeddingFunctions, registerEmbeddingFunction, ChromaClient} from 'chromadb';
import Database                                                           from 'better-sqlite3';
import {setup}                                                            from '../../../../../setup.mjs';
import {test, expect}                                                     from '@playwright/test';

import '../../../../../../../src/Neo.mjs';
import '../../../../../../../src/core/_export.mjs';

import {
    acknowledgeSessionSummaryReceipt,
    decodeSessionSummaryReceipt,
    encodeSessionSummaryReceipt,
    recoverSessionSummaryReceipts,
    REQUIRED_RECEIPT_METADATA_KEYS,
    SESSION_SUMMARY_RECEIPT_ENCODING,
    SESSION_SUMMARY_RECEIPT_METADATA_KEYS,
    stageSessionSummaryReceipt
} from '../../../../../../../ai/services/memory-core/helpers/sessionSummaryReceiptStore.mjs';
import {
    cleanupChromaArtifacts,
    isDetachedProcessAlive,
    startChromaProcess,
    stopDetachedProcess
} from '../../../../../chromaProcess.mjs';
import {resolveFreePortSync} from '../../../../../resolveFreePort.mjs';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : 'SessionSummaryReceiptStoreTest',
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

/**
 * @summary Creates the current coordinator schema in an isolated SQLite connection.
 * @returns {Database}
 */
function createReceiptDb() {
    const db = new Database(':memory:');

    db.exec(`
        CREATE TABLE SummarizationJobs (
            session_id TEXT PRIMARY KEY,
            status TEXT NOT NULL CHECK(status IN ('pending', 'in_progress', 'completed', 'failed')),
            lease_token TEXT,
            expires_at INTEGER,
            retry_count INTEGER DEFAULT 0,
            result_envelope BLOB,
            result_encoding TEXT,
            result_staged_at INTEGER,
            result_acknowledged_at INTEGER,
            result_last_replayed_at INTEGER
        )
    `);

    return db;
}

/**
 * @summary Builds one deterministic exact summary row fixture.
 * @param {String} sessionId
 * @param {Object} [overrides]
 * @returns {{sessionId:String,summaryId:String,document:String,metadata:Object}}
 */
function createReceipt(sessionId, overrides = {}) {
    return {
        sessionId,
        summaryId: `summary_${sessionId}`,
        document : `Summary for ${sessionId}`,
        metadata : {
            sessionId,
            timestamp            : 1_800_000_000_000,
            memoryCount          : 2,
            dreamInputRevision   : `sha256:${'a'.repeat(64)}`,
            title                : 'Durable summary',
            category             : 'implementation',
            quality              : 80,
            productivity         : 90,
            impact               : 70,
            complexity           : 40,
            technologies         : 'Neo.mjs',
            participatingAgents  : 'neo-gpt',
            models               : 'gpt-5',
            totalToolCalls       : 12,
            toolsUsed            : 'run_shell_command',
            sourceAgentIdentities: '@neo-gpt',
            sourceTrustTier      : 'trusted',
            provenancePolicy     : 'most-restrictive-source',
            sourceTier           : 'raw',
            degraded             : false,
            rawCanonical         : true
        },
        ...overrides
    };
}

/**
 * @summary In-memory Chroma-shaped collection for deterministic receipt unit tests.
 * @returns {Object}
 */
function createFakeCollection() {
    const rows = new Map();

    return {
        rows,
        upsertCalls: 0,

        async get({ids}) {
            const found = (ids || []).filter(id => rows.has(id));

            return {
                ids       : found,
                documents : found.map(id => rows.get(id).document),
                metadatas : found.map(id => rows.get(id).metadata),
                embeddings: found.map(() => [1, 0, 0])
            };
        },

        async upsert({ids, documents, metadatas}) {
            this.upsertCalls++;

            ids.forEach((id, index) => {
                const current = rows.get(id);

                rows.set(id, {
                    document: documents[index],
                    metadata: {
                        ...(current?.metadata || {}),
                        ...structuredClone(metadatas[index])
                    }
                });
            });
        }
    };
}

/**
 * @summary Waits for an explicitly killed disposable Chroma process group to disappear.
 * @param {Number} pid
 * @param {Number} [timeoutMs=10000]
 * @returns {Promise<void>}
 */
async function waitForProcessExit(pid, timeoutMs = 10000) {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
        if (!isDetachedProcessAlive(pid)) return;
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    throw new Error(`Disposable Chroma process ${pid} did not exit after SIGKILL.`);
}

/**
 * @summary Registers a deterministic, provider-free embedding function for one disposable
 * Chroma collection without mutating the shared AiConfig singleton.
 * @returns {Object}
 */
function createReceiptEmbeddingFunction() {
    const name              = `session_summary_receipt_test_${process.pid}_${Date.now()}`;
    const embeddingFunction = {
        name,
        getConfig: () => ({}),
        generate : async texts => texts.map(() => [1, 0, 0])
    };

    class ReceiptEmbeddingFunction {
        static buildFromConfig() {
            return embeddingFunction;
        }
    }

    embeddingFunction.constructor = ReceiptEmbeddingFunction;

    if (!knownEmbeddingFunctions.has(name)) {
        registerEmbeddingFunction(name, ReceiptEmbeddingFunction);
    }

    return embeddingFunction;
}

test.describe('sessionSummaryReceiptStore (#16105, #16114, #16115)', () => {
    test.describe.configure({mode: 'serial'});

    test('enforces the declared synthesis-owned metadata key set at issuance', () => {
        const receipt = createReceipt('owned-key-set');

        expect(Object.keys(receipt.metadata))
            .toEqual(REQUIRED_RECEIPT_METADATA_KEYS);
        expect(() => encodeSessionSummaryReceipt({
            ...receipt,
            metadata: {
                ...receipt.metadata,
                graphDigested: true
            }
        })).toThrow(/unowned keys: graphDigested/);

        const missingTitle = {...receipt.metadata};

        delete missingTitle.title;

        expect(() => encodeSessionSummaryReceipt({
            ...receipt,
            metadata: missingTitle
        })).toThrow(/missing owned keys: title/);
    });

    test('stages one compressed exact envelope and completes only through that durable receipt', () => {
        const db      = createReceiptDb();
        const receipt = createReceipt('active-job');
        const expires = 1_800_000_060_000;

        db.prepare(`
            INSERT INTO SummarizationJobs (session_id, status, lease_token, expires_at, retry_count)
            VALUES (?, 'in_progress', 'lease-1', ?, 3)
        `).run(receipt.sessionId, expires);

        try {
            const staged = stageSessionSummaryReceipt({
                db,
                ...receipt,
                now: 1_800_000_000_000
            });
            const stagedRow = db.prepare('SELECT * FROM SummarizationJobs WHERE session_id = ?')
                .get(receipt.sessionId);

            expect(staged.encoding).toBe(SESSION_SUMMARY_RECEIPT_ENCODING);
            expect(staged.bytes).toBeGreaterThan(0);
            expect(stagedRow.status).toBe('in_progress');
            expect(stagedRow.lease_token).toBe('lease-1');
            expect(stagedRow.expires_at).toBe(expires);
            expect(decodeSessionSummaryReceipt(
                stagedRow.result_envelope,
                stagedRow.result_encoding
            )).toEqual({version: 2, ...receipt});

            expect(acknowledgeSessionSummaryReceipt({
                db,
                sessionId: receipt.sessionId,
                now      : 1_800_000_000_100
            })).toBe(true);

            expect(db.prepare(`
                SELECT status, lease_token, expires_at, result_acknowledged_at
                FROM SummarizationJobs
                WHERE session_id = ?
            `).get(receipt.sessionId)).toEqual({
                status                : 'completed',
                lease_token           : null,
                expires_at            : null,
                result_acknowledged_at: 1_800_000_000_100
            });
        } finally {
            db.close();
        }
    });

    test('reopens a completed row while replacing, never appending, its single bounded envelope', () => {
        const db       = createReceiptDb();
        const original = createReceipt('replacement');
        const updated  = createReceipt('replacement', {
            document: 'New exact result',
            metadata: {...original.metadata, memoryCount: 3}
        });

        try {
            stageSessionSummaryReceipt({db, ...original, now: 100});
            acknowledgeSessionSummaryReceipt({db, sessionId: original.sessionId, now: 101});
            stageSessionSummaryReceipt({db, ...updated, now: 200});

            const row = db.prepare('SELECT * FROM SummarizationJobs WHERE session_id = ?')
                .get(original.sessionId);

            expect(row.status).toBe('pending');
            expect(row.result_acknowledged_at).toBeNull();
            expect(row.result_staged_at).toBe(200);
            expect(decodeSessionSummaryReceipt(row.result_envelope, row.result_encoding))
                .toEqual({version: 2, ...updated});
            expect(db.prepare('SELECT COUNT(*) AS count FROM SummarizationJobs').get().count).toBe(1);
        } finally {
            db.close();
        }
    });

    test('fails loud when staging cannot persist or completion has no durable envelope', () => {
        const db        = createReceiptDb();
        const sessionId = 'missing-envelope';

        db.prepare(`
            INSERT INTO SummarizationJobs (session_id, status)
            VALUES (?, 'in_progress')
        `).run(sessionId);

        expect(() => acknowledgeSessionSummaryReceipt({db, sessionId}))
            .toThrow(/no durable result envelope/);
        expect(db.prepare('SELECT status FROM SummarizationJobs WHERE session_id = ?')
            .get(sessionId).status).toBe('in_progress');

        db.exec('DROP TABLE SummarizationJobs');

        expect(() => stageSessionSummaryReceipt({
            db,
            ...createReceipt('storage-failure')
        })).toThrow(/no such table: SummarizationJobs/);

        db.close();
    });

    test('replays a completed-but-missing exact row once and is idempotent on the next pass', async () => {
        const db         = createReceiptDb();
        const collection = createFakeCollection();
        const receipt    = createReceipt('completed-missing');

        try {
            stageSessionSummaryReceipt({db, ...receipt, now: 100});
            acknowledgeSessionSummaryReceipt({db, sessionId: receipt.sessionId, now: 101});

            const first = await recoverSessionSummaryReceipts({
                db,
                collection,
                expectedDimension: 3,
                now              : 200
            });

            expect(first).toMatchObject({
                scanned  : 1,
                replayed : 1,
                present  : 0,
                completed: 1
            });
            expect(collection.rows.get(receipt.summaryId)).toEqual({
                document: receipt.document,
                metadata: receipt.metadata
            });
            expect(collection.upsertCalls).toBe(1);

            const second = await recoverSessionSummaryReceipts({
                db,
                collection,
                expectedDimension: 3,
                now              : 300
            });

            expect(second).toMatchObject({
                scanned  : 1,
                replayed : 0,
                present  : 1,
                completed: 1
            });
            expect(collection.upsertCalls).toBe(1);

            const row = db.prepare(`
                SELECT status, result_acknowledged_at, result_last_replayed_at
                FROM SummarizationJobs
                WHERE session_id = ?
            `).get(receipt.sessionId);

            expect(row).toEqual({
                status                 : 'completed',
                result_acknowledged_at : 101,
                result_last_replayed_at: 200
            });
        } finally {
            db.close();
        }
    });

    test('accepts Dream-owned metadata overlays while keeping receipt-owned values strict', async () => {
        const db         = createReceiptDb();
        const collection = createFakeCollection();
        const receipt    = createReceipt('dream-overlay');
        const dreamState = {
            digestState           : 'digested',
            dreamCompletedRevision: receipt.metadata.dreamInputRevision,
            dreamStateRevision    : receipt.metadata.dreamInputRevision,
            graphDigested         : true
        };

        try {
            stageSessionSummaryReceipt({db, ...receipt, now: 100});
            acknowledgeSessionSummaryReceipt({db, sessionId: receipt.sessionId, now: 101});

            collection.rows.set(receipt.summaryId, {
                document: receipt.document,
                metadata: {...receipt.metadata, ...dreamState}
            });

            const present = await recoverSessionSummaryReceipts({
                db,
                collection,
                expectedDimension: 3,
                now              : 200
            });

            expect(present).toMatchObject({
                completed: 1,
                present  : 1,
                replayed : 0
            });
            expect(collection.upsertCalls).toBe(0);
            expect(collection.rows.get(receipt.summaryId).metadata)
                .toEqual({...receipt.metadata, ...dreamState});

            collection.rows.get(receipt.summaryId).metadata.memoryCount = 99;

            const repaired = await recoverSessionSummaryReceipts({
                db,
                collection,
                expectedDimension: 3,
                now              : 300
            });

            expect(repaired).toMatchObject({
                completed: 1,
                present  : 0,
                replayed : 1
            });
            expect(collection.upsertCalls).toBe(1);
            expect(collection.rows.get(receipt.summaryId).metadata)
                .toEqual({...receipt.metadata, ...dreamState});

            delete collection.rows.get(receipt.summaryId).metadata.title;

            const missingOwnedKey = await recoverSessionSummaryReceipts({
                db,
                collection,
                expectedDimension: 3,
                now              : 400
            });

            expect(missingOwnedKey.replayed).toBe(1);
            expect(collection.upsertCalls).toBe(2);

            collection.rows.get(receipt.summaryId).document = 'Unacknowledged summary';

            const changedDocument = await recoverSessionSummaryReceipts({
                db,
                collection,
                expectedDimension: 3,
                now              : 500
            });

            expect(changedDocument.replayed).toBe(1);
            expect(collection.upsertCalls).toBe(3);
            expect(collection.rows.get(receipt.summaryId)).toEqual({
                document: receipt.document,
                metadata: {...receipt.metadata, ...dreamState}
            });
        } finally {
            db.close();
        }
    });

    test('attests absence for conditional keys inside the synthesis-owned boundary', async () => {
        const db         = createReceiptDb();
        const collection = createFakeCollection();
        const receipt    = createReceipt('conditional-absence');

        try {
            stageSessionSummaryReceipt({db, ...receipt, now: 100});
            acknowledgeSessionSummaryReceipt({db, sessionId: receipt.sessionId, now: 101});

            collection.rows.set(receipt.summaryId, {
                document: receipt.document,
                metadata: {
                    ...receipt.metadata,
                    digestState  : 'digested',
                    graphDigested: true,
                    userId       : 'unauthorized-live-owner'
                }
            });

            await expect(recoverSessionSummaryReceipts({
                db,
                collection,
                expectedDimension: 3,
                now              : 200
            })).rejects.toThrow(
                `Session-summary receipt replay verification failed for ${receipt.summaryId}.`
            );
            expect(collection.upsertCalls).toBe(1);
            expect(collection.rows.get(receipt.summaryId).metadata.userId)
                .toBe('unauthorized-live-owner');
        } finally {
            db.close();
        }
    });

    test('finalizes a staged direct result but skips a still-live writer lease', async () => {
        const db         = createReceiptDb();
        const collection = createFakeCollection();
        const pending    = createReceipt('staged-pending');
        const active     = createReceipt('staged-active');

        try {
            stageSessionSummaryReceipt({db, ...pending, now: 100});
            await collection.upsert({
                ids      : [pending.summaryId],
                documents: [pending.document],
                metadatas: [pending.metadata]
            });

            db.prepare(`
                INSERT INTO SummarizationJobs (
                    session_id, status, lease_token, expires_at, retry_count
                )
                VALUES (?, 'in_progress', 'active-lease', ?, 0)
            `).run(active.sessionId, 500);
            stageSessionSummaryReceipt({db, ...active, now: 101});

            const result = await recoverSessionSummaryReceipts({
                db,
                collection,
                now: 200
            });

            expect(result).toMatchObject({
                completed    : 1,
                present      : 1,
                replayed     : 0,
                skippedActive: 1
            });
            expect(db.prepare('SELECT status FROM SummarizationJobs WHERE session_id = ?')
                .get(pending.sessionId).status).toBe('completed');
            expect(db.prepare('SELECT status FROM SummarizationJobs WHERE session_id = ?')
                .get(active.sessionId).status).toBe('in_progress');
            expect(collection.rows.has(active.summaryId)).toBe(false);
        } finally {
            db.close();
        }
    });

    test('retains a corrupt envelope and refuses to replace it through model-free recovery', async () => {
        const db         = createReceiptDb();
        const collection = createFakeCollection();

        db.prepare(`
            INSERT INTO SummarizationJobs (
                session_id,
                status,
                result_envelope,
                result_encoding,
                result_staged_at
            )
            VALUES (?, 'completed', ?, ?, ?)
        `).run('corrupt', Buffer.from('not-gzip'), SESSION_SUMMARY_RECEIPT_ENCODING, 100);

        try {
            await expect(recoverSessionSummaryReceipts({
                db,
                collection,
                now: 200
            })).rejects.toThrow(/envelope is corrupt/);

            const row = db.prepare(`
                SELECT status, result_envelope
                FROM SummarizationJobs
                WHERE session_id = 'corrupt'
            `).get();

            expect(row.status).toBe('completed');
            expect(Buffer.from(row.result_envelope).toString()).toBe('not-gzip');
            expect(collection.upsertCalls).toBe(0);
        } finally {
            db.close();
        }
    });

    test('recovers a shape-drifted historical envelope without weakening current issuance', async () => {
        const db         = createReceiptDb();
        const collection = createFakeCollection();
        const receipt    = createReceipt('historical-shape');
        const newerDreamInputRevision = `sha256:${'b'.repeat(64)}`;

        delete receipt.metadata.rawCanonical;
        delete receipt.metadata.dreamInputRevision;
        receipt.metadata.retiredSynthesisField = 'historical-value';

        db.prepare(`
            INSERT INTO SummarizationJobs (
                session_id,
                status,
                result_envelope,
                result_encoding,
                result_staged_at
            )
            VALUES (?, 'completed', ?, ?, ?)
        `).run(
            receipt.sessionId,
            gzipSync(Buffer.from(JSON.stringify({version: 1, ...receipt}), 'utf8')),
            SESSION_SUMMARY_RECEIPT_ENCODING,
            100
        );

        try {
            collection.rows.set(receipt.summaryId, {
                document: 'Newer unacknowledged summary',
                metadata: {
                    ...receipt.metadata,
                    dreamInputRevision: newerDreamInputRevision
                }
            });

            const result = await recoverSessionSummaryReceipts({
                db,
                collection,
                now: 200
            });

            expect(result).toMatchObject({
                scanned  : 1,
                replayed : 1,
                completed: 1
            });
            expect(collection.rows.get(receipt.summaryId)).toEqual({
                document: receipt.document,
                metadata: {
                    ...receipt.metadata,
                    dreamInputRevision: newerDreamInputRevision
                }
            });

            const settled = await recoverSessionSummaryReceipts({
                db,
                collection,
                now: 300
            });

            expect(settled).toMatchObject({
                scanned  : 1,
                present  : 1,
                replayed : 0,
                completed: 1
            });
            expect(collection.upsertCalls).toBe(1);
            expect(() => encodeSessionSummaryReceipt(receipt))
                .toThrow(/unowned keys: retiredSynthesisField/);
        } finally {
            db.close();
        }
    });

    test('forced Chroma stop/restart recovers an acknowledged exact row without a summary model', async () => {
        test.setTimeout(180_000);

        const db                = createReceiptDb();
        const dataDir           = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-chroma-unit-test-receipt-'));
        const logPath           = path.join(os.tmpdir(), `neo-chroma-unit-test-receipt-${process.pid}-${Date.now()}.log`);
        const host              = '127.0.0.1';
        const port              = resolveFreePortSync();
        const collectionName    = `receipt-${process.pid}-${Date.now()}`;
        const embeddingFunction = createReceiptEmbeddingFunction();
        const receipt           = createReceipt('forced-stop');
        let   chromaPid         = null;

        try {
            chromaPid = await startChromaProcess({
                repoRoot: process.cwd(),
                dataDir,
                host,
                port,
                logPath
            });

            let client     = new ChromaClient({host, port, ssl: false});
            let collection = await client.getOrCreateCollection({
                name: collectionName,
                embeddingFunction
            });

            await collection.upsert({
                ids      : [receipt.summaryId],
                documents: [receipt.document],
                metadatas: [receipt.metadata]
            });
            stageSessionSummaryReceipt({db, ...receipt, now: 100});
            acknowledgeSessionSummaryReceipt({db, sessionId: receipt.sessionId, now: 101});

            expect((await collection.get({
                ids    : [receipt.summaryId],
                include: ['documents', 'metadatas']
            })).ids).toEqual([receipt.summaryId]);

            const killTarget = process.platform === 'win32' ? chromaPid : -chromaPid;
            process.kill(killTarget, 'SIGKILL');
            await waitForProcessExit(chromaPid);
            chromaPid = null;

            chromaPid = await startChromaProcess({
                repoRoot: process.cwd(),
                dataDir,
                host,
                port,
                logPath
            });

            client = new ChromaClient({host, port, ssl: false});
            collection = await client.getOrCreateCollection({
                name: collectionName,
                embeddingFunction
            });

            // The production incident yielded exactly this post-restart state. Delete only the
            // disposable fixture row when Chroma happened to flush it before SIGKILL, making the
            // observed absence deterministic without touching any configured/shared collection.
            await collection.delete({ids: [receipt.summaryId]});

            const recovered = await recoverSessionSummaryReceipts({
                db,
                collection,
                expectedDimension: 3,
                now              : 200
            });
            const exact = await collection.get({
                ids    : [receipt.summaryId],
                include: ['documents', 'metadatas']
            });

            expect(recovered.replayed).toBe(1);
            expect(exact.ids).toEqual([receipt.summaryId]);
            expect(exact.documents).toEqual([receipt.document]);
            expect(exact.metadatas).toEqual([receipt.metadata]);
            expect(db.prepare(`
                SELECT status, result_last_replayed_at
                FROM SummarizationJobs
                WHERE session_id = ?
            `).get(receipt.sessionId)).toEqual({
                status                 : 'completed',
                result_last_replayed_at: 200
            });

            const dreamState = {
                digestState           : 'digested',
                dreamCompletedRevision: receipt.metadata.dreamInputRevision,
                dreamStateRevision    : receipt.metadata.dreamInputRevision,
                graphDigested         : true
            };

            await collection.update({
                ids      : [receipt.summaryId],
                metadatas: [dreamState]
            });

            const enrichedPresent = await recoverSessionSummaryReceipts({
                db,
                collection,
                expectedDimension: 3,
                now              : 300
            });

            expect(enrichedPresent).toMatchObject({
                completed: 1,
                present  : 1,
                replayed : 0
            });

            await collection.update({
                ids      : [receipt.summaryId],
                metadatas: [{memoryCount: 99}]
            });

            const enrichedRepaired = await recoverSessionSummaryReceipts({
                db,
                collection,
                expectedDimension: 3,
                now              : 400
            });
            const enrichedExact = await collection.get({
                ids    : [receipt.summaryId],
                include: ['documents', 'metadatas']
            });

            expect(enrichedRepaired).toMatchObject({
                completed: 1,
                present  : 0,
                replayed : 1
            });
            expect(enrichedExact.documents).toEqual([receipt.document]);
            expect(enrichedExact.metadatas).toEqual([{
                ...receipt.metadata,
                ...dreamState
            }]);
        } finally {
            if (chromaPid) {
                await stopDetachedProcess(chromaPid);
            }
            if (db.open) db.close();

            cleanupChromaArtifacts({
                dataDir,
                logPath,
                ownsDataDir: true
            });
        }
    });
});
