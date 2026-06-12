import {setup} from '../../../../setup.mjs';

const appName = 'KBRecorderIngestionMetricsTest';

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
import fs             from 'fs';
import path           from 'path';

/**
 * Phase 4A (#11665) — `kb_ingestion_metrics` telemetry schema + `recordIngestionMetric`
 * write-API + `getTenantIngestionRollup` read-API coverage.
 *
 * This is the pre-Phase-2 substrate slice: the persistence contract the Phase 2 cross-tenant
 * ingestion service (#11626) writes against. The observability daemon that periodically rolls
 * up + persists these metrics is deferred to Phase 4A-β (post-Phase-2) — a daemon has nothing
 * to roll up until Phase 2 ingestion calls actually emit `recordIngestionMetric` events.
 *
 * Serial mode: the spec exercises a shared KBRecorderService SQLite singleton.
 *
 * @see https://github.com/neomjs/neo/issues/11665
 * @see https://github.com/neomjs/neo/issues/11628 (Phase 4 parent epic)
 */
test.describe.configure({mode: 'serial'});

test.describe('KBRecorderService — ingestion metrics (#11665)', () => {
    const testDbName = `kb-recorder-ingestion-test-${process.pid}-${Date.now()}.sqlite`;
    let testDbPath;
    let KBRecorderService;

    test.beforeAll(async () => {
        const config = (await import('../../../../../../ai/mcp/server/knowledge-base/config.mjs')).default;

        const tmpDir = path.resolve(process.cwd(), 'tmp');
        if (!fs.existsSync(tmpDir)) {
            fs.mkdirSync(tmpDir, {recursive: true});
        }

        testDbPath = path.join(tmpDir, testDbName);
        config.data.memoryCoreDbPath = testDbPath;

        for (const suffix of ['', '-wal', '-shm']) {
            try { fs.unlinkSync(`${testDbPath}${suffix}`); } catch (e) {}
        }

        KBRecorderService = (await import('../../../../../../ai/services/knowledge-base/KBRecorderService.mjs')).default;
        await KBRecorderService.initAsync();
    });

    test.beforeEach(() => {
        KBRecorderService.db.exec('DELETE FROM kb_ingestion_metrics;');
    });

    test.afterAll(() => {
        if (KBRecorderService?.db) {
            try { KBRecorderService.db.close(); } catch (e) {}
            // Null the singleton db reference after close — `initAsync` short-circuits on
            // `if (this.db) return`, so a sibling KBRecorderService spec running later in the
            // same worker would otherwise inherit this closed connection and fail with
            // "The database connection is not open". Mirrors KBRecorderService.spec.mjs cleanup.
            // (@neo-gpt PR #11667 Cycle 1 review PRR_kwDODSospM8AAAABAcVsyg, Required Action 1.)
            KBRecorderService.db = null;
        }
        for (const suffix of ['', '-wal', '-shm']) {
            try { fs.unlinkSync(`${testDbPath}${suffix}`); } catch (e) {}
        }
    });

    test('initAsync creates the kb_ingestion_metrics table with the expected columns', () => {
        const columns = KBRecorderService.db
            .prepare("PRAGMA table_info(kb_ingestion_metrics)")
            .all()
            .map(c => c.name);

        expect(columns).toEqual(expect.arrayContaining([
            'id', 'timestamp', 'tenant_id', 'repo_slug', 'origin_agent',
            'event_type', 'chunks_total', 'chunks_embedded', 'chunks_deleted',
            'duration_ms', 'error_code', 'detail'
        ]));
    });

    test('recordIngestionMetric persists a single ingest event with all fields', () => {
        KBRecorderService.recordIngestionMetric({
            tenantId           : 'tenant-a',
            repoSlug           : 'repo-x',
            originAgentIdentity: '@neo-gpt',
            eventType          : 'ingest',
            chunksTotal        : 100,
            chunksEmbedded     : 40,
            chunksDeleted      : 5,
            durationMs         : 1234,
            detail             : {batch: 1, source: 'pre-push-hook'}
        });

        const row = KBRecorderService.db.prepare('SELECT * FROM kb_ingestion_metrics').get();

        expect(row.tenant_id).toBe('tenant-a');
        expect(row.repo_slug).toBe('repo-x');
        expect(row.origin_agent).toBe('@neo-gpt');
        expect(row.event_type).toBe('ingest');
        expect(row.chunks_total).toBe(100);
        expect(row.chunks_embedded).toBe(40);
        expect(row.chunks_deleted).toBe(5);
        expect(row.duration_ms).toBe(1234);
        expect(JSON.parse(row.detail)).toEqual({batch: 1, source: 'pre-push-hook'});
        expect(typeof row.id).toBe('string');
        expect(row.id).toHaveLength(36); // crypto.randomUUID()
    });

    test('recordIngestionMetric applies neo-shared / neo / ingest defaults for omitted fields', () => {
        KBRecorderService.recordIngestionMetric({eventType: 'ingest'});

        const row = KBRecorderService.db.prepare('SELECT * FROM kb_ingestion_metrics').get();

        expect(row.tenant_id).toBe('neo-shared');
        expect(row.repo_slug).toBe('neo');
        expect(row.event_type).toBe('ingest');
        expect(row.chunks_total).toBe(0);
        expect(row.chunks_embedded).toBe(0);
        expect(row.chunks_deleted).toBe(0);
        expect(row.origin_agent).toBeNull();
        expect(row.detail).toBeNull();
    });

    test('recordIngestionMetric never throws — best-effort observability side channel', () => {
        // A malformed detail object that can't serialize cleanly still must not throw.
        const circular = {};
        circular.self = circular;

        // safeStringify handles the circular ref; the call must complete without throwing.
        expect(() => KBRecorderService.recordIngestionMetric({
            tenantId : 'tenant-b',
            repoSlug : 'repo-y',
            eventType: 'ingest',
            detail   : circular
        })).not.toThrow();

        const row = KBRecorderService.db.prepare('SELECT * FROM kb_ingestion_metrics').get();
        expect(row.tenant_id).toBe('tenant-b');
    });

    test('getTenantIngestionRollup aggregates events per tenant with per-event-type counts', () => {
        const seed = [
            {tenantId: 'tenant-a', repoSlug: 'r1', eventType: 'ingest',    chunksEmbedded: 10},
            {tenantId: 'tenant-a', repoSlug: 'r1', eventType: 'ingest',    chunksEmbedded: 20},
            {tenantId: 'tenant-a', repoSlug: 'r1', eventType: 'tombstone', chunksDeleted: 3},
            {tenantId: 'tenant-a', repoSlug: 'r1', eventType: 'error',     errorCode: 'KB_INGEST_FAIL'},
            {tenantId: 'tenant-b', repoSlug: 'r2', eventType: 'ingest',    chunksEmbedded: 50},
            {tenantId: 'tenant-b', repoSlug: 'r2', eventType: 'reconcile'}
        ];
        seed.forEach(e => KBRecorderService.recordIngestionMetric(e));

        const rollup = KBRecorderService.getTenantIngestionRollup();

        expect(rollup).toHaveLength(2);

        const a = rollup.find(r => r.tenantId === 'tenant-a');
        expect(a.eventCount).toBe(4);
        expect(a.ingestEvents).toBe(2);
        expect(a.tombstoneEvents).toBe(1);
        expect(a.errorEvents).toBe(1);
        expect(a.chunksEmbedded).toBe(30);
        expect(a.chunksDeleted).toBe(3);
        expect(a.errorRate).toBeCloseTo(0.25);

        const b = rollup.find(r => r.tenantId === 'tenant-b');
        expect(b.eventCount).toBe(2);
        expect(b.ingestEvents).toBe(1);
        expect(b.reconcileEvents).toBe(1);
        expect(b.chunksEmbedded).toBe(50);
        expect(b.errorRate).toBe(0);
    });

    test('getTenantIngestionRollup honors the sinceMs window', () => {
        const now = Date.now();
        KBRecorderService.recordIngestionMetric({tenantId: 'tenant-a', repoSlug: 'r1', eventType: 'ingest', timestamp: now - 7200000}); // 2h ago
        KBRecorderService.recordIngestionMetric({tenantId: 'tenant-a', repoSlug: 'r1', eventType: 'ingest', timestamp: now - 600000});  // 10m ago

        const recentOnly = KBRecorderService.getTenantIngestionRollup({sinceMs: now - 1800000}); // last 30m
        expect(recentOnly).toHaveLength(1);
        expect(recentOnly[0].eventCount).toBe(1);

        const allTime = KBRecorderService.getTenantIngestionRollup();
        expect(allTime[0].eventCount).toBe(2);
    });

    test('getTenantIngestionRollup honors the tenantId filter', () => {
        KBRecorderService.recordIngestionMetric({tenantId: 'tenant-a', repoSlug: 'r1', eventType: 'ingest'});
        KBRecorderService.recordIngestionMetric({tenantId: 'tenant-b', repoSlug: 'r2', eventType: 'ingest'});

        const onlyA = KBRecorderService.getTenantIngestionRollup({tenantId: 'tenant-a'});
        expect(onlyA).toHaveLength(1);
        expect(onlyA[0].tenantId).toBe('tenant-a');
    });

    test('getTenantIngestionRollup returns empty array when no metrics recorded', () => {
        expect(KBRecorderService.getTenantIngestionRollup()).toEqual([]);
    });

    test('errorRate is 0 (not NaN) for a tenant whose only events are non-error', () => {
        KBRecorderService.recordIngestionMetric({tenantId: 'tenant-c', repoSlug: 'r3', eventType: 'ingest'});

        const rollup = KBRecorderService.getTenantIngestionRollup({tenantId: 'tenant-c'});
        expect(rollup[0].errorRate).toBe(0);
        expect(Number.isNaN(rollup[0].errorRate)).toBe(false);
    });
});
