/**
 * @summary Pure policy governing the wake daemon's event-coalescing shape: the rolling window,
 * the hard flush cap, and the post-flush refractory.
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
 *
 * Kept pure (no timers, DB, config, or daemon state) so the policy is unit-testable in isolation,
 * mirroring the daemon's other focused modules (`flushDeferPolicy.mjs`, `queries.mjs`,
 * `wokenWatermark.mjs`). The daemon supplies `firstQueuedAt` / `lastFlushAt`; this module only
 * decides delays.
 *
 * @module ai/daemons/wake/coalescePolicy
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
 * @summary Resolves one subscription's effective coalescing window in ms.
 *
 * Override-else-default, then clamped into `[0, COALESCE_HARD_CAP_MS]` — the exact semantics the
 * daemon previously inlined (`undefined`/`null` override falls through to the default; `0` is a
 * meaningful explicit immediate-dispatch choice, not an absent value).
 *
 * @param {Object}      opts
 * @param {Number|null} [opts.overrideSeconds] `harnessTargetMetadata.coalesceWindow` (seconds).
 * @param {Number}      opts.defaultSeconds    The config-leaf default (seconds).
 * @returns {Number} Effective window in ms.
 */
export function resolveCoalesceWindowMs({overrideSeconds, defaultSeconds}) {
    let seconds = overrideSeconds ?? defaultSeconds;

    seconds = Math.max(0, Math.min(COALESCE_HARD_CAP_MS / 1000, seconds));

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
export function computeFlushDelayMs({now, windowMs, firstQueuedAt, lastFlushAt = 0}) {
    if (windowMs === 0) return 0;

    const
        refractoryFloor = Math.max(0, (lastFlushAt + POST_FLUSH_REFRACTORY_MS) - now),
        capRemaining    = Math.max(0, (firstQueuedAt + COALESCE_HARD_CAP_MS) - now);

    return Math.min(Math.max(windowMs, refractoryFloor), capRemaining)
}
