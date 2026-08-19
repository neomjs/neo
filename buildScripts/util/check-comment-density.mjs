#!/usr/bin/env node
/**
 * @summary Warns when a commit's ADDED lines are mostly prose, on two independent axes.
 *
 * Comments are read substrate twice over: a maintainer pays on every visit, and the text is ingested
 * into the Knowledge Base, where a long derivation dilutes the invariant it wraps and then competes
 * with it for retrieval. Neither cost is visible at authoring time, and no other check measures it —
 * `check-ticket-archaeology` governs decay-prone refs, `check-substrate-size` governs turn-loaded
 * bytes.
 *
 * **Two axes, because a share alone has an author-controlled denominator.** A commit adding 200 lines
 * of fixture dilutes a 36-line docblock to 21%, so adding tests buys room for narrative. The longest
 * contiguous prose run has no denominator to dilute.
 *
 * **Warn, never block.** A hard gate would breed suppression markers, and then the markers are the
 * bloat. The number exists to make an author look; whether a comment is DESERVED is not computable —
 * an invariant survives the incident that taught it, a derivation does not.
 *
 * @module buildScripts/util/check-comment-density
 */

import {execFileSync}        from 'node:child_process';
import {readFileSync}        from 'node:fs';
import path                  from 'node:path';
import {fileURLToPath}       from 'node:url';
import {extractComment}      from './check-ticket-archaeology.mjs';
import {getStagedAddedLines} from './stagedDiff.mjs';

const __dirname  = path.dirname(fileURLToPath(import.meta.url)),
      scriptRoot = path.resolve(__dirname, '../..');

/**
 * Directories whose added lines are measured. Specs are included because prose in a spec is read as
 * often as prose in a service, and `buildScripts/` because a checker exempt from its own rule is not a
 * rule. Excluding either would restore the denominator loophole this check exists to close.
 * @type {String[]}
 */
export const DEFAULT_SCAN_PATHS = ['ai/', 'src/', 'test/', 'buildScripts/'];

/**
 * `maxProseRun` sits inside the measured p90–p99 band for this repo's files, so a warning means
 * "unusual" rather than "long". `maxProseShare` is the operator's ~30% observation.
 * @type {{maxProseShare: Number, maxProseRun: Number}}
 */
export const DEFAULT_BOUNDS = Object.freeze({maxProseShare: 0.3, maxProseRun: 34});

/**
 * @summary Whether a comment's text is a type contract rather than prose.
 *
 * JSDoc tag lines are the contract, not the narrative. Counting them as prose makes a densely-typed
 * signature read as bloat, at which point the number stops being actionable.
 * @param {String} comment Comment text for one line (as returned by `extractComment`).
 * @returns {Boolean}
 */
export function isTagLine(comment) {
    return /^[\s*]*@\w/.test(comment)
}

/**
 * @summary Whether a comment line is prose rather than a delimiter or a type contract.
 *
 * A `/**` opener extracts as `*` and a `*\/` closer as whitespace; counting either would score a
 * two-line docblock the same as a four-line one. Prose needs an actual word.
 * @param {String} comment Comment text for one line.
 * @returns {Boolean}
 */
export function isProseLine(comment) {
    return /\w/.test(comment) && !isTagLine(comment)
}

/**
 * @summary Measures prose share and the longest contiguous prose run over a file's ADDED lines.
 *
 * Every line is walked so block-comment state stays correct, but only lines in `addedLines` are
 * counted — a docblock that already existed is not this commit's prose. A run is broken by a
 * non-prose added line, by a tag line, and by any unchanged line, since prose split by untouched
 * code is not one block.
 *
 * @param {String[]} lines The file's full content, split by line.
 * @param {Set<Number>} addedLines 1-based line numbers this commit adds.
 * @returns {{added: Number, prose: Number, longestRun: Number}}
 */
export function measureProseDensity(lines, addedLines) {
    const state = {inBlock: false};

    let added = 0, prose = 0, run = 0, longestRun = 0;

    lines.forEach((line, index) => {
        const comment = extractComment(line, state),
              isAdded = addedLines.has(index + 1);

        if (!isAdded) {
            run = 0;
            return
        }

        added++;

        if (isProseLine(comment)) {
            prose++;
            run++;
            longestRun = Math.max(longestRun, run)
        } else {
            run = 0
        }
    });

    return {added, prose, longestRun}
}

/**
 * @summary Folds per-file measurements into the commit-level verdict.
 *
 * The share is summed across files because a commit is the unit a hook can see; the run is a maximum
 * because a run is contiguous within one file and never spans two.
 * @param {Object[]} files `[{file, added, prose, longestRun}]`.
 * @param {{maxProseShare: Number, maxProseRun: Number}} [bounds=DEFAULT_BOUNDS]
 * @returns {{added: Number, prose: Number, share: Number, longestRun: Number, worstFile: (String|null), shareExceeded: Boolean, runExceeded: Boolean, warn: Boolean}}
 */
export function summarizeDensity(files = [], bounds = DEFAULT_BOUNDS) {
    const {maxProseShare, maxProseRun} = {...DEFAULT_BOUNDS, ...(bounds ?? {})},
          rows                         = Array.isArray(files) ? files : [],
          added                        = rows.reduce((total, row) => total + (row?.added ?? 0), 0),
          prose                        = rows.reduce((total, row) => total + (row?.prose ?? 0), 0),
          worst                        = rows.reduce((best, row) => (row?.longestRun ?? 0) > (best?.longestRun ?? 0) ? row : best, null),
          share                        = added > 0 ? prose / added : 0,
          longestRun                   = worst?.longestRun ?? 0,
          shareExceeded                = added > 0 && share > maxProseShare,
          runExceeded                  = longestRun > maxProseRun;

    return {
        added,
        prose,
        share,
        longestRun,
        worstFile: runExceeded ? (worst?.file ?? null) : null,
        shareExceeded,
        runExceeded,
        warn     : shareExceeded || runExceeded
    }
}

/**
 * @summary Formats the warning. Both raw numbers are printed, never only a verdict — an author who
 * cannot see the ratio cannot tell whether the fix is trimming prose or that the commit is small.
 * @param {Object} summary From {@link summarizeDensity}.
 * @param {{maxProseShare: Number, maxProseRun: Number}} [bounds=DEFAULT_BOUNDS]
 * @returns {String}
 */
export function formatDensityWarning(summary, bounds = DEFAULT_BOUNDS) {
    const {maxProseShare, maxProseRun} = {...DEFAULT_BOUNDS, ...(bounds ?? {})},
          lines                        = [
              `check-comment-density: ${summary.prose} of ${summary.added} added lines are prose ` +
              `(${Math.round(summary.share * 100)}%, bar ${Math.round(maxProseShare * 100)}%); ` +
              `longest contiguous run ${summary.longestRun} (bar ${maxProseRun}).`
          ];

    if (summary.runExceeded && summary.worstFile) {
        lines.push(`  longest run in ${summary.worstFile}`)
    }

    lines.push('  Comments must be deserved: would this sentence still be true and useful if the bug had never happened?');
    lines.push('  An invariant survives the incident. A derivation belongs in the ticket, which closes; a comment never does.');

    return lines.join('\n')
}

/**
 * @summary Whether a staged path is measured.
 * @param {String} file Repo-relative path.
 * @param {String[]} [scanPaths=DEFAULT_SCAN_PATHS]
 * @returns {Boolean}
 */
export function isInScopePath(file, scanPaths = DEFAULT_SCAN_PATHS) {
    return file.endsWith('.mjs') && scanPaths.some(prefix => file.startsWith(prefix))
}

function main() {
    let gitRoot;

    try {
        gitRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], {cwd: scriptRoot, encoding: 'utf-8'}).trim()
    } catch {
        return 0 // not a work tree — nothing to measure, never a failure
    }

    const staged = execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR'], {cwd: gitRoot, encoding: 'utf-8'})
        .split('\n')
        .map(line => line.trim())
        .filter(file => file.length > 0 && isInScopePath(file));

    const files = [];

    for (const file of staged) {
        const addedLines = getStagedAddedLines(file, gitRoot);

        if (!addedLines || addedLines.size === 0) continue;

        let content;

        try {
            content = readFileSync(path.join(gitRoot, file), 'utf-8')
        } catch {
            continue // a staged deletion or an unreadable path measures nothing
        }

        files.push({file, ...measureProseDensity(content.split('\n'), addedLines)})
    }

    const summary = summarizeDensity(files);

    if (summary.warn) {
        console.warn(formatDensityWarning(summary))
    }

    return 0 // advisory by design
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
    process.exit(main())
}
