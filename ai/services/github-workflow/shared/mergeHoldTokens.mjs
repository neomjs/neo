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
 * **CODE IS EXAMPLE, NEVER ISSUANCE.** A token inside a fenced block or an indented code block is
 * being SHOWN, not emitted. Found by @neo-gpt-emmy at review: the original negative control
 * exercised the inline-backtick shape the matcher already handled and never the fenced shape it
 * did not.
 *
 * **A BLOCK, not a line.** "Opens a line" is not a property an author controls — prose wraps, and a
 * wrap can promote a mid-sentence mention to line-initial. The reference doc's own sentence
 * explaining that a mid-sentence mention does NOT hold wrapped precisely there and classified as a
 * hold; an example that contradicts itself is the sharpest possible evidence that the rule was
 * wrong. So a token must open a BLOCK: first content line, after a blank line, or after a fence.
 * A wrapped continuation always has a non-blank predecessor and is therefore never an issuance.
 *
 * @param {String} body Comment body.
 * @returns {String|null} the matched token name (lower-case), or `null`.
 */
export function mergeHoldToken(body = '') {
    let
        blockStart = true,
        fenced     = false;

    for (const line of String(body).split('\n')) {
        // Toggle on any fence marker. An opening fence may carry an info string (```js); a closing
        // one is bare. Treating both as a toggle is enough — an UNCLOSED fence then swallows the
        // rest of the body, which fails toward "no hold" and is the correct direction: a body whose
        // markdown does not terminate is not an unambiguous issuance.
        if (/^\s{0,3}(?:```|~~~)/.test(line)) {
            fenced     = !fenced;
            // A fence ends the block it interrupted, so the line after it opens a new one.
            blockStart = true;
            continue;
        }

        // Four spaces is a markdown code block by the same reasoning as the fence.
        if (fenced || /^\s{4,}\S/.test(line)) {
            continue;
        }

        if (!line.trim()) {
            blockStart = true;
            continue;
        }

        const
            opensBlock = blockStart,
            run        = line.match(/^\s*[#`\s]*(?:\[[^\]]*\]\s*`?\s*)+/);

        // Every non-blank line consumes the block opening, whether or not it carries a token.
        blockStart = false;

        if (!opensBlock || !run) {
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
 * A hold is a reviewer WITHDRAWING THEIR OWN APPROVAL. That is one rule about standing and two
 * about clearing, and all three are deliberate:
 *
 * - **Only a prior approver can hold.** The token confers no authority by itself: a commenter with
 *   no approving review has no approval to retract, and admitting them would let any drive-by
 *   comment block any PR. The approval must be strictly OLDER than the hold — approving after your
 *   own hold is the approval speaking last.
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
 * **The persistence boundary, stated rather than implied.** Comments are mutable and this reader
 * sees only the CURRENT body, so editing the token out of a hold comment does erase the hold
 * without any newer review. Recovering that needs issuance history the comment API does not carry
 * in this projection. So "only a newer review clears it" governs the REVIEW timeline; it is not a
 * claim about an editable source, and a reader who takes it for one is owed this paragraph.
 *
 * @param {Object}   args
 * @param {Object[]} [args.comments=[]] `{login, createdAt, token, commentId}` — pre-classified.
 * @param {Object[]} [args.reviews=[]]  `{login, submittedAt, state}` — submitted reviews only.
 * @param {Boolean}  [args.truncated=false] Whether the comment window was bounded away.
 * @returns {{held: (Boolean|null), holders: Object[]}} `held: null` means it could not be decided.
 */
export function resolveMergeHold({comments = [], reviews = [], truncated = false} = {}) {
    const
        // Two indices, because standing and clearing ask different questions of the same timeline:
        // an APPROVED review grants the right to hold, any submitted review spends it.
        latestApprovalByLogin = new Map(),
        latestReviewByLogin   = new Map();

    for (const review of reviews) {
        const login = review?.login;

        if (!login || !review?.submittedAt) {
            continue;
        }

        const current = latestReviewByLogin.get(login);

        if (!current || review.submittedAt > current) {
            latestReviewByLogin.set(login, review.submittedAt);
        }

        if (review.state === 'APPROVED') {
            const approved = latestApprovalByLogin.get(login);

            if (!approved || review.submittedAt > approved) {
                latestApprovalByLogin.set(login, review.submittedAt);
            }
        }
    }

    const holders = comments.filter(comment => {
        if (!comment?.token || !comment?.login || !comment?.createdAt) {
            return false;
        }

        const approvedAt = latestApprovalByLogin.get(comment.login);

        // STANDING. No approval to withdraw, no hold — and an approval at-or-after the token means
        // the reviewer's latest word is the approval itself.
        if (!approvedAt || approvedAt >= comment.createdAt) {
            return false;
        }

        // CLEARING. Strictly newer: a review submitted at the same instant as the hold cannot be
        // assumed to supersede it, and an equality that guessed would guess in the permissive
        // direction. `clearedAt` is always defined here — the approval that granted standing is
        // itself a submitted review.
        return comment.createdAt > latestReviewByLogin.get(comment.login)
    });

    return {
        held: holders.length > 0 ? true : (truncated ? null : false),
        holders
    }
}

export default resolveMergeHold;
