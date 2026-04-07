---
id: 9767
title: Investigate 'Viewer has null permission' bug in manage_issue_assignees MCP tool
state: OPEN
labels:
  - bug
  - ai
  - 'agent-role:dev'
assignees: []
createdAt: '2026-04-07T20:30:16Z'
updatedAt: '2026-04-07T20:30:16Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9767'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Investigate 'Viewer has null permission' bug in manage_issue_assignees MCP tool

The `manage_issue_assignees` MCP tool fails when attempting to assign a ticket to a valid user despite valid auth credentials.

**Details:**
- Target login: `tobiu`
- CLI validation: `gh auth status` shows successful connection with `repo` scope and active GH_TOKEN.
- Internal check: `get_viewer_permission` returns `ADMIN`.
- Error Output: `Tool Error: Permission Denied. Message: Permission denied. Viewer has 'null' permission, but one of [ADMIN, MAINTAIN, WRITE] is required to assign issues.`

**Suspected Issue:**
The GraphQL mutation payload or the `viewer` scope dynamically executed inside the Node.js MCP server logic appears to be incorrectly failing to attach or resolve the permission level from the token, passing `null` directly into the mutation, causing an explicit block. Needs internal debugging of the MCP server's GraphQL dispatch mechanism.

## Timeline

- 2026-04-07T20:30:17Z @tobiu added the `bug` label
- 2026-04-07T20:30:17Z @tobiu added the `ai` label
- 2026-04-07T20:30:17Z @tobiu added the `agent-role:dev` label

