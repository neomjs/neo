import {execFileSync}                                                              from 'child_process';
import {existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync} from 'fs';
import {createRequire}                                                             from 'module';
import {tmpdir}                                                                    from 'os';
import {join, relative}                                                            from 'path';
import {selectExternalBrainSpecs}                                                  from '../../test/playwright/externalBrainSelection.mjs';
import {entryOf, FOUNDATION, RUNTIME_LOADING, SPEC_DIR, specReach}                 from './e2eSpecReach.mjs';
import isEntryModule                                                               from './isEntryModule.mjs';

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
 * - **GPU** — workstation specs that {@link RUN_PATHS} does not name: the app inherits animated
 *   OffscreenCanvas work no hosted runner can composite. The single-page Neural Link specs named
 *   there are the exception, because they run green hosted.
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
    'test/playwright/e2e/list',
    'test/playwright/e2e/neural-link',
    'test/playwright/e2e/portal',
    'test/playwright/e2e/realworld',
    'test/playwright/e2e/rendering/ButtonBaseNL.spec.mjs',
    'test/playwright/e2e/rendering/CalendarMonthEventDrag.spec.mjs',
    'test/playwright/e2e/rendering/CalendarMonthRollover.spec.mjs',
    'test/playwright/e2e/rendering/ContextMenuNL.spec.mjs',
    'test/playwright/e2e/rendering/DeltaCoherenceRegistryNL.spec.mjs',
    'test/playwright/e2e/rendering/DeltaUpdatesChangeNodeName.spec.mjs',
    'test/playwright/e2e/rendering/GraphScene.spec.mjs',
    'test/playwright/e2e/rendering/InputModalityMultiWindow.spec.mjs',
    'test/playwright/e2e/rendering/MarkdownStreamingCoherenceNL.spec.mjs',
    'test/playwright/e2e/rendering/MergedChildWindowId.spec.mjs',
    'test/playwright/e2e/rendering/MountHookIsolation.spec.mjs',
    'test/playwright/e2e/rendering/NativeSelectNL.spec.mjs',
    'test/playwright/e2e/rendering/NestedComponentsNL.spec.mjs',
    'test/playwright/e2e/rendering/SparseUpdatesNL.spec.mjs',
    'test/playwright/e2e/rendering/StoreLoadingNL.spec.mjs',
    'test/playwright/e2e/rendering/ViewTransitionReveal.spec.mjs',
    'test/playwright/e2e/tab',
    'test/playwright/e2e/table',
    'test/playwright/e2e/workstation/WorkstationCrossZoneCueNL.spec.mjs',
    'test/playwright/e2e/workstation/WorkstationDockFlipResizeNL.spec.mjs',
    'test/playwright/e2e/workstation/WorkstationDockSplitChromeNL.spec.mjs',
    'test/playwright/e2e/workstation/WorkstationDragTextSelectionNL.spec.mjs',
    'test/playwright/e2e/workstation/WorkstationEdgeSplitterNL.spec.mjs',
    'test/playwright/e2e/workstation/WorkstationFeedKeepsScrollNL.spec.mjs',
    'test/playwright/e2e/workstation/WorkstationFocusedTabOverflowNL.spec.mjs',
    'test/playwright/e2e/workstation/WorkstationGridRepaintNL.spec.mjs',
    'test/playwright/e2e/workstation/WorkstationGridUnconstrainedNL.spec.mjs',
    'test/playwright/e2e/workstation/WorkstationHeaderActionsHoverNL.spec.mjs',
    'test/playwright/e2e/workstation/WorkstationMaximizeOverflowMenuNL.spec.mjs',
    'test/playwright/e2e/workstation/WorkstationMaximizeTabReorderNL.spec.mjs',
    'test/playwright/e2e/workstation/WorkstationOffSocketContractNL.spec.mjs',
    'test/playwright/e2e/workstation/WorkstationOwnPaneEdgeDropNL.spec.mjs',
    'test/playwright/e2e/workstation/WorkstationRailsOutermostNL.spec.mjs',
    'test/playwright/e2e/workstation/WorkstationResidentCardSizingNL.spec.mjs',
    'test/playwright/e2e/workstation/WorkstationRootEdgeCornerNL.spec.mjs',
    'test/playwright/e2e/workstation/WorkstationSplitterGridGeometryNL.spec.mjs',
    'test/playwright/e2e/workstation/WorkstationStarvedTourNL.spec.mjs',
    'test/playwright/e2e/workstation/WorkstationTabDragHeadersStayNL.spec.mjs',
    'test/playwright/e2e/workstation/WorkstationTabDragLabelOverlapNL.spec.mjs',
    'test/playwright/e2e/workstation/WorkstationTabDragSiblingHoldsNL.spec.mjs',
    'test/playwright/e2e/workstation/WorkstationTabReorderNoFlashNL.spec.mjs',
    'test/playwright/e2e/workstation/WorkstationTabRestoreNL.spec.mjs',
    'test/playwright/e2e/workstation/WorkstationTourActivationNL.spec.mjs'
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
    reason: 'parameterised over Dev, Dist Dev and Dist Prod. The 8 Dist arms need built bundles this job does not produce, and that is verified. The 4 Dev arms pass hosted; the 3 that visit `#/learn/benefits/body/FormsEngine` had failed because its code fences waited on a highlight bundle this job did not build',
    owner : 'this tier — the Dist half needs a production build this job does not run'
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
 * Brain-gated tests that run hosted but fail there for a reason not yet diagnosed. Each is deselected by
 * file and title through Playwright's `--test-list-invert`, so no spec is edited. An entry names who is
 * accountable, what removes it and since when, and every receipt flags one older than
 * {@link QUARANTINE_STALE_DAYS} days: a quarantine without a retirement trigger becomes the permanent
 * exclusion it was meant to avoid.
 * @member {Object[]} BRAIN_QUARANTINES
 */
export const BRAIN_QUARANTINES = [{
    path       : 'test/playwright/e2e/workstation/WorkstationFilmTourNL.spec.mjs',
    titlePath  : ['Workstation — the film tour plays from the toolbar', 'Start film tour runs all scenes; the viewer\'s Continue clicks open every window'],
    reason     : 'hosted: journey hop 4 can refuse the drag while the vessel slot is free and no theme file is in flight (the hop diag), and the film arms take about three minutes of one shard\'s five-minute step',
    accountable: '@neo-opus-grace',
    exit       : '#19919: hop 4 diagnosed and fixed, and the spec fits its shard',
    since      : '2026-10-20'
}, {
    path       : 'test/playwright/e2e/workstation/WorkstationFilmTourNL.spec.mjs',
    titlePath  : ['Workstation — the film tour plays from the toolbar', 'under autoGates the film runs unattended: earlier windows close and the signature matrix stays open'],
    reason     : 'hosted: the same hop-4 refusal as the viewer-driven tour',
    accountable: '@neo-opus-grace',
    exit       : '#19919',
    since      : '2026-10-20'
}];

/**
 * Days a quarantine may stand before every receipt flags it as stale.
 * @member {Number} QUARANTINE_STALE_DAYS
 */
export const QUARANTINE_STALE_DAYS = 7;

/**
 * The Brain-gated tier's one-retry bridge while its intermittent set is diagnosed. It ends on `until` without anyone
 * editing it, the same way a quarantine ages. A retry runs in a fresh worker, so a cross-file leak always heals on
 * it. Every receipt therefore names each test that needed the retry, and a test red on every attempt stays red.
 * @member {Object} BRAIN_RETRY_BRIDGE
 */
export const BRAIN_RETRY_BRIDGE = {
    retries: 1,
    until  : '2026-10-25',
    reason : 'the intermittent set is still being diagnosed',
    tracker: '#19655'
};

/**
 * The Brain-gated files a pull request runs when its change is outside the E2E impact boundary
 * (`classify-test-scope.yml`'s `e2e_brain_tier`). Such a change cannot reach the tier's specs, so what can
 * still break is the pairing with the Brain's `dev` tip: one fast, stable file for each surface the tier covers,
 * none of them quarantined.
 * @member {String[]} BRAIN_SMOKE
 */
export const BRAIN_SMOKE = [
    'test/playwright/e2e/dashboard/DemoBPerspectiveToolsNL.spec.mjs',
    'test/playwright/e2e/dashboard/DockPlacementNL.spec.mjs',
    'test/playwright/e2e/neural-link/CreateComponentMultiWindow.spec.mjs',
    'test/playwright/e2e/neural-link/Fixture.spec.mjs',
    'test/playwright/e2e/workstation/WindowGeometryRealChromeNL.spec.mjs',
    'test/playwright/e2e/write-guard/MultiWriterNL.spec.mjs'
];

/**
 * The populations the Brain-gated tier can run, and why each is chosen.
 * @member {Object} BRAIN_TIERS
 */
export const BRAIN_TIERS = {
    full    : 'every Brain-gated file, because the change reaches the E2E impact boundary or this is a `dev` push',
    selected: 'the Brain-gated files a pull request\'s change can reach, plus the smoke files; a green selection is evidence for those files only, and the `dev` push runs the full tier',
    smoke   : `the ${BRAIN_SMOKE.length} smoke files, because the change is outside the E2E impact boundary; a green smoke is not full-tier evidence`
};

/**
 * The shard count each tier's full population runs on. A selection gets proportionally fewer shards, so each shard
 * keeps the test time a full run gives it: a smaller selection costs fewer jobs, not shorter ones.
 * @member {{brain: Number, engine: Number}} FULL_SHARDS
 */
export const FULL_SHARDS = {brain: 10, engine: 8};

/**
 * Measured seconds per Brain-gated spec file, which {@link balancedShard} balances the tier's shards by. Every receipt
 * prints its files' times, and `--brain-durations` turns a full-tier run's receipts back into this table; a file
 * the table does not list yet counts as its median.
 * @member {Object<String, Number>} BRAIN_DURATIONS
 */
export const BRAIN_DURATIONS = JSON.parse(readFileSync(new URL('./e2eBrainDurations.json', import.meta.url), 'utf8'));

/**
 * Measured seconds per engine-tier spec file, which {@link balancedShard} balances the tier's shards by.
 * `--engine-durations` rebuilds it from a full `dev` run's log (`gh run view <id> --log`); a file the table does not
 * list yet counts as its median.
 * @member {Object<String, Number>} ENGINE_DURATIONS
 */
export const ENGINE_DURATIONS = JSON.parse(readFileSync(new URL('./e2eEngineDurations.json', import.meta.url), 'utf8'));

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
 * @summary The spec files the engine tier executes, relative to the repository root.
 * @description Resolved through the SAME ignore set Playwright applies, because a directory in RUN_PATHS names
 * Brain-dependent specs the config will deselect. Counting what the paths name rather than what the run selects
 * reported 52 against an expected 14 — two different notions of "selected", which is the defect this file exists to
 * remove.
 * @param {String} [root=process.cwd()]
 * @returns {String[]}
 */
export function enginePaths(root = process.cwd()) {
    const {ignore} = selectExternalBrainSpecs(join(root, 'test/playwright/e2e'));

    return RUN_PATHS.flatMap(path => path.endsWith('.spec.mjs') ? [join(root, path)] : walk(join(root, path)))
        .filter(file => !ignore.some(pattern => pattern.test(file)))
        .map(file => relative(root, file))
        .sort()
}

/**
 * @summary The engine-tier files a run's paths name: a pull request's selected files, or {@link RUN_PATHS} with its
 * directories expanded, so a shard can be balanced file by file.
 * @param {Object}   options
 * @param {String[]} options.named The paths the job was handed, relative to the repository root.
 * @param {String}   [options.root=process.cwd()]
 * @returns {String[]} The engine-tier files they name, in path order.
 */
export function engineSelection({named, root = process.cwd()}) {
    return enginePaths(root).filter(file => named.some(path => file === path || file.startsWith(`${path}/`)))
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
          named           = new Set(RUN_PATHS.filter(path => path.endsWith('.spec.mjs')).map(path => join(root, path))),
          // Only the Brain-FREE workstation specs RUN_PATHS does not name; the rest are already
          // deselected or executed, and counting them again reports a negative coverage.
          gpu             = walk(join(e2e, 'workstation')).filter(file => !isIgnored(file) && !named.has(file)).length;

    return {brainFree: total - ignore.length, executed: enginePaths(root).length, gpu, ignored: ignore.length, total}
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

/**
 * @summary The Brain-gated spec files, relative to the repository root: every spec the `neuralLink`
 * fixture gates. `test-e2e-brain.yml` runs exactly these, with a Brain provisioned.
 * @param {String} [root=process.cwd()]
 * @returns {String[]}
 */
export function brainPaths(root = process.cwd()) {
    const e2e      = join(root, 'test/playwright/e2e'),
          {ignore} = selectExternalBrainSpecs(e2e);

    return walk(e2e).filter(file => ignore.some(pattern => pattern.test(file))).map(file => relative(root, file)).sort()
}

/**
 * @summary What a Brain-gated tier runs: every Brain-gated file, the pull request's selection of them, or the
 * smoke files. No Brain-gated file needs a Memory Core, so no file waits on a capability a runner may lack.
 * @param {Object}   [options]
 * @param {String}   [options.root=process.cwd()]
 * @param {String[]} [options.selected=[]] The pull request's selection, which the `selected` tier runs.
 * @param {String}   [options.tier='full'] A {@link BRAIN_TIERS} key
 * @returns {{gated: String[], paths: String[]}} Every Brain-gated file, and the files to run.
 * @throws {Error} For a tier that is not a {@link BRAIN_TIERS} key.
 */
export function brainSelection({root = process.cwd(), selected = [], tier = 'full'} = {}) {
    if (!Object.hasOwn(BRAIN_TIERS, tier)) {
        throw new Error(`Unknown Brain-gated tier '${tier}'; expected ${Object.keys(BRAIN_TIERS).join(' or ')}.`)
    }

    const gated = brainPaths(root),
          paths = {
              full    : gated,
              selected: gated.filter(path => selected.includes(path)),
              smoke   : gated.filter(path => BRAIN_SMOKE.includes(path))
          }[tier];

    return {gated, paths}
}

/**
 * @summary Reads a shard as `N/M`.
 * @param {String} shard
 * @returns {Number[]} `[N, M]`
 * @throws {Error} Unless 1 ≤ N ≤ M.
 */
function parseShard(shard) {
    const [, index, total] = /^(\d+)\/(\d+)$/.exec(String(shard)) ?? [];

    if (!(Number(index) >= 1 && Number(index) <= Number(total))) {
        throw new Error(`Shard '${shard}' is not N/M with 1 ≤ N ≤ M.`)
    }

    return [Number(index), Number(total)]
}

/**
 * @summary Seconds per spec file, a file the table does not list yet counting as the table's median.
 * @param {Object<String, Number>} durations
 * @returns {Function} `path => seconds`
 */
function durationOf(durations) {
    const known  = Object.values(durations).toSorted((a, b) => a - b),
          median = known.length ? known[Math.floor(known.length / 2)] : 0;

    return path => durations[path] ?? median
}

/**
 * @summary One shard of a tier's selection, balanced by measured time rather than by test count.
 * @description Playwright's own `--shard` gives each shard the same number of tests, and a test costs anything from
 * a few milliseconds to over a minute, so one shard can run past the ceiling while another idles. Here each file,
 * longest first, joins the shard with
 * the least time so far: equal times fall to the lower shard and equal files to path order, so every shard of a run
 * computes the same split and every selected file runs in exactly one of them.
 * @param {Object}   options
 * @param {String[]} options.paths The selection to split, relative to the repository root.
 * @param {String}   options.shard `N/M`, the shard to return.
 * @param {Object}   options.durations Seconds per file: {@link BRAIN_DURATIONS} or {@link ENGINE_DURATIONS}.
 * @returns {{paths: String[], seconds: Number}} The shard's files in path order, and their predicted seconds.
 * @throws {Error} For a shard that is not `N/M` with 1 ≤ N ≤ M.
 */
export function balancedShard({paths, shard, durations}) {
    const [index, total] = parseShard(shard),
          seconds        = durationOf(durations),
          shards         = Array.from({length: total}, () => ({paths: [], seconds: 0}));

    for (const path of paths.toSorted((a, b) => seconds(b) - seconds(a) || (a < b ? -1 : 1))) {
        const lightest = shards.reduce((min, candidate) => candidate.seconds < min.seconds ? candidate : min);

        lightest.paths.push(path);
        lightest.seconds += seconds(path)
    }

    return {paths: shards[index - 1].paths.toSorted(), seconds: Math.round(shards[index - 1].seconds)}
}

/**
 * @summary A file's measured seconds in a Playwright JSON report: every attempt of every test in it, retries included,
 * because the shard paid for those too.
 * @param {Object} suite One file's suite from the report.
 * @returns {Number} Seconds, to a tenth.
 */
function fileSeconds(suite) {
    const ms = node => (node.specs ?? []).flatMap(spec => spec.tests ?? []).flatMap(test => test.results ?? [])
        .reduce((sum, result) => sum + (result.duration ?? 0), 0) + (node.suites ?? []).reduce((sum, child) => sum + ms(child), 0);

    return Math.round(ms(suite) / 100) / 10
}

/**
 * @summary {@link BRAIN_DURATIONS} rebuilt from Brain-gated receipts, which print each file as `- \`file\` · N s`.
 * @param {String} text Any number of receipts, in any order; log prefixes before a line are ignored.
 * @returns {Object<String, Number>} Seconds per file, keyed by its repository path, in path order.
 */
export function brainDurations(text) {
    const table = {};

    for (const [, file, seconds] of text.matchAll(/- `([^`]+\.spec\.mjs)` · ([\d.]+) s$/gm)) {
        table[`test/playwright/e2e/${file}`] = Number(seconds)
    }

    return Object.fromEntries(Object.entries(table).toSorted(([a], [b]) => a < b ? -1 : 1))
}

/**
 * @summary {@link ENGINE_DURATIONS} rebuilt from engine-tier logs: what each file cost the shard that ran it, every
 * attempt included, because the shard paid for those too.
 * @description Playwright's list reporter prints a line as each test ends. In GitHub's run log every line carries its
 * job and a timestamp, so a test costs the time since the job's previous test ended, or since its run started: hooks
 * and fixtures included, which a test's own duration leaves out (a 3 ms test can end 15 s into its shard). A log
 * without timestamps falls back to the durations the lines print.
 * @param {String} text Any number of shards' logs; skipped tests, whose lines carry no duration, are ignored.
 * @returns {Object<String, Number>} Seconds per file to a tenth, keyed by its repository path, in path order.
 */
export function engineDurations(text) {
    const unit  = {ms: 0.001, s: 1, m: 60, h: 3600},
          ended = new Map(),
          table = {};

    for (const line of text.split('\n')) {
        const [, job, stamp] = /^([^\t]+)\t[^\t]*\t(\d{4}-\d\d-\d\dT[\d:.]+Z) /.exec(line) ?? [],
              at             = stamp && Date.parse(stamp) / 1000,
              test           = /› (\S+\.spec\.mjs):\d+:\d+ › .*\((\d+(?:\.\d+)?)(ms|s|m|h)\)[ \t\r]*$/.exec(line);

        if (test) {
            const [, file, value, scale] = test,
                  path                   = file.startsWith('test/playwright/e2e/') ? file : `test/playwright/e2e/${file}`;

            table[path] = (table[path] ?? 0) + (ended.has(job) ? at - ended.get(job) : Number(value) * unit[scale])
        }

        if (at && (test || /Running \d+ tests? using/.test(line))) {
            ended.set(job, at)
        }
    }

    return Object.fromEntries(Object.entries(table).toSorted(([a], [b]) => a < b ? -1 : 1)
        .map(([path, seconds]) => [path, Math.round(seconds * 10) / 10]))
}

/**
 * @summary Refuses a declaration whose file is no longer a Brain-gated spec, and a smoke file that is
 * quarantined, naming every such entry.
 * @description A deleted or moved file would otherwise leave an entry naming nothing while every receipt
 * went on listing it. A smoke file runs whole on every pull request, so a smoke receipt has no exclusion to
 * explain. Titles are {@link assertQuarantinesResolve}'s job.
 * @param {Object}   [options]
 * @param {Object[]} [options.quarantines=BRAIN_QUARANTINES]
 * @param {String[]} [options.smoke=BRAIN_SMOKE]
 * @param {String}   [options.root=process.cwd()]
 * @throws {Error} Naming every stale entry, or every declared smoke file.
 */
export function assertBrainDeclarations({quarantines = BRAIN_QUARANTINES, smoke = BRAIN_SMOKE, root = process.cwd()} = {}) {
    const gated    = brainPaths(root),
          declared = quarantines.map(entry => entry.path),
          stale    = [...declared, ...smoke].filter(path => !gated.includes(path)),
          unstable = smoke.filter(path => declared.includes(path));

    if (stale.length) {
        throw new Error(`Brain-gated e2e declarations name files that are not Brain-gated specs:\n- ${stale.join('\n- ')}\n` +
            'Update or remove them in buildScripts/util/e2eCiSelection.mjs.')
    }

    if (unstable.length) {
        throw new Error(`Brain-gated smoke files must run whole, but these are quarantined:\n- ${unstable.join('\n- ')}\n` +
            'Choose other smoke files in buildScripts/util/e2eCiSelection.mjs.')
    }
}

/**
 * @summary One quarantine entry as a Playwright test-list line: `file › describe › test`, the file relative to
 * the e2e `testDir`, which is how Playwright resolves it.
 * @param {Object} entry
 * @returns {String}
 */
function testListLine(entry) {
    return [entry.path.replace('test/playwright/e2e/', ''), ...entry.titlePath].join(' › ')
}

/**
 * @summary The quarantine as a Playwright test list for `--test-list-invert`.
 * @returns {String}
 */
export function brainTestList() {
    return BRAIN_QUARANTINES.map(testListLine).join('\n')
}

/**
 * @summary Asks Playwright which registered tests each quarantine entry selects, through its own `--list`
 * with the entry as the test list. Each entry must select exactly one.
 * @description A renamed title or a new enclosing `describe` leaves an entry selecting nothing while its
 * strings still appear in the source, so only Playwright's own matcher can tell. Listing loads the spec
 * files but no fixture, so any `NEO_AGENTOS_RUNTIME_ROOT` lifts the config's Brain deselection. The unit
 * tier runs this on every pull request, so the change that breaks an entry fails.
 * @param {Object}   [options]
 * @param {Object[]} [options.quarantines=BRAIN_QUARANTINES]
 * @param {String}   [options.root=process.cwd()]
 * @throws {Error} Naming every entry that does not select exactly one test.
 */
export function assertQuarantinesResolve({quarantines = BRAIN_QUARANTINES, root = process.cwd()} = {}) {
    const cli   = createRequire(import.meta.url).resolve('@playwright/test/cli'),
          dir   = mkdtempSync(join(tmpdir(), 'neo-brain-quarantine-')),
          list  = join(dir, 'entry.txt'),
          count = suite => (suite.specs?.length ?? 0) + (suite.suites ?? []).reduce((sum, child) => sum + count(child), 0),
          stale = [];

    try {
        for (const entry of quarantines) {
            writeFileSync(list, testListLine(entry) + '\n');

            const report = JSON.parse(execFileSync(process.execPath, [
                cli, 'test', '--config', 'test/playwright/playwright.config.e2e.mjs',
                '--list', '--reporter=json', '--test-list', list, entry.path
            ], {
                cwd  : root,
                env  : {...process.env, NEO_AGENTOS_RUNTIME_ROOT: process.env.NEO_AGENTOS_RUNTIME_ROOT || root},
                stdio: ['ignore', 'pipe', 'ignore']
            }).toString());

            count({suites: report.suites}) === 1 || stale.push(testListLine(entry))
        }
    } finally {
        rmSync(dir, {force: true, recursive: true})
    }

    if (stale.length) {
        throw new Error(`Brain-gated e2e quarantines do not select exactly one registered test:\n- ${stale.join('\n- ')}\n` +
            'Update or remove them in buildScripts/util/e2eCiSelection.mjs.')
    }
}

/**
 * @summary How many retries the Brain-gated tier runs with: the bridge's count through its end date, then none.
 * @param {Date} [now=new Date()]
 * @returns {Number}
 */
export function brainRetries(now = new Date()) {
    return now <= new Date(`${BRAIN_RETRY_BRIDGE.until}T23:59:59.999Z`) ? BRAIN_RETRY_BRIDGE.retries : 0
}

/**
 * @summary The first line of an attempt's recorded error, in whichever shape Playwright serialized it.
 * @description A thrown `Error` carries `message`; anything else thrown carries only `value`; and the
 * `errors` envelope can hold an error with no `error` field beside it. The first nonblank line among them
 * wins, so an empty field never hides a populated one. Only when all of them are blank did the attempt
 * record no error.
 * @param {Object|undefined} result One attempt from a Playwright JSON report.
 * @returns {String}
 */
function firstLine(result) {
    const error = result?.error,
          texts = [error?.message, error?.value, ...(result?.errors ?? []).map(entry => entry?.message), error?.stack];

    for (const text of texts) {
        const line = text?.replace(/\u001b\[[0-9;]*m/g, '').split('\n').find(line => line.trim());

        if (line) {
            return line
        }
    }

    return 'no error recorded'
}

/**
 * @summary The report's tests that failed an attempt and passed a later one, each with its first attempt's
 * error. A test red on every attempt is Playwright's `unexpected`, so it never appears here.
 * @param {Object} report A Playwright JSON report.
 * @returns {{error: String, file: String, title: String}[]}
 */
export function flakyTests(report) {
    const flaky = [],
          walk  = (suite, titles) => {
              for (const spec of suite.specs ?? []) {
                  for (const test of spec.tests ?? []) {
                      test.status === 'flaky' && flaky.push({
                          error: firstLine(test.results?.[0]),
                          file : spec.file,
                          title: [...titles, spec.title].join(' › ')
                      })
                  }
              }

              (suite.suites ?? []).forEach(child => walk(child, [...titles, child.title]))
          };

    report.suites.forEach(suite => walk(suite, []));

    return flaky
}

/**
 * @summary Renders one Brain-gated tier shard's receipt: the run's identity and tier, its test time against the
 * five-minute ceiling the engine tier keeps and the duration table's prediction for it, what the tier selected and
 * why anything is out, the retry bridge and every test that needed it, and the files the shard ran with their outcome
 * and measured seconds.
 * @param {Object}      options
 * @param {Object|null} options.report  The shard's Playwright JSON report, `null` when it wrote none.
 * @param {Object}      options.run     `{shard, event, attempt, engineSha, brainSha, tier}`; `tier` defaults to `full`
 * @param {Number|null} options.seconds The test step's wall time, `null` when the step did not finish.
 * @param {Number|null} [options.retries=null] The retry count the run step selected, `null` when it recorded
 *        none. Read from the run, never recomputed: a run that starts before the bridge ends and finishes
 *        after it still retried.
 * @param {Date}        [options.now=new Date()] What a quarantine's age is measured against.
 * @param {String}      [options.root=process.cwd()]
 * @returns {String}
 */
export function brainReceipt({report, run, seconds, retries = null, now = new Date(), root = process.cwd()}) {
    const {brainFree}            = populations(root),
          tier                   = run.tier ?? 'full',
          selected               = run.selected ?? [],
          {gated, paths}         = brainSelection({root, selected, tier}),
          // A selection explains the quarantines touching its own files. No declaration touches a smoke file
          // (assertBrainDeclarations), so a smoke receipt has none to explain
          inTier                 = path => tier === 'full' || (tier === 'selected' && selected.includes(path)),
          quarantines            = BRAIN_QUARANTINES.filter(entry => inTier(entry.path)),
          ceiling                = 300,
          predicted              = balancedShard({paths, shard: run.shard, durations: BRAIN_DURATIONS}).seconds,
          days                   = since => Math.floor((now - new Date(since)) / 86400000),
          minutes                = value => `${Math.floor(value / 60)}m ${value % 60}s`,
          short                  = path => `\`${path.replace('test/playwright/e2e/', '')}\``;

    return [
        `### Brain-gated e2e · ${tier} tier · shard ${run.shard}`,
        '',
        `- **Run:** ${run.event}, attempt ${run.attempt}`,
        `- **Tier:** ${tier} — ${BRAIN_TIERS[tier]}.`,
        `- **Engine:** \`${run.engineSha}\` · **Brain \`dev\` tip**, resolved once for every shard: \`${run.brainSha}\``,
        `- **Test time:** ${seconds === null
            ? 'none, because the step did not finish'
            : `${minutes(seconds)} against the ${minutes(ceiling)} ceiling${seconds > ceiling ? ' (**over**)' : ''}`}`,
        `- **Predicted:** ${minutes(predicted)} by the duration table, which \`--brain-durations\` rebuilds from these receipts.`,
        `- **Selected:** ${paths.length} of the ${gated.length} Brain-gated spec files, with ${quarantines.length} of their tests quarantined. The ${brainFree} Brain-free files are the engine tier's.`,
        ...quarantines.map(entry => `- **Quarantined:** ${short(entry.path)} › ${entry.titlePath.at(-1)} — ${entry.reason}. ` +
            `Accountable: ${entry.accountable}. Exit: ${entry.exit}. Since ${entry.since}, ${days(entry.since)} days` +
            `${days(entry.since) > QUARANTINE_STALE_DAYS ? ' (**stale**)' : ''}.`),
        retries === null
            ? '- **Retries:** unknown, because the run step recorded none.'
            : retries
                ? `- **Retries:** ${retries} for this run, from the bridge through ${BRAIN_RETRY_BRIDGE.until} (${BRAIN_RETRY_BRIDGE.tracker}), because ${BRAIN_RETRY_BRIDGE.reason}. A test red on every attempt stays red.`
                : `- **Retries:** none for this run. The bridge's last day is ${BRAIN_RETRY_BRIDGE.until}.`,
        // Without a report the shard's files are unknown, which is not the same as zero
        ...report ? [
            `- **This shard:** ${report.suites.length} files · ${report.stats.expected} passed, ${report.stats.unexpected} failed, ${report.stats.flaky} flaky, ${report.stats.skipped} skipped`,
            ...flakyTests(report).map(test => `- **Needed the retry:** \`${test.file}\` › ${test.title} — first attempt: ${test.error}`),
            '',
            ...report.suites.map(suite => `- \`${suite.file}\` · ${fileSeconds(suite)} s`)
        ] : ['- **This shard:** unknown, because the run wrote no Playwright report']
    ].join('\n')
}

/**
 * @summary What a pull request's change selects from the e2e specs, and why each selected spec is in.
 *
 * @description The whole population runs when the change can reach code the static map cannot follow:
 * - a foundation path, or a file that loads modules at runtime;
 * - a module no static edge names, since a computed import can still load it;
 * - a file the map cannot place, or one the tree no longer holds;
 * - e2e support that no spec imports.
 *
 * It also runs when every changed file is an e2e spec. Specs that share an app share its heap, so a spec can leak
 * state into its neighbours, and only a full run rules that out.
 *
 * Otherwise the selection is:
 * - each spec whose reach holds a changed file, or whose app fetches it (its data, its `index.html`);
 * - each changed spec;
 * - the specs the map cannot place, and {@link BRAIN_SMOKE}, which run with every selection.
 *
 * Only a pull request selects: a `dev` push runs every tier it admits in full.
 * @param {Object}   options
 * @param {String[]} options.changed The changed files the E2E impact boundary admits, relative to the repository root.
 * @param {String}   [options.root=process.cwd()]
 * @param {Object}   [options.map] `specReach()`'s result for `root`, computed when omitted.
 * @returns {{full: Boolean, reasons: String[], specs: Map<String, String>}} Whether the whole population runs and why,
 *          or else each selected spec with its reason.
 */
export function selectSpecs({changed, root = process.cwd(), map = specReach({root})}) {
    const reasons = [],
          specs   = new Map(),
          isSpec  = file => file.startsWith(SPEC_DIR) && file.endsWith('.spec.mjs'),
          select  = (spec, why) => specs.has(spec) || specs.set(spec, why);

    if (changed.length && changed.every(isSpec)) {
        return {full: true, reasons: ['every changed file is an e2e spec'], specs}
    }

    for (const file of changed) {
        const reached = [...map.specs].filter(([, {reach}]) => reach.has(file)).map(([spec]) => spec),
              // The app that fetches a non-module file of its own, such as its data or its index.html
              app     = /^(apps|examples)\//.test(file) && !file.endsWith('.mjs') ? entryOf(file.replace(/\.[^/.]+$/, ''), map.tracked) : null;

        if (FOUNDATION.some(rule => rule.test(file))) {
            reasons.push(`${file}: foundation`)
        } else if (!map.tracked.has(file)) {
            reasons.push(`${file}: not in the tree`)
        } else if (isSpec(file)) {
            select(file, 'changed spec')
        } else if (file.endsWith('.mjs') && existsSync(join(root, file)) && RUNTIME_LOADING.test(readFileSync(join(root, file), 'utf8'))) {
            // A file a sparse checkout left out is no module the map follows either, so it falls through to `unmapped`
            reasons.push(`${file}: loads modules at runtime`)
        } else if (reached.length) {
            reached.forEach(spec => select(spec, `reaches ${file}`))
        } else if (app) {
            map.specs.forEach(({entries}, spec) => entries.includes(app) && select(spec, `its app fetches ${file}`))
        } else {
            // Absence from every static closure proves nothing: a computed import (the docs app's examples tree,
            // `container.Base#loadItems`) can still load a module no literal path names, so the map cannot place it
            reasons.push(`${file}: ${file.startsWith('test/playwright/') ? 'e2e support no spec imports' :
                /^(apps|docs|examples|src)\/.*\.mjs$/.test(file) ? 'no static edge names it' : 'unmapped'}`)
        }
    }

    if (reasons.length) {
        return {full: true, reasons, specs: new Map()}
    }

    // A spec the map cannot place may reach any change the boundary admitted, even one no placed spec reaches
    if (changed.length) {
        BRAIN_SMOKE.forEach(spec => select(spec, 'BRAIN_SMOKE'));
        map.unnamed.forEach(spec => select(spec, 'the map cannot place it'))
    }

    return {full: false, reasons, specs}
}

/**
 * @summary Splits a selection into each tier's files, and sizes each tier's shard matrix to them.
 * @description Each shard of a selection keeps the test time a full run gives it, both tiers by measured seconds:
 * a file count would hand a selection of heavy files the full run's files per shard and more time per shard.
 * @param {Object}                      options
 * @param {Map<String, String>|Set<String>} options.specs The selected spec files.
 * @param {String}                      [options.root=process.cwd()]
 * @param {{brain: Object<String, Number>, engine: Object<String, Number>}} [options.durations] Seconds per file per
 *        tier, {@link BRAIN_DURATIONS} and {@link ENGINE_DURATIONS} by default.
 * @returns {{brain: {paths: String[], shards: Number}, engine: {paths: String[], shards: Number}}} A tier none of
 *          whose files is selected has zero shards.
 */
export function tierSelection({specs, root = process.cwd(), durations = {brain: BRAIN_DURATIONS, engine: ENGINE_DURATIONS}}) {
    // A tier with files keeps at least one shard, even when every file it runs measures zero seconds, and never more
    // shards than files: a shard without one fails its own `test -n` guard
    const tier = (all, full, table) => {
        const duration = durationOf(table),
              seconds  = paths => paths.reduce((sum, path) => sum + duration(path), 0),
              paths    = all.filter(path => specs.has(path)),
              whole    = seconds(all),
              share    = whole ? Math.ceil(full * seconds(paths) / whole) : full;

        return {paths, shards: paths.length && Math.max(1, Math.min(full, paths.length, share))}
    };

    return {
        brain : tier(brainPaths(root),  FULL_SHARDS.brain,  durations.brain),
        engine: tier(enginePaths(root), FULL_SHARDS.engine, durations.engine)
    }
}

/**
 * @summary A pull request's selection as `GITHUB_OUTPUT` lines for `classify-test-scope.yml`.
 * @description A full selection only reports its reasons: each tier then runs the population and matrix it runs
 * without a selection. Otherwise each tier gets its files and a matrix sized to them, and a tier with none is ruled
 * out (`run_e2e=false`, `e2e_brain_tier=none`).
 * @param {Object}   options
 * @param {String[]} options.changed The changed files the E2E impact boundary admits.
 * @param {String}   [options.root=process.cwd()]
 * @returns {String}
 */
export function selectionOutput({changed, root = process.cwd()}) {
    const {full, reasons, specs} = selectSpecs({changed, root}),
          short                  = path => `\`${path.replace(SPEC_DIR, '')}\``,
          lines                  = [`e2e_selection=${full ? 'full' : 'selected'}`];

    let report;

    if (full) {
        report = ['### e2e selection: every spec', '', 'The change can reach code the static map cannot follow:', '',
            ...reasons.map(reason => `- ${reason}`)]
    } else {
        const {brain, engine} = tierSelection({specs, root}),
              matrix          = shards => JSON.stringify(Array.from({length: shards}, (_, index) => index + 1));

        lines.push(
            `run_e2e=${engine.paths.length > 0}`,
            `e2e_brain_tier=${brain.paths.length ? 'selected' : 'none'}`,
            `e2e_engine_paths=${engine.paths.join(' ')}`,
            `e2e_engine_matrix=${matrix(engine.shards)}`,
            `e2e_engine_shards=[${engine.shards}]`,
            `e2e_brain_paths=${brain.paths.join(' ')}`,
            `e2e_brain_matrix=${matrix(brain.shards)}`,
            `e2e_brain_shards=[${brain.shards}]`
        );

        // Only a ruled-out tier prints it
        if (!engine.paths.length || !brain.paths.length) {
            lines.push('skip_reason=no spec in this tier can reach the change; the `dev` push runs it in full')
        }

        report = [`### e2e selection: ${specs.size} specs`, '',
            `The engine tier runs ${engine.paths.length} on ${engine.shards} of ${FULL_SHARDS.engine} shards; the ` +
            `Brain-gated tier runs ${brain.paths.length} on ${brain.shards} of ${FULL_SHARDS.brain}. The \`dev\` push runs both in full.`, '',
            ...[...specs].map(([spec, why]) => `- ${short(spec)}: ${why}`)]
    }

    return [...lines, 'e2e_selection_report<<NEO_E2E_SELECTION', ...report, 'NEO_E2E_SELECTION'].join('\n') + '\n'
}

if (isEntryModule(import.meta.url)) {
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
    } else if (mode === '--brain-paths') {
        assertBrainDeclarations();

        // With `SHARD` set, only that shard's files. The `selected` tier reads its files from `BRAIN_SELECTED`
        const {BRAIN_SELECTED, SHARD, TIER} = process.env,
              {paths}                       = brainSelection({selected: (BRAIN_SELECTED || '').split(' ').filter(Boolean), tier: TIER || 'full'});

        process.stdout.write((SHARD ? balancedShard({paths, shard: SHARD, durations: BRAIN_DURATIONS}).paths : paths).join(' '))
    } else if (mode === '--engine-paths') {
        // The engine files `TIER_PATHS` names; with `SHARD` set, only that shard's
        const {SHARD, TIER_PATHS} = process.env,
              paths               = engineSelection({named: (TIER_PATHS || '').split(' ').filter(Boolean)});

        process.stdout.write((SHARD ? balancedShard({paths, shard: SHARD, durations: ENGINE_DURATIONS}).paths : paths).join(' '))
    } else if (mode === '--engine-durations') {
        process.stdout.write(JSON.stringify(engineDurations(readFileSync(0, 'utf8')), null, 4) + '\n')
    } else if (mode === '--brain-durations') {
        process.stdout.write(JSON.stringify(brainDurations(readFileSync(0, 'utf8')), null, 4) + '\n')
    } else if (mode === '--brain-test-list') {
        process.stdout.write(brainTestList() + '\n')
    } else if (mode === '--brain-retries') {
        process.stdout.write(String(brainRetries()))
    } else if (mode === '--brain-receipt') {
        const {ATTEMPT, BRAIN_SELECTED, BRAIN_SHA, ENGINE_SHA, EVENT, REPORT, RETRIES, SHARD, TEST_SECONDS, TIER} = process.env;
        let   report                                                                                              = null;

        try {
            report = JSON.parse(readFileSync(REPORT, 'utf8'))
        } catch {}

        process.stdout.write(brainReceipt({
            report,
            run    : {
                shard   : SHARD, event: EVENT, attempt: ATTEMPT, engineSha: ENGINE_SHA, brainSha: BRAIN_SHA, tier: TIER || 'full',
                selected: (BRAIN_SELECTED || '').split(' ').filter(Boolean)
            },
            retries: RETRIES ? Number(RETRIES) : null,
            seconds: TEST_SECONDS ? Number(TEST_SECONDS) : null
        }) + '\n')
    } else if (mode === '--select') {
        // The changed files the E2E impact boundary admits, as JSON, because a path list is not shell-safe
        process.stdout.write(selectionOutput({changed: JSON.parse(process.env.E2E_FILES || '[]')}))
    } else {
        console.error('usage: e2eCiSelection.mjs --paths | --summary | --engine-paths | --engine-durations | --brain-paths | --brain-durations | --brain-test-list | --brain-retries | --brain-receipt | --select');
        process.exit(2)
    }
}
