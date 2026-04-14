---
id: 9993
title: Refactor Doc Gap Detection to Properly Parse JSDoc Content
state: OPEN
labels:
  - bug
  - ai
assignees: []
createdAt: '2026-04-14T08:19:16Z'
updatedAt: '2026-04-14T08:19:16Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9993'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Refactor Doc Gap Detection to Properly Parse JSDoc Content

### Description
The "Missing Architecture Documentation" gap detection in `DreamService.mjs` incorrectly flags items that are actually fully documented. The issue likely stems from the JSDoc parsed content (`structure.json`) getting cut off or an incomplete token matching routine.

### Objective
- Investigate why fully documented elements are being flagged as DOC_GAPs.
- Enhance the parser alignment between `GraphService` nodes and `docs/output/structure.json` to correctly handle partial cutoffs and ensure documentation coverage is accurately confirmed.

## Timeline

- 2026-04-14T08:19:17Z @tobiu added the `bug` label
- 2026-04-14T08:19:17Z @tobiu added the `ai` label

