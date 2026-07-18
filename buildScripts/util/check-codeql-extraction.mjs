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
 * @summary I/O wrapper: fetch the completed Analyze job's raw log for this run via the Actions API.
 * Runs inside a `needs: analyze` guard job, so the Analyze job has finished and its log is available.
 * @param {Object} params
 * @param {String} params.repo `owner/name` (`GITHUB_REPOSITORY`).
 * @param {String|Number} params.runId `GITHUB_RUN_ID`.
 * @param {String} params.token `GITHUB_TOKEN` with `actions:read`.
 * @param {RegExp} [params.jobNameMatch=/Analyze/] Match for the CodeQL analyze job's name (matrixed
 *     names like `Analyze (javascript)` are covered).
 * @returns {Promise<String>} the Analyze job's raw log text.
 */
export async function fetchAnalyzeJobLog({repo, runId, token, jobNameMatch = /Analyze/}) {
    const base    = 'https://api.github.com',
          headers = {Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28'};

    const jobsRes = await fetch(`${base}/repos/${repo}/actions/runs/${runId}/jobs?per_page=100`, {headers});
    if (!jobsRes.ok) throw new Error(`fetch run jobs failed: ${jobsRes.status} ${jobsRes.statusText}`);

    const {jobs = []} = await jobsRes.json(),
          analyze     = jobs.find(job => jobNameMatch.test(job.name));
    if (!analyze) throw new Error(`no job matching ${jobNameMatch} in run ${runId} (jobs: ${jobs.map(j => j.name).join(', ')})`);

    const logRes = await fetch(`${base}/repos/${repo}/actions/jobs/${analyze.id}/logs`, {headers, redirect: 'follow'});
    if (!logRes.ok) throw new Error(`fetch Analyze job log failed: ${logRes.status} ${logRes.statusText}`);

    return logRes.text()
}

/**
 * @summary CLI entry: fetch the Analyze log, run the pure parser, exit non-zero (naming the files) on
 * any dropped file. Fail-closed: if the log cannot be fetched, exit non-zero rather than certify clean
 * from a surface it never read — a silent pass here is exactly the false-clean the gate exists to kill.
 */
async function main() {
    const repo  = process.env.GITHUB_REPOSITORY,
          runId = process.env.GITHUB_RUN_ID,
          token = process.env.GITHUB_TOKEN;

    if (!repo || !runId || !token) {
        console.error('check-codeql-extraction: GITHUB_REPOSITORY, GITHUB_RUN_ID and GITHUB_TOKEN are required (run inside a needs:analyze guard job).');
        process.exit(2)
    }

    let log;
    try {
        log = await fetchAnalyzeJobLog({repo, runId, token})
    } catch (error) {
        console.error(`check-codeql-extraction: could not read the Analyze-job log — refusing to certify clean from an unread surface.\n  ${error.message}`);
        process.exit(2)
    }

    const {hasErrors, files, groupMarkerSeen} = findCodeqlExtractionErrors(log);

    if (hasErrors) {
        console.error('❌ CodeQL dropped source file(s) for parse errors — scanning coverage was silently lost:');
        files.forEach(file => console.error(`   • ${file}`));
        if (groupMarkerSeen && !files.length) {
            console.error('   (extractor group header present; per-file names not parsed — open the Analyze job log for the list)')
        }
        console.error('\nA file CodeQL cannot parse emits ZERO alerts and clears the alert-gate clean, so this never surfaces as a security finding. Fix the parse error (or explicitly exclude the file) so coverage is honest.');
        process.exit(1)
    }

    console.log('✅ CodeQL extraction clean — no files dropped for parse errors.')
}

// only run the CLI when invoked directly, so the spec can import the pure parser without side effects
// (dependency-free — Node built-ins + global fetch only, so the guard job needs no npm install)
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
    await main()
}
