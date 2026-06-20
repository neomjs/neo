import {setup} from '../../../../setup.mjs';

const appName = 'SessionServiceSummarizePaginationTest';

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
 * Closed-loop proof for the session-summary re-loop fix: `summarizeSession` must paginate its
 * per-session memory fetch. A single bounded `.get` gathered only the first page, so the written
 * `memoryCount` fell below `findSessionsToSummarize`'s full (paginated) count — the count-equality
 * drift check never reconciled and the session was re-summarized every sweep.
 *
 * This reproduces the whole loop offline with a batch limit of 2 over a 5-turn session: fetch all 5
 * across multiple pages → write `memoryCount: 5` → re-run `findSessionsToSummarize` and confirm the
 * session is no longer selected. Pre-fix the fetch stopped at the first page (`memoryCount: 2`), so
 * the drift selector kept returning the session forever.
 */
test.describe('SessionService.summarizeSession — memory-fetch pagination (closed loop)', () => {
    test.describe.configure({mode: 'serial'});

    let SDK;

    test.beforeAll(async () => {
        SDK = await import('../../../../../../ai/services.mjs');

        if (!SDK.Memory_LifecycleService._initPromise) {
            await SDK.Memory_LifecycleService.initAsync();
        } else {
            await SDK.Memory_LifecycleService.ready();
        }
    });

    test('paginates the fetch, writes the full memoryCount, and the drift selector stops returning the session', async () => {
        const svc          = SDK.Memory_SessionService,
              aiConfig     = (await import('../../../../../../ai/mcp/server/memory-core/config.mjs')).default,
              origMemGet   = svc.memoryCollection.get,
              origModel    = svc.model,
              origSessions = svc.sessionsCollection,
              origLimit    = aiConfig.summarizationBatchLimit;

        // Shrink the per-get batch to 2 so a 5-turn session forces multiple pages. Both summarizeSession
        // (advance-by-actual-page) and findSessionsToSummarize (advance-by-limit) read with THIS limit.
        aiConfig.summarizationBatchLimit = 2;

        const SESSION = 'pg-pagination';

        const ALL = Array.from({length: 5}, (_, i) => ({
            id      : `m${i}`,
            document: `turn ${i}`,
            metadata: {sessionId: SESSION, timestamp: i + 1}
        }));

        const memGetOffsets = [];
        const summaryStore  = [];

        // memoryCollection.get serves BOTH summarizeSession's per-session fetch AND
        // findSessionsToSummarize's full count scan. It RESPECTS the requested limit (real Chroma
        // behavior) — so with limit=2 each page holds 2, and both callers must paginate to see all 5.
        svc.memoryCollection.get = async ({offset = 0, limit} = {}) => {
            memGetOffsets.push(offset);

            const page = ALL.slice(offset, offset + limit);

            return {
                ids      : page.map(r => r.id),
                documents: page.map(r => r.document),
                metadatas: page.map(r => r.metadata)
            };
        };

        // A parseable summary so summarizeSession proceeds past synthesis to the memoryCount write.
        svc.model = {
            generateContent: async () => ({
                response: {
                    text: () => JSON.stringify({
                        summary     : 'mock summary',
                        title       : 'Mock Session',
                        category    : 'test',
                        quality     : 5,
                        productivity: 5,
                        impact      : 5,
                        complexity  : 5,
                        technologies: []
                    })
                }
            })
        };

        // Fake summary collection: upsert captures the written metadata, get replays it (paginated) so
        // findSessionsToSummarize reads the reconciled memoryCount back — no Chroma/embedding needed.
        svc.sessionsCollection = {
            upsert: async ({metadatas}) => { (metadatas || []).forEach(m => summaryStore.push({...m})); },
            get   : async ({offset = 0, limit = 2} = {}) => {
                const page = summaryStore.slice(offset, offset + limit);
                return {ids: page.map((_, i) => `summary_${offset + i}`), metadatas: page};
            }
        };

        try {
            const result = await svc.summarizeSession(SESSION);

            // 1. Fetched all 5 turns across pages of 2 (advance-by-actual, stop on the empty page).
            expect(memGetOffsets).toEqual([0, 2, 4, 5]);

            // 2. Wrote the FULL paginated count, not the first-page undercount — the exact AC the pre-fix
            //    violated (it wrote 2, so the drift never reconciled).
            expect(summaryStore).toHaveLength(1);
            expect(summaryStore[0].memoryCount).toBe(5);
            expect(result?.memoryCount).toBe(5);

            // 3. Closed loop: with memoryCount=5 written, the drift selector (count === summaryCount) no
            //    longer returns the session. Pre-fix (memoryCount=2 ≠ 5) it re-selected it every sweep.
            const toSummarize = await svc.findSessionsToSummarize();
            expect(toSummarize).not.toContain(SESSION);
        } finally {
            svc.memoryCollection.get         = origMemGet;
            svc.model                        = origModel;
            svc.sessionsCollection           = origSessions;
            aiConfig.summarizationBatchLimit = origLimit;
        }
    });
});
