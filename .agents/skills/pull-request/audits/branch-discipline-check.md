# Branch-Discipline Check (pre-push)

*(Codified per #11133, graduated from 2026-05-10 empirical 5-PR friction-gold pattern.)*

Mechanical pre-push gate enforced via `.husky/pre-push` → `node ./buildScripts/util/check-branch-discipline.mjs`. Blocks push when the feature branch contains `chore(data):` sync-pipeline commits that don't belong on a feature branch.

## Empirical Anchor

2026-05-10 saw 5 PRs (#11106, #11109, #11114, #11129, #11132) hit the same chore-sync / stale-branch contamination pattern within 90 minutes despite the existing `feedback_branch_from_origin_dev_explicitly` MEMORY.md codification. Discipline-only enforcement empirically failed at minimum 5x in that window — mechanical gate is load-bearing.

## What the Hook Checks

Detection regex: `^chore\(data\):.*(sync|pipeline)` matched against `git log origin/dev..HEAD` commit subjects. Designated sync branches (`chore/sync-*` / `agent/sync-*`) are exempt — those ARE the substrate-correct sync paths. Protected branches (`main`, `dev`) bypass (caught by §2.3 universal safety net + §2.2 branch mandate).

## Author Pre-Flight (Avoid the Hook Firing)

```bash
git fetch origin
git log origin/dev..HEAD --format='%h %s'
# If output contains `chore(data):` commits OR commits from other peers:
#   Branch was cut from a stale source. Clean-path: re-branch from origin/dev and cherry-pick.
```

## Clean-Path Remediation

```bash
git checkout -b agent/<ticket-id>-v2 origin/dev
git cherry-pick <your-feature-shas>
git push -u origin agent/<ticket-id>-v2    # opens a fresh PR
```

## Operator-Authorized Cleanup Path

Per `pull-request-workflow.md §9`:

```bash
git rebase -i origin/dev                   # drop the chore-sync commits
git push --force-with-lease
```

## Bypass

```bash
git push --no-verify
```

Not recommended; surfaces in PR diff as review-surface noise per the original 2026-05-10 anchor cluster.

## Why Discipline-Only Was Insufficient

`feedback_branch_from_origin_dev_explicitly` MEMORY.md entry already codified the discipline pre-#11133. 5 occurrences in 90 minutes (2026-05-10) despite the discipline demonstrated the mechanical gate was load-bearing. Substrate evolution per AGENTS.md §13.2 friction → gold core value.

## Related

- `feedback_branch_from_origin_dev_explicitly` — the discipline this mechanically enforces
- `buildScripts/util/check-branch-discipline.mjs` — the script
- `.husky/pre-push` — the hook wiring
- `buildScripts/util/check-chore-sync.mjs` — pre-commit sibling (catches sync-data leakage at commit time, complementary surface)
- `buildScripts/util/check-whitespace.mjs` — convention precedent for the script shape
