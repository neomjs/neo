---
id: 8332
title: Fix manage_connection tool argument passing
state: OPEN
labels:
  - bug
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2026-01-05T11:58:21Z'
updatedAt: '2026-01-05T11:58:45Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8332'
author: tobiu
commentsCount: 0
parentIssue: 8169
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Fix manage_connection tool argument passing

The `manage_connection` tool fails because `x-pass-as-object: true` is missing in `openapi.yaml`.
`ToolService` passes arguments positionally, but `ConnectionService.manageConnection` expects a destructured object.

**Fix:**
Add `x-pass-as-object: true` to `/connection/manage` in `openapi.yaml`.

## Activity Log

- 2026-01-05 @tobiu added the `bug` label
- 2026-01-05 @tobiu added the `ai` label
- 2026-01-05 @tobiu added the `architecture` label
- 2026-01-05 @tobiu assigned to @tobiu
- 2026-01-05 @tobiu added parent issue #8169

