import {setup} from '../../../../setup.mjs';

setup({appConfig: {name: 'CorpusProjectionContractTest'}});

import {test, expect} from '@playwright/test';
import fs             from 'fs';
import os             from 'os';
import path           from 'path';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';
import {
    beginCorpusProjection,
    commitCorpusProjectionFacet,
    CORPUS_PROJECTION_CONSUMER,
    CORPUS_PROJECTION_CONSUMER_FACETS,
    CORPUS_PROJECTION_FACETS,
    createCorpusProjectionAdmissionFingerprint,
    createCorpusProjectionReceipt,
    evaluateCorpusProjectionAdmission as evaluateCorpusProjectionAdmissionRaw,
    evaluateCorpusProjectionFreshness,
    failCorpusProjectionFacet,
    normalizeCorpusProjectionReceipt,
    recordCorpusMaterialization
} from '../../../../../../ai/services/graph/corpusProjectionContract.mjs';
import {
    readCorpusProjectionReceipt,
    writeCorpusProjectionReceipt
} from '../../../../../../ai/services/graph/corpusProjectionReceiptStore.mjs';

const HEAD_A       = 'a'.repeat(40);
const HEAD_B       = 'b'.repeat(40);
const EVALUATED_AT = Date.parse('2026-08-24T00:10:00.000Z');

const evaluateCorpusProjectionAdmission = options => evaluateCorpusProjectionAdmissionRaw({
    ...options,
    now: EVALUATED_AT
});

function committedReceipt() {
    let receipt = createCorpusProjectionReceipt({
        sourceRepository: 'https://github.com/neomjs/neo.git',
        sourceRef       : 'refs/heads/dev',
        freshnessSlaMs  : 4 * 60 * 60 * 1000,
        now             : '2026-08-24T00:00:00.000Z'
    });

    receipt = beginCorpusProjection({receipt, availableRevision: HEAD_A, now: '2026-08-24T00:01:00.000Z'});

    for (const facet of CORPUS_PROJECTION_FACETS) {
        receipt = commitCorpusProjectionFacet({receipt, facet, now: '2026-08-24T00:02:00.000Z'})
    }

    return receipt
}

test.describe('corpusProjectionContract — source-bound D2 admission (#17627)', () => {
    test('the consumer map names every facet explicitly and Golden Path depends only on its actual semantic types', () => {
        expect(CORPUS_PROJECTION_CONSUMER_FACETS).toEqual({
            [CORPUS_PROJECTION_CONSUMER.computedGoldenPath]: ['issues', 'discussions'],
            [CORPUS_PROJECTION_CONSUMER.contextFrontier]   : ['issues', 'pulls', 'discussions'],
            [CORPUS_PROJECTION_CONSUMER.dreamRem]          : ['issues'],
            [CORPUS_PROJECTION_CONSUMER.knowledgeSearch]   : []
        })
    });

    test('a fully committed receipt admits every declared consumer', () => {
        const receipt = committedReceipt();

        for (const consumer of [
            CORPUS_PROJECTION_CONSUMER.computedGoldenPath,
            CORPUS_PROJECTION_CONSUMER.contextFrontier,
            CORPUS_PROJECTION_CONSUMER.dreamRem
        ]) {
            expect(evaluateCorpusProjectionAdmission({consumer, receipt})).toMatchObject({
                admitted   : true,
                fallback   : 'current',
                reasonCode : 'projection-current',
                staleFacets: []
            })
        }
        expect(evaluateCorpusProjectionAdmission({
            consumer: CORPUS_PROJECTION_CONSUMER.knowledgeSearch,
            receipt : null
        })).toEqual({
            admitted      : true,
            fallback      : 'current',
            reasonCode    : 'no-facet-dependency',
            requiredFacets: [],
            staleFacets   : []
        })
    });

    test('diff-proven unchanged facets carry forward so pull-only work does not starve Golden Path', () => {
        let receipt = beginCorpusProjection({
            receipt          : committedReceipt(),
            availableRevision: HEAD_B,
            facets           : ['pulls'],
            now              : '2026-08-24T00:03:00.000Z'
        });
        receipt = commitCorpusProjectionFacet({receipt, facet: 'issues'});
        receipt = commitCorpusProjectionFacet({receipt, facet: 'discussions'});

        expect(evaluateCorpusProjectionAdmission({
            consumer: CORPUS_PROJECTION_CONSUMER.computedGoldenPath,
            receipt
        })).toMatchObject({admitted: true, staleFacets: []});

        expect(evaluateCorpusProjectionAdmission({
            consumer: CORPUS_PROJECTION_CONSUMER.contextFrontier,
            receipt
        })).toMatchObject({
            admitted   : false,
            fallback   : 'last-known-good',
            reasonCode : 'required-facet-stale',
            staleFacets: ['pulls']
        })
    });

    test('a same-revision rematerialization still withholds while a required facet is projecting', () => {
        const receipt = beginCorpusProjection({
            receipt          : committedReceipt(),
            availableRevision: HEAD_A,
            facets           : ['issues']
        });

        expect(evaluateCorpusProjectionAdmission({
            consumer: CORPUS_PROJECTION_CONSUMER.computedGoldenPath,
            receipt
        })).toMatchObject({
            admitted   : false,
            staleFacets: ['issues']
        })
    });

    test('a failed facet keeps its prior cursor and names the fail-closed state', () => {
        let receipt = beginCorpusProjection({
            receipt          : committedReceipt(),
            availableRevision: HEAD_B
        });

        receipt = commitCorpusProjectionFacet({receipt, facet: 'discussions'});
        receipt = failCorpusProjectionFacet({receipt, facet: 'issues', errorCode: 'CHROMA_UPSERT_FAILED'});

        expect(receipt.projectedRevisionByFacet).toEqual({
            issues     : HEAD_A,
            pulls      : HEAD_A,
            discussions: HEAD_B
        });
        expect(receipt.projectionStateByFacet.issues).toMatchObject({
            status   : 'failed',
            errorCode: 'CHROMA_UPSERT_FAILED'
        });
        expect(evaluateCorpusProjectionAdmission({
            consumer: CORPUS_PROJECTION_CONSUMER.computedGoldenPath,
            receipt
        })).toMatchObject({
            admitted   : false,
            staleFacets: ['issues']
        })
    });

    test('materialization is source-bound and only full runs advance the full-rematerialization clock', () => {
        let receipt = createCorpusProjectionReceipt({
            sourceRepository: 'https://github.com/neomjs/neo.git',
            sourceRef       : 'refs/heads/dev',
            freshnessSlaMs  : 4 * 60 * 60 * 1000
        });
        receipt = beginCorpusProjection({receipt, availableRevision: HEAD_A});
        receipt = recordCorpusMaterialization({
            receipt,
            revision: HEAD_A,
            full    : true,
            now     : '2026-08-24T00:05:00.000Z'
        });

        expect(receipt.materializedCorpusRevision).toBe(HEAD_A);
        expect(receipt.lastFullMaterializationAt).toBe('2026-08-24T00:05:00.000Z');
        expect(() => recordCorpusMaterialization({receipt, revision: HEAD_B})).toThrow(/must equal/)
    });

    test('missing source identity, malformed revisions, and unknown consumers fail closed', () => {
        const receipt = committedReceipt();

        expect(normalizeCorpusProjectionReceipt({...receipt, sourceRepository: ''})).toMatchObject({
            valid: false,
            code : 'source-identity-missing'
        });
        expect(normalizeCorpusProjectionReceipt({...receipt, availableCorpusRevision: 'short'})).toMatchObject({
            valid: false,
            code : 'available-revision-invalid'
        });
        expect(evaluateCorpusProjectionAdmission({consumer: 'future-unclassified-consumer', receipt})).toEqual({
            admitted      : false,
            fallback      : 'last-known-good',
            reasonCode    : 'consumer-unclassified',
            requiredFacets: [],
            staleFacets   : []
        });
        expect(evaluateCorpusProjectionAdmission({
            consumer                : CORPUS_PROJECTION_CONSUMER.computedGoldenPath,
            receipt,
            expectedSourceRepository: 'https://github.com/neomjs/neo-agent-brain.git',
            expectedSourceRef       : 'refs/heads/dev'
        })).toMatchObject({
            admitted   : false,
            reasonCode : 'source-identity-mismatch',
            staleFacets: ['issues', 'discussions']
        })
    });

    test('same-count facet substitution is rejected by exact facet identity', () => {
        const receipt = committedReceipt();

        delete receipt.projectedRevisionByFacet.pulls;
        receipt.projectedRevisionByFacet.releaseNotes = HEAD_A;

        expect(normalizeCorpusProjectionReceipt(receipt)).toMatchObject({
            valid: false,
            code : 'projected-revision-invalid:pulls'
        })
    });

    test('the admission fingerprint changes on state or source-revision movement', () => {
        const receipt = committedReceipt();
        const initial = createCorpusProjectionAdmissionFingerprint(receipt);

        expect(initial).toBeTruthy();
        expect(createCorpusProjectionAdmissionFingerprint({...receipt, updatedAt: 'later'})).toBe(initial);
        expect(createCorpusProjectionAdmissionFingerprint(beginCorpusProjection({
            receipt,
            availableRevision: HEAD_B,
            facets           : ['issues']
        }))).not.toBe(initial);
        expect(createCorpusProjectionAdmissionFingerprint(null)).toBeNull()
    });

    test('the declared SLA distinguishes in-window lag from overdue checks and projection lag', () => {
        const current = committedReceipt();
        let   lagging = beginCorpusProjection({
            receipt          : current,
            availableRevision: HEAD_B,
            facets           : ['issues'],
            now              : '2026-08-24T00:03:00.000Z'
        });
        lagging = commitCorpusProjectionFacet({receipt: lagging, facet: 'pulls'});
        lagging = commitCorpusProjectionFacet({receipt: lagging, facet: 'discussions'});

        expect(evaluateCorpusProjectionFreshness({
            receipt: lagging,
            now    : Date.parse('2026-08-24T03:00:00.000Z')
        })).toMatchObject({
            status     : 'lagging',
            posture    : 'pending',
            reasonCodes: [],
            staleFacets: ['issues']
        });
        expect(evaluateCorpusProjectionFreshness({
            receipt: lagging,
            now    : Date.parse('2026-08-24T05:00:00.000Z')
        })).toMatchObject({
            status     : 'breached',
            posture    : 'degraded',
            reasonCodes: ['source-check-overdue', 'projection-lag-overdue'],
            staleFacets: ['issues']
        });
        expect(evaluateCorpusProjectionAdmissionRaw({
            consumer: CORPUS_PROJECTION_CONSUMER.computedGoldenPath,
            receipt : current,
            now     : Date.parse('2026-08-24T05:00:00.000Z')
        })).toMatchObject({
            admitted  : false,
            reasonCode: 'freshness-sla-breached'
        })
    });

    test('the durable store round-trips a valid receipt and treats missing as never-established', async () => {
        const dir      = fs.mkdtempSync(path.join(os.tmpdir(), 'corpus-projection-receipt-')),
              filePath = path.join(dir, 'projection.json'),
              receipt  = committedReceipt();

        try {
            expect(await readCorpusProjectionReceipt(filePath)).toBeNull();
            expect(await writeCorpusProjectionReceipt(filePath, receipt)).toEqual(receipt);
            expect(await readCorpusProjectionReceipt(filePath)).toEqual(receipt)
        } finally {
            fs.rmSync(dir, {recursive: true, force: true})
        }
    });

    test('the durable store distinguishes malformed and contract-invalid receipts', async () => {
        const dir      = fs.mkdtempSync(path.join(os.tmpdir(), 'corpus-projection-invalid-')),
              filePath = path.join(dir, 'projection.json');

        try {
            fs.writeFileSync(filePath, '{broken');
            await expect(readCorpusProjectionReceipt(filePath)).rejects.toMatchObject({
                code: 'CORPUS_PROJECTION_RECEIPT_MALFORMED'
            });

            fs.writeFileSync(filePath, JSON.stringify({...committedReceipt(), sourceRepository: ''}));
            await expect(readCorpusProjectionReceipt(filePath)).rejects.toMatchObject({
                code: 'CORPUS_PROJECTION_RECEIPT_INVALID'
            });
            await expect(writeCorpusProjectionReceipt(filePath, {...committedReceipt(), sourceRef: ''}))
                .rejects.toMatchObject({code: 'CORPUS_PROJECTION_RECEIPT_INVALID'})
        } finally {
            fs.rmSync(dir, {recursive: true, force: true})
        }
    })
});
