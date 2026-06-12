---
id: 8332
title: Fix manage_connection tool argument passing
state: CLOSED
labels:
  - bug
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2026-01-05T11:58:21Z'
updatedAt: '2026-01-05T11:59:38Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8332'
author: tobiu
commentsCount: 0
parentIssue: 8169
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-05T11:59:38Z'
---
# Fix manage_connection tool argument passing

The `manage_connection` tool fails because `x-pass-as-object: true` is missing in `openapi.yaml`.
`ToolService` passes arguments positionally, but `ConnectionService.manageConnection` expects a destructured object.

**Fix:**
Add `x-pass-as-object: true` to `/connection/manage` in `openapi.yaml`.

## Timeline

- 2026-01-05T11:58:23Z @tobiu added the `bug` label
- 2026-01-05T11:58:23Z @tobiu added the `ai` label
- 2026-01-05T11:58:23Z @tobiu added the `architecture` label
- 2026-01-05T11:58:45Z @tobiu assigned to @tobiu
- 2026-01-05T11:58:57Z @tobiu added parent issue #8169
- 2026-01-05T11:59:21Z @tobiu referenced in commit `ffeef5b` - "fix(ai): Add x-pass-as-object to manage_connection tool (#8332)"
- 2026-01-05T11:59:39Z @tobiu closed this issue

