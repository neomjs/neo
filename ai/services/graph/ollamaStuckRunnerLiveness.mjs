/**
 * @summary Stuck-runner liveness for a supervised local model server (Ollama).
 *
 * A resident model can be **alive** (process up, model loaded, `/api/tags` answers) yet
 * **stuck** — a single inference grinding a pathological request (e.g. a too-large context
 * prefill) at ~100%×N-cores while serving nothing else, because `OLLAMA_NUM_PARALLEL=1`
 * queues every other request behind it. Residency probes pass; the deployment burns.
 * (Empirical anchor: a `gemma4` chat runner pegged at 399.7% for 58h of CPU-time with an
 * idle orchestrator and no users in a cloud deployment.)
 *
 * The only honest signal is whether a real inference **canary** completes. The hard part is
 * NOT restarting a *legitimately-long* request — that is a self-inflicted outage. So a
 * single canary failure is **advisory**; only `threshold` CONSECUTIVE
 * failures (sustained over `threshold × cooldown`) classify as stuck. The supervisor's own
 * restart cooldown then bounds the restart cadence (no wildfire).
 *
 * Detect (here) + act (the supervisor recycles the running child on a sustained-`false`
 * healthProbe) = the recovery the organism needs for this class. This module owns the **detect**
 * decision only; it holds no privilege and performs no restart.
 *
 * @module ai/services/graph/ollamaStuckRunnerLiveness
 */

/**
 * @summary Pure classifier: fold one canary result into the sustained-stuck decision.
 *
 * Stateless by design — the caller owns the `consecutiveFailures` counter (e.g. the
 * orchestrator per supervised task) and feeds it back in. Resetting to 0 on `stuck` means a
 * post-restart re-stick re-counts fresh, so the supervisor cooldown spaces the restarts and
 * a genuinely un-recoverable runner escalates by repetition rather than thrashing.
 *
 * @param {Object}  options
 * @param {Boolean} options.served               Did the inference canary complete within its timeout?
 * @param {Number}  [options.consecutiveFailures=0] Prior consecutive canary failures for this target.
 * @param {Number}  options.threshold             Consecutive failures that classify as stuck (integer ≥ 1).
 * @returns {{alive: Boolean, stuck: Boolean, consecutiveFailures: Number}}
 *   `alive` is the value the ollama `healthProbe` returns (false ⇒ the supervisor recycles the child);
 *   `stuck` is true only on the transition that triggers the recycle;
 *   `consecutiveFailures` is the next counter value the caller must persist.
 */
export function classifyStuckRunner({served, consecutiveFailures = 0, threshold} = {}) {
    if (!Number.isInteger(threshold) || threshold < 1) {
        throw new TypeError('classifyStuckRunner: threshold must be a positive integer');
    }

    if (served) {
        // A working canary clears any accumulated suspicion — the runner is serving.
        return {alive: true, stuck: false, consecutiveFailures: 0};
    }

    const next = consecutiveFailures + 1;

    if (next >= threshold) {
        // Sustained failure: stuck. Reset so the post-restart window counts fresh.
        return {alive: false, stuck: true, consecutiveFailures: 0};
    }

    // Advisory: could be a legitimately-long request. Stay alive until it is sustained.
    return {alive: true, stuck: false, consecutiveFailures: next};
}

/**
 * @summary Inference canary — does the model actually SERVE a tiny request (not just resident)?
 *
 * Sends the smallest possible chat completion (1 predicted token, empty keep-alive bump) and
 * resolves `true` only if it completes within `timeoutMs`. A stuck runner queues this behind
 * the grinding request (`OLLAMA_NUM_PARALLEL=1`) → it times out → `false`. The HTTP client is
 * injectable (`fetchFn`) so the canary is unit-testable without a live Ollama, and the abort
 * is real (an abandoned canary must not itself pile onto the saturated server).
 *
 * @param {Object}   options
 * @param {String}   options.host        Ollama base URL (e.g. `http://local-model:11434`).
 * @param {String}   options.model       Chat model tag to probe (the resident, suspected-stuck one).
 * @param {Number}   options.timeoutMs   Abandon threshold; below the supervisor cooldown.
 * @param {Function} [options.fetchFn=fetch] Injected HTTP client (test seam).
 * @returns {Promise<Boolean>} Whether a real completion was served within the timeout.
 */
export async function probeOllamaServing({host, model, timeoutMs, fetchFn = fetch} = {}) {
    if (!host || !model) {
        throw new TypeError('probeOllamaServing: host and model are required');
    }
    if (typeof timeoutMs !== 'number' || timeoutMs <= 0) {
        throw new TypeError('probeOllamaServing: timeoutMs must be a positive number');
    }

    const controller = new AbortController();
    const timer      = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetchFn(`${host.replace(/\/$/, '')}/api/chat`, {
            method : 'POST',
            headers: {'Content-Type': 'application/json'},
            body   : JSON.stringify({
                model,
                messages: [{role: 'user', content: 'ping'}],
                stream  : false,
                options : {num_predict: 1}
            }),
            signal: controller.signal
        });

        // Any COMPLETED HTTP response — including a non-2xx model/config error — proves the
        // runner is responsive (it served *this* request promptly), so it is NOT stuck. Only a
        // timeout / abort / network error (no response — queued behind a grinding request) is the
        // stuck signature. The status code is deliberately ignored: a 4xx/5xx that returns fast
        // must never count toward a recycle (the false-positive guard).
        return Boolean(response);
    } catch {
        return false;
    } finally {
        clearTimeout(timer);
    }
}
