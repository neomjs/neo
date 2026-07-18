import {test, expect}                                                                       from '@playwright/test';
import {findCodeqlExtractionErrors, summarizeExtractionAcrossLegs, EXTRACTION_GROUP_MARKER} from '../../../../../../buildScripts/util/check-codeql-extraction.mjs';

/**
 * @summary The discriminating heart of the CodeQL extraction gate: given the raw Analyze-job
 * log, does the pure parser detect a DROPPED file (the extractor's own verdict) and name it? These
 * pin that the group header alone fails the gate even when per-file names don't parse (a dropped file
 * must never pass silently), that a per-file line without the header still fails (format drift), and
 * that a benign "parse error" mention does NOT false-positive on a clean tree.
 *
 * The I/O half (fetching the Analyze-job log) is proven by the PR's own red-proof CI run per the
 * ticket's red-proof AC (a deliberately-unparseable file turns the gate red; removing it turns it green); the
 * fetch cannot be meaningfully unit-tested without mocking the whole Actions API.
 */
test.describe('buildScripts/util/check-codeql-extraction — findCodeqlExtractionErrors (#15370)', () => {
    // Actions prepends an ISO timestamp + a stream tag to every log line; the fixtures carry it so the
    // parser is proven to tolerate the real prefix, not a stripped ideal.
    const ts = '2026-07-18T09:11:17.1234567Z [build-stdout] ';

    test('a clean Analyze log → no errors, no files (the common case must not false-positive)', () => {
        const log = `${ts}Running CodeQL analysis.\n${ts}Finalizing database.\n${ts}Analysis produced 15 results.\n`;

        expect(findCodeqlExtractionErrors(log)).toEqual({hasErrors: false, files: [], groupMarkerSeen: false})
    });

    test('the group header + per-file bullets → fails, naming every dropped file', () => {
        // the REAL CodeQL format, verified against run 29568877624 (the pre-fix drop): a `##[group]`
        // header line, then one `  * <repo-relative-path>#L<line>C<col>:<col>: A parse error occurred` bullet
        // per dropped file — repo-relative paths, location suffix, NOT a `Could not process <path>:` line.
        const log =
            `${ts}Running CodeQL analysis.\n` +
            `${ts}##[group]${EXTRACTION_GROUP_MARKER} (2 results)\n` +
            `${ts}  * ai/scripts/benchmark/serving-cost-meter.mjs#L309C7:7: A parse error occurred: \`Unexpected token\`. Check the syntax of the file.\n` +
            `${ts}  * apps/foo/Bar.mjs#L12C1:1: A parse error occurred: \`Unexpected token\`.\n`;

        const result = findCodeqlExtractionErrors(log);

        expect(result.hasErrors).toBe(true);
        expect(result.groupMarkerSeen).toBe(true);
        expect(result.files).toEqual([
            'ai/scripts/benchmark/serving-cost-meter.mjs',
            'apps/foo/Bar.mjs'
        ])
    });

    test('detects + names the drop in a VERBATIM real CodeQL log (run 29568877624 — the pre-#15353 scan)', () => {
        // copied byte-for-byte from the real Analyze-job log of the run that dropped serving-cost-meter.mjs
        // yet "succeeded" with analyses[].warning empty — the exact false-clean this gate closes.
        const log =
            `${ts}##[group]Could not process some files due to syntax errors (1 result)\n` +
            `${ts}  * ai/scripts/benchmark/serving-cost-meter.mjs#L309C7:7: A parse error occurred: \`Unexpected token\`. Check the syntax of the file. If the file is invalid, correct the error or [exclude](https://docs.github.com/en/code-security) the file from analysis.\n` +
            `${ts}##[endgroup]\n`;

        expect(findCodeqlExtractionErrors(log)).toEqual({
            hasErrors: true, groupMarkerSeen: true, files: ['ai/scripts/benchmark/serving-cost-meter.mjs']
        })
    });

    test('the group header ALONE (per-file format drifted) still fails — a dropped file never passes for want of a parsed name', () => {
        const log = `${ts}${EXTRACTION_GROUP_MARKER}:\n${ts}[some future format we did not anticipate]\n`;

        const result = findCodeqlExtractionErrors(log);

        // the authoritative signal is the header; correctness must not depend on the per-file regex
        expect(result.hasErrors).toBe(true);
        expect(result.groupMarkerSeen).toBe(true);
        expect(result.files).toEqual([])
    });

    test('a per-file bullet WITHOUT the group header still fails (header-format drift, other direction)', () => {
        const log = `${ts}  * src/Weird.mjs#L5C1:1: A parse error occurred: \`Unexpected token\`\n`;

        const result = findCodeqlExtractionErrors(log);

        expect(result.hasErrors).toBe(true);
        expect(result.groupMarkerSeen).toBe(false);
        expect(result.files).toEqual(['src/Weird.mjs'])
    });

    test('a benign "parse error" mention does NOT false-positive (discriminating: not every parse-error string is a drop)', () => {
        const log =
            `${ts}Fixed a parse error in the query compiler.\n` +
            `${ts}note: the extractor recovered from a parse error and continued.\n` +
            `${ts}Analysis produced 15 results.\n`;

        expect(findCodeqlExtractionErrors(log)).toMatchObject({hasErrors: false, files: []})
    });

    test('total on empty / null / undefined input (no throw)', () => {
        for (const input of ['', null, undefined]) {
            expect(findCodeqlExtractionErrors(input), `input=${String(input)}`).toEqual({hasErrors: false, files: [], groupMarkerSeen: false})
        }
    });

    test('duplicate per-file bullets collapse (a file reported twice is named once)', () => {
        const line = `${ts}  * src/Dup.mjs#L1C1:1: A parse error occurred: \`Unexpected token\`\n`;

        expect(findCodeqlExtractionErrors(line + line).files).toEqual(['src/Dup.mjs'])
    });

    // --- summarizeExtractionAcrossLegs: matrix-robust aggregation (Euclid's matrix-false-clean finding) ---

    const cleanLog = `${ts}Running CodeQL analysis.\n`;
    const dropLog  = file => `${ts}##[group]${EXTRACTION_GROUP_MARKER} (1 result)\n${ts}  * ${file}#L1C1:1: A parse error occurred: \`Unexpected token\`\n`;

    test('all matrix legs clean → no errors, legCount counted', () => {
        const legs = [{name: 'Analyze (javascript)', log: cleanLog}, {name: 'Analyze (python)', log: cleanLog}];

        expect(summarizeExtractionAcrossLegs(legs)).toEqual({hasErrors: false, dropped: [], legCount: 2})
    });

    test('a drop in a NON-first leg is caught — the matrix-shaped false-clean the `find`-first form missed', () => {
        // js clean, python drops, go clean: certifying only the first (js) leg would pass this falsely
        const legs = [
            {name: 'Analyze (javascript)', log: cleanLog},
            {name: 'Analyze (python)',     log: dropLog('ai/x.py')},
            {name: 'Analyze (go)',         log: cleanLog}
        ];
        const result = summarizeExtractionAcrossLegs(legs);

        expect(result.hasErrors).toBe(true);
        expect(result.dropped).toEqual([{leg: 'Analyze (python)', file: 'ai/x.py'}]);
        expect(result.legCount).toBe(3)
    });

    test('drops in MULTIPLE legs aggregate, each tagged with its leg', () => {
        const legs = [
            {name: 'Analyze (javascript)', log: dropLog('src/a.mjs')},
            {name: 'Analyze (python)',     log: dropLog('ai/b.py')}
        ];

        expect(summarizeExtractionAcrossLegs(legs).dropped).toEqual([
            {leg: 'Analyze (javascript)', file: 'src/a.mjs'},
            {leg: 'Analyze (python)',     file: 'ai/b.py'}
        ])
    });

    test('a leg with the group header but unparsed per-file bullets still fails, file:null tagged to the leg', () => {
        const legs   = [{name: 'Analyze (javascript)', log: `${ts}##[group]${EXTRACTION_GROUP_MARKER} (1 result)\n${ts}[drifted format]\n`}];
        const result = summarizeExtractionAcrossLegs(legs);

        expect(result.hasErrors).toBe(true);
        expect(result.dropped).toEqual([{leg: 'Analyze (javascript)', file: null}])
    });

    test('empty / non-array legs → no errors, total (never throws certifying an unread matrix)', () => {
        expect(summarizeExtractionAcrossLegs([])).toEqual({hasErrors: false, dropped: [], legCount: 0});
        expect(summarizeExtractionAcrossLegs(undefined)).toEqual({hasErrors: false, dropped: [], legCount: 0})
    })
});
