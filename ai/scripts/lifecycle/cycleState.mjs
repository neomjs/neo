/**
 * @summary Pure cycle-state discriminator — the shared "what is the claimable-now next step?" primitive
 * that the idle-out fix's producer and consumer both depend on.
 *
 * The idle-out fix has one computation at its heart: given the agent's *external* lifecycle state (open
 * own-PRs, review requests addressed to it, claimable backlog), what is the single next step that
 * advances the cycle — or is the cycle genuinely empty? Two surfaces consume that verdict:
 * - the **daemon** (async) computes it from fetched GitHub/graph state, caches it, and renders it into the
 *   idle-out / heartbeat wake digest (so the receiver sees the next step, not an opaque pulse count);
 * - the **liveness Stop hook** (sync) reads the cached verdict and enforces it (block a no-progress
 *   turn-exit iff a claimable-now step existed).
 *
 * This module is the PURE core of that verdict — it takes already-fetched external state and returns the
 * next step. Fetching (GitHub/graph queries) and caching live in the daemon; keeping the discriminator
 * pure makes the load-bearing distinction unit-testable in isolation.
 *
 * **The load-bearing distinction (the falsification-AC core): claimable-now ≠ raw-backlog-non-empty.**
 * A backlog item counts as a next step ONLY if it is *claimable-now* — un-gated (not blocked by an
 * unmerged dependency, not architecture-/decision-gated), non-colliding (no other agent holds an active
 * lane-claim on it), and un-blocked (its blockers are resolved). A non-empty backlog of *gated* items is
 * a legitimate empty cycle — the enforcement hook MUST NOT fire on it, or it becomes the noise it exists
 * to remove. This module is where that distinction is computed.
 *
 * @see ai/scripts/lifecycle/idleOutNudge.mjs — the per-identity pulse dispatcher (Sub B producer side)
 * @see ai/daemons/bridge/daemon.mjs — renders the verdict into the wake digest (Sub B display)
 * @see .claude/hooks/liveness-enforce.mjs — reads the cached verdict + enforces (Sub C consumer)
 */

/**
 * The deterministic cycle priority order — lifecycle-closure before new-lane expansion. Lower index =
 * higher priority. The ≤10-own-open-PR cap is backpressure on `next-lane` only (open-new vs drive-existing),
 * never a reason to skip an actionable lifecycle item below it — so it does not appear here; it shapes how
 * a `next-lane` step is described, not whether the earlier steps fire.
 * @enum {String}
 */
export const CycleStep = {
    ADDRESS_REVIEW_CHANGES: 'address-own-pr-changes-requested', // 1. own PR needs an author response
    REVIEW_REQUESTED_PR   : 'review-requested-pr',              // 2. a review is designated to me
    REQUEST_REVIEW        : 'request-review-own-green-pr',      // 3. own PR is green but review not requested
    NEXT_LANE             : 'pick-up-next-lane'                 // 4. claimable-now backlog item
};

/**
 * Is a backlog item *claimable-now* — i.e. a real next step rather than raw-backlog noise?
 *
 * The three exclusions encode the falsification-AC negative case ("a legitimately-gated non-empty backlog
 * MUST NOT FIRE the hook"): a gated, colliding, or blocked item is NOT a next step.
 *
 * @param {Object} item A backlog candidate.
 * @param {Boolean} [item.gated] Decision-/architecture-gated (e.g. waiting on an unresolved design call).
 * @param {Boolean} [item.blocked] Has unresolved blockers (e.g. blocked-by an unmerged dependency).
 * @param {String}  [item.claimedByOther] Identity of another agent holding an active lane-claim on it (collision).
 * @returns {Boolean}
 */
export function isClaimableNow(item) {
    if (!item) return false;
    return !item.gated && !item.blocked && !item.claimedByOther
}

/**
 * Computes the cycle verdict from already-fetched external lifecycle state.
 *
 * Pure: no I/O. The daemon fetches `state` (GitHub/graph) and passes it; this returns the single next
 * step (highest-priority claimable item per {@link CycleStep}) plus whether the cycle is genuinely empty.
 *
 * @param {Object} [state={}] The fetched external lifecycle state for one agent identity.
 * @param {Object[]} [state.ownPRs=[]] The agent's open PRs — `{ref, ciGreen, reviewRequested, changesRequested}`.
 * @param {Object[]} [state.reviewRequests=[]] PRs with a review designated to this agent + not yet done — `{ref}`.
 * @param {Object[]} [state.backlog=[]] Candidate next-lane items — each may carry `{ref, gated, blocked, claimedByOther}`.
 * @param {Number}  [state.openOwnPrCount] Count of the agent's open PRs (for the ≤10 backpressure hint on `NEXT_LANE`).
 * @returns {{nextStep:({step:String, ref:*, reason:String}|null), claimableNowCount:Number, isEmptyCycle:Boolean}}
 * `isEmptyCycle` is true iff no step at any priority is claimable now — the only legitimate turn-terminal.
 */
export function computeCycleState(state = {}) {
    const
        ownPRs         = Array.isArray(state.ownPRs)         ? state.ownPRs         : [],
        reviewRequests = Array.isArray(state.reviewRequests) ? state.reviewRequests : [],
        backlog        = Array.isArray(state.backlog)        ? state.backlog        : [],
        // The ≤10 cap is backpressure on NEW-lane expansion only; at/over it the next step is "drive
        // existing PRs to approval" rather than "open a new lane" — both are still a step, never a halt.
        atPrCap        = typeof state.openOwnPrCount === 'number' ? state.openOwnPrCount >= 10 : ownPRs.length >= 10;

    // 1. Own PR with changes requested / required author response — lifecycle-closure first.
    const needsResponse = ownPRs.find(pr => pr && pr.changesRequested);
    if (needsResponse) {
        return verdict(CycleStep.ADDRESS_REVIEW_CHANGES, needsResponse.ref,
            'An own PR has changes requested — address it before any new lane.', backlog)
    }

    // 2. A review designated to me — review it before starting a new lane.
    if (reviewRequests.length) {
        return verdict(CycleStep.REVIEW_REQUESTED_PR, reviewRequests[0].ref,
            'A review is designated to you — review it before a new lane.', backlog)
    }

    // 3. Own PR green but review not requested — request review (event-driven; never wait the CI window).
    const greenUnrequested = ownPRs.find(pr => pr && pr.ciGreen && !pr.reviewRequested);
    if (greenUnrequested) {
        return verdict(CycleStep.REQUEST_REVIEW, greenUnrequested.ref,
            'An own PR is green but review is not requested — request it.', backlog)
    }

    // 4. Next lane — but ONLY a claimable-now backlog item (raw-backlog-non-empty does not count).
    const claimable = backlog.filter(isClaimableNow);
    if (claimable.length) {
        return verdict(CycleStep.NEXT_LANE, claimable[0].ref,
            atPrCap
                ? 'At the open-PR cap — drive an existing PR to approval (backpressure on new lanes).'
                : 'Pick up a claimable-now backlog lane.',
            backlog, claimable.length)
    }

    // Genuinely empty cycle — the only legitimate turn-terminal. A non-empty backlog of gated items
    // lands HERE (claimable.length === 0), so the consumer must NOT treat it as a fireable hold.
    return {nextStep: null, claimableNowCount: 0, isEmptyCycle: true}
}

/**
 * Assembles a verdict, computing `claimableNowCount` across the full backlog for the consumer's reporting.
 * @private
 */
function verdict(step, ref, reason, backlog, claimableNowCount) {
    return {
        nextStep         : {step, ref, reason},
        claimableNowCount: typeof claimableNowCount === 'number' ? claimableNowCount : backlog.filter(isClaimableNow).length,
        isEmptyCycle     : false
    }
}
