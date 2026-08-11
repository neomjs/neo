/**
 * Pure, side-effect-free checker for STRICT merge-readiness of a pull request.
 *
 * `reviewDecision=APPROVED` + green checks are necessary but NOT sufficient: GitHub flattens
 * `reviewDecision` to APPROVED as soon as it has enough formal review state, even while an
 * explicitly-requested reviewer is still outstanding (`reviewRequests` non-empty). The author/operator's
 * requested-reviewer set is an explicit contract — a non-empty `reviewRequests` blocks strict
 * merge-readiness until each request is disposed (a formal APPROVED / CHANGES_REQUESTED review, a
 * visible step-out, or an author/operator unrequest). An A2A peer approval does NOT clear a
 * requested-reviewer slot. Human-only merge authority is unchanged; this only validates the *claim*
 * that a PR is strict-merge-ready, so a stale reviewer contract is not reported as a green surface.
 *
 * @module Neo.ai.scripts.lifecycle.validateMergeReady
 * @plane in-plane
 */

/**
 * The ONLY `mergeStateStatus` values that confirm a PR is mergeable. An allowlist, NOT a denylist:
 * any other state — `DIRTY`/`BEHIND`/`BLOCKED` (a conflict / stale base) or `UNKNOWN` (GitHub has not
 * computed mergeability yet) — fails closed, since an unconfirmed state cannot certify strict readiness.
 * `UNSTABLE` is admitted (it is mergeable; the separate `checksGreen` gate covers CI).
 * @type {String[]}
 */
export const MERGEABLE_STATES = ['CLEAN', 'UNSTABLE'];

/**
 * @summary Validates whether a PR is STRICT merge-ready against the full review/merge contract.
 *
 * Rules (all must hold for `strictMergeReady`):
 *  1. The PR source was fetched as `state === 'OPEN'` and `mergedAt === null`.
 *  2. `reviewDecision === 'APPROVED'`.
 *  3. `checksGreen === true` (all required CI checks pass).
 *  4. `mergeStateStatus` is fetched AND a confirmed-mergeable state (allowlist `CLEAN`/`UNSTABLE`); `UNKNOWN`
 *     (mergeability not yet computed) and DIRTY/BEHIND/BLOCKED all fail closed.
 *  5. `reviewRequests` is fetched AND every explicitly-requested reviewer is disposed — i.e. `reviewRequests`
 *     minus `disposedReviewers` is empty (the reviewer-contract gate).
 *
 * Fail-CLOSED contract: `state`, `mergedAt`, `checksGreen`, `mergeStateStatus`, and `reviewRequests`
 * that were NOT fetched (`undefined`) each block readiness — an un-queried field cannot certify a
 * green surface, and an omitted `reviewRequests` must never be read as "no outstanding reviewers".
 * Pass `mergedAt: null` and `reviewRequests: []` to assert fetched-and-empty values.
 *
 * @param {Object} [pr={}]
 * @param {String} [pr.state] GitHub PR state; only fetched `OPEN` passes.
 * @param {String|null} [pr.mergedAt] GitHub merge timestamp; fetched `null` passes.
 * @param {String} [pr.reviewDecision] GitHub flattened review decision (`APPROVED` | `CHANGES_REQUESTED` | `REVIEW_REQUIRED` | null).
 * @param {Boolean} [pr.checksGreen] True when all required CI checks pass; `undefined` (not fetched) fails closed.
 * @param {String} [pr.mergeStateStatus] GitHub mergeStateStatus (`CLEAN` | `UNSTABLE` | `DIRTY` | `BEHIND` | `BLOCKED` | ...); `undefined` (not fetched) fails closed.
 * @param {String[]} [pr.reviewRequests] Logins of still-requested reviewers (the explicit author/operator contract); `undefined` (not fetched) fails closed, `[]` asserts fetched-and-empty.
 * @param {String[]} [pr.disposedReviewers] Requested reviewers already disposed (formal review / visible step-out / unrequest).
 * @returns {{strictMergeReady: Boolean, blockers: String[]}}
 */
export function validateMergeReady(pr = {}) {
    const {
        state,
        mergedAt,
        reviewDecision,
        checksGreen,
        mergeStateStatus,
        reviewRequests,
        disposedReviewers = []
    } = pr;

    const blockers = [];

    if (state === undefined) {
        blockers.push('state was not fetched — cannot certify the pull request is open; failing closed.');
    } else if (state !== 'OPEN') {
        blockers.push(`state is '${state}', not OPEN.`);
    }

    if (mergedAt === undefined) {
        blockers.push('mergedAt was not fetched — cannot certify the pull request is unmerged; failing closed.');
    } else if (mergedAt !== null) {
        blockers.push(`mergedAt is '${mergedAt}', so the pull request is already merged.`);
    }

    if (reviewDecision !== 'APPROVED') {
        blockers.push(`reviewDecision is '${reviewDecision ?? 'none'}', not APPROVED.`);
    }

    // Fail CLOSED on un-fetched fields: a field that was never queried cannot certify readiness,
    // so an omitted reviewRequests/mergeStateStatus must block — never silently pass as "no problem".
    if (checksGreen !== true) {
        blockers.push(checksGreen === undefined
            ? 'checksGreen was not fetched — cannot certify CI; failing closed.'
            : 'not all required CI checks are green.');
    }

    if (mergeStateStatus === undefined) {
        blockers.push('mergeStateStatus was not fetched — cannot certify mergeability; failing closed.');
    } else if (!MERGEABLE_STATES.includes(mergeStateStatus)) {
        blockers.push(`mergeStateStatus is '${mergeStateStatus}' — not a confirmed-mergeable state (only ${MERGEABLE_STATES.join('/')} certify; DIRTY/BEHIND/BLOCKED/UNKNOWN fail closed).`);
    }

    if (reviewRequests === undefined) {
        blockers.push('reviewRequests was not fetched — cannot certify the reviewer contract is disposed; failing closed.');
    } else {
        const outstanding = reviewRequests.filter(reviewer => !disposedReviewers.includes(reviewer));
        if (outstanding.length > 0) {
            blockers.push(`outstanding requested reviewer(s) [${outstanding.join(', ')}] — an explicit reviewer contract is not strict-merge-ready until each is disposed (formal review, visible step-out, or unrequest); an A2A approval does not clear the slot.`);
        }
    }

    return {strictMergeReady: blockers.length === 0, blockers};
}

export default validateMergeReady;
