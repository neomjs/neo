/**
 * @plane in-plane
 */
import {Command} from 'commander';
import {
    createMetricId,
    isClosedPeriodViolation,
    validateMetricProperties
} from '../../graph/businessSchema.mjs';

/**
 * @summary Pure, dependency-injected core of the read-only business-metric ingestion probe.
 *
 * This module carries every decision the probe makes — gating, window math, metric construction,
 * validation, the append-only guard, the write/verify flows — with zero substrate imports (no Neo
 * bootstrap, no services, no AiConfig), so the whole decision surface is unit-testable hermetically.
 * The sibling entrypoint (`probeBusinessMetrics.mjs`) wires the real `GraphService`, `AiConfig`
 * leaves, git execution, and manifest IO into `runProbe` / `runVerify`.
 *
 * Fail-closed spine: the probe refuses to run when the config master switch is off, refuses
 * categories outside the public allowlist, refuses any record the business-schema validators
 * reject, and refuses closed-period mutations — a refusal is a loud exit, never a partial write.
 * The verify mode is the ingestion half of the graph-integrity canary: a probe run emits a
 * manifest of written node ids, and a later `--verify` run asserts those ids (and values)
 * survived the sync window.
 */

/**
 * @summary The one metric category this first probe implements: ticket-ref commits landed on the
 * integration branch per UTC day — the institution-native "merged PRs" proxy. Public by design.
 * @type {String}
 */
export const FIRST_CATEGORY = 'merged-prs';

/**
 * @summary Derives the default probe period (yesterday, UTC) from a supplied clock.
 * @param {String} nowIso ISO-8601 timestamp used as "now" (injectable for tests).
 * @returns {String} `YYYY-MM-DD`
 */
export function defaultPeriod(nowIso) {
    const now = new Date(nowIso);
    return new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * @summary Computes the UTC day window for a `day:utc` period.
 * @param {String} periodStart `YYYY-MM-DD`
 * @returns {Object} `{sinceIso, untilIso}` — inclusive start, exclusive end.
 */
export function computeUtcDayWindow(periodStart) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(periodStart ?? ''))) {
        throw new Error(`computeUtcDayWindow: periodStart must be YYYY-MM-DD, got "${periodStart}"`);
    }

    const sinceIso = `${periodStart}T00:00:00Z`;
    const untilIso = new Date(Date.parse(sinceIso) + 24 * 60 * 60 * 1000).toISOString().replace('.000Z', 'Z');

    return {sinceIso, untilIso};
}

/**
 * @summary Fail-closed probe gate: the config master switch must be on AND the category must be in
 * the public allowlist. A refusal names its reason — the caller exits loudly, writing nothing.
 * @param {Object} gate
 * @param {Boolean} gate.enabled   `AiConfig.business.metricProbeEnabled`
 * @param {String}  gate.allowlist `AiConfig.business.publicCategoryAllowlist` (comma-separated)
 * @param {String}  gate.category  Requested metric category (`metricName`)
 * @returns {Object} `{allowed, reason}`
 */
export function assertProbeAllowed({enabled, allowlist, category}) {
    if (enabled !== true) {
        return {allowed: false, reason: 'probe disabled — set business.metricProbeEnabled (metric writes into the production graph are an explicit operator decision)'};
    }

    const allowed = String(allowlist ?? '').split(',').map(entry => entry.trim()).filter(Boolean);

    if (!allowed.includes(category)) {
        return {allowed: false, reason: `category "${category}" is not in business.publicCategoryAllowlist [${allowed.join(', ')}] — public ingestion is allowlist-gated`};
    }

    return {allowed: true, reason: null};
}

/**
 * @summary Builds the full `METRIC` node properties for the merged-prs category from raw
 * `git log --pretty=format:%s` output — pure text-in, validated-record-out.
 *
 * Counting rule: one merged PR ≈ one subject line ending in a ticket ref `(#NNNN)`, excluding
 * `[skip ci]` pipeline commits. A fully-elapsed UTC day is born CLOSED (append-only from the
 * first write); the current day stays open until it ends. The `falsifyingQuery` names the exact
 * reproducible command + filter, per the invalid-by-construction schema rule.
 * @param {Object} input
 * @param {String} input.gitLogText  Raw newline-separated commit subjects.
 * @param {String} input.periodStart `YYYY-MM-DD`
 * @param {String} [input.source='git']
 * @param {String} [input.ref='origin/dev']
 * @param {String} input.nowIso      Injectable clock for the closed-period decision.
 * @returns {Object} `METRIC` properties (identity + five-field contract + value/period state).
 */
export function buildMergedPrsMetric({gitLogText, periodStart, source = 'git', ref = 'origin/dev', nowIso}) {
    const {sinceIso, untilIso} = computeUtcDayWindow(periodStart);
    const ticketRef            = /\(#\d+\)\s*$/;
    const skipCi               = /\[skip ci\]/i;
    const lines                = String(gitLogText ?? '').split('\n').filter(Boolean);
    const value                = lines.filter(line => ticketRef.test(line) && !skipCi.test(line)).length;

    return {
        source,
        metricName        : FIRST_CATEGORY,
        periodStart,
        windowSemantics   : 'day:utc',
        periodClosed      : Date.parse(untilIso) <= Date.parse(nowIso),
        value,
        claimClass        : 'measured',
        publicFlag        : true,
        falsifyingQuery   : `git log ${ref} --since=${sinceIso} --until=${untilIso} --pretty=format:%s — count lines matching /\\(#\\d+\\)$/ excluding /\\[skip ci\\]/i`,
        confoundDisclaimer: 'ticket-ref commit count on the integration branch is a squash-merge proxy: multi-commit PRs, direct pushes, and revert-then-reland sequences are not individually isolated'
    };
}

/**
 * @summary Creates the Commander parser for the probe CLI.
 * @param {Object} env Environment source (used for the injectable clock only).
 * @returns {Command}
 */
function createArgParser(env = process.env) {
    const nowIso  = env.NEO_PROBE_NOW || new Date().toISOString();
    const program = new Command();

    program
        .name('ai:probe-business-metrics')
        .description('Read-only business-metric ingestion probe (schema-validated METRIC nodes) + sync-survival verify mode.')
        .exitOverride()
        .configureOutput({writeErr: () => {}, writeOut: () => {}})
        .helpOption(false)
        .allowExcessArguments(false)
        .option('--period <YYYY-MM-DD>', 'UTC day to measure.', defaultPeriod(nowIso))
        .option('--category <name>', 'Metric category (metricName).', FIRST_CATEGORY)
        .option('--source <key>', 'Ingestion source key.', 'git')
        .option('--ref <gitref>', 'Integration ref to measure.', 'origin/dev')
        .option('--dry-run', 'Validate + print the record; write nothing.', false)
        .option('--verify <manifestPath>', 'Canary mode: assert a prior run\'s manifest ids survived.')
        .option('-h, --help', 'Show help');

    return program;
}

/**
 * @summary Parses CLI argv into the probe's structured options.
 * @param {String[]} argv `process.argv.slice(2)`
 * @param {Object} env Environment source.
 * @returns {Object} `{period, category, source, ref, dryRun, verify, help}`
 */
export function parseArgs(argv, env = process.env) {
    const program = createArgParser(env);

    program.parse(argv, {from: 'user'});

    return program.opts();
}

/**
 * @summary Executes one probe run: gate → measure → build → validate → append-only guard →
 * upsert → read-back → manifest. Every dependency is injected; every refusal is a typed,
 * loud result with nothing written.
 * @param {Object} args Parsed CLI options (`parseArgs` shape).
 * @param {Object} deps
 * @param {Object}   deps.aiConfig      Object exposing `business.metricProbeEnabled` + `business.publicCategoryAllowlist` (the entrypoint passes the real AiConfig).
 * @param {Object}   deps.graphService  Graph write/read surface (`initAsync`, `getNodeRecord`, `upsertNode`).
 * @param {Function} deps.execGit       `(args: String[]) => String` — runs git, returns stdout.
 * @param {Function} deps.writeManifest `(manifest: Object) => String` — persists the canary manifest, returns its path.
 * @param {String}   deps.nowIso        Injectable clock.
 * @returns {Object} `{exitCode, ...}` — 0 success/dry-run, 2 validation/write failure, 3 gate refusal.
 */
export async function runProbe(args, {aiConfig, graphService, execGit, writeManifest, nowIso}) {
    const {category, period, ref, source} = args;

    const gate = assertProbeAllowed({
        enabled  : aiConfig.business.metricProbeEnabled,
        allowlist: aiConfig.business.publicCategoryAllowlist,
        category
    });

    if (!gate.allowed) {
        return {exitCode: 3, refused: gate.reason, written: []};
    }

    if (category !== FIRST_CATEGORY) {
        return {exitCode: 3, refused: `category "${category}" has no probe implementation yet — ${FIRST_CATEGORY} is the first`, written: []};
    }

    const {sinceIso, untilIso} = computeUtcDayWindow(period);
    const gitLogText           = execGit(['log', ref, `--since=${sinceIso}`, `--until=${untilIso}`, '--pretty=format:%s']);
    const properties           = buildMergedPrsMetric({gitLogText, periodStart: period, ref, source, nowIso});
    const validation           = validateMetricProperties(properties);

    if (!validation.valid) {
        return {exitCode: 2, errors: validation.errors, written: []};
    }

    const id = createMetricId({source, metricName: FIRST_CATEGORY, windowSemantics: 'day:utc', periodStart: period});

    await graphService.ready();

    const existing = await graphService.getNodeRecord({id});
    const guard    = isClosedPeriodViolation(existing?.properties, properties);

    if (guard.violation) {
        return {exitCode: 2, errors: [guard.reason], written: []};
    }

    if (args.dryRun) {
        return {exitCode: 0, dryRun: true, id, properties, written: []};
    }

    await graphService.upsertNode({id, type: 'METRIC', properties});

    const readBack = await graphService.getNodeRecord({id});

    if (!readBack || readBack.properties?.value !== properties.value) {
        return {exitCode: 2, errors: [`post-write read-back mismatch for ${id} — refusing to emit a manifest for an unverified write`], written: []};
    }

    const manifestPath = writeManifest({
        writtenAt: nowIso,
        records  : [{id, value: properties.value, periodStart: period}]
    });

    return {exitCode: 0, id, value: properties.value, manifestPath, written: [id]};
}

/**
 * @summary Canary half: asserts that every node id a prior probe manifest recorded still exists
 * with its recorded value — the ingestion-side instance of the post-sync integrity check. Any
 * loss is a non-zero exit; silent survival-assumption is exactly what this exists to replace.
 * @param {Object} input
 * @param {Object} input.manifest Parsed manifest (`{writtenAt, records: [{id, value}]}`).
 * @param {Object} deps
 * @param {Object} deps.graphService Graph read surface (`initAsync`, `getNodeRecord`).
 * @returns {Object} `{exitCode, survived, lost}`
 */
export async function runVerify({manifest}, {graphService}) {
    await graphService.ready();

    const survived = [];
    const lost     = [];

    for (const record of manifest?.records ?? []) {
        const node = await graphService.getNodeRecord({id: record.id});

        if (node && node.properties?.value === record.value) {
            survived.push(record.id);
        } else {
            lost.push(record.id);
        }
    }

    return {exitCode: lost.length > 0 ? 2 : 0, survived, lost};
}
