/**
 * @summary Pure rolling-window rate check for the `ask_knowledge_base` synthesis runaway breaker.
 *
 * Lives in its own module so the breaker is unit-testable in isolation — importing it does NOT
 * construct the `SearchService` singleton or read the shared `AiConfig` (no live-DB / config-bleed
 * surface). Generic + side-effect-free: callers pass the clock (`now`) and the cap explicitly.
 *
 * @param {Number[]} timestamps Prior call epoch-ms timestamps (the caller's rolling buffer).
 * @param {Number} now Current epoch-ms (injected for testability — never reads the clock itself).
 * @param {Number} maxPerMinute Cap within the rolling window.
 * @param {Number} [windowMs=60000] Rolling window width in ms.
 * @returns {{limited: Boolean, kept: Number[]}} `limited` is true when the in-window count is at/over
 *     the cap (the caller should refuse the call); `kept` is the pruned in-window timestamp list.
 */
export function checkAskRateLimit(timestamps, now, maxPerMinute, windowMs = 60000) {
    const kept = timestamps.filter(ts => now - ts < windowMs);
    return {limited: kept.length >= maxPerMinute, kept};
}
