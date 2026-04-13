---
id: 9962
title: PR Outcome Tracker — Reward Signal for RLAIF Pipeline
state: OPEN
labels:
  - enhancement
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2026-04-13T11:13:18Z'
updatedAt: '2026-04-13T11:13:19Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9962'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
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

