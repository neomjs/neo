import {createIncrementalBlocks} from './markdownBlocks.mjs';
import {LoadProfile}             from '../shared/LoadProfile.mjs';

/**
 * @summary Subject B — the honest single-main-thread comparator for the Harness Endurance Benchmark.
 *
 * A dependency-free vanilla page: it runs the SAME deterministic `LoadProfile` stream as the Neo
 * subject, but parses (`markdownBlocks`) and renders ENTIRELY on the main thread — no workers. The
 * runner samples the SAME event-loop-lag metric here as for the Neo subject; the lag delta isolates
 * the worker-topology effect. The runner triggers a run via `globalThis.__enduranceComparator.start(cfg)`.
 *
 * RENDER (best-practice shape): tail-incremental + WINDOWED — settled blocks are written once then
 * frozen; only the open last block re-renders as it grows; and only the last `RENDER_WINDOW` blocks
 * stay mounted (older blocks evicted), so the DOM stays bounded at marathon scale — matching Neo's
 * MarkdownVdom virtualization. NOT an O(n²) full-`innerHTML` rewrite, and NOT an unbounded DOM:
 * windowing both subjects is what makes the lag delta isolate worker-topology rather than a
 * virtualization asymmetry (a non-virtualized comparator would conflate the two axes at scale).
 *
 * PARSE (best-practice shape): incremental — settled blocks (everything before the last blank line) are
 * parsed ONCE and only the open region re-parses from each delta (`createIncrementalBlocks`), mirroring
 * the off-thread Neo parser's memoization. So the lag delta isolates the worker-topology variable (WHERE
 * the work runs) rather than conflating it with parse strategy — the benchmark's naive-vs-best-practice
 * fork, resolved to best-practice.
 */

const
    probe      = document.createElement('input'),
    transcript = document.createElement('div');

probe.type           = 'text';
probe.placeholder    = 'keystroke probe';
probe.className      = 'endurance-probe';
transcript.className = 'endurance-transcript';

document.body.append(probe, transcript);

/**
 * Bounded DOM window. A best-practice main-thread renderer does NOT accumulate unbounded DOM at
 * marathon scale — it windows like a virtualized list. Only the last `RENDER_WINDOW` blocks stay
 * mounted (older evicted), matching Neo's MarkdownVdom virtualization so the lag delta isolates the
 * worker-topology variable (WHERE parse/render runs), not a virtualization asymmetry.
 * @type {Number}
 */
const RENDER_WINDOW = 120;

let
    runToken   = 0,
    totalChars = 0,
    containers = new Map();

/**
 * Tail-incremental + WINDOWED apply: settled blocks (all but the last) are written ONCE then frozen;
 * only the open last block re-renders each tick as it grows; and only the last `RENDER_WINDOW` blocks
 * stay mounted (older evicted), so the DOM is bounded at marathon scale.
 * @param {String[]} blocks
 * @private
 */
function applyBlocks(blocks) {
    const start = Math.max(0, blocks.length - RENDER_WINDOW);

    // Evict settled blocks that have scrolled out of the window (bounded DOM — best-practice at scale).
    for (const index of [...containers.keys()]) {
        if (index < start) {
            containers.get(index).el.remove();
            containers.delete(index)
        }
    }

    for (let i = start; i < blocks.length; i++) {
        let entry = containers.get(i);

        if (!entry) {
            entry = {el: document.createElement('div'), settled: false};
            transcript.appendChild(entry.el);
            containers.set(i, entry)
        }

        const isOpenTail = i === blocks.length - 1;

        if (isOpenTail || !entry.settled) {
            entry.el.innerHTML = blocks[i];

            if (!isOpenTail) {
                entry.settled = true
            }
        }
    }
}

/**
 * Drives the deterministic `LoadProfile` append stream, parsing the open block + rendering each delta
 * synchronously on the main thread (settled blocks memoized, DOM windowed). A run token prevents
 * overlapping runs. `getTotalChars()` reports the full accumulated transcript length (vs the windowed
 * DOM) so the runner can confirm the comparator also reached marathon scale.
 * @param {Object} [config] forwarded to `LoadProfile` (seed, durationMs, cadences).
 * @returns {Promise<void>}
 */
async function start(config = {}) {
    const
        profile = new LoadProfile(config),
        token   = ++runToken,
        blocks  = createIncrementalBlocks();

    containers.forEach(entry => entry.el.remove());
    containers.clear();
    totalChars = 0;

    for (const {text} of profile.appendEvents()) {
        if (runToken !== token) {
            break
        }

        totalChars += text.length;
        applyBlocks(blocks.push(text));

        await new Promise(resolve => setTimeout(resolve, profile.appendCadenceMs))
    }
}

globalThis.__enduranceComparator = {engine: 'main-thread', start, getTotalChars: () => totalChars};

export {start};
