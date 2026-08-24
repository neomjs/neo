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
 *  6. `crossFamilyVerdict` is resolved AND reports `crossFamily === true` — the §6.1 cross-family mandate.
 *     GitHub models no model family, so rule 2 cannot stand in for this one: an APPROVED badge earned
 *     entirely within the author's own family satisfies `reviewDecision` and violates the mandate.
 *  7. `holdVerdict` is resolved AND reports no active reviewer hold. A reviewer can approve at T0 and
 *     withdraw at T1 by posting `[MERGE_HOLD]`; `reviewDecision` is a flattened snapshot with no
 *     notion of supersession and still reads APPROVED. This is rule 5's mirror — there a PENDING
 *     obligation was invisible, here a RETRACTED approval is.
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
 * @param {Object} [pr.holdVerdict] Verdict from `resolveMergeHold` — `{held, holders}`. `undefined` (not resolved) fails closed; `held: null` (the comment window was truncated) blocks with its own reason rather than reading as "no hold".
 * @param {Object} [pr.crossFamilyVerdict] Verdict from `resolveCrossFamilyVerdict` — `{crossFamily, authorFamily, approvingFamilies, authorLogin}`. `undefined` (not resolved) fails closed; `crossFamily: null` (author family unresolved) blocks with its own reason rather than collapsing into pass or fail.
 * @param {String} [pr.approvedAtOid] Commit oid the approving review was submitted against. Optional: absent means the anchor is not reported, never that it is fresh.
 * @param {String} [pr.headRefOid] Current head oid, paired with `approvedAtOid` to surface a stale approval anchor.
 * @returns {{strictMergeReady: Boolean, blockers: String[], advisories: String[]}}
 */
export function validateMergeReady(pr = {}) {
    const {
        state,
        mergedAt,
        reviewDecision,
        checksGreen,
        mergeStateStatus,
        reviewRequests,
        disposedReviewers = [],
        approvedAtOid,
        headRefOid,
        crossFamilyVerdict,
        holdVerdict
    } = pr;

    const blockers   = [],
          advisories = [];

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

    // `reviewDecision` answers "did someone with review rights approve". It cannot answer "is the
    // approval one our rules accept", because GitHub models no notion of model family — so no
    // GitHub-derived field will ever express the cross-family mandate, and a validator that mirrors
    // those fields certifies a PR the mandate forbids. Observed live: a same-family-only approval
    // returned strictMergeReady with ZERO blockers and zero advisories, so the reader got no signal
    // at all — not a warning, not an unknown. The operator's override stays theirs; the point of
    // this rule is that the override is INFORMED rather than depending on a reviewer noticing.
    //
    // Fail CLOSED like every other predicate field: an unresolved verdict blocks. `null` is the
    // author-not-rostered case, which is external-contributor territory rather than a mandate
    // breach — reported as its own blocker so the reader can see WHY it could not be certified,
    // instead of being silently folded into either boolean.
    if (crossFamilyVerdict === undefined) {
        blockers.push('crossFamilyVerdict was not resolved — cannot certify the cross-family review mandate; failing closed.');
    } else if (crossFamilyVerdict?.crossFamily === null) {
        blockers.push(`cross-family mandate could not be evaluated: the author family did not resolve${crossFamilyVerdict.authorLogin ? ` for '${crossFamilyVerdict.authorLogin}'` : ''}. An unrostered author is usually an external contributor, for whom the mandate does not apply — confirm that before merging.`);
    } else if (crossFamilyVerdict?.crossFamily === false) {
        blockers.push(`cross-family review mandate unsatisfied: author family '${crossFamilyVerdict.authorFamily}', approving families [${(crossFamilyVerdict.approvingFamilies || []).join(', ') || 'none'}]. pull-request-workflow.md §6.1 requires at least one APPROVED review from a different model family; GitHub's reviewDecision cannot express this, so an APPROVED badge is not evidence of it.`);
    }

    // A reviewer who withdrew their approval in a comment. Every other gap in this validator fails
    // CLOSED — an unfetched field blocks, `UNKNOWN` mergeability blocks, an outstanding reviewer
    // blocks. This one failed OPEN: the PR reported green while its owner had explicitly said stop,
    // and the stop lived in prose no readiness surface read. Observed live, with the author (me)
    // having already broadcast merge-ready inside that window.
    //
    // `held: null` is the truncated-window case and is NOT "no hold": a bounded comment list can
    // hide one, and absence in a bounded window is missing evidence rather than evidence of
    // absence. It blocks with its own reason so the reader can tell "someone is holding this" from
    // "we could not see far enough to know".
    if (holdVerdict === undefined) {
        blockers.push('holdVerdict was not resolved — cannot certify that no reviewer withdrew approval; failing closed.');
    } else if (holdVerdict?.held === null) {
        blockers.push('reviewer-hold state could not be evaluated: the comment window was truncated, so a hold may sit outside it. Absence over a bounded window is missing evidence, not evidence of absence.');
    } else if (holdVerdict?.held === true) {
        const named = (holdVerdict.holders || []).map(holder => `@${holder.login} (${holder.token})`).join(', ');

        blockers.push(`reviewer hold outstanding: ${named || 'unnamed holder'}. A hold posted after that reviewer's latest submitted review withdraws it; reviewDecision cannot express supersession, so an APPROVED badge is not evidence the approval still stands. Only a NEWER submitted review from the same reviewer clears it.`);
    }

    // The anchor, and it is deliberately an ADVISORY rather than a blocker.
    //
    // `reviewDecision: APPROVED` says a verdict exists; it never says which commit earned it. A
    // rebase or a fixup moves the head and leaves the badge untouched, so the board reads APPROVED
    // for a commit nobody has read — and the only surfaces that notice are a human remembering, or
    // a peer checking by hand. This surfaces the pair so the reader can judge.
    //
    // NOT a blocker, because most stale anchors are content-free: a rebase over data-sync commits
    // moves every sha and changes nothing anyone reviewed. Blocking those would red every rebased
    // PR in the repo and train reviewers to ignore the signal, which costs more than the gap.
    // Whether the delta MATTERS is a judgement over the diff, and this function holds no diff.
    //
    // Un-fetched is silence rather than a fail-closed block, which inverts this module's rule for
    // every other field — deliberately. The other fields are part of the merge-ready PREDICATE, so
    // an un-queried one cannot certify and must block. The anchor certifies nothing; it is a
    // reporting channel, and a caller that never asks for it is not making a weaker claim.
    if (approvedAtOid && headRefOid && approvedAtOid !== headRefOid) {
        advisories.push(`approval anchor is stale: reviewDecision APPROVED was earned at '${approvedAtOid}', head is now '${headRefOid}'. The badge does not degrade when the head moves — confirm the delta is content-free for the reviewed paths (diff EVERYTHING and subtract pipeline-owned trees; an enumerated path list answers only "did anything change where I thought to look"), or re-request review.`);
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

    return {strictMergeReady: blockers.length === 0, blockers, advisories};
}

export default validateMergeReady;
