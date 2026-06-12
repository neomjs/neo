import {test, expect} from '@playwright/test';

import {
    formatGcDetail,
    resolveRetention,
    selectExpiredChunks
} from '../../../../../../ai/services/knowledge-base/helpers/kbGarbageCollectionEngine.mjs';

/**
 * Phase 4C (#11641) — `KbGarbageCollectionEngine` coverage: the pure retention-expiry
 * classification core of the KB garbage-collection daemon.
 *
 * The module is dependency-free (no Neo class system, no I/O, no clock) — so this spec needs
 * no `setup()` harness; it imports the pure functions directly and exercises them against
 * fixture rows whose shape mirrors the daemon's `fetchTenantRows` output (`{id, metadata}`).
 *
 * Covers the #11641 Contract Ledger Evidence column for the engine row: time-expiry,
 * count-expiry per `{tenantId, repoSlug}` bucket, the OR-union, the deterministic tie-break
 * on equal `ingestedAt`, the missing-`ingestedAt` fail-safe, and the empty-policy no-op.
 *
 * @see https://github.com/neomjs/neo/issues/11641
 * @see ai/services/knowledge-base/helpers/kbGarbageCollectionEngine.mjs — the module under test.
 */

/** Builds a tenant Chroma row in the daemon's `fetchTenantRows` shape. */
const row = (id, ingestedAt, repoSlug = 'repo-x') => ({
    id, metadata: {ingestedAt, tenantId: 'tenant-x', repoSlug}
});

test.describe('KbGarbageCollectionEngine — resolveRetention (#11641)', () => {
    test('passes a finite positive maxAgeMs and a non-negative integer maxCount', () => {
        expect(resolveRetention({maxAgeMs: 5000})).toEqual({maxAgeMs: 5000, maxCount: null});
        expect(resolveRetention({maxCount: 10})).toEqual({maxAgeMs: null, maxCount: 10});
        expect(resolveRetention({maxAgeMs: 5000, maxCount: 10})).toEqual({maxAgeMs: 5000, maxCount: 10});
        expect(resolveRetention({maxCount: 0})).toEqual({maxAgeMs: null, maxCount: 0}); // retain none — valid
    });

    test('degrades an invalid maxAgeMs to null (disabled)', () => {
        for (const bad of [0, -1, NaN, Infinity, '5000', undefined]) {
            expect(resolveRetention({maxAgeMs: bad}).maxAgeMs).toBeNull();
        }
    });

    test('degrades an invalid maxCount to null (disabled)', () => {
        for (const bad of [-1, 2.5, NaN, '10', undefined]) {
            expect(resolveRetention({maxCount: bad}).maxCount).toBeNull();
        }
    });

    test('treats a non-object retention as the empty policy', () => {
        expect(resolveRetention(null)).toEqual({maxAgeMs: null, maxCount: null});
        expect(resolveRetention(undefined)).toEqual({maxAgeMs: null, maxCount: null});
        expect(resolveRetention('nope')).toEqual({maxAgeMs: null, maxCount: null});
    });
});

test.describe('KbGarbageCollectionEngine — selectExpiredChunks (#11641)', () => {
    test('returns an empty result for non-array / empty rows', () => {
        expect(selectExpiredChunks({rows: null, retention: {maxCount: 1}, now: 1}))
            .toEqual({expiredIds: [], expiredCount: 0, evaluatedCount: 0});
        expect(selectExpiredChunks({rows: [], retention: {maxCount: 1}, now: 1}))
            .toEqual({expiredIds: [], expiredCount: 0, evaluatedCount: 0});
    });

    test('an empty / no-dimension retention policy expires nothing', () => {
        const diff = selectExpiredChunks({rows: [row('a', 1000), row('b', 2000)], retention: {}, now: 9_000_000});

        expect(diff.expiredCount).toBe(0);
        expect(diff.evaluatedCount).toBe(2);
    });

    test('time-expiry — expires chunks older than maxAgeMs (strict greater-than)', () => {
        const rows = [row('old', 90_000), row('edge', 95_000), row('fresh', 98_000)];
        const diff = selectExpiredChunks({rows, retention: {maxAgeMs: 5000}, now: 100_000});

        // old: age 10000 > 5000 → expired. edge: age 5000, not > 5000 → kept. fresh: age 2000 → kept.
        expect(diff.expiredIds).toEqual(['old']);
    });

    test('time-expiry is skipped when `now` is not a number', () => {
        expect(selectExpiredChunks({rows: [row('old', 1)], retention: {maxAgeMs: 5000}}).expiredCount).toBe(0);
    });

    test('count-expiry — retains the maxCount most-recent, expires the rest', () => {
        const rows = [row('r1', 5), row('r2', 4), row('r3', 3), row('r4', 2)];
        const diff = selectExpiredChunks({rows, retention: {maxCount: 2}, now: 1000});

        // most-recent 2 = r1, r2 retained; r3, r4 expired.
        expect(diff.expiredIds.sort()).toEqual(['r3', 'r4']);
    });

    test('count-expiry buckets by {tenantId, repoSlug} — one repo cannot crowd out another', () => {
        const rows = [
            row('a1', 5, 'repo-a'), row('a2', 4, 'repo-a'),
            row('b1', 9, 'repo-b')
        ];
        const diff = selectExpiredChunks({rows, retention: {maxCount: 1}, now: 1000});

        // repo-a bucket: keep a1, expire a2. repo-b bucket: b1 alone (< maxCount) → kept.
        expect(diff.expiredIds).toEqual(['a2']);
    });

    test('count-expiry tie-breaks equal ingestedAt deterministically by id asc', () => {
        const rows = [row('c', 100), row('a', 100), row('b', 100)];
        const diff = selectExpiredChunks({rows, retention: {maxCount: 1}, now: 1000});

        // equal ingestedAt → id asc → a, b, c; keep a, expire b + c.
        expect(diff.expiredIds.sort()).toEqual(['b', 'c']);
    });

    test('OR-expiry — a chunk expired by EITHER dimension is in the union', () => {
        const rows = [
            row('recent-kept',  99_000), // fresh + within count → kept
            row('recent-kept2', 98_000), // fresh + within count → kept
            row('count-out',    97_000), // fresh (age 3000) but count-rank 3 → count-expired
            row('time-out',     90_000)  // count-rank 4 AND age 10000 → both
        ];
        const diff = selectExpiredChunks({rows, retention: {maxAgeMs: 5000, maxCount: 2}, now: 100_000});

        expect(diff.expiredIds.sort()).toEqual(['count-out', 'time-out']);
    });

    test('a chunk with a missing / non-numeric ingestedAt is never expired', () => {
        const rows = [
            {id: 'no-stamp',     metadata: {tenantId: 't', repoSlug: 'r'}},
            {id: 'null-stamp',   metadata: {tenantId: 't', repoSlug: 'r', ingestedAt: null}},
            {id: 'string-stamp', metadata: {tenantId: 't', repoSlug: 'r', ingestedAt: '1'}},
            row('real-old', 1)
        ];
        // Only real-old is aged + rankable; the three unstamped chunks are excluded from both paths.
        const diff = selectExpiredChunks({rows, retention: {maxAgeMs: 5000, maxCount: 1}, now: 100_000});

        expect(diff.expiredIds).toEqual(['real-old']);
    });
});

test.describe('KbGarbageCollectionEngine — formatGcDetail (#11641)', () => {
    test('builds the Phase 4A telemetry detail payload', () => {
        const detail = formatGcDetail({
            diff: {expiredIds: [], expiredCount: 7, evaluatedCount: 50},
            retention: {maxAgeMs: 5000}, gcAutoDelete: true, deletedCount: 7, defragRecommended: true
        });

        expect(detail).toEqual({
            expiredCount: 7, evaluatedCount: 50, deletedCount: 7,
            retention: {maxAgeMs: 5000, maxCount: null}, gcAutoDelete: true, defragRecommended: true
        });
    });

    test('coerces flags to strict booleans and defaults counts', () => {
        const detail = formatGcDetail({diff: {expiredCount: 2, evaluatedCount: 2}});

        expect(detail.gcAutoDelete).toBe(false);
        expect(detail.defragRecommended).toBe(false);
        expect(detail.deletedCount).toBe(0);
    });

    test('is defensive against a missing diff', () => {
        expect(formatGcDetail({})).toEqual({
            expiredCount: 0, evaluatedCount: 0, deletedCount: 0,
            retention: {maxAgeMs: null, maxCount: null}, gcAutoDelete: false, defragRecommended: false
        });
    });
});
