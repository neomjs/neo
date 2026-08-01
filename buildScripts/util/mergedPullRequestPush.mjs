/**
 * @summary Pure predicate for the pre-push merged-pull-request guard.
 *
 * Detects the signature of a push that **succeeds and reaches nothing**: the branch's most
 * recent pull request has already merged, so the ref advances server-side while no pull
 * request adopts the commit and no CI ever runs on it. Every ref-level instrument reports
 * success, which is precisely why this wants a mechanical check rather than a rule — the
 * author's `git push`, `git ls-remote`, and `gh pr checks` all return true answers to a
 * question they were not being asked.
 *
 * Kept pure and side-effect-free so it is unit-testable without executing the pre-push hook
 * or reaching GitHub; the hook resolves the live pull-request state and owns the warn
 * behaviour, mirroring the split already used by {@link ./branchFreshness.mjs}.
 *
 * **Why the comparison is `headRefOid` and not the merge commit.** A pull request's merge
 * commit lives on the base line, and under squash-merge it shares no ancestry with the head
 * branch, so `base..HEAD` ancestry answers a different question. The head coordinate is the
 * pull request's own `headRefOid` — the last commit the pull request contained. It is compared
 * **as a string, never with `git merge-base`**: after a merge (and any subsequent rebase of the
 * head branch) that object is frequently absent from the local clone, where `merge-base
 * --is-ancestor` exits `128` — an error, not a truth value, and trivially misread as a `false`.
 * Confirmed by replaying a real merged pull request whose head object no longer resolved in a
 * fresh clone while its branch ref had advanced past it.
 *
 * **Fail toward pushing.** Every unresolvable input — no pull request, unreadable state, an
 * unknown containment answer — yields `warn: false`. A false block would strand an author who
 * is offline, unauthenticated, or rate-limited, and this guard has no block channel to begin
 * with: the return shape cannot express one.
 *
 * @see #16256 — the ticket this module implements (ticket-ref-ok: implementing ticket)
 * @see buildScripts/util/branchFreshness.mjs — the sibling pure predicate behind the
 *      pre-push branch-staleness advisory, whose non-blocking stance this follows
 * @see buildScripts/util/check-branch-discipline.mjs — the pre-push hook that supplies the
 *      live coordinates and owns the console output
 */

/**
 * @summary Decides whether a push carries commits that no pull request will adopt.
 *
 * Warns only when all three hold: the branch's most recent pull request is merged, the local
 * head is not the commit that pull request merged, and the local head is demonstrably not yet
 * contained in the base line. Anything else — including every unknown — stays silent, so the
 * common path adds no noise and an advisory nobody reads is never created.
 *
 * @param {Object}        args
 * @param {Object|null}  [args.pullRequest=null]         The branch's most recent pull request, or
 *     `null` when the branch never had one or the lookup failed. Shape:
 *     `{number: Number, state: String, mergedAt: String, headRefOid: String}`.
 * @param {String|null}  [args.headSha=null]             Full local `HEAD` commit ID being pushed.
 * @param {Boolean|null} [args.headContainedInBase=null] Whether every commit on this branch is
 *     already contained in the base line. `true` ⇒ nothing can be lost, stay silent. `null` ⇒
 *     the answer could not be computed, stay silent.
 * @returns {{warn: Boolean, status: String}} `status` names the branch taken, so the hook and
 *     its specs assert intent rather than a bare boolean.
 */
export function assessMergedPullRequestPush({
    pullRequest = null,
    headSha = null,
    headContainedInBase = null
}) {
    if (!pullRequest || typeof pullRequest !== 'object') {
        return {warn: false, status: 'no-pull-request'}
    }

    const state = typeof pullRequest.state === 'string' ? pullRequest.state.toUpperCase() : null;

    if (!state) {
        return {warn: false, status: 'pull-request-unresolved'}
    }

    if (state !== 'MERGED') {
        return {warn: false, status: state === 'OPEN' ? 'pull-request-open' : 'pull-request-not-merged'}
    }

    const fullObjectIdPattern = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i;

    if (!fullObjectIdPattern.test(headSha || '') || !fullObjectIdPattern.test(pullRequest.headRefOid || '')) {
        return {warn: false, status: 'coordinates-unresolved'}
    }

    if (headSha.toLowerCase() === pullRequest.headRefOid.toLowerCase()) {
        return {warn: false, status: 'head-matches-merged-head'}
    }

    if (headContainedInBase === true) {
        return {warn: false, status: 'head-contained-in-base'}
    }

    if (headContainedInBase !== false) {
        return {warn: false, status: 'base-containment-unknown'}
    }

    return {warn: true, status: 'unreached-commits'}
}
