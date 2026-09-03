#!/usr/bin/env node

import process from 'node:process';

/**
 * @module buildScripts.dataSyncWatchdog
 * @summary Scheduled staleness alarm for the Data Sync Pipeline: one standing issue per breach episode, closed on recovery.
 *
 * The Data Sync Pipeline (`data-sync-pipeline.yml`, hourly) degrades silently: consecutive
 * failures produce no visible signal, and the swarm's own knowledge ingestion rides the
 * pipeline — so an alarm living inside the Agent OS would be partially blind to exactly
 * this degradation. The alarm therefore lives on the GitHub surface: this script reads the
 * pipeline's run history through the Actions API (independent of the pipeline's own health
 * and of the Agent OS) and maintains exactly ONE standing alarm issue per breach episode.
 *
 * Contract:
 * - Breach: `consecutiveFailures >= WATCHDOG_MAX_CONSECUTIVE_FAILURES` (default 3) OR
 *   `age(lastSuccess) > WATCHDOG_MAX_SUCCESS_AGE_HOURS` (default 24) OR
 *   `age(last resources/content/** commit on dev) > WATCHDOG_MAX_CORPUS_AGE_HOURS` (default 48).
 *   The third axis exists because run-status is not independent of the QUESTION: the
 *   generated-markdown corpus advances only via hand-authored commits (never by the
 *   pipeline), so a green pipeline can certify a growing content backlog forever. The
 *   corpus is measured PER FACET (`issues`, `pulls`, `discussions` by default) — the
 *   facets sync independently and drift apart, so a single tree timestamp would certify
 *   two stale facets after an issue-only landing: the freshness witness needs the same
 *   cardinality as the corpus it certifies. The `issues` facet spans BOTH the active tree
 *   and `archive/issues`, because consumers read them as one semantic corpus
 *   (`buildScripts/docs/index/tickets.mjs` dual-source) — and the sync lane writes both.
 *   Its freshness is the NEWEST commit across the two subpaths: an archive-only repair is
 *   maintenance, and a healthy archive cadence (weekly-ish gaps) is not a breach; the
 *   breach is the whole lane going quiet. Every facet is measured from the COMMITTED
 *   default branch through the API — never a working-tree mtime, which can read current
 *   in the exact episode it must catch.
 *   On breach, open the standing alarm issue — or update the existing open one (fresh
 *   body + a comment naming the latest failed run). N breaches, one issue.
 * - Recovery: the newest completed run succeeds. On recovery, close the standing issue
 *   with a comment linking the recovering run.
 * - Idempotency is anchored by `ALARM_MARKER` in the issue body, never by title search
 *   alone — a retitled alarm is still found.
 * - `WATCHDOG_DRY_RUN=true` (or `--dry-run`) prints planned actions without writing.
 * - `WATCHDOG_FORCE_BREACH=true` / `WATCHDOG_FORCE_RECOVERY=true` force the respective
 *   branch for the `workflow_dispatch` dry-run acceptance path.
 */

export const ALARM_MARKER       = '<!-- data-sync-watchdog-alarm -->';
export const ALARM_TITLE_PREFIX = '[DATA-SYNC-ALARM]';

const
    DEFAULT_MAX_CONSECUTIVE_FAILURES = 3,
    DEFAULT_MAX_SUCCESS_AGE_HOURS    = 24,
    DEFAULT_MAX_CORPUS_AGE_HOURS     = 48,
    DEFAULT_CORPUS_PATH              = 'resources/content',
    DEFAULT_WORKFLOW                 = 'data-sync-pipeline.yml',
    /**
     * The branch every axis measures. ONE declaration feeds both the run-history query and the
     * corpus commit queries, because the two axes must certify the same branch: a run axis scoped
     * differently from the corpus axis would report health for a branch nobody deploys.
     * @type {String}
     */
    DEFAULT_BRANCH                   = 'dev',
    RUNS_PER_PAGE                    = 30,
    /**
     * Facet definitions: name → subpaths under `resources/content` that form ONE semantic
     * corpus. `issues` spans active + archive because consumers dual-source them; its
     * freshness is the newest commit across both (an archive-only repair is maintenance).
     * `WATCHDOG_CORPUS_FACETS` overrides the NAME list only; unknown names get a single
     * subpath equal to their name.
     *
     * EXPORTED because the pipeline's own freshness guard measures the same corpus this
     * axis measures. Two hand-maintained facet lists is how a facet gets added to the watchdog and
     * missed by the guard — the guard then certifies a corpus one third of which it never looked
     * at, and that failure is silent. One declaration, two consumers.
     * @type {Object<String, String[]>}
     */
    FACET_PATHS = {
        issues     : ['issues', 'archive/issues'],
        pulls      : ['pulls'],
        discussions: ['discussions']
    },
    DEFAULT_CORPUS_FACETS            = Object.keys(FACET_PATHS);

export {DEFAULT_CORPUS_PATH, DEFAULT_MAX_CORPUS_AGE_HOURS, FACET_PATHS};

/**
 * Reduces the newest-first completed run history to the streak facts.
 *
 * @param {Object} options
 * @param {Object[]} options.runs Completed runs, newest first (`conclusion`, `created_at`, `html_url`, `id`).
 * @returns {{latest: Object|null, consecutiveFailures: Number, lastSuccess: Object|null}}
 */
export function computeStreak({runs}) {
    let consecutiveFailures = 0,
        lastSuccess         = null;

    for (const run of runs) {
        if (run.conclusion === 'success') {
            lastSuccess = run;
            break
        }

        consecutiveFailures++
    }

    return {latest: runs[0] ?? null, consecutiveFailures, lastSuccess}
}

/**
 * Resolves a facet's freshness from per-subpath commit lists: the NEWEST commit date
 * across every subpath of one semantic corpus, or null when no subpath has a visible
 * commit. Newest-wins is the contract for multi-path facets (`issues` = active + archive):
 * an archive-only repair is maintenance, and a healthy archive cadence is not a breach.
 * Measured on the live history: archive-commit cadence gaps run 1–8 days, so the
 * alternatives (min-wins, or the archive as its own 48h facet) would false-breach
 * routinely; in ~2.5 months exactly one archive-only commit class (a hand-authored
 * redaction repair) refreshed the `issues` clock while the active tree was untouched —
 * the accepted price for not false-breaching.
 *
 * @param {Object[][]} commitLists One list of commit entries per subpath.
 * @returns {String|null} ISO date of the newest commit, or null.
 */
export function latestCommitDate(commitLists) {
    const dates = commitLists.flat()
        .map(entry => entry?.commit?.committer?.date)
        .filter(Boolean);

    return dates.length ? dates.reduce((a, b) => a > b ? a : b) : null
}

/**
 * Evaluates the breach thresholds. Boundary semantics: consecutive failures breach at `>=`,
 * success age and corpus age breach strictly past their hour limits.
 *
 * @param {Object} options
 * @param {Number} options.consecutiveFailures
 * @param {String|null} options.lastSuccessAt ISO date of the last success, or null when none is visible.
 * @param {Date} options.now
 * @param {String|null} [options.corpusLastCommitAt] ISO date of the last `resources/content/**` commit on dev.
 * @param {Number} [options.maxConsecutiveFailures=3]
 * @param {Number} [options.maxSuccessAgeHours=24]
 * @param {Number} [options.maxCorpusAgeHours=48]
 * @returns {{breached: Boolean, reasons: String[]}}
 */
export function evaluateBreach({consecutiveFailures, lastSuccessAt, now, corpusLastCommitAt, corpusFacets, maxConsecutiveFailures=DEFAULT_MAX_CONSECUTIVE_FAILURES, maxSuccessAgeHours=DEFAULT_MAX_SUCCESS_AGE_HOURS, maxCorpusAgeHours=DEFAULT_MAX_CORPUS_AGE_HOURS}) {
    const reasons = [];

    if (consecutiveFailures >= maxConsecutiveFailures) {
        reasons.push(`${consecutiveFailures} consecutive failures (threshold ${maxConsecutiveFailures})`)
    }

    if (!lastSuccessAt) {
        reasons.push(`no successful run visible in the last ${RUNS_PER_PAGE} completed runs`)
    } else {
        const ageHours = (now.getTime() - new Date(lastSuccessAt).getTime()) / 3_600_000;

        if (ageHours > maxSuccessAgeHours) {
            reasons.push(`last success is ${ageHours.toFixed(1)}h old (threshold ${maxSuccessAgeHours}h)`)
        }
    }

    if (corpusLastCommitAt !== undefined) {
        if (!corpusLastCommitAt) {
            reasons.push('no `resources/content/**` commit visible on the default branch')
        } else {
            const corpusAgeHours = (now.getTime() - new Date(corpusLastCommitAt).getTime()) / 3_600_000;

            if (corpusAgeHours > maxCorpusAgeHours) {
                reasons.push(`last \`resources/content/**\` commit is ${corpusAgeHours.toFixed(1)}h old (threshold ${maxCorpusAgeHours}h — deploys, clones, CI and container KB ingestion all build from committed \`dev\`)`)
            }
        }
    }

    if (corpusFacets !== undefined) {
        for (const {facet, lastCommitAt, ageHours} of corpusFacets) {
            if (!lastCommitAt) {
                reasons.push(`no commit visible for corpus facet \`${facet}\` on the default branch`)
            } else if (ageHours > maxCorpusAgeHours) {
                reasons.push(`corpus facet \`${facet}\` is ${ageHours.toFixed(1)}h old (threshold ${maxCorpusAgeHours}h)`)
            }
        }
    }

    return {breached: reasons.length > 0, reasons}
}

/**
 * Parses a threshold env var. A present-but-unparseable or non-positive value fails LOUD:
 * `Number(raw) || fallback` would silently substitute the default for a typo or a zero,
 * and a silence-detector whose threshold silently reverts reports healthy against a
 * threshold nobody chose — the precise failure mode this tool exists to catch.
 *
 * @param {Object} options
 * @param {String} options.name Env var name (for the error message).
 * @param {String|undefined} options.raw Raw env value.
 * @param {Number} options.fallback Used only when the var is absent.
 * @returns {Number}
 */
export function parseThreshold({name, raw, fallback}) {
    if (raw === undefined || raw === '') return fallback;

    const value = Number(raw);

    if (!Number.isFinite(value) || value <= 0) {
        throw new Error(`dataSyncWatchdog: ${name} must be a positive number, got '${raw}' — refusing to silently substitute ${fallback}`)
    }

    return value
}

/**
 * @summary The ONE effective corpus-age policy, resolved the same way for every consumer.
 *
 * The pipeline's freshness guard and this watchdog's alarm judge the same corpus, so they must
 * resolve the same number or they can contradict each other about it. Importing
 * `DEFAULT_MAX_CORPUS_AGE_HOURS` is NOT that: the constant is the fallback, while the operative
 * value is `WATCHDOG_MAX_CORPUS_AGE_HOURS` when it is set. A consumer holding the constant sees
 * 48h while this tool sees the override, so a 60h corpus under a 72h override is stale to one and
 * fresh to the other. Sharing a default is not sharing policy.
 *
 * Resolved per call rather than at module load, so the value cannot be frozen by import order and
 * a test can drive it through `env` without mutating the process.
 *
 * @param {Object} [env=process.env] Environment to resolve from.
 * @returns {Number} Effective maximum corpus age in hours.
 * @throws {Error} Via {@link parseThreshold} when the override is present but not a positive number.
 */
export function resolveMaxCorpusAgeHours(env = process.env) {
    return parseThreshold({
        name    : 'WATCHDOG_MAX_CORPUS_AGE_HOURS',
        raw     : env.WATCHDOG_MAX_CORPUS_AGE_HOURS,
        fallback: DEFAULT_MAX_CORPUS_AGE_HOURS
    })
}

/**
 * Parses the facet-list env var with the same loud discipline as `parseThreshold`:
 * absent or empty falls back to the default set, but a PRESENT value that resolves to
 * zero names (comma/whitespace-only — the realistic shape of an unset-vars composition
 * like `${{ vars.A }},${{ vars.B }}`) fails LOUD. A resolved-empty list would empty the
 * corpus axis itself: `evaluateBreach` over `[]` is indistinguishable from the axis
 * never having been measured, which is the certified-silence class this tool exists to
 * break — a watchdog must never carry a quiet off-switch for its own guard.
 *
 * Unknown names fall through to a single subpath equal to the name BY DESIGN: the
 * override is the extension point for future independently-synced trees, with no code
 * change required. A typo then surfaces at evaluation time as a "no commit visible"
 * breach for that facet — the loud direction as well (never silence).
 *
 * @param {Object} options
 * @param {String} options.name Env var name (for the error message).
 * @param {String|undefined} options.raw Raw env value.
 * @param {String[]} options.fallback Used only when the var is absent or empty.
 * @returns {String[]}
 */
export function parseFacetNames({name, raw, fallback}) {
    if (raw === undefined || raw === '') return fallback;

    const facets = raw.split(',').map(facet => facet.trim()).filter(Boolean);

    if (facets.length === 0) {
        throw new Error(`dataSyncWatchdog: ${name} resolved to zero facets from '${raw}' — refusing to silently disable the corpus axis (omit the var to use the default set)`)
    }

    return facets
}

/**
 * Parses the measured-branch env var with the same loud discipline as `parseThreshold` and
 * `parseFacetNames`: absent or empty falls back, but a PRESENT value that resolves to nothing
 * (whitespace-only) fails LOUD. A silently-empty override would drop the `branch=` filter and
 * widen the run axis back to EVERY branch — the exact defect this parameter exists to close,
 * where one feature-branch success truncates the default branch's failure streak and the alarm
 * goes quiet while the branch it guards is still red.
 *
 * @param {Object} options
 * @param {String} options.name Env var name (for the error message).
 * @param {String|undefined} options.raw Raw env value.
 * @param {String} options.fallback Used only when the var is absent or empty.
 * @returns {String}
 */
export function parseBranchName({name, raw, fallback}) {
    if (raw === undefined || raw === '') return fallback;

    const branch = raw.trim();

    if (branch === '') {
        throw new Error(`dataSyncWatchdog: ${name} resolved to an empty branch from '${raw}' — refusing to widen the run axis to every branch (omit the var to measure '${fallback}')`)
    }

    return branch
}

/**
 * Builds the run-history query. Extracted so the branch scope is assertable: the defect this
 * closes was an unscoped query, and an inline template literal leaves that invariant with no
 * witness. `branch` is REQUIRED — there is deliberately no default here, because a default
 * would let a caller reintroduce the unscoped form by omission.
 *
 * @param {Object} options
 * @param {String} options.repository `owner/name`.
 * @param {String} options.workflow Workflow file name.
 * @param {String} options.branch Branch to measure.
 * @param {Number} [options.perPage=RUNS_PER_PAGE]
 * @returns {String} API path including the `branch` filter.
 */
export function buildRunsQuery({repository, workflow, branch, perPage = RUNS_PER_PAGE}) {
    if (typeof branch !== 'string' || branch.trim() === '') {
        throw new Error('dataSyncWatchdog.buildRunsQuery: branch is required — an unscoped run query mixes feature-branch runs into the guarded branch\'s streak')
    }

    return `/repos/${repository}/actions/workflows/${workflow}/runs?branch=${encodeURIComponent(branch)}&per_page=${perPage}`
}

/**
 * @param {Object} options
 * @param {String|null} options.latestConclusion Conclusion of the newest completed run.
 * @param {Boolean} options.breached Whether ANY axis is breaching (a green run axis never
 *        masks a stale corpus — that is the certified-silence case this watchdog exists to break).
 * @returns {Boolean} True when the pipeline recovered on every axis.
 */
export function isRecovered({latestConclusion, breached}) {
    return latestConclusion === 'success' && !breached
}

/**
 * Selects the standing alarm issue from open issues, by body marker first and title prefix
 * as the pre-marker legacy fallback. Multiple hits collapse to the oldest (first) — the
 * standing issue is singular by contract.
 *
 * @param {Object[]} issues Open issues (`number`, `title`, `body`, `pull_request?`).
 * @returns {Object|null}
 */
export function selectAlarmIssue(issues) {
    return issues.find(issue => !issue.pull_request && issue.body?.includes(ALARM_MARKER))
        ?? issues.find(issue => !issue.pull_request && issue.title?.startsWith(ALARM_TITLE_PREFIX))
        ?? null
}

/**
 * @param {Object} options
 * @param {Number} options.consecutiveFailures
 * @param {Object|null} options.lastSuccess
 * @param {Boolean} [options.forced=false] True when a dispatch dry-run forced the branch
 *        (the only path where a zero-streak title can occur).
 * @returns {String}
 */
export function buildAlarmTitle({consecutiveFailures, lastSuccess, corpusLastCommitAt, corpusAgeHours, staleFacets, forced=false}) {
    if (forced && consecutiveFailures === 0) {
        return `${ALARM_TITLE_PREFIX} Data Sync Pipeline: forced breach evaluation (workflow_dispatch dry run)`
    }

    if (consecutiveFailures === 0 && staleFacets?.length) {
        const ages   = staleFacets.map(f => f.ageHours).filter(age => age !== null),
              oldest = ages.length ? ` (oldest ${Math.max(...ages).toFixed(1)}h)` : '';

        return `${ALARM_TITLE_PREFIX} Data Sync corpus stale: facet${staleFacets.length > 1 ? 's' : ''} ${staleFacets.map(f => `\`${f.facet}\``).join(', ')}${oldest}`
    }

    if (consecutiveFailures === 0 && corpusLastCommitAt) {
        return `${ALARM_TITLE_PREFIX} Data Sync corpus stale: last \`resources/content/**\` commit ${corpusLastCommitAt} (${corpusAgeHours}h)`
    }

    const since = lastSuccess ? ` since ${lastSuccess.created_at}` : ' (no recent success)';

    return `${ALARM_TITLE_PREFIX} Data Sync Pipeline: ${consecutiveFailures} consecutive failures${since}`
}

/**
 * @param {Object} options
 * @param {Number} options.consecutiveFailures
 * @param {Object|null} options.lastSuccess
 * @param {Object|null} options.latestFailure
 * @param {String[]} options.reasons
 * @param {Boolean} [options.forced=false] True when a dispatch dry-run forced the branch.
 * @returns {String}
 */
export function buildAlarmBody({consecutiveFailures, lastSuccess, latestFailure, reasons, corpusLastCommitAt, corpusAgeHours, corpusFacets, branch=DEFAULT_BRANCH, forced=false}) {
    const corpusLine = corpusFacets
        ? [
            `**Corpus facets** (committed \`${branch}\`; a green pipeline cannot attest to this backlog):`,
            '',
            `| facet | last commit on \`${branch}\` | age | status |`,
            '|---|---|---|---|',
            ...corpusFacets.map(({facet, lastCommitAt, ageHours, stale}) =>
                `| \`${facet}\` | ${lastCommitAt ?? 'none visible'} | ${lastCommitAt ? `${ageHours.toFixed(1)}h` : '—'} | ${stale ? '**STALE**' : 'ok'} |`)
        ].join('\n')
        : `**Corpus axis:** last \`resources/content/**\` commit on \`${branch}\`: ${corpusLastCommitAt ? `${corpusLastCommitAt} (${corpusAgeHours}h old)` : 'not measured'}. Deploys, fresh clones, CI, and container KB ingestion all build from committed \`${branch}\` — a green pipeline cannot attest to this backlog.`;

    // The two axes breach independently, so the closing line is derived from the ones that fired
    // rather than asserted. A sentence claiming failing runs describes the wrong outage whenever
    // the corpus axis breaches alone: a zero streak reading above prose about failing runs sends
    // the reader after a broken workflow instead of a dead producer.
    //
    // Read from the structured inputs, never by matching `reasons` prose — a containment check over
    // sentences is a coincidence of wording standing in for a measurement.
    const staleFacets  = (corpusFacets ?? []).filter(({stale}) => stale).map(({facet}) => `\`${facet}\``),
          breachedAxes = [
              consecutiveFailures > 0 && `runs are failing on schedule (${consecutiveFailures} consecutive)`,
              staleFacets.length  > 0 && `the committed corpus is frozen (${staleFacets.join(', ')})`
          ].filter(Boolean);

    return [
        ALARM_MARKER,
        '',
        '**Standing alarm — one per breach episode.** This issue is maintained by `dataSyncWatchdog.mjs`:',
        'the body is refreshed on every breach evaluation and the issue closes automatically on recovery.',
        '',
        `**Streak:** ${consecutiveFailures} consecutive failures${branch ? ` on \`${branch}\`` : ''}.`,
        `**Last success:** ${lastSuccess ? `[${lastSuccess.created_at}](${lastSuccess.html_url})` : `none in the last ${RUNS_PER_PAGE} completed runs`}.`,
        `**Latest failure:** ${latestFailure ? `[run ${latestFailure.id}](${latestFailure.html_url})` : 'n/a'}.`,
        corpusLine,
        '',
        '**Breach reasons:**',
        ...reasons.map(reason => `- ${reason}`),
        '',
        breachedAxes.length > 0
            ? `**Breached axes:** ${breachedAxes.join('; and ')}. The two are measured separately and neither implies the other.`
            : forced
                ? '**Breached axes:** none — neither axis measured a breach.'
                : 'The pipeline is degrading silently and nothing else surfaces it.',
        'Root-cause work (if any) is tracked elsewhere; this issue only carries the alarm.',
        forced ? '\n> This alarm was opened by a forced `workflow_dispatch` dry run — close it manually if the pipeline is in fact healthy.' : ''
    ].filter(line => line !== '').join('\n')
}

/**
 * @param {Object} options
 * @param {Number} options.consecutiveFailures
 * @param {Object|null} options.latestFailure
 * @returns {String}
 */
export function buildBreachComment({consecutiveFailures, latestFailure}) {
    return `Breach continues: ${consecutiveFailures} consecutive failures`
        + (latestFailure ? ` — latest: [run ${latestFailure.id}](${latestFailure.html_url}).` : '.')
}

/**
 * @param {Object} options
 * @param {Object} options.recoveringRun
 * @param {Number} options.consecutiveFailures
 * @returns {String}
 */
export function buildRecoveryComment({recoveringRun, consecutiveFailures}) {
    return `Recovered: [run ${recoveringRun.id}](${recoveringRun.html_url}) succeeded`
        + ` after ${consecutiveFailures} consecutive failures. Closing — the alarm re-opens on the next breach episode.`
}

/**
 * Minimal GitHub REST wrapper over global fetch.
 *
 * @param {String} path API path (e.g. `/repos/neomjs/neo/issues`).
 * @param {Object} options
 * @param {String} options.token
 * @param {String} [options.method='GET']
 * @param {Object} [options.body]
 * @returns {Promise<Object>}
 */
async function api(path, {token, method='GET', body}) {
    const response = await fetch(`https://api.github.com${path}`, {
        method,
        headers: {
            'Accept'              : 'application/vnd.github+json',
            'Authorization'       : `Bearer ${token}`,
            'X-GitHub-Api-Version': '2022-11-28',
            ...(body ? {'Content-Type': 'application/json'} : {})
        },
        ...(body ? {body: JSON.stringify(body)} : {})
    });

    if (!response.ok) {
        throw new Error(`GitHub API ${method} ${path} -> ${response.status}: ${(await response.text()).slice(0, 300)}`)
    }

    return response.status === 204 ? {} : response.json()
}

async function main() {
    const
        args                   = new Set(process.argv.slice(2)),
        token                  = process.env.GITHUB_TOKEN,
        repository             = process.env.GITHUB_REPOSITORY || 'neomjs/neo',
        workflow               = process.env.WATCHDOG_WORKFLOW || DEFAULT_WORKFLOW,
        branch                 = parseBranchName({name: 'WATCHDOG_BRANCH', raw: process.env.WATCHDOG_BRANCH, fallback: DEFAULT_BRANCH}),
        corpusPath             = process.env.WATCHDOG_CORPUS_PATH || DEFAULT_CORPUS_PATH,
        maxConsecutiveFailures = parseThreshold({name: 'WATCHDOG_MAX_CONSECUTIVE_FAILURES', raw: process.env.WATCHDOG_MAX_CONSECUTIVE_FAILURES, fallback: DEFAULT_MAX_CONSECUTIVE_FAILURES}),
        maxSuccessAgeHours     = parseThreshold({name: 'WATCHDOG_MAX_SUCCESS_AGE_HOURS', raw: process.env.WATCHDOG_MAX_SUCCESS_AGE_HOURS, fallback: DEFAULT_MAX_SUCCESS_AGE_HOURS}),
        // Through the shared resolver, not a second inline `parseThreshold` — a duplicated
        // resolution site is how the pipeline and this tool came to hold different numbers.
        maxCorpusAgeHours      = resolveMaxCorpusAgeHours(process.env),
        dryRun                 = process.env.WATCHDOG_DRY_RUN === 'true' || args.has('--dry-run'),
        forceBreach            = process.env.WATCHDOG_FORCE_BREACH === 'true',
        forceRecovery          = process.env.WATCHDOG_FORCE_RECOVERY === 'true',
        now                    = new Date();

    if (!token) {
        throw new Error('dataSyncWatchdog: GITHUB_TOKEN is required (actions:read + issues:write)')
    }

    const runsResponse = await api(
        // Branch-SCOPED deliberately. Unscoped, this list mixes feature-branch runs with the
        // branch being guarded, and computeStreak breaks on the first success it meets — so one
        // passing branch run truncates the real streak and can hand `lastSuccess` a run from a
        // branch nobody deploys. The corpus axis has always pinned the branch; this axis must too.
        buildRunsQuery({repository, workflow, branch}),
        {token}
    );

    // Completed runs only, newest first — in-progress/queued runs carry no conclusion.
    const runs = (runsResponse.workflow_runs ?? [])
        .filter(run => run.conclusion)
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    const {latest, consecutiveFailures, lastSuccess} = computeStreak({runs});

    console.log(`watchdog: ${runs.length} completed runs visible; latest=${latest?.conclusion ?? 'none'}; consecutiveFailures=${consecutiveFailures}; lastSuccess=${lastSuccess?.created_at ?? 'none'}`);

    // Corpus axis, PER FACET: the corpus advances only via hand-authored commits, and its
    // facets sync independently — one tree timestamp would certify two stale facets after
    // a single-facet landing (the freshness witness needs the corpus's own cardinality).
    // Multi-path facets (`issues` = active + archive, one semantic corpus for consumers)
    // take the NEWEST commit across their subpaths: an archive-only repair is maintenance.
    // Measured from the COMMITTED default branch, never a working tree.
    const facetNames = parseFacetNames({name: 'WATCHDOG_CORPUS_FACETS', raw: process.env.WATCHDOG_CORPUS_FACETS, fallback: DEFAULT_CORPUS_FACETS});

    const corpusFacets = await Promise.all(facetNames.map(async facet => {
        const subpaths = FACET_PATHS[facet] ?? [facet],
              commits  = await Promise.all(subpaths.map(subpath =>
                  api(`/repos/${repository}/commits?path=${encodeURIComponent(`${corpusPath}/${subpath}`)}&sha=${encodeURIComponent(branch)}&per_page=1`, {token})));

        const lastCommitAt = latestCommitDate(commits),
              ageHours     = lastCommitAt
                  ? (now.getTime() - new Date(lastCommitAt).getTime()) / 3_600_000
                  : null;

        return {
            facet,
            lastCommitAt,
            ageHours,
            stale: lastCommitAt === null || ageHours > maxCorpusAgeHours
        }
    }));

    const staleFacets = corpusFacets.filter(facet => facet.stale);

    console.log(`watchdog: corpus facets — ${corpusFacets.map(({facet, lastCommitAt, ageHours}) =>
        `${facet}=${lastCommitAt ?? 'none'}${ageHours !== null ? ` (${ageHours.toFixed(1)}h)` : ''}`).join(', ')}`);

    const {breached, reasons} = evaluateBreach({
        consecutiveFailures,
        lastSuccessAt: lastSuccess?.created_at ?? null,
        now,
        corpusFacets,
        maxConsecutiveFailures,
        maxSuccessAgeHours,
        maxCorpusAgeHours
    });

    if (forceBreach && !breached) {
        reasons.unshift('forced via workflow_dispatch (dry-run acceptance path)')
    }

    // Recovery means NO active breach on any axis: a green run closing the alarm while the
    // corpus backlog grows is exactly the certified-silence failure this watchdog exists to break.
    const recovered = forceRecovery || (!forceBreach && isRecovered({latestConclusion: latest?.conclusion, breached}));

    const openIssues = await api(`/repos/${repository}/issues?state=open&per_page=100`, {token}),
          alarm      = selectAlarmIssue(openIssues);

    console.log(`watchdog: standing alarm issue: ${alarm ? `#${alarm.number}` : 'none'}${dryRun ? ' (DRY RUN — no writes)' : ''}`);

    if (recovered) {
        if (alarm) {
            const comment = buildRecoveryComment({recoveringRun: latest, consecutiveFailures});

            console.log(`watchdog: recovery — closing #${alarm.number}: ${comment}`);

            if (!dryRun) {
                await api(`/repos/${repository}/issues/${alarm.number}/comments`, {token, method: 'POST', body: {body: comment}});
                await api(`/repos/${repository}/issues/${alarm.number}`, {token, method: 'PATCH', body: {state: 'closed'}})
            }
        } else {
            console.log('watchdog: recovered and no standing alarm — nothing to do')
        }

        return
    }

    if (!breached && !forceBreach) {
        console.log('watchdog: healthy — no breach, nothing to do');
        return
    }

    const title = buildAlarmTitle({consecutiveFailures, lastSuccess, staleFacets, forced: forceBreach}),
          body  = buildAlarmBody({consecutiveFailures, lastSuccess, latestFailure: latest?.conclusion === 'failure' ? latest : null, reasons, corpusFacets, branch, forced: forceBreach});

    if (alarm) {
        const comment = buildBreachComment({consecutiveFailures, latestFailure: latest});

        console.log(`watchdog: breach continues — updating #${alarm.number} (fresh body + comment)`);

        if (!dryRun) {
            await api(`/repos/${repository}/issues/${alarm.number}`, {token, method: 'PATCH', body: {title, body}});
            await api(`/repos/${repository}/issues/${alarm.number}/comments`, {token, method: 'POST', body: {body: comment}})
        }
    } else {
        console.log(`watchdog: breach — opening standing alarm issue: ${title}`);

        if (!dryRun) {
            const created = await api(`/repos/${repository}/issues`, {token, method: 'POST', body: {title, body}});

            console.log(`watchdog: opened #${created.number}`)
        }
    }
}

const isMain = process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href;

if (isMain) {
    main().catch(error => {
        console.error(`dataSyncWatchdog FAILED: ${error.message}`);
        process.exitCode = 1
    })
}
