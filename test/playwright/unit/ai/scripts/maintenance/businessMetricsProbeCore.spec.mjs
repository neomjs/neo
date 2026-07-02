import {test, expect} from '@playwright/test';
import {
    FIRST_CATEGORY,
    assertProbeAllowed,
    buildMergedPrsMetric,
    computeUtcDayWindow,
    defaultPeriod,
    parseArgs,
    runProbe,
    runVerify
} from '../../../../../../ai/scripts/maintenance/businessMetricsProbeCore.mjs';
import {validateMetricProperties} from '../../../../../../ai/graph/businessSchema.mjs';

// Pure DI'd probe core — imported directly (no Neo bootstrap, no services, no AiConfig), so the
// whole gate → measure → validate → guard → write → verify decision surface is hermetic in CI.

const NOW = '2026-07-02T12:00:00Z';

const GIT_LOG = [
    'feat(ai): business-layer graph schema — BUSINESS_GOAL/METRIC/ADVANCED_BY (#14446)',
    'chore: ticket sync [skip ci]',
    'fix(memory-core): repair mailbox graph projections from WAL (#14426) (#14443)',
    'chore(data): Hourly data sync pipeline update [skip ci]',
    'docs(agentos): ADR 0028 — temporal-pyramid summarization substrate (#14427) (#14428)',
    'random local commit without ticket ref'
].join('\n');

function makeConfig({enabled = true, allowlist = 'merged-prs,stars-total'} = {}) {
    return {business: {metricProbeEnabled: enabled, publicCategoryAllowlist: allowlist}};
}

function makeGraph({existing = null, failReadBack = false} = {}) {
    const nodes = new Map();
    return {
        calls: {upserts: []},
        nodes,
        async initAsync() {},
        async getNodeRecord({id}) {
            if (failReadBack && nodes.has(id)) return null;
            if (nodes.has(id)) return nodes.get(id);
            return existing && existing.id === id ? existing : null;
        },
        async upsertNode(node) {
            this.calls.upserts.push(node);
            nodes.set(node.id, node);
        }
    };
}

function makeDeps(overrides = {}) {
    return {
        aiConfig     : makeConfig(),
        graphService : makeGraph(),
        execGit      : () => GIT_LOG,
        writeManifest: manifest => `/tmp/manifest-${manifest.records.length}.json`,
        nowIso       : NOW,
        ...overrides
    };
}

const BASE_ARGS = {period: '2026-07-01', category: FIRST_CATEGORY, source: 'git', ref: 'origin/dev', dryRun: false};

test.describe('businessMetricsProbeCore — window + defaults', () => {
    test('computeUtcDayWindow yields an inclusive UTC start and exclusive next-day end', () => {
        expect(computeUtcDayWindow('2026-07-01')).toEqual({sinceIso: '2026-07-01T00:00:00Z', untilIso: '2026-07-02T00:00:00Z'});
    });

    test('computeUtcDayWindow throws on malformed periods', () => {
        for (const bad of ['', '2026-7-1', 'yesterday', null]) {
            expect(() => computeUtcDayWindow(bad)).toThrow('YYYY-MM-DD');
        }
    });

    test('defaultPeriod is yesterday relative to the injected clock', () => {
        expect(defaultPeriod(NOW)).toBe('2026-07-01');
    });

    test('parseArgs defaults are complete and overridable', () => {
        const defaults = parseArgs([], {NEO_PROBE_NOW: NOW});
        expect(defaults.period).toBe('2026-07-01');
        expect(defaults.category).toBe(FIRST_CATEGORY);
        expect(defaults.ref).toBe('origin/dev');
        expect(defaults.dryRun).toBe(false);

        const custom = parseArgs(['--period', '2026-06-30', '--dry-run', '--ref', 'dev'], {NEO_PROBE_NOW: NOW});
        expect(custom.period).toBe('2026-06-30');
        expect(custom.dryRun).toBe(true);
        expect(custom.ref).toBe('dev');
    });
});

test.describe('businessMetricsProbeCore — gate (fail-closed)', () => {
    test('disabled master switch refuses with the operator-decision reason', () => {
        const {allowed, reason} = assertProbeAllowed({enabled: false, allowlist: 'merged-prs', category: 'merged-prs'});
        expect(allowed).toBe(false);
        expect(reason).toContain('metricProbeEnabled');
    });

    test('non-boolean enabled is refused (truthy strings are not an operator decision)', () => {
        expect(assertProbeAllowed({enabled: 'true', allowlist: 'merged-prs', category: 'merged-prs'}).allowed).toBe(false);
    });

    test('category outside the allowlist is refused, naming the allowlist', () => {
        const {allowed, reason} = assertProbeAllowed({enabled: true, allowlist: 'stars-total', category: 'merged-prs'});
        expect(allowed).toBe(false);
        expect(reason).toContain('allowlist');
    });

    test('allowlisted category passes (whitespace-tolerant)', () => {
        expect(assertProbeAllowed({enabled: true, allowlist: ' merged-prs , stars-total ', category: 'merged-prs'}).allowed).toBe(true);
    });
});

test.describe('businessMetricsProbeCore — merged-prs record construction', () => {
    test('counts ticket-ref subjects, excluding [skip ci] pipeline commits', () => {
        const record = buildMergedPrsMetric({gitLogText: GIT_LOG, periodStart: '2026-07-01', nowIso: NOW});
        expect(record.value).toBe(3);
    });

    test('a fully-elapsed UTC day is born closed; the current day stays open', () => {
        expect(buildMergedPrsMetric({gitLogText: '', periodStart: '2026-07-01', nowIso: NOW}).periodClosed).toBe(true);
        expect(buildMergedPrsMetric({gitLogText: '', periodStart: '2026-07-02', nowIso: NOW}).periodClosed).toBe(false);
    });

    test('the produced record passes the business-schema METRIC contract wholesale', () => {
        const record = buildMergedPrsMetric({gitLogText: GIT_LOG, periodStart: '2026-07-01', nowIso: NOW});
        expect(validateMetricProperties(record)).toEqual({valid: true, errors: []});
    });

    test('falsifyingQuery names the exact reproducible command + filter', () => {
        const record = buildMergedPrsMetric({gitLogText: GIT_LOG, periodStart: '2026-07-01', ref: 'origin/dev', nowIso: NOW});
        expect(record.falsifyingQuery).toContain('git log origin/dev --since=2026-07-01T00:00:00Z --until=2026-07-02T00:00:00Z');
        expect(record.falsifyingQuery).toContain('skip ci');
    });
});

test.describe('businessMetricsProbeCore — runProbe (gate → write → read-back → manifest)', () => {
    test('refuses (exit 3) and writes nothing when the master switch is off', async () => {
        const deps   = makeDeps({aiConfig: makeConfig({enabled: false})});
        const result = await runProbe(BASE_ARGS, deps);
        expect(result.exitCode).toBe(3);
        expect(result.written).toEqual([]);
        expect(deps.graphService.calls.upserts).toEqual([]);
    });

    test('refuses (exit 3) a category with no implementation, even when allowlisted', async () => {
        const deps   = makeDeps({aiConfig: makeConfig({allowlist: 'merged-prs,stars-total'})});
        const result = await runProbe({...BASE_ARGS, category: 'stars-total'}, deps);
        expect(result.exitCode).toBe(3);
        expect(result.refused).toContain('no probe implementation');
    });

    test('dry-run validates and returns the record without writing', async () => {
        const deps   = makeDeps();
        const result = await runProbe({...BASE_ARGS, dryRun: true}, deps);
        expect(result.exitCode).toBe(0);
        expect(result.dryRun).toBe(true);
        expect(result.properties.value).toBe(3);
        expect(deps.graphService.calls.upserts).toEqual([]);
    });

    test('happy path: upserts the deterministic id, verifies read-back, emits the canary manifest', async () => {
        const manifests = [];
        const deps      = makeDeps({writeManifest: manifest => { manifests.push(manifest); return '/tmp/m.json'; }});
        const result    = await runProbe(BASE_ARGS, deps);

        expect(result.exitCode).toBe(0);
        expect(result.id).toBe('metric-git--merged-prs--day-utc--2026-07-01');
        expect(result.written).toEqual([result.id]);
        expect(deps.graphService.calls.upserts[0].type).toBe('METRIC');
        expect(manifests[0].records).toEqual([{id: result.id, value: 3, periodStart: '2026-07-01'}]);
    });

    test('closed-period mutation is refused (exit 2) before any write', async () => {
        const existing = {
            id        : 'metric-git--merged-prs--day-utc--2026-07-01',
            properties: {...buildMergedPrsMetric({gitLogText: '', periodStart: '2026-07-01', nowIso: NOW}), periodClosed: true}
        };
        const deps   = makeDeps({graphService: makeGraph({existing})});
        const result = await runProbe(BASE_ARGS, deps);
        expect(result.exitCode).toBe(2);
        expect(result.errors.join(' ')).toContain('append-only');
        expect(deps.graphService.calls.upserts).toEqual([]);
    });

    test('an idempotent re-run of the identical closed record is legal (same node, no violation)', async () => {
        const properties = buildMergedPrsMetric({gitLogText: GIT_LOG, periodStart: '2026-07-01', nowIso: NOW});
        const existing   = {id: 'metric-git--merged-prs--day-utc--2026-07-01', properties};
        const deps       = makeDeps({graphService: makeGraph({existing})});
        const result     = await runProbe(BASE_ARGS, deps);
        expect(result.exitCode).toBe(0);
        expect(result.written).toEqual([existing.id]);
    });

    test('post-write read-back mismatch fails loudly (exit 2) and emits no manifest', async () => {
        const manifests = [];
        const deps      = makeDeps({
            graphService : makeGraph({failReadBack: true}),
            writeManifest: manifest => { manifests.push(manifest); return '/tmp/m.json'; }
        });
        const result = await runProbe(BASE_ARGS, deps);
        expect(result.exitCode).toBe(2);
        expect(result.errors.join(' ')).toContain('read-back');
        expect(manifests).toEqual([]);
    });
});

test.describe('businessMetricsProbeCore — runVerify (the sync-survival canary)', () => {
    const RECORD = {id: 'metric-git--merged-prs--day-utc--2026-07-01', value: 3, periodStart: '2026-07-01'};

    test('surviving ids with matching values pass (exit 0)', async () => {
        const graph  = makeGraph({existing: {id: RECORD.id, properties: {value: 3}}});
        const result = await runVerify({manifest: {records: [RECORD]}}, {graphService: graph});
        expect(result).toEqual({exitCode: 0, survived: [RECORD.id], lost: []});
    });

    test('a vanished node is LOST (exit 2) — the silent-loss class the canary exists to catch', async () => {
        const result = await runVerify({manifest: {records: [RECORD]}}, {graphService: makeGraph()});
        expect(result.exitCode).toBe(2);
        expect(result.lost).toEqual([RECORD.id]);
    });

    test('a value-drifted node is LOST too — survival means the record, not just the id', async () => {
        const graph  = makeGraph({existing: {id: RECORD.id, properties: {value: 999}}});
        const result = await runVerify({manifest: {records: [RECORD]}}, {graphService: graph});
        expect(result.lost).toEqual([RECORD.id]);
    });

    test('an empty or missing manifest verifies clean (exit 0, nothing to assert)', async () => {
        expect(await runVerify({manifest: {records: []}}, {graphService: makeGraph()})).toEqual({exitCode: 0, survived: [], lost: []});
        expect((await runVerify({manifest: null}, {graphService: makeGraph()})).exitCode).toBe(0);
    });
});
