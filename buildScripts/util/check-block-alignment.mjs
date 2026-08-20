import fs                                           from 'fs';
import {execFileSync}                               from 'node:child_process';
import {getStagedAddedLines, isWorkingTreeCleanFor} from './stagedDiff.mjs';

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
 * 3. **`=` declaration blocks** (v1b) — aligns the `=` column for both house-style
 *    repeated-keyword declarations (`let   a = …; const b = …;`) and single-keyword comma-blocks.
 *    Bare assignments remain out of scope; block-opening call/object values still participate.
 *
 * Conservative grouping (≥ 2 members, same indent, broken by any non-conforming line) so the gate
 * never touches an un-alignable shape and cannot false-positive. The column math is the entire point.
 *
 * Usage:
 *   node buildScripts/util/check-block-alignment.mjs <file.mjs> [...]                # check; exit 1 on drift
 *   node buildScripts/util/check-block-alignment.mjs --staged <file.mjs> [...]       # check, scoped to staged-added lines
 *   node buildScripts/util/check-block-alignment.mjs --fix <file.mjs> [...]          # rewrite whole-file (deliberate pass)
 *   node buildScripts/util/check-block-alignment.mjs --fix --staged <file.mjs> [...] # pre-commit repair: rewrite only staged-added lines
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

    const runs = collectPropertyRuns(lines, maskedLines),
          // Only runs that ARE alignment groups are counted, so "group 2 of 3" matches what a reader
          // can see. Counting skipped single-property runs would name a total nothing displays.
          groups = runs.filter(run => run.filter(entry => entry.kind === 'colon').length >= 2);

    groups.forEach((run, groupIndex) => {
        const colonMembers = run.filter(entry => entry.kind === 'colon'),
              indent       = run[0].indent,
              keyWidth     = Math.max(...colonMembers.map(entry => entry.key.length));

        for (const entry of colonMembers) {
            const expected = `${indent}${entry.key.padEnd(keyWidth)}: ${entry.value}`;
            if (expected !== lines[entry.lineIndex]) {
                violations.push({
                    lineIndex     : entry.lineIndex,
                    expectedColumn: indent.length + keyWidth,
                    kind          : 'object-colon',
                    group         : groupIndex + 1,
                    groupCount    : groups.length
                });
                fixedLines[entry.lineIndex] = expected;
            }
        }
    });

    return {violations, fixedLines, notices: detectCommentOnlyFragmentation(lines, groups)};
}

// ─────────────────────────── `=` declaration blocks (v1b) ───────────────────────────

// The DECL_BINDING pattern-class deliberately EXCLUDES `=` from its `{…}`/`[…]` branches: a destructuring
// binding that carries a DEFAULT (`{a = []}`, `[x = 0]`) holds an `=` that is NOT the assignment operator.
// Excluding it makes such a line fail to match as a declaration, so it breaks the alignment run (stays
// untouched) instead of being mis-split at its first `=` by splitAssignment — which erased a valid
// `{blockedNodes = [], …} = focusContradiction` into a SyntaxError. Default-FREE patterns (`{record}`) carry
// no `=`, so they still match and align exactly as before — only defaulted patterns are excluded. The bare
// declaration patterns also reject `=>`: a multiline callback can share the continuation indent, but its
// arrow is not an assignment operator and must break the run before splitAssignment reconstructs it.
const
    LONE_KEYWORD = /^\s*(?:const|let|var)\s*$/,        // a lone `const`/`let`/`var` line (opens a comma-block)
    DECL_BINDING = String.raw`(?:[A-Za-z_$][\w$]*|\{[^}=]+\}|\[[^\]=]+\])`,
    BARE_DECL    = new RegExp(`^(\\s+)${DECL_BINDING}\\s*=(?!>)\\s*.+$`); // its indented `binding = value` comma-block continuation

const
    KEYWORD_DECL           = new RegExp(`^(\\s*)(const|let|var)\\s+(${DECL_BINDING})\\s*=\\s*(.+)$`),
    BARE_DECL_CONTINUATION = new RegExp(`^(\\s+)${DECL_BINDING}\\s*=(?!>)\\s*.+$`);

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
 * declaration line admitted by the binding patterns is always the assignment operator
 * (keywords/identifiers carry none, and bare callback arrows are rejected), so a value-internal
 * `===` / `=>` is preserved in `value`.
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
 * @summary Parses one keyworded variable declaration line. The returned `left` deliberately includes
 * the keyword (`const foo`) so mixed `let`/`const` blocks align exactly like the coding-guideline
 * example. Object and array destructuring bindings participate in comma-block alignment because
 * Neo's house style aligns the full declaration block, not only identifier continuations.
 * @param {String} line
 * @returns {{indent: String, kind: String, keyword: String, name: String, left: String, value: String}|null}
 */
function parseKeywordDeclaration(line) {
    const match = KEYWORD_DECL.exec(line);
    if (!match) return null;

    return {
        indent : match[1],
        kind   : 'keyword',
        keyword: match[2],
        name   : match[3],
        left   : line.slice(0, line.indexOf('=')).replace(/\s+$/, ''),
        value  : match[4]
    };
}

/**
 * @summary Parses a bare `binding = value` continuation under a keyworded comma-block.
 * @param {String} line
 * @returns {{indent: String, kind: String, left: String, value: String}|null}
 */
function parseBareDeclaration(line) {
    const match = BARE_DECL_CONTINUATION.exec(line);
    if (!match) return null;

    return {indent: match[1], kind: 'bare', ...splitAssignment(line)};
}

/**
 * @summary Splits lines into declaration assignment runs. Supported house-style units:
 *
 * - legacy lone-keyword comma-blocks (`const` then indented bare `name = …` continuations);
 * - keyword-head comma-blocks (`const first = …,` then indented bare continuations);
 * - repeated-keyword declaration blocks (`let foo = …; const longerName = …;`).
 *
 * Bare assignments are still deliberately NOT collected without a keyword anchor.
 * @param {String[]} lines
 * @param {Boolean[]} [maskedLines]
 * @returns {Array<{entries: Array<{lineIndex: Number, left: String, value: String}>, mode: String}>}
 */
function collectAssignmentRuns(lines, maskedLines = []) {
    const runs = [];
    let   i    = 0;

    while (i < lines.length) {
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
                run.push({lineIndex: j, ...splitAssignment(lines[j])});
                j++;
            }

            if (run.length >= 2) {
                runs.push({entries: run, mode: 'comma'});
                i = j;
                continue;
            }
        }

        const keywordDeclaration = !maskedLines[i] ? parseKeywordDeclaration(lines[i]) : null;
        if (keywordDeclaration) {
            const keywordRun = [{lineIndex: i, ...keywordDeclaration}];
            let   j          = i + 1;

            if (keywordDeclaration.value.replace(/\s+$/, '').endsWith(',')) {
                while (j < lines.length && !maskedLines[j]) {
                    const bareDeclaration = parseBareDeclaration(lines[j]);
                    if (!bareDeclaration || bareDeclaration.indent.length <= keywordDeclaration.indent.length) {
                        break;
                    }

                    keywordRun.push({lineIndex: j, ...bareDeclaration});
                    j++;
                }
            }

            if (keywordRun.length >= 2) {
                runs.push({entries: keywordRun, mode: 'comma'});
                i = j;
                continue;
            }

            j = i + 1;
            while (j < lines.length && !maskedLines[j]) {
                const nextDeclaration = parseKeywordDeclaration(lines[j]);
                if (!nextDeclaration || nextDeclaration.indent !== keywordDeclaration.indent) {
                    break;
                }

                keywordRun.push({lineIndex: j, ...nextDeclaration});
                j++;
            }

            if (keywordRun.length >= 2) {
                runs.push({entries: keywordRun, mode: 'keyword'});
                i = j;
                continue;
            }

            runs.push({entries: keywordRun, mode: 'keyword'});
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

    for (const {entries, mode} of collectAssignmentRuns(lines, maskedLines)) {
        const simpleParts = entries;
        if (simpleParts.length === 0) continue;
        if (simpleParts.length < 2 && lines[simpleParts[0].lineIndex] === `${simpleParts[0].left} = ${simpleParts[0].value}`) continue;

        const
            keywordWidth = mode === 'keyword' ? Math.max(...simpleParts.map(part => part.keyword.length)) : 0,
            nameWidth    = mode === 'keyword' ? Math.max(...simpleParts.map(part => part.name.length)) : 0,
            leftWidth    = mode === 'keyword'
                ? Math.max(...simpleParts.map(part => part.indent.length + keywordWidth + 1 + nameWidth))
                : Math.max(...simpleParts.map(part => part.left.length));

        for (const {lineIndex, left, value, indent, keyword, name} of simpleParts) {
            const normalizedLeft = mode === 'keyword'
                ? `${indent}${keyword.padEnd(keywordWidth)} ${name.padEnd(nameWidth)}`
                : left;
            const expected = `${normalizedLeft.padEnd(leftWidth)} = ${value}`;
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
 * @summary Computes which lines BEGIN inside a template literal — i.e. are template-text continuations of
 * a multi-line template opened on an earlier line. Such a line is not its own declaration and must break
 * the alignment runs. A line that merely CONTAINS a single-line template value (e.g. a property whose
 * value is a one-line template) begins in code and is NOT flagged, so it stays in its run. (A prior
 * version flagged any line containing template content, which split a run at a single-line template-valued
 * property — leaving the keys before it tight and the rest far.) Backticks in comments, quoted strings,
 * and escaped content do not open a template.
 * @param {String[]} lines
 * @returns {Boolean[]} Per-line: does the line begin inside an unclosed template literal?
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

        // A run member must START in code. A line that begins INSIDE a template literal is a continuation
        // (template text, not its own declaration) and must break the alignment run. A line that merely
        // CONTAINS a single-line template value begins in code and must STAY in its run — capturing the
        // line-START template state (not any-template-content-on-the-line) keeps a single-line
        // template-valued property aligned with its block.
        maskedLines[lineIndex] = stack.some(frame => frame.type === 'template');

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
                    templateEscape = false;
                    i++;
                    continue;
                }

                if (ch === '\\') {
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
function formatViolation(file, {lineIndex, expectedColumn, kind, group, groupCount}) {
    // The unit is named because this checker judges GROUPS, and a column number alone cannot tell a
    // reader which it judged. "group 2 of 3" says a boundary exists above this line — the difference
    // between "my literal is misaligned" and "my literal was split in two, and each half is
    // internally consistent". A green run has always meant every group is aligned; it has never
    // meant the file reads as one block, and the output never said so.
    const at    = `${file}:${lineIndex + 1}`,
          where = groupCount > 1 ? ` (group ${group} of ${groupCount})` : '';

    if (kind === 'object-colon') return `Misaligned object-literal colon in ${at}${where} — expected ':' at column ${expectedColumn + 1}`;
    if (kind === 'assignment')   return `Misaligned '=' in ${at}${where} — expected '=' at column ${expectedColumn + 1}`;
    return `Misaligned import 'from' in ${at}${where} — expected 'from' at column ${expectedColumn + 1}`;
}

/**
 * @summary Adjacent property runs at one indent, separated by comment lines ONLY.
 *
 * A blank line between two runs is a deliberate separator and is left alone. A comment is not: the
 * author wrote prose about the next key and unknowingly split one alignment group in two, each of
 * which is then aligned independently and reported clean. The file reads wrong and every gate on the
 * path agrees it is fine.
 *
 * Reported as a NOTICE, never a failure. The split is occasionally deliberate, and a checker that
 * cannot tell which should not be the thing that blocks a commit — only the thing that makes the
 * author look.
 *
 * @param {String[]} lines
 * @param {Array<Object[]>} runs As returned by `collectPropertyRuns`.
 * @returns {Array<{lineIndex: Number}>}
 */
function detectCommentOnlyFragmentation(lines, runs) {
    const notices = [];

    for (let i = 1; i < runs.length; i++) {
        const previous = runs[i - 1],
              current  = runs[i],
              from     = previous[previous.length - 1].lineIndex + 1,
              to       = current[0].lineIndex;

        if (to <= from || previous[0].indent !== current[0].indent) continue;

        const between = lines.slice(from, to).map(line => line.trim());

        if (between.every(line => line.startsWith('//') || line.startsWith('*') || line.startsWith('/*'))) {
            notices.push({lineIndex: current[0].lineIndex})
        }
    }

    return notices
}

/**
 * @summary Checks (or, with `fix`, rewrites) one file across all three alignment groups. The
 * evaluators are chained — each sees the prior's fixed lines — which is safe because none changes the
 * line COUNT and the three line-shapes (import / property / declaration) are disjoint.
 *
 * Dispositions: check mode reports drift (scoped to staged-added lines under `--staged`); pure
 * `--fix` rewrites whole-file as a deliberate pass; `--fix --staged` (the pre-commit repair)
 * rewrites ONLY violations on the author's staged-added lines, so a grandfathered misalignment on an
 * untouched line is never sprayed into an unrelated commit. The scoped repair fails CLOSED: without
 * a reliable staged-line set it reports and writes nothing (`'unfixable'`).
 * @param {String}  file
 * @param {Boolean} fix
 * @param {String}  [gitRoot]   Repository root for staged-line scoping (check `--staged` and `--fix --staged`).
 * @param {Boolean} [scopedFix] `true` only in `--fix --staged` mode — distinguishes the scoped repair
 * from the deliberate whole-file pass, whose gitRoot is likewise null.
 * @returns {String} `'clean' | 'reported' | 'fixed' | 'unfixable'`
 */
/**
 * Why each scoped repair was refused, keyed by file. Two different causes need two different author
 * actions — stash your unstaged edits, versus fix your git state — so the driver reports them apart
 * instead of collapsing both into one message that fits neither.
 * @type {Map<String,String>}
 */
const unfixableReasons = new Map();

function processFile(file, fix, gitRoot = null, scopedFix = false) {
    const allViolations = [];
    const originalLines = fs.readFileSync(file, 'utf8').split('\n');
    const maskedLines   = computeTemplateLiteralLineMask(originalLines);
    let   lines         = originalLines;

    const allNotices = [];

    for (const evaluate of EVALUATORS) {
        const {violations, fixedLines, notices} = evaluate(lines, maskedLines);
        allViolations.push(...violations);
        notices && allNotices.push(...notices);
        lines = fixedLines;
    }

    // Printed before the clean/dirty verdict, and independently of it, because the whole point is a
    // file that IS clean by this checker's own rule while reading wrong. Emitting it only alongside a
    // violation would hide it in exactly the case it exists to describe.
    for (const notice of allNotices.sort((a, b) => a.lineIndex - b.lineIndex)) {
        console.warn(
            `check-block-alignment: ${file}:${notice.lineIndex + 1} — an alignment group starts here, ` +
            'separated from the one above by a comment only. Each half aligns independently, so this ' +
            'file can pass while the two read at different columns. Deliberate? Leave it.'
        )
    }

    if (allViolations.length === 0) return 'clean';

    if (fix) {
        if (scopedFix) {
            const added = gitRoot ? getStagedAddedLines(file, gitRoot) : null;

            // The staged-line set is expressed in INDEX coordinates, and this function rewrites the
            // WORKING TREE. They agree only while the file has no unstaged changes; on a partially
            // staged file they drift by the unstaged edit's line delta, and the scoped repair then
            // writes lines the author never staged while leaving the staged drift in place. Both
            // halves of that go out reported as success.
            //
            // So the precondition is checked rather than assumed, and it fails the same CLOSED way a
            // missing staged-line set does: report, never rewrite — a git hiccup, or a half-staged
            // file, must not silently become an edit to somebody's unstaged work.
            const coordinatesAgree = Boolean(added) && isWorkingTreeCleanFor(file, gitRoot);

            if (!coordinatesAgree) {
                for (const violation of allViolations.sort((a, b) => a.lineIndex - b.lineIndex)) {
                    console.error(formatViolation(file, violation));
                }

                // Distinguished so the author can tell "stage or stash your other edits" from "git is
                // broken" — the two need different actions, and one message for both taught neither.
                unfixableReasons.set(file, added ? 'unstaged-changes' : 'no-staged-line-set');

                return 'unfixable';
            }

            const owned = allViolations.filter(v => added.has(v.lineIndex + 1));

            if (owned.length === 0) return 'clean';

            // The scoped repair = the whole-file fix masked to owned lines: each violation's fixed
            // line is exactly what a deliberate pass would write for it, applied nowhere else.
            const applied = originalLines.slice();
            for (const violation of owned) {
                applied[violation.lineIndex] = lines[violation.lineIndex];
            }

            fs.writeFileSync(file, applied.join('\n'), 'utf8');
            console.log(`Aligned ${owned.length} line(s) in ${file}` + (owned.length < allViolations.length ? ` — left ${allViolations.length - owned.length} untouched-line violation(s) as-is` : ''));
            return 'fixed';
        }

        fs.writeFileSync(file, lines.join('\n'), 'utf8');
        console.log(`Aligned ${allViolations.length} line(s) in ${file}`);
        return 'fixed';
    }

    // Staged (pre-commit) check mode: report only drift the author introduced on staged-added lines,
    // so a grandfathered misalignment on an untouched line never blocks an unrelated commit. Fail
    // CLOSED: a null detection (git read failure) reports the whole file rather than suppressing drift.
    const added    = gitRoot ? getStagedAddedLines(file, gitRoot) : null;
    const reported = added ? allViolations.filter(v => added.has(v.lineIndex + 1)) : allViolations;

    if (reported.length === 0) return 'clean';

    for (const violation of reported.sort((a, b) => a.lineIndex - b.lineIndex)) {
        console.error(formatViolation(file, violation));
    }

    return 'reported';
}

const
    args   = process.argv.slice(2),
    fix    = args.includes('--fix'),
    staged = args.includes('--staged'),
    files  = args.filter(arg => arg !== '--fix' && arg !== '--staged');

// --staged (pre-commit) mode: resolve the repo root once so processFile can scope drift to the
// author's staged-added lines — in check mode for the REPORT set, in `--fix --staged` mode for the
// REWRITE set. Fail-closed: a rev-parse failure → null gitRoot → check mode reports whole-file and
// the scoped repair refuses to write (drift is neither suppressed nor half-repaired by a git failure).
let gitRoot = null;
if (staged) {
    try {
        gitRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], {encoding: 'utf8'}).trim();
    } catch (e) {
        gitRoot = null;
    }
}

let
    hadDrift     = false,
    hadError     = false,
    hadUnfixable = false;

// Files this run actually wrote. A per-file guard makes each REFUSAL safe; it does not make the BATCH
// mutation-free, because files ahead of the refusal in argv were already rewritten. The summary has to
// know that to stay true.
const repairedFiles = [];

for (const file of files) {
    try {
        const result = processFile(file, fix, gitRoot, staged && fix);
        if (result === 'reported' || result === 'fixed') hadDrift = true;
        if (result === 'fixed')                          repairedFiles.push(file);
        if (result === 'unfixable')                      hadUnfixable = true;
    } catch (err) {
        console.error(`Error processing ${file}: ${err.message}`);
        hadError = true;
    }
}

// A file that could NOT be processed (missing, unreadable, unwritable) is always a failure — including
// under --fix, where a silent exit 0 would mask a repair that never happened. Alignment drift, by
// contrast, fails only in check mode: --fix repairs it, so a clean repair exits 0. A scoped repair
// that could not obtain a reliable staged-line set reported instead of rewriting — that fails too,
// since the drift it found is still in the file.
if (hadDrift && !fix) {
    console.error('\nBlock-alignment drift found. Run: node buildScripts/util/check-block-alignment.mjs --fix <files>');
}

if (hadUnfixable) {
    const
        refused  = [...unfixableReasons.keys()],
        unstaged = [...unfixableReasons].filter(([, reason]) => reason === 'unstaged-changes').map(([file]) => file);

    console.error(
        unstaged.length === unfixableReasons.size
            ? `\nBlock-alignment repair skipped for ${refused.join(', ')}: the staged line numbers do not address the file on disk, because it has unstaged changes — stage or stash the rest, then retry.`
            : `\nBlock-alignment repair skipped for ${refused.join(', ')}: the staged line numbers could not be trusted (unstaged changes, or a failed staged-line read) — resolve that, then retry.`
    );

    // The refusal is per FILE, so "no files were rewritten" is only true when none were. Any file
    // ahead of the refusal in argv has already been written, and its repair is sitting UNSTAGED in the
    // author's tree — telling them nothing happened sends them away from a real edit they still owe a
    // `git add`. @neo-gpt drove the mixed batch at the exact head and caught the message claiming the
    // opposite of the mutation that had just occurred.
    console.error(
        repairedFiles.length === 0
            ? 'No files were rewritten.'
            : `Note: ${repairedFiles.join(', ')} was already repaired before the refusal — that write stands, and is unstaged.`
    );
}

if (hadError || hadUnfixable || (hadDrift && !fix)) {
    process.exit(1);
}
