/**
 * @module ai/scripts/diagnostics/walVolumeBaseline
 * @summary Measures WAL write volume over a window and decides the pilot's write-disposition posture
 * (fork-then-replay vs dual-journal) from that measurement rather than from taste.
 *
 * ## Why the decision needs a script and not a judgement
 *
 * A parity pilot accumulates real writes on a forked plane. At promotion or demotion those writes need
 * a disposition, and the honest fork is: **fork-then-replay** if the accumulated corpus fits one forward
 * pass, or a **dual-journal** design if it does not. That is a question about a number, and the number is
 * observable today — the WAL segments are already on disk and are already the replay substrate.
 *
 * ## The constant is DEFERRED, on purpose
 *
 * This module does **not** invent a megabyte threshold. `replayBudgetMb` is a required caller input with
 * no default — and it is a **size**, which a throughput alone cannot supply: throughput has units of
 * MB *per unit time*. The budget is the product of two separate facts —
 *
 *     replayBudgetMb = NET replay throughput (MB/s) × the accepted cutover window (s)
 *
 * — so the caller must have chosen an acceptable promotion/demotion duration before it can name a
 * budget at all. **NET, not measured-in-isolation**: a replay running against a shared native plane
 * races the writes other seats are still making, so its effective rate is the measured rate minus the
 * concurrent inflow it must also absorb. On a shared plane that is the normal case, not an edge one, and
 * using an isolated benchmark would over-state the budget and pick fork-then-replay for a corpus that
 * cannot finish inside the window. The replay-proof AC supplies the throughput; the window is an operational decision
 * about how long a cutover may take. Stating the dimensional relationship rather than saying "from
 * measured throughput" matters: the earlier wording implied one input where there are two, and a
 * budget derived from throughput alone would be a number without units. Shipping a plausible
 * constant would encode one observation as a calibrated bound; that exact move was withdrawn once
 * already this cycle after peers falsified it. So: this half supplies the volume, that half supplies the
 * budget, and the decision is their comparison.
 *
 * ## An empty observation is a REFUSAL, never a zero
 *
 * The measurement that produced this module first reported *"0 files in 7 days"* — on a plane that had
 * been written to minutes earlier. The cause was the instrument: `find` on the host was `bfs`, which
 * rejected `-newermt`, printed its error into the head of a pipe, and left an exit code of 0. An empty
 * result read as a finding.
 *
 * So a zero-file window is treated as an **unreliable measurement** and refuses, rather than reporting
 * `0 MB/day` and driving the posture toward "trivially replayable". The failure direction matters: a
 * fabricated zero argues for the *cheaper* posture, which is precisely the wrong way for a guard to
 * fail. This module also scans with `node:fs` rather than shelling out, so there is no `find` dialect to
 * be wrong about.
 * @plane in-plane
 */

import fs   from 'node:fs/promises';
import path from 'node:path';

const BYTES_PER_MB = 1024 * 1024;

/**
 * @summary True for a finite number strictly greater than zero.
 * @param {*} value
 * @returns {Boolean}
 */
function isPositiveFinite(value) {
    return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/**
 * @summary Walks a WAL tree RECURSIVELY and returns one record per regular file, following symlinks.
 *
 * Two properties, both load-bearing, both learned by getting them wrong:
 *
 * **Recursive.** The message WAL lives in a `messages/` subdirectory (`NEO_MESSAGE_WAL_DIR` is
 * `…/memory-wal/messages`), so a top-level-only scan silently drops it. On the reference plane that
 * was **65 of 159 segments — 41% of the corpus invisible.** Caught only because an independent
 * measurement disagreed with the scan; the undercount would otherwise have looked like a clean result.
 *
 * **Symlink-following.** In the multi-clone topology a seat's `.neo-ai-data/memory-wal` is a *symlink*
 * to the canonical clone's plane, so a scan that skipped links would measure an empty directory.
 *
 * Both failures push volume DOWN, and a lower volume argues for fork-then-replay — the cheaper
 * posture. An undercounting scanner therefore fails in the one direction a guard must not.
 * @param {String} dir WAL directory (relative or absolute).
 * @returns {Promise<Object[]>} `[{name, bytes, mtimeMs}]` with `name` relative to `dir`.
 */
export function isWalSegment(name) {
    // NAMED, not incidental. A bare `isFile()` counted the drain daemons' `.drain-lock` sentinels as
    // corpus — two live examples on the reference plane — inflating segment count and volume with files
    // that carry no entries and are never replayed. WAL segments are JSONL; locks, temp files and
    // dotfiles are not, and a predicate that says so is auditable where an accident is not.
    return name.endsWith('.jsonl') && !path.basename(name).startsWith('.');
}

export async function readWalSegments(dir) {
    const segments = [],
          // A `stat`-following walk can reach ONE inode twice when a subdirectory is a symlink alias of
          // another, double-counting its bytes. Cross-instrument agreement does not catch this: both
          // instruments used the same broad predicate and both over-counted identically.
          visited  = new Set();

    const walk = async (current, prefix) => {
        const entries = await fs.readdir(current, {withFileTypes: true});

        for (const entry of entries) {
            const full = path.join(current, entry.name),
                  name = prefix ? `${prefix}/${entry.name}` : entry.name,
                  // `stat`, never `lstat`: a symlinked segment or directory must report its TARGET.
                  // `isDirectory()`/`isFile()` on the Dirent would classify a symlink as neither.
                  info = await fs.stat(full),
                  // Identity is the resolved path, so an alias and its target are ONE entry.
                  real = await fs.realpath(full);

            if (visited.has(real)) continue;

            visited.add(real);

            if (info.isDirectory()) {
                await walk(full, name);
            } else if (info.isFile() && isWalSegment(name)) {
                segments.push({name, bytes: info.size, mtimeMs: info.mtimeMs});
            }
        }
    };

    await walk(dir, '');

    return segments;
}

/**
 * @summary Reduces segments to a volume baseline over a trailing window, including the peak single day.
 *
 * The peak matters as much as the mean. The observation behind this module had a most-recent day at
 * **3.2x** the 7-day mean, so a posture sized against the mean would be sized against a quiet week.
 * @param {Object} spec
 * @param {Object[]} spec.segments   From {@link readWalSegments}.
 * @param {Number}   spec.windowDays Trailing window in days.
 * @param {Number}   spec.nowMs      Clock reading; injected so the reduction stays pure and testable.
 * @returns {Object} `{ok, reason?, windowDays, fileCount, totalBytes, meanMbPerDay, peakDayMb, peakDay}`
 */
export function reduceWalWindow({segments, windowDays, nowMs} = {}) {
    const refuse = reason => ({ok: false, reason});

    if (!Array.isArray(segments))      return refuse('segments must be an array');
    if (!isPositiveFinite(windowDays)) return refuse(`windowDays must be a positive finite number, received ${JSON.stringify(windowDays)}`);
    if (!isPositiveFinite(nowMs))      return refuse(`nowMs must be a positive finite number, received ${JSON.stringify(nowMs)}`);

    const cutoff  = nowMs - windowDays * 86400000,
          inRange = segments.filter(segment => segment.mtimeMs >= cutoff);

    // An empty window is an INSTRUMENT verdict, not a data point — see the module summary. Reporting
    // 0 MB/day here would argue for the cheaper posture off a measurement that never happened.
    if (inRange.length === 0) {
        return refuse(
            `no WAL segments modified within ${windowDays}d (scanned ${segments.length} total). ` +
            'Treated as an unreliable measurement, not as zero write volume: a plane with a corpus and ' +
            'no recent writes means the scan, the clock, or the path is wrong. Verify the WAL path ' +
            'resolves through its symlink and that the window covers real activity.'
        );
    }

    const totalBytes = inRange.reduce((sum, segment) => sum + segment.bytes, 0),
          perDay     = new Map();

    for (const segment of inRange) {
        const day = new Date(segment.mtimeMs).toISOString().slice(0, 10);

        perDay.set(day, (perDay.get(day) ?? 0) + segment.bytes);
    }

    const [peakDay, peakBytes] = [...perDay.entries()].sort((a, b) => b[1] - a[1])[0];

    return {
        ok          : true,
        windowDays,
        fileCount   : inRange.length,
        scannedCount: segments.length,
        totalBytes,
        meanMbPerDay: totalBytes / BYTES_PER_MB / windowDays,
        peakDayMb   : peakBytes / BYTES_PER_MB,
        peakDay
    };
}

/**
 * @summary Decides the write-disposition posture by comparing the projected pilot corpus to the
 * caller-supplied replay budget.
 *
 * **Projects from the PEAK day, not the mean** — a pilot sized on a quiet week is sized wrong, and the
 * failure direction of under-projecting is choosing fork-then-replay for a corpus that cannot replay.
 * The mean is reported alongside so the gap between them is visible rather than hidden by the choice.
 * ## The budget is DERIVED here, not accepted
 *
 * An earlier shape took `replayBudgetMb` as a required scalar and documented the formula in prose. That
 * merely relocated the invention: any caller-supplied number could select the cheap posture while
 * contradicting the stated arithmetic, and nothing checked it. Requiring a value is not the same as
 * deriving one. So the three *factual* inputs are taken instead and the budget is computed from them,
 * which makes the formula executable rather than advisory.
 *
 * Rates are MB/**day** to match the baseline's own units (`peakDayMb`, `meanMbPerDay`); the earlier prose
 * mixed MB/s with a window in seconds, which is dimensionally equivalent but invites a units slip at the
 * call site.
 *
 * ## Non-convergence is a posture, not an error
 *
 * When concurrent native inflow meets or exceeds replay throughput, the net rate is ≤ 0 and a forward pass
 * never catches up — fork-then-replay is impossible at *any* cutover window, not merely over budget. The
 * old signature could not express that at all; it is reported as `dual-journal` with a non-convergence
 * rationale, because it is a genuine decision rather than a malformed input.
 * @param {Object} spec
 * @param {Object} spec.baseline                 An `ok` {@link reduceWalWindow} result.
 * @param {Number} spec.pilotDays                Planned pilot duration.
 * @param {Number} spec.replayThroughputMbPerDay Measured rate one forward replay pass sustains.
 * @param {Number} spec.nativeInflowMbPerDay     Rate the shared native plane keeps producing DURING
 *                                               replay. Subtracted, because replay competes with it.
 * @param {Number} spec.cutoverWindowDays        Accepted duration of the cutover — an operational
 *                                               decision, and the only judgement input of the three.
 * @returns {Object} `{ok, reason?, posture, projectedMb, projectedFromMeanMb, replayBudgetMb, netThroughputMbPerDay, headroomMb, rationale}`
 */
export function decideWalPosture({
    baseline, pilotDays, replayThroughputMbPerDay, nativeInflowMbPerDay, cutoverWindowDays
} = {}) {
    const refuse = reason => ({ok: false, reason});

    if (!baseline?.ok)                return refuse(`baseline is not a successful measurement: ${baseline?.reason ?? 'absent'}`);
    if (!isPositiveFinite(pilotDays)) return refuse(`pilotDays must be a positive finite number, received ${JSON.stringify(pilotDays)}`);

    for (const [label, value] of [
        ['replayThroughputMbPerDay', replayThroughputMbPerDay],
        ['cutoverWindowDays',        cutoverWindowDays]
    ]) {
        if (!isPositiveFinite(value)) {
            return refuse(
                `${label} must be a positive finite number, received ${JSON.stringify(value)}. The replay ` +
                'budget is DERIVED as (replay throughput − native inflow) × cutover window, so the factors ' +
                'are required rather than a precomputed size: a supplied number could pick the cheap ' +
                'posture while contradicting that arithmetic, with nothing to catch it.'
            );
        }
    }

    // Zero is legitimate here (a quiesced plane genuinely has no inflow), so this one is not "positive".
    if (typeof nativeInflowMbPerDay !== 'number' || !Number.isFinite(nativeInflowMbPerDay) || nativeInflowMbPerDay < 0) {
        return refuse(
            `nativeInflowMbPerDay must be a non-negative finite number, received ${JSON.stringify(nativeInflowMbPerDay)}. ` +
            'Pass 0 for a quiesced plane — omitting it would silently assume quiescence, which is the ' +
            'optimistic direction on a shared plane.'
        );
    }

    const netThroughputMbPerDay = replayThroughputMbPerDay - nativeInflowMbPerDay,
          projectedMb           = baseline.peakDayMb * pilotDays,
          projectedFromMeanMb   = baseline.meanMbPerDay * pilotDays;

    if (netThroughputMbPerDay <= 0) {
        return {
            ok            : true,
            posture       : 'dual-journal',
            projectedMb,
            projectedFromMeanMb,
            replayBudgetMb: 0,
            netThroughputMbPerDay,
            headroomMb    : -projectedMb,
            rationale     : `native inflow ${nativeInflowMbPerDay}MB/d meets or exceeds replay throughput ` +
                `${replayThroughputMbPerDay}MB/d, so a forward pass never converges and fork-then-replay is ` +
                'impossible at any cutover window — not merely over budget'
        };
    }

    const replayBudgetMb = netThroughputMbPerDay * cutoverWindowDays,
          withinBudget   = projectedMb <= replayBudgetMb,
          budgetNote     = `${replayBudgetMb.toFixed(2)}MB budget (net ${netThroughputMbPerDay}MB/d × ${cutoverWindowDays}d)`;

    return {
        ok        : true,
        posture   : withinBudget ? 'fork-then-replay' : 'dual-journal',
        projectedMb,
        projectedFromMeanMb,
        replayBudgetMb,
        netThroughputMbPerDay,
        headroomMb: replayBudgetMb - projectedMb,
        rationale : withinBudget
            ? `peak-projected ${projectedMb.toFixed(2)}MB over ${pilotDays}d fits the ${budgetNote}; ` +
              'the WAL segments are already the append-only replay substrate, so a second write path buys nothing'
            : `peak-projected ${projectedMb.toFixed(2)}MB over ${pilotDays}d exceeds the ${budgetNote}; ` +
              'one forward pass cannot absorb the pilot corpus, so the disposition needs a dual journal'
    };
}
