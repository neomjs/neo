import fs   from 'node:fs';
import path from 'node:path';

/**
 * @summary Whitebox e2e specs (relative to `test/playwright/e2e`, POSIX-normalized) that can run
 * through the off-socket Neural Link test adapter, on the page's own App Worker, without an external
 * `neo-agent-brain` checkout or WebSocket Bridge.
 *
 * A spec is adapter-eligible iff all four structural properties hold:
 * 1. **Single app** — each test binds to one page's App Worker via `runDedicatedWorkerNeuralLink`.
 * 2. **The page's own App Worker** — a dedicated App Worker, or, for an app whose `neo-config.json`
 *    sets `useSharedWorkers: true`, the page's own SharedWorker reached through
 *    `attachPageSharedAppWorker`. Pages may share that SharedWorker; each test's writer pair keeps its
 *    writes and lifetime apart. The worker kind lives in the target app's config, not in the spec text,
 *    so eligibility is declared explicitly here instead of inferred from incidental text in the spec.
 * 3. **No physical window journey or multi-session Bridge arbitration** — the spec does not drive
 *    multi-window browser popups, native window geometry (`open_component_window`, `close_window`,
 *    `position_window`, `focus_window`, `get_window_topology`), direct Brain service imports
 *    (`loadNeuralLinkModules`), or multi-writer WebSocket Bridge sessions (`bridgePort`,
 *    `waitForSession`). Those specs remain Brain-gated under the Bridge/headed tier owner.
 * 4. **No transaction archive recorder** — the spec does not persist or replay Memory Core
 *    transaction archives (`save_transaction`, `replay_transaction`, `NEO_MCP_REMOTE_TOKEN`).
 *    Those specs remain Brain-gated under the Bridge/archive tier owner.
 *
 * SharedWorker apps (`apps/workstation`, `apps/portal`, `apps/colors`, the dashboard examples) are
 * eligible spec by spec under property 3: a spec that opens, pops out, tears out or drives a second
 * window stays Brain-gated, even though the same SharedWorker would serve it.
 *
 * @type {ReadonlySet<String>}
 */
export const ADAPTER_ELIGIBLE_SPECS = new Set([
    'core/RefreshDomCorpseRepro.spec.mjs',
    'core/SplitterLiveResizeNL.spec.mjs',
    'dashboard/DemoADragMenuNL.spec.mjs',
    'dashboard/DockAutoHideRevealNL.spec.mjs',
    'dashboard/DockCrossWindowWitnessNL.spec.mjs',
    'dashboard/DockCrossZoneDragNL.spec.mjs',
    'dashboard/DockDragDropNL.spec.mjs',
    'dashboard/DockHeavyContentSplitNL.spec.mjs',
    'dashboard/DockLockActionNL.spec.mjs',
    'dashboard/DockMotionNL.spec.mjs',
    'dashboard/DockPinCollapseNL.spec.mjs',
    'dashboard/DockReloadActionNL.spec.mjs',
    'dashboard/DockTabOverflowNL.spec.mjs',
    'dashboard/DockTourSmokeNL.spec.mjs',
    'dashboard/HeaderHandleAdmissionNL.spec.mjs',
    'dashboard/PreviewLanguageDragPairNL.spec.mjs',
    'grid/BigDataMultiBodyNL.spec.mjs',
    'grid/BigDataNL.spec.mjs',
    'grid/ColumnCrossBodyDnD.spec.mjs',
    'grid/ColumnOverdragScroll.spec.mjs',
    'grid/GridExportCsvNL.spec.mjs',
    'grid/GridViewFocus.spec.mjs',
    'grid/HeaderInlineProjectionNL.spec.mjs',
    'grid/HeaderMenuCoverageNL.spec.mjs',
    'grid/HeaderMenuInteractionNL.spec.mjs',
    'grid/HeaderMenuStateNL.spec.mjs',
    'grid/HeaderResizeRectSync.spec.mjs',
    'grid/IssuesShowcase.spec.mjs',
    'grid/LockedCellHorizontalStability.spec.mjs',
    'grid/LockedDnDDuplication.spec.mjs',
    'grid/LockedRegionRowRender.spec.mjs',
    'grid/PremeasureRowsNL.spec.mjs',
    'grid/RowSlotRemapDuplication.spec.mjs',
    'grid/SearchToolbarNL.spec.mjs',
    'grid/SelectionMultiBody.spec.mjs',
    'neural-link/CreateComponent.spec.mjs',
    'neural-link/CreateGrid.spec.mjs',
    'neural-link/Redo.spec.mjs',
    'neural-link/RemoveComponent.spec.mjs',
    'neural-link/WorkerStateMutation.spec.mjs',
    'portal/ConnectNL.spec.mjs',
    'portal/DocsMixinsNL.spec.mjs',
    'rendering/ButtonBaseNL.spec.mjs',
    'rendering/CalendarMonthRollover.spec.mjs',
    'rendering/ContextMenuNL.spec.mjs',
    'rendering/DeltaCoherenceRegistryNL.spec.mjs',
    'rendering/MarkdownStreamingCoherenceNL.spec.mjs',
    'rendering/SparseUpdatesNL.spec.mjs',
    'rendering/StoreLoadingNL.spec.mjs',
    'tab/TabHeaderActionsNL.spec.mjs',
    'workstation/WorkstationCrossZoneCueNL.spec.mjs',
    'workstation/WorkstationEdgeSplitterNL.spec.mjs',
    'workstation/WorkstationFeedKeepsScrollNL.spec.mjs',
    'workstation/WorkstationGridUnconstrainedNL.spec.mjs',
    'workstation/WorkstationHeaderActionsHoverNL.spec.mjs',
    'workstation/WorkstationMaximizeOverflowMenuNL.spec.mjs',
    'workstation/WorkstationMaximizeTabReorderNL.spec.mjs',
    'workstation/WorkstationOffSocketContractNL.spec.mjs',
    'workstation/WorkstationOwnPaneEdgeDropNL.spec.mjs',
    'workstation/WorkstationRailsOutermostNL.spec.mjs',
    'workstation/WorkstationResidentCardSizingNL.spec.mjs',
    'workstation/WorkstationSplitterGridGeometryNL.spec.mjs',
    'workstation/WorkstationTabDragHeadersStayNL.spec.mjs',
    'workstation/WorkstationTabDragLabelOverlapNL.spec.mjs',
    'workstation/WorkstationTabDragSiblingHoldsNL.spec.mjs',
    'workstation/WorkstationTabReorderNoFlashNL.spec.mjs'
]);

/**
 * @summary Whether a spec (identified by its path relative to the e2e root) is explicitly marked
 * eligible to run through the dedicated App Worker Neural Link test adapter without an external
 * `neo-agent-brain` checkout.
 * @param {String} relativePath Path relative to the e2e spec root (POSIX or platform separators).
 * @returns {Boolean}
 */
export function isAdapterEligibleSpec(relativePath) {
    if (typeof relativePath !== 'string' || !relativePath) {
        return false
    }

    return ADAPTER_ELIGIBLE_SPECS.has(relativePath.replace(/\\/g, '/'))
}

/**
 * @summary Whether a spec requires an external `neo-agent-brain` checkout (`NEO_AGENTOS_RUNTIME_ROOT`).
 * A spec is Brain-gated when it references `neuralLink` and is not explicitly adapter-eligible
 * ({@link isAdapterEligibleSpec}).
 * @param {String} relativePath Path relative to the e2e spec root.
 * @param {String} source       UTF-8 contents of the spec file.
 * @returns {Boolean}
 */
export function needsExternalBrain(relativePath, source) {
    return /\bneuralLink\b/.test(source) && !isAdapterEligibleSpec(relativePath)
}

/**
 * @summary Splits an e2e spec tree into the specs that need an external neo-agent-brain checkout and
 * everything an Engine-only seat can run, in a single walk.
 *
 * Why the split exists: Bridge-shaped, SharedWorker, native-window, and archive whitebox specs drive a
 * live Brain through the `neuralLink` fixture, which throws on those paths unless `NEO_AGENTOS_RUNTIME_ROOT`
 * names an absolute checkout root. Single-app dedicated-worker specs listed in {@link ADAPTER_ELIGIBLE_SPECS}
 * dispatch directly to the page's own App Worker without a Bridge and stay in the Engine-only selection.
 *
 * Why the total is returned alongside the matchers: Playwright's `testIgnore` removes files from
 * SELECTION rather than skipping them, so no reporter, summary line or `--list` output can ever
 * mention them — a run missing four fifths of the tier prints `Skipped: 0`. This walk is the only
 * place both numbers exist, and returning one without the other is what made the gap inaudible.
 *
 * @param {String} root Absolute directory to walk; recursion passes subdirectories.
 * @param {String} [base=root] Absolute directory the emitted matchers are relative to. Held constant
 *        across the recursion so a nested spec still matches by its full path from the e2e root.
 * @returns {{ignore: RegExp[], total: Number}} Exact-file matchers for the Engine-only project's
 *          ignore set, and every `*.spec.mjs` seen — excluded or not.
 */
export function selectExternalBrainSpecs(root, base = root) {
    const ignore = [];

    let total = 0;

    for (const entry of fs.readdirSync(root, {withFileTypes: true})) {
        const file = path.join(root, entry.name);

        if (entry.isDirectory()) {
            const nested = selectExternalBrainSpecs(file, base);

            ignore.push(...nested.ignore);
            total += nested.total
        } else if (entry.name.endsWith('.spec.mjs')) {
            total++;

            const relativePath = path.relative(base, file).split(path.sep).join('/'),
                  source       = fs.readFileSync(file, 'utf8');

            if (needsExternalBrain(relativePath, source)) {
                const escaped = relativePath
                    .split('/')
                    .map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
                    .join('[\\\\/]');

                ignore.push(new RegExp(`[\\\\/]${escaped}$`))
            }
        }
    }

    return {ignore, total}
}

/**
 * @summary States how much of the tier a run will not select, for the one moment the count is knowable.
 *
 * Emitted at config-evaluation time rather than from the reporter, because that is the only seam every
 * entry point crosses: a reporter never learns about unselected files, and `--list` constructs no
 * reporter at all — a bare `--list` matching almost nothing looks identical to a tier that ran and
 * found nothing wrong.
 *
 * @param {{ignore: RegExp[], total: Number}} selection From {@link selectExternalBrainSpecs}.
 * @returns {String|null} The notice, or `null` when the run selects the whole tier and has nothing to
 *          disclose — a caller printing unconditionally would otherwise announce an exclusion of zero.
 */
export function excludedSpecNotice({ignore, total}) {
    if (!ignore.length) {
        return null
    }

    // States this module's own exclusion class and no coverage figure. It sees only the Brain-gated
    // specs; other classes are applied downstream, so any residual computed here would be arithmetic
    // on incomplete information. A module that cannot see every class publishes its own subtrahend
    // and never the remainder.
    //
    // Restoring the variable makes these files ELIGIBLE, which is not the same as selected — the
    // later classes still apply — so the wording promises eligibility rather than a count.
    return `e2e: NEO_AGENTOS_RUNTIME_ROOT is unset — ${ignore.length} of ${total} spec files are ` +
        `EXCLUDED from selection, not skipped, so nothing below this line reports them. This counts ` +
        `the Brain-gated class only; further exclusions are applied downstream, so no coverage ` +
        `figure is stated here. Set NEO_AGENTOS_RUNTIME_ROOT to an absolute neo-agent-brain ` +
        `checkout root to make these ${ignore.length} eligible again.`
}
