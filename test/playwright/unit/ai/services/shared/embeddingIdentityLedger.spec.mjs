import {readFileSync, mkdtempSync, rmSync} from 'node:fs';
import os                                  from 'node:os';
import path                                from 'node:path';
import {expect, test}                      from '@playwright/test';
import Database                            from 'better-sqlite3';
import {
    ensureEmbeddingIdentitySchema,
    fingerprintEmbeddingInput,
    getEmbeddingIdentityWindow,
    recordEmbeddingSubmissions
} from '../../../../../../ai/services/shared/embeddingIdentityLedger.mjs';

/**
 * @summary Cross-process and temporal coverage for the re-embed ratio ledger.
 *
 * The ratio is observational: exact lookback filtering, durable coverage boundaries, and eviction
 * provenance keep it from presenting retained or unobserved work as a complete current interval.
 */
test.describe('ai/services/shared embeddingIdentityLedger', () => {
    let db, dbPath, peerDb, tempDir;

    test.beforeEach(() => {
        tempDir = mkdtempSync(path.join(os.tmpdir(), 'neo-embedding-identity-ledger-'));
        dbPath  = path.join(tempDir, 'telemetry.sqlite');
        db      = new Database(dbPath);
        db.pragma('journal_mode = WAL');
        peerDb  = new Database(dbPath);
        peerDb.pragma('journal_mode = WAL');

        ensureEmbeddingIdentitySchema(db, {now: () => 1000});
    });

    test.afterEach(() => {
        if (peerDb?.open) {
            peerDb.close();
        }
        if (db?.open) {
            db.close();
        }

        rmSync(tempDir, {force: true, recursive: true});
    });

    test('two SQLite connections share one ratio across recorder processes (#16866)', () => {
        recordEmbeddingSubmissions(db, {
            source     : 'knowledge-base',
            submittedAt: 1100,
            texts      : ['alpha', 'beta']
        });

        expect(getEmbeddingIdentityWindow(peerDb, {sinceTs: 1000})).toMatchObject({
            distinct   : 2,
            ratio      : 1,
            submissions: 2,
            truncated  : false
        });

        recordEmbeddingSubmissions(peerDb, {
            source     : 'memory-core',
            submittedAt: 1200,
            texts      : ['alpha', 'beta']
        });

        expect(getEmbeddingIdentityWindow(db, {sinceTs: 1000})).toMatchObject({
            distinct   : 2,
            ratio      : 2,
            submissions: 4,
            truncated  : false
        });
    });

    test('only submissions inside the exact requested lookback influence the ratio (#16866)', () => {
        recordEmbeddingSubmissions(db, {
            source     : 'knowledge-base',
            submittedAt: 1100,
            texts      : ['old repeat', 'old repeat']
        });
        recordEmbeddingSubmissions(db, {
            source     : 'knowledge-base',
            submittedAt: 5000,
            texts      : ['current unique']
        });

        expect(getEmbeddingIdentityWindow(db, {sinceTs: 4000})).toMatchObject({
            distinct   : 1,
            ratio      : 1,
            submissions: 1,
            truncated  : false
        });
        expect(getEmbeddingIdentityWindow(db, {sinceTs: 1000})).toMatchObject({
            distinct   : 2,
            ratio      : 1.5,
            submissions: 3
        });
    });

    test('an unobserved interval reports null rather than the value of a clean run (#16866)', () => {
        recordEmbeddingSubmissions(db, {
            source     : 'memory-core',
            submittedAt: 1100,
            texts      : ['before the lookback']
        });

        expect(getEmbeddingIdentityWindow(db, {sinceTs: 2000})).toMatchObject({
            distinct   : 0,
            ratio      : null,
            submissions: 0,
            truncated  : false
        });
    });

    test('coverage start bounds which requested intervals can claim completeness (#16866)', () => {
        const beforeCoverage = getEmbeddingIdentityWindow(db, {sinceTs: 999});
        const atCoverage     = getEmbeddingIdentityWindow(db, {sinceTs: 1000});

        expect(beforeCoverage.coverageStartedAt).toBe(1000);
        expect(beforeCoverage.truncated, 'instrumentation started after the requested lower bound').toBe(true);
        expect(atCoverage.coverageStartedAt).toBe(1000);
        expect(atCoverage.truncated, 'the inclusive coverage boundary is complete').toBe(false);
    });

    test('eviction truncates only lookbacks intersecting the durable watermark (#16866)', () => {
        recordEmbeddingSubmissions(db, {
            retentionLimit: 2,
            source        : 'knowledge-base',
            submittedAt   : 1100,
            texts         : ['evicted a', 'evicted b']
        });
        recordEmbeddingSubmissions(db, {
            retentionLimit: 2,
            source        : 'knowledge-base',
            submittedAt   : 1200,
            texts         : ['retained c', 'retained d']
        });

        expect(getEmbeddingIdentityWindow(db, {sinceTs: 1100})).toMatchObject({
            oldestRetainedAt: 1200,
            submissions     : 2,
            truncated       : true
        });
        expect(getEmbeddingIdentityWindow(db, {sinceTs: 1101})).toMatchObject({
            oldestRetainedAt: 1200,
            submissions     : 2,
            truncated       : false
        });
    });

    test('a concurrent eviction cannot mix a stale watermark with retained-tail counts (#16866)', () => {
        recordEmbeddingSubmissions(db, {
            retentionLimit: 2,
            source        : 'knowledge-base',
            submittedAt   : 1100,
            texts         : ['initial a', 'initial b']
        });

        let injected = false;

        const interleavedDb = {
            prepare(sql) {
                const statement = db.prepare(sql);

                return {
                    get(...args) {
                        if (!injected && sql.includes('MIN(submitted_at)')) {
                            injected = true;
                            recordEmbeddingSubmissions(peerDb, {
                                retentionLimit: 2,
                                source        : 'memory-core',
                                submittedAt   : 1200,
                                texts         : ['replacement c', 'replacement d']
                            });
                        }

                        return statement.get(...args)
                    }
                }
            },
            transaction(callback) {
                return db.transaction(callback)
            }
        };

        const snapshot = getEmbeddingIdentityWindow(interleavedDb, {sinceTs: 1100});

        expect(injected).toBe(true);
        expect(snapshot).toMatchObject({
            oldestRetainedAt: 1100,
            submissions     : 2,
            truncated       : false
        });
        expect(getEmbeddingIdentityWindow(db, {sinceTs: 1100})).toMatchObject({
            oldestRetainedAt: 1200,
            submissions     : 2,
            truncated       : true
        });
    });

    test('clean and honestly duplicated work remain ratio controls, never verdicts (#16866)', () => {
        const unique = Array.from({length: 500}, (_, index) => `unique body ${index}`);

        recordEmbeddingSubmissions(db, {
            source     : 'knowledge-base',
            submittedAt: 1100,
            texts      : unique
        });

        expect(getEmbeddingIdentityWindow(db, {sinceTs: 1000}).ratio).toBe(1);

        recordEmbeddingSubmissions(db, {
            source     : 'knowledge-base',
            submittedAt: 1200,
            texts      : ['shared quotation', 'shared quotation']
        });

        const window = getEmbeddingIdentityWindow(db, {sinceTs: 1000});

        expect(window.ratio).toBeGreaterThan(1);
        expect(window.ratio).toBeLessThan(1.01);
        expect(Object.keys(window)).toEqual([
            'coverageStartedAt',
            'distinct',
            'oldestRetainedAt',
            'ratio',
            'submissions',
            'truncated'
        ]);
    });

    test('the shared artifact stores fingerprints but never raw embedding input (#16866)', () => {
        const rawText = 'private corpus sentinel 4ddc75f8';

        recordEmbeddingSubmissions(db, {
            source     : 'knowledge-base',
            submittedAt: 1100,
            texts      : [rawText]
        });

        const row = db.prepare('SELECT * FROM embedding_identity_log').get();

        expect(row).toEqual(expect.objectContaining({
            fingerprint : fingerprintEmbeddingInput(rawText),
            source      : 'knowledge-base',
            submitted_at: 1100
        }));
        expect(row).not.toHaveProperty('text');
        expect(JSON.stringify(row)).not.toContain(rawText);

        db.pragma('wal_checkpoint(TRUNCATE)');
        expect(readFileSync(dbPath).includes(Buffer.from(rawText))).toBe(false);
    });
});
