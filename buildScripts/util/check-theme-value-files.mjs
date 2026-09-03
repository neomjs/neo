#!/usr/bin/env node
/**
 * @module buildScripts/util/check-theme-value-files
 * @summary Enforces the operator rule that a theme value file declares variables, never selectors.
 *
 * Stated by the operator on 2026-09-02, while reviewing the nested-theme contract:
 *
 *   "For existing themes, there should NEVER be overrides inside THEME VAR files that add css
 *    selectors. Such cases must get added to `scss/src`, and add new vars as needed."
 *
 * The reason is a defect class, not tidiness. A theme file answers *what is this theme's value for
 * X*; a selector answers *which elements get X* — a structural question every theme then has to
 * re-answer identically, and any one copy can drift. That drift has shipped once already, and the
 * sweep found a rule in two themes whose selector had never matched at all: a value list makes a
 * missing line obvious, while a selector block makes a broken line invisible.
 *
 * ## Why a separate guard rather than a check inside `check-theme-surfaces`
 *
 * That guard owns the Workstation surface and its CI workflow filters on Workstation paths. This
 * rule spans every theme file, so folding it in would either widen that filter — running the
 * Workstation parity/token-only/completeness checks on unrelated theme edits — or leave this rule
 * silent for the files it most needs to watch. Two contracts, two scopes, two owners.
 *
 * ## Baseline
 *
 * `check-theme-value-files-baseline.json` records the offenders that predate the guard, so it can
 * be introduced BEFORE the sweep finishes rather than after. Each entry carries a `reason`, and the
 * two kinds are not the same thing:
 *
 * - `pending`  — ordinary sweep work; a later batch removes the entry.
 * - `exempt`   — blocked on a decision, with the ticket that owns it. Without this distinction a
 *                blocked file reads as unfinished work forever and nobody can tell whether the
 *                sweep is done.
 *
 * A baselined file whose block count DROPS fails too. That is deliberate: it forces the batch that
 * cleans a file to shrink the baseline in the same commit, so the record cannot rot into a list of
 * problems that no longer exist.
 *
 * **Sunset:** the guard is permanent — it is the rule's enforcement. The BASELINE retires: when it
 * reaches zero entries the file is deleted and this loader treats a missing baseline as empty.
 */
import fs              from 'node:fs';
import path            from 'node:path';
import {fileURLToPath} from 'node:url';

const
    dirname      = path.dirname(fileURLToPath(import.meta.url)),
    repoRoot     = path.resolve(dirname, '../..'),
    themeRoot    = path.join(repoRoot, 'resources/scss'),
    baselinePath = path.join(dirname, 'check-theme-value-files-baseline.json');

/**
 * @summary Finds every selector block nested inside a theme file's own scope.
 *
 * Detected by BRACE DEPTH rather than by matching selector text. A first attempt used a regex for
 * "indented, no colon, ends in `{`" and mutation-testing showed it blind to two shapes this repo
 * actually contains: the one-liner (`&.neo-state-open { background-color: … }`, all over the
 * portal palette) and the pseudo-class (`&:not(.hljs) {`, whose colon the regex read as a
 * declaration). A guard that silently misses the forms it exists to catch is worse than none,
 * because its green is mistaken for coverage.
 *
 * Depth is structural and shape-agnostic: the file's own `:root .neo-theme-*` wrapper opens depth
 * 1, so ANY block opened at depth ≥ 1 is a nested rule regardless of how its selector is written.
 * Comments and strings are stripped first so a brace inside either cannot move the count. `@`-rules
 * stay allowed — `@include` composes values rather than deciding which elements receive them.
 *
 * **The depth-0 block is checked too, and that is not symmetry — it closes a real escape.** Treating
 * depth 0 as "the file's own wrapper" is a convention no code enforces: nothing stops a file having a
 * SECOND top-level block, and one declaring `color: red` was reported compliant. Worse, it is the
 * shape ordinary editing produces — appending to a theme file lands at column 0, so the easiest way
 * to add an override was the one way this guard could not see it.
 *
 * The test is the rule itself rather than a proxy for it: a top-level block may declare custom
 * properties and nothing else. Failing on "more than one top-level block" would also have worked on
 * today's tree, and would ban a legitimate second variables-only scope; this does not.
 * @param {String} file Absolute path.
 * @returns {{line: Number, text: String}[]}
 */
export function findSelectorBlocks(file) {
    const
        blocks = [],
        source = fs.readFileSync(file, 'utf8')
            // Comments and strings first, so a brace inside either cannot move the depth.
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/\/\/[^\n]*/g, '')
            .replace(/(['"])(?:\\.|(?!\1).)*\1/g, '')
            // SCSS interpolation is not a block. `--button-border: #{$w} #{$s};` carries two `#{`
            // openers, and counting them made an already-clean file report 34 selectors.
            .replace(/#\{[^{}]*\}/g, '');

    let depth  = 0,
        line   = 1,
        buffer = '';

    /**
     * @summary Records a declaration if `buffer` holds one that a theme file may not declare.
     * @param {Number} at
     */
    const flushDeclaration = at => {
        const declaration = buffer.match(/([a-zA-Z-][\w-]*)\s*:/);

        // Only DIRECTLY inside the theme's own scope. Deeper text already belongs to a nested block
        // that was reported when it opened.
        depth === 1 && declaration && !declaration[1].startsWith('--') && !buffer.trim().startsWith('@') &&
            blocks.push({kind: 'top-level property', line: at, text: buffer.trim().slice(0, 90)});

        buffer = ''
    };

    for (const char of source) {
        if (char === '\n') { line++; buffer += ' '; continue }

        if (char === '{') {
            // The selector is whatever preceded the brace. At depth ≥ 1 that is a nested rule; at
            // depth 0 it is the file's own scope, whose CONTENTS `flushDeclaration` then polices.
            depth > 0 && !buffer.trim().startsWith('@') && buffer.trim() &&
                blocks.push({kind: 'nested selector', line, text: buffer.trim().slice(0, 90)});

            depth++;
            buffer = '';
            continue
        }

        if (char === '}') {
            // A one-line block (`.probe { color: red }`) closes without a `;`, so the declaration is
            // only ever seen here. Flushing BEFORE the depth drop is what catches it — the earlier
            // line-based version missed exactly this shape.
            flushDeclaration(line);
            depth = Math.max(0, depth - 1);
            continue
        }

        if (char === ';') { flushDeclaration(line); continue }

        buffer += char
    }

    return blocks
}

/**
 * @summary Every `resources/scss/theme-*` SCSS file, repo-relative.
 * @returns {String[]}
 */
export function collectThemeFiles() {
    const walk = dir => fs.readdirSync(dir, {withFileTypes: true}).flatMap(entry => {
        const full = path.join(dir, entry.name);

        return entry.isDirectory() ? walk(full) : entry.name.endsWith('.scss') ? [full] : []
    });

    return fs.readdirSync(themeRoot, {withFileTypes: true})
        .filter(entry => entry.isDirectory() && entry.name.startsWith('theme-'))
        .flatMap(entry => walk(path.join(themeRoot, entry.name)))
        .map(file => path.relative(repoRoot, file))
        .sort()
}

/**
 * @summary Reads the baseline, treating a missing file as an empty one (its retired state).
 * @returns {Map<String,Object>}
 */
export function readBaseline() {
    if (!fs.existsSync(baselinePath)) return new Map();

    return new Map(JSON.parse(fs.readFileSync(baselinePath, 'utf8')).map(entry => [entry.file, entry]))
}

/**
 * @summary The guard. Returns the (possibly empty) list of failures.
 * @returns {String[]}
 */
export function collectThemeValueFileFailures() {
    const
        baseline = readBaseline(),
        failures = [],
        seen     = new Set();

    for (const file of collectThemeFiles()) {
        const
            blocks   = findSelectorBlocks(path.join(repoRoot, file)),
            recorded = baseline.get(file);

        recorded && seen.add(file);

        if (!blocks.length) {
            // A baselined file that is now clean must lose its entry in the same commit, or the
            // record rots into a list of problems nobody has any more.
            recorded && failures.push(
                `[stale-baseline] ${file} declares no selectors any more — remove its baseline entry`
            );
            continue
        }

        if (!recorded) {
            failures.push(
                `[new-selector] ${file} declares ${blocks.length} rule(s) that are not variables; a ` +
                `theme file answers "what value", never "which elements". Move the selector to ` +
                `resources/scss/src and add tokens: ` +
                blocks.map(block => `${file}:${block.line} (${block.kind}) ${block.text.trim()}`).join(' | ')
            );
            continue
        }

        if (blocks.length > recorded.blocks) {
            failures.push(
                `[grew] ${file} declares ${blocks.length} selector block(s), baselined at ${recorded.blocks}`
            )
        } else if (blocks.length < recorded.blocks) {
            failures.push(
                `[stale-baseline] ${file} is down to ${blocks.length} selector block(s) from ` +
                `${recorded.blocks} — update its baseline entry in this commit`
            )
        }
    }

    for (const file of baseline.keys()) {
        seen.has(file) || failures.push(`[stale-baseline] ${file} is baselined but no longer exists`)
    }

    return failures
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const
        failures = collectThemeValueFileFailures(),
        baseline = readBaseline(),
        pending  = [...baseline.values()].filter(entry => entry.reason?.startsWith('pending')).length,
        exempt   = [...baseline.values()].filter(entry => entry.reason?.startsWith('exempt')).length;

    if (failures.length) {
        console.error('✗ theme value files FAILED:\n');
        failures.forEach(failure => console.error('    ' + failure));
        process.exit(1)
    }

    console.log(
        `✓ theme value files declare variables only — ${pending} file(s) pending sweep, ` +
        `${exempt} exempt pending a decision.`
    )
}
