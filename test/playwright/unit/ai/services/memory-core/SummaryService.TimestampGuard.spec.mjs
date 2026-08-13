import {setup} from '../../../../setup.mjs';

const appName = 'SummaryServiceTimestampGuardTest';

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
import SummaryService from '../../../../../../ai/services/memory-core/SummaryService.mjs';
import StorageRouter  from '../../../../../../ai/services/memory-core/managers/StorageRouter.mjs';

/**
 * Summary-row timestamp projection guard.
 *
 * `Date#toISOString()` raises `RangeError: Invalid time value` on an Invalid Date, and both summary
 * projections called it once per row INSIDE the result map — so a single row with an absent or
 * unparseable `timestamp` threw, the method-level `catch` escalated it to a whole-call
 * `SUMMARY_QUERY_ERROR`, and every well-formed co-resident row was discarded. That took the entire
 * semantic-summary surface down whenever the corpus held one bad row.
 *
 * These specs pin the repaired contract on BOTH projections: the malformed row survives with
 * `timestamp: null`, is COUNTED on the envelope, and never takes its co-residents down with it.
 * The count matters as much as the survival — guarding by silently dropping the row would convert a
 * visible outage into invisible under-retrieval, which is strictly harder to detect.
 *
 * Safety: pure in-memory spy collection — `StorageRouter.getSummaryCollection` is overridden in
 * `beforeEach` and restored in `afterEach`. No call reaches real ChromaDB.
 */

/**
 * Values that a stored `timestamp` can hold and that `new Date(...)` cannot project.
 * Pinned by the positive control below rather than assumed — see that test for why.
 */
const UNPROJECTABLE_TIMESTAMPS = [undefined, '', 'not-a-date', NaN, {}];

function createSpyCollection() {
    const rows = new Map();

    const asEntries = () => Array.from(rows.values());

    return {
        rows,

        async get({ids, limit, offset} = {}) {
            let entries = ids
                ? ids.map(id => rows.get(id)).filter(Boolean)
                : asEntries();

            if (limit !== undefined || offset !== undefined) {
                const start = offset ?? 0;
                entries     = entries.slice(start, start + (limit ?? entries.length));
            }

            return {
                ids      : entries.map(e => e.id),
                metadatas: entries.map(e => e.metadata),
                documents: entries.map(e => e.document)
            };
        },

        // Chroma's query surface nests one level per query text.
        async query({nResults} = {}) {
            const entries = asEntries().slice(0, nResults ?? asEntries().length);

            return {
                ids      : [entries.map(e => e.id)],
                distances: [entries.map((e, index) => index * 0.1)],
                metadatas: [entries.map(e => e.metadata)],
                documents: [entries.map(e => e.document)]
            };
        }
    };
}

function seedSummary(spy, id, timestamp, title) {
    const metadata = {title, sessionId: id};

    // Distinguish an ABSENT key from a key present with an unprojectable value.
    if (timestamp !== undefined) {
        metadata.timestamp = timestamp;
    }

    spy.rows.set(id, {id, metadata, document: title});
}

test.describe('Neo.ai.services.memory-core.SummaryService — timestamp projection guard (#17076)', () => {
    let spy;
    let originalGetSummaryCollection;

    test.beforeEach(() => {
        spy                                = createSpyCollection();
        originalGetSummaryCollection       = StorageRouter.getSummaryCollection;
        StorageRouter.getSummaryCollection = async () => spy;
    });

    test.afterEach(() => {
        StorageRouter.getSummaryCollection = originalGetSummaryCollection;
    });

    test('the seeded malformed values really are unprojectable (positive control)', () => {
        // Without this, a "the call no longer throws" assertion could pass simply because the fixture
        // never carried a value capable of throwing. Each value must reproduce the ORIGINAL failure
        // under the pre-fix expression for the specs below to mean anything.
        UNPROJECTABLE_TIMESTAMPS.forEach(value => {
            expect(() => new Date(value).toISOString()).toThrow(/Invalid time value/);
        });
    });

    test('querySummaries returns well-formed rows instead of failing on one malformed row', async () => {
        seedSummary(spy, 's-good-1', 1700000000000, 'Good 1');
        seedSummary(spy, 's-bad',    'not-a-date',   'Malformed');
        seedSummary(spy, 's-good-2', 1700000001000, 'Good 2');

        const view = await SummaryService.querySummaries({query: 'anything', nResults: 10});

        // The whole point: an error envelope here is the pre-fix behavior.
        expect(view.error).toBeUndefined();
        expect(view.code).toBeUndefined();

        expect(view.count).toBe(3);
        expect(view.results.map(r => r.title)).toEqual(['Good 1', 'Malformed', 'Good 2']);

        // The malformed row survives, explicitly nulled — not dropped, not "Invalid Date".
        expect(view.results[1].timestamp).toBeNull();
        expect(view.malformedTimestamps).toBe(1);

        // Co-residents keep their real values.
        expect(view.results[0].timestamp).toBe(new Date(1700000000000).toISOString());
        expect(view.results[2].timestamp).toBe(new Date(1700000001000).toISOString());
    });

    test('listSummaries applies the same guard on the id-slice projection', async () => {
        seedSummary(spy, 's-good-1', 1700000000000, 'Good 1');
        seedSummary(spy, 's-bad',    '',             'Malformed');

        const view = await SummaryService.listSummaries({limit: 10});

        expect(view.error).toBeUndefined();
        expect(view.count).toBe(2);
        expect(view.malformedTimestamps).toBe(1);
        expect(view.summaries.find(s => s.title === 'Malformed').timestamp).toBeNull();
        expect(view.summaries.find(s => s.title === 'Good 1').timestamp)
            .toBe(new Date(1700000000000).toISOString());
    });

    test('every unprojectable shape is counted rather than thrown, on both projections', async () => {
        UNPROJECTABLE_TIMESTAMPS.forEach((value, index) => seedSummary(spy, `s-bad-${index}`, value, `Bad ${index}`));

        const queried = await SummaryService.querySummaries({query: 'anything', nResults: 20});
        const listed  = await SummaryService.listSummaries({limit: 20});

        expect(queried.error).toBeUndefined();
        expect(listed.error).toBeUndefined();

        expect(queried.malformedTimestamps).toBe(UNPROJECTABLE_TIMESTAMPS.length);
        expect(listed.malformedTimestamps).toBe(UNPROJECTABLE_TIMESTAMPS.length);

        expect(queried.results.every(r => r.timestamp === null)).toBe(true);
        expect(listed.summaries.every(s => s.timestamp === null)).toBe(true);
    });

    test('malformedTimestamps is omitted when every row projects cleanly', async () => {
        seedSummary(spy, 's-good-1', 1700000000000, 'Good 1');
        seedSummary(spy, 's-good-2', 1700000001000, 'Good 2');

        const queried = await SummaryService.querySummaries({query: 'anything', nResults: 10});
        const listed  = await SummaryService.listSummaries({limit: 10});

        // Absence is the signal for "nothing malformed" — asserted so it stays a contract rather
        // than an accident of object spreading.
        expect(queried).not.toHaveProperty('malformedTimestamps');
        expect(listed).not.toHaveProperty('malformedTimestamps');
        expect(queried.count).toBe(2);
        expect(listed.count).toBe(2);
    });

    test('resolveSummaryTimestamp projects, nulls, and keeps null-coercion parity (unit-level)', () => {
        // The default export is the singleton instance → the static helper lives on .constructor.
        const resolve = metadata => SummaryService.constructor.resolveSummaryTimestamp(metadata);

        expect(resolve({timestamp: 1700000000000})).toBe(new Date(1700000000000).toISOString());
        expect(resolve({timestamp: '2026-08-13T22:00:00.000Z'})).toBe('2026-08-13T22:00:00.000Z');

        UNPROJECTABLE_TIMESTAMPS.forEach(value => {
            expect(resolve({timestamp: value})).toBeNull();
        });

        // Absent metadata / absent key are the same unprojectable class.
        expect(resolve({})).toBeNull();
        expect(resolve(undefined)).toBeNull();

        // PARITY, deliberately unchanged: `new Date(null)` is epoch 0, NOT an Invalid Date, so a
        // null-valued timestamp has always projected as 1970 rather than throwing. This guard does
        // not alter that — narrowing it would change output for already-stored rows, which is a
        // corpus-data decision rather than part of the throw-safety repair.
        expect(resolve({timestamp: null})).toBe(new Date(0).toISOString());
    });
});
