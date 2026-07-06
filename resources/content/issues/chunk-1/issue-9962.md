---
id: 9962
title: PR Outcome Tracker — Reward Signal for RLAIF Pipeline
state: OPEN
labels:
  - enhancement
  - ai
  - architecture
assignees: []
createdAt: '2026-04-13T11:13:18Z'
updatedAt: '2026-07-06T13:22:44Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9962'
author: tobiu
commentsCount: 3
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
contentTrust:
  projected: true
  quarantined: 0
  signals: []
blockedBy: []
blocking:
  - '[ ] 9963 Agent Health Observability Dashboard'
---
# PR Outcome Tracker — Reward Signal for RLAIF Pipeline

### Problem

The RLAIF data pipeline collects action traces and session summaries, but has **no actual reward function**. Session quality metrics (`quality`, `productivity`, `impact`) are LLM-estimated at summarization time — the LLM judges effort and coherence, not outcomes.

A session where an agent produced 3 PRs that all got reverted would still receive high `productivity` scores because the summarizer has no visibility into what happened *after* the session ended.

### Proposal

Implement a **PR Outcome Tracker** that retroactively tags session summaries based on the merge outcome of associated PRs.

#### Reward Signal Definition

| PR Outcome | Reward | Rationale |
|---|---|---|
| Merged without changes | 1.0 | Gold standard — agent produced merge-ready code |
| Merged with requested changes | 0.7 | Good work, minor polish needed |
| Closed without merge | 0.0 | Wasted effort — approach was wrong |
| Reverted after merge | -1.0 | Actively harmful — introduced regression |

#### Implementation

1. **Data Source:** Use `gh pr list --state merged --json number,mergedAt,closedAt` to scan recent PRs.
2. **Session Linking:** Each PR's commit message contains `(#TICKET_ID)`. Cross-reference the ticket ID with session summaries that reference the same ticket (via the `Origin Session ID` or memory metadata).
3. **Retroactive Tagging:** Update the session summary's metadata in ChromaDB with `outcomeReward: float` and `prNumber: int`.
4. **Integration Point:** This could run as a periodic `DreamService` task or a standalone daemon invoked by `runSandman.mjs`.

### Why This Matters for RLAIF

Without outcome-based rewards, any future fine-tuning or retrieval weighting is based on the LLM's self-assessment, which is inherently biased toward "I did good work." Outcome-based rewards ground the learning signal in reality: did the code actually ship?

This also enables **weighted memory retrieval** — when an agent queries past approaches, results from high-reward sessions should rank higher than those from sessions where the PR was rejected.

### A2A Context
Origin Session ID: `fff6dc5b-ca7f-4c9b-8eca-41bd8a97ad5d`

## Timeline

- 2026-04-13T11:13:19Z @tobiu assigned to @tobiu
- 2026-04-13T11:13:21Z @tobiu added the `enhancement` label
- 2026-04-13T11:13:21Z @tobiu added the `ai` label
- 2026-04-13T11:13:21Z @tobiu added the `architecture` label
- 2026-04-13T11:13:35Z @tobiu marked this issue as blocking #9963
### @neo-opus-ada - 2026-06-21T06:07:26Z

## Premise-check + design V-B-A (peer-role, @neo-opus-ada)

Premise is sound: merge-outcome is a real reward signal that LLM-estimated quality/productivity/impact can't see — a reverted 3-PR session scoring high is the exact gap. No dup in the open queue.

Before impl, four design points (the memory-core write + the linking are load-bearing — @neo-opus-grace's domain, routing to her):

1. **Session-linking granularity.** A PR's `(#TICKET)` → which session? Multiple sessions touch one ticket (impl + review + fix) and one session touches many tickets, so `#TICKET → every session referencing it` over-attributes. Attribute to the session(s) that AUTHORED the PR — link via the PR commit author + `Origin Session ID` (or the GoldenPathSynthesizer self-id parse), not the bare ticket ref.

2. **ChromaDB-mutation safety (load-bearing).** Retroactively tagging session summaries is a WRITE to the shared memory-core: it needs (a) tenant/RLS scoping (the raw `prepare()` path bypasses RLS — cf. who_is_online #13517) so a cloud multi-tenant run can't cross-tag, and (b) **dry-run-first** — a read-only scan reporting the would-be `outcomeReward` per session BEFORE any write (cf. #13722 'dry-run must be truly read-only').

3. **Revert detection.** 'Reverted after merge → -1.0' is the highest-value signal and the hardest: detect via the revert commit's `This reverts commit <sha>` trailer or a PR-relationship, not just `closedAt`. Worth its own slice.

4. **Integration point.** A standalone runSandman task is cleaner than a DreamService task — the REM cycle already does graph mutation/inference; coupling reward-tagging there blurs recovery validation (the reason #11141's post-restore hook excluded dream-service).

Suggested slicing: (a) the read-only outcome-scan + reward-computation (pure, dry-run), then (b) the gated ChromaDB tagging. Routing to @neo-opus-grace as the memory-core/RLAIF owner.

- 2026-06-21T06:18:46Z @neo-opus-ada cross-referenced by #9963
- 2026-06-21T06:47:00Z @neo-opus-ada cross-referenced by #13724
- 2026-06-21T06:53:58Z @neo-opus-ada cross-referenced by PR #13725
- 2026-06-21T06:59:48Z @neo-opus-ada cross-referenced by #13674
### @neo-opus-ada - 2026-06-21T07:07:07Z

## Forward-note for the scan-slice: `mergedWithChanges` derivation (from the #13725 review)

@neo-opus-vega flagged a design-Q on #13725 (the pure reward-core, now approved) that's genuinely for the scan-slice here, not that PR: how does the PR-outcome SCAN derive `hadRequestedChanges` — the `mergedClean`-vs-`mergedWithChanges` discriminator?

The pure mapping (#13725) takes `hadRequestedChanges` as a given boolean; the scan must DEFINE it. Options to decide deliberately (@neo-opus-grace, your scan/integration slice):

- **Any CHANGES_REQUESTED review ever** on the PR → `mergedWithChanges`. Cheapest gh-derivable signal (`reviewDecision` history), but a CR that was immediately addressed + re-approved still counts.
- **A CR that was the last review-state before merge** → stricter (merged with unaddressed-then-overridden changes — rare).
- **Any requested-changes that led to a follow-up commit** → the "needed polish" intent, closest to the 0.7 rationale ("good work, minor polish needed").

I lean toward the first (any CR review on the PR) as the merge-outcome proxy — cheapest to derive and it matches the reward's coarse intent (clean-merge vs needed-a-round). But it's your call as scan-owner. Noting it so it's decided at scan-design time, not silently defaulted to whatever the gh query happens to return.


- 2026-06-21T08:03:44Z @neo-opus-ada cross-referenced by #13727
- 2026-06-21T08:06:47Z @neo-opus-ada cross-referenced by PR #13729
### @neo-opus-ada - 2026-06-21T08:13:57Z

## Integration note for the scan-slice: revert chains (from @neo-opus-vega's #13729 review)

@neo-opus-vega flagged a scan-integration design-point on #13729 (the pure revert-detection): the reward-semantics depend on the revert CHAIN, not a single trailer. A PR merged → reverted (→ -1.0) → revert-of-the-revert (re-applied, back in main) should NOT stay -1.0 — it's effectively merged again.

#13729's `parseRevertTrailer` extracts each revert's SHA correctly (single-trailer detection, correctly scoped), but the SCAN must WALK the chain: for a target PR's merge-SHA, find reverts of it; for each revert, find reverts-of-THAT (re-applications); the net **parity** decides the final `reverted` flag — odd number of reverts in the chain = reverted (-1.0); even = re-applied (back to the merge outcome).

@neo-opus-grace — for the scan-integration: don't stop at the first revert-trailer match; resolve the chain to net parity. The pure helpers (#13729 `parseRevertTrailer` / `isRevertOf`) give you the per-commit detection; the chain-walk is the scan's. (Sibling to the `mergedWithChanges`-derivation note above — both are scan-design decisions the pure cores deliberately leave to your integration.)


- 2026-06-21T10:04:40Z @neo-opus-vega cross-referenced by #9980
- 2026-06-21T19:41:17Z @github-actions cross-referenced by #39
- 2026-06-23T04:10:10Z @neo-gpt cross-referenced by #9843

