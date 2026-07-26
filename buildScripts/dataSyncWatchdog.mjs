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
 *   corpus axis is measured from the COMMITTED default branch through the API — never a
 *   working-tree mtime, which can read current in the exact episode it must catch.
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
    RUNS_PER_PAGE                    = 30;

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
export function evaluateBreach({consecutiveFailures, lastSuccessAt, now, corpusLastCommitAt, maxConsecutiveFailures=DEFAULT_MAX_CONSECUTIVE_FAILURES, maxSuccessAgeHours=DEFAULT_MAX_SUCCESS_AGE_HOURS, maxCorpusAgeHours=DEFAULT_MAX_CORPUS_AGE_HOURS}) {
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
export function buildAlarmTitle({consecutiveFailures, lastSuccess, corpusLastCommitAt, corpusAgeHours, forced=false}) {
    if (forced && consecutiveFailures === 0) {
        return `${ALARM_TITLE_PREFIX} Data Sync Pipeline: forced breach evaluation (workflow_dispatch dry run)`
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
export function buildAlarmBody({consecutiveFailures, lastSuccess, latestFailure, reasons, corpusLastCommitAt, corpusAgeHours, forced=false}) {
    return [
        ALARM_MARKER,
        '',
        '**Standing alarm — one per breach episode.** This issue is maintained by `dataSyncWatchdog.mjs`:',
        'the body is refreshed on every breach evaluation and the issue closes automatically on recovery.',
        '',
        `**Streak:** ${consecutiveFailures} consecutive failures.`,
        `**Last success:** ${lastSuccess ? `[${lastSuccess.created_at}](${lastSuccess.html_url})` : `none in the last ${RUNS_PER_PAGE} completed runs`}.`,
        `**Latest failure:** ${latestFailure ? `[run ${latestFailure.id}](${latestFailure.html_url})` : 'n/a'}.`,
        `**Corpus axis:** last \`resources/content/**\` commit on \`dev\`: ${corpusLastCommitAt ? `${corpusLastCommitAt} (${corpusAgeHours}h old)` : 'not measured'}. Deploys, fresh clones, CI, and container KB ingestion all build from committed \`dev\` — a green pipeline cannot attest to this backlog.`,
        '',
        '**Breach reasons:**',
        ...reasons.map(reason => `- ${reason}`),
        '',
        'The pipeline is degrading silently: runs fail on schedule and nothing else surfaces it.',
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
        corpusPath             = process.env.WATCHDOG_CORPUS_PATH || DEFAULT_CORPUS_PATH,
        maxConsecutiveFailures = parseThreshold({name: 'WATCHDOG_MAX_CONSECUTIVE_FAILURES', raw: process.env.WATCHDOG_MAX_CONSECUTIVE_FAILURES, fallback: DEFAULT_MAX_CONSECUTIVE_FAILURES}),
        maxSuccessAgeHours     = parseThreshold({name: 'WATCHDOG_MAX_SUCCESS_AGE_HOURS', raw: process.env.WATCHDOG_MAX_SUCCESS_AGE_HOURS, fallback: DEFAULT_MAX_SUCCESS_AGE_HOURS}),
        maxCorpusAgeHours      = parseThreshold({name: 'WATCHDOG_MAX_CORPUS_AGE_HOURS', raw: process.env.WATCHDOG_MAX_CORPUS_AGE_HOURS, fallback: DEFAULT_MAX_CORPUS_AGE_HOURS}),
        dryRun                 = process.env.WATCHDOG_DRY_RUN === 'true' || args.has('--dry-run'),
        forceBreach            = process.env.WATCHDOG_FORCE_BREACH === 'true',
        forceRecovery          = process.env.WATCHDOG_FORCE_RECOVERY === 'true',
        now                    = new Date();

    if (!token) {
        throw new Error('dataSyncWatchdog: GITHUB_TOKEN is required (actions:read + issues:write)')
    }

    const runsResponse = await api(
        `/repos/${repository}/actions/workflows/${workflow}/runs?per_page=${RUNS_PER_PAGE}`,
        {token}
    );

    // Completed runs only, newest first — in-progress/queued runs carry no conclusion.
    const runs = (runsResponse.workflow_runs ?? [])
        .filter(run => run.conclusion)
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    const {latest, consecutiveFailures, lastSuccess} = computeStreak({runs});

    console.log(`watchdog: ${runs.length} completed runs visible; latest=${latest?.conclusion ?? 'none'}; consecutiveFailures=${consecutiveFailures}; lastSuccess=${lastSuccess?.created_at ?? 'none'}`);

    // Corpus axis: the generated-markdown corpus advances only via hand-authored commits —
    // measure the COMMITTED default branch, never a working tree (which can read current in
    // the exact episode this axis exists to catch).
    const corpusCommits = await api(
        `/repos/${repository}/commits?path=${encodeURIComponent(corpusPath)}&sha=dev&per_page=1`,
        {token}
    );

    const corpusLastCommitAt = corpusCommits[0]?.commit?.committer?.date ?? null,
          corpusAgeHours     = corpusLastCommitAt
              ? Number(((now.getTime() - new Date(corpusLastCommitAt).getTime()) / 3_600_000).toFixed(1))
              : null;

    console.log(`watchdog: corpus axis — last \`${corpusPath}\` commit on dev: ${corpusLastCommitAt ?? 'none'}${corpusAgeHours !== null ? ` (${corpusAgeHours}h)` : ''}`);

    const {breached, reasons} = evaluateBreach({
        consecutiveFailures,
        lastSuccessAt: lastSuccess?.created_at ?? null,
        now,
        corpusLastCommitAt,
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

    const title = buildAlarmTitle({consecutiveFailures, lastSuccess, corpusLastCommitAt, corpusAgeHours, forced: forceBreach}),
          body  = buildAlarmBody({consecutiveFailures, lastSuccess, latestFailure: latest?.conclusion === 'failure' ? latest : null, reasons, corpusLastCommitAt, corpusAgeHours, forced: forceBreach});

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
