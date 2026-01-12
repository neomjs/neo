---
id: 8318
title: 'MCP: Optimize GitHub Workflow Tool Count'
state: CLOSED
labels:
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2026-01-04T16:24:19Z'
updatedAt: '2026-01-04T17:15:41Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8318'
author: tobiu
commentsCount: 1
parentIssue: 8315
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-04T17:15:41Z'
---
# MCP: Optimize GitHub Workflow Tool Count

Part of Epic #8315.
1. Consolidate `assign_issue` and `unassign_issue` into `manage_issue_assignees` (action: 'add' | 'remove').
2. Consolidate `add_labels` and `remove_labels` into `manage_issue_labels` (action: 'add' | 'remove').
3. Consolidate `create_comment` and `update_comment` into `manage_issue_comment` (action: 'create' | 'update').

## Timeline

- 2026-01-04T16:24:20Z @tobiu added the `ai` label
- 2026-01-04T16:24:20Z @tobiu added the `refactoring` label
- 2026-01-04T16:24:38Z @tobiu added parent issue #8315
- 2026-01-04T16:38:22Z @tobiu cross-referenced by #8317
- 2026-01-04T16:40:19Z @tobiu assigned to @tobiu
- 2026-01-04T17:15:04Z @tobiu referenced in commit `8879b09` - "refactor: Consolidate GitHub Workflow tools per Issue #8318

Optimizes MCP tool count by consolidating assign, label, and comment operations into 'manage_*' tools.

- Consolidates assign/unassign into 'manage_issue_assignees'
- Consolidates add/remove labels into 'manage_issue_labels'
- Consolidates create/update comments into 'manage_issue_comment'
- Updates API definition in openapi.yaml with detailed schemas
- Refactors IssueService to handle unified operations
- Removes redundant code from PullRequestService"
### @tobiu - 2026-01-04T17:15:10Z

**Input from Gemini 2.5 pro:**

> ✦ I have successfully completed the tool consolidation tasks for this issue.
> 
> **Changes Implemented:**
> 1.  **Tool Consolidation:**
>     *   `assign_issue` + `unassign_issue` -> **`manage_issue_assignees`**
>     *   `add_labels` + `remove_labels` -> **`manage_issue_labels`**
>     *   `create_comment` + `update_comment` -> **`manage_issue_comment`**
> 2.  **API Refinement:**
>     *   Updated `openapi.yaml` with the new endpoints and detailed documentation.
>     *   Removed deprecated endpoints.
> 3.  **Code Refactoring:**
>     *   Updated `IssueService.mjs` to handle the consolidated logic.
>     *   Moved `updateComment` from `PullRequestService.mjs` to `IssueService.mjs` to unify comment management.
>     *   Updated `toolService.mjs` mappings.
> 
> **Status:**
> This refactoring reduces the tool count and simplifies the API surface while maintaining full functionality. The changes have been committed.
> 
> Ready to close this issue.

- 2026-01-04T17:15:41Z @tobiu closed this issue

