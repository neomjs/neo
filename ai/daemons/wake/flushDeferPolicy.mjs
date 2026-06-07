/**
 * @summary Pure policy helpers governing when the wake daemon defers a coalesced digest flush
 * because a heavy GraphLog / data-sync delta is still settling.
 *
 * **Failure mode this guards (the "phantom wake-flood"):** a large GraphLog / data-sync delta — e.g. a
 * multi-thousand-row content sync — commits to SQLite in batches. While those batches are landing, the
 * daemon's per-message read-state lookup (`isMessageReadFor`) transiently under-reports `readAt`, so
 * already-read backlog rows slip past the digest's read filter. The digest then over-counts
 * "N new messages" and can spoof a HIGH priority from that inflated set even though nothing
 * genuinely-new arrived — which trains agents to distrust HIGH wakes.
 *
 * **Mechanism (in `daemon.mjs`):** `pollLoop` flags a heavy delta when a single poll returns an
 * unusually large batch (`isHeavyDeltaPoll`); `flushSubscription` then defers (`shouldDeferFlush`) —
 * keeping the coalesced queue intact and re-arming its timer — until the delta has settled, so the
 * digest is computed against committed read-state. Deferral is capped so a genuine wake is delayed,
 * never withheld.
 *
 * Kept pure (no timers, DB, or daemon state) so the policy is unit-testable in isolation, mirroring the
 * daemon's other focused modules (`queries.mjs`, `instanceResolver.mjs`).
 *
 * @module ai/daemons/wake/flushDeferPolicy
 */

/**
 * GraphLog entries observed in a single poll at or above which the delta is treated as a heavy / sync
 * delta in flight. Normal agent activity yields a handful of entries per poll; a data-sync yields
 * thousands — so this threshold sits well above ambient traffic and well below sync magnitude.
 * @type {Number}
 */
export const HEAVY_DELTA_THRESHOLD = 500;

/**
 * Quiet period (ms) after the most recent heavy poll before per-message read-state is trusted again.
 * Spans several poll cycles so the daemon observes the sync stop producing large batches before it
 * resumes flushing digests.
 * @type {Number}
 */
export const HEAVY_DELTA_SETTLE_MS = 15000;

/**
 * Maximum number of times a single coalesced flush may defer. Bounds total deferral
 * (`MAX_FLUSH_DEFERS * HEAVY_DELTA_SETTLE_MS`) so a genuine wake is delayed, never dropped, even if a
 * sync runs unusually long.
 * @type {Number}
 */
export const MAX_FLUSH_DEFERS = 10;

/**
 * @summary Whether a single poll's GraphLog batch marks a heavy / sync delta in flight.
 * @param {Number} deltaSize GraphLog entries returned by one poll.
 * @returns {Boolean} `true` when the batch is at or above {@link HEAVY_DELTA_THRESHOLD}.
 */
export function isHeavyDeltaPoll(deltaSize) {
    return deltaSize >= HEAVY_DELTA_THRESHOLD;
}

/**
 * @summary Whether a coalesced wake flush must defer because a heavy delta is still settling.
 *
 * Returns `true` while within {@link HEAVY_DELTA_SETTLE_MS} of the last heavy poll AND the flush has
 * not yet hit the {@link MAX_FLUSH_DEFERS} cap. Once the settle window elapses (read-state is
 * committed) or the cap is reached (never withhold a genuine wake), returns `false`.
 *
 * @param {Object}  opts
 * @param {Number}  opts.now             Current epoch ms.
 * @param {Number}  opts.lastHeavyPollAt Epoch ms of the most recent heavy poll (`0` when none seen).
 * @param {Number} [opts.deferCount=0]   Number of times this flush has already deferred.
 * @returns {Boolean} `true` → defer the flush; `false` → read-state trusted, proceed.
 */
export function shouldDeferFlush({now, lastHeavyPollAt, deferCount = 0}) {
    const withinSettleWindow = (now - lastHeavyPollAt) < HEAVY_DELTA_SETTLE_MS;
    const underDeferCap      = deferCount < MAX_FLUSH_DEFERS;

    return withinSettleWindow && underDeferCap;
}
