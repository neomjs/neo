import {setup} from '../../../../setup.mjs';

const appName = 'KbTenantHealthHelperTest';

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
 * Phase 4A (#11639) — `KbTenantHealthHelper` coverage: the `## KB Multi-Tenant Health`
 * Sandman-handoff section renderer.
 *
 * Two surfaces:
 *
 * 1. `formatKbTenantHealthSection(rollup, {windowLabel})` — a pure formatter. No I/O, no
 *    service access; the bulk of the tests exercise it directly with fixture rollups whose
 *    shape mirrors `KBRecorderService.getTenantIngestionRollup`'s documented return contract.
 * 2. `renderKbMultiTenantHealthSection({sinceMs})` — the thin integration layer over the
 *    formatter. The integration block seeds the *real* `KBRecorderService` SQLite substrate
 *    via `recordIngestionMetric`, then asserts the rendered section — covering the genuine
 *    new seam #11639 introduces (telemetry store → rollup → Markdown section). The defensive
 *    `''`-on-failure contract is verified by forcing the telemetry read to throw.
 *
 * `GoldenPathSynthesizer.synthesizeGoldenPath` composes the rendered section into
 * `sandman_handoff.md` via the established `renderConsumerFrictionSection` precedent (a
 * defensive try/catch append) — proven glue not re-tested here; the section's *content
 * correctness* is what this spec guards.
 *
 * Serial mode: the integration block exercises the shared `KBRecorderService` SQLite singleton.
 *
 * @see https://github.com/neomjs/neo/issues/11639
 * @see https://github.com/neomjs/neo/issues/11628 (Phase 4 parent epic)
 * @see ai/services/knowledge-base/helpers/KbTenantHealthHelper.mjs — the renderer under test.
 * @see test/playwright/unit/ai/services/knowledge-base/KBRecorderService.ingestionMetrics.spec.mjs — sibling pattern.
 */
test.describe.configure({mode: 'serial'});

/**
 * @summary A two-tenant rollup whose shape mirrors `KBRecorderService.getTenantIngestionRollup`.
 * `errorRate` is supplied as the real read-API would compute it (`errorEvents / eventCount`).
 * @type {Array<Object>}
 */
const TWO_TENANT_ROLLUP = [
    {
        tenantId       : 'tenant-a',
        repoSlug       : 'neomjs/create-app',
        eventCount     : 12,
        ingestEvents   : 9,
        tombstoneEvents: 2,
        reconcileEvents: 0,
        errorEvents    : 1,
        chunksEmbedded : 340,
        chunksDeleted  : 18,
        errorRate      : 1 / 12
    },
    {
        tenantId       : 'neo-shared',
        repoSlug       : 'neo',
        eventCount     : 4,
        ingestEvents   : 4,
        tombstoneEvents: 0,
        reconcileEvents: 0,
        errorEvents    : 0,
        chunksEmbedded : 88,
        chunksDeleted  : 0,
        errorRate      : 0
    }
];

test.describe('KbTenantHealthHelper (#11639)', () => {
    const testDbName = `kb-tenant-health-test-${process.pid}-${Date.now()}.sqlite`;
    let testDbPath, KBRecorderService, formatKbTenantHealthSection, renderKbMultiTenantHealthSection;

    test.beforeAll(async () => {
        // Point KB telemetry at an isolated test DB *before* importing KBRecorderService — the
        // singleton's import-time `initAsync` reads `config.memoryCoreDbPath`. The helper module
        // is imported only after that, so its transitive `KBRecorderService` import never touches
        // the production Memory Core database.
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

        ({formatKbTenantHealthSection, renderKbMultiTenantHealthSection} =
            await import('../../../../../../ai/services/knowledge-base/helpers/KbTenantHealthHelper.mjs'));
    });

    test.beforeEach(() => {
        KBRecorderService.db.exec('DELETE FROM kb_ingestion_metrics;');
    });

    test.afterAll(() => {
        if (KBRecorderService?.db) {
            try { KBRecorderService.db.close(); } catch (e) {}
            // Null the singleton db reference after close — `initAsync` short-circuits on
            // `if (this.db) return`, so a sibling KBRecorderService spec running later in the
            // same worker would otherwise inherit this closed connection. Mirrors the sibling
            // KBRecorderService.ingestionMetrics.spec.mjs cleanup.
            KBRecorderService.db = null;
        }
        for (const suffix of ['', '-wal', '-shm']) {
            try { fs.unlinkSync(`${testDbPath}${suffix}`); } catch (e) {}
        }
    });

    test.describe('formatKbTenantHealthSection — pure formatter', () => {
        test('returns an empty string for an empty rollup', () => {
            expect(formatKbTenantHealthSection([])).toBe('');
        });

        test('returns an empty string for a non-array rollup', () => {
            expect(formatKbTenantHealthSection(null)).toBe('');
            expect(formatKbTenantHealthSection(undefined)).toBe('');
            expect(formatKbTenantHealthSection({})).toBe('');
        });

        test('renders the section heading, intro line, and Markdown table header', () => {
            const section = formatKbTenantHealthSection(TWO_TENANT_ROLLUP);

            expect(section).toContain('## KB Multi-Tenant Health');
            expect(section).toContain('rolled up from `kb_ingestion_metrics` (#11639)');
            expect(section).toContain(
                '| Tenant | Repo | Events | Ingest | Tombstone | Reconcile | Errors | Error rate | Embedded | Deleted |'
            );
            expect(section).toContain('|---|---|--:|--:|--:|--:|--:|--:|--:|--:|');
        });

        test('renders exactly one Markdown table row per tenant rollup entry', () => {
            const section  = formatKbTenantHealthSection(TWO_TENANT_ROLLUP);
            const dataRows = section.split('\n').filter(line => line.startsWith('| `'));

            expect(dataRows).toHaveLength(2);
            expect(section).toContain('| `tenant-a` | `neomjs/create-app` | 12 | 9 | 2 | 0 | 1 | 8.3% | 340 | 18 |');
            expect(section).toContain('| `neo-shared` | `neo` | 4 | 4 | 0 | 0 | 0 | 0.0% | 88 | 0 |');
        });

        test('formats errorRate as a percentage with one decimal place', () => {
            const rollup = [
                {tenantId: 't-quarter', repoSlug: 'r', eventCount: 4, errorEvents: 1, errorRate: 0.25},
                {tenantId: 't-all',     repoSlug: 'r', eventCount: 2, errorEvents: 2, errorRate: 1},
                {tenantId: 't-none',    repoSlug: 'r', eventCount: 3, errorEvents: 0, errorRate: 0}
            ];
            const section = formatKbTenantHealthSection(rollup);

            expect(section).toContain('| `t-quarter` | `r` | 4 | 0 | 0 | 0 | 1 | 25.0% | 0 | 0 |');
            expect(section).toContain('| `t-all` | `r` | 2 | 0 | 0 | 0 | 2 | 100.0% | 0 | 0 |');
            expect(section).toContain('| `t-none` | `r` | 3 | 0 | 0 | 0 | 0 | 0.0% | 0 | 0 |');
        });

        test('defaults missing numeric fields to 0 and a missing errorRate to 0.0%', () => {
            const section = formatKbTenantHealthSection([{tenantId: 't-sparse', repoSlug: 'r-sparse'}]);

            // Every count column renders 0, error rate 0.0% — never `undefined` or `NaN`.
            expect(section).toContain('| `t-sparse` | `r-sparse` | 0 | 0 | 0 | 0 | 0 | 0.0% | 0 | 0 |');
            expect(section).not.toContain('undefined');
            expect(section).not.toContain('NaN');
        });

        test('includes the window label in the intro line when provided', () => {
            const section = formatKbTenantHealthSection(TWO_TENANT_ROLLUP, {windowLabel: 'last 7 days'});

            expect(section).toContain('ingestion telemetry (last 7 days), rolled up from');
        });

        test('omits the window-scope suffix when no window label is given', () => {
            const section = formatKbTenantHealthSection(TWO_TENANT_ROLLUP);

            expect(section).toContain('ingestion telemetry, rolled up from');
            expect(section).not.toContain('(undefined)');
        });
    });

    test.describe('renderKbMultiTenantHealthSection — KBRecorderService integration', () => {
        test('renders a populated section from real seeded multi-tenant telemetry', async () => {
            KBRecorderService.recordIngestionMetric({tenantId: 'tenant-blue',  repoSlug: 'blue-svc',  eventType: 'ingest',    chunksEmbedded: 50});
            KBRecorderService.recordIngestionMetric({tenantId: 'tenant-blue',  repoSlug: 'blue-svc',  eventType: 'ingest',    chunksEmbedded: 30});
            KBRecorderService.recordIngestionMetric({tenantId: 'tenant-blue',  repoSlug: 'blue-svc',  eventType: 'error',     errorCode: 'KB_INGEST_FAIL'});
            KBRecorderService.recordIngestionMetric({tenantId: 'tenant-green', repoSlug: 'green-svc', eventType: 'tombstone', chunksDeleted: 7});

            const section = await renderKbMultiTenantHealthSection();

            expect(section).toContain('## KB Multi-Tenant Health');
            // The renderer always passes a 'last 7 days' window label.
            expect(section).toContain('ingestion telemetry (last 7 days), rolled up from');
            // tenant-blue: 3 events, 2 ingest, 1 error -> 33.3% error rate, 50+30+0 embedded.
            expect(section).toContain('| `tenant-blue` | `blue-svc` | 3 | 2 | 0 | 0 | 1 | 33.3% | 80 | 0 |');
            // tenant-green: 1 tombstone, 7 chunks deleted.
            expect(section).toContain('| `tenant-green` | `green-svc` | 1 | 0 | 1 | 0 | 0 | 0.0% | 0 | 7 |');
        });

        test('returns an empty string when no ingestion telemetry has been recorded', async () => {
            // beforeEach already cleared kb_ingestion_metrics.
            expect(await renderKbMultiTenantHealthSection()).toBe('');
        });

        test('excludes telemetry older than the default 7-day window', async () => {
            const eightDaysMs = 8 * 24 * 60 * 60 * 1000;

            KBRecorderService.recordIngestionMetric({tenantId: 'tenant-stale',  repoSlug: 'r-stale',  eventType: 'ingest', timestamp: Date.now() - eightDaysMs});
            KBRecorderService.recordIngestionMetric({tenantId: 'tenant-recent', repoSlug: 'r-recent', eventType: 'ingest', timestamp: Date.now() - 60000});

            const section = await renderKbMultiTenantHealthSection();

            expect(section).toContain('| `tenant-recent` | `r-recent` |');
            expect(section).not.toContain('tenant-stale');
        });

        test('resolves to an empty string defensively when the telemetry read throws', async () => {
            const original = KBRecorderService.getTenantIngestionRollup;

            KBRecorderService.getTenantIngestionRollup = () => {
                throw new Error('simulated telemetry-store failure');
            };

            try {
                expect(await renderKbMultiTenantHealthSection()).toBe('');
            } finally {
                KBRecorderService.getTenantIngestionRollup = original;
            }
        });
    });
});
