# CI-Green Review Routing

This payload governs author-side review requests after a PR is opened or after the author pushes review-response fixes. It pairs with the reviewer-side CI fail-fast rule in `pr-review/audits/ci-security-audit.md`.

## 1. Source Of Authority

- `pull-request-workflow.md §6.2` owns author-side review routing.
- `pr-review/audits/ci-security-audit.md` owns reviewer-side CI hold / fail-fast behavior.
- `AGENTS.md §0` still requires lifecycle A2A notification when the PR opens.

The goal is to preserve lifecycle visibility without waking a reviewer into work they must immediately hold.

## 2. CI-Green Gate

Before sending any actionable primary-reviewer request, run:

```bash
gh pr checks <PR_NUMBER>
```

Use an equivalent read-only GitHub status surface only if `gh pr checks` is unavailable, and state that substitution explicitly in the PR/A2A handoff. Re-run the check after any new push before requesting review or re-review.

Treat the check as current-head scoped. Re-check after peer work. Stacked PRs
(`baseRefName` not `dev` / default) with lint-only green are observer/no-action:
name base PR / merge order / retarget-CI, then request primary cross-family
review only after dev-rebase/full CI. Full-CI stacked heads still name base
state.

On `neomjs/neo` `dev`, require `review-admission/mergeability=success` before
assignment; base movement can change it. Other repos use the
`manage_pr_reviewers(add)` preflight until they install the controller.

## 3. Outcome Branches

### Green

All required checks for the current head passed.

1. Choose exactly one `primary-reviewer` using the normal routing heuristic.
2. Call `manage_pr_reviewers({action: 'add', pr_number, reviewers: ['<reviewer>']})`.
3. Send one targeted A2A DM to the same reviewer.
4. Include:
   - `Review role: primary-reviewer`
   - `Requested action: use /pr-review on PR #N`
   - `CI status: green on current head <sha-or-short-sha>`

### Pending, Queued, Or In Progress

Do not call `manage_pr_reviewers`. Do not send an actionable `/pr-review` request.

For the mandatory lifecycle notification, send observer/no-action A2A:

```text
Review role: observer
Requested action: none
CI status: pending on current head <sha-or-short-sha>
Next author action: re-check CI before assigning a primary reviewer
```

Use the wait window productively:

1. Check unread A2A and open peer review requests.
2. If a peer PR can be reviewed or unblocked without abandoning your lane, do that work while CI runs.
3. If no peer-unblock lane is available, park a concrete recheck trigger (watchdog wake, next turn, or after the next short lane) and pick up the next positive-ROI backlog lane per `post-review-pickup`.
4. Return to your PR at the recheck trigger and re-run `gh pr checks <PR_NUMBER>` before assigning a reviewer.

Do not spin indefinitely. Pending CI is asynchronous work owned by GitHub Actions; by itself it is not a halt-state. A stop is valid only when a normal `post-review-pickup` halt criterion has been verified and named.

### Failing, Cancelled, Timed Out, Or Deep Red

Do not request formal review. The author fixes CI first, pushes the fix, and repeats the CI-green gate on the new head.

If the author explicitly needs help diagnosing CI, route that as CI triage, not formal review:

```text
Review role: ci-triage
Requested action: inspect failing check only; do not run full /pr-review
CI status: failing on current head <sha-or-short-sha>
```

### No Checks Returned

If GitHub reports no checks, document that and proceed only where no mergeability controller is installed. On `neomjs/neo` `dev`, a missing mergeability context holds assignment.

## 4. Re-Review Requests

After addressing reviewer feedback with new commits, apply the same gate before writing `Re-review requested.` or sending a re-review A2A. If CI is pending, post the structured Addressed comment with a hold line instead:

```text
CI status: pending on current head <sha-or-short-sha>. Re-review request will follow once CI is green.
```

Once CI is green, send the re-review A2A with the original response `commentId` plus `CI status: green`.

## 5. Anti-Patterns

| Anti-pattern | Why it harms |
|---|---|
| Calling `manage_pr_reviewers` while CI is pending | GitHub reviewer assignment is itself an actionable review request. |
| Sending `Requested action: use /pr-review` before green CI | Reviewer-side rules now require holding or stopping, so the wake creates churn. |
| Suppressing all PR-open A2A until CI is green | Violates lifecycle visibility and makes the swarm blind to an opened PR. |
| Treating green CI as approval | Green CI only permits requesting human/peer review. |
| Busy-waiting forever | Pending CI time should unblock peers, then trigger a recheck. |
| Stopping solely because CI is still pending | Turns an asynchronous GitHub Actions wait into agent idle time; park the recheck and pick up the next lane. |
