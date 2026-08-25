import {setup} from '../../../../setup.mjs';

const appName = 'KbReconciliationServiceTest';

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

// Test-side entry-point bootstrap: Neo + core/_export populate `globalThis.Neo` before
// the dynamic KbReconciliationService import below. Required because the class file no
// longer imports Neo itself (class+wrapper split). Mirrors KbAlertingService.spec.
import Neo       from '../../../../../../src/Neo.mjs';
import * as core from '../../../../../../src/core/_export.mjs';

import {test, expect} from '@playwright/test';

/**
 * Unit coverage for `ai/daemons/kb-reconciliation/KbReconciliationService.mjs`, the KB
 * reconciliation daemon.
 *
 * Stubbing strategy mirrors `KbAlertingService.spec.mjs`: the daemon exposes test-stubbable
 * instance-method seams (`getKbConfig`, `fetchTenants`, `getCollection`,
 * `fetchTenantConfigVersion`, `fetchTenantRows`, `tombstoneOrphans`, `recordReconcileMetric`,
 * `scheduleNext`) so tests override them on the singleton without real config / SQLite /
 * Chroma I/O. The orchestration tests keep the real `reconcileTenant` + the real pure
 * `KbReconciliationEngine` so the diff-driven branching is genuinely exercised.
 *
 * Covers the Contract Ledger Evidence columns: the opt-in gate, the destructive
 * auto-tombstone gating, the clean-tenant telemetry suppression, the tenant-scoped delete,
 * and pulse resilience. The pure diff logic is covered separately in
 * `KbReconciliationEngine.spec.mjs`.
 *
 * @see https://github.com/neomjs/neo/issues/11640
 * @see ai/daemons/kb-reconciliation/KbReconciliationService.mjs — the daemon under test.
 * @see test/playwright/unit/ai/daemons/kb-alerting/KbAlertingService.spec.mjs — the sibling pattern.
 */
test.describe('Neo.ai.daemons.KbReconciliationService (#11640)', () => {
    let KbReconciliationService;
    let KBRecorderService, logger;
    let originals = {};

    /** Builds a tenant Chroma row in the `getTenantRows` shape. */
    const row = (id, v, metadata = {}) => ({
        id,
        metadata: {
            tenantConfigVersion: v,
            ingestedAt         : 1000,
            repoSlug           : 'repo-x',
            sourcePath         : 'src/' + id + '.js',
            tenantId           : 'tenant-x',
            ...metadata
        }
    });

    /** Resolved AiConfig subtree fixture — mirrors Provider-inherited template leaves. */
    const defaultConfig = () => ({
        reconciliationEnabled   : true,
        reconciliationIntervalMs: 60 * 60 * 1000
    });

    test.beforeAll(async () => {
        ({default: KbReconciliationService} =
            await import('../../../../../../ai/daemons/kb-reconciliation/KbReconciliationService.mjs'));

        KBRecorderService = (await import('../../../../../../ai/services/knowledge-base/KBRecorderService.mjs')).default;
        logger            = (await import('../../../../../../ai/mcp/server/knowledge-base/logger.mjs')).default;

        originals = {
            recorderReady        : KBRecorderService.ready,
            getTenantIngestion   : KBRecorderService.getTenantIngestionRollup,
            recordIngestionMetric: KBRecorderService.recordIngestionMetric,
            warn                 : logger.warn,
            error                : logger.error,
            info                 : logger.info
        };

        // `start()` awaits KBRecorderService.ready() — stub it to resolve immediately.
        KBRecorderService.ready = async () => {};
    });

    test.afterAll(() => {
        KBRecorderService.ready                  = originals.recorderReady;
        KBRecorderService.getTenantIngestionRollup = originals.getTenantIngestion;
        KBRecorderService.recordIngestionMetric  = originals.recordIngestionMetric;
    });

    test.afterEach(() => {
        KbReconciliationService.stop();
        KbReconciliationService.isPolling      = false;
        KbReconciliationService.pollIntervalMs = null;

        // Drop instance-method seam overrides so the real prototype methods resurface for
        // the next test — an instance override otherwise leaks across tests in the worker.
        for (const seam of ['getKbConfig', 'fetchTenants', 'getCollection', 'fetchTenantConfigVersion',
                             'fetchTenantRows', 'fetchTenantManifests', 'fetchTenantDeclaredParsers',
                             'tombstoneOrphans', 'recordReconcileMetric',
                             'reconcileTenant', 'scheduleNext']) {
            delete KbReconciliationService[seam];
        }

        KBRecorderService.getTenantIngestionRollup = originals.getTenantIngestion;
        KBRecorderService.recordIngestionMetric    = originals.recordIngestionMetric;
        logger.warn  = originals.warn;
        logger.error = originals.error;
        logger.info  = originals.info;
    });

    /** Deterministic seam baseline — `scheduleNext` neutralized so no real timer leaks. */
    function applyStubs({config} = {}) {
        KbReconciliationService.getKbConfig          = () => config ?? defaultConfig();
        KbReconciliationService.fetchTenantManifests = async () => ({});
        KbReconciliationService.scheduleNext         = function () {};
    }

    test.describe('start / stop', () => {
        test('start() is a no-op when reconciliationEnabled is false', async () => {
            applyStubs({config: {...defaultConfig(), reconciliationEnabled: false}});
            let scheduled = 0;
            KbReconciliationService.scheduleNext = () => { scheduled++ };

            await KbReconciliationService.start();

            expect(KbReconciliationService.isPolling).toBe(false);
            expect(scheduled).toBe(0);
        });

        test('start() schedules when enabled and is idempotent', async () => {
            applyStubs();
            let scheduled = 0;
            KbReconciliationService.scheduleNext = () => { scheduled++ };

            await KbReconciliationService.start();
            expect(KbReconciliationService.isPolling).toBe(true);
            expect(scheduled).toBe(1);

            await KbReconciliationService.start();
            expect(scheduled).toBe(1); // second start() is a no-op
        });

        test('start() honors a configured reconciliationIntervalMs', async () => {
            applyStubs({config: {...defaultConfig(), reconciliationIntervalMs: 12345}});

            await KbReconciliationService.start();

            expect(KbReconciliationService.pollIntervalMs).toBe(12345);
        });

        test('stop() clears the poll handle and is idempotent', async () => {
            applyStubs();
            KbReconciliationService.scheduleNext = function () { this.pollHandle = setTimeout(() => {}, 60_000) };

            await KbReconciliationService.start();
            expect(KbReconciliationService.pollHandle).not.toBeNull();

            KbReconciliationService.stop();
            expect(KbReconciliationService.pollHandle).toBeNull();
            expect(KbReconciliationService.isPolling).toBe(false);
            expect(() => KbReconciliationService.stop()).not.toThrow();
        });
    });

    test.describe('pulse', () => {
        test('returns early without fetching the collection when no tenants exist', async () => {
            applyStubs();
            KbReconciliationService.fetchTenants = async () => [];
            let collectionFetched = 0;
            KbReconciliationService.getCollection = async () => { collectionFetched++; return {} };

            await KbReconciliationService.pulse();

            expect(collectionFetched).toBe(0);
        });

        test('reconciles each enumerated tenant', async () => {
            applyStubs();
            KbReconciliationService.fetchTenants  = async () => [
                {tenantId: 'tenant-a', repoSlug: 'repo-a'},
                {tenantId: 'tenant-b', repoSlug: 'repo-b'}
            ];
            KbReconciliationService.getCollection = async () => ({});
            const reconciled = [];
            KbReconciliationService.reconcileTenant = async ({tenantId}) => { reconciled.push(tenantId) };

            await KbReconciliationService.pulse();

            expect(reconciled.sort()).toEqual(['tenant-a', 'tenant-b']);
        });

        test('reschedules from the finally block even when getCollection throws', async () => {
            applyStubs();
            KbReconciliationService.fetchTenants  = async () => [{tenantId: 't', repoSlug: 'r'}];
            KbReconciliationService.getCollection = async () => { throw new Error('chroma down') };
            let rescheduled = 0;
            KbReconciliationService.scheduleNext = () => { rescheduled++ };

            await expect(KbReconciliationService.pulse()).resolves.toBeUndefined();
            expect(rescheduled).toBe(1);
        });

        test('a single tenant failure does not abort the remaining tenants', async () => {
            applyStubs({config: {reconciliationEnabled: true, reconciliationAutoTombstone: false}});
            KbReconciliationService.fetchTenants  = async () => [
                {tenantId: 'tenant-bad', repoSlug: 'r'},
                {tenantId: 'tenant-ok',  repoSlug: 'r'}
            ];
            KbReconciliationService.getCollection = async () => ({});
            KbReconciliationService.fetchTenantConfigVersion = async (tenantId) => {
                if (tenantId === 'tenant-bad') throw new Error('config read failed');
                return 5;
            };
            KbReconciliationService.fetchTenantRows = async () => [row('stale', 1)];
            const metrics = [];
            KbReconciliationService.recordReconcileMetric = (m) => { metrics.push(m) };

            await expect(KbReconciliationService.pulse()).resolves.toBeUndefined();

            // tenant-bad threw inside reconcileTenant (caught); tenant-ok still emitted.
            expect(metrics).toHaveLength(1);
            expect(metrics[0].tenantId).toBe('tenant-ok');
        });
    });

    test.describe('reconcileTenant', () => {
        /** Wires the per-tenant seams; `rows` drives the real KbReconciliationEngine diff. */
        function wireTenant({version, rows, manifestsByRepo = {}, declaredByRepo = {}}) {
            KbReconciliationService.fetchTenantConfigVersion   = async () => version;
            KbReconciliationService.fetchTenantRows            = async () => rows;
            KbReconciliationService.fetchTenantManifests       = async () => manifestsByRepo;
            // Stubbed even when empty: left unstubbed this seam reaches the real
            // `IngestionService.getTenantConfig` from a unit test.
            KbReconciliationService.fetchTenantDeclaredParsers = async () => declaredByRepo;
        }

        test('a clean tenant emits no telemetry and tombstones nothing', async () => {
            applyStubs();
            wireTenant({version: 5, rows: [row('a', 5), row('b', 5)]});
            let tombstoned = 0, recorded = 0;
            KbReconciliationService.tombstoneOrphans     = async () => { tombstoned++; return 0 };
            KbReconciliationService.recordReconcileMetric = () => { recorded++ };

            await KbReconciliationService.reconcileTenant({
                tenantId: 'tenant-x', repoSlug: 'repo-x', collection: {}, orphanVersionGap: 2, autoTombstone: true
            });

            expect(recorded).toBe(0);
            expect(tombstoned).toBe(0);
        });

        test('a drifting tenant with auto-tombstone OFF emits telemetry but issues no delete', async () => {
            applyStubs();
            wireTenant({version: 5, rows: [row('a', 5), row('b', 3), row('c', 1)]}); // 2 stale, both gap >= 2
            let tombstoned = 0;
            KbReconciliationService.tombstoneOrphans = async () => { tombstoned++; return 0 };
            const metrics = [];
            KbReconciliationService.recordReconcileMetric = (m) => { metrics.push(m) };

            await KbReconciliationService.reconcileTenant({
                tenantId: 'tenant-x', repoSlug: 'repo-x', collection: {}, orphanVersionGap: 2, autoTombstone: false
            });

            expect(tombstoned).toBe(0);
            expect(metrics).toHaveLength(1);
            expect(metrics[0].diff.staleCount).toBe(2);
            expect(metrics[0].tombstonedCount).toBe(0);
            expect(metrics[0].autoTombstone).toBe(false);
        });

        test('a manifest-orphan tenant with auto-tombstone OFF emits telemetry but issues no delete (#11711)', async () => {
            applyStubs();
            wireTenant({
                version: 0,
                rows   : [
                    row('live', 0),
                    row('manifest-orphan', 0, {sourcePath: 'src/orphan.js'})
                ],
                manifestsByRepo: {
                    'repo-x': {pathsAfterPush: ['src/live.js'], updatedAt: 2000}
                }
            });
            let tombstoned = 0;
            KbReconciliationService.tombstoneOrphans = async () => { tombstoned++; return 0 };
            const metrics = [];
            KbReconciliationService.recordReconcileMetric = (m) => { metrics.push(m) };

            await KbReconciliationService.reconcileTenant({
                tenantId: 'tenant-x', repoSlug: 'repo-x', collection: {}, orphanVersionGap: 2, autoTombstone: false
            });

            expect(tombstoned).toBe(0);
            expect(metrics).toHaveLength(1);
            expect(metrics[0].diff).toMatchObject({
                staleCount         : 0,
                manifestOrphanCount: 1,
                totalOrphanCount   : 1,
                actionableIds      : ['manifest-orphan']
            });
        });

        test('a drifting tenant with auto-tombstone ON deletes the actionable orphans', async () => {
            applyStubs();
            wireTenant({version: 5, rows: [row('a', 5), row('b', 3), row('c', 1)]}); // b,c actionable at gap 2
            const deleted = [];
            KbReconciliationService.tombstoneOrphans = async (collection, ids) => { deleted.push(...ids); return ids.length };
            const metrics = [];
            KbReconciliationService.recordReconcileMetric = (m) => { metrics.push(m) };

            await KbReconciliationService.reconcileTenant({
                tenantId: 'tenant-x', repoSlug: 'repo-x', collection: {}, orphanVersionGap: 2, autoTombstone: true
            });

            expect(deleted.sort()).toEqual(['b', 'c']);
            expect(metrics[0].tombstonedCount).toBe(2);
            expect(metrics[0].autoTombstone).toBe(true);
        });

        test('auto-tombstone ON unions config-stale and manifest-orphan actionable ids once (#11711)', async () => {
            applyStubs();
            wireTenant({
                version: 5,
                rows   : [
                    row('overlap', 1, {sourcePath: 'src/old.js'}),
                    row('manifest-only', 5, {sourcePath: 'src/removed.js'}),
                    row('live', 5)
                ],
                manifestsByRepo: {
                    'repo-x': {pathsAfterPush: ['src/live.js'], updatedAt: 2000}
                }
            });
            const deleted = [];
            KbReconciliationService.tombstoneOrphans = async (collection, ids) => { deleted.push(...ids); return ids.length };
            const metrics = [];
            KbReconciliationService.recordReconcileMetric = (m) => { metrics.push(m) };

            await KbReconciliationService.reconcileTenant({
                tenantId: 'tenant-x', repoSlug: 'repo-x', collection: {}, orphanVersionGap: 2, autoTombstone: true
            });

            expect(deleted.sort()).toEqual(['manifest-only', 'overlap']);
            expect(metrics[0].diff).toMatchObject({
                staleCount         : 1,
                manifestOrphanCount: 2,
                totalOrphanCount   : 2,
                actionableCount    : 2
            });
            expect(metrics[0].tombstonedCount).toBe(2);
        });

        test('auto-tombstone ON skips manifest-missing rows newer than the manifest snapshot (#11711)', async () => {
            applyStubs();
            wireTenant({
                version: 0,
                rows   : [
                    row('old-orphan', 0, {sourcePath: 'src/old.js', ingestedAt: 1000}),
                    row('newer-row', 0, {sourcePath: 'src/new.js', ingestedAt: 3000}),
                    row('live', 0)
                ],
                manifestsByRepo: {
                    'repo-x': {pathsAfterPush: ['src/live.js'], updatedAt: 2000}
                }
            });
            const deleted = [];
            KbReconciliationService.tombstoneOrphans = async (collection, ids) => { deleted.push(...ids); return ids.length };
            const metrics = [];
            KbReconciliationService.recordReconcileMetric = (m) => { metrics.push(m) };

            await KbReconciliationService.reconcileTenant({
                tenantId: 'tenant-x', repoSlug: 'repo-x', collection: {}, orphanVersionGap: 2, autoTombstone: true
            });

            expect(deleted).toEqual(['old-orphan']);
            expect(metrics[0].diff).toMatchObject({
                manifestOrphanCount: 1,
                totalOrphanCount   : 1,
                actionableIds      : ['old-orphan']
            });
        });

        test('auto-tombstone ON but every orphan within grace issues no delete', async () => {
            applyStubs();
            wireTenant({version: 5, rows: [row('a', 5), row('b', 4)]}); // b is stale, gap 1 (< threshold 2)
            let tombstoned = 0;
            KbReconciliationService.tombstoneOrphans = async () => { tombstoned++; return 0 };
            const metrics = [];
            KbReconciliationService.recordReconcileMetric = (m) => { metrics.push(m) };

            await KbReconciliationService.reconcileTenant({
                tenantId: 'tenant-x', repoSlug: 'repo-x', collection: {}, orphanVersionGap: 2, autoTombstone: true
            });

            expect(tombstoned).toBe(0); // actionableCount 0 → tombstoneOrphans never called
            expect(metrics[0].diff.staleCount).toBe(1);
            expect(metrics[0].tombstonedCount).toBe(0);
        });

        test('never throws — a fetchTenantRows failure is caught and logged', async () => {
            applyStubs();
            KbReconciliationService.fetchTenantConfigVersion = async () => 5;
            KbReconciliationService.fetchTenantRows          = async () => { throw new Error('chroma get failed') };
            const errors = [];
            logger.error = (msg) => { errors.push(msg) };

            await expect(KbReconciliationService.reconcileTenant({
                tenantId: 'tenant-x', repoSlug: 'repo-x', collection: {}, orphanVersionGap: 2, autoTombstone: false
            })).resolves.toBeUndefined();

            expect(errors.some(e => String(e).includes('Reconciliation failed for tenant tenant-x'))).toBe(true);
        });
    });

    test.describe('fetchTenants', () => {
        test('dedupes the rollup to distinct tenants, keeping the first repoSlug', async () => {
            KBRecorderService.getTenantIngestionRollup = () => [
                {tenantId: 'tenant-a', repoSlug: 'repo-a1'},
                {tenantId: 'tenant-a', repoSlug: 'repo-a2'},
                {tenantId: 'tenant-b', repoSlug: 'repo-b'}
            ];

            const tenants = await KbReconciliationService.fetchTenants();

            expect(tenants).toEqual([
                {tenantId: 'tenant-a', repoSlug: 'repo-a1'},
                {tenantId: 'tenant-b', repoSlug: 'repo-b'}
            ]);
        });

        test('returns an empty list when the rollup is empty or unavailable', async () => {
            KBRecorderService.getTenantIngestionRollup = () => [];
            expect(await KbReconciliationService.fetchTenants()).toEqual([]);

            KBRecorderService.getTenantIngestionRollup = () => undefined;
            expect(await KbReconciliationService.fetchTenants()).toEqual([]);
        });
    });

    test.describe('tombstoneOrphans', () => {
        test('deletes the id set tenant-scoped and returns the count', async () => {
            const deleteCalls = [];
            const collection  = {delete: async (arg) => { deleteCalls.push(arg) }};

            const count = await KbReconciliationService.tombstoneOrphans(collection, ['id-1', 'id-2', 'id-3']);

            expect(count).toBe(3);
            expect(deleteCalls).toEqual([{ids: ['id-1', 'id-2', 'id-3']}]);
        });

        test('is a no-op for an empty / non-array id set', async () => {
            let   deleteCalled = 0;
            const collection   = {delete: async () => { deleteCalled++ }};

            expect(await KbReconciliationService.tombstoneOrphans(collection, [])).toBe(0);
            expect(await KbReconciliationService.tombstoneOrphans(collection, null)).toBe(0);
            expect(deleteCalled).toBe(0);
        });
    });

    test.describe('recordReconcileMetric', () => {
        test('emits a reconcile event with the chunk counts + detail payload', async () => {
            const events = [];
            KBRecorderService.recordIngestionMetric = (e) => { events.push(e) };

            KbReconciliationService.recordReconcileMetric({
                tenantId       : 'tenant-x',
                repoSlug       : 'repo-x',
                diff           : {staleCount: 4, actionableCount: 3},
                currentVersion : 9,
                autoTombstone  : true,
                tombstonedCount: 3
            });

            expect(events).toHaveLength(1);
            expect(events[0]).toMatchObject({
                tenantId     : 'tenant-x',
                repoSlug     : 'repo-x',
                eventType    : 'reconcile',
                chunksTotal  : 4,
                chunksDeleted: 3
            });
            expect(events[0].detail).toMatchObject({
                staleCount: 4, actionableCount: 3, tombstonedCount: 3, currentVersion: 9, autoTombstone: true
            });
        });
    });

    /**
     * The third reconciliation signal, consulted by the daemon rather than only by its own spec.
     *
     * `diffTenantParserIdentity` shipped classified-but-unwired: green in isolation while no
     * reconciliation tick called it, so a superseded parser generation stayed queryable forever. The
     * arms below therefore assert the DAEMON's behaviour — what reaches `tombstoneOrphans` and the
     * telemetry — never the classifier's return value, which was already covered.
     */
    test.describe('reconcileTenant — parser-identity signal', () => {
        const REPO     = 'org/repo',
              DECLARED = {parserId: 'docker-mcp-source', parserVersion: '1.1.0'},
              OLD      = {parserId: 'docker-mcp-source', parserVersion: '1.0.0'};

        /**
         * @param {Object} options
         * @returns {Object} One Chroma row carrying a parser pair.
         */
        function parserRow({id, path, parser = OLD, repoSlug = REPO, configVersion = 5}) {
            return {
                id,
                metadata: {
                    tenantId           : 'tenant-x',
                    repoSlug,
                    sourcePath         : path,
                    parserId           : parser.parserId,
                    parserVersion      : parser.parserVersion,
                    tenantConfigVersion: configVersion
                }
            }
        }

        /**
         * @param {Object} options
         * @returns {Promise<{tombstonedIds: String[], metrics: Object[]}>}
         */
        async function run({rows, declaredByRepo, manifestsByRepo = {}, autoTombstone = true}) {
            applyStubs();

            KbReconciliationService.fetchTenantConfigVersion   = async () => 5;
            KbReconciliationService.fetchTenantRows            = async () => rows;
            KbReconciliationService.fetchTenantManifests       = async () => manifestsByRepo;
            KbReconciliationService.fetchTenantDeclaredParsers = async () => declaredByRepo;

            const tombstonedIds = [], metrics = [];

            KbReconciliationService.tombstoneOrphans      = async (collection, ids) => {
                tombstonedIds.push(...ids);
                return ids.length
            };
            KbReconciliationService.recordReconcileMetric = metric => { metrics.push(metric) };

            await KbReconciliationService.reconcileTenant({
                tenantId: 'tenant-x', repoSlug: REPO, collection: {}, orphanVersionGap: 2, autoTombstone
            });

            return {tombstonedIds, metrics}
        }

        test('RED-PROOF: a superseded generation is reclaimed by the DAEMON, not merely classifiable', async () => {
            // Fails before the wiring: the classifier would return the orphan and nothing would ask.
            const {tombstonedIds, metrics} = await run({
                rows           : [parserRow({id: 'old', path: 'a.md'}), parserRow({id: 'new', path: 'a.md', parser: DECLARED})],
                declaredByRepo : {[REPO]: DECLARED},
                manifestsByRepo: {[REPO]: {pathsAfterPush: ['a.md'], updatedAt: 1}}
            });

            expect(tombstonedIds, 'the superseded row reaches the delete path').toEqual(['old']);
            expect(metrics[0].diff.parserOrphanCount).toBe(1);
        });

        test('CONTROL: an unchanged declared pair reclaims nothing — firing indiscriminately is equally green', async () => {
            const {tombstonedIds, metrics} = await run({
                rows           : [parserRow({id: 'current', path: 'a.md', parser: DECLARED})],
                declaredByRepo : {[REPO]: DECLARED},
                manifestsByRepo: {[REPO]: {pathsAfterPush: ['a.md'], updatedAt: 1}}
            });

            expect(tombstonedIds).toEqual([]);
            expect(metrics).toHaveLength(0)
        });

        test('a repo declaring NO parserVersion does not orphan its own `1.0.0`-stamped rows', async () => {
            // Chunk construction stamps `file.parserVersion || '1.0.0'`. Resolving the declared pair
            // without that same default would compare `undefined` against `'1.0.0'` and reclaim the
            // entire repo — a delete caused by a comparison the producer never made.
            // The seam's own defaulting is asserted in the `fetchTenantDeclaredParsers` describe
            // below; here the resolved pair is fed through the daemon to prove the round trip
            // classifies nothing.
            const {tombstonedIds, metrics} = await run({
                rows           : [parserRow({id: 'v1', path: 'a.md', parser: {parserId: 'p', parserVersion: '1.0.0'}})],
                declaredByRepo : {[REPO]: {parserId: 'p', parserVersion: '1.0.0'}},
                manifestsByRepo: {[REPO]: {pathsAfterPush: ['a.md'], updatedAt: 1}}
            });

            expect(tombstonedIds).toEqual([]);
            expect(metrics).toHaveLength(0)
        });

        test('a repo with NO declared pair is unknown, so its rows are never reclaimed', async () => {
            // Omission must mean "cannot judge", never "judge against nothing".
            const {tombstonedIds, metrics} = await run({
                rows           : [parserRow({id: 'orphanish', path: 'a.md'})],
                declaredByRepo : {},
                manifestsByRepo: {[REPO]: {pathsAfterPush: ['a.md'], updatedAt: 1}}
            });

            expect(tombstonedIds).toEqual([]);
            expect(metrics).toHaveLength(0)
        });

        test('a repo with NO manifest skips tier 1 — unknown is not empty', async () => {
            // Without a manifest the daemon cannot know which paths the declared parser yields. The
            // row must fall to the replacement-gated tier rather than being treated as unyielded,
            // which would reclaim a whole repo on a missing envelope.
            const {tombstonedIds} = await run({
                rows           : [parserRow({id: 'old', path: 'gone.md'})],
                declaredByRepo : {[REPO]: DECLARED},
                manifestsByRepo: {}
            });

            expect(tombstonedIds, 'no replacement exists, and tier 1 is unavailable').toEqual([])
        });

        test('autoTombstone OFF reports the parser orphan but issues no delete', async () => {
            const {tombstonedIds, metrics} = await run({
                rows           : [parserRow({id: 'old', path: 'a.md'}), parserRow({id: 'new', path: 'a.md', parser: DECLARED})],
                declaredByRepo : {[REPO]: DECLARED},
                manifestsByRepo: {[REPO]: {pathsAfterPush: ['a.md'], updatedAt: 1}},
                autoTombstone  : false
            });

            expect(tombstonedIds).toEqual([]);
            expect(metrics[0].diff.parserOrphanCount).toBe(1)
        });
    });

    test.describe('fetchTenantDeclaredParsers', () => {
        test('mirrors the producer default and omits a repo declaring no parserId', async () => {
            const IngestionService = (await import('../../../../../../ai/services/knowledge-base/IngestionService.mjs')).default,
                  original         = IngestionService.getTenantConfig;

            IngestionService.getTenantConfig = async () => ({
                version    : 5,
                tenantRepos: [
                    {repoSlug: 'org/versioned', parserId: 'p', parserVersion: '2.0.0'},
                    {repoSlug: 'org/unversioned', parserId: 'p'},
                    {repoSlug: 'org/no-parser'},
                    {parserId: 'p', parserVersion: '1.0.0'}
                ]
            });

            try {
                const declared = await KbReconciliationService.fetchTenantDeclaredParsers('tenant-x');

                expect(declared['org/versioned']).toEqual({parserId: 'p', parserVersion: '2.0.0'});
                // The producer stamps `file.parserVersion || '1.0.0'`, so the declared pair must too.
                expect(declared['org/unversioned']).toEqual({parserId: 'p', parserVersion: '1.0.0'});
                // No parserId and no repoSlug are both "cannot judge", so neither appears.
                expect(declared['org/no-parser']).toBeUndefined();
                expect(Object.keys(declared)).toHaveLength(2)
            } finally {
                IngestionService.getTenantConfig = original
            }
        });
    });
});
