#!/usr/bin/env node
/**
 * @module buildScripts/util/check-theme-coverage
 * @summary Baselined guard for the two-layer SCSS split: every `resources/scss/src/<pkg>/` package
 * that renders user-visible chrome needs values in BOTH primary themes (`theme-neo-dark/<pkg>/` +
 * `theme-neo-light/<pkg>/`). A naive "every package has a theme layer" rule is unimplementable —
 * structure/behavior packages (`layout`, `plugin`, `filter`, …) are legitimately theme-free — so
 * the guard carries an explicit baseline of known zero-coverage packages and fails on any NEW one.
 *
 * Three failure directions, because a baseline that only fails one way drifts into a record of
 * things that used to be true:
 *
 *   1. NEW zero-coverage package — a `src/` package with no theme values in either neo theme and
 *      no baseline row. This is the class that left `dashboard` (29 components, 14k LOC of visible
 *      chrome) unthemed in every theme while two apps painted over the gap.
 *   2. HALF-COVERED package — values in exactly one neo theme. A dashboard-class defect reads as
 *      "themed" in one mode and falls back to engine literals in the other; today no package is
 *      one-sided, and the guard keeps it that way.
 *   3. STALE baseline — a baselined package that gained coverage (burn-down: the row must leave
 *      with the gap) or whose package no longer exists. A baseline that cannot shrink stops
 *      measuring anything.
 *
 * `collectThemeCoverageFailures` is pure over the filesystem (injectable paths, no exit/log) so
 * the CLI wrapper and the isolated spec both drive it. All mechanical, not discipline.
 */
import fs              from 'fs';
import path            from 'path';
import {fileURLToPath} from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url)),
      repoRoot  = path.resolve(__dirname, '../..'),

      /**
       * The known zero-coverage packages, each with its one-line disposition. Adding a row here is
       * a design decision (the package renders no user-visible chrome of its own), recorded in the
       * same commit that creates the gap — the guard fails the commit otherwise.
       * @type {Object<String,String>}
       */
      BASELINE_ZERO_COVERAGE = {
          filter : 'data-filtering behavior package — renders no user-visible chrome of its own',
          global : 'engine resets/utilities — theme values live in the theme Global.scss + design-tokens layer',
          layout : 'flex/grid positioning only — structure, no paint',
          plugin : 'behavior augmentations — no chrome of its own',
          sitemap: 'single-file utility — no chrome of its own'
      },

      DEFAULT_PATHS = {
          srcDir  : path.join(repoRoot, 'resources/scss/src'),
          darkDir : path.join(repoRoot, 'resources/scss/theme-neo-dark'),
          lightDir: path.join(repoRoot, 'resources/scss/theme-neo-light')
      };

/**
 * @param {String} dir
 * @returns {Boolean} true when dir exists and holds at least one .scss file, recursively.
 */
function hasScss(dir) {
    if (!fs.existsSync(dir)) return false;

    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
        const full = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            if (hasScss(full)) return true;
        } else if (entry.name.endsWith('.scss')) {
            return true;
        }
    }

    return false;
}

/**
 * @summary Collect every theme-coverage violation for the given tree. Pure over the filesystem —
 * no process.exit, no logging.
 * @param {Object} [options]
 * @param {String} [options.srcDir]   the structure layer root (`resources/scss/src`)
 * @param {String} [options.darkDir]  theme-neo-dark root
 * @param {String} [options.lightDir] theme-neo-light root
 * @param {Object<String,String>} [options.baseline] known zero-coverage packages → justification
 * @returns {String[]} failure messages (empty array = clean)
 */
export function collectThemeCoverageFailures({
    srcDir   = DEFAULT_PATHS.srcDir,
    darkDir  = DEFAULT_PATHS.darkDir,
    lightDir = DEFAULT_PATHS.lightDir,
    baseline = BASELINE_ZERO_COVERAGE
} = {}) {
    const failures = [];

    // Fail closed on an unreadable structure root: an empty package list would otherwise report
    // a clean tree by construction — "read nothing" must never look like "clean".
    if (!fs.existsSync(srcDir)) {
        return [`[surface] structure root ${srcDir} is missing — coverage cannot be verified`];
    }

    const packages = fs.readdirSync(srcDir, {withFileTypes: true})
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name);

    // Same fail-closed on a suspiciously empty enumeration (a wrong path yields zero dirs).
    if (packages.length === 0) {
        return [`[surface] structure root ${srcDir} holds zero packages — coverage cannot be verified`];
    }

    for (const pkg of packages) {
        const dark  = hasScss(path.join(darkDir,  pkg)),
              light = hasScss(path.join(lightDir, pkg));

        if (dark && light) {
            if (pkg in baseline) {
                failures.push(`[burn-down] ${pkg} has theme coverage now — remove its baseline row so the recorded gap tracks reality`);
            }
        } else if (dark !== light) {
            failures.push(`[half-covered] ${pkg} has values in theme-neo-${dark ? 'dark' : 'light'} only — a standalone host under the other theme renders engine fallbacks`);
        } else if (!(pkg in baseline)) {
            failures.push(`[new-uncovered] ${pkg} is a src/ package with zero theme coverage and no baseline row — either add its theme-neo-dark + theme-neo-light values, or record it in the baseline with a one-line justification`);
        }
    }

    for (const pkg of Object.keys(baseline)) {
        if (!packages.includes(pkg)) {
            failures.push(`[stale-row] baseline names ${pkg} but resources/scss/src/${pkg} does not exist — remove the row`);
        }
    }

    return failures;
}

// ─────────────────────────────── CLI ───────────────────────────────
// Only when run directly (`node …/check-theme-coverage.mjs`), not when imported by the spec.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const failures = collectThemeCoverageFailures();

    if (failures.length) {
        console.error('✗ theme-coverage guard FAILED:\n');
        for (const failure of failures) console.error(`    ${failure}`);
        console.error('\n  [new-uncovered] a src/ package that renders chrome needs values in theme-neo-dark AND theme-neo-light, or a baselined justification.');
        console.error('  [half-covered]  values in one neo theme only — the other renders engine fallbacks.');
        console.error('  [burn-down]     a baselined gap that closed must leave the baseline in the same commit.');
        console.error('  [stale-row]     the baseline names packages that no longer exist.');
        process.exit(1);
    }

    console.log('✓ theme-coverage guard: every src/ package is themed in both neo themes or baselined with a justification.');
}
