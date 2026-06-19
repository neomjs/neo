# Stacked PR Retarget-CI Routing

This payload governs PR lifecycle wording when a pull request targets another feature branch instead of the repo default branch (`dev` in canonical Neo). Stacked PRs are allowed, but they have two readiness surfaces: the child delta against its stacked base, and the base PR's ability to merge to `dev` so the child can retarget and run full CI.

## 1. Trigger

Use this payload whenever a PR's `baseRefName` is not the default branch, or when a PR body/comment says full CI is deferred until retarget.

Terms:
- **Child PR:** the stacked PR being opened, reviewed, or reported.
- **Base PR:** the open PR whose `headRefName` equals the child PR's `baseRefName`.

## 2. Required Projection

Before declaring the child PR ready, human-gated, approved, or verified-empty, project both surfaces:

| Surface | Required state |
|---|---|
| Child PR | `state`, `baseRefName`, `headRefOid`, `mergeStateStatus`, current checks |
| Base PR | `state`, `mergeStateStatus`, `reviewDecision`, current checks, author/current owner |

If the base PR cannot be resolved, stack readiness is unknown. Route a blocker or ask the author to name the base PR; do not infer readiness from the child PR's clean merge state.

## 3. Decision Matrix

| Base PR state | Child PR wording / action |
|---|---|
| `DIRTY`, conflicted, or behind `dev` | Child delta review may continue, but readiness is blocked by the base PR. Route targeted A2A or PR comment to the base PR author/current owner; do not call the child human-gated or final-approved. |
| `UNSTABLE`, failing, pending required checks, or missing required review | Child delta review may be recorded as a `COMMENT`, but formal `APPROVED` waits for base readiness plus child retarget/full CI. Name the pending base gate explicitly. |
| Base PR clean, approved, and green but unmerged | Child is stack-clean and waiting on base human merge plus retarget/full CI. The base PR may be human-gated; the child is not final merge-ready yet. |
| Base PR merged and child retargeted to `dev` | Run the normal CI-green / reviewer / approval flow on the child at its retargeted head. |

## 4. Author-Side Rules

When opening or updating a stacked PR:

1. State the merge order in the PR body.
2. State that full CI is deferred until the child retargets to `dev`, if only stack-limited checks run now.
3. Name the base PR readiness state in review-request A2A: clean/dirty, approved/unreviewed, checks green/pending/failing.
4. If the base PR is dirty or otherwise blocking retarget, route that blocker before requesting final review on the child.

Allowed wording:

```text
Stack status: child PR is clean against base PR #N; base PR #N is <state>. Full CI for this child remains deferred until #N merges and this PR retargets to dev.
```

## 5. Reviewer-Side Rules

Reviewers may verify the child delta against the stacked base. That is useful work. Keep the verdict precise:

- **Delta verified:** code/body/test surface is clear against the stacked base.
- **Final approval / merge-readiness:** only after the base PR is ready, the child retargets to `dev`, and full CI is green on the retargeted child head.

If a previous Required Action is fixed but stack/full-CI remains unavailable, post a `COMMENTED` follow-up naming the resolved RA and the remaining stack gate. Do not use `APPROVED` merely to clear a metadata-era `CHANGES_REQUESTED` while full CI is still structurally deferred.

## 6. Post-Review Pickup Rules

`human-gate` / `verified-empty` is invalid when the next visible transition is a dirty/stale base PR that can be routed. Send a targeted A2A or PR comment to the base PR author/current owner with:

- child PR number,
- base PR number or unresolved base branch,
- base blocker (`DIRTY`, pending checks, missing review, failing checks),
- requested next action.

Do not steal another maintainer's branch unless a maintainer-polish path or explicit operator instruction applies.
