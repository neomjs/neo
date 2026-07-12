/**
 * @module ai/daemons/wake/wokenWatermark
 * @summary Pure already-woken dedup for the wake digest.
 *
 * The wake daemon's digest historically reconciled only on `readAt`, so a genuinely-unread
 * message the recipient had already been *woken for* (re-queued by a heavy-delta GraphLog
 * re-include or a cursor reset) survived into the "N new" count and could spoof a HIGH digest
 * from a stale backlog message. These pure helpers reconcile on two already-woken axes: the
 * GraphLog `logId` high-water-mark for positional replay, plus the stable application `messageId`
 * for one logical MESSAGE re-emitted at a later position. Both compose with (do NOT replace) the
 * `readAt` reconcile + `flushDeferPolicy` defer.
 *
 * `logId` is the append-only GraphLog position inside one graph epoch, so it is monotonic while
 * that epoch survives. Graph restore/rebuild can reset the log while wake-daemon state survives;
 * callers must detect a stale-high watermark against graph-tip evidence, then clamp it to a
 * trusted pre-batch cursor before filtering. The daemon owns the durable per-subscription watermark
 * map, per-identity message claims, and their persistence; this module is the pure, unit-testable
 * decision core.
 */

/**
 * @summary Caps a persisted already-woken watermark only when it sits ahead of graph-tip evidence.
 *
 * If graph state is restored/rebuilt while `.neo-ai-data/wake-daemon/woken-watermark.json`
 * survives, the persisted watermark can sit ahead of the current GraphLog epoch and suppress every
 * new event. The safe read-side behavior mirrors the daemon cursor clamp, but uses the pre-batch
 * cursor as the reset ceiling so the first post-reset event (`ceiling + 1`) is still delivered.
 * In a normal graph epoch where a low cursor replays old events, the persisted watermark remains
 * authoritative as long as it is not ahead of the batch's trusted GraphLog tip.
 *
 * @param {Number} watermark       Persisted per-subscription already-woken watermark.
 * @param {Number} maxTrustedLogId Highest trusted GraphLog id observed for the current queue.
 * @param {Number} resetCeiling    Highest trusted GraphLog id before the reset-suspect batch.
 * @returns {Number}
 */
export function clampWatermark(watermark, maxTrustedLogId, resetCeiling = maxTrustedLogId) {
    const mark = Number(watermark);
    if (!Number.isFinite(mark) || mark < 0) return 0;

    const trustedMax = Number(maxTrustedLogId);
    if (!Number.isFinite(trustedMax) || trustedMax < 0 || mark <= trustedMax) return mark;

    const ceiling = Number(resetCeiling);
    if (!Number.isFinite(ceiling) || ceiling < 0) return trustedMax;

    return Math.min(ceiling, trustedMax);
}

/**
 * @summary Keeps only the coalesced events that are genuinely new since the last wake — those
 * whose GraphLog `logId` is strictly above the per-subscription watermark.
 *
 * Events without a finite numeric `logId` are conservatively KEPT (treated as new) so a malformed
 * event can never silently suppress a real wake — preserving the `flushDeferPolicy` "never withhold
 * a genuine wake" invariant.
 *
 * @param {Array<{logId: Number}>} events Coalesced wake events (daemon `{type, ..., logId}` shape; logId optional per event).
 * @param {Number} watermark Highest `logId` the recipient has already been woken for (0 = none).
 * @returns {Array} The genuinely-new subset, original order preserved.
 */
export function filterEventsByWatermark(events, watermark) {
    const mark = Number.isFinite(Number(watermark)) ? Number(watermark) : 0;

    return events.filter(event => {
        const raw = event?.logId;
        // Missing logId (null / undefined) → conservatively new (never withhold a genuine wake).
        // Note `Number(null) === 0`, so the explicit null check must precede the numeric coercion.
        if (raw == null) return true;
        const logId = Number(raw);
        return !Number.isFinite(logId) || logId > mark;
    });
}

/**
 * @summary Atomically claims message events that have not already produced a wake for an identity.
 *
 * GraphLog may legitimately re-emit one immutable MESSAGE under a later `logId` (for example after
 * a projection replay). The numeric watermark therefore cannot establish message-level exactly-once
 * semantics by itself. This helper filters on the stable application `messageId` and adds every
 * survivor to the shared identity history before the caller awaits adapter delivery. A second route
 * or flush in the same process then observes the claim immediately and cannot submit a duplicate.
 *
 * Events without a `messageId` are conservatively claimed on every pass: malformed identity data
 * must not suppress a genuine wake.
 *
 * @param {Object[]} messages Candidate message wake events; `messageId` may be absent.
 * @param {Set<String>} wokenMessageIds Mutable per-identity wake history.
 * @returns {{claimed: Array, duplicates: Array}} Newly claimed events and already-woken events.
 */
export function claimUnwokenMessages(messages, wokenMessageIds) {
    const claimed = [], duplicates = [];

    for (const message of messages) {
        const messageId = message?.messageId;

        if (messageId && wokenMessageIds.has(messageId)) {
            duplicates.push(message);
        } else {
            claimed.push(message);
            if (messageId) wokenMessageIds.add(messageId);
        }
    }

    return {claimed, duplicates};
}

/**
 * @summary Highest finite `logId` across the events, or `null` when none carry one.
 *
 * Used to advance the per-subscription watermark after a digest is delivered: the next
 * genuinely-new event must have a strictly greater `logId`. Returns `null` (not `0`) for an empty
 * or logId-less set so the caller leaves the watermark unchanged rather than resetting it to `0`.
 *
 * @param {Array<{logId: Number}>} events Events whose `logId` may be absent per entry.
 * @returns {Number|null}
 */
export function maxLogId(events) {
    let max = null;

    for (const event of events) {
        const raw = event?.logId;
        if (raw == null) continue; // `Number(null) === 0` — skip missing rather than count it as 0.
        const logId = Number(raw);
        if (Number.isFinite(logId) && (max === null || logId > max)) max = logId;
    }

    return max;
}
