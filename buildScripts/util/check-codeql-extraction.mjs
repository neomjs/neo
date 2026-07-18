import process from 'node:process';

/**
 * @module buildScripts/util/check-codeql-extraction
 * @summary CI gate that fails when CodeQL silently DROPPED a source file for a parse error.
 *
 * The trap this closes: a file CodeQL cannot parse produces **zero alerts**, so it clears the
 * alert-gate (ruleset 19087298) clean — "unparseable" and "clean" are indistinguishable there, and
 * the `GET /code-scanning/analyses` API's `warning` field is empirically EMPTY on a run whose own
 * Analyze-job log carries the drop. That API field is the non-discriminating oracle; the served SARIF
 * strips `invocations` (so its `toolExecutionNotifications` are gone too). The one surface that stays
 * honest is the **Analyze-job log**, which the extractor writes its own verdict into:
 *   `Could not process some files due to syntax errors`  (the authoritative group header)
 *   `... A parse error occurred: Unexpected token ...`   (per-file detail)
 *
 * This gate reads that log (fetched from the completed Analyze job via the Actions API in a
 * `needs: analyze` guard job) and fails CI naming the dropped file(s). It COMPLEMENTS the alert-gate:
 * alerts and processing-warnings are different signals — an unparseable file emits zero of the former.
 */

/**
 * The authoritative "at least one file was dropped" signal CodeQL's extractor prints. Its mere
 * presence fails the gate even if the per-file detail-line format drifts — a dropped file must never
 * pass silently because its name could not be parsed.
 * @type {String}
 */
export const EXTRACTION_GROUP_MARKER = 'Could not process some files due to syntax errors';

/**
 * Per-file extraction from the detail bullets. Verified against a REAL drop-log (run 29568877624,
 * the pre-fix scan): CodeQL prints one bullet per dropped file, of the form
 *   `  * ai/scripts/benchmark/serving-cost-meter.mjs#L309C7:7: A parse error occurred: ...`
 * i.e. `* <path>#L<line>C<col>:<col>: A parse error occurred`. The capture is the path token after the
 * bullet and before its `#L…` location suffix; `\S*` swallows that suffix (its internal colons and all)
 * up to the space before the phrase. The GROUP marker above stays the gate's correctness anchor — this
 * names the files for the AC-1 "naming the offending file(s)" requirement.
 * @type {RegExp}
 */
export const PER_FILE_PARSE_ERROR = /\*\s+([^\s#:]+)\S*\s+A parse error occurred/gi;

/**
 * @summary Pure parser: given the raw Analyze-job log, decide whether CodeQL dropped any file for a
 * parse error, and name the files it named. Discriminating by construction — it reads the extractor's
 * OWN verdict, not an alert count (a dropped file emits zero alerts) and not the empty API `warning`.
 * @param {String} logText The Analyze job's raw log (Actions prepends a timestamp to each line; the
 *     substring/patterns tolerate that prefix).
 * @returns {{hasErrors: Boolean, files: String[], groupMarkerSeen: Boolean}}
 */
export function findCodeqlExtractionErrors(logText) {
    const text  = String(logText ?? ''),
          files = [];

    for (const match of text.matchAll(PER_FILE_PARSE_ERROR)) {
        const file = match[1]?.trim();
        file && files.push(file)
    }

    const groupMarkerSeen = text.includes(EXTRACTION_GROUP_MARKER),
          // either signal fails the gate: the group header is authoritative, and a stray per-file
          // parse-error line without the header (format drift) must still not pass silently
          hasErrors       = groupMarkerSeen || files.length > 0;

    return {hasErrors, files: [...new Set(files)], groupMarkerSeen}
}

/**
 * @summary Pure aggregation across EVERY Analyze matrix leg — the matrix-robust verdict. A language
 * matrix produces one `Analyze (<lang>)` leg per language, and a drop in ANY leg is a drop; certifying
 * only the first leg is a matrix-shaped false-clean. Runs each leg's log through the parser and returns
 * every dropped file tagged with its leg.
 * @param {Array<{name: String, log: String}>} legs One entry per completed Analyze leg.
 * @returns {{hasErrors: Boolean, dropped: Array<{leg: String, file: String|null}>, legCount: Number}}
 *     `file` is `null` for a leg whose group header fired but whose per-file bullets did not parse.
 */
export function summarizeExtractionAcrossLegs(legs) {
    const rows    = Array.isArray(legs) ? legs : [],
          dropped = [];

    for (const {name, log} of rows) {
        const {hasErrors, files, groupMarkerSeen} = findCodeqlExtractionErrors(log);

        if (!hasErrors) continue;

        if (files.length) {
            files.forEach(file => dropped.push({leg: name, file}))
        } else if (groupMarkerSeen) {
            // the header proves a drop even when the per-file bullet format drifts — never swallow it
            dropped.push({leg: name, file: null})
        }
    }

    return {hasErrors: dropped.length > 0, dropped, legCount: rows.length}
}

/**
 * @summary I/O wrapper: fetch the raw log of EVERY completed Analyze matrix leg for this run via the
 * Actions API. A `needs: analyze` guard runs after all legs finish, so each leg's log is available.
 * A single leg's fetch failure throws — an unread leg is an uncertified leg, never a silent pass.
 * @param {Object} params
 * @param {String} params.repo `owner/name` (`GITHUB_REPOSITORY`).
 * @param {String|Number} params.runId `GITHUB_RUN_ID`.
 * @param {String} params.token `GITHUB_TOKEN` with `actions:read`.
 * @param {RegExp} [params.jobNameMatch=/Analyze/] Match for the CodeQL analyze leg names (`Analyze (javascript)`, …).
 * @returns {Promise<Array<{name: String, log: String}>>} one entry per matching Analyze leg.
 */
export async function fetchAnalyzeJobLogs({repo, runId, token, jobNameMatch = /Analyze/}) {
    const base    = 'https://api.github.com',
          headers = {Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28'};

    const jobsRes = await fetch(`${base}/repos/${repo}/actions/runs/${runId}/jobs?per_page=100`, {headers});
    if (!jobsRes.ok) throw new Error(`fetch run jobs failed: ${jobsRes.status} ${jobsRes.statusText}`);

    const {jobs = []} = await jobsRes.json(),
          legs        = jobs.filter(job => jobNameMatch.test(job.name));
    if (!legs.length) throw new Error(`no job matching ${jobNameMatch} in run ${runId} (jobs: ${jobs.map(j => j.name).join(', ')})`);

    return Promise.all(legs.map(async leg => {
        const logRes = await fetch(`${base}/repos/${repo}/actions/jobs/${leg.id}/logs`, {headers, redirect: 'follow'});
        if (!logRes.ok) throw new Error(`fetch Analyze leg "${leg.name}" log failed: ${logRes.status} ${logRes.statusText}`);

        return {name: leg.name, log: await logRes.text()}
    }))
}

/**
 * @summary CLI entry: fetch EVERY Analyze leg's log, aggregate the parser verdict, exit non-zero
 * (naming each dropped file + its leg) on any drop. Fail-closed: if a log cannot be fetched, exit
 * non-zero rather than certify clean from a surface it never read — the exact false-clean the gate kills.
 */
async function main() {
    const repo  = process.env.GITHUB_REPOSITORY,
          runId = process.env.GITHUB_RUN_ID,
          token = process.env.GITHUB_TOKEN;

    if (!repo || !runId || !token) {
        console.error('check-codeql-extraction: GITHUB_REPOSITORY, GITHUB_RUN_ID and GITHUB_TOKEN are required (run inside a needs:analyze guard job).');
        process.exit(2)
    }

    let legs;
    try {
        legs = await fetchAnalyzeJobLogs({repo, runId, token})
    } catch (error) {
        console.error(`check-codeql-extraction: could not read an Analyze-leg log — refusing to certify clean from an unread surface.\n  ${error.message}`);
        process.exit(2)
    }

    const {hasErrors, dropped, legCount} = summarizeExtractionAcrossLegs(legs);

    if (hasErrors) {
        console.error(`❌ CodeQL dropped source file(s) for parse errors across ${legCount} Analyze leg(s) — scanning coverage was silently lost:`);
        dropped.forEach(({leg, file}) => console.error(
            file ? `   • [${leg}] ${file}` : `   • [${leg}] (group header present; per-file names not parsed — open the leg's log)`
        ));
        console.error('\nA file CodeQL cannot parse emits ZERO alerts and clears the alert-gate clean, so this never surfaces as a security finding. Fix the parse error (or explicitly exclude the file) so coverage is honest.');
        process.exit(1)
    }

    console.log(`✅ CodeQL extraction clean — no files dropped across ${legCount} Analyze leg(s).`)
}

// only run the CLI when invoked directly, so the spec can import the pure parser without side effects
// (dependency-free — Node built-ins + global fetch only, so the guard job needs no npm install)
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
    await main()
}
