# Cross-PR Overlap Check

## Trigger

Load this payload before the final commit / PR-open when your branch touches skill or workflow documentation, Agent OS substrate, or another surface where overlapping open PRs can create review-time rebase churn. Re-run it before a force-push when the changed-file set expands.

This check is author-side. It complements:

- `peer-role` lane-claim collision checks, which run before claiming a write lane.
- `pr-review` Cross-Skill Integration Audit, which runs after a PR already exists.

## Required Check

1. List the branch write surface:

   ```bash
   git diff --cached --name-only
   ```

   If you have not staged yet, use the working-tree diff plus untracked files:

   ```bash
   git diff --name-only
   git ls-files --others --exclude-standard
   ```

   If the branch already contains commits and you are re-checking before PR-open or force-push, use the feature branch diff:

   ```bash
   git diff --name-only origin/dev...HEAD
   ```

2. List open PR write surfaces:

   ```bash
   gh pr list --state open --json number,title,files
   ```

3. Compare paths exactly. Treat an exact path match as a collision. Treat same-directory / same-section proximity as a warning when the touched surface is skill or workflow documentation.

4. If a collision exists, inspect the overlapping PR before opening yours:

   ```bash
   gh pr view <number> --json number,title,state,mergeStateStatus,reviewDecision,files,url
   ```

## PR Body Contract

If overlaps exist, add this section to the PR body:

```markdown
## Known Collisions
- PR #N touches `<path>`; intended merge order: <order>; rebase plan: <plan>.
```

If no overlaps exist, do not add a noisy section. Record the check in `## Test Evidence` or `## Deltas from ticket`, for example:

```markdown
- Cross-PR overlap check: `gh pr list --state open --json number,title,files` found no open PR touching this branch's files.
```

## Anti-Pattern

| Anti-pattern | Why it harms |
|---|---|
| Opening or force-pushing a collision-prone skill/workflow PR without checking open PR file surfaces | Pushes predictable rebase and section-order conflicts into the review loop, where CI and cross-family review have already been spent. |

## Boundaries

- This is not a semantic-conflict detector. If file overlap exposes a content disagreement, document it and route the judgment through review or peer-role.
- This is not a CI or pre-commit hook. Mechanical enforcement requires a separate ticket.
- This is not a general merge-conflict oracle for all code PRs. Use it where concurrent PRs touching the same substrate are expensive to unwind.
