/**
 * @summary Deterministic, seeded load profile for the Harness Endurance Benchmark.
 *
 * Pure logic — zero Neo, DOM, or Playwright dependencies — so the subject apps and the
 * Playwright runner consume the IDENTICAL event sequence. A fair, reproducible comparison
 * is the whole point of a falsifier: the same `seed` + config produces a byte-identical
 * stream on every run.
 *
 * Division of labour (see the benchmark methodology):
 *   - The subject APP self-drives the high-frequency markdown-append stream from
 *     {@link LoadProfile#appendEvents} on an in-app timer. Driving ~20 appends/s for hours
 *     from the Playwright runner would let cross-process round-trip latency dominate the
 *     measured signal; self-driven appends keep the latency the app's own, and mirror how a
 *     real streamed model response actually renders into a transcript.
 *   - The RUNNER samples main-thread event-loop lag + JS heap growth while the stream plays — the
 *     two metrics this benchmark currently implements. The keystroke probes from
 *     {@link LoadProfile#keystrokeTimes} are emitted for a planned keystroke→echo-latency layer
 *     (alongside frame-time / task-queue-depth), which is NOT measured yet.
 *
 * Determinism note: reproducibility forbids `Math.random()`; token selection uses a seeded
 * `mulberry32` PRNG. The keystroke cadence is fixed, so it needs no PRNG.
 */

/**
 * Event-type tags shared across the load profile, the subjects, and the runner.
 * @type {{APPEND: String, KEYSTROKE: String}}
 */
const EVENT_TYPE = {APPEND: 'append', KEYSTROKE: 'keystroke'};

/**
 * Tiny deterministic PRNG (mulberry32). Returns a closure yielding floats in [0, 1).
 * @param {Number} seed 32-bit unsigned seed.
 * @returns {Function}
 * @private
 */
function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0;
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * Fixed token corpus → deterministic markdown that actually exercises the parse path
 * (inline code, emphasis, list / heading punctuation, paragraph breaks) without pulling in an
 * external fixture. Both subjects append the same content, so any latency delta is the
 * engine's, not the input's.
 * @type {String[]}
 * @private
 */
const TOKEN_CORPUS = [
    'the ', 'worker ', 'topology ', 'decouples ', 'input ', 'latency ', 'from ', 'session ',
    'age ', '`reconcile` ', '**off-thread** ', 'diff ', 'delta ', 'patch ', 'render ',
    '\n\n', '- a point ', '## a section\n', '`vdom` ', 'queue ', 'heap ', 'frame '
];

/**
 * @summary Reproducible benchmark load profile.
 *
 * @example
 *     const profile = new LoadProfile({seed: 42, durationMs: 8 * 60 * 60 * 1000});
 *     for (const {tMs, text} of profile.appendEvents()) { ... }  // inside the subject app
 *     const probes = profile.keystrokeTimes();                   // inside the runner
 */
class LoadProfile {
    /**
     * @param {Object} [config]
     * @param {Number} [config.seed=1]                   Seed — the same seed yields the same stream.
     * @param {Number} [config.durationMs=28800000]      Session length in ms (default 8h).
     * @param {Number} [config.appendCadenceMs=50]       Gap between streamed appends (~20/s).
     * @param {Number} [config.keystrokeCadenceMs=30000] Gap between keystroke probes (30s).
     * @param {Number} [config.minTokensPerAppend=1]     Minimum corpus tokens per append chunk.
     * @param {Number} [config.maxTokensPerAppend=4]     Maximum corpus tokens per append chunk.
     */
    constructor({
        seed               = 1,
        durationMs         = 8 * 60 * 60 * 1000,
        appendCadenceMs    = 50,
        keystrokeCadenceMs = 30 * 1000,
        minTokensPerAppend = 1,
        maxTokensPerAppend = 4
    } = {}) {
        Object.assign(this, {
            seed, durationMs, appendCadenceMs, keystrokeCadenceMs,
            minTokensPerAppend, maxTokensPerAppend
        });
    }

    /**
     * Lazily yields the streamed markdown-append events for the whole session — a generator,
     * so an 8h run is never materialized in memory.
     * @returns {Generator<{tMs: Number, type: String, text: String}>}
     */
    *appendEvents() {
        const
            rand = mulberry32(this.seed),
            span = this.maxTokensPerAppend - this.minTokensPerAppend + 1;

        for (let tMs = 0; tMs < this.durationMs; tMs += this.appendCadenceMs) {
            const count = this.minTokensPerAppend + Math.floor(rand() * span);
            let text = '';

            for (let i = 0; i < count; i++) {
                text += TOKEN_CORPUS[Math.floor(rand() * TOKEN_CORPUS.length)];
            }

            yield {tMs, type: EVENT_TYPE.APPEND, text};
        }
    }

    /**
     * The deterministic keystroke-probe schedule (fixed cadence → no PRNG needed).
     * @returns {Number[]} probe times in ms from session start.
     */
    keystrokeTimes() {
        const times = [];

        for (let tMs = this.keystrokeCadenceMs; tMs < this.durationMs; tMs += this.keystrokeCadenceMs) {
            times.push(tMs);
        }

        return times;
    }

    /**
     * Total streamed-append count for the configured session. Handy for runner progress, and
     * the natural determinism-assertion target in a test (same seed + config → same count).
     * @returns {Number}
     */
    appendCount() {
        return Math.ceil(this.durationMs / this.appendCadenceMs);
    }
}

export {EVENT_TYPE, LoadProfile};
export default LoadProfile;
