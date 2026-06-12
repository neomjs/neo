/**
 * @summary Races a promise against a timeout so a hung downstream call (model inference,
 * content-store fetch) rejects instead of blocking the maintenance loop forever.
 *
 * Lives in its own module so multiple memory-core services share one definition without an
 * import cycle: `MemoryService` imports `SessionService`, so `SessionService` cannot import this
 * from `MemoryService` (where it originally lived) without creating a `MemoryService` ⇄
 * `SessionService` cycle. Generic promise utility — no Neo / AiConfig dependency.
 *
 * @param {Promise} promise The work to bound.
 * @param {Number}  ms      Timeout in milliseconds.
 * @param {String}  label   Human-readable label surfaced in the timeout error.
 * @returns {Promise}
 */
export function withTimeout(promise, ms, label) {
    let timer;
    const timeout = new Promise((resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
