/**
 * @module ai/scripts/maintenance/detectionRetentionSla
 * @summary Pure verdict-half for the backup-reliability AC3: is the data-integrity detect
 * cadence fast enough that a corruption is caught before the last good backup ages out of
 * retention?
 *
 * The corruption incident exposed the structural risk: if corruption is not detected within the
 * backup-retention window, the last *uncorrupted* backup is pruned before anyone knows
 * recovery is needed — and recovery becomes impossible. The invariant that prevents this:
 *
 * ```
 * detectCadenceMs  <=  backupRetentionMs / safetyFactor
 * ```
 *
 * i.e. the worst-case time to *detect* a corruption must be a safe fraction of the window
 * for which a good backup survives, leaving margin to actually run a recovery before the
 * last good backup is pruned. `safetyFactor` defaults to 2 (detect within half the window).
 *
 * This module is the **verdict-half** (pure, no I/O) — it computes the SLA verdict from
 * explicit inputs. The wiring now exists alongside it: `detectionRetentionSlaInputs.mjs` adapts the
 * live config shapes into these two durations, and `checkDetectionRetentionSla.mjs` reads the config
 * SSOT and fails CI on a breach. Keep this module free of config shape and of process exits — that
 * separation is why its verdict stays unit-testable against explicit inputs.
 * @plane in-plane
 */

/**
 * Default safety factor: detection must fit within half the retention window, leaving the
 * other half as margin to run an actual recovery before the last good backup is pruned.
 * @type {Number}
 */
const DEFAULT_SAFETY_FACTOR = 2;

/**
 * Evaluate whether the data-integrity detect cadence beats backup retention with margin.
 *
 * Pure — no I/O, no clock, no config reads. The caller supplies the worst-case detect cadence
 * and the retention window; this returns a structured verdict. The SLA holds iff
 * `detectCadenceMs <= backupRetentionMs / safetyFactor`.
 *
 * @param {Object} options
 * @param {Number} options.detectCadenceMs   Worst-case time (ms) for the data-integrity
 *                                            detect-signal to flag a corruption. Must be > 0.
 * @param {Number} options.backupRetentionMs Window (ms) for which the last good backup
 *                                            survives before being pruned. Must be > 0.
 * @param {Number} [options.safetyFactor=2]  Detection must fit within `retention/safetyFactor`
 *                                            so recovery has margin. Must be >= 1.
 * @returns {{withinSla: Boolean, marginMs: Number, requiredMaxDetectMs: Number, reason: (String|null)}}
 *          `withinSla` — true iff the SLA holds.
 *          `requiredMaxDetectMs` — the largest detect cadence that would still pass
 *          (`backupRetentionMs / safetyFactor`).
 *          `marginMs` — `requiredMaxDetectMs - detectCadenceMs` (negative when breached).
 *          `reason` — null when within SLA; otherwise a human-readable breach explanation.
 * @throws {TypeError} when `detectCadenceMs` or `backupRetentionMs` is missing or <= 0, or
 *                     when `safetyFactor` < 1 — no silent pass on an unconfigured SLA.
 */
export function evaluateDetectionRetentionSla({detectCadenceMs, backupRetentionMs, safetyFactor = DEFAULT_SAFETY_FACTOR} = {}) {
    if (!Number.isFinite(detectCadenceMs) || detectCadenceMs <= 0) {
        throw new TypeError(`evaluateDetectionRetentionSla: detectCadenceMs must be a positive number, got ${detectCadenceMs}`);
    }
    if (!Number.isFinite(backupRetentionMs) || backupRetentionMs <= 0) {
        throw new TypeError(`evaluateDetectionRetentionSla: backupRetentionMs must be a positive number, got ${backupRetentionMs}`);
    }
    if (!Number.isFinite(safetyFactor) || safetyFactor < 1) {
        throw new TypeError(`evaluateDetectionRetentionSla: safetyFactor must be a number >= 1, got ${safetyFactor}`);
    }

    const requiredMaxDetectMs = backupRetentionMs / safetyFactor,
          marginMs            = requiredMaxDetectMs - detectCadenceMs,
          withinSla           = marginMs >= 0;

    return {
        withinSla,
        marginMs,
        requiredMaxDetectMs,
        reason: withinSla
            ? null
            : `detect cadence ${detectCadenceMs}ms exceeds the SLA ceiling ${requiredMaxDetectMs}ms ` +
              `(retention ${backupRetentionMs}ms / safetyFactor ${safetyFactor}); a corruption could age ` +
              `out the last good backup before it is detected and recovered`
    };
}
