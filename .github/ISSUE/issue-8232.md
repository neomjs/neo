---
id: 8232
title: '[Neural Link] Implement toJSON in state.Provider'
state: OPEN
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-12-31T15:08:13Z'
updatedAt: '2025-12-31T15:08:43Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8232'
author: tobiu
commentsCount: 0
parentIssue: 8200
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# [Neural Link] Implement toJSON in state.Provider

Implement the `toJSON` method in `src/state/Provider.mjs` to support the Neural Link serialization protocol.

It should return an object containing:
- Properties from `super.toJSON()`
- `component`: ID of the associated component (to avoid circular references)
- `data`: The hierarchical data object
- `parent`: ID of the parent provider (to avoid circular references)
- `stores`: A mapped object where each store instance is serialized via its `toJSON()` method.
- `windowId`: The associated window ID

## Activity Log

- 2025-12-31 @tobiu added the `enhancement` label
- 2025-12-31 @tobiu added the `ai` label
- 2025-12-31 @tobiu added parent issue #8200
- 2025-12-31 @tobiu assigned to @tobiu

