---
id: 9864
title: Autonomous PR Format Auditing via DreamService
state: OPEN
labels:
  - enhancement
  - ai
assignees: []
createdAt: '2026-04-10T11:12:07Z'
updatedAt: '2026-04-10T11:12:07Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9864'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Autonomous PR Format Auditing via DreamService

**The Problem:**
Agents and contributors are now formally required (via `AGENTS.md`) to include "Fat Ticket" markdown syntax and explicit `[ARCH_ALIGNMENT]` logic within Pull Request bodies and iterative follow-up comments. Unenforced rules, however, rapidly decay. Without programmatic gating, non-compliant "ghost diffs" or malformed PR bodies will corrupt the Native Edge Graph over time.

**The Architectural Reality:**
The Swarm Architecture delegates background task processing to the `DreamService.mjs` daemon (specifically leveraging the `PullRequestSyncer`). Currently, the syncer downloads PRs and establishes their graph connections, but blindly assumes the embedded Markdown structurally complies with the A2A protocols.

**Avoided "Gold Standards" / Traps:**
We must deliberately avoid standard external GitHub Actions (e.g., traditional CI/CD linters) or generic bots for this format check. The verification mechanism MUST exist securely inside our autonomous `DreamService` Node.mjs / SQLite environment. Retaining the analysis natively allows the daemon to autonomously generate internal `[TOOLING_GAP]` nodes in the matrix, empowering subsequent agents to resolve the non-compliance dynamically without leaving the OS.

**Goals:**
1. Enhance the `PullRequestSyncer` pipeline within `DreamService` to regex/parse incoming PR Markdown for compliance.
2. Assert the presence of Swarm-mandated metrics (e.g., `Resolves #`, execution variables).
3. Construct the logic for automatic graph logging or automated PR rejection responses.

## Timeline

- 2026-04-10T11:12:08Z @tobiu added the `enhancement` label
- 2026-04-10T11:12:09Z @tobiu added the `ai` label

