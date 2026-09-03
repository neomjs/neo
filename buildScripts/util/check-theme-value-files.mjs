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
 * @param {String} file Absolute path.
 * @returns {{line: Number, text: String}[]}
 */
export function findSelectorBlocks(file) {
    const
        lines  = fs.readFileSync(file, 'utf8').split('\n'),
        blocks = [];

    let depth     = 0,
        inComment = false;

    lines.forEach((raw, index) => {
        let code      = raw,
            opensHere = 0;

        // Strip block comments (possibly spanning lines), then line comments and strings.
        if (inComment) {
            const end = code.indexOf('*/');

            if (end === -1) return;

            code      = code.slice(end + 2);
            inComment = false
        }

        code = code.replace(/\/\*[\s\S]*?\*\//g, '');

        const open = code.indexOf('/*');

        if (open !== -1) {
            inComment = true;
            code      = code.slice(0, open)
        }

        code = code.replace(/\/\/.*$/, '').replace(/(['"])(?:\\.|(?!\1).)*\1/g, '');

        // SCSS INTERPOLATION is not a block. `--button-border: #{$width} #{$style};` carries two
        // `#{` openers, and counting them made a file this sweep had already cleaned report 34
        // selectors. Stripped before the walk so the depth stays structural.
        code = code.replace(/#\{[^{}]*\}/g, '');

        const atRule = /^\s*@/.test(code);

        for (const char of code) {
            if (char === '{') {
                // Depth 0 → the file's own theme wrapper. Depth ≥ 1 → a nested rule, unless this
                // line is an at-rule: `@include`/`@if`/`@each` compose values and control flow,
                // they do not decide which elements receive them.
                depth > 0 && !atRule && opensHere++;
                depth++
            } else if (char === '}') {
                depth = Math.max(0, depth - 1)
            }
        }

        opensHere && blocks.push({line: index + 1, text: raw.trim()})
    });

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
                `[new-selector] ${file} declares ${blocks.length} selector block(s); a theme file ` +
                `answers "what value", never "which elements". Move the selector to resources/scss/src ` +
                `and add tokens: ` + blocks.map(block => `${file}:${block.line} ${block.text.trim()}`).join(' | ')
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
