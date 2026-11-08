import {existsSync, readdirSync, readFileSync}                     from 'fs';
import {join, relative, sep}                                       from 'path';
import {selectExternalBrainSpecs}                                  from '../../test/playwright/externalBrainSelection.mjs';
import {entryOf, FOUNDATION, RUNTIME_LOADING, SPEC_DIR, specReach} from './e2eSpecReach.mjs';
import isEntryModule                                               from './isEntryModule.mjs';

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
 *   rather than skips: no reporter can name them, and a run missing part of the tier still
 *   prints `Skipped: 0`. That invisibility is why this file reports the fraction at all. They run
 *   only where `NEO_AGENTOS_RUNTIME_ROOT` names a Brain checkout, which no CI test job provisions,
 *   so {@link LOCAL_ONLY} states the reason for each.
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
    'test/playwright/e2e/rendering/FocusHistoryMultiWindowNL.spec.mjs',
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
    'test/playwright/e2e/workstation/DockSplitterZoneIdNL.spec.mjs',
    'test/playwright/e2e/workstation/VesselClosesMidFirstRenderNL.spec.mjs',
    'test/playwright/e2e/workstation/VesselNativeRouteNL.spec.mjs',
    'test/playwright/e2e/workstation/WindowGeometryRealChromeNL.spec.mjs',
    'test/playwright/e2e/workstation/WorkstationCrossZoneCueNL.spec.mjs',
    'test/playwright/e2e/workstation/WorkstationDockFlipResizeNL.spec.mjs',
    'test/playwright/e2e/workstation/WorkstationDockPreviewSymmetryNL.spec.mjs',
    'test/playwright/e2e/workstation/WorkstationDockSplitChromeNL.spec.mjs',
    'test/playwright/e2e/workstation/WorkstationDragAffordancesNL.spec.mjs',
    'test/playwright/e2e/workstation/WorkstationDragTextSelectionNL.spec.mjs',
    'test/playwright/e2e/workstation/WorkstationEdgeSplitterNL.spec.mjs',
    'test/playwright/e2e/workstation/WorkstationFeedKeepsScrollNL.spec.mjs',
    'test/playwright/e2e/workstation/WorkstationFilmTourNL.spec.mjs',
    'test/playwright/e2e/workstation/WorkstationFiveBeatNL.spec.mjs',
    'test/playwright/e2e/workstation/WorkstationFocusedTabOverflowNL.spec.mjs',
    'test/playwright/e2e/workstation/WorkstationGridRepaintNL.spec.mjs',
    'test/playwright/e2e/workstation/WorkstationGridUnconstrainedNL.spec.mjs',
    'test/playwright/e2e/workstation/WorkstationHeaderActionsHoverNL.spec.mjs',
    'test/playwright/e2e/workstation/WorkstationHeaderStatePopOutNL.spec.mjs',
    'test/playwright/e2e/workstation/WorkstationHumanPopupOverlapNL.spec.mjs',
    'test/playwright/e2e/workstation/WorkstationMaximizeOverflowMenuNL.spec.mjs',
    'test/playwright/e2e/workstation/WorkstationMaximizeTabOverflowNL.spec.mjs',
    'test/playwright/e2e/workstation/WorkstationMaximizeTabReorderNL.spec.mjs',
    'test/playwright/e2e/workstation/WorkstationNL.spec.mjs',
    'test/playwright/e2e/workstation/WorkstationNativePopupOverPopupNL.spec.mjs',
    'test/playwright/e2e/workstation/WorkstationNativeTitlebarDragNL.spec.mjs',
    'test/playwright/e2e/workstation/WorkstationNestedColumnResizeNL.spec.mjs',
    'test/playwright/e2e/workstation/WorkstationOffSocketContractNL.spec.mjs',
    'test/playwright/e2e/workstation/WorkstationOwnPaneEdgeDropNL.spec.mjs',
    'test/playwright/e2e/workstation/WorkstationPopOutHoverSyncNL.spec.mjs',
    'test/playwright/e2e/workstation/WorkstationPopOutPaneIdentityNL.spec.mjs',
    'test/playwright/e2e/workstation/WorkstationPopOutSparklinesNL.spec.mjs',
    'test/playwright/e2e/workstation/WorkstationPopupGridScrollNL.spec.mjs',
    'test/playwright/e2e/workstation/WorkstationPopupReturnNL.spec.mjs',
    'test/playwright/e2e/workstation/WorkstationPopupTabDragNL.spec.mjs',
    'test/playwright/e2e/workstation/WorkstationPopupTargetCloseNL.spec.mjs',
    'test/playwright/e2e/workstation/WorkstationRailsOutermostNL.spec.mjs',
    'test/playwright/e2e/workstation/WorkstationReclaimEmbodimentNL.spec.mjs',
    'test/playwright/e2e/workstation/WorkstationReopenedPopupReturnNL.spec.mjs',
    'test/playwright/e2e/workstation/WorkstationResidentCardSizingNL.spec.mjs',
    'test/playwright/e2e/workstation/WorkstationRootEdgeCornerNL.spec.mjs',
    'test/playwright/e2e/workstation/WorkstationSplitterGridGeometryNL.spec.mjs',
    'test/playwright/e2e/workstation/WorkstationStackReturnSplitNL.spec.mjs',
    'test/playwright/e2e/workstation/WorkstationStarvedTourNL.spec.mjs',
    'test/playwright/e2e/workstation/WorkstationTabDragHeadersStayNL.spec.mjs',
    'test/playwright/e2e/workstation/WorkstationTabDragLabelOverlapNL.spec.mjs',
    'test/playwright/e2e/workstation/WorkstationTabDragSiblingHoldsNL.spec.mjs',
    'test/playwright/e2e/workstation/WorkstationTabOverflowCapNL.spec.mjs',
    'test/playwright/e2e/workstation/WorkstationTabReorderNoFlashNL.spec.mjs',
    'test/playwright/e2e/workstation/WorkstationTabRestoreNL.spec.mjs',
    'test/playwright/e2e/workstation/WorkstationTearOutLateReleaseNL.spec.mjs',
    'test/playwright/e2e/workstation/WorkstationTearOutSourceContinuityNL.spec.mjs',
    'test/playwright/e2e/workstation/WorkstationTourActivationNL.spec.mjs',
    'test/playwright/e2e/workstation/WorkstationTransferIntoVesselHeaderNL.spec.mjs',
    'test/playwright/e2e/workstation/WorkstationTwoRootsDragNL.spec.mjs',
    'test/playwright/e2e/workstation/WorkstationUndoEmptiedPopupNL.spec.mjs'
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
 * The Brain-dependent specs, by reason. `testIgnore` deselects them unless a Brain checkout is present, so no CI job
 * runs them, and {@link assertSelectionFloor} holds this list to exactly the specs it deselects: a new Neural Link
 * spec joins `ADAPTER_ELIGIBLE_SPECS` or states here why it stays local. Paths are relative to `test/playwright/e2e`.
 * A class that is debt rather than design names its owner.
 * @member {Object[]} LOCAL_ONLY
 */
export const LOCAL_ONLY = [{
    kind  : 'cause',
    reason: 'They test the WebSocket Bridge itself: its sessions, a child app\'s connect and writer arbitration',
    specs : [
        'neural-link/ChildappConnect.spec.mjs',
        'neural-link/Fixture.spec.mjs',
        'write-guard/DisconnectReleaseNL.spec.mjs',
        'write-guard/MultiWriterNL.spec.mjs'
    ]
}, {
    kind  : 'cause',
    reason: 'They import Brain services (`loadNeuralLinkModules`): the instance and component tools, the dock transaction archive and the perspective tools',
    specs : [
        'dashboard/DemoBDockTransactionsNL.spec.mjs',
        'dashboard/DemoBPerspectiveToolsNL.spec.mjs',
        'dashboard/DockNativeWorkspaceReturnNL.spec.mjs',
        'neural-link/CreateComponentMultiWindow.spec.mjs',
        'neural-link/CreateInstance.spec.mjs',
        'workstation/WorkstationPerspectivesNL.spec.mjs'
    ]
}, {
    kind  : 'cause',
    reason: 'They cold-boot the Workstation in a second browser context and bind it by its App Worker id (`connectToApp(workerId)`), and the off-socket adapter reaches only the fixture\'s own page',
    owner : '#20614',
    specs : [
        'workstation/WorkstationResetSurvivesReloadNL.spec.mjs',
        'workstation/WorkstationTopologyGroupsNL.spec.mjs'
    ]
}];

/**
 * What the summary prints before a reason, by its `kind`.
 * @member {Object<String, String>} CAUSE_NOTE
 */
const CAUSE_NOTE = {cause: '', observed: '**cause not established.** ', partial: '**cause covers only part of the failures.** '};

/**
 * Arms that ARE selected but skip themselves under `NEO_TEST_SKIP_CI`. Declared here as well as at
 * their call site so the job summary can name them: a quarantine that appears only as an anonymous
 * skip in a test log is the silent quarantine this file exists to prevent, and an owner is what
 * separates a debt marker from an abandonment.
 * @member {Object[]} QUARANTINES
 */
export const QUARANTINES = [];

/**
 * The shard count the engine tier's full population runs on. A selection gets proportionally fewer shards, so each
 * shard keeps the test time a full run gives it: a smaller selection costs fewer jobs, not shorter ones.
 * @member {{engine: Number}} FULL_SHARDS
 */
export const FULL_SHARDS = {engine: 14};

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
          excluded        = new Set(EXCLUSIONS.map(entry => join(root, entry.path))),
          // Only the Brain-FREE workstation specs RUN_PATHS does not name and no exclusion declares; the rest are
          // already deselected, executed or declared, and counting them again reports a negative coverage.
          gpu             = walk(join(e2e, 'workstation')).filter(file => !isIgnored(file) && !named.has(file) && !excluded.has(file)).length;

    return {brainFree: total - ignore.length, executed: enginePaths(root).length, gpu, ignored: ignore.length, total}
}

/**
 * @summary Refuses a run whose executed population is smaller than this file declares.
 * @description Without it, a path typo or a directory rename shrinks coverage silently and the job
 * still reports green — the failure mode a coverage line alone cannot catch, because it would
 * faithfully report the smaller number. A Brain-gated spec missing from {@link LOCAL_ONLY} is the
 * same loss one step earlier: no CI job would ever run it, and nothing would say so.
 * @param {String} [root=process.cwd()]
 * @returns {Number} The executed spec-file count.
 * @throws {Error} When {@link LOCAL_ONLY} differs from the deselected specs, or fewer specs are
 * selected than declared.
 */
export function assertSelectionFloor(root = process.cwd()) {
    const {undeclared, stale} = localOnlyAccount(root);

    if (undeclared.length || stale.length) {
        throw new Error('e2e CI selection: LOCAL_ONLY must name exactly the specs testIgnore deselects. ' +
            `Undeclared: ${undeclared.join(', ') || 'none'}. Declared but not deselected: ${stale.join(', ') || 'none'}. ` +
            'No CI job runs a deselected spec, so each joins ADAPTER_ELIGIBLE_SPECS or states why it stays local.')
    }

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
 * @summary Holds {@link LOCAL_ONLY} against the specs `testIgnore` deselects, both ways.
 * @param {String} [root=process.cwd()]
 * @returns {{undeclared: String[], stale: String[]}} Deselected specs no entry names, and named specs the selection
 * does not deselect, relative to `test/playwright/e2e`.
 */
export function localOnlyAccount(root = process.cwd()) {
    const e2e      = join(root, 'test/playwright/e2e'),
          {ignore} = selectExternalBrainSpecs(e2e),
          gated    = walk(e2e).filter(file => ignore.some(pattern => pattern.test(file))).map(file => relative(e2e, file).split(sep).join('/')),
          declared = LOCAL_ONLY.flatMap(group => group.specs);

    return {
        undeclared: gated.filter(spec => !declared.includes(spec)).sort(),
        stale     : declared.filter(spec => !gated.includes(spec)).sort()
    }
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
        `- **${ignored}** need an external \`neo-agent-brain\` checkout, which no CI test job provisions, so they run only locally. \`testIgnore\` DESELECTS them, so they cannot appear as skips in any report — a run missing them still prints \`Skipped: 0\`:`,
        ...LOCAL_ONLY.map(group => `  - **${group.specs.length}** — ${CAUSE_NOTE[group.kind]}${group.reason}.` +
            `${group.owner ? ` Owner: ${group.owner}.` : ''} ${group.specs.map(spec => `\`${spec}\``).join(', ')}.`),
        `- **${gpu}** boot the workstation app, which inherits animated OffscreenCanvas work a hosted runner cannot composite.`,
        ...EXCLUSIONS.map(entry => `- \`${entry.path.replace('test/playwright/e2e/', '')}\` — ` +
            `${CAUSE_NOTE[entry.kind]}${entry.reason}. Owner: ${entry.owner}.`),
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
 * @param {Object}   options.durations Seconds per file, such as {@link ENGINE_DURATIONS}.
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
 * - the specs the map cannot place, which run with every selection.
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
        map.unnamed.forEach(spec => select(spec, 'the map cannot place it'))
    }

    return {full: false, reasons, specs}
}

/**
 * @summary The engine tier's files in a selection, and a shard matrix sized to them.
 * @description Each shard of a selection keeps the test time a full run gives it, by measured seconds: a file count
 * would hand a selection of heavy files the full run's files per shard and more time per shard.
 * @param {Object}                           options
 * @param {Map<String, String>|Set<String>}  options.specs The selected spec files.
 * @param {String}                           [options.root=process.cwd()]
 * @param {{engine: Object<String, Number>}} [options.durations] Seconds per file, {@link ENGINE_DURATIONS} by default.
 * @returns {{engine: {paths: String[], shards: Number}}} Zero shards when none of the tier's files is selected.
 */
export function tierSelection({specs, root = process.cwd(), durations = {engine: ENGINE_DURATIONS}}) {
    // The tier keeps at least one shard when it has files, even when every file it runs measures zero seconds, and
    // never more shards than files: a shard without one fails its own `test -n` guard
    const duration = durationOf(durations.engine),
          seconds  = paths => paths.reduce((sum, path) => sum + duration(path), 0),
          all      = enginePaths(root),
          paths    = all.filter(path => specs.has(path)),
          whole    = seconds(all),
          share    = whole ? Math.ceil(FULL_SHARDS.engine * seconds(paths) / whole) : FULL_SHARDS.engine;

    return {engine: {paths, shards: paths.length && Math.max(1, Math.min(FULL_SHARDS.engine, paths.length, share))}}
}

/**
 * @summary A pull request's selection as `GITHUB_OUTPUT` lines for `classify-test-scope.yml`.
 * @description A full selection only reports its reasons: the engine tier then runs the population and matrix it
 * runs without a selection. Otherwise it gets its files and a matrix sized to them, and is ruled out with none
 * (`run_e2e=false`).
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
        const {engine} = tierSelection({specs, root}),
              matrix   = shards => JSON.stringify(Array.from({length: shards}, (_, index) => index + 1));

        lines.push(
            `run_e2e=${engine.paths.length > 0}`,
            `e2e_engine_paths=${engine.paths.join(' ')}`,
            `e2e_engine_matrix=${matrix(engine.shards)}`,
            `e2e_engine_shards=[${engine.shards}]`
        );

        // Only a ruled-out tier prints it
        if (!engine.paths.length) {
            lines.push('skip_reason=no spec in this tier can reach the change; the `dev` push runs it in full')
        }

        // Only the files the tier runs: a selected spec outside it (a local-only one) runs in no job
        report = [`### e2e selection: ${engine.paths.length} specs`, '',
            `The engine tier runs them on ${engine.shards} of ${FULL_SHARDS.engine} shards. The \`dev\` push runs it in full.`, '',
            ...[...specs].filter(([spec]) => engine.paths.includes(spec)).map(([spec, why]) => `- ${short(spec)}: ${why}`)]
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
    } else if (mode === '--engine-paths') {
        // The engine files `TIER_PATHS` names; with `SHARD` set, only that shard's
        const {SHARD, TIER_PATHS} = process.env,
              paths               = engineSelection({named: (TIER_PATHS || '').split(' ').filter(Boolean)});

        process.stdout.write((SHARD ? balancedShard({paths, shard: SHARD, durations: ENGINE_DURATIONS}).paths : paths).join(' '))
    } else if (mode === '--engine-durations') {
        process.stdout.write(JSON.stringify(engineDurations(readFileSync(0, 'utf8')), null, 4) + '\n')
    } else if (mode === '--select') {
        // The changed files the E2E impact boundary admits, as JSON, because a path list is not shell-safe
        process.stdout.write(selectionOutput({changed: JSON.parse(process.env.E2E_FILES || '[]')}))
    } else {
        console.error('usage: e2eCiSelection.mjs --coverage-line | --paths | --summary | --engine-paths | --engine-durations | --select');
        process.exit(2)
    }
}
