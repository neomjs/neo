---
id: 9971
title: '[Agent OS] Downgrade "status: needs-re-triage" priority in DreamService'
state: CLOSED
labels:
  - enhancement
  - ai
assignees: []
createdAt: '2026-04-13T13:27:27Z'
updatedAt: '2026-04-13T13:47:26Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9971'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-13T13:47:26Z'
---
# [Agent OS] Downgrade "status: needs-re-triage" priority in DreamService

### 🎯 Objective
Update the `DreamService` SQLite weighting and queue generation logic to heavily downrank or isolate tickets labeled `status: needs-re-triage`.

### 🧠 Architectural Rationale
Our new `ticket-intake` skill (#9969) empowers agents to formally reject stale or mathematically regressive tickets (Negative ROI) by assigning them the `needs-re-triage` label rather than brutally closing them. This guarantees the architectural anomaly is preserved for human review. However, if `DreamService` continues to feed these labeled tickets to the top of the swarm execution loop, the autonomous agents will enter an infinite cycle of validation/rejection.

### 📋 Scope
1. Identify the queue extraction logic within `DreamService.mjs` (the `QueryReRanker` / SQL execution layer).
2. Establish a massive negative numerical weight penalty for issues containing the `needs-re-triage` label payload.
3. Validate through `runSandman.mjs` that flagged tickets sink below the operational execution threshold while remaining available for analytical review.

## Timeline

- 2026-04-13T13:27:29Z @tobiu added the `enhancement` label
- 2026-04-13T13:27:29Z @tobiu added the `ai` label
- 2026-04-13T13:45:16Z @tobiu referenced in commit `a61daa9` - "feat: Implement needs-re-triage negative ROI downgrade in DreamService (#9971)"
- 2026-04-13T13:45:26Z @tobiu cross-referenced by PR #9972
- 2026-04-13T13:47:26Z @tobiu referenced in commit `2072154` - "feat: Implement needs-re-triage negative ROI downgrade in DreamService (#9971) (#9972)"
- 2026-04-13T13:47:26Z @tobiu closed this issue

