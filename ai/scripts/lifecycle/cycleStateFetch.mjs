/**
 * @summary Maps raw GitHub query output into the `computeCycleState()` input shape — the impure
 * fetch-and-map layer feeding the shared cycle-state discriminator. The daemon runs the GitHub queries
 * (it can afford the latency; the sync Stop hook reads the cached verdict instead), then maps the JSON
 * here so the derivation (CI-green, changes-requested, review-requested) stays pure + unit-testable.
 *
 * **Increment scope:** the lifecycle-closure mappers (own PRs + review requests = cycle steps 1-3). The
 * next-lane backlog mapper (step 4, with its gated/blocked/colliding flag derivation) + the impure
 * `gh`-runner wrapper are follow-up increments.
 *
 * @see ai/scripts/lifecycle/cycleState.mjs      — the discriminator these feed
 * @see ai/scripts/lifecycle/cycleStateCache.mjs — where the daemon caches the computed verdict
 */

/**
 * Is a PR's CI green? Pure over a `gh pr view --json statusCheckRollup` rollup array.
 *
 * Green = every check has settled successfully (no FAILURE / ERROR, and nothing still PENDING /
 * IN_PROGRESS / QUEUED). An empty rollup (no checks configured) counts as green — there is nothing
 * failing to block a review request. Handles both `CheckRun` (`conclusion`) and legacy `StatusContext`
 * (`state`) rollup shapes.
 *
 * @param {Object[]} rollup The `statusCheckRollup` array from `gh pr ... --json statusCheckRollup`.
 * @returns {Boolean}
 */
export function isCiGreen(rollup) {
    if (!Array.isArray(rollup) || rollup.length === 0) return true;
    return rollup.every(check => {
        const outcome = check?.conclusion || check?.state; // CheckRun.conclusion | StatusContext.state
        return outcome === 'SUCCESS' || outcome === 'NEUTRAL' || outcome === 'SKIPPED'
    })
}

/**
 * Maps `gh pr list --author @me --json number,statusCheckRollup,reviewDecision,reviewRequests` output
 * into the discriminator's `ownPRs` shape.
 * @param {Object[]} prListJson
 * @returns {{ref:String, ciGreen:Boolean, reviewRequested:Boolean, changesRequested:Boolean}[]}
 */
export function mapOwnPRs(prListJson) {
    return (Array.isArray(prListJson) ? prListJson : []).map(pr => ({
        ref             : `#${pr.number}`,
        ciGreen         : isCiGreen(pr.statusCheckRollup),
        // A reviewer is currently requested on the PR (so a fresh request is NOT needed).
        reviewRequested : Array.isArray(pr.reviewRequests) && pr.reviewRequests.length > 0,
        changesRequested: pr.reviewDecision === 'CHANGES_REQUESTED'
    }))
}

/**
 * Maps `gh pr list --search "review-requested:@me" --json number` output into the discriminator's
 * `reviewRequests` shape (PRs where a review is designated to this agent).
 * @param {Object[]} prListJson
 * @returns {{ref:String}[]}
 */
export function mapReviewRequests(prListJson) {
    return (Array.isArray(prListJson) ? prListJson : []).map(pr => ({ref: `#${pr.number}`}))
}
