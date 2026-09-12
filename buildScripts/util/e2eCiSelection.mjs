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
 *
 * An exclusion's `kind` is about the CAUSE, and it has three values because two were not enough.
 * `cause` and `observed` split "we know why" from "we do not", and both were honest — but an entry
 * marked `cause` was quietly claiming its reason covered EVERY failing arm in that file, and one of
 * them did not: it explained 8 of 11, while 3 arms needing nothing it mentioned failed anyway.
 * `partial` exists so a real-but-incomplete diagnosis cannot present itself as a complete one,
 * which is the same false reassurance as an undeclared exclusion wearing better clothes.
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
    // Named individually because both siblings in `e2e/portal` are excluded below. Neither of their
    // causes reaches this one: they fail hosted on live previews and content routing, and this arm
    // needs neither — it boots the portal root and reads `document.body`'s theme class. The sidebar
    // arm of `LearnLinkRoutingNL` already shows the portal itself booting on a hosted runner.
    'test/playwright/e2e/portal/StoredThemeBoot.spec.mjs',
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
    kind  : 'partial',
    reason: 'parameterised over Dev, Dist Dev and Dist Prod. The 8 Dist arms need built bundles this job does not produce, and that is verified. It does NOT cover everything: 3 of the 4 DEV arms, which need no build, also failed hosted while all 4 pass locally — so a build step alone would not return this file to the tier. Those 3 die on `.neo-code-live-preview` never becoming visible, and all 3 are the arms that visit `#/learn/benefits/body/FormsEngine`; the one Dev arm that never leaves the home route passes',
    owner : 'this tier for the Dist half; @neo-opus-ada for the 3 unexplained Dev arms'
}, {
    path  : 'test/playwright/e2e/portal/LearnLinkRoutingNL.spec.mjs',
    // `observed`, not `cause`: what is established is the BEHAVIOUR, not why it happens. Marking
    // this `cause` would repeat, on the entry being diagnosed, the exact overclaim `partial` was
    // added to stop on the entry beside it.
    kind  : 'observed',
    reason: 'on a hosted runner the click routes and the content has not followed within 30s — the trace shows the hash at the destination and the source `h1` still in place, with no console error and no failed request. Bounded deliberately: 30s is the longest window measured, so a slower-still arrival is not excluded, only a budget in the range anyone would wait; the sibling sidebar arm passes on the same runner',
    owner : '@neo-opus-ada — #18422 holds the measurement; the arm is correct and the divergence is not'
}, {
    path  : 'test/playwright/e2e/portal/LearnMermaidRender.spec.mjs',
    // `observed`, not `cause`: the PRECONDITION does not hold on a hosted runner. The arm now keys
    // that precondition on an INSTANTIATED Monaco editor being visible, which is the same observable
    // the neighbouring `LivePreviewMultiWindow` entry already measures failing hosted — an editor
    // exists only inside a live preview. So the two entries are one condition rather than two
    // plausibly-related ones, and they share a single return trigger. What is still NOT established
    // is WHY live previews do not come up hosted, which is why this stays `observed`.
    kind  : 'observed',
    reason: 'the arm asserts its own precondition — an instantiated, visible Monaco editor, since the defect it guards is mermaid\'s UMD `define` reaching a loader that is BUSY resolving a module — and hosted, live previews do not become visible, so it would fail at the precondition rather than at the behaviour. That is the assertion working: `define.amd` is true on every portal route including the ones that render perfectly, so an arm keyed on the loader merely EXISTING passes hosted while proving nothing. Red-first was verified LOCALLY in both directions against base `87e3786673`: repointing only `main/addon/Mermaid.mjs` back at `node_modules` turns the live-preview arm red at 0/1 diagrams while the no-editor control stays green at 2/2, and restoring it returns both to green',
    owner : '@neo-opus-ada — #18568 owns the fix this arm guards; returning it to the tier is the same trigger as the `LivePreviewMultiWindow` entry above, which #18427 is measuring'
}];

/**
 * Arms that ARE selected but skip themselves under `NEO_TEST_SKIP_CI`. Declared here as well as at
 * their call site so the job summary can name them: a quarantine that appears only as an anonymous
 * skip in a test log is the silent quarantine this file exists to prevent, and an owner is what
 * separates a debt marker from an abandonment.
 * @member {Object[]} QUARANTINES
 */
export const QUARANTINES = [];

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
            ({cause: '', observed: '**cause not established.** ', partial: '**cause covers only part of the failures.** '}[entry.kind]) +
            `${entry.reason}. Owner: ${entry.owner}.`),
        '',
        // Rendered only when the list has entries. An empty heading reads as "nothing to declare
        // here", which is the same reassurance an undeclared quarantine would give.
        ...(QUARANTINES.length ? [
            'Selected but quarantined — these run in the tier and skip themselves, so they appear as skips rather than coverage:',
            ...QUARANTINES.map(entry => `- \`${entry.path.replace('test/playwright/e2e/', '')}\` — ${entry.reason}. Owner: ${entry.owner}.`),
            ''
        ] : ['No arm in this tier is quarantined. Skips still in the log come from `test.fixme` contracts — rows declared but not yet written — which are a spec\'s own debt rather than a failure this job suppressed.', '']),
        // `total - executed`, never a sum of the named classes. The sum was `ignored + gpu`, which
        // omitted EXCLUSIONS and reported 89 where the header two paragraphs above said 14 of 105 —
        // a guard whose only job is accurate counting, contradicting itself. A corrected sum would
        // have the same defect one exclusion class later; a subtraction from the selected count
        // cannot drift, because both operands are the ones the header already stands behind.
        `**Selected is not executed.** This line reports what the job SELECTED; whether those specs ran and passed is the job's own status, because a provisioning failure reaches this summary too. A green check certifies the ${executed} selected files only — any skip inside them is accounted for above, while the ${total - executed} excluded files appear nowhere in the run at all.`
    ].join('\n')
}

/**
 * @summary One line stating what the run covers, for the job LOG rather than the step summary.
 *
 * The summary is the complete account and lives where a reader has to go looking for it. This is the
 * same arithmetic in one line, printed beside the work, so the number a reader meets first is the
 * accurate one. Both come from {@link populations}, so they cannot disagree.
 * @param {String} [root=process.cwd()]
 * @returns {String}
 */
export function coverageLine(root = process.cwd()) {
    const {executed, total} = populations(root);

    return `e2e coverage: ${executed} of ${total} spec files selected, ${total - executed} excluded. ` +
        `Excluded files are DESELECTED, not skipped — no reporter below can name them. ` +
        `The job summary lists every exclusion class and its owner.`
}

if (process.argv[1]?.endsWith('e2eCiSelection.mjs')) {
    const mode = process.argv[2];

    if (mode === '--coverage-line') {
        console.log(coverageLine());
        process.exit(0)
    }

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
