/**
 * @module Neo.dashboard.dock.window.VesselConversion
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
 * - **The pointer gate is asymmetric, deliberately.** Rect overlap alone never converts: intent
 *   stays pointer-owned, so convert-in requires a LIVE claim on the target's dock-accepting region.
 *   Convert-OUT is different — it requires an OBSERVED exit or a geometric retreat, never the mere
 *   absence of a claim. A claim expires 300ms after its last refresh, and a stationary pointer
 *   refreshes nothing, so an ordinary pause over the drop target used to un-convert a vessel that
 *   had not moved at all. An un-converted vessel still cannot be pinned by a stale claim, because
 *   convert-in kept its live-claim requirement.
 * - **The dead band IS the Schmitt trigger.** `convertThreshold` (in) sits strictly above
 *   `revertThreshold` (out), validated fail-loud; a decision fires only on crossing its OWN
 *   threshold, so the convert-in moment lies above the revert band by construction — the false-flip
 *   class the landed grammar needed an arming flag for (its exit fires INSIDE its reattach zone)
 *   is structurally excluded here, no arming state required.
 * - **Terminals are not the sensor's business.** `reset()` clears conversion state SILENTLY and
 *   idempotently: gesture terminals (commit, cancel, vessel close, park) are choreographed by the
 *   outcome machine and the vessel-lifecycle leaves; a sensor emitting on reset would double-drive
 *   the actuators the terminal choreography already owns.
 * - **Garbage geometry fails CLOSED and DOMINATES composition.** Missing, zero-extent, or
 *   non-finite rects force the sample to 0 WITHOUT consulting the composition seam — an injected
 *   composer (average, weighted sum, anything non-`min`-shaped) can never elevate a degenerate
 *   axis's valid-looking `0` back above a threshold. A converted sensor fed garbage REVERTS.
 *   Without the non-finite guard, `NaN` would additionally poison both threshold comparisons to
 *   false and freeze a converted sensor forever.
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
 * Whether one `{x, y, width, height}` rect is measurable window geometry: every field finite,
 * both extents strictly positive. The VALIDITY gate the composition seam sits behind — a
 * degenerate axis yields a valid-LOOKING `0` ratio, and an injected composer that is not
 * `min`-shaped (an average, a weighted sum) could elevate that zero back above a threshold, so
 * invalid geometry must dominate BEFORE composition, never inside it.
 * @param {Object} rect
 * @returns {Boolean}
 * @private
 */
function isMeasurableRect(rect) {
    return Boolean(rect) &&
        Number.isFinite(rect.x) && Number.isFinite(rect.y) &&
        Number.isFinite(rect.width)  && rect.width  > 0 &&
        Number.isFinite(rect.height) && rect.height > 0
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
 * @param {Function} config.onConvertIn Strict admission seam, fired exactly once per conversion
 *     attempt with the proposed final sample record. `true` admits synchronously;
 *     `Promise<true>` admits only when it settles. Every other result refuses without changing
 *     conversion ownership.
 * @param {Function} config.onConvertOut Strict admission seam, fired exactly once per reversion
 *     attempt with the proposed final sample record. Re-show refusal preserves conversion
 *     ownership so the exact same vessel remains recoverable and the transition may be retried.
 * @returns {Object} `{converted, reset, sample, targetConverted, transitioning,
 *     transitionPromise}` — live admitted state plus the source-owned async admission latch
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

    // The admitted single-gesture conversion flag plus one generation-scoped platform transition.
    // The coordinator still consumes a synchronous policy record; the promise never leaves this
    // source owner. A reset invalidates the generation so a predecessor completion cannot mutate
    // its successor gesture.
    let converted  = false,
        generation = 0,
        transition = null;

    return {
        /**
         * @member {Boolean} converted
         */
        get converted() {
            return converted
        },

        /**
         * The proposed state of an in-flight transition, otherwise the admitted state.
         * @member {Boolean} targetConverted
         */
        get targetConverted() {
            return transition?.targetConverted ?? converted
        },

        /**
         * @member {Boolean} transitioning
         */
        get transitioning() {
            return transition !== null
        },

        /**
         * The current strict-admission settlement, or `null` when no platform effect is pending.
         * @member {Promise<Boolean>|null} transitionPromise
         */
        get transitionPromise() {
            return transition?.promise ?? null
        },

        /**
         * Terminal reset — SILENT and idempotent by contract: gesture terminals (commit, cancel,
         * close, park) are the outcome machine's choreography; the sensor only forgets. The next
         * gesture's samples decide fresh.
         */
        reset() {
            generation++;
            converted  = false;
            transition = null
        },

        /**
         * One gesture-frame decision over the LIVE rects. Fires at most one seam per sample:
         * convert-in on crossing `convertThreshold` with the pointer inside the target,
         * convert-out on crossing below `revertThreshold` OR the pointer leaving the target.
         * Samples inside the dead band (gate unchanged) fire nothing — the hysteresis hold.
         * @param {Object} data
         * @param {Boolean} data.pointerInTarget The claim-protocol feed: a LIVE claim on the
         *     target's dock-accepting region. It answers "is there a live claim?", NOT "is the
         *     pointer inside?" — a claim expires 300ms after its last refresh, and a stationary
         *     pointer refreshes nothing. Gates convert-IN unconditionally; gates convert-OUT only
         *     when `pointerExitedTarget` is absent.
         * @param {Boolean} [data.pointerExitedTarget] TRI-STATE observed departure, and absence
         *     fails SAFE. `true` is an observed exit and reverts at any ratio. `false` is an
         *     observed still-inside and HOLDS the conversion through a lapsed claim — the only
         *     state that suppresses the pause flicker. ABSENT (`undefined`/`null`) means the host
         *     cannot distinguish a real exit from an expired claim, and falls back to the landed
         *     contract where losing the claim reverts. Absence must never buy the permissive
         *     reading: defaulting it to "not exited" would let rect overlap alone HOLD a
         *     conversion for every caller not yet taught this signal, deleting the
         *     both-directions gate by omission rather than by decision.
         * @param {Object} data.sourceRect Live `{x, y, width, height}` of the dragged vessel
         * @param {Object} data.targetRect Live `{x, y, width, height}` of the target vessel
         * @returns {Object} The sample record `{composed, converted, pointerInTarget, rx, ry,
         *     sourceRect, targetRect}`. While strict async admission is pending it additionally
         *     carries `transitioning: true`, and `converted` remains the prior admitted state.
         */
        sample({pointerExitedTarget, pointerInTarget, sourceRect, targetRect} = {}) {
            // Invalid geometry DOMINATES: a missing, degenerate, or non-finite rect forces the
            // whole sample to zero WITHOUT consulting the composition seam — a degenerate axis
            // produces a valid-looking 0 ratio, and a non-min injected composer could elevate it
            // back above the convert threshold, silently defeating the fail-closed contract.
            const
                measurable = isMeasurableRect(sourceRect) && isMeasurableRect(targetRect),
                pointer    = pointerInTarget === true,
                // A CONVERTED vessel reverts on a genuine exit, never on mere claim absence — but
                // ONLY when the host can actually tell those apart.
                //
                // `pointerInTarget` is the claim arbiter's live resolution, and a claim expires
                // `claimTtlMs` (300ms) after its last refresh. A stationary pointer fires no move
                // events, so an ordinary human pause over the drop target lets the claim lapse
                // while the vessel sits fully inside the target — measured: `composed` stays at
                // 1.000 while `converted` flips true→false→true per pause. That is a user-visible
                // convert/revert flicker on every hover, not a stale claim. `pointerInTarget`
                // answers "is there a live claim?" while this decision needs "did the pointer
                // leave?", and a lapsed timer is not a departure.
                //
                // So `pointerExitedTarget` is TRI-STATE, and absence fails SAFE rather than
                // permissive. `true` is an observed exit and reverts. `false` is an observed
                // still-inside — the flicker fix, and the only state that holds a conversion
                // through a lapsed claim. ABSENT means the host cannot distinguish the two, and
                // must never silently buy the permissive reading: it falls back to the landed
                // contract where losing the claim reverts. Defaulting absence to "not exited"
                // would let rect overlap alone HOLD a conversion for every caller that has not
                // been taught the new signal — deleting the documented both-directions gate by
                // omission rather than by decision.
                //
                // Convert-IN is deliberately unchanged and still demands a live claim, so a stale
                // claim can never pin a vessel that was never converted.
                exitObserved = pointerExitedTarget === true,
                exitUnknown  = pointerExitedTarget === undefined || pointerExitedTarget === null,
                exited       = exitObserved || (exitUnknown && !pointer),
                rx         = measurable ? axisRatio(sourceRect, targetRect, 'x', 'width')  : 0,
                ry         = measurable ? axisRatio(sourceRect, targetRect, 'y', 'height') : 0,
                composed   = measurable ? clampRatio(composeRatios({rx, ry})) : 0;

            let event = null,
                next  = converted;

            // Convert-IN still requires a live claim: an un-converted vessel must never be pinned
            // by a claim that is not currently valid.
            if (!transition && !converted) {
                if (pointer && composed >= convertThreshold) {
                    event = onConvertIn;
                    next  = true
                }
            } else if (!transition && (exited || composed < revertThreshold)) {
                event = onConvertOut;
                next  = false
            }

            let record = {composed, converted, pointerInTarget: pointer, rx, ry, sourceRect, targetRect};

            if (transition) {
                return {...record, transitioning: true}
            }

            if (!event) {
                return record
            }

            const proposed = {...record, converted: next};

            let admission;

            try {
                admission = event(proposed)
            } catch {
                return record
            }

            if (admission === true) {
                converted = next;
                return proposed
            }

            if (typeof admission?.then !== 'function') {
                return record
            }

            const token = ++generation,
                  state = {promise: null, targetConverted: next, token};

            transition = state;
            state.promise = Promise.resolve(admission).then(value => {
                if (transition !== state || generation !== token) return false;

                value === true && (converted = next);
                transition = null;

                return value === true
            }, () => {
                if (transition === state && generation === token) {
                    transition = null
                }

                return false
            });

            return {...record, transitioning: true}
        }
    }
}
