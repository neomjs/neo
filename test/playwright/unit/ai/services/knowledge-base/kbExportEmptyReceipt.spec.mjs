import {test, expect} from '@playwright/test';

import fs   from 'fs-extra';
import os   from 'os';
import path from 'path';

import '../../../../../../src/Neo.mjs';
import '../../../../../../src/core/Base.mjs';

/**
 * @summary An export that captured nothing must not report the same shape as one that captured
 * everything.
 *
 * Six of ten retained bundles carried zero KB rows and every one of them recorded a completion
 * message, so the failure mode is the steady state rather than an edge case. A zero-row export
 * against a POPULATED collection already throws `PARTIAL_COLLECTION_EXPORT`; what these specs pin is
 * the other half — a genuinely empty corpus is a real state, and saying "Export complete" about it is
 * what let four consecutive backups present as recovery sources while holding nothing.
 */
test.describe('KB export receipt on an empty collection', () => {
    let root, DatabaseService, ChromaManager, originalResolve;

    test.beforeAll(async () => {
        ({default: DatabaseService} = await import('../../../../../../ai/services/knowledge-base/DatabaseService.mjs'));
        ({default: ChromaManager}   = await import('../../../../../../ai/services/knowledge-base/ChromaManager.mjs'));
        originalResolve = ChromaManager.getKnowledgeBaseCollection;
    });

    test.afterAll(() => { ChromaManager.getKnowledgeBaseCollection = originalResolve });

    test.beforeEach(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), 'neo-kb-export-')) });
    test.afterEach (async () => { await fs.remove(root) });

    /**
     * @param {Number} count Rows the stubbed collection reports.
     * @returns {Promise<Object>} The export receipt.
     */
    function exportWithCollectionCount(count) {
        const collection = {
            id  : 'ab75f86b-1651-4865-96f4-0287acd42ea7',
            name: 'neo-knowledge-base',
            async count() { return count },
            async get() { return {ids: [], documents: [], embeddings: [], metadatas: []} }
        };

        // Stub only the collection SOURCE — no chroma, no network. The export path itself runs for
        // real, so the receipt under assertion is the one production builds.
        ChromaManager.getKnowledgeBaseCollection = async () => collection;

        return DatabaseService.exportDatabase({backupPath: root})
    }

    test('an empty collection is degraded WITH a reason, never complete', async () => {
        const receipt = await exportWithCollectionCount(0);

        // The branchable field. Without it a consumer must parse prose to learn the bundle is empty,
        // which is what every one of the six zero-row bundles required.
        expect(receipt.status).toBe('degraded');
        expect(receipt.status).not.toBe('complete');
        expect(receipt.reason).toBe('source-collection-empty');

        expect(receipt.message).not.toContain('Export complete');
        expect(receipt.count).toBe(0);
        expect(receipt.expected).toBe(0);
    });

    test('a collection that GREW during export is degraded, not complete', async () => {
        // Review finding, reproduced as its repro: a binary empty-or-complete status certifies the
        // classifier's `grew` outcome as a clean capture. That branch's own source says it is
        // complete-or-better but NOT provably exact, because the export pages by offset — so the
        // receipt would claim more than the producer can establish.
        //
        // One expected row, two returned. Pre-fix this reported {status: 'complete', count: 2,
        // expected: 1}.
        let   served     = 0;
        const collection = {
            id  : 'ab75f86b-1651-4865-96f4-0287acd42ea7',
            name: 'neo-knowledge-base',
            async count() { return 1 },
            async get() {
                // Two rows arrive where one was snapshotted — a late write landing mid-export.
                if (served++ > 0) { return {ids: [], documents: [], embeddings: [], metadatas: []} }

                return {
                    ids       : ['a', 'b'],
                    documents : ['one', 'two'],
                    embeddings: [[0.1], [0.2]],
                    metadatas : [{}, {}]
                }
            }
        };

        ChromaManager.getKnowledgeBaseCollection = async () => collection;

        const receipt = await DatabaseService.exportDatabase({backupPath: root});

        expect(receipt.count, 'the written total is reported').toBe(2);
        expect(receipt.expected, 'the pre-pass snapshot is reported beside it').toBe(1);

        // The property under test: growth is NOT certified as a clean capture.
        expect(receipt.status).toBe('degraded');
        expect(receipt.status).not.toBe('complete');
        expect(receipt.reason).toBe('source-grew-during-export');
        expect(receipt.message).not.toContain('Export complete');
    });

    test('the receipt carries `expected`, so a zero has something to be zero against', async () => {
        const receipt = await exportWithCollectionCount(0);

        // `mc` and `graph` already report expected/exported. The KB's omission is why a zero-row
        // export could not fail its own contract — it had none.
        expect(Object.keys(receipt)).toContain('expected');
        expect(receipt.collectionId).toBe('ab75f86b-1651-4865-96f4-0287acd42ea7');
    });
});
