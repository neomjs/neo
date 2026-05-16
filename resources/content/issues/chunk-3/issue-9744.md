---
id: 9744
title: Fix SQLite schema mismatch in Rem sleep filesystem extraction
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-04-06T19:14:22Z'
updatedAt: '2026-04-06T19:15:05Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9744'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-06T19:15:05Z'
---
# Fix SQLite schema mismatch in Rem sleep filesystem extraction

### Description
The ReAct gap analysis loop inside `DreamService` was evaluating an empty file system because it attempted to filter SQLite Edge nodes via `n.type` instead of `n.label`. 

### Resolution
- Update the mapping mechanism inside `DreamService.executeCapabilityGapInference` to natively reference `n.label` matching the `NodeModel` fields.

## Timeline

- 2026-04-06T19:14:23Z @tobiu added the `enhancement` label
- 2026-04-06T19:14:23Z @tobiu added the `ai` label
- 2026-04-06T19:14:35Z @tobiu referenced in commit `4ede2e5` - "fix: Correct SQLite schema mapping for Native Edge nodes in REM sleep (#9744)"
- 2026-04-06T19:15:01Z @tobiu assigned to @tobiu
### @tobiu - 2026-04-06T19:15:03Z

Fixed Schema mapping error. The filter now successfully matches `n.label` so `GraphService.db.nodes.items` accurately exposes the synchronized files to Gemma 4.

- 2026-04-06T19:15:05Z @tobiu closed this issue

