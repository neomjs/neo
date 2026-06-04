import {setup} from '../../../../setup.mjs';

const appName = 'KbGarbageCollectionServiceTest';

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

// Test-side entry-point bootstrap: Neo + core/_export populate `globalThis.Neo` before the
// dynamic KbGarbageCollectionService import below. Required because the class file no longer
// imports Neo itself (class+wrapper split). Mirrors KbReconciliationService.spec.
import Neo       from '../../../../../../src/Neo.mjs';
import * as core from '../../../../../../src/core/_export.mjs';

import {test, expect} from '@playwright/test';

/**
 * Unit coverage for `ai/daemons/kb-gc/KbGarbageCollectionService.mjs`, the KB
 * garbage-collection daemon.
 *
 * Stubbing strategy mirrors `KbReconciliationService.spec.mjs`: the daemon exposes
 * test-stubbable instance-method seams (`getKbConfig`, `fetchTenants`, `getCollection`,
 * `getCollectionCount`, `fetchTenantRows`, `deleteChunks`, `recordGcMetric`, `collectTenant`,
 * `scheduleNext`) so tests override them on the singleton without real config / SQLite /
 * Chroma I/O. The `collectTenant` tests keep the real method + the real pure
 * `KbGarbageCollectionEngine` so the retention-diff branching is genuinely exercised.
 *
 * Covers the Contract Ledger Evidence columns: the opt-in gate, the destructive
 * auto-delete gating, the clean-tenant telemetry suppression, the `defrag-recommended`
 * threshold signal, and pulse resilience. The pure retention logic is covered separately in
 * `KbGarbageCollectionEngine.spec.mjs`.
 *
 * @see https://github.com/neomjs/neo/issues/11641
 * @see ai/daemons/kb-gc/KbGarbageCollectionService.mjs — the daemon under test.
 * @see test/playwright/unit/ai/daemons/kb-reconciliation/KbReconciliationService.spec.mjs — the sibling pattern.
 */
test.describe('Neo.ai.daemons.KbGarbageCollectionService (#11641)', () => {
    let KbGarbageCollectionService;
    let KBRecorderService, logger;
    let originals = {};

    /** Builds a tenant Chroma row in the `fetchTenantRows` shape. */
    const row = (id, ingestedAt, repoSlug = 'repo-x') => ({
        id, metadata: {ingestedAt, tenantId: 'tenant-x', repoSlug}
    });

    /** Resolved AiConfig subtree fixture — mirrors Provider-inherited template leaves. */
    const defaultConfig = () => ({
        gcEnabled   : true,
        gcIntervalMs: 24 * 60 * 60 * 1000
    });

    test.beforeAll(async () => {
        ({default: KbGarbageCollectionService} =
            await import('../../../../../../ai/daemons/kb-gc/KbGarbageCollectionService.mjs'));

        KBRecorderService = (await import('../../../../../../ai/services/knowledge-base/KBRecorderService.mjs')).default;
        logger            = (await import('../../../../../../ai/mcp/server/knowledge-base/logger.mjs')).default;

        originals = {
            recorderReady        : KBRecorderService.ready,
            getTenantIngestion   : KBRecorderService.getTenantIngestionRollup,
            recordIngestionMetric: KBRecorderService.recordIngestionMetric,
            warn                 : logger.warn,
            error                : logger.error,
            info                 : logger.info,
            debug                : logger.debug
        };

        // `start()` awaits KBRecorderService.ready() — stub it to resolve immediately.
        KBRecorderService.ready = async () => {};
    });

    test.afterAll(() => {
        KBRecorderService.ready                    = originals.recorderReady;
        KBRecorderService.getTenantIngestionRollup = originals.getTenantIngestion;
        KBRecorderService.recordIngestionMetric    = originals.recordIngestionMetric;
    });

    test.afterEach(() => {
        KbGarbageCollectionService.stop();
        KbGarbageCollectionService.isPolling      = false;
        KbGarbageCollectionService.pollIntervalMs = null;

        // Drop instance-method seam overrides so the real prototype methods resurface for the
        // next test — an instance override otherwise leaks across tests in the worker.
        for (const seam of ['getKbConfig', 'fetchTenants', 'getCollection', 'getCollectionCount',
                             'fetchTenantRows', 'deleteChunks', 'recordGcMetric', 'collectTenant',
                             'scheduleNext']) {
            delete KbGarbageCollectionService[seam];
        }

        KBRecorderService.getTenantIngestionRollup = originals.getTenantIngestion;
        KBRecorderService.recordIngestionMetric    = originals.recordIngestionMetric;
        logger.warn  = originals.warn;
        logger.error = originals.error;
        logger.info  = originals.info;
        logger.debug = originals.debug;
    });

    /** Deterministic seam baseline — `scheduleNext` neutralized so no real timer leaks. */
    function applyStubs({config} = {}) {
        KbGarbageCollectionService.getKbConfig  = () => config ?? defaultConfig();
        KbGarbageCollectionService.scheduleNext = function () {};
    }

    test.describe('start / stop', () => {
        test('start() is a no-op when gcEnabled is false', async () => {
            applyStubs({config: {...defaultConfig(), gcEnabled: false}});
            let scheduled = 0;
            KbGarbageCollectionService.scheduleNext = () => { scheduled++ };

            await KbGarbageCollectionService.start();

            expect(KbGarbageCollectionService.isPolling).toBe(false);
            expect(scheduled).toBe(0);
        });

        test('start() schedules when enabled and is idempotent', async () => {
            applyStubs();
            let scheduled = 0;
            KbGarbageCollectionService.scheduleNext = () => { scheduled++ };

            await KbGarbageCollectionService.start();
            expect(KbGarbageCollectionService.isPolling).toBe(true);
            expect(scheduled).toBe(1);

            await KbGarbageCollectionService.start();
            expect(scheduled).toBe(1); // second start() is a no-op
        });

        test('start() honors a configured gcIntervalMs', async () => {
            applyStubs({config: {...defaultConfig(), gcIntervalMs: 54321}});

            await KbGarbageCollectionService.start();

            expect(KbGarbageCollectionService.pollIntervalMs).toBe(54321);
        });

        test('stop() clears the poll handle and is idempotent', async () => {
            applyStubs();
            KbGarbageCollectionService.scheduleNext = function () { this.pollHandle = setTimeout(() => {}, 60_000) };

            await KbGarbageCollectionService.start();
            expect(KbGarbageCollectionService.pollHandle).not.toBeNull();

            KbGarbageCollectionService.stop();
            expect(KbGarbageCollectionService.pollHandle).toBeNull();
            expect(KbGarbageCollectionService.isPolling).toBe(false);
            expect(() => KbGarbageCollectionService.stop()).not.toThrow();
        });
    });

    test.describe('pulse', () => {
        test('returns early without fetching the collection when no tenants exist', async () => {
            applyStubs();
            KbGarbageCollectionService.fetchTenants = async () => [];
            let collectionFetched = 0;
            KbGarbageCollectionService.getCollection = async () => { collectionFetched++; return {} };

            await KbGarbageCollectionService.pulse();

            expect(collectionFetched).toBe(0);
        });

        test('collects each enumerated tenant', async () => {
            applyStubs();
            KbGarbageCollectionService.fetchTenants       = async () => [
                {tenantId: 'tenant-a', repoSlug: 'repo-a'},
                {tenantId: 'tenant-b', repoSlug: 'repo-b'}
            ];
            KbGarbageCollectionService.getCollection      = async () => ({});
            KbGarbageCollectionService.getCollectionCount = async () => 100;
            const collected = [];
            KbGarbageCollectionService.collectTenant = async ({tenantId, repoSlug}) => {
                collected.push(tenantId);
                return {tenantId, repoSlug, diff: {expiredCount: 0}, deletedCount: 0};
            };

            await KbGarbageCollectionService.pulse();

            expect(collected.sort()).toEqual(['tenant-a', 'tenant-b']);
        });

        test('reschedules from the finally block even when getCollection throws', async () => {
            applyStubs();
            KbGarbageCollectionService.fetchTenants  = async () => [{tenantId: 't', repoSlug: 'r'}];
            KbGarbageCollectionService.getCollection = async () => { throw new Error('chroma down') };
            let rescheduled = 0;
            KbGarbageCollectionService.scheduleNext = () => { rescheduled++ };

            await expect(KbGarbageCollectionService.pulse()).resolves.toBeUndefined();
            expect(rescheduled).toBe(1);
        });

        test('a null (failed) tenant result does not block telemetry for the rest', async () => {
            applyStubs();
            KbGarbageCollectionService.fetchTenants       = async () => [
                {tenantId: 'tenant-bad', repoSlug: 'r'},
                {tenantId: 'tenant-ok',  repoSlug: 'r'}
            ];
            KbGarbageCollectionService.getCollection      = async () => ({});
            KbGarbageCollectionService.getCollectionCount = async () => 100;
            KbGarbageCollectionService.collectTenant = async ({tenantId, repoSlug}) => {
                if (tenantId === 'tenant-bad') return null; // simulate a caught per-tenant failure
                return {tenantId, repoSlug, diff: {expiredCount: 3}, deletedCount: 0};
            };
            const metrics = [];
            KbGarbageCollectionService.recordGcMetric = (m) => { metrics.push(m) };

            await expect(KbGarbageCollectionService.pulse()).resolves.toBeUndefined();

            expect(metrics).toHaveLength(1);
            expect(metrics[0].tenantId).toBe('tenant-ok');
        });

        test('emits a defrag-recommended warning when cumulative deletion exceeds the threshold', async () => {
            applyStubs({config: {gcEnabled: true, gcAutoDelete: true, gcDefragThreshold: 0.10}});
            KbGarbageCollectionService.fetchTenants       = async () => [{tenantId: 'tenant-x', repoSlug: 'repo-x'}];
            KbGarbageCollectionService.getCollection      = async () => ({});
            KbGarbageCollectionService.getCollectionCount = async () => 100;
            KbGarbageCollectionService.collectTenant      = async ({tenantId, repoSlug}) =>
                ({tenantId, repoSlug, diff: {expiredCount: 20}, deletedCount: 20});
            KbGarbageCollectionService.recordGcMetric = () => {};
            const warns = [];
            logger.warn = (msg) => { warns.push(msg) };

            await KbGarbageCollectionService.pulse();

            // 20 deleted / 100 collection = 0.20 > 0.10 → defrag-recommended.
            expect(warns.some(w => String(w).includes('defrag-recommended'))).toBe(true);
        });

        test('stays silent on defrag when cumulative deletion is below the threshold', async () => {
            applyStubs({config: {gcEnabled: true, gcAutoDelete: true, gcDefragThreshold: 0.10}});
            KbGarbageCollectionService.fetchTenants       = async () => [{tenantId: 'tenant-x', repoSlug: 'repo-x'}];
            KbGarbageCollectionService.getCollection      = async () => ({});
            KbGarbageCollectionService.getCollectionCount = async () => 100;
            KbGarbageCollectionService.collectTenant      = async ({tenantId, repoSlug}) =>
                ({tenantId, repoSlug, diff: {expiredCount: 5}, deletedCount: 5});
            KbGarbageCollectionService.recordGcMetric = () => {};
            const warns = [];
            logger.warn = (msg) => { warns.push(msg) };

            await KbGarbageCollectionService.pulse();

            // 5 / 100 = 0.05 < 0.10 → no defrag-recommended.
            expect(warns.some(w => String(w).includes('defrag-recommended'))).toBe(false);
        });
    });

    test.describe('collectTenant', () => {
        const baseArgs = {tenantId: 'tenant-x', repoSlug: 'repo-x', collection: {}, now: 100_000};

        test('a clean tenant (nothing expired) issues no delete', async () => {
            applyStubs();
            KbGarbageCollectionService.fetchTenantRows = async () => [row('a', 99_000), row('b', 98_000), row('c', 97_000)];
            let deleted = 0;
            KbGarbageCollectionService.deleteChunks = async () => { deleted++; return 0 };

            const result = await KbGarbageCollectionService.collectTenant({...baseArgs, retention: {maxCount: 5}, autoDelete: true});

            expect(result.diff.expiredCount).toBe(0);
            expect(result.deletedCount).toBe(0);
            expect(deleted).toBe(0);
        });

        test('expired chunks with auto-delete OFF are detected but not deleted', async () => {
            applyStubs();
            KbGarbageCollectionService.fetchTenantRows = async () => [row('r1', 5), row('r2', 4), row('r3', 3)];
            let deleted = 0;
            KbGarbageCollectionService.deleteChunks = async () => { deleted++; return 0 };

            const result = await KbGarbageCollectionService.collectTenant({...baseArgs, retention: {maxCount: 1}, autoDelete: false});

            expect(result.diff.expiredCount).toBe(2); // r2, r3 beyond maxCount 1
            expect(result.deletedCount).toBe(0);
            expect(deleted).toBe(0);
        });

        test('expired chunks with auto-delete ON are deleted', async () => {
            applyStubs();
            KbGarbageCollectionService.fetchTenantRows = async () => [row('r1', 5), row('r2', 4), row('r3', 3)];
            const deletedIds = [];
            KbGarbageCollectionService.deleteChunks = async (collection, ids) => { deletedIds.push(...ids); return ids.length };

            const result = await KbGarbageCollectionService.collectTenant({...baseArgs, retention: {maxCount: 1}, autoDelete: true});

            expect(deletedIds.sort()).toEqual(['r2', 'r3']);
            expect(result.deletedCount).toBe(2);
        });

        test('never throws — a fetchTenantRows failure is caught, logged, and returns null', async () => {
            applyStubs();
            KbGarbageCollectionService.fetchTenantRows = async () => { throw new Error('chroma get failed') };
            const errors = [];
            logger.error = (msg) => { errors.push(msg) };

            const result = await KbGarbageCollectionService.collectTenant({...baseArgs, retention: {maxCount: 1}, autoDelete: false});

            expect(result).toBeNull();
            expect(errors.some(e => String(e).includes('GC failed for tenant tenant-x'))).toBe(true);
        });
    });

    test.describe('fetchTenants', () => {
        test('dedupes the rollup to distinct tenants, keeping the first repoSlug', async () => {
            KBRecorderService.getTenantIngestionRollup = () => [
                {tenantId: 'tenant-a', repoSlug: 'repo-a1'},
                {tenantId: 'tenant-a', repoSlug: 'repo-a2'},
                {tenantId: 'tenant-b', repoSlug: 'repo-b'}
            ];

            expect(await KbGarbageCollectionService.fetchTenants()).toEqual([
                {tenantId: 'tenant-a', repoSlug: 'repo-a1'},
                {tenantId: 'tenant-b', repoSlug: 'repo-b'}
            ]);
        });

        test('returns an empty list when the rollup is empty or unavailable', async () => {
            KBRecorderService.getTenantIngestionRollup = () => [];
            expect(await KbGarbageCollectionService.fetchTenants()).toEqual([]);

            KBRecorderService.getTenantIngestionRollup = () => undefined;
            expect(await KbGarbageCollectionService.fetchTenants()).toEqual([]);
        });
    });

    test.describe('deleteChunks', () => {
        test('deletes the id set and returns the count', async () => {
            const deleteCalls = [];
            const collection  = {delete: async (arg) => { deleteCalls.push(arg) }};

            const count = await KbGarbageCollectionService.deleteChunks(collection, ['id-1', 'id-2']);

            expect(count).toBe(2);
            expect(deleteCalls).toEqual([{ids: ['id-1', 'id-2']}]);
        });

        test('is a no-op for an empty / non-array id set', async () => {
            let deleteCalled = 0;
            const collection = {delete: async () => { deleteCalled++ }};

            expect(await KbGarbageCollectionService.deleteChunks(collection, [])).toBe(0);
            expect(await KbGarbageCollectionService.deleteChunks(collection, null)).toBe(0);
            expect(deleteCalled).toBe(0);
        });
    });

    test.describe('recordGcMetric', () => {
        test('emits a tombstone event with the chunk counts + detail payload', async () => {
            const events = [];
            KBRecorderService.recordIngestionMetric = (e) => { events.push(e) };

            KbGarbageCollectionService.recordGcMetric({
                tenantId        : 'tenant-x',
                repoSlug        : 'repo-x',
                diff            : {expiredCount: 6, evaluatedCount: 40},
                deletedCount    : 6,
                retention       : {maxAgeMs: 5000},
                autoDelete      : true,
                defragRecommended: true
            });

            expect(events).toHaveLength(1);
            expect(events[0]).toMatchObject({
                tenantId     : 'tenant-x',
                repoSlug     : 'repo-x',
                eventType    : 'tombstone',
                chunksTotal  : 6,
                chunksDeleted: 6
            });
            expect(events[0].detail).toMatchObject({
                expiredCount: 6, evaluatedCount: 40, deletedCount: 6, gcAutoDelete: true, defragRecommended: true
            });
        });
    });
});
