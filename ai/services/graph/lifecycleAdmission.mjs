/**
 * @module ai/services/graph/lifecycleAdmission
 * @summary The five response-required admission predicates — and, just as load-bearing, their exclusions.
 *
 * Pure: every fact is passed in as an already-normalized source record. The producer decides *whether*
 * something awaits a response; it never re-derives what a source already owns (a PR's state belongs to
 * GitHub Workflow, a Task's owner to Memory Core A2A).
 *
 * **The exclusions are the design.** Admitting a row that does not actually need action is not a
 * harmless false positive — it is how a surface earns being ignored. The route side already learned
 * this: fixture rows taught peers the forward-pull was noise. So:
 * - **pending/running CI is not a call to act.** Only a FAILED *required* check is. "CI is running" is
 *   a wait, and waits are not work.
 * - **an approved PR awaiting the human merge gate is not the agent's move** — merge is human-only, so
 *   listing it would ask for an action the agent must never take.
 * - **an optional check's failure is not a repair trigger** unless the repository marks it required.
 * - **draft PRs** are not yet anyone's obligation.
 * - **an unclaimed broadcast is not a task** — awareness-only A2A never becomes an obligation by being
 *   read.
 * - **ordinary issue assignment is not a claimed task**; only a structured Task envelope in an
 *   action-requiring state is.
 */

/**
 * @summary True when a review decision closes the CURRENT head.
 *
 * A review is only closing if it reviewed the head that exists now: a verdict attached to an older
 * commit says nothing about the code as it stands, and treating it as closing would silently suppress
 * a row that genuinely needs action after a repair push.
 *
 * @param {Object} pr Normalized PR record `{headSha, reviews: [{state, commitSha}]}`.
 * @returns {Boolean}
 */
export function hasCurrentHeadClosingReview(pr) {
    return (pr?.reviews || []).some(review =>
        (review.state === 'APPROVED' || review.state === 'CHANGES_REQUESTED') &&
        review.commitSha === pr.headSha
    )
}

/**
 * @summary True when a REQUIRED check has actually failed on the current head.
 *
 * Pending/running is deliberately not failure: a check still executing is a wait, not a repair. And an
 * optional check's failure is not a repair trigger unless the repository policy marks it required —
 * otherwise every advisory linter would manufacture an obligation.
 *
 * @param {Object} pr Normalized PR record `{checks: [{name, required, conclusion}]}`.
 * @returns {Boolean}
 */
export function hasFailedRequiredCheck(pr) {
    return (pr?.checks || []).some(check => check.required === true && check.conclusion === 'FAILURE')
}

/**
 * @summary True when every required check has passed (or the repository requires none).
 * @param {Object} pr Normalized PR record.
 * @returns {Boolean}
 */
export function allRequiredChecksPass(pr) {
    const required = (pr?.checks || []).filter(check => check.required === true);

    return required.length === 0 || required.every(check => check.conclusion === 'SUCCESS')
}

/**
 * @summary Stage 1 — own-PR repair: the current head carries `CHANGES_REQUESTED`, a failed required
 * check, or a merge conflict.
 *
 * This outranks every other stage because it blocks a lane the agent already owns.
 *
 * `repairActionableSince` belongs to the CURRENT head: the clock starts when THIS head first satisfied
 * a repair predicate, not from whatever the PR looked like three pushes ago.
 *
 * @param {Object} params
 * @param {Object} params.pr Normalized own-PR record.
 * @param {String} params.agentId The consuming agent.
 * @returns {Object|null} A frontier item, or null when not admitted.
 */
export function admitOwnPrRepair({pr, agentId} = {}) {
    if (!pr || pr.authorId !== agentId || pr.state !== 'OPEN' || pr.isDraft) return null;

    const changesRequested = (pr.reviews || []).some(review =>
              review.state === 'CHANGES_REQUESTED' && review.commitSha === pr.headSha
          ),
          failedCi   = hasFailedRequiredCheck(pr),
          unmergeable = pr.mergeable === false;

    if (!changesRequested && !failedCi && !unmergeable) return null;

    const reason = changesRequested ? 'changes-requested' : (failedCi ? 'failed-required-check' : 'merge-conflict');

    return {
        id             : `own-pr-repair:${pr.id}`,
        stage          : 'own-pr-repair',
        kind           : reason,
        state          : pr.state,
        source         : 'github-workflow',
        subjectId      : pr.id,
        headSha        : pr.headSha,
        actionableSince: pr.repairActionableSince,
        checkedAt      : pr.checkedAt,
        citations      : [pr.url].filter(Boolean)
    }
}

/**
 * @summary Stage 2 — own-PR reviewer routing: the PR is ready for a reviewer and nobody is on it.
 *
 * Excluded by construction: a draft (not yet an obligation), a PR whose required checks have not all
 * passed (that is stage 1's business or a wait), one with an outstanding request (someone already has
 * it), and one with a current-head closing review — which is where **an approved PR awaiting the human
 * merge gate** drops out: merge is human-only, so listing it would ask for an action the agent must
 * never take.
 *
 * @param {Object} params
 * @param {Object} params.pr Normalized own-PR record.
 * @param {String} params.agentId The consuming agent.
 * @returns {Object|null}
 */
export function admitOwnPrReviewerRouting({pr, agentId} = {}) {
    if (!pr || pr.authorId !== agentId || pr.state !== 'OPEN' || pr.isDraft) return null;
    if (!allRequiredChecksPass(pr))                                          return null;
    if ((pr.reviewRequests || []).length > 0)                                return null;
    if (hasCurrentHeadClosingReview(pr))                                     return null;

    return {
        id             : `own-pr-routing:${pr.id}`,
        stage          : 'own-pr-reviewer-routing',
        kind           : 'needs-reviewer',
        state          : pr.state,
        source         : 'github-workflow',
        subjectId      : pr.id,
        headSha        : pr.headSha,
        actionableSince: pr.reviewableSince,
        checkedAt      : pr.checkedAt,
        citations      : [pr.url].filter(Boolean)
    }
}

/**
 * @summary Stage 3 — requested review: a live request targets this agent and the current head is not
 * already closed by its verdict.
 * @param {Object} params
 * @param {Object} params.pr Normalized PR record (authored by anyone).
 * @param {String} params.agentId The consuming agent.
 * @returns {Object|null}
 */
export function admitRequestedReview({pr, agentId} = {}) {
    if (!pr || pr.state !== 'OPEN' || pr.isDraft)                       return null;
    if (!(pr.reviewRequests || []).includes(agentId))                   return null;
    // A verdict this agent already gave on the CURRENT head discharges the request; an older-head
    // verdict does not, because the code changed underneath it.
    const closedByMe = (pr.reviews || []).some(review =>
        review.authorId === agentId &&
        (review.state === 'APPROVED' || review.state === 'CHANGES_REQUESTED') &&
        review.commitSha === pr.headSha
    );

    if (closedByMe) return null;

    return {
        id             : `requested-review:${pr.id}`,
        stage          : 'requested-review',
        kind           : 'review-requested',
        state          : pr.state,
        source         : 'github-workflow',
        subjectId      : pr.id,
        headSha        : pr.headSha,
        actionableSince: pr.reviewRequestedSince,
        checkedAt      : pr.checkedAt,
        citations      : [pr.url].filter(Boolean)
    }
}

/**
 * Task states whose owner must act. Terminal states (Completed/Canceled/Failed/Rejected) and
 * awareness-only states are excluded — a task that has ended is not a frontier row.
 * @type {Set<String>}
 */
export const ACTIONABLE_TASK_STATES = Object.freeze(new Set(['InputRequired', 'AuthRequired']));

/**
 * @summary Stage 4 — claimed A2A task: a structured Task whose current owner is this agent and whose
 * non-terminal state requires this agent's action.
 *
 * An unclaimed broadcast is excluded by construction: `ownerId` must equal the agent. A broadcast has
 * no owner until someone claims it, and awareness never becomes an obligation by being read.
 *
 * @param {Object} params
 * @param {Object} params.task Normalized Task record `{id, ownerId, state, actionableSince}`.
 * @param {String} params.agentId The consuming agent.
 * @param {Set<String>} [params.actionableStates] States requiring the owner's action.
 * @returns {Object|null}
 */
export function admitClaimedTask({task, agentId, actionableStates = ACTIONABLE_TASK_STATES} = {}) {
    if (!task || task.ownerId !== agentId)      return null;
    if (!actionableStates.has(task.state))      return null;

    return {
        id             : `claimed-task:${task.id}`,
        stage          : 'claimed-a2a-task',
        kind           : task.state,
        state          : task.state,
        source         : 'memory-core-a2a',
        subjectId      : task.id,
        headSha        : null,
        actionableSince: task.actionableSince,
        checkedAt      : task.checkedAt,
        citations      : [task.messageId].filter(Boolean)
    }
}

/**
 * @summary Stage 5 — direct message: an unread message addressed to this agent.
 *
 * `to === agentId` excludes broadcasts structurally: a broadcast is awareness, and treating it as an
 * obligation would make every peer's announcement someone else's todo.
 *
 * @param {Object} params
 * @param {Object} params.message Normalized message `{messageId, to, readAt, sentAt}`.
 * @param {String} params.agentId The consuming agent.
 * @returns {Object|null}
 */
export function admitDirectMessage({message, agentId} = {}) {
    if (!message || message.to !== agentId) return null;
    if (message.readAt)                     return null;

    return {
        id             : `direct-message:${message.messageId}`,
        stage          : 'direct-message',
        kind           : 'unread-direct',
        state          : 'unread',
        source         : 'memory-core-a2a',
        subjectId      : message.messageId,
        headSha        : null,
        actionableSince: message.sentAt,
        checkedAt      : message.checkedAt,
        citations      : [message.messageId].filter(Boolean)
    }
}

/**
 * @summary Runs every stage's predicate over the normalized source records and returns the admitted
 * items (unordered — `buildLifecycleFrontier` owns the ordering).
 *
 * A PR can legitimately admit at most one own-PR stage: repair and reviewer-routing are mutually
 * exclusive by their predicates (a failed/blocked head cannot also be cleanly reviewable), so no
 * de-duplication is needed — if both ever fired, that would be a predicate bug worth surfacing, not a
 * row to silently drop.
 *
 * @param {Object}   params
 * @param {String}   params.agentId The consuming agent.
 * @param {Object[]} [params.prs=[]] Normalized PR records.
 * @param {Object[]} [params.tasks=[]] Normalized Task records.
 * @param {Object[]} [params.messages=[]] Normalized message records.
 * @returns {Object[]} Admitted frontier items.
 */
export function collectLifecycleItems({agentId, prs = [], tasks = [], messages = []} = {}) {
    const items = [];

    for (const pr of prs) {
        const repair  = admitOwnPrRepair({pr, agentId}),
              routing = admitOwnPrReviewerRouting({pr, agentId}),
              review  = admitRequestedReview({pr, agentId});

        if (repair)  items.push(repair);
        if (routing) items.push(routing);
        if (review)  items.push(review);
    }

    for (const task of tasks) {
        const admitted = admitClaimedTask({task, agentId});
        if (admitted) items.push(admitted)
    }

    for (const message of messages) {
        const admitted = admitDirectMessage({message, agentId});
        if (admitted) items.push(admitted)
    }

    return items
}
