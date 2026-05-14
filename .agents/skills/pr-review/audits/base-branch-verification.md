# Base-Branch Verification Audit (Cycle-0 Mechanical Pre-Flight)

Before §9.0 Premise Pre-Flight and any substantive diff inspection, you MUST verify the PR's base branch and merge-base state IF either condition fires:

- **Diff-size shock:** PR diff is much larger than the stated scope (e.g., +10K lines for a feature PR claiming ~100 lines)
- **`baseRefName` uncertainty:** PR title doesn't explicitly state base; you haven't confirmed via `gh pr view`
- **Cross-Epic / Discussion-graduation PRs** where stale-branch risk is elevated

## The 3-Command Verification Protocol

Run all three before reading any substantive diff:

```bash
gh pr view <N> --json baseRefName,headRefName
git fetch origin && git merge-base origin/<head> origin/dev
git rev-list --left-right --count origin/dev...origin/<head>
```

**Remote-ref stability:** the commands above reference `origin/<head>` rather than a bare `<head>` so they work without a local checkout. If you need to inspect the diff locally before the merge-base check, run `gh pr checkout <N>` (or harness equivalent like `checkout_pull_request`) FIRST so the local `<head>` ref exists, then the bare-ref form is also safe.

Expected for a healthy feature PR:
- `baseRefName: dev` (NOT `main` — `main` is release-only per §0 Inv 8)
- `merge-base` is recent (last few hours-to-days, not weeks)
- left-right count: dev N commits ahead / branch M commits ahead, where M roughly matches stated PR scope

## Failure Modes & Drop+Supersede Framing

**Case 1: `baseRefName == main`**

This is a §0 Inv 8 violation. **Recommendation: Drop+Supersede.** Either:
- Author re-targets base to `dev` in-place (`gh pr edit <N> --base dev`)
- OR author closes PR + branches fresh from `origin/dev` + re-opens

Do NOT proceed with substantive review until base is corrected. Mechanical Layer 4 guard (`.github/workflows/pr-base-guard.yml`, per #11336/#11340) catches this at CI-trigger time but the reviewer-side Cycle-0 gate (this file) is the EARLIER catch and avoids any wasted substantive-review effort.

**Case 2: Stale-branch with already-merged squash-commits**

Branch carries commits whose CONTENT is already on `dev` (via prior squash-merge under different SHAs). Diff inflation is the symptom. **Recommendation: author rebases** onto current `origin/dev` (squash-merged content drops as "patch already applied").

**Case 3: Wrong-direction divergence**

`origin/<head>` is 0 commits ahead of `origin/dev`, OR diff is empty after base-change. **Recommendation: close PR** as no-op.

## Empirical Anchor

**PR #11335 (2026-05-13T21:38Z, base=main blowup):** Gemini's #11309 implementation PR was targeted at `main` while `dev` was 10,871 commits ahead. Initial PR view showed **+990,302 / −51,843 line diff** across 100+ files. As primary reviewer, I rationalized the diff inflation as "stale-branch" and dived into substantive analysis. Operator caught the actual root cause (wrong-base) by spotting the "10000 commits into main" framing in the PR view.

**Cycle-0 verification would have caught this in <1 minute** vs the ~20 min substantive-review-then-Drop+Supersede cycle that actually happened. Saved as `feedback_pr_review_base_branch_verification` private memory.

## Documentation Requirement

When completing the PR review template, you MUST explicitly document that Cycle-0 base-branch verification ran (or affirmatively N/A for small in-scope diffs):

**Example Review Commentary:**
> ✅ **Cycle-0 Base-Branch Verification:** Ran `gh pr view 1234 --json baseRefName,headRefName` → `base: dev, head: feature/x`. `merge-base` recent (2 hours back). Divergence `2 1` (dev 2 ahead / branch 1 ahead matching stated +1-commit scope). Cleared for substantive review.

OR for trivial PRs:

> ✅ **Cycle-0:** N/A — PR diff (+12/−4 lines) matches stated scope; no shock-trigger.

## Cross-Layer Defense Position

| Layer | Mechanism | Where |
|---|---|---|
| 1 | §0 invariant elevation (always-loaded) | `AGENTS.md` §0 Inv 8 (#11337/#11339 LIVE) |
| 2 | Workflow discipline strengthening | OPEN — pull-request-workflow §x |
| **3** | **pr-review Cycle-0 baseRef gate (THIS FILE)** | **`.agents/skills/pr-review/audits/base-branch-verification.md`** |
| 4 | Mechanical CI/MCP guard | `.github/workflows/pr-base-guard.yml` (#11336/#11340 LIVE) |

Layer 3 is the **reviewer-side mechanical gate** that fires BEFORE §9.0 Premise Pre-Flight. CI catches late (Layer 4); reviewer Cycle-0 catches earlier; §0 invariant ensures always-loaded discipline (Layer 1). The combination prevents the catastrophic-merge class that motivated the entire 4-layer arc (Discussion #11341 graduation lineage).

## Related

- **Discussion #11341 (graduated)** — 4-layer defense framing
- **#11337 / PR #11339** — Layer 1 (LIVE)
- **#11336 / PR #11340** — Layer 4 (LIVE)
- **#11347** — this Layer 3 ticket
- **PR #11335** — empirical anchor; my Cycle 1 miss
- **`feedback_pr_review_base_branch_verification`** — private feedback memory anchoring the discipline
- **`pr-review-guide.md §9.0`** — Premise Pre-Flight (this Cycle-0 gate fires BEFORE)
