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
import {getStagedAddedLines, parseAddedLines} from './stagedDiff.mjs';

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
 * Both bars are the **p90 of the seats whose behaviour did not change**, which is the one reference a
 * threshold can be anchored to without drifting along with what it measures. A trailing median follows
 * the engine up; a pre-regression distribution does not move and is already in the repository.
 *
 * Measured per commit over `origin/dev`, commits with ≥ 20 added in-scope lines, two independent flat
 * controls landing on the same numbers:
 *
 * | | p90 Opus 4.8 (n=552) | p90 Fable (n=162) | bar | fire rate now (n=92) | fire rate, controls |
 * |---|---|---|---|---|---|
 * | block run | 34 | 35 | **35** | 20.7% | 10.0% / 10.5% |
 * | prose share | 31.9% | 28.5% | **30%** | 34.8% | 12.9% / 9.3% |
 *
 * A warning therefore means "top decile of the seats that were not part of the change". The share axis
 * is the more gameable of the two, since its denominator is author-controlled, which is what the run
 * axis covers.
 * @type {{maxProseShare: Number, maxProseRun: Number}}
 */
export const DEFAULT_BOUNDS = Object.freeze({maxProseShare: 0.3, maxProseRun: 35});

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
 * Deferral vocabulary: prose that records work still owed. A `To Do: 0` census across 755 Brain files
 * is not cleanliness — the debt is written as essays, where no tool looks.
 *
 * The vocabulary is AUTHORIAL STANCE only, because a wider one was measured and rejected. A first
 * draft added `deferred`, `not yet`, `follow-up` and `TBD`; over 2564 in-scope files those four
 * carried 326 of 458 total hits and almost none were deferrals — `deferred` is this repo's own
 * scheduler noun (`0 updated, 30 deferred` per pass), `not yet` describes runtime state (`not yet
 * POSTed`, `not yet hydrated`), and `follow-up` names sequences that already exist. Precision, not
 * recall, is what a warning nobody silences has to buy: the markers kept fire 33 times and read as
 * confessions on inspection ("Pass generic env for now", "For now, assume user base").
 * @type {RegExp}
 */
export const CONFESSION_MARKERS = /\b(for now|left alone|would be nice|should really|come back to|revisit|ideally)\b/i;

/**
 * Unticketed-work markers in MARKER form — a colon, a paren, or the end of the token — never the
 * English word. Bare `todo` matched 90 lines, most of them prose about obligations — one reads
 * `an announcement becomes someone else's todo`. The marker form matched 14, every one real.
 * @type {RegExp}
 */
export const TODO_MARKERS = /(?:^|[^\w])(?:TODO|FIXME|XXX|HACK)(?=[:(\s]|$)/;

/**
 * Prose that DECIDES rather than defers: a rationale is attached and nothing is owed.
 *
 * Deliberately NOT including "deliberately": *"worthwhile and deliberately left alone"* is the census
 * specimen this vocabulary was built on — a known consolidation, reasoned, unticketed. A deferral
 * asserting its own intent is still a deferral, and exempting the word would exempt the best-dressed
 * confessions.
 * @type {RegExp}
 */
export const DECIDED_MARKERS = /\b(intentionally|on purpose|by design)\b/i;

/**
 * A bound obligation: an escape marker, or a ticket reference. Either means the debt has an owner
 * somewhere a reader can follow, so the comment is not the only record.
 *
 * The two arms have UNEQUAL reach, which the remedy text depends on. `check-ticket-archaeology` scans
 * `ai`, `src`, `test/playwright` and rejects a bare `#\d{4,}` on a new comment line there, so in those
 * roots the second arm only ever fires on lines the escape marker already covers — it is independently
 * live under `buildScripts/` alone. The warning therefore names the marker: suggesting a bare `#N`
 * would hand an author a fix another guard blocks.
 * @type {RegExp}
 */
export const BOUND_OBLIGATION = /ticket-ref-ok|#\d{4,}/;

/**
 * @summary Drops quoted spans, so a marker being MENTIONED is not read as a marker being USED.
 *
 * Any file documenting deferral vocabulary quotes the markers as examples, and quoting one is not
 * owing work.
 *
 * NOT exhaustive, and callers depend on knowing that: an odd quote count means a span crosses a line
 * boundary, and the trailing drop below covers only the case where it OPENS here. Three quotes on a
 * line can pair wrongly and leave a mention exposed. Deciding that needs quote state carried across
 * lines, which `check-ticket-archaeology` declines to carry too.
 * @param {String} comment Comment text for one line.
 * @returns {String}
 */
export function dropQuotedSpans(comment) {
    const text = (comment ?? '')
        .replace(/"[^"]*"/g, ' ')
        .replace(/`[^`]*`/g, ' ')
        .replace(/'[^']*'/g, ' ')
        .replace(/\*\*[^*]*\*\*/g, ' ');

    return ['"', '`'].reduce((carried, mark) => {
        const parts = carried.split(mark);

        return parts.length % 2 === 0 ? parts.slice(0, -1).join(mark) : carried
    }, text)
}

/**
 * @summary Whether a comment defers work without binding the obligation anywhere.
 *
 * The discriminator is DEFER-vs-DECIDE, not the marker words: a decision with a rationale owes
 * nothing, a deferral owes a ticket. The cost of getting it wrong is asymmetric — a false positive
 * costs one glance, an unticketed debt costs what an unfiled debt costs — so the check errs toward
 * asking.
 *
 * Naming the ticket inside the comment is NOT the remedy: `check-ticket-archaeology` correctly keeps
 * decaying refs out of durable comments. The remedy is that the deferral belongs in a ticket, and the
 * comment describes behaviour.
 * @param {String} rawComment Comment text for one line, quotes intact.
 * @returns {Boolean}
 */
export function isConfession(rawComment) {
    const comment = dropQuotedSpans(rawComment);

    if (BOUND_OBLIGATION.test(comment)) {
        return false
    }

    // A marker is its own admission, so no stance test applies to it: `FIXME` does not become a
    // decision by adding the word "intentionally".
    return TODO_MARKERS.test(comment) || (CONFESSION_MARKERS.test(comment) && !DECIDED_MARKERS.test(comment))
}

/**
 * @summary Whether a line is part of a comment block at all — delimiters included.
 *
 * The run axis measures what a reader faces, and a reader faces the whole block. `extractComment`
 * yields `*` for a `/**` opener and whitespace for a closer, so neither is detectable by text alone.
 * @param {String} line Raw source line.
 * @param {String} comment Its extracted comment text.
 * @returns {Boolean}
 */
function isCommentLine(line, comment) {
    return comment.trim().length > 0 || /^\s*(\/\*|\*\/|\*|\/\/)/.test(line)
}

/**
 * @summary Measures prose share and the longest contiguous ADDED COMMENT run in a file.
 *
 * Every line is walked so block-comment state stays correct, but only lines in `addedLines` are
 * counted — a docblock that already existed is not this commit's. A run is broken by an added line
 * that is not a comment and by any unchanged line, since a block split by untouched code is not one
 * block.
 *
 * The two axes measure DIFFERENT objects on purpose. `prose` excludes tag lines, because a typed
 * signature is contract rather than narration. `longestRun` includes them, because a 45-line docblock
 * is 45 lines to whoever opens the file whether or not `@param` sits in the middle.
 *
 * @param {String[]} lines The file's full content, split by line.
 * @param {Set<Number>} addedLines 1-based line numbers this commit adds.
 * @returns {{added: Number, prose: Number, longestRun: Number, runs: Number[], confessions: Object[]}}
 */
export function measureProseDensity(lines, addedLines) {
    const state = {inBlock: false};

    const confessions = [],
          runs        = [];

    let added = 0, prose = 0, run = 0, longestRun = 0;

    const closeRun = () => {
        if (run > 0) {
            runs.push(run)
        }

        run = 0
    };

    lines.forEach((line, index) => {
        const comment = extractComment(line, state),
              isAdded = addedLines.has(index + 1);

        if (!isAdded) {
            closeRun();
            return
        }

        added++;

        if (!isCommentLine(line, comment)) {
            closeRun();
            return
        }

        run++;
        longestRun = Math.max(longestRun, run);

        if (isProseLine(comment)) {
            prose++;

            if (isConfession(comment)) {
                confessions.push({line: index + 1, text: comment.trim().slice(0, 100)})
            }
        }
    });

    closeRun();

    return {added, prose, longestRun, runs, confessions}
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
          // Reported beside the longest run because a tail-only number misses that the FLOOR rose:
          // across the model boundary the median block went 15 to 23 while the p90 went 34 to 42. A
          // commit of twelve twenty-line blocks never trips the bar and is the thing being described.
          allRuns                      = rows.flatMap(row => row?.runs ?? []).sort((a, b) => a - b),
          medianRun                    = allRuns.length > 0 ? allRuns[Math.floor(allRuns.length / 2)] : 0,
          shareExceeded                = added > 0 && share > maxProseShare,
          runExceeded                  = longestRun > maxProseRun;

    return {
        added,
        prose,
        share,
        longestRun,
        medianRun,
        blocks   : allRuns.length,
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
              `longest contiguous run ${summary.longestRun} (bar ${maxProseRun}), ` +
              `median of ${summary.blocks ?? 0} block(s) ${summary.medianRun ?? 0}.`
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

const ZERO_SHA = '0'.repeat(40);

/**
 * @summary Prints whatever the measurement found: the two density axes, then any deferral prose.
 * @param {Object[]} files Per-file measurements.
 * @returns {void}
 */
function reportDensity(files) {
    const summary     = summarizeDensity(files),
          confessions = files.flatMap(row => (row.confessions || []).map(entry => ({...entry, file: row.file})));

    if (summary.warn) {
        console.warn(formatDensityWarning(summary))
    }

    if (confessions.length > 0) {
        console.warn(`check-comment-density: ${confessions.length} comment(s) defer work without binding it to a ticket:`);
        confessions.slice(0, 10).forEach(entry => console.warn(`  ${entry.file}:${entry.line}  ${entry.text}`));
        console.warn('  A deferral in a comment is a ticket nobody filed. File it, then let the comment describe behaviour.');
        console.warn('  Load-bearing and not a deferral? Say so on the line with a "ticket-ref-ok: <reason>" marker — a bare #ticket is what check-ticket-archaeology rejects.')
    }
}

/**
 * @summary Rev ranges this push will publish, from the pre-push stdin payload.
 *
 * `remoteSha` is the boundary git will apply, so `remoteSha..localSha` is the true new-commit set.
 * A new remote branch reports the zero-sha, where the honest fallback is everything the branch adds to
 * the trunk. A deletion sends no commits. Empty stdin means a manual run, which measures the branch
 * rather than nothing — a check that no-ops when it cannot see its input is useless.
 * @param {String} stdin Raw hook payload.
 * @returns {String[]}
 */
export function pendingRanges(stdin) {
    const rows = (stdin || '').split('\n').map(line => line.trim()).filter(Boolean);

    if (rows.length === 0) {
        return ['origin/dev..HEAD']
    }

    return rows.map(row => {
        const [, localSha, , remoteSha] = row.split(/\s+/);

        if (!localSha || localSha === ZERO_SHA) {
            return null
        }

        return !remoteSha || remoteSha === ZERO_SHA ? `origin/dev..${localSha}` : `${remoteSha}..${localSha}`
    }).filter(Boolean)
}

/**
 * @summary Measures one rev range, reading each file at the range TIP rather than from the work tree.
 *
 * The work tree may already have moved past what is being pushed, and measuring what is not being
 * published would report the wrong thing in both directions.
 * @param {String} range Rev range (`A..B`).
 * @param {String} gitRoot
 * @returns {Object[]} Per-file measurements.
 */
export function measureRange(range, gitRoot) {
    const tip   = range.split('..').pop(),
          files = [];

    let changed;

    try {
        changed = execFileSync('git', ['diff', '--name-only', '--diff-filter=ACMR', range], {cwd: gitRoot, encoding: 'utf-8'})
            .split('\n').map(line => line.trim()).filter(file => file.length > 0 && isInScopePath(file))
    } catch {
        return files
    }

    for (const file of changed) {
        let addedLines, content;

        try {
            addedLines = parseAddedLines(execFileSync('git', ['diff', '--unified=0', range, '--', file], {cwd: gitRoot, encoding: 'utf-8'}));
            content    = execFileSync('git', ['show', `${tip}:${file}`], {cwd: gitRoot, encoding: 'utf-8'})
        } catch (error) {
            // Never a silent skip: an undefined helper and a deleted path both land here, and one is a
            // programming error. A zero-file measurement that prints nothing is indistinguishable from
            // a clean range.
            console.warn(`check-comment-density: could not measure ${file} (${error.message})`);
            continue
        }

        if (!addedLines || addedLines.size === 0) continue;

        files.push({file, ...measureProseDensity(content.split('\n'), addedLines)})
    }

    return files
}

function main() {
    let gitRoot;

    try {
        gitRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], {cwd: scriptRoot, encoding: 'utf-8'}).trim()
    } catch {
        return 0 // not a work tree — nothing to measure, never a failure
    }

    if (process.argv.includes('--pre-push')) {
        let stdin = '';

        try {
            stdin = readFileSync(0, 'utf-8')
        } catch { /* no payload — pendingRanges falls back to the branch range */ }

        const files = pendingRanges(stdin).flatMap(range => measureRange(range, gitRoot));

        reportDensity(files);

        return 0
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

    reportDensity(files);

    return 0 // advisory by design
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
    process.exit(main())
}
