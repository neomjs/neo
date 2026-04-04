---
id: 9708
title: '[Topographical Extraction] Sandman REM Actionable Alert Generation'
state: OPEN
labels:
  - enhancement
  - ai
  - architecture
assignees: []
createdAt: '2026-04-04T21:05:18Z'
updatedAt: '2026-04-04T21:05:18Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9708'
author: tobiu
commentsCount: 0
parentIssue: 9673
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
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

