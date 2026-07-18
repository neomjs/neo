/**
 * @module Neo.dashboard.DockVesselConversion
 * @summary The dual-window conversion decision authority — the pure sensor deciding WHEN a dragged
 * popup converts into a semi-transparent drag proxy over a target vessel, and when it converts back.
 *
 * The landed tear-out grammar's intersection ratio ({@link Neo.draggable.container.SortZone#checkWindowBoundary},
 * `area(intersection) / area(dragged)`) is a SELF-retention measure against one window and is
 * mathematically broken for popup-over-vessel: with the dragged window as denominator, a large
 * window over a small target caps at `area(target) / area(dragged)` — for a 2× size difference the
 * ratio can never exceed 0.5, so any usable threshold is UNREACHABLE; the mirror denominator fails
 * the mirror case. Both windows are freely resizable mid-session, so no creation-time basis works
 * either. This module's metric is reachable for EVERY size pair in both directions: per-axis
 * overlap normalized by the SMALLER extent per axis — `rx = overlapWidth / min(widthA, widthB)`,
 * `ry` likewise — composed through an injectable seam (default `min(rx, ry)`: both axes must
 * substantially cover the smaller footprint). Composed = 1.0 exactly when the smaller per-axis
 * footprint is fully covered, whichever window is bigger. Ratios derive from the LIVE rects of
 * every sample, so a mid-session resize re-normalizes on the next frame.
 *
 * The choreography contract this implements (the docking design record, multi-window amendment):
 * - **Conversion is a transition predicate, never a new state.** Convert-in IS the geometric
 *   condition for the outcome machine's existing `DETACHED_MOVING → HOVERING_CLAIM` transition;
 *   convert-out is its inverse. The design record's source-hook pair (`suspendWindowDrag` /
 *   `resumeWindowDrag`) is the contract-named actuator set a host binds the two seams to — the
 *   record's outcome machine gains NO state and needs NO amendment for this capability.
 * - **The pointer gate holds in BOTH directions.** Rect overlap alone never converts (intent stays
 *   pointer-owned: convert-in requires the pointer inside the target's dock-accepting region, the
 *   claim-protocol feed) — and rect overlap alone never HOLDS a conversion: the pointer leaving
 *   the target reverts at any ratio, so a stale claim can never pin a converted vessel.
 * - **The dead band IS the Schmitt trigger.** `convertThreshold` (in) sits strictly above
 *   `revertThreshold` (out), validated fail-loud; a decision fires only on crossing its OWN
 *   threshold, so the convert-in moment lies above the revert band by construction — the false-flip
 *   class the landed grammar needed an arming flag for (its exit fires INSIDE its reattach zone)
 *   is structurally excluded here, no arming state required.
 * - **Terminals are not the sensor's business.** `reset()` clears conversion state SILENTLY and
 *   idempotently: gesture terminals (commit, cancel, vessel close, park) are choreographed by the
 *   outcome machine and the vessel-lifecycle leaves; a sensor emitting on reset would double-drive
 *   the actuators the terminal choreography already owns.
 * - **Garbage geometry fails CLOSED.** Missing, zero-extent, or non-finite rects compose to 0 — a
 *   converted sensor fed garbage REVERTS. Without the guard, `NaN` poisons both threshold
 *   comparisons to false and a converted sensor would hold its conversion forever.
 *
 * The shipped thresholds are REVIEWABLE PLACEHOLDERS: the dead-band width mirrors the landed
 * grammar's proven 0.2 spread; the absolute positions and the composition pick (`min` vs product)
 * await the parent leaf's empirical calibration on the headed matrix harness. Calibration swaps
 * config values and the `composeRatios` seam — never this contract.
 */

/**
 * Validates one threshold config value: a finite number in (0, 1].
 * @param {String} name The config key, for the fail-loud message
 * @param {Number} value
 * @private
 */
function assertThreshold(name, value) {
    if (!Number.isFinite(value) || value <= 0 || value > 1) {
        throw new Error(`createVesselConversionSensor: ${name} must be a finite number in (0, 1] — got ${value}`)
    }
}

/**
 * Clamps one ratio into [0, 1], failing CLOSED on non-finite input: garbage geometry must read as
 * "no overlap", never as "hold the current decision" (NaN compares false against every threshold,
 * which would freeze a converted sensor permanently).
 * @param {Number} value
 * @returns {Number}
 * @private
 */
function clampRatio(value) {
    return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0
}

/**
 * One axis of the min-extent-normalized overlap metric over `{x, y, width, height}` rects.
 * @param {Object} a
 * @param {Object} b
 * @param {String} axis 'x' or 'y'
 * @param {String} extent 'width' or 'height'
 * @returns {Number} overlap along the axis divided by the smaller extent, clamped fail-closed
 * @private
 */
function axisRatio(a, b, axis, extent) {
    const
        overlap   = Math.min(a[axis] + a[extent], b[axis] + b[extent]) - Math.max(a[axis], b[axis]),
        minExtent = Math.min(a[extent], b[extent]);

    return minExtent > 0 ? clampRatio(Math.max(0, overlap) / minExtent) : 0
}

/**
 * Creates one dual-window conversion sensor for one gesture surface, closed over one conversion
 * flag. One sensor serves one drag surface — a pointer drives at most one window-drag per window
 * (the same single-slot reasoning as the tear-out choreography), so the flag never needs a map.
 *
 * Decisions flow through the two injected seams exclusively; the per-sample geometry record is the
 * observability surface. A host binds the seams to the design record's named source-hook actuators:
 * `onConvertIn → suspendWindowDrag` territory (the popup yields, the proxy embodies over the
 * target), `onConvertOut → resumeWindowDrag` territory (the popup embodiment resumes — the emitted
 * record's `sourceRect` is the live rect to resume at).
 * @param {Object} config
 * @param {Function} [config.composeRatios] `({rx, ry}) => Number` — composes the two per-axis
 *     ratios into the one decision ratio. Defaults to `Math.min(rx, ry)` (both axes must cover the
 *     smaller footprint). The calibration seam: the parent leaf's empirical pick lands here. A
 *     non-finite return fails closed to 0.
 * @param {Number} [config.convertThreshold=0.55] Composed ratio at/above which — pointer gate
 *     satisfied — a detached vessel converts to a proxy. Must sit strictly above `revertThreshold`.
 * @param {Number} [config.revertThreshold=0.35] Composed ratio below which a converted vessel
 *     reverts to its detached embodiment. The gap to `convertThreshold` is the flicker-free dead band.
 * @param {Function} config.onConvertIn Actuation seam, fired exactly once per conversion with the
 *     final sample record: the host suspends the popup embodiment and embodies the proxy.
 * @param {Function} config.onConvertOut Actuation seam, fired exactly once per reversion with the
 *     final sample record: the host resumes the popup embodiment at the record's `sourceRect`.
 * @returns {Object} `{converted, reset, sample}` — the live conversion flag (getter), the silent
 *     idempotent terminal reset, and the per-frame sampler
 */
export function createVesselConversionSensor(config = {}) {
    const {
        composeRatios   = ({rx, ry}) => Math.min(rx, ry),
        convertThreshold = 0.55,
        revertThreshold  = 0.35,
        onConvertIn,
        onConvertOut
    } = config;

    assertThreshold('convertThreshold', convertThreshold);
    assertThreshold('revertThreshold',  revertThreshold);

    if (convertThreshold <= revertThreshold) {
        throw new Error(
            'createVesselConversionSensor: convertThreshold must sit strictly above revertThreshold — ' +
            `the dead band between them is the flicker-free hysteresis contract (got in: ${convertThreshold}, out: ${revertThreshold})`
        )
    }

    if (typeof composeRatios !== 'function') {
        throw new Error('createVesselConversionSensor: composeRatios must be a function seam')
    }

    if (typeof onConvertIn !== 'function' || typeof onConvertOut !== 'function') {
        throw new Error(
            'createVesselConversionSensor: onConvertIn and onConvertOut are required function seams — ' +
            'decisions flow through the actuators, never through polling'
        )
    }

    // The single-gesture conversion flag: true while the dragged vessel embodies as a proxy.
    let converted = false;

    return {
        /**
         * @member {Boolean} converted
         */
        get converted() {
            return converted
        },

        /**
         * Terminal reset — SILENT and idempotent by contract: gesture terminals (commit, cancel,
         * close, park) are the outcome machine's choreography; the sensor only forgets. The next
         * gesture's samples decide fresh.
         */
        reset() {
            converted = false
        },

        /**
         * One gesture-frame decision over the LIVE rects. Fires at most one seam per sample:
         * convert-in on crossing `convertThreshold` with the pointer inside the target,
         * convert-out on crossing below `revertThreshold` OR the pointer leaving the target.
         * Samples inside the dead band (gate unchanged) fire nothing — the hysteresis hold.
         * @param {Object} data
         * @param {Boolean} data.pointerInTarget The claim-protocol feed: pointer inside the
         *     target's dock-accepting region. Gates conversion in BOTH directions.
         * @param {Object} data.sourceRect Live `{x, y, width, height}` of the dragged vessel
         * @param {Object} data.targetRect Live `{x, y, width, height}` of the target vessel
         * @returns {Object} The sample record `{composed, converted, pointerInTarget, rx, ry,
         *     sourceRect, targetRect}` — `converted` reflects the POST-decision state
         */
        sample({pointerInTarget, sourceRect, targetRect} = {}) {
            const
                bothRects = Boolean(sourceRect && targetRect),
                pointer   = pointerInTarget === true,
                rx        = bothRects ? axisRatio(sourceRect, targetRect, 'x', 'width')  : 0,
                ry        = bothRects ? axisRatio(sourceRect, targetRect, 'y', 'height') : 0,
                composed  = clampRatio(composeRatios({rx, ry}));

            let event = null;

            if (!converted) {
                if (pointer && composed >= convertThreshold) {
                    converted = true;
                    event     = onConvertIn
                }
            } else if (!pointer || composed < revertThreshold) {
                converted = false;
                event     = onConvertOut
            }

            const record = {composed, converted, pointerInTarget: pointer, rx, ry, sourceRect, targetRect};

            event?.(record);

            return record
        }
    }
}
