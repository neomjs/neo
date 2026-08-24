/**
 * @module ai/services/github-workflow/shared/mergeHoldTokens
 * @summary Reads reviewer merge-hold tokens off a PR timeline — the retracted half of an approval.
 *
 * A reviewer can approve at T0 and withdraw at T1 by posting a hold. GitHub's `reviewDecision` is a
 * flattened snapshot with no notion of supersession, so it still reads `APPROVED` at T1 and the PR
 * reports merge-ready while its owner has explicitly said stop. The tokens were already in the
 * corpus — `[MERGE_HOLD]`, `[RE_REVIEW_HOLD]` — emitted by reviewers and read by nothing.
 *
 * This is the mirror of the case `validateMergeReady` was built for. There, `APPROVED` overstated
 * the contract because a PENDING obligation was invisible; here because a RETRACTED approval is.
 * Same root: a point-in-time flag standing in for a contract state.
 *
 * **A SET, not a regex over prose.** Reviewers write the word "hold" constantly, including in
 * sentences declining to hold one — "no reason to hold this", "I am not holding merge on it". A
 * substring matcher would block on those, and blocking a PR because someone said they were *not*
 * blocking it is worse than the gap, because the reason would read as deliberate.
 */

/**
 * The recognised merge-hold vocabulary. PRIVATE — the consumed contract is the reader below, never
 * the Set: an exported mutable Set lets any importer rewrite every consumer's classifier at once.
 *
 * Both members are drawn from live reviewer usage rather than invented here. Adding one is a
 * deliberate act with a real cost: a token nobody emits is dead weight, and a token that collides
 * with ordinary prose re-opens the false-positive hole this Set exists to close.
 * @type {Set<String>}
 */
const MERGE_HOLD_TOKENS = new Set([
    'merge_hold',     // do not merge at this head; a prior approval is not a current authorization
    're_review_hold'  // the approval stands but the head moved; re-review before merging
]);

/**
 * @summary Returns the hold token a comment carries, or `null`.
 *
 * **Structural, never lexical.** A token counts only inside a bracket run that OPENS a line —
 * `[MERGE_HOLD]`, or the heading form reviewers actually use, `` ## `[MERGE_HOLD]` ``. Leading `#`
 * and backtick are skipped because that is how the convention is written in practice; everything
 * else must be the bracket run itself. Prose mentioning `[MERGE_HOLD]` mid-sentence does not match,
 * which is the same separation `a2aCollisionTags` draws between a message that IS a claim and one
 * that MENTIONS claims.
 *
 * Multi-line bodies are scanned per line, because a hold is normally a heading above its rationale.
 *
 * @param {String} body Comment body.
 * @returns {String|null} the matched token name (lower-case), or `null`.
 */
export function mergeHoldToken(body = '') {
    for (const line of String(body).split('\n')) {
        const run = line.match(/^\s*[#`\s]*(?:\[[^\]]*\]\s*`?\s*)+/);

        if (!run) {
            continue;
        }

        for (const match of run[0].matchAll(/\[([^\]]*)\]/g)) {
            const name = match[1].trim().toLowerCase();

            if (MERGE_HOLD_TOKENS.has(name)) {
                return name;
            }
        }
    }

    return null
}

/**
 * @summary Decides whether an ACTIVE reviewer hold stands against a PR.
 *
 * A hold is active when a reviewer's hold comment is NEWER than that same reviewer's latest
 * submitted review. The two clearing rules are the whole design and both are deliberate:
 *
 * - **Only a newer submitted review from the SAME reviewer clears it.** A later comment does not —
 *   a hold cleared by a comment would let the holder's own "thanks, looking now" retract their stop.
 * - **Another peer never clears it.** A hold cleared by a third party would read as deliberately
 *   dispositioned while the holder still objects, which is worse than no hold at all.
 *
 * **Truncation degrades to unresolved, never to "no hold".** The comment window is bounded, so a
 * hold can sit outside it. A hold FOUND inside the window is decisive; finding none over a
 * truncated window is missing evidence rather than evidence of absence — the same existential
 * asymmetry the cross-family mandate hits on its bounded approvals list. The caller fails closed.
 *
 * @param {Object}   args
 * @param {Object[]} [args.comments=[]] `{login, createdAt, token, commentId}` — pre-classified.
 * @param {Object[]} [args.reviews=[]]  `{login, submittedAt}` — submitted reviews only.
 * @param {Boolean}  [args.truncated=false] Whether the comment window was bounded away.
 * @returns {{held: (Boolean|null), holders: Object[]}} `held: null` means it could not be decided.
 */
export function resolveMergeHold({comments = [], reviews = [], truncated = false} = {}) {
    const latestReviewByLogin = new Map();

    for (const review of reviews) {
        const login = review?.login;

        if (!login || !review?.submittedAt) {
            continue;
        }

        const current = latestReviewByLogin.get(login);

        if (!current || review.submittedAt > current) {
            latestReviewByLogin.set(login, review.submittedAt);
        }
    }

    const holders = comments.filter(comment => {
        if (!comment?.token || !comment?.login || !comment?.createdAt) {
            return false;
        }

        const clearedAt = latestReviewByLogin.get(comment.login);

        // Strictly newer: a review submitted at the same instant as the hold cannot be assumed to
        // supersede it, and an equality that guessed would guess in the permissive direction.
        return !clearedAt || comment.createdAt > clearedAt
    });

    return {
        held: holders.length > 0 ? true : (truncated ? null : false),
        holders
    }
}

export default resolveMergeHold;
