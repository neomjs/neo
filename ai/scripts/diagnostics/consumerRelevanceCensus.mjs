#!/usr/bin/env node
/**
 * @module ai/scripts/diagnostics/consumerRelevanceCensus
 * @summary Re-runnable census of merged PRs by consumer-relevance bucket — distribution, never a
 * percentage. A stakeholder holding "how many of these PRs matter for our deployment?" gets the
 * auditable shape of the answer: every merged PR classified by what it TOUCHES (mechanical), with
 * the mapping that produced each row printed alongside, and the unclassifiable remainder named.
 *
 * ## Why distribution, not a number
 *
 * "X% of PRs matter" requires counterfactual necessity judgment (would the deployment work without
 * PR N?), which no mechanical walk can deliver — the operator-challenged premise boundary accepted
 * at the ticket's creation. This census claims NO relevance percentage. Its deliverable is the
 * bucket distribution + per-month trend + the editable mapping (`consumerRelevanceMap.mjs`), so a
 * stakeholder contests a classification by changing a rule and re-running, not by arguing prose.
 *
 * ## Method (all local, all reproducible)
 *
 * 1. `git log --name-only` over the range — squash-merge subjects carry `(#TICKET) (#PR)`; each PR
 *    also yields its touched file list in the same pass.
 * 2. Files classify by longest-prefix path rules (the mapping). PR bucket = majority-file bucket,
 *    ties broken by BUCKET_PRECEDENCE (more consumer-visible wins). Zero matched files → the honest
 *    `unclassified` family, with the cause in the bucket name (`:no-rule` = mapping gap,
 *    `:no-files` = zero-file merge) and the PR list attached.
 *
 * The output is dated and deterministic for a fixed window + mapping: the same inputs always
 * produce the same distribution, so a changed number means the corpus or the mapping changed —
 * never the method. The default window is PINNED (`REPORT_WINDOW` — the exemplar run's window), so
 * a bare re-run reproduces that run's distribution on an unchanged corpus: determinism you can
 * check on demand, with no derived data committed. A clock-derived default would make the window
 * itself a hidden moving input — re-runs a day (or a timezone) apart would measure different
 * ranges while the doc above invites blaming the corpus — so freshness is always an explicit
 * flag, never a default.
 *
 * Usage:
 *   node ai/scripts/diagnostics/consumerRelevanceCensus.mjs [--since YYYY-MM-DD] [--until YYYY-MM-DD]
 *        [--json <path>] [--out <path>]
 *
 * No flags: reproduce the exemplar window (REPORT_WINDOW). Fresh window: pass the flags — e.g.
 * `--until $(date -u +%Y-%m-%dT%H:%M:00Z)` for a run anchored at now. Date-only flags work but are
 * interpreted by git as end-of-day in the HOST'S LOCAL zone (fine for interactive reading; use
 * UTC instants when two seats must measure the identical corpus). The report header always names
 * the window measured. Generated reports land under `resources/data/reports/`, which is
 * gitignored — derived data is regenerable, never committed.
 * @plane host
 */
import {execFileSync}  from 'node:child_process';
import fs              from 'node:fs';
import path            from 'node:path';
import {fileURLToPath} from 'node:url';
import {
    BUCKET_PRECEDENCE,
    PATH_RULES,
    SUBSYSTEMS
} from './consumerRelevanceMap.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

/**
 * The exemplar run's window and the default for a bare invocation — the pin that makes the re-run
 * invariant true: re-running with no flags reproduces that run's distribution on an unchanged
 * corpus. Both ends are explicit UTC instants, never bare dates: git parses a date-only `--until`
 * as END of that day in the host's LOCAL zone, so a date string leaves the corpus open for the
 * rest of the local day AND shifts the measured instant across host zones — the two hidden moving
 * inputs the pin exists to remove. `until` is the generation cutoff, so the window is closed by
 * construction. Update both ends only when publishing a new exemplar (e.g. at a release boundary).
 * @type {{since: String, until: String}}
 */
export const REPORT_WINDOW = {since: '2026-02-25T00:00:00Z', until: '2026-07-25T17:52:00Z'};

/**
 * Resolves the census window from CLI args. Flags win; anything unpinned falls back to
 * REPORT_WINDOW — never to the clock (see the module doc: a clock default is a hidden moving input).
 * @param {String[]} args process.argv.slice(2)
 * @returns {{since: String, until: String}}
 */
export function resolveWindow(args) {
    const read = flag => args.includes(flag) ? args[args.indexOf(flag) + 1] : null;

    return {
        since: read('--since') ?? REPORT_WINDOW.since,
        until: read('--until') ?? REPORT_WINDOW.until
    }
}

/**
 * Parses the squash-merge subject form `... (#TICKET) (#PR)`.
 * @param {String} subject
 * @returns {{ticket: String, pr: String}|null}
 */
export function parseSquashSubject(subject) {
    const match = subject.match(/\(#(\d+)\)\s*\(#(\d+)\)\s*$/);
    return match ? {ticket: match[1], pr: match[2]} : null
}

/**
 * Classifies one file path to a subsystem via longest-prefix rule.
 * @param {String} filePath
 * @returns {String|null} subsystem id, or null when no rule matches (honest unclassified)
 */
export function classifyPath(filePath) {
    const rule = PATH_RULES
        .filter(({prefix}) => filePath.startsWith(prefix))
        .sort((a, b) => b.prefix.length - a.prefix.length)[0];

    return rule ? rule.subsystem : null
}

/**
 * Resolves one PR record to its bucket: majority-file subsystem bucket, precedence-broken ties.
 * The unclassified family names its CAUSE, never one blurry bucket: `unclassified:no-files` for a
 * merge commit touching zero files (a parse-honest empty row) and `unclassified:no-rule` for
 * touched files no mapping rule covers (a mapping gap — the only cause a reader should act on).
 * @param {String[]} files
 * @returns {{bucket: String, subsystem: String|null, temporal: String|null, ruleCounts: Object}}
 */
export function classifyPr(files) {
    const ruleCounts = {};

    for (const file of files) {
        const subsystem = classifyPath(file);
        if (!subsystem) continue;
        const {bucket} = SUBSYSTEMS[subsystem];
        ruleCounts[bucket] = (ruleCounts[bucket] || 0) + 1;
    }

    const entries = Object.entries(ruleCounts);

    if (entries.length === 0) {
        return {bucket: files.length === 0 ? 'unclassified:no-files' : 'unclassified:no-rule',
            subsystem: null, temporal: null, ruleCounts}
    }

    entries.sort((a, b) => b[1] - a[1] || BUCKET_PRECEDENCE.indexOf(a[0]) - BUCKET_PRECEDENCE.indexOf(b[0]));

    const bucket    = entries[0][0],
          subsystem = Object.keys(SUBSYSTEMS).find(id =>
              SUBSYSTEMS[id].bucket === bucket &&
              files.some(file => classifyPath(file) === id));

    return {bucket, subsystem, temporal: SUBSYSTEMS[subsystem]?.temporal ?? null, ruleCounts}
}

/**
 * Reads the merged-PR corpus from git in one pass.
 * @param {Object} options
 * @param {String} options.since YYYY-MM-DD
 * @param {String} options.until YYYY-MM-DD
 * @returns {Array<{sha: String, date: String, subject: String, ticket: String, pr: String, files: String[]}>}
 */
export function readMergedPrs({since, until}) {
    const raw = execFileSync('git', [
        'log', 'origin/dev', `--since=${since}`, `--until=${until}`,
        '--name-only', '--format=@@@%h|%aI|%s'
    ], {cwd: repoRoot, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024});

    const records = [];

    for (const chunk of raw.split('@@@').slice(1)) {
        const [header, ...fileLines] = chunk.trim().split('\n'),
              [sha, date, subject]   = header.split('|'),
              parsed                 = parseSquashSubject(subject);

        if (!parsed) continue;

        records.push({
            sha, date, subject,
            ...parsed,
            files: fileLines.map(line => line.trim()).filter(Boolean)
        });
    }

    return records
}

/**
 * Builds the bucket distribution + per-month trend from classified records.
 * @param {Object[]} records classified PR records (with bucket + temporal)
 * @returns {{totals: Object, monthly: Object, unclassified: Object[]}}
 */
export function summarize(records) {
    const totals       = {},
          monthly      = {},
          unclassified = [];

    for (const record of records) {
        const key = record.temporal ? `${record.bucket}:${record.temporal}` : record.bucket;

        totals[key] = (totals[key] || 0) + 1;

        const month = record.date.slice(0, 7);

        monthly[month] ??= {};
        monthly[month][key] = (monthly[month][key] || 0) + 1;

        if (record.bucket?.startsWith('unclassified')) {
            unclassified.push(record)
        }
    }

    return {totals, monthly, unclassified}
}

function main() {
    const args           = process.argv.slice(2),
          read           = flag => args.includes(flag) ? args[args.indexOf(flag) + 1] : null,
          {since, until} = resolveWindow(args),
          jsonOut        = read('--json'),
          mdOut          = read('--out');

    const records                         = readMergedPrs({since, until}).map(record => ({...record, ...classifyPr(record.files)})),
          {totals, monthly, unclassified} = summarize(records),
          generatedAt                     = new Date().toISOString();

    const lines = [
        `# Consumer-Relevance Census — merged PRs, ${since} → ${until}`,
        '',
        `Generated: ${generatedAt} · corpus: \`git log origin/dev --name-only\` · mapping: \`ai/scripts/diagnostics/consumerRelevanceMap.mjs\``,
        `Re-runnable and deterministic for a fixed range + mapping. **No single relevance percentage is computed anywhere** — the deliverable is the distribution and the mapping; necessity judgment is the reader's, permanently.`,
        '',
        '## Distribution',
        '',
        '| Bucket | PRs |',
        '|---|---|'
    ];

    let total = 0;

    for (const [key, count] of Object.entries(totals).sort((a, b) => b[1] - a[1])) {
        lines.push(`| ${key} | ${count} |`);
        total += count;
    }

    lines.push(`| **total** | **${total}** |`, '', '## Per-month trend', '');

    const months = Object.keys(monthly).sort(),
          keys   = [...new Set(Object.values(monthly).flatMap(row => Object.keys(row)))].sort();

    lines.push(`| Month | ${keys.join(' | ')} |`, `|---|${keys.map(() => '---').join('|')}|`);

    for (const month of months) {
        lines.push(`| ${month} | ${keys.map(key => monthly[month][key] || 0).join(' | ')} |`)
    }

    lines.push(
        '',
        `## Unclassified (${unclassified.length})`,
        '',
        'Listed, never silently omitted — and the bucket names its cause, because the two causes '
        + 'are different acts: `unclassified:no-rule` means touched files matched NO mapping rule '
        + '(a growing row here is a mapping gap — act on it); `unclassified:no-files` means the '
        + 'merge commit touches zero files (an honest empty row, not a gap).'
    );

    for (const record of unclassified) {
        const shown = record.files.slice(0, 4).join(', ') || '—';

        lines.push(`- #${record.pr} ${record.subject} — ${record.bucket} — files: ${shown}${record.files.length > 4 ? '…' : ''}`)
    }

    lines.push(
        '',
        '## Appendix: per-PR table',
        '',
        '| PR | Date | Bucket | Subsystem | Files |',
        '|---|---|---|---|---|'
    );

    for (const record of records) {
        lines.push(`| ${record.pr} | ${record.date.slice(0, 10)} | ${record.temporal ? `${record.bucket}:${record.temporal}` : record.bucket} | ${record.subsystem ?? '—'} | ${record.files.length} |`)
    }

    const markdown = lines.join('\n') + '\n',
          // The committed JSON carries the distribution, never the bulk corpus — the full per-PR
          // table lives in the markdown appendix, and the corpus itself is reproducible by re-running.
          json     = JSON.stringify({generatedAt, since, until, total, totals, monthly,
              unclassified: unclassified.map(({pr, subject, bucket, files}) => ({pr, subject, bucket, files}))}, null, 2);

    if (mdOut)   { fs.mkdirSync(path.dirname(mdOut), {recursive: true});   fs.writeFileSync(mdOut, markdown) }
    if (jsonOut) { fs.mkdirSync(path.dirname(jsonOut), {recursive: true}); fs.writeFileSync(jsonOut, json) }

    console.log(markdown);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main()
}
