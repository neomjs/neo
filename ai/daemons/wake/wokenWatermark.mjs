/**
 * @module ai/daemons/wake/wokenWatermark
 * @summary Pure already-woken dedup for the wake digest.
 *
 * The wake daemon's digest historically reconciled only on `readAt`, so a genuinely-unread
 * message the recipient had already been *woken for* (re-queued by a heavy-delta GraphLog
 * re-include or a cursor reset) survived into the "N new" count and could spoof a HIGH digest
 * from a stale backlog message. These pure helpers reconcile on the
 * right axis — the GraphLog `logId` high-water-mark of what the recipient has already been woken
 * for — and compose with (do NOT replace) the `readAt` reconcile + `flushDeferPolicy` defer.
 *
 * `logId` is the append-only GraphLog position, so it is monotonic: an event at or below the
 * per-subscription watermark has already been included in a prior digest; only events strictly
 * above it are genuinely-new-since-last-wake. The daemon owns the durable, per-subscription
 * watermark map + its persistence; this module is the pure, unit-testable decision core.
 */

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
