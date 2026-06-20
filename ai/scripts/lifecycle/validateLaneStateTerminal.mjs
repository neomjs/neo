/**
 * Pure, side-effect-free checker for the EVIDENCE SHAPE of an agent's turn-terminal `lane-state`
 * claim (the post-review-pickup §2.5/§2.6 convention).
 *
 * The wake-disposition vs lane-continuation discipline is repeatedly lost to disciplined-sounding
 * terminal prose: a wake correctly classified as low-action, then a turn that ends "standing by"
 * while naming an already-merged PR as a live gate. This validator mechanically rejects stale gate
 * names and non-driving terminals. It deliberately validates ONLY the author-provided terminal
 * evidence — it does not compute claimable work, count contributions, or enforce external liveness
 * (that is the separate, deferred external-enforcement layer).
 *
 * @module Neo.ai.scripts.lifecycle.validateLaneStateTerminal
 */

/**
 * The lane-continuation states that answer "may the turn end?" — all three are DRIVING continuations.
 * Per §no_hold_state there is no hold state: the only valid turn-state is on / jumped-to a high-value
 * lane. The survey-idle terminal `verified-no-lane` was retired — under "high-value work is infinite"
 * it is ~never honestly true, and the `L3_No_Hold_State` firewall brands it a manufactured idle.
 * @type {String[]}
 */
export const LANE_CONTINUATIONS = ['active-lane', 'next-lane', 'blocker-routed'];

/**
 * Wake dispositions that answer only "engage this message?" — never "does the turn have a lane?".
 * @type {String[]}
 */
export const NON_TERMINAL_DISPOSITIONS = ['awareness', 'stale', 'suppressed'];

/**
 * @summary Validates a structured turn-terminal `lane-state` descriptor against the evidence rules.
 *
 * Rules:
 *  1. A `wakeDisposition` of awareness/stale/suppressed is not a terminal on its own — a
 *     `laneContinuation` is required.
 *  2. `laneContinuation='active-lane'` may not be only an own PR awaiting merge/review/CI (a
 *     background watch); that resolves to `next-lane` unless there is concrete author work on it.
 *  3. Every named PR/issue gate must cite a same-turn `checkedAt` (stale gate names are not evidence);
 *     a gate flagged `mergeClaim` must cite `field === 'mergedAt'` (reading a PR's `state`/CLOSED is
 *     not merge proof — a closed PR may be un-merged).
 *
 * @param {Object} [laneState={}]
 * @param {String} [laneState.wakeDisposition] One of `actionable|awareness|stale|suppressed|incident`.
 * @param {String} [laneState.laneContinuation] One of `active-lane|next-lane|blocker-routed`.
 * @param {Object[]} [laneState.namedGates] Named PR/issue gates this terminal cites: `[{ref, checkedAt, mergeClaim?, field?}]`.
 * @param {Boolean} [laneState.awaitingOwnPrOnly] True when the only cited lane is an own PR awaiting merge/review/CI.
 * @returns {{valid: Boolean, violations: String[]}} `valid` is true when no rule is violated.
 */
export function validateLaneStateTerminal(laneState = {}) {
    const {
        wakeDisposition,
        laneContinuation,
        namedGates        = [],
        awaitingOwnPrOnly = false
    } = laneState;

    const violations = [];

    // Rule 1 — a wake disposition alone is not a terminal.
    if (!laneContinuation) {
        violations.push(NON_TERMINAL_DISPOSITIONS.includes(wakeDisposition)
            ? `wakeDisposition='${wakeDisposition}' answers only the message, not the turn: a laneContinuation is required.`
            : `Missing laneContinuation (one of: ${LANE_CONTINUATIONS.join(', ')}).`);
        return {valid: false, violations};
    }

    if (!LANE_CONTINUATIONS.includes(laneContinuation)) {
        violations.push(`Unknown laneContinuation '${laneContinuation}' (expected one of: ${LANE_CONTINUATIONS.join(', ')}).`);
    }

    // Rule 2 — active-lane is not an own-PR background watch.
    if (laneContinuation === 'active-lane' && awaitingOwnPrOnly) {
        violations.push('active-lane cannot be only an own PR awaiting merge/review/CI (a background watch) — it resolves to next-lane unless there is concrete author work on that PR this turn.');
    }

    // Rule 3 — named gates need a same-turn checkedAt; a merge claim must read the authoritative field.
    for (const gate of namedGates) {
        if (!gate?.checkedAt) {
            violations.push(`Named gate ${gate?.ref ?? '(unnamed)'} must cite a same-turn checkedAt — a stale gate name is not evidence.`);
        } else if (gate.mergeClaim && gate.field !== 'mergedAt') {
            violations.push(`Named gate ${gate.ref ?? '(unnamed)'} claims merge state but cites field ${gate.field ? `'${gate.field}'` : '(none)'} — a merge claim must read mergedAt (a PR's state/CLOSED is not merge proof).`);
        }
    }

    return {valid: violations.length === 0, violations};
}

export default validateLaneStateTerminal;
