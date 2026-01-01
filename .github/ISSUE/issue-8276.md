---
id: 8276
title: '[Neural Link] Implement toJSON in core.Observable'
state: OPEN
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-01T18:37:04Z'
updatedAt: '2026-01-01T18:47:40Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8276'
author: tobiu
commentsCount: 0
parentIssue: 8200
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# [Neural Link] Implement toJSON in core.Observable

Implement `toJSON` in `src/core/Observable.mjs` to export the runtime event listeners.
Access the private event map (via `Object.getOwnPropertySymbols(this)` or by exposing it if necessary).
Map the listeners to a serializable format:
- `event`: 'click'
- `fn`: Function name or '[Function]'
- `scope`: Scope ID (if NeoInstance) or '[Object]'
- `id`: Event ID

This allows the Neural Link to inspect attached event handlers.

## Activity Log

- 2026-01-01 @tobiu added the `enhancement` label
- 2026-01-01 @tobiu added the `ai` label
- 2026-01-01 @tobiu added parent issue #8200
- 2026-01-01 @tobiu assigned to @tobiu

