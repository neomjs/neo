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
 * @summary Returns a PR-derived clock only when the source proves it belongs to the CURRENT head.
 *
 * Every PR-derived row resets on head change. A stateless predicate cannot *perform* that reset — it
 * has no memory of the previous head — so it can only *verify* it, and only if the source states which
 * head the clock was started for. Without that provenance the predicate would copy a clock from three
 * pushes ago and present it as the current head's, which is a confidently wrong timestamp: a peer reads
 * "blocked for 6 hours" about code that has existed for 30 seconds.
 *
 * A missing or stale-provenance clock is a SOURCE CONTRACT violation, not a non-admission: the row is
 * genuinely actionable, so silently dropping it would hide an obligation, and admitting it with an
 * unprovable clock would fabricate one. Failing loud surfaces the wiring gap instead of choosing
 * between two wrong answers.
 *
 * @param {Object} pr Normalized PR record.
 * @param {String} field The clock field (`repairActionableSince` / `reviewableSince` / `reviewRequestedSince`).
 * @returns {String} The clock, proven current-head.
 * @throws {TypeError} When the clock is absent, or was measured against a different head.
 */
export function resolveHeadScopedClock(pr, field) {
    const clock        = pr?.[field],
          clockHeadSha = pr?.[`${field}HeadSha`];

    if (typeof clock !== 'string' || clock.length === 0) {
        throw new TypeError(`[lifecycleAdmission] ${field} is required on PR ${pr?.id} — a row without its clock cannot be ordered`)
    }

    if (clockHeadSha !== pr?.headSha) {
        throw new TypeError(
            `[lifecycleAdmission] ${field} on PR ${pr?.id} was measured at head ${clockHeadSha ?? 'unknown'} but the current head is ${pr?.headSha}; ` +
            'the source must reset PR-derived clocks on head change and state the head each clock belongs to'
        )
    }

    return clock
}

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
 * @summary Resolves why an own PR needs repair, or `null` when it does not.
 *
 * Extracted so stage 1 and stage 2 read the SAME predicate rather than two hand-kept-in-sync
 * conditions. Mutual exclusion asserted in prose is not mutual exclusion: a merge-conflicted PR with
 * green required checks satisfied "needs repair" AND "cleanly reviewable" simultaneously, because each
 * stage tested a different subset of the blockers.
 *
 * @param {Object} pr Normalized own-PR record.
 * @returns {String|null} `changes-requested` | `failed-required-check` | `merge-conflict` | null.
 */
export function resolveRepairReason(pr) {
    const changesRequested = (pr?.reviews || []).some(review =>
        review.state === 'CHANGES_REQUESTED' && review.commitSha === pr.headSha
    );

    if (changesRequested)         return 'changes-requested';
    if (hasFailedRequiredCheck(pr)) return 'failed-required-check';
    if (pr?.mergeable === false)  return 'merge-conflict';

    return null
}

/**
 * @summary Stage 1 — own-PR repair: the current head carries `CHANGES_REQUESTED`, a failed required
 * check, or a merge conflict.
 *
 * This outranks every other stage because it blocks a lane the agent already owns.
 *
 * `repairActionableSince` belongs to the CURRENT head: the clock starts when THIS head first satisfied
 * a repair predicate, not from whatever the PR looked like three pushes ago — see
 * {@link resolveHeadScopedClock}, which verifies that rather than assuming it.
 *
 * @param {Object} params
 * @param {Object} params.pr Normalized own-PR record.
 * @param {String} params.agentId The consuming agent.
 * @returns {Object|null} A frontier item, or null when not admitted.
 */
export function admitOwnPrRepair({pr, agentId} = {}) {
    if (!pr || pr.authorId !== agentId || pr.state !== 'OPEN' || pr.isDraft) return null;

    const reason = resolveRepairReason(pr);

    if (!reason) return null;

    return {
        id             : `own-pr-repair:${pr.id}`,
        stage          : 'own-pr-repair',
        kind           : reason,
        state          : pr.state,
        source         : 'github-workflow',
        subjectId      : pr.id,
        headSha        : pr.headSha,
        actionableSince: resolveHeadScopedClock(pr, 'repairActionableSince'),
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
    // The exclusion is structural, not documented: anything stage 1 admits is a lane the agent must
    // repair, and a PR needing repair is not awaiting a reviewer. Testing only the checks would let a
    // merge-conflicted PR with green checks enter BOTH stages.
    if (resolveRepairReason(pr))                                             return null;
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
        actionableSince: resolveHeadScopedClock(pr, 'reviewableSince'),
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
    if (!pr || pr.state !== 'OPEN' || pr.isDraft)     return null;
    if (!(pr.reviewRequests || []).includes(agentId)) return null;
    // Closure is defined by the HEAD, not by the author of the verdict: a decision on the current head
    // closes it, and a decision on an older head cannot, because the code changed underneath. Adding an
    // author-is-me restriction here invented a rule the contract does not have — it kept a request live
    // after a peer had already closed the current head, manufacturing an obligation.
    if (hasCurrentHeadClosingReview(pr))              return null;

    return {
        id             : `requested-review:${pr.id}`,
        stage          : 'requested-review',
        kind           : 'review-requested',
        state          : pr.state,
        source         : 'github-workflow',
        subjectId      : pr.id,
        headSha        : pr.headSha,
        actionableSince: resolveHeadScopedClock(pr, 'reviewRequestedSince'),
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
 * Removal is not only reading. An archived message has been dispositioned, and a retracted one was
 * withdrawn by its sender — both are unread forever, so keying admission on `readAt` alone would pin
 * them to the frontier permanently. A row that cannot be cleared teaches the reader to ignore the
 * surface, which costs more than the row was ever worth.
 *
 * @param {Object} params
 * @param {Object} params.message Normalized message `{messageId, to, readAt, archivedAt, retractedAt, sentAt}`.
 * @param {String} params.agentId The consuming agent.
 * @returns {Object|null}
 */
export function admitDirectMessage({message, agentId} = {}) {
    if (!message || message.to !== agentId)       return null;
    if (message.readAt)                           return null;
    if (message.archivedAt || message.retractedAt) return null;

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
