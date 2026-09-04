import fs   from 'node:fs';
import path from 'node:path';

/**
 * @summary Splits an e2e spec tree into the specs that need an external neo-agent-brain checkout and
 * everything an Engine-only seat can run, in a single walk.
 *
 * Why the split exists: the whitebox specs drive a live Brain through the `neuralLink` fixture, which
 * throws unless `NEO_AGENTOS_RUNTIME_ROOT` names an absolute checkout root. A contributor cloning this
 * repo must still get a usable run from `npm ci` alone — a suite that requires infrastructure only
 * maintainers possess is a suite the community is locked out of — so those specs leave the selection
 * instead of failing.
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

            if (/\bneuralLink\b/.test(fs.readFileSync(file, 'utf8'))) {
                const relative = path.relative(base, file)
                    .split(path.sep)
                    .map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
                    .join('[\\\\/]');

                ignore.push(new RegExp(`[\\\\/]${relative}$`))
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
 * reporter at all — a bare `--list` matching almost nothing is exactly the signal that sent three
 * separate readers off to re-derive this from scratch (#18246).
 *
 * @param {{ignore: RegExp[], total: Number}} selection From {@link selectExternalBrainSpecs}.
 * @returns {String|null} The notice, or `null` when the run selects the whole tier and has nothing to
 *          disclose — a caller printing unconditionally would otherwise announce an exclusion of zero.
 */
export function excludedSpecNotice({ignore, total}) {
    if (!ignore.length) {
        return null
    }

    return `e2e: NEO_AGENTOS_RUNTIME_ROOT is unset — ${ignore.length} of ${total} spec files are ` +
        `EXCLUDED from selection, not skipped, so nothing below this line reports them. This run ` +
        `covers ${total - ignore.length}. Set NEO_AGENTOS_RUNTIME_ROOT to an absolute ` +
        `neo-agent-brain checkout root to select all ${total}.`
}
