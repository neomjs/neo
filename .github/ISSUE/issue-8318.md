---
id: 8318
title: 'MCP: Optimize GitHub Workflow Tool Count'
state: OPEN
labels:
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2026-01-04T16:24:19Z'
updatedAt: '2026-01-04T16:40:19Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8318'
author: tobiu
commentsCount: 0
parentIssue: 8315
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# MCP: Optimize GitHub Workflow Tool Count

Part of Epic #8315.
1. Consolidate `assign_issue` and `unassign_issue` into `manage_issue_assignees` (action: 'add' | 'remove').
2. Consolidate `add_labels` and `remove_labels` into `manage_issue_labels` (action: 'add' | 'remove').
3. Consolidate `create_comment` and `update_comment` into `manage_issue_comment` (action: 'create' | 'update').

## Activity Log

- 2026-01-04 @tobiu added the `ai` label
- 2026-01-04 @tobiu added the `refactoring` label
- 2026-01-04 @tobiu added parent issue #8315
- 2026-01-04 @tobiu cross-referenced by #8317
- 2026-01-04 @tobiu assigned to @tobiu

