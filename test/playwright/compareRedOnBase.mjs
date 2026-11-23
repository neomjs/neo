/**
 * @module test/playwright/compareRedOnBase
 * @summary Compares changed Playwright specs against head and base source without confusing load errors with proof.
 */

/**
 * @summary Resolves a reporter path to the repository's unit-spec path on either platform.
 * @param {String} file
 * @returns {String}
 */
function specPath(file) {
    const normalized = file.replaceAll('\\', '/'),
          marker     = 'test/playwright/unit/';

    if (normalized.includes(marker)) return normalized.slice(normalized.indexOf(marker));
    if (normalized.startsWith('/')) return normalized;
    return `${marker}${normalized}`
}

/**
 * @summary Flattens nested suites into stable project/file/title keys; line numbers remain annotation metadata only.
 * @param {Object} report A parsed Playwright JSON report.
 * @returns {Map}
 */
export function indexReport(report) {
    if (!report || !Array.isArray(report.suites) || !Array.isArray(report.errors)) {
        throw new Error('Expected a Playwright JSON report with suites and errors arrays')
    }

    const rows = new Map();
    const walk = (suite, parents = [], isFile = false) => {
        // File suites contribute a path, not a title. Nested describes contribute their titles.
        const titles = isFile ? [] : [...parents, suite.title];
        for (const spec of suite.specs || []) {
            for (const test of spec.tests || []) {
                const file           = specPath(spec.file || suite.file),
                      titlePath      = [...titles, spec.title],
                      key            = JSON.stringify([test.projectName || '', file, titlePath]),
                      statuses       = (test.results || []).map(result => result.status),
                      passed         = test.status === 'expected' && statuses.includes(test.expectedStatus || 'passed'),
                      unexpectedPass = test.status === 'unexpected' && statuses.includes('passed');

                rows.set(key, {
                    key, file, titlePath, project: test.projectName || '', line: spec.line,
                    status: passed ? 'passed' : unexpectedPass || statuses.includes('failed') || statuses.includes('timedOut') ? 'failed' : 'not-run'
                });
            }
        }
        for (const child of suite.suites || []) walk(child, titles)
    };
    for (const suite of report.suites) walk(suite, [], true);
    return rows
}

/**
 * @summary Compares outcomes and discovers new title paths from the base's own listed specs.
 * @param {Object} head Report from head specs and head source.
 * @param {Object} base Report from head specs and restored base source.
 * @param {Object} original Report listing the base's own spec titles.
 * @param {String[]} [addedFiles=[]] Specs absent from the base tree are unconditionally new.
 * @returns {Object[]} One row per head test, with explicit inconclusive outcomes for skipped/head-failing arms.
 */
export function compareRedOnBase(head, base, original, addedFiles = []) {
    const headRows     = indexReport(head),
          baseRows     = indexReport(base),
          originalRows = indexReport(original);

    const hasErrors = (report, file) => report.errorFiles ? report.errorFiles.includes(file) : report.errors.length > 0;
    return [...headRows.values()].map(row => {
        const baseStatus = baseRows.get(row.key)?.status || (hasErrors(base, row.file) ? 'load-error' : 'not-run'),
              isNew      = addedFiles.includes(row.file) || (hasErrors(original, row.file) ? null : !originalRows.has(row.key));
        let classification = 'inconclusive';

        if (baseStatus === 'load-error') classification = 'cannot-load';
        else if (row.status === 'passed' && baseStatus === 'failed') classification = 'fails-without-change';
        else if (row.status === 'passed' && baseStatus === 'passed') classification = 'passes-both';

        return {...row, headStatus: row.status, baseStatus, isNew, classification}
    })
}

/**
 * @summary Escapes untrusted test text before emitting a GitHub workflow command.
 * @param {String} value
 * @returns {String}
 */
function commandText(value) {
    return String(value).replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A')
}

/**
 * @summary Renders advisory warnings only for tests known to be new and passing both ways.
 * @param {Object[]} rows
 * @returns {String[]}
 */
export function redOnBaseWarnings(rows) {
    return rows.filter(row => row.isNew === true && row.classification === 'passes-both').map(row => {
        const file = commandText(row.file).replaceAll(':', '%3A').replaceAll(',', '%2C');
        return `::warning file=${file},line=${Number(row.line) || 1}::${commandText(row.titlePath.join(' › '))} passes with and without the source change.`
    })
}

/**
 * @summary Renders every new test with both results and counts the remaining tests per file and class.
 * @param {Object[]} rows
 * @returns {String}
 */
export function redOnBaseSummary(rows) {
    const cell = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;').replaceAll('|', '&#124;').replaceAll('\n', ' ').replaceAll('\r', ' '),
          lines = ['## Red on base (advisory)', '', '| New test | Head | Base | Classification |', '|---|---|---|---|'];

    for (const row of rows.filter(row => row.isNew === true)) {
        lines.push(`| ${cell(`${row.file}:${row.line} ${row.project} ${row.titlePath.join(' › ')}`)} | ${row.headStatus} | ${row.baseStatus} | ${row.classification} |`)
    }
    lines.push('', '### Other tests', '', '| File | Classification | Count |', '|---|---|---|');
    const counts = new Map();
    for (const row of rows.filter(row => row.isNew !== true)) {
        const key = JSON.stringify([row.file, row.classification]);
        counts.set(key, (counts.get(key) || 0) + 1)
    }
    for (const [key, count] of counts) {
        const [file, classification] = JSON.parse(key);
        lines.push(`| ${cell(file)} | ${classification} | ${count} |`)
    }
    if (rows.some(row => row.isNew === null)) {
        lines.push('', 'Base spec discovery had load errors: novelty is unknown for existing files; no warnings are emitted for those tests.')
    }
    lines.push('', 'Skipped or head-failing tests are inconclusive, never evidence for the fix.');
    return lines.join('\n') + '\n'
}
