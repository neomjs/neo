---
id: 9708
title: '[Topographical Extraction] Sandman REM Actionable Alert Generation'
state: CLOSED
labels:
  - enhancement
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2026-04-04T21:05:18Z'
updatedAt: '2026-04-04T23:13:40Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9708'
author: tobiu
commentsCount: 0
parentIssue: 9673
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-04T23:13:40Z'
---
# [Topographical Extraction] Sandman REM Actionable Alert Generation

### Description
Upgrade the `DreamService` offline extraction pipeline (powered by Gemma 4) to detect topological graph conflicts from semantic histories and output them dynamically.

### Acceptance Criteria
- Inject `extractTopology()` parsing into `DreamService.mjs`.
- Target output format restricted specifically to actionable edges (`INVALIDATES`, `SUPERSEDES`).
- Generate `resources/content/sandman_handoff.md` ONLY if structural graph anomalies (like targeting an OPEN issue) are found.
- Related to Epic #9673.

## Timeline

- 2026-04-04T21:05:20Z @tobiu added the `enhancement` label
- 2026-04-04T21:05:20Z @tobiu added the `ai` label
- 2026-04-04T21:05:20Z @tobiu added the `architecture` label
- 2026-04-04T21:05:42Z @tobiu added parent issue #9673
- 2026-04-04T21:30:26Z @tobiu referenced in commit `a5f1f42` - "feat: Add REM extraction pass for topological conflict alerts (#9708)"
- 2026-04-04T23:13:36Z @tobiu assigned to @tobiu
- 2026-04-04T23:13:40Z @tobiu closed this issue

