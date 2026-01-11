---
id: 8152
title: Combine DomAccess.addScript and loadScript into a unified API
state: OPEN
labels:
  - enhancement
  - ai
  - refactoring
  - architecture
assignees: []
createdAt: '2025-12-21T11:37:41Z'
updatedAt: '2025-12-21T11:37:41Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8152'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Combine DomAccess.addScript and loadScript into a unified API

`DomAccess.addScript()` and `DomAccess.loadScript()` currently provide similar functionality but with different implementations and use cases.

`addScript` is exposed as a remote method, while `loadScript` is a local helper used by addons.

We should merge these into a single, robust API that:
1.  Supports both remote and local usage.
2.  Handles both adding the tag and tracking loading state (Promise-based).
3.  Standardizes the configuration object.

This is a technical debt cleanup task.

## Timeline

- 2025-12-21T11:37:42Z @tobiu added the `enhancement` label
- 2025-12-21T11:37:42Z @tobiu added the `ai` label
- 2025-12-21T11:37:43Z @tobiu added the `refactoring` label
- 2025-12-21T11:37:43Z @tobiu added the `architecture` label
- 2025-12-21T11:46:03Z @tobiu cross-referenced by #8149

