---
id: 8271
title: '[Neural Link] Refactor ComponentService to use toJSON protocol'
state: OPEN
labels:
  - ai
  - refactoring
assignees: []
createdAt: '2026-01-01T17:26:40Z'
updatedAt: '2026-01-01T17:26:40Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8271'
author: tobiu
commentsCount: 0
parentIssue: 8169
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# [Neural Link] Refactor ComponentService to use toJSON protocol

Update `src/ai/client/ComponentService.mjs` to rely on the newly implemented `toJSON` methods for property extraction.
*   `serializeComponent` should use `component.toJSON()` for base properties but maintain its own recursion logic to respect `maxDepth`.
*   `getComponentProperty` should use `toJSON` if available.
*   `queryComponent` should use `toJSON` for result mapping.

## Activity Log

- 2026-01-01 @tobiu added the `ai` label
- 2026-01-01 @tobiu added the `refactoring` label
- 2026-01-01 @tobiu added parent issue #8169

