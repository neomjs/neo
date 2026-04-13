---
id: 9913
title: 'fix(ai): Implement JSON recovery/repair in DreamService Tri-Vector Synthesis'
state: CLOSED
labels:
  - bug
  - ai
  - architecture
assignees: []
createdAt: '2026-04-12T11:37:20Z'
updatedAt: '2026-04-13T12:38:42Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9913'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking:
  - '[ ] 9954 Epic: The Self-Healing Protocol'
  - '[ ] 9890 feat: DreamService 4th REM Vector — executeNLActionDigest()'
  - '[ ] 9903 Implement `executeNLActionDigest` in DreamService for Neural Link Data Synthesis'
closedAt: '2026-04-13T12:38:42Z'
---
# fix(ai): Implement JSON recovery/repair in DreamService Tri-Vector Synthesis

### Context
Sandman is regularly failing to digest large sessions due to `[WARN] Failed to validate extracted Tri-Vector A2A payload`. The local OS LLM is occasionally generating trailing text or invalid quote schemas during extraction, breaking Zod strict validation.

### Objective
We must implement a JSON-repair loop (e.g., regex sanitization, AST validation) or an automated LLM retry mechanism natively inside `executeTriVectorExtraction` before dumping the payload.

## Timeline

- 2026-04-12T11:37:20Z @tobiu added the `bug` label
- 2026-04-12T11:37:21Z @tobiu added the `ai` label
- 2026-04-12T11:37:21Z @tobiu added the `architecture` label
- 2026-04-12T11:40:04Z @tobiu marked this issue as blocking #9903
- 2026-04-12T11:40:05Z @tobiu marked this issue as blocking #9890
- 2026-04-13T11:13:30Z @tobiu marked this issue as blocking #9954
- 2026-04-13T11:45:27Z @tobiu cross-referenced by PR #9964
- 2026-04-13T12:01:50Z @tobiu referenced in commit `8d32d94` - "fix(MemoryCore): Implement autonomous JSON boundary repair loops in DreamService REM pipeline (#9913)"
- 2026-04-13T12:02:03Z @tobiu cross-referenced by PR #9967
- 2026-04-13T12:38:42Z @tobiu closed this issue
- 2026-04-13T12:38:42Z @tobiu referenced in commit `5f38fc5` - "fix(MemoryCore): Implement autonomous JSON boundary repair loops in DreamService REM pipeline (#9913) (#9967)"

