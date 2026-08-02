/**
 * Uniform, caller-detectable code set on the rejection this helper produces, so a consumer can tell a
 * timeout from an arbitrary downstream failure **structurally** rather than by matching the message.
 *
 * Message-matching was the only option before this existed, and it is unsound twice over: a reworded
 * message silently stops matching, and any downstream error whose text happens to contain the same
 * phrase is misread as a timeout. A consumer that must name *why* something failed — an adaptive
 * controller widening a window, say — cannot be built on that.
 *
 * Mirrors the `code`-based contract `ai/provider/createTimeoutError.mjs` already establishes for
 * provider-level timeouts; import this constant rather than repeating the literal, so a rename cannot
 * leave a consumer silently matching nothing while its tests stay green.
 * @type {String}
 */
export const WITH_TIMEOUT_CODE = 'WITH_TIMEOUT';

/**
 * @summary Races a promise against a timeout so a hung downstream call (model inference,
 * content-store fetch) rejects instead of blocking the maintenance loop forever.
 *
 * Lives in its own module so multiple memory-core services share one definition without an
 * import cycle: `MemoryService` imports `SessionService`, so `SessionService` cannot import this
 * from `MemoryService` (where it originally lived) without creating a `MemoryService` ⇄
 * `SessionService` cycle. Generic promise utility — no Neo / AiConfig dependency.
 *
 * The rejection carries `code = WITH_TIMEOUT_CODE` plus the `label` and `timeoutMs` that produced it,
 * so a caller can classify the failure without parsing prose. The message is unchanged and still names
 * both, since it remains the thing a human reads in a log.
 *
 * @param {Promise} promise The work to bound.
 * @param {Number}  ms      Timeout in milliseconds.
 * @param {String}  label   Human-readable label surfaced in the timeout error.
 * @returns {Promise}
 */
export function withTimeout(promise, ms, label) {
    let timer;
    const timeout = new Promise((resolve, reject) => {
        timer = setTimeout(() => {
            const error = new Error(`${label} timed out after ${ms}ms`);

            error.code      = WITH_TIMEOUT_CODE;
            error.label     = label;
            error.timeoutMs = ms;

            reject(error)
        }, ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
