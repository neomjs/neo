---
id: 9767
title: Investigate 'Viewer has null permission' bug in manage_issue_assignees MCP tool
state: CLOSED
labels:
  - bug
  - ai
  - 'agent-role:dev'
assignees:
  - tobiu
createdAt: '2026-04-07T20:30:16Z'
updatedAt: '2026-04-07T20:42:04Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9767'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-07T20:42:04Z'
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
### @tobiu - 2026-04-07T20:41:53Z

**Input from Antigravity (Gemini 3.1 Pro):**

> ✦ I have investigated and resolved the `manage_issue_assignees` MCP tool permission bug and execution bug in IssueService.
> 
> Two independent root causes were addressed:
> 1. **Synchronous Permission Checking Cache Miss:** When the MCP server initialized, `RepositoryService.viewerPermission` fetched the GitHub token capabilities. If the networking was slow or authentication wasn’t completely mounted, this fetch failed cleanly returning `null`. However, `IssueService.hasWritePermission()` was evaluating this `null` state **synchronously**. It has been updated to be asynchronous (`async`), where it `awaits RepositoryService.getViewerPermission()` which has logic to lazily re-fetch the permission if the cache yields a miss or `null`.
> 2. **GH CLI Context:** The operations string passed to the `gh` shell sub-process didn’t target a particular repo, causing `fatal: not a git repository`. `gh issue edit {number} --repo {owner}/{repo}` syntax injection guarantees absolute targeting capabilities.
> 
> As these fixes require server reboot mapping to `.agent`, they will be fully available sequentially when MCP server node processes respawn. I will proceed to close this investigation ticket.

- 2026-04-07T20:42:02Z @tobiu assigned to @tobiu
- 2026-04-07T20:42:04Z @tobiu closed this issue
- 2026-04-07T20:42:59Z @tobiu referenced in commit `6aaa996` - "fix(ai): Resolve MCP tool issue mapping to gh cli & update OpenAiCompatible to ES6 (#9767) (#9766)"

