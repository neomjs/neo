/**
 * Pure, side-effect-free checker for the EVIDENCE SHAPE of an agent's turn-terminal `lane-state`
 * claim (the post-review-pickup §2.5/§2.6 convention).
 *
 * The wake-disposition vs lane-continuation discipline is repeatedly lost to disciplined-sounding
 * terminal prose: a wake correctly classified as low-action, then a turn that ends "standing by"
 * while naming an already-merged PR as a live gate. This validator mechanically rejects stale gate
 * names and own-slice `verified-no-lane` claims. It deliberately validates ONLY the author-provided
 * terminal evidence — it does not compute claimable work, count contributions, or enforce external
 * liveness (that is the separate, deferred external-enforcement layer).
 *
 * @module Neo.ai.scripts.lifecycle.validateLaneStateTerminal
 */

/**
 * The lane-continuation states that answer "may the turn end?".
 *
 * `verified-no-lane` means **no actionable-CLAIMABLE lane** (backed by a full-backlog survey) — NOT
 * literally zero-lane. An agent whose OWNED in-flight lanes are all blocked/gated (own PRs at the human
 * merge gate, a lane handed to a peer, a slice blocked on an unmerged dep) is in `owned-but-blocked`,
 * categorically distinct from zero-lane — so it must not be forced to assert a false `verified-no-lane`.
 * @type {String[]}
 */
export const LANE_CONTINUATIONS = ['active-lane', 'next-lane', 'blocker-routed', 'owned-but-blocked', 'verified-no-lane'];

/**
 * Externally-verifiable block reasons that justify an `owned-but-blocked` gate — each is checkable by a
 * third party (the cited artifact provably exists), which is what separates it from a bare, unverifiable
 * "holding" (the idle-dodge the operator escalated on):
 *  - `peer-pending-artifact`    — a named peer owes the next step (their A2A / graph message exists);
 *  - `ticket-documented-sizing` — the lane's own ticket body documents the block / sizing;
 *  - `adr-grounded-pacing`      — an ADR's pacing / sequencing rule gates the lane;
 *  - `pr-pending-merge`         — a named PR gate awaiting merge (an own PR at the human merge gate, OR a
 *    slice blocked on an unmerged dep): the PR's `mergedAt` is null. Rule 5 additionally requires its gate
 *    to cite `field === 'mergedAt'`, reusing Rule 3's authoritative-merge-field discipline (a PR's
 *    `state` / CLOSED is not unmerged-proof). This expresses the *canonical* owned-but-blocked shape.
 * @type {String[]}
 */
export const OWNED_BUT_BLOCKED_REASONS = ['peer-pending-artifact', 'ticket-documented-sizing', 'adr-grounded-pacing', 'pr-pending-merge'];

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
 *  4. `laneContinuation='verified-no-lane'` (no actionable-CLAIMABLE lane) must cite a NAMED full-backlog
 *     survey artifact with a `checkedAt` AND `scope === 'full-backlog'` — an own-PR-only, own-epic-only,
 *     or unscoped survey fails.
 *  5. `laneContinuation='owned-but-blocked'` (owned in-flight lanes all blocked ≠ verified-no-lane) needs
 *     DUAL evidence: (a) at least one `namedGates` entry, EACH with a `blockReason` in
 *     `OWNED_BUT_BLOCKED_REASONS` (externally-verifiable, not a bare "holding") — and a `pr-pending-merge`
 *     reason additionally must cite `field === 'mergedAt'` (reusing Rule 3's authoritative-merge-field
 *     discipline); AND (b) a full-backlog survey (`scope='full-backlog'`), proving no UNCLAIMED-claimable
 *     lane either. (Per-gate `checkedAt` is enforced by Rule 3.)
 *
 * @param {Object} [laneState={}]
 * @param {String} [laneState.wakeDisposition] One of `actionable|awareness|stale|suppressed|incident`.
 * @param {String} [laneState.laneContinuation] One of `active-lane|next-lane|blocker-routed|owned-but-blocked|verified-no-lane`.
 * @param {Object[]} [laneState.namedGates] Named PR/issue gates: `[{ref, checkedAt, mergeClaim?, field?, blockReason?}]` (`blockReason` required per gate for `owned-but-blocked`).
 * @param {Boolean} [laneState.awaitingOwnPrOnly] True when the only cited lane is an own PR awaiting merge/review/CI.
 * @param {Object} [laneState.backlogSurvey] `{checkedAt, scope}` backing a `verified-no-lane` or `owned-but-blocked` claim; `scope` must be `'full-backlog'`.
 * @returns {{valid: Boolean, violations: String[]}} `valid` is true when no rule is violated.
 */
export function validateLaneStateTerminal(laneState = {}) {
    const {
        wakeDisposition,
        laneContinuation,
        namedGates        = [],
        awaitingOwnPrOnly = false,
        backlogSurvey     = null
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

    // Rule 4 — verified-no-lane needs a named full-backlog survey; an unscoped survey is not full-backlog.
    if (laneContinuation === 'verified-no-lane') {
        if (!backlogSurvey?.checkedAt) {
            violations.push('verified-no-lane must cite a named full-backlog survey artifact (e.g. list_issues / gh issue list) with a checkedAt.');
        } else if (backlogSurvey.scope !== 'full-backlog') {
            violations.push(`verified-no-lane requires a full-backlog survey scope (got ${backlogSurvey.scope ? `'${backlogSurvey.scope}'` : 'no scope'}) — own-PR-only / own-epic-only / unscoped surveys fail.`);
        }
    }

    // Rule 5 — owned-but-blocked needs verifiable per-gate blocks AND a full-backlog survey (the anti-idle-dodge).
    if (laneContinuation === 'owned-but-blocked') {
        if (namedGates.length === 0) {
            violations.push('owned-but-blocked must cite at least one named in-flight lane (namedGates) — with no owned lane, the honest terminal is verified-no-lane, not owned-but-blocked.');
        }

        for (const gate of namedGates) {
            if (!gate?.blockReason) {
                violations.push(`owned-but-blocked gate ${gate?.ref ?? '(unnamed)'} must cite a blockReason — a bare "holding" with no externally-verifiable block is the idle-dodge.`);
            } else if (!OWNED_BUT_BLOCKED_REASONS.includes(gate.blockReason)) {
                violations.push(`owned-but-blocked gate ${gate?.ref ?? '(unnamed)'} cites blockReason '${gate.blockReason}', not an externally-verifiable one (${OWNED_BUT_BLOCKED_REASONS.join(', ')}).`);
            } else if (gate.blockReason === 'pr-pending-merge' && gate.field !== 'mergedAt') {
                violations.push(`owned-but-blocked gate ${gate?.ref ?? '(unnamed)'} cites 'pr-pending-merge' but field ${gate.field ? `'${gate.field}'` : '(none)'} — pending-merge must read mergedAt (a PR's state/CLOSED is not unmerged-proof; mirrors Rule 3's merge-claim discipline).`);
            }
        }

        if (!backlogSurvey?.checkedAt || backlogSurvey.scope !== 'full-backlog') {
            violations.push('owned-but-blocked must ALSO cite a full-backlog survey (scope=full-backlog) — proving no UNCLAIMED-claimable lane either, not just that owned lanes are blocked.');
        }
    }

    return {valid: violations.length === 0, violations};
}

export default validateLaneStateTerminal;
