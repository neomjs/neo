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
 * RENDER (best-practice shape): tail-incremental — settled blocks are written once then frozen, only
 * the open last block re-renders as it grows; NOT an O(n²) full-`innerHTML` rewrite.
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

let
    runToken   = 0,
    containers = [];

/**
 * Tail-incremental apply: settled blocks (all but the last) are written ONCE then frozen via a
 * `data-settled` flag; only the open last block re-renders each tick as it grows.
 * @param {String[]} blocks
 * @private
 */
function applyBlocks(blocks) {
    for (let i = 0; i < blocks.length; i++) {
        let container = containers[i];

        if (!container) {
            container = document.createElement('div');
            transcript.appendChild(container);
            containers[i] = container
        }

        const isOpenTail = i === blocks.length - 1;

        if (isOpenTail || container.dataset.settled !== '1') {
            container.innerHTML = blocks[i];

            if (!isOpenTail) {
                container.dataset.settled = '1'
            }
        }
    }
}

/**
 * Drives the deterministic `LoadProfile` append stream, parsing the open block + rendering each delta
 * synchronously on the main thread (settled blocks memoized). A run token prevents overlapping runs.
 * @param {Object} [config] forwarded to `LoadProfile` (seed, durationMs, cadences).
 * @returns {Promise<void>}
 */
async function start(config = {}) {
    const
        profile = new LoadProfile(config),
        token   = ++runToken,
        blocks  = createIncrementalBlocks();

    containers.forEach(container => container.remove());
    containers = [];

    for (const {text} of profile.appendEvents()) {
        if (runToken !== token) {
            break
        }

        applyBlocks(blocks.push(text));

        await new Promise(resolve => setTimeout(resolve, profile.appendCadenceMs))
    }
}

globalThis.__enduranceComparator = {engine: 'main-thread', start};

export {start};
