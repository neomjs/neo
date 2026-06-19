import fs from 'fs';

/**
 * @module buildScripts/util/check-block-alignment
 * @summary Lint (with `--fix`) that enforces Neo's aligned-block house style mechanically, so neither
 * a human nor a frontier model has to hand-count alignment padding (the negative-ROI, mis-count-prone
 * task that motivated this gate).
 *
 * **v1 scope: import-`from` alignment.** Within a run of consecutive single-line `import … from …`
 * statements, the `from` keyword aligns to one shared column = the widest `import <clause>` in the run
 * + one space. Object-literal colon alignment and `=`-declaration-block alignment are documented
 * fast-follows (the `=` convention differs by tree — deferred as a documented follow-up).
 *
 * The column math is computed, never eyeballed — that is the entire point of the gate.
 *
 * Usage:
 *   node buildScripts/util/check-block-alignment.mjs <file.mjs> [...]       # check; exit 1 on drift
 *   node buildScripts/util/check-block-alignment.mjs --fix <file.mjs> [...] # rewrite to aligned form
 *
 * Multi-line imports (`import {\n  a\n} from …`) and lone single imports are intentionally NOT grouped
 * in v1: a run is ≥ 2 consecutive single-line imports, so the gate never touches an un-alignable shape.
 */

/** Matches a single-line import that carries both a clause and a `from` source on one line. */
const SINGLE_LINE_IMPORT = /^import\s+(.*?)\s+from\s+(.+)$/;
const IMPORT_PREFIX       = 'import ';

/**
 * @summary Splits a file's lines into maximal runs of consecutive single-line imports, returning the
 * parsed `{lineIndex, clause, source}` for each member. Any non-matching line (blank, comment,
 * multi-line-import fragment, side-effect import) ends the current run.
 * @param {String[]} lines
 * @returns {Array<Array<{lineIndex: Number, clause: String, source: String}>>} runs of length ≥ 1
 */
function collectImportRuns(lines) {
    const runs    = [];
    let   current = [];

    lines.forEach((line, lineIndex) => {
        const match = line.match(SINGLE_LINE_IMPORT);
        if (match) {
            current.push({lineIndex, clause: match[1], source: match[2]});
        } else if (current.length > 0) {
            runs.push(current);
            current = [];
        }
    });

    if (current.length > 0) runs.push(current);

    return runs;
}

/**
 * @summary The aligned form of a single import line: the clause padded so `from` sits at `fromColumn`.
 * @param {{clause: String, source: String}} entry
 * @param {Number} fromColumn 0-based column where `from` must start.
 * @returns {String}
 */
function alignedImportLine({clause, source}, fromColumn) {
    const padding = ' '.repeat(fromColumn - (IMPORT_PREFIX.length + clause.length));
    return `${IMPORT_PREFIX}${clause}${padding}from ${source}`;
}

/**
 * @summary Evaluates a file for import-`from` alignment drift. Pure: returns the misaligned lines and
 * the would-be-fixed line array, mutating nothing.
 * @param {String[]} lines
 * @returns {{violations: Array<{lineIndex: Number, expectedColumn: Number}>, fixedLines: String[]}}
 */
function evaluateImportAlignment(lines) {
    const
        violations = [],
        fixedLines = lines.slice();

    for (const run of collectImportRuns(lines)) {
        if (run.length < 2) continue; // a lone import is not an alignment group

        // The `from` column = widest `import <clause>` in the run + one space.
        const fromColumn = Math.max(...run.map(entry => IMPORT_PREFIX.length + entry.clause.length)) + 1;

        for (const entry of run) {
            const expected = alignedImportLine(entry, fromColumn);
            if (expected !== lines[entry.lineIndex]) {
                violations.push({lineIndex: entry.lineIndex, expectedColumn: fromColumn});
                fixedLines[entry.lineIndex] = expected;
            }
        }
    }

    return {violations, fixedLines};
}

/**
 * @summary Checks (or, with `fix`, rewrites) one file's import-`from` alignment.
 * @param {String}  file
 * @param {Boolean} fix
 * @returns {Boolean} whether the file had (in check mode) or had-and-fixed (in fix mode) drift.
 */
function processFile(file, fix) {
    const
        content = fs.readFileSync(file, 'utf8'),
        lines   = content.split('\n'),
        {violations, fixedLines} = evaluateImportAlignment(lines);

    if (violations.length === 0) return false;

    if (fix) {
        fs.writeFileSync(file, fixedLines.join('\n'), 'utf8');
        console.log(`Aligned ${violations.length} import line(s) in ${file}`);
    } else {
        for (const {lineIndex, expectedColumn} of violations) {
            console.error(`Misaligned import 'from' in ${file}:${lineIndex + 1} — expected 'from' at column ${expectedColumn + 1}`);
        }
    }

    return true;
}

const
    args  = process.argv.slice(2),
    fix   = args.includes('--fix'),
    files = args.filter(arg => arg !== '--fix');

let drift = false;
for (const file of files) {
    try {
        if (processFile(file, fix)) drift = true;
    } catch (err) {
        console.error(`Error processing ${file}:`, err.message);
        drift = true;
    }
}

// In check mode, drift is a failure; in fix mode the drift was repaired, so exit clean.
if (drift && !fix) {
    console.error('\nBlock-alignment drift found. Run: node buildScripts/util/check-block-alignment.mjs --fix <files>');
    process.exit(1);
}
