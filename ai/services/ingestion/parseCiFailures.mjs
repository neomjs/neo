/**
 * @module Neo.ai.services.ingestion.parseCiFailures
 * @summary Pure file-level dedup of CI test failures — slice 1 of the Autonomous CI Failure Triaging
 * lane. Per the file-level-dedup design: a cascading failure (one structural break → many failing tests
 * across a file) collapses to ONE entry per failing spec-file, keeping the tracker's signal-to-noise
 * clean. The graph-check ("does this file have an OPEN ticket bound?") + the ticket-create + the report
 * fetch are the integration's; this slice is the pure parse only.
 */

/**
 * @summary Extracts the unique failing spec-file paths from a Playwright JSON report. The report shape
 * (the `reporter: [['json', ...]]` output, V-B-A'd against a live run) is nested `suites[]` each with
 * `specs[]` carrying `spec.ok` (boolean) + `spec.file` (path); suites nest via `suite.suites[]`. A spec
 * is failing when `spec.ok === false`. File-level deduped via a Set, so N failing tests in one file
 * yield ONE path (the dedup key the downstream graph-check binds to). Accepts the parsed report object
 * OR the raw JSON string. Total — a non-object / unparseable / shapeless input returns `[]` (it runs in
 * an ingestion path where a throw would abort the triage sweep, so a total function is the contract).
 * @param {(Object|String)} report The Playwright JSON report — parsed object or raw JSON string.
 * @returns {String[]} The unique failing spec-file paths (the file-level dedup keys).
 */
export function parseCiFailures(report) {
    let parsed = report;

    if (typeof report === 'string') {
        try {
            parsed = JSON.parse(report);
        } catch {
            return [];
        }
    }

    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.suites)) {
        return [];
    }

    const failing = new Set();

    const walk = suites => {
        for (const suite of suites) {
            if (!suite || typeof suite !== 'object') continue;

            for (const spec of (Array.isArray(suite.specs) ? suite.specs : [])) {
                if (spec && spec.ok === false && typeof spec.file === 'string') {
                    failing.add(spec.file);
                }
            }

            if (Array.isArray(suite.suites)) walk(suite.suites);
        }
    };

    walk(parsed.suites);

    return [...failing];
}
