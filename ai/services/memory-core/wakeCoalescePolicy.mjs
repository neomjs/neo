/**
 * @summary Pure policy governing the wake daemon's event-coalescing and message-admission shape:
 * the rolling window, hard flush cap, post-flush refractory, and canonical mailbox-age horizon.
 *
 * **Failure mode this replaces (the wake-per-message cadence):** the daemon's original
 * 30-second FIXED window armed on the first queued event and flushed at window end. That bundles
 * INTRA-burst traffic (one peer sending three messages in seconds) — but the dominant swarm cadence
 * is INTER-turn: lifecycle messages land 1–5 minutes apart during an active evening, so each caught
 * its own window and every message became its own wake. A wake costs a full harness turn (system
 * prompt + context reload), so a single-event wake spends tens of thousands of tokens to deliver
 * one message header.
 *
 * **The policy (mechanism in `daemon.mjs`, decisions here):**
 * - **Rolling window:** every newly queued event re-arms the flush timer to the full window —
 *   trailing arrivals join the digest instead of arming the next wake. Quiet-for-`window` flushes.
 * - **Hard cap:** the digest flushes no later than {@link COALESCE_HARD_CAP_MS} after its FIRST
 *   queued event, however busy the stream — rolling extension never withholds a wake indefinitely.
 *   The cap is also the ceiling for per-subscription window overrides (the pre-existing clamp).
 * - **Post-flush refractory:** for {@link POST_FLUSH_REFRACTORY_MS} after a delivered digest, a new
 *   flush is holdable to the refractory boundary — events arriving just after a flush queue into
 *   the NEXT digest rather than immediately re-arming a wake at just-outside-window spacing.
 *   (Per-recipient mirror of the swarm-idle `swarmWakeCooldownSeconds` precedent.)
 * - **Explicit immediate wins:** a subscription whose override resolves the window to `0` opted
 *   into per-event dispatch; neither the refractory nor the cap applies to it.
 * - **Canonical message age:** a MESSAGE may create live interruption urgency for one hour after
 *   its server-stamped `sentAt`. Older, future, missing, or malformed timestamps stay mailbox data
 *   but fail closed for wake delivery; replay GraphLog position never substitutes for authored age.
 *   Admission itself ({@link isMessageWakeFresh}) and the flush-time partition
 *   ({@link partitionMessageWakesByFreshness}) both live here, consumed by every wake producer.
 *
 * Kept pure (no timers, DB, config, or daemon state) so the policy is unit-testable in isolation,
 * mirroring the daemon's other focused modules (`flushDeferPolicy.mjs`, `queries.mjs`,
 * `wokenWatermark.mjs`). The daemon supplies `firstQueuedAt` / `lastFlushAt`; this module only
 * decides delays and message-age admission.
 *
 * Memory Core now owns this policy for Shape B. The legacy Shape-C daemon imports the same
 * functions until the graph-tailing route is removed at cutover, so the transition cannot fork
 * the turn-priced wake contract.
 *
 * @module ai/services/memory-core/wakeCoalescePolicy
 */

/**
 * Hard ceiling (ms) on digest latency: a queue flushes no later than this after its first queued
 * event, regardless of rolling extensions or the refractory. Also the clamp ceiling for
 * per-subscription window overrides — the long-standing "Max 5 minutes" design ceiling, now named.
 * @type {Number}
 */
export const COALESCE_HARD_CAP_MS = 300000;

/**
 * Quiet period (ms) after a DELIVERED digest during which a new flush is held to the refractory
 * boundary. Kills the wake-per-message cadence at just-outside-window event spacing; sized at the
 * window's order of magnitude so back-to-back wakes for one seat stay minutes apart. A mechanism
 * parameter (module constant, like `flushDeferPolicy`'s), not an operator knob — the operator
 * tunes the window leaf.
 * @type {Number}
 */
export const POST_FLUSH_REFRACTORY_MS = 120000;

/**
 * Maximum age (ms) at which a canonical mailbox MESSAGE may still create a live wake. Older
 * messages remain authoritative mailbox history, but replaying them cannot manufacture current
 * interruption urgency. This is a mechanism safety ceiling, not an operator-tunable route policy.
 * @type {Number}
 */
export const MESSAGE_WAKE_MAX_AGE_MS = 60 * 60 * 1000;

/**
 * @summary Returns whether a canonical mailbox timestamp is still eligible for live wake delivery.
 *
 * `MailboxService.addMessage()` owns `sentAt` and stamps it with `Date#toISOString()`. Requiring
 * that exact canonical shape makes missing, malformed, numeric, and future timestamps fail closed;
 * GraphLog insertion time is deliberately irrelevant because projection replay can make an old
 * message look newly inserted. The one-hour boundary is closed.
 *
 * @param {Object} opts
 * @param {String} opts.sentAt Canonical mailbox `sentAt` ISO timestamp.
 * @param {Number} [opts.now=Date.now()] Current epoch ms.
 * @param {Number} [opts.maxAgeMs=MESSAGE_WAKE_MAX_AGE_MS] Mechanism ceiling; injectable for pure
 *     policy witnesses, not wired to runtime configuration.
 * @returns {Boolean} Whether the message may contribute to a live wake digest.
 */
export function isMessageWakeFresh({sentAt, now = Date.now(), maxAgeMs = MESSAGE_WAKE_MAX_AGE_MS}) {
    if (typeof sentAt !== 'string' || !Number.isFinite(now) || !Number.isFinite(maxAgeMs) || maxAgeMs < 0) {
        return false
    }

    const sentAtMs = Date.parse(sentAt);

    if (!Number.isFinite(sentAtMs) || new Date(sentAtMs).toISOString() !== sentAt) return false;

    const ageMs = now - sentAtMs;

    return ageMs >= 0 && ageMs <= maxAgeMs
}

/**
 * @summary Partitions message wake events by canonical mailbox age at the flush / delivery boundary.
 *
 * The single age-admission pass shared by BOTH wake producers — the standalone daemon (Shape C)
 * and `CoalescingEngineService` (Shapes A/B) — so the turn-priced wake contract cannot fork across
 * the cutover: the engine once shipped without the daemon's gate, and a replayed day-old
 * lane-claim surfaced as a digest `latest`.
 *
 * The event's `sentAt` comes from the immutable MESSAGE node through the shared `SENT_TO_ME`
 * evaluator (`buildSentToMeInner`). GraphLog position and envelope arrival time are intentionally
 * not consulted: projection replay can append a new position for an old message. The daemon's
 * events carry `sentAt` at the top level; the engine's envelopes carry it at `payload.sentAt` —
 * both resolve here, and a missing or malformed value fails closed via {@link isMessageWakeFresh}.
 *
 * Suppressed events are returned to the caller so it can still advance durable consumption state
 * without exposing their subjects or mutating mailbox read state.
 *
 * @param {Object[]} messages Coalesced message-class wake events (message events only — task,
 *     permission, and heartbeat events carry their own clocks and are never age-gated).
 * @param {Number}   [now=Date.now()] Current epoch ms, shared across one partition pass.
 * @returns {{eligible: Object[], suppressed: Object[], oldestAgeMs: Number|null}}
 */
export function partitionMessageWakesByFreshness(messages, now = Date.now()) {
    const eligible    = [], suppressed = [];
    let   oldestAgeMs = null;

    for (const event of messages) {
        const sentAt = event?.sentAt ?? event?.payload?.sentAt;

        if (isMessageWakeFresh({sentAt, now})) {
            eligible.push(event);
            continue;
        }

        suppressed.push(event);

        const sentAtMs = typeof sentAt === 'string' ? Date.parse(sentAt) : NaN,
              ageMs    = now - sentAtMs;

        if (Number.isFinite(ageMs) && ageMs >= 0) {
            oldestAgeMs = Math.max(oldestAgeMs ?? 0, ageMs);
        }
    }

    return {eligible, suppressed, oldestAgeMs}
}

/**
 * @summary Resolves one subscription's effective coalescing window in ms.
 *
 * Override-else-default, then clamped into `[0, COALESCE_HARD_CAP_MS]` — the exact semantics the
 * daemon previously inlined (`undefined`/`null` override falls through to the default; `0` is a
 * meaningful explicit immediate-dispatch choice, not an absent value).
 *
 * @param {Object}      opts
 * @param {Number|null} [opts.overrideSeconds] `harnessTargetMetadata.coalesceWindow` (seconds).
 * @param {Number}      opts.defaultSeconds    The config-leaf default (seconds).
 * @param {Number}      [opts.capMs=COALESCE_HARD_CAP_MS] Configured hard-cap ceiling.
 * @returns {Number} Effective window in ms.
 */
export function resolveCoalesceWindowMs({overrideSeconds, defaultSeconds, capMs = COALESCE_HARD_CAP_MS}) {
    let seconds = overrideSeconds ?? defaultSeconds;

    seconds = Math.max(0, Math.min(capMs / 1000, seconds));

    return seconds * 1000
}

/**
 * @summary Computes the flush-timer delay for a (re-)armed coalescing queue.
 *
 * Called on EVERY queued event (the rolling re-arm) with the queue's stable `firstQueuedAt` and
 * the subscription's last delivered-flush time:
 * - base delay = the full window (rolling: trailing events keep extending);
 * - raised to the post-flush refractory boundary when the last delivery was recent
 *   (`max(window, refractory remaining)`);
 * - bounded by the hard cap measured from the FIRST queued event (`min(…, cap remaining)`) — the
 *   cap beats the refractory by design: it is the worst-case latency guarantee, the refractory is
 *   only an anti-chatter floor.
 * - `windowMs === 0` returns `0` unconditionally — explicit immediate dispatch wins over both.
 *
 * @param {Object} opts
 * @param {Number} opts.now             Current epoch ms.
 * @param {Number} opts.windowMs        Effective window from {@link resolveCoalesceWindowMs}.
 * @param {Number} opts.firstQueuedAt   Epoch ms the queue's FIRST event arrived (stable per queue).
 * @param {Number} [opts.lastFlushAt=0] Epoch ms of the last DELIVERED digest for this
 *     subscription (`0` when none — no refractory).
 * @returns {Number} Timer delay in ms (`0` = flush now).
 */
export function computeFlushDelayMs({now, windowMs, firstQueuedAt, lastFlushAt = 0, refractoryMs = POST_FLUSH_REFRACTORY_MS, capMs = COALESCE_HARD_CAP_MS}) {
    if (windowMs === 0) return 0;

    const
        refractoryFloor = Math.max(0, (lastFlushAt + refractoryMs) - now),
        capRemaining    = Math.max(0, (firstQueuedAt + capMs) - now);

    return Math.min(Math.max(windowMs, refractoryFloor), capRemaining)
}

/**
 * @summary The FLUSH-TIME hold gate — how long an already-due flush must still wait.
 *
 * A flush timer's delay is computed at ARM time ({@link computeFlushDelayMs}), so it cannot see
 * deliveries that CONFIRM after it was armed — the canonical case being events that queued while
 * the previous digest's adapter attempt was in flight: their timer fires moments after that
 * delivery settles, and dispatching immediately is exactly the back-to-back double-prompt the
 * refractory exists to prevent. Called at the top of the flush with the NOW-settled
 * `lastFlushAt`:
 * - returns the remaining refractory when one is active — bounded by the remaining hard cap
 *   (the cap beats the refractory here exactly as it does at arm time);
 * - returns `0` when the flush may proceed;
 * - `windowMs === 0` returns `0` unconditionally — the explicit-immediate contract again.
 *
 * @param {Object} opts
 * @param {Number} opts.now             Current epoch ms.
 * @param {Number} opts.windowMs        Effective window from {@link resolveCoalesceWindowMs}.
 * @param {Number} opts.firstQueuedAt   Epoch ms the queue's FIRST event arrived.
 * @param {Number} [opts.lastFlushAt=0] Epoch ms of the last CONFIRMED delivery (`0` = none).
 * @param {Number} [opts.refractoryMs=POST_FLUSH_REFRACTORY_MS] Mechanism constant; parameterized
 *     so the daemon can thread its env-tunable value (its established constant-override idiom)
 *     and witnesses can drive short spans.
 * @param {Number} [opts.capMs=COALESCE_HARD_CAP_MS] Mechanism constant; same parameterization.
 * @returns {Number} Remaining hold in ms (`0` = flush now).
 */
export function computeFlushHoldMs({now, windowMs, firstQueuedAt, lastFlushAt = 0, refractoryMs = POST_FLUSH_REFRACTORY_MS, capMs = COALESCE_HARD_CAP_MS}) {
    if (windowMs === 0) return 0;

    const
        refractoryRemaining = Math.max(0, (lastFlushAt + refractoryMs) - now),
        capRemaining        = Math.max(0, (firstQueuedAt + capMs) - now);

    return Math.min(refractoryRemaining, capRemaining)
}
