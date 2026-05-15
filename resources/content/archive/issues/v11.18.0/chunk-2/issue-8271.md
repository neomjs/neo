---
id: 8271
title: '[Neural Link] Refactor ComponentService to use toJSON protocol'
state: CLOSED
labels:
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2026-01-01T17:26:40Z'
updatedAt: '2026-01-01T17:53:36Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8271'
author: tobiu
commentsCount: 0
parentIssue: 8169
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-01T17:52:10Z'
---
# [Neural Link] Refactor ComponentService to use toJSON protocol

Update `src/ai/client/ComponentService.mjs` to rely on the newly implemented `toJSON` methods for property extraction.
*   `serializeComponent` should use `component.toJSON()` for base properties but maintain its own recursion logic to respect `maxDepth`.
*   `getComponentProperty` should use `toJSON` if available.
*   `queryComponent` should use `toJSON` for result mapping.

## Timeline

- 2026-01-01T17:26:41Z @tobiu added the `ai` label
- 2026-01-01T17:26:42Z @tobiu added the `refactoring` label
- 2026-01-01T17:27:04Z @tobiu added parent issue #8169
- 2026-01-01T17:52:10Z @tobiu closed this issue
- 2026-01-01T17:53:36Z @tobiu assigned to @tobiu

