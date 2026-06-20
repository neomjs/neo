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
 * Reproduces the session-summary re-loop: `summarizeSession` must paginate its per-session memory
 * fetch. A single un-paginated `.get` gathered only Chroma's first (bounded) page, so the written
 * `memoryCount` fell below `findSessionsToSummarize`'s full (paginated) count — the count-equality
 * drift check never reconciled and the session was re-summarized every sweep.
 */
test.describe('SessionService.summarizeSession — memory-fetch pagination', () => {
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

    test('paginates the per-session memory fetch — gathers all turns past a single bounded page', async () => {
        const svc       = SDK.Memory_SessionService,
              origGet   = svc.memoryCollection.get,
              origModel = svc.model;

        // A 5-turn session, but each Chroma .get returns a bounded page of 2 (mirrors Chroma's
        // per-get bound). Pre-fix: a single .get returned only the first 2 → memoryCount=2 ≠ the
        // drift's 5 → infinite re-summarization. The fix paginates to all 5.
        const ALL = Array.from({length: 5}, (_, i) => ({
            id      : `m${i}`,
            document: `turn ${i}`,
            metadata: {sessionId: 'pg-pagination', timestamp: i + 1}
        }));
        const seenOffsets = [];

        svc.memoryCollection.get = async ({offset = 0} = {}) => {
            seenOffsets.push(offset);

            const page = ALL.slice(offset, offset + 2); // bounded page of 2, regardless of requested limit

            return {
                ids      : page.map(r => r.id),
                documents: page.map(r => r.document),
                metadatas: page.map(r => r.metadata)
            };
        };

        // Bail right after the (paginated) fetch — this test asserts only the fetch behavior. The
        // guardrail wrapper catches the throw and summarizeSession returns null cleanly.
        svc.model = {generateContent: async () => { throw new Error('mock model unavailable'); }};

        try {
            await svc.summarizeSession('pg-pagination');
        } finally {
            svc.memoryCollection.get = origGet;
            svc.model               = origModel;
        }

        // Pre-fix: seenOffsets === [0] (only 2 of 5 turns fetched). Fixed: paginated across all 5,
        // advancing by the actual page size until the empty page at offset 5 stops it.
        expect(seenOffsets).toEqual([0, 2, 4, 5]);
    });
});
