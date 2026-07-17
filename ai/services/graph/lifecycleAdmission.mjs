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
 * @summary The logins a PR's review requests name, tolerating both source shapes.
 *
 * A request arrives either as a bare login or as `{login, requestedAt}`. Only the second can be dated,
 * so the richer shape is what a datable frontier needs — but the identity question is the same either
 * way, and reading it in one place keeps the two from drifting.
 *
 * @param {Object} pr Normalized PR record.
 * @param {String} agentId
 * @returns {Boolean}
 */
function requestsInclude(pr, agentId) {
    return (pr?.reviewRequests || []).some(request =>
        (typeof request === 'string' ? request : request?.login) === agentId
    )
}

/**
 * @summary Derives a PR's lifecycle clocks from CURRENT-HEAD evidence, so the head-change reset is
 * structural rather than promised.
 *
 * This is the clock owner. The earlier shape demanded that some upstream remember when each head became
 * actionable and reset it on every push — a contract nothing implemented, and a stateful one at that.
 * It is unnecessary: the source already carries the timestamps. A `CHANGES_REQUESTED` review names the
 * commit it reviewed and when it was submitted; a failed check names its completion. So the clock for
 * head X is simply *the earliest current-head evidence*, and its provenance is X **by construction**.
 *
 * The reset then costs nothing. When the head moves to Y, every X-attached review and check stops being
 * current-head evidence, so the clock re-derives from Y's own facts or the row leaves the frontier
 * entirely. A's clock cannot survive into B because it was never stored — only computed.
 *
 * Clears and re-entries follow for free: a predicate that stops holding drops the row, and satisfying it
 * again derives a fresh clock from the evidence that satisfied it.
 *
 * @param {Object} pr Raw source PR `{headSha, reviews, checks, reviewRequests, mergeableSince?}`.
 * @returns {Object} The PR with `repairActionableSince` / `reviewableSince` / `reviewRequestedSince`
 *   and their `*HeadSha` provenance derived from current-head facts.
 */
export function normalizeLifecycleClocks(pr) {
    const head = pr?.headSha;

    // Only evidence attached to the CURRENT head can date the current head.
    const currentHeadReviews = (pr?.reviews || []).filter(review => review.commitSha === head),
          currentHeadChecks  = currentHeadChecksOf(pr);

    const clean    = stamps => stamps.filter(stamp => typeof stamp === 'string' && stamp.length > 0).sort(),
          earliest = stamps => clean(stamps)[0] ?? null,
          latest   = stamps => clean(stamps).at(-1) ?? null;

    // Each stage's clock is a DIFFERENT algebra, because each answers a different question. One reducer
    // for all three was wrong in three distinct ways.
    const headCommittedAt = typeof pr?.headCommittedAt === 'string' ? pr.headCommittedAt : null;

    // A current-head clock can never predate the head itself: the state being dated belongs to code
    // that did not exist earlier. A conflict timestamp carried over from a previous head, stamped with
    // current-head provenance, claimed a duration this head never had.
    const clampToHead = stamp =>
        stamp !== null && headCommittedAt !== null && stamp < headCommittedAt ? headCommittedAt : stamp;

    // REPAIR — EARLIEST. "When did this head first need repair?" The first blocking evidence is the
    // answer; later evidence is more of the same obligation.
    const repairSince = clampToHead(earliest([
        ...currentHeadReviews.filter(review => review.state === 'CHANGES_REQUESTED').map(review => review.submittedAt),
        ...currentHeadChecks.filter(check => check.required === true && check.conclusion === 'FAILURE').map(check => check.completedAt),
        // A conflict carries no evidence timestamp of its own; the source states when it observed one.
        // Gated on an ACTIVE conflict: a stale `mergeableSince` from a conflict that has since been
        // resolved is not evidence of anything, and letting it into the earliest() dated an unrelated
        // repair from a problem that no longer exists.
        pr?.mergeable === false ? pr?.mergeableSince : null
    ]));

    // REVIEWABLE — LATEST, and only once ALL required checks have passed. "When did this head become
    // reviewable?" is when the LAST required check went green. At the earliest one it was not reviewable
    // at all, so dating it there claims a readiness that did not exist.
    //
    // A repo requiring NO checks is reviewable from the moment the head exists — the ADR admits "all
    // pass OR none exist", and treating zero-required as undatable threw on a perfectly ordinary repo.
    //
    // A source-owned transition timestamp WINS when present. Check facts are evergreen: once green at
    // 10:30 they stay green, so they cannot express a same-head loss and re-entry (reviewable at 10:30,
    // a request arrives at 11:00 and removes the row, the request is withdrawn at 12:00 and it re-enters
    // — which is 12:00, not 10:30). Only the source can date a transition it observed; deriving one from
    // an evergreen fact would invent it.
    const requiredChecks = currentHeadChecks.filter(check => check.required === true),
          allPassed      = requiredChecks.every(check => check.conclusion === 'SUCCESS'),
          derivedGreen   = requiredChecks.length === 0 ? headCommittedAt : latest(requiredChecks.map(check => check.completedAt));

    const reviewableSince = allPassed
        ? clampToHead(sourceTransition(pr, 'reviewerRoutingSince') ?? derivedGreen)
        : null;

    // REQUESTED — LATER of the request and the head, PER TARGET. Taking the earliest across all agents
    // dated a peer's 11:00 request from someone else's 09:00 one: each reviewer's obligation begins when
    // THEY were asked, so one shared clock is not a rounding error, it is the wrong reviewer's fact.
    // The per-target map is resolved by the predicate that knows which agent is consuming.
    const requestedByTarget = Object.fromEntries((pr?.reviewRequests || [])
        .map(request => typeof request === 'object' ? [request.login, clampToHead(request.requestedAt ?? null)] : [request, null])
        .filter(([login]) => typeof login === 'string' && login.length > 0));

    return {
        ...pr,
        repairActionableSince       : repairSince,
        repairActionableSinceHeadSha: repairSince === null ? null : head,
        reviewableSince,
        reviewableSinceHeadSha      : reviewableSince === null ? null : head,
        reviewRequestedByTarget     : requestedByTarget,
        reviewRequestedSinceHeadSha : head
    }
}

/**
 * @summary Reads a source-owned transition timestamp, but only when the source proves it belongs to the
 * CURRENT head.
 *
 * A transition is something only the source can witness: a snapshot of evergreen facts cannot say when
 * a state was LOST and re-entered, because the facts read identically before and after. Where the source
 * records that transition it is authoritative over anything derived; where it does not, the derivation
 * stands and the same-head re-entry case remains the source's to close.
 *
 * @param {Object} pr Normalized PR record.
 * @param {String} field The transition field.
 * @returns {String|null}
 */
function sourceTransition(pr, field) {
    const stamp = pr?.[field];

    if (typeof stamp !== 'string' || stamp.length === 0) {
        return null
    }

    // An unprovenanced or stale transition is not usable: it would carry a previous head's history into
    // this one under current-head provenance.
    return pr?.[`${field}HeadSha`] === pr?.headSha ? stamp : null
}

/**
 * @summary Resolves the review-request clock for ONE consuming target.
 *
 * Each reviewer's obligation begins when THEY were asked. A single shared clock dated every reviewer
 * from whoever was asked first, so a peer added at 11:00 inherited someone else's 09:00 — not a
 * rounding error but the wrong reviewer's fact, and the age is what a peer sorts by.
 *
 * @param {Object} pr Normalized PR record carrying `reviewRequestedByTarget`.
 * @param {String} agentId The consuming agent.
 * @returns {String} The clock, proven current-head.
 * @throws {TypeError} When the source dated no request for this target.
 */
export function resolveTargetRequestClock(pr, agentId) {
    const stamp = pr?.reviewRequestedByTarget?.[agentId];

    if (typeof stamp !== 'string' || stamp.length === 0) {
        throw new TypeError(
            `[lifecycleAdmission] no dated review request for ${agentId} on PR ${pr?.id} — ` +
            'the source must state when each reviewer was asked; a row without its clock cannot be ordered'
        )
    }

    if (pr?.reviewRequestedSinceHeadSha !== pr?.headSha) {
        throw new TypeError(`[lifecycleAdmission] the review-request clock for PR ${pr?.id} does not belong to the current head`)
    }

    return stamp
}

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
export function currentHeadChecksOf(pr) {
    // A check names the head it ran against. One that names an OLDER head describes code that no longer
    // exists, so it can neither block nor clear the current head.
    //
    // An UNPROVENANCED check is excluded, not assumed current. Treating a missing `headSha` as current
    // was a guess wearing a convenience's clothes: an unprovenanced FAILED required check then blocked
    // repair and suppressed reviewer routing on a head it may never have run against. Scope has to be
    // provable, and "the source did not say" is not proof of anything.
    //
    // A source that genuinely cannot stamp each check may attest that its snapshot contains ONLY
    // current-head rows. That is the same fact, but asserted by the party that can actually know it,
    // and it appears in the record rather than in this function's assumptions.
    const attestedCurrentSnapshot = pr?.checksAreCurrentHeadSnapshot === true;

    return (pr?.checks || []).filter(check =>
        check.headSha === pr?.headSha || (attestedCurrentSnapshot && check.headSha === undefined)
    )
}

export function hasFailedRequiredCheck(pr) {
    return currentHeadChecksOf(pr).some(check => check.required === true && check.conclusion === 'FAILURE')
}

/**
 * @summary True when every required check has passed (or the repository requires none).
 * @param {Object} pr Normalized PR record.
 * @returns {Boolean}
 */
export function allRequiredChecksPass(pr) {
    const required = currentHeadChecksOf(pr).filter(check => check.required === true);

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
    if (!pr || pr.state !== 'OPEN' || pr.isDraft) return null;
    if (!requestsInclude(pr, agentId))            return null;
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
        actionableSince: resolveTargetRequestClock(pr, agentId),
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
 * @param {Object} params.message Normalized message `{messageId, to, readAt, archivedAt, retracted, sentAt}`.
 *   `retracted` is a BOOLEAN — the shape `MailboxService` actually emits. An invented `retractedAt`
 *   timestamp never fires on a real row, so the exclusion silently did nothing.
 * @param {String} params.agentId The consuming agent.
 * @returns {Object|null}
 */
export function admitDirectMessage({message, agentId} = {}) {
    if (!message || message.to !== agentId) return null;
    if (message.readAt)                     return null;
    // `retracted: true` is the live shape (MailboxService sender-side retraction, which also blanks the
    // body to a placeholder — admitting it would point a peer at nothing). `retractedAt` is tolerated
    // only so a caller already passing a timestamp is not silently ignored.
    if (message.archivedAt || message.retracted === true || message.retractedAt) return null;

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

    for (const raw of prs) {
        // The clock owner runs HERE, at the normalization boundary, so every predicate downstream reads
        // clocks derived from the current head rather than whatever a caller happened to pass.
        const pr = normalizeLifecycleClocks(raw);

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
