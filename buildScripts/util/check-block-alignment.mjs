import fs                    from 'fs';
import {execFileSync}        from 'node:child_process';
import {getStagedAddedLines} from './stagedDiff.mjs';

/**
 * @module buildScripts/util/check-block-alignment
 * @summary Lint (with `--fix`) that enforces Neo's aligned-block house style mechanically, so neither
 * a human nor a frontier model has to hand-count alignment padding (the negative-ROI, mis-count-prone
 * task that motivated this gate). House-style source of authority: `.github/CODING_GUIDELINES.md`
 * (rule 2 colon-align; rule 35 `=`-align).
 *
 * Three alignment groups, each COMPUTED (never eyeballed):
 *
 * 1. **import-`from`** (v1) — within a run of ≥ 2 consecutive single-line `import … from …`, the
 *    `from` aligns to one column = the widest `import <clause>` + one space.
 * 2. **object-literal colons** (v1b) — within a run of ≥ 2 consecutive same-indent object properties,
 *    the key `:` aligns to one column = the widest key. Shorthand properties (`foo,`) stay in the run
 *    but are not themselves aligned; nested objects re-group at their own indent.
 * 3. **`=` comma-blocks** (v1b) — within a single-keyword comma-block (a lone `const`/`let`/`var`
 *    line + its indented `name = value` continuations), the `=` aligns to one column. Only this
 *    rule-35 unit is grouped — separate consecutive declarations and bare assignments are left alone,
 *    so the gate never re-aligns unrelated statements. A block-opening value (`{`/`(`/`[`) is excluded.
 *
 * Conservative grouping (≥ 2 members, same indent, broken by any non-conforming line) so the gate
 * never touches an un-alignable shape and cannot false-positive. The column math is the entire point.
 *
 * Usage:
 *   node buildScripts/util/check-block-alignment.mjs <file.mjs> [...]       # check; exit 1 on drift
 *   node buildScripts/util/check-block-alignment.mjs --fix <file.mjs> [...] # rewrite to aligned form
 */

// ───────────────────────────── import-`from` (v1) ─────────────────────────────

/** Matches a single-line import that carries both a clause and a `from` source on one line. */
const SINGLE_LINE_IMPORT = /^import\s+(.*?)\s+from\s+(.+)$/;
const IMPORT_PREFIX      = 'import ';

/**
 * @summary Splits a file's lines into maximal runs of consecutive single-line imports, returning the
 * parsed `{lineIndex, clause, source}` for each member. Any non-matching line (blank, comment,
 * multi-line-import fragment, side-effect import, masked template-literal content) ends the current
 * run.
 * @param {String[]} lines
 * @param {Boolean[]} [maskedLines]
 * @returns {Array<Array<{lineIndex: Number, clause: String, source: String}>>} runs of length ≥ 1
 */
function collectImportRuns(lines, maskedLines = []) {
    const runs    = [];
    let   current = [];

    lines.forEach((line, lineIndex) => {
        if (maskedLines[lineIndex]) {
            if (current.length > 0) runs.push(current);
            current = [];
            return;
        }

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
 * @param {Boolean[]} [maskedLines]
 * @returns {{violations: Array<{lineIndex: Number, expectedColumn: Number, kind: String}>, fixedLines: String[]}}
 */
function evaluateImportAlignment(lines, maskedLines = []) {
    const
        violations = [],
        fixedLines = lines.slice();

    for (const run of collectImportRuns(lines, maskedLines)) {
        if (run.length < 2) continue; // a lone import is not an alignment group

        // The `from` column = widest `import <clause>` in the run + one space.
        const fromColumn = Math.max(...run.map(entry => IMPORT_PREFIX.length + entry.clause.length)) + 1;

        for (const entry of run) {
            const expected = alignedImportLine(entry, fromColumn);
            if (expected !== lines[entry.lineIndex]) {
                violations.push({lineIndex: entry.lineIndex, expectedColumn: fromColumn, kind: 'import'});
                fixedLines[entry.lineIndex] = expected;
            }
        }
    }

    return {violations, fixedLines};
}

// ─────────────────────────── object-literal colons (v1b) ───────────────────────────

const
    COLON_PROPERTY     = /^(\s+)([A-Za-z_$][\w$]*|'[^']*'|"[^"]*"|\[[^\]]+\])\s*:\s+(\S.*)$/,
    SHORTHAND_PROPERTY = /^(\s+)([A-Za-z_$][\w$]*),?\s*$/;

/**
 * @summary Parses one line as an object property: a `key: value` (`colon`) or a shorthand `key,`
 * (`shorthand`). Returns `null` for anything else. Only a leading identifier/quoted key with a
 * following value counts as a colon property — a value-internal colon (ternary, URL) never matches,
 * since the key+colon are anchored at line start.
 * @param {String} line
 * @returns {{indent: String, kind: String, key?: String, value?: String}|null}
 */
function parsePropertyLine(line) {
    const colon = COLON_PROPERTY.exec(line);
    if (colon) return {indent: colon[1], kind: 'colon', key: colon[2], value: colon[3]};

    const shorthand = SHORTHAND_PROPERTY.exec(line);
    if (shorthand) return {indent: shorthand[1], kind: 'shorthand'};

    return null;
}

/**
 * @summary Splits lines into maximal runs of consecutive same-indent object properties (colon OR
 * shorthand). A shorthand stays in the run (keeping a block together across e.g. `now,`) but is not
 * itself aligned; an indent change, blank line, masked template-literal content, or any non-property
 * line ends the run, so a nested object re-groups at its own indent and code can never be swept in.
 * @param {String[]} lines
 * @param {Boolean[]} [maskedLines]
 * @returns {Array<Array<{lineIndex: Number, indent: String, kind: String, key?: String, value?: String}>>}
 */
function collectPropertyRuns(lines, maskedLines = []) {
    const runs    = [];
    let   current = [];

    lines.forEach((line, lineIndex) => {
        if (maskedLines[lineIndex]) {
            if (current.length > 0) runs.push(current);
            current = [];
            return;
        }

        const property = parsePropertyLine(line);
        if (property && (current.length === 0 || property.indent === current[0].indent)) {
            current.push({lineIndex, ...property});
        } else {
            if (current.length > 0) runs.push(current);
            current = property ? [{lineIndex, ...property}] : [];
        }
    });

    if (current.length > 0) runs.push(current);

    return runs;
}

/**
 * @summary Evaluates object-literal colon alignment. Within each property run, the key colons align
 * to one column = the widest key. Pure.
 * @param {String[]} lines
 * @param {Boolean[]} [maskedLines]
 * @returns {{violations: Array<{lineIndex: Number, expectedColumn: Number, kind: String}>, fixedLines: String[]}}
 */
function evaluateColonAlignment(lines, maskedLines = []) {
    const
        violations = [],
        fixedLines = lines.slice();

    for (const run of collectPropertyRuns(lines, maskedLines)) {
        const colonMembers = run.filter(entry => entry.kind === 'colon');
        if (colonMembers.length < 2) continue; // a lone colon property is not an alignment group

        const
            indent   = run[0].indent,
            keyWidth = Math.max(...colonMembers.map(entry => entry.key.length));

        for (const entry of colonMembers) {
            const expected = `${indent}${entry.key.padEnd(keyWidth)}: ${entry.value}`;
            if (expected !== lines[entry.lineIndex]) {
                violations.push({lineIndex: entry.lineIndex, expectedColumn: indent.length + keyWidth, kind: 'object-colon'});
                fixedLines[entry.lineIndex] = expected;
            }
        }
    }

    return {violations, fixedLines};
}

// ─────────────────────────── `=` declaration blocks (v1b) ───────────────────────────

const
    LONE_KEYWORD = /^\s*(?:const|let|var)\s*$/,        // a lone `const`/`let`/`var` line (opens a comma-block)
    BARE_DECL    = /^(\s+)[A-Za-z_$][\w$]*\s*=\s*.+$/; // its indented `name = value` comma-block continuation

/**
 * @summary The leading whitespace of a line.
 * @param {String} line
 * @returns {String}
 */
function leadingWhitespace(line) {
    return line.match(/^(\s*)/)[1];
}

/**
 * @summary Splits an assignment line at its assignment `=` into `{left, value}`. The first `=` on a
 * declaration line is always the assignment operator (keywords/identifiers carry none), so a
 * value-internal `===` / `=>` is preserved in `value`.
 * @param {String} line
 * @returns {{left: String, value: String}}
 */
function splitAssignment(line) {
    const equalsIndex = line.indexOf('=');
    return {
        left : line.slice(0, equalsIndex).replace(/\s+$/, ''),
        value: line.slice(equalsIndex + 1).replace(/^\s+/, '')
    };
}

/**
 * @summary Whether an assignment value opens a multi-line block — its last non-space char is an
 * (unclosed) `{`, `(`, or `[`. Such members are excluded from `=`-alignment: the house style leaves a
 * block-opening `=` unaligned beside its simple-valued siblings (e.g. `cloneMap = {` next to an
 * aligned `configSymbol = …` run). Object-literal COLON alignment, by contrast, keeps block values in
 * the group (`intervals: {` aligns) — the asymmetry matches the observed convention.
 * @param {String} value
 * @returns {Boolean}
 */
function opensMultilineBlock(value) {
    return /[{([]$/.test(value.replace(/\s+$/, ''));
}

/**
 * @summary Splits lines into single-keyword comma-block assignment runs: the indented `<name> = …`
 * continuations under a lone `const`/`let`/`var` keyword line (the rule-35 house-style unit). Separate
 * consecutive declarations (`let a = …; const b = …;`) and bare assignments are deliberately NOT
 * collected — only the comma-block is an alignment group, so unrelated statements are never re-aligned.
 * @param {String[]} lines
 * @param {Boolean[]} [maskedLines]
 * @returns {Array<Number[]>} runs of line indices (length ≥ 2)
 */
function collectAssignmentRuns(lines, maskedLines = []) {
    const runs = [];
    let   i    = 0;

    while (i < lines.length) {
        // The single-keyword comma-block — a lone `const`/`let`/`var` line, then its indented
        // `name = value` continuations at one deeper indent — is the only `=`-alignment unit (rule 35).
        // Separate consecutive declarations and bare assignments are NOT grouped.
        if (!maskedLines[i] && LONE_KEYWORD.test(lines[i])) {
            const keywordIndent = leadingWhitespace(lines[i]);
            const run           = [];
            let   runIndent     = null;
            let   j             = i + 1;

            while (j < lines.length && !maskedLines[j] && BARE_DECL.test(lines[j])) {
                const indent = leadingWhitespace(lines[j]);
                if (indent.length <= keywordIndent.length) break; // continuations must be deeper
                if (runIndent === null) runIndent = indent;
                if (indent !== runIndent) break;                  // uniform indent only
                run.push(j);
                j++;
            }

            if (run.length >= 2) {
                runs.push(run);
                i = j;
                continue;
            }
        }

        i++;
    }

    return runs;
}

/**
 * @summary Evaluates `=` declaration-block alignment. Within each declaration run, the `=` aligns to
 * one column = the widest left side + one space. Pure.
 * @param {String[]} lines
 * @param {Boolean[]} [maskedLines]
 * @returns {{violations: Array<{lineIndex: Number, expectedColumn: Number, kind: String}>, fixedLines: String[]}}
 */
function evaluateAssignmentAlignment(lines, maskedLines = []) {
    const
        violations = [],
        fixedLines = lines.slice();

    for (const run of collectAssignmentRuns(lines, maskedLines)) {
        // Align the simple-valued members only; a block-opening value keeps its `=` unaligned (house
        // style). Require ≥ 2 simple members so a lone simple declaration is not an alignment group.
        const simpleParts = run
            .map(lineIndex => ({lineIndex, ...splitAssignment(lines[lineIndex])}))
            .filter(part => !opensMultilineBlock(part.value));

        if (simpleParts.length < 2) continue;

        const leftWidth = Math.max(...simpleParts.map(part => part.left.length));

        for (const {lineIndex, left, value} of simpleParts) {
            const expected = `${left.padEnd(leftWidth)} = ${value}`;
            if (expected !== lines[lineIndex]) {
                violations.push({lineIndex, expectedColumn: leftWidth + 1, kind: 'assignment'});
                fixedLines[lineIndex] = expected;
            }
        }
    }

    return {violations, fixedLines};
}

// ───────────────────────────────── driver ─────────────────────────────────

const EVALUATORS = [evaluateImportAlignment, evaluateColonAlignment, evaluateAssignmentAlignment];

/**
 * @summary Computes which lines contain template-literal string content, excluding JavaScript code
 * inside `${...}` expressions. Backticks in comments, quoted strings, and escaped template content do
 * not toggle the mask.
 * @param {String[]} lines
 * @returns {Boolean[]}
 */
function computeTemplateLiteralLineMask(lines) {
    const
        maskedLines = Array(lines.length).fill(false),
        stack       = [{type: 'code'}];

    let
        inBlockComment = false,
        stringQuote    = null,
        stringEscape   = false,
        templateEscape = false;

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        const line = lines[lineIndex];
        let   i    = 0;

        while (i < line.length) {
            const
                ch   = line[i],
                next = line[i + 1],
                ctx  = stack[stack.length - 1];

            if (inBlockComment) {
                if (ch === '*' && next === '/') {
                    inBlockComment = false;
                    i += 2;
                } else {
                    i++;
                }
                continue;
            }

            if (stringQuote) {
                if (stringEscape) {
                    stringEscape = false;
                } else if (ch === '\\') {
                    stringEscape = true;
                } else if (ch === stringQuote) {
                    stringQuote = null;
                }
                i++;
                continue;
            }

            if (ctx.type === 'template') {
                if (templateEscape) {
                    maskedLines[lineIndex] = true;
                    templateEscape = false;
                    i++;
                    continue;
                }

                if (ch === '\\') {
                    maskedLines[lineIndex] = true;
                    templateEscape = true;
                    i++;
                    continue;
                }

                if (ch === '`') {
                    stack.pop();
                    i++;
                    continue;
                }

                if (ch === '$' && next === '{') {
                    stack.push({type: 'expression', braceDepth: 1});
                    i += 2;
                    continue;
                }

                maskedLines[lineIndex] = true;
                i++;
                continue;
            }

            if (ch === '/' && next === '/') break;

            if (ch === '/' && next === '*') {
                inBlockComment = true;
                i += 2;
                continue;
            }

            if (ch === '\'' || ch === '"') {
                stringQuote  = ch;
                stringEscape = false;
                i++;
                continue;
            }

            if (ch === '`') {
                stack.push({type: 'template'});
                templateEscape = false;
                i++;
                continue;
            }

            if (ctx.type === 'expression') {
                if (ch === '{') {
                    ctx.braceDepth++;
                } else if (ch === '}') {
                    ctx.braceDepth--;
                    if (ctx.braceDepth === 0) stack.pop();
                }
            }

            i++;
        }
    }

    return maskedLines;
}

/**
 * @summary The operator-facing diagnostic for one violation. The import wording is preserved verbatim
 * (the v1 spec asserts it); colon/assignment get their own.
 * @param {String} file
 * @param {{lineIndex: Number, expectedColumn: Number, kind: String}} violation
 * @returns {String}
 */
function formatViolation(file, {lineIndex, expectedColumn, kind}) {
    const at = `${file}:${lineIndex + 1}`;
    if (kind === 'object-colon') return `Misaligned object-literal colon in ${at} — expected ':' at column ${expectedColumn + 1}`;
    if (kind === 'assignment')   return `Misaligned '=' in ${at} — expected '=' at column ${expectedColumn + 1}`;
    return `Misaligned import 'from' in ${at} — expected 'from' at column ${expectedColumn + 1}`;
}

/**
 * @summary Checks (or, with `fix`, rewrites) one file across all three alignment groups. The
 * evaluators are chained — each sees the prior's fixed lines — which is safe because none changes the
 * line COUNT and the three line-shapes (import / property / declaration) are disjoint.
 * @param {String}  file
 * @param {Boolean} fix
 * @returns {Boolean} whether the file had (check) or had-and-fixed (fix) drift.
 */
function processFile(file, fix, gitRoot = null) {
    const allViolations = [];
    let   lines         = fs.readFileSync(file, 'utf8').split('\n');
    const maskedLines   = computeTemplateLiteralLineMask(lines);

    for (const evaluate of EVALUATORS) {
        const {violations, fixedLines} = evaluate(lines, maskedLines);
        allViolations.push(...violations);
        lines = fixedLines;
    }

    if (allViolations.length === 0) return false;

    if (fix) {
        fs.writeFileSync(file, lines.join('\n'), 'utf8');
        console.log(`Aligned ${allViolations.length} line(s) in ${file}`);
        return true;
    }

    // Staged (pre-commit) check mode: report only drift the author introduced on staged-added lines,
    // so a grandfathered misalignment on an untouched line never blocks an unrelated commit. Fail
    // CLOSED: a null detection (git read failure) reports the whole file rather than suppressing drift.
    // (gitRoot is set only in --staged check mode; --fix always rewrites whole-file.)
    const added    = gitRoot ? getStagedAddedLines(file, gitRoot) : null;
    const reported = added ? allViolations.filter(v => added.has(v.lineIndex + 1)) : allViolations;

    if (reported.length === 0) return false;

    for (const violation of reported.sort((a, b) => a.lineIndex - b.lineIndex)) {
        console.error(formatViolation(file, violation));
    }

    return true;
}

const
    args   = process.argv.slice(2),
    fix    = args.includes('--fix'),
    staged = args.includes('--staged'),
    files  = args.filter(arg => arg !== '--fix' && arg !== '--staged');

// --staged (pre-commit) mode: resolve the repo root once so processFile can scope check-mode drift to
// the author's staged-added lines. Fail-closed: a rev-parse failure → null gitRoot → whole-file (drift
// is never suppressed by a git failure). Only meaningful in check mode; --fix always rewrites whole-file.
let gitRoot = null;
if (staged && !fix) {
    try {
        gitRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], {encoding: 'utf8'}).trim();
    } catch (e) {
        gitRoot = null;
    }
}

let
    hadDrift = false,
    hadError = false;

for (const file of files) {
    try {
        if (processFile(file, fix, gitRoot)) hadDrift = true;
    } catch (err) {
        console.error(`Error processing ${file}: ${err.message}`);
        hadError = true;
    }
}

// A file that could NOT be processed (missing, unreadable, unwritable) is always a failure — including
// under --fix, where a silent exit 0 would mask a repair that never happened. Alignment drift, by
// contrast, fails only in check mode: --fix repairs it, so a clean repair exits 0.
if (hadDrift && !fix) {
    console.error('\nBlock-alignment drift found. Run: node buildScripts/util/check-block-alignment.mjs --fix <files>');
}

if (hadError || (hadDrift && !fix)) {
    process.exit(1);
}
