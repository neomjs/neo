/**
 * @module ai/scripts/lifecycle/nightlyE2eDigest
 * @summary Pure parse/format core for the nightly whitebox-e2e runner (ticket-ref-ok: #14685 owning-leaf anchor).
 *
 * Service-free by design: the runner (`nightlyE2eRunner.mjs`) owns the I/O — spawn playwright, read the json
 * report, send the A2A digest — while this module is the pure projection it delegates to: walk a Playwright json
 * report into actionable failure pointers, and format the red digest. Keeping it free of the memory-core service
 * imports is what lets the digest logic unit-test in isolation (no GraphService / LifecycleService boot).
 * @plane in-plane
 */

/**
 * @summary Walks a Playwright json report and collects every failed spec as an actionable pointer. A spec is
 * failing when it is not `ok` (Playwright sets `ok:false` for unexpected outcomes). Returns the spec title, its
 * `file:line`, and the FIRST error line (no full stack — the digest points, the owner opens the log).
 * @param {Object} report Parsed Playwright `json` reporter output.
 * @returns {Object[]} failing specs — each `{title, location, firstError}`.
 */
export function collectFailures(report) {
    const failures = [];

    const walk = suite => {
        for (const spec of suite.specs || []) {
            if (spec.ok === false) {
                const result    = spec.tests?.[0]?.results?.find(r => r.status !== 'passed' && r.status !== 'skipped') || spec.tests?.[0]?.results?.[0],
                      rawError  = result?.errors?.[0]?.message || result?.error?.message || 'no error message captured',
                      firstLine = String(rawError).split('\n').find(line => line.trim().length > 0)?.trim() || 'no error message captured';

                failures.push({
                    title     : spec.title,
                    location  : `${spec.file || suite.file || '?'}:${spec.line ?? '?'}`,
                    firstError: firstLine.length > 240 ? `${firstLine.slice(0, 240)}…` : firstLine
                });
            }
        }
        for (const child of suite.suites || []) walk(child);
    };

    for (const suite of (report?.suites || [])) walk(suite);
    return failures;
}

/**
 * @summary Reduces per-config outcomes to the red/green verdict: red when any config has a failing spec OR did
 * not cleanly run (an infra/boot failure with no report is a red, never swallowed as green).
 * @param {Object[]} outcomes per-config outcomes, each `{config, failures, ran, note}`.
 * @returns {Boolean} `true` when the run must digest.
 */
export function isRed(outcomes) {
    return (outcomes || []).some(outcome => (outcome.failures?.length || 0) > 0 || outcome.ran === false);
}

/**
 * @summary Formats the red digest markdown: per-config failing specs + first errors + the run-log path, so it is
 * actionable without thread archaeology. Only red/non-clean configs are listed; clean-green configs stay silent.
 * @param {Object[]} outcomes per-config outcomes, each `{config, failures, ran, note}`.
 * @param {String} logPath the run-log path.
 * @returns {String} digest body.
 */
export function formatDigest(outcomes, logPath) {
    const lines = ['Nightly whitebox-e2e run surfaced RED. Red-as-pointer — owners fix, this digest only points.', ''];

    for (const outcome of (outcomes || [])) {
        if ((outcome.failures?.length || 0) === 0 && outcome.ran !== false && !outcome.note) continue;

        lines.push(`**\`${outcome.config}\`** — ${outcome.failures?.length || 0} failing${outcome.note ? ` · ${outcome.note}` : ''}`);
        for (const failure of (outcome.failures || [])) {
            lines.push(`- \`${failure.location}\` — ${failure.title}: ${failure.firstError}`);
        }
        lines.push('');
    }

    lines.push(`Run log: \`${logPath}\``);
    return lines.join('\n');
}

/**
 * @summary Assembles the per-run log body from each config's captured runner output — the concrete file the
 * digest's `Run log:` pointer resolves to. Pure (outcomes → string); the runner writes the returned body and
 * creates the log dir. Backed by real captured output so a red/infra-red digest can never point at a phantom
 * file — the failure mode this closes.
 * @param {Object[]} outcomes per-config outcomes, each optionally carrying `{config, note, output}`.
 * @param {String} [at=''] ISO timestamp of the run, headlined at the top of the log.
 * @returns {String} the run-log body.
 */
export function buildRunLog(outcomes, at = '') {
    const sections = [`# Nightly whitebox-e2e run ${at}`.trimEnd(), ''];

    for (const outcome of (outcomes || [])) {
        sections.push(`## ${outcome.config}${outcome.note ? ` — ${outcome.note}` : ''}`);
        sections.push(outcome.output ? String(outcome.output).trimEnd() : '(no captured output)');
        sections.push('');
    }

    return sections.join('\n');
}
