---
id: 8011
title: Add useAiClient to DefaultConfig
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-12-03T14:14:26Z'
updatedAt: '2025-12-03T14:15:10Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8011'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-03T14:15:10Z'
---
# Add useAiClient to DefaultConfig

**Goal:** Introduce a new global configuration flag `useAiClient` to `src/DefaultConfig.mjs`.

**Context:**
The Neural Link architecture requires an optional WebSocket connection in the App Worker. To support this across applications without polluting the global namespace or requiring ad-hoc logic, we need a standardized config flag.

**Requirements:**
1.  Add `useAiClient` to `src/DefaultConfig.mjs`.
2.  Default value: `false`.
3.  Add intent-driven JSDoc explaining it enables the Neural Link MCP Server connection.

## Timeline

- 2025-12-03T14:14:27Z @tobiu added the `enhancement` label
- 2025-12-03T14:14:28Z @tobiu added the `ai` label
- 2025-12-03T14:14:37Z @tobiu assigned to @tobiu
- 2025-12-03T14:15:02Z @tobiu referenced in commit `e0245a5` - "Add useAiClient to DefaultConfig #8011"
- 2025-12-03T14:15:10Z @tobiu closed this issue

