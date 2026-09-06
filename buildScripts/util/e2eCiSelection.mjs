import {readdirSync}              from 'fs';
import {join}                     from 'path';
import {selectExternalBrainSpecs} from '../../test/playwright/externalBrainSelection.mjs';

/**
 * @summary The one place that decides which e2e specs the CI tier runs, and the one place that
 * reports what that decision covered.
 *
 * @description Both halves live here on purpose. The workflow previously carried the spec paths in
 * its run step and re-derived the counts in a separate arithmetic reporter, so the two could drift
 * and the summary could describe a selection nobody ran. `--paths` and `--summary` now read the same
 * constants, and {@link assertSelectionFloor} fails the job if the executed population shrinks
 * below what this file declares — a new exclusion has to be written down here to take effect.
 *
 * Three populations are excluded, and they are not the same kind of thing:
 *
 * - **Brain-dependent** — removed by `testIgnore` in `playwright.config.e2e.mjs`, which deselects
 *   rather than skips: no reporter can name them, and a run missing four fifths of the tier still
 *   prints `Skipped: 0`. That invisibility is why this file reports the fraction at all.
 * - **GPU** — specs booting the workstation app, which inherits animated OffscreenCanvas work no
 *   hosted runner can composite.
 * - **Observed failures** — arms that fail for reasons NOT established here. They carry an owner
 *   rather than a diagnosis, because naming an unverified cause is worse than admitting one is
 *   missing.
 */

/**
 * Spec paths the CI tier executes, relative to the repository root. Directories expand to every
 * spec beneath them; individual files are named where a sibling in the same directory is excluded.
 * @member {String[]} RUN_PATHS
 */
export const RUN_PATHS = [
    'test/playwright/e2e/colors',
    'test/playwright/e2e/core',
    'test/playwright/e2e/dashboard',
    'test/playwright/e2e/grid',
    'test/playwright/e2e/rendering/InputModalityMultiWindow.spec.mjs',
    'test/playwright/e2e/rendering/ViewTransitionReveal.spec.mjs'
];

/**
 * Specs deliberately outside {@link RUN_PATHS}, each with the reason it is out and who owns getting
 * it back. `cause` is stated only where it was verified; `observed` records a failure whose cause is
 * NOT established, which is a different and more honest claim.
 * @member {Object[]} EXCLUSIONS
 */
export const EXCLUSIONS = [{
    path  : 'test/playwright/e2e/rendering/LivePreviewMultiWindow.spec.mjs',
    kind  : 'cause',
    reason: 'parameterised over Dev, Dist Dev and Dist Prod; the Dist environments need built bundles this job does not produce, so each arm burns its full 30s timeout',
    owner : 'this tier, the day the pipeline can afford a build step'
}, {
    path  : 'test/playwright/e2e/portal/LearnLinkRoutingNL.spec.mjs',
    kind  : 'observed',
    reason: 'fails on a hosted runner asserting the destination guide heading; the guide and the learn index are BOTH tracked, so "needs generated content" was wrong and no verified cause has replaced it',
    owner : '@neo-opus-ada — diagnose or hand over; excluded rather than diagnosed'
}];

/**
 * Arms that ARE selected but skip themselves under `NEO_TEST_SKIP_CI`. Declared here as well as at
 * their call site so the job summary can name them: a quarantine that appears only as an anonymous
 * skip in a test log is the silent quarantine this file exists to prevent, and an owner is what
 * separates a debt marker from an abandonment.
 * @member {Object[]} QUARANTINES
 */
export const QUARANTINES = [{
    path  : 'test/playwright/e2e/dashboard/DockSplitterProxyPaintNL.spec.mjs',
    reason: 'crossing the drag threshold creates no splitter proxy; reproduced serially at low load and headed on a real GPU, so neither contention nor a compositor gap',
    owner : '@neo-opus-ada — holds the repair; the guard is a debt marker, and removing it is the fix'
}];

/**
 * @summary Walks a directory for spec files.
 * @param {String} dir
 * @returns {String[]}
 */
function walk(dir) {
    return readdirSync(dir, {withFileTypes: true}).flatMap(entry => entry.isDirectory()
        ? walk(join(dir, entry.name))
        : entry.name.endsWith('.spec.mjs') ? [join(dir, entry.name)] : [])
}

/**
 * @summary Counts every population the reader needs to tell a partial green from a whole one.
 * @param {String} [root=process.cwd()]
 * @returns {{brainFree: Number, executed: Number, gpu: Number, ignored: Number, total: Number}}
 */
export function populations(root = process.cwd()) {
    const e2e             = join(root, 'test/playwright/e2e'),
          {ignore, total} = selectExternalBrainSpecs(e2e),
          isIgnored       = file => ignore.some(pattern => pattern.test(file)),
          // Only the Brain-FREE workstation specs; the rest are already deselected, and counting
          // them again reports a negative coverage.
          gpu             = walk(join(e2e, 'workstation')).filter(file => !isIgnored(file)).length,
          // Counted through the SAME ignore set Playwright applies, because a directory in
          // RUN_PATHS names Brain-dependent specs the config will deselect. Counting what the paths
          // name rather than what the run selects reported 52 against an expected 14 — two
          // different notions of "selected", which is the defect this file exists to remove.
          executed        = RUN_PATHS.flatMap(path => path.endsWith('.spec.mjs')
              ? [join(root, path)]
              : walk(join(root, path))).filter(file => !isIgnored(file)).length;

    return {brainFree: total - ignore.length, executed, gpu, ignored: ignore.length, total}
}

/**
 * @summary Refuses a run whose executed population is smaller than this file declares.
 * @description Without it, a path typo or a directory rename shrinks coverage silently and the job
 * still reports green — the failure mode a coverage line alone cannot catch, because it would
 * faithfully report the smaller number.
 * @param {String} [root=process.cwd()]
 * @returns {Number} The executed spec-file count.
 * @throws {Error} When fewer specs are selected than declared.
 */
export function assertSelectionFloor(root = process.cwd()) {
    const {brainFree, executed, gpu} = populations(root),
          expected                   = brainFree - gpu - EXCLUSIONS.length;

    if (executed !== expected) {
        throw new Error(`e2e CI selection: expected ${expected} spec files (${brainFree} Brain-free ` +
            `− ${gpu} GPU − ${EXCLUSIONS.length} excluded) but RUN_PATHS resolves ${executed}. ` +
            'Either a path is stale or an exclusion is undeclared; both are silent coverage loss.')
    }

    return executed
}

/**
 * @summary Renders the job-summary markdown.
 * @param {String} [root=process.cwd()]
 * @returns {String}
 */
export function summary(root = process.cwd()) {
    const {brainFree, executed, gpu, ignored, total} = populations(root);

    return [
        '### e2e (engine tier) coverage',
        '',
        `This job selected **${executed} of ${total}** e2e spec files.`,
        '',
        `- **${ignored}** need an external \`neo-agent-brain\` checkout. \`testIgnore\` DESELECTS them, so they cannot appear as skips in any report — a run missing them still prints \`Skipped: 0\`.`,
        `- **${gpu}** boot the workstation app, which inherits animated OffscreenCanvas work a hosted runner cannot composite.`,
        ...EXCLUSIONS.map(entry => `- \`${entry.path.replace('test/playwright/e2e/', '')}\` — ` +
            (entry.kind === 'cause' ? '' : '**cause not established.** ') + `${entry.reason}. Owner: ${entry.owner}.`),
        '',
        `Selected but quarantined — these run in the tier and skip themselves, so they appear as skips rather than coverage:`,
        ...QUARANTINES.map(entry => `- \`${entry.path.replace('test/playwright/e2e/', '')}\` — ${entry.reason}. Owner: ${entry.owner}.`),
        '',
        `**Selected is not executed.** This line reports what the job SELECTED; whether those specs ran and passed is the job's own status, because a provisioning failure reaches this summary too. A green check certifies the ${executed} selected files only — quarantined arms inside them appear as skips with a reason, while the ${ignored + gpu} above appear nowhere.`
    ].join('\n')
}

if (process.argv[1]?.endsWith('e2eCiSelection.mjs')) {
    const mode = process.argv[2];

    if (mode === '--paths') {
        assertSelectionFloor();
        process.stdout.write(RUN_PATHS.join(' '))
    } else if (mode === '--summary') {
        process.stdout.write(summary() + '\n')
    } else {
        console.error('usage: e2eCiSelection.mjs --paths | --summary');
        process.exit(2)
    }
}
